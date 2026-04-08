import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
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
import { useAppSettingsStore, type SettingsOverlayTab } from '../../stores/appSettingsStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { stripAssetVersion } from '../../utils/entityAssets';
import { DEFAULT_MIC_GATE_RELEASE_MS, MicNoiseGateProcessor } from '../../utils/audio/micNoiseGate';
import type { DesktopBuildInfo } from '../../types/desktop';
import ModalCloseButton from '@/components/shared/ModalCloseButton';

export type SettingsModalTab = SettingsOverlayTab;

const emptyDesktopBuildInfo: DesktopBuildInfo = {
  appVersion: '',
  electronVersion: '',
  platform: '',
  arch: '',
  osVersion: '',
};

function formatDeployAge(deployedAt: string, now: number) {
  const deployedAtMs = Date.parse(deployedAt);
  if (Number.isNaN(deployedAtMs)) return '';

  const elapsedMs = Math.max(0, now - deployedAtMs);
  const elapsedHours = elapsedMs / (60 * 60 * 1000);

  if (elapsedHours >= 24) {
    return `${Math.max(1, Math.floor(elapsedHours / 24))}D`;
  }

  if (elapsedHours >= 1) {
    return `${Math.floor(elapsedHours)}h`;
  }

  return '<1h';
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

function SettingsModal() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const activeTab = useAppSettingsStore((s) => s.settingsTab);
  const closeSettings = useAppSettingsStore((s) => s.closeSettings);
  const setSettingsTab = useAppSettingsStore((s) => s.setSettingsTab);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [desktopBuildInfo, setDesktopBuildInfo] = useState<DesktopBuildInfo>(emptyDesktopBuildInfo);
  const [appVersionLabel, setAppVersionLabel] = useState('Web App');
  const [deployAgeLabel, setDeployAgeLabel] = useState(() => formatDeployAge(__RIFT_DEPLOYED_AT__, Date.now()));

  useEffect(() => {
    const updateDeployAge = () => {
      setDeployAgeLabel(formatDeployAge(__RIFT_DEPLOYED_AT__, Date.now()));
    };

    updateDeployAge();
    const intervalId = window.setInterval(updateDeployAge, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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

  const desktopOsLabel = formatDesktopOsLabel(desktopBuildInfo);

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
      <div className="flex h-[min(94vh,920px)] w-full flex-col overflow-hidden rounded-[28px] border border-riftapp-border/40 bg-[#1e1f22] text-riftapp-text shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:h-[min(92vh,940px)] md:flex-row">
        <nav className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-riftapp-border/40 bg-[#1e1f22] px-5 py-5 md:w-[320px] md:border-b-0 md:border-r md:px-6 md:py-7">
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
                  {desktopBuildInfo.electronVersion && (
                    <div className="mt-2 space-y-1 text-[11px] leading-5 text-riftapp-text-muted">
                      {deployAgeLabel && <p>Deployed {deployAgeLabel}</p>}
                      <p>Electron {desktopBuildInfo.electronVersion}</p>
                      {desktopOsLabel && <p>{desktopOsLabel}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[#313338] [contain:content]">
            <div className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-6 py-6 md:px-10 md:py-8 lg:px-14">
              <div className="sticky top-0 z-10 -mx-6 mb-6 flex items-center justify-between border-b border-riftapp-border/40 bg-[#313338] px-6 pb-4 pt-1 md:-mx-10 md:px-10 md:pb-5">
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
const MANUAL_SENSITIVITY_MAX = 0.08;

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

function formatSensitivity(threshold: number) {
  return threshold <= 0 ? 'Always transmit' : `Threshold ${threshold.toFixed(3)}`;
}

function systemDefaultLabel(kind: 'audioinput' | 'audiooutput' | 'videoinput') {
  if (kind === 'audioinput') return 'System default microphone';
  if (kind === 'audiooutput') return 'System default output';
  return 'System default camera';
}

function DeviceSelect({
  label,
  description,
  devices,
  value,
  onChange,
  kind,
  disabled = false,
}: {
  label: string;
  description?: string;
  devices: VoiceMediaDevice[];
  value: string | null;
  onChange: (deviceId: string | null) => void | Promise<void>;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="space-y-2">
        <select
          value={value ?? ''}
          onChange={(event) => void onChange(event.target.value || null)}
          disabled={disabled}
          className="w-full cursor-pointer rounded-lg border border-white/10 bg-[#111214] px-3 py-2.5 text-[13px] text-white outline-none transition-colors hover:border-white/20 focus:border-[#5865f2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{systemDefaultLabel(kind)}</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        {description ? (
          <p className="text-[12px] leading-snug text-[#9ca3af]">{description}</p>
        ) : null}
      </div>
    </Field>
  );
}

function SettingToggle({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-xl border border-white/10 bg-[#111214] px-4 py-3 text-left transition-colors hover:border-white/15 hover:bg-[#16181c]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">{description}</p>
        </div>
        <span
          className={`mt-0.5 inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
            enabled
              ? 'border-[#5865f2] bg-[#5865f2]'
              : 'border-white/12 bg-[#0b0c0e]'
          }`}
          aria-hidden="true"
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </span>
      </div>
    </button>
  );
}

const TENOR_PUBLIC_KEY = 'LIVDSRZULELA';

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

function backgroundModeTitle(mode: CameraBackgroundMode, asset: CameraBackgroundAsset | null) {
  if (mode === 'blur') {
    return 'Blur';
  }

  if (mode === 'custom') {
    return asset?.label?.trim() || 'Custom background';
  }

  return 'None';
}

function backgroundModeDescription(mode: CameraBackgroundMode, asset: CameraBackgroundAsset | null) {
  if (mode === 'blur') {
    return 'Keep the camera clean with a soft background blur.';
  }

  if (mode === 'custom') {
    if (asset?.source === 'tenor') {
      return 'Animated background selected from Tenor.';
    }
    return asset?.kind === 'video'
      ? 'Uploaded motion background ready to use.'
      : 'Uploaded custom background ready to use.';
  }

  return 'Use the raw camera feed with no background treatment.';
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

function ChoiceCard({
  title,
  description,
  selected,
  onClick,
  children,
  badge,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-xl border px-4 py-4 text-left transition-all ${
        selected
          ? 'border-[#5865f2] bg-[#1a1f2d] shadow-[0_0_0_1px_rgba(88,101,242,0.2)]'
          : 'border-white/10 bg-[#111214] hover:border-white/20 hover:bg-[#17191d]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">{title}</p>
            {badge ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cbd0d8]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="text-[13px] leading-snug text-[#9ca3af]">{description}</p>
        </div>
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            selected ? 'border-[#5865f2] bg-[#5865f2]' : 'border-white/15 bg-transparent'
          }`}
          aria-hidden="true"
        >
          {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
        </span>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </button>
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CameraBackgroundAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);

  const loadTenorResults = useCallback(async (nextQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      const trimmedQuery = nextQuery.trim();
      const endpoint = trimmedQuery ? 'search' : 'trending';
      const params = new URLSearchParams({
        key: TENOR_PUBLIC_KEY,
        limit: '24',
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
      const mapped = (payload.results ?? [])
        .map(mapTenorResultToBackgroundAsset)
        .filter((asset): asset is CameraBackgroundAsset => asset !== null);
      setResults(mapped);
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

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const upload = await api.uploadFile(file);
      const kind = file.type.startsWith('video/')
        ? 'video'
        : file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
          ? 'gif'
          : 'image';

      onSelectAsset({
        kind,
        url: upload.url,
        previewUrl: upload.url,
        label: file.name,
        source: 'upload',
      });
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      if (gifInputRef.current) gifInputRef.current.value = '';
    }
  }, [onClose, onSelectAsset]);

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} zIndex={340} className="p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101113] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8e97a8]">Video Background</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Choose a custom background</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[260px,minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#16181c] p-4">
              <p className="text-sm font-semibold text-white">Upload your own</p>
              <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">
                Use a still image, a looping GIF, or a motion background clip.
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full rounded-lg border border-white/10 bg-[#111214] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1d21] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? 'Uploading…' : 'Upload Image or Video'}
                </button>
                <button
                  type="button"
                  onClick={() => gifInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full rounded-lg border border-white/10 bg-[#111214] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1d21] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? 'Uploading…' : 'Upload GIF'}
                </button>
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUpload(file);
                  }
                }}
              />
              <input
                ref={gifInputRef}
                type="file"
                accept="image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleUpload(file);
                  }
                }}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#16181c] p-4">
              <p className="text-sm font-semibold text-white">Current selection</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d0f12]">
                {currentAsset ? (
                  <img
                    src={backgroundPreviewUrl(currentAsset)}
                    alt={currentAsset.label ?? 'Current background'}
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,#20252d,transparent_58%),linear-gradient(135deg,#16181c,#0f1012)] text-[13px] text-[#9ca3af]">
                    No custom background selected
                  </div>
                )}
              </div>
              <p className="mt-3 text-[12px] leading-snug text-[#9ca3af]">
                Powered by Tenor for GIF search.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Browse GIF backgrounds</p>
                <p className="mt-1 text-[13px] text-[#9ca3af]">Search Tenor or leave the box empty for trending picks.</p>
              </div>
              <div className="w-full sm:max-w-sm">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search GIF backgrounds"
                  className="w-full rounded-lg border border-white/10 bg-[#111214] px-3 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-[#7f8795] focus:border-[#5865f2]"
                />
              </div>
            </div>

            {error ? <p className="text-[13px] text-[#f87171]">{error}</p> : null}
            {loading ? <p className="text-[13px] text-[#9ca3af]">Loading GIF backgrounds…</p> : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                        ? 'border-[#5865f2] bg-[#1a1f2d] shadow-[0_0_0_1px_rgba(88,101,242,0.2)]'
                        : 'border-white/10 bg-[#15171a] hover:border-white/20 hover:bg-[#1a1d21]'
                    }`}
                  >
                    <img
                      src={backgroundPreviewUrl(asset)}
                      alt={asset.label ?? 'GIF background'}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-medium text-white">{asset.label ?? 'Tenor GIF'}</p>
                      <p className="mt-1 text-[12px] text-[#9ca3af]">Use this GIF as your background</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {!loading && !error && results.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#111214] px-4 py-8 text-center text-[13px] text-[#9ca3af]">
                No GIFs matched that search.
              </div>
            ) : null}
          </div>
        </div>
      </div>
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
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setPreviewEnabled(false);
  }, []);

  const applyPreviewStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera preview is unavailable in this browser.');
      setPreviewEnabled(false);
      return;
    }

    setStarting(true);
    setError(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        void videoRef.current.play().catch(() => {});
      }
    } catch {
      setError('Could not start camera preview. Check camera permissions.');
      setPreviewEnabled(false);
    } finally {
      setStarting(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!previewEnabled) {
      return undefined;
    }

    void applyPreviewStream();
    return undefined;
  }, [applyPreviewStream, previewEnabled]);

  useEffect(() => () => {
    stopPreview();
  }, [stopPreview]);

  const previewUrl = backgroundPreviewUrl(backgroundAsset);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Test Camera</p>
          <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">
            Preview the selected camera and confirm the saved background mode before you go live.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#cbd0d8]">
          {backgroundModeTitle(backgroundMode, backgroundAsset)}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f12]">
        <div className="relative aspect-video">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={backgroundAsset?.label ?? 'Selected background'}
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#222833,transparent_56%),linear-gradient(135deg,#14161a,#0d0f12)]" />
          )}
        {previewEnabled ? (
            <video ref={videoRef} playsInline muted className="relative z-10 h-full w-full bg-black object-cover" />
        ) : (
            <div className="relative z-10 flex h-full items-center justify-center px-6 text-center text-[13px] text-[#c9ced6]">
              Camera preview is off. Start a test to check framing and lighting.
            </div>
        )}
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-white/10 bg-black/45 px-4 py-3 backdrop-blur-sm">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#cbd0d8]">Background</p>
              <p className="mt-1 text-[13px] text-white">{backgroundModeTitle(backgroundMode, backgroundAsset)}</p>
              <p className="mt-1 text-[12px] text-[#9ca3af]">{backgroundModeDescription(backgroundMode, backgroundAsset)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (previewEnabled) {
                  stopPreview();
                } else {
                  setPreviewEnabled(true);
                }
              }}
              className="shrink-0 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/15"
            >
              {previewEnabled ? 'Stop Test' : 'Test Camera'}
            </button>
          </div>
        </div>
      </div>
      {starting && <p className="mt-3 text-[12px] text-[#9ca3af]">Starting preview…</p>}
      {error && <p className="mt-3 text-[12px] text-[#f87171]">{error}</p>}
    </div>
  );
}

