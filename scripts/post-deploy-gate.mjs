#!/usr/bin/env node
/**
 * Zarlino Audio - POST-DEPLOY GATE (path-agnostic 1101 acceptance set A1-A4)
 * ============================================================================
 * SUPERSEDES the #12 / #21 survivor-list style gate. Encodes the path-agnostic
 * acceptance set A1-A4 plus a provenance PRECONDITION (A4) and a hard FLAP RULE,
 * so the gate is *incapable* of certifying the Cloudflare 1101 outage as fixed
 * while the serving artifact is unchanged.
 *
 *   A1 NEGATIVE  : GET /nonexistent-404-probe MUST be EXACTLY 404.
 *                  FAIL on any 2xx / 3xx / 5xx. assert(status === 404).
 *   A2 SITEMAP   : GET /sitemap.xml MUST be EXACTLY 200 AND Content-Type MUST
 *                  match /xml/i. FAIL otherwise.
 *   A3 REQUIRED-200: GET each of
 *                    /  /plugins  /plugins/  /checkout  /admin
 *                    /plugins/ztame  /plugins/zscorch  /about  /contact  /shop
 *                  MUST be EXACTLY 200. assert(status === 200).
 *                  assert(status < 500) is FORBIDDEN -- a route that must be
 *                  200 must not silently become 404/3xx and still pass.
 *   A4 PROVENANCE PRECONDITION: query the GitHub API for the latest SUCCESSFUL
 *                  run of workflow "Deploy to Cloudflare Workers" on branch
 *                  main. If that run's created_at is NOT strictly after the
 *                  floor 2026-09-08T11:23:35Z, the gate MUST report
 *                  status=BLOCKED and exit 2 (distinct exit code).
 *                  NO DEPLOY => NO FIX. It must NEVER report PASS in that case,
 *                  even if every probe is green.
 *
 * WHY A4 EXISTS
 * ----------------------------------------------------------------------------
 * Latest successful "Deploy to Cloudflare Workers" on main was
 * 2026-09-08T11:23:35Z (run 34220441989 -- stale). The serving artifact is
 * UNCHANGED since 2026-08-29 when /plugins was measured at 500. So a green
 * reading of /plugins today is a SERVING FLAP on an unchanged artifact, NOT a
 * fix. A gate that reports PASS on a green subset without a fresh deploy
 * certifies the outage as fixed while it continues. This gate refuses to.
 *
 * FLAP RULE (hard requirement)
 * ----------------------------------------------------------------------------
 * State file scripts/.post-deploy-gate-state.json records recent sweep results
 * per path, KEYED BY THE DEPLOY SHA verified against. A path may only CHANGE
 * status (green->red or red->green) after >= 3 CONSECUTIVE identical sweeps
 * within the SAME deploy SHA. A green subset on an unchanged artifact is a
 * FLAP, never a fix. Single-sweep greens are INSUFFICIENT (n < 3), never PASS.
 *
 * ACCEPTANCE RECORD
 * ----------------------------------------------------------------------------
 * Each run writes a JSON artifact embedding: deploy SHA (github.sha / verified
 * run's head_sha), the run timestamp verified against, and per-path status
 * plus sweep-count n. This is the citable acceptance record.
 *
 * USAGE
 *   node scripts/post-deploy-gate.mjs
 *   BASE_URL=https://zarlinoaudio.com node scripts/post-deploy-gate.mjs
 *
 * Exit codes: 0 = PASS, 1 = FAIL, 2 = BLOCKED (A4 provenance not met).
 * Requires Node 18+ (global fetch). No third-party dependencies.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE_REVISION = '2.0.0+#1101-acceptance-A1A4';

/* ==========================================================================
 * 1. CONFIG - the acceptance set, fixed literals (no survivor snapshot)
 * ========================================================================== */

const REQUIRED_200 = [
  '/',
  '/plugins',
  '/plugins/',
  '/checkout',
  '/admin',
  '/plugins/ztame',
  '/plugins/zscorch',
  '/about',
  '/contact',
  '/shop',
];

const NEGATIVE_PATH = '/nonexistent-404-probe';
const SITEMAP_PATH = '/sitemap.xml';

const DEFAULT_BASE_URL = 'https://zarlinoaudio.com';
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 5000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);
const VERBOSE = process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';

