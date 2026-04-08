import { useMemo, useState } from 'react';
import { ConnectionQuality, ConnectionState } from 'livekit-client';
import SoundboardPanel from './SoundboardPanel';
import {
  activityIcons,
  CameraIcon,
  DisconnectIcon,
  NoiseSuppressionIcon,
} from './VoiceIcons';
import { useVoiceStore } from '../../stores/voiceStore';

interface VoicePanelProps {
  connected: boolean;
  connecting: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  screenShareRequesting: boolean;
  screenShareSurfaceLabel?: string | null;
  screenShareNotice?: { tone: 'info' | 'error'; message: string } | null;
  streamName: string;
  hubName: string;
  hubId?: string | null;
  noiseSuppressionEnabled: boolean;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleNoiseSuppression: () => void;
  onDismissScreenShareNotice: () => void;
}

const ActivitiesIcon = activityIcons.game;
const ScreenShareControlIcon = activityIcons.screen;
const SoundboardControlIcon = activityIcons.soundboard;

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
        className={`h-9 w-9 rounded-xl border border-riftapp-border/40 bg-riftapp-surface/80 flex items-center justify-center transition-colors duration-150 group-hover:bg-riftapp-surface-hover ${toneClass}`}
        aria-label="Voice connection quality"
      >
        <div className={`flex h-[14px] items-end gap-[2px] ${reconnecting ? 'animate-pulse-soft' : ''}`}>
          {[0, 1, 2, 3].map((barIndex) => {
            const heights = ['h-[4px]', 'h-[7px]', 'h-[10px]', 'h-[13px]'];
            const active = activeBars > barIndex;
            return (
              <span
                key={barIndex}
                className={`block w-[3px] rounded-full transition-all duration-200 ${heights[barIndex]} ${active ? 'bg-current opacity-95' : 'bg-current opacity-20'}`}
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

function SecondaryControlButton({
  label,
  title,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-[56px] flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center transition-all duration-150 active:scale-[0.97] ${
        active
          ? 'border-riftapp-accent/55 bg-riftapp-accent/15 text-riftapp-text'
          : 'border-riftapp-border/40 bg-riftapp-surface/70 text-riftapp-text-dim hover:bg-riftapp-surface-hover hover:text-riftapp-text'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

function UtilityButton({
  label,
  title,
  active,
  danger,
  onClick,
  children,
}: {
  label: string;
  title: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneClass = danger
    ? 'border-riftapp-danger/35 bg-riftapp-danger/10 text-riftapp-danger hover:bg-riftapp-danger/15'
    : active
      ? 'border-riftapp-accent/45 bg-riftapp-accent/12 text-riftapp-text hover:bg-riftapp-accent/18'
      : 'border-riftapp-border/40 bg-riftapp-surface/70 text-riftapp-text-dim hover:bg-riftapp-surface-hover hover:text-riftapp-text';

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors ${toneClass}`}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function VoicePanel({
  connected,
  connecting,
  isCameraOn,
  isScreenSharing,
  screenShareRequesting,
  screenShareSurfaceLabel,
  screenShareNotice,
  streamName,
  hubName,
  hubId,
  noiseSuppressionEnabled,
  onLeave,
  onToggleCamera,
  onToggleScreenShare,
  onToggleNoiseSuppression,
  onDismissScreenShareNotice,
}: VoicePanelProps) {
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const connectionState = useVoiceStore((s) => s.connectionStats.state);
  const controlsDisabled = !connected || connecting;
  const status = useMemo(() => {
    if (connecting || connectionState === ConnectionState.Connecting) {
      return { label: 'Connecting...', className: 'text-riftapp-warning' };
    }
    if (
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting
    ) {
      return { label: 'Reconnecting...', className: 'text-riftapp-warning' };
    }
    return { label: 'Voice Connected', className: 'text-riftapp-success' };
  }, [connecting, connectionState]);

  if (!connected && !connecting) return null;

  const channelLabel = streamName && hubName ? `${streamName} / ${hubName}` : streamName || hubName;

  return (
    <div className="voice-panel rounded-xl border border-riftapp-border/40 bg-riftapp-panel/75 px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)] animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold ${status.className}`}>{status.label}</p>
          <p className="mt-0.5 truncate text-[11px] text-riftapp-text-dim">{channelLabel}</p>
        </div>
        <ConnectionQualityIndicator />
      </div>

      {screenShareNotice && (
        <div
          className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[12px] ${
            screenShareNotice.tone === 'error'
              ? 'border-[#f23f42]/30 bg-[#f23f42]/10 text-[#ffb3b5]'
              : 'border-[#5865f2]/30 bg-[#5865f2]/10 text-[#cdd3ff]'
          }`}
        >
          <span>{screenShareNotice.message}</span>
          <button
            type="button"
            onClick={onDismissScreenShareNotice}
            className="text-[#dbdee1] hover:text-white transition-colors"
            aria-label="Dismiss screen share notice"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {connected && isScreenSharing && screenShareSurfaceLabel && (
        <div className="mt-3 rounded-xl border border-[#ed4245]/30 bg-[#ed4245]/10 px-3 py-2.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#ed4245] px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span>
            <p className="min-w-0 truncate font-semibold text-white">Sharing {screenShareSurfaceLabel}</p>
          </div>
          <p className="mt-1 text-[#ffcccf]">Your browser picker only appears when you start a new share.</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2">
        <SecondaryControlButton
          label="Camera"
          title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
          onClick={onToggleCamera}
          disabled={controlsDisabled}
          active={isCameraOn}
        >
          <CameraIcon enabled={isCameraOn} size={20} />
        </SecondaryControlButton>
        <SecondaryControlButton
          label="Share"
          title={isScreenSharing ? 'Stop Sharing' : 'Share Your Screen'}
          onClick={onToggleScreenShare}
          disabled={controlsDisabled || screenShareRequesting}
          active={isScreenSharing}
        >
          {screenShareRequesting ? (
            <span className="h-5 w-5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
          ) : (
            <ScreenShareControlIcon active={isScreenSharing} size={20} />
          )}
        </SecondaryControlButton>
        <SecondaryControlButton
          label="Soundboard"
          title="Soundboard"
          onClick={() => setSoundboardOpen((value) => !value)}
          disabled={controlsDisabled}
          active={soundboardOpen}
        >
          <SoundboardControlIcon size={20} />
        </SecondaryControlButton>
        <SecondaryControlButton
          label="Activities"
          title="Activities"
          onClick={() => {}}
          disabled
        >
          <ActivitiesIcon size={20} />
        </SecondaryControlButton>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <UtilityButton
          label={noiseSuppressionEnabled ? 'RNNoise On' : 'RNNoise Off'}
          title="RNNoise suppression"
          active={noiseSuppressionEnabled}
          onClick={() => void onToggleNoiseSuppression()}
        >
          <NoiseSuppressionIcon active={noiseSuppressionEnabled} size={16} />
        </UtilityButton>
        <UtilityButton label="Disconnect" title="Disconnect" danger onClick={onLeave}>
          <DisconnectIcon size={16} />
        </UtilityButton>
      </div>

      {soundboardOpen && hubId && (
        <div className="mt-2">
          <SoundboardPanel hubId={hubId} onClose={() => setSoundboardOpen(false)} />
        </div>
      )}
    </div>
  );
}
