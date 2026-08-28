/**
 * Zarlino Audio — Website Worker
 *
 * Serves the static Astro build via the [assets] binding and exposes:
 *   POST /api/license   — issues a signed license key per plugin (ZTame, ZScorch)
 *   POST /api/feedback  — files feedback issues to the zarlino-feedback repo
 *   POST /api/track     — records page-view counters (KV)
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
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PUBLIC_KEY?: string;
  PAYSTACK_CURRENCY?: string;
}

const FEEDBACK_REPO = 'zarlino-audio/zarlino-feedback';
const SITE_REPO = 'zarlino-audio/zarlino-website';
const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'other'] as const;
const SITE_BASE = 'https://zarlinoaudio.com';

// Supported plugins — `id` is the plugin ID embedded in the binary and checked
// by ZLicenseManager; `priceUsd`/`priceGhs` are server-authoritative retail
// prices used by Paystack checkout (never trust client prices). This Paystack
// account is GHS-only (see PAYSTACK_CURRENCY), so checkout bills in Cedis.
interface PluginSpec {
  id: string;
  name: string;
  priceUsd: number;
  priceGhs: number;
  promoEnd: Date | null;
}

const PLUGINS: Record<string, PluginSpec> = {
  ztame:   { id: 'ZTAME',   name: 'ZTame',   priceUsd: 49,   priceGhs: 750,  promoEnd: new Date('2026-08-25T23:59:59Z') },
  zscorch: { id: 'ZSCORCH', name: 'ZScorch', priceUsd: 79,   priceGhs: 1200, promoEnd: null },
};

/** Pick the server price for the configured checkout currency. */
function pluginPrice(spec: PluginSpec, currency: string): number {
  if (currency === 'GHS') return spec.priceGhs;
  return spec.priceUsd;
}
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

/** Build and sign a license key for a plugin+email (shared by the free path
 *  and the paid Paystack path). Throws on misconfiguration. */
