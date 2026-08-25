/** Zarlino Audio — Website Worker
 *
 * Serves the static Astro build via the [assets] binding and exposes:
 *   POST /api/license           — issues a signed license key per plugin (ZTame, ZScorch)
 *   POST /api/feedback          — files feedback issues to the zarlino-feedback repo
 *   POST /api/track             — records page-view counters (KV)
 *   GET  /api/admin/stats       — token-gated admin dashboard + site monitoring
 *   POST /api/affiliates/enrol  — accepts affiliate applications (stored in KV)
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
