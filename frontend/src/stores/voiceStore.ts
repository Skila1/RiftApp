import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  AudioPresets,
  ScreenSharePresets,
  type AudioCaptureOptions,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type Participant,
  ConnectionQuality,
  ConnectionState,
} from 'livekit-client';
import { api } from '../api/client';
import { wsSend } from '../hooks/useWebSocket';
import { useStreamStore } from './streamStore';
import {
  DEFAULT_MANUAL_MIC_THRESHOLD,
  DEFAULT_MIC_GATE_RELEASE_MS,
  MicNoiseGateProcessor,
} from '../utils/audio/micNoiseGate';

const VOICE_SETTINGS_STORAGE_KEY = 'riftapp-voice-settings-v2';
export type ScreenShareKind = 'screen' | 'window' | 'tab';
export type ScreenShareFps = 15 | 30 | 60;
export type ScreenShareResolution = '480p' | '720p' | '1080p' | '1440p' | 'source';

type VoiceDeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';

type ScreenShareNotice = {
  tone: 'info' | 'error';
  message: string;
};

const SPEAKING_BROADCAST_INTERVAL_MS = 30;
const CONNECTION_STATS_POLL_INTERVAL_MS = 1000;
const MANUAL_INPUT_SENSITIVITY_MIN = 0;
const MANUAL_INPUT_SENSITIVITY_MAX = 0.08;

type VoiceConnectionTone = 'good' | 'medium' | 'bad' | 'neutral';
type VoiceConnectionSource = 'webrtc' | 'livekit' | 'unknown';

export interface VoiceMediaDevice {
  deviceId: string;
  label: string;
}

type VoiceMediaDevices = Record<VoiceDeviceKind, VoiceMediaDevice[]>;

type VoiceSettingsSnapshot = {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  cameraDeviceId: string | null;
  automaticInputSensitivity: boolean;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
};

const DEFAULT_VOICE_SETTINGS: VoiceSettingsSnapshot = {
  inputDeviceId: null,
  outputDeviceId: null,
  cameraDeviceId: null,
  automaticInputSensitivity: true,
  manualInputSensitivity: DEFAULT_MANUAL_MIC_THRESHOLD,
  noiseSuppressionEnabled: true,
};

type MicCaptureOptionsOverrides = {
  includeDeviceId?: boolean;
};

function emptyVoiceMediaDevices(): VoiceMediaDevices {
  return {
    audioinput: [],
    audiooutput: [],
    videoinput: [],
  };
}

function clampManualInputSensitivity(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MANUAL_MIC_THRESHOLD;
  }

  return Math.min(
    MANUAL_INPUT_SENSITIVITY_MAX,
    Math.max(MANUAL_INPUT_SENSITIVITY_MIN, value),
  );
}

