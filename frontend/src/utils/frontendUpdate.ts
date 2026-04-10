const FRONTEND_UPDATE_SESSION_KEY = 'riftapp:stale-chunk-reload';
const FRONTEND_UPDATE_QUERY_PARAM = 'riftappFrontendUpdate';
const FRONTEND_ASSET_RE = /\/assets\/.+\.(?:js|css)(?:$|\?)/;

let frontendAssetAutoReloadSuppressionCount = 0;

export function isDynamicImportFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch dynamically imported module')
    || normalized.includes('importing a module script failed')
    || normalized.includes('failed to load module script')
    || normalized.includes('chunkloaderror')
    || normalized.includes('loading css chunk')
    || normalized.includes('unable to preload css')
  );
}

export function isFrontendAssetLoadError(reason: unknown) {
  if (typeof reason === 'string') {
    return isDynamicImportFailureMessage(reason);
  }

  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
    return isDynamicImportFailureMessage(reason.message);
  }

  return false;
}

export function isFrontendAssetFailureEvent(event: ErrorEvent) {
  const directMessage = typeof event.message === 'string' ? event.message : '';
  if (isDynamicImportFailureMessage(directMessage) || isFrontendAssetLoadError(event.error)) {
    return true;
  }

  const target = event.target;
  if (target instanceof HTMLScriptElement) {
    return FRONTEND_ASSET_RE.test(target.src);
  }

  if (target instanceof HTMLLinkElement) {
    return target.rel === 'stylesheet' && FRONTEND_ASSET_RE.test(target.href);
  }

  return false;
}

export function shouldAutoReloadForFrontendAssetFailure() {
  return frontendAssetAutoReloadSuppressionCount === 0;
}

export async function withFrontendAssetAutoReloadSuppressed<T>(load: () => Promise<T>) {
  frontendAssetAutoReloadSuppressionCount += 1;

  try {
    return await load();
  } finally {
    frontendAssetAutoReloadSuppressionCount = Math.max(0, frontendAssetAutoReloadSuppressionCount - 1);
  }
}

export function buildFrontendUpdateReloadUrl(currentUrl: string, timestamp = Date.now()) {
  const url = new URL(currentUrl, window.location.origin);
  url.searchParams.set(FRONTEND_UPDATE_QUERY_PARAM, String(timestamp));
  return url.toString();
}

export function reloadOnceForFrontendUpdate() {
  try {
    const previousReload = sessionStorage.getItem(FRONTEND_UPDATE_SESSION_KEY);
    if (previousReload) {
      const timestamp = Number(previousReload);
      if (!Number.isNaN(timestamp) && Date.now() - timestamp < 30_000) {
        return;
      }
    }

    sessionStorage.setItem(FRONTEND_UPDATE_SESSION_KEY, String(Date.now()));
  } catch {
    /* ignore storage failures */
  }

  try {
    window.location.replace(buildFrontendUpdateReloadUrl(window.location.href));
    return;
  } catch {
    window.location.reload();
  }
}
