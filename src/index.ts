/**
 * Zarlino Audio — Website Worker
 *
 * Serves the static Astro build via the [assets] binding and exposes:
 *   POST /api/license   — issues a signed license key per plugin (ZTame, ZScorch)
 *   POST /api/feedback  — files feedback issues to the zarlino-feedback repo
 *   POST /api/track     — records page-view counters (KV)
 *   POST /api/affiliates/enrol — captures an affiliate application (KV)
 *   GET  /api/admin/stats — token-gated admin dashboard + site monitoring
 *
 * License blob format (must match tools/generate_license_keys.py):
 *   uint16 pluginIdLen | pluginId UTF-8 | uint16 emailLen | email UTF-8 |
 *   uint16 issueDateLen | issueDate UTF-8 | uint16 expirationLen | expiration UTF-8 |
 *   uint16 sigLen | RSA-SHA256 signature (PKCS#1 v1.5)
 * The blob is then base64-encoded and pasted into ZTame's license dialog.
 */

export interface Env {
  ASSETS: Fetcher;
  ZARLINO_LICENSE_PRIVATE_KEY?: string;
  GITHUB_TOKEN?: string;
  ADMIN_TOKEN?: string;
  ZARLINO_KV?: KVNamespace;
}

const FEEDBACK_REPO = 'zarlino-audio/zarlino-feedback';
const SITE_REPO = 'zarlino-audio/zarlino-website';
const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'other'] as const;
const SITE_BASE = 'https://zarlinoaudio.com';
const AFFILIATES_KV_KEY = 'affiliates:list';

// Supported plugins — `id` is the plugin ID embedded in the binary and checked
// by ZLicenseManager; `promoEnd` gates the free-license window (null = free via
// the request form; configure per business policy).
interface PluginSpec {
  id: string;
  name: string;
  promoEnd: Date | null;
}

const PLUGINS: Record<string, PluginSpec> = {
  ztame:   { id: 'ZTAME',   name: 'ZTame',   promoEnd: new Date('2026-08-25T23:59:59Z') },
  zscorch: { id: 'ZSCORCH', name: 'ZScorch', promoEnd: null },
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function decodePemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

async function signRsaSha256(pem: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePemToPkcs8(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    data as BufferSource,
  );
  return new Uint8Array(sig);
}

function encodeField(out: number[], value: string): void {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 0xffff) throw new Error('field too long');
  out.push((bytes.length >> 8) & 0xff, bytes.length & 0xff);
  for (const b of bytes) out.push(b);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
