#!/usr/bin/env node
/**
 * Zarlino Audio - POST-DEPLOY 1101 ACCEPTANCE GATE (path-agnostic A1-A4)
 * =====================================================================
 * THE single, citable acceptance artifact for the Cloudflare 1101 outage.
 * REPLACES #12's falsified survivor list: #12 asserted only / and /plugins/
 * (two 200s) and FALSELY PASSED while /about, /contact and /shop still 500'd.
 *
 * Sources (single source of truth - issue #30 §3 / #31 amendments A-D):
 *   #30  ADOPTED A1-A4 acceptance set
 *   #31  amendments A / B / C / D (B = provenance, C = flap)
 *   #21  spec (superseded 10-assertion set - weaker; see .#21-10-assert.bak)
 *   #19  spec (superseded parent pair)
 *
 * ASSERTIONS (exact status equality ONLY; assert(status < 500) is FORBIDDEN)
 *   A1 NEGATIVE  GET /nonexistent-404-probe MUST be EXACTLY 404.
 *                FAIL on any 2xx/3xx AND on any >= 500.
 *   A2 SITEMAP   GET /sitemap.xml MUST be EXACTLY 200 AND Content-Type MUST
 *                start with application/xml or text/xml. text/plain or an HTML
 *                fallback MUST FAIL (the "500 fixed into a 200 HTML page" trap).
 *   A3 REQUIRED  These TEN paths MUST ALL be EXACTLY 200 (one failure => whole
 *                set FAIL, non-zero exit):
 *                  /  /plugins  /plugins/  /checkout  /admin
 *                  /plugins/ztame  /plugins/zscorch  /about  /contact  /shop
 *   A4 PRECOND   NOT a probe. Latest SUCCESSFUL "Deploy to Cloudflare Workers"
 *                run on main must exist and run.created_at MUST be STRICTLY
 *                AFTER 2026-09-08T11:23:35Z, else BLOCKED (exit 3). NEVER PASS.
 *                NO DEPLOY => NO FIX.
 *
 * FLAP RULE (issue #29 / #30 §3 / #31 C) - enforced in code
 *   Run the FULL sweep N=3 times (5s apart, bounded < 60s); classify each route
 *   per sweep; only a route IDENTICAL in all 3 sweeps may be PASS/FAIL. Any
 *   divergence => FLAP / NON_DETERMINATE, never PASS, non-zero exit. If A4 is
 *   unmet and A1/A2 read green, that green is FLAP => UNSATISFIED, not DONE.
 *
 * PROVENANCE (issue #30 §3 / #31 B)
 *   The acceptance record embeds the deploy run id + SHA, the run created_at it
 *   was verified against, and the probe sweep timestamps; printed as JSON and
 *   written to a file for task evidence.
 *
 * USAGE: node scripts/post-deploy-check.mjs [BASE_URL]
 * EXIT : 0 PASS · 1 FAIL · 3 BLOCKED (A4) · 4 NON_DETERMINATE (flap)
 * Node 18+ global fetch only. No third-party deps. GET-only probes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE_REVISION = '3.0.0+#1101-acceptance-A1A4';

/* ------------------------------------------------------------------ config */

/** A3 - these ten paths must ALL be EXACTLY 200. */
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

/** A1 - this path must be EXACTLY 404. */
const NEGATIVE_PATH = '/nonexistent-404-probe';

/** A2 - this path must be EXACTLY 200 with an XML Content-Type. */
const SITEMAP_PATH = '/sitemap.xml';

/** A2 - the ONLY acceptable Content-Type prefixes (trap: text/plain|text/html). */
const XML_CONTENT_TYPES = ['application/xml', 'text/xml'];

const DEFAULT_BASE_URL = 'https://zarlinoaudio.com';
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 0);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);

// Flap rule: N consecutive identical sweeps required; total bounded < 60s.
const FLAP_CONSECUTIVE_N = Number(process.env.FLAP_CONSECUTIVE_N ?? 3);
const SWEEP_DELAY_MS = Number(process.env.SWEEP_DELAY_MS ?? 5000);

