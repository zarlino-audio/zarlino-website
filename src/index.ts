/**
 * Zarlino Audio — Website Worker
 *
 * Serves the static Astro build via the [assets] binding and exposes a
 * `POST /api/license` endpoint that issues a signed ZTame license key.
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
}

const FEEDBACK_REPO = 'zarlino-audio/zarlino-feedback';
const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'other'] as const;

const PROMO_END = new Date('2026-08-25T23:59:59Z');
const PLUGIN_ID = 'ZTAME';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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

async function handleLicense(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const pem = env.ZARLINO_LICENSE_PRIVATE_KEY;
  if (!pem) {
    return json({ error: 'License service is not configured' }, 500);
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) {
    return json({ error: 'Enter a valid email address' }, 400);
  }

  const now = new Date();
  if (now > PROMO_END) {
    return json(
      {
        error:
          'The free ZTame licensing period ended on August 25, 2026. Contact support@zarlinoaudio.com for licensing options.',
      },
      403,
    );
  }

  const issueDate = now.toISOString().slice(0, 10);
  const expiration = 'perpetual';

  const payload: number[] = [];
  encodeField(payload, PLUGIN_ID);
  encodeField(payload, email);
  encodeField(payload, issueDate);
  encodeField(payload, expiration);
  const payloadBytes = new Uint8Array(payload);

  const signature = await signRsaSha256(pem, payloadBytes);

  const blob: number[] = Array.from(payloadBytes);
  blob.push((signature.length >> 8) & 0xff, signature.length & 0xff);
  for (const b of signature) blob.push(b);

  return json({
    licenseKey: bytesToBase64(new Uint8Array(blob)),
    pluginId: PLUGIN_ID,
    email,
    issueDate,
    expiration,
  });
}

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json(
      { error: 'Feedback service is not configured. Email support@zarlinoaudio.com instead.' },
      500,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const rawCategory = body.category;
  const category =
    typeof rawCategory === 'string' &&
    (FEEDBACK_CATEGORIES as readonly string[]).includes(rawCategory)
      ? rawCategory
      : 'other';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';
  const subject =
    typeof body.subject === 'string' ? body.subject.trim().slice(0, 120) : '';
  const message =
    typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : '';

  if (!message) {
    return json({ error: 'Please describe the bug or suggestion.' }, 400);
  }

  const title = `[${category.toUpperCase()}] ${subject || message.slice(0, 60)}`;
  const labels =
    category === 'bug' ? ['bug'] : category === 'suggestion' ? ['enhancement'] : [];

  const issueBody = [
    `**Category:** ${category}`,
    name ? `**Reported by:** ${name}` : '',
    email ? `**Contact:** ${email}` : '',
    `**Submitted:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
    message,
    '',
    '_Submitted via the Zarlino Audio feedback form (zarlinoaudio.com/report)._',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(`https://api.github.com/repos/${FEEDBACK_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'zarlino-website-worker',
    },
    body: JSON.stringify({ title, body: issueBody, labels }),
  });

  if (!res.ok) {
    return json(
      { error: 'Could not submit feedback right now. Please email support@zarlinoaudio.com.' },
      502,
    );
  }

  const issue = (await res.json()) as { html_url?: string };
  return json({ ok: true, url: issue.html_url || '' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/license') {
      return handleLicense(request, env);
    }
    if (url.pathname === '/api/feedback') {
      return handleFeedback(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
