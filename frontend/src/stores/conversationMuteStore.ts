import { create } from 'zustand';

const CONVERSATION_MUTE_STORAGE_KEY = 'riftapp.conversation-mutes.v1';
const INDEFINITE_CONVERSATION_MUTE = -1;

type ConversationMuteMap = Record<string, number>;

function isConversationId(value: string) {
  return value.trim().length > 0;
}

function isMuteValueActive(value: number | null | undefined) {
  return value === INDEFINITE_CONVERSATION_MUTE
    || (typeof value === 'number' && Number.isFinite(value) && value > Date.now());
}

function normalizeMuteMap(value: unknown): ConversationMuteMap {
  if (typeof value !== 'object' || value == null) {
    return {};
  }

  const next: ConversationMuteMap = {};
  for (const [conversationId, mutedUntil] of Object.entries(value as Record<string, unknown>)) {
    if (!isConversationId(conversationId)) {
      continue;
    }

    if (typeof mutedUntil !== 'number' || !Number.isFinite(mutedUntil)) {
      continue;
    }

    if (!isMuteValueActive(mutedUntil)) {
      continue;
    }

    next[conversationId] = mutedUntil;
  }

  return next;
}

function loadPersistedConversationMutes(): ConversationMuteMap {
  try {
    const raw = localStorage.getItem(CONVERSATION_MUTE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return normalizeMuteMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function persistConversationMutes(mutedUntilByConversationId: ConversationMuteMap) {
  try {
    localStorage.setItem(CONVERSATION_MUTE_STORAGE_KEY, JSON.stringify(mutedUntilByConversationId));
  } catch {
    /* ignore storage failures */
  }
}

function withCleanConversationMutes(mutedUntilByConversationId: ConversationMuteMap) {
  return normalizeMuteMap(mutedUntilByConversationId);
}

interface ConversationMuteState {
  mutedUntilByConversationId: ConversationMuteMap;
  muteConversation: (conversationId: string, durationMs: number | null) => void;
  unmuteConversation: (conversationId: string) => void;
  clearExpiredConversationMutes: () => void;
}

const persistedConversationMutes = loadPersistedConversationMutes();

export function isConversationMuted(mutedUntil: number | null | undefined) {
  return isMuteValueActive(mutedUntil);
}

export function getMutedConversationIds(mutedUntilByConversationId: ConversationMuteMap) {
  return new Set(
    Object.entries(mutedUntilByConversationId)
      .filter(([, mutedUntil]) => isConversationMuted(mutedUntil))
      .map(([conversationId]) => conversationId),
  );
}

export const useConversationMuteStore = create<ConversationMuteState>((set) => ({
  mutedUntilByConversationId: persistedConversationMutes,

  muteConversation: (conversationId, durationMs) => {
    if (!isConversationId(conversationId)) {
      return;
    }

    const mutedUntil = durationMs == null
      ? INDEFINITE_CONVERSATION_MUTE
      : Date.now() + Math.max(durationMs, 0);

    set((state) => {
      const mutedUntilByConversationId = withCleanConversationMutes({
        ...state.mutedUntilByConversationId,
        [conversationId]: mutedUntil,
      });
      persistConversationMutes(mutedUntilByConversationId);
      return { mutedUntilByConversationId };
    });
  },

  unmuteConversation: (conversationId) => {
    if (!isConversationId(conversationId)) {
      return;
    }

    set((state) => {
      const mutedUntilByConversationId = { ...state.mutedUntilByConversationId };
      delete mutedUntilByConversationId[conversationId];
      const cleaned = withCleanConversationMutes(mutedUntilByConversationId);
      persistConversationMutes(cleaned);
      return { mutedUntilByConversationId: cleaned };
    });
  },

  clearExpiredConversationMutes: () => {
    set((state) => {
      const mutedUntilByConversationId = withCleanConversationMutes(state.mutedUntilByConversationId);
      persistConversationMutes(mutedUntilByConversationId);
      return { mutedUntilByConversationId };
    });
  },
}));