import { useCallback, useMemo, useState } from 'react';
import { ConnectionQuality, ConnectionState } from 'livekit-client';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useSelfProfileStore } from '../../stores/selfProfileStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useHubStore } from '../../stores/hubStore';
import { useStreamStore } from '../../stores/streamStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import StatusDot, { statusLabel } from '../shared/StatusDot';
import SoundboardPanel from './SoundboardPanel';
import {
  MicIcon,
  HeadphonesIcon,
  CameraIcon,
  SettingsIcon,
  DisconnectIcon,
  NoiseSuppressionIcon,
  activityIcons,
} from './VoiceIcons';

const ActivitiesIcon = activityIcons.game;
const ScreenShareIcon = activityIcons.screen;
const SoundboardControlIcon = activityIcons.soundboard;

/* ── Connection quality indicator ── */

function qualityLabel(quality: ConnectionQuality) {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 'Excellent';
    case ConnectionQuality.Good:
      return 'Good';
    case ConnectionQuality.Poor:
      return 'Poor';
    case ConnectionQuality.Lost:
      return 'Lost';
    default:
      return 'Unknown';
  }
}

function ConnectionQualityIndicator() {
  const connectionStats = useVoiceStore((s) => s.connectionStats);
  const reconnecting =
    connectionStats.state === ConnectionState.Reconnecting ||
    connectionStats.state === ConnectionState.SignalReconnecting ||
    connectionStats.state === ConnectionState.Connecting;
  const toneClass = reconnecting
    ? 'text-[#8e949c]'
    : connectionStats.tone === 'good'
      ? 'text-[#7bc78d]'
      : connectionStats.tone === 'medium'
        ? 'text-[#d4ba6e]'
        : connectionStats.tone === 'bad'
          ? 'text-[#d98181]'
          : 'text-[#949ba4]';
  const activeBars = reconnecting ? 4 : connectionStats.bars;
  const hasDetailedStats =
    connectionStats.pingMs != null ||
    connectionStats.jitterMs != null ||
    connectionStats.packetLossPct != null;

  return (
    <div className="relative group">
      <div
        className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors duration-150 hover:bg-white/10 ${toneClass}`}
        aria-label="Voice connection quality"
      >
        <div className={`flex h-[12px] items-end gap-[1.5px] ${reconnecting ? 'animate-pulse-soft' : ''}`}>
          {[0, 1, 2, 3].map((barIndex) => {
            const heights = ['h-[3px]', 'h-[6px]', 'h-[9px]', 'h-[12px]'];
            const active = activeBars > barIndex;
            return (
              <span
                key={barIndex}
                className={`block w-[2.5px] rounded-full transition-all duration-200 ${heights[barIndex]} ${active ? 'bg-current opacity-95' : 'bg-current opacity-20'}`}
              />
            );
          })}
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-max min-w-[180px] rounded-lg border border-black/50 bg-[#111214] px-3 py-2 text-[12px] leading-snug text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        role="tooltip"
      >
        <div className="font-semibold text-white">Connection Quality</div>
        {reconnecting ? (
          <div className="mt-1 text-[#b5bac1]">Status: Reconnecting...</div>
        ) : connectionStats.state === ConnectionState.Connecting ? (
          <div className="mt-1 text-[#b5bac1]">Status: Connecting...</div>
        ) : connectionStats.state === ConnectionState.Disconnected ? (
          <div className="mt-1 text-[#b5bac1]">Status: Disconnected</div>
        ) : null}
        {connectionStats.pingMs != null && <div className="mt-1 text-[#dbdee1]">Ping: {connectionStats.pingMs}ms</div>}
        {connectionStats.jitterMs != null && <div className="text-[#dbdee1]">Jitter: {connectionStats.jitterMs}ms</div>}
        {connectionStats.packetLossPct != null && <div className="text-[#dbdee1]">Packet Loss: {connectionStats.packetLossPct.toFixed(1)}%</div>}
        {!hasDetailedStats && connectionStats.state === ConnectionState.Connected && (
          <div className="mt-1 text-[#b5bac1]">
            {connectionStats.source === 'livekit'
              ? `Quality: ${qualityLabel(connectionStats.quality)}`
              : 'Stats unavailable'}
          </div>
        )}
        <div
          className="absolute right-4 top-full h-0 w-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#111214]"
          aria-hidden
        />
      </div>
    </div>
  );
}

/* ── Small voice control button ── */

function VoiceControlBtn({
  title,
  onClick,
  disabled,
  active,
  danger,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90
        ${
          danger
            ? 'bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30'
            : active
              ? 'text-white bg-white/[0.15] hover:bg-white/[0.22]'
              : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-white/[0.08]'
        }
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

/* ── Main bottom bar ── */

export default function VoiceBottomBar() {
  const user = useAuthStore((s) => s.user);

  const voiceConnected = useVoiceStore((s) => s.connected);
  const voiceConnecting = useVoiceStore((s) => s.connecting);
  const voiceIsMuted = useVoiceStore((s) => s.isMuted);
  const voiceIsDeafened = useVoiceStore((s) => s.isDeafened);
  const voiceIsCameraOn = useVoiceStore((s) => s.isCameraOn);
  const voiceIsScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const voiceToggleMute = useVoiceStore((s) => s.toggleMute);
  const voiceToggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const voiceToggleCamera = useVoiceStore((s) => s.toggleCamera);
  const voiceToggleScreenShare = useVoiceStore((s) => s.toggleScreenShare);
  const voiceLeave = useVoiceStore((s) => s.leave);
  const voiceStreamId = useVoiceStore((s) => s.streamId);
  const voiceScreenShareRequesting = useVoiceStore((s) => s.screenShareRequesting);
  const voiceScreenShareNotice = useVoiceStore((s) => s.screenShareNotice);
  const voiceDismissScreenShareNotice = useVoiceStore((s) => s.dismissScreenShareNotice);
  const voiceNoiseSuppressionEnabled = useVoiceStore((s) => s.noiseSuppressionEnabled);
  const voiceToggleNoiseSuppression = useVoiceStore((s) => s.toggleNoiseSuppression);
  const connectionState = useVoiceStore((s) => s.connectionStats.state);

  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubs = useHubStore((s) => s.hubs);
  const streams = useStreamStore((s) => s.streams);
  const activeVoiceChannelId = useVoiceChannelUiStore((s) => s.activeChannelId);
  const closeVoiceView = useVoiceChannelUiStore((s) => s.closeVoiceView);

  const liveStatus = usePresenceStore((s) => (user ? s.presence[user.id] : undefined));
  const openSelfProfile = useSelfProfileStore((s) => s.open);
  const openSettings = useAppSettingsStore((s) => s.openSettings);

  const [soundboardOpen, setSoundboardOpen] = useState(false);

  const activeHub = hubs.find((h) => h.id === activeHubId);
  const voiceStream = streams.find((s) => s.id === (voiceStreamId ?? activeVoiceChannelId));
  const inVoice = voiceConnected || voiceConnecting;
  const controlsDisabled = !voiceConnected || voiceConnecting;

  const handleLeave = useCallback(() => {
    closeVoiceView();
    void voiceLeave();
    setSoundboardOpen(false);
  }, [closeVoiceView, voiceLeave]);

  const handleAvatarClick = useCallback(
    (e: React.MouseEvent) => {
      openSelfProfile((e.currentTarget as HTMLElement).getBoundingClientRect());
    },
    [openSelfProfile],
  );

  const voiceStatus = useMemo(() => {
    if (voiceConnecting || connectionState === ConnectionState.Connecting) {
      return { label: 'Connecting...', className: 'text-[#faa61a]' };
    }
    if (
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting
    ) {
      return { label: 'Reconnecting...', className: 'text-[#faa61a]' };
    }
    return { label: 'Voice Connected', className: 'text-[#23a55a]' };
  }, [voiceConnecting, connectionState]);

  if (!user) return null;

  const currentStatus = liveStatus ?? user.status;

  const channelLabel = voiceStream
    ? `${voiceStream.name}${activeHub ? ` / ${activeHub.name}` : ''}`
    : '';

  return (
    <div className="flex-shrink-0 bg-[#232428]">
      {/* ── Voice Connected Section ── */}
      {inVoice && (
        <>
          {/* Status row */}
          <div className="flex items-center gap-2 px-3 pt-2 pb-1 border-t border-[#1a1b1e]">
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold leading-tight ${voiceStatus.className}`}>
                {voiceStatus.label}
              </p>
              {channelLabel && (
                <p className="text-[11px] text-[#b5bac1] truncate leading-tight mt-0.5">
                  {channelLabel}
                </p>
              )}
            </div>
            <ConnectionQualityIndicator />
            <VoiceControlBtn title="Disconnect" onClick={handleLeave} danger>
              <DisconnectIcon size={18} />
            </VoiceControlBtn>
          </div>

          {/* Screen share notice */}
          {voiceScreenShareNotice && (
            <div
              className={`mx-2 mt-1 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[12px] ${
                voiceScreenShareNotice.tone === 'error'
                  ? 'border-[#f23f42]/30 bg-[#f23f42]/10 text-[#ffb3b5]'
                  : 'border-[#5865f2]/30 bg-[#5865f2]/10 text-[#cdd3ff]'
              }`}
            >
              <span className="truncate">{voiceScreenShareNotice.message}</span>
              <button
                type="button"
                onClick={voiceDismissScreenShareNotice}
                className="text-[#dbdee1] hover:text-white transition-colors flex-shrink-0"
                aria-label="Dismiss"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* 3-section control row */}
          <div className="flex items-center px-2 py-1.5">
            {/* LEFT: Avatar + Name + Status */}
            <button
              onClick={handleAvatarClick}
              className="flex items-center gap-2 min-w-0 flex-shrink-0 px-1 py-1 rounded-md hover:bg-white/[0.06] transition-colors"
              title="View Profile"
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-semibold text-white overflow-hidden">
                  {user.avatar_url ? (
                    <img src={publicAssetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user.display_name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <StatusDot
                  userId={user.id}
                  fallbackStatus={user.status}
                  size="lg"
                  className="absolute -bottom-0.5 -right-0.5 border-[2.5px] border-[#232428]"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#f2f3f5] truncate leading-tight max-w-[72px]">{user.display_name}</p>
                <p className="text-[11px] text-[#b5bac1] truncate leading-tight">{statusLabel(currentStatus)}</p>
              </div>
            </button>

            {/* CENTER: Mute, Deafen, Camera, Screenshare */}
            <div className="flex items-center gap-1 mx-auto">
              <VoiceControlBtn
                title={voiceIsMuted ? 'Unmute' : 'Mute'}
                onClick={voiceToggleMute}
                danger={voiceIsMuted}
              >
                <MicIcon muted={voiceIsMuted} size={20} />
              </VoiceControlBtn>
              <VoiceControlBtn
                title={voiceIsDeafened ? 'Undeafen' : 'Deafen'}
                onClick={voiceToggleDeafen}
                danger={voiceIsDeafened}
              >
                <HeadphonesIcon deafened={voiceIsDeafened} size={20} />
              </VoiceControlBtn>
              <VoiceControlBtn
                title={voiceIsCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
                onClick={voiceToggleCamera}
                disabled={controlsDisabled}
                active={voiceIsCameraOn}
              >
                <CameraIcon enabled={voiceIsCameraOn} size={20} />
              </VoiceControlBtn>
              <VoiceControlBtn
                title={voiceIsScreenSharing ? 'Stop Sharing' : 'Share Your Screen'}
                onClick={voiceToggleScreenShare}
                disabled={controlsDisabled || voiceScreenShareRequesting}
                active={voiceIsScreenSharing}
              >
                {voiceScreenShareRequesting ? (
                  <span className="h-5 w-5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                ) : (
                  <ScreenShareIcon active={voiceIsScreenSharing} size={20} />
                )}
              </VoiceControlBtn>
            </div>

            {/* RIGHT: Activities, Soundboard */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <VoiceControlBtn title="Activities" disabled>
                <ActivitiesIcon size={20} />
              </VoiceControlBtn>
              <VoiceControlBtn
                title="Soundboard"
                onClick={() => setSoundboardOpen((v) => !v)}
                disabled={controlsDisabled}
                active={soundboardOpen}
              >
                <SoundboardControlIcon size={20} />
              </VoiceControlBtn>
            </div>
          </div>

          {/* Utility row: Noise suppression */}
          <div className="flex items-center gap-2 px-2 pb-2">
            <button
              type="button"
              onClick={() => void voiceToggleNoiseSuppression()}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                voiceNoiseSuppressionEnabled
                  ? 'bg-[#5865f2]/15 text-[#cdd3ff] hover:bg-[#5865f2]/20'
                  : 'bg-white/[0.04] text-[#949ba4] hover:bg-white/[0.08] hover:text-[#dbdee1]'
              }`}
              title="Noise suppression"
            >
              <NoiseSuppressionIcon active={voiceNoiseSuppressionEnabled} size={14} />
              <span className="truncate">
                {voiceNoiseSuppressionEnabled ? 'Noise Suppression On' : 'Noise Suppression Off'}
              </span>
            </button>
          </div>

          {/* Soundboard panel */}
          {soundboardOpen && activeHubId && (
            <div className="px-2 pb-2">
              <SoundboardPanel hubId={activeHubId} onClose={() => setSoundboardOpen(false)} />
            </div>
          )}
        </>
      )}

      {/* ── User Bar (when NOT in voice) ── */}
      {!inVoice && (
        <div className="h-[52px] flex items-center px-1.5 border-t border-[#1a1b1e]">
          {/* Avatar + name */}
          <button
            onClick={handleAvatarClick}
            className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1 rounded-md hover:bg-white/[0.06] transition-all duration-150 group"
            title="View Profile"
          >
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-semibold text-white overflow-hidden">
                {user.avatar_url ? (
                  <img src={publicAssetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.display_name.slice(0, 2).toUpperCase()
                )}
              </div>
              <StatusDot
                userId={user.id}
                fallbackStatus={user.status}
                size="lg"
                className="absolute -bottom-0.5 -right-0.5 border-[2.5px] border-[#232428]"
              />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-semibold truncate leading-tight">{user.display_name}</p>
              <p className="text-[11px] text-[#b5bac1] truncate leading-tight">{statusLabel(currentStatus)}</p>
            </div>
          </button>

          {/* Control buttons */}
          <div className="flex items-center flex-shrink-0">
            <button
              onClick={voiceToggleMute}
              title={voiceIsMuted ? 'Unmute' : 'Mute'}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150 active:scale-90 ${
                voiceIsMuted
                  ? 'text-[#ed4245] hover:bg-[#ed4245]/10'
                  : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-white/[0.06]'
              }`}
            >
              <MicIcon muted={voiceIsMuted} size={18} />
            </button>
            <button
              onClick={voiceToggleDeafen}
              title={voiceIsDeafened ? 'Undeafen' : 'Deafen'}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150 active:scale-90 ${
                voiceIsDeafened
                  ? 'text-[#ed4245] hover:bg-[#ed4245]/10'
                  : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-white/[0.06]'
              }`}
            >
              <HeadphonesIcon deafened={voiceIsDeafened} size={18} />
            </button>
            <button
              onClick={() => openSettings('profile')}
              title="User Settings"
              className="w-8 h-8 rounded-md flex items-center justify-center text-[#b5bac1]
                hover:text-[#dbdee1] hover:bg-white/[0.06] transition-all duration-150 active:scale-90"
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
