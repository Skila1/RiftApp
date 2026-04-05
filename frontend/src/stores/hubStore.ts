import { create } from 'zustand';
import type { Hub } from '../types';
import { api } from '../api/client';

/** Ignore stale `loadHubs` responses when multiple loads overlap (e.g. Strict Mode, refocus). */
let loadHubsRequestId = 0;

interface HubState {
  hubs: Hub[];
  activeHubId: string | null;

  loadHubs: () => Promise<void>;
  setActiveHub: (hubId: string) => Promise<void>;
  createHub: (name: string) => Promise<Hub>;
  updateHub: (hubId: string, data: { name?: string; icon_url?: string }) => Promise<Hub>;
  clearActive: () => void;
}

export const useHubStore = create<HubState>((set) => ({
  hubs: [],
  activeHubId: null,

  loadHubs: async () => {
    const myId = ++loadHubsRequestId;
    try {
      const hubs = await api.getHubs();
      if (myId !== loadHubsRequestId) return;
      if (!Array.isArray(hubs)) return;
      set({ hubs });
    } catch {
      if (myId !== loadHubsRequestId) return;
      // Never wipe the server list on transient errors / rate limits.
    }
  },

  setActiveHub: async (hubId) => {
    const { useStreamStore } = await import('./streamStore');
    const { useMessageStore } = await import('./messageStore');
    const { useDMStore } = await import('./dmStore');
    const { usePresenceStore } = await import('./presenceStore');

    useMessageStore.getState().clearMessages();
    set({ activeHubId: hubId });
    useDMStore.getState().clearActive();

    // Show cached channels for this hub immediately (or clear if unknown) — avoids empty UI and cuts API spam.
    useStreamStore.getState().applyHubLayoutOrClear(hubId);

    try {
      await Promise.all([
        useStreamStore.getState().loadStreams(hubId),
        usePresenceStore.getState().loadPresenceForHub(hubId),
        useStreamStore.getState().loadReadStates(hubId),
      ]);
    } catch {
      // Streams may still be visible from cache; avoid throwing to click handlers.
    }
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

  clearActive: () => {
    set({ activeHubId: null });
  },
}));
