import { useEffect, useState, type CSSProperties, type SVGProps } from 'react';
import { getDesktop } from '../../utils/desktop';

function RiftMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4.25 6.5c1.4-1.35 2.85-1.35 4.25 0s2.85 1.35 4.25 0 2.85-1.35 4.25 0" />
      <path d="M4.25 13.5c1.4-1.35 2.85-1.35 4.25 0s2.85 1.35 4.25 0 2.85-1.35 4.25 0" />
    </svg>
  );
}

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
    let unlistenMaximized: (() => void) | undefined;
    const run = async () => {
      const isMaximized = await api.isMaximized();
      if (!cancelled) {
        setMaximized(isMaximized);
      }
      unlistenMaximized = api.onMaximizedChange((v) => {
        if (!cancelled) setMaximized(v);
      });
    };
    void run();
    return () => {
      cancelled = true;
      unlistenMaximized?.();
    };
  }, [ready]);

  if (!ready || !getDesktop()) return null;

  const api = getDesktop()!;

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
      className="titlebar flex h-8 items-center justify-between select-none shrink-0 bg-riftapp-chrome/95 pl-3.5 backdrop-blur-xs"
      style={
        {
          WebkitAppRegion: 'drag',
        } as CSSProperties
      }
      onDoubleClick={() => api.maximize()}
    >
      <div className="flex min-w-0 items-center">
        <div className="flex items-center gap-2 opacity-95 transition-[opacity,filter] duration-150 hover:opacity-100 hover:brightness-110">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.06] bg-[#2b2e36] text-[#f2f3f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <RiftMark className="h-3.5 w-3.5" />
          </span>
          <span className="text-[15px] font-semibold leading-none tracking-[0.01em] text-[#ededed]">Rift</span>
        </div>
      </div>

      <div
        className="flex h-full items-stretch pr-0"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <div className="window-buttons flex h-full items-stretch">
        <button
          type="button"
          onClick={handleMinimizeClick}
          onMouseDown={(event) => event.stopPropagation()}
          className="window-button flex h-full w-[44px] items-center justify-center text-[#aeb4c0] transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <line x1="1.75" y1="6.25" x2="8.25" y2="6.25" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleMaximizeClick}
          onMouseDown={(event) => event.stopPropagation()}
          className="window-button flex h-full w-[44px] items-center justify-center text-[#aeb4c0] transition-colors hover:bg-white/[0.06] hover:text-white"
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
          className="window-button flex h-full w-[44px] items-center justify-center text-[#aeb4c0] transition-colors hover:bg-[#ed4245] hover:text-white"
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
