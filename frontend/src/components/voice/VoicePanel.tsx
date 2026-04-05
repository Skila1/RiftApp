import { useMemo, useState } from 'react';
import { ConnectionState, ConnectionQuality } from 'livekit-client';
import SoundboardPanel from './SoundboardPanel';
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

function NoiseSuppressionIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={active ? 'text-riftapp-text' : 'text-riftapp-text-dim'} aria-hidden>
      <rect x="4" y="10" width="2.5" height="8" rx="1" fill="currentColor" />
      <rect x="8" y="6" width="2.5" height="16" rx="1" fill="currentColor" />
      <rect x="12" y="3" width="2.5" height="22" rx="1" fill="currentColor" opacity={active ? 1 : 0.45} />
      <rect x="16" y="7" width="2.5" height="14" rx="1" fill="currentColor" />
      <rect x="20" y="11" width="2.5" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

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
    <div className="relative group ml-auto">
      <div
        className={`h-[42px] w-[42px] rounded-xl border border-riftapp-border/40 bg-riftapp-surface/80 flex items-center justify-center transition-colors duration-150 group-hover:bg-riftapp-surface-hover ${toneClass}`}
        aria-label="Voice connection quality"
      >
        <div className={`flex h-[16px] items-end gap-[2px] ${reconnecting ? 'animate-pulse-soft' : ''}`}>
          {[0, 1, 2, 3].map((barIndex) => {
            const heights = ['h-[5px]', 'h-[8px]', 'h-[11px]', 'h-[14px]'];
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
          <div className="mt-1 text-[#b5bac1]">Status: Reconnecting…</div>
        ) : connectionStats.state === ConnectionState.Connecting ? (
          <div className="mt-1 text-[#b5bac1]">Status: Connecting…</div>
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
      return { label: 'Connecting…', className: 'text-riftapp-warning' };
    }
    if (
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting
    ) {
      return { label: 'Reconnecting…', className: 'text-riftapp-warning' };
    }
    return { label: 'Voice Connected', className: 'text-riftapp-success' };
  }, [connecting, connectionState]);

  if (!connected && !connecting) return null;

  return (
    <div className="border-t border-riftapp-border/40 bg-riftapp-panel/50 px-3 pt-3 pb-2.5 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center min-w-0">
          <span className={`text-[13px] font-semibold ${status.className}`}>
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Noise suppression control */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => void onToggleNoiseSuppression()}
              disabled={connecting}
              aria-pressed={noiseSuppressionEnabled}
              aria-label="Noise suppression"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150 active:scale-90 disabled:opacity-40 ${
                noiseSuppressionEnabled
                  ? 'bg-riftapp-surface-hover text-riftapp-text ring-1 ring-riftapp-success/35'
                  : 'text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-surface-hover/80'
              }`}
            >
              <NoiseSuppressionIcon active={noiseSuppressionEnabled} />
            </button>
            {/* Tooltip bubble (Discord-style) */}
            <div
              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-black/50 bg-[#111214] px-3 py-2 text-center text-[12px] leading-snug text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              role="tooltip"
            >
              Noise Suppression
              <div
                className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#111214]"
                aria-hidden
              />
            </div>
          </div>
          {/* Disconnect */}
          <button
            onClick={onLeave}
            title="Disconnect"
            className="w-7 h-7 rounded-md flex items-center justify-center text-riftapp-text-dim hover:text-riftapp-danger hover:bg-riftapp-danger/10 transition-all duration-150 active:scale-90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.42 8.63 7.51 7 12 7s8.58 1.63 11.71 4.72c.18.18.29.44.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.997.997 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Channel / Hub name */}
      <p className="text-[11px] text-riftapp-text-dim truncate mb-3 ml-3.5">
        {streamName} / {hubName}
      </p>

      {screenShareNotice && (
        <div className={`mb-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[12px] ${
          screenShareNotice.tone === 'error'
            ? 'border-[#f23f42]/30 bg-[#f23f42]/10 text-[#ffb3b5]'
            : 'border-[#5865f2]/30 bg-[#5865f2]/10 text-[#cdd3ff]'
        }`}>
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
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#ed4245]/30 bg-[#ed4245]/10 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#ed4245] px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span>
              <p className="text-[13px] font-semibold text-white truncate">Sharing {screenShareSurfaceLabel}</p>
            </div>
            <p className="text-[11px] text-[#ffcccf] mt-1 truncate">Your browser picker is active only when starting a new share.</p>
          </div>
          <button
            type="button"
            onClick={onToggleScreenShare}
            className="px-3 py-2 rounded-xl bg-[#ed4245] text-white text-[12px] font-semibold hover:bg-[#c93b3e] transition-colors"
          >
            Stop Sharing
          </button>
        </div>
      )}

      {/* Big control buttons */}
      {(connected || connecting) && (
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            {/* Camera */}
            <button
              onClick={onToggleCamera}
              title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
              disabled={controlsDisabled}
              className={`w-[68px] h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
                isCameraOn
                  ? 'bg-riftapp-text text-riftapp-bg'
                  : 'bg-riftapp-surface hover:bg-riftapp-surface-hover text-riftapp-text-muted hover:text-riftapp-text'
              } disabled:opacity-50 disabled:hover:bg-riftapp-surface disabled:hover:text-riftapp-text-muted`}
            >
              {isCameraOn ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>

            {/* Screen Share */}
            <button
              onClick={onToggleScreenShare}
              title={isScreenSharing ? 'Stop sharing' : 'Share your screen'}
              disabled={controlsDisabled || screenShareRequesting}
              className={`w-[68px] h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
                isScreenSharing
                  ? 'bg-riftapp-text text-riftapp-bg'
                  : 'bg-riftapp-surface hover:bg-riftapp-surface-hover text-riftapp-text-muted hover:text-riftapp-text'
              } disabled:opacity-50`}
            >
              {screenShareRequesting ? (
                <span className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                  {isScreenSharing && <path d="M9 10l2 2 4-4" />}
                </svg>
              )}
            </button>

            {/* Activities (placeholder) */}
            <button
              title="Activities"
              disabled={controlsDisabled}
              className="w-[68px] h-[42px] rounded-xl flex items-center justify-center bg-riftapp-surface hover:bg-riftapp-surface-hover text-riftapp-text-muted hover:text-riftapp-text transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:hover:bg-riftapp-surface disabled:hover:text-riftapp-text-muted"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <circle cx="17.5" cy="6.5" r="3.5" />
                <path d="M8 18l4-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Soundboard */}
            <div className="relative">
              <button
                onClick={() => setSoundboardOpen((v) => !v)}
                title="Soundboard"
                disabled={controlsDisabled}
                className={`w-[68px] h-[42px] rounded-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
                  soundboardOpen
                    ? 'bg-riftapp-text text-riftapp-bg'
                    : 'bg-riftapp-surface hover:bg-riftapp-surface-hover text-riftapp-text-muted hover:text-riftapp-text'
                } disabled:opacity-50 disabled:hover:bg-riftapp-surface disabled:hover:text-riftapp-text-muted`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </button>
              {soundboardOpen && hubId && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                  <SoundboardPanel hubId={hubId} onClose={() => setSoundboardOpen(false)} />
                </div>
              )}
            </div>
          </div>

          <ConnectionQualityIndicator />
        </div>
      )}
    </div>
  );
}