// A4 provenance
const PROVENANCE_FLOOR = process.env.PROVENANCE_FLOOR || '2026-09-08T11:23:35Z';
const GATE_WORKFLOW = process.env.GATE_WORKFLOW || 'Deploy to Cloudflare Workers';
const GATE_WORKFLOW_BRANCH = process.env.GATE_WORKFLOW_BRANCH || 'main';
const GATE_REPO =
  process.env.GATE_REPO || process.env.GITHUB_REPOSITORY || 'zarlino-audio/zarlino-website';

// Flap rule / freshness
const FLAP_CONSECUTIVE_N = Number(process.env.FLAP_CONSECUTIVE_N ?? 3);
const FRESHNESS_WINDOW_MS = Number(process.env.FRESHNESS_WINDOW_MS ?? 6 * 60 * 60 * 1000);

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_FILE =
  process.env.GATE_STATE_FILE || join(HERE, '.post-deploy-gate-state.json');
const ARTIFACT_FILE =
  process.env.GATE_ARTIFACT_FILE || join(HERE, '.post-deploy-gate-acceptance.json');

/* ==========================================================================
 * 2. HELPERS
 * ========================================================================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function log(...a) {
  console.log(...a);
}
function vlog(...a) {
  if (VERBOSE) console.log(...a);
}

/** Exact-equality assertion helper - never a range comparison. */
function assertExact(actual, expected) {
  return actual === expected;
}

/** The forbidden weaker check. Present only so callers can be audited. */
function assertUnder500(_status) {
  throw new Error('assert(status < 500) is FORBIDDEN by the #1101 acceptance set');
}

/** green = a path for which we currently observe its REQUIRED status exactly. */
function isGreen(expected, status) {
  return assertExact(status, expected);
}

/* ==========================================================================
 * 3. HTTP LAYER - exact status capture, never a range comparison
 * ========================================================================== */

async function probe(baseUrl, path, timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = new URL(path, baseUrl).href;
  try {
    const res = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    return {
      url,
      status: res.status, // EXACT number
      contentType: res.headers.get('content-type') || '',
      bytes: Buffer.byteLength(body, 'utf8'),
      error: null,
    };
  } catch (err) {
    const message =
      err && err.name === 'TimeoutError'
        ? 'timeout after ' + timeoutMs + 'ms'
        : String((err && err.message) || err);
    return { url, status: null, contentType: '', bytes: 0, error: message };
  }
}

function statusLabel(r) {
  return r.status === null ? 'NETWORK-ERROR(' + (r.error || '') + ')' : String(r.status);
}

/** Content-Type must MATCH /xml/i for the sitemap assertion (A2). */
function isXml(r) {
  return /xml/i.test(r.contentType || '');
}

/* ==========================================================================
 * 4. A4 - PROVENANCE PRECONDITION (GitHub API)
 *
 * Query the latest SUCCESSFUL run of GATE_WORKFLOW on GATE_WORKFLOW_BRANCH.
 * If parse(created_at) is NOT strictly after parse(PROVENANCE_FLOOR), the gate
 * is BLOCKED: no fresh deploy => no fix may be certified.
 * ========================================================================== */

async function fetchLatestSuccessfulDeploy() {
  const api =
    'https://api.github.com/repos/' +
    GATE_REPO +
    '/actions/workflows/' +
    encodeURIComponent('.github/workflows/deploy.yml') +
    '/runs?branch=' +
    encodeURIComponent(GATE_WORKFLOW_BRANCH) +
    '&status=success&per_page=20';

  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'zarlino-post-deploy-gate/' + GATE_REVISION,
    'x-github-api-version': '2022-11-28',
  };
  if (process.env.GATE_TOKEN) headers.authorization = 'Bearer ' + process.env.GATE_TOKEN;

  const res = await fetch(api, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    return {
      ok: false,
      error: 'GitHub API HTTP ' + res.status,
      rateLimited: res.status === 403 || res.status === 429,
      api,
      run: null,
    };
  }
  const data = await res.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  // The API branch+status filter still returns all workflows; match by name.
  const matched = runs.filter((r) => r && r.name === GATE_WORKFLOW && r.conclusion === 'success');
  const chosen = matched[0] || null;
  return { ok: true, error: null, api, run: chosen, matched: matched.length };
}