function normalizeSelectedDeviceId(deviceId: string | null | undefined) {
  if (typeof deviceId !== 'string') {
    return null;
  }

  const trimmed = deviceId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function loadVoiceSettings(): VoiceSettingsSnapshot {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_VOICE_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<VoiceSettingsSnapshot>;
    return {
      inputDeviceId: normalizeSelectedDeviceId(parsed.inputDeviceId),
      outputDeviceId: normalizeSelectedDeviceId(parsed.outputDeviceId),
      cameraDeviceId: normalizeSelectedDeviceId(parsed.cameraDeviceId),
      automaticInputSensitivity: parsed.automaticInputSensitivity !== false,
      manualInputSensitivity: clampManualInputSensitivity(
        typeof parsed.manualInputSensitivity === 'number'
          ? parsed.manualInputSensitivity
          : DEFAULT_MANUAL_MIC_THRESHOLD,
      ),
      noiseSuppressionEnabled: parsed.noiseSuppressionEnabled !== false,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

function persistVoiceSettings(settings: VoiceSettingsSnapshot) {
  try {
    localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function fallbackDeviceLabel(kind: VoiceDeviceKind, index: number) {
  if (kind === 'audioinput') return `Microphone ${index}`;
  if (kind === 'audiooutput') return `Speaker ${index}`;
  return `Camera ${index}`;
}

async function enumerateVoiceMediaDevices(): Promise<VoiceMediaDevices> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return emptyVoiceMediaDevices();
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const counts: Record<VoiceDeviceKind, number> = {
      audioinput: 0,
      audiooutput: 0,
      videoinput: 0,
    };
    const next = emptyVoiceMediaDevices();

    for (const device of devices) {
      if (device.kind !== 'audioinput' && device.kind !== 'audiooutput' && device.kind !== 'videoinput') {
        continue;
      }

      counts[device.kind] += 1;
      next[device.kind].push({
        deviceId: device.deviceId,
        label: device.label || fallbackDeviceLabel(device.kind, counts[device.kind]),
      });
    }

    return next;
  } catch {
    return emptyVoiceMediaDevices();
  }
}

export interface VoiceConnectionStats {
  state: ConnectionState;
  pingMs: number | null;
  jitterMs: number | null;
  packetLossPct: number | null;
  bars: 0 | 1 | 2 | 3 | 4;
  tone: VoiceConnectionTone;
  source: VoiceConnectionSource;
  quality: ConnectionQuality;
}

export interface VoiceParticipant {
  identity: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened?: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  videoTrack?: Track;
  screenTrack?: Track;
}

interface VoiceStore {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  cameraDeviceId: string | null;
  automaticInputSensitivity: boolean;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  mediaDevices: VoiceMediaDevices;
  connected: boolean;
  connecting: boolean;
  roomName: string | null;
  streamId: string | null;
  participants: VoiceParticipant[];
  speakingSignals: Record<string, boolean>;
  connectionStats: VoiceConnectionStats;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  pttActive: boolean;
  pttMode: boolean;
  /** 0–1 per remote identity; used for HTML audio elements tagged with data-riftapp-voice-id */
  participantVolumes: Record<string, number>;
  /** Mutes all remote voice output without changing per-user slider values */
  voiceOutputMuted: boolean;
  /** Extra 0–1 multiplier for participants who are screen sharing (stream audio) */
  streamVolumes: Record<string, number>;
  /** Per-identity stream mute (context menu) */
  streamAudioMuted: Record<string, boolean>;
  /** Duck stream audio when others are speaking */
  streamAttenuationEnabled: boolean;
  /** 0–100, higher = stronger ducking */
  streamAttenuationStrength: number;
  screenShareModalOpen: boolean;
  screenShareRequesting: boolean;
  screenShareKind: ScreenShareKind;
  screenShareFps: ScreenShareFps;
  screenShareResolution: ScreenShareResolution;
  screenShareSurfaceLabel: string | null;
  screenShareNotice: ScreenShareNotice | null;

  join: (streamId: string) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  changeScreenShare: () => Promise<void>;
  setScreenShareQuality: (fps: ScreenShareFps, resolution: ScreenShareResolution) => Promise<void>;
  dismissScreenShareNotice: () => void;
  togglePTT: () => void;
  setParticipantVolume: (identity: string, volume: number) => void;
  toggleVoiceOutputMute: () => void;
  setStreamVolume: (identity: string, volume: number) => void;
  toggleStreamAudioMute: (identity: string) => void;
  setStreamAttenuationEnabled: (enabled: boolean) => void;
  setStreamAttenuationStrength: (strength: number) => void;
  refreshMediaDevices: () => Promise<void>;
  setInputDeviceId: (deviceId: string | null) => Promise<void>;
  setOutputDeviceId: (deviceId: string | null) => Promise<void>;
  setCameraDeviceId: (deviceId: string | null) => Promise<void>;
  setAutomaticInputSensitivity: (enabled: boolean) => void;
  setManualInputSensitivity: (threshold: number) => void;
  setNoiseSuppressionEnabled: (enabled: boolean) => Promise<void>;
  toggleNoiseSuppression: () => Promise<void>;
  moveToStream: (streamId: string) => Promise<void>;
  applySpeakingSignal: (identity: string, speaking: boolean) => void;
  clearSpeakingSignal: (identity: string) => void;
  triggerSoundboardSpeaking: (identity: string, durationMs: number) => void;
}

const CONNECT_TIMEOUT_MS = 15_000;

function micAudioCaptureOptions(
  state: Pick<VoiceStore, 'inputDeviceId' | 'noiseSuppressionEnabled'>,
  processor?: MicNoiseGateProcessor,
  overrides?: MicCaptureOptionsOverrides,
): AudioCaptureOptions {
  const base: AudioCaptureOptions = {
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: false,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
    deviceId: overrides?.includeDeviceId === false ? undefined : state.inputDeviceId ?? undefined,
    processor,
  };

  return base;
}

function cameraCaptureOptions(cameraDeviceId: string | null) {
  return {
    deviceId: cameraDeviceId ?? undefined,
    resolution: {
      width: 2560,
      height: 1440,
      frameRate: 60,
    },
  };
}

let roomRef: Room | null = null;
let joiningLock = false;
let pttModeRef = false;
let wasMutedBeforeDeafen = false;
let screenShareNoticeTimer: number | null = null;
let transientSpeakingExpiry = new Map<string, number>();
let transientSpeakingTimers = new Map<string, number>();
let micGateProcessor: MicNoiseGateProcessor | null = null;
let micLastSpeakingBroadcastAt = 0;
let connectionStatsTimer: number | null = null;

function createDefaultConnectionStats(): VoiceConnectionStats {
  return {
    state: ConnectionState.Disconnected,
    pingMs: null,
    jitterMs: null,
    packetLossPct: null,
    bars: 0,
    tone: 'neutral',
    source: 'unknown',
    quality: ConnectionQuality.Unknown,
  };
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number | null, digits = 0): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function statHasAudioKind(stat: RTCStats & Record<string, unknown>): boolean {
  return stat.kind === 'audio' || stat.mediaType === 'audio';
}

function getCandidatePairStats(report: RTCStatsReport): (RTCStats & Record<string, unknown>) | null {
  let selectedCandidatePairId: string | null = null;
  let fallbackPair: (RTCStats & Record<string, unknown>) | null = null;

  report.forEach((rawStat) => {
    const stat = rawStat as RTCStats & Record<string, unknown>;
    if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
      selectedCandidatePairId = stat.selectedCandidatePairId;
    }
    if (stat.type !== 'candidate-pair') return;
    if (
      fallbackPair == null &&
      (stat.nominated === true || stat.selected === true || stat.state === 'succeeded')
    ) {
      fallbackPair = stat;
    }
  });

  if (selectedCandidatePairId) {
    const selected = report.get(selectedCandidatePairId);
    if (selected) {
      return selected as RTCStats & Record<string, unknown>;
    }
  }
  return fallbackPair;
}

function extractMetricsFromReport(report: RTCStatsReport) {
  const audioJitterValues: number[] = [];
  const packetLossValues: number[] = [];

  report.forEach((rawStat) => {
    const stat = rawStat as RTCStats & Record<string, unknown>;
    if (!statHasAudioKind(stat)) return;

    if (stat.type === 'inbound-rtp') {
      const jitter = toFiniteNumber(stat.jitter);
      if (jitter != null) {
        audioJitterValues.push(jitter * 1000);
      }

      const packetsLost = toFiniteNumber(stat.packetsLost);
      const packetsReceived = toFiniteNumber(stat.packetsReceived);
      if (packetsLost != null && packetsReceived != null) {
        const total = packetsLost + packetsReceived;
        if (total > 0) {
          packetLossValues.push((packetsLost / total) * 100);
        }
      }
      return;
    }

    if (stat.type === 'remote-inbound-rtp') {
      const jitter = toFiniteNumber(stat.jitter);
      if (jitter != null) {
        audioJitterValues.push(jitter * 1000);
      }

      const fractionLost = toFiniteNumber(stat.fractionLost);
      if (fractionLost != null) {
        packetLossValues.push((fractionLost <= 1 ? fractionLost : fractionLost / 256) * 100);
      }
    }
  });

  const candidatePair = getCandidatePairStats(report);
  let pingMs: number | null = null;
  if (candidatePair) {
    const currentRoundTripTime = toFiniteNumber(candidatePair.currentRoundTripTime);
    if (currentRoundTripTime != null) {
      pingMs = currentRoundTripTime * 1000;
    } else {
      const totalRoundTripTime = toFiniteNumber(candidatePair.totalRoundTripTime);
      const responsesReceived = toFiniteNumber(candidatePair.responsesReceived);
      if (totalRoundTripTime != null && responsesReceived != null && responsesReceived > 0) {
        pingMs = (totalRoundTripTime / responsesReceived) * 1000;
      }
    }
  }

  return {
    pingMs: roundMetric(pingMs),
    jitterMs: roundMetric(averageNumbers(audioJitterValues)),
    packetLossPct: roundMetric(averageNumbers(packetLossValues), 1),
  };
}

function deriveIndicatorFromMetrics(
  pingMs: number | null,
  quality: ConnectionQuality,
  state: ConnectionState,
): Pick<VoiceConnectionStats, 'bars' | 'tone' | 'source'> {
  if (state === ConnectionState.Disconnected) {
    return { bars: 0, tone: 'neutral', source: 'unknown' };
  }

  if (pingMs != null) {
    if (pingMs < 50) return { bars: 4, tone: 'good', source: 'webrtc' };
    if (pingMs < 100) return { bars: 3, tone: 'good', source: 'webrtc' };
    if (pingMs < 200) return { bars: 2, tone: 'medium', source: 'webrtc' };
    return { bars: 1, tone: 'bad', source: 'webrtc' };
  }

  switch (quality) {
    case ConnectionQuality.Excellent:
      return { bars: 4, tone: 'good', source: 'livekit' };
    case ConnectionQuality.Good:
      return { bars: 3, tone: 'good', source: 'livekit' };
    case ConnectionQuality.Poor:
      return { bars: 1, tone: 'bad', source: 'livekit' };
    case ConnectionQuality.Lost:
      return { bars: 0, tone: 'neutral', source: 'livekit' };
    default:
      return { bars: 0, tone: 'neutral', source: 'unknown' };
  }
}

function syncConnectionStatsState(room: Room, rawMetrics?: Partial<Record<'pingMs' | 'jitterMs' | 'packetLossPct', number | null>>) {
  const state = room.state;
  const quality = room.localParticipant.connectionQuality;

  useVoiceStore.setState((store) => {
    const current = store.connectionStats;
    const pingMs = state === ConnectionState.Disconnected
      ? null
      : rawMetrics && 'pingMs' in rawMetrics
        ? rawMetrics.pingMs ?? current.pingMs
        : current.pingMs;
    const jitterMs = state === ConnectionState.Disconnected
      ? null
      : rawMetrics && 'jitterMs' in rawMetrics
        ? rawMetrics.jitterMs ?? current.jitterMs
        : current.jitterMs;
    const packetLossPct = state === ConnectionState.Disconnected
      ? null
      : rawMetrics && 'packetLossPct' in rawMetrics
        ? rawMetrics.packetLossPct ?? current.packetLossPct
        : current.packetLossPct;
    const hasRawMetrics = pingMs != null || jitterMs != null || packetLossPct != null;
    const indicator = deriveIndicatorFromMetrics(pingMs, quality, state);

    return {
      connectionStats: {
        state,
        pingMs,
        jitterMs,
        packetLossPct,
        bars: indicator.bars,
        tone: indicator.tone,
        source: hasRawMetrics ? 'webrtc' : indicator.source,
        quality,
      },
    };
  });
}

async function sampleConnectionStats(room: Room) {
  if (roomRef !== room || room.state === ConnectionState.Disconnected) return;

  const pcManager = room.engine.pcManager;
  if (!pcManager) {
    syncConnectionStatsState(room);
    return;
  }

  const transports = [pcManager.publisher, pcManager.subscriber].filter(Boolean) as Array<{ getStats: () => Promise<RTCStatsReport> }>;
  const results = await Promise.allSettled(transports.map((transport) => transport.getStats()));
  if (roomRef !== room) return;

  let pingMs: number | null = null;
  const jitterValues: number[] = [];
  const packetLossValues: number[] = [];

  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    const metrics = extractMetricsFromReport(result.value);
    if (pingMs == null && metrics.pingMs != null) {
      pingMs = metrics.pingMs;
    }
    if (metrics.jitterMs != null) {
      jitterValues.push(metrics.jitterMs);
    }
    if (metrics.packetLossPct != null) {
      packetLossValues.push(metrics.packetLossPct);
    }
  });

  syncConnectionStatsState(room, {
    pingMs,
    jitterMs: roundMetric(averageNumbers(jitterValues)),
    packetLossPct: roundMetric(averageNumbers(packetLossValues), 1),
  });
}

