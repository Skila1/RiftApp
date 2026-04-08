// Rewrites S3/R2 storage URLs so they load through the /api proxy.
// Relative /s3/{bucket}/… paths are ALWAYS rewritten to /api/s3/… because the
// browser uses the API (or Cloudflare Pages functions) to reach private object storage.
// External URLs (Discord CDN, etc.) pass through unchanged.
export function publicAssetUrl(raw: string | undefined | null): string {
  if (raw == null || raw === '') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    // ── Relative paths ──────────────────────────────────────────────
    if (trimmed.startsWith('/')) {
      // Already namespaced under the API proxy
      if (trimmed.startsWith('/api/s3/')) return trimmed;

      // Relative S3 path → always route through API proxy
      if (trimmed.startsWith('/s3/') && looksLikeS3Path(trimmed)) {
        return `/api${trimmed}`;
      }
      return trimmed;
    }

    // ── Absolute URLs ───────────────────────────────────────────────
    const u = new URL(trimmed);
    const pathAndQuery = `${u.pathname}${u.search}${u.hash}`;

    // Absolute URL whose path is an S3 object → strip host, proxy via /api
    if (pathAndQuery.startsWith('/s3/') && looksLikeS3Path(pathAndQuery)) {
      return `/api${pathAndQuery}`;
    }

    // Absolute URL already under /api/s3 (e.g. old full-qualified URL) → use path only
    if (pathAndQuery.startsWith('/api/s3/')) {
      return pathAndQuery;
    }

    // Internal storage host (legacy MinIO hostname, localhost, staging-backend, etc.)
    // Rewrite to go through the API proxy as well.
    if (isInternalStorageHost(u)) {
      return `/api/s3${pathAndQuery}`;
    }

    // External URL (Discord CDN, imgur, Gravatar, …) → pass through unchanged
    return trimmed;
  } catch {
    return trimmed;
  }
}

// /s3/{bucket}/{object} where bucket is a single word (not "avatars", "icons", etc.)
// This filters out Discord CDN paths that were incorrectly prefixed with /s3 by migration 009.
const S3_BUCKET = (import.meta.env.VITE_S3_BUCKET as string | undefined)?.trim() || 'riftapp';
function looksLikeS3Path(p: string): boolean {
  const afterS3 = p.slice('/s3/'.length);
  return afterS3.startsWith(`${S3_BUCKET}/`);
}


function isInternalStorageHost(u: URL): boolean {
  const h = u.hostname;
  if (h === 'minio' || h === 'localhost' || h === '127.0.0.1') return true;
  if (u.port === '9000') return true;
  // Recognise the staging backend so old absolute URLs still get rewritten.
  if (h === 'staging-backend.riftapp.io') return true;

  const extra = (import.meta.env.VITE_ASSET_URL_HOSTS as string | undefined)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra?.includes(u.host)) return true;

  return false;
}
