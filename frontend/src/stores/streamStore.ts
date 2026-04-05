import { create } from 'zustand';
import type { Stream, Category } from '../types';
import { api } from '../api/client';

/** Monotonic id so an older in-flight `loadStreams` cannot apply after a newer hub switch. */
let loadStreamsRequestId = 0;

interface StreamState {
  streams: Stream[];
  categories: Category[];
  activeStreamId: string | null;
  viewingVoiceStreamId: string | null;
  streamUnreads: Record<string, number>;
  lastReadMessageIds: Record<string, string>;
  /** stream_id → hub_id for cross-hub unread indicators */
  streamHubMap: Record<string, string>;
  voiceMembers: Record<string, string[]>; // streamId -> userIds currently in voice

  loadStreams: (hubId: string) => Promise<void>;
  loadCategories: (hubId: string) => Promise<void>;
  setActiveStream: (streamId: string) => Promise<void>;
  setViewingVoice: (streamId: string | null) => void;
  createStream: (hubId: string, name: string, type?: number, categoryId?: string) => Promise<Stream>;
  createCategory: (hubId: string, name: string) => Promise<Category>;
  deleteCategory: (hubId: string, categoryId: string) => Promise<void>;
  loadReadStates: (hubId: string) => Promise<void>;
  /** Merge read-state counts for a hub (e.g. after Mark as Read); does not require the hub to be active. */
  mergeReadStatesForHub: (hubId: string) => Promise<void>;
  ackStream: (streamId: string) => Promise<void>;
  incrementUnread: (streamId: string) => void;
  clearStreams: () => void;
  loadVoiceStates: (hubId: string) => Promise<void>;
  applyVoiceState: (streamId: string, userId: string, action: 'join' | 'leave') => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  streams: [],
  categories: [],
  activeStreamId: null,
  viewingVoiceStreamId: null,
  streamUnreads: {},
  lastReadMessageIds: {},
  streamHubMap: {},
  voiceMembers: {},

  loadStreams: async (hubId) => {
    const myId = ++loadStreamsRequestId;
    const [streams, categories, voiceStates] = await Promise.all([
      api.getStreams(hubId),
      api.getCategories(hubId),
      api.getVoiceStates(hubId).catch(() => ({} as Record<string, string[]>)),
    ]);
    const { useHubStore } = await import('./hubStore');
    if (myId !== loadStreamsRequestId || useHubStore.getState().activeHubId !== hubId) return;
    set((s) => {
      const streamHubMap = { ...s.streamHubMap };
      for (const st of streams) {
        streamHubMap[st.id] = hubId;
      }
      return { streams, categories, voiceMembers: voiceStates, streamHubMap };
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

  setActiveStream: async (streamId) => {
    const { useMessageStore } = await import('./messageStore');
    const { useNotificationStore } = await import('./notificationStore');

    set({ activeStreamId: streamId, viewingVoiceStreamId: null });
    useMessageStore.getState().clearMessages();
    await useMessageStore.getState().loadMessages(streamId);
    await get().ackStream(streamId);
    await useNotificationStore.getState().markStreamNotificationsRead(streamId);
  },

  setViewingVoice: (streamId) => {
    set({ viewingVoiceStreamId: streamId });
  },

  createStream: async (hubId, name, type = 0, categoryId?) => {
    const stream = await api.createStream(hubId, name, type, categoryId);
    set((s) => ({ streams: [...s.streams, stream] }));
    return stream;
  },

  createCategory: async (hubId, name) => {
    const cat = await api.createCategory(hubId, name);
    set((s) => ({ categories: [...s.categories, cat] }));
    return cat;
  },

  deleteCategory: async (hubId, categoryId) => {
    await api.deleteCategory(hubId, categoryId);
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== categoryId),
      streams: s.streams.map((st) => st.category_id === categoryId ? { ...st, category_id: null } : st),
    }));
  },

  loadReadStates: async (hubId) => {
    try {
      const states = await api.getReadStates(hubId);
      const { useHubStore } = await import('./hubStore');
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
    const { useMessageStore } = await import('./messageStore');
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
      viewingVoiceStreamId: null,
      voiceMembers: {},
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
        return { voiceMembers: next };
      }
    });
  },
}));
