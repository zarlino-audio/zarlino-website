/**
 * Zarlino Audio — Website Worker
 *
 * Serves the static Astro build via the [assets] binding and exposes:
 *   POST /api/license   — issues a signed license key per plugin (ZTame, ZScorch)
 *   POST /api/feedback  — files feedback issues to the zarlino-feedback repo
 *   POST /api/track     — records page-view counters (KV)
 *   GET  /api/admin/stats — password-gated admin dashboard + site monitoring
 *   POST /api/admin/{setup,login,logout,change-password} — founder auth
 *        (username/password + signed sessions; the old shared ADMIN_TOKEN was
 *        removed 2026-09-30 — see src/auth.ts)
 *   GET  /api/health    — deployment identity (service, version, commit, deployedAt)
 *   GET  /api/ready     — can this deployment perform minimum production operations?
 *   GET  /api/contract  — the canonical route contract (routes/contract.json)
 *
 * FAILURE BOUNDARY (hard requirement): no ordinary request may escape this
 * Worker as an uncaught exception. Cloudflare error 1101 (uncaught Worker
 * exception) is never an acceptable response. Every request runs inside the
 * top-level try/catch in the default export; unexpected exceptions become a
 * controlled JSON 500 (for /api/*) or a plain-text 500. Page requests are
 * normally served by the platform asset router before the Worker runs at all
 * (see wrangler.toml [assets] run_worker_first), so unknown pages return the
 * custom 404 page with an exact HTTP 404 — never a 1101.
 *
 * License blob format (must match tools/generate_license_keys.py):
 *   uint16 pluginIdLen | pluginId UTF-8 | uint16 emailLen | email UTF-8 |
 *   uint16 issueDateLen | issueDate UTF-8 | uint16 expirationLen | expiration UTF-8 |
 *   uint16 sigLen | RSA-SHA256 signature (PKCS#1 v1.5)
 * The blob is then base64-encoded and pasted into ZTame's license dialog.
 */

import { adminAuthorized, adminChangePassword, adminLogin, adminSetup, adminStatus } from './auth';
import contractJson from '../routes/contract.json';
import { handleFactoryApi, type FactoryHttpEnv } from './factory/http';
import { FactoryIdentity, FactoryWorkspace } from './factory/durable';

export { FactoryIdentity, FactoryWorkspace };

export interface Env extends FactoryHttpEnv {
  ASSETS?: Fetcher;
  ZARLINO_LICENSE_PRIVATE_KEY?: string;
  GITHUB_TOKEN?: string;
  ZARLINO_KV?: KVNamespace;
  ADMIN_SESSION_KEY?: string;
  /**
   * Deploy provenance — set by CI at deploy time
   * (`wrangler deploy --var DEPLOY_COMMIT:<sha> ...`). Together these identify
   * exactly which build production is running; /api/health exposes them.
   */
  DEPLOY_COMMIT?: string;
  DEPLOY_RUN_ID?: string;
  DEPLOYED_AT?: string;
  /**
   * Verified release storage (private R2 bucket `zarlino-releases`). Release
   * assets are published by the plugin release gate and served exclusively
   * through this Worker at /releases/<product>/latest/... (no public bucket).
   */
  RELEASES?: R2Bucket;
}

/** Keep in sync with package.json version. Informational — the git commit is the identity. */
const SERVICE_VERSION = '0.1.0';

/** Shape of routes/contract.json (the one authoritative route contract). */
interface RouteContract {
  schemaVersion: number;
  service: string;
  required: Array<{ path: string; status: number; contentTypePrefix?: string[] }>;
  redirect: Array<{ path: string; status: number; to: string }>;
  absent: Array<{ path: string; status: number }>;
  api: Array<{ path: string; status: number; method?: string; contentTypePrefix?: string[]; identity?: boolean }>;
  artifacts: Array<{ path: string; status: number; method?: string }>;
}
const contract = contractJson as unknown as RouteContract;

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
    // Configuration fault, not an application exception: report 503 so the
    // readiness endpoint and monitoring can distinguish "deployment not
    // capable" from "request failed".
    return json({ error: 'License service is not configured' }, 503);
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
      503,
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
 * Deployment identity and readiness
 * ------------------------------------------------------------------ */