async function buildLicense(
  email: string,
  pluginKey: string,
  env: Env,
): Promise<{
  licenseKey: string;
  pluginId: string;
  plugin: string;
  pluginName: string;
  email: string;
  issueDate: string;
  expiration: string;
}> {
  const pem = env.ZARLINO_LICENSE_PRIVATE_KEY;
  if (!pem) throw new Error('License service is not configured');
  const spec = PLUGINS[pluginKey];
  if (!spec) throw new Error(`Unknown plugin "${pluginKey}"`);

  const now = new Date();
  const issueDate = now.toISOString().slice(0, 10);
  const expiration = 'perpetual';

  const payload: number[] = [];
  encodeField(payload, spec.id);
  encodeField(payload, email);
  encodeField(payload, issueDate);
  encodeField(payload, expiration);
  const payloadBytes = new Uint8Array(payload);

  const signature = await signRsaSha256(pem, payloadBytes);

  if (env.ZARLINO_KV) {
    const today = now.toISOString().slice(0, 10);
    await incr(env.ZARLINO_KV, 'licenses:total');
    await incr(env.ZARLINO_KV, `licenses:${today}`);
  }

  const blob: number[] = Array.from(payloadBytes);
  blob.push((signature.length >> 8) & 0xff, signature.length & 0xff);
  for (const b of signature) blob.push(b);

  return {
    licenseKey: bytesToBase64(new Uint8Array(blob)),
    pluginId: spec.id,
    plugin: pluginKey,
    pluginName: spec.name,
    email,
    issueDate,
    expiration,
  };
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

  let body: { email?: unknown; plugin?: unknown };
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

  const pluginKey =
    typeof body.plugin === 'string' ? body.plugin.trim().toLowerCase() : 'ztame';
  const spec = PLUGINS[pluginKey];
  if (!spec) {
    return json(
      {
        error: `Unknown plugin "${pluginKey}". Supported: ${Object.keys(PLUGINS).join(', ')}.`,
      },
      400,
    );
  }

  const now = new Date();
  if (spec.promoEnd && now > spec.promoEnd) {
    return json(
      {
        error:
          `The free ${spec.name} licensing period ended on ${spec.promoEnd.toISOString().slice(0, 10)}. ` +
          'Contact support@zarlinoaudio.com for licensing options.',
      },
      403,
    );
  }

  try {
    return json(await buildLicense(email, pluginKey, env));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'License generation failed' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Paystack checkout
// ---------------------------------------------------------------------------
const PAYSTACK_API = 'https://api.paystack.co';

function paystackHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY ?? ''}`,
    'Content-Type': 'application/json',
  };
}

interface PaystackLineItem {
  plugin: string;
  pluginName: string;
  unitPrice: number;
  qty: number;
}

/** POST /api/paystack/initialize — create a Paystack transaction from the cart.
 *  Server-side prices only; returns the hosted authorization URL. */
async function handlePaystackInitialize(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.PAYSTACK_SECRET_KEY) return json({ error: 'Paystack is not configured' }, 500);

  let body: { email?: unknown; items?: unknown; ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address' }, 400);
  const refCode = typeof body.ref === 'string' ? body.ref.trim().toUpperCase() : '';
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'Your cart is empty' }, 400);

  // Server-authoritative pricing — never trust client prices.
  const currency = (env.PAYSTACK_CURRENCY || 'USD').toUpperCase();
  const lineItems: PaystackLineItem[] = [];
  let total = 0;
  for (const raw of items) {
    const it = raw as { plugin?: unknown; qty?: unknown };
    const pluginKey = typeof it.plugin === 'string' ? it.plugin.trim().toLowerCase() : '';
    const qty = Math.max(1, Math.min(10, Number(it.qty) || 1));
    const spec = PLUGINS[pluginKey];
    if (!spec) return json({ error: `Unknown plugin "${pluginKey}"` }, 400);
    const unitPrice = pluginPrice(spec, currency);
    lineItems.push({ plugin: pluginKey, pluginName: spec.name, unitPrice, qty });
    total += unitPrice * qty;
  }
  const amountMinor = Math.round(total * 100); // Paystack amounts are in minor units (kobo/pennies)
  const reference = `ZAR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const callbackUrl = `${SITE_BASE}/checkout?reference=${reference}`;

  try {
    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: paystackHeaders(env),
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: { items: lineItems, cart_ref: refCode },
      }),
    });
    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; access_code?: string; reference?: string };
    };
    if (!res.ok || !data.status || !data.data?.authorization_url) {
      return json({ error: data.message || 'Paystack could not initialize payment' }, 502);
    }
    return json({
      ok: true,
      authorization_url: data.data.authorization_url,
      reference: data.data.reference ?? reference,
      amount: total,
      currency,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Paystack initialization failed' }, 502);
  }
}

/** GET /api/paystack/verify?reference=… — verify a transaction; on success
 *  issue licenses, record revenue, and credit any attached affiliate code. */
