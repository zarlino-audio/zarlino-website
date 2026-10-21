/**
 * Customer authentication — deliberately separate from founder/admin auth.
 *
 * The founder surface in this Worker is the ADMIN_TOKEN admin dashboard; the
 * Executive OS has its own FOUNDER_AUTH_TOKEN. Neither is accepted here and
 * this module never reads those secrets. A customer session can never be
 * exchanged for founder capability.
 *
 * Design:
 *   - passwords: PBKDF2-HMAC-SHA-256, per-user random salt, 210k iterations,
 *     stored as base64url. Verification is constant-time in the comparison.
 *   - sessions: 256-bit random bearer secrets, stored only as SHA-256 hashes,
 *     so a database read cannot mint a session. HttpOnly + Secure + SameSite=Lax
 *     cookie, server-side expiry.
 *   - CSRF: mutating requests must carry a same-origin Origin (or a matching
 *     Sec-Fetch-Site for same-origin form posts); anything else is refused.
 *   - nothing here logs, echoes or stores a password or a raw token.
 */

import {
  deleteExpiredSessions,
  deleteSession,
  findSession,
  findUserByEmail,
  findUserById,
  insertSession,
  insertUser,
  nowIso,
  touchSession,
  type Sql,
  type UserRecord,
} from "./store";

export const SESSION_COOKIE = "zf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
export const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 200;

const textEncoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(count: number): Uint8Array {
  const out = new Uint8Array(count);
  crypto.getRandomValues(out);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Length-independent comparison, so a wrong session cannot be probed byte by byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = textEncoder.encode(a);
  const right = textEncoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (email.length < 3 || email.length > 254) return false;
  // One @, no whitespace, a dot in the domain. Deliberately strict: the address
  // is only ever used to identify an account and to contact the owner.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return false;
  return true;
}

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG";

