import { useCallback, useEffect, useMemo, useRef, useState, memo, type CSSProperties, type RefObject } from 'react';
import { LocalVideoTrack } from 'livekit-client';
import type { BackgroundProcessorWrapper, SwitchBackgroundProcessorOptions } from '@livekit/track-processors';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useWsSend } from '../../hooks/useWebSocket';
import { api } from '../../api/client';
import { statusColor, statusLabel } from '../shared/StatusDot';
import ModalOverlay from '../shared/ModalOverlay';
import {
  useVoiceStore,
  type CameraBackgroundAsset,
  type CameraBackgroundMode,
  type VoiceMediaDevice,
} from '../../stores/voiceStore';
import { useFrontendUpdateStore } from '../../stores/frontendUpdateStore';
import { useAppSettingsStore, type SettingsOverlayTab } from '../../stores/appSettingsStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { stripAssetVersion } from '../../utils/entityAssets';
import { formatShortDate, formatShortDateTime } from '../../utils/dateTime';
import { getDesktop, idleDesktopUpdateStatus } from '../../utils/desktop';
import {
  AUTO_THRESHOLD_MIN,
  AUTO_THRESHOLD_MAX,
  DEFAULT_MIC_GATE_RELEASE_MS,
  estimateAutomaticMicThreshold,
  type MicNoiseGateMetrics,
  MicNoiseGateProcessor,
  normalizeMicMeterLevel,
} from '../../utils/audio/micNoiseGate';
import type { DesktopBuildInfo, DesktopUpdateStatus } from '../../types/desktop';
import ModalCloseButton from '@/components/shared/ModalCloseButton';
import { CameraIcon } from '../voice/VoiceIcons';

export type SettingsModalTab = SettingsOverlayTab;

const emptyDesktopBuildInfo: DesktopBuildInfo = {
  appVersion: '',
  electronVersion: '',
  platform: '',
  arch: '',
  osVersion: '',
};

type TrackProcessorsModule = typeof import('@livekit/track-processors');

const CAMERA_PREVIEW_BLUR_RADIUS = 12;
let settingsTrackProcessorsModulePromise: Promise<TrackProcessorsModule> | null = null;

async function loadSettingsTrackProcessorsModule() {
  if (!settingsTrackProcessorsModulePromise) {
    settingsTrackProcessorsModulePromise = import('@livekit/track-processors').catch((error) => {
      settingsTrackProcessorsModulePromise = null;
      throw error;
    });
  }

  return settingsTrackProcessorsModulePromise;
}

function formatFrontendCommitSha(commitSha: string) {
  return commitSha.trim().slice(0, 7);
}

function formatFrontendBuildTimestamp(buildId: string) {
  const buildMs = Date.parse(buildId);
  if (Number.isNaN(buildMs)) return buildId;

  return formatShortDateTime(buildMs, 'medium');
}

function formatDesktopOsLabel(info: DesktopBuildInfo) {
  const archLabel = info.arch ? info.arch.toLowerCase() : '';

  if (info.osVersion) {
    return archLabel ? `${info.osVersion} (${archLabel})` : info.osVersion;
  }

  if (!info.platform) return '';

  const platformLabel = info.platform === 'win32'
    ? 'Windows'
    : info.platform === 'darwin'
      ? 'macOS'
      : info.platform === 'linux'
        ? 'Linux'
        : info.platform;

  return archLabel ? `${platformLabel} (${archLabel})` : platformLabel;
}

function formatDesktopUpdateSummary(status: DesktopUpdateStatus) {
  if (status.state === 'checking') {
    return 'Checking for desktop updates...';
  }

  if (status.state === 'downloading') {
    return status.progress !== null
      ? `Downloading desktop update... ${Math.round(status.progress)}%`
      : 'Downloading desktop update...';
  }

  if (status.state === 'ready') {
    return status.version
      ? `Desktop update ready • v${status.version}`
      : 'Desktop update ready';
  }

  if (status.state === 'up-to-date') {
    return status.version
      ? `Desktop app is up to date • v${status.version}`
      : 'Desktop app is up to date';
  }

  if (status.state === 'error') {
    return 'Desktop update check failed';
  }

  return 'Desktop updates check in the background when the packaged app is running.';
}

function desktopUpdateActionLabel(status: DesktopUpdateStatus) {
  if (status.state === 'ready') {
    return 'Restart to Update';
  }

  if (status.state === 'checking') {
    return 'Checking...';
  }

  if (status.state === 'downloading') {
    return status.progress !== null
      ? `Downloading... ${Math.round(status.progress)}%`
      : 'Downloading...';
  }

  return 'Check for Updates';
}

