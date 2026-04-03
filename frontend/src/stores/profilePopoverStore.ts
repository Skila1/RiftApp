import { create } from 'zustand';
import type { User } from '../types';

interface ProfilePopoverState {
  user: User | null;
  anchorRect: DOMRect | null;
  open: (user: User, anchorRect: DOMRect) => void;
  close: () => void;
}

export const useProfilePopoverStore = create<ProfilePopoverState>((set) => ({
  user: null,
  anchorRect: null,
  open: (user, anchorRect) => set({ user, anchorRect }),
  close: () => set({ user: null, anchorRect: null }),
}));
