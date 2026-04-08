/**
 * Cloudflare Pages Function: proxy `/s3/*` to the backend.
 *
 * This catches any requests for S3 objects that arrive without the /api prefix
 * (e.g. old bookmarks, direct links, URLs that bypassed publicAssetUrl).
 * The backend serves files from S3/R2 on both /s3/* and /api/s3/*.
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

  try {
    const upstream = await fetch(dest.toString(), { method: 'GET', headers, redirect: 'manual' });
    const res = new Response(upstream.body, upstream);
    res.headers.set('X-Rift-Proxy', '1');
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      `Pages proxy: upstream fetch failed (${msg}). Check BACKEND_URL.`,
      { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