/** Evaluate A4 given the freshest successful deploy run. Never returns PASS-like true when stale. */
function evaluateProvenance(run, nowMs) {
  if (!run) {
    return {
      status: 'BLOCKED',
      reason: 'no successful "' + GATE_WORKFLOW + '" run found on ' + GATE_WORKFLOW_BRANCH,
      deploySha: process.env.GATE_DEPLOY_SHA || null,
      runAt: null,
      runId: null,
      created_at: null,
      floor: PROVENANCE_FLOOR,
      fresh: false,
      artifactAgeMs: null,
    };
  }
  const created = Date.parse(run.created_at);
  const floor = Date.parse(PROVENANCE_FLOOR);
  // STRICTLY after the floor
  const after = Number.isFinite(created) && Number.isFinite(floor) && created > floor;
  const artifactAgeMs = Number.isFinite(created) ? nowMs - created : null;
  return {
    status: after ? 'PASS' : 'BLOCKED',
    reason: after
      ? 'latest successful main deploy ' +
        run.created_at +
        ' is strictly after floor ' +
        PROVENANCE_FLOOR
      : 'latest successful main deploy ' +
        (run.created_at || '(unknown)') +
        ' is NOT after required floor ' +
        PROVENANCE_FLOOR +
        ' (stale artifact => NO DEPLOY => NO FIX)',
    deploySha: run.head_sha || process.env.GATE_DEPLOY_SHA || null,
    runAt: run.created_at || null,
    runId: run.id || null,
    created_at: run.created_at || null,
    floor: PROVENANCE_FLOOR,
    fresh: after,
    artifactAgeMs,
  };
}

/* ==========================================================================
 * 5. FLAP RULE + STATE
 *
 * State shape (keyed by deploy SHA):
 * {
 *   version: 1,
 *   paths: {
 *     "<path>": {
 *       deploySha: "<sha>",
 *       lastStatus: <number|null>,
 *       consecutive: <n>,          // consecutive identical sweeps for current status
 *       streak: { status, n },     // the running streak
 *       history: [ { at, deploySha, status, expected }... up to 20 ]
 *     }
 *   },
 *   sweeps: [ { at, deploySha, baseUrl } ... up to 50 ]
 * }
 * ========================================================================== */

const EMPTY_STATE = { version: 1, paths: {}, sweeps: [] };

function loadState() {
  if (!existsSync(STATE_FILE)) return structuredClone(EMPTY_STATE);
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return structuredClone(EMPTY_STATE);
    parsed.paths = parsed.paths && typeof parsed.paths === 'object' ? parsed.paths : {};
    parsed.sweeps = Array.isArray(parsed.sweeps) ? parsed.sweeps : [];
    parsed.version = parsed.version || 1;
    return parsed;
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (err) {
    log('  [WARN] could not persist state file ' + STATE_FILE + ': ' + err.message);
  }
}

/**
 * Apply the FLAP RULE for one path.
 *
 * A path may only CHANGE status (green->red or red->green) after
 * >= FLAP_CONSECUTIVE_N consecutive identical sweeps WITHIN THE SAME DEPLOY SHA.
 * A green subset on an unchanged artifact is a FLAP, never a fix.
 *
 * Returns { observation, effective, consecutive, changed, verdict }
 *  - observation: 'green' | 'red'   (what we saw THIS sweep, vs the requirement)
 *  - effective  : the status the gate is allowed to certify ('green'|'red'|'unknown')
 *  - consecutive: how many identical sweeps in a row for `observation` on this SHA
 *  - changed    : true only when a previously-KNOWN effective status flipped, n>=3
 *  - verdict    : 'PASS' | 'INSUFFICIENT' | 'FLAP' | 'FAIL'
 */
/**
 * Apply the FLAP RULE for one path.
 *
 * A path may only CHANGE status (green->red or red->green) after
 * >= FLAP_CONSECUTIVE_N consecutive identical sweeps WITHIN THE SAME DEPLOY SHA.
 * A green subset on an unchanged artifact is a FLAP, never a fix.
 *
 * State per path (keyed by deploy SHA):
 *   { deploySha, consecutive, streak:{status,n}, certified, verdict, history[] }
 *
 * - `consecutive` / `streak` : current run of identical observations on this SHA.
 * - `certified`              : the last status we were ALLOWED to certify
 *                              ('green'|'red'|'unknown'); only updates at n>=N.
 *
 * Returns { observation, consecutive, changed, certified, verdict }
 *  - verdict: 'PASS' | 'INSUFFICIENT' | 'FLAP' | 'FAIL'
 */
