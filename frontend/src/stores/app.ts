import { create } from 'zustand';
import type { Hub, Stream, Message, Notification, Conversation, User } from '../types';
import { api } from '../api/client';
import { useAuthStore } from './auth';

// dm unread totals — sum of unreads across all conversations
const sumDmUnreads = (conversations: Conversation[]) =>
  conversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0);

interface AppState {
  // Hubs
  hubs: Hub[];
  activeHubId: string | null;
  
  // Streams
  streams: Stream[];
  activeStreamId: string | null;
  
  // Messages
  messages: Message[];
  messagesLoading: boolean;

  // Typing indicators – map of streamId → set of userIds currently typing
  typers: Record<string, Set<string>>;

  // Presence – map of userId → status (0=offline, 1=online, 2=idle, 3=dnd)
  presence: Record<string, number>;

  // Hub members – map of userId → User (populated from hub member list)
  hubMembers: Record<string, User>;

  // Notifications
  notifications: Notification[];
  unreadCount: number;

  // Unread tracking
  streamUnreads: Record<string, number>;
  lastReadMessageIds: Record<string, string>;

  // DMs
  conversations: Conversation[];
  activeConversationId: string | null;
  dmMessages: Message[];
  dmMessagesLoading: boolean;

  // Hub actions
  loadHubs: () => Promise<void>;
  setActiveHub: (hubId: string) => Promise<void>;
  createHub: (name: string) => Promise<Hub>;
  updateHub: (hubId: string, data: { name?: string; icon_url?: string }) => Promise<Hub>;

  // Stream actions
  loadStreams: (hubId: string) => Promise<void>;
  setActiveStream: (streamId: string) => Promise<void>;
  createStream: (hubId: string, name: string, type?: number) => Promise<Stream>;

  // Message actions
  loadMessages: (streamId: string) => Promise<void>;
  sendMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;

  // Typing actions
  addTyper: (streamId: string, userId: string) => void;
  removeTyper: (streamId: string, userId: string) => void;
  clearTypers: (streamId: string) => void;

  // Presence actions
  setPresence: (userId: string, status: number) => void;
  setBulkPresence: (entries: Record<string, number>) => void;
  loadPresenceForHub: (hubId: string) => Promise<void>;

  // Notification actions
  loadNotifications: () => Promise<void>;
  addNotification: (notif: Notification) => void;
  markNotifRead: (notifId: string) => Promise<void>;
  markAllNotifsRead: () => Promise<void>;

  // DM actions
  loadConversations: () => Promise<void>;
  openDM: (recipientId: string) => Promise<void>;
  setActiveConversation: (convId: string) => Promise<void>;
  clearActiveConversation: () => void;
  loadDMMessages: (convId: string) => Promise<void>;
  sendDMMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  addDMMessage: (message: Message) => void;
  addConversation: (conv: Conversation) => void;
  ackDM: (convId: string) => Promise<void>;
  dmTotalUnread: number;

  // Unread actions
  loadReadStates: (hubId: string) => Promise<void>;
  ackStream: (streamId: string) => Promise<void>;
  incrementUnread: (streamId: string) => void;