// A4 provenance
const PROVENANCE_FLOOR = process.env.PROVENANCE_FLOOR || '2026-09-08T11:23:35Z';
const GATE_WORKFLOW = process.env.GATE_WORKFLOW || 'Deploy to Cloudflare Workers';
const GATE_WORKFLOW_BRANCH = process.env.GATE_WORKFLOW_BRANCH || 'main';
const GATE_WORKFLOW_FILE = process.env.GATE_WORKFLOW_FILE || 'deploy.yml';
const GATE_REPO =
  process.env.GATE_REPO || process.env.GITHUB_REPOSITORY || 'zarlino-audio/zarlino-website';
const GATE_TOKEN = process.env.GATE_TOKEN || process.env.GITHUB_TOKEN || '';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_FILE =
  process.env.GATE_ARTIFACT_FILE || join(HERE, '.post-deploy-check-acceptance.json');

/* Exit codes */
const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_BLOCKED = 3;
const EXIT_NON_DETERMINATE = 4;

/* ----------------------------------------------------------------- helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const log = (...a) => console.log(...a);

/** Exact-equality assertion. Every assertion in this gate uses this. */
function assertExact(actual, expected) {
  return actual === expected;
}

/**
 * assert(status < 500) is FORBIDDEN by the #1101 acceptance set: it would let a
 * route that must be 200 silently become 404/3xx and still "pass". Present only
 * so this file documents the ban and any caller is audited at runtime.
 */
function assertUnder500() {
  throw new Error('assert(status < 500) is FORBIDDEN by the #1101 acceptance set');
}

/* -------------------------------------------------------------- HTTP layer */

/** GET-only probe. Exact status capture; never a range comparison. */
async function probe(baseUrl, path, timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = new URL(path, baseUrl).href;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    const rawContentType = res.headers.get('content-type') || '';
    return {
      url,
      status: res.status, // EXACT number, never bucketed
      contentType: rawContentType,
      contentTypeBase: rawContentType.split(';')[0].trim().toLowerCase(),
      bytes: Buffer.byteLength(body, 'utf8'),
      error: null,
    };
  } catch (err) {
    const message =
      err && err.name === 'TimeoutError'
        ? 'timeout after ' + timeoutMs + 'ms'
        : String((err && err.message) || err);
    return {
      url,
      status: null,
      contentType: '',
      contentTypeBase: '',
      bytes: 0,
      error: message,
    };
  }
}

const statusLabel = (r) =>
  r.status === null ? 'NETWORK-ERROR(' + (r.error || '') + ')' : String(r.status);

/** A2: Content-Type must START WITH application/xml or text/xml. */
function isXmlContentType(r) {
  const base = r.contentTypeBase || '';
  return XML_CONTENT_TYPES.some((p) => base.startsWith(p));
}

/* ------------------------------------------------- A4 provenance (GitHub) */

/**
 * Fetch the latest SUCCESSFUL run of GATE_WORKFLOW on GATE_WORKFLOW_BRANCH.
 * Uses the workflow-file endpoint (path-encoded) with status=success so the API
 * performs the filtering; we still defensively match name + conclusion.
 */
async function fetchLatestSuccessfulDeploy() {
  const api =
    'https://api.github.com/repos/' +
    GATE_REPO +
    '/actions/workflows/' +
    encodeURIComponent(GATE_WORKFLOW_FILE) +
    '/runs?branch=' +
    encodeURIComponent(GATE_WORKFLOW_BRANCH) +
    '&status=success&per_page=20';

  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'zarlino-post-deploy-check/' + GATE_REVISION,
    'x-github-api-version': '2022-11-28',
  };
  if (GATE_TOKEN) headers.authorization = 'Bearer ' + GATE_TOKEN;

  try {
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
    const matched = runs.filter(
      (r) => r && r.name === GATE_WORKFLOW && r.conclusion === 'success'
    );
    return { ok: true, error: null, api, run: matched[0] || null, matched: matched.length };
  } catch (err) {
    return {
      ok: false,
      error: String((err && err.message) || err),
      rateLimited: false,
      api,
      run: null,
    };
  }
}

/**
 * Evaluate A4. Returns a status of 'PASS' or 'BLOCKED'. It NEVER returns a
 * PASS-like result when the deploy is stale (created_at not strictly after the
 * floor) or missing: NO DEPLOY => NO FIX.
 */
