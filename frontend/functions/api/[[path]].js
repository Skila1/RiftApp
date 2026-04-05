/**
 * Cloudflare Pages Function: proxy all `/api/*` to your backend (e.g. cloudflared tunnel URL).
 *
 * Setup:
 * 1. Pages → Settings → Environment variables → add `BACKEND_URL` (production secret), e.g.
 *    `https://your-service-xxxxx.trycloudflare.com` (no trailing slash, no `/api` suffix).
 * 2. Build the SPA with `VITE_API_URL=/api` (and omit `VITE_WS_URL` only if you also proxy `/ws`; otherwise
 *    set `VITE_WS_URL=wss://…` to your tunnel for WebSockets).
 * 3. Backend CORS must allow your `https://<pages>.pages.dev` origin.
 *
 * @param {{ request: Request; env: { BACKEND_URL?: string } }} context
 */
export async function onRequest(context) {
  const backend = context.env.BACKEND_URL;
  if (!backend || typeof backend !== 'string') {
    return new Response(
      'Missing BACKEND_URL: set your tunnel/base URL in Cloudflare Pages → Settings → Variables',
      { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const incoming = new URL(context.request.url);
  const base = backend.replace(/\/+$/, '');
  const dest = new URL(incoming.pathname + incoming.search, `${base}/`);

  const headers = new Headers(context.request.headers);
  headers.delete('Host');

  const init = {
    method: context.request.method,
    headers,
    redirect: 'manual',
  };
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
  }

  return fetch(dest.toString(), init);
}
