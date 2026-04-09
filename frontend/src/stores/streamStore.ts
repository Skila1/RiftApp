import { create } from 'zustand';
import type { Stream, Category } from '../types';
import { api } from '../api/client';
import { useHubStore } from './hubStore';
import { useMessageStore } from './messageStore';
import { useNotificationStore } from './notificationStore';
import { useVoiceChannelUiStore } from './voiceChannelUiStore';
import { useVoiceStore } from './voiceStore';

/** Monotonic id so an older in-flight `loadStreams` cannot apply after a newer hub switch. */
let loadStreamsRequestId = 0;

type HubLayoutCacheEntry = {
  at: number;
  streams: Stream[];
  categories: Category[];
  voiceMembers: Record<string, string[]>;
  voiceScreenSharers: Record<string, string[]>;
  voiceDeafenedUsers: Record<string, string[]>;
};

interface StreamState {
  streams: Stream[];
  categories: Category[];
  activeStreamId: string | null;
  streamUnreads: Record<string, number>;
  lastReadMessageIds: Record<string, string>;
  /** stream_id → hub_id for cross-hub unread indicators */
  streamHubMap: Record<string, string>;
  voiceMembers: Record<string, string[]>; // streamId -> userIds currently in voice
  /** streamId → Set of userIds currently screen-sharing (tracked via WS for non-connected viewers). */
  voiceScreenSharers: Record<string, string[]>;
  /** streamId → Set of userIds currently deafened (tracked via WS for non-connected viewers). */
  voiceDeafenedUsers: Record<string, string[]>;
  /** Last known channel layout per hub (instant restore when switching). */
  hubLayoutCache: Record<string, HubLayoutCacheEntry>;

  applyHubLayoutOrClear: (hubId: string) => void;
  invalidateHubLayoutCache: (hubId: string) => void;

  loadStreams: (hubId: string) => Promise<void>;
  loadCategories: (hubId: string) => Promise<void>;
  /** Reload streams + categories without changing active stream (for WS-triggered updates). */
  reloadLayout: (hubId: string) => Promise<void>;
  setActiveStream: (streamId: string) => Promise<void>;
  createStream: (hubId: string, name: string, type?: number, categoryId?: string, isPrivate?: boolean) => Promise<Stream>;
  patchStream: (streamId: string, name: string, voiceSettings?: { bitrate?: number; user_limit?: number; region?: string }, isPrivate?: boolean) => Promise<Stream>;
  deleteStream: (streamId: string) => Promise<void>;
  /** Mark a text channel read using latest message on server (works when channel not open). */
  markStreamRead: (streamId: string) => Promise<void>;
  createCategory: (hubId: string, name: string) => Promise<Category>;
  patchCategory: (hubId: string, categoryId: string, name: string) => Promise<Category>;
  deleteCategory: (hubId: string, categoryId: string) => Promise<void>;
  reorderStreams: (hubId: string, streams: Stream[]) => Promise<void>;
  reorderCategories: (hubId: string, categories: Category[]) => Promise<void>;
  loadReadStates: (hubId: string) => Promise<void>;
  /** Merge read-state counts for a hub (e.g. after Mark as Read); does not require the hub to be active. */
  mergeReadStatesForHub: (hubId: string) => Promise<void>;
  ackStream: (streamId: string) => Promise<void>;
  incrementUnread: (streamId: string) => void;
  clearStreams: () => void;
  loadVoiceStates: (hubId: string) => Promise<void>;
  applyVoiceState: (streamId: string, userId: string, action: 'join' | 'leave') => void;
  applyVoiceScreenShare: (streamId: string, userId: string, sharing: boolean) => void;
  applyVoiceDeafen: (streamId: string, userId: string, deafened: boolean) => void;
  /** Clear hub layout cache + stream UI (logout / account switch). */
  clearSessionCaches: () => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  streams: [],
  categories: [],
  activeStreamId: null,
  streamUnreads: {},
  lastReadMessageIds: {},
  streamHubMap: {},
  voiceMembers: {},
  voiceScreenSharers: {},
  voiceDeafenedUsers: {},
  hubLayoutCache: {},

