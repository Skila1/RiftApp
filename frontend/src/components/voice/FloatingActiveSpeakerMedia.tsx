import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuthStore } from '../../stores/auth';
import {
  useActiveSpeakerStore,
  type FloatingMediaPosition,
} from '../../stores/activeSpeakerStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { CameraIcon, ScreenShareIcon, VoiceChannelIcon } from './VoiceIcons';

const FLOATING_MEDIA_MARGIN_PX = 20;
const FLOATING_MEDIA_MIN_MARGIN_PX = 12;

function positionsEqual(
  first: FloatingMediaPosition | null,
  second: FloatingMediaPosition | null,
) {
  return first?.x === second?.x && first?.y === second?.y;
}

function overlaySize() {
  const viewportWidth = typeof window === 'undefined' ? 240 : window.innerWidth;
  const width = Math.min(240, Math.max(188, viewportWidth - 24));
  const height = Math.round((width * 9) / 16);
  return { width, height };
}

function clampOverlayPosition(position: FloatingMediaPosition) {
  const { width, height } = overlaySize();
  const maxX = Math.max(FLOATING_MEDIA_MIN_MARGIN_PX, window.innerWidth - width - FLOATING_MEDIA_MIN_MARGIN_PX);
  const maxY = Math.max(FLOATING_MEDIA_MIN_MARGIN_PX, window.innerHeight - height - FLOATING_MEDIA_MIN_MARGIN_PX);

  return {
    x: Math.min(Math.max(FLOATING_MEDIA_MIN_MARGIN_PX, position.x), maxX),
    y: Math.min(Math.max(FLOATING_MEDIA_MIN_MARGIN_PX, position.y), maxY),
  };
}

function defaultOverlayPosition() {
  const { width, height } = overlaySize();
  return clampOverlayPosition({
    x: window.innerWidth - width - FLOATING_MEDIA_MARGIN_PX,
    y: window.innerHeight - height - FLOATING_MEDIA_MARGIN_PX,
  });
}

function avatarAccent(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 56%), hsl(${(hue + 38) % 360} 68% 40%))`;
}

function OverlayActionButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
  ariaDisabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaDisabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-floating-media-control="true"
      aria-label={label}
      aria-disabled={ariaDisabled}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full border text-white transition-colors ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-black/35 text-white/40'
          : active
          ? 'border-[#5865f2]/60 bg-[#5865f2]/80'
          : 'border-white/10 bg-black/55 hover:bg-black/75'
      }`}
    >
      {children}
    </button>
  );
}

