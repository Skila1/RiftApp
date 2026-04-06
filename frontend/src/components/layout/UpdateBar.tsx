import { useState, useEffect, useCallback } from 'react';

function getDesktopUpdate() {
  if (typeof window === 'undefined') return null;
  const d = window.desktop;
  if (d?.onUpdateReady && d?.restartToUpdate) return d;
  return null;
}

export default function UpdateBar() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = getDesktopUpdate();
    if (!api) return;
    return api.onUpdateReady(() => setReady(true));
  }, []);

  const restart = useCallback(() => {
    getDesktopUpdate()?.restartToUpdate();
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs shrink-0 bg-indigo-600 text-white">
      <span>A new version of Rift is ready.</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={restart}
          className="rounded px-2.5 py-0.5 font-medium bg-white/20 hover:bg-white/30 transition-colors"
        >
          Restart to update
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