async function handlePaystackVerify(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!env.PAYSTACK_SECRET_KEY) return json({ error: 'Paystack is not configured' }, 500);

  const url = new URL(request.url);
  const reference = (url.searchParams.get('reference') || '').trim();
  if (!reference) return json({ error: 'Missing reference' }, 400);

  try {
    const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: paystackHeaders(env),
    });
    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      code?: string;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        customer?: { email?: string };
        metadata?: { items?: PaystackLineItem[]; cart_ref?: string };
      };
    };
    // Paystack reports unknown references as HTTP 400 + {code:"transaction_not_found"}
    // (some endpoints use 404). Map those to a clean 404; anything else is a 502.
    if (!res.ok || data.status === false) {
      const notFound =
        data.code === "transaction_not_found" ||
        (!res.ok && res.status === 404) ||
        (res.ok && data.status === false);
      return json({ error: data.message || "Verification failed", reference }, notFound ? 404 : 502);
    }

    const txn = data.data ?? {};
    const status = txn.status ?? 'unknown';
    if (status !== 'success') {
      return json({ ok: false, status, message: `Payment ${status}` });
    }

    const email = String(txn.customer?.email || '').trim().toLowerCase();
    const amount = Number(txn.amount || 0) / 100;
    const items = Array.isArray(txn.metadata?.items) ? txn.metadata.items : [];
    const refCode = String(txn.metadata?.cart_ref || '').toUpperCase();

    // Issue a license per paid item (idempotent-ish: verify is called once per
    // checkout; a stored receipt lets us skip double-issuing on re-visits).
    const alreadyIssued = env.ZARLINO_KV ? await env.ZARLINO_KV.get(`paystack:txn:${reference}`) : null;
    const licenses: Array<{ licenseKey: string; plugin: string; pluginName: string }> = [];
    if (!alreadyIssued) {
      for (const it of items) {
        const pluginKey = String(it.plugin || '').toLowerCase();
        if (!PLUGINS[pluginKey]) continue;
        try {
          const lic = await buildLicense(email, pluginKey, env);
          licenses.push({ licenseKey: lic.licenseKey, plugin: lic.plugin, pluginName: lic.pluginName });
        } catch {
          /* skip unconfigured plugin */
        }
      }
    }

    if (env.ZARLINO_KV && !alreadyIssued) {
      const today = new Date().toISOString().slice(0, 10);
      await incr(env.ZARLINO_KV, 'revenue:count:total');
      await incr(env.ZARLINO_KV, `revenue:count:${today}`);
      await env.ZARLINO_KV.put(
        'revenue:amount:total',
        String(Math.round((Number(await env.ZARLINO_KV.get('revenue:amount:total')) || 0 + amount) * 100) / 100),
      );
      await env.ZARLINO_KV.put(
        `revenue:amount:${today}`,
        String(Math.round((Number(await env.ZARLINO_KV.get(`revenue:amount:${today}`)) || 0 + amount) * 100) / 100),
      );
      await env.ZARLINO_KV.put(
        `paystack:txn:${reference}`,
        JSON.stringify({ reference, email, amount, currency: txn.currency ?? 'USD', status, items, refCode, paidAt: new Date().toISOString() }),
      );
      if (refCode && (await env.ZARLINO_KV.get(`aff:code:${refCode}`))) {
        await incr(env.ZARLINO_KV, `aff:conv:${refCode}`);
        const cur = Number(await env.ZARLINO_KV.get(`aff:rev:${refCode}`)) || 0;
        await env.ZARLINO_KV.put(`aff:rev:${refCode}`, String(Math.round((cur + amount) * 100) / 100));
      }
    }

    return json({
      ok: true,
      status: 'success',
      reference,
      email,
      amount,
      currency: txn.currency ?? 'USD',
      licenses,
      items,
      alreadyIssued: Boolean(alreadyIssued),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Verification failed' }, 502);
  }
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

/* ------------------------------------------------------------------ *
 * Admin dashboard + site monitoring
 * ------------------------------------------------------------------ */

const SITE_PAGES = [
  '/',
  '/plugins/ztame',
  '/plugins/zscorch',
  '/report',
];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function adminAuthorized(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const url = new URL(request.url);
  const q = url.searchParams.get('token');
  if (q && timingSafeEqual(q, token)) return true;
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return timingSafeEqual(auth.slice(7), token);
  return false;
}

async function incr(kv: KVNamespace, key: string): Promise<void> {
  const cur = await kv.get(key);
  await kv.put(key, String((Number(cur) || 0) + 1));
}

async function fetchGitHub(path: string, env: Env): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'zarlino-website-worker',
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
    },
  });
}

interface GhIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  labels: Array<{ name: string }>;
}

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!adminAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin is not configured' }, 500);

  // 1. Bug reports / feedback issues (public repo)
  let feedback = { available: false, open: 0, closed: 0, total: 0, recent: [] as Array<Record<string, unknown>> };
  try {
    const res = await fetchGitHub(
      `/repos/${FEEDBACK_REPO}/issues?state=all&per_page=100&sort=updated&direction=desc`,
      env,
    );
    if (res.ok) {
      const issues = (await res.json()) as GhIssue[];
      feedback = {
        available: true,
        open: issues.filter((i) => i.state === 'open').length,
        closed: issues.filter((i) => i.state === 'closed').length,
        total: issues.length,
        recent: issues.slice(0, 10).map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          labels: i.labels.map((l) => l.name),
          url: i.html_url,
          createdAt: i.created_at,
        })),
      };
    }
  } catch {
    /* feedback stays unavailable */
  }

  // 2. Site health — the Worker can't reliably fetch its own route (self-loop),
  //    so we return the monitored page list and the dashboard probes each page
  //    from the browser (a real external check against the Cloudflare edge).
  const site = SITE_PAGES.map((p) => ({ path: p, status: null, ok: null }));

  // 3. Deploy status (private repo — only available if token has repo scope)
  let deploy = { available: false, runs: [] as Array<Record<string, unknown>> };
  try {
    const res = await fetchGitHub(`/repos/${SITE_REPO}/actions/runs?per_page=5`, env);
    if (res.ok) {
      const data = (await res.json()) as { workflow_runs?: Array<{
        name: string; status: string; conclusion: string | null;
        head_branch: string; created_at: string; html_url: string;
      }> };
      deploy = {
        available: true,
        runs: (data.workflow_runs || []).map((r) => ({
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          branch: r.head_branch,
          createdAt: r.created_at,
          url: r.html_url,
        })),
      };
    }
  } catch {
    /* deploy stays unavailable */
  }

  // 4. Counters (KV optional)
  let counters: Record<string, unknown> = { enabled: false };
  if (env.ZARLINO_KV) {
    const today = new Date().toISOString().slice(0, 10);
    const [viewsTotal, viewsToday, licTotal, licToday] = await Promise.all([
      env.ZARLINO_KV.get('views:total'),
      env.ZARLINO_KV.get(`views:${today}`),
      env.ZARLINO_KV.get('licenses:total'),
      env.ZARLINO_KV.get(`licenses:${today}`),
    ]);
    counters = {
      enabled: true,
      views: { total: Number(viewsTotal || 0), today: Number(viewsToday || 0) },
      licenses: { total: Number(licTotal || 0), today: Number(licToday || 0) },
    };
  }

  return json({
    generatedAt: new Date().toISOString(),
    feedback,
    site,
    deploy,
    counters,
    links: {
      cloudflare: 'https://dash.cloudflare.com',
      feedbackRepo: `https://github.com/${FEEDBACK_REPO}/issues`,
      sitemap: `${SITE_BASE}/sitemap-index.xml`,
    },
  });
}

async function handleTrack(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.ZARLINO_KV) return new Response(null, { status: 204 });

  let path = '/';
  try {
    const body = (await request.json()) as { path?: unknown };
    if (typeof body.path === 'string') path = body.path.slice(0, 200);
  } catch {
    /* keep default path */
  }

  const today = new Date().toISOString().slice(0, 10);
  await incr(env.ZARLINO_KV, 'views:total');
  await incr(env.ZARLINO_KV, `views:${today}`);
  await incr(env.ZARLINO_KV, `views:${today}:${path}`);
  return new Response(null, { status: 204 });
}

/* ------------------------------------------------------------------ *
 * Affiliate program — self-enrolment + acquisition-manager reporting
 *
 *   POST /api/affiliates/enrol   (public)  — submit an application
 *   GET  /api/affiliates/report  (admin)   — manager report (apps + stats)
 *   POST /api/affiliates/approve (admin)   — approve app, issue referral code
 *   POST /api/affiliates/reject  (admin)   — reject an application
 *   POST /api/affiliates/click   (public)  — record a referral-link click
 *   POST /api/affiliates/convert (admin)   — record a referred sale
 *
 * Storage (Cloudflare KV, binding ZARLINO_KV):
 *   aff:app:<id>      application record   (status: pending|approved|rejected)
 *   aff:code:<code>   approved affiliate record
 *   aff:clicks:<code> click counter (KV incr)
 *   aff:conv:<code>   conversion counter
 *   aff:rev:<code>    referred revenue accumulator
 *
 * Referral link format:  https://zarlinoaudio.com/?ref=<CODE>
 * The main fetch() below intercepts `?ref=` on page loads, records a click,
 * and serves the page with the ref parameter stripped.
 * ------------------------------------------------------------------ */