function SettingsModal() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const activeTab = useAppSettingsStore((s) => s.settingsTab);
  const closeSettings = useAppSettingsStore((s) => s.closeSettings);
  const setSettingsTab = useAppSettingsStore((s) => s.setSettingsTab);
  const frontendCommitSha = useFrontendUpdateStore((s) => s.currentCommitSha);
  const frontendBuildId = useFrontendUpdateStore((s) => s.currentBuildId);
  const frontendUpdateReady = useFrontendUpdateStore((s) => s.updateReady);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [desktopBuildInfo, setDesktopBuildInfo] = useState<DesktopBuildInfo>(emptyDesktopBuildInfo);
  const [appVersionLabel, setAppVersionLabel] = useState('Web App');
  const desktop = useMemo(() => getDesktop(), []);
  const isDesktopApp = Boolean(desktop);
  const [desktopUpdateStatus, setDesktopUpdateStatus] = useState<DesktopUpdateStatus>(idleDesktopUpdateStatus);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.desktop && typeof window.desktop.getBuildInfo === 'function') {
      void window.desktop
        .getBuildInfo()
        .then((info) => {
          setDesktopBuildInfo(info);
          setAppVersionLabel(info.appVersion ? `Rift Desktop v${info.appVersion}` : 'Rift Desktop');
        })
        .catch(() => {
          setAppVersionLabel('Rift Desktop');
        });
      return;
    }

    if (window.desktop && typeof window.desktop.getVersion === 'function') {
      void window.desktop
        .getVersion()
        .then((version) => {
          setAppVersionLabel(version ? `Rift Desktop v${version}` : 'Rift Desktop');
        })
        .catch(() => {
          setAppVersionLabel('Rift Desktop');
        });
      return;
    }

    if (window.desktop || window.riftDesktop) {
      setAppVersionLabel('Rift Desktop');
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;

    let cancelled = false;
    void desktop.getUpdateStatus().then((status) => {
      if (!cancelled) {
        setDesktopUpdateStatus(status);
      }
    });

    const disposeStatus = desktop.onUpdateStatus((status) => {
      setDesktopUpdateStatus(status);
    });
    const disposeReady = desktop.onUpdateReady(() => {
      setDesktopUpdateStatus((current) => ({
        ...current,
        state: 'ready',
        message: current.message || 'Restart to install the downloaded desktop update.',
      }));
    });

    return () => {
      cancelled = true;
      disposeStatus();
      disposeReady();
    };
  }, [desktop]);

  const handleDesktopUpdateAction = useCallback(() => {
    if (!desktop) return;

    if (desktopUpdateStatus.state === 'ready') {
      desktop.restartToUpdate();
      return;
    }

    if (desktopUpdateStatus.state === 'checking' || desktopUpdateStatus.state === 'downloading') {
      return;
    }

    void desktop.checkForUpdates().then((status) => {
      setDesktopUpdateStatus(status);
    });
  }, [desktop, desktopUpdateStatus.state]);

  const desktopOsLabel = formatDesktopOsLabel(desktopBuildInfo);
  const frontendCommitLabel = formatFrontendCommitSha(frontendCommitSha);
  const frontendBuildLabel = formatFrontendBuildTimestamp(frontendBuildId);
  const desktopUpdateSummary = formatDesktopUpdateSummary(desktopUpdateStatus);
  const desktopUpdateButtonText = desktopUpdateActionLabel(desktopUpdateStatus);
  const desktopUpdateBusy = desktopUpdateStatus.state === 'checking' || desktopUpdateStatus.state === 'downloading';

  if (!user) return null;

  const tabs: { id: SettingsModalTab; label: string; section?: 'user' | 'app' }[] = [
    { id: 'profile', label: 'Profile', section: 'user' },
    { id: 'account', label: 'Account', section: 'user' },
    { id: 'voice', label: 'Voice & Video', section: 'app' },
    { id: 'advanced', label: 'Advanced', section: 'app' },
  ];

  return (
    <ModalOverlay
      isOpen
      onClose={closeSettings}
      backdropClose
      zIndex={200}
      className="p-3 md:p-5"
      contentClassName="w-full max-w-[1400px]"
    >
      <div className="flex h-[min(94vh,920px)] w-full flex-col overflow-hidden rounded-[28px] border border-riftapp-border/50 bg-riftapp-bg-alt text-riftapp-text shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:h-[min(92vh,940px)] md:flex-row">
        <nav className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-riftapp-border/50 bg-riftapp-bg-alt px-5 py-5 md:w-[320px] md:border-b-0 md:border-r md:px-6 md:py-7">
          <div className="mx-auto flex w-full max-w-[232px] flex-col gap-5">
              <div>
                <h3 className="section-label px-2 mb-3">User Settings</h3>
                <div className="space-y-1">
                  {tabs.filter((t) => t.section === 'user').map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-all duration-150 ${
                        activeTab === tab.id
                          ? 'bg-riftapp-accent/20 text-white font-medium border-l-2 border-riftapp-accent'
                          : 'text-riftapp-text-muted hover:bg-riftapp-panel/55 hover:text-riftapp-text border-l-2 border-transparent'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="section-label px-2 mb-3">App Settings</h3>
                <div className="space-y-1">
                  {tabs.filter((t) => t.section === 'app').map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-all duration-150 ${
                        activeTab === tab.id
                          ? 'bg-riftapp-accent/20 text-white font-medium border-l-2 border-riftapp-accent'
                          : 'text-riftapp-text-muted hover:bg-riftapp-panel/55 hover:text-riftapp-text border-l-2 border-transparent'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-auto border-t border-riftapp-border/40 pt-4">
                {confirmLogout ? (
                  <div className="rounded-xl border border-riftapp-danger/20 bg-riftapp-danger/10 p-3">
                    <p className="mb-2 text-[11px] font-medium text-riftapp-danger">Log out of RiftApp?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { logout(); closeSettings(); }}
                        className="flex-1 rounded-md bg-riftapp-danger py-1.5 text-[11px] font-semibold text-white transition-all duration-150 hover:bg-riftapp-danger/90 active:scale-95"
                      >
                        Log Out
                      </button>
                      <button
                        onClick={() => setConfirmLogout(false)}
                        className="flex-1 rounded-md py-1.5 text-[11px] text-riftapp-text-muted transition-all duration-150 hover:bg-riftapp-bg/30"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmLogout(true)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-riftapp-danger transition-all duration-150 hover:bg-riftapp-danger/10"
                  >
                    Log Out
                  </button>
                )}

                <div className="mt-4 rounded-xl border border-riftapp-border/30 bg-riftapp-panel/25 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-riftapp-text-dim">App Version</p>
                  <p className="mt-1 text-[12px] font-semibold text-riftapp-text">{appVersionLabel}</p>
                  <div className="mt-2 space-y-1 text-[11px] leading-5 text-riftapp-text-muted">
                    <p>{`Frontend • ${frontendCommitLabel}`}</p>
                    {frontendBuildLabel && <p>{`Build: ${frontendBuildLabel}`}</p>}
                    {desktopBuildInfo.electronVersion ? <p>Electron {desktopBuildInfo.electronVersion}</p> : null}
                    {desktopOsLabel && <p>{desktopOsLabel}</p>}
                    {isDesktopApp ? (
                      <div className="mt-2 rounded-lg border border-riftapp-border/40 bg-riftapp-bg/35 px-2.5 py-2">
                        <p className={`font-semibold ${desktopUpdateStatus.state === 'error' ? 'text-riftapp-danger' : desktopUpdateStatus.state === 'ready' ? 'text-[#3ba55d]' : 'text-riftapp-text'}`}>
                          {desktopUpdateSummary}
                        </p>
                        {desktopUpdateStatus.message ? (
                          <p className="mt-1 text-riftapp-text-muted">{desktopUpdateStatus.message}</p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleDesktopUpdateAction}
                            disabled={desktopUpdateBusy}
                            className={`inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${desktopUpdateStatus.state === 'ready' ? 'bg-[#248046] text-white hover:bg-[#2d9d58]' : 'border border-riftapp-border/60 bg-riftapp-content-elevated text-riftapp-text hover:bg-riftapp-content'}`}
                          >
                            {desktopUpdateButtonText}
                          </button>
                          {desktopUpdateStatus.version && desktopUpdateStatus.state !== 'up-to-date' ? (
                            <span className="text-riftapp-text-dim">{`Target ${desktopUpdateStatus.version}`}</span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {frontendUpdateReady ? (
                      <p className="font-semibold text-[#3ba55d]">
                        {isDesktopApp
                          ? 'Frontend update ready. Use the green refresh button to apply it.'
                          : 'Frontend update ready. Refresh the page to apply it.'}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-riftapp-panel [contain:content]">
            <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-6 py-6 md:px-10 md:py-8 lg:px-14">
              <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between border-b border-riftapp-border/50 bg-riftapp-panel/95 px-6 pb-4 pt-1 backdrop-blur md:-mx-10 md:px-10 md:pb-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-riftapp-accent">User Settings</p>
                  <h2 className="mt-2 text-[26px] font-black tracking-tight text-white">
                    {activeTab === 'profile'
                      ? 'Profile'
                      : activeTab === 'account'
                        ? 'My Account'
                        : activeTab === 'voice'
                          ? 'Voice & Video'
                          : 'Advanced'}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <ModalCloseButton
                    onClick={closeSettings}
                    title="Close settings"
                    ariaLabel="Close settings"
                  />
                </div>
              </div>

              <div className="pb-12">
                {activeTab === 'profile' ? (
                  <ProfileTab user={user} setUser={setUser} />
                ) : activeTab === 'account' ? (
                  <AccountTab user={user} logout={logout} onClose={closeSettings} />
                ) : activeTab === 'voice' ? (
                  <VoiceVideoSettingsTab />
                ) : (
                  <AdvancedSettingsTab />
                )}
              </div>
            </div>
          </div>
      </div>
    </ModalOverlay>
  );
}

/* ───────── Voice & Video ───────── */

const MANUAL_SENSITIVITY_STEP = 0.001;
const MANUAL_SENSITIVITY_MIN = 0;
const MANUAL_SENSITIVITY_MAX = AUTO_THRESHOLD_MAX;

type SinkCapableAudioElement = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

function supportsAudioOutputSelection() {
  return typeof HTMLMediaElement !== 'undefined'
    && typeof (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId === 'function';
}

async function applyAudioSinkId(audio: HTMLAudioElement | null, outputDeviceId: string | null) {
  if (!audio) {
    return;
  }

  const sinkAudio = audio as SinkCapableAudioElement;
  if (typeof sinkAudio.setSinkId !== 'function') {
    return;
  }

  await sinkAudio.setSinkId(outputDeviceId ?? 'default');
}

function systemDefaultLabel(kind: 'audioinput' | 'audiooutput' | 'videoinput') {
  if (kind === 'audioinput') return 'System default microphone';
  if (kind === 'audiooutput') return 'System default output';
  return 'System default camera';
}

function VoiceSelectControl({
  label,
  devices,
  value,
  onChange,
  kind,
  disabled = false,
}: {
  label: string;
  devices: VoiceMediaDevice[];
  value: string | null;
  onChange: (deviceId: string | null) => void | Promise<void>;
  kind: 'audioinput' | 'audiooutput';
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-[14px] font-semibold text-riftapp-text-muted">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => void onChange(event.target.value || null)}
        disabled={disabled}
        className="h-9 w-full cursor-pointer rounded-[10px] border border-riftapp-border/70 bg-riftapp-content-elevated px-3 text-[14px] font-medium text-riftapp-text outline-none transition-colors hover:border-riftapp-border-light focus:border-[#5865f2] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{systemDefaultLabel(kind)}</option>
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function VoiceVolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const sliderStyle = {
    '--slider-fill': `${Math.round(value * 100)}%`,
  } as CSSProperties;

  return (
    <label className="block space-y-2.5">
      <span className="block text-[14px] font-semibold text-riftapp-text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="voice-settings-slider"
        style={sliderStyle}
      />
    </label>
  );
}

function VoiceLevelMeter({ level }: { level: number }) {
  const totalBars = 44;
  const activeBars = Math.max(0, Math.min(totalBars, Math.round(level * totalBars)));

  return (
    <div className="flex h-6 items-center gap-[3px] overflow-hidden rounded-[8px]">
      {Array.from({ length: totalBars }, (_, index) => (
        <span
          key={index}
          className={`h-6 min-w-0 flex-1 rounded-[2px] transition-colors ${
            index < activeBars ? 'bg-riftapp-voice-speaking' : 'bg-[#4b4f59]'
          }`}
        />
      ))}
    </div>
  );
}

function VoiceProfileOption({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-[10px] px-1 py-1.5 text-left transition-colors hover:bg-riftapp-panel/35"
    >
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          selected ? 'border-[#5865f2] bg-[#5865f2]' : 'border-[#72767d] bg-transparent'
        }`}
        aria-hidden="true"
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-riftapp-text">{title}</span>
        <span className="mt-0.5 block text-[14px] leading-[1.35] text-riftapp-text-muted">{description}</span>
      </span>
    </button>
  );
}

function CameraSelectControl({
  devices,
  value,
  onChange,
}: {
  devices: VoiceMediaDevice[];
  value: string | null;
  onChange: (deviceId: string | null) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[14px] font-semibold text-riftapp-text-muted">Camera</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-riftapp-text-muted">
          <CameraIcon enabled size={16} />
        </span>
        <select
          value={value ?? ''}
          onChange={(event) => void onChange(event.target.value || null)}
          className="h-9 w-full cursor-pointer rounded-[10px] border border-riftapp-border/70 bg-riftapp-content-elevated pl-10 pr-10 text-[14px] font-medium text-riftapp-text outline-none transition-colors hover:border-riftapp-border-light focus:border-[#5865f2]"
        >
          <option value="">{systemDefaultLabel('videoinput')}</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-riftapp-text-muted">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      <p className="text-[12px] leading-snug text-riftapp-text-dim">
        Looking for more camera options?{' '}
        <a href="ms-settings:privacy-webcam" className="text-[#00a8fc] transition-colors hover:text-[#3ab7ff] hover:underline">
          Check out your system camera settings.
        </a>
      </p>
    </div>
  );
}

function AnimatedBackgroundBadge() {
  return (
    <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white shadow-sm">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <path d="M3 2.2v5.6L7.8 5 3 2.2z" />
      </svg>
    </span>
  );
}

function CameraBackgroundTile({
  selected,
  onClick,
  children,
  animated = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  animated?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative aspect-[1.74/1] overflow-hidden rounded-[10px] border transition-all ${
        selected
          ? 'border-[#5865f2] shadow-[0_0_0_1px_rgba(88,101,242,0.25),0_0_18px_rgba(88,101,242,0.12)]'
          : 'border-riftapp-border/60 hover:border-riftapp-border-light'
      }`}
    >
      <div className="h-full w-full transition duration-150 group-hover:brightness-110">
        {children}
      </div>
      {animated ? <AnimatedBackgroundBadge /> : null}
    </button>
  );
}

function VoiceToggleSwitch({
  enabled,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`inline-flex h-7 w-[42px] shrink-0 items-center rounded-full border transition-colors ${
        enabled
          ? 'border-[#5865f2] bg-[#5865f2]'
          : 'border-riftapp-border/70 bg-riftapp-bg-alt'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-[19px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function VoiceStackedSetting({
  label,
  description,
  control,
  children,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-[16px] font-semibold leading-5 text-riftapp-text">{label}</p>
          {description ? (
            <p className="mt-1.5 max-w-[460px] text-[13px] leading-[1.4] text-riftapp-text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 pt-0.5">{control}</div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

function useVoiceSensitivityMonitor({
  deviceId,
  automaticInputSensitivity,
  manualInputSensitivity,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
  inputVolume,
}: {
  deviceId: string | null;
  automaticInputSensitivity: boolean;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  inputVolume: number;
}) {
  const [metrics, setMetrics] = useState<MicNoiseGateMetrics>({
    level: 0,
    threshold: manualInputSensitivity,
    aboveThreshold: false,
    speaking: false,
  });
  const processorRef = useRef<MicNoiseGateProcessor | null>(null);

  useEffect(() => {
    if (!processorRef.current) {
      setMetrics((current) => ({
        ...current,
        threshold: automaticInputSensitivity ? current.threshold : manualInputSensitivity,
      }));
    }

    processorRef.current?.updateSettings({
      automaticSensitivity: automaticInputSensitivity,
      manualThreshold: manualInputSensitivity,
      inputVolume,
    });
  }, [automaticInputSensitivity, inputVolume, manualInputSensitivity]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return undefined;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId
            ? {
                deviceId: { exact: deviceId },
                echoCancellation: echoCancellationEnabled,
                autoGainControl: false,
                noiseSuppression: false,
              }
            : {
                echoCancellation: echoCancellationEnabled,
                autoGainControl: false,
                noiseSuppression: false,
              },
          video: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const inputTrack = stream.getAudioTracks()[0];
        if (!inputTrack) {
          throw new Error('Microphone track unavailable.');
        }

        audioContext = new AudioContext();
        const nextProcessor = new MicNoiseGateProcessor(
          {
            automaticSensitivity: automaticInputSensitivity,
            manualThreshold: manualInputSensitivity,
            releaseMs: DEFAULT_MIC_GATE_RELEASE_MS,
            noiseSuppressionEnabled,
            inputVolume,
          },
          {
            onSpeakingStateChange: () => {},
            onMetricsChange: (nextMetrics) => {
              if (cancelled) {
                return;
              }

              setMetrics((current) => {
                const smoothing = nextMetrics.level > current.level ? 0.22 : 0.14;
                const smoothedLevel = current.level + (nextMetrics.level - current.level) * smoothing;
                return {
                  level: smoothedLevel,
                  threshold: nextMetrics.threshold,
                  aboveThreshold: nextMetrics.aboveThreshold,
                  speaking: nextMetrics.speaking,
                };
              });
            },
          },
        );
        processorRef.current = nextProcessor;

        await nextProcessor.init({
          track: inputTrack,
          audioContext,
        });
      } catch {
        if (!cancelled) {
          setMetrics({
            level: 0,
            threshold: manualInputSensitivity,
            aboveThreshold: false,
            speaking: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      const processor = processorRef.current;
      processorRef.current = null;
      if (processor) {
        void processor.destroy().catch(() => {});
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => {});
      }
    };
  }, [deviceId, echoCancellationEnabled, noiseSuppressionEnabled]);

  return metrics;
}

function useAutomaticVoiceSensitivityMeter({
  deviceId,
  manualInputSensitivity,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
  inputVolume,
  fillRef,
  thresholdRef,
}: {
  deviceId: string | null;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  inputVolume: number;
  fillRef: RefObject<HTMLDivElement | null>;
  thresholdRef: RefObject<HTMLDivElement | null>;
}) {
  const processorRef = useRef<MicNoiseGateProcessor | null>(null);
  const frameRef = useRef<number | null>(null);
  const inputVolumeRef = useRef(inputVolume);
  const manualThresholdRef = useRef(manualInputSensitivity);
  const targetLevelRef = useRef(0);
  const renderedLevelRef = useRef(0);
  const initialThreshold = normalizeMicMeterLevel(estimateAutomaticMicThreshold(AUTO_THRESHOLD_MIN));
  const targetThresholdRef = useRef(initialThreshold);
  const renderedThresholdRef = useRef(initialThreshold);
  const aboveThresholdRef = useRef(false);

  const applyIndicatorStyles = useCallback((level: number, threshold: number, aboveThreshold: boolean) => {
    const fillElement = fillRef.current;
    if (fillElement) {
      fillElement.style.transform = `scaleX(${level.toFixed(4)})`;
      fillElement.style.opacity = level > 0.002 ? '1' : '0';
      fillElement.style.boxShadow = aboveThreshold
        ? '0 0 12px rgba(59,165,93,0.28)'
        : 'none';
      fillElement.style.backgroundColor = aboveThreshold ? 'rgba(72, 183, 106, 0.98)' : 'rgba(59, 165, 93, 0.92)';
    }

    const thresholdElement = thresholdRef.current;
    if (thresholdElement) {
      thresholdElement.style.left = `${(threshold * 100).toFixed(2)}%`;
      thresholdElement.style.opacity = aboveThreshold ? '0.58' : '0.32';
      thresholdElement.style.boxShadow = aboveThreshold ? '0 0 8px rgba(59,165,93,0.18)' : 'none';
    }
  }, [fillRef, thresholdRef]);

  const resetIndicator = useCallback(() => {
    targetLevelRef.current = 0;
    renderedLevelRef.current = 0;
    aboveThresholdRef.current = false;
    targetThresholdRef.current = initialThreshold;
    renderedThresholdRef.current = initialThreshold;
    applyIndicatorStyles(0, initialThreshold, false);
  }, [applyIndicatorStyles, initialThreshold]);

  const animateIndicator = useCallback(() => {
    const levelDelta = targetLevelRef.current - renderedLevelRef.current;
    const thresholdDelta = targetThresholdRef.current - renderedThresholdRef.current;

    renderedLevelRef.current = Math.abs(levelDelta) < 0.0015
      ? targetLevelRef.current
      : renderedLevelRef.current + levelDelta * (levelDelta > 0 ? 0.34 : 0.16);
    renderedThresholdRef.current = Math.abs(thresholdDelta) < 0.001
      ? targetThresholdRef.current
      : renderedThresholdRef.current + thresholdDelta * 0.18;

    const nextLevel = Math.min(1, Math.max(0, renderedLevelRef.current < 0.001 ? 0 : renderedLevelRef.current));
    const nextThreshold = Math.min(1, Math.max(0, renderedThresholdRef.current));
    renderedLevelRef.current = nextLevel;
    renderedThresholdRef.current = nextThreshold;
    applyIndicatorStyles(nextLevel, nextThreshold, aboveThresholdRef.current);

    if (
      Math.abs(targetLevelRef.current - nextLevel) > 0.0015
      || Math.abs(targetThresholdRef.current - nextThreshold) > 0.001
      || nextLevel > 0.0015
    ) {
      frameRef.current = requestAnimationFrame(animateIndicator);
      return;
    }

    frameRef.current = null;
  }, [applyIndicatorStyles]);

  const scheduleIndicator = useCallback(() => {
    if (frameRef.current == null) {
      frameRef.current = requestAnimationFrame(animateIndicator);
    }
  }, [animateIndicator]);

  useEffect(() => {
    inputVolumeRef.current = inputVolume;
    manualThresholdRef.current = manualInputSensitivity;
    processorRef.current?.updateSettings({
      automaticSensitivity: true,
      manualThreshold: manualInputSensitivity,
      inputVolume,
    });

    if (!processorRef.current) {
      resetIndicator();
    }
  }, [inputVolume, manualInputSensitivity, resetIndicator]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      resetIndicator();
      return undefined;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    resetIndicator();

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId
            ? {
                deviceId: { exact: deviceId },
                echoCancellation: echoCancellationEnabled,
                autoGainControl: false,
                noiseSuppression: false,
              }
            : {
                echoCancellation: echoCancellationEnabled,
                autoGainControl: false,
                noiseSuppression: false,
              },
          video: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const inputTrack = stream.getAudioTracks()[0];
        if (!inputTrack) {
          throw new Error('Microphone track unavailable.');
        }

        audioContext = new AudioContext();
        const processor = new MicNoiseGateProcessor(
          {
            automaticSensitivity: true,
            manualThreshold: manualThresholdRef.current,
            releaseMs: DEFAULT_MIC_GATE_RELEASE_MS,
            noiseSuppressionEnabled,
            inputVolume: inputVolumeRef.current,
          },
          {
            onSpeakingStateChange: () => {},
            onMetricsChange: (nextMetrics) => {
              if (cancelled) {
                return;
              }

              const threshold = normalizeMicMeterLevel(nextMetrics.threshold);
              const liveLevel = normalizeMicMeterLevel(nextMetrics.level);
              const idleFloor = 0.01;

              targetThresholdRef.current = threshold;
              targetLevelRef.current = liveLevel <= idleFloor ? 0 : liveLevel;
              aboveThresholdRef.current = nextMetrics.aboveThreshold;
              scheduleIndicator();
            },
          },
        );

        processorRef.current = processor;
        await processor.init({
          track: inputTrack,
          audioContext,
        });
      } catch {
        if (!cancelled) {
          resetIndicator();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const processor = processorRef.current;
      processorRef.current = null;
      if (processor) {
        void processor.destroy().catch(() => {});
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => {});
      }
      resetIndicator();
    };
  }, [
    deviceId,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    resetIndicator,
    scheduleIndicator,
  ]);
}

function AutomaticVoiceSensitivityIndicator({
  deviceId,
  manualInputSensitivity,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
  inputVolume,
}: {
  deviceId: string | null;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  inputVolume: number;
}) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thresholdRef = useRef<HTMLDivElement | null>(null);

  useAutomaticVoiceSensitivityMeter({
    deviceId,
    manualInputSensitivity,
    noiseSuppressionEnabled,
    echoCancellationEnabled,
    inputVolume,
    fillRef,
    thresholdRef,
  });

  return (
    <div className="relative h-6 w-full">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-[#4a4d57] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 rounded-full bg-[#3ba55d]"
          style={{
            opacity: 0,
            transform: 'scaleX(0)',
            transformOrigin: 'left center',
            willChange: 'transform, opacity',
          }}
        />
        <div
          ref={thresholdRef}
          className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25"
          style={{ left: `${(normalizeMicMeterLevel(estimateAutomaticMicThreshold(AUTO_THRESHOLD_MIN)) * 100).toFixed(2)}%` }}
        />
      </div>
      <input
        type="range"
        min={MANUAL_SENSITIVITY_MIN}
        max={MANUAL_SENSITIVITY_MAX}
        step={MANUAL_SENSITIVITY_STEP}
        value={manualInputSensitivity}
        disabled
        tabIndex={-1}
        aria-label="Automatic input sensitivity indicator"
        className="pointer-events-none absolute inset-0 h-6 w-full appearance-none opacity-0"
      />
    </div>
  );
}

function ManualVoiceSensitivityIndicator({
  deviceId,
  manualInputSensitivity,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
  inputVolume,
  onManualChange,
}: {
  deviceId: string | null;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  inputVolume: number;
  onManualChange: (threshold: number) => void;
}) {
  const { level, aboveThreshold, speaking } = useVoiceSensitivityMonitor({
    deviceId,
    automaticInputSensitivity: false,
    manualInputSensitivity,
    noiseSuppressionEnabled,
    echoCancellationEnabled,
    inputVolume,
  });
  const thresholdPercent = Math.min(100, Math.max(0, (manualInputSensitivity / MANUAL_SENSITIVITY_MAX) * 100));
  const inputLevelPercent = Math.min(100, Math.max(0, (level / MANUAL_SENSITIVITY_MAX) * 100));
  const sliderStyle = {
    '--threshold-thumb-shadow': speaking
      ? '0 0 0 4px rgba(59,165,93,0.22), 0 0 14px rgba(59,165,93,0.34), 0 1px 2px rgba(0,0,0,0.35)'
      : '0 1px 2px rgba(0,0,0,0.35)',
    '--threshold-thumb-border': speaking ? 'rgba(59,165,93,0.95)' : 'rgba(255,255,255,0.92)',
  } as CSSProperties;

  return (
    <div className="relative h-6 w-full">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-[#2b2d31]">
        <div
          className="absolute inset-y-0 left-0 bg-[#d18a2a]"
          style={{ width: `${thresholdPercent}%` }}
        />
        <div
          className="absolute inset-y-0 bg-[#3ba55d]"
          style={{ left: `${thresholdPercent}%`, right: 0 }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-75 ${
            speaking || aboveThreshold ? 'bg-[#1f7a46]' : 'bg-[#8d5e1b]'
          }`}
          style={{ width: `${inputLevelPercent}%` }}
        />
        <div
          className={`absolute top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full transition-colors ${
            speaking ? 'bg-white/90 shadow-[0_0_10px_rgba(59,165,93,0.45)]' : 'bg-white/35'
          }`}
          style={{ left: `calc(${thresholdPercent}% - 1px)` }}
        />
      </div>
      <input
        type="range"
        min={MANUAL_SENSITIVITY_MIN}
        max={MANUAL_SENSITIVITY_MAX}
        step={MANUAL_SENSITIVITY_STEP}
        value={manualInputSensitivity}
        onChange={(event) => onManualChange(Number(event.target.value))}
        aria-label="Input sensitivity threshold"
        className="voice-threshold-slider absolute inset-0 w-full"
        style={sliderStyle}
      />
    </div>
  );
}

function VoiceSensitivitySetting({
  deviceId,
  automaticInputSensitivity,
  manualInputSensitivity,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
  inputVolume,
  onToggleAutomatic,
  onManualChange,
}: {
  deviceId: string | null;
  automaticInputSensitivity: boolean;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  inputVolume: number;
  onToggleAutomatic: () => void;
  onManualChange: (threshold: number) => void;
}) {
  return (
    <VoiceStackedSetting
      label="Automatically Adjust Input Sensitivity"
      description="Controls how much sound Rift transmits from your mic. If the indicator is green, Rift is transmitting your voice."
      control={(
        <VoiceToggleSwitch
          enabled={automaticInputSensitivity}
          onToggle={onToggleAutomatic}
          ariaLabel="Automatically adjust input sensitivity"
        />
      )}
    >
      {automaticInputSensitivity ? (
        <AutomaticVoiceSensitivityIndicator
          deviceId={deviceId}
          manualInputSensitivity={manualInputSensitivity}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          echoCancellationEnabled={echoCancellationEnabled}
          inputVolume={inputVolume}
        />
      ) : (
        <ManualVoiceSensitivityIndicator
          deviceId={deviceId}
          manualInputSensitivity={manualInputSensitivity}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          echoCancellationEnabled={echoCancellationEnabled}
          inputVolume={inputVolume}
          onManualChange={onManualChange}
        />
      )}
    </VoiceStackedSetting>
  );
}

const TENOR_PUBLIC_KEY = 'LIVDSRZULELA';
const MAX_BACKGROUND_UPLOAD_BYTES = 10 * 1024 * 1024;

type VoiceInputProfile = 'voice-isolation' | 'studio' | 'custom';

type TenorMediaVariant = {
  url?: string;
  preview?: string;
};

type TenorResult = {
  id: string;
  title?: string;
  content_description?: string;
  media?: Array<{
    gif?: TenorMediaVariant;
    tinygif?: TenorMediaVariant;
    mediumgif?: TenorMediaVariant;
  }>;
};

function backgroundPreviewUrl(asset: CameraBackgroundAsset | null) {
  return publicAssetUrl(asset?.previewUrl ?? asset?.url ?? '');
}

function resolveCameraBackgroundImagePath(asset: CameraBackgroundAsset | null) {
  if (!asset || asset.kind === 'video') {
    return null;
  }

  const rawPath = asset.kind === 'image' ? asset.url : asset.previewUrl ?? asset.url;
  const resolvedPath = publicAssetUrl(rawPath).trim();
  return resolvedPath.length > 0 ? resolvedPath : null;
}

function cameraPreviewProcessorOptions(
  mode: CameraBackgroundMode,
  asset: CameraBackgroundAsset | null,
): SwitchBackgroundProcessorOptions {
  if (mode === 'blur') {
    return {
      mode: 'background-blur',
      blurRadius: CAMERA_PREVIEW_BLUR_RADIUS,
    };
  }

  if (mode === 'custom') {
    const imagePath = resolveCameraBackgroundImagePath(asset);
    if (imagePath) {
      return {
        mode: 'virtual-background',
        imagePath,
      };
    }
  }

  return { mode: 'disabled' };
}

async function createPreviewBackgroundProcessor(
  mode: CameraBackgroundMode,
  asset: CameraBackgroundAsset | null,
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return undefined;
  }

  try {
    const { BackgroundProcessor, supportsBackgroundProcessors } = await loadSettingsTrackProcessorsModule();
    if (!supportsBackgroundProcessors()) {
      return undefined;
    }

    return BackgroundProcessor(cameraPreviewProcessorOptions(mode, asset), 'rift-settings-camera-preview');
  } catch (error) {
    console.warn('Unable to create preview background processor.', error);
    return undefined;
  }
}

function isBackgroundProcessorWrapper(value: unknown): value is BackgroundProcessorWrapper {
  return typeof value === 'object'
    && value !== null
    && 'switchTo' in value
    && typeof (value as { switchTo?: unknown }).switchTo === 'function';
}

function detectVoiceInputProfile({
  automaticInputSensitivity,
  echoCancellationEnabled,
  noiseSuppressionEnabled,
  pttMode,
}: {
  automaticInputSensitivity: boolean;
  echoCancellationEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  pttMode: boolean;
}): VoiceInputProfile {
  if (noiseSuppressionEnabled && automaticInputSensitivity && echoCancellationEnabled && !pttMode) {
    return 'voice-isolation';
  }

  if (!noiseSuppressionEnabled && automaticInputSensitivity && echoCancellationEnabled && !pttMode) {
    return 'studio';
  }

  return 'custom';
}

function mapTenorResultToBackgroundAsset(result: TenorResult): CameraBackgroundAsset | null {
  const media = result.media?.[0];
  const gifUrl = media?.gif?.url ?? media?.mediumgif?.url;
  if (!gifUrl) {
    return null;
  }

  const previewUrl = media?.tinygif?.url ?? media?.tinygif?.preview ?? media?.gif?.preview ?? gifUrl;
  return {
    kind: 'gif',
    url: gifUrl,
    previewUrl,
    label: result.content_description?.trim() || result.title?.trim() || 'Tenor GIF',
    source: 'tenor',
  };
}

async function fetchTenorBackgroundAssets(nextQuery: string, limit = 24) {
  const trimmedQuery = nextQuery.trim();
  const endpoint = trimmedQuery ? 'search' : 'trending';
  const params = new URLSearchParams({
    key: TENOR_PUBLIC_KEY,
    limit: String(limit),
    contentfilter: 'medium',
    media_filter: 'minimal',
  });

  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  }

  const response = await fetch(`https://g.tenor.com/v1/${endpoint}?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Tenor results are temporarily unavailable.');
  }

  const payload = (await response.json()) as { results?: TenorResult[] };
  return (payload.results ?? [])
    .map(mapTenorResultToBackgroundAsset)
    .filter((asset): asset is CameraBackgroundAsset => asset !== null);
}

function BackgroundAssetMedia({
  asset,
  alt,
  className,
  autoPlay = false,
  loading = 'lazy',
}: {
  asset: CameraBackgroundAsset;
  alt: string;
  className: string;
  autoPlay?: boolean;
  loading?: 'eager' | 'lazy';
}) {
  if (asset.kind === 'video') {
    return (
      <video
        src={backgroundPreviewUrl(asset)}
        className={className}
        muted
        loop
        playsInline
        autoPlay={autoPlay}
      />
    );
  }

  return (
    <img
      src={backgroundPreviewUrl(asset)}
      alt={alt}
      className={className}
      loading={loading}
    />
  );
}

function BackgroundGifPickerModal({
  isOpen,
  currentAsset,
  onClose,
  onSelectAsset,
}: {
  isOpen: boolean;
  currentAsset: CameraBackgroundAsset | null;
  onClose: () => void;
  onSelectAsset: (asset: CameraBackgroundAsset) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CameraBackgroundAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery('');
    setError(null);
  }, [isOpen]);

  const loadTenorResults = useCallback(async (nextQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      setResults(await fetchTenorBackgroundAssets(nextQuery, 24));
    } catch (loadError) {
      setResults([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load GIF backgrounds.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void loadTenorResults(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadTenorResults, query]);

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} zIndex={345} className="p-4 sm:p-6">
      <div className="mx-auto flex h-[min(82vh,720px)] w-full max-w-[420px] min-h-0 flex-col overflow-hidden rounded-2xl border border-riftapp-border/60 bg-riftapp-bg shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-riftapp-border/60 px-5 py-4">
          <h3 className="text-[15px] font-semibold text-white">Choose GIF</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-riftapp-text-dim transition-colors hover:bg-riftapp-content-elevated hover:text-riftapp-text"
            aria-label="Close GIF picker"
            title="Close GIF picker"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 px-5 py-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Tenor"
            className="w-full rounded-lg border border-riftapp-border/60 bg-riftapp-content-elevated px-3 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-riftapp-text-dim focus:border-[#5865f2]"
          />

          {error ? <p className="mt-4 text-[13px] text-[#f87171]">{error}</p> : null}
          {loading ? <p className="mt-4 text-[13px] text-riftapp-text-muted">Loading GIF backgrounds…</p> : null}

          <div className="mt-4 min-h-0 h-[calc(100%-52px)] overflow-y-auto pr-1 overscroll-contain">
            {results.length > 0 ? (
              <div className="grid content-start gap-3 sm:grid-cols-2">
                {results.map((asset) => {
                  const selected = currentAsset?.source === asset.source && currentAsset.url === asset.url;
                  return (
                    <button
                      key={`${asset.source}-${asset.url}`}
                      type="button"
                      onClick={() => {
                        onSelectAsset(asset);
                        onClose();
                      }}
                      className={`overflow-hidden rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-[#5865f2] bg-riftapp-panel shadow-[0_0_0_1px_rgba(88,101,242,0.2)]'
                          : 'border-riftapp-border/60 bg-riftapp-panel/70 hover:border-riftapp-border-light hover:bg-riftapp-panel-hover'
                      }`}
                    >
                      <BackgroundAssetMedia
                        asset={asset}
                        alt={asset.label ?? 'GIF background'}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <div className="px-3 py-2.5">
                        <p className="truncate text-sm font-medium text-white">{asset.label ?? 'Tenor GIF'}</p>
                        <p className="mt-1 text-[12px] text-riftapp-text-muted">Use this GIF as your background</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {!loading && !error && results.length === 0 ? (
              <div className="flex min-h-full items-center justify-center">
                <div className="w-full rounded-xl border border-dashed border-riftapp-border/60 bg-riftapp-content-elevated px-4 py-8 text-center text-[13px] text-riftapp-text-muted">
                  No GIFs matched that search.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function BackgroundPickerModal({
  isOpen,
  currentAsset,
  onClose,
  onSelectAsset,
}: {
  isOpen: boolean;
  currentAsset: CameraBackgroundAsset | null;
  onClose: () => void;
  onSelectAsset: (asset: CameraBackgroundAsset) => void;
}) {
  const [gifPreviewAssets, setGifPreviewAssets] = useState<CameraBackgroundAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setError(null);
    setDragActive(false);

    void fetchTenorBackgroundAssets('', 4)
      .then((assets) => {
        setGifPreviewAssets(assets.slice(0, 4));
      })
      .catch(() => {
        setGifPreviewAssets([]);
      });
  }, [isOpen]);

  const openUploadPicker = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isMp4 = file.type === 'video/mp4' || lowerName.endsWith('.mp4');
    const isGif = file.type === 'image/gif' || lowerName.endsWith('.gif');
    const isImage = isGif
      || file.type === 'image/png'
      || file.type === 'image/jpeg'
      || file.type === 'image/webp'
      || lowerName.endsWith('.png')
      || lowerName.endsWith('.jpg')
      || lowerName.endsWith('.jpeg')
      || lowerName.endsWith('.webp');
    const isSupported = isMp4 || isImage;

    if (!isSupported) {
      setError('Unsupported format. Upload a PNG, JPG, WEBP, GIF, or MP4 background.');
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_BACKGROUND_UPLOAD_BYTES) {
      setError('Background files must be 10 MB or smaller.');
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const upload = await api.uploadFile(file);
      const kind = isMp4 ? 'video' : isGif ? 'gif' : 'image';

      onSelectAsset({
        kind,
        url: upload.url,
        previewUrl: upload.url,
        label: file.name,
        source: 'upload',
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }, [onSelectAsset]);

  const handleDroppedFile = useCallback((fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    void handleUpload(file);
  }, [handleUpload]);

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} zIndex={340} className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[460px] overflow-hidden rounded-2xl border border-white/10 bg-[#2b2d31] shadow-[0_24px_80px_rgba(0,0,0,0.52)]">
        <div className="flex items-center justify-between px-6 pb-4 pt-5">
          <h3 className="text-[15px] font-semibold text-[#f2f3f5]">Upload Background</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#b5bac1] transition-colors hover:bg-white/6 hover:text-white"
            aria-label="Close background picker"
            title="Close background picker"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={openUploadPicker}
              onDragOver={(event) => {
                event.preventDefault();
                if (!dragActive) {
                  setDragActive(true);
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                handleDroppedFile(event.dataTransfer.files);
              }}
              disabled={uploading}
              className={`relative flex h-[196px] items-center justify-center overflow-hidden rounded-xl border px-4 text-center transition-colors ${
                dragActive
                  ? 'border-[#5865f2] bg-[#4f545c]'
                  : currentAsset?.source === 'upload'
                    ? 'border-[#5865f2] bg-[#4a4d57]'
                    : 'border-white/6 bg-[#3a3c46] hover:bg-[#454754]'
              } disabled:cursor-not-allowed disabled:opacity-80`}
            >
              <div className="relative z-10 flex flex-col items-center justify-center gap-3 text-white">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-black/12 text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {uploading ? (
                    <span className="h-4 w-4 rounded-full border-2 border-current/35 border-t-current animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 4h-4a2 2 0 0 0-2 2v2H6a2 2 0 0 0-2 2v4" />
                      <path d="M14 10V4l6 6h-6Z" />
                      <path d="M12 20v-7" />
                      <path d="m8.5 16.5 3.5-3.5 3.5 3.5" />
                    </svg>
                  )}
                </span>
                <span className="text-[15px] font-semibold leading-tight text-white">
                  {uploading ? 'Uploading…' : 'Upload Image or Video'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGifPickerOpen(true)}
              className={`group relative h-[196px] overflow-hidden rounded-xl border transition-colors ${
                currentAsset?.source === 'tenor'
                  ? 'border-[#5865f2] bg-[#2f3136]'
                  : 'border-white/6 bg-[#2f3136] hover:bg-[#36393f]'
              }`}
            >
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-1">
                {Array.from({ length: 4 }, (_, index) => {
                  const asset = gifPreviewAssets[index];
                  return asset ? (
                    <div key={asset.url} className="overflow-hidden rounded-md bg-[#24262b]">
                      <BackgroundAssetMedia
                        asset={asset}
                        alt={asset.label ?? 'GIF preview'}
                        className="h-full w-full object-cover brightness-[0.58] saturate-[0.9]"
                        autoPlay
                        loading="eager"
                      />
                    </div>
                  ) : (
                    <div key={index} className="rounded-md bg-[#3a3c46]" />
                  );
                })}
              </div>
              <div className="absolute inset-0 bg-black/58 transition-colors group-hover:bg-black/48" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[15px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]">Choose GIF</span>
              </div>
            </button>
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,.png,.jpg,.jpeg,.webp,.gif,.mp4"
            className="hidden"
            onChange={(event) => handleDroppedFile(event.target.files)}
          />

          <p className="mt-3 text-[11px] leading-4 text-[#949ba4]">
            Files should be PNG, JPG, GIF, or MP4 (10 MB max)
          </p>
          {error ? <p className="mt-2 text-[12px] text-[#f87171]">{error}</p> : null}
        </div>
      </div>

      <BackgroundGifPickerModal
        isOpen={gifPickerOpen}
        currentAsset={currentAsset}
        onClose={() => setGifPickerOpen(false)}
        onSelectAsset={(asset) => {
          onSelectAsset(asset);
          setGifPickerOpen(false);
          onClose();
        }}
      />
    </ModalOverlay>
  );
}

function CameraTestCard({
  deviceId,
  backgroundMode,
  backgroundAsset,
}: {
  deviceId: string | null;
  backgroundMode: CameraBackgroundMode;
  backgroundAsset: CameraBackgroundAsset | null;
}) {
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const previewRequestIdRef = useRef(0);
  const backgroundModeRef = useRef(backgroundMode);
  const backgroundAssetRef = useRef(backgroundAsset);

  useEffect(() => {
    backgroundModeRef.current = backgroundMode;
    backgroundAssetRef.current = backgroundAsset;
  }, [backgroundAsset, backgroundMode]);

  const disposePreviewTrack = useCallback(() => {
    const previewTrack = previewTrackRef.current;
    previewTrackRef.current = null;

    if (previewTrack) {
      if (videoRef.current) {
        previewTrack.detach(videoRef.current);
      }
      previewTrack.stop();
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    previewRequestIdRef.current += 1;
    disposePreviewTrack();
  }, [disposePreviewTrack]);

  const syncPreviewProcessor = useCallback(async (
    previewTrack: LocalVideoTrack,
    nextBackgroundMode: CameraBackgroundMode,
    nextBackgroundAsset: CameraBackgroundAsset | null,
  ) => {
    const desiredOptions = cameraPreviewProcessorOptions(nextBackgroundMode, nextBackgroundAsset);
    const existingProcessor = previewTrack.getProcessor();

    if (isBackgroundProcessorWrapper(existingProcessor)) {
      await existingProcessor.switchTo(desiredOptions);
      return;
    }

    if (desiredOptions.mode === 'disabled') {
      return;
    }

    const processor = await createPreviewBackgroundProcessor(nextBackgroundMode, nextBackgroundAsset);
    if (!processor) {
      return;
    }

    await previewTrack.setProcessor(processor, true);
  }, []);

  const startPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera preview is unavailable in this browser.');
      setPreviewEnabled(false);
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setError(null);
    disposePreviewTrack();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });

      if (previewRequestIdRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('Camera preview track unavailable.');
      }

      const localPreviewTrack = new LocalVideoTrack(videoTrack, undefined, true);
      previewTrackRef.current = localPreviewTrack;

      if (videoRef.current) {
        localPreviewTrack.attach(videoRef.current);
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
      }

      try {
        await syncPreviewProcessor(localPreviewTrack, backgroundModeRef.current, backgroundAssetRef.current);
      } catch (processorError) {
        console.warn('Unable to apply preview background processor.', processorError);
      }

      if (videoRef.current) {
        void videoRef.current.play().catch(() => {});
      }
    } catch {
      setError('Could not start camera preview. Check camera permissions.');
      setPreviewEnabled(false);
    }
  }, [deviceId, disposePreviewTrack, syncPreviewProcessor]);

  useEffect(() => {
    if (!previewEnabled) {
      stopPreview();
      return undefined;
    }

    void startPreview();
    return undefined;
  }, [deviceId, previewEnabled, startPreview, stopPreview]);

  useEffect(() => {
    if (!previewEnabled || !previewTrackRef.current) {
      return undefined;
    }

    void syncPreviewProcessor(previewTrackRef.current, backgroundMode, backgroundAsset).catch((processorError) => {
      console.warn('Unable to refresh preview background mode.', processorError);
    });
    return undefined;
  }, [backgroundAsset, backgroundMode, previewEnabled, syncPreviewProcessor]);

  useEffect(() => () => {
    stopPreview();
  }, [stopPreview]);

  return (
    <div className="space-y-5">
      <div className="group overflow-hidden rounded-[12px] border border-riftapp-border/60 bg-[#1b1c21] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
        <div className="relative aspect-[2.56/1] bg-[#1b1c21]">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${previewEnabled ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <button
              type="button"
              onClick={() => setPreviewEnabled((current) => !current)}
              className={`inline-flex h-9 items-center justify-center rounded-[8px] px-5 text-[14px] font-medium text-white transition-all ${
                previewEnabled
                  ? 'bg-black/55 opacity-0 backdrop-blur-sm hover:bg-black/65 group-hover:opacity-100 focus-visible:opacity-100'
                  : 'bg-[#5865f2] opacity-100 hover:bg-[#4752c4]'
              }`}
            >
              {previewEnabled ? 'Stop Video' : 'Test Video'}
            </button>
          </div>
        </div>
      </div>
      {error ? <p className="text-[12px] text-[#f87171]">{error}</p> : null}
    </div>
  );
}

function MicrophoneTestCard({
  inputDeviceId,
  outputDeviceId,
  outputDeviceSelectionSupported,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
  inputVolume,
  outputVolume,
}: {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  outputDeviceSelectionSupported: boolean;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  inputVolume: number;
  outputVolume: number;
}) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<MicNoiseGateProcessor | null>(null);
  const processorAudioContextRef = useRef<AudioContext | null>(null);
  const meterAudioContextRef = useRef<AudioContext | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterSamplesRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const inputVolumeRef = useRef(inputVolume);

  const stopMeter = useCallback(() => {
    if (meterFrameRef.current != null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    meterSourceRef.current?.disconnect();
    meterAnalyserRef.current?.disconnect();

    const meterAudioContext = meterAudioContextRef.current;
    meterAudioContextRef.current = null;
    if (meterAudioContext && meterAudioContext.state !== 'closed') {
      void meterAudioContext.close().catch(() => {});
    }

    meterSourceRef.current = null;
    meterAnalyserRef.current = null;
    meterSamplesRef.current = null;
    setLevel(0);
  }, []);

  const disposeTestResources = useCallback(() => {
    stopMeter();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const processor = processorRef.current;
    processorRef.current = null;
    if (processor) {
      void processor.destroy().catch(() => {});
    }

    const processorAudioContext = processorAudioContextRef.current;
    processorAudioContextRef.current = null;
    if (processorAudioContext && processorAudioContext.state !== 'closed') {
      void processorAudioContext.close().catch(() => {});
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
  }, [stopMeter]);

  const stopTest = useCallback(() => {
    disposeTestResources();
    setTesting(false);
  }, [disposeTestResources]);

  const startMeter = useCallback(async (stream: MediaStream) => {
    stopMeter();

    try {
      const meterAudioContext = new AudioContext();
      const meterSource = meterAudioContext.createMediaStreamSource(stream);
      const analyser = meterAudioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      meterSource.connect(analyser);

      meterAudioContextRef.current = meterAudioContext;
      meterSourceRef.current = meterSource;
      meterAnalyserRef.current = analyser;
      meterSamplesRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      try {
        if (meterAudioContext.state === 'suspended') {
          await meterAudioContext.resume();
        }
      } catch {
        /* ignore audio context resume failures */
      }

      const draw = () => {
        const activeAnalyser = meterAnalyserRef.current;
        const activeSamples = meterSamplesRef.current;
        if (!activeAnalyser || !activeSamples) {
          return;
        }

        activeAnalyser.getByteTimeDomainData(activeSamples);
        let sumSquares = 0;
        for (let index = 0; index < activeSamples.length; index += 1) {
          const sample = (activeSamples[index] - 128) / 128;
          sumSquares += sample * sample;
        }

        const rms = Math.sqrt(sumSquares / activeSamples.length);
        const nextLevel = normalizeMicMeterLevel(rms);
        setLevel((current) => current * 0.58 + nextLevel * 0.42);
        meterFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch {
      setLevel(0);
    }
  }, [stopMeter]);

  const applyMicrophoneTest = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone testing is unavailable in this browser.');
      setTesting(false);
      return;
    }

    setError(null);
    disposeTestResources();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId
          ? {
              deviceId: { exact: inputDeviceId },
              echoCancellation: echoCancellationEnabled,
              autoGainControl: false,
              noiseSuppression: false,
            }
          : {
              echoCancellation: echoCancellationEnabled,
              autoGainControl: false,
              noiseSuppression: false,
            },
        video: false,
      });

      streamRef.current = stream;
      let playbackStream = stream;

      const inputTrack = stream.getAudioTracks()[0];
      if (inputTrack) {
        let processorAudioContext: AudioContext | null = null;
        try {
          processorAudioContext = new AudioContext();
          const processor = new MicNoiseGateProcessor(
            {
              automaticSensitivity: false,
              manualThreshold: 0,
              releaseMs: DEFAULT_MIC_GATE_RELEASE_MS,
              noiseSuppressionEnabled,
              inputVolume: inputVolumeRef.current,
            },
            { onSpeakingStateChange: () => {} },
          );

          await processor.init({
            track: inputTrack,
            audioContext: processorAudioContext,
          });

          processorAudioContextRef.current = processorAudioContext;
          processorRef.current = processor;

          if (processor.processedTrack) {
            playbackStream = new MediaStream([processor.processedTrack]);
          }
        } catch (processorError) {
          if (processorAudioContext && processorAudioContext.state !== 'closed') {
            void processorAudioContext.close().catch(() => {});
          }
          console.warn('Microphone test processing unavailable, falling back to raw microphone audio.', processorError);
        }
      }

      if (audioRef.current) {
        audioRef.current.srcObject = playbackStream;
        audioRef.current.autoplay = true;
        audioRef.current.muted = false;
        audioRef.current.volume = outputVolume;
        if (outputDeviceSelectionSupported) {
          await applyAudioSinkId(audioRef.current, outputDeviceId);
        }
        void audioRef.current.play().catch(() => {});
      }

      await startMeter(playbackStream);
    } catch {
      setError('Could not start the microphone test. Check microphone permissions.');
      disposeTestResources();
      setTesting(false);
    }
  }, [disposeTestResources, echoCancellationEnabled, inputDeviceId, noiseSuppressionEnabled, outputDeviceId, outputDeviceSelectionSupported, startMeter]);

  useEffect(() => {
    if (!testing) {
      return undefined;
    }

    void applyMicrophoneTest();
    return undefined;
  }, [applyMicrophoneTest, testing]);

  useEffect(() => {
    inputVolumeRef.current = inputVolume;
    processorRef.current?.updateSettings({ inputVolume });
  }, [inputVolume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = outputVolume;
    }
  }, [outputVolume]);

  useEffect(() => () => {
    disposeTestResources();
  }, [disposeTestResources]);

  return (
    <div className="space-y-3">
      <audio ref={audioRef} className="hidden" />
      <div className="grid gap-4 sm:grid-cols-[106px,minmax(0,1fr)] sm:items-center">
        <button
          type="button"
          onClick={() => {
            if (testing) {
              stopTest();
            } else {
              setTesting(true);
            }
          }}
          className="inline-flex h-9 w-full items-center justify-center rounded-[10px] bg-[#5865f2] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#4752c4]"
        >
          {testing ? 'Stop Test' : 'Mic Test'}
        </button>
        <VoiceLevelMeter level={level} />
      </div>
      {error ? <p className="text-[12px] text-[#f87171]">{error}</p> : null}
    </div>
  );
}

function VoiceVideoSettingsTab() {
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);
  const inputVolume = useVoiceStore((s) => s.inputVolume);
  const outputVolume = useVoiceStore((s) => s.outputVolume);
  const automaticInputSensitivity = useVoiceStore((s) => s.automaticInputSensitivity);
  const manualInputSensitivity = useVoiceStore((s) => s.manualInputSensitivity);
  const noiseSuppressionEnabled = useVoiceStore((s) => s.noiseSuppressionEnabled);
  const echoCancellationEnabled = useVoiceStore((s) => s.echoCancellationEnabled);
  const pttMode = useVoiceStore((s) => s.pttMode);
  const cameraBackgroundMode = useVoiceStore((s) => s.cameraBackgroundMode);
  const cameraBackgroundAsset = useVoiceStore((s) => s.cameraBackgroundAsset);
  const savedCameraBackgroundAssets = useVoiceStore((s) => s.savedCameraBackgroundAssets);
  const mediaDevices = useVoiceStore((s) => s.mediaDevices);
  const refreshMediaDevices = useVoiceStore((s) => s.refreshMediaDevices);
  const setInputDeviceId = useVoiceStore((s) => s.setInputDeviceId);
  const setOutputDeviceId = useVoiceStore((s) => s.setOutputDeviceId);
  const setInputVolume = useVoiceStore((s) => s.setInputVolume);
  const setOutputVolume = useVoiceStore((s) => s.setOutputVolume);
  const setCameraDeviceId = useVoiceStore((s) => s.setCameraDeviceId);
  const setAutomaticInputSensitivity = useVoiceStore((s) => s.setAutomaticInputSensitivity);
  const setManualInputSensitivity = useVoiceStore((s) => s.setManualInputSensitivity);
  const setEchoCancellationEnabled = useVoiceStore((s) => s.setEchoCancellationEnabled);
  const setNoiseSuppressionEnabled = useVoiceStore((s) => s.setNoiseSuppressionEnabled);
  const setPTTMode = useVoiceStore((s) => s.setPTTMode);
  const setCameraBackgroundMode = useVoiceStore((s) => s.setCameraBackgroundMode);
  const setCameraBackgroundAsset = useVoiceStore((s) => s.setCameraBackgroundAsset);

  const outputDeviceSelectionSupported = supportsAudioOutputSelection();
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);

  const detectedProfile = useMemo<VoiceInputProfile>(
    () => detectVoiceInputProfile({
      automaticInputSensitivity,
      echoCancellationEnabled,
      noiseSuppressionEnabled,
      pttMode,
    }),
    [automaticInputSensitivity, echoCancellationEnabled, noiseSuppressionEnabled, pttMode],
  );
  const [selectedProfile, setSelectedProfile] = useState<VoiceInputProfile>(detectedProfile);

  useEffect(() => {
    if (detectedProfile === 'custom' || selectedProfile !== 'custom') {
      setSelectedProfile(detectedProfile);
    }
  }, [detectedProfile, selectedProfile]);

  useEffect(() => {
    void refreshMediaDevices();

    const handleDeviceChange = () => {
      void refreshMediaDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshMediaDevices]);

  const applyProfile = useCallback(async (profile: VoiceInputProfile) => {
    setSelectedProfile(profile);
    if (profile === 'custom') {
      return;
    }

    const enableRnnoise = profile === 'voice-isolation';
    await setNoiseSuppressionEnabled(enableRnnoise);
    await setEchoCancellationEnabled(true);
    setAutomaticInputSensitivity(true);
    setPTTMode(false);
  }, [setAutomaticInputSensitivity, setEchoCancellationEnabled, setNoiseSuppressionEnabled, setPTTMode]);

  const showCustomControls = selectedProfile === 'custom';
  const customBackgroundPreview = backgroundPreviewUrl(cameraBackgroundAsset);
  const selectedSavedBackground = cameraBackgroundMode === 'custom' && cameraBackgroundAsset
    ? savedCameraBackgroundAssets.find((asset) => asset.source === cameraBackgroundAsset.source && asset.url === cameraBackgroundAsset.url) ?? null
    : null;
  const customTileSelected = cameraBackgroundMode === 'custom' && !selectedSavedBackground;

  return (
    <div className="space-y-10">
      <section className="space-y-8">
        <div className="max-w-[620px] space-y-6">
          <h3 className="text-[28px] font-semibold leading-none text-riftapp-text">Voice</h3>

          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <VoiceSelectControl
              label="Microphone"
              devices={mediaDevices.audioinput}
              value={inputDeviceId}
              onChange={setInputDeviceId}
              kind="audioinput"
            />
            <VoiceSelectControl
              label="Speaker"
              devices={mediaDevices.audiooutput}
              value={outputDeviceId}
              onChange={setOutputDeviceId}
              kind="audiooutput"
              disabled={!outputDeviceSelectionSupported}
            />
            <VoiceVolumeSlider
              label="Microphone Volume"
              value={inputVolume}
              onChange={setInputVolume}
            />
            <VoiceVolumeSlider
              label="Speaker Volume"
              value={outputVolume}
              onChange={setOutputVolume}
            />
          </div>

          <MicrophoneTestCard
            inputDeviceId={inputDeviceId}
            outputDeviceId={outputDeviceId}
            outputDeviceSelectionSupported={outputDeviceSelectionSupported}
            noiseSuppressionEnabled={noiseSuppressionEnabled}
            echoCancellationEnabled={echoCancellationEnabled}
            inputVolume={inputVolume}
            outputVolume={outputVolume}
          />

          <div className="border-t border-riftapp-border/60 pt-7">
            <div className="space-y-3">
              <h4 className="text-[18px] font-semibold text-riftapp-text">Input Profile</h4>
              <div className="space-y-1">
                <VoiceProfileOption
                  title="Voice Isolation"
                  description="RNNoise with echo cancellation and automatic sensitivity for everyday rooms."
                  selected={selectedProfile === 'voice-isolation'}
                  onSelect={() => void applyProfile('voice-isolation')}
                />
                <VoiceProfileOption
                  title="Studio"
                  description="Open mic with automatic sensitivity and no noise suppression."
                  selected={selectedProfile === 'studio'}
                  onSelect={() => void applyProfile('studio')}
                />
                <VoiceProfileOption
                  title="Custom"
                  description="Show push-to-talk, manual sensitivity, and the full voice control set."
                  selected={selectedProfile === 'custom'}
                  onSelect={() => void applyProfile('custom')}
                />
              </div>
            </div>
          </div>
        </div>

        {showCustomControls ? (
          <div className="max-w-[620px] border-t border-riftapp-border/60 pt-6">
            <div className="divide-y divide-riftapp-border/50">
              <VoiceSensitivitySetting
                deviceId={inputDeviceId}
                automaticInputSensitivity={automaticInputSensitivity}
                manualInputSensitivity={manualInputSensitivity}
                noiseSuppressionEnabled={noiseSuppressionEnabled}
                echoCancellationEnabled={echoCancellationEnabled}
                inputVolume={inputVolume}
                onToggleAutomatic={() => setAutomaticInputSensitivity(!automaticInputSensitivity)}
                onManualChange={setManualInputSensitivity}
              />

              <VoiceStackedSetting
                label="Noise Suppression"
                description="Reduces background noise from your mic. Powered by RNNoise."
                control={(
                  <VoiceToggleSwitch
                    enabled={noiseSuppressionEnabled}
                    onToggle={() => void setNoiseSuppressionEnabled(!noiseSuppressionEnabled)}
                    ariaLabel="Noise suppression"
                  />
                )}
              />

              <VoiceStackedSetting
                label="Echo Cancellation"
                control={(
                  <VoiceToggleSwitch
                    enabled={echoCancellationEnabled}
                    onToggle={() => void setEchoCancellationEnabled(!echoCancellationEnabled)}
                    ariaLabel="Echo cancellation"
                  />
                )}
              />

              <VoiceStackedSetting
                label="Push-to-talk"
                control={(
                  <VoiceToggleSwitch
                    enabled={pttMode}
                    onToggle={() => setPTTMode(!pttMode)}
                    ariaLabel="Push-to-talk"
                  />
                )}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-6">
        <div className="max-w-[620px] space-y-5">
          <h3 className="text-[18px] font-semibold text-riftapp-text">Camera</h3>

          <CameraTestCard
            deviceId={cameraDeviceId}
            backgroundMode={cameraBackgroundMode}
            backgroundAsset={cameraBackgroundAsset}
          />

          <CameraSelectControl
            devices={mediaDevices.videoinput}
            value={cameraDeviceId}
            onChange={setCameraDeviceId}
          />

          <div className="space-y-3">
            <p className="text-[14px] font-semibold text-riftapp-text-muted">Video Background</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CameraBackgroundTile
                selected={cameraBackgroundMode === 'none'}
                onClick={() => setCameraBackgroundMode('none')}
              >
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-riftapp-panel text-riftapp-text">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-riftapp-text-muted">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="7" y1="17" x2="17" y2="7" />
                  </svg>
                  <span className="text-[15px] font-medium">None</span>
                </div>
              </CameraBackgroundTile>

              <CameraBackgroundTile
                selected={cameraBackgroundMode === 'blur'}
                onClick={() => setCameraBackgroundMode('blur')}
              >
                <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,#9465c3,transparent_60%),linear-gradient(135deg,#4a3a63,#9f6b86)]">
                  <div className="absolute inset-0 bg-black/12 backdrop-blur-[8px]" />
                  <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 text-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 15h16" />
                      <path d="M4 9h16" />
                      <path d="M10 3v18" />
                      <path d="M14 3v18" />
                    </svg>
                    <span className="text-[15px] font-medium">Blur</span>
                  </div>
                </div>
              </CameraBackgroundTile>

              <CameraBackgroundTile
                selected={customTileSelected}
                onClick={() => setBackgroundPickerOpen(true)}
                animated={cameraBackgroundAsset?.kind === 'gif' && Boolean(customBackgroundPreview)}
              >
                {customBackgroundPreview ? (
                  <div className="relative h-full w-full">
                    {cameraBackgroundAsset ? (
                      <BackgroundAssetMedia
                        asset={cameraBackgroundAsset}
                        alt={cameraBackgroundAsset.label ?? 'Custom background'}
                        className="h-full w-full object-cover"
                        autoPlay
                        loading="eager"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      <span className="text-[15px] font-medium">Custom</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#7f59cb,#b06a8b)] text-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    <span className="text-[15px] font-medium">Custom</span>
                  </div>
                )}
              </CameraBackgroundTile>

              {savedCameraBackgroundAssets.map((asset) => {
                const selected = cameraBackgroundMode === 'custom'
                  && cameraBackgroundAsset?.source === asset.source
                  && cameraBackgroundAsset.url === asset.url;

                return (
                  <CameraBackgroundTile
                    key={`${asset.source}-${asset.url}`}
                    selected={selected}
                    onClick={() => setCameraBackgroundAsset(asset)}
                    animated={asset.kind === 'gif'}
                  >
                    <img
                      src={backgroundPreviewUrl(asset)}
                      alt={asset.label ?? 'Background option'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </CameraBackgroundTile>
                );
              })}
            </div>
          </div>
        </div>

        <BackgroundPickerModal
          isOpen={backgroundPickerOpen}
          currentAsset={cameraBackgroundAsset}
          onClose={() => setBackgroundPickerOpen(false)}
          onSelectAsset={(asset) => setCameraBackgroundAsset(asset)}
        />
      </section>
    </div>
  );
}

function AdvancedSettingsTab() {
  const developerMode = useAppSettingsStore((s) => s.developerMode);
  const setDeveloperMode = useAppSettingsStore((s) => s.setDeveloperMode);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-riftapp-text-dim mb-4">Advanced</h3>
        <div className="rounded-lg border border-riftapp-border/40 bg-riftapp-panel/40 p-4 space-y-3">
          <button
            type="button"
            onClick={() => setDeveloperMode(!developerMode)}
            className="w-full flex items-start justify-between gap-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-riftapp-text">Developer Mode</p>
              <p className="text-[13px] text-riftapp-text-muted mt-1 leading-snug max-w-lg">
                Shows developer-only copy actions like message IDs and user IDs across menus and profile surfaces.
              </p>
            </div>
            <span
              className={`mt-0.5 inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                developerMode
                  ? 'bg-riftapp-accent border-riftapp-accent'
                  : 'bg-riftapp-bg/70 border-riftapp-border/60'
              }`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                  developerMode ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Profile Tab ───────── */

function ProfileTab({
  user,
  setUser,
}: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  setUser: (u: typeof user) => void;
}) {
  const savedAvatarUrl = stripAssetVersion(user.avatar_url);
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(savedAvatarUrl);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImgError(false);
    setUploading(true);

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);

    try {
      const attachment = await api.uploadFile(file);
      setAvatarUrl(attachment.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
      setAvatarPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const dirty =
    username !== user.username ||
    displayName !== user.display_name ||
    bio !== (user.bio ?? '') ||
    avatarUrl !== savedAvatarUrl;

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const patch: Record<string, string> = {};
    if (username !== user.username) patch.username = username;
    if (displayName !== user.display_name) patch.display_name = displayName;
    if (bio !== (user.bio ?? '')) patch.bio = bio;
    if (avatarUrl !== savedAvatarUrl) patch.avatar_url = avatarUrl;

    try {
      const updated = await api.updateMe(patch);
      setUser(updated);
      setAvatarUrl(stripAssetVersion(updated.avatar_url));
      setAvatarPreview(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Avatar Preview — click to upload */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative group cursor-pointer"
          title="Change avatar"
        >
          {(avatarPreview || avatarUrl) && !imgError ? (
            <img
              src={avatarPreview || publicAssetUrl(avatarUrl)}
              alt="avatar"
              className="w-16 h-16 rounded-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-riftapp-accent flex items-center justify-center text-lg font-semibold text-white">
              {(displayName || username).slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {uploading ? (
              <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </button>
        <div>
          <p className="text-sm font-medium">{displayName || username}</p>
          <p className="text-xs text-riftapp-text-dim">@{username}</p>
        </div>
      </div>

      {/* Fields */}
      <Field label="Username" maxLength={32}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={32}
          className="settings-input"
        />
      </Field>

      <Field label="Display Name" maxLength={64}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={64}
          className="settings-input"
        />
      </Field>

      <Field label="Bio" maxLength={190}>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={190}
          rows={3}
          className="settings-input resize-none"
          placeholder="Tell us about yourself"
        />
        <p className="text-[11px] text-riftapp-text-dim mt-1 text-right">
          {bio.length}/190
        </p>
      </Field>

      {/* Error / Success */}
      {error && (
        <p className="text-sm text-riftapp-danger bg-riftapp-danger/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-400 bg-emerald-400/10 rounded-md px-3 py-2">
          Profile updated!
        </p>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          disabled={!dirty || saving}
          onClick={handleSave}
          className="btn-primary"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

/* ───────── Account Tab ───────── */

function AccountTab({
  user,
  logout,
  onClose,
}: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  logout: () => void;
  onClose: () => void;
}) {
  const send = useWsSend();
  const setUserStatus = useAuthStore((s) => s.setUserStatus);
  const liveStatus = usePresenceStore((s) => s.presence[user.id]);
  const setSelfPresence = usePresenceStore((s) => s.setSelfPresence);
  const currentStatus = liveStatus ?? user.status;
  const [confirmLogout, setConfirmLogout] = useState(false);

  const statuses = [
    { value: 1, label: 'Online' },
    { value: 2, label: 'Idle' },
    { value: 3, label: 'Do Not Disturb' },
    { value: 0, label: 'Invisible' },
  ] as const;

  const handleStatusChange = (status: number) => {
    if (status > 0) {
      send('set_status', { status });
    }
    setSelfPresence(user.id, status);
    setUserStatus(status);
  };

  return (
    <div className="space-y-6">
      {/* Status Selector */}
      <div className="bg-riftapp-panel rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Status</h3>
        <div className="space-y-1">
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                currentStatus === s.value
                  ? 'bg-riftapp-accent/15 text-riftapp-text'
                  : 'text-riftapp-text-muted hover:text-riftapp-text hover:bg-riftapp-bg/30'
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${statusColor(s.value)}`} />
              {s.label}
              {currentStatus === s.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="ml-auto text-riftapp-accent">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-riftapp-text-dim mt-2">
          Currently: {statusLabel(currentStatus)}
        </p>
      </div>

      <div className="bg-riftapp-panel rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Account Details</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-riftapp-text-dim text-xs uppercase tracking-wide mb-0.5">Username</p>
            <p>@{user.username}</p>
          </div>
          {user.email && (
            <div>
              <p className="text-riftapp-text-dim text-xs uppercase tracking-wide mb-0.5">Email</p>
              <p>{user.email}</p>
            </div>
          )}
          <div>
            <p className="text-riftapp-text-dim text-xs uppercase tracking-wide mb-0.5">Member Since</p>
            <p>{formatShortDate(user.created_at)}</p>
          </div>
        </div>
      </div>

      <div className="bg-riftapp-panel rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1 text-riftapp-danger">Danger Zone</h3>
        <p className="text-xs text-riftapp-text-dim mb-3">
          Logging out will clear your session on this device.
        </p>
        {confirmLogout ? (
          <div className="rounded-lg bg-riftapp-danger/10 border border-riftapp-danger/25 p-3">
            <p className="text-sm text-riftapp-danger font-medium mb-3">Are you sure you want to log out?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { logout(); onClose(); }}
                className="btn-danger flex-1"
              >
                Log Out
              </button>
              <button
                onClick={() => setConfirmLogout(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            className="btn-danger"
          >
            Log Out
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── Shared Field Wrapper ───────── */

function Field({
  label,
  maxLength,
  children,
}: {
  label: string;
  maxLength?: number;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim flex justify-between">
        {label}
        {maxLength && <span className="font-normal">max {maxLength}</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default memo(SettingsModal);
