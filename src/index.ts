/**
 * Zarlino Audio — Website Worker
 *
 * Serves the static Astro build via the [assets] binding and exposes:
 *   POST /api/license   — issues a signed license key per plugin (ZTame, ZScorch)
 *   POST /api/feedback  — files feedback issues to the zarlino-feedback repo
 *   POST /api/track     — records page-view counters (KV)
 *   POST /api/affiliates/enrol — captures an affiliate application (KV)
 *   GET  /api/admin/stats — token-gated admin dashboard + site monitoring
 */