/** GET /api/health — answer: "is this service alive, and WHICH build is it?" */
async function handleHealth(env: Env): Promise<Response> {
  return json({
    service: 'zarlino-website',
    status: 'ok',
    version: SERVICE_VERSION,
    commit: env.DEPLOY_COMMIT || 'unknown',
    runId: env.DEPLOY_RUN_ID || null,
    deployedAt: env.DEPLOYED_AT || null,
    time: new Date().toISOString(),
  });
}

/**
 * GET /api/ready — answer: "can this deployment perform the minimum operations
 * required for production?" Deliberately separate from /api/health: health is
 * liveness + identity; readiness is capability. Required capabilities:
 *   - staticAssets: the [assets] binding serves built pages/assets
 *   - licenseSigning: the RSA key to issue licenses at checkout is configured
 * Optional capabilities are reported for observability but do not gate ready.
 */
async function handleReady(request: Request, env: Env): Promise<Response> {
  let staticAssets = false;
  try {
    if (env.ASSETS) {
      const probeUrl = new URL(request.url);
      probeUrl.pathname = '/robots.txt';
      probeUrl.search = '';
      const res = await env.ASSETS.fetch(new Request(probeUrl.toString(), { method: 'GET' }));
      staticAssets = res.status === 200;
    }
  } catch {
    staticAssets = false;
  }

  const licenseSigning =
    typeof env.ZARLINO_LICENSE_PRIVATE_KEY === 'string' && env.ZARLINO_LICENSE_PRIVATE_KEY.length > 0;
  const ready = staticAssets && licenseSigning;

  return json(
    {
      service: 'zarlino-website',
      status: ready ? 'ready' : 'degraded',
      commit: env.DEPLOY_COMMIT || 'unknown',
      required: { staticAssets, licenseSigning },
      optional: {
        kv: !!env.ZARLINO_KV,
        feedbackToken: !!env.GITHUB_TOKEN,
        adminSession: !!env.ADMIN_SESSION_KEY,
      },
      time: new Date().toISOString(),
    },
    ready ? 200 : 503,
  );
}

/* ------------------------------------------------------------------ *
 * Admin dashboard + site monitoring
 * ------------------------------------------------------------------ */

/** Monitored page list — derived from the ONE route contract, never re-listed. */
const SITE_PAGES = contract.required
  .filter((r) => r.contentTypePrefix?.includes('text/html'))
  .map((r) => r.path);

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

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

async function handleAdminAuthRoute(sub: string, request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (sub === 'status') return json(await adminStatus(env));
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (sub === 'logout') return json({ ok: true }); // stateless sessions: the client drops the token
  const body = await readJsonBody<{ username?: string; password?: string; current?: string; next?: string }>(request);
  if (sub === 'setup') {
    const r = await adminSetup(env, body);
    return json(r.ok ? { ok: true, token: r.token } : { error: r.error }, r.status);
  }
  if (sub === 'login') {
    const r = await adminLogin(env, body);
    return json(r.ok ? { ok: true, token: r.token } : { error: r.error }, r.status);
  }
  if (sub === 'change-password') {
    const r = await adminChangePassword(env, request, body);
    return json(r.ok ? { ok: true } : { error: r.error }, r.status);
  }
  return json({ error: 'Not found' }, 404);
}

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return json({ ok: true });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!(await adminAuthorized(request, env))) return json({ error: 'Unauthorized' }, 401);

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

/**
 * Structured, secret-free log line for an unhandled exception (§24 policy:
 * never log authorization headers, tokens or key material). Returns the
 * correlation ref echoed to the client for cross-referencing with `wrangler tail`.
 */
function logUnhandled(url: URL, request: Request, err: unknown): string {
  const cfRay = request.headers.get('cf-ray') || '';
  let ref = cfRay;
  if (!ref) {
    try {
      ref = crypto.randomUUID();
    } catch {
      ref = 'no-ref';
    }
  }
  const error_class = err instanceof Error && err.name ? err.name : 'Error';
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'zarlino-website',
      event: 'unhandled_exception',
      route: url.pathname,
      method: request.method,
      error_class,
      ref,
    }),
  );
  return ref;
}

/* -------------------------------------------------------------------------- */
/* Verified release assets (private R2 bucket `zarlino-releases`)             */
/* -------------------------------------------------------------------------- */

