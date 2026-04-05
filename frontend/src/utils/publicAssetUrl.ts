/**
 * Rewrites storage URLs to same-origin `/api/s3/...` so the browser UI (status bar,
 * copy link) shows the app origin instead of the raw API host.
 *
 * Requires the backend to serve `/api/s3/*` (see router) and hosting/proxy so
 * `/api` reaches the API from the SPA origin.
 */
export function publicAssetUrl(raw: string | undefined | null): string {
  if (raw == null || raw === '') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('/s3/')) return `/api${trimmed}`;
      if (trimmed.startsWith('/api/s3/')) return trimmed;
      return trimmed;
    }

    const u = new URL(trimmed);
    const rest = `${u.pathname}${u.search}${u.hash}`;
    if (!rest.startsWith('/s3/')) return trimmed;

    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const hosts = new Set<string>();
    if (apiBase.startsWith('http')) {
      hosts.add(new URL(apiBase).host);
    }
    const extra = (import.meta.env.VITE_ASSET_URL_HOSTS as string | undefined)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    extra?.forEach((h) => hosts.add(h));

    if (hosts.has(u.host) || (hosts.size === 0 && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) {
      return `/api${rest}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}
