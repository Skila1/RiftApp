import { create } from 'zustand';
import type { User } from '../types';

interface ProfilePopoverState {
  user: User | null;
  anchorRect: DOMRect | null;
  modalUser: User | null;
  open: (user: User, anchorRect: DOMRect) => void;
  openModal: (user: User) => void;
  close: () => void;
  closeModal: () => void;
}

export const useProfilePopoverStore = create<ProfilePopoverState>((set) => ({
  user: null,
  anchorRect: null,
  modalUser: null,
  open: (user, anchorRect) => set({ user, anchorRect }),
  openModal: (modalUser) => set({ modalUser, user: null, anchorRect: null }),
  close: () => set({ user: null, anchorRect: null }),
  closeModal: () => set({ modalUser: null }),
}));
