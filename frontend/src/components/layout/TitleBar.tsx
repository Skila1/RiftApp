import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { DesktopAPI, DesktopBuildInfo } from '@/types/desktop';
import { useDMStore } from '../../stores/dmStore';
import { useHubStore } from '../../stores/hubStore';

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
      getBuildInfo: () => d.getBuildInfo?.() ?? Promise.resolve({
        appVersion: '',
        electronVersion: '',
        platform: '',
        arch: '',
        osVersion: '',
      } satisfies DesktopBuildInfo),
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
    getBuildInfo: async () => ({
      appVersion: '',
      electronVersion: '',
      platform: '',
      arch: '',
      osVersion: '',
    }),
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
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const conversations = useDMStore((s) => s.conversations);
  const activeConversationId = useDMStore((s) => s.activeConversationId);

  const windowLabel = useMemo(() => {
    if (location.pathname.startsWith('/app/dms')) {
      const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
      const recipientName = activeConversation?.recipient.display_name || activeConversation?.recipient.username;
      return recipientName ? `Direct Messages • ${recipientName}` : 'Direct Messages';
    }

    if (location.pathname.startsWith('/app/hubs')) {
      const activeHub = hubs.find((hub) => hub.id === activeHubId);
      return activeHub?.name ? `Hub • ${activeHub.name}` : 'Hub';
    }

    if (location.pathname === '/app') return 'Friends';
    if (location.pathname === '/login') return 'Login';
    if (location.pathname === '/register') return 'Register';
    if (location.pathname === '/discover') return 'Discover';
    if (location.pathname === '/support') return 'Support';
    if (location.pathname.startsWith('/invite/')) return 'Invite';
    return 'Rift';
  }, [activeConversationId, activeHubId, conversations, hubs, location.pathname]);

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
      className="titlebar flex h-9 items-center justify-between select-none shrink-0 border-b border-white/[0.06] pl-2.5"
      style={
        {
          WebkitAppRegion: 'drag',
          background: 'linear-gradient(180deg, rgba(28,29,34,0.98) 0%, rgba(24,25,28,0.98) 100%)',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.03)',
        } as React.CSSProperties
      }
      onDoubleClick={() => api.maximize()}
    >
      <div className="pointer-events-none flex min-w-0 items-center gap-2.5">
        <div className="flex h-6 items-center gap-2 rounded-full border border-white/[0.05] bg-white/[0.04] px-2.5 text-[#d7dae0] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#5865f2] shadow-[0_0_12px_rgba(88,101,242,0.45)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b90a2]">Rift</span>
        </div>
        <span className="h-4 w-px bg-white/[0.08]" />
        <span className="truncate text-[12px] font-semibold text-[#d4d7de]">{windowLabel}</span>
      </div>

      <div
        className="flex h-full items-stretch gap-2 pr-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {updateReady && (
          <button
            type="button"
            onClick={handleUpdateClick}
            onMouseDown={(event) => event.stopPropagation()}
            className="my-auto flex h-6 items-center gap-1 rounded-full border border-[#43b581]/25 bg-[#1f3d2a] px-2 text-[#43b581] shadow-[inset_0_0_0_1px_rgba(67,181,129,0.12)] transition-colors hover:bg-[#285336] hover:text-[#6ee7a5]"
            aria-label="Restart to install update"
            title="Restart to install the downloaded update"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 1.75v5.25" />
              <path d="M3.75 5.75L6 8l2.25-2.25" />
              <path d="M2.5 10h7" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Update</span>
          </button>
        )}

        <div className="window-buttons flex h-full items-stretch">
        <button
          type="button"
          onClick={handleMinimizeClick}
          onMouseDown={(event) => event.stopPropagation()}
          className="window-button flex h-full w-[44px] items-center justify-center text-[#aeb4c0] transition-colors hover:bg-white/[0.07] hover:text-white"
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
          className="window-button flex h-full w-[44px] items-center justify-center text-[#aeb4c0] transition-colors hover:bg-white/[0.07] hover:text-white"
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
