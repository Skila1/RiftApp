import { useMemo } from 'react';
import { useVoiceStore, type ScreenShareKind } from '../../stores/voiceStore';
import ModalCloseButton from '../shared/ModalCloseButton';
import ModalOverlay from '../shared/ModalOverlay';

function pickerTitle(kind: ScreenShareKind) {
  if (kind === 'screen') return 'Share a screen';
  if (kind === 'window') return 'Share a window';
  return 'Share a window';
}

function pickerDescription(kind: ScreenShareKind) {
  if (kind === 'screen') {
    return 'Choose which display to share in the desktop app.';
  }
  if (kind === 'window') {
    return 'Choose which window to share in the desktop app.';
  }
  return 'Browser-tab capture is not available in the desktop app. Choose a window instead.';
}

function SourceKindIcon({ kind }: { kind: 'screen' | 'window' }) {
  if (kind === 'screen') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3.5" y="4.5" width="17" height="11.5" rx="2" />
        <path d="M9 19.5h6" />
        <path d="M12 16v3.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M8 9.5h8" />
      <path d="M8 13h5.5" />
    </svg>
  );
}

function EmptyThumbnail({ kind }: { kind: 'screen' | 'window' }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.28),_transparent_55%),linear-gradient(180deg,rgba(22,24,31,0.96),rgba(14,16,22,1))] text-riftapp-text-muted">
      <SourceKindIcon kind={kind} />
    </div>
  );
}

export default function DesktopScreenSharePickerModal() {
  const isOpen = useVoiceStore((s) => s.desktopScreenSharePickerOpen);
  const isLoading = useVoiceStore((s) => s.desktopScreenSharePickerLoading);
  const sources = useVoiceStore((s) => s.desktopScreenShareSources);
  const requesting = useVoiceStore((s) => s.screenShareRequesting);
  const kind = useVoiceStore((s) => s.screenShareKind);
  const closePicker = useVoiceStore((s) => s.closeDesktopScreenSharePicker);
  const chooseSource = useVoiceStore((s) => s.chooseDesktopScreenShareSource);

  const visible = isOpen || isLoading;
  const canClose = !isLoading && !requesting;
  const description = useMemo(() => pickerDescription(kind), [kind]);

  if (!visible) {
    return null;
  }

  return (
    <ModalOverlay
      isOpen
      onClose={canClose ? closePicker : () => {}}
      zIndex={290}
      backdropClose={canClose}
    >
      <div className="w-[920px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-riftapp-border/70 bg-riftapp-panel shadow-modal">
        <div className="flex items-start justify-between gap-4 border-b border-riftapp-border/60 px-6 py-5">
          <div>
            <h2 className="text-[20px] font-bold text-white">{pickerTitle(kind)}</h2>
            <p className="mt-1 text-[13px] text-riftapp-text-muted">{description}</p>
          </div>
          <ModalCloseButton onClick={closePicker} size="sm" disabled={!canClose} />
        </div>

        <div className="px-6 pb-6 pt-5">
          {isLoading ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-riftapp-border/70 bg-riftapp-content/35 text-center text-riftapp-text-muted">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-riftapp-border/70 border-t-riftapp-accent" />
              <div>
                <p className="text-sm font-semibold text-white">Loading share targets</p>
                <p className="mt-1 text-xs text-riftapp-text-muted">Rift is asking the desktop shell for available screens and windows.</p>
              </div>
            </div>
          ) : (
            <div className="grid max-h-[68vh] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
              {sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  disabled={requesting}
                  onClick={() => void chooseSource(source.id)}
                  className="group overflow-hidden rounded-2xl border border-riftapp-border/60 bg-riftapp-content-elevated text-left transition-all duration-150 hover:border-riftapp-accent/60 hover:bg-riftapp-content disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="relative aspect-video overflow-hidden border-b border-riftapp-border/60 bg-riftapp-bg">
                    {source.thumbnailDataUrl ? (
                      <img
                        src={source.thumbnailDataUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.015]"
                      />
                    ) : (
                      <EmptyThumbnail kind={source.kind} />
                    )}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-black/20 bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm">
                      <SourceKindIcon kind={source.kind} />
                      {source.kind === 'screen' ? 'Screen' : 'Window'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {source.appIconDataUrl ? (
                      <img src={source.appIconDataUrl} alt="" className="h-9 w-9 rounded-xl border border-riftapp-border/60 bg-riftapp-panel object-contain p-1" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-riftapp-border/60 bg-riftapp-panel text-riftapp-text-muted">
                        <SourceKindIcon kind={source.kind} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{source.name}</p>
                      <p className="mt-0.5 text-xs text-riftapp-text-muted">
                        {source.kind === 'screen' ? 'Display capture' : 'Application window'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}