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
}

const FEEDBACK_REPO = 'zarlino-audio/zarlino-feedback';
const SITE_REPO = 'zarlino-audio/zarlino-website';
const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'other'] as const;
const SITE_BASE = 'https://zarlinoaudio.com';

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
    const today = new Date().toISOString().slice(0, 10);
    await incr(env.ZARLINO_KV, 'licenses:total');
    await incr(env.ZARLINO_KV, `licenses:${today}`);
  }

  const blob: number[] = Array.from(payloadBytes);
  blob.push((signature.length >> 8) & 0xff, signature.length & 0xff);
  for (const b of signature) blob.push(b);

  return json({
    licenseKey: bytesToBase64(new Uint8Array(blob)),
    pluginId: spec.id,
    plugin: pluginKey,
    pluginName: spec.name,
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/license') {
      return handleLicense(request, env);
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
    return env.ASSETS.fetch(request);
  },
};