  applyHubLayoutOrClear: (hubId) => {
    const cached = get().hubLayoutCache[hubId];
    if (cached) {
      set((s) => {
        const streamHubMap = { ...s.streamHubMap };
        for (const st of cached.streams) {
          streamHubMap[st.id] = hubId;
        }
        return {
          streams: cached.streams,
          categories: cached.categories,
          voiceMembers: cached.voiceMembers,
          voiceScreenSharers: cached.voiceScreenSharers ?? {},
          voiceDeafenedUsers: cached.voiceDeafenedUsers ?? {},
          activeStreamId: null,
          streamHubMap,
        };
      });
    } else {
      get().clearStreams();
    }
  },

  invalidateHubLayoutCache: (hubId) => {
    set((s) => {
      const hubLayoutCache = { ...s.hubLayoutCache };
      delete hubLayoutCache[hubId];
      return { hubLayoutCache };
    });
  },

  loadStreams: async (hubId) => {
    const myId = ++loadStreamsRequestId;

    const cached = get().hubLayoutCache[hubId];
    // Session cache: once a hub layout is loaded, reuse it until logout or explicit invalidation.
    const useFreshCacheOnly =
      cached != null && useHubStore.getState().activeHubId === hubId;

    if (useFreshCacheOnly) {
      if (myId !== loadStreamsRequestId || useHubStore.getState().activeHubId !== hubId) return;
      const textStream = cached.streams.find((s) => s.type === 0);
      if (textStream) {
        await get().setActiveStream(textStream.id);
      }
      return;
    }

    const [streams, categories, voiceStates] = await Promise.all([
      api.getStreams(hubId),
      api.getCategories(hubId),
      api.getVoiceStates(hubId).catch(() => ({} as Record<string, string[]>)),
    ]);
    if (myId !== loadStreamsRequestId || useHubStore.getState().activeHubId !== hubId) return;
    set((s) => {
      const streamHubMap = { ...s.streamHubMap };
      for (const st of streams) {
        streamHubMap[st.id] = hubId;
      }
      const hubLayoutCache = {
        ...s.hubLayoutCache,
        [hubId]: {
          at: Date.now(),
          streams,
          categories,
          voiceMembers: voiceStates,
          voiceScreenSharers: s.voiceScreenSharers,
          voiceDeafenedUsers: s.voiceDeafenedUsers,
        },
      };
      return { streams, categories, voiceMembers: voiceStates, streamHubMap, hubLayoutCache };
    });

    const textStream = streams.find((s) => s.type === 0);
    if (textStream) {
      await get().setActiveStream(textStream.id);
    }
  },

  loadCategories: async (hubId) => {
    const categories = await api.getCategories(hubId);
    set({ categories });
  },

  reloadLayout: async (hubId) => {
    const [streams, categories] = await Promise.all([
      api.getStreams(hubId),
      api.getCategories(hubId),
    ]);
    set((s) => {
      const streamHubMap = { ...s.streamHubMap };
      for (const st of streams) {
        streamHubMap[st.id] = hubId;
      }
      const hubLayoutCache = {
        ...s.hubLayoutCache,
        [hubId]: {
          at: Date.now(),
          streams,
          categories,
          voiceMembers: s.voiceMembers,
          voiceScreenSharers: s.voiceScreenSharers,
          voiceDeafenedUsers: s.voiceDeafenedUsers,
        },
      };
      return { streams, categories, streamHubMap, hubLayoutCache };
    });
  },

  setActiveStream: async (streamId) => {
    useVoiceChannelUiStore.getState().closeVoiceView();
    set({ activeStreamId: streamId });
    await useMessageStore.getState().loadMessages(streamId);
    await get().ackStream(streamId);
    await useNotificationStore.getState().markStreamNotificationsRead(streamId);
  },