export default function FloatingActiveSpeakerMedia() {
  const activeSpeaker = useActiveSpeakerStore((state) => state.activeSpeaker);
  const persistedPosition = useActiveSpeakerStore((state) => state.overlayPosition);
  const setOverlayPosition = useActiveSpeakerStore((state) => state.setOverlayPosition);
  const resetOverlayPosition = useActiveSpeakerStore((state) => state.resetOverlayPosition);
  const voiceTargetId = useVoiceStore((state) => state.targetId);
  const voiceTargetKind = useVoiceStore((state) => state.targetKind);
  const voiceOutputMuted = useVoiceStore((state) => state.voiceOutputMuted);
  const toggleVoiceOutputMute = useVoiceStore((state) => state.toggleVoiceOutputMute);
  const openVoiceView = useVoiceChannelUiStore((state) => state.openVoiceView);
  const authUser = useAuthStore((state) => state.user);
  const hubMembers = usePresenceStore((state) => state.hubMembers);

  const [position, setPosition] = useState<FloatingMediaPosition | null>(persistedPosition);
  const [isDragging, setIsDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const participant = useMemo(() => {
    if (!activeSpeaker) {
      return null;
    }

    if (authUser?.id === activeSpeaker.userId) {
      return {
        ...(hubMembers[activeSpeaker.userId] ?? {}),
        ...authUser,
      };
    }

    return hubMembers[activeSpeaker.userId] ?? null;
  }, [activeSpeaker, authUser, hubMembers]);

  const displayName = activeSpeaker
    ? participant?.display_name || participant?.username || activeSpeaker.userId
    : '';
  const avatarUrl = participant?.avatar_url;
  const mediaKey = activeSpeaker
    ? `${activeSpeaker.userId}:${activeSpeaker.trackType ?? 'avatar'}`
    : 'none';
  const showVideo = Boolean(activeSpeaker?.track);

  useEffect(() => {
    const element = videoRef.current;
    const track = activeSpeaker?.track;
    if (!element || !track) {
      return;
    }

    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [activeSpeaker?.track, mediaKey]);

  useEffect(() => {
    if (!activeSpeaker || isDragging) {
      return;
    }

    const next = clampOverlayPosition(persistedPosition ?? defaultOverlayPosition());
    setPosition((current) => (positionsEqual(current, next) ? current : next));
    if (!positionsEqual(persistedPosition, next)) {
      setOverlayPosition(next);
    }
  }, [activeSpeaker, isDragging, persistedPosition, setOverlayPosition]);

  useEffect(() => {
    if (!activeSpeaker || isDragging) {
      return undefined;
    }

    const handleResize = () => {
      const base = useActiveSpeakerStore.getState().overlayPosition ?? defaultOverlayPosition();
      const next = clampOverlayPosition(base);
      setPosition(next);
      if (!positionsEqual(useActiveSpeakerStore.getState().overlayPosition, next)) {
        setOverlayPosition(next);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [activeSpeaker, isDragging, setOverlayPosition]);

  if (!activeSpeaker || !position || typeof document === 'undefined') {
    return null;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('[data-floating-media-control="true"]')) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
      moved: false,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const next = clampOverlayPosition({
      x: event.clientX - dragState.offsetX,
      y: event.clientY - dragState.offsetY,
    });

    if (Math.abs(next.x - position.x) > 2 || Math.abs(next.y - position.y) > 2) {
      dragState.moved = true;
    }

    setPosition(next);
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setOverlayPosition(position);

    if (!dragState.moved && voiceTargetId) {
      openVoiceView(voiceTargetId, voiceTargetKind ?? 'stream');
    }
  };

  const closeDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setOverlayPosition(position);
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[360]">
      <motion.div
        role="button"
        aria-label={`${displayName} active speaker media`}
        tabIndex={0}
        style={{ left: position.x, top: position.y, touchAction: 'none' }}
        className="pointer-events-auto absolute select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={closeDrag}
        animate={{
          boxShadow: activeSpeaker.isSpeaking
            ? '0 0 0 2px rgba(88, 101, 242, 0.82), 0 14px 40px rgba(0, 0, 0, 0.58)'
            : '0 14px 40px rgba(0, 0, 0, 0.52)',
          scale: isDragging ? 1.02 : 1,
        }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <div className="group relative aspect-video w-[min(240px,calc(100vw-24px))] overflow-hidden rounded-[16px] border border-white/10 bg-[#0f1115]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mediaKey}
              initial={{ opacity: 0.7, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              {showVideo ? (
                <div className="relative h-full w-full bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full ${
                      activeSpeaker.trackType === 'screenshare' ? 'object-contain bg-black' : 'object-cover'
                    }`}
                  />
                </div>
              ) : (
                <div
                  className="relative flex h-full w-full items-center justify-center"
                  style={{ background: avatarAccent(activeSpeaker.userId) }}
                >
                  <div
                    className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-black/20 text-[28px] font-semibold text-white transition-transform duration-200 ${
                      activeSpeaker.isSpeaking ? 'scale-[1.03] ring-4 ring-[#5865f2]/45' : ''
                    }`}
                  >
                    {avatarUrl ? (
                      <img
                        src={publicAssetUrl(avatarUrl)}
                        alt={displayName}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      displayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/45 to-transparent px-3 pb-3 pt-8">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 backdrop-blur-sm">
                <div className="flex items-center gap-1.5">
                  {activeSpeaker.trackType === 'screenshare' ? (
                    <ScreenShareIcon size={13} active className="shrink-0 text-[#8ea1ff]" />
                  ) : activeSpeaker.trackType === 'camera' ? (
                    <CameraIcon size={13} enabled className="shrink-0 text-[#8ea1ff]" />
                  ) : null}
                  <span className="truncate text-[13px] font-semibold text-white">{displayName}</span>
                </div>
              </div>

              {activeSpeaker.isSpeaking && (
                <span className="rounded-full border border-[#5865f2]/40 bg-[#5865f2]/18 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#dbe1ff]">
                  Live
                </span>
              )}
            </div>
          </div>

          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100">
            <span className={`h-2 w-2 rounded-full ${activeSpeaker.isSpeaking ? 'bg-[#3ba55d]' : 'bg-white/35'}`} />
            {isDragging ? 'Dragging' : activeSpeaker.isSpeaking ? 'Speaking' : 'Held'}
          </div>

          <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <OverlayActionButton
              label={voiceTargetId ? 'Open voice view' : 'Voice view unavailable'}
              disabled={!voiceTargetId}
              ariaDisabled={!voiceTargetId}
              onClick={() => {
                if (voiceTargetId) {
                  openVoiceView(voiceTargetId, voiceTargetKind ?? 'stream');
                }
              }}
            >
              <VoiceChannelIcon size={15} />
            </OverlayActionButton>
            <OverlayActionButton
              label={voiceOutputMuted ? 'Unmute voice output' : 'Mute voice output'}
              onClick={() => void toggleVoiceOutputMute()}
              active={voiceOutputMuted}
            >
              {voiceOutputMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </OverlayActionButton>
            <OverlayActionButton
              label="Reset overlay position"
              onClick={() => {
                resetOverlayPosition();
                const next = defaultOverlayPosition();
                setPosition(next);
                setOverlayPosition(next);
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <polyline points="3 3 3 9 9 9" />
              </svg>
            </OverlayActionButton>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}