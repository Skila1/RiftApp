import { create } from 'zustand';
import type { Message, User } from '../types';
import { api } from '../api/client';
import { useAuthStore } from './auth';
import { useStreamStore } from './streamStore';
import { normalizeMessage, normalizeMessages, normalizeUser } from '../utils/entityAssets';

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

function mergeMessageLists(cached: Message[] | undefined, fetched: Message[], opts?: { trim?: boolean }): Message[] {
  const map = new Map<string, Message>();
  for (const m of cached ?? []) map.set(m.id, m);
  for (const m of fetched) map.set(m.id, m);
  const merged = sortMessagesAsc([...map.values()]);
  if (opts?.trim === false) return merged;
  if (merged.length <= MAX_MESSAGES_PER_STREAM) return merged;
  return merged.slice(merged.length - MAX_MESSAGES_PER_STREAM);
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

export interface PinSystemEvent {
  id: string;
  streamId: string;
  originalMessageId: string;
  pinnedAt: string;
  pinnedById: string | null;
  pinnedBy?: User;
  targetDeleted: boolean;
}

function pinSystemEventId(messageId: string, pinnedAt: string) {
  return `pin:${messageId}:${pinnedAt}`;
}

function buildPinSystemEvent(message: Message, existing?: PinSystemEvent): PinSystemEvent | null {
  if (!message.stream_id || !message.pinned_at) {
    return null;
  }

  return {
    id: pinSystemEventId(message.id, message.pinned_at),
    streamId: message.stream_id,
    originalMessageId: message.id,
    pinnedAt: message.pinned_at,
    pinnedById: message.pinned_by?.id ?? message.pinned_by_id ?? existing?.pinnedById ?? null,
    pinnedBy: message.pinned_by ? normalizeUser(message.pinned_by) : existing?.pinnedBy,
    targetDeleted: false,
  };
}

function mergePinSystemEvents(existing: PinSystemEvent[] | undefined, messages: Message[]): PinSystemEvent[] {
  const map = new Map<string, PinSystemEvent>();

  for (const event of existing ?? []) {
    map.set(event.id, event);
  }

  for (const message of messages) {
    if (!message.pinned_at) {
      continue;
    }

    const existingEvent = map.get(pinSystemEventId(message.id, message.pinned_at));
    const nextEvent = buildPinSystemEvent(message, existingEvent);
    if (!nextEvent) {
      continue;
    }

    map.set(nextEvent.id, nextEvent);
  }

  return [...map.values()].sort(
    (left, right) => new Date(left.pinnedAt).getTime() - new Date(right.pinnedAt).getTime(),
  );
}

function markPinEventsTargetDeleted(
  pinSystemEventsByStream: Record<string, PinSystemEvent[]>,
  originalMessageId: string,
) {
  let changed = false;
  const next: Record<string, PinSystemEvent[]> = {};

  for (const [streamId, events] of Object.entries(pinSystemEventsByStream)) {
    let streamChanged = false;
    const patched = events.map((event) => {
      if (event.originalMessageId !== originalMessageId || event.targetDeleted) {
        return event;
      }

      streamChanged = true;
      return {
        ...event,
        targetDeleted: true,
      };
    });

    next[streamId] = streamChanged ? patched : events;
    changed = changed || streamChanged;
  }

  return changed ? next : pinSystemEventsByStream;
}

function patchPinSystemEventUser(
  pinSystemEventsByStream: Record<string, PinSystemEvent[]>,
  user: User,
) {
  let changed = false;
  const nextUser = normalizeUser(user);

  const next = Object.fromEntries(
    Object.entries(pinSystemEventsByStream).map(([streamId, events]) => {
      let streamChanged = false;
      const patched = events.map((event) => {
        if (event.pinnedById !== nextUser.id) {
          return event;
        }

        streamChanged = true;
        return {
          ...event,
          pinnedBy: event.pinnedBy ? { ...event.pinnedBy, ...nextUser } : nextUser,
        };
      });

      changed = changed || streamChanged;
      return [streamId, streamChanged ? patched : events];
    }),
  ) as Record<string, PinSystemEvent[]>;

  return changed ? next : pinSystemEventsByStream;
}

interface MessageState {
  messages: Message[];
  messagesLoading: boolean;
  pinMutationVersion: number;
  pinSystemEventsByStream: Record<string, PinSystemEvent[]>;
  /** Per-stream message history for the session (instant hub/channel switching). */
  streamMessagesCache: Record<string, { messages: Message[]; updatedAt: number }>;

  loadMessages: (streamId: string, opts?: { force?: boolean; silent?: boolean }) => Promise<void>;
  ensureMessageLoaded: (streamId: string, messageId: string) => Promise<boolean>;
  sendMessage: (content: string, attachmentIds?: string[], replyToMessageId?: string) => Promise<void>;
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
  patchUser: (user: User) => void;

  pinMessage: (messageId: string) => Promise<Message>;
  unpinMessage: (messageId: string) => Promise<Message>;

  toggleReaction: (messageId: string, emoji: string, emojiId?: string) => Promise<void>;
  applyReactionAdd: (messageId: string, userId: string, emoji: string, isDM?: boolean, emojiId?: string, fileUrl?: string) => void;
  applyReactionRemove: (messageId: string, userId: string, emoji: string, isDM?: boolean, emojiId?: string) => void;
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
  pinMutationVersion: 0,
  pinSystemEventsByStream: {},
  streamMessagesCache: {},

  loadMessages: async (streamId, opts) => {
    const myId = ++loadMessagesRequestId;
    const cachedEntry = get().streamMessagesCache[streamId];
    const preserveVisibleMessages = opts?.silent === true && (cachedEntry?.messages?.length ?? 0) > 0;
    const activeOk = () =>
      myId === loadMessagesRequestId && useStreamStore.getState().activeStreamId === streamId;

    if (cachedEntry && cachedEntry.messages.length > 0 && !opts?.force) {
      if (!activeOk()) return;
      set({ messages: cachedEntry.messages, messagesLoading: false });
      return;
    }

    if (!activeOk()) return;
    set({
      messagesLoading: !preserveVisibleMessages,
      messages: cachedEntry?.messages?.length ? cachedEntry.messages : [],
    });

    try {
      const fetched = normalizeMessages(await api.getMessages(streamId));
      if (!activeOk()) return;
      const merged = mergeMessageLists(cachedEntry?.messages, fetched, {
        trim: !cachedEntry || cachedEntry.messages.length <= MAX_MESSAGES_PER_STREAM,
      });
      set((s) => ({
        messages: merged,
        messagesLoading: false,
        pinSystemEventsByStream: {
          ...s.pinSystemEventsByStream,
          [streamId]: mergePinSystemEvents(s.pinSystemEventsByStream[streamId], merged),
        },
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

  ensureMessageLoaded: async (streamId, messageId) => {
    const isActiveStream = () => useStreamStore.getState().activeStreamId === streamId;
    let loaded = mergeMessageLists(undefined, get().streamMessagesCache[streamId]?.messages ?? [], { trim: false });

    if (isActiveStream()) {
      set({ messagesLoading: true });
    }

    try {
      if (loaded.length === 0) {
        loaded = mergeMessageLists(undefined, normalizeMessages(await api.getMessages(streamId, undefined, 100)), { trim: false });
      }

      let before = loaded[0]?.id;
      while (!loaded.some((message) => message.id === messageId)) {
        if (!before) break;
        const older = normalizeMessages(await api.getMessages(streamId, before, 100));
        if (older.length === 0) break;
        const merged = mergeMessageLists(loaded, older, { trim: false });
        if (merged.length === loaded.length) break;
        loaded = merged;
        before = loaded[0]?.id;
      }

      const found = loaded.some((message) => message.id === messageId);
      set((s) => {
        const streamMessagesCache = pruneStreamCaches({
          ...s.streamMessagesCache,
          [streamId]: { messages: loaded, updatedAt: Date.now() },
        });
        if (isActiveStream()) {
          return {
            messages: loaded,
            messagesLoading: false,
            pinSystemEventsByStream: {
              ...s.pinSystemEventsByStream,
              [streamId]: mergePinSystemEvents(s.pinSystemEventsByStream[streamId], loaded),
            },
            streamMessagesCache,
          };
        }
        return {
          pinSystemEventsByStream: {
            ...s.pinSystemEventsByStream,
            [streamId]: mergePinSystemEvents(s.pinSystemEventsByStream[streamId], loaded),
          },
          streamMessagesCache,
        };
      });
      return found;
    } catch {
      if (isActiveStream()) {
        set({ messagesLoading: false });
      }
      return false;
    }
  },

  sendMessage: async (content, attachmentIds, replyToMessageId) => {
    const streamId = useStreamStore.getState().activeStreamId;
    if (!streamId) return;
    const msg = await api.sendMessage(streamId, content, attachmentIds, replyToMessageId);
    get().addMessage(msg);
  },

  addMessage: (message) => {
    const nextMessage = normalizeMessage(message);
    const activeStreamId = useStreamStore.getState().activeStreamId;
    const currentUserId = useAuthStore.getState().user?.id;
    const sid = nextMessage.stream_id;
    if (!sid) return;

    const prev = get().streamMessagesCache[sid]?.messages ?? [];
    const shouldTrim = prev.length <= MAX_MESSAGES_PER_STREAM;
    if (prev.some((m) => m.id === nextMessage.id)) {
      if (sid === activeStreamId && !get().messages.some((m) => m.id === nextMessage.id)) {
        set((s) => ({
          messages: shouldTrim
            ? sortMessagesAsc([...s.messages, nextMessage]).slice(-MAX_MESSAGES_PER_STREAM)
            : sortMessagesAsc([...s.messages, nextMessage]),
        }));
      }
      return;
    }

    set((s) => {
      const merged = shouldTrim ? trimMessages([...prev, nextMessage]) : sortMessagesAsc([...prev, nextMessage]);
      const pinSystemEventsByStream = {
        ...s.pinSystemEventsByStream,
        [sid]: mergePinSystemEvents(s.pinSystemEventsByStream[sid], merged),
      };
      const streamMessagesCache = pruneStreamCaches({
        ...s.streamMessagesCache,
        [sid]: { messages: merged, updatedAt: Date.now() },
      });
      if (sid === activeStreamId) {
        return {
          messages: shouldTrim
            ? sortMessagesAsc([...s.messages, nextMessage]).slice(-MAX_MESSAGES_PER_STREAM)
            : sortMessagesAsc([...s.messages, nextMessage]),
          pinSystemEventsByStream,
          streamMessagesCache,
        };
      }
      return { pinSystemEventsByStream, streamMessagesCache };
    });

    if (sid !== activeStreamId && nextMessage.author_id !== currentUserId) {
      useStreamStore.getState().incrementUnread(sid);
    }
  },

  updateMessage: (message) => {
    const nextMessage = normalizeMessage(message);
    set((s) => {
      const streamMessagesCache = patchCachedMessage(s.streamMessagesCache, nextMessage.id, () => nextMessage);
      const pinSystemEventsByStream = nextMessage.stream_id
        ? {
            ...s.pinSystemEventsByStream,
            [nextMessage.stream_id]: mergePinSystemEvents(s.pinSystemEventsByStream[nextMessage.stream_id], [nextMessage]),
          }
        : s.pinSystemEventsByStream;
      return {
        messages: s.messages.map((m) => (m.id === nextMessage.id ? nextMessage : m)),
        pinSystemEventsByStream,
        streamMessagesCache,
      };
    });
  },

  removeMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
      pinSystemEventsByStream: markPinEventsTargetDeleted(s.pinSystemEventsByStream, messageId),
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
      const pinSystemEventsByStream = { ...s.pinSystemEventsByStream };
      delete streamMessagesCache[streamId];
      delete pinSystemEventsByStream[streamId];
      if (active === streamId) {
        return { messages: [], messagesLoading: false, pinSystemEventsByStream, streamMessagesCache };
      }
      return { pinSystemEventsByStream, streamMessagesCache };
    });
  },

  clearSessionCaches: () =>
    set({
      messages: [],
      messagesLoading: false,
      pinSystemEventsByStream: {},
      streamMessagesCache: {},
    }),

  patchUser: (user) => {
    const nextUser = normalizeUser(user);
    const patchAuthor = (message: Message) => {
      let nextMessage = message;
      if (message.author?.id === nextUser.id) {
        nextMessage = { ...nextMessage, author: { ...message.author, ...nextUser } };
      }
      if (message.pinned_by?.id === nextUser.id) {
        nextMessage = { ...nextMessage, pinned_by: { ...message.pinned_by, ...nextUser } };
      }
      if (message.reply_to) {
        const reply = message.reply_to;
        let nextReply = reply;
        if (reply.author?.id === nextUser.id) {
          nextReply = { ...nextReply, author: { ...reply.author, ...nextUser } };
        }
        if (reply.pinned_by?.id === nextUser.id) {
          nextReply = { ...nextReply, pinned_by: { ...reply.pinned_by, ...nextUser } };
        }
        if (nextReply !== reply) {
          nextMessage = { ...nextMessage, reply_to: nextReply };
        }
      }
      return nextMessage;
    };
    set((s) => ({
      messages: s.messages.map(patchAuthor),
      pinSystemEventsByStream: patchPinSystemEventUser(s.pinSystemEventsByStream, nextUser),
      streamMessagesCache: Object.fromEntries(
        Object.entries(s.streamMessagesCache).map(([streamId, entry]) => [
          streamId,
          {
            messages: entry.messages.map(patchAuthor),
            updatedAt: entry.updatedAt,
          },
        ]),
      ),
    }));
  },

  pinMessage: async (messageId) => {
    const msg = normalizeMessage(await api.pinMessage(messageId));
    set((s) => ({ pinMutationVersion: s.pinMutationVersion + 1 }));
    get().updateMessage(msg);
    return msg;
  },

  unpinMessage: async (messageId) => {
    const msg = normalizeMessage(await api.unpinMessage(messageId));
    set((s) => ({ pinMutationVersion: s.pinMutationVersion + 1 }));
    get().updateMessage(msg);
    return msg;
  },

  toggleReaction: async (messageId, emoji, emojiId) => {
    await api.addReaction(messageId, emoji, emojiId);
  },

  applyReactionAdd: (messageId, userId, emoji, isDM = false, emojiId, fileUrl) => {
    if (isDM) return;
    const patch = (m: Message) => {
      const reactions = [...(m.reactions || [])];
      const idx = reactions.findIndex((r) => emojiId ? r.emoji_id === emojiId : (r.emoji === emoji && !r.emoji_id));
      if (idx >= 0) {
        const r = reactions[idx];
        if (!r.users.includes(userId)) {
          reactions[idx] = { ...r, count: r.count + 1, users: [...r.users, userId] };
        }
      } else {
        reactions.push({ emoji, emoji_id: emojiId, file_url: fileUrl, count: 1, users: [userId] });
      }
      return { ...m, reactions };
    };
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? patch(m) : m)),
      streamMessagesCache: patchCachedMessage(s.streamMessagesCache, messageId, patch),
    }));
  },

  applyReactionRemove: (messageId, userId, emoji, isDM = false, emojiId) => {
    if (isDM) return;
    const patch = (m: Message) => {
      const reactions = (m.reactions || [])
        .map((r) => {
          const match = emojiId ? r.emoji_id === emojiId : (r.emoji === emoji && !r.emoji_id);
          if (!match) return r;
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
