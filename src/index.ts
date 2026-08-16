export interface Env {
  // Secrets / bindings live here (e.g. DB, KV, secrets).
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zarlino Audio</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0d0d0f; color: #e8e8ea; margin: 0; }
    main { max-width: 720px; margin: 0 auto; padding: 4rem 1.5rem; }
    h1 { letter-spacing: 0.04em; }
    .tagline { color: #9a9aa2; }
  </style>
</head>
<body>
  <main>
    <h1>ZARLINO AUDIO</h1>
    <p class="tagline">The Zarlino website lives here. This page is served from Cloudflare Workers.</p>
    <p>Merge a PR into <code>main</code> and this site updates automatically.</p>
  </main>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response(HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};
