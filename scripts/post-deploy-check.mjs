#!/usr/bin/env node
/**
 * Zarlino Audio — POST-DEPLOY ACCEPTANCE GATE (contract-driven)
 * =====================================================================
 * THE authoritative external verification of https://zarlinoaudio.com.
 *
 * WHY THIS GATE EXISTS (history, 2026-10)
 *   The site spent weeks answering Cloudflare 1101 (uncaught Worker exception)
 *   on every path that was not a direct asset: /about, /contact, /shop,
 *   /sitemap.xml and any unknown path. Earlier gates either queried a stale
 *   route list from a superseded site architecture or wrapped a provenance
 *   check that required the deploy workflow to ALREADY be successful — while
 *   the same gate was the step that decided whether the deploy workflow was
 *   successful. That circular condition made "successful deploy" unreachable
 *   and production froze on an old artifact while every run reported failure.
 *
 * WHAT THIS GATE DOES NOW
 *   - Consumes the ONE machine-readable route contract: routes/contract.json.
 *     No route list is maintained here. Monitoring conforms to the product
 *     architecture; the architecture does not bend to please monitoring.
 *   - Asserts EXACT status equality only (=== 200 / === 404 / === 307 / === 405).
 *     assert(status < 500) is FORBIDDEN and will throw if ever called.
 *   - Verifies PRODUCTION IDENTITY: GET /api/health must report the git commit
 *     that CI intended to deploy (EXPECTED_SHA from the workflow context).
 *     Production SHA != intended SHA is PRODUCTION_DRIFT — never a pass.
 *   - Runs the FULL sweep N=3 times (flap rule): a route may only be PASS/FAIL
 *     if it classified identically in every sweep. Divergence => NON_DETERMINATE.
 *
 * WHAT THIS GATE DOES *NOT* DO
 *   - It does not require any previous deploy run to have succeeded, and it
 *     does not query the GitHub API. Provenance is (a) the CI context that
 *     invoked it (workflow_run head_sha / github.sha) and (b) the live
 *     /api/health identity of the running deployment.
 *
 * USAGE   node scripts/post-deploy-check.mjs [BASE_URL]
 * ENV     BASE_URL                 default https://zarlinoaudio.com
 *         EXPECTED_SHA             intended production git SHA (CI provides)
 *         EXPECTED_RUN_ID          intended deploy run id (informational)
 *         SETTLE_MS                initial settle delay (default 0)
 *         IDENTITY_WAIT_MS         max wait for production SHA to match (default 60000)
 *         FLAP_CONSECUTIVE_N       sweeps required (default 3)
 *         SWEEP_DELAY_MS           delay between sweeps (default 5000)
 *         REQUEST_TIMEOUT_MS       per-request timeout (default 15000)
 *         GATE_LOCAL               "1" = localhost mode (identity not asserted;
 *                                  refused for non-localhost BASE_URL)
 *         GATE_ARTIFACT_FILE       acceptance record path override
 *
 * EXIT    0 VERIFIED  ·  1 FAILED  ·  3 DRIFT / UNKNOWN  ·  4 NON_DETERMINATE
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE_REVISION = '4.0.0+contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_FILE = join(HERE, '..', 'routes', 'contract.json');
const ARTIFACT_FILE =
  process.env.GATE_ARTIFACT_FILE || join(HERE, '.post-deploy-check-acceptance.json');

const EXIT_VERIFIED = 0;
const EXIT_FAILED = 1;
const EXIT_DRIFT = 3;
const EXIT_NON_DETERMINATE = 4;

/* ------------------------------------------------------------------ config */

const DEFAULT_BASE_URL = 'https://zarlinoaudio.com';
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 0);
const IDENTITY_WAIT_MS = Number(process.env.IDENTITY_WAIT_MS ?? 60000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);
const FLAP_CONSECUTIVE_N = Number(process.env.FLAP_CONSECUTIVE_N ?? 3);
const SWEEP_DELAY_MS = Number(process.env.SWEEP_DELAY_MS ?? 5000);

