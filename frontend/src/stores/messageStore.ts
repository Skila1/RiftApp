import { create } from 'zustand';
import type { Message } from '../types';
import { api } from '../api/client';
import { useStreamStore } from './streamStore';

interface MessageState {
  messages: Message[];
  messagesLoading: boolean;

  loadMessages: (streamId: string) => Promise<void>;
  sendMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  deleteMessage: (messageId: string) => Promise<void>;
  clearMessages: () => void;

  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  applyReactionAdd: (messageId: string, userId: string, emoji: string, isDM?: boolean) => void;
  applyReactionRemove: (messageId: string, userId: string, emoji: string, isDM?: boolean) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  messagesLoading: false,

  loadMessages: async (streamId) => {
    set({ messagesLoading: true });
    try {
      const messages = await api.getMessages(streamId);
      set(() => {
        if (useStreamStore.getState().activeStreamId !== streamId) return { messagesLoading: false };
        return { messages, messagesLoading: false };
      });
    } catch {
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (content, attachmentIds) => {
    const streamId = useStreamStore.getState().activeStreamId;
    if (!streamId) return;
    const msg = await api.sendMessage(streamId, content, attachmentIds);
    get().addMessage(msg);
  },

  addMessage: (message) => {
    set((s) => {
      if (message.stream_id === useStreamStore.getState().activeStreamId) {
        if (s.messages.some((m) => m.id === message.id)) return s;
        return { messages: [...s.messages, message] };
      }
      if (message.stream_id) {
        useStreamStore.getState().incrementUnread(message.stream_id);
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

  deleteMessage: async (messageId) => {
    await api.deleteMessage(messageId);
    get().removeMessage(messageId);
  },

  clearMessages: () => set({ messages: [], messagesLoading: false }),

  toggleReaction: async (messageId, emoji) => {
    await api.addReaction(messageId, emoji);
  },

  applyReactionAdd: (messageId, userId, emoji, isDM = false) => {
    if (isDM) return;
    set((s) => ({
      messages: s.messages.map((m) => {
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

  applyReactionRemove: (messageId, userId, emoji, isDM = false) => {
    if (isDM) return;
    set((s) => ({
      messages: s.messages.map((m) => {
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