function evaluateProvenance(run) {
  if (!run) {
    return {
      status: 'BLOCKED',
      reason: 'no successful "' + GATE_WORKFLOW + '" run found on ' + GATE_WORKFLOW_BRANCH,
      deploySha: null,
      runAt: null,
      runId: null,
      created_at: null,
      floor: PROVENANCE_FLOOR,
      fresh: false,
    };
  }
  const created = Date.parse(run.created_at);
  const floor = Date.parse(PROVENANCE_FLOOR);
  const after = Number.isFinite(created) && Number.isFinite(floor) && created > floor;
  return {
    status: after ? 'PASS' : 'BLOCKED',
    reason: after
      ? 'latest successful main deploy ' +
        run.created_at +
        ' is strictly after floor ' +
        PROVENANCE_FLOOR
      : 'latest successful main deploy ' +
        (run.created_at || '(unknown)') +
        ' is NOT strictly after floor ' +
        PROVENANCE_FLOOR +
        ' (stale artifact => NO DEPLOY => NO FIX)',
    deploySha: run.head_sha || null,
    runAt: run.created_at || null,
    runId: run.id || null,
    created_at: run.created_at || null,
    floor: PROVENANCE_FLOOR,
    fresh: after,
  };
}

/* ------------------------------------------------------ flap rule (in-run) */

/**
 * Classify one route's observation for one sweep against its requirement.
 *  - 'green' : the route currently observes exactly its REQUIRED status
 *  - 'red'   : it does not (wrong status, or no response at all)
 * A2 additionally requires an XML Content-Type to be green.
 */
function classifyRoute(route, r) {
  if (route.assertion === 'A1') {
    return assertExact(r.status, 404) ? 'green' : 'red';
  }
  if (route.assertion === 'A2') {
    return assertExact(r.status, 200) && isXmlContentType(r) ? 'green' : 'red';
  }
  // A3
  return assertExact(r.status, 200) ? 'green' : 'red';
}

/**
 * Apply the FLAP RULE across N sweeps.
 *
 * A route may be reported PASS or FAIL ONLY if it classified IDENTICALLY in
 * EVERY one of the N sweeps. If it classified differently in any sweep, verdict
 * is FLAP / NON_DETERMINATE - never PASS.
 *
 * Returns { verdict, observations:[...] } where verdict is one of:
 *   'PASS'  (all sweeps green)  · 'FAIL' (all sweeps red)
 *   'FLAP'  (mixed green/red across sweeps)
 */
function applyFlapRule(route, perSweepObservations) {
  const obs = perSweepObservations; // array of 'green'|'red', length N
  const allGreen = obs.every((o) => o === 'green');
  const allRed = obs.every((o) => o === 'red');
  let verdict;
  if (allGreen) verdict = 'PASS';
  else if (allRed) verdict = 'FAIL';
  else verdict = 'FLAP';
  return { verdict, observations: obs, deterministic: allGreen || allRed };
}

/* ------------------------------------------------------------ route table */

/** The full probe set, in assertion order. A4 is a precondition, not a probe. */
const ROUTES = [
  { assertion: 'A1', path: NEGATIVE_PATH, expected: 404, label: 'A1 NEGATIVE' },
  { assertion: 'A2', path: SITEMAP_PATH, expected: 200, label: 'A2 SITEMAP' },
  ...REQUIRED_200.map((p) => ({ assertion: 'A3', path: p, expected: 200, label: 'A3 REQUIRED-200' })),
];

/** Run ONE sweep of every route; returns Map<path, probeResult>. */
async function runSweep(baseUrl) {
  const results = new Map();
  for (const route of ROUTES) {
    // A2 needs the raw Content-Type; probe() captures it for every route.
    const r = await probe(baseUrl, route.path);
    results.set(route.path, r);
  }
  return results;
}

/**
 * Run the sweep N times (SWEEP_DELAY_MS apart) and flatten into per-route
 * observations. Bounded: N * (sweep time + delay) must stay < 60s.
 */
async function runSweeps(baseUrl, n) {
  const sweeps = [];
  const startedAt = Date.now();
  for (let i = 0; i < n; i++) {
    const sweepStartedAt = nowIso();
    const results = await runSweep(baseUrl);
    sweeps.push({ index: i, at: sweepStartedAt, results });
    if (i < n - 1 && SWEEP_DELAY_MS > 0) await sleep(SWEEP_DELAY_MS);
  }
  const elapsedMs = Date.now() - startedAt;
  return { sweeps, elapsedMs };
}

