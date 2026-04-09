import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_SPEAKER_HOLD_MS,
  ACTIVE_SPEAKER_SWITCH_DEBOUNCE_MS,
  useActiveSpeakerStore,
} from '../activeSpeakerStore';
import type { VoiceParticipant } from '../voiceStore';

function participant(overrides: Partial<VoiceParticipant> & Pick<VoiceParticipant, 'identity'>): VoiceParticipant {
  const { identity, ...rest } = overrides;

  return {
    identity,
    isSpeaking: false,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    videoTrack: undefined,
    screenTrack: undefined,
    ...rest,
  };
}

describe('activeSpeakerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useActiveSpeakerStore.getState().clearActiveSpeaker();
    useActiveSpeakerStore.setState({ overlayPosition: null });
  });

  afterEach(() => {
    useActiveSpeakerStore.getState().clearActiveSpeaker();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('prefers an actively speaking screenshare over camera video', () => {
    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'camera-user',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'camera-track' } as never,
      }),
      participant({
        identity: 'screen-user',
        isSpeaking: true,
        isScreenSharing: true,
        screenTrack: { id: 'screen-track' } as never,
      }),
    ]);

    expect(useActiveSpeakerStore.getState().activeSpeaker).toMatchObject({
      userId: 'screen-user',
      trackType: 'screenshare',
      isSpeaking: true,
    });
  });

  it('keeps the current speaker during same-priority overlap to avoid flicker', () => {
    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'alpha',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'alpha-camera' } as never,
      }),
    ]);

    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'alpha',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'alpha-camera' } as never,
      }),
      participant({
        identity: 'beta',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'beta-camera' } as never,
      }),
    ]);

    vi.advanceTimersByTime(ACTIVE_SPEAKER_SWITCH_DEBOUNCE_MS + 20);

    expect(useActiveSpeakerStore.getState().activeSpeaker).toMatchObject({
      userId: 'alpha',
      trackType: 'camera',
      isSpeaking: true,
    });
  });

  it('debounces a same-priority switch after the current speaker stops', () => {
    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'alpha',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'alpha-camera' } as never,
      }),
    ]);

    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'alpha',
        isSpeaking: false,
        isCameraOn: true,
        videoTrack: { id: 'alpha-camera' } as never,
      }),
      participant({
        identity: 'beta',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'beta-camera' } as never,
      }),
    ]);

    expect(useActiveSpeakerStore.getState().activeSpeaker).toMatchObject({
      userId: 'alpha',
      trackType: 'camera',
      isSpeaking: false,
    });

    vi.advanceTimersByTime(ACTIVE_SPEAKER_SWITCH_DEBOUNCE_MS - 20);
    expect(useActiveSpeakerStore.getState().activeSpeaker?.userId).toBe('alpha');

    vi.advanceTimersByTime(40);
    expect(useActiveSpeakerStore.getState().activeSpeaker).toMatchObject({
      userId: 'beta',
      trackType: 'camera',
      isSpeaking: true,
    });
  });

  it('holds the last active speaker briefly when the room goes quiet', () => {
    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'camera-user',
        isSpeaking: true,
        isCameraOn: true,
        videoTrack: { id: 'camera-track' } as never,
      }),
    ]);

    expect(useActiveSpeakerStore.getState().activeSpeaker).toMatchObject({
      userId: 'camera-user',
      trackType: 'camera',
      isSpeaking: true,
    });

    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'camera-user',
        isSpeaking: false,
        isCameraOn: true,
        videoTrack: { id: 'camera-track' } as never,
      }),
    ]);

    expect(useActiveSpeakerStore.getState().activeSpeaker).toMatchObject({
      userId: 'camera-user',
      trackType: 'camera',
      isSpeaking: false,
    });

    vi.advanceTimersByTime(ACTIVE_SPEAKER_HOLD_MS + 20);
    expect(useActiveSpeakerStore.getState().activeSpeaker).toBeNull();
  });

  it('ignores audio-only speakers for the floating media overlay', () => {
    useActiveSpeakerStore.getState().syncFromParticipants([
      participant({
        identity: 'audio-user',
        isSpeaking: true,
      }),
    ]);

    expect(useActiveSpeakerStore.getState().activeSpeaker).toBeNull();
  });
});