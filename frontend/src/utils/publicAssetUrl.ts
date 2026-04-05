/**
 * Normalizes storage URLs for `<img src>` and links.
 *
 * **Cloudflare Pages + tunnel:** set `VITE_API_URL=/api` and add a Pages Function that proxies `/api/*` to
 * your tunnel origin (`functions/api/[[path]].js`). Stored `https://tunnel/.../s3/...` URLs become
 * same-origin `/api/s3/...` so only your Pages hostname appears in the UI.
 *
 * **Full `VITE_API_URL`:** if it is `https://…` and the asset host matches, the URL is left unchanged.
 *
 * Optional: `VITE_MEDIA_S3_USE_LEGACY_PATH=1` uses `origin + /s3/…` instead of `origin + /api/s3/…` when
 * building from a relative `/s3/…` path (older APIs).
 *
 * Legacy URLs shaped like `https://api-host/{bucket}/file` (no `/s3/` segment): set `VITE_S3_BUCKET` to
 * match `S3_BUCKET`, and with relative `VITE_API_URL=/api` also set `VITE_ASSET_URL_HOSTS` to your API
 * hostname (comma-separated) so those URLs rewrite to `/api/s3/{bucket}/file`.
 */
export function publicAssetUrl(raw: string | undefined | null): string {
  if (raw == null || raw === '') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const legacyS3 = import.meta.env.VITE_MEDIA_S3_USE_LEGACY_PATH === '1';

    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('/api/s3/')) return trimmed;
      if (trimmed.startsWith('/s3/')) {
        if (apiBase.startsWith('http')) {
          const origin = new URL(apiBase).origin;
          return legacyS3 ? `${origin}${trimmed}` : `${origin}/api${trimmed}`;
        }
        return `/api${trimmed}`;
      }
      return trimmed;
    }

    const u = new URL(trimmed);
    const rest = `${u.pathname}${u.search}${u.hash}`;

    const mediaBucket = (import.meta.env.VITE_S3_BUCKET as string | undefined)?.trim();
    if (mediaBucket && rest.startsWith(`/${mediaBucket}/`) && !rest.startsWith('/s3/')) {
      const trustBucketPathHost = (): boolean => {
        if (apiBase.startsWith('http')) {
          return new URL(apiBase).host === u.host;
        }
        const extra = (import.meta.env.VITE_ASSET_URL_HOSTS as string | undefined)
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (extra?.length) return extra.includes(u.host);
        return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      };
      if (trustBucketPathHost()) {
        if (apiBase.startsWith('/')) {
          return `/api/s3${rest}`;
        }
        if (apiBase.startsWith('http')) {
          return `${new URL(apiBase).origin}/api/s3${rest}`;
        }
      }
    }

    if (!rest.startsWith('/s3/')) return trimmed;

    // Relative VITE_API_URL (e.g. /api): always use same-origin /api/s3/… for tunnel or API-stored URLs.
    if (apiBase.startsWith('/') && rest.startsWith('/s3/')) {
      return `/api${rest}`;
    }

    const hosts = new Set<string>();
    if (apiBase.startsWith('http')) {
      hosts.add(new URL(apiBase).host);
    }
    (import.meta.env.VITE_ASSET_URL_HOSTS as string | undefined)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((h) => hosts.add(h));

    if (hosts.has(u.host)) {
      return trimmed;
    }

    const localDevAsset =
      hosts.size === 0 && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    if (localDevAsset) {
      if (apiBase.startsWith('http')) {
        const origin = new URL(apiBase).origin;
        return legacyS3 ? `${origin}${rest}` : `${origin}/api${rest}`;
      }
      return `/api${rest}`;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}
