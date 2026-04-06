import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const CHUNK_RELOAD_SESSION_KEY = 'riftapp:stale-chunk-reload';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