function MicrophoneTestCard({
  inputDeviceId,
  outputDeviceId,
  outputDeviceSelectionSupported,
  noiseSuppressionEnabled,
  echoCancellationEnabled,
}: {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  outputDeviceSelectionSupported: boolean;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
}) {
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<MicNoiseGateProcessor | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const stopTest = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const processor = processorRef.current;
    processorRef.current = null;
    if (processor) {
      void processor.destroy().catch(() => {});
    }

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext) {
      void audioContext.close().catch(() => {});
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    setTesting(false);
  }, []);

  const applyMicrophoneTest = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone testing is unavailable in this browser.');
      setTesting(false);
      return;
    }

    setStarting(true);
    setError(null);
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId
          ? {
              deviceId: { exact: inputDeviceId },
              echoCancellation: echoCancellationEnabled,
              autoGainControl: true,
              noiseSuppression: false,
            }
          : {
              echoCancellation: echoCancellationEnabled,
              autoGainControl: true,
              noiseSuppression: false,
            },
        video: false,
      });

      streamRef.current = stream;
      let playbackStream = stream;

      if (noiseSuppressionEnabled) {
        try {
          const inputTrack = stream.getAudioTracks()[0];
          if (inputTrack) {
            const audioContext = new AudioContext();
            const processor = new MicNoiseGateProcessor(
              {
                automaticSensitivity: false,
                manualThreshold: 0,
                releaseMs: DEFAULT_MIC_GATE_RELEASE_MS,
                noiseSuppressionEnabled: true,
              },
              { onSpeakingStateChange: () => {} },
            );

            await processor.init({
              track: inputTrack,
              audioContext,
            });

            audioContextRef.current = audioContext;
            processorRef.current = processor;

            if (processor.processedTrack) {
              playbackStream = new MediaStream([processor.processedTrack]);
            }
          }
        } catch (processorError) {
          console.warn('RNNoise microphone test unavailable, falling back to raw microphone audio.', processorError);
        }
      }

      if (audioRef.current) {
        audioRef.current.srcObject = playbackStream;
        audioRef.current.autoplay = true;
        audioRef.current.muted = false;
        if (outputDeviceSelectionSupported) {
          await applyAudioSinkId(audioRef.current, outputDeviceId);
        }
        void audioRef.current.play().catch(() => {});
      }
    } catch {
      setError('Could not start the microphone test. Check microphone permissions.');
      setTesting(false);
    } finally {
      setStarting(false);
    }
  }, [echoCancellationEnabled, inputDeviceId, outputDeviceId, outputDeviceSelectionSupported, noiseSuppressionEnabled]);

  useEffect(() => {
    if (!testing) {
      return undefined;
    }

    void applyMicrophoneTest();
    return undefined;
  }, [applyMicrophoneTest, testing]);

  useEffect(() => () => {
    stopTest();
  }, [stopTest]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
      <audio ref={audioRef} className="hidden" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Test Microphone</p>
          <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">
            Route your mic back to your chosen output so you can hear the current voice profile, RNNoise, and echo cancellation settings together.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (testing) {
              stopTest();
            } else {
              setTesting(true);
            }
          }}
          className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/15"
        >
          {testing ? 'Stop Test' : 'Let\'s Check'}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#111214] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e97a8]">Input Profile</p>
          <p className="mt-2 text-sm font-medium text-white">{noiseSuppressionEnabled ? 'Voice Isolation' : 'Studio / Custom'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111214] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e97a8]">RNNoise</p>
          <p className="mt-2 text-sm font-medium text-white">{noiseSuppressionEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#111214] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e97a8]">Echo Cancellation</p>
          <p className="mt-2 text-sm font-medium text-white">{echoCancellationEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-[#9ca3af]">
        Use headphones if possible to avoid feedback while the test is active.
      </p>
      {starting && <p className="mt-3 text-[12px] text-[#9ca3af]">Starting microphone test…</p>}
      {error && <p className="mt-3 text-[12px] text-[#f87171]">{error}</p>}
    </div>
  );
}

/** Live microphone volume meter displayed behind the sensitivity slider. */
function SensitivityMeter({ deviceId, threshold, max, disabled }: { deviceId: string | null; threshold: number; max: number; disabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ stream: MediaStream | null; ctx: AudioContext | null; analyser: AnalyserNode | null; frame: number | null; samples: Uint8Array<ArrayBuffer> | null }>({ stream: null, ctx: null, analyser: null, frame: null, samples: null });

  useEffect(() => {
    if (disabled) return;

    let cancelled = false;
    const s = stateRef.current;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        s.stream = stream;
        s.ctx = ctx;
        s.analyser = analyser;
        s.samples = new Uint8Array(analyser.fftSize);

        const draw = () => {
          if (cancelled) return;
          s.frame = requestAnimationFrame(draw);
          const canvas = canvasRef.current;
          if (!canvas || !s.analyser || !s.samples) return;
          s.analyser.getByteTimeDomainData(s.samples);
          let sumSq = 0;
          for (let i = 0; i < s.samples.length; i++) {
            const v = (s.samples[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / s.samples.length);
          const c = canvas.getContext('2d');
          if (!c) return;
          const dpr = window.devicePixelRatio || 1;
          const cssW = canvas.clientWidth;
          const cssH = canvas.clientHeight;
          if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
            canvas.width = cssW * dpr;
            canvas.height = cssH * dpr;
          }
          c.clearRect(0, 0, canvas.width, canvas.height);
          // Volume bar
          const pct = Math.min(rms / max, 1);
          const barW = pct * canvas.width;
          const aboveThreshold = max > 0 && rms >= threshold;
          c.fillStyle = aboveThreshold ? 'rgba(67, 181, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)';
          c.beginPath();
          c.roundRect(0, 0, barW, canvas.height, 4 * dpr);
          c.fill();
          // Threshold line
          if (threshold > 0 && max > 0) {
            const tx = (threshold / max) * canvas.width;
            c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            c.lineWidth = 1.5 * dpr;
            c.beginPath();
            c.moveTo(tx, 0);
            c.lineTo(tx, canvas.height);
            c.stroke();
          }
        };
        s.frame = requestAnimationFrame(draw);
      } catch { /* mic permission denied or unavailable */ }
    })();

    return () => {
      cancelled = true;
      if (s.frame != null) cancelAnimationFrame(s.frame);
      s.analyser?.disconnect();
      s.stream?.getTracks().forEach((t) => t.stop());
      if (s.ctx && s.ctx.state !== 'closed') void s.ctx.close().catch(() => {});
      s.stream = null;
      s.ctx = null;
      s.analyser = null;
      s.frame = null;
      s.samples = null;
    };
  }, [deviceId, disabled, threshold, max]);

  if (disabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none rounded"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

function VoiceVideoSettingsTab() {
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);
  const automaticInputSensitivity = useVoiceStore((s) => s.automaticInputSensitivity);
  const manualInputSensitivity = useVoiceStore((s) => s.manualInputSensitivity);
  const noiseSuppressionEnabled = useVoiceStore((s) => s.noiseSuppressionEnabled);
  const echoCancellationEnabled = useVoiceStore((s) => s.echoCancellationEnabled);
  const pttMode = useVoiceStore((s) => s.pttMode);
  const cameraBackgroundMode = useVoiceStore((s) => s.cameraBackgroundMode);
  const cameraBackgroundAsset = useVoiceStore((s) => s.cameraBackgroundAsset);
  const mediaDevices = useVoiceStore((s) => s.mediaDevices);
  const refreshMediaDevices = useVoiceStore((s) => s.refreshMediaDevices);
  const setInputDeviceId = useVoiceStore((s) => s.setInputDeviceId);
  const setOutputDeviceId = useVoiceStore((s) => s.setOutputDeviceId);
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

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[#8e97a8]">Voice</h3>
          <p className="mt-2 max-w-2xl text-[13px] leading-snug text-[#9ca3af]">
            Pick an input profile first, then fine-tune the mic path only when you need a custom setup.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Input Profile</p>
              <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">
                Voice Isolation keeps RNNoise on, Studio keeps it off, and Custom exposes the raw controls.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#cbd0d8]">
              {selectedProfile === 'voice-isolation'
                ? 'Voice Isolation'
                : selectedProfile === 'studio'
                  ? 'Studio'
                  : 'Custom'}
            </span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            <ChoiceCard
              title="Voice Isolation"
              description="RNNoise on, echo cancellation on, and automatic sensitivity for everyday rooms."
              selected={selectedProfile === 'voice-isolation'}
              onClick={() => void applyProfile('voice-isolation')}
              badge="RNNoise On"
            />
            <ChoiceCard
              title="Studio"
              description="RNNoise off with automatic sensitivity so your voice stays more natural and open."
              selected={selectedProfile === 'studio'}
              onClick={() => void applyProfile('studio')}
              badge="RNNoise Off"
            />
            <ChoiceCard
              title="Custom"
              description="Manually tune push-to-talk, voice activity, RNNoise, echo cancellation, and sensitivity."
              selected={selectedProfile === 'custom'}
              onClick={() => void applyProfile('custom')}
              badge="Advanced"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
          <div className="grid gap-4 md:grid-cols-2">
              <DeviceSelect
                label="Input Device"
                description="Switch microphones without leaving the call."
                devices={mediaDevices.audioinput}
                value={inputDeviceId}
                onChange={setInputDeviceId}
                kind="audioinput"
              />
              <DeviceSelect
                label="Output Device"
                description={outputDeviceSelectionSupported
                  ? 'Choose where voice playback should be heard.'
                  : 'Your browser does not support changing speaker output from the app.'}
                devices={mediaDevices.audiooutput}
                value={outputDeviceId}
                onChange={setOutputDeviceId}
                kind="audiooutput"
                disabled={!outputDeviceSelectionSupported}
              />
          </div>
        </div>

        {showCustomControls ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Input Mode</p>
                  <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">
                    Push to Talk uses the existing space bar bind. Voice Activity follows your live threshold.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#cbd0d8]">
                  {pttMode ? 'Push to Talk' : 'Voice Activity'}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ChoiceCard
                  title="Voice Activity"
                  description="Open the mic automatically when you cross the selected threshold."
                  selected={!pttMode}
                  onClick={() => setPTTMode(false)}
                />
                <ChoiceCard
                  title="Push to Talk"
                  description="Hold space to transmit. This is useful if your room changes a lot during the day."
                  selected={pttMode}
                  onClick={() => setPTTMode(true)}
                  badge="Space"
                />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SettingToggle
                label="RNNoise Suppression"
                description="Runs RNNoise before the mic gate so steady fan or room noise is less likely to open the mic."
                enabled={noiseSuppressionEnabled}
                onToggle={() => void setNoiseSuppressionEnabled(!noiseSuppressionEnabled)}
              />

              <SettingToggle
                label="Echo Cancellation"
                description="Cuts speaker bleed and room reflections before the mic test or live capture gets sent."
                enabled={echoCancellationEnabled}
                onToggle={() => void setEchoCancellationEnabled(!echoCancellationEnabled)}
              />

              <SettingToggle
                label="Automatically Determine Input Sensitivity"
                description="Let Rift keep the threshold in sync with the room, or turn it off for a fixed manual threshold."
                enabled={automaticInputSensitivity}
                onToggle={() => setAutomaticInputSensitivity(!automaticInputSensitivity)}
              />
            </div>

            <div className={`rounded-2xl border border-white/10 bg-[#16181c] p-5 ${automaticInputSensitivity || pttMode ? 'opacity-70' : ''}`}>
              <Field label="Manual Input Sensitivity">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-[13px] text-white">
                    <span>
                      {pttMode
                        ? 'Push to Talk bypasses the voice activity threshold'
                        : automaticInputSensitivity
                          ? 'Automatic sensitivity is active'
                          : formatSensitivity(manualInputSensitivity)}
                    </span>
                    {!automaticInputSensitivity && !pttMode ? (
                      <span className="text-[#8e97a8]">Set to 0 to keep the mic open</span>
                    ) : null}
                  </div>

                  <div className="relative">
                    <SensitivityMeter
                      deviceId={inputDeviceId}
                      threshold={manualInputSensitivity}
                      max={MANUAL_SENSITIVITY_MAX}
                      disabled={automaticInputSensitivity || pttMode}
                    />
                    <input
                      type="range"
                      min={MANUAL_SENSITIVITY_MIN}
                      max={MANUAL_SENSITIVITY_MAX}
                      step={MANUAL_SENSITIVITY_STEP}
                      value={manualInputSensitivity}
                      disabled={automaticInputSensitivity || pttMode}
                      onChange={(event) => setManualInputSensitivity(Number(event.target.value))}
                      className="relative z-10 w-full bg-transparent accent-[#5865f2] disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#8e97a8]">
                    <span>More sensitive</span>
                    <span>Less sensitive</span>
                  </div>

                  <p className="text-[12px] leading-snug text-[#9ca3af]">
                    One threshold controls both the speaking ring and the outgoing mic gate, so the indicator matches what actually leaves your mic.
                  </p>
                </div>
              </Field>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#16181c] px-5 py-4 text-[13px] leading-snug text-[#9ca3af]">
            Switch to Custom when you want to adjust input mode, manual sensitivity, or echo cancellation directly.
          </div>
        )}

        <MicrophoneTestCard
          inputDeviceId={inputDeviceId}
          outputDeviceId={outputDeviceId}
          outputDeviceSelectionSupported={outputDeviceSelectionSupported}
          noiseSuppressionEnabled={noiseSuppressionEnabled}
          echoCancellationEnabled={echoCancellationEnabled}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[#8e97a8]">Video</h3>
          <p className="mt-2 max-w-2xl text-[13px] leading-snug text-[#9ca3af]">
            Pick the camera you want to use, then choose whether to keep the feed raw, blurred, or backed by a custom asset.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <DeviceSelect
              label="Camera Device"
              description="Choose which camera to use when you turn video on."
              devices={mediaDevices.videoinput}
              value={cameraDeviceId}
              onChange={setCameraDeviceId}
              kind="videoinput"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181c] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Video Background</p>
              <p className="mt-1 text-[13px] leading-snug text-[#9ca3af]">
                Choose None, Blur, or Custom. Custom opens the background picker for uploads and GIFs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBackgroundPickerOpen(true)}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/15"
            >
              {cameraBackgroundMode === 'custom' ? 'Edit Custom' : 'Browse Custom'}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <ChoiceCard
              title="None"
              description="Keep the regular camera feed with no extra background treatment."
              selected={cameraBackgroundMode === 'none'}
              onClick={() => setCameraBackgroundMode('none')}
            >
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_top,#232831,transparent_56%),linear-gradient(135deg,#17191d,#0f1012)]">
                <div className="aspect-[16/9] px-4 py-4 text-[12px] text-[#cbd0d8]">Raw camera preview</div>
              </div>
            </ChoiceCard>

            <ChoiceCard
              title="Blur"
              description="Keep the focus on your face with a softer, less distracting backdrop."
              selected={cameraBackgroundMode === 'blur'}
              onClick={() => setCameraBackgroundMode('blur')}
            >
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111214]">
                <div className="relative aspect-[16/9]">
                  <div
                    className="absolute inset-0 scale-110 bg-cover bg-center opacity-80 blur-sm"
                    style={{
                      backgroundImage:
                        'url(https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80)',
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-16 w-16 rounded-full bg-white/15 ring-1 ring-white/20" />
                  </div>
                </div>
              </div>
            </ChoiceCard>

            <ChoiceCard
              title="Custom"
              description="Upload an image, upload a GIF, or pick a GIF from Tenor for your saved background."
              selected={cameraBackgroundMode === 'custom'}
              onClick={() => {
                if (cameraBackgroundAsset) {
                  setCameraBackgroundMode('custom');
                } else {
                  setBackgroundPickerOpen(true);
                }
              }}
            >
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111214]">
                {customBackgroundPreview ? (
                  <img
                    src={customBackgroundPreview}
                    alt={cameraBackgroundAsset?.label ?? 'Custom background'}
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-[radial-gradient(circle_at_top,#2a1d2b,transparent_58%),linear-gradient(135deg,#17191d,#0f1012)] px-4 text-center text-[12px] text-[#cbd0d8]">
                    No custom background selected yet
                  </div>
                )}
              </div>
            </ChoiceCard>
          </div>
        </div>

        <CameraTestCard
          deviceId={cameraDeviceId}
          backgroundMode={cameraBackgroundMode}
          backgroundAsset={cameraBackgroundAsset}
        />

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
  const liveStatus = usePresenceStore((s) => s.presence[user.id]);
  const setPresence = usePresenceStore((s) => s.setPresence);
  const currentStatus = liveStatus ?? user.status;
  const [confirmLogout, setConfirmLogout] = useState(false);

  const statuses = [
    { value: 1, label: 'Online' },
    { value: 2, label: 'Idle' },
    { value: 3, label: 'Do Not Disturb' },
  ] as const;

  const handleStatusChange = (status: number) => {
    send('set_status', { status });
    setPresence(user.id, status);
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
            <p>{new Date(user.created_at).toLocaleDateString()}</p>
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