function applyFlapRule(state, path, deploySha, observation, expected) {
  const prev = state.paths[path] || null;
  const sameSha = !!prev && prev.deploySha === deploySha;

  // Streak: extend only if the SAME observation continues on the SAME deploy SHA.
  const continued = sameSha && prev.streak && prev.streak.status === observation;
  const consecutive = continued ? prev.streak.n + 1 : 1;
  const streak = { status: observation, n: consecutive };

  // The status we could previously certify. A new deploy SHA resets provenance,
  // but the last certified status on THIS sha is what a change is measured against.
  const certifiedBefore = sameSha ? (prev.certified || 'unknown') : 'unknown';

  // Effective/certified only advances at n >= FLAP_CONSECUTIVE_N.
  let certified = certifiedBefore;
  let changed = false;
  if (consecutive >= FLAP_CONSECUTIVE_N) {
    if (certifiedBefore !== observation) changed = certifiedBefore !== 'unknown';
    certified = observation;
  }

  // Verdict
  let verdict;
  if (observation === 'green') {
    if (consecutive >= FLAP_CONSECUTIVE_N) {
      verdict = 'PASS';
    } else if (certifiedBefore === 'red') {
      // Previously certified red; a <N green is a FLAP, never a fix.
      verdict = 'FLAP';
    } else {
      verdict = 'INSUFFICIENT'; // n < N, nothing certified yet
    }
  } else {
    verdict = 'FAIL';
  }

  const history = sameSha && Array.isArray(prev.history) ? prev.history.slice(-19) : [];
  history.push({ at: nowIso(), deploySha, observation, expected, consecutive });

  state.paths[path] = {
    deploySha,
    consecutive,
    streak,
    certified,
    verdict,
    history,
  };

  return { path, expected, deploySha, observation, consecutive, streak, changed, certified, verdict };
}

/* ==========================================================================
 * 6. RESULT BOOK
 * ========================================================================== */

const checks = [];

function record(id, ok, detail, extra = {}) {
  checks.push({ id, ok, detail, ...extra });
  log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + id + ' - ' + detail);
  return ok;
}

/* ==========================================================================
 * 7. A1 - NEGATIVE
 * ========================================================================== */

async function runA1(baseUrl, results) {
  const r = await probe(baseUrl, NEGATIVE_PATH);
  results.set(NEGATIVE_PATH, r);
  // EXACT equality. 2xx/3xx/5xx all FAIL.
  const ok = assertExact(r.status, 404);
  record(
    'A1 NEGATIVE ' + NEGATIVE_PATH + ' -> 404',
    ok,
    ok
      ? '404 (exact) - ' + r.contentType + ' - ' + r.bytes + 'B'
      : 'expected EXACTLY 404, got ' + statusLabel(r) + ' - ' + r.contentType +
        ' - ' + r.bytes + 'B' +
        (r.status === null ? '' : r.status >= 200 && r.status < 400
          ? ' (2xx/3xx FAIL)'
          : r.status >= 500
            ? ' (5xx FAIL)'
            : ''),
    { assertion: 'A1', path: NEGATIVE_PATH, expected: 404, got: r.status, observation: ok ? 'green' : 'red' }
  );
  return { r, ok };
}

/* ==========================================================================
 * 8. A2 - SITEMAP (200 AND Content-Type /xml/i)
 * ========================================================================== */

async function runA2(baseUrl, results) {
  const r = await probe(baseUrl, SITEMAP_PATH);
  results.set(SITEMAP_PATH, r);
  const okStatus = assertExact(r.status, 200);
  const okType = isXml(r);
  const ok = okStatus && okType;
  record(
    'A2 SITEMAP ' + SITEMAP_PATH + ' -> 200 + xml',
    ok,
    ok
      ? '200 (exact) - Content-Type "' + r.contentType + '" matches /xml/i - ' + r.bytes + 'B'
      : 'status=' + statusLabel(r) +
        (okStatus ? ' (200 exact ok)' : ' (expected EXACTLY 200)') +
        ' - Content-Type="' + (r.contentType || '(none)') + '" xml-match=' + okType,
    { assertion: 'A2', path: SITEMAP_PATH, expected: 200, got: r.status, contentType: r.contentType, observation: ok ? 'green' : 'red' }
  );
  return { r, ok };
}

