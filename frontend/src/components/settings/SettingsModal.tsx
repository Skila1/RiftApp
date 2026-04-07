import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useWsSend } from '../../hooks/useWebSocket';
import { api } from '../../api/client';
import { statusColor, statusLabel } from '../shared/StatusDot';
import ModalOverlay from '../shared/ModalOverlay';
import { useVoiceStore, type VoiceMediaDevice } from '../../stores/voiceStore';
import { useAppSettingsStore, type SettingsOverlayTab } from '../../stores/appSettingsStore';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { stripAssetVersion } from '../../utils/entityAssets';
import type { DesktopBuildInfo } from '../../types/desktop';

export type SettingsModalTab = SettingsOverlayTab;

const emptyDesktopBuildInfo: DesktopBuildInfo = {
  appVersion: '',
  electronVersion: '',
  platform: '',
  arch: '',
  osVersion: '',
};

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
                      <p>Electron {desktopBuildInfo.electronVersion}</p>
                      <p>{desktopBuildInfo.platform} {desktopBuildInfo.arch.toUpperCase()}</p>
                      <p>{desktopBuildInfo.osVersion}</p>
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
                  <button
                    onClick={closeSettings}
                    className="group flex items-center gap-2 rounded-full border border-riftapp-border/70 bg-riftapp-panel/60 px-3 py-1.5 text-riftapp-text-muted transition-all duration-150 hover:border-riftapp-text-dim hover:bg-riftapp-danger/20 hover:text-white"
                    title="Close settings (Esc)"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-70 group-hover:opacity-100">Esc</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
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
  description: string;
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
          className="settings-input w-full py-2 text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{systemDefaultLabel(kind)}</option>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        <p className="text-[12px] leading-snug text-riftapp-text-dim">{description}</p>
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
      className="w-full rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 px-4 py-3 text-left transition-colors hover:bg-riftapp-panel/60"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-riftapp-text">{label}</p>
          <p className="mt-1 text-[13px] leading-snug text-riftapp-text-muted">{description}</p>
        </div>
        <span
          className={`mt-0.5 inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
            enabled
              ? 'bg-riftapp-accent border-riftapp-accent'
              : 'bg-riftapp-bg/70 border-riftapp-border/60'
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

function CameraTestCard({ deviceId }: { deviceId: string | null }) {
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

  return (
    <div className="rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-riftapp-text">Camera Test</p>
          <p className="mt-1 text-[13px] leading-snug text-riftapp-text-muted">
            Preview the selected camera before joining video.
          </p>
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
          className="rounded-md border border-riftapp-border/50 bg-riftapp-bg/60 px-3 py-2 text-[13px] font-medium text-riftapp-text transition-colors hover:bg-riftapp-bg"
        >
          {previewEnabled ? 'Stop Camera Test' : 'Start Camera Test'}
        </button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-riftapp-border/40 bg-black/30">
        {previewEnabled ? (
          <video ref={videoRef} playsInline muted className="aspect-video w-full bg-black object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-[13px] text-riftapp-text-dim">
            Camera preview is off.
          </div>
        )}
      </div>
      {starting && <p className="mt-3 text-[12px] text-riftapp-text-dim">Starting preview…</p>}
      {error && <p className="mt-3 text-[12px] text-riftapp-danger">{error}</p>}
    </div>
  );
}

function MicrophoneTestCard({
  inputDeviceId,
  outputDeviceId,
  outputDeviceSelectionSupported,
}: {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  outputDeviceSelectionSupported: boolean;
}) {
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTest = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
              echoCancellation: true,
              autoGainControl: true,
              noiseSuppression: true,
            }
          : {
              echoCancellation: true,
              autoGainControl: true,
              noiseSuppression: true,
            },
        video: false,
      });

      streamRef.current = stream;
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
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
  }, [inputDeviceId, outputDeviceId, outputDeviceSelectionSupported]);

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
    <div className="rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4">
      <audio ref={audioRef} className="hidden" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-riftapp-text">Test Microphone</p>
          <p className="mt-1 text-[13px] leading-snug text-riftapp-text-muted">
            Plays your selected microphone back through the chosen output device so you can check levels and clarity.
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
          className="rounded-md border border-riftapp-border/50 bg-riftapp-bg/60 px-3 py-2 text-[13px] font-medium text-riftapp-text transition-colors hover:bg-riftapp-bg"
        >
          {testing ? 'Stop Mic Test' : 'Start Mic Test'}
        </button>
      </div>
      <p className="mt-3 text-[12px] text-riftapp-text-dim">
        Use headphones if possible to avoid feedback while the test is active.
      </p>
      {starting && <p className="mt-3 text-[12px] text-riftapp-text-dim">Starting microphone test…</p>}
      {error && <p className="mt-3 text-[12px] text-riftapp-danger">{error}</p>}
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
  const mediaDevices = useVoiceStore((s) => s.mediaDevices);
  const refreshMediaDevices = useVoiceStore((s) => s.refreshMediaDevices);
  const setInputDeviceId = useVoiceStore((s) => s.setInputDeviceId);
  const setOutputDeviceId = useVoiceStore((s) => s.setOutputDeviceId);
  const setCameraDeviceId = useVoiceStore((s) => s.setCameraDeviceId);
  const setAutomaticInputSensitivity = useVoiceStore((s) => s.setAutomaticInputSensitivity);
  const setManualInputSensitivity = useVoiceStore((s) => s.setManualInputSensitivity);
  const setNoiseSuppressionEnabled = useVoiceStore((s) => s.setNoiseSuppressionEnabled);

  const outputDeviceSelectionSupported = supportsAudioOutputSelection();

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

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-riftapp-text-dim">Voice</h3>
        <div className="space-y-4">
          <div className="rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4">
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

          <SettingToggle
            label="Noise Suppression"
            description="Applies browser-level microphone cleanup before the gate so background noise is less likely to open the mic."
            enabled={noiseSuppressionEnabled}
            onToggle={() => void setNoiseSuppressionEnabled(!noiseSuppressionEnabled)}
          />

          <SettingToggle
            label="Automatically Determine Input Sensitivity"
            description="Continuously adapts the mic gate to your room noise. Turn this off to use a fixed threshold instead."
            enabled={automaticInputSensitivity}
            onToggle={() => setAutomaticInputSensitivity(!automaticInputSensitivity)}
          />

          <div className={`rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4 ${automaticInputSensitivity ? 'opacity-70' : ''}`}>
            <Field label="Manual Input Sensitivity">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[13px] text-riftapp-text">
                  <span>{automaticInputSensitivity ? 'Automatic sensitivity is active' : formatSensitivity(manualInputSensitivity)}</span>
                  {!automaticInputSensitivity && <span className="text-riftapp-text-dim">Set to 0 to keep the mic open</span>}
                </div>
                <div className="relative">
                  <SensitivityMeter
                    deviceId={inputDeviceId}
                    threshold={manualInputSensitivity}
                    max={MANUAL_SENSITIVITY_MAX}
                    disabled={automaticInputSensitivity}
                  />
                  <input
                    type="range"
                    min={MANUAL_SENSITIVITY_MIN}
                    max={MANUAL_SENSITIVITY_MAX}
                    step={MANUAL_SENSITIVITY_STEP}
                    value={manualInputSensitivity}
                    disabled={automaticInputSensitivity}
                    onChange={(event) => setManualInputSensitivity(Number(event.target.value))}
                    className="w-full accent-riftapp-accent disabled:cursor-not-allowed relative z-10 bg-transparent"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-riftapp-text-dim">
                  <span>More sensitive</span>
                  <span>Less sensitive</span>
                </div>
                <p className="text-[12px] leading-snug text-riftapp-text-dim">
                  One threshold controls both the speaking ring and whether audio is transmitted, so the indicator always matches what leaves your mic.
                </p>
              </div>
            </Field>
          </div>

          <MicrophoneTestCard
            inputDeviceId={inputDeviceId}
            outputDeviceId={outputDeviceId}
            outputDeviceSelectionSupported={outputDeviceSelectionSupported}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wide text-riftapp-text-dim">Video</h3>
        <div className="space-y-4">
          <div className="rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4">
            <DeviceSelect
              label="Camera Device"
              description="Choose which camera to use when you turn video on."
              devices={mediaDevices.videoinput}
              value={cameraDeviceId}
              onChange={setCameraDeviceId}
              kind="videoinput"
            />
          </div>
          <CameraTestCard deviceId={cameraDeviceId} />
        </div>
      </div>
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
