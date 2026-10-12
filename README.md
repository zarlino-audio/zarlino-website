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