const AFF_COMMISSION_RATE = 0.25; // 25% commission — must match the public /affiliates page.

interface AffApp {
  id: string;
  name: string;
  email: string;
  platform: string;
  audience: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  code?: string;
  decidedAt?: string;
}

interface AffCode {
  code: string;
  appId: string;
  name: string;
  email: string;
  platform: string;
  approvedAt: string;
  clicks: number;
  conversions: number;
  revenue: number;
}

function makeAffCode(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3) || 'ZAR';
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  return `${base}${rand}`.slice(0, 8);
}

async function readAffApp(kv: KVNamespace, id: string): Promise<AffApp | null> {
  const raw = await kv.get(`aff:app:${id}`);
  return raw ? (JSON.parse(raw) as AffApp) : null;
}

async function readAffCode(kv: KVNamespace, code: string): Promise<AffCode | null> {
  const raw = await kv.get(`aff:code:${code}`);
  if (!raw) return null;
  const rec = JSON.parse(raw) as AffCode;
  rec.clicks = Number(await kv.get(`aff:clicks:${code}`)) || 0;
  rec.conversions = Number(await kv.get(`aff:conv:${code}`)) || 0;
  rec.revenue = Number(await kv.get(`aff:rev:${code}`)) || 0;
  return rec;
}

async function handleAffiliateEnrol(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.ZARLINO_KV) {
    return json(
      { error: 'Affiliate sign-ups are temporarily unavailable. Email support@zarlinoaudio.com instead.' },
      503,
    );
  }

  let body: { name?: unknown; email?: unknown; platform?: unknown; audience?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim().slice(0, 200) : '';
  const audience = typeof body.audience === 'string' ? body.audience.trim().slice(0, 200) : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

  if (name.length < 2) return json({ error: 'Enter your full name.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);

  // Deduplicate by email across existing applications.
  const existing = await env.ZARLINO_KV.list({ prefix: 'aff:app:' });
  for (const key of existing.keys) {
    const app = JSON.parse((await env.ZARLINO_KV.get(key.name)) || '{}') as AffApp;
    if (app.email === email) {
      return json({
        id: app.id,
        alreadyApplied: true,
        status: app.status,
        message:
          app.status === 'approved' && app.code
            ? 'You are already an approved affiliate. Your referral link is below.'
            : 'You already have an application under review.',
      });
    }
  }

  const id = crypto.randomUUID();
  const app: AffApp = {
    id,
    name,
    email,
    platform,
    audience,
    notes,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await env.ZARLINO_KV.put(`aff:app:${id}`, JSON.stringify(app));
  return json({ ok: true, id, status: 'pending' });
}

async function handleAffiliateReport(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!adminAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin is not configured' }, 500);

  if (!env.ZARLINO_KV) {
    return json({ enabled: false, error: 'ZARLINO_KV is not bound to the Worker.' });
  }

  const kv = env.ZARLINO_KV;
  const [appKeys, codeKeys] = await Promise.all([
    kv.list({ prefix: 'aff:app:' }),
    kv.list({ prefix: 'aff:code:' }),
  ]);

  const applications: Array<Record<string, unknown>> = [];
  for (const key of appKeys.keys) {
    const raw = await kv.get(key.name);
    if (raw) applications.push(JSON.parse(raw));
  }
  applications.sort(
    (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  );

  const affiliates: AffCode[] = [];
  for (const key of codeKeys.keys) {
    const code = key.name.slice('aff:code:'.length);
    const rec = await readAffCode(kv, code);
    if (rec) affiliates.push(rec);
  }
  affiliates.sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));

  const totals = affiliates.reduce(
    (acc, a) => {
      acc.clicks += a.clicks;
      acc.conversions += a.conversions;
      acc.revenue += a.revenue;
      return acc;
    },
    { clicks: 0, conversions: 0, revenue: 0 },
  );

  return json({
    enabled: true,
    generatedAt: new Date().toISOString(),
    commissionRate: AFF_COMMISSION_RATE,
    referralBase: `${SITE_BASE}/?ref=`,
    stats: {
      totalApplications: applications.length,
      pending: applications.filter((a) => a.status === 'pending').length,
      approved: affiliates.length,
      rejected: applications.filter((a) => a.status === 'rejected').length,
      clicks: totals.clicks,
      conversions: totals.conversions,
      referredRevenue: totals.revenue,
      estimatedCommission: Math.round(totals.revenue * AFF_COMMISSION_RATE * 100) / 100,
      conversionRate: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
    },
    applications,
    affiliates,
  });
}

async function handleAffiliateDecide(request: Request, env: Env, action: 'approve' | 'reject'): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!adminAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin is not configured' }, 500);
  if (!env.ZARLINO_KV) return json({ error: 'ZARLINO_KV is not bound' }, 503);

  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return json({ error: 'Missing application id' }, 400);

  const kv = env.ZARLINO_KV;
  const app = await readAffApp(kv, id);
  if (!app) return json({ error: 'Application not found' }, 404);

  if (action === 'reject') {
    app.status = 'rejected';
    app.decidedAt = new Date().toISOString();
    await kv.put(`aff:app:${id}`, JSON.stringify(app));
    return json({ ok: true, id, status: 'rejected' });
  }

  if (app.status === 'approved' && app.code) {
    return json({ ok: true, id, status: 'approved', code: app.code, referralUrl: `${SITE_BASE}/?ref=${app.code}` });
  }

  // Issue a unique referral code.
  let code = makeAffCode(app.name);
  let guard = 0;
  while ((await kv.get(`aff:code:${code}`)) && guard < 10) {
    code = makeAffCode(app.name);
    guard++;
  }

  app.status = 'approved';
  app.code = code;
  app.decidedAt = new Date().toISOString();
  await kv.put(`aff:app:${id}`, JSON.stringify(app));

  const rec: AffCode = {
    code,
    appId: id,
    name: app.name,
    email: app.email,
    platform: app.platform,
    approvedAt: new Date().toISOString(),
    clicks: 0,
    conversions: 0,
    revenue: 0,
  };
  await kv.put(`aff:code:${code}`, JSON.stringify(rec));
  await kv.put(`aff:clicks:${code}`, '0');
  await kv.put(`aff:conv:${code}`, '0');
  await kv.put(`aff:rev:${code}`, '0');

  return json({ ok: true, id, status: 'approved', code, referralUrl: `${SITE_BASE}/?ref=${code}` });
}

async function handleAffiliateClick(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.ZARLINO_KV) return new Response(null, { status: 204 });

  let code = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code === 'string') code = body.code.trim().toUpperCase();
  } catch {
    /* ignore */
  }
  if (!code) return new Response(null, { status: 204 });
  if (!(await env.ZARLINO_KV.get(`aff:code:${code}`))) return new Response(null, { status: 204 });
  await incr(env.ZARLINO_KV, `aff:clicks:${code}`);
  return new Response(null, { status: 204 });
}

