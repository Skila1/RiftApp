import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

const voiceChannelUiFallbackStorage = new Map<string, string>();

const voiceChannelUiStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window !== 'undefined' && typeof window.localStorage?.getItem === 'function') {
      try {
        return window.localStorage.getItem(name);
      } catch {
        /* fall back to memory */
      }
    }
    return voiceChannelUiFallbackStorage.get(name) ?? null;
  },
  setItem: (name, value) => {
    voiceChannelUiFallbackStorage.set(name, value);
    if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        /* keep in-memory copy only */
      }
    }
  },
  removeItem: (name) => {
    voiceChannelUiFallbackStorage.delete(name);
    if (typeof window !== 'undefined' && typeof window.localStorage?.removeItem === 'function') {
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* fallback storage already cleared */
      }
    }
  },
};

interface VoiceChannelUiState {
  isOpen: boolean;
  activeChannelId: string | null;
  hideNamesByStream: Record<string, boolean>;
  setActiveChannel: (streamId: string | null) => void;
  openVoiceView: (streamId: string) => void;
  closeVoiceView: () => void;
  resetVoiceView: () => void;
  toggleHideNames: (streamId: string) => void;
}

type PersistedVoiceChannelUiState = Pick<VoiceChannelUiState, 'hideNamesByStream'>;

export const useVoiceChannelUiStore = create<VoiceChannelUiState>()(
  persist<VoiceChannelUiState, [], [], PersistedVoiceChannelUiState>(
    (set, get) => ({
      isOpen: false,
      activeChannelId: null,
      hideNamesByStream: {},
      setActiveChannel: (streamId) => {
        if (!streamId) {
          set({ activeChannelId: null, isOpen: false });
          return;
        }
        set({ activeChannelId: streamId });
      },
      openVoiceView: (streamId) => {
        set({ activeChannelId: streamId, isOpen: true });
      },
      closeVoiceView: () => {
        set({ isOpen: false });
      },
      resetVoiceView: () => {
        set({ isOpen: false, activeChannelId: null });
      },
      toggleHideNames: (streamId) => {
        const cur = get().hideNamesByStream[streamId] ?? false;
        set({
          hideNamesByStream: { ...get().hideNamesByStream, [streamId]: !cur },
        });
      },
    }),
    {
      name: 'riftapp-vc-ui',
      storage: createJSONStorage(() => voiceChannelUiStorage),
      partialize: (state) => ({ hideNamesByStream: state.hideNamesByStream }),
    },
  ),
);
