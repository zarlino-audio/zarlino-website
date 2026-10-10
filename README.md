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

## Deployment

Any push to `main` (including merged PRs) triggers `.github/workflows/deploy.yml`,
which runs `npm ci && npm run build` and deploys `dist/` to the `zarlino-website`
Cloudflare Worker.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers Static Assets edit permission
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