async function handleAffiliateConvert(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!adminAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin is not configured' }, 500);
  if (!env.ZARLINO_KV) return json({ error: 'ZARLINO_KV is not bound' }, 503);

  let body: { code?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount) ? Math.max(0, body.amount) : 0;
  if (!code) return json({ error: 'Missing referral code' }, 400);
  if (!(await env.ZARLINO_KV.get(`aff:code:${code}`))) {
    return json({ error: 'Unknown referral code' }, 404);
  }

  const kv = env.ZARLINO_KV;
  await incr(kv, `aff:conv:${code}`);
  const cur = Number(await kv.get(`aff:rev:${code}`)) || 0;
  await kv.put(`aff:rev:${code}`, String(Math.round((cur + amount) * 100) / 100));
  return json({ ok: true, code });
}

async function handleAffiliateRemove(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!adminAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.ADMIN_TOKEN) return json({ error: 'Admin is not configured' }, 500);
  if (!env.ZARLINO_KV) return json({ error: 'ZARLINO_KV is not bound' }, 503);

  let body: { id?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const kv = env.ZARLINO_KV;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!id && !code) return json({ error: 'Provide an application id or referral code' }, 400);

  // Resolve the referral code from the application if only an id was given.
  let codeToRemove = code;
  if (!codeToRemove && id) codeToRemove = (await readAffApp(kv, id))?.code ?? '';
  if (id) await kv.delete(`aff:app:${id}`);
  if (codeToRemove) {
    await kv.delete(`aff:code:${codeToRemove}`);
    await kv.delete(`aff:clicks:${codeToRemove}`);
    await kv.delete(`aff:conv:${codeToRemove}`);
    await kv.delete(`aff:rev:${codeToRemove}`);
  }
  return json({ ok: true, removedApp: !!id, removedCode: codeToRemove });
}

