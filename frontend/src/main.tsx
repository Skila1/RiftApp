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
import { initializeDateTimePreferences } from './utils/dateTime';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const DEPLOY_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const DEPLOY_SCRIPT_RE = /<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/[^"']+\.js[^"']*)["']/i;
const DEPLOY_STYLE_RE = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']*\/assets\/[^"']+\.css[^"']*)["']/i;

type BackendBuildInfoResponse = {
  data?: {
    commit_sha?: string;
    build_id?: string;
  };
};

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

function createBackendIdentity(commitSha: string | null, buildId: string | null) {
  if (!commitSha && !buildId) return null;
  return `${commitSha ?? ''}|${buildId ?? ''}`;
}

function normalizeBuildToken(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (/^https?:\/\//i.test(API_BASE)) {
    return `${API_BASE.replace(/\/+$/, '')}${normalizedPath}`;
  }

  const normalizedBase = API_BASE.startsWith('/') ? API_BASE : `/${API_BASE}`;
  return `${window.location.origin}${normalizedBase.replace(/\/+$/, '')}${normalizedPath}`;
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

async function fetchLatestBackendIdentity(): Promise<{ available: boolean; identity: string | null } | null> {
  const response = await fetch(`${buildApiUrl('/build-info')}?deploy-check=${Date.now()}`, {
    cache: 'no-store',
  });

  if (response.status === 404) {
    return { available: false, identity: null };
  }

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null) as BackendBuildInfoResponse | null;
  const buildInfo = payload?.data;

  return {
    available: true,
    identity: createBackendIdentity(
      normalizeBuildToken(buildInfo?.commit_sha),
      normalizeBuildToken(buildInfo?.build_id),
    ),
  };
}

function installDeployRefreshMonitor() {
  if (import.meta.env.DEV) return;

  const currentSignature = getCurrentDeploySignature();
  if (!currentSignature) return;
  useFrontendUpdateStore.getState().setCurrentSignature(currentSignature);

  let knownSignature = currentSignature;
  let backendIdentityState: 'unknown' | 'known' | 'unavailable' = 'unknown';
  let knownBackendIdentity: string | null = null;
  let checkInFlight = false;

  const checkForDeployUpdate = async () => {
    if (checkInFlight) return;
    checkInFlight = true;

    try {
      const latestSignature = await fetchLatestDeploySignature();
      if (latestSignature && latestSignature !== knownSignature) {
        knownSignature = latestSignature;
        useFrontendUpdateStore.getState().markUpdateReady(latestSignature);
      }

      const backendResult = await fetchLatestBackendIdentity();
      if (!backendResult) {
        return;
      }

      if (!backendResult.available) {
        backendIdentityState = 'unavailable';
        return;
      }

      if (backendIdentityState === 'unknown') {
        backendIdentityState = 'known';
        knownBackendIdentity = backendResult.identity;
        useFrontendUpdateStore.getState().setCurrentBackendIdentity(backendResult.identity);
        return;
      }

      if (backendIdentityState === 'unavailable') {
        backendIdentityState = 'known';
        knownBackendIdentity = backendResult.identity;
        if (backendResult.identity) {
          useFrontendUpdateStore.getState().markBackendUpdateReady(backendResult.identity);
        }
        return;
      }

      if (!backendResult.identity || backendResult.identity === knownBackendIdentity) {
        return;
      }

      knownBackendIdentity = backendResult.identity;
      useFrontendUpdateStore.getState().markBackendUpdateReady(backendResult.identity);
    } catch {
      /* ignore transient deploy check failures */
    } finally {
      checkInFlight = false;
    }
  };

  void checkForDeployUpdate();

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

async function bootstrap() {
  installChunkMismatchRecovery();
  installDeployRefreshMonitor();
  void initCapacitor();
  await initializeDateTimePreferences();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