  createStream: async (hubId, name, type = 0, categoryId?, isPrivate?) => {
    const stream = await api.createStream(hubId, name, type, categoryId, isPrivate);
    set((s) => {
      const streams = [...s.streams, stream];
      const hubLayoutCache = { ...s.hubLayoutCache };
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = {
          ...prev,
          at: Date.now(),
          streams: [...prev.streams, stream],
        };
      }
      return { streams, hubLayoutCache };
    });
    return stream;
  },

  patchStream: async (streamId, name, voiceSettings, isPrivate) => {
    const updated = await api.patchStream(streamId, { name, ...voiceSettings, is_private: isPrivate });
    set((s) => {
      const streams = s.streams.map((st) => (st.id === streamId ? updated : st));
      const hubLayoutCache = { ...s.hubLayoutCache };
      const hubId = updated.hub_id;
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = {
          ...prev,
          at: Date.now(),
          streams: prev.streams.map((st) => (st.id === streamId ? updated : st)),
        };
      }
      return { streams, hubLayoutCache };
    });
    return updated;
  },

  deleteStream: async (streamId) => {
    const st = get().streams.find((x) => x.id === streamId);
    const hubId = st?.hub_id;
    await api.deleteStream(streamId);
    useMessageStore.getState().removeStreamCache(streamId);
    set((s) => {
      const streams = s.streams.filter((x) => x.id !== streamId);
      const streamUnreads = { ...s.streamUnreads };
      delete streamUnreads[streamId];
      const lastReadMessageIds = { ...s.lastReadMessageIds };
      delete lastReadMessageIds[streamId];
      const streamHubMap = { ...s.streamHubMap };
      delete streamHubMap[streamId];
      const voiceMembers = { ...s.voiceMembers };
      delete voiceMembers[streamId];
      const voiceScreenSharers = { ...s.voiceScreenSharers };
      delete voiceScreenSharers[streamId];
      const voiceDeafenedUsers = { ...s.voiceDeafenedUsers };
      delete voiceDeafenedUsers[streamId];
      let activeStreamId = s.activeStreamId;
      if (activeStreamId === streamId) activeStreamId = null;
      const hubLayoutCache = { ...s.hubLayoutCache };
      if (hubId && hubLayoutCache[hubId]) {
        const prev = hubLayoutCache[hubId];
        hubLayoutCache[hubId] = {
          ...prev,
          at: Date.now(),
          streams: prev.streams.filter((x) => x.id !== streamId),
          voiceMembers: Object.fromEntries(
            Object.entries(prev.voiceMembers).filter(([k]) => k !== streamId),
          ),
          voiceScreenSharers: Object.fromEntries(
            Object.entries(prev.voiceScreenSharers ?? {}).filter(([k]) => k !== streamId),
          ),
          voiceDeafenedUsers: Object.fromEntries(
            Object.entries(prev.voiceDeafenedUsers ?? {}).filter(([k]) => k !== streamId),
          ),
        };
      }
      return {
        streams,
        streamUnreads,
        lastReadMessageIds,
        streamHubMap,
        voiceMembers,
        voiceScreenSharers,
        voiceDeafenedUsers,
        activeStreamId,
        hubLayoutCache,
      };
    });
    if (useVoiceChannelUiStore.getState().activeChannelId === streamId) {
      useVoiceChannelUiStore.getState().resetVoiceView();
    }
    if (useVoiceStore.getState().streamId === streamId) {
      useVoiceStore.getState().leave();
    }
    if (hubId && useHubStore.getState().activeHubId === hubId) {
      const text = get().streams.find((x) => x.type === 0);
      if (text && get().activeStreamId == null) {
        await get().setActiveStream(text.id);
      }
    }
  },

  markStreamRead: async (streamId) => {
    const st = get().streams.find((x) => x.id === streamId);
    if (!st || st.type !== 0) return;
    const hubId = st.hub_id;
    try {
      const latest = await api.getMessages(streamId, undefined, 1);
      if (latest.length === 0) {
        set((s) => ({
          streamUnreads: { ...s.streamUnreads, [streamId]: 0 },
        }));
        await get().mergeReadStatesForHub(hubId);
        return;
      }
      await api.ackStream(streamId, latest[0].id);
      set((s) => ({
        streamUnreads: { ...s.streamUnreads, [streamId]: 0 },
        lastReadMessageIds: { ...s.lastReadMessageIds, [streamId]: latest[0].id },
      }));
      await get().mergeReadStatesForHub(hubId);
    } catch {
      /* ignore */
    }
  },

  createCategory: async (hubId, name) => {
    const cat = await api.createCategory(hubId, name);
    set((s) => {
      const categories = [...s.categories, cat];
      const hubLayoutCache = { ...s.hubLayoutCache };
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = { ...prev, at: Date.now(), categories };
      }
      return { categories, hubLayoutCache };
    });
    return cat;
  },

  patchCategory: async (hubId, categoryId, name) => {
    const updated = await api.patchCategory(hubId, categoryId, { name });
    set((s) => {
      const categories = s.categories.map((c) => (c.id === categoryId ? updated : c));
      const hubLayoutCache = { ...s.hubLayoutCache };
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = { ...prev, at: Date.now(), categories };
      }
      return { categories, hubLayoutCache };
    });
    return updated;
  },

  deleteCategory: async (hubId, categoryId) => {
    await api.deleteCategory(hubId, categoryId);
    set((s) => {
      const categories = s.categories.filter((c) => c.id !== categoryId);
      const streams = s.streams.map((st) =>
        st.category_id === categoryId ? { ...st, category_id: null } : st,
      );
      const hubLayoutCache = { ...s.hubLayoutCache };
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = {
          ...prev,
          at: Date.now(),
          categories,
          streams,
        };
      }
      return { categories, streams, hubLayoutCache };
    });
  },

  reorderStreams: async (hubId, newStreams) => {
    // Optimistic update
    set((s) => {
      const hubLayoutCache = { ...s.hubLayoutCache };
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = { ...prev, at: Date.now(), streams: newStreams };
      }
      return { streams: newStreams, hubLayoutCache };
    });
    try {
      await api.reorderStreams(
        hubId,
        newStreams
          .filter((st) => st.hub_id === hubId)
          .map((st) => ({ id: st.id, position: st.position, category_id: st.category_id ?? null })),
      );
    } catch {
      // Rollback: reload from server
      const streams = await api.getStreams(hubId);
      set((s) => {
        const hubLayoutCache = { ...s.hubLayoutCache };
        const prev = hubLayoutCache[hubId];
        if (prev) {
          hubLayoutCache[hubId] = { ...prev, at: Date.now(), streams };
        }
        return { streams, hubLayoutCache };
      });
    }
  },

  reorderCategories: async (hubId, newCategories) => {
    // Optimistic update
    set((s) => {
      const hubLayoutCache = { ...s.hubLayoutCache };
      const prev = hubLayoutCache[hubId];
      if (prev) {
        hubLayoutCache[hubId] = { ...prev, at: Date.now(), categories: newCategories };
      }
      return { categories: newCategories, hubLayoutCache };
    });
    try {
      await api.reorderCategories(
        hubId,
        newCategories
          .filter((c) => c.hub_id === hubId)
          .map((c) => ({ id: c.id, position: c.position })),
      );
    } catch {
      // Rollback: reload from server
      const categories = await api.getCategories(hubId);
      set((s) => {
        const hubLayoutCache = { ...s.hubLayoutCache };
        const prev = hubLayoutCache[hubId];
        if (prev) {
          hubLayoutCache[hubId] = { ...prev, at: Date.now(), categories };
        }
        return { categories, hubLayoutCache };
      });
    }
  },

  loadReadStates: async (hubId) => {
    try {
      const states = await api.getReadStates(hubId);
      if (useHubStore.getState().activeHubId !== hubId) return;
      set((s) => {
        const streamUnreads = { ...s.streamUnreads };
        const lastReadMessageIds = { ...s.lastReadMessageIds };
        for (const rs of states) {
          streamUnreads[rs.stream_id] = rs.unread_count;
          if (rs.last_read_message_id) {
            lastReadMessageIds[rs.stream_id] = rs.last_read_message_id;
          }
        }
        return { streamUnreads, lastReadMessageIds };
      });
    } catch {}
  },

  mergeReadStatesForHub: async (hubId) => {
    try {
      const states = await api.getReadStates(hubId);
      set((s) => {
        const streamUnreads = { ...s.streamUnreads };
        const lastReadMessageIds = { ...s.lastReadMessageIds };
        for (const rs of states) {
          streamUnreads[rs.stream_id] = rs.unread_count;
          if (rs.last_read_message_id) {
            lastReadMessageIds[rs.stream_id] = rs.last_read_message_id;
          }
        }
        return { streamUnreads, lastReadMessageIds };
      });
    } catch { /* ignore */ }
  },

  ackStream: async (streamId) => {
    if (get().activeStreamId !== streamId) return;
    const msgs = useMessageStore.getState().messages;
    if (msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    try {
      await api.ackStream(streamId, lastMsg.id);
      set((s) => ({
        streamUnreads: { ...s.streamUnreads, [streamId]: 0 },
        lastReadMessageIds: { ...s.lastReadMessageIds, [streamId]: lastMsg.id },
      }));
    } catch {}
  },

  incrementUnread: (streamId) => {
    set((s) => {
      const st = s.streams.find((x) => x.id === streamId);
      const streamHubMap =
        st != null ? { ...s.streamHubMap, [streamId]: st.hub_id } : s.streamHubMap;
      return {
        streamHubMap,
        streamUnreads: {
          ...s.streamUnreads,
          [streamId]: (s.streamUnreads[streamId] || 0) + 1,
        },
      };
    });
  },

  clearStreams: () => {
    set({
      streams: [],
      categories: [],
      activeStreamId: null,
    });
  },

  loadVoiceStates: async (hubId) => {
    try {
      const states = await api.getVoiceStates(hubId);
      set({ voiceMembers: states });
    } catch { /* Voice states unavailable */ }
  },

  applyVoiceState: (streamId, userId, action) => {
    set((s) => {
      const current = s.voiceMembers[streamId] || [];
      if (action === 'join') {
        if (current.includes(userId)) return s;
        return { voiceMembers: { ...s.voiceMembers, [streamId]: [...current, userId] } };
      } else {
        const filtered = current.filter((id) => id !== userId);
        const next = { ...s.voiceMembers };
        if (filtered.length === 0) {
          delete next[streamId];
        } else {
          next[streamId] = filtered;
        }
        // Also clear screen share and deafen state for this user
        const sharers = (s.voiceScreenSharers[streamId] || []).filter((id) => id !== userId);
        const nextSharers = { ...s.voiceScreenSharers };
        if (sharers.length === 0) {
          delete nextSharers[streamId];
        } else {
          nextSharers[streamId] = sharers;
        }
        const deafened = (s.voiceDeafenedUsers[streamId] || []).filter((id) => id !== userId);
        const nextDeafened = { ...s.voiceDeafenedUsers };
        if (deafened.length === 0) {
          delete nextDeafened[streamId];
        } else {
          nextDeafened[streamId] = deafened;
        }
        return { voiceMembers: next, voiceScreenSharers: nextSharers, voiceDeafenedUsers: nextDeafened };
      }
    });
  },

  applyVoiceScreenShare: (streamId, userId, sharing) => {
    set((s) => {
      const current = s.voiceScreenSharers[streamId] || [];
      if (sharing) {
        if (current.includes(userId)) return s;
        return { voiceScreenSharers: { ...s.voiceScreenSharers, [streamId]: [...current, userId] } };
      } else {
        const filtered = current.filter((id) => id !== userId);
        const next = { ...s.voiceScreenSharers };
        if (filtered.length === 0) {
          delete next[streamId];
        } else {
          next[streamId] = filtered;
        }
        return { voiceScreenSharers: next };
      }
    });
  },

  applyVoiceDeafen: (streamId, userId, deafened) => {
    set((s) => {
      const current = s.voiceDeafenedUsers[streamId] || [];
      if (deafened) {
        if (current.includes(userId)) return s;
        return { voiceDeafenedUsers: { ...s.voiceDeafenedUsers, [streamId]: [...current, userId] } };
      } else {
        const filtered = current.filter((id) => id !== userId);
        const next = { ...s.voiceDeafenedUsers };
        if (filtered.length === 0) {
          delete next[streamId];
        } else {
          next[streamId] = filtered;
        }
        return { voiceDeafenedUsers: next };
      }
    });
  },

  clearSessionCaches: () => {
    set({
      streams: [],
      categories: [],
      streamUnreads: {},
      lastReadMessageIds: {},
      streamHubMap: {},
      voiceMembers: {},
      voiceScreenSharers: {},
      voiceDeafenedUsers: {},
      hubLayoutCache: {},
    });
  },
}));