function stopConnectionStatsMonitor() {
  if (connectionStatsTimer != null) {
    window.clearInterval(connectionStatsTimer);
    connectionStatsTimer = null;
  }
}

function startConnectionStatsMonitor(room: Room) {
  stopConnectionStatsMonitor();
  syncConnectionStatsState(room);
  void sampleConnectionStats(room);
  connectionStatsTimer = window.setInterval(() => {
    if (roomRef !== room || room.state === ConnectionState.Disconnected) {
      stopConnectionStatsMonitor();
      return;
    }
    void sampleConnectionStats(room);
  }, CONNECTION_STATS_POLL_INTERVAL_MS);
}

function hasOwnKey(record: Record<string, boolean>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function voiceSettingsSnapshot(
  state: Pick<
    VoiceStore,
    | 'inputDeviceId'
    | 'outputDeviceId'
    | 'cameraDeviceId'
    | 'automaticInputSensitivity'
    | 'manualInputSensitivity'
    | 'noiseSuppressionEnabled'
  >,
): VoiceSettingsSnapshot {
  return {
    inputDeviceId: normalizeSelectedDeviceId(state.inputDeviceId),
    outputDeviceId: normalizeSelectedDeviceId(state.outputDeviceId),
    cameraDeviceId: normalizeSelectedDeviceId(state.cameraDeviceId),
    automaticInputSensitivity: state.automaticInputSensitivity,
    manualInputSensitivity: clampManualInputSensitivity(state.manualInputSensitivity),
    noiseSuppressionEnabled: state.noiseSuppressionEnabled,
  };
}

function persistVoiceSettingsFromStore(
  state: Pick<
    VoiceStore,
    | 'inputDeviceId'
    | 'outputDeviceId'
    | 'cameraDeviceId'
    | 'automaticInputSensitivity'
    | 'manualInputSensitivity'
    | 'noiseSuppressionEnabled'
  >,
) {
  persistVoiceSettings(voiceSettingsSnapshot(state));
}

function broadcastLocalSpeakingState(identity: string, speaking: boolean, force = false) {
  const state = useVoiceStore.getState();
  const streamId = state.streamId;
  const now = performance.now();

  if (!force && speaking && now - micLastSpeakingBroadcastAt < SPEAKING_BROADCAST_INTERVAL_MS) {
    return;
  }
  micLastSpeakingBroadcastAt = now;

  state.applySpeakingSignal(identity, speaking);
  if (streamId) {
    wsSend('voice_speaking_update', { stream_id: streamId, speaking });
  }
}

function currentMicGateSettings() {
  const state = useVoiceStore.getState();
  return {
    automaticSensitivity: state.automaticInputSensitivity,
    manualThreshold: state.manualInputSensitivity,
    releaseMs: DEFAULT_MIC_GATE_RELEASE_MS,
    noiseSuppressionEnabled: state.noiseSuppressionEnabled,
  };
}

function createMicGate(identity: string) {
  const previousProcessor = micGateProcessor;
  const nextProcessor = new MicNoiseGateProcessor(currentMicGateSettings(), {
    onSpeakingStateChange: (speaking) => {
      broadcastLocalSpeakingState(identity, speaking, true);
    },
  });

  micGateProcessor = nextProcessor;

  if (previousProcessor) {
    void previousProcessor.destroy().catch(() => {});
  }

  return nextProcessor;
}

function updateMicGateSettings() {
  micGateProcessor?.updateSettings(currentMicGateSettings());
}

function stopMicProcessing(options?: { broadcast?: boolean; identity?: string }) {
  const identity = options?.identity;

  const processor = micGateProcessor;
  micGateProcessor = null;

  if (processor) {
    void processor.destroy().catch(() => {});
  }

  if (identity) {
    if (options?.broadcast) {
      broadcastLocalSpeakingState(identity, false, true);
    } else {
      useVoiceStore.getState().applySpeakingSignal(identity, false);
    }
  }

  micLastSpeakingBroadcastAt = 0;
}

function microphoneFailureNotice(err: unknown): ScreenShareNotice {
  const name = err instanceof DOMException ? err.name : '';
  const message = err instanceof Error ? err.message.toLowerCase() : '';

  if (name === 'NotAllowedError' || message.includes('permission')) {
    return { tone: 'error', message: 'Microphone permission denied. Connected muted.' };
  }

  if (
    name === 'NotFoundError' ||
    message.includes('not found') ||
    message.includes('device')
  ) {
    return { tone: 'error', message: 'Microphone unavailable. Connected muted.' };
  }

  return { tone: 'error', message: 'Unable to start microphone. Connected muted.' };
}

async function disableMicrophoneAfterFailedAttempt(room: Room) {
  stopMicProcessing({ broadcast: false, identity: room.localParticipant.identity });

  try {
    await room.localParticipant.setMicrophoneEnabled(false);
  } catch {
    /* ignore cleanup failures */
  }
}

async function enableLocalMicrophone(room: Room) {
  const currentState = useVoiceStore.getState();
  const identity = room.localParticipant.identity;
  const fallbacks: Array<{ label: string; processor?: MicNoiseGateProcessor; overrides?: MicCaptureOptionsOverrides }> = [
    { label: 'processed-selected-device', processor: createMicGate(identity) },
    { label: 'raw-selected-device' },
    { label: 'raw-default-device', overrides: { includeDeviceId: false } },
  ];

  let lastError: unknown = null;

  for (const { label, processor, overrides } of fallbacks) {
    try {
      const options = micAudioCaptureOptions(currentState, processor, overrides);
      await room.localParticipant.setMicrophoneEnabled(true, options);
      setScreenShareNotice(null);
      return true;
    } catch (err) {
      lastError = err;
      console.warn(`Failed to enable microphone via ${label}:`, err);
      await disableMicrophoneAfterFailedAttempt(room);
    }
  }

  console.error('Failed to enable microphone after fallbacks:', lastError);
  setScreenShareNotice(microphoneFailureNotice(lastError));
  return false;
}

async function restartLocalMicrophone(room: Room) {
  if (room.state !== ConnectionState.Connected || !room.localParticipant.isMicrophoneEnabled) {
    updateMicGateSettings();
    return room.localParticipant.isMicrophoneEnabled;
  }

  await room.localParticipant.setMicrophoneEnabled(false);
  stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
  return enableLocalMicrophone(room);
}

async function applyOutputDevice(room: Room, outputDeviceId: string | null) {
  try {
    await room.switchActiveDevice('audiooutput', outputDeviceId ?? 'default');
  } catch {
    /* ignore unsupported browser sink switching */
  }
}

function clearScreenShareNoticeTimer() {
  if (screenShareNoticeTimer != null) {
    window.clearTimeout(screenShareNoticeTimer);
    screenShareNoticeTimer = null;
  }
}

function isTransientSpeaking(identity: string): boolean {
  const expiresAt = transientSpeakingExpiry.get(identity);
  if (expiresAt == null) return false;
  if (expiresAt <= Date.now()) {
    transientSpeakingExpiry.delete(identity);
    return false;
  }
  return true;
}

function clearTransientSpeaking() {
  transientSpeakingTimers.forEach((timer) => window.clearTimeout(timer));
  transientSpeakingTimers.clear();
  transientSpeakingExpiry.clear();
}

function pulseTransientSpeaking(identity: string, durationMs: number) {
  const clampedMs = Math.min(8000, Math.max(450, Math.round(durationMs)));
  const expiresAt = Date.now() + clampedMs;
  transientSpeakingExpiry.set(identity, expiresAt);

  const prevTimer = transientSpeakingTimers.get(identity);
  if (prevTimer != null) {
    window.clearTimeout(prevTimer);
  }

  transientSpeakingTimers.set(identity, window.setTimeout(() => {
    transientSpeakingTimers.delete(identity);
    const currentExpiry = transientSpeakingExpiry.get(identity);
    if (currentExpiry != null && currentExpiry <= Date.now()) {
      transientSpeakingExpiry.delete(identity);
    }
    syncParticipants();
  }, clampedMs + 24));

  syncParticipants();
}

function setScreenShareNotice(notice: ScreenShareNotice | null) {
  clearScreenShareNoticeTimer();
  useVoiceStore.setState({ screenShareNotice: notice });
  if (notice) {
    screenShareNoticeTimer = window.setTimeout(() => {
      useVoiceStore.setState({ screenShareNotice: null });
      screenShareNoticeTimer = null;
    }, 3200);
  }
}

function requestedSurfaceLabel(kind: ScreenShareKind): string {
  if (kind === 'tab') return 'Tab';
  if (kind === 'window') return 'Window';
  return 'Screen';
}

function inferSurfaceLabel(kind: ScreenShareKind): string {
  const pub = roomRef?.localParticipant.getTrackPublication(Track.Source.ScreenShare) as LocalTrackPublication | undefined;
  const mediaTrack = (pub?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack;
  const displaySurface = mediaTrack?.getSettings?.().displaySurface;
  if (displaySurface === 'browser') return 'Tab';
  if (displaySurface === 'window') return 'Window';
  if (displaySurface === 'monitor') return 'Screen';
  return requestedSurfaceLabel(kind);
}

const SCREEN_SHARE_RESOLUTIONS: Record<ScreenShareResolution, { width?: number; height?: number }> = {
  '480p':   { width: 854,  height: 480  },
  '720p':   { width: 1280, height: 720  },
  '1080p':  { width: 1920, height: 1080 },
  '1440p':  { width: 2560, height: 1440 },
  'source': {},
};

const SCREEN_SHARE_BITRATES: Record<ScreenShareResolution, Record<ScreenShareFps, number>> = {
  '480p':   { 15: 500_000,   30: 800_000,   60: 1_200_000  },
  '720p':   { 15: 1_500_000, 30: 2_500_000, 60: 4_000_000  },
  '1080p':  { 15: 3_000_000, 30: 5_000_000, 60: 8_000_000  },
  '1440p':  { 15: 5_000_000, 30: 8_000_000, 60: 12_000_000 },
  'source': { 15: 5_000_000, 30: 8_000_000, 60: 12_000_000 },
};

function screenSharePublishEncoding(fps: ScreenShareFps, resolution: ScreenShareResolution) {
  return {
    screenShareEncoding: {
      maxBitrate: SCREEN_SHARE_BITRATES[resolution][fps],
      maxFramerate: fps,
      priority: 'high' as const,
    },
  };
}

function buildScreenShareOptions(kind: ScreenShareKind, fps: ScreenShareFps = 30, resolution: ScreenShareResolution = '1080p') {
  const resConstraints = SCREEN_SHARE_RESOLUTIONS[resolution];
  const options: Record<string, unknown> = {
    resolution: { ...resConstraints, frameRate: fps },
    contentHint: 'detail',
    surfaceSwitching: 'include',
  };
  if (kind === 'tab') {
    options.preferCurrentTab = true;
    options.selfBrowserSurface = 'include';
  } else if (kind === 'window') {
    options.selfBrowserSurface = 'exclude';
    options.preferCurrentTab = false;
  } else {
    options.monitorTypeSurfaces = 'include';
    options.preferCurrentTab = false;
  }
  return options;
}

async function startScreenShare(room: Room, state: Pick<VoiceStore, 'screenShareKind' | 'screenShareFps' | 'screenShareResolution'>, streamId: string | null) {
  // Go directly to browser's native picker — no intermediate modal
  useVoiceStore.setState({ screenShareRequesting: true });
  setScreenShareNotice(null);
  try {
    await room.localParticipant.setScreenShareEnabled(
      true,
      buildScreenShareOptions(state.screenShareKind, state.screenShareFps, state.screenShareResolution) as never,
      screenSharePublishEncoding(state.screenShareFps, state.screenShareResolution),
    );
    useVoiceStore.setState({
      isScreenSharing: true,
      screenShareRequesting: false,
      screenShareSurfaceLabel: inferSurfaceLabel(state.screenShareKind),
      screenShareModalOpen: true,
    });
    if (streamId) wsSend('voice_screen_share_update', { stream_id: streamId, sharing: true });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    useVoiceStore.setState({ screenShareRequesting: false });
    if (name === 'AbortError' || message.includes('cancel')) {
      setScreenShareNotice({ tone: 'info', message: 'Screen share cancelled' });
    } else if (name === 'NotFoundError' || message.includes('available')) {
      setScreenShareNotice({ tone: 'error', message: 'No screen available to share' });
    } else if (name === 'NotAllowedError') {
      setScreenShareNotice({ tone: 'error', message: 'Screen share permission denied — check browser settings' });
    } else {
      setScreenShareNotice({ tone: 'error', message: 'Unable to start screen share' });
    }
  }
}

async function stopScreenShare(room: Room) {
  // Use setScreenShareEnabled(false) so LiveKit properly signals all remote participants
  // before stopping the underlying track (prevents ghost/frozen tiles on remote end)
  await room.localParticipant.setScreenShareEnabled(false);
  useVoiceStore.setState({ isScreenSharing: false, screenShareSurfaceLabel: null, screenShareRequesting: false, screenShareModalOpen: false });
}

function playTone(frequency: number, duration: number, gain: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* Audio not available */ }
}

function playJoinSound() {
  playTone(880, 0.15, 0.15);
  setTimeout(() => playTone(1100, 0.15, 0.12), 100);
}

function playLeaveSound() {
  playTone(600, 0.15, 0.12);
  setTimeout(() => playTone(440, 0.2, 0.1), 100);
}

function playMuteSound() {
  playTone(480, 0.1, 0.1);
}

function playUnmuteSound() {
  playTone(640, 0.1, 0.1);
}

function playDeafenSound() {
  playTone(400, 0.12, 0.1);
  setTimeout(() => playTone(300, 0.15, 0.08), 80);
}

function playUndeafenSound() {
  playTone(500, 0.12, 0.1);
  setTimeout(() => playTone(700, 0.12, 0.08), 80);
}

function detachAllRoomMedia(room: Room) {
  room.remoteParticipants.forEach((rp) => {
    rp.trackPublications.forEach((pub) => {
      if (pub.track) pub.track.detach().forEach((el) => el.remove());
    });
  });
}

async function stopLocalTracks(room: Room) {
  try {
    for (const source of [Track.Source.Microphone, Track.Source.Camera, Track.Source.ScreenShare]) {
      const pub = room.localParticipant.getTrackPublication(source);
      if (pub?.track) {
        pub.track.stop();
        await room.localParticipant.unpublishTrack(pub.track);
      }
    }
  } catch { /* Already stopped */ }
}

function getTrackForSource(p: Participant, source: Track.Source): Track | undefined {
  return p.getTrackPublication(source)?.track ?? undefined;
}

function buildParticipants(room: Room): VoiceParticipant[] {
  if (room.state !== ConnectionState.Connected) return [];
  const speakingSignals = useVoiceStore.getState().speakingSignals;
  const streamId = useVoiceStore.getState().streamId;
  const deafenedUsers = streamId ? (useStreamStore.getState().voiceDeafenedUsers[streamId] ?? []) : [];
  const toVP = (p: Participant): VoiceParticipant => ({
    identity: p.identity,
    isSpeaking: (hasOwnKey(speakingSignals, p.identity) ? speakingSignals[p.identity] : false) || isTransientSpeaking(p.identity) || p.isSpeaking,
    isMuted: !p.isMicrophoneEnabled,
    isCameraOn: p.isCameraEnabled,
    isScreenSharing: p.isScreenShareEnabled,
    videoTrack: getTrackForSource(p, Track.Source.Camera),
    screenTrack: getTrackForSource(p, Track.Source.ScreenShare),
  });
  const localVP = toVP(room.localParticipant);
  localVP.isDeafened = useVoiceStore.getState().isDeafened;
  const list: VoiceParticipant[] = [localVP];
  room.remoteParticipants.forEach((rp) => {
    const vp = toVP(rp);
    vp.isDeafened = deafenedUsers.includes(rp.identity);
    list.push(vp);
  });
  return list;
}

function syncParticipants() {
  if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
  const participants = buildParticipants(roomRef);
  const localSharing = roomRef.localParticipant.isScreenShareEnabled;
  useVoiceStore.setState({
    participants,
    isCameraOn: roomRef.localParticipant.isCameraEnabled,
    isScreenSharing: localSharing,
    screenShareSurfaceLabel: localSharing
      ? useVoiceStore.getState().screenShareSurfaceLabel ?? requestedSurfaceLabel(useVoiceStore.getState().screenShareKind)
      : null,
  });
  reapplyAllRemoteVoiceVolumes();
}

function effectiveRemoteVolume(identity: string): number {
  const s = useVoiceStore.getState();
  if (s.voiceOutputMuted) return 0;
  let base = s.participantVolumes[identity] ?? 1;
  const p = s.participants.find((x) => x.identity === identity);
  if (p?.isScreenSharing) {
    if (s.streamAudioMuted[identity]) base = 0;
    else base *= s.streamVolumes[identity] ?? 1;
    if (s.streamAttenuationEnabled) {
      const othersSpeaking = s.participants.some((x) => x.isSpeaking && x.identity !== identity);
      if (othersSpeaking) {
        const t = (s.streamAttenuationStrength ?? 40) / 100;
        base *= Math.max(0.12, 1 - t * 0.88);
      }
    }
  }
  return Math.min(1, Math.max(0, base));
}

function appendRemoteAudioElement(track: Track, identity: string) {
  const el = track.attach() as HTMLMediaElement;
  el.setAttribute('data-riftapp-voice-id', identity);
  el.volume = effectiveRemoteVolume(identity);
  document.body.appendChild(el);
}

function reapplyAllRemoteVoiceVolumes() {
  document.querySelectorAll<HTMLMediaElement>('audio[data-riftapp-voice-id]').forEach((el) => {
    const id = el.getAttribute('data-riftapp-voice-id');
    if (id) el.volume = effectiveRemoteVolume(id);
  });
}

function resetState() {
  clearScreenShareNoticeTimer();
  clearTransientSpeaking();
  stopConnectionStatsMonitor();
  stopMicProcessing({ broadcast: false, identity: roomRef?.localParticipant.identity });
  useVoiceStore.setState({
    connected: false,
    connecting: false,
    roomName: null,
    streamId: null,
    participants: [],
    speakingSignals: {},
    connectionStats: createDefaultConnectionStats(),
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    pttActive: false,
    participantVolumes: {},
    voiceOutputMuted: false,
    streamVolumes: {},
    streamAudioMuted: {},
    streamAttenuationEnabled: false,
    streamAttenuationStrength: 40,
    screenShareModalOpen: false,
    screenShareRequesting: false,
    screenShareKind: 'screen',
    screenShareFps: 30,
    screenShareResolution: '1080p',
    screenShareSurfaceLabel: null,
    screenShareNotice: null,
  });
}

async function destroyRoom(room: Room) {
  detachAllRoomMedia(room);
  await stopLocalTracks(room);
  room.removeAllListeners();
  room.disconnect();
}

const initialVoiceSettings = loadVoiceSettings();

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  inputDeviceId: initialVoiceSettings.inputDeviceId,
  outputDeviceId: initialVoiceSettings.outputDeviceId,
  cameraDeviceId: initialVoiceSettings.cameraDeviceId,
  automaticInputSensitivity: initialVoiceSettings.automaticInputSensitivity,
  manualInputSensitivity: initialVoiceSettings.manualInputSensitivity,
  noiseSuppressionEnabled: initialVoiceSettings.noiseSuppressionEnabled,
  mediaDevices: emptyVoiceMediaDevices(),
  connected: false,
  connecting: false,
  roomName: null,
  streamId: null,
  participants: [],
  speakingSignals: {},
  connectionStats: createDefaultConnectionStats(),
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  pttActive: false,
  pttMode: false,
  participantVolumes: {},
  voiceOutputMuted: false,
  streamVolumes: {},
  streamAudioMuted: {},
  streamAttenuationEnabled: false,
  streamAttenuationStrength: 40,
  screenShareModalOpen: false,
  screenShareRequesting: false,
  screenShareKind: 'screen',
  screenShareFps: 30,
  screenShareResolution: '1080p',
  screenShareSurfaceLabel: null,
  screenShareNotice: null,

  join: async (sid) => {
    if (joiningLock) return;
    joiningLock = true;

    if (roomRef) {
      const old = roomRef;
      stopConnectionStatsMonitor();
      roomRef = null;
      await destroyRoom(old);
    }

    set({
      connecting: true,
      connectionStats: { ...createDefaultConnectionStats(), state: ConnectionState.Connecting },
    });
    try {
      await get().refreshMediaDevices();
      const { token, url } = await api.getVoiceToken(sid);

      const voiceState = useVoiceStore.getState();
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: cameraCaptureOptions(voiceState.cameraDeviceId),
        audioCaptureDefaults: micAudioCaptureOptions(voiceState),
        publishDefaults: {
          videoEncoding: {
            maxBitrate: 8_000_000,
            maxFramerate: 60,
          },
          screenShareEncoding: ScreenSharePresets.h1080fps30.encoding,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: true,
          red: true,
          videoCodec: 'vp9',
          backupCodec: { codec: 'vp8', encoding: VideoPresets.h720.encoding },
        },
      });
      roomRef = room;

      room.on(RoomEvent.ParticipantConnected, () => { syncParticipants(); playJoinSound(); });
      room.on(RoomEvent.ParticipantDisconnected, () => { syncParticipants(); playLeaveSound(); });
      room.on(RoomEvent.TrackSubscribed, syncParticipants);
      room.on(RoomEvent.TrackUnsubscribed, syncParticipants);
      room.on(RoomEvent.TrackMuted, syncParticipants);
      room.on(RoomEvent.TrackUnmuted, syncParticipants);
      room.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);
      room.on(RoomEvent.LocalTrackPublished, syncParticipants);
      room.on(RoomEvent.LocalTrackUnpublished, syncParticipants);
      room.on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => {
        if (!participant.isLocal || roomRef !== room) return;
        syncConnectionStatsState(room);
      });
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        syncConnectionStatsState(room);
        if (state === ConnectionState.Disconnected && roomRef === room) {
          const currentSid = useVoiceStore.getState().streamId;
          if (currentSid) wsSend('voice_state_update', { stream_id: currentSid, action: 'leave' });
          stopConnectionStatsMonitor();
          stopMicProcessing({ broadcast: false, identity: room.localParticipant.identity });
          roomRef = null;
          detachAllRoomMedia(room);
          room.removeAllListeners();
          resetState();
          return;
        }
        void sampleConnectionStats(room);
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track && track.kind === Track.Kind.Audio) {
          appendRemoteAudioElement(track, participant.identity);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
        if (track) track.detach().forEach((el) => el.remove());
      });

      await Promise.race([
        room.connect(url, token),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)),
      ]);

      if (roomRef !== room) { room.disconnect(); return; }

      await applyOutputDevice(room, useVoiceStore.getState().outputDeviceId);

      const startMuted = pttModeRef;
      let microphoneEnabled = !startMuted;
      if (!startMuted) {
        microphoneEnabled = await enableLocalMicrophone(room);
      }

      await get().refreshMediaDevices();

      set({
        connected: true,
        connecting: false,
        roomName: room.name,
        streamId: sid,
        isMuted: startMuted || !microphoneEnabled,
        isDeafened: false,
        isCameraOn: false,
        isScreenSharing: false,
        participants: buildParticipants(room),
        participantVolumes: {},
        voiceOutputMuted: false,
        streamVolumes: {},
        streamAudioMuted: {},
        streamAttenuationEnabled: false,
        streamAttenuationStrength: 40,
      });
      startConnectionStatsMonitor(room);
      wsSend('voice_state_update', { stream_id: sid, action: 'join' });
      playJoinSound();
    } catch (err) {
      console.error('Failed to join voice channel:', err);
      if (roomRef) { roomRef.removeAllListeners(); roomRef.disconnect(); roomRef = null; }
      resetState();
    } finally {
      set({ connecting: false });
      joiningLock = false;
    }
  },

  leave: async () => {
    const room = roomRef;
    const sid = get().streamId;
    if (!room) { resetState(); return; }
    stopConnectionStatsMonitor();
    stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
    // Notify screen share stop before leaving
    if (sid && get().isScreenSharing) wsSend('voice_screen_share_update', { stream_id: sid, sharing: false });
    roomRef = null;
    if (sid) wsSend('voice_state_update', { stream_id: sid, action: 'leave' });
    playLeaveSound();
    await destroyRoom(room);
    resetState();
  },

  toggleMute: async () => {
    const room = roomRef;
    if (!room || room.state !== ConnectionState.Connected) return;
    const wasEnabled = room.localParticipant.isMicrophoneEnabled;
    if (wasEnabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
      set({ isMuted: true });
      playMuteSound();
    } else {
      const microphoneEnabled = await enableLocalMicrophone(room);
      set({ isMuted: !microphoneEnabled });
      if (microphoneEnabled) playUnmuteSound();
    }
    syncParticipants();
  },

  toggleCamera: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const wasEnabled = roomRef.localParticipant.isCameraEnabled;
    await roomRef.localParticipant.setCameraEnabled(
      !wasEnabled,
      !wasEnabled ? cameraCaptureOptions(get().cameraDeviceId) : undefined,
    );
    set({ isCameraOn: !wasEnabled });
    syncParticipants();
  },

  toggleScreenShare: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const streamId = get().streamId;
    if (roomRef.localParticipant.isScreenShareEnabled) {
      await stopScreenShare(roomRef);
      if (streamId) wsSend('voice_screen_share_update', { stream_id: streamId, sharing: false });
    } else {
      await startScreenShare(roomRef, get(), streamId);
    }
    syncParticipants();
  },

  changeScreenShare: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const streamId = get().streamId;
    if (roomRef.localParticipant.isScreenShareEnabled) {
      await stopScreenShare(roomRef);
      if (streamId) wsSend('voice_screen_share_update', { stream_id: streamId, sharing: false });
      syncParticipants();
    }
    await startScreenShare(roomRef, get(), streamId);
    syncParticipants();
  },

  setScreenShareQuality: async (fps: ScreenShareFps, resolution: ScreenShareResolution) => {
    set({ screenShareFps: fps, screenShareResolution: resolution });
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    if (!roomRef.localParticipant.isScreenShareEnabled) return;
    const pub = roomRef.localParticipant.getTrackPublication(Track.Source.ScreenShare) as LocalTrackPublication | undefined;
    // 1. Update browser capture constraints (resolution + fps)
    const mediaTrack = (pub?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack;
    if (mediaTrack && mediaTrack.readyState === 'live') {
      const resConstraints = SCREEN_SHARE_RESOLUTIONS[resolution];
      try {
        await mediaTrack.applyConstraints({ ...resConstraints, frameRate: fps });
      } catch {
        // applyConstraints not supported for this screen capture — will apply on next share start
      }
    }
    // 2. Update the LiveKit sender bitrate/framerate cap so the encoding envelope
    //    matches what the browser now captures. Without this the SFU would still
    //    forward within the original publish envelope.
    const { maxBitrate, maxFramerate } = screenSharePublishEncoding(fps, resolution).screenShareEncoding;
    const rtcSender = (pub?.track as { sender?: RTCRtpSender } | undefined)?.sender;
    if (rtcSender) {
      try {
        const params = rtcSender.getParameters();
        if (params.encodings?.length) {
          params.encodings.forEach((enc) => {
            enc.maxBitrate = maxBitrate;
            enc.maxFramerate = maxFramerate;
          });
          await rtcSender.setParameters(params);
        }
      } catch {
        // setParameters not supported — effective on next share
      }
    }
  },



  dismissScreenShareNotice: () => {
    setScreenShareNotice(null);
  },

  toggleDeafen: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const room = roomRef;
    const next = !get().isDeafened;
    room.remoteParticipants.forEach((rp) => {
      rp.audioTrackPublications.forEach((pub) => {
        if (pub.track) {
          if (next) pub.track.detach().forEach((el) => el.remove());
          else appendRemoteAudioElement(pub.track, rp.identity);
        }
      });
    });
    if (next) {
      wasMutedBeforeDeafen = !room.localParticipant.isMicrophoneEnabled;
      if (room.localParticipant.isMicrophoneEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false);
        stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
        set({ isMuted: true });
      }
    } else if (!wasMutedBeforeDeafen) {
      const microphoneEnabled = await enableLocalMicrophone(room);
      set({ isMuted: !microphoneEnabled });
    }
    set({ isDeafened: next });
    if (next) playDeafenSound(); else playUndeafenSound();
    const sid = get().streamId;
    if (sid) wsSend('voice_deafen_update', { stream_id: sid, deafened: next });
    syncParticipants();
  },

  togglePTT: () => {
    const next = !get().pttMode;
    pttModeRef = next;
    if (roomRef && roomRef.state === ConnectionState.Connected) {
      const room = roomRef;
      if (next) {
        void room.localParticipant.setMicrophoneEnabled(false);
        stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
        set({ isMuted: true, pttActive: false, pttMode: next });
      } else {
        set({ pttMode: next });
        void enableLocalMicrophone(room).then((microphoneEnabled) => {
          set({ isMuted: !microphoneEnabled });
          syncParticipants();
        });
      }
      syncParticipants();
    } else {
      set({ pttMode: next });
    }
  },

  setParticipantVolume: (identity, volume) => {
    const v = Math.min(1, Math.max(0, volume));
    set((s) => ({ participantVolumes: { ...s.participantVolumes, [identity]: v } }));
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
  },

  toggleVoiceOutputMute: () => {
    set((s) => ({ voiceOutputMuted: !s.voiceOutputMuted }));
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
  },

  setStreamVolume: (identity, volume) => {
    const v = Math.min(1, Math.max(0, volume));
    set((s) => ({ streamVolumes: { ...s.streamVolumes, [identity]: v } }));
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
  },

  toggleStreamAudioMute: (identity) => {
    set((s) => {
      const next = !s.streamAudioMuted[identity];
      return { streamAudioMuted: { ...s.streamAudioMuted, [identity]: next } };
    });
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
  },

  setStreamAttenuationEnabled: (enabled) => {
    set({ streamAttenuationEnabled: enabled });
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
  },

  setStreamAttenuationStrength: (strength) => {
    const n = Math.min(100, Math.max(0, strength));
    set({ streamAttenuationStrength: n });
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
  },

  refreshMediaDevices: async () => {
    const mediaDevices = await enumerateVoiceMediaDevices();
    const current = get();
    const nextState = {
      mediaDevices,
      inputDeviceId:
        current.inputDeviceId && mediaDevices.audioinput.length > 0 && !mediaDevices.audioinput.some((device) => device.deviceId === current.inputDeviceId)
          ? null
          : current.inputDeviceId,
      outputDeviceId:
        current.outputDeviceId && mediaDevices.audiooutput.length > 0 && !mediaDevices.audiooutput.some((device) => device.deviceId === current.outputDeviceId)
          ? null
          : current.outputDeviceId,
      cameraDeviceId:
        current.cameraDeviceId && mediaDevices.videoinput.length > 0 && !mediaDevices.videoinput.some((device) => device.deviceId === current.cameraDeviceId)
          ? null
          : current.cameraDeviceId,
    };

    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });
  },

  setInputDeviceId: async (deviceId) => {
    const nextDeviceId = normalizeSelectedDeviceId(deviceId);
    const current = get();
    if (current.inputDeviceId === nextDeviceId) {
      return;
    }

    const nextState = { inputDeviceId: nextDeviceId };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isMicrophoneEnabled) {
      const microphoneEnabled = await restartLocalMicrophone(room);
      set({ isMuted: !microphoneEnabled });
      syncParticipants();
    }
  },

  setOutputDeviceId: async (deviceId) => {
    const nextDeviceId = normalizeSelectedDeviceId(deviceId);
    const current = get();
    if (current.outputDeviceId === nextDeviceId) {
      return;
    }

    const nextState = { outputDeviceId: nextDeviceId };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    if (roomRef?.state === ConnectionState.Connected) {
      await applyOutputDevice(roomRef, nextDeviceId);
    }
  },

  setCameraDeviceId: async (deviceId) => {
    const nextDeviceId = normalizeSelectedDeviceId(deviceId);
    const current = get();
    if (current.cameraDeviceId === nextDeviceId) {
      return;
    }

    const nextState = { cameraDeviceId: nextDeviceId };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    if (roomRef?.state === ConnectionState.Connected && roomRef.localParticipant.isCameraEnabled) {
      await roomRef.localParticipant.setCameraEnabled(false);
      await roomRef.localParticipant.setCameraEnabled(true, cameraCaptureOptions(nextDeviceId));
      syncParticipants();
    }
  },

  setAutomaticInputSensitivity: (enabled) => {
    const current = get();
    if (current.automaticInputSensitivity === enabled) {
      return;
    }

    const nextState = { automaticInputSensitivity: enabled };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });
    updateMicGateSettings();
  },

  setManualInputSensitivity: (threshold) => {
    const nextThreshold = clampManualInputSensitivity(threshold);
    const current = get();
    if (current.manualInputSensitivity === nextThreshold) {
      return;
    }

    const nextState = { manualInputSensitivity: nextThreshold };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });
    updateMicGateSettings();
  },

  setNoiseSuppressionEnabled: async (enabled) => {
    const current = get();
    if (current.noiseSuppressionEnabled === enabled) {
      return;
    }

    const nextState = { noiseSuppressionEnabled: enabled };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isMicrophoneEnabled) {
      const microphoneEnabled = await restartLocalMicrophone(room);
      set({ isMuted: !microphoneEnabled });
      syncParticipants();
    }
  },

  toggleNoiseSuppression: async () => {
    await get().setNoiseSuppressionEnabled(!get().noiseSuppressionEnabled);
  },

  moveToStream: async (sid) => {
    if (get().streamId === sid && get().connected) return;
    await get().leave();
    await get().join(sid);
  },

  applySpeakingSignal: (identity, speaking) => {
    let changed = false;
    set((state) => {
      if (state.speakingSignals[identity] === speaking) return state;
      changed = true;
      return {
        speakingSignals: { ...state.speakingSignals, [identity]: speaking },
      };
    });
    if (changed && roomRef?.state === ConnectionState.Connected) {
      syncParticipants();
    }
  },

  clearSpeakingSignal: (identity) => {
    let changed = false;
    set((state) => {
      if (!hasOwnKey(state.speakingSignals, identity)) return state;
      const speakingSignals = { ...state.speakingSignals };
      delete speakingSignals[identity];
      changed = true;
      return { speakingSignals };
    });
    if (changed && roomRef?.state === ConnectionState.Connected) {
      syncParticipants();
    }
  },

  triggerSoundboardSpeaking: (identity, durationMs) => {
    pulseTransientSpeaking(identity, durationMs);
  },
}));

// PTT key handler (global, runs once)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!pttModeRef || !roomRef) return;
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    e.preventDefault();
    if (e.repeat) return;
    if (roomRef.state !== ConnectionState.Connected) return;
    const room = roomRef;
    void enableLocalMicrophone(room);
    useVoiceStore.setState({ isMuted: false, pttActive: true });
    syncParticipants();
  });

  window.addEventListener('keyup', (e) => {
    if (!pttModeRef || !roomRef) return;
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    if (roomRef.state !== ConnectionState.Connected) return;
    roomRef.localParticipant.setMicrophoneEnabled(false);
    stopMicProcessing({ broadcast: true, identity: roomRef.localParticipant.identity });
    useVoiceStore.setState({ isMuted: true, pttActive: false });
    syncParticipants();
  });
}
