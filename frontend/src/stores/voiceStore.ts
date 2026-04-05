import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
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

const NS_STORAGE_KEY = 'riftapp-noise-suppression-mode';

export type NoiseSuppressionMode = 'krisp' | 'standard' | 'off';
export type ScreenShareKind = 'screen' | 'window' | 'tab';

type ScreenShareNotice = {
  tone: 'info' | 'error';
  message: string;
};

const VAD_THRESHOLD = 0.03;
const VAD_RELEASE_MS = 110;
const VAD_SPEAKING_BROADCAST_INTERVAL_MS = 80;
const VAD_LEVEL_PUSH_INTERVAL_MS = 33;
const CONNECTION_STATS_POLL_INTERVAL_MS = 1000;

type VoiceConnectionTone = 'good' | 'medium' | 'bad' | 'neutral';
type VoiceConnectionSource = 'webrtc' | 'livekit' | 'unknown';

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

function loadNoiseSuppressionMode(): NoiseSuppressionMode {
  try {
    const v = localStorage.getItem(NS_STORAGE_KEY);
    if (v === 'krisp' || v === 'standard' || v === 'off') return v;
  } catch {
    /* private mode / unavailable */
  }
  return 'krisp';
}

function persistNoiseSuppressionMode(mode: NoiseSuppressionMode) {
  try {
    localStorage.setItem(NS_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export interface VoiceParticipant {
  identity: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  videoTrack?: Track;
  screenTrack?: Track;
}

interface VoiceStore {
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
  micLevel: number;
  vadThreshold: number;
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
  screenShareSurfaceLabel: string | null;
  screenShareNotice: ScreenShareNotice | null;
  /**
   * Browser capture processing (Discord-style labels; uses WebRTC constraints, not the Krisp SDK).
   * `krisp` prefers experimental voice isolation where supported; `standard` uses classic noise suppression.
   */
  noiseSuppressionMode: NoiseSuppressionMode;

  join: (streamId: string) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  confirmScreenShare: () => Promise<void>;
  cancelScreenShareModal: () => void;
  setScreenShareKind: (kind: ScreenShareKind) => void;
  dismissScreenShareNotice: () => void;
  togglePTT: () => void;
  setParticipantVolume: (identity: string, volume: number) => void;
  toggleVoiceOutputMute: () => void;
  setStreamVolume: (identity: string, volume: number) => void;
  toggleStreamAudioMute: (identity: string) => void;
  setStreamAttenuationEnabled: (enabled: boolean) => void;
  setStreamAttenuationStrength: (strength: number) => void;
  setNoiseSuppressionMode: (mode: NoiseSuppressionMode) => Promise<void>;
  toggleNoiseSuppression: () => Promise<void>;
  moveToStream: (streamId: string) => Promise<void>;
  applySpeakingSignal: (identity: string, speaking: boolean) => void;
  clearSpeakingSignal: (identity: string) => void;
  triggerSoundboardSpeaking: (identity: string, durationMs: number) => void;
}

const CONNECT_TIMEOUT_MS = 15_000;

/** Constraints passed to LiveKit when enabling the microphone */
function micAudioCaptureOptions(mode: NoiseSuppressionMode): AudioCaptureOptions {
  const base: AudioCaptureOptions = {
    echoCancellation: true,
    autoGainControl: true,
  };
  if (mode === 'off') return { ...base, noiseSuppression: false };
  if (mode === 'standard') return { ...base, noiseSuppression: true };
  // "Krisp" branding: strongest stack the browser exposes (voice isolation supersedes noiseSuppression when supported)
  return { ...base, voiceIsolation: true };
}

let roomRef: Room | null = null;
let joiningLock = false;
let pttModeRef = false;
let wasMutedBeforeDeafen = false;
let screenShareNoticeTimer: number | null = null;
let transientSpeakingExpiry = new Map<string, number>();
let transientSpeakingTimers = new Map<string, number>();
let micVadContext: AudioContext | null = null;
let micVadAnalyser: AnalyserNode | null = null;
let micVadSource: MediaStreamAudioSourceNode | null = null;
let micVadData: Uint8Array<ArrayBuffer> | null = null;
let micVadFrame: number | null = null;
let micVadTrackId: string | null = null;
let micVadSpeaking = false;
let micVadHoldUntil = 0;
let micVadLastLevelPushAt = 0;
let micVadLastSpeakingBroadcastAt = 0;
let micVadDisplayLevel = 0;
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

function broadcastLocalSpeakingState(identity: string, speaking: boolean, force = false) {
  const state = useVoiceStore.getState();
  const streamId = state.streamId;
  const now = performance.now();

  if (!force && speaking && now - micVadLastSpeakingBroadcastAt < VAD_SPEAKING_BROADCAST_INTERVAL_MS) {
    return;
  }
  micVadLastSpeakingBroadcastAt = now;

  state.applySpeakingSignal(identity, speaking);
  if (streamId) {
    wsSend('voice_speaking_update', { stream_id: streamId, speaking });
  }
}

function stopMicActivityMonitor(options?: { broadcast?: boolean; identity?: string }) {
  const identity = options?.identity;

  if (micVadFrame != null) {
    window.cancelAnimationFrame(micVadFrame);
    micVadFrame = null;
  }

  micVadSource?.disconnect();
  micVadAnalyser?.disconnect();
  micVadSource = null;
  micVadAnalyser = null;
  micVadData = null;
  micVadTrackId = null;

  if (micVadContext) {
    void micVadContext.close().catch(() => {});
    micVadContext = null;
  }

  if (identity) {
    if (options?.broadcast) {
      broadcastLocalSpeakingState(identity, false, true);
    } else {
      useVoiceStore.getState().applySpeakingSignal(identity, false);
    }
  }

  micVadSpeaking = false;
  micVadHoldUntil = 0;
  micVadLastSpeakingBroadcastAt = 0;
  micVadLastLevelPushAt = 0;
  micVadDisplayLevel = 0;
  useVoiceStore.setState({ micLevel: 0 });
}

function currentMicMediaTrack(room: Room): MediaStreamTrack | null {
  const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
  const mediaTrack = (publication?.track as { mediaStreamTrack?: MediaStreamTrack } | undefined)?.mediaStreamTrack;
  return mediaTrack ?? null;
}

async function ensureMicActivityMonitor(room: Room) {
  if (room.state !== ConnectionState.Connected) return;
  const identity = room.localParticipant.identity;
  const mediaTrack = currentMicMediaTrack(room);
  if (!mediaTrack || mediaTrack.readyState === 'ended') {
    stopMicActivityMonitor({ broadcast: false, identity });
    return;
  }
  if (micVadFrame != null && micVadTrackId === mediaTrack.id) {
    return;
  }

  stopMicActivityMonitor({ broadcast: false, identity });

  const context = new AudioContext({ latencyHint: 'interactive' });
  const source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.12;
  source.connect(analyser);

  micVadContext = context;
  micVadSource = source;
  micVadAnalyser = analyser;
  micVadData = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  micVadTrackId = mediaTrack.id;
  micVadSpeaking = false;
  micVadHoldUntil = 0;
  micVadDisplayLevel = 0;
  micVadLastLevelPushAt = 0;
  micVadLastSpeakingBroadcastAt = 0;

  try {
    if (context.state === 'suspended') {
      await context.resume();
    }
  } catch {
    /* ignore audio context resume failures */
  }

  const step = () => {
    if (micVadContext !== context || micVadAnalyser !== analyser || micVadData == null) {
      return;
    }

    analyser.getByteTimeDomainData(micVadData);
    let sumSquares = 0;
    for (let index = 0; index < micVadData.length; index += 1) {
      const sample = (micVadData[index] - 128) / 128;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / micVadData.length);
    const now = performance.now();

    micVadDisplayLevel = rms > micVadDisplayLevel
      ? rms
      : micVadDisplayLevel * (rms < 0.004 ? 0.78 : 0.9);

    if (now - micVadLastLevelPushAt >= VAD_LEVEL_PUSH_INTERVAL_MS) {
      micVadLastLevelPushAt = now;
      useVoiceStore.setState({ micLevel: micVadDisplayLevel });
    }

    if (rms >= VAD_THRESHOLD) {
      micVadHoldUntil = now + VAD_RELEASE_MS;
      if (!micVadSpeaking) {
        micVadSpeaking = true;
        broadcastLocalSpeakingState(identity, true, true);
      }
    } else if (micVadSpeaking && now >= micVadHoldUntil) {
      micVadSpeaking = false;
      broadcastLocalSpeakingState(identity, false, true);
    }

    if (micVadSpeaking && now - micVadLastSpeakingBroadcastAt >= VAD_SPEAKING_BROADCAST_INTERVAL_MS) {
      broadcastLocalSpeakingState(identity, true, true);
    }

    micVadFrame = window.requestAnimationFrame(step);
  };

  micVadFrame = window.requestAnimationFrame(step);
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

function buildScreenShareOptions(kind: ScreenShareKind) {
  const options: Record<string, unknown> = {
    resolution: { width: 3840, height: 2160, frameRate: 60 },
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

async function stopScreenShare(room: Room) {
  const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare) as LocalTrackPublication | undefined;
  if (pub?.track) {
    pub.track.stop();
    await room.localParticipant.unpublishTrack(pub.track);
  }
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
  const toVP = (p: Participant): VoiceParticipant => ({
    identity: p.identity,
    isSpeaking: (hasOwnKey(speakingSignals, p.identity) ? speakingSignals[p.identity] : false) || isTransientSpeaking(p.identity),
    isMuted: !p.isMicrophoneEnabled,
    isCameraOn: p.isCameraEnabled,
    isScreenSharing: p.isScreenShareEnabled,
    videoTrack: getTrackForSource(p, Track.Source.Camera),
    screenTrack: getTrackForSource(p, Track.Source.ScreenShare),
  });
  const list: VoiceParticipant[] = [toVP(room.localParticipant)];
  room.remoteParticipants.forEach((rp) => list.push(toVP(rp)));
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
  stopMicActivityMonitor({ broadcast: false, identity: roomRef?.localParticipant.identity });
  useVoiceStore.setState({
    connected: false,
    connecting: false,
    roomName: null,
    streamId: null,
    participants: [],
    connectionStats: createDefaultConnectionStats(),
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    pttActive: false,
    micLevel: 0,
    participantVolumes: {},
    voiceOutputMuted: false,
    streamVolumes: {},
    streamAudioMuted: {},
    streamAttenuationEnabled: false,
    streamAttenuationStrength: 40,
    screenShareModalOpen: false,
    screenShareRequesting: false,
    screenShareKind: 'screen',
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

export const useVoiceStore = create<VoiceStore>((set, get) => ({
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
  micLevel: 0,
  vadThreshold: VAD_THRESHOLD,
  participantVolumes: {},
  voiceOutputMuted: false,
  streamVolumes: {},
  streamAudioMuted: {},
  streamAttenuationEnabled: false,
  streamAttenuationStrength: 40,
  screenShareModalOpen: false,
  screenShareRequesting: false,
  screenShareKind: 'screen',
  screenShareSurfaceLabel: null,
  screenShareNotice: null,
  noiseSuppressionMode: loadNoiseSuppressionMode(),

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
      const { token, url } = await api.getVoiceToken(sid);

      let nsMode = useVoiceStore.getState().noiseSuppressionMode;
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: VideoPresets.h1080.resolution },
        audioCaptureDefaults: micAudioCaptureOptions(nsMode),
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
          stopMicActivityMonitor({ broadcast: false, identity: room.localParticipant.identity });
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

      const startMuted = pttModeRef;
      nsMode = useVoiceStore.getState().noiseSuppressionMode;
      await room.localParticipant.setMicrophoneEnabled(
        !startMuted,
        !startMuted ? micAudioCaptureOptions(nsMode) : undefined,
      );
      if (!startMuted) {
        await ensureMicActivityMonitor(room);
      }

      set({
        connected: true,
        connecting: false,
        roomName: room.name,
        streamId: sid,
        isMuted: startMuted,
        isDeafened: false,
        isCameraOn: false,
        isScreenSharing: false,
        micLevel: 0,
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
    stopMicActivityMonitor({ broadcast: true, identity: room.localParticipant.identity });
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
    const nsMode = get().noiseSuppressionMode;
    await room.localParticipant.setMicrophoneEnabled(
      !wasEnabled,
      !wasEnabled ? micAudioCaptureOptions(nsMode) : undefined,
    );
    if (wasEnabled) {
      stopMicActivityMonitor({ broadcast: true, identity: room.localParticipant.identity });
    } else {
      await ensureMicActivityMonitor(room);
    }
    set({ isMuted: wasEnabled });
    syncParticipants();
  },

  toggleCamera: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const wasEnabled = roomRef.localParticipant.isCameraEnabled;
    await roomRef.localParticipant.setCameraEnabled(!wasEnabled);
    set({ isCameraOn: !wasEnabled });
    syncParticipants();
  },

  toggleScreenShare: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    if (roomRef.localParticipant.isScreenShareEnabled) {
      await stopScreenShare(roomRef);
    } else {
      set({ screenShareModalOpen: true });
    }
    syncParticipants();
  },

  confirmScreenShare: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const kind = get().screenShareKind;
    set({ screenShareRequesting: true });
    setScreenShareNotice(null);
    try {
      await roomRef.localParticipant.setScreenShareEnabled(true, buildScreenShareOptions(kind) as never);
      set({
        isScreenSharing: true,
        screenShareModalOpen: false,
        screenShareRequesting: false,
        screenShareSurfaceLabel: inferSurfaceLabel(kind),
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      set({ screenShareModalOpen: false, screenShareRequesting: false });
      if (name === 'AbortError' || message.includes('cancel')) {
        setScreenShareNotice({ tone: 'info', message: 'Screen share cancelled' });
      } else if (name === 'NotFoundError' || message.includes('available')) {
        setScreenShareNotice({ tone: 'error', message: 'No screen available to share' });
      } else if (name === 'NotAllowedError') {
        setScreenShareNotice({ tone: 'error', message: 'Permission denied' });
      } else {
        setScreenShareNotice({ tone: 'error', message: 'Unable to start screen share' });
      }
    }
    syncParticipants();
  },

  cancelScreenShareModal: () => {
    if (get().screenShareRequesting) return;
    set({ screenShareModalOpen: false });
  },

  setScreenShareKind: (kind) => {
    set({ screenShareKind: kind });
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
        stopMicActivityMonitor({ broadcast: true, identity: room.localParticipant.identity });
        set({ isMuted: true });
      }
    } else if (!wasMutedBeforeDeafen) {
      await room.localParticipant.setMicrophoneEnabled(true, micAudioCaptureOptions(get().noiseSuppressionMode));
      await ensureMicActivityMonitor(room);
      set({ isMuted: false });
    }
    set({ isDeafened: next });
    syncParticipants();
  },

  togglePTT: () => {
    const next = !get().pttMode;
    pttModeRef = next;
    if (roomRef && roomRef.state === ConnectionState.Connected) {
      const room = roomRef;
      const nsMode = get().noiseSuppressionMode;
      if (next) {
        void room.localParticipant.setMicrophoneEnabled(false);
        stopMicActivityMonitor({ broadcast: true, identity: room.localParticipant.identity });
        set({ isMuted: true, pttActive: false, pttMode: next });
      } else {
        void room.localParticipant.setMicrophoneEnabled(true, micAudioCaptureOptions(nsMode)).then(() => ensureMicActivityMonitor(room));
        set({ isMuted: false, pttMode: next });
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

  setNoiseSuppressionMode: async (mode) => {
    persistNoiseSuppressionMode(mode);
    set({ noiseSuppressionMode: mode });
    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isMicrophoneEnabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true, micAudioCaptureOptions(mode));
      await ensureMicActivityMonitor(room);
      syncParticipants();
    }
  },

  toggleNoiseSuppression: async () => {
    const cur = get().noiseSuppressionMode;
    await get().setNoiseSuppressionMode(cur === 'off' ? 'krisp' : 'off');
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
    const nsMode = useVoiceStore.getState().noiseSuppressionMode;
    const room = roomRef;
    void room.localParticipant.setMicrophoneEnabled(true, micAudioCaptureOptions(nsMode)).then(() => ensureMicActivityMonitor(room));
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
    stopMicActivityMonitor({ broadcast: true, identity: roomRef.localParticipant.identity });
    useVoiceStore.setState({ isMuted: true, pttActive: false });
    syncParticipants();
  });
}