  // Reaction actions
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  applyReactionAdd: (messageId: string, userId: string, emoji: string) => void;
  applyReactionRemove: (messageId: string, userId: string, emoji: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  hubs: [],
  activeHubId: null,
  streams: [],
  activeStreamId: null,
  messages: [],
  messagesLoading: false,
  typers: {},
  presence: {},
  hubMembers: {},
  notifications: [],
  unreadCount: 0,
  streamUnreads: {},
  lastReadMessageIds: {},
  conversations: [],
  activeConversationId: null,
  dmMessages: [],
  dmMessagesLoading: false,
  dmTotalUnread: 0,

  loadHubs: async () => {
    const hubs = await api.getHubs();
    set({ hubs });
  },

  setActiveHub: async (hubId) => {
    set({ activeHubId: hubId, activeStreamId: null, messages: [], streams: [], activeConversationId: null, dmMessages: [], streamUnreads: {}, lastReadMessageIds: {} });
    await Promise.all([
      get().loadStreams(hubId),
      get().loadPresenceForHub(hubId),
      get().loadReadStates(hubId),
    ]);
  },

  createHub: async (name) => {
    const hub = await api.createHub(name);
    set((s) => ({ hubs: [...s.hubs, hub] }));
    return hub;
  },

  updateHub: async (hubId, data) => {
    const hub = await api.updateHub(hubId, data);
    set((s) => ({ hubs: s.hubs.map((h) => (h.id === hubId ? hub : h)) }));
    return hub;
  },

  loadStreams: async (hubId) => {
    const streams = await api.getStreams(hubId);
    // Guard: discard if user switched hubs while loading
    if (get().activeHubId !== hubId) return;
    set({ streams });
    // Auto-select first text stream
    const textStream = streams.find((s) => s.type === 0);
    if (textStream) {
      await get().setActiveStream(textStream.id);
    }
  },

  setActiveStream: async (streamId) => {
    set({ activeStreamId: streamId, messages: [] });
    await get().loadMessages(streamId);
    // Mark stream as read
    await get().ackStream(streamId);
  },

  createStream: async (hubId, name, type = 0) => {
    const stream = await api.createStream(hubId, name, type);
    set((s) => ({ streams: [...s.streams, stream] }));
    return stream;
  },

  loadMessages: async (streamId) => {
    set({ messagesLoading: true });
    try {
      const messages = await api.getMessages(streamId);
      // Guard: discard if user switched streams while loading
      set((s) => {
        if (s.activeStreamId !== streamId) return { messagesLoading: false };
        return { messages, messagesLoading: false };
      });
    } catch {
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (content, attachmentIds) => {
    const streamId = get().activeStreamId;
    if (!streamId) return;
    await api.sendMessage(streamId, content, attachmentIds);
  },

  addMessage: (message) => {
    set((s) => {
      if (message.stream_id === s.activeStreamId) {
        // Active stream: add to visible messages (dedup by id)
        if (s.messages.some((m) => m.id === message.id)) return s;
        return { messages: [...s.messages, message] };
      }
      // Non-active stream: increment unread atomically
      if (message.stream_id) {
        return {
          streamUnreads: {
            ...s.streamUnreads,
            [message.stream_id]: (s.streamUnreads[message.stream_id] || 0) + 1,
          },
        };
      }
      return s;
    });
  },

  updateMessage: (message) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === message.id ? message : m)),
    }));
  },

  removeMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
    }));
  },

  addTyper: (streamId, userId) => {
    set((s) => {
      const current = new Set(s.typers[streamId]);
      current.add(userId);
      return { typers: { ...s.typers, [streamId]: current } };
    });
  },

  removeTyper: (streamId, userId) => {
    set((s) => {
      const current = new Set(s.typers[streamId]);
      current.delete(userId);
      return { typers: { ...s.typers, [streamId]: current } };
    });
  },

  clearTypers: (streamId) => {
    set((s) => {
      const next = { ...s.typers };
      delete next[streamId];
      return { typers: next };
    });
  },

  setPresence: (userId, status) => {
    set((s) => ({
      presence: { ...s.presence, [userId]: status },
    }));
  },

  setBulkPresence: (entries) => {
    set((s) => ({
      presence: { ...s.presence, ...entries },
    }));
  },

  loadPresenceForHub: async (hubId) => {
    try {
      const members = await api.getHubMembers(hubId);
      const entries: Record<string, number> = {};
      const memberMap: Record<string, User> = {};
      for (const m of members) {
        entries[m.id] = m.status;
        memberMap[m.id] = m;
      }
      set((s) => ({
        presence: { ...s.presence, ...entries },
        hubMembers: { ...s.hubMembers, ...memberMap },
      }));
    } catch {
      // Silently fail — presence is best-effort
    }
  },

  loadNotifications: async () => {
    try {
      const fetched = await api.getNotifications();
      // Merge: keep any WS-delivered notifications not yet in the API response
      set((s) => {
        const fetchedIds = new Set(fetched.map((n) => n.id));
        // Preserve WS-delivered notifications that the API hasn't returned yet
        const wsOnly = s.notifications.filter((n) => !fetchedIds.has(n.id));
        const merged = [...wsOnly, ...fetched];
        const unreadCount = merged.filter((n) => !n.read).length;
        return { notifications: merged, unreadCount };
      });
    } catch {
      // Silently fail
    }
  },

  addNotification: (notif) => {
    set((s) => {
      // Dedup by notification id
      if (s.notifications.some((n) => n.id === notif.id)) return s;
      // Ignore self-triggered notifications (defense in depth)
      const currentUserId = useAuthStore.getState().user?.id;
      if (notif.actor_id && notif.actor_id === currentUserId) return s;
      return {
        notifications: [notif, ...s.notifications],
        unreadCount: s.unreadCount + (notif.read ? 0 : 1),
      };
    });
  },

  markNotifRead: async (notifId) => {
    try {
      await api.markNotificationRead(notifId);
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === notifId ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch {
      // Keep state unchanged on failure
    }
  },

  markAllNotifsRead: async () => {
    try {
      await api.markAllNotificationsRead();
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch {
      // Keep state unchanged on failure
    }
  },

  loadConversations: async () => {
    try {
      const [conversations, dmStates] = await Promise.all([
        api.getDMs(),
        api.getDMReadStates().catch(() => []),
      ]);
      // Merge unread counts into conversations
      const stateMap = new Map(dmStates.map((s) => [s.conversation_id, s.unread_count]));
      const merged = conversations.map((c) => ({
        ...c,
        unread_count: stateMap.get(c.id) ?? 0,
      }));
      set({ conversations: merged, dmTotalUnread: sumDmUnreads(merged) });
    } catch {
      // Silently fail
    }
  },

  openDM: async (recipientId) => {
    const conv = await api.createOrOpenDM(recipientId);
    // Add to conversations list if not already there
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conv.id);
      return {
        conversations: exists ? s.conversations : [conv, ...s.conversations],
      };
    });
    await get().setActiveConversation(conv.id);
  },

  setActiveConversation: async (convId) => {
    set({
      activeConversationId: convId,
      activeHubId: null,
      activeStreamId: null,
      messages: [],
      // Note: do NOT clear streams here — hub stream list should be unaffected
      dmMessages: [],
    });
    await get().loadDMMessages(convId);
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null, dmMessages: [] });
  },

  loadDMMessages: async (convId) => {
    set({ dmMessagesLoading: true });
    try {
      const fetched = await api.getDMMessages(convId);
      // Guard: discard if user switched conversations while loading
      set((s) => {
        if (s.activeConversationId !== convId) return { dmMessagesLoading: false };
        // Merge: keep any WS-delivered messages that arrived during the fetch
        const fetchedIds = new Set(fetched.map((m) => m.id));
        const wsOnly = s.dmMessages.filter((m) => !fetchedIds.has(m.id) && m.conversation_id === convId);
        const merged = [...fetched, ...wsOnly].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return { dmMessages: merged, dmMessagesLoading: false };
      });
    } catch {
      set({ dmMessagesLoading: false });
    }
  },

  sendDMMessage: async (content, attachmentIds) => {
    const convId = get().activeConversationId;
    if (!convId) return;
    await api.sendDMMessage(convId, content, attachmentIds);
  },

  addDMMessage: (message) => {
    set((s) => {
      const isActive = message.conversation_id === s.activeConversationId;

      // Update conversation sidebar: bump last_message, updated_at, and unread count
      const conversations = s.conversations.map((c) => {
        if (c.id !== message.conversation_id) return c;
        return {
          ...c,
          last_message: message,
          updated_at: message.created_at,
          // Increment unread only for non-active conversations
          unread_count: isActive ? 0 : (c.unread_count ?? 0) + 1,
        };
      }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const dmTotalUnread = sumDmUnreads(conversations);

      if (!isActive) {
        return { conversations, dmTotalUnread };
      }
      // Dedup by message id
      if (s.dmMessages.some((m) => m.id === message.id)) {
        return { conversations, dmTotalUnread };
      }
      return { dmMessages: [...s.dmMessages, message], conversations, dmTotalUnread };
    });
  },

  addConversation: (conv) => {
    set((s) => {
      if (s.conversations.some((c) => c.id === conv.id)) return s;
      const conversations = [{ ...conv, unread_count: 0 }, ...s.conversations];
      return { conversations, dmTotalUnread: sumDmUnreads(conversations) };
    });
  },

  ackDM: async (convId) => {
    const messages = get().dmMessages;
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    try {
      await api.ackDM(convId, lastMsg.id);
      set((s) => {
        const conversations = s.conversations.map((c) =>
          c.id === convId ? { ...c, unread_count: 0 } : c
        );
        return { conversations, dmTotalUnread: sumDmUnreads(conversations) };
      });
    } catch {
      // Keep state unchanged on failure
    }
  },

  loadReadStates: async (hubId) => {
    try {
      const states = await api.getReadStates(hubId);
      // Guard: discard if user switched hubs while loading
      if (get().activeHubId !== hubId) return;
      const unreads: Record<string, number> = {};
      const lastRead: Record<string, string> = {};
      for (const rs of states) {
        unreads[rs.stream_id] = rs.unread_count;
        if (rs.last_read_message_id) {
          lastRead[rs.stream_id] = rs.last_read_message_id;
        }
      }
      set({ streamUnreads: unreads, lastReadMessageIds: lastRead });
    } catch {
      // Silently fail
    }
  },

  ackStream: async (streamId) => {
    // Guard: only ack if we're still on the right stream
    if (get().activeStreamId !== streamId) return;
    const msgs = get().messages;
    if (msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    try {
      await api.ackStream(streamId, lastMsg.id);
      set((s) => ({
        streamUnreads: { ...s.streamUnreads, [streamId]: 0 },
        lastReadMessageIds: { ...s.lastReadMessageIds, [streamId]: lastMsg.id },
      }));
    } catch {
      // Silently fail
    }
  },

  incrementUnread: (streamId) => {
    set((s) => ({
      streamUnreads: {
        ...s.streamUnreads,
        [streamId]: (s.streamUnreads[streamId] || 0) + 1,
      },
    }));
  },

  toggleReaction: async (messageId, emoji) => {
    await api.addReaction(messageId, emoji);
  },

  applyReactionAdd: (messageId, userId, emoji) => {
    const updater = (msgs: Message[]) =>
      msgs.map((m) => {
        if (m.id !== messageId) return m;
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
      });
    set((s) => {
      const inStream = s.messages.some((m) => m.id === messageId);
      return inStream
        ? { messages: updater(s.messages) }
        : { dmMessages: updater(s.dmMessages) };
    });
  },

  applyReactionRemove: (messageId, userId, emoji) => {
    const updater = (msgs: Message[]) =>
      msgs.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions || [])
          .map((r) => {
            if (r.emoji !== emoji) return r;
            const users = r.users.filter((u) => u !== userId);
            return { ...r, count: users.length, users };
          })
          .filter((r) => r.count > 0);
        return { ...m, reactions };
      });
    set((s) => {
      const inStream = s.messages.some((m) => m.id === messageId);
      return inStream
        ? { messages: updater(s.messages) }
        : { dmMessages: updater(s.dmMessages) };
    });
  },
}));