const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const EXPECTED_RUN_ID = (process.env.EXPECTED_RUN_ID || '').trim() || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const log = (...a) => console.log(...a);

function resolveBaseUrl() {
  const arg = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
  const raw = arg || process.env.BASE_URL || DEFAULT_BASE_URL;
  try {
    return new URL(raw).href.replace(/\/$/, '');
  } catch {
    console.error('FATAL: invalid base URL: ' + raw);
    process.exit(EXIT_FAILED);
  }
}

const BASE_URL = resolveBaseUrl();
const IS_LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(new URL(BASE_URL).hostname);
const LOCAL_MODE = process.env.GATE_LOCAL === '1' && IS_LOCAL_HOST;

/* ---------------------------------------------------------------- contract */

function loadContract() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONTRACT_FILE, 'utf8'));
  } catch (err) {
    console.error('FATAL: cannot read route contract at ' + CONTRACT_FILE + ': ' + err.message);
    process.exit(EXIT_FAILED);
  }
  if (raw.schemaVersion !== 1 || raw.service !== 'zarlino-website') {
    console.error('FATAL: unsupported contract schema (schemaVersion=' + raw.schemaVersion + ')');
    process.exit(EXIT_FAILED);
  }
  const seen = new Set();
  for (const cls of ['required', 'redirect', 'absent', 'api', 'artifacts']) {
    if (!Array.isArray(raw[cls])) {
      console.error('FATAL: contract missing array: ' + cls);
      process.exit(EXIT_FAILED);
    }
    for (const e of raw[cls]) {
      if (typeof e.path !== 'string' || !e.path.startsWith('/')) {
        console.error('FATAL: invalid contract entry path in ' + cls + ': ' + JSON.stringify(e));
        process.exit(EXIT_FAILED);
      }
      if (seen.has(e.path)) {
        console.error('FATAL: duplicate contract path: ' + e.path);
        process.exit(EXIT_FAILED);
      }
      seen.add(e.path);
      if (typeof e.status !== 'number') {
        console.error('FATAL: non-numeric expected status for ' + e.path);
        process.exit(EXIT_FAILED);
      }
    }
  }
  return raw;
}

const contract = loadContract();

/** Flatten the contract into probe entries with a class tag. */
const ENTRIES = [
  ...contract.required.map((e) => ({ cls: 'required', ...e })),
  ...contract.redirect.map((e) => ({ cls: 'redirect', ...e })),
  ...contract.absent.map((e) => ({ cls: 'absent', ...e })),
  ...contract.api.map((e) => ({ cls: 'api', ...e })),
  ...contract.artifacts.map((e) => ({ cls: 'artifacts', method: e.method || 'HEAD', ...e })),
];

const IDENTITY_ENTRY = ENTRIES.find((e) => e.cls === 'api' && e.identity === true) || null;

/* -------------------------------------------------------------- assertions */

/** Exact-equality assertion. Every assertion in this gate uses this. */
function assertExact(actual, expected) {
  return actual === expected;
}

/**
 * assert(status < 500) is FORBIDDEN: it would let a route that must be 200
 * silently become 404/3xx and still "pass". Kept only so this file documents
 * the ban and any caller is audited at runtime.
 */
function assertUnder500() {
  throw new Error('assert(status < 500) is FORBIDDEN by the acceptance standard');
}

/** Content-Type must START WITH one of the given prefixes (the HTML-fallback trap). */
function contentTypeOk(probeResult, prefixes) {
  if (!prefixes || prefixes.length === 0) return true;
  const base = probeResult.contentTypeBase || '';
  return prefixes.some((p) => base.startsWith(p));
}

/* -------------------------------------------------------------- HTTP layer */

