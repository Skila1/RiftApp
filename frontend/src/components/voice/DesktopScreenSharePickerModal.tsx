import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useVoiceStore,
  type ScreenShareFps,
  type ScreenShareKind,
  type ScreenShareResolution,
} from '../../stores/voiceStore';
import ModalOverlay from '../shared/ModalOverlay';

type PickerTab = 'applications' | 'screen';
type ShareQualityMode = 'gaming' | 'watch-party' | 'custom';

const CUSTOM_FPS_OPTIONS = [24, 30, 60] as ScreenShareFps[];
const CUSTOM_RESOLUTION_OPTIONS = ['720p', '1080p', '1440p', 'source'] as ScreenShareResolution[];

function pickerTabFromKind(kind: ScreenShareKind): PickerTab {
  return kind === 'screen' ? 'screen' : 'applications';
}

function screenShareKindFromTab(tab: PickerTab): ScreenShareKind {
  return tab === 'screen' ? 'screen' : 'window';
}

function qualityModeFromState(
  fps: ScreenShareFps,
  resolution: ScreenShareResolution,
): ShareQualityMode {
  if (fps === 60 && resolution === '720p') {
    return 'gaming';
  }
  if (fps === 60 && resolution === 'source') {
    return 'watch-party';
  }
  return 'custom';
}

function qualityLabel(fps: ScreenShareFps, resolution: ScreenShareResolution) {
  return `${resolution === 'source' ? 'Source' : resolution}, ${fps}fps`;
}

function qualityTitle(mode: ShareQualityMode, fps: ScreenShareFps, resolution: ScreenShareResolution) {
  if (mode === 'gaming') {
    return 'Gaming';
  }
  if (mode === 'watch-party') {
    return 'Watch Party';
  }
  if (fps === 60 && resolution === '1440p') {
    return 'HD';
  }
  return 'Custom';
}

function IconApplications() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="5" width="16" height="13" rx="2.5" />
      <path d="M9 19.5h6" />
      <path d="M12 18v1.5" />
    </svg>
  );
}

