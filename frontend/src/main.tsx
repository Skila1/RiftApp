import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initCapacitor } from './lib/capacitor';
import { useFrontendUpdateStore } from './stores/frontendUpdateStore';
import {
  isFrontendAssetFailureEvent,
  isFrontendAssetLoadError,
  reloadOnceForFrontendUpdate,
  shouldAutoReloadForFrontendAssetFailure,
} from './utils/frontendUpdate';

const DEPLOY_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const DEPLOY_SCRIPT_RE = /<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/[^"']+\.js[^"']*)["']/i;
const DEPLOY_STYLE_RE = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']*\/assets\/[^"']+\.css[^"']*)["']/i;

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
  useFrontendUpdateStore.getState().setCurrentSignature(currentSignature);

  let knownSignature = currentSignature;
  let checkInFlight = false;

  const checkForDeployUpdate = async () => {
    if (checkInFlight) return;
    checkInFlight = true;

    try {
      const latestSignature = await fetchLatestDeploySignature();
      if (!latestSignature || latestSignature === knownSignature) return;

      knownSignature = latestSignature;
      useFrontendUpdateStore.getState().markUpdateReady(latestSignature);
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
    void checkForDeployUpdate();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForDeployUpdate();
    }
  });

  window.addEventListener('beforeunload', () => {
    window.clearInterval(intervalId);
  });
}

function installChunkMismatchRecovery() {
  const handleProtectedAssetFailure = () => {
    useFrontendUpdateStore.getState().markUpdateReadyFromAssetFailure();
  };

  window.addEventListener(
    'error',
    (event) => {
      if (isFrontendAssetFailureEvent(event)) {
        if (!shouldAutoReloadForFrontendAssetFailure()) {
          handleProtectedAssetFailure();
          return;
        }

        reloadOnceForFrontendUpdate();
      }
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    if (isFrontendAssetLoadError(event.reason)) {
      event.preventDefault();

      if (!shouldAutoReloadForFrontendAssetFailure()) {
        handleProtectedAssetFailure();
        return;
      }

      reloadOnceForFrontendUpdate();
    }
  });
}

installChunkMismatchRecovery();
installDeployRefreshMonitor();
void initCapacitor();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
