import { describe, expect, it } from "vitest";
import {
  MAX_PBKDF2_ITERATIONS,
  PASSWORD_ITERATIONS,
  SESSION_COOKIE,
  hashPassword,
  isValidEmail,
  login,
  logout,
  normaliseEmail,
  parseCookies,
  resolveSession,
  sessionCookie,
  signup,
  timingSafeEqual,
  validatePassword,
  base64UrlToBytes,
  bytesToBase64Url,
} from "../../src/factory/auth";
import { findUserById, setUserPlan, countUsers } from "../../src/factory/store";
import { makeIdentity } from "./harness";

describe("credential handling", () => {
  it("keeps the KDF cost inside what the Workers runtime accepts", () => {
    // `crypto.subtle.deriveBits` throws for PBKDF2 above this ceiling. Local
    // workerd does not enforce it, so only a test or a production request finds
    // this - and a production request means every signup fails.
    expect(PASSWORD_ITERATIONS).toBeLessThanOrEqual(MAX_PBKDF2_ITERATIONS);
    expect(PASSWORD_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  });

  it("normalises and validates emails", () => {
    expect(normaliseEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
    expect(isValidEmail("dot@localhost")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });

  it("enforces a password floor and ceiling", () => {
    expect(validatePassword("short")).toBe("TOO_SHORT");
    expect(validatePassword("longenough1")).toBeNull();
    expect(validatePassword("x".repeat(201))).toBe("TOO_LONG");
  });

  it("hashes with a random salt: the same password never produces the same hash", async () => {
    const saltA = new Uint8Array(16).fill(1);
    const saltB = new Uint8Array(16).fill(2);
    const a = bytesToBase64Url(await hashPassword("correct horse battery", saltA, 1000));
    const b = bytesToBase64Url(await hashPassword("correct horse battery", saltB, 1000));
    expect(a).not.toBe(b);
    expect(bytesToBase64Url(await hashPassword("correct horse battery", saltA, 1000))).toBe(a);
  });

  it("round-trips base64url", () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 3]);
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("compares in constant time without throwing on length mismatch", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcdef")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("accounts", () => {
  it("creates an account on the free plan with a usable session", async () => {
    const { sql } = makeIdentity();
    const result = await signup(sql, { email: "Maker@Example.com", password: "a-long-password" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.email_normalised).toBe("maker@example.com");
    expect(result.user.plan).toBe("free");
    expect(result.user.password_hash).not.toContain("a-long-password");

    const resolved = await resolveSession(sql, result.token);
    expect(resolved?.user.id).toBe(result.user.id);
  });

  it("refuses duplicate emails regardless of case", async () => {
    const { sql } = makeIdentity();
    await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    const second = await signup(sql, { email: "MAKER@example.com", password: "another-password" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("EMAIL_TAKEN");
    expect(countUsers(sql)).toBe(1);
  });

  it("refuses weak passwords and bad emails", async () => {
    const { sql } = makeIdentity();
    const weak = await signup(sql, { email: "a@b.co", password: "short" });
    expect(weak.ok).toBe(false);
    if (!weak.ok) expect(weak.code).toBe("WEAK_PASSWORD");

    const badEmail = await signup(sql, { email: "nope", password: "a-long-password" });
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) expect(badEmail.code).toBe("INVALID_EMAIL");
  });

  it("logs in with the right password and refuses the wrong one", async () => {
    const { sql } = makeIdentity();
    await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    const good = await login(sql, "Maker@Example.com", "a-long-password");
    expect(good.ok).toBe(true);
    const bad = await login(sql, "maker@example.com", "a-long-password!");
    expect(bad.ok).toBe(false);
  });

  it("gives the same answer for an unknown email as for a wrong password", async () => {
    const { sql } = makeIdentity();
    await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    const wrongPassword = await login(sql, "maker@example.com", "nope-nope-nope");
    const unknownEmail = await login(sql, "ghost@example.com", "nope-nope-nope");
    expect(JSON.stringify(wrongPassword)).toBe(JSON.stringify(unknownEmail));
  });
});

describe("sessions", () => {
  it("stores only the hash of the session token", async () => {
    const { sql } = makeIdentity();
    const account = await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    expect(account.ok).toBe(true);
    if (!account.ok) return;

    const rows = sql.all<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(account.token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an expired session and removes it", async () => {
    const { sql } = makeIdentity();
    const account = await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    if (!account.ok) throw new Error("signup failed");

    const later = () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    expect(await resolveSession(sql, account.token, later)).toBeNull();
    expect(sql.all("SELECT * FROM sessions")).toHaveLength(0);
  });

  it("rejects a forged or truncated token", async () => {
    const { sql } = makeIdentity();
    const account = await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    if (!account.ok) throw new Error("signup failed");

    expect(await resolveSession(sql, `${account.token}x`)).toBeNull();
    expect(await resolveSession(sql, "short")).toBeNull();
    expect(await resolveSession(sql, null)).toBeNull();
  });

  it("logs out by deleting the session", async () => {
    const { sql } = makeIdentity();
    const account = await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    if (!account.ok) throw new Error("signup failed");

    await logout(sql, account.token);
    expect(await resolveSession(sql, account.token)).toBeNull();
  });

  it("refuses a session whose account is no longer active", async () => {
    const { sql } = makeIdentity();
    const account = await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    if (!account.ok) throw new Error("signup failed");

    sql.run("UPDATE users SET status = 'suspended' WHERE id = ?", account.user.id);
    expect(await resolveSession(sql, account.token)).toBeNull();
  });

  it("marks the cookie HttpOnly, Secure and SameSite=Lax", () => {
    const cookie = sessionCookie("token-value");
    expect(cookie).toContain(`${SESSION_COOKIE}=token-value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("parses a cookie header without being fooled by extra attributes", () => {
    const parsed = parseCookies("a=1; zf_session=abc%3D; other=2");
    expect(parsed.zf_session).toBe("abc=");
    expect(parsed.a).toBe("1");
  });
});

describe("plan state", () => {
  it("defaults to free and can be upgraded by the billing path only through setUserPlan", async () => {
    const { sql } = makeIdentity();
    const account = await signup(sql, { email: "maker@example.com", password: "a-long-password" });
    if (!account.ok) throw new Error("signup failed");

    expect(findUserById(sql, account.user.id)!.plan).toBe("free");
    setUserPlan(sql, account.user.id, "pro", "paystack", "ref_123", new Date().toISOString());
    const upgraded = findUserById(sql, account.user.id)!;
    expect(upgraded.plan).toBe("pro");
    expect(upgraded.plan_reference).toBe("ref_123");
  });
});
