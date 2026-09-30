/**
 * Founder admin auth for the website worker — username/password, NO shared
 * token.
 *
 * Design:
 *   - Credentials live in KV (`admin:cred`): PBKDF2-SHA256 over a random
 *     16-byte salt. Iterations are stored in the record so they can be raised
 *     later without breaking existing logins (10k keeps CPU well inside the
 *     Workers free-tier budget; raise on a paid plan).
 *   - Sessions are STATELESS: an HMAC-SHA256-signed token
 *     `b64url(payload).b64url(sig)` with payload `{u, exp}`. Verification
 *     needs no KV read (no read-after-write consistency traps); forced global
 *     sign-out = rotate the ADMIN_SESSION_KEY secret.
 *   - First visit: no credential record -> `/api/admin/status` reports
 *     `setupRequired`; `/api/admin/setup` creates the founder login once.
 *   - Brute-force guard: 10 failed logins -> 15-minute lockout (KV counter).
 *
 * The old ADMIN_TOKEN (a single shared string, once public in git) is gone.
 */

export interface AuthEnv {
  ZARLINO_KV?: KVNamespace;
  ADMIN_SESSION_KEY?: string;
}

const CRED_KEY = 'admin:cred';
const FAIL_KEY = 'admin:fail';
const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 days
const LOCKOUT_S = 60 * 15;
const MAX_FAILS = 10;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,64}$/;
const MIN_PASSWORD = 8;

const textEncoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex) as BufferSource, iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

interface CredRecord {
  username: string;
  salt: string;
  hash: string;
  iterations: number;
  updated_at: string;
}

async function readCred(env: AuthEnv): Promise<CredRecord | null> {
  const raw = await env.ZARLINO_KV?.get(CRED_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CredRecord;
  } catch {
    return null;
  }
}

async function hmacKey(env: AuthEnv): Promise<CryptoKey | null> {
  const secret = env.ADMIN_SESSION_KEY;
  if (!secret) return null;
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function mintSession(env: AuthEnv, username: string): Promise<string | null> {
  const key = await hmacKey(env);
  if (!key) return null;
  const payload = bytesToB64url(
    textEncoder.encode(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S })),
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return `${payload}.${bytesToB64url(new Uint8Array(sig))}`;
}

/** True when the request carries a valid, unexpired session token. */
export async function adminAuthorized(request: Request, env: AuthEnv): Promise<boolean> {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const key = await hmacKey(env);
  if (!key) return false;
  let ok = false;
  try {
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((sig.length + 3) % 4)),
      (c) => c.charCodeAt(0),
    );
    ok = await crypto.subtle.verify('HMAC', key, sigBytes, textEncoder.encode(payload));
  } catch {
    return false;
  }
  if (!ok) return false;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((payload.length + 3) % 4));
    const data = JSON.parse(json) as { u?: string; exp?: number };
    return typeof data.exp === 'number' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function adminStatus(env: AuthEnv): Promise<{ setupRequired: boolean; sessionKeyConfigured: boolean }> {
  const cred = await readCred(env);
  return { setupRequired: !cred, sessionKeyConfigured: !!env.ADMIN_SESSION_KEY };
}

export interface AuthResult {
  ok: boolean;
  token?: string;
  error?: string;
  status: number;
}

export async function adminSetup(env: AuthEnv, body: { username?: string; password?: string }): Promise<AuthResult> {
  if (!env.ZARLINO_KV) return { ok: false, error: 'Admin storage (KV) not configured', status: 500 };
  if (await readCred(env)) return { ok: false, error: 'Admin login already configured — use login', status: 409 };
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Username must be 3–64 chars: letters, digits, . _ -', status: 400 };
  }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters`, status: 400 };
  }
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const iterations = 10_000;
  const hash = await pbkdf2Hex(password, salt, iterations);
  const record: CredRecord = { username, salt, hash, iterations, updated_at: new Date().toISOString() };
  await env.ZARLINO_KV.put(CRED_KEY, JSON.stringify(record));
  const token = await mintSession(env, username);
  if (!token) return { ok: false, error: 'ADMIN_SESSION_KEY secret is not configured', status: 500 };
  return { ok: true, token, status: 200 };
}

export async function adminLogin(env: AuthEnv, body: { username?: string; password?: string }): Promise<AuthResult> {
  const kv = env.ZARLINO_KV;
  if (!kv) return { ok: false, error: 'Admin storage (KV) not configured', status: 500 };
  // Brute-force lockout.
  const fails = Number((await kv.get(FAIL_KEY)) || 0);
  if (fails >= MAX_FAILS) {
    return { ok: false, error: 'Too many failed attempts — try again in 15 minutes', status: 429 };
  }
  const cred = await readCred(env);
  if (!cred) return { ok: false, error: 'Admin login is not set up yet', status: 409 };
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const candidate = await pbkdf2Hex(password, cred.salt, cred.iterations);
  if (username !== cred.username || !safeEqualHex(candidate, cred.hash)) {
    await kv.put(FAIL_KEY, String(fails + 1), { expirationTtl: LOCKOUT_S });
    return { ok: false, error: 'Invalid username or password', status: 401 };
  }
  await kv.delete(FAIL_KEY);
  const token = await mintSession(env, cred.username);
  if (!token) return { ok: false, error: 'ADMIN_SESSION_KEY secret is not configured', status: 500 };
  return { ok: true, token, status: 200 };
}

export async function adminChangePassword(
  env: AuthEnv,
  request: Request,
  body: { current?: string; next?: string },
): Promise<AuthResult> {
  const kv = env.ZARLINO_KV;
  if (!kv) return { ok: false, error: 'Admin storage (KV) not configured', status: 500 };
  const cred = await readCred(env);
  if (!cred) return { ok: false, error: 'Admin login is not set up yet', status: 409 };
  if (!(await adminAuthorized(request, env))) return { ok: false, error: 'Unauthorized', status: 401 };
  const current = String(body.current ?? '');
  const next = String(body.next ?? '');
  if (next.length < MIN_PASSWORD) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD} characters`, status: 400 };
  }
  const candidate = await pbkdf2Hex(current, cred.salt, cred.iterations);
  if (!safeEqualHex(candidate, cred.hash)) {
    return { ok: false, error: 'Current password is incorrect', status: 401 };
  }
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2Hex(next, salt, cred.iterations);
  await kv.put(CRED_KEY, JSON.stringify({ ...cred, salt, hash, updated_at: new Date().toISOString() } satisfies CredRecord));
  return { ok: true, status: 200 };
}
