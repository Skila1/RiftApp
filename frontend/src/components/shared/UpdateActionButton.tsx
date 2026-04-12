import { useEffect, useMemo, useState } from 'react';
import type { DesktopUpdateStatus } from '../../types/desktop';
import { useFrontendUpdateStore } from '../../stores/frontendUpdateStore';
import { getDesktop, idleDesktopUpdateStatus } from '../../utils/desktop';

function IconUpdateAction({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3.5v10.75" />
      <path d="m8.25 10.75 3.75 3.75 3.75-3.75" />
      <path d="M5 16.75v1.5A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25v-1.5" />
    </svg>
  );
}

export default function UpdateActionButton({ className = '' }: { className?: string }) {
  const appUpdateReady = useFrontendUpdateStore((s) => s.updateReady);
  const applyFrontendUpdate = useFrontendUpdateStore((s) => s.applyUpdate);
  const desktop = useMemo(() => getDesktop(), []);
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>(idleDesktopUpdateStatus);

  useEffect(() => {
    if (!desktop) return;

    let cancelled = false;
    void desktop.getUpdateStatus().then((status) => {
      if (!cancelled) {
        setUpdateStatus(status);
      }
    });

    const disposeStatus = desktop.onUpdateStatus((status) => {
      setUpdateStatus(status);
    });
    const disposeReady = desktop.onUpdateReady(() => {
      setUpdateStatus((current) => ({
        ...current,
        state: 'ready',
      }));
    });

    return () => {
      cancelled = true;
      disposeStatus();
      disposeReady();
    };
  }, [desktop]);

  const desktopUpdateReady = Boolean(desktop && updateStatus.state === 'ready');
  const showUpdateAction = Boolean(desktop) && (desktopUpdateReady || appUpdateReady);

  if (showUpdateAction) {
    const updateActionLabel = desktopUpdateReady ? 'Restart to update' : 'Refresh to update';
    const updateActionTitle = desktopUpdateReady
      ? 'Restart to install the downloaded desktop update'
      : 'Refresh to reconnect to the latest Rift deployment';

    return (
      <button
        type="button"
        onClick={() => {
          if (desktopUpdateReady) {
            desktop?.restartToUpdate();
            return;
          }
          applyFrontendUpdate();
        }}
        aria-label={updateActionLabel}
        title={updateActionTitle}
        className={`relative inline-flex h-8 items-center justify-center rounded-md border border-[#2f8555] bg-[#248046] px-2 text-white transition-colors hover:bg-[#2d9d58] ${className}`.trim()}
      >
        <span className="inline-flex items-center justify-center">
          <IconUpdateAction className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return null;
}