import { create } from 'zustand';
import type { Message, Conversation } from '../types';
import { api } from '../api/client';

const sumDmUnreads = (conversations: Conversation[]) =>
  conversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0);

interface DMState {
  conversations: Conversation[];
  activeConversationId: string | null;
  dmMessages: Message[];
  dmMessagesLoading: boolean;
  dmTotalUnread: number;

  loadConversations: () => Promise<void>;
  openDM: (recipientId: string) => Promise<void>;
  setActiveConversation: (convId: string) => Promise<void>;
  clearActive: () => void;
  loadDMMessages: (convId: string) => Promise<void>;
  sendDMMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  addDMMessage: (message: Message) => void;
  removeDMMessage: (messageId: string) => void;
  deleteDMMessage: (messageId: string) => Promise<void>;
  editDMMessage: (messageId: string, content: string) => Promise<void>;
  addConversation: (conv: Conversation) => void;
  ackDM: (convId: string) => Promise<void>;
  readStates: () => Promise<void>;

  applyReactionAdd: (messageId: string, userId: string, emoji: string) => void;
  applyReactionRemove: (messageId: string, userId: string, emoji: string) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  dmMessages: [],
  dmMessagesLoading: false,
  dmTotalUnread: 0,

  loadConversations: async () => {
    try {
      const [conversations, dmStates] = await Promise.all([
        api.getDMs(),
        api.getDMReadStates().catch(() => []),
      ]);
      const stateMap = new Map(dmStates.map((s) => [s.conversation_id, s.unread_count]));
      const merged = conversations.map((c) => ({
        ...c,
        unread_count: stateMap.get(c.id) ?? 0,
      }));
      set({ conversations: merged, dmTotalUnread: sumDmUnreads(merged) });
    } catch {}
  },

  openDM: async (recipientId) => {
    const conv = await api.createOrOpenDM(recipientId);
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conv.id);
      return {
        conversations: exists ? s.conversations : [conv, ...s.conversations],
      };
    });
    await get().setActiveConversation(conv.id);
  },

  setActiveConversation: async (convId) => {
    const { useHubStore } = await import('./hubStore');
    const { useStreamStore } = await import('./streamStore');
    const { useMessageStore } = await import('./messageStore');

    useHubStore.getState().clearActive();
    useStreamStore.getState().clearStreams();
    useMessageStore.getState().clearMessages();

    set({ activeConversationId: convId, dmMessages: [] });
    await get().loadDMMessages(convId);
  },

  clearActive: () => {
    set({ activeConversationId: null, dmMessages: [] });
  },

  loadDMMessages: async (convId) => {
    set({ dmMessagesLoading: true });
    try {
      const fetched = await api.getDMMessages(convId);
      set((s) => {
        if (s.activeConversationId !== convId) return { dmMessagesLoading: false };
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
    const msg = await api.sendDMMessage(convId, content, attachmentIds);
    get().addDMMessage(msg);
  },

  addDMMessage: (message) => {
    set((s) => {
      const convExists = s.conversations.some((c) => c.id === message.conversation_id);
      if (!convExists) {
        void get().loadConversations();
      }

      const isActive = message.conversation_id === s.activeConversationId;

      const conversations = s.conversations.map((c) => {
        if (c.id !== message.conversation_id) return c;
        return {
          ...c,
          last_message: message,
          updated_at: message.created_at,
          unread_count: isActive ? 0 : (c.unread_count ?? 0) + 1,
        };
      }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const dmTotalUnread = sumDmUnreads(conversations);

      if (!isActive) {
        return { conversations, dmTotalUnread };
      }
      if (s.dmMessages.some((m) => m.id === message.id)) {
        return { conversations, dmTotalUnread };
      }
      return { dmMessages: [...s.dmMessages, message], conversations, dmTotalUnread };
    });
  },

  removeDMMessage: (messageId) => {
    set((s) => ({
      dmMessages: s.dmMessages.filter((m) => m.id !== messageId),
    }));
  },

  deleteDMMessage: async (messageId) => {
    await api.deleteMessage(messageId);
    get().removeDMMessage(messageId);
  },

  editDMMessage: async (messageId, content) => {
    const msg = await api.editMessage(messageId, content);
    set((s) => ({
      dmMessages: s.dmMessages.map((m) => (m.id === messageId ? msg : m)),
    }));
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
    } catch {}
  },

  readStates: async () => {
    try {
      const states = await api.getDMReadStates();
      set((s) => {
        const stateMap = new Map(states.map((st) => [st.conversation_id, st.unread_count]));
        const conversations = s.conversations.map((c) => ({
          ...c,
          unread_count: stateMap.get(c.id) ?? c.unread_count ?? 0,
        }));
        return { conversations, dmTotalUnread: sumDmUnreads(conversations) };
      });
    } catch {}
  },

  applyReactionAdd: (messageId, userId, emoji) => {
    set((s) => ({
      dmMessages: s.dmMessages.map((m) => {
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
      }),
    }));
  },

  applyReactionRemove: (messageId, userId, emoji) => {
    set((s) => ({
      dmMessages: s.dmMessages.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions || [])
          .map((r) => {
            if (r.emoji !== emoji) return r;
            const users = r.users.filter((u) => u !== userId);
            return { ...r, count: users.length, users };
          })
          .filter((r) => r.count > 0);
        return { ...m, reactions };
      }),
    }));
  },
}));
