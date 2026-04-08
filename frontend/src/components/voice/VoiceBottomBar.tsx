import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { ConnectionState } from 'livekit-client';
import { useVoiceStore, type ScreenShareNotice } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useSelfProfileStore } from '../../stores/selfProfileStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useHubStore } from '../../stores/hubStore';
import { useStreamStore } from '../../stores/streamStore';
import { useVoiceChannelUiStore } from '../../stores/voiceChannelUiStore';
import type { User } from '../../types';
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
const MAX_PING_HISTORY_POINTS = 28;
const MIN_GRAPH_TOP_MS = 26;

type VoiceTone = 'success' | 'warning';

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 9h-1V7a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-6 0V7a2 2 0 1 1 4 0v2h-4Z" />
    </svg>
  );
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function VoiceNoticeBanner({
  notice,
  onDismiss,
  className,
}: {
  notice: ScreenShareNotice;
  onDismiss: () => void;
  className: string;
}) {
  return (
    <div
      className={`${className} flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-[12px] ${
        notice.tone === 'error'
          ? 'border-[#f23f42]/30 bg-[#f23f42]/10 text-[#ffb3b5]'
          : 'border-[#5865f2]/30 bg-[#5865f2]/10 text-[#cdd3ff]'
      }`}
    >
      <span className="truncate">{notice.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 text-riftapp-text-muted transition-colors hover:text-white"
        aria-label="Dismiss"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

function HeaderActionButton({
  title,
  onClick,
  disabled,
  danger,
  active,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-[#b5bac1] transition-all duration-150 ${
        danger
          ? 'hover:bg-[#ed4245]/12 hover:text-[#ed4245]'
          : active
            ? 'bg-white/[0.08] text-[#f2f3f5] hover:bg-white/[0.11]'
            : 'hover:bg-white/[0.08] hover:text-[#f2f3f5]'
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {children}
    </button>
  );
}

function VoiceSquareButton({
  title,
  onClick,
  disabled,
  active,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-full items-center justify-center rounded-[7px] transition-colors duration-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${
        active
          ? 'bg-[#404249] text-[#f2f3f5]'
          : 'bg-[#313338] text-[#b5bac1] hover:bg-[#3a3d43] hover:text-[#f2f3f5]'
      } disabled:cursor-not-allowed disabled:bg-[#2b2d31] disabled:text-[#6f737a] disabled:hover:text-[#6f737a]`}
    >
      {children}
    </button>
  );
}

function UserActionButton({
  title,
  onClick,
  active,
  danger,
  compact,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex items-center justify-center rounded-md transition-all duration-150 ${compact ? 'h-7 w-6' : 'h-7 w-7'} ${
        danger
          ? 'text-[#ed4245] hover:bg-[#ed4245]/10 hover:text-[#ff676b]'
          : active
            ? 'bg-white/[0.08] text-[#f2f3f5]'
            : 'text-[#b5bac1] hover:bg-white/[0.06] hover:text-[#f2f3f5]'
      }`}
    >
      {children}
    </button>
  );
}

function QuickMenuButton({
  children,
  onClick,
  danger,
  trailing,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
        danger ? 'text-[#ffb3b5] hover:bg-[#ed4245]/12' : 'text-[#dbdee1] hover:bg-white/[0.06]'
      }`}
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}

function formatCompactPing(value: number | null) {
  return `${Math.max(0, Math.round(value ?? 0))}ms`;
}

function averagePing(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatEndpointLabel(endpoint: string | null) {
  if (!endpoint) {
    return 'Unavailable';
  }

  try {
    const parsed = new URL(endpoint);
    const normalizedPath = parsed.pathname.replace(/\/$/, '');
    const suffix = normalizedPath && normalizedPath !== '/' ? normalizedPath : '';
    return `${parsed.host}${suffix}`;
  } catch {
    return endpoint.replace(/^[a-z]+:\/\//i, '').replace(/\/$/, '');
  }
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midpointX = (current.x + next.x) / 2;
    path += ` C ${midpointX} ${current.y}, ${midpointX} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function createGraphScale(values: number[]) {
  const highestValue = values.length > 0 ? Math.max(...values) : 0;
  const top = Math.max(MIN_GRAPH_TOP_MS, Math.ceil((highestValue + 4) / 2) * 2);
  const labels = Array.from({ length: 5 }, (_, index) => Math.round((top / 4) * (4 - index)));
  return { top, labels };
}

function ConnectionBarsIcon({
  bars,
  tone,
}: {
  bars: 0 | 1 | 2 | 3 | 4;
  tone: VoiceTone;
}) {
  const activeColor = tone === 'success' ? '#3ba55d' : '#faa61a';
  const inactiveColor = 'rgba(255,255,255,0.14)';
  const segmentColors = [0, 1, 2, 3].map((segmentIndex) => (bars > segmentIndex ? activeColor : inactiveColor));

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.1 11.75C2.1 10.82 2.86 10.06 3.79 10.06" stroke={segmentColors[0]} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M2.1 8.98C4.56 8.98 6.56 10.98 6.56 13.44" stroke={segmentColors[1]} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M2.1 6.17C6.12 6.17 9.37 9.43 9.37 13.44" stroke={segmentColors[2]} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M2.1 3.35C7.68 3.35 12.19 7.87 12.19 13.44" stroke={segmentColors[3]} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function VoiceConnectionGraph({ values }: { values: number[] }) {
  const chartWidth = 232;
  const chartHeight = 92;
  const { top, labels } = useMemo(() => createGraphScale(values), [values]);

  const points = useMemo(() => {
    if (values.length === 0) {
      return [] as Array<{ x: number; y: number }>;
    }

    return values.map((value, index) => ({
      x: values.length === 1 ? chartWidth : (index / (values.length - 1)) * chartWidth,
      y: chartHeight - (Math.max(0, Math.min(value, top)) / top) * chartHeight,
    }));
  }, [chartHeight, chartWidth, top, values]);

  const pathData = useMemo(() => buildSmoothPath(points), [points]);

  return (
    <div className="mt-3 flex gap-3">
      <div className="flex h-[92px] w-[24px] flex-col justify-between text-[10px] font-medium text-[#949ba4]">
        {labels.map((label) => (
          <span key={label}>{label}ms</span>
        ))}
      </div>
      <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
        {labels.map((label) => {
          const y = chartHeight - (label / top) * chartHeight;
          return (
            <line
              key={label}
              x1="0"
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
          );
        })}
        {pathData ? (
          <path
            d={pathData}
            fill="none"
            stroke="#2dc770"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </div>
  );
}

function ConnectionInfoRow({
  label,
  value,
  title,
  accent,
  leadingIcon,
}: {
  label: string;
  value: string;
  title?: string;
  accent?: boolean;
  leadingIcon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] leading-tight">
      <span className="flex-shrink-0 font-medium text-[#dcddde]">{label}</span>
      <div
        className={`ml-auto flex min-w-0 max-w-[188px] items-center justify-end gap-1.5 font-semibold ${accent ? 'text-[#2dc770]' : 'text-[#f2f3f5]'}`}
        title={title ?? value}
      >
        {leadingIcon ? <span className={accent ? 'text-[#2dc770]' : 'text-[#b5bac1]'}>{leadingIcon}</span> : null}
        <span className="truncate text-right">{value}</span>
      </div>
    </div>
  );
}

function VoiceConnectionPopover({
  popoverRef,
  pingHistory,
  currentPingMs,
  averagePingMs,
  endpoint,
  onClose,
}: {
  popoverRef: RefObject<HTMLDivElement>;
  pingHistory: number[];
  currentPingMs: number | null;
  averagePingMs: number;
  endpoint: string | null;
  onClose: () => void;
}) {
  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 z-40 mb-2 w-[320px] rounded-[8px] border border-white/[0.08] bg-[#23262d] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.45)]"
      role="dialog"
      aria-label="Voice connection details"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-bold leading-none text-[#f2f3f5]">Voice Connection</h3>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-md text-[#b5bac1] transition-colors hover:bg-white/[0.06] hover:text-[#f2f3f5]"
          aria-label="Close voice connection details"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <VoiceConnectionGraph values={pingHistory} />

      <div className="mt-5 space-y-2.5">
        <ConnectionInfoRow label="Current ping:" value={formatCompactPing(currentPingMs)} />
        <ConnectionInfoRow label="Average ping:" value={formatCompactPing(averagePingMs)} />
        <ConnectionInfoRow
          label="Endpoint:"
          value={formatEndpointLabel(endpoint)}
          title={endpoint ?? 'Unavailable'}
          accent
          leadingIcon={<LockIcon />}
        />
      </div>
    </div>
  );
}

function VoiceConnectionSummary({
  statusLabelText,
  statusTone,
  channelLabel,
  connectionBars,
  popoverOpen,
  pingHistory,
  currentPingMs,
  averagePingMs,
  endpoint,
  triggerRef,
  popoverRef,
  onTogglePopover,
  onClosePopover,
}: {
  statusLabelText: string;
  statusTone: VoiceTone;
  channelLabel: string;
  connectionBars: 0 | 1 | 2 | 3 | 4;
  popoverOpen: boolean;
  pingHistory: number[];
  currentPingMs: number | null;
  averagePingMs: number;
  endpoint: string | null;
  triggerRef: RefObject<HTMLButtonElement>;
  popoverRef: RefObject<HTMLDivElement>;
  onTogglePopover: () => void;
  onClosePopover: () => void;
}) {
  const success = statusTone === 'success';

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2.5 px-1 py-1">
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] ${
            success ? 'bg-[#183227]' : 'bg-[#3b2d14]'
          }`}
        >
          <ConnectionBarsIcon bars={connectionBars} tone={statusTone} />
        </div>

        <div className="min-w-0 flex-1">
          <button
            ref={triggerRef}
            type="button"
            onClick={onTogglePopover}
            className={`block max-w-full truncate rounded-sm text-left text-[14px] font-semibold leading-[1.1] transition-colors duration-150 hover:brightness-110 ${
              success ? 'text-[#3ba55d]' : 'text-[#faa61a]'
            }`}
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
          >
            {statusLabelText}
          </button>
          <p className="mt-[3px] truncate text-[11px] leading-none text-[#b5bac1]">{channelLabel}</p>
        </div>
      </div>

      {popoverOpen ? (
        <VoiceConnectionPopover
          popoverRef={popoverRef}
          pingHistory={pingHistory}
          currentPingMs={currentPingMs}
          averagePingMs={averagePingMs}
          endpoint={endpoint}
          onClose={onClosePopover}
        />
      ) : null}
    </div>
  );
}

function VoiceHeader({
  statusLabelText,
  statusTone,
  channelLabel,
  connectionBars,
  popoverOpen,
  pingHistory,
  currentPingMs,
  averagePingMs,
  endpoint,
  disableDeafen,
  noiseSuppressionEnabled,
  triggerRef,
  popoverRef,
  onTogglePopover,
  onClosePopover,
  onToggleNoiseSuppression,
  onLeave,
}: {
  statusLabelText: string;
  statusTone: VoiceTone;
  channelLabel: string;
  connectionBars: 0 | 1 | 2 | 3 | 4;
  popoverOpen: boolean;
  pingHistory: number[];
  currentPingMs: number | null;
  averagePingMs: number;
  endpoint: string | null;
  disableDeafen: boolean;
  noiseSuppressionEnabled: boolean;
  triggerRef: RefObject<HTMLButtonElement>;
  popoverRef: RefObject<HTMLDivElement>;
  onTogglePopover: () => void;
  onClosePopover: () => void;
  onToggleNoiseSuppression: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
      <VoiceConnectionSummary
        statusLabelText={statusLabelText}
        statusTone={statusTone}
        channelLabel={channelLabel}
        connectionBars={connectionBars}
        popoverOpen={popoverOpen}
        pingHistory={pingHistory}
        currentPingMs={currentPingMs}
        averagePingMs={averagePingMs}
        endpoint={endpoint}
        triggerRef={triggerRef}
        popoverRef={popoverRef}
        onTogglePopover={onTogglePopover}
        onClosePopover={onClosePopover}
      />

      <div className="flex flex-shrink-0 items-center gap-0.5">
        <HeaderActionButton
          title={noiseSuppressionEnabled ? 'Disable RNNoise' : 'Enable RNNoise'}
          onClick={onToggleNoiseSuppression}
          disabled={disableDeafen}
          active={noiseSuppressionEnabled}
        >
          <NoiseSuppressionIcon active={noiseSuppressionEnabled} size={16} />
        </HeaderActionButton>
        <HeaderActionButton title="Disconnect" onClick={onLeave} danger>
          <DisconnectIcon size={16} />
        </HeaderActionButton>
      </div>
    </div>
  );
}

function VoiceControlsRow({
  cameraOn,
  screenSharing,
  screenShareRequesting,
  soundboardOpen,
  disabled,
  onToggleCamera,
  onToggleScreenShare,
  onToggleSoundboard,
}: {
  cameraOn: boolean;
  screenSharing: boolean;
  screenShareRequesting: boolean;
  soundboardOpen: boolean;
  disabled: boolean;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleSoundboard: () => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-[6px] px-3 pb-3">
      <VoiceSquareButton
        title={cameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
        onClick={onToggleCamera}
        disabled={disabled}
        active={cameraOn}
      >
        <CameraIcon enabled={cameraOn} size={18} />
      </VoiceSquareButton>

      <VoiceSquareButton
        title={screenSharing ? 'Stop Sharing' : 'Share Your Screen'}
        onClick={onToggleScreenShare}
        disabled={disabled || screenShareRequesting}
        active={screenSharing}
      >
        {screenShareRequesting ? (
          <span className="h-[14px] w-[14px] rounded-full border-2 border-current/25 border-t-current animate-spin" />
        ) : (
          <ScreenShareIcon active={screenSharing} size={18} />
        )}
      </VoiceSquareButton>

      <VoiceSquareButton title="Activities" disabled>
        <ActivitiesIcon size={18} />
      </VoiceSquareButton>

      <VoiceSquareButton title="Soundboard" onClick={onToggleSoundboard} disabled={disabled} active={soundboardOpen}>
        <SoundboardControlIcon size={18} />
      </VoiceSquareButton>
    </div>
  );
}

function VoiceUserRow({
  user,
  statusText,
  voiceIsSpeaking,
  voiceIsMuted,
  voiceIsDeafened,
  quickMenuOpen,
  onAvatarClick,
  onToggleMute,
  onToggleDeafen,
  onToggleMenu,
  onOpenSettings,
}: {
  user: User;
  statusText: string;
  voiceIsSpeaking: boolean;
  voiceIsMuted: boolean;
  voiceIsDeafened: boolean;
  quickMenuOpen: boolean;
  onAvatarClick: (e: ReactMouseEvent) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleMenu: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-2 px-2.5 pb-2 pt-1">
      <button
        onClick={onAvatarClick}
        className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 transition-colors duration-150 hover:bg-white/[0.04]"
        title="View Profile"
      >
        <div className="relative flex-shrink-0">
          <div
            className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#5865f2] text-xs font-semibold text-white ${
              voiceIsSpeaking ? 'ring-2 ring-[#3ba55d] ring-offset-1 ring-offset-[#232428]' : ''
            }`}
          >
            {user.avatar_url ? (
              <img src={publicAssetUrl(user.avatar_url)} alt="" className="h-full w-full object-cover" />
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

        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#f2f3f5]">{user.display_name}</p>
          <p className="truncate text-[11px] leading-tight text-[#949ba4]">{statusText}</p>
        </div>
      </button>

      <div className="flex flex-shrink-0 items-center gap-[2px]">
        <UserActionButton title={voiceIsMuted ? 'Unmute' : 'Mute'} onClick={onToggleMute} danger={voiceIsMuted}>
          <MicIcon muted={voiceIsMuted} size={17} />
        </UserActionButton>
        <UserActionButton title={voiceIsDeafened ? 'Undeafen' : 'Deafen'} onClick={onToggleDeafen} danger={voiceIsDeafened}>
          <HeadphonesIcon deafened={voiceIsDeafened} size={17} />
        </UserActionButton>
        <UserActionButton title="Voice options" onClick={onToggleMenu} active={quickMenuOpen} compact>
          <ChevronDownIcon />
        </UserActionButton>
        <UserActionButton title="User Settings" onClick={onOpenSettings}>
          <SettingsIcon size={17} />
        </UserActionButton>
      </div>
    </div>
  );
}

export default function VoiceBottomBar() {
  const user = useAuthStore((s) => s.user);

  const voiceConnected = useVoiceStore((s) => s.connected);
  const voiceConnecting = useVoiceStore((s) => s.connecting);
  const voiceIsMuted = useVoiceStore((s) => s.isMuted);
  const voiceIsDeafened = useVoiceStore((s) => s.isDeafened);
  const voiceIsSpeaking = useVoiceStore((s) => {
    if (!s.connected || !user) return false;
    const participant = s.participants.find((entry) => entry.identity === user.id);
    return participant?.isSpeaking ?? false;
  });
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
  const connectionPingMs = useVoiceStore((s) => s.connectionStats.pingMs);
  const connectionBars = useVoiceStore((s) => s.connectionStats.bars);
  const connectionEndpoint = useVoiceStore((s) => s.connectionEndpoint);

  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubs = useHubStore((s) => s.hubs);
  const streams = useStreamStore((s) => s.streams);
  const activeVoiceChannelId = useVoiceChannelUiStore((s) => s.activeChannelId);
  const closeVoiceView = useVoiceChannelUiStore((s) => s.closeVoiceView);

  const liveStatus = usePresenceStore((s) => (user ? s.presence[user.id] : undefined));
  const openSelfProfile = useSelfProfileStore((s) => s.open);
  const openSettings = useAppSettingsStore((s) => s.openSettings);

  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [connectionPopoverOpen, setConnectionPopoverOpen] = useState(false);
  const [pingHistory, setPingHistory] = useState<number[]>([]);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const connectionTriggerRef = useRef<HTMLButtonElement>(null);
  const connectionPopoverRef = useRef<HTMLDivElement>(null);

  const activeHub = hubs.find((hub) => hub.id === activeHubId);
  const voiceStream = streams.find((stream) => stream.id === (voiceStreamId ?? activeVoiceChannelId));
  const inVoice = voiceConnected || voiceConnecting;
  const controlsDisabled = !voiceConnected || voiceConnecting;
  const averagePingMs = useMemo(() => averagePing(pingHistory), [pingHistory]);

  useEffect(() => {
    if (!quickMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(event.target as Node)) {
        setQuickMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQuickMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [quickMenuOpen]);

  useEffect(() => {
    if (!connectionPopoverOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (connectionPopoverRef.current?.contains(target) || connectionTriggerRef.current?.contains(target)) {
        return;
      }
      setConnectionPopoverOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectionPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [connectionPopoverOpen]);

  useEffect(() => {
    if (!inVoice) {
      setConnectionPopoverOpen(false);
      setPingHistory([]);
      return;
    }

    const seed = Math.max(0, Math.round(useVoiceStore.getState().connectionStats.pingMs ?? 0));
    setPingHistory(Array.from({ length: MAX_PING_HISTORY_POINTS }, () => seed));

    const timer = window.setInterval(() => {
      const nextPing = Math.max(0, Math.round(useVoiceStore.getState().connectionStats.pingMs ?? 0));
      setPingHistory((current) => [...current.slice(-(MAX_PING_HISTORY_POINTS - 1)), nextPing]);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [inVoice, voiceStreamId]);

  const handleLeave = useCallback(() => {
    closeVoiceView();
    void voiceLeave();
    setConnectionPopoverOpen(false);
    setQuickMenuOpen(false);
    setSoundboardOpen(false);
  }, [closeVoiceView, voiceLeave]);

  const handleAvatarClick = useCallback(
    (e: ReactMouseEvent) => {
      openSelfProfile((e.currentTarget as HTMLElement).getBoundingClientRect());
    },
    [openSelfProfile],
  );

  const handleOpenProfileSettings = useCallback(() => {
    setConnectionPopoverOpen(false);
    setQuickMenuOpen(false);
    openSettings('profile');
  }, [openSettings]);

  const handleOpenVoiceSettings = useCallback(() => {
    setConnectionPopoverOpen(false);
    setQuickMenuOpen(false);
    openSettings('voice');
  }, [openSettings]);

  const handleToggleConnectionPopover = useCallback(() => {
    setQuickMenuOpen(false);
    setConnectionPopoverOpen((current) => !current);
  }, []);

  const handleToggleQuickMenu = useCallback(() => {
    setConnectionPopoverOpen(false);
    setQuickMenuOpen((current) => !current);
  }, []);

  const voiceStatus = useMemo(() => {
    if (voiceConnecting || connectionState === ConnectionState.Connecting) {
      return { label: 'Connecting...', tone: 'warning' as const };
    }

    if (
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting
    ) {
      return { label: 'Reconnecting...', tone: 'warning' as const };
    }

    return { label: 'Voice Connected', tone: 'success' as const };
  }, [voiceConnecting, connectionState]);

  if (!user) {
    return null;
  }

  const currentStatusText = statusLabel(liveStatus ?? user.status);
  const channelLabel = voiceStream
    ? `${voiceStream.name}${activeHub ? ` / ${activeHub.name}` : ''}`
    : 'Voice Channel';

  return (
    <div className="relative flex-shrink-0 border-t border-black/30 bg-[linear-gradient(180deg,#25262b_0%,#232428_100%)]">
      {inVoice ? (
        <>
          <VoiceHeader
            statusLabelText={voiceStatus.label}
            statusTone={voiceStatus.tone}
            channelLabel={channelLabel}
            connectionBars={connectionBars}
            popoverOpen={connectionPopoverOpen}
            pingHistory={pingHistory}
            currentPingMs={connectionPingMs}
            averagePingMs={averagePingMs}
            endpoint={connectionEndpoint}
            disableDeafen={!voiceConnected}
            noiseSuppressionEnabled={voiceNoiseSuppressionEnabled}
            triggerRef={connectionTriggerRef}
            popoverRef={connectionPopoverRef}
            onTogglePopover={handleToggleConnectionPopover}
            onClosePopover={() => setConnectionPopoverOpen(false)}
            onToggleNoiseSuppression={() => void voiceToggleNoiseSuppression()}
            onLeave={handleLeave}
          />

          <VoiceControlsRow
            cameraOn={voiceIsCameraOn}
            screenSharing={voiceIsScreenSharing}
            screenShareRequesting={voiceScreenShareRequesting}
            soundboardOpen={soundboardOpen}
            disabled={controlsDisabled}
            onToggleCamera={voiceToggleCamera}
            onToggleScreenShare={voiceToggleScreenShare}
            onToggleSoundboard={() => setSoundboardOpen((value) => !value)}
          />

          {soundboardOpen && activeHubId ? (
            <div className="px-3 pb-3">
              <SoundboardPanel hubId={activeHubId} onClose={() => setSoundboardOpen(false)} />
            </div>
          ) : null}
        </>
      ) : null}

      {voiceScreenShareNotice ? (
        <VoiceNoticeBanner
          notice={voiceScreenShareNotice}
          onDismiss={voiceDismissScreenShareNotice}
          className={inVoice ? 'mx-3 mb-2 -mt-1' : 'mx-3 mt-2'}
        />
      ) : null}

      <div className="relative" ref={quickMenuRef}>
        <VoiceUserRow
          user={user}
          statusText={currentStatusText}
          voiceIsSpeaking={voiceIsSpeaking}
          voiceIsMuted={voiceIsMuted}
          voiceIsDeafened={voiceIsDeafened}
          quickMenuOpen={quickMenuOpen}
          onAvatarClick={handleAvatarClick}
          onToggleMute={voiceToggleMute}
          onToggleDeafen={() => void voiceToggleDeafen()}
          onToggleMenu={handleToggleQuickMenu}
          onOpenSettings={handleOpenProfileSettings}
        />

        {quickMenuOpen ? (
          <div className="absolute bottom-full right-2 mb-1.5 w-[188px] rounded-xl border border-white/[0.06] bg-[#111214]/96 p-1 shadow-[0_14px_36px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <QuickMenuButton onClick={handleOpenVoiceSettings} trailing={<SettingsIcon size={15} />}>
              Voice Settings
            </QuickMenuButton>
            {inVoice ? (
              <QuickMenuButton onClick={handleLeave} danger trailing={<DisconnectIcon size={15} />}>
                Disconnect
              </QuickMenuButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
