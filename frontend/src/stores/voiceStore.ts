import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  AudioPresets,
  ScreenSharePresets,
  type AudioCaptureOptions,
  type VideoCaptureOptions,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type Participant,
  ConnectionQuality,
  ConnectionState,
} from 'livekit-client';
import type {
  BackgroundProcessorWrapper,
  SwitchBackgroundProcessorOptions,
} from '@livekit/track-processors';
import type { DesktopDisplaySource } from '../types/desktop';
import type { DMCallMode, DMCallRing, DMCallRingEnd, DMConversationCallState } from '../types';
import { api } from '../api/client';
import { wsSend } from '../hooks/useWebSocket';
import { useAuthStore } from './auth';
import { useStreamStore } from './streamStore';
import { useActiveSpeakerStore } from './activeSpeakerStore';
import { usePresenceStore } from './presenceStore';
import { publicAssetUrl } from '../utils/publicAssetUrl';
import { getDesktop } from '../utils/desktop';
import { resolveVoiceParticipantSpeakingState } from '../utils/voiceSpeakingState';
import { startOutgoingCallSound, stopOutgoingCallSound } from '../utils/audio/appSounds';
import { debugVoiceSpeaking } from '../utils/audio/voiceSpeakingDebug';
import {
  DEFAULT_MANUAL_MIC_THRESHOLD,
  DEFAULT_MIC_GATE_RELEASE_MS,
  MicNoiseGateProcessor,
} from '../utils/audio/micNoiseGate';

const VOICE_SETTINGS_STORAGE_KEY = 'riftapp-voice-settings-v2';
export type ScreenShareKind = 'screen' | 'window' | 'tab';
export type ScreenShareFps = 24 | 30 | 60;
export type ScreenShareResolution = '480p' | '720p' | '1080p' | '1440p' | 'source';
export type CameraBackgroundMode = 'none' | 'blur' | 'custom';
export type VoiceTargetKind = 'stream' | 'conversation';
export type CameraBackgroundAsset = {
  kind: 'image' | 'gif' | 'video';
  url: string;
  previewUrl?: string;
  label?: string;
  source: 'upload' | 'tenor';
};

type VoiceDeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';

export type ScreenShareNotice = {
  tone: 'info' | 'error';
  message: string;
};

type StartScreenShareOptions = {
  surfaceLabel?: string | null;
};

type VoiceJoinTarget = {
  kind: VoiceTargetKind;
  id: string;
};

type TrackProcessorsModule = typeof import('@livekit/track-processors');

const SPEAKING_BROADCAST_INTERVAL_MS = 100;
const SPEAKING_HOLD_MS = 120;
const CONNECTION_STATS_POLL_INTERVAL_MS = 1000;
const DM_CALL_SESSION_EXPIRY_MS = 90_000;
const MANUAL_INPUT_SENSITIVITY_MIN = 0;
const MANUAL_INPUT_SENSITIVITY_MAX = 0.08;
const CAMERA_BACKGROUND_BLUR_RADIUS = 12;
const MAX_SAVED_CAMERA_BACKGROUNDS = 30;

type VoiceConnectionTone = 'good' | 'medium' | 'bad' | 'neutral';
type VoiceConnectionSource = 'webrtc' | 'livekit' | 'unknown';

type ConversationCallSession = {
  conversationId: string;
  initiatorId: string;
  mode: DMCallMode;
  startedAtMs: number;
};

export interface VoiceMediaDevice {
  deviceId: string;
  label: string;
}

type VoiceMediaDevices = Record<VoiceDeviceKind, VoiceMediaDevice[]>;

type VoiceSettingsSnapshot = {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  cameraDeviceId: string | null;
  inputVolume: number;
  outputVolume: number;
  automaticInputSensitivity: boolean;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  pttMode: boolean;
  cameraBackgroundMode: CameraBackgroundMode;
  cameraBackgroundAsset: CameraBackgroundAsset | null;
  savedCameraBackgroundAssets: CameraBackgroundAsset[];
};

const DEFAULT_VOICE_SETTINGS: VoiceSettingsSnapshot = {
  inputDeviceId: null,
  outputDeviceId: null,
  cameraDeviceId: null,
  inputVolume: 1,
  outputVolume: 1,
  automaticInputSensitivity: true,
  manualInputSensitivity: DEFAULT_MANUAL_MIC_THRESHOLD,
  noiseSuppressionEnabled: true,
  echoCancellationEnabled: true,
  pttMode: false,
  cameraBackgroundMode: 'none',
  cameraBackgroundAsset: null,
  savedCameraBackgroundAssets: [],
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

function clampVoiceVolume(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeSelectedDeviceId(deviceId: string | null | undefined) {
  if (typeof deviceId !== 'string') {
    return null;
  }

  const trimmed = deviceId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const conversationCallSessions = new Map<string, ConversationCallSession>();
const conversationCallExpiryTimers = new Map<string, number>();

function clearConversationCallExpiryTimer(conversationId: string) {
  const timer = conversationCallExpiryTimers.get(conversationId);
  if (timer != null) {
    window.clearTimeout(timer);
    conversationCallExpiryTimers.delete(conversationId);
  }
}

function clearConversationCallSession(conversationId: string) {
  conversationCallSessions.delete(conversationId);
  clearConversationCallExpiryTimer(conversationId);
}

function registerConversationCallSession(ring: DMCallRing) {
  const currentUserId = useAuthStore.getState().user?.id ?? null;
  if (!currentUserId || ring.initiator_id !== currentUserId) {
    return;
  }
  const startedAtMs = Date.parse(ring.started_at);
  conversationCallSessions.set(ring.conversation_id, {
    conversationId: ring.conversation_id,
    initiatorId: ring.initiator_id,
    mode: ring.mode,
    startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
  });
}

function stopAllConversationCallEffects() {
  stopOutgoingCallSound();
  for (const conversationId of conversationCallExpiryTimers.keys()) {
    clearConversationCallExpiryTimer(conversationId);
  }
  conversationCallSessions.clear();
}

function pendingConversationCallTargets(ring: DMCallRing | null | undefined, voiceMemberIds: string[]) {
  if (!ring) {
    return [];
  }
  const voiceMemberSet = new Set(voiceMemberIds);
  const declinedUserSet = new Set(ring.declined_user_ids ?? []);
  return (ring.target_user_ids ?? []).filter(
    (userId) => !voiceMemberSet.has(userId) && !declinedUserSet.has(userId),
  );
}

function shouldKeepConversationSessionAfterOutcome(
  conversationId: string,
  session: ConversationCallSession,
  outcome: DMCallRingEnd | undefined,
  voiceMemberIds: string[],
  currentUserId: string | null,
) {
  if (!currentUserId || session.initiatorId !== currentUserId) {
    return false;
  }
  const remoteMembers = voiceMemberIds.filter((memberId) => memberId !== currentUserId);
  if (remoteMembers.length > 0) {
    return false;
  }
  if (!outcome || outcome.conversation_id !== conversationId) {
    return true;
  }
  return outcome.reason === 'timeout';
}

function syncConversationCallSideEffects() {
  const state = useVoiceStore.getState();
  const currentUserId = useAuthStore.getState().user?.id ?? null;
  let shouldPlayOutgoingRingtone = false;

  for (const [conversationId, session] of [...conversationCallSessions.entries()]) {
    const ring = state.conversationCallRings[conversationId] ?? null;
    const outcome = state.conversationCallOutcomes[conversationId];
    const voiceMemberIds = state.conversationVoiceMembers[conversationId] ?? [];
    const remoteMembers = currentUserId
      ? voiceMemberIds.filter((memberId) => memberId !== currentUserId)
      : voiceMemberIds;

    if (remoteMembers.length > 0 || outcome?.reason === 'answered') {
      clearConversationCallSession(conversationId);
      continue;
    }

    const keepAfterOutcome = shouldKeepConversationSessionAfterOutcome(
      conversationId,
      session,
      outcome,
      voiceMemberIds,
      currentUserId,
    );

    if (!ring && !keepAfterOutcome) {
      const shouldAutoLeave = Boolean(
        currentUserId
        && session.initiatorId === currentUserId
        && state.connected
        && state.targetKind === 'conversation'
        && state.conversationId === conversationId
        && remoteMembers.length === 0,
      );
      clearConversationCallSession(conversationId);
      if (shouldAutoLeave) {
        queueMicrotask(() => {
          const latest = useVoiceStore.getState();
          if (
            latest.connected
            && latest.targetKind === 'conversation'
            && latest.conversationId === conversationId
            && (latest.conversationVoiceMembers[conversationId] ?? []).every((memberId) => memberId === currentUserId)
          ) {
            void latest.leave();
          }
        });
      }
      continue;
    }

    const expiresAtMs = session.startedAtMs + DM_CALL_SESSION_EXPIRY_MS;
    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      const shouldAutoLeave = Boolean(
        currentUserId
        && session.initiatorId === currentUserId
        && state.connected
        && state.targetKind === 'conversation'
        && state.conversationId === conversationId
        && remoteMembers.length === 0,
      );
      clearConversationCallSession(conversationId);
      if (shouldAutoLeave) {
        queueMicrotask(() => {
          const latest = useVoiceStore.getState();
          if (
            latest.connected
            && latest.targetKind === 'conversation'
            && latest.conversationId === conversationId
            && (latest.conversationVoiceMembers[conversationId] ?? []).every((memberId) => memberId === currentUserId)
          ) {
            void latest.leave();
          }
        });
      }
      continue;
    }

    clearConversationCallExpiryTimer(conversationId);
    conversationCallExpiryTimers.set(
      conversationId,
      window.setTimeout(() => {
        syncConversationCallSideEffects();
      }, remainingMs),
    );

    if (
      currentUserId
      && session.initiatorId === currentUserId
      && state.connected
      && state.targetKind === 'conversation'
      && state.conversationId === conversationId
      && pendingConversationCallTargets(ring, voiceMemberIds).length > 0
    ) {
      shouldPlayOutgoingRingtone = true;
    }
  }

  if (shouldPlayOutgoingRingtone) {
    startOutgoingCallSound();
  } else {
    stopOutgoingCallSound();
  }
}

function normalizeCameraBackgroundAsset(
  asset: Partial<CameraBackgroundAsset> | null | undefined,
): CameraBackgroundAsset | null {
  if (!asset || typeof asset !== 'object' || typeof asset.url !== 'string' || typeof asset.kind !== 'string') {
    return null;
  }

  return {
    kind:
      asset.kind === 'video'
        ? 'video'
        : asset.kind === 'gif'
          ? 'gif'
          : 'image',
    url: asset.url,
    previewUrl: typeof asset.previewUrl === 'string' ? asset.previewUrl : undefined,
    label: typeof asset.label === 'string' ? asset.label : undefined,
    source: asset.source === 'tenor' ? 'tenor' : 'upload',
  };
}

function upsertSavedCameraBackgroundAssets(
  existingAssets: CameraBackgroundAsset[],
  nextAsset: CameraBackgroundAsset | null,
) {
  const normalizedAsset = normalizeCameraBackgroundAsset(nextAsset);
  const uploadedOnly = existingAssets.filter(
    (asset) => asset.kind !== 'video' && asset.source === 'upload',
  );

  if (!normalizedAsset || normalizedAsset.kind === 'video' || normalizedAsset.source !== 'upload') {
    return uploadedOnly;
  }

  const deduped = uploadedOnly.filter(
    (asset) => !(asset.source === normalizedAsset.source && asset.url === normalizedAsset.url),
  );

  return [normalizedAsset, ...deduped].slice(0, MAX_SAVED_CAMERA_BACKGROUNDS);
}

function loadVoiceSettings(): VoiceSettingsSnapshot {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_VOICE_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<VoiceSettingsSnapshot>;
    const cameraBackgroundAsset = normalizeCameraBackgroundAsset(parsed.cameraBackgroundAsset);
    let savedCameraBackgroundAssets = Array.isArray(parsed.savedCameraBackgroundAssets)
      ? parsed.savedCameraBackgroundAssets
        .map((asset) => normalizeCameraBackgroundAsset(asset))
        .filter((asset): asset is CameraBackgroundAsset => asset !== null && asset.kind !== 'video' && asset.source === 'upload')
      : [];

    if (cameraBackgroundAsset) {
      savedCameraBackgroundAssets = upsertSavedCameraBackgroundAssets(savedCameraBackgroundAssets, cameraBackgroundAsset);
    }

    return {
      inputDeviceId: normalizeSelectedDeviceId(parsed.inputDeviceId),
      outputDeviceId: normalizeSelectedDeviceId(parsed.outputDeviceId),
      cameraDeviceId: normalizeSelectedDeviceId(parsed.cameraDeviceId),
      inputVolume: clampVoiceVolume(
        typeof parsed.inputVolume === 'number' ? parsed.inputVolume : 1,
      ),
      outputVolume: clampVoiceVolume(
        typeof parsed.outputVolume === 'number' ? parsed.outputVolume : 1,
      ),
      automaticInputSensitivity: parsed.automaticInputSensitivity !== false,
      manualInputSensitivity: clampManualInputSensitivity(
        typeof parsed.manualInputSensitivity === 'number'
          ? parsed.manualInputSensitivity
          : DEFAULT_MANUAL_MIC_THRESHOLD,
      ),
      noiseSuppressionEnabled: parsed.noiseSuppressionEnabled !== false,
      echoCancellationEnabled: parsed.echoCancellationEnabled !== false,
      pttMode: parsed.pttMode === true,
      cameraBackgroundMode:
        parsed.cameraBackgroundMode === 'blur' || parsed.cameraBackgroundMode === 'custom'
          ? parsed.cameraBackgroundMode
          : 'none',
      cameraBackgroundAsset,
      savedCameraBackgroundAssets,
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
  inputVolume: number;
  outputVolume: number;
  automaticInputSensitivity: boolean;
  manualInputSensitivity: number;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  mediaDevices: VoiceMediaDevices;
  connected: boolean;
  connecting: boolean;
  roomName: string | null;
  connectionEndpoint: string | null;
  targetKind: VoiceTargetKind | null;
  targetId: string | null;
  streamId: string | null;
  conversationId: string | null;
  participants: VoiceParticipant[];
  conversationVoiceMembers: Record<string, string[]>;
  conversationCallRings: Record<string, DMCallRing>;
  conversationCallOutcomes: Record<string, DMCallRingEnd>;
  dismissedConversationCallRings: Record<string, string>;
  conversationVoiceScreenSharers: Record<string, string[]>;
  conversationVoiceDeafenedUsers: Record<string, string[]>;
  speakingSignals: Record<string, boolean>;
  connectionStats: VoiceConnectionStats;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  pttActive: boolean;
  pttMode: boolean;
  cameraBackgroundMode: CameraBackgroundMode;
  cameraBackgroundAsset: CameraBackgroundAsset | null;
  savedCameraBackgroundAssets: CameraBackgroundAsset[];
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
  desktopScreenSharePickerOpen: boolean;
  desktopScreenSharePickerLoading: boolean;
  desktopScreenShareSources: DesktopDisplaySource[];

  join: (streamId: string) => Promise<void>;
  joinConversation: (conversationId: string) => Promise<void>;
  loadConversationCallStates: () => Promise<void>;
  startConversationCallRing: (conversationId: string, mode: DMCallMode) => Promise<void>;
  cancelConversationCallRing: (conversationId: string) => Promise<void>;
  declineConversationCallRing: (conversationId: string) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  changeScreenShare: () => Promise<void>;
  setScreenShareKind: (kind: ScreenShareKind) => void;
  setScreenShareQuality: (fps: ScreenShareFps, resolution: ScreenShareResolution) => Promise<void>;
  dismissScreenShareNotice: () => void;
  openDesktopScreenSharePicker: () => Promise<void>;
  closeDesktopScreenSharePicker: () => void;
  chooseDesktopScreenShareSource: (sourceId: string) => Promise<void>;
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
  setInputVolume: (volume: number) => void;
  setOutputVolume: (volume: number) => void;
  setCameraDeviceId: (deviceId: string | null) => Promise<void>;
  setAutomaticInputSensitivity: (enabled: boolean) => void;
  setManualInputSensitivity: (threshold: number) => void;
  setEchoCancellationEnabled: (enabled: boolean) => Promise<void>;
  setNoiseSuppressionEnabled: (enabled: boolean) => Promise<void>;
  setPTTMode: (enabled: boolean) => void;
  setCameraBackgroundMode: (mode: CameraBackgroundMode) => void;
  setCameraBackgroundAsset: (asset: CameraBackgroundAsset | null) => void;
  toggleNoiseSuppression: () => Promise<void>;
  moveToStream: (streamId: string) => Promise<void>;
  applyConversationVoiceState: (conversationId: string, userId: string, action: 'join' | 'leave') => void;
  applyConversationVoiceScreenShare: (conversationId: string, userId: string, sharing: boolean) => void;
  applyConversationVoiceDeafen: (conversationId: string, userId: string, deafened: boolean) => void;
  setConversationCallRing: (ring: DMCallRing) => void;
  setConversationCallOutcome: (outcome: DMCallRingEnd) => void;
  clearConversationCallOutcome: (conversationId: string) => void;
  clearConversationCallRing: (conversationId: string) => void;
  dismissConversationCallRing: (conversationId: string) => void;
  clearConversationCallState: (conversationId: string) => void;
  applySpeakingSignal: (identity: string, speaking: boolean) => void;
  clearSpeakingSignal: (identity: string) => void;
  triggerSoundboardSpeaking: (identity: string, durationMs: number) => void;
}

const CONNECT_TIMEOUT_MS = 15_000;

function voiceTargetState(target: VoiceJoinTarget) {
  return {
    targetKind: target.kind,
    targetId: target.id,
    streamId: target.kind === 'stream' ? target.id : null,
    conversationId: target.kind === 'conversation' ? target.id : null,
  };
}

function voiceTargetPayload(target: VoiceJoinTarget) {
  return target.kind === 'conversation'
    ? { conversation_id: target.id }
    : { stream_id: target.id };
}

function currentVoiceTargetPayload(state: Pick<VoiceStore, 'targetKind' | 'streamId' | 'conversationId'>) {
  if (state.targetKind === 'conversation' && state.conversationId) {
    return { conversation_id: state.conversationId };
  }
  if (state.streamId) {
    return { stream_id: state.streamId };
  }
  return {};
}

function updateTargetUserList(
  map: Record<string, string[]>,
  targetId: string,
  userId: string,
  present: boolean,
) {
  const current = new Set(map[targetId] ?? []);
  if (present) {
    current.add(userId);
  } else {
    current.delete(userId);
  }

  const next = { ...map };
  if (current.size === 0) {
    delete next[targetId];
  } else {
    next[targetId] = [...current];
  }
  return next;
}

function normalizeConversationCallStates(states: DMConversationCallState[]) {
  const members: Record<string, string[]> = {};
  const rings: Record<string, DMCallRing> = {};

  for (const state of states) {
    if (Array.isArray(state.member_ids) && state.member_ids.length > 0) {
      members[state.conversation_id] = [...new Set(state.member_ids)];
    }
    if (state.ring) {
      rings[state.conversation_id] = state.ring;
    }
  }

  return { members, rings };
}

function micAudioCaptureOptions(
  state: Pick<VoiceStore, 'inputDeviceId' | 'noiseSuppressionEnabled' | 'echoCancellationEnabled'>,
  processor?: MicNoiseGateProcessor,
  overrides?: MicCaptureOptionsOverrides,
): AudioCaptureOptions {
  const base: AudioCaptureOptions = {
    echoCancellation: state.echoCancellationEnabled,
    autoGainControl: false,
    noiseSuppression: false,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
    deviceId: overrides?.includeDeviceId === false ? undefined : state.inputDeviceId ?? undefined,
    processor,
  };

  return base;
}

function resolveCameraBackgroundImagePath(asset: CameraBackgroundAsset | null) {
  if (!asset || asset.kind === 'video') {
    return null;
  }

  const rawPath = asset.kind === 'image' ? asset.url : asset.previewUrl ?? asset.url;
  const resolvedPath = publicAssetUrl(rawPath).trim();
  return resolvedPath.length > 0 ? resolvedPath : null;
}

function cameraBackgroundProcessorOptions(
  state: Pick<VoiceStore, 'cameraBackgroundMode' | 'cameraBackgroundAsset'>,
): SwitchBackgroundProcessorOptions {
  if (state.cameraBackgroundMode === 'blur') {
    return {
      mode: 'background-blur',
      blurRadius: CAMERA_BACKGROUND_BLUR_RADIUS,
    };
  }

  if (state.cameraBackgroundMode === 'custom') {
    const imagePath = resolveCameraBackgroundImagePath(state.cameraBackgroundAsset);
    if (imagePath) {
      return {
        mode: 'virtual-background',
        imagePath,
      };
    }
  }

  return { mode: 'disabled' };
}

function createCameraBackgroundProcessor(
  state: Pick<VoiceStore, 'cameraBackgroundMode' | 'cameraBackgroundAsset'>,
): Promise<BackgroundProcessorWrapper | undefined> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(undefined);
  }

  return loadTrackProcessorsModule()
    .then(({ BackgroundProcessor, supportsBackgroundProcessors }) => {
      if (!supportsBackgroundProcessors()) {
        return undefined;
      }

      try {
        return BackgroundProcessor(cameraBackgroundProcessorOptions(state), 'rift-camera-background');
      } catch (error) {
        console.warn('Unable to create camera background processor.', error);
        return undefined;
      }
    })
    .catch((error) => {
      console.warn('Unable to load camera background processor runtime.', error);
      return undefined;
    });
}

function getLocalCameraTrack(room: Room): LocalVideoTrack | null {
  const publication = room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
  return publication?.videoTrack ?? null;
}

async function stopLocalCameraProcessor(cameraTrack: LocalVideoTrack | null) {
  if (!cameraTrack?.getProcessor()) {
    return;
  }

  try {
    await cameraTrack.stopProcessor();
  } catch (error) {
    console.warn('Unable to stop camera background processor.', error);
  }
}

function isBackgroundProcessorWrapper(value: unknown): value is BackgroundProcessorWrapper {
  return typeof value === 'object'
    && value !== null
    && 'switchTo' in value
    && typeof (value as { switchTo?: unknown }).switchTo === 'function';
}

async function syncLocalCameraBackground(
  room: Room,
  state: Pick<VoiceStore, 'cameraBackgroundMode' | 'cameraBackgroundAsset'> = useVoiceStore.getState(),
) {
  const cameraTrack = getLocalCameraTrack(room);
  if (!cameraTrack) {
    return;
  }

  const desiredOptions = cameraBackgroundProcessorOptions(state);
  const existingProcessor = cameraTrack.getProcessor();

  if (desiredOptions.mode === 'disabled') {
    await stopLocalCameraProcessor(cameraTrack);
    return;
  }

  if (isBackgroundProcessorWrapper(existingProcessor)) {
    await existingProcessor.switchTo(desiredOptions);
    return;
  }

  if (existingProcessor) {
    await stopLocalCameraProcessor(cameraTrack);
  }

  const processor = await createCameraBackgroundProcessor(state);
  if (!processor) {
    return;
  }

  await cameraTrack.setProcessor(processor);
}

function cameraCaptureOptions(
  state: Pick<VoiceStore, 'cameraDeviceId' | 'cameraBackgroundMode' | 'cameraBackgroundAsset'>,
): VideoCaptureOptions {
  return {
    deviceId: state.cameraDeviceId ?? undefined,
    resolution: {
      width: 2560,
      height: 1440,
      frameRate: 60,
    },
  };
}

let roomRef: Room | null = null;
let joiningLock = false;
let joinCancellationRequested = false;
let pttModeRef = false;
let wasMutedBeforeDeafen = false;
let screenShareNoticeTimer: number | null = null;
let transientSpeakingExpiry = new Map<string, number>();
let transientSpeakingTimers = new Map<string, number>();
let micGateProcessor: MicNoiseGateProcessor | null = null;
let micLastSpeakingBroadcastAt = 0;
let connectionStatsTimer: number | null = null;
let trackProcessorsModulePromise: Promise<TrackProcessorsModule> | null = null;
let voiceUserHydrationInFlight = new Set<string>();

async function loadTrackProcessorsModule() {
  if (!trackProcessorsModulePromise) {
    trackProcessorsModulePromise = import('@livekit/track-processors').catch((error) => {
      trackProcessorsModulePromise = null;
      throw error;
    });
  }

  return trackProcessorsModulePromise;
}

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
    | 'inputVolume'
    | 'outputVolume'
    | 'automaticInputSensitivity'
    | 'manualInputSensitivity'
    | 'noiseSuppressionEnabled'
    | 'echoCancellationEnabled'
    | 'pttMode'
    | 'cameraBackgroundMode'
    | 'cameraBackgroundAsset'
    | 'savedCameraBackgroundAssets'
  >,
): VoiceSettingsSnapshot {
  return {
    inputDeviceId: normalizeSelectedDeviceId(state.inputDeviceId),
    outputDeviceId: normalizeSelectedDeviceId(state.outputDeviceId),
    cameraDeviceId: normalizeSelectedDeviceId(state.cameraDeviceId),
    inputVolume: clampVoiceVolume(state.inputVolume),
    outputVolume: clampVoiceVolume(state.outputVolume),
    automaticInputSensitivity: state.automaticInputSensitivity,
    manualInputSensitivity: clampManualInputSensitivity(state.manualInputSensitivity),
    noiseSuppressionEnabled: state.noiseSuppressionEnabled,
    echoCancellationEnabled: state.echoCancellationEnabled,
    pttMode: state.pttMode,
    cameraBackgroundMode: state.cameraBackgroundMode,
    cameraBackgroundAsset: state.cameraBackgroundAsset,
    savedCameraBackgroundAssets: state.savedCameraBackgroundAssets,
  };
}

function persistVoiceSettingsFromStore(
  state: Pick<
    VoiceStore,
    | 'inputDeviceId'
    | 'outputDeviceId'
    | 'cameraDeviceId'
    | 'inputVolume'
    | 'outputVolume'
    | 'automaticInputSensitivity'
    | 'manualInputSensitivity'
    | 'noiseSuppressionEnabled'
    | 'echoCancellationEnabled'
    | 'pttMode'
    | 'cameraBackgroundMode'
    | 'cameraBackgroundAsset'
    | 'savedCameraBackgroundAssets'
  >,
) {
  persistVoiceSettings(voiceSettingsSnapshot(state));
}

function broadcastLocalSpeakingState(identity: string, speaking: boolean, force = false) {
  const state = useVoiceStore.getState();
  const targetPayload = currentVoiceTargetPayload(state);
  const now = performance.now();

  if (!force && speaking && now - micLastSpeakingBroadcastAt < SPEAKING_BROADCAST_INTERVAL_MS) {
    return;
  }
  micLastSpeakingBroadcastAt = now;

  state.applySpeakingSignal(identity, speaking);
  debugVoiceSpeaking('Broadcasting local speaking update', {
    identity,
    speaking,
    force,
    streamId: targetPayload.stream_id ?? null,
    conversationId: targetPayload.conversation_id ?? null,
  });
  if (targetPayload.stream_id || targetPayload.conversation_id) {
    wsSend('voice_speaking_update', { ...targetPayload, speaking });
  }
}

function currentMicGateSettings() {
  const state = useVoiceStore.getState();
  return {
    automaticSensitivity: state.automaticInputSensitivity,
    manualThreshold: state.manualInputSensitivity,
    releaseMs: DEFAULT_MIC_GATE_RELEASE_MS,
    noiseSuppressionEnabled: state.noiseSuppressionEnabled,
    inputVolume: state.inputVolume,
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

function voiceJoinFailureNotice(err: unknown): ScreenShareNotice {
  const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
  const rawMessage = err instanceof Error ? err.message.trim() : '';
  const message = rawMessage.toLowerCase();

  if (
    name === 'NotAllowedError' ||
    message.includes('permission denied') ||
    message.includes('permission')
  ) {
    return { tone: 'error', message: 'Microphone permission denied for the desktop app.' };
  }

  if (
    name === 'NotFoundError' ||
    message.includes('device not found') ||
    message.includes('no microphone')
  ) {
    return { tone: 'error', message: 'No microphone was found for the desktop app.' };
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('networkerror')
  ) {
    return {
      tone: 'error',
      message: 'Unable to reach the voice service. Check your connection, firewall, or VPN and try again.',
    };
  }

  if (message.includes('timed out') || message.includes('timeout')) {
    return {
      tone: 'error',
      message: 'Voice connection timed out. Check your connection, firewall, or VPN and try again.',
    };
  }

  if (rawMessage.length > 0 && rawMessage.toLowerCase() !== 'request failed') {
    return { tone: 'error', message: rawMessage };
  }

  return { tone: 'error', message: 'Unable to join voice channel.' };
}

async function disableMicrophoneAfterFailedAttempt(room: Room) {
  stopMicProcessing({ broadcast: false, identity: room.localParticipant.identity });

  try {
    await room.localParticipant.setMicrophoneEnabled(false);
  } catch {
    /* ignore cleanup failures */
  }
}

async function tryAttachMicGatePostPublish(room: Room, identity: string) {
  try {
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const audioTrack = micPub?.track;
    if (audioTrack && 'setProcessor' in audioTrack) {
      const gate = createMicGate(identity);
      await (audioTrack as LocalAudioTrack).setProcessor(gate);
      debugVoiceSpeaking('Mic gate attached post-publish');
      return;
    }
  } catch (err) {
    console.warn('Failed to attach mic processor post-publish:', err);
  }
  // Processor not attached; clean up and clear stale explicit signal so LiveKit VAD works
  stopMicProcessing();
  useVoiceStore.getState().clearSpeakingSignal(identity);
  debugVoiceSpeaking('Mic gate unavailable, falling back to LiveKit VAD', { identity });
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

      if (!processor) {
        // Mic enabled without processor (raw fallback).
        // Try to attach the mic gate now that the track has an AudioContext from being published.
        await tryAttachMicGatePostPublish(room, identity);
      }

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
  // Stop the old processor but do NOT seed an explicit false signal — the new
  // enableLocalMicrophone call will either create a fresh processor or clear
  // the signal via tryAttachMicGatePostPublish.
  stopMicProcessing();
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

const speakingHoldUntil = new Map<string, number>();
let speakingHoldTimer: ReturnType<typeof setTimeout> | null = null;

function applySpeakingHold(identity: string, resolved: boolean): boolean {
  const now = Date.now();
  if (resolved) {
    speakingHoldUntil.set(identity, now + SPEAKING_HOLD_MS);
    return true;
  }
  const holdUntil = speakingHoldUntil.get(identity);
  if (holdUntil != null && now < holdUntil) {
    scheduleSpeakingHoldFlush();
    return true;
  }
  speakingHoldUntil.delete(identity);
  return false;
}

function scheduleSpeakingHoldFlush() {
  if (speakingHoldTimer != null) return;
  speakingHoldTimer = setTimeout(() => {
    speakingHoldTimer = null;
    syncParticipants();
  }, SPEAKING_HOLD_MS + 2);
}

function clearSpeakingHold() {
  speakingHoldUntil.clear();
  if (speakingHoldTimer != null) {
    clearTimeout(speakingHoldTimer);
    speakingHoldTimer = null;
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
    }, notice.tone === 'error' ? 5200 : 3200);
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
  '480p':   { 24: 650_000,   30: 800_000,   60: 1_200_000  },
  '720p':   { 24: 2_000_000, 30: 2_500_000, 60: 4_000_000  },
  '1080p':  { 24: 4_000_000, 30: 5_000_000, 60: 8_000_000  },
  '1440p':  { 24: 6_000_000, 30: 8_000_000, 60: 12_000_000 },
  'source': { 24: 6_000_000, 30: 8_000_000, 60: 12_000_000 },
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

function buildScreenShareOptions(kind: ScreenShareKind, fps: ScreenShareFps = 60, resolution: ScreenShareResolution = '720p') {
  const resConstraints = SCREEN_SHARE_RESOLUTIONS[resolution];
  const options: Record<string, unknown> = {
    audio: true,
    resolution: { ...resConstraints, frameRate: fps },
    contentHint: 'detail',
    surfaceSwitching: 'include',
    systemAudio: 'include',
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

function hasDesktopDisplaySourceApi() {
  return typeof window !== 'undefined'
    && typeof window.desktop?.listDisplaySources === 'function'
    && typeof window.desktop?.selectDisplaySource === 'function';
}

function sortDesktopScreenShareSources(sources: DesktopDisplaySource[]) {
  return [...sources].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'window' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function closeDesktopScreenSharePicker() {
  useVoiceStore.setState({
    desktopScreenSharePickerOpen: false,
    desktopScreenSharePickerLoading: false,
    desktopScreenShareSources: [],
  });
}

async function requestDesktopScreenSharePicker(): Promise<boolean> {
  if (!hasDesktopDisplaySourceApi()) {
    return false;
  }

  const desktop = getDesktop();
  if (!desktop) {
    return false;
  }

  const currentState = useVoiceStore.getState();
  if (currentState.desktopScreenSharePickerLoading || currentState.screenShareRequesting) {
    return true;
  }

  useVoiceStore.setState({
    desktopScreenSharePickerOpen: true,
    desktopScreenSharePickerLoading: true,
    desktopScreenShareSources: [],
    screenShareRequesting: true,
  });
  setScreenShareNotice(null);

  try {
    const sources = sortDesktopScreenShareSources(await desktop.listDisplaySources());
    if (!sources.length) {
      useVoiceStore.setState({ screenShareRequesting: false });
      closeDesktopScreenSharePicker();
      setScreenShareNotice({
        tone: 'error',
        message: 'No shareable applications or displays are available',
      });
      return true;
    }

    useVoiceStore.setState({
      desktopScreenSharePickerOpen: true,
      desktopScreenSharePickerLoading: false,
      desktopScreenShareSources: sources,
      screenShareRequesting: false,
    });
  } catch (err) {
    console.error('Failed to load desktop screen share sources:', err);
    useVoiceStore.setState({ screenShareRequesting: false });
    closeDesktopScreenSharePicker();
    setScreenShareNotice({ tone: 'error', message: 'Unable to open screen share picker' });
  }

  return true;
}

async function startScreenShare(
  room: Room,
  state: Pick<VoiceStore, 'screenShareKind' | 'screenShareFps' | 'screenShareResolution'>,
  targetPayload: { stream_id?: string; conversation_id?: string },
  options?: StartScreenShareOptions,
) {
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
      screenShareSurfaceLabel: options?.surfaceLabel ?? inferSurfaceLabel(state.screenShareKind),
      screenShareModalOpen: false,
    });
    if (targetPayload.stream_id || targetPayload.conversation_id) {
      wsSend('voice_screen_share_update', { ...targetPayload, sharing: true });
    }
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    console.error('Failed to start screen share:', err);
    useVoiceStore.setState({ screenShareRequesting: false });
    if (name === 'AbortError' || message.includes('cancel')) {
      setScreenShareNotice({ tone: 'info', message: 'Screen share cancelled' });
    } else if (name === 'NotFoundError' || message.includes('available')) {
      setScreenShareNotice({ tone: 'error', message: 'No screen available to share' });
    } else if (name === 'NotAllowedError') {
      setScreenShareNotice({
        tone: 'error',
        message: hasDesktopDisplaySourceApi()
          ? 'Screen share cancelled or blocked by the desktop app'
          : 'Screen share permission denied — check browser settings',
      });
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

function hydrateMissingVoiceUsers(participants: VoiceParticipant[]) {
  const knownUsers = usePresenceStore.getState().usersById;
  for (const participant of participants) {
    const userID = participant.identity;
    if (!userID || knownUsers[userID] || voiceUserHydrationInFlight.has(userID)) {
      continue;
    }

    voiceUserHydrationInFlight.add(userID);
    api.getUser(userID)
      .then((user) => {
        usePresenceStore.getState().mergeUser(user);
      })
      .catch(() => {
        /* ignore transient profile hydration failures */
      })
      .finally(() => {
        voiceUserHydrationInFlight.delete(userID);
      });
  }
}

function buildParticipants(room: Room): VoiceParticipant[] {
  if (room.state !== ConnectionState.Connected) return [];
  const voiceState = useVoiceStore.getState();
  const speakingSignals = voiceState.speakingSignals;
  const deafenedUsers = voiceState.targetKind === 'conversation'
    ? (voiceState.conversationId ? (voiceState.conversationVoiceDeafenedUsers[voiceState.conversationId] ?? []) : [])
    : (voiceState.streamId ? (useStreamStore.getState().voiceDeafenedUsers[voiceState.streamId] ?? []) : []);
  const conversationScreenSharers = voiceState.targetKind === 'conversation'
    ? (voiceState.conversationId ? (voiceState.conversationVoiceScreenSharers[voiceState.conversationId] ?? []) : [])
    : [];
  const explicitConversationScreenSharers = new Set(conversationScreenSharers);
  const localIdentity = room.localParticipant.identity;
  const toVP = (p: Participant): VoiceParticipant => {
    const hasExplicitSpeakingSignal = hasOwnKey(speakingSignals, p.identity);
    const explicitSpeakingSignal = hasExplicitSpeakingSignal ? speakingSignals[p.identity] : false;
    const isLocalParticipant = p.identity === localIdentity;
    const screenTrack = getTrackForSource(p, Track.Source.ScreenShare);
    const explicitConversationScreenShare = voiceState.targetKind === 'conversation'
      && explicitConversationScreenSharers.has(p.identity);

    const resolveInput = {
      transientSpeaking: isTransientSpeaking(p.identity),
      hasExplicitSpeakingSignal,
      explicitSpeakingSignal,
      liveKitSpeaking: p.isSpeaking,
      isLocalParticipant,
    };
    const resolved = resolveVoiceParticipantSpeakingState(resolveInput);

    if (resolveInput.liveKitSpeaking || resolveInput.explicitSpeakingSignal || resolveInput.transientSpeaking || resolved) {
      debugVoiceSpeaking('buildParticipants resolve', {
        identity: p.identity,
        ...resolveInput,
        resolved,
      });
    }

    return ({
      identity: p.identity,
      isSpeaking: applySpeakingHold(p.identity, resolved),
      isMuted: !p.isMicrophoneEnabled,
      isCameraOn: p.isCameraEnabled,
      isScreenSharing: p.isScreenShareEnabled || explicitConversationScreenShare || Boolean(screenTrack),
      videoTrack: getTrackForSource(p, Track.Source.Camera),
      screenTrack,
    });
  };
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

let syncParticipantsTrigger = '';
function syncParticipants() {
  if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
  const participants = buildParticipants(roomRef);
  const localSharing = roomRef.localParticipant.isScreenShareEnabled;
  const speakingIds = participants.filter((p) => p.isSpeaking).map((p) => p.identity);
  if (speakingIds.length > 0) {
    debugVoiceSpeaking('syncParticipants', {
      trigger: syncParticipantsTrigger,
      speakingIds,
      liveKitActiveSpeakers: roomRef.activeSpeakers?.map((s) => s.identity) ?? [],
    });
  }
  hydrateMissingVoiceUsers(participants);
  useVoiceStore.setState({
    participants,
    isCameraOn: roomRef.localParticipant.isCameraEnabled,
    isScreenSharing: localSharing,
    screenShareSurfaceLabel: localSharing
      ? useVoiceStore.getState().screenShareSurfaceLabel ?? requestedSurfaceLabel(useVoiceStore.getState().screenShareKind)
      : null,
  });
  useActiveSpeakerStore.getState().syncFromParticipants(participants);
  reapplyAllRemoteVoiceVolumes();
}

function effectiveRemoteVolume(identity: string): number {
  const s = useVoiceStore.getState();
  if (s.voiceOutputMuted) return 0;
  let base = (s.participantVolumes[identity] ?? 1) * s.outputVolume;
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
  clearSpeakingHold();
  stopConnectionStatsMonitor();
  stopMicProcessing({ broadcast: false, identity: roomRef?.localParticipant.identity });
  stopAllConversationCallEffects();
  useActiveSpeakerStore.getState().clearActiveSpeaker();
  useVoiceStore.setState({
    connected: false,
    connecting: false,
    roomName: null,
    connectionEndpoint: null,
    targetKind: null,
    targetId: null,
    streamId: null,
    conversationId: null,
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
    screenShareKind: 'window',
    screenShareFps: 60,
    screenShareResolution: '720p',
    screenShareSurfaceLabel: null,
    screenShareNotice: null,
    desktopScreenSharePickerOpen: false,
    desktopScreenSharePickerLoading: false,
    desktopScreenShareSources: [],
  });
}

async function destroyRoom(room: Room) {
  detachAllRoomMedia(room);
  await stopLocalTracks(room);
  room.removeAllListeners();
  room.disconnect();
}

async function joinVoiceTarget(target: VoiceJoinTarget) {
  if (joiningLock) return;
  joiningLock = true;
  joinCancellationRequested = false;

  const previousState = useVoiceStore.getState();
  const previousTargetPayload = currentVoiceTargetPayload(previousState);
  useActiveSpeakerStore.getState().clearActiveSpeaker();
  setScreenShareNotice(null);

  if (roomRef) {
    const old = roomRef;
    stopConnectionStatsMonitor();
    await destroyRoom(old);
    if (roomRef === old) {
      roomRef = null;
    }
  }

  useVoiceStore.setState({
    ...voiceTargetState(target),
    connecting: true,
    connectionStats: { ...createDefaultConnectionStats(), state: ConnectionState.Connecting },
  });

  try {
    await useVoiceStore.getState().refreshMediaDevices();
    const { token, url } = target.kind === 'conversation'
      ? await api.getDMVoiceToken(target.id)
      : await api.getVoiceToken(target.id);
    useVoiceStore.setState({ connectionEndpoint: url });

    const voiceState = useVoiceStore.getState();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: cameraCaptureOptions(voiceState),
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

    debugVoiceSpeaking('VOICE BRIDGE MOUNTED', {
      roomName: room.name,
      localIdentity: room.localParticipant.identity,
    });

    room.on(RoomEvent.ParticipantConnected, () => { syncParticipantsTrigger = 'ParticipantConnected'; syncParticipants(); playJoinSound(); });
    room.on(RoomEvent.ParticipantDisconnected, () => { syncParticipantsTrigger = 'ParticipantDisconnected'; syncParticipants(); playLeaveSound(); });
    room.on(RoomEvent.TrackSubscribed, () => { syncParticipantsTrigger = 'TrackSubscribed'; syncParticipants(); });
    room.on(RoomEvent.TrackUnsubscribed, () => { syncParticipantsTrigger = 'TrackUnsubscribed'; syncParticipants(); });
    room.on(RoomEvent.TrackMuted, () => { syncParticipantsTrigger = 'TrackMuted'; syncParticipants(); });
    room.on(RoomEvent.TrackUnmuted, () => { syncParticipantsTrigger = 'TrackUnmuted'; syncParticipants(); });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      syncParticipantsTrigger = 'ActiveSpeakersChanged';
      debugVoiceSpeaking('ActiveSpeakersChanged RAW', {
        speakers: speakers.map((s) => ({ identity: s.identity, isSpeaking: s.isSpeaking })),
        remoteCount: room.remoteParticipants.size,
      });
      syncParticipants();
    });
    room.on(RoomEvent.LocalTrackPublished, () => { syncParticipantsTrigger = 'LocalTrackPublished'; syncParticipants(); });
    room.on(RoomEvent.LocalTrackUnpublished, () => { syncParticipantsTrigger = 'LocalTrackUnpublished'; syncParticipants(); });
    room.on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => {
      if (!participant.isLocal || roomRef !== room) return;
      syncConnectionStatsState(room);
    });
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      syncConnectionStatsState(room);
      if (state === ConnectionState.Disconnected && roomRef === room) {
        const currentTargetPayload = currentVoiceTargetPayload(useVoiceStore.getState());
        if (currentTargetPayload.stream_id || currentTargetPayload.conversation_id) {
          wsSend('voice_state_update', { ...currentTargetPayload, action: 'leave' });
        }
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
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track) track.detach().forEach((el) => el.remove());
    });

    await Promise.race([
      room.connect(url, token),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)),
    ]);

    if (roomRef !== room) {
      room.disconnect();
      return;
    }

    await applyOutputDevice(room, useVoiceStore.getState().outputDeviceId);

    const startMuted = pttModeRef;
    let microphoneEnabled = !startMuted;
    if (!startMuted) {
      microphoneEnabled = await enableLocalMicrophone(room);
    }

    await useVoiceStore.getState().refreshMediaDevices();

    const participants = buildParticipants(room);
    hydrateMissingVoiceUsers(participants);
    useVoiceStore.setState({
      ...voiceTargetState(target),
      connected: true,
      connecting: false,
      roomName: room.name,
      isMuted: startMuted || !microphoneEnabled,
      isDeafened: false,
      isCameraOn: false,
      isScreenSharing: false,
      participants,
      participantVolumes: {},
      voiceOutputMuted: false,
      streamVolumes: {},
      streamAudioMuted: {},
      streamAttenuationEnabled: false,
      streamAttenuationStrength: 40,
    });
    useActiveSpeakerStore.getState().syncFromParticipants(participants);
    startConnectionStatsMonitor(room);
    wsSend('voice_state_update', { ...voiceTargetPayload(target), action: 'join' });
    playJoinSound();
  } catch (err) {
    const cancelled = joinCancellationRequested;
    console.error('Failed to join voice channel:', err);
    if (roomRef) {
      roomRef.removeAllListeners();
      roomRef.disconnect();
      roomRef = null;
    }
    if (previousTargetPayload.stream_id || previousTargetPayload.conversation_id) {
      wsSend('voice_state_update', { ...previousTargetPayload, action: 'leave' });
    }
    resetState();
    if (!cancelled) {
      setScreenShareNotice(voiceJoinFailureNotice(err));
    }
  } finally {
    useVoiceStore.setState({ connecting: false });
    joinCancellationRequested = false;
    joiningLock = false;
  }
}

const initialVoiceSettings = loadVoiceSettings();
pttModeRef = initialVoiceSettings.pttMode;

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  inputDeviceId: initialVoiceSettings.inputDeviceId,
  outputDeviceId: initialVoiceSettings.outputDeviceId,
  cameraDeviceId: initialVoiceSettings.cameraDeviceId,
  inputVolume: initialVoiceSettings.inputVolume,
  outputVolume: initialVoiceSettings.outputVolume,
  automaticInputSensitivity: initialVoiceSettings.automaticInputSensitivity,
  manualInputSensitivity: initialVoiceSettings.manualInputSensitivity,
  noiseSuppressionEnabled: initialVoiceSettings.noiseSuppressionEnabled,
  echoCancellationEnabled: initialVoiceSettings.echoCancellationEnabled,
  mediaDevices: emptyVoiceMediaDevices(),
  connected: false,
  connecting: false,
  roomName: null,
  connectionEndpoint: null,
  targetKind: null,
  targetId: null,
  streamId: null,
  conversationId: null,
  participants: [],
  conversationVoiceMembers: {},
  conversationCallRings: {},
  conversationCallOutcomes: {},
  dismissedConversationCallRings: {},
  conversationVoiceScreenSharers: {},
  conversationVoiceDeafenedUsers: {},
  speakingSignals: {},
  connectionStats: createDefaultConnectionStats(),
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  pttActive: false,
  pttMode: initialVoiceSettings.pttMode,
  cameraBackgroundMode: initialVoiceSettings.cameraBackgroundMode,
  cameraBackgroundAsset: initialVoiceSettings.cameraBackgroundAsset,
  savedCameraBackgroundAssets: initialVoiceSettings.savedCameraBackgroundAssets,
  participantVolumes: {},
  voiceOutputMuted: false,
  streamVolumes: {},
  streamAudioMuted: {},
  streamAttenuationEnabled: false,
  streamAttenuationStrength: 40,
  screenShareModalOpen: false,
  screenShareRequesting: false,
  screenShareKind: 'window',
  screenShareFps: 60,
  screenShareResolution: '720p',
  screenShareSurfaceLabel: null,
  screenShareNotice: null,
  desktopScreenSharePickerOpen: false,
  desktopScreenSharePickerLoading: false,
  desktopScreenShareSources: [],

  join: async (sid) => {
    if (get().targetKind === 'stream' && get().streamId === sid && get().connected) return;
    await joinVoiceTarget({ kind: 'stream', id: sid });
  },

  joinConversation: async (conversationId) => {
    if (get().targetKind === 'conversation' && get().conversationId === conversationId && get().connected) return;
    get().clearConversationCallOutcome(conversationId);
    await joinVoiceTarget({ kind: 'conversation', id: conversationId });
  },

  loadConversationCallStates: async () => {
    try {
      const states = await api.getDMCallStates();
      const normalized = normalizeConversationCallStates(states);
      set((state) => ({
        conversationVoiceMembers: normalized.members,
        conversationCallRings: normalized.rings,
        dismissedConversationCallRings: Object.fromEntries(
          Object.entries(state.dismissedConversationCallRings).filter(
            ([conversationId, startedAt]) => normalized.rings[conversationId]?.started_at === startedAt,
          ),
        ),
      }));
      syncConversationCallSideEffects();
    } catch {
      /* ignore transient DM call-state load failures */
    }
  },

  startConversationCallRing: async (conversationId, mode) => {
    const state = await api.startDMCallRing(conversationId, mode);
    if (state.ring) {
      registerConversationCallSession(state.ring);
    }
    const normalized = normalizeConversationCallStates([state]);
    set((current) => {
      const nextMembers = { ...current.conversationVoiceMembers };
      if (normalized.members[conversationId]) nextMembers[conversationId] = normalized.members[conversationId];
      else delete nextMembers[conversationId];

      const nextRings = { ...current.conversationCallRings };
      if (normalized.rings[conversationId]) nextRings[conversationId] = normalized.rings[conversationId];
      else delete nextRings[conversationId];

      const nextDismissed = { ...current.dismissedConversationCallRings };
      delete nextDismissed[conversationId];

      const nextOutcomes = { ...current.conversationCallOutcomes };
      delete nextOutcomes[conversationId];

      return {
        conversationVoiceMembers: nextMembers,
        conversationCallRings: nextRings,
        conversationCallOutcomes: nextOutcomes,
        dismissedConversationCallRings: nextDismissed,
      };
    });
    syncConversationCallSideEffects();
  },

  cancelConversationCallRing: async (conversationId) => {
    try {
      await api.cancelDMCallRing(conversationId);
    } catch {
      /* ignore transient cancellation failures */
    }
    clearConversationCallSession(conversationId);
    get().clearConversationCallRing(conversationId);
  },

  declineConversationCallRing: async (conversationId) => {
    const startedAt = get().conversationCallRings[conversationId]?.started_at ?? null;
    get().dismissConversationCallRing(conversationId);
    try {
      await api.declineDMCallRing(conversationId);
    } catch {
      set((state) => {
        if (!startedAt || state.conversationCallRings[conversationId]?.started_at !== startedAt) {
          return state;
        }
        const nextDismissed = { ...state.dismissedConversationCallRings };
        delete nextDismissed[conversationId];
        return {
          dismissedConversationCallRings: nextDismissed,
        };
      });
    }
    syncConversationCallSideEffects();
  },

  leave: async () => {
    if (get().connecting) {
      joinCancellationRequested = true;
    }
    const voiceState = get();
    const currentUserId = useAuthStore.getState().user?.id ?? null;
    const outgoingConversationId = voiceState.targetKind === 'conversation' ? voiceState.conversationId : null;
    const outgoingRing = outgoingConversationId ? voiceState.conversationCallRings[outgoingConversationId] : undefined;
    const shouldCancelOutgoingRing = Boolean(
      outgoingConversationId
      && currentUserId
      && outgoingRing?.initiator_id === currentUserId
      && !(voiceState.conversationVoiceMembers[outgoingConversationId] ?? []).some((memberId) => memberId !== currentUserId),
    );
    const room = roomRef;
    const targetPayload = currentVoiceTargetPayload(get());
    if (!room) { resetState(); return; }
    stopConnectionStatsMonitor();
    stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
    // Notify screen share stop before leaving
    if ((targetPayload.stream_id || targetPayload.conversation_id) && get().isScreenSharing) {
      wsSend('voice_screen_share_update', { ...targetPayload, sharing: false });
    }
    roomRef = null;
    if (targetPayload.stream_id || targetPayload.conversation_id) {
      wsSend('voice_state_update', { ...targetPayload, action: 'leave' });
    }
    playLeaveSound();
    await destroyRoom(room);
    resetState();
    if (shouldCancelOutgoingRing && outgoingConversationId) {
      void api.cancelDMCallRing(outgoingConversationId).catch(() => {});
    }
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
    const currentState = get();
    if (wasEnabled) {
      await stopLocalCameraProcessor(getLocalCameraTrack(roomRef));
    }
    await roomRef.localParticipant.setCameraEnabled(
      !wasEnabled,
      !wasEnabled ? cameraCaptureOptions(currentState) : undefined,
    );
    if (!wasEnabled) {
      await stopLocalCameraProcessor(getLocalCameraTrack(roomRef));
      await syncLocalCameraBackground(roomRef, currentState);
    }
    set({ isCameraOn: !wasEnabled });
    syncParticipants();
  },

  toggleScreenShare: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const targetPayload = currentVoiceTargetPayload(get());
    if (roomRef.localParticipant.isScreenShareEnabled) {
      await stopScreenShare(roomRef);
      if (targetPayload.stream_id || targetPayload.conversation_id) {
        wsSend('voice_screen_share_update', { ...targetPayload, sharing: false });
      }
    } else {
      if (await requestDesktopScreenSharePicker()) {
        return;
      }
      await startScreenShare(roomRef, get(), targetPayload);
    }
    syncParticipants();
  },

  changeScreenShare: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    const targetPayload = currentVoiceTargetPayload(get());
    if (roomRef.localParticipant.isScreenShareEnabled) {
      await stopScreenShare(roomRef);
      if (targetPayload.stream_id || targetPayload.conversation_id) {
        wsSend('voice_screen_share_update', { ...targetPayload, sharing: false });
      }
      syncParticipants();
    }
    if (await requestDesktopScreenSharePicker()) {
      return;
    }
    await startScreenShare(roomRef, get(), targetPayload);
    syncParticipants();
  },

  setScreenShareKind: (kind) => {
    set({ screenShareKind: kind === 'tab' ? 'window' : kind });
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

  openDesktopScreenSharePicker: async () => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;
    await requestDesktopScreenSharePicker();
  },

  closeDesktopScreenSharePicker: () => {
    closeDesktopScreenSharePicker();
  },

  chooseDesktopScreenShareSource: async (sourceId: string) => {
    if (!roomRef || roomRef.state !== ConnectionState.Connected) return;

    const desktop = getDesktop();
    if (!hasDesktopDisplaySourceApi() || !desktop) return;

    const source = get().desktopScreenShareSources.find((item) => item.id === sourceId) ?? null;
    closeDesktopScreenSharePicker();

    if (!source) {
      setScreenShareNotice({ tone: 'error', message: 'Selected screen is no longer available' });
      return;
    }

    const accepted = await desktop.selectDisplaySource(sourceId);
    if (!accepted) {
      setScreenShareNotice({ tone: 'error', message: 'Selected screen is no longer available' });
      return;
    }

    await startScreenShare(roomRef, get(), currentVoiceTargetPayload(get()), { surfaceLabel: source.name });
    syncParticipants();
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
    const targetPayload = currentVoiceTargetPayload(get());
    if (targetPayload.stream_id || targetPayload.conversation_id) {
      wsSend('voice_deafen_update', { ...targetPayload, deafened: next });
    }
    syncParticipants();
  },

  togglePTT: () => {
    get().setPTTMode(!get().pttMode);
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

  setInputVolume: (volume) => {
    const nextVolume = clampVoiceVolume(volume);
    const current = get();
    if (current.inputVolume === nextVolume) {
      return;
    }

    const nextState = { inputVolume: nextVolume };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });
    updateMicGateSettings();
  },

  setOutputVolume: (volume) => {
    const nextVolume = clampVoiceVolume(volume);
    const current = get();
    if (current.outputVolume === nextVolume) {
      return;
    }

    const nextState = { outputVolume: nextVolume };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });
    queueMicrotask(() => reapplyAllRemoteVoiceVolumes());
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

    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isCameraEnabled) {
      const nextCameraState = {
        cameraDeviceId: nextDeviceId,
        cameraBackgroundMode: current.cameraBackgroundMode,
        cameraBackgroundAsset: current.cameraBackgroundAsset,
      };
      await stopLocalCameraProcessor(getLocalCameraTrack(room));
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setCameraEnabled(true, cameraCaptureOptions(nextCameraState));
      await stopLocalCameraProcessor(getLocalCameraTrack(room));
      await syncLocalCameraBackground(room, nextCameraState);
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

  setEchoCancellationEnabled: async (enabled) => {
    const current = get();
    if (current.echoCancellationEnabled === enabled) {
      return;
    }

    const nextState = { echoCancellationEnabled: enabled };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isMicrophoneEnabled) {
      const microphoneEnabled = await restartLocalMicrophone(room);
      set({ isMuted: !microphoneEnabled });
      syncParticipants();
    }
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

  setPTTMode: (enabled) => {
    const current = get();
    if (current.pttMode === enabled) {
      return;
    }

    pttModeRef = enabled;
    const nextState = { pttMode: enabled };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    if (roomRef && roomRef.state === ConnectionState.Connected) {
      const room = roomRef;
      if (enabled) {
        void room.localParticipant.setMicrophoneEnabled(false);
        stopMicProcessing({ broadcast: true, identity: room.localParticipant.identity });
        set({ isMuted: true, pttActive: false });
      } else {
        void enableLocalMicrophone(room).then((microphoneEnabled) => {
          set({ isMuted: !microphoneEnabled });
          syncParticipants();
        });
      }
      syncParticipants();
    }
  },

  setCameraBackgroundMode: (mode) => {
    const current = get();
    if (current.cameraBackgroundMode === mode) {
      return;
    }

    const nextState = {
      cameraBackgroundMode: mode,
      cameraBackgroundAsset: current.cameraBackgroundAsset,
    };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isCameraEnabled) {
      const nextBackgroundState = {
        cameraBackgroundMode: nextState.cameraBackgroundMode,
        cameraBackgroundAsset: nextState.cameraBackgroundAsset,
      };
      void syncLocalCameraBackground(room, nextBackgroundState).catch((error) => {
        console.warn('Unable to refresh camera background mode.', error);
      });
    }
  },

  setCameraBackgroundAsset: (asset) => {
    const current = get();
    const nextSavedAssets = upsertSavedCameraBackgroundAssets(current.savedCameraBackgroundAssets, asset);
    const nextState = {
      cameraBackgroundAsset: asset,
      cameraBackgroundMode: asset ? 'custom' as CameraBackgroundMode : 'none' as CameraBackgroundMode,
      savedCameraBackgroundAssets: nextSavedAssets,
    };
    set(nextState);
    persistVoiceSettingsFromStore({ ...current, ...nextState });

    const room = roomRef;
    if (room?.state === ConnectionState.Connected && room.localParticipant.isCameraEnabled) {
      const nextBackgroundState = {
        cameraBackgroundMode: nextState.cameraBackgroundMode,
        cameraBackgroundAsset: nextState.cameraBackgroundAsset,
      };
      void syncLocalCameraBackground(room, nextBackgroundState).catch((error) => {
        console.warn('Unable to refresh camera background asset.', error);
      });
    }
  },

  moveToStream: async (sid) => {
    if (get().streamId === sid && get().connected) return;
    await get().leave();
    await get().join(sid);
  },

  applyConversationVoiceState: (conversationId, userId, action) => {
    set((state) => ({
      conversationVoiceMembers: updateTargetUserList(
        state.conversationVoiceMembers,
        conversationId,
        userId,
        action === 'join',
      ),
    }));
    syncConversationCallSideEffects();
  },

  applyConversationVoiceScreenShare: (conversationId, userId, sharing) => {
    set((state) => ({
      conversationVoiceScreenSharers: updateTargetUserList(
        state.conversationVoiceScreenSharers,
        conversationId,
        userId,
        sharing,
      ),
    }));
  },

  applyConversationVoiceDeafen: (conversationId, userId, deafened) => {
    set((state) => ({
      conversationVoiceDeafenedUsers: updateTargetUserList(
        state.conversationVoiceDeafenedUsers,
        conversationId,
        userId,
        deafened,
      ),
    }));
    if (roomRef?.state === ConnectionState.Connected) {
      const voiceState = useVoiceStore.getState();
      if (voiceState.targetKind === 'conversation' && voiceState.conversationId === conversationId) {
        syncParticipants();
      }
    }
  },

  setConversationCallRing: (ring) => {
    registerConversationCallSession(ring);
    set((state) => {
      const nextDismissed = { ...state.dismissedConversationCallRings };
      if (nextDismissed[ring.conversation_id] && nextDismissed[ring.conversation_id] !== ring.started_at) {
        delete nextDismissed[ring.conversation_id];
      }
      const nextOutcomes = { ...state.conversationCallOutcomes };
      delete nextOutcomes[ring.conversation_id];
      return {
        conversationCallRings: {
          ...state.conversationCallRings,
          [ring.conversation_id]: ring,
        },
        conversationCallOutcomes: nextOutcomes,
        dismissedConversationCallRings: nextDismissed,
      };
    });
    syncConversationCallSideEffects();
  },

  setConversationCallOutcome: (outcome) => {
    set((state) => ({
      conversationCallOutcomes: {
        ...state.conversationCallOutcomes,
        [outcome.conversation_id]: outcome,
      },
    }));
    syncConversationCallSideEffects();
  },

  clearConversationCallOutcome: (conversationId) => {
    set((state) => {
      if (!state.conversationCallOutcomes[conversationId]) {
        return state;
      }
      const nextOutcomes = { ...state.conversationCallOutcomes };
      delete nextOutcomes[conversationId];
      return {
        conversationCallOutcomes: nextOutcomes,
      };
    });
    syncConversationCallSideEffects();
  },

  clearConversationCallRing: (conversationId) => {
    set((state) => {
      if (!state.conversationCallRings[conversationId] && !state.dismissedConversationCallRings[conversationId]) {
        return state;
      }
      const nextRings = { ...state.conversationCallRings };
      delete nextRings[conversationId];
      const nextDismissed = { ...state.dismissedConversationCallRings };
      delete nextDismissed[conversationId];
      return {
        conversationCallRings: nextRings,
        dismissedConversationCallRings: nextDismissed,
      };
    });
    syncConversationCallSideEffects();
  },

  dismissConversationCallRing: (conversationId) => {
    set((state) => {
      const ring = state.conversationCallRings[conversationId];
      if (!ring) {
        return state;
      }
      return {
        dismissedConversationCallRings: {
          ...state.dismissedConversationCallRings,
          [conversationId]: ring.started_at,
        },
      };
    });
    syncConversationCallSideEffects();
  },

  clearConversationCallState: (conversationId) => {
    clearConversationCallSession(conversationId);
    set((state) => {
      const nextMembers = { ...state.conversationVoiceMembers };
      delete nextMembers[conversationId];

      const nextRings = { ...state.conversationCallRings };
      delete nextRings[conversationId];

      const nextOutcomes = { ...state.conversationCallOutcomes };
      delete nextOutcomes[conversationId];

      const nextDismissed = { ...state.dismissedConversationCallRings };
      delete nextDismissed[conversationId];

      const nextScreenSharers = { ...state.conversationVoiceScreenSharers };
      delete nextScreenSharers[conversationId];

      const nextDeafened = { ...state.conversationVoiceDeafenedUsers };
      delete nextDeafened[conversationId];

      return {
        conversationVoiceMembers: nextMembers,
        conversationCallRings: nextRings,
        conversationCallOutcomes: nextOutcomes,
        dismissedConversationCallRings: nextDismissed,
        conversationVoiceScreenSharers: nextScreenSharers,
        conversationVoiceDeafenedUsers: nextDeafened,
      };
    });
    syncConversationCallSideEffects();
  },

  applySpeakingSignal: (identity, speaking) => {
    let changed = false;
    set((state) => {
      if (state.speakingSignals[identity] === speaking) return state;
      changed = true;
      debugVoiceSpeaking('applySpeakingSignal', { identity, speaking, previous: state.speakingSignals[identity] });
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