/* ==========================================================================
 * 9. A3 - REQUIRED-200 (exact). assert(status < 500) is FORBIDDEN.
 * ========================================================================== */

async function runA3(baseUrl, results) {
  const perPath = [];
  for (const path of REQUIRED_200) {
    const r = await probe(baseUrl, path);
    results.set(path, r);
    // EXACT equality. A route that must be 200 must not silently be 404/3xx.
    // NOTE: we never call assertUnder500()/`status < 500` here.
    const ok = assertExact(r.status, 200);
    perPath.push({ path, status: r.status, ok });
    record(
      'A3 REQUIRED-200 ' + path + ' -> 200',
      ok,
      ok
        ? '200 (exact) - ' + r.contentType + ' - ' + r.bytes + 'B'
        : 'expected EXACTLY 200, got ' + statusLabel(r) + ' - ' + (r.contentType || '(none)') +
          ' - ' + r.bytes + 'B',
      { assertion: 'A3', path, expected: 200, got: r.status, observation: ok ? 'green' : 'red' }
    );
  }
  const ok = perPath.every((p) => p.ok);
  // Preserve the exact path (trailing slash included) so /plugins and /plugins/
  // are both reported distinctly.
  const failed = perPath.filter((p) => !p.ok).map((p) => p.path);
  return { ok, perPath, failed };
}

/* ==========================================================================
 * 10. A4 - PROVENANCE PRECONDITION runner
 * ========================================================================== */

async function runA4(nowMs) {
  let fetched;
  try {
    fetched = await fetchLatestSuccessfulDeploy();
  } catch (err) {
    fetched = { ok: false, error: String((err && err.message) || err), run: null };
  }
  if (!fetched.ok) {
    record('A4 PROVENANCE', false, 'could not query GitHub API: ' + fetched.error, {
      assertion: 'A4',
      observation: 'red',
    });
    return {
      status: 'BLOCKED',
      reason: 'GitHub API unavailable: ' + fetched.error,
      deploySha: process.env.GATE_DEPLOY_SHA || null,
      runAt: null,
      runId: null,
      created_at: null,
      floor: PROVENANCE_FLOOR,
      fresh: false,
      artifactAgeMs: null,
      error: fetched.error,
    };
  }
  const prov = evaluateProvenance(fetched.run, nowMs);
  const ok = prov.status === 'PASS' && prov.fresh === true;
  record(
    'A4 PROVENANCE latest successful "' +
      GATE_WORKFLOW +
      '" on ' +
      GATE_WORKFLOW_BRANCH +
      ' after ' +
      PROVENANCE_FLOOR,
    ok,
    prov.reason +
      (prov.runId ? ' - run ' + prov.runId : '') +
      (prov.artifactAgeMs !== null
        ? ' - artifact age ' + Math.round(prov.artifactAgeMs / 3600000) + 'h'
        : ''),
    {
      assertion: 'A4',
      observation: ok ? 'green' : 'red',
      runAt: prov.runAt,
      runId: prov.runId,
      deploySha: prov.deploySha,
    }
  );
  return prov;
}

/* ==========================================================================
 * 11. ACCEPTANCE RECORD
 * ========================================================================== */

function writeAcceptanceRecord(recordObj) {
  try {
    mkdirSync(dirname(ARTIFACT_FILE), { recursive: true });
    writeFileSync(ARTIFACT_FILE, JSON.stringify(recordObj, null, 2) + '\n', 'utf8');
    log('  acceptance record -> ' + ARTIFACT_FILE);
  } catch (err) {
    log('  [WARN] could not write acceptance record: ' + err.message);
    return null;
  }
  return ARTIFACT_FILE;
}

