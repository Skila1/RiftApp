import { useState, useEffect } from 'react';
import type { DesktopAPI } from '@/types/desktop';

function getDesktop(): DesktopAPI | undefined {
  if (typeof window === 'undefined') return undefined;
  if (window.desktop) return window.desktop;
  const r = window.riftDesktop;
  if (!r) return undefined;
  return {
    minimize: () => {
      void r.minimize();
    },
    maximize: () => {
      void r.maximizeToggle();
    },
    close: () => {
      void r.close();
    },
    isMaximized: () => r.isMaximized(),
    onMaximizedChange: r.onMaximizedChange,
    onUpdateReady: () => () => {},
    restartToUpdate: () => {},
  };
}

/**
 * Frameless window chrome: drag region + min / max / close via preload `window.desktop`.
 * CSS: strip uses `-webkit-app-region: drag`; controls use `no-drag` (see Electron docs).
 */
function TitleBar() {
  const [ready, setReady] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const d = getDesktop();
    if (d) {
      setReady(true);
      return;
    }
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      if (getDesktop()) {
        setReady(true);
        window.clearInterval(t);
      } else if (n > 200) {
        window.clearInterval(t);
      }
    }, 50);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const api = getDesktop();
    if (!api) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const run = async () => {
      const m = await api.isMaximized();
      if (!cancelled) setMaximized(m);
      unlisten = api.onMaximizedChange((v) => {
        if (!cancelled) setMaximized(v);
      });
    };
    void run();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [ready]);

  if (!ready || !getDesktop()) return null;

  const api = getDesktop()!;

  return (
    <div
      className="titlebar h-8 flex items-center justify-between select-none shrink-0 border-b border-black/40 pl-3"
      style={
        {
          WebkitAppRegion: 'drag',
          backgroundColor: '#232428',
        } as React.CSSProperties
      }
      onDoubleClick={() => api.maximize()}
    >
      <span className="text-xs font-semibold text-[#b9bbbe] tracking-wide pointer-events-none">
        Rift
      </span>

      <div
        className="window-buttons flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => api.minimize()}
          className="window-button w-[46px] h-full flex items-center justify-center text-[#b9bbbe] hover:bg-white/10 transition-colors"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor" aria-hidden>
            <rect width="10" height="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => api.maximize()}
          className="window-button w-[46px] h-full flex items-center justify-center text-[#b9bbbe] hover:bg-white/10 transition-colors"
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
              <rect x="2" y="0" width="8" height="8" rx="0.5" />
              <rect x="0" y="2" width="8" height="8" rx="0.5" fill="#232428" />
              <rect x="0" y="2" width="8" height="8" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => api.close()}
          className="window-button w-[46px] h-full flex items-center justify-center text-[#b9bbbe] hover:bg-[#ed4245] hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