/** Probe with exact status capture. GET by default; HEAD for artifacts. */
async function probe(path, method = 'GET', timeoutMs = REQUEST_TIMEOUT_MS) {
  const url = new URL(path, BASE_URL).href;
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body = '';
    if (method !== 'HEAD') {
      body = await res.text();
    }
    const rawContentType = res.headers.get('content-type') || '';
    let parsedJson = null;
    let jsonError = null;
    if (rawContentType.includes('application/json')) {
      try {
        parsedJson = JSON.parse(body);
      } catch (err) {
        jsonError = String((err && err.message) || err);
      }
    }
    return {
      url,
      method,
      status: res.status, // EXACT number, never bucketed
      location: res.headers.get('location') || null,
      contentType: rawContentType,
      contentTypeBase: rawContentType.split(';')[0].trim().toLowerCase(),
      bytes: Buffer.byteLength(body || '', 'utf8'),
      json: parsedJson,
      jsonError,
      error: null,
    };
  } catch (err) {
    const message =
      err && err.name === 'TimeoutError'
        ? 'timeout after ' + timeoutMs + 'ms'
        : String((err && err.message) || err);
    return {
      url,
      method,
      status: null,
      location: null,
      contentType: '',
      contentTypeBase: '',
      bytes: 0,
      json: null,
      jsonError: null,
      error: message,
    };
  }
}

const statusLabel = (r) =>
  r.status === null ? 'NETWORK-ERROR(' + (r.error || '') + ')' : String(r.status);

/** Classify one contract observation against its requirement: green | red. */
function classifyEntry(entry, r) {
  if (!assertExact(r.status, entry.status)) return 'red';
  if (entry.cls === 'required' || entry.cls === 'api') {
    if (!contentTypeOk(r, entry.contentTypePrefix)) return 'red';
    if (entry.cls === 'api' && (entry.contentTypePrefix || []).includes('application/json')) {
      if (r.json === null) return 'red';
    }
  }
  if (entry.cls === 'redirect') {
    if (entry.to) {
      const resolved = r.location ? new URL(r.location, BASE_URL).pathname : null;
      if (resolved !== entry.to) return 'red';
    }
  }
  return 'green';
}

/**
 * FLAP RULE: a route may be reported PASS or FAIL only if it classified
 * identically in EVERY sweep. Mixed => FLAP / NON_DETERMINATE — never PASS.
 */
function applyFlapRule(observations) {
  const allGreen = observations.every((o) => o === 'green');
  const allRed = observations.every((o) => o === 'red');
  return { verdict: allGreen ? 'PASS' : allRed ? 'FAIL' : 'FLAP' };
}

/* -------------------------------------------------------------------- main */