/** Record a referral click when a page is loaded with `?ref=<CODE>`, then
 *  serve the page with the ref parameter stripped so the URL stays clean. */
async function handleReferralPageLoad(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response | null> {
  const url = new URL(request.url);
  const code = (url.searchParams.get('ref') || '').trim().toUpperCase();
  if (!code) return null;
  if (env.ZARLINO_KV && (await env.ZARLINO_KV.get(`aff:code:${code}`))) {
    // Best-effort counter, kept alive past the response via waitUntil so
    // the click is never lost to fire-and-forget cancellation.
    ctx.waitUntil(
      (async () => {
        const prev = Number(await env.ZARLINO_KV!.get(`aff:clicks:${code}`)) || 0;
        await env.ZARLINO_KV!.put(`aff:clicks:${code}`, String(prev + 1));
      })(),
    );
  }
  url.searchParams.delete('ref');
  const next = new Request(url.toString(), request);
  return env.ASSETS.fetch(next);
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);

    // Referral links: /?ref=CODE — record the click, serve clean page.
    if (request.method === 'GET' && url.searchParams.has('ref')) {
      const viaRef = await handleReferralPageLoad(request, env, ctx);
      if (viaRef) return viaRef;
    }

    if (url.pathname === '/api/license') {
      return handleLicense(request, env);
    }
    if (url.pathname === '/api/paystack/initialize') {
      return handlePaystackInitialize(request, env);
    }
    if (url.pathname === '/api/paystack/verify') {
      return handlePaystackVerify(request, env);
    }
    if (url.pathname === '/api/feedback') {
      return handleFeedback(request, env);
    }
    if (url.pathname === '/api/track') {
      return handleTrack(request, env);
    }
    if (url.pathname === '/api/admin/stats') {
      return handleAdminStats(request, env);
    }
    if (url.pathname === '/api/affiliates/enrol') {
      return handleAffiliateEnrol(request, env);
    }
    if (url.pathname === '/api/affiliates/report') {
      return handleAffiliateReport(request, env);
    }
    if (url.pathname === '/api/affiliates/approve') {
      return handleAffiliateDecide(request, env, 'approve');
    }
    if (url.pathname === '/api/affiliates/reject') {
      return handleAffiliateDecide(request, env, 'reject');
    }
    if (url.pathname === '/api/affiliates/click') {
      return handleAffiliateClick(request, env);
    }
    if (url.pathname === '/api/affiliates/convert') {
      return handleAffiliateConvert(request, env);
    }
    if (url.pathname === '/api/affiliates/remove') {
      return handleAffiliateRemove(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