/* ------------------------------------------------------------------- main */

function resolveBaseUrl() {
  const arg = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
  const raw = arg || process.env.BASE_URL || DEFAULT_BASE_URL;
  try {
    return new URL(raw).href.replace(/\/$/, '');
  } catch {
    console.error('FATAL: invalid base URL: ' + raw);
    process.exit(EXIT_FAIL);
  }
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const runStartedAt = nowIso();
  const budgetStart = Date.now();

  log('=====================================================================');
  log(' ZARLINO POST-DEPLOY 1101 ACCEPTANCE GATE  -  rev ' + GATE_REVISION);
  log('=====================================================================');
  log(' base URL         : ' + baseUrl);
  log(' started (UTC)    : ' + runStartedAt);
  log(' provenance floor : ' + PROVENANCE_FLOOR + ' (run 34220441989)');
  log(' flap rule        : ' + FLAP_CONSECUTIVE_N + ' consecutive identical sweeps');
  log(' expected baseline: A1 FAIL, A2 FAIL, A3 FAIL, A4 BLOCKED => non-zero exit');
  log('');

  if (SETTLE_MS > 0) await sleep(SETTLE_MS);

  // ---- A4 precondition (fetched first: it is the provenance anchor) -------
  log('-- A4 provenance precondition (NO DEPLOY => NO FIX) ------------------');
  const fetched = await fetchLatestSuccessfulDeploy();
  let a4;
  if (!fetched.ok) {
    a4 = evaluateProvenance(null);
    a4.reason = 'could not query GitHub API: ' + fetched.error;
    a4.error = fetched.error;
    log('  [BLOCKED] A4 - ' + a4.reason);
  } else {
    a4 = evaluateProvenance(fetched.run);
    log('  [' + (a4.status === 'PASS' ? 'PASS' : 'BLOCKED') + '] A4 - ' + a4.reason +
      (a4.runId ? ' - run ' + a4.runId : '') +
      (a4.deploySha ? ' - sha ' + String(a4.deploySha).slice(0, 10) : ''));
  }

  const deploySha = a4.deploySha || process.env.GATE_DEPLOY_SHA || process.env.GITHUB_SHA || null;

  // ---- the sweeps --------------------------------------------------------
  log('');
  log('-- sweeping ' + ROUTES.length + ' routes x ' + FLAP_CONSECUTIVE_N +
    ' sweeps (' + SWEEP_DELAY_MS + 'ms apart) ------------------');
  const { sweeps, elapsedMs } = await runSweeps(baseUrl, FLAP_CONSECUTIVE_N);

  const sweepTimestamps = sweeps.map((s) => s.at);
  log('  sweep timestamps: ' + sweepTimestamps.join(' , '));
  log('  total sweep time : ' + elapsedMs + 'ms');
  if (elapsedMs >= 60000) {
    log('  [WARN] sweep budget exceeded 60s (' + elapsedMs + 'ms) - lower SWEEP_DELAY_MS');
  }

  // ---- per-route flap evaluation ----------------------------------------
  const routeVerdicts = [];
  for (const route of ROUTES) {
    const perSweep = sweeps.map((s) => classifyRoute(route, s.results.get(route.path)));
    const flap = applyFlapRule(route, perSweep);
    const last = sweeps[sweeps.length - 1].results.get(route.path);
    routeVerdicts.push({
      assertion: route.assertion,
      path: route.path,
      expected: route.expected,
      expectedContentType: route.assertion === 'A2' ? XML_CONTENT_TYPES : undefined,
      perSweep,
      verdict: flap.verdict,
      deterministic: flap.deterministic,
      lastStatus: last.status,
      lastContentType: last.contentType,
      lastBytes: last.bytes,
      lastError: last.error,
    });
  }

  const anyFlap = routeVerdicts.some((v) => v.verdict === 'FLAP');

  const byAssertion = (id) => routeVerdicts.filter((v) => v.assertion === id);
  const a1v = byAssertion('A1')[0];
  const a2v = byAssertion('A2')[0];
  const a3vs = byAssertion('A3');

  const a1Ok = a1v.verdict === 'PASS';
  const a2Ok = a2v.verdict === 'PASS';
  const a3Ok = a3vs.every((v) => v.verdict === 'PASS');
  const a4Ok = a4.status === 'PASS';

  // ---- print per-route verdicts -----------------------------------------
  log('');
  log('-- per-route verdicts (only identical-in-all-' + FLAP_CONSECUTIVE_N +
    ' routes are PASS/FAIL) ----');
  for (const v of routeVerdicts) {
    const statuses = v.perSweep.map((o) => (o === 'green' ? 'G' : 'R')).join('');
    const tag =
      v.verdict === 'PASS' ? 'PASS' : v.verdict === 'FAIL' ? 'FAIL' : 'FLAP/NON_DETERMINATE';
    log('   ' + v.assertion + ' ' + v.path.padEnd(26) +
      ' sweeps=' + statuses +
      ' observed=' + v.perSweep.join(',') +
      ' -> ' + tag +
      (v.verdict === 'FAIL' ? ' (last ' + statusLabel({ status: v.lastStatus, error: v.lastError }) +
        (v.assertion === 'A2' ? ', ct=' + (v.lastContentType || '(none)') : '') + ')' : ''));
  }

  // ---- amendment C: green-on-stale is FLAP, not a fix -------------------
  // If A4 is unmet and any of A1/A2 reads green, that green is a serving flap on
  // an unchanged artifact => UNSATISFIED, never DONE/PASS.
  const greenOnStale = [];
  if (!a4Ok) {
    for (const v of [a1v, a2v]) {
      if (v.verdict === 'PASS') {
        greenOnStale.push(v.path);
        v.verdict = 'FLAP'; // reclassify: unchanged artifact => serving flap
        v.deterministic = false;
        v.staleFlap = true;
      }
    }
  }

  // ---- overall verdict --------------------------------------------------
  let overall;
  let exitCode;
  if (anyFlap) {
    overall = 'NON_DETERMINATE';
    exitCode = EXIT_NON_DETERMINATE;
  } else if (!a4Ok) {
    // NO DEPLOY => NO FIX: A4 BLOCKED always wins over a green probe subset.
    overall = 'BLOCKED';
    exitCode = EXIT_BLOCKED;
  } else if (a1Ok && a2Ok && a3Ok && a4Ok) {
    overall = 'PASS';
    exitCode = EXIT_PASS;
  } else {
    overall = 'FAIL';
    exitCode = EXIT_FAIL;
  }

  // Note: when a4Ok is false but A1/A2/A3 are also red (the frozen baseline),
  // the gate is BLOCKED (exit 3) - the distinct A4 code - while still printing
  // the per-assertion FAIL/BLOCKED verdicts below.

  const a3Failed = a3vs.filter((v) => v.verdict !== 'PASS').map((v) => v.path);

  log('');
  log('=====================================================================');
  log(' RESULT');
  log('---------------------------------------------------------------------');
  log(' A1 NEGATIVE    : ' + (a1v.verdict === 'PASS' ? 'PASS' : a1v.verdict) +
    '  (' + NEGATIVE_PATH + ' = ' +
    statusLabel({ status: a1v.lastStatus, error: a1v.lastError }) + ', required EXACTLY 404)');
  log(' A2 SITEMAP     : ' + (a2v.verdict === 'PASS' ? 'PASS' : a2v.verdict) +
    '  (' + SITEMAP_PATH + ' = ' +
    statusLabel({ status: a2v.lastStatus, error: a2v.lastError }) +
    ', ct=' + (a2v.lastContentType || '(none)') + ', required 200 + application/xml|text/xml)');
  log(' A3 REQUIRED-200: ' + (a3Ok ? 'PASS' : 'FAIL') +
    (a3Ok ? '  (all ten exactly 200)' : '  failing {' + a3Failed.join(', ') + '}'));
  log(' A4 PROVENANCE  : ' + (a4Ok ? 'PASS' : 'BLOCKED') +
    '  (floor ' + PROVENANCE_FLOOR + ', latest success ' + (a4.created_at || 'n/a') +
    (a4.runId ? ', run ' + a4.runId : '') + ')');
  if (greenOnStale.length) {
    log(' FLAP NOTE      : green-on-stale reclassified as FLAP -> ' + greenOnStale.join(', ') +
      ' (unchanged artifact => serving flap, NOT a fix)');
  }
  log('---------------------------------------------------------------------');
  log(' OVERALL STATUS : ' + overall + (overall === 'PASS' ? ' (DONE)' : ' (NOT DONE)'));
  log(' EXIT CODE      : ' + exitCode);
  if (exitCode !== 0) {
    log(' -> gate FAILS: the outage is NOT accepted as fixed. NO DEPLOY => NO FIX.');
  }
  log('=====================================================================');

  // ---- acceptance record (citable provenance) ---------------------------
  const acceptedProbeSweepTimestamps = sweepTimestamps;
  const record = {
    gate: 'post-deploy-check',
    revision: GATE_REVISION,
    spec: 'issue #30 §3 (ADOPTED A1-A4) + #31 amendments; supersedes #12 survivor list',
    baseUrl,
    // (a) accepted deploy run id + SHA
    deployRunId: a4.runId || null,
    deploySha: deploySha,
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    // (b) the run created_at timestamp this acceptance was verified against
    verifiedAgainstRunCreatedAt: a4.created_at || null,
    verifiedFloor: PROVENANCE_FLOOR,
    artifactFresh: a4.fresh === true,
    // (c) the probe sweep timestamps
    probeSweepTimestamps: acceptedProbeSweepTimestamps,
    sweepCount: sweeps.length,
    runStartedAt,
    runFinishedAt: nowIso(),
    sweepElapsedMs: elapsedMs,
    overallStatus: overall,
    exitCode,
    assertions: {
      A1: {
        pass: a1v.verdict === 'PASS',
        verdict: a1v.verdict,
        path: NEGATIVE_PATH,
        required: 404,
        perSweepStatuses: a1v.perSweep,
        lastStatus: a1v.lastStatus,
      },
      A2: {
        pass: a2v.verdict === 'PASS',
        verdict: a2v.verdict,
        path: SITEMAP_PATH,
        required: 200,
        requiredContentType: XML_CONTENT_TYPES,
        perSweepStatuses: a2v.perSweep,
        lastStatus: a2v.lastStatus,
        lastContentType: a2v.lastContentType,
      },
      A3: {
        pass: a3Ok,
        required: 200,
        failing: a3Failed,
        perPath: a3vs.map((v) => ({
          path: v.path,
          verdict: v.verdict,
          perSweepStatuses: v.perSweep,
          lastStatus: v.lastStatus,
        })),
      },
      A4: {
        pass: a4Ok,
        status: a4.status,
        reason: a4.reason,
        latestSuccessRunAt: a4.created_at,
        runId: a4.runId,
        deploySha: a4.deploySha,
        floor: PROVENANCE_FLOOR,
        fresh: a4.fresh,
        error: a4.error || null,
      },
    },
    flapRule: {
      consecutiveThreshold: FLAP_CONSECUTIVE_N,
      anyFlap,
      greenOnStaleReclassified: greenOnStale,
      routes: routeVerdicts.map((v) => ({
        assertion: v.assertion,
        path: v.path,
        verdict: v.verdict,
        deterministic: v.deterministic,
        perSweepStatuses: v.perSweep,
      })),
    },
    perRoute: Object.fromEntries(
      routeVerdicts.map((v) => [
        v.path,
        {
          assertion: v.assertion,
          expected: v.expected,
          verdict: v.verdict,
          observations: v.perSweep,
          lastStatus: v.lastStatus,
          lastContentType: v.lastContentType,
          lastBytes: v.lastBytes,
          lastError: v.lastError,
        },
      ])
    ),
  };

  try {
    mkdirSync(dirname(ARTIFACT_FILE), { recursive: true });
    writeFileSync(ARTIFACT_FILE, JSON.stringify(record, null, 2) + '\n', 'utf8');
  } catch (err) {
    log('  [WARN] could not write acceptance record: ' + err.message);
  }

  log('');
  log('-- ACCEPTANCE RECORD (JSON) ------------------------------------------');
  log(JSON.stringify(record, null, 2));
  log('-- END ACCEPTANCE RECORD ---------------------------------------------');

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('FATAL: ' + ((err && err.stack) || err));
  process.exit(EXIT_FAIL);
});