function resolveBaseUrl() {
  const arg = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
  const raw = arg || process.env.BASE_URL || DEFAULT_BASE_URL;
  try {
    return new URL(raw).href.replace(/\/$/, '');
  } catch {
    console.error('FATAL: invalid base URL: ' + raw);
    process.exit(1);
  }
}

/* ==========================================================================
 * 12. MAIN
 * ========================================================================== */

async function main() {
  const baseUrl = resolveBaseUrl();
  const startedAt = nowIso();
  const nowMs = Date.now();

  log('=====================================================================');
  log(' ZARLINO POST-DEPLOY GATE  -  rev ' + GATE_REVISION);
  log('=====================================================================');
  log(' base URL        : ' + baseUrl);
  log(' started (UTC)   : ' + startedAt);
  log(' provenance floor: ' + PROVENANCE_FLOOR);
  log(' expected        : A1 FAIL, A2 FAIL, A3 FAIL, A4 BLOCKED => exit 2');
  log(' settle          : ' + SETTLE_MS + 'ms before first probe');
  log(' timeout         : ' + REQUEST_TIMEOUT_MS + 'ms per request');
  log('');

  if (SETTLE_MS > 0) await sleep(SETTLE_MS);

  const results = new Map();

  log('-- A1 negative (exact 404) -----------------------------------------');
  const a1 = await runA1(baseUrl, results);

  log('');
  log('-- A2 sitemap (200 + Content-Type /xml/i) --------------------------');
  const a2 = await runA2(baseUrl, results);

  log('');
  log('-- A3 required-200 (exact 200; <500 is FORBIDDEN) ------------------');
  const a3 = await runA3(baseUrl, results);

  log('');
  log('-- A4 provenance precondition (NO DEPLOY => NO FIX) ----------------');
  const a4 = await runA4(nowMs);
  const deploySha = a4.deploySha || process.env.GATE_DEPLOY_SHA || process.env.GITHUB_SHA || null;

  // ---- FLAP RULE over the deploy SHA -----------------------------------
  const state = loadState();
  const observations = [];
  for (const [path, r] of results.entries()) {
    const expected = path === NEGATIVE_PATH ? 404 : 200;
    const observation = isGreen(expected, r.status) ? 'green' : 'red';
    observations.push(
      applyFlapRule(state, path, deploySha, observation, expected)
    );
  }
  state.sweeps.push({ at: startedAt, deploySha, baseUrl });
  state.sweeps = state.sweeps.slice(-50);
  saveState(state);

  log('');
  log('-- FLAP RULE (change only after >= ' + FLAP_CONSECUTIVE_N + ' identical sweeps on the SAME deploy SHA) --');
  const greenSubsetOnStale = [];
  for (const o of observations) {
    const label =
      (o.observation === 'green' ? 'GREEN' : 'RED  ') +
      ' n=' + o.consecutive +
      '/sweeps on sha ' + String(o.deploySha).slice(0, 10) +
      ' -> ' + o.verdict +
      (o.changed ? ' (status CHANGED)' : '');
    log('   ' + o.path.padEnd(24) + ' ' + label);
    if (o.observation === 'green' && o.verdict !== 'PASS') {
      greenSubsetOnStale.push({ path: o.path, n: o.consecutive, verdict: o.verdict });
    }
  }
  if (greenSubsetOnStale.length > 0) {
    log('   NOTE: ' + greenSubsetOnStale.length +
      ' green path(s) are FLAP/INSUFFICIENT (n<' + FLAP_CONSECUTIVE_N +
      ') on deploy sha ' + String(deploySha).slice(0, 10) +
      ' - a green subset on an unchanged artifact is NEVER recorded as a fix.');
  }

  // ---- FINAL VERDICT ----------------------------------------------------
  const a1Ok = a1.ok;
  const a2Ok = a2.ok;
  const a3Ok = a3.ok;
  const a4Ok = a4.status === 'PASS' && a4.fresh === true;

  // INSUFFICIENT / FLAP verdicts count as NOT passed.
  const allFlapOk = observations.every((o) => o.verdict === 'PASS');
  const anyInsufficient = observations.some(
    (o) => o.verdict === 'INSUFFICIENT' || o.verdict === 'FLAP'
  );

  // The gate may only PASS when A1-A4 hold AND every path has n>=3.
  // A4 BLOCKED always wins: NO DEPLOY => NO FIX, never PASS.
  const canPass = a4Ok && a1Ok && a2Ok && a3Ok && allFlapOk;

  let overall;
  let exitCode;
  if (!a4Ok) {
    // Even if every probe were green, a stale artifact must NEVER PASS.
    overall = 'BLOCKED';
    exitCode = 2;
  } else if (canPass) {
    overall = 'PASS';
    exitCode = 0;
  } else {
    overall = anyInsufficient && a1Ok && a2Ok && a3Ok ? 'INSUFFICIENT' : 'FAIL';
    exitCode = 1;
  }

  log('');
  log('=====================================================================');
  log(' RESULT');
  log('---------------------------------------------------------------------');
  log(' A1 NEGATIVE    : ' + (a1Ok ? 'PASS' : 'FAIL') +
      '  (' + NEGATIVE_PATH + ' = ' + statusLabel(a1.r) + ', required 404)');
  log(' A2 SITEMAP     : ' + (a2Ok ? 'PASS' : 'FAIL') +
      '  (' + SITEMAP_PATH + ' = ' + statusLabel(a2.r) + ', required 200 + xml)');
  log(' A3 REQUIRED-200: ' + (a3Ok ? 'PASS' : 'FAIL') +
      (a3Ok ? '' : '  failing: {' + a3.failed.join(', ') + '}'));
  log(' A4 PROVENANCE  : ' + (a4Ok ? 'PASS' : 'BLOCKED') +
      '  (floor ' + PROVENANCE_FLOOR + ', latest success ' + (a4.created_at || 'n/a') + ')');
  log(' FLAP RULE      : ' + (allFlapOk ? 'PASS (all paths n>=' + FLAP_CONSECUTIVE_N + ')' :
      'NOT SATISFIED (green subset with n<' + FLAP_CONSECUTIVE_N + ' is FLAP/INSUFFICIENT, not a fix)'));
  log('---------------------------------------------------------------------');
  log(' OVERALL STATUS : ' + overall);
  log(' EXIT CODE      : ' + exitCode);
  log('=====================================================================');

  // ---- ACCEPTANCE RECORD (citable) -------------------------------------
  const perPathRecord = {};
  for (const [path, r] of results.entries()) {
    const expected = path === NEGATIVE_PATH ? 404 : 200;
    const obs = observations.find((o) => o.path === path);
    perPathRecord[path] = {
      expected,
      status: r.status,
      contentType: r.contentType,
      observation: obs ? obs.observation : (isGreen(expected, r.status) ? 'green' : 'red'),
      sweepCount: obs ? obs.consecutive : 1,
      verdict: obs ? obs.verdict : 'UNKNOWN',
    };
  }

  const recordObj = {
    gate: 'post-deploy-gate',
    revision: GATE_REVISION,
    baseUrl,
    // deploy SHA + the run timestamp verified against (citable provenance)
    deploySha,
    verifiedAgainstRunAt: a4.runAt,
    verifiedAgainstRunId: a4.runId,
    verifiedFloor: PROVENANCE_FLOOR,
    artifactFresh: a4.fresh,
    artifactAgeMs: a4.artifactAgeMs,
    runTimestamp: startedAt,
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    overallStatus: overall,
    exitCode,
    assertions: {
      A1: { pass: a1Ok, path: NEGATIVE_PATH, required: 404, status: a1.r.status },
      A2: {
        pass: a2Ok,
        path: SITEMAP_PATH,
        required: 200,
        status: a2.r.status,
        contentType: a2.r.contentType,
      },
      A3: { pass: a3Ok, required: 200, failing: a3.failed, perPath: a3.perPath },
      A4: {
        pass: a4Ok,
        status: a4.status,
        reason: a4.reason,
        latestSuccessRunAt: a4.created_at,
        runId: a4.runId,
        floor: PROVENANCE_FLOOR,
        fresh: a4.fresh,
      },
    },
    flapRule: {
      consecutiveThreshold: FLAP_CONSECUTIVE_N,
      allPathsSatisfied: allFlapOk,
      greenSubsetNotCertified: greenSubsetOnStale,
      observations,
    },
    perPath: perPathRecord,
  };

  writeAcceptanceRecord(recordObj);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('FATAL: ' + ((err && err.stack) || err));
  process.exit(1);
});