/**
 * Website product assets are consumed ONLY from the verified release published
 * by the plugin release gate (tools/release/publish-release.mjs). The manifest
 * pointer `releases/<product>/latest.json` lists every published object; a
 * request is served only when its resolved path appears in that list, so
 * unpublished keys can never be fetched. Stable alias URLs (installer.exe,
 * vst3.zip, standalone.zip, screenshot.png, manifest.json) and direct file
 * names both resolve through the pointer - which is also the rollback handle
 * (repoint the pointer to restore a previous verified release).
 */
const RELEASE_PRODUCTS = new Set(['ztame']);
const RELEASE_CACHE_MS = 60 * 1000;

interface ReleaseFile { path: string; sha256: string; bytes: number; }
interface ReleasePointer {
  product: string; version: string; commit: string; publishedAt: string;
  prefix: string; manifest: string; files: ReleaseFile[];
}
interface ReleaseExample {
  render?: Record<string, { file?: string } | undefined>;
  web?: Record<string, { file?: string } | undefined>;
}
interface ReleaseManifest {
  version?: string; commit?: string;
  artifacts?: Record<string, { file?: string } | undefined>;
  media?: { heroScreenshot?: { file?: string } };
  audioExamples?: ReleaseExample[];
}
const releaseCache = new Map<string, { at: number; pointer: ReleasePointer; manifest: ReleaseManifest }>();

function releaseAlias(manifest: ReleaseManifest, name: string): string | null {
  const a = manifest.artifacts ?? {};
  switch (name) {
    case 'installer.exe':
      return a.installer?.file ?? null;
    case 'vst3.zip':
      return a.vst3?.file ?? null;
    case 'standalone.zip':
      return a.standalone?.file ?? null;
    case 'screenshot.png':
      return manifest.media?.heroScreenshot?.file ?? null;
    case 'manifest.json':
      return 'release-manifest.json';
    default:
      return null;
  }
}

function releaseContentType(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    exe: 'application/octet-stream', zip: 'application/zip', png: 'image/png',
    wav: 'audio/wav', mp3: 'audio/mpeg', json: 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}

async function loadReleaseLatest(env: Env, product: string) {
  if (!env.RELEASES) return null;
  const cacheKey = product + ':latest';
  const hit = releaseCache.get(cacheKey);
  if (hit && Date.now() - hit.at < RELEASE_CACHE_MS) return hit;
  const pObj = await env.RELEASES.get(`releases/${product}/latest.json`);
  if (!pObj) return null;
  const pointer = await pObj.json<ReleasePointer>();
  if (!pointer?.prefix || !Array.isArray(pointer.files)) return null;
  const mObj = await env.RELEASES.get(`${pointer.prefix}/${pointer.manifest || 'release-manifest.json'}`);
  if (!mObj) return null;
  const manifest = await mObj.json<ReleaseManifest>();
  const entry = { at: Date.now(), pointer, manifest };
  releaseCache.set(cacheKey, entry);
  return entry;
}

async function handleReleaseApi(env: Env, product: string): Promise<Response> {
  if (!RELEASE_PRODUCTS.has(product)) return json({ error: 'Not found' }, 404);
  if (!env.RELEASES) {
    return json({ error: 'Release storage not bound', product, storageBound: false }, 503);
  }
  const latest = await loadReleaseLatest(env, product);
  if (!latest) {
    const probe = await env.RELEASES.head(`releases/${product}/latest.json`);
    return json(
      { error: 'No verified release published', product, storageBound: true, pointerFound: !!probe },
      503,
    );
  }
  return json({
    ...latest.manifest,
    publish: { publishedAt: latest.pointer.publishedAt, prefix: latest.pointer.prefix },
  });
}

