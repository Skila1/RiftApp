import { create } from 'zustand';
import type { Message } from '../types';
import { api } from '../api/client';
import { useStreamStore } from './streamStore';

/** In-flight load id so stale responses never overwrite the active channel. */
let loadMessagesRequestId = 0;

/** Max text channels worth of message history kept in memory (LRU by last update). */
const MAX_CACHED_STREAMS = 48;
/** Max messages stored per channel (newest retained). */
const MAX_MESSAGES_PER_STREAM = 200;

function sortMessagesAsc(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function trimMessages(messages: Message[]): Message[] {
  const sorted = sortMessagesAsc(messages);
  if (sorted.length <= MAX_MESSAGES_PER_STREAM) return sorted;
  return sorted.slice(sorted.length - MAX_MESSAGES_PER_STREAM);
}

function mergeMessageLists(cached: Message[] | undefined, fetched: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of cached ?? []) map.set(m.id, m);
  for (const m of fetched) map.set(m.id, m);
  return trimMessages([...map.values()]);
}

function pruneStreamCaches(
  cache: Record<string, { messages: Message[]; updatedAt: number }>,
): Record<string, { messages: Message[]; updatedAt: number }> {
  const entries = Object.entries(cache);
  if (entries.length <= MAX_CACHED_STREAMS) return cache;
  entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const drop = entries.length - MAX_CACHED_STREAMS;
  const next = { ...cache };
  for (let i = 0; i < drop; i++) delete next[entries[i][0]];
  return next;
}

interface MessageState {
  messages: Message[];
  messagesLoading: boolean;
  /** Per-stream message history for the session (instant hub/channel switching). */
  streamMessagesCache: Record<string, { messages: Message[]; updatedAt: number }>;

  loadMessages: (streamId: string, opts?: { force?: boolean }) => Promise<void>;
  sendMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  deleteMessage: (messageId: string) => Promise<void>;
  editMessageContent: (messageId: string, content: string) => Promise<void>;
  clearMessages: () => void;
  /** Drop cached history for one stream (e.g. after channel delete). */
  removeStreamCache: (streamId: string) => void;
  /** Drop all cached streams + visible messages (logout). */
  clearSessionCaches: () => void;

  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  applyReactionAdd: (messageId: string, userId: string, emoji: string, isDM?: boolean) => void;
  applyReactionRemove: (messageId: string, userId: string, emoji: string, isDM?: boolean) => void;
}

function patchCachedMessage(
  cache: Record<string, { messages: Message[]; updatedAt: number }>,
  messageId: string,
  fn: (m: Message) => Message,
): Record<string, { messages: Message[]; updatedAt: number }> {
  let changed = false;
  const next = { ...cache };
  for (const sid of Object.keys(next)) {
    const entry = next[sid];
    const idx = entry.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) continue;
    const copy = [...entry.messages];
    copy[idx] = fn(copy[idx]);
    next[sid] = { messages: copy, updatedAt: Date.now() };
    changed = true;
  }
  return changed ? next : cache;
}

