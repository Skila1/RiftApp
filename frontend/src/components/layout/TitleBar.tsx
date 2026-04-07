import { useState, useEffect } from 'react';
import type { DesktopAPI } from '@/types/desktop';

function getDesktop(): DesktopAPI | undefined {
  if (typeof window === 'undefined') return undefined;
  const d = window.desktop as Partial<DesktopAPI> | undefined;
  if (d && typeof d.minimize === 'function' && typeof d.maximize === 'function' && typeof d.close === 'function' && typeof d.isMaximized === 'function') {
    return {
      minimize: () => {
        void d.minimize?.();
      },
      maximize: () => {
        void d.maximize?.();
      },
      close: () => {
        void d.close?.();
      },
      isMaximized: () => d.isMaximized?.() ?? Promise.resolve(false),
      getVersion: () => d.getVersion?.() ?? Promise.resolve(''),
      isUpdateReady: () => d.isUpdateReady?.() ?? Promise.resolve(false),
      onMaximizedChange: (cb) => d.onMaximizedChange?.(cb) ?? (() => {}),
      onUpdateReady: (cb) => d.onUpdateReady?.(cb) ?? (() => {}),
      restartToUpdate: () => {
        d.restartToUpdate?.();
      },
    };
  }

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
    getVersion: async () => '',
    isUpdateReady: async () => false,
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
  const [updateReady, setUpdateReady] = useState(false);

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
    let unlistenMaximized: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;
    const run = async () => {
      const [isMaximized, isUpdateReady] = await Promise.all([
        api.isMaximized(),
        api.isUpdateReady(),
      ]);
      if (!cancelled) {
        setMaximized(isMaximized);
        setUpdateReady(isUpdateReady);
      }
      unlistenMaximized = api.onMaximizedChange((v) => {
        if (!cancelled) setMaximized(v);
      });
      unlistenUpdate = api.onUpdateReady(() => {
        if (!cancelled) setUpdateReady(true);
      });
    };
    void run();
    return () => {
      cancelled = true;
      unlistenMaximized?.();
      unlistenUpdate?.();
    };
  }, [ready]);

  if (!ready || !getDesktop()) return null;

  const api = getDesktop()!;

  const handleUpdateClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.restartToUpdate();
  };

  const handleMinimizeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.minimize();
  };

  const handleMaximizeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.maximize();
  };

  const handleCloseClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.close();
  };

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
        className="flex h-full items-stretch gap-2 pr-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {updateReady && (
          <button
            type="button"
            onClick={handleUpdateClick}
            onMouseDown={(event) => event.stopPropagation()}
            className="my-auto flex h-6 w-6 items-center justify-center rounded-full bg-[#1f3d2a] text-[#3ba55d] shadow-[inset_0_0_0_1px_rgba(59,165,93,0.35)] transition-colors hover:bg-[#285336] hover:text-[#43b581]"
            aria-label="Restart to install update"
            title="Restart to install the downloaded update"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 1.75v5.25" />
              <path d="M3.75 5.75L6 8l2.25-2.25" />
              <path d="M2.5 10h7" />
            </svg>
          </button>
        )}

        <div className="window-buttons flex h-full items-stretch">
        <button
          type="button"
          onClick={handleMinimizeClick}
          onMouseDown={(event) => event.stopPropagation()}
          className="window-button w-[46px] h-full flex items-center justify-center text-[#b9bbbe] hover:bg-white/10 transition-colors"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor" aria-hidden>
            <rect width="10" height="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleMaximizeClick}
          onMouseDown={(event) => event.stopPropagation()}
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
          onClick={handleCloseClick}
          onMouseDown={(event) => event.stopPropagation()}
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
    </div>
  );
}

export default TitleBar;