async function handleReleaseRequest(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!env.RELEASES) {
    return new Response('Release storage not bound', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const m = url.pathname.match(/^\/releases\/([a-z0-9-]+)\/(.+)$/);
  if (!m) return new Response('Not found', { status: 404 });
  const product = m[1]!;
  if (!RELEASE_PRODUCTS.has(product)) return new Response('Not found', { status: 404 });

  let rel: string;
  try {
    rel = decodeURIComponent(m[2]!);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!rel.startsWith('latest/')) return new Response('Not found', { status: 404 });
  rel = rel.slice('latest/'.length);
  if (!rel || rel.includes('..') || rel.startsWith('/')) {
    return new Response('Not found', { status: 404 });
  }

  const latest = await loadReleaseLatest(env, product);
  if (!latest) {
    return new Response('No published release', { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  const target = releaseAlias(latest.manifest, rel) ?? rel;
  if (!latest.pointer.files.some((f) => f.path === target)) {
    return new Response('Not found', { status: 404 });
  }

  const key = `${latest.pointer.prefix}/${target}`;
  const headers: Record<string, string> = {
    'content-type': releaseContentType(target),
    'cache-control': 'public, max-age=300, s-maxage=600',
  };

  if (request.method === 'HEAD') {
    const head = await env.RELEASES.head(key);
    if (!head) return new Response('Not found', { status: 404 });
    headers['content-length'] = String(head.size);
    headers.etag = head.httpEtag;
    return new Response(null, { status: 200, headers });
  }

  const obj = await env.RELEASES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  headers['content-length'] = String(obj.size);
  headers.etag = obj.httpEtag;
  return new Response(obj.body, { status: 200, headers });
}

async function handleRequest(request: Request, url: URL, env: Env): Promise<Response> {
  // Plugin Factory customer API. It has its own authentication (customer
  // accounts), its own stores (Durable Objects) and its own rate limits; it
  // never consults the admin/founder credential above.
  if (url.pathname.startsWith('/api/factory/')) {
    return handleFactoryApi(request, env, url);
  }
  if (url.pathname === '/api/license') {
    return handleLicense(request, env);
  }
  if (url.pathname === '/api/feedback') {
    return handleFeedback(request, env);
  }
  if (url.pathname === '/api/track') {
    return handleTrack(request, env);
  }
  if (url.pathname === '/api/health') {
    return handleHealth(env);
  }
  if (url.pathname === '/api/ready') {
    return handleReady(request, env);
  }
  if (url.pathname === '/api/contract') {
    return json(contract);
  }
  const releaseApi = url.pathname.match(/^\/api\/release\/([a-z0-9-]+)$/);
  if (releaseApi) {
    return handleReleaseApi(env, releaseApi[1]!);
  }
  if (url.pathname === '/api/admin/stats') {
    return handleAdminStats(request, env);
  }
  // Server-side reachability probe for the Executive OS. The OS's own
  // external monitor cannot fetch the OS custom domain from inside the OS
  // worker (self-fetch rotates back to itself → 522), so it probes the OS
  // THROUGH this worker instead. 200 = OS healthy, 502 = unreachable.
  if (url.pathname === '/api/probe-exec-os') {
    try {
      const r = await fetch('https://os.zarlinoaudio.com/api/health', { redirect: 'follow' });
      return new Response(r.ok ? 'probe-ok' : 'probe-fail', { status: r.ok ? 200 : 502 });
    } catch {
      return new Response('probe-fail', { status: 502 });
    }
  }
  const adminAuth = url.pathname.match(/^\/api\/admin\/(status|setup|login|logout|change-password)$/);
  if (adminAuth) {
    return handleAdminAuthRoute(adminAuth[1]!, request, env);
  }
  // Verified release assets: served ONLY from the published pointer's file
  // list (see the release block above). Unknown keys are a controlled 404.
  if (url.pathname.startsWith('/releases/')) {
    return handleReleaseRequest(request, env, url);
  }
  // Unknown /api/* paths must be a JSON 404 — never fall through to the
  // static asset handler (POSTs there surfaced as 1101 worker exceptions).
  if (url.pathname.startsWith('/api/')) {
    return json({ error: 'Not found', path: url.pathname }, 404);
  }
  // Defensive fallback: non-API paths are handled by the platform asset router
  // BEFORE this Worker runs (wrangler.toml [assets] run_worker_first = ["/api/*"]),
  // so this branch is normally unreachable. If it is ever reached (routing
  // misconfiguration), serve what the asset layer can and otherwise return a
  // controlled 404 — never an uncaught exception.
  if (env.ASSETS) {
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      /* fall through to the controlled 404 below */
    }
  }
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      return await handleRequest(request, url, env);
    } catch (err) {
      // TOP-LEVEL FAILURE BOUNDARY — Cloudflare 1101 is never acceptable.
      const ref = logUnhandled(url, request, err);
      if (url.pathname.startsWith('/api/')) {
        return json({ error: 'Internal error', ref }, 500);
      }
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
