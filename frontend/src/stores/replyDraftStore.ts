import { create } from 'zustand';
import type { Message } from '../types';

interface ReplyDraftState {
  replyTo: Message | null;
  setReplyTo: (message: Message | null) => void;
}

export const useReplyDraftStore = create<ReplyDraftState>((set) => ({
  replyTo: null,
  setReplyTo: (message) => set({ replyTo: message }),
}));
