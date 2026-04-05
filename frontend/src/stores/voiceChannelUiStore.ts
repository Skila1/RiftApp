import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Per voice channel: hide participant display names (Discord-style). */
interface VoiceChannelUiState {
  hideNamesByStream: Record<string, boolean>;
  toggleHideNames: (streamId: string) => void;
}

export const useVoiceChannelUiStore = create(
  persist<VoiceChannelUiState>(
    (set, get) => ({
      hideNamesByStream: {},
      toggleHideNames: (streamId) => {
        const cur = get().hideNamesByStream[streamId] ?? false;
        set({
          hideNamesByStream: { ...get().hideNamesByStream, [streamId]: !cur },
        });
      },
    }),
    { name: 'riftapp-vc-ui' },
  ),
);
