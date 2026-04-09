import { create } from 'zustand';
import type { Message, Conversation, User } from '../types';
import { api } from '../api/client';
import { normalizeConversation, normalizeMessage, normalizeMessages, normalizeUser } from '../utils/entityAssets';
import { useAuthStore } from './auth';
import { useHubStore } from './hubStore';
import { useMessageStore } from './messageStore';
import { useStreamStore } from './streamStore';
import { useVoiceChannelUiStore } from './voiceChannelUiStore';

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
  loadDMMessages: (convId: string, opts?: { silent?: boolean }) => Promise<void>;
  ensureMessageLoaded: (convId: string, messageId: string) => Promise<boolean>;
  sendDMMessage: (content: string, attachmentIds?: string[], replyToMessageId?: string) => Promise<void>;
  addDMMessage: (message: Message) => void;
  removeDMMessage: (messageId: string) => void;
  deleteDMMessage: (messageId: string) => Promise<void>;
  editDMMessage: (messageId: string, content: string) => Promise<void>;
  addConversation: (conv: Conversation) => void;
  ackDM: (convId: string) => Promise<void>;
  readStates: () => Promise<void>;
  patchUser: (user: User) => void;

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
      const normalized = conversations.map(normalizeConversation);
      const stateMap = new Map(dmStates.map((s) => [s.conversation_id, s.unread_count]));
      const merged = normalized.map((c) => ({
        ...c,
        unread_count: stateMap.get(c.id) ?? 0,
      }));
      set({ conversations: merged, dmTotalUnread: sumDmUnreads(merged) });
    } catch {}
  },

  openDM: async (recipientId) => {
    const conv = normalizeConversation(await api.createOrOpenDM(recipientId));
    set((s) => {
      const exists = s.conversations.some((c) => c.id === conv.id);
      return {
        conversations: exists ? s.conversations : [conv, ...s.conversations],
      };
    });
    await get().setActiveConversation(conv.id);
  },

  setActiveConversation: async (convId) => {
    useHubStore.getState().clearActive();
    useStreamStore.getState().clearStreams();
    useMessageStore.getState().clearMessages();

    set({ activeConversationId: convId, dmMessages: [] });
    await get().loadDMMessages(convId);
  },

  clearActive: () => {
    useVoiceChannelUiStore.getState().closeVoiceView();
    set({ activeConversationId: null, dmMessages: [] });
  },

  loadDMMessages: async (convId, opts) => {
    const currentState = get();
    const hasVisibleMessages = currentState.activeConversationId === convId
      && currentState.dmMessages.some((message) => message.conversation_id === convId);

    set({ dmMessagesLoading: !(opts?.silent === true && hasVisibleMessages) });
    try {
      const fetched = normalizeMessages(await api.getDMMessages(convId));
      set((s) => {
        if (s.activeConversationId !== convId) return { dmMessagesLoading: false };
        const mergedMap = new Map<string, Message>();
        for (const message of s.dmMessages.filter((m) => m.conversation_id === convId)) {
          mergedMap.set(message.id, message);
        }
        for (const message of fetched) {
          mergedMap.set(message.id, message);
        }
        const merged = [...mergedMap.values()].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return { dmMessages: merged, dmMessagesLoading: false };
      });
    } catch {
      set({ dmMessagesLoading: false });
    }
  },

  ensureMessageLoaded: async (convId, messageId) => {
    const isActiveConversation = () => get().activeConversationId === convId;
    let loaded = isActiveConversation() ? [...get().dmMessages] : [];

    if (isActiveConversation()) {
      set({ dmMessagesLoading: true });
    }

    try {
      if (loaded.length === 0) {
        loaded = normalizeMessages(await api.getDMMessages(convId, undefined, 100)).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      }

      let before = loaded[0]?.id;
      while (!loaded.some((message) => message.id === messageId)) {
        if (!before) break;
        const older = normalizeMessages(await api.getDMMessages(convId, before, 100));
        if (older.length === 0) break;
        const merged = normalizeMessages([...loaded, ...older]);
        if (merged.length === loaded.length) break;
        loaded = merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        before = loaded[0]?.id;
      }

      const found = loaded.some((message) => message.id === messageId);
      if (isActiveConversation()) {
        set({ dmMessages: loaded, dmMessagesLoading: false });
      }
      return found;
    } catch {
      if (isActiveConversation()) {
        set({ dmMessagesLoading: false });
      }
      return false;
    }
  },

  sendDMMessage: async (content, attachmentIds, replyToMessageId) => {
    const convId = get().activeConversationId;
    if (!convId) return;
    const msg = await api.sendDMMessage(convId, content, attachmentIds, replyToMessageId);
    get().addDMMessage(msg);
  },

  addDMMessage: (message) => {
    const nextMessage = normalizeMessage(message);
    const currentUserId = useAuthStore.getState().user?.id;
    set((s) => {
      const convExists = s.conversations.some((c) => c.id === nextMessage.conversation_id);
      if (!convExists) {
        void get().loadConversations();
      }

      const isActive = nextMessage.conversation_id === s.activeConversationId;
	  const alreadyKnown = s.dmMessages.some((m) => m.id === nextMessage.id);
      const isOwn = nextMessage.author_id === currentUserId;

      const conversations = s.conversations.map((c) => {
        if (c.id !== nextMessage.conversation_id) return c;
        return {
          ...c,
          last_message: nextMessage,
          updated_at: nextMessage.created_at,
		  unread_count: isActive || alreadyKnown || isOwn ? 0 : (c.unread_count ?? 0) + 1,
        };
      }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const dmTotalUnread = sumDmUnreads(conversations);

      if (!isActive) {
        return { conversations, dmTotalUnread };
      }
      if (alreadyKnown) {
        return { conversations, dmTotalUnread };
      }
      return { dmMessages: [...s.dmMessages, nextMessage], conversations, dmTotalUnread };
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
    const msg = normalizeMessage(await api.editMessage(messageId, content));
    set((s) => ({
      dmMessages: s.dmMessages.map((m) => (m.id === messageId ? msg : m)),
    }));
  },

  addConversation: (conv) => {
    const nextConversation = normalizeConversation(conv);
    set((s) => {
      if (s.conversations.some((c) => c.id === nextConversation.id)) return s;
      const conversations = [{ ...nextConversation, unread_count: 0 }, ...s.conversations];
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

  patchUser: (user) => {
    const nextUser = normalizeUser(user);
    const patchMessage = (message: Message) => {
      let nextMessage = message;
      if (message.author?.id === nextUser.id) {
        nextMessage = { ...nextMessage, author: { ...message.author, ...nextUser } };
      }
      if (message.reply_to?.author?.id === nextUser.id) {
        nextMessage = {
          ...nextMessage,
          reply_to: {
            ...message.reply_to,
            author: { ...message.reply_to.author, ...nextUser },
          },
        };
      }
      return nextMessage;
    };
    set((s) => ({
      conversations: s.conversations.map((conversation) => ({
        ...conversation,
        recipient: conversation.recipient.id === nextUser.id
          ? { ...conversation.recipient, ...nextUser }
          : conversation.recipient,
        last_message: conversation.last_message ? patchMessage(conversation.last_message) : conversation.last_message,
      })),
      dmMessages: s.dmMessages.map(patchMessage),
    }));
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