function removeFromAllCaches(
  cache: Record<string, { messages: Message[]; updatedAt: number }>,
  messageId: string,
): Record<string, { messages: Message[]; updatedAt: number }> {
  const next = { ...cache };
  let changed = false;
  for (const sid of Object.keys(next)) {
    const entry = next[sid];
    const filtered = entry.messages.filter((m) => m.id !== messageId);
    if (filtered.length !== entry.messages.length) {
      next[sid] = { messages: filtered, updatedAt: Date.now() };
      changed = true;
    }
  }
  return changed ? next : cache;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  messagesLoading: false,
  streamMessagesCache: {},

  loadMessages: async (streamId, opts) => {
    const myId = ++loadMessagesRequestId;
    const cachedEntry = get().streamMessagesCache[streamId];
    const activeOk = () =>
      myId === loadMessagesRequestId && useStreamStore.getState().activeStreamId === streamId;

    if (cachedEntry && cachedEntry.messages.length > 0 && !opts?.force) {
      if (!activeOk()) return;
      set({ messages: cachedEntry.messages, messagesLoading: false });
      return;
    }

    if (!activeOk()) return;
    set({
      messagesLoading: true,
      messages: cachedEntry?.messages?.length ? cachedEntry.messages : [],
    });

    try {
      const fetched = await api.getMessages(streamId);
      if (!activeOk()) return;
      const merged = mergeMessageLists(cachedEntry?.messages, fetched);
      set((s) => ({
        messages: merged,
        messagesLoading: false,
        streamMessagesCache: pruneStreamCaches({
          ...s.streamMessagesCache,
          [streamId]: { messages: merged, updatedAt: Date.now() },
        }),
      }));
    } catch {
      if (!activeOk()) return;
      if (cachedEntry?.messages?.length) {
        set({ messages: cachedEntry.messages, messagesLoading: false });
      } else {
        set({ messagesLoading: false });
      }
    }
  },

  sendMessage: async (content, attachmentIds) => {
    const streamId = useStreamStore.getState().activeStreamId;
    if (!streamId) return;
    const msg = await api.sendMessage(streamId, content, attachmentIds);
    get().addMessage(msg);
  },

  addMessage: (message) => {
    const activeStreamId = useStreamStore.getState().activeStreamId;
    const sid = message.stream_id;
    if (!sid) return;

    const prev = get().streamMessagesCache[sid]?.messages ?? [];
    if (prev.some((m) => m.id === message.id)) {
      if (sid === activeStreamId && !get().messages.some((m) => m.id === message.id)) {
        set((s) => ({
          messages: sortMessagesAsc([...s.messages, message]).slice(-MAX_MESSAGES_PER_STREAM),
        }));
      }
      return;
    }

    set((s) => {
      const merged = trimMessages([...prev, message]);
      const streamMessagesCache = pruneStreamCaches({
        ...s.streamMessagesCache,
        [sid]: { messages: merged, updatedAt: Date.now() },
      });
      if (sid === activeStreamId) {
        return {
          messages: sortMessagesAsc([...s.messages, message]).slice(-MAX_MESSAGES_PER_STREAM),
          streamMessagesCache,
        };
      }
      return { streamMessagesCache };
    });

    if (sid !== activeStreamId) {
      useStreamStore.getState().incrementUnread(sid);
    }
  },

  updateMessage: (message) => {
    set((s) => {
      const streamMessagesCache = patchCachedMessage(s.streamMessagesCache, message.id, () => message);
      return {
        messages: s.messages.map((m) => (m.id === message.id ? message : m)),
        streamMessagesCache,
      };
    });
  },

  removeMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
      streamMessagesCache: removeFromAllCaches(s.streamMessagesCache, messageId),
    }));
  },

  deleteMessage: async (messageId) => {
    await api.deleteMessage(messageId);
    get().removeMessage(messageId);
  },

  editMessageContent: async (messageId, content) => {
    const msg = await api.editMessage(messageId, content);
    get().updateMessage(msg);
  },

  clearMessages: () => set({ messages: [], messagesLoading: false }),

  removeStreamCache: (streamId) => {
    const active = useStreamStore.getState().activeStreamId;
    set((s) => {
      const streamMessagesCache = { ...s.streamMessagesCache };
      delete streamMessagesCache[streamId];
      if (active === streamId) {
        return { messages: [], messagesLoading: false, streamMessagesCache };
      }
      return { streamMessagesCache };
    });
  },

  clearSessionCaches: () =>
    set({
      messages: [],
      messagesLoading: false,
      streamMessagesCache: {},
    }),

  toggleReaction: async (messageId, emoji) => {
    await api.addReaction(messageId, emoji);
  },

  applyReactionAdd: (messageId, userId, emoji, isDM = false) => {
    if (isDM) return;
    const patch = (m: Message) => {
      const reactions = [...(m.reactions || [])];
      const idx = reactions.findIndex((r) => r.emoji === emoji);
      if (idx >= 0) {
        const r = reactions[idx];
        if (!r.users.includes(userId)) {
          reactions[idx] = { ...r, count: r.count + 1, users: [...r.users, userId] };
        }
      } else {
        reactions.push({ emoji, count: 1, users: [userId] });
      }
      return { ...m, reactions };
    };
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? patch(m) : m)),
      streamMessagesCache: patchCachedMessage(s.streamMessagesCache, messageId, patch),
    }));
  },

  applyReactionRemove: (messageId, userId, emoji, isDM = false) => {
    if (isDM) return;
    const patch = (m: Message) => {
      const reactions = (m.reactions || [])
        .map((r) => {
          if (r.emoji !== emoji) return r;
          const users = r.users.filter((u) => u !== userId);
          return { ...r, count: users.length, users };
        })
        .filter((r) => r.count > 0);
      return { ...m, reactions };
    };
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? patch(m) : m)),
      streamMessagesCache: patchCachedMessage(s.streamMessagesCache, messageId, patch),
    }));
  },
}));