function IconEntireScreen() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="4.5" width="17" height="11.5" rx="2" />
      <path d="M8.5 19.5h7" />
      <path d="M12 16v3.5" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
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
  const loading = useVoiceStore((s) => s.desktopScreenSharePickerLoading);
  const sources = useVoiceStore((s) => s.desktopScreenShareSources);
  const requesting = useVoiceStore((s) => s.screenShareRequesting);
  const kind = useVoiceStore((s) => s.screenShareKind);
  const screenShareFps = useVoiceStore((s) => s.screenShareFps);
  const screenShareResolution = useVoiceStore((s) => s.screenShareResolution);
  const closePicker = useVoiceStore((s) => s.closeDesktopScreenSharePicker);
  const chooseSource = useVoiceStore((s) => s.chooseDesktopScreenShareSource);
  const setScreenShareKind = useVoiceStore((s) => s.setScreenShareKind);
  const setScreenShareQuality = useVoiceStore((s) => s.setScreenShareQuality);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState<ShareQualityMode>('gaming');
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const visible = isOpen;
  const canClose = !requesting;
  const activeTab = pickerTabFromKind(kind);
  const currentMode = qualityModeFromState(screenShareFps, screenShareResolution);
  const filteredSources = useMemo(
    () => sources.filter((source) => activeTab === 'screen' ? source.kind === 'screen' : source.kind === 'window'),
    [activeTab, sources],
  );

  useEffect(() => {
    if (settingsOpen) {
      setSettingsMode(currentMode);
    }
  }, [currentMode, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsRef.current) {
        return;
      }
      if (!settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [settingsOpen]);

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
      <div className="w-[960px] max-w-[calc(100vw-28px)] overflow-hidden rounded-[18px] bg-[#2b2d31] shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <div className="px-4 pb-3 pt-4">
          <div className="flex min-w-0 flex-1 rounded-xl bg-[#1f2126] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            {([
              { tab: 'applications' as PickerTab, label: 'Applications', icon: <IconApplications /> },
              { tab: 'screen' as PickerTab, label: 'Entire Screen', icon: <IconEntireScreen /> },
            ]).map(({ tab, label, icon }) => {
              const selected = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setScreenShareKind(screenShareKindFromTab(tab))}
                  className={[
                    'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors',
                    selected
                      ? 'bg-[#3a3c43] text-white shadow-[0_8px_18px_rgba(0,0,0,0.18)]'
                      : 'text-[#b5bac1] hover:bg-white/[0.04] hover:text-white',
                  ].join(' ')}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="max-h-[58vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="flex h-[380px] items-center justify-center rounded-2xl bg-[#232428] text-sm text-[#b5bac1] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                Loading shareable sources...
              </div>
            ) : filteredSources.length === 0 ? (
              <div className="flex h-[380px] flex-col items-center justify-center rounded-2xl bg-[#232428] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="rounded-full bg-[#2b2d31] p-3 text-[#b5bac1] shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                  {activeTab === 'screen' ? <IconEntireScreen /> : <IconApplications />}
                </div>
                <p className="mt-4 text-[15px] font-semibold text-white">
                  {activeTab === 'screen' ? 'No displays available' : 'No applications available'}
                </p>
                <p className="mt-1 text-[13px] text-[#949ba4]">
                  {activeTab === 'screen'
                    ? 'Try reconnecting a display and open the picker again.'
                    : 'Open the app or browser you want to share and try again.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredSources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    disabled={requesting}
                    onClick={() => void chooseSource(source.id)}
                    className="group text-left transition-all duration-150 hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-[16px] bg-[#111214] shadow-[0_12px_28px_rgba(0,0,0,0.3)] transition-shadow duration-150 group-hover:shadow-[0_14px_32px_rgba(0,0,0,0.38)]">
                      {source.thumbnailDataUrl ? (
                        <img
                          src={source.thumbnailDataUrl}
                          alt=""
                          className={[
                            'h-full w-full transition-transform duration-200 group-hover:scale-[1.01]',
                            source.kind === 'screen' ? 'object-cover' : 'object-contain',
                          ].join(' ')}
                        />
                      ) : (
                        <EmptyThumbnail kind={source.kind} />
                      )}
                    </div>

                    <div className="flex items-center gap-2 px-1.5 pb-1 pt-2.5">
                      {source.appIconDataUrl ? (
                        <img src={source.appIconDataUrl} alt="" className="h-4 w-4 rounded-[4px] object-contain" />
                      ) : (
                        <div className="flex h-4 w-4 items-center justify-center text-[#8b9098]">
                          <SourceKindIcon kind={source.kind} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[#f2f3f5]">{source.name}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#2f3136] px-4 pb-4 pt-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">
                {qualityTitle(currentMode, screenShareFps, screenShareResolution)}
              </p>
              <p className="mt-1 text-[11px] text-[#949ba4]">{qualityLabel(screenShareFps, screenShareResolution)}</p>
            </div>

            <div className="relative flex items-center gap-2" ref={settingsRef}>
              <button
                type="button"
                onClick={() => void setScreenShareQuality(60, '720p')}
                className={[
                  'rounded-[10px] px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  screenShareFps === 60 && screenShareResolution === '720p'
                    ? 'bg-[#111214] text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]'
                    : 'bg-[#1f2023] text-[#b5bac1] hover:bg-[#26272b] hover:text-white',
                ].join(' ')}
              >
                SD
              </button>
              <button
                type="button"
                onClick={() => void setScreenShareQuality(60, '1440p')}
                className={[
                  'rounded-[10px] px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  screenShareFps === 60 && screenShareResolution === '1440p'
                    ? 'bg-[#111214] text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]'
                    : 'bg-[#1f2023] text-[#b5bac1] hover:bg-[#26272b] hover:text-white',
                ].join(' ')}
              >
                HD
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className={[
                  'inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors',
                  settingsOpen
                    ? 'bg-[#111214] text-white shadow-[0_8px_18px_rgba(0,0,0,0.22)]'
                    : 'bg-[#1f2023] text-[#b5bac1] hover:bg-[#26272b] hover:text-white',
                ].join(' ')}
                aria-label="Stream quality settings"
              >
                <IconSettings />
              </button>

              {settingsOpen ? (
                <div className="absolute bottom-[calc(100%+12px)] right-0 z-10 w-[280px] rounded-2xl bg-[#232428] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                  <div className="px-2 pb-2 text-[13px] font-semibold text-white">Stream Mode</div>

                  {[
                    {
                      id: 'gaming' as ShareQualityMode,
                      title: 'Gaming',
                      subtitle: 'Smooth motion (720p, 60fps)',
                      onSelect: () => void setScreenShareQuality(60, '720p'),
                    },
                    {
                      id: 'watch-party' as ShareQualityMode,
                      title: 'Watch Party',
                      subtitle: 'Sharper playback (Source, 60fps)',
                      onSelect: () => void setScreenShareQuality(60, 'source'),
                    },
                    {
                      id: 'custom' as ShareQualityMode,
                      title: 'Custom',
                      subtitle: 'Pick your own resolution and frame rate',
                      onSelect: () => setSettingsMode('custom'),
                    },
                  ].map((option) => {
                    const selected = settingsMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSettingsMode(option.id);
                          option.onSelect();
                        }}
                        className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <span className={[
                          'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-[#5865f2] bg-[#5865f2]' : 'border-[#72767d] bg-transparent',
                        ].join(' ')}>
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-white">{option.title}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-[#949ba4]">{option.subtitle}</span>
                        </span>
                      </button>
                    );
                  })}

                  {settingsMode === 'custom' ? (
                    <div className="mt-2 px-2 pt-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Resolution</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {CUSTOM_RESOLUTION_OPTIONS.map((resolution) => (
                            <button
                              key={resolution}
                              type="button"
                              onClick={() => void setScreenShareQuality(screenShareFps, resolution)}
                              className={[
                                'rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                                screenShareResolution === resolution
                                  ? 'bg-[#5865f2] text-white'
                                  : 'bg-[#2f3136] text-[#b5bac1] hover:bg-[#3a3c43] hover:text-white',
                              ].join(' ')}
                            >
                              {resolution === 'source' ? 'Source' : resolution}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Frame Rate</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {CUSTOM_FPS_OPTIONS.map((fps) => (
                            <button
                              key={fps}
                              type="button"
                              onClick={() => void setScreenShareQuality(fps, screenShareResolution)}
                              className={[
                                'rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                                screenShareFps === fps
                                  ? 'bg-[#5865f2] text-white'
                                  : 'bg-[#2f3136] text-[#b5bac1] hover:bg-[#3a3c43] hover:text-white',
                              ].join(' ')}
                            >
                              {fps}fps
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}