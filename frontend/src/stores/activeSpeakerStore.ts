import type { Track } from 'livekit-client';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { VoiceParticipant } from './voiceStore';
import {
  activeSpeakerTargetKey,
  getActiveSpeakerMediaSelection,
  getActiveSpeakerTrackPriority,
  selectPreferredActiveSpeaker,
  type ActiveSpeakerTrackType,
} from '../utils/activeSpeakerMedia';

const ACTIVE_SPEAKER_STORAGE_KEY = 'riftapp-floating-media-overlay';
const FALLBACK_STORAGE = new Map<string, string>();

export const ACTIVE_SPEAKER_HOLD_MS = 1200;
export const ACTIVE_SPEAKER_SWITCH_DEBOUNCE_MS = 220;

const activeSpeakerStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
      try {
        return window.localStorage.getItem(name);
      } catch {
        /* fall back to memory */
      }
    }

    return FALLBACK_STORAGE.get(name) ?? null;
  },
  setItem: (name, value) => {
    FALLBACK_STORAGE.set(name, value);
    if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        /* keep in-memory copy only */
      }
    }
  },
  removeItem: (name) => {
    FALLBACK_STORAGE.delete(name);
    if (typeof window !== 'undefined' && typeof window.localStorage?.removeItem === 'function') {
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* fallback storage already cleared */
      }
    }
  },
};

export interface FloatingMediaPosition {
  x: number;
  y: number;
}

export interface ActiveSpeakerMedia {
  userId: string;
  trackType: ActiveSpeakerTrackType | null;
  track: Track | null;
  mediaStreamTrack: MediaStreamTrack | null;
  isSpeaking: boolean;
  lastSpokeAt: number;
}

interface ActiveSpeakerStore {
  activeSpeaker: ActiveSpeakerMedia | null;
  overlayPosition: FloatingMediaPosition | null;
  syncFromParticipants: (participants: VoiceParticipant[]) => void;
  clearActiveSpeaker: () => void;
  setOverlayPosition: (position: FloatingMediaPosition) => void;
  resetOverlayPosition: () => void;
}

type PersistedActiveSpeakerState = Pick<ActiveSpeakerStore, 'overlayPosition'>;

let latestParticipants: VoiceParticipant[] = [];
let pendingSwitchKey: string | null = null;
let pendingSwitchTimer: number | null = null;
let releaseTimer: number | null = null;

function clearPendingSwitchTimer() {
  pendingSwitchKey = null;
  if (pendingSwitchTimer != null) {
    window.clearTimeout(pendingSwitchTimer);
    pendingSwitchTimer = null;
  }
}

function clearReleaseTimer() {
  if (releaseTimer != null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

function getMediaStreamTrack(track: Track | null) {
  if (!track || typeof track !== 'object' || !('mediaStreamTrack' in track)) {
    return null;
  }

  const mediaStreamTrack = (track as { mediaStreamTrack?: MediaStreamTrack | null }).mediaStreamTrack;
  return mediaStreamTrack ?? null;
}

function buildActiveSpeakerMedia(
  participant: VoiceParticipant,
  now: number,
  isSpeaking: boolean,
  lastSpokeAt?: number,
): ActiveSpeakerMedia {
  const selection = getActiveSpeakerMediaSelection(participant);

  return {
    userId: participant.identity,
    trackType: selection.trackType,
    track: (selection.track as Track | null) ?? null,
    mediaStreamTrack: getMediaStreamTrack((selection.track as Track | null) ?? null),
    isSpeaking,
    lastSpokeAt: isSpeaking ? now : lastSpokeAt ?? now,
  };
}

export const useActiveSpeakerStore = create<ActiveSpeakerStore>()(
  persist<ActiveSpeakerStore, [], [], PersistedActiveSpeakerState>(
    (set, get) => ({
      activeSpeaker: null,
      overlayPosition: null,

      syncFromParticipants: (participants) => {
        latestParticipants = participants;

        const now = Date.now();
        const current = get().activeSpeaker;
        const currentTarget = current
          ? { userId: current.userId, trackType: current.trackType }
          : null;
        const currentParticipant = current
          ? participants.find((participant) => participant.identity === current.userId)
          : undefined;
        const preferred = selectPreferredActiveSpeaker(participants, currentTarget);

        if (preferred) {
          clearReleaseTimer();

          const preferredKey = activeSpeakerTargetKey(preferred);
          const currentKey = activeSpeakerTargetKey(currentTarget);
          const preferredParticipant = participants.find((participant) => participant.identity === preferred.userId);

          if (!preferredParticipant) {
            clearPendingSwitchTimer();
            set({ activeSpeaker: null });
            return;
          }

          if (preferredKey === currentKey) {
            clearPendingSwitchTimer();
            set({ activeSpeaker: buildActiveSpeakerMedia(preferredParticipant, now, true) });
            return;
          }

          const preferredPriority = preferred.priority;
          const currentPriority = current
            ? getActiveSpeakerTrackPriority(current.trackType)
            : 0;

          if (
            !current ||
            !currentParticipant ||
            preferred.userId === current.userId ||
            preferredPriority > currentPriority
          ) {
            clearPendingSwitchTimer();
            set({ activeSpeaker: buildActiveSpeakerMedia(preferredParticipant, now, true) });
            return;
          }

          if (pendingSwitchKey !== preferredKey) {
            clearPendingSwitchTimer();
            pendingSwitchKey = preferredKey;
            pendingSwitchTimer = window.setTimeout(() => {
              pendingSwitchTimer = null;

              if (pendingSwitchKey !== preferredKey) {
                return;
              }

              pendingSwitchKey = null;

              const latestCurrent = useActiveSpeakerStore.getState().activeSpeaker;
              const latestTarget = latestCurrent
                ? { userId: latestCurrent.userId, trackType: latestCurrent.trackType }
                : null;
              const latestPreferred = selectPreferredActiveSpeaker(latestParticipants, latestTarget);
              if (!latestPreferred || activeSpeakerTargetKey(latestPreferred) !== preferredKey) {
                return;
              }

              const latestParticipant = latestParticipants.find(
                (participant) => participant.identity === latestPreferred.userId,
              );
              if (!latestParticipant) {
                return;
              }

              useActiveSpeakerStore.setState({
                activeSpeaker: buildActiveSpeakerMedia(latestParticipant, Date.now(), true),
              });
            }, ACTIVE_SPEAKER_SWITCH_DEBOUNCE_MS);
          }

          if (currentParticipant) {
            set({
              activeSpeaker: buildActiveSpeakerMedia(
                currentParticipant,
                now,
                currentParticipant.isSpeaking,
                current.lastSpokeAt,
              ),
            });
          }
          return;
        }

        clearPendingSwitchTimer();

        if (!current || !currentParticipant) {
          clearReleaseTimer();
          set({ activeSpeaker: null });
          return;
        }

        const timeSinceLastSpeech = now - current.lastSpokeAt;
        if (timeSinceLastSpeech >= ACTIVE_SPEAKER_HOLD_MS) {
          clearReleaseTimer();
          set({ activeSpeaker: null });
          return;
        }

        clearReleaseTimer();
        set({
          activeSpeaker: buildActiveSpeakerMedia(currentParticipant, now, false, current.lastSpokeAt),
        });

        releaseTimer = window.setTimeout(() => {
          releaseTimer = null;

          const latest = useActiveSpeakerStore.getState().activeSpeaker;
          if (!latest) {
            return;
          }

          const latestParticipant = latestParticipants.find(
            (participant) => participant.identity === latest.userId,
          );
          if (latestParticipant?.isSpeaking) {
            useActiveSpeakerStore.getState().syncFromParticipants(latestParticipants);
            return;
          }

          if (Date.now() - latest.lastSpokeAt >= ACTIVE_SPEAKER_HOLD_MS) {
            useActiveSpeakerStore.setState({ activeSpeaker: null });
          }
        }, ACTIVE_SPEAKER_HOLD_MS - timeSinceLastSpeech + 16);
      },

      clearActiveSpeaker: () => {
        latestParticipants = [];
        clearPendingSwitchTimer();
        clearReleaseTimer();
        set({ activeSpeaker: null });
      },

      setOverlayPosition: (position) => {
        set({ overlayPosition: position });
      },

      resetOverlayPosition: () => {
        set({ overlayPosition: null });
      },
    }),
    {
      name: ACTIVE_SPEAKER_STORAGE_KEY,
      storage: createJSONStorage(() => activeSpeakerStorage),
      partialize: (state) => ({ overlayPosition: state.overlayPosition }),
    },
  ),
);