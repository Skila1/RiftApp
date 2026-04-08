import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Track } from 'livekit-client';
import { usePresenceStore } from '../../stores/presenceStore';
import { useHubStore } from '../../stores/hubStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useStreamStore } from '../../stores/streamStore';
import { useVoiceStore, type VoiceParticipant, type ScreenShareFps, type ScreenShareResolution } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import type { User } from '../../types';
import VoiceParticipantContextMenu from './VoiceParticipantContextMenu';
import VoiceStreamContextMenu from './VoiceStreamContextMenu';
import {
  activityIcons,
  CameraIcon,
  DisconnectIcon,
  MicIcon,
  MoreIcon,
  ScreenShareIcon,
  SoundboardIcon,
  VoiceChannelIcon,
} from './VoiceIcons';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { canModerateVoice } from '../../utils/permissions';
import UpdateActionButton from '../shared/UpdateActionButton';

type LayoutSlotKind = 'screen' | 'camera';

interface LayoutSlot {
  id: string;
  kind: LayoutSlotKind;
  participant: VoiceParticipant;
}

function buildLayoutSlots(
  visible: VoiceParticipant[],
  suppressStream: (identity: string) => boolean,
): LayoutSlot[] {
  const out: LayoutSlot[] = [];
  for (const p of visible) {
    if (p.isScreenSharing && p.screenTrack && !suppressStream(p.identity)) {
      out.push({ id: `${p.identity}__screen`, kind: 'screen', participant: p });
    }
    out.push({ id: `${p.identity}__camera`, kind: 'camera', participant: p });
  }
  return out;
}

/** Discord-style grid: equal tiles in ~square cells (e.g. 2×2 for 4), not one ultra-tall row. */
function voiceGridDimensions(slotCount: number): { cols: number; rows: number } {
  if (slotCount <= 1) return { cols: 1, rows: 1 };
  if (slotCount === 2) return { cols: 2, rows: 1 };
  const cols = Math.ceil(Math.sqrt(slotCount));
  const rows = Math.ceil(slotCount / cols);
  return { cols, rows };
}

type TileMenuState = {
  x: number;
  y: number;
  participant: VoiceParticipant;
  kind: 'participant' | 'stream';
  focusSlotId: string;
} | null;

function useAttachedVideoTrack(track: Track | undefined, enabled = true) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!enabled || !track || track.kind !== Track.Kind.Video || !element) {
      return;
    }

    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track, enabled]);

  return videoRef;
}

const ActivitiesIcon = activityIcons.game;

export default function VoiceView() {
  const connected = useVoiceStore((s) => s.connected);
  const connecting = useVoiceStore((s) => s.connecting);
  const openSettings = useAppSettingsStore((s) => s.openSettings);
  const participants = useVoiceStore((s) => s.participants);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const voiceOutputMuted = useVoiceStore((s) => s.voiceOutputMuted);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const toggleCamera = useVoiceStore((s) => s.toggleCamera);
  const toggleScreenShare = useVoiceStore((s) => s.toggleScreenShare);
  const changeScreenShare = useVoiceStore((s) => s.changeScreenShare);
  const setScreenShareQuality = useVoiceStore((s) => s.setScreenShareQuality);
  const screenShareFps = useVoiceStore((s) => s.screenShareFps);
  const screenShareResolution = useVoiceStore((s) => s.screenShareResolution);
  const toggleVoiceOutputMute = useVoiceStore((s) => s.toggleVoiceOutputMute);
  const leave = useVoiceStore((s) => s.leave);

  const streams = useStreamStore((s) => s.streams);
  const closeVoiceView = useVoiceChannelUiStore((s) => s.closeVoiceView);
  const activeVoiceChannelId = useVoiceChannelUiStore((s) => s.activeChannelId);
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubPermissions = useHubStore((s) => (activeHubId ? s.hubPermissions[activeHubId] : undefined));

  const stream = streams.find((s) => s.id === activeVoiceChannelId);
  const canModerateUsers = canModerateVoice(hubPermissions);

  const [focusedSlotId, setFocusedSlotId] = useState<string | null>(null);
  const [showNonVideoParticipants, setShowNonVideoParticipants] = useState(true);
  /** Hide screen-share video for a participant; tile shows camera/avatar like Discord Stop Watching */
  const [stoppedWatchingStream, setStoppedWatchingStream] = useState<Record<string, boolean>>({});
  const [tileMenu, setTileMenu] = useState<TileMenuState>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [screenShareMenuOpen, setScreenShareMenuOpen] = useState(false);
  const [qualitySubOpen, setQualitySubOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const screenShareMenuRef = useRef<HTMLDivElement>(null);

  const visibleParticipants = useMemo(() => {
    if (showNonVideoParticipants) return participants;
    const f = participants.filter((p) => p.isScreenSharing || p.isCameraOn);
    return f.length > 0 ? f : participants;
  }, [participants, showNonVideoParticipants]);

  const suppressStreamFor = useCallback(
    (identity: string) => Boolean(stoppedWatchingStream[identity]),
    [stoppedWatchingStream],
  );

  const layoutSlots = useMemo(
    () => buildLayoutSlots(visibleParticipants, suppressStreamFor),
    [visibleParticipants, suppressStreamFor],
  );

  const aloneInCall = participants.length === 1;

  const focusedSlot = useMemo(
    () => (focusedSlotId ? layoutSlots.find((s) => s.id === focusedSlotId) : undefined),
    [focusedSlotId, layoutSlots],
  );

  useEffect(() => {
    if (aloneInCall) setFocusedSlotId(null);
  }, [aloneInCall]);

  useEffect(() => {
    if (!focusedSlotId) return;
    if (!layoutSlots.some((s) => s.id === focusedSlotId)) setFocusedSlotId(null);
  }, [focusedSlotId, layoutSlots]);

  const inFocusMode = Boolean(focusedSlot && !aloneInCall);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFocusedSlotId(null);
        setTileMenu(null);
        setMoreOpen(false);
        setScreenShareMenuOpen(false);
        setQualitySubOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  useEffect(() => {
    if (!screenShareMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (screenShareMenuRef.current && !screenShareMenuRef.current.contains(e.target as Node)) {
        setScreenShareMenuOpen(false);
        setQualitySubOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [screenShareMenuOpen]);

  const handleSlotClick = useCallback(
    (slotId: string) => {
      if (participants.length <= 1) return;
      setFocusedSlotId((f) => (f === slotId ? null : slotId));
    },
    [participants.length],
  );

  const requestStageFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen());
  }, []);

  const handlePopOut = useCallback(() => {
    window.open(window.location.href, '_blank', 'popup=yes,width=960,height=720,noopener,noreferrer');
  }, []);

  const openSlotContextMenu = useCallback(
    (e: React.MouseEvent, slot: LayoutSlot) => {
      e.preventDefault();
      const p = slot.participant;
      const streamMenu =
        slot.kind === 'screen' &&
        Boolean(p.isScreenSharing && p.screenTrack) &&
        !stoppedWatchingStream[p.identity];
      setTileMenu({
        x: e.clientX,
        y: e.clientY,
        participant: p,
        kind: streamMenu ? 'stream' : 'participant',
        focusSlotId: slot.id,
      });
    },
    [stoppedWatchingStream],
  );

  const gridStyle = useMemo((): CSSProperties => {
    const n = layoutSlots.length;
    const { cols, rows } = voiceGridDimensions(n);
    return {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    };
  }, [layoutSlots.length]);

  return (
    <div className="flex-1 flex flex-col bg-[#000000] min-w-0 min-h-0">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#0a0a0c]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <VoiceChannelIcon size={18} className="text-[#b5bac1] flex-shrink-0" />
          <h3 className="font-semibold text-[15px] text-[#f2f3f5] truncate">{stream?.name || 'Voice Channel'}</h3>
          {connected && (
            <span className="text-xs text-[#949ba4] ml-2">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="ml-3 flex-shrink-0">
          <UpdateActionButton className="border-[#2f8555] bg-[#248046] text-white hover:bg-[#2d9d58]" />
        </div>
      </div>

      {/* Stage + grid */}
      <div ref={stageRef} className="flex-1 flex flex-col min-h-0 relative bg-[#000000]">
        {!connected && !connecting ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                <VoiceChannelIcon size={36} className="text-[#949ba4]" />
              </div>
              <p className="text-[#949ba4] text-sm">Not connected to this voice channel</p>
            </div>
          </div>
        ) : connecting ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4 animate-pulse">
                <VoiceChannelIcon size={36} className="text-riftapp-warning" />
              </div>
              <p className="text-riftapp-warning text-sm font-medium">Connecting…</p>
            </div>
          </div>
        ) : inFocusMode && focusedSlot ? (
          <FocusLayout
            focusedSlot={focusedSlot}
            filmstripSlots={layoutSlots.filter((s) => s.id !== focusedSlot.id)}
            hubMembers={hubMembers}
            onSlotClick={handleSlotClick}
            onSlotContextMenu={openSlotContextMenu}
          />
        ) : (
          <div className="flex-1 min-h-0 p-2 grid gap-2 content-stretch" style={gridStyle}>
            {layoutSlots.map((slot) => (
              <SlotTile
                key={slot.id}
                slot={slot}
                hubMembers={hubMembers}
                fill
                onClick={() => handleSlotClick(slot.id)}
                onContextMenu={(e) => openSlotContextMenu(e, slot)}
              />
            ))}
          </div>
        )}

        {/* Bottom-right: output mute, pop out, fullscreen (Discord-style) */}
        {connected && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1 z-20">
            <IconBubbleBtn
              title={voiceOutputMuted ? 'Unmute channel output' : 'Mute channel output'}
              onClick={() => toggleVoiceOutputMute()}
              active={voiceOutputMuted}
            >
              {voiceOutputMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </IconBubbleBtn>
            <IconBubbleBtn title="Pop Out" onClick={handlePopOut}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3h7v7M10 14L21 3M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" strokeLinecap="round" />
              </svg>
            </IconBubbleBtn>
            <IconBubbleBtn title="Fullscreen" onClick={requestStageFullscreen}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" />
              </svg>
            </IconBubbleBtn>
          </div>
        )}
      </div>

      {tileMenu?.kind === 'stream' && (
        <VoiceStreamContextMenu
          participant={tileMenu.participant}
          x={tileMenu.x}
          y={tileMenu.y}
          onClose={() => setTileMenu(null)}
          onStopWatching={() => {
            setStoppedWatchingStream((s) => ({ ...s, [tileMenu.participant.identity]: true }));
            if (focusedSlotId === tileMenu.focusSlotId) setFocusedSlotId(null);
          }}
          onPopOutStream={handlePopOut}
          onMoreOptions={() => setTileMenu((m) => (m ? { ...m, kind: 'participant' } : null))}
        />
      )}
      {tileMenu?.kind === 'participant' && (
        <VoiceParticipantContextMenu
          participant={tileMenu.participant}
          member={hubMembers[tileMenu.participant.identity]}
          x={tileMenu.x}
          y={tileMenu.y}
          hubId={stream?.hub_id ?? activeHubId ?? null}
          canModerate={canModerateUsers}
          showNonVideoParticipants={showNonVideoParticipants}
          onToggleShowNonVideo={() => setShowNonVideoParticipants((v) => !v)}
          onClose={() => setTileMenu(null)}
          onRequestFocus={() => setFocusedSlotId(tileMenu.focusSlotId)}
          onRequestFullscreen={() => {
            setFocusedSlotId(tileMenu.focusSlotId);
            queueMicrotask(() => stageRef.current?.requestFullscreen());
          }}
          streamHiddenLocally={Boolean(stoppedWatchingStream[tileMenu.participant.identity])}
          onResumeStream={() =>
            setStoppedWatchingStream((s) => {
              const n = { ...s };
              delete n[tileMenu.participant.identity];
              return n;
            })
          }
        />
      )}

      {/* Control bar */}
      {connected && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-6 py-4 bg-transparent relative">
          <div className="flex items-center gap-1 rounded-[24px] bg-[#1e1f22] px-2 py-2 border border-black/50 shadow-elevation-md">
            <ControlBtn onClick={() => void toggleMute()} crossed={isMuted} tooltip={isMuted ? 'Unmute' : 'Mute'}>
              <MicIcon muted={isMuted} size={22} />
            </ControlBtn>

            <ControlBtn onClick={() => void toggleCamera()} active={isCameraOn} crossed={!isCameraOn} neutralWhenCrossed tooltip={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}>
              <CameraIcon enabled={isCameraOn} size={22} />
            </ControlBtn>

            {/* Screen share — plain button when idle, split button when active */}
            {isScreenSharing ? (
              <div className="relative flex items-center" ref={screenShareMenuRef}>
                {/* Main stop-sharing part */}
                <button
                  type="button"
                  onClick={() => { setScreenShareMenuOpen(false); setQualitySubOpen(false); void toggleScreenShare(); }}
                  title="Stop Sharing"
                  className="w-12 h-12 rounded-l-2xl flex items-center justify-center transition-all duration-150 active:scale-95 bg-[#5865f2] hover:bg-[#4752c4] text-white"
                >
                  <ScreenShareIcon active size={22} />
                </button>
                {/* Arrow dropdown trigger */}
                <button
                  type="button"
                  onClick={() => { setScreenShareMenuOpen((o) => !o); setQualitySubOpen(false); }}
                  title="Stream options"
                  className="w-6 h-12 rounded-r-2xl flex items-center justify-center transition-all duration-150 active:scale-95 bg-[#4752c4] hover:bg-[#3c45a5] text-white border-l border-white/20"
                >
                  <svg width="10" height="10" viewBox="0 0 10 6" fill="currentColor">
                    <path d="M0 0l5 6 5-6z" />
                  </svg>
                </button>
                {/* Dropdown menu */}
                {screenShareMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 min-w-[200px] rounded-lg bg-[#111214] border border-black/40 py-1 shadow-modal z-50">
                    {/* Change Stream */}
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-[14px] text-[#dbdee1] hover:bg-white/[0.08] flex items-center gap-2.5"
                      onClick={() => {
                        setScreenShareMenuOpen(false);
                        setQualitySubOpen(false);
                        void changeScreenShare();
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[#b5bac1]">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <polyline points="8 21 12 17 16 21" />
                      </svg>
                      Change Stream
                    </button>
                    {/* Stream Quality */}
                    <div className="relative">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-[14px] text-[#dbdee1] hover:bg-white/[0.08] flex items-center justify-between gap-2"
                        onClick={() => setQualitySubOpen((o) => !o)}
                      >
                        <span className="flex items-center gap-2.5">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[#b5bac1]">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                          </svg>
                          Stream Quality
                        </span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[#b5bac1]">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                      {/* Quality sub-panel (inline, no sub-menu positioning issues) */}
                      {qualitySubOpen && (
                        <div className="border-t border-white/[0.06] mx-2 pt-2 pb-1">
                          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">Frame Rate</p>
                          {([15, 30, 60] as ScreenShareFps[]).map((fps) => (
                            <button
                              key={fps}
                              type="button"
                              onClick={() => void setScreenShareQuality(fps, screenShareResolution)}
                              className="w-full flex items-center justify-between px-2 py-1.5 text-[13px] text-[#dbdee1] hover:bg-white/[0.08] rounded-md"
                            >
                              <span>{fps} FPS</span>
                              {screenShareFps === fps && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                              )}
                            </button>
                          ))}
                          <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">Resolution</p>
                          {(['480p', '720p', '1080p', '1440p', 'source'] as ScreenShareResolution[]).map((res) => (
                            <button
                              key={res}
                              type="button"
                              onClick={() => void setScreenShareQuality(screenShareFps, res)}
                              className="w-full flex items-center justify-between px-2 py-1.5 text-[13px] text-[#dbdee1] hover:bg-white/[0.08] rounded-md"
                            >
                              <span className="capitalize">{res === 'source' ? 'Source' : res}</span>
                              {screenShareResolution === res && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ControlBtn onClick={() => void toggleScreenShare()} active={false} tooltip="Share Your Screen">
                <ScreenShareIcon active={false} size={22} />
              </ControlBtn>
            )}

            <ControlBtn onClick={() => {}} tooltip="Activities" className="opacity-60 cursor-default">
              <ActivitiesIcon size={22} />
            </ControlBtn>

            <ControlBtn onClick={() => {}} tooltip="Soundboard" className="opacity-60 cursor-default">
              <SoundboardIcon size={22} />
            </ControlBtn>

            <div className="relative" ref={moreWrapRef}>
              <ControlBtn onClick={() => setMoreOpen((o) => !o)} tooltip="More">
                <MoreIcon size={22} className="text-[#b5bac1]" />
              </ControlBtn>
              {moreOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[200px] rounded-md bg-[#111214] border border-black/40 py-1 shadow-modal z-50">
                  <button type="button" className="w-full text-left px-3 py-2 text-[14px] text-[#dbdee1] hover:bg-[#5865f2]/30 rounded-md" onClick={() => { setMoreOpen(false); void toggleDeafen(); }}>
                    {isDeafened ? 'Undeafen' : 'Deafen'}
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-[14px] text-[#dbdee1] hover:bg-[#5865f2]/30 rounded-md"
                    onClick={() => {
                      setMoreOpen(false);
                      openSettings('voice');
                    }}
                  >
                    Voice settings…
                  </button>
                </div>
              )}
            </div>
          </div>

          <ControlBtn
            onClick={() => {
              leave();
              closeVoiceView();
            }}
            danger
            tooltip="Disconnect"
          >
            <DisconnectIcon size={22} />
          </ControlBtn>
        </div>
      )}
    </div>
  );
}

function IconBubbleBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors border ${
        active ? 'bg-[#ed4245]/20 border-[#ed4245]/40 text-white' : 'bg-[#1e1f22]/90 border-white/10 text-[#dbdee1] hover:bg-[#2b2d31]'
      }`}
    >
      {children}
    </button>
  );
}

function ControlBtn({
  children,
  onClick,
  tooltip,
  active,
  danger,
  crossed,
  neutralWhenCrossed,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tooltip: string;
  active?: boolean;
  danger?: boolean;
  crossed?: boolean;
  neutralWhenCrossed?: boolean;
  className?: string;
}) {
  let cls = 'bg-transparent hover:bg-white/[0.06] text-[#b5bac1]';
  if (danger) cls = 'bg-[#ed4245] hover:bg-[#c93b3e] text-white';
  else if (active) cls = 'bg-[#5865f2] hover:bg-[#4752c4] text-white';
  else if (crossed) cls = `bg-transparent hover:bg-white/[0.06] ${neutralWhenCrossed ? 'text-[#b5bac1]' : 'text-[#ed4245]'}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 active:scale-95 ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

function TileHoverExpand() {
  return (
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-md bg-black/60 p-1.5 text-white">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function FocusLayout({
  focusedSlot,
  filmstripSlots,
  hubMembers,
  onSlotClick,
  onSlotContextMenu,
}: {
  focusedSlot: LayoutSlot;
  filmstripSlots: LayoutSlot[];
  hubMembers: Record<string, User>;
  onSlotClick: (slotId: string) => void;
  onSlotContextMenu: (e: React.MouseEvent, slot: LayoutSlot) => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-2 gap-0">
      {/* Main stage — grows like Discord (~upper 75–82% of the view) */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden ring-1 ring-white/10 relative group bg-black/50">
        <button
          type="button"
          className="absolute inset-0 w-full h-full text-left"
          onClick={() => onSlotClick(focusedSlot.id)}
          onContextMenu={(e) => onSlotContextMenu(e, focusedSlot)}
        >
          <StageSlotContent slot={focusedSlot} hubMembers={hubMembers} />
        </button>
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
          <button
            type="button"
            className="rounded-md bg-black/70 p-2 text-white hover:bg-black/90"
            title="Exit focus (or press same tile)"
            onClick={(e) => {
              e.stopPropagation();
              onSlotClick(focusedSlot.id);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom rail: everyone else (camera on or avatar when off) — centered, Discord-style */}
      <div className="flex-none flex w-full min-h-[min(200px,28vh)] max-h-[220px] h-[min(200px,28vh)] items-center justify-center overflow-x-auto overflow-y-hidden gap-2.5 pt-3 pb-1 px-1 shrink-0">
        {filmstripSlots.map((slot) => (
          <div
            key={slot.id}
            className="h-full max-h-[min(192px,26vh)] aspect-video flex-shrink-0 min-w-[140px] max-w-[min(280px,38vw)] rounded-xl overflow-hidden ring-1 ring-white/[0.12] bg-black/50"
          >
            <SlotTile
              slot={slot}
              hubMembers={hubMembers}
              fill
              filmstrip
              activeFocus={false}
              onClick={() => onSlotClick(slot.id)}
              onContextMenu={(e) => onSlotContextMenu(e, slot)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function StageSlotContent({ slot, hubMembers }: { slot: LayoutSlot; hubMembers: Record<string, User> }) {
  const p = slot.participant;
  const member = hubMembers[p.identity];
  const displayName = member?.display_name || member?.username || p.identity;
  const avatarUrl = member?.avatar_url;

  if (slot.kind === 'screen') {
    return <ScreenShareStage participant={p} hubMembers={hubMembers} fill />;
  }

  const hasCam = p.isCameraOn && p.videoTrack;
  if (hasCam) {
    return (
      <div className="relative w-full h-full min-h-0">
        <CameraFill participant={p} />
        <NameOverlay displayName={displayName} participant={p} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ backgroundColor: getAvatarColor(p.identity) }}>
      <div className="rounded-full overflow-hidden w-28 h-28 ring-4 ring-black/30">
        {avatarUrl ? (
          <img src={publicAssetUrl(avatarUrl)} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-black/30 flex items-center justify-center text-3xl font-bold text-white">{displayName.slice(0, 2).toUpperCase()}</div>
        )}
      </div>
      <NameOverlay displayName={displayName} participant={p} />
    </div>
  );
}

function CameraFill({ participant }: { participant: VoiceParticipant }) {
  const videoRef = useAttachedVideoTrack(participant.videoTrack, participant.isCameraOn);
  return <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />;
}

function ScreenShareStage({
  participant,
  hubMembers,
  fill,
}: {
  participant: VoiceParticipant;
  hubMembers: Record<string, User>;
  fill?: boolean;
}) {
  const videoRef = useAttachedVideoTrack(participant.screenTrack, participant.isScreenSharing);
  const member = hubMembers[participant.identity];
  const displayName = member?.display_name || member?.username || participant.identity;

  return (
    <div className={`relative w-full h-full flex items-center justify-center bg-black ${fill ? '' : ''}`}>
      <div className="absolute top-2 right-2 z-10 bg-[#ed4245] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">LIVE</div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={fill ? 'w-full h-full object-contain' : 'max-w-full max-h-full rounded-lg shadow-2xl'}
      />
      <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-sm rounded-md px-2.5 py-1 flex items-center gap-1.5 pointer-events-none">
        <ScreenShareIcon size={12} className="text-riftapp-accent" />
        <span className="text-xs font-medium text-white">{displayName}&apos;s screen</span>
      </div>
    </div>
  );
}

function NameOverlay({ displayName, participant }: { displayName: string; participant: VoiceParticipant }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
      <div className="flex items-center gap-1.5 min-w-0 rounded-md bg-black/55 px-2 py-1">
        {participant.isMuted && (
          <MicIcon muted size={14} className="text-[#ed4245] shrink-0" />
        )}
        <span className="text-sm font-medium text-white truncate">{displayName}</span>
      </div>
    </div>
  );
}

function SlotTile({
  slot,
  hubMembers,
  fill,
  filmstrip,
  activeFocus,
  onClick,
  onContextMenu,
}: {
  slot: LayoutSlot;
  hubMembers: Record<string, User>;
  fill?: boolean;
  filmstrip?: boolean;
  activeFocus?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const participant = slot.participant;
  const member = hubMembers[participant.identity];
  const displayName = member?.display_name || member?.username || participant.identity;
  const avatarUrl = member?.avatar_url;

  const isScreen = slot.kind === 'screen';
  const track = isScreen ? participant.screenTrack : participant.videoTrack;
  const hasVideo = Boolean(
    track && track.kind === Track.Kind.Video && (isScreen || participant.isCameraOn),
  );
  const videoRef = useAttachedVideoTrack(track, hasVideo);

  const speaking = participant.isSpeaking;

  return (
    <button
      type="button"
      className={`relative rounded-xl overflow-hidden transition-all duration-200 text-left w-full h-full min-h-0 group ${
        speaking ? 'ring-[3px] ring-riftapp-voice-speaking shadow-lg shadow-riftapp-voice-speaking/15' : filmstrip ? 'ring-0' : 'ring-1 ring-white/10'
      } ${activeFocus ? 'ring-2 ring-[#5865f2]' : ''} ${fill ? (filmstrip ? 'min-h-0' : 'min-h-[100px]') : 'aspect-video'}`}
      style={!hasVideo && !isScreen ? { backgroundColor: getAvatarColor(participant.identity) } : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {isScreen && (
        <div className="absolute top-1.5 right-1.5 z-10 bg-[#ed4245] text-white text-[9px] font-bold px-1 py-px rounded">LIVE</div>
      )}

      {isScreen && hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />
      ) : !isScreen && hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      ) : !isScreen ? (
        <div className="w-full h-full flex items-center justify-center min-h-[inherit]">
          <div
            className={`rounded-full overflow-hidden ring-4 ring-black/25 ${
              filmstrip ? 'w-14 h-14 ring-0' : fill ? 'w-[min(28vmin,160px)] h-[min(28vmin,160px)]' : 'w-20 h-20'
            }`}
          >
            {avatarUrl ? (
              <img src={publicAssetUrl(avatarUrl)} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-black/35 flex items-center justify-center">
                <span className={`font-bold text-white ${filmstrip ? 'text-lg' : fill ? 'text-3xl' : 'text-2xl'}`}>{displayName.slice(0, 2).toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full h-full min-h-[80px] bg-black flex items-center justify-center text-[#949ba4] text-xs">No stream</div>
      )}

      <TileHoverExpand />

      {/* Discord-style stream indicator on thumbnails in the bottom rail */}
      {filmstrip && isScreen && hasVideo && (
        <div className="absolute bottom-7 left-1/2 z-[5] -translate-x-1/2 pointer-events-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          <ScreenShareIcon size={16} aria-hidden />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-2 flex items-end justify-between bg-gradient-to-t from-black/65 to-transparent pointer-events-none">
        <div className="flex items-center gap-1 min-w-0 rounded bg-black/50 px-1.5 py-0.5 max-w-[90%]">
          {participant.isMuted && (
            <MicIcon muted size={12} className="text-[#ed4245] shrink-0" />
          )}
          <span className={`text-xs font-medium truncate ${speaking ? 'text-riftapp-voice-speaking' : 'text-white'}`}>
            {isScreen ? `${displayName}'s screen` : displayName}
          </span>
        </div>
      </div>
    </button>
  );
}

function getAvatarColor(identity: string): string {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = identity.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 30%, 18%)`;
}
