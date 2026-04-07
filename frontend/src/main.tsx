import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const CHUNK_RELOAD_SESSION_KEY = 'riftapp:stale-chunk-reload';
const DEPLOY_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const DEPLOY_SCRIPT_RE = /<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/[^"']+\.js[^"']*)["']/i;
const DEPLOY_STYLE_RE = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']*\/assets\/[^"']+\.css[^"']*)["']/i;

function isDynamicImportFailureMessage(message: string) {
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

function shouldRecoverFromAssetFailure(event: ErrorEvent) {
  const directMessage = typeof event.message === 'string' ? event.message : '';
  const nestedMessage =
    event.error && typeof event.error === 'object' && 'message' in event.error && typeof event.error.message === 'string'
      ? event.error.message
      : '';

  if (isDynamicImportFailureMessage(directMessage) || isDynamicImportFailureMessage(nestedMessage)) {
    return true;
  }

  const target = event.target;
  if (target instanceof HTMLScriptElement) {
    return /\/assets\/.+\.js(?:$|\?)/.test(target.src);
  }
  if (target instanceof HTMLLinkElement) {
    return target.rel === 'stylesheet' && /\/assets\/.+\.css(?:$|\?)/.test(target.href);
  }

  return false;
}

function shouldRecoverFromPromiseRejection(reason: unknown) {
  if (typeof reason === 'string') {
    return isDynamicImportFailureMessage(reason);
  }

  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
    return isDynamicImportFailureMessage(reason.message);
  }

  return false;
}

function reloadOnceForStaleChunk() {
  try {
    const prev = sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY);
    if (prev) {
      const ts = Number(prev);
      // If we already reloaded within the last 30 seconds, don't reload again.
      if (!Number.isNaN(ts) && Date.now() - ts < 30_000) {
        return;
      }
    }
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now()));
  } catch {
    /* ignore storage failures */
  }

  window.location.reload();
}

function normalizeAssetPath(value: string) {
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value;
  }
}

function createDeploySignature(scriptPath: string | null, stylePath: string | null) {
  if (!scriptPath && !stylePath) return null;
  return `${scriptPath ?? ''}|${stylePath ?? ''}`;
}

function getCurrentDeploySignature() {
  const moduleScript = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
  const stylesheet = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find((node) =>
    /\/assets\/.+\.css(?:$|\?)/.test(node.getAttribute('href') ?? ''),
  ) as HTMLLinkElement | undefined;

  return createDeploySignature(
    moduleScript?.src ? normalizeAssetPath(moduleScript.src) : null,
    stylesheet?.href ? normalizeAssetPath(stylesheet.href) : null,
  );
}

function extractDeploySignature(html: string) {
  const scriptMatch = html.match(DEPLOY_SCRIPT_RE);
  const styleMatch = html.match(DEPLOY_STYLE_RE);

  return createDeploySignature(
    scriptMatch?.[1] ? normalizeAssetPath(scriptMatch[1]) : null,
    styleMatch?.[1] ? normalizeAssetPath(styleMatch[1]) : null,
  );
}

async function fetchLatestDeploySignature() {
  const url = new URL('/index.html', window.location.origin);
  url.searchParams.set('deploy-check', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) return null;
  return extractDeploySignature(await response.text());
}

function installDeployRefreshMonitor() {
  if (import.meta.env.DEV) return;

  const currentSignature = getCurrentDeploySignature();
  if (!currentSignature) return;

  let knownSignature = currentSignature;
  let pendingRefresh = false;
  let checkInFlight = false;

  const reloadIfPending = () => {
    if (!pendingRefresh) return;
    pendingRefresh = false;
    reloadOnceForStaleChunk();
  };

  const checkForDeployUpdate = async () => {
    if (checkInFlight) return;
    checkInFlight = true;

    try {
      const latestSignature = await fetchLatestDeploySignature();
      if (!latestSignature || latestSignature === knownSignature) return;

      knownSignature = latestSignature;

      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        reloadOnceForStaleChunk();
        return;
      }

      pendingRefresh = true;
    } catch {
      /* ignore transient deploy check failures */
    } finally {
      checkInFlight = false;
    }
  };

  const intervalId = window.setInterval(() => {
    void checkForDeployUpdate();
  }, DEPLOY_CHECK_INTERVAL_MS);

  window.addEventListener('focus', () => {
    if (pendingRefresh) {
      reloadIfPending();
      return;
    }
    void checkForDeployUpdate();
  });

  window.addEventListener('blur', () => {
    reloadIfPending();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (pendingRefresh) {
        reloadIfPending();
        return;
      }
      void checkForDeployUpdate();
      return;
    }

    reloadIfPending();
  });

  window.addEventListener('beforeunload', () => {
    window.clearInterval(intervalId);
  });
}

function installChunkMismatchRecovery() {
  window.addEventListener(
    'error',
    (event) => {
      if (shouldRecoverFromAssetFailure(event)) {
        reloadOnceForStaleChunk();
      }
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldRecoverFromPromiseRejection(event.reason)) {
      event.preventDefault();
      reloadOnceForStaleChunk();
    }
  });
}

installChunkMismatchRecovery();
installDeployRefreshMonitor();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