export function validatePassword(password: string): PasswordProblem | null {
  if (typeof password !== "string") return "TOO_SHORT";
  if (password.length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (password.length > PASSWORD_MAX_LENGTH) return "TOO_LONG";
  return null;
}

export async function hashPassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function verifyPassword(password: string, salt: Uint8Array, iterations: number, expected: string): Promise<boolean> {
  const actual = await hashPassword(password, salt, iterations);
  return timingSafeEqual(bytesToBase64Url(actual), expected);
}

// ---------------------------------------------------------------------------
// Accounts and sessions
// ---------------------------------------------------------------------------

export interface SignupInput {
  email: string;
  password: string;
  displayName?: string;
}

export type AuthFailure =
  | { ok: false; code: "INVALID_EMAIL" | "WEAK_PASSWORD" | "EMAIL_TAKEN" | "INVALID_CREDENTIALS"; message: string };

export type AuthSuccess = { ok: true; user: UserRecord; token: string; expiresAt: string };

function failure(code: Extract<AuthFailure, { ok: false }>["code"], message: string): AuthFailure {
  return { ok: false, code, message };
}

export async function signup(
  sql: Sql,
  input: SignupInput,
  options: { now?: () => Date; userId?: string } = {},
): Promise<AuthSuccess | AuthFailure> {
  const now = options.now ?? (() => new Date());
  const email = typeof input.email === "string" ? normaliseEmail(input.email) : "";
  if (!isValidEmail(email)) return failure("INVALID_EMAIL", "Enter a valid email address.");

  const passwordProblem = validatePassword(input.password ?? "");
  if (passwordProblem === "TOO_SHORT") return failure("WEAK_PASSWORD", `Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (passwordProblem === "TOO_LONG") return failure("WEAK_PASSWORD", `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

  if (findUserByEmail(sql, email)) return failure("EMAIL_TAKEN", "An account with that email already exists.");

  const salt = randomBytes(16);
  const hash = await hashPassword(input.password, salt, PASSWORD_ITERATIONS);
  const at = nowIso(now);
  const user: UserRecord = {
    id: options.userId ?? `usr_${bytesToBase64Url(randomBytes(16)).replace(/[-_]/g, "").slice(0, 22)}`,
    email: String(input.email).trim(),
    email_normalised: email,
    display_name: (input.displayName ?? "").trim().slice(0, 60) || email.split("@")[0]!.slice(0, 60),
    password_hash: bytesToBase64Url(hash),
    password_salt: bytesToBase64Url(salt),
    password_iterations: PASSWORD_ITERATIONS,
    plan: "free",
    plan_source: "default",
    plan_reference: null,
    plan_updated_at: null,
    status: "active",
    created_at: at,
    updated_at: at,
  };
  insertUser(sql, user);

  const session = await createSession(sql, user.id, now);
  return { ok: true, user, token: session.token, expiresAt: session.expiresAt };
}

export async function login(
  sql: Sql,
  emailRaw: string,
  password: string,
  options: { now?: () => Date } = {},
): Promise<AuthSuccess | AuthFailure> {
  const now = options.now ?? (() => new Date());
  const email = normaliseEmail(String(emailRaw ?? ""));
  const user = email ? findUserByEmail(sql, email) : null;

  // Always run a hash, even for an unknown email, so timing does not reveal
  // whether the account exists.
  const salt = user ? base64UrlToBytes(user.password_salt) : randomBytes(16);
  const iterations = user ? user.password_iterations : PASSWORD_ITERATIONS;
  const matches = await verifyPassword(String(password ?? ""), salt, iterations, user?.password_hash ?? "");

  if (!user || !matches || user.status !== "active") {
    return failure("INVALID_CREDENTIALS", "That email and password do not match an account.");
  }

  const session = await createSession(sql, user.id, now);
  return { ok: true, user, token: session.token, expiresAt: session.expiresAt };
}

export async function createSession(
  sql: Sql,
  userId: string,
  now: () => Date = () => new Date(),
): Promise<{ token: string; expiresAt: string }> {
  const token = bytesToBase64Url(randomBytes(32));
  const createdAt = now();
  const expires = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
  insertSession(sql, {
    token_hash: await sha256Hex(token),
    user_id: userId,
    created_at: createdAt.toISOString(),
    expires_at: expires.toISOString(),
    last_seen_at: createdAt.toISOString(),
  });
  return { token, expiresAt: expires.toISOString() };
}

export interface SessionUser {
  user: UserRecord;
  tokenHash: string;
}

/** Resolve a session cookie to its user, or null. Expired sessions are removed. */
export async function resolveSession(
  sql: Sql,
  token: string | null,
  now: () => Date = () => new Date(),
): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const tokenHash = await sha256Hex(token);
  const session = findSession(sql, tokenHash);
  if (!session) return null;

  const at = now();
  if (new Date(session.expires_at).getTime() <= at.getTime()) {
    deleteSession(sql, tokenHash);
    return null;
  }

  const user = findUserById(sql, session.user_id);
  if (!user || user.status !== "active") {
    deleteSession(sql, tokenHash);
    return null;
  }

  // Refresh last-seen at most once a minute: a write per request is waste.
  if (at.getTime() - new Date(session.last_seen_at).getTime() > 60_000) {
    touchSession(sql, tokenHash, at.toISOString());
  }

  return { user, tokenHash };
}

export async function logout(sql: Sql, token: string | null): Promise<void> {
  if (!token) return;
  deleteSession(sql, await sha256Hex(token));
}

export function pruneSessions(sql: Sql, now: () => Date = () => new Date()): number {
  return deleteExpiredSessions(sql, nowIso(now));
}

// ---------------------------------------------------------------------------
// Cookies and CSRF
// ---------------------------------------------------------------------------

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_TTL_SECONDS): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function sessionTokenFrom(request: { headers: { get(name: string): string | null } }): string | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE];
  return token ? token.trim() : null;
}

/**
 * Reject a cross-site state change.
 *
 * Browsers always send Origin on a POST; we require it to match the request's
 * own origin exactly. A missing Origin is refused for mutating requests (API
 * clients must go through the same check, which also blocks form posts from
 * other sites). `GET`/`HEAD` are exempt because they never mutate.
 */
export function isSameOriginRequest(request: { method: string; url: string; headers: { get(name: string): string | null } }): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = request.headers.get("origin");
  const own = new URL(request.url).origin;
  if (origin) return origin === own;

  // Some non-browser clients omit Origin; accept only if the fetch metadata
  // explicitly says the request is same-origin.
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  signup: { limit: 5, windowSeconds: 60 * 60 },
  login: { limit: 10, windowSeconds: 15 * 60 },
  interpret: { limit: 20, windowSeconds: 10 * 60 },
  build: { limit: 10, windowSeconds: 10 * 60 },
  /** Polling a build calls the orchestrator, which spends the shared GitHub API
      quota; one poll every ~2 s per account is plenty for a 5-minute build. */
  status: { limit: 300, windowSeconds: 10 * 60 },
  download: { limit: 60, windowSeconds: 10 * 60 },
  billing: { limit: 20, windowSeconds: 10 * 60 },
  webhook: { limit: 120, windowSeconds: 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function rateLimitKey(name: RateLimitName, identity: string): string {
  return `${name}:${identity}`;
}

export function rateLimitWindow(name: RateLimitName, now: Date): number {
  const windowMs = RATE_LIMITS[name].windowSeconds * 1000;
  return Math.floor(now.getTime() / windowMs);
}

export function clientIdentity(request: { headers: { get(name: string): string | null } }): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}