async function main() {
  const runStartedAt = nowIso();
  log('=====================================================================');
  log(' ZARLINO POST-DEPLOY ACCEPTANCE GATE  -  rev ' + GATE_REVISION);
  log('=====================================================================');
  log(' base URL           : ' + BASE_URL);
  log(' contract           : ' + CONTRACT_FILE + ' (schema v' + contract.schemaVersion + ')');
  log(' expected SHA       : ' + (EXPECTED_SHA || '(none provided)'));
  log(' expected run id    : ' + (EXPECTED_RUN_ID || '(none)'));
  log(' identity required  : ' + (LOCAL_MODE ? 'NO (local mode)' : 'YES'));
  log(' probe entries      : ' + ENTRIES.length + ' x ' + FLAP_CONSECUTIVE_N + ' sweeps');
  log(' started (UTC)      : ' + runStartedAt);
  log('');

  if (SETTLE_MS > 0) await sleep(SETTLE_MS);

  // ---- identity settle: wait (bounded) for production to report EXPECTED_SHA
  const identityRequired = !LOCAL_MODE;
  const identityObservations = []; // commits observed in the settle window
  if (identityRequired && EXPECTED_SHA && IDENTITY_ENTRY) {
    const deadline = Date.now() + IDENTITY_WAIT_MS;
    log('-- identity settle: waiting up to ' + IDENTITY_WAIT_MS + 'ms for /api/health commit === expected --');
    for (;;) {
      const r = await probe(IDENTITY_ENTRY.path);
      const commit = r.json && typeof r.json.commit === 'string' ? r.json.commit : null;
      if (commit) identityObservations.push(commit);
      if (commit === EXPECTED_SHA) {
        log('  [ok] production reports commit ' + commit);
        break;
      }
      if (Date.now() >= deadline) {
        log('  [WARN] production reports ' + (commit || statusLabel(r)) + ' — expected ' + EXPECTED_SHA +
          ' (settle window expired; full sweeps follow)');
        break;
      }
      await sleep(Math.min(5000, Math.max(1000, deadline - Date.now())));
    }
  } else if (identityRequired) {
    log('-- identity settle skipped (no EXPECTED_SHA provided) — verdict cannot be VERIFIED --');
  } else {
    log('-- identity checks skipped (local mode) --');
  }

  // ---- sweeps -------------------------------------------------------------
  log('');
  log('-- sweeping ' + ENTRIES.length + ' contract entries x ' + FLAP_CONSECUTIVE_N +
    ' sweeps (' + SWEEP_DELAY_MS + 'ms apart) --');
  const sweeps = [];
  const sweepStarted = Date.now();
  for (let i = 0; i < FLAP_CONSECUTIVE_N; i++) {
    const at = nowIso();
    const results = new Map();
    for (const entry of ENTRIES) {
      results.set(entry.path, await probe(entry.path, entry.method || 'GET'));
    }
    sweeps.push({ index: i, at, results });
    if (i < FLAP_CONSECUTIVE_N - 1 && SWEEP_DELAY_MS > 0) await sleep(SWEEP_DELAY_MS);
  }
  const sweepElapsedMs = Date.now() - sweepStarted;
  log('  sweep timestamps : ' + sweeps.map((s) => s.at).join(' , '));
  log('  total sweep time : ' + sweepElapsedMs + 'ms');

  // ---- per-entry flap evaluation -----------------------------------------
  const verdicts = [];
  for (const entry of ENTRIES) {
    const observations = sweeps.map((s) => classifyEntry(entry, s.results.get(entry.path)));
    const { verdict } = applyFlapRule(observations);
    const last = sweeps[sweeps.length - 1].results.get(entry.path);
    verdicts.push({
      cls: entry.cls,
      path: entry.path,
      method: entry.method || 'GET',
      expected: entry.status,
      expectedTo: entry.to,
      observations,
      verdict,
      lastStatus: last.status,
      lastLocation: last.location,
      lastContentType: last.contentType,
      lastError: last.error,
    });
  }

  for (const v of verdicts) {
    const tags = v.observations.map((o) => (o === 'green' ? 'G' : 'R')).join('');
    const tag = v.verdict === 'PASS' ? 'PASS' : v.verdict === 'FAIL' ? 'FAIL' : 'FLAP/NON_DETERMINATE';
    log('   ' + v.cls.padEnd(9) + ' ' + v.path.padEnd(52) + ' sweeps=' + tags +
      ' expected=' + v.expected + (v.expectedTo ? ' -> ' + v.expectedTo : '') +
      ' -> ' + tag +
      (v.verdict === 'FAIL'
        ? ' (last ' + statusLabel({ status: v.lastStatus, error: v.lastError }) +
          (v.lastLocation ? ', loc=' + v.lastLocation : '') + ')'
        : ''));
  }

  const anyFlap = verdicts.some((v) => v.verdict === 'FLAP');
  const anyRed = verdicts.some((v) => v.verdict === 'FAIL');

  // ---- identity verdict ---------------------------------------------------
  const identityLast = IDENTITY_ENTRY
    ? sweeps[sweeps.length - 1].results.get(IDENTITY_ENTRY.path)
    : null;
  const productionSha =
    identityLast && identityLast.json && typeof identityLast.json.commit === 'string'
      ? identityLast.json.commit
      : null;
  const productionRunId =
    identityLast && identityLast.json && typeof identityLast.json.runId === 'string'
      ? identityLast.json.runId
      : null;
  const productionDeployedAt =
    identityLast && identityLast.json && typeof identityLast.json.deployedAt === 'string'
      ? identityLast.json.deployedAt
      : null;

  const allObservedCommits = new Set();
  for (const s of sweeps) {
    if (!IDENTITY_ENTRY) break;
    const r = s.results.get(IDENTITY_ENTRY.path);
    if (r) {
      allObservedCommits.add(
        r.json && typeof r.json.commit === 'string' ? r.json.commit : '<unreadable>',
      );
    }
  }
  for (const c of identityObservations) allObservedCommits.add(c);

  let identityStatus; // ok | local | unknown | drift | flap
  let identityReason;
  if (LOCAL_MODE) {
    identityStatus = 'local';
    identityReason = 'local mode: identity not asserted';
  } else if (anyFlap || allObservedCommits.size > 1) {
    identityStatus = 'flap';
    identityReason =
      'production identity changed between observations: ' + [...allObservedCommits].join(', ');
  } else if (!EXPECTED_SHA) {
    identityStatus = 'unknown';
    identityReason = 'no EXPECTED_SHA provided — intended production identity unknown';
  } else if (productionSha === EXPECTED_SHA) {
    identityStatus = 'ok';
    identityReason = 'production /api/health commit matches the intended deploy';
  } else {
    identityStatus = 'drift';
    identityReason =
      'production commit ' + (productionSha || '(unreadable)') + ' != intended ' + EXPECTED_SHA;
  }

  // ---- overall verdict ----------------------------------------------------
  let overall;
  let exitCode;
  if (anyFlap || identityStatus === 'flap') {
    overall = 'NON_DETERMINATE';
    exitCode = EXIT_NON_DETERMINATE;
  } else if (anyRed) {
    overall = 'FAILED';
    exitCode = EXIT_FAILED;
  } else if (identityStatus === 'drift') {
    overall = 'PRODUCTION_DRIFT';
    exitCode = EXIT_DRIFT;
  } else if (identityStatus === 'unknown') {
    overall = 'UNKNOWN';
    exitCode = EXIT_DRIFT;
  } else {
    overall = 'VERIFIED';
    exitCode = EXIT_VERIFIED;
  }

  const failing = verdicts.filter((v) => v.verdict !== 'PASS').map((v) => v.cls + ':' + v.path);

  log('');
  log('=====================================================================');
  log(' RESULT');
  log('---------------------------------------------------------------------');
  log(' production SHA   : ' + (productionSha || '(unreadable)'));
  log(' expected SHA     : ' + (EXPECTED_SHA || '(none)'));
  log(' identity         : ' + identityStatus.toUpperCase() + ' — ' + identityReason);
  log(' failing entries  : ' + (failing.length ? failing.join(', ') : '(none)'));
  log('---------------------------------------------------------------------');
  log(' OVERALL STATUS   : ' + overall);
  log(' EXIT CODE        : ' + exitCode);
  log('=====================================================================');

  // ---- acceptance record (citable provenance) -----------------------------
  const record = {
    gate: 'post-deploy-check',
    revision: GATE_REVISION,
    contract: { file: 'routes/contract.json', schemaVersion: contract.schemaVersion },
    baseUrl: BASE_URL,
    localMode: LOCAL_MODE,
    // (a) intended deploy
    expectedSha: EXPECTED_SHA || null,
    expectedRunId: EXPECTED_RUN_ID,
    githubSha: process.env.GITHUB_SHA || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    // (b) observed production identity
    productionSha,
    productionRunId,
    productionDeployedAt,
    // (c) observations
    runStartedAt,
    runFinishedAt: nowIso(),
    sweepTimestamps: sweeps.map((s) => s.at),
    sweepCount: sweeps.length,
    sweepElapsedMs,
    identity: { status: identityStatus, reason: identityReason },
    overallStatus: overall,
    exitCode,
    // (d) per-entry results
    entries: verdicts.map((v) => ({
      cls: v.cls,
      path: v.path,
      method: v.method,
      expected: v.expected,
      expectedTo: v.expectedTo || null,
      verdict: v.verdict,
      perSweepStatuses: v.observations,
      lastStatus: v.lastStatus,
      lastContentType: v.lastContentType,
      lastError: v.lastError,
    })),
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
  process.exit(EXIT_FAILED);
});
