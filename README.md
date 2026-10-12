# Zarlino Audio Website

The official Zarlino Audio marketing website — a static Astro 5 + React site deployed to Cloudflare Workers.

## Live site

https://zarlinoaudio.com

## Stack

- **Astro 5** (static output)
- **React 19** components
- **Tailwind CSS**
- GSAP / Three.js for animation
- Cloudflare Workers static assets (GitHub Actions on push to `main`)

## Current offering

- **ZTame** — automatic resonance suppressor (v1.2.0; Windows VST3 / Standalone)
- **ZScorch** — multiband saturation / "scorch" processor (Windows VST3 / Standalone)
- **Vee Properties** — standalone real-estate brand page at `/real-estate` (pre-launch; placeholder contact/listing data)

## Local development

```bash
npm install
npm run dev      # dev server
npm run build    # static build → dist/
npm run preview  # preview the build
```

## Deployment, verification and rollback

State machine — these are different things and must never be conflated:

```
push to main
  └─ Deploy to Cloudflare Workers (deploy.yml)      = BUILD SUCCESS / DEPLOYED
       └─ Post-Deploy Acceptance Gate (post-deploy-gate.yml)  = PRODUCTION VERIFIED
```

- `.github/workflows/deploy.yml` runs `npm ci && npm run build` and deploys
  `dist/` to the `zarlino-website` Worker, stamping the deploy with the git SHA
  (`DEPLOY_COMMIT` / `DEPLOY_RUN_ID` / `DEPLOYED_AT` vars → `GET /api/health`).
  Wrangler upload success means **DEPLOYED — not VERIFIED**.
- `.github/workflows/post-deploy-gate.yml` runs AFTER the deploy workflow
  completes and externally verifies production: every entry of
  `routes/contract.json` (exact status equality, 3-sweep flap rule) plus
  production identity — `/api/health` must report exactly the deployed commit,
  otherwise the verdict is `PRODUCTION_DRIFT`, never a pass. Exit codes:
  `0 VERIFIED · 1 FAILED · 3 DRIFT/UNKNOWN · 4 NON_DETERMINATE`. Nightly at
  03:17 UTC it also runs as a drift/outage sweep with no deploy involved.
  The acceptance record is uploaded as the `post-deploy-acceptance` artifact.
- `routes/contract.json` is the ONE authoritative route contract. The gate, the
  Worker (`GET /api/contract`) and monitoring all consume it. Never maintain a
  second route list — when the site changes, change the contract.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers Scripts edit permission
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

### Local verification

```bash
npm run build
npx wrangler dev --port 8788        # serves dist/ + the Worker locally
BASE_URL=http://127.0.0.1:8788 GATE_LOCAL=1 node scripts/post-deploy-check.mjs
```

`GATE_LOCAL=1` skips the production-identity assertion and is only honored for
localhost URLs.

### Rollback

A bad deployment does not require new code: identify the last VERIFIED version
from the `post-deploy-acceptance` artifact (`productionSha` / `productionRunId`),
then roll the Worker back:

```bash
npx wrangler versions list                  # find the last VERIFIED version id
npx wrangler rollback <version-id>
```

Rollback is complete only after re-running the acceptance gate
(Actions → Post-Deploy Acceptance Gate → Run workflow with the rolled-back SHA)
and confirming `/api/health` reports the restored commit with all contract
entries green.

### Production identity endpoints

- `GET /api/health` — `{ service, status, version, commit, runId, deployedAt }`
  (cheap, unauthenticated, read-only; no secrets). Liveness + identity.
- `GET /api/ready` — capability: `{ required: { staticAssets, licenseSigning },
  optional: { kv, feedbackToken, adminSession } }`; 200 when ready, 503 when
  required capabilities are missing.
- `GET /api/contract` — the canonical route contract as JSON.

## Plugin release assets (private R2, served by the Worker)

Plugin downloads, the canonical screenshot and every demo/listening clip are
**not** stored in this repo or in `public/`. They come from a verified release
published to the private R2 bucket `zarlino-releases` by the plugin release
gate (`zarlino-audio/Zarlino` → `.github/workflows/ztame-release-gate.yml` →
`tools/release/publish-release.mjs`), which refuses to publish anything whose
manifest status is not `verified` and re-downloads every object to compare
SHA-256 hashes before it writes the pointer.

Bucket layout:

```
releases/<product>/latest.json                                  ← publish pointer (the rollback handle)
releases/<product>/<version>/<full-commit>/release-manifest.json
releases/<product>/<version>/<full-commit>/<artifact files>     ← installer / VST3 / standalone / screenshot
releases/<product>/<version>/<full-commit>/audio/*.wav          ← masters + level-matched comparisons
releases/<product>/<version>/<full-commit>/audio/web/*.mp3      ← web listening previews
```

The Worker serves the pointer's file list only (`src/index.ts`):

- `GET|HEAD /releases/<product>/latest/installer.exe|vst3.zip|standalone.zip|screenshot.png|manifest.json`
  are stable aliases resolved through the manifest — pages never hardcode a
  versioned filename, so a new verified release is picked up without a UI change.
- `GET|HEAD /releases/<product>/latest/audio/web/<file>.mp3` streams demo audio.
- A request is answered only when the resolved path appears in the published
  file list; anything else is a controlled `404` (no bucket browsing, no
  unlisted-key access, no path traversal). `405` for other methods, `503` when
  no release has been published yet (with `storageBound` / `pointerFound`
  diagnostics).
- `GET /api/release/<product>` — the published manifest plus
  `publish.publishedAt` / `publish.prefix`. The A/B player
  (`src/components/ABPlayer.tsx`) fetches this and takes titles, origins and
  level-match data from it; if it cannot load, the player says the demos are
  unavailable instead of falling back to a stale file.
- Version-pinned prefixes are stored but **not** routed publicly — the alias
  namespace plus `latest/manifest.json` (which names the exact commit) is the
  entire surface.

Release rollback is a pointer move, not a redeploy: repoint
`releases/<product>/latest.json` at a previously verified version/commit
(`tools/release/rollback-release.mjs` in the plugin repo) and the site serves
that release on the next request.

Local development uses a **simulated** R2 bucket, so release routes answer `503`
until you either seed the local bucket (`npx wrangler r2 object put
zarlino-releases/<key> --local --file <file>`) or run
`npx wrangler dev --remote` to reach the real bucket.


