import { create } from 'zustand';
import type { Hub } from '../types';
import { api } from '../api/client';

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
    const hubs = await api.getHubs();
    set({ hubs });
  },

  setActiveHub: async (hubId) => {
    const { useStreamStore } = await import('./streamStore');
    const { useMessageStore } = await import('./messageStore');
    const { useDMStore } = await import('./dmStore');
    const { usePresenceStore } = await import('./presenceStore');

    // Drop previous hub's channels immediately so we never show hub A's list while hub B is selected.
    useStreamStore.getState().clearStreams();
    useMessageStore.getState().clearMessages();
    set({ activeHubId: hubId });
    useDMStore.getState().clearActive();

    await Promise.all([
      useStreamStore.getState().loadStreams(hubId),
      usePresenceStore.getState().loadPresenceForHub(hubId),
      useStreamStore.getState().loadReadStates(hubId),
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

  clearActive: () => {
    set({ activeHubId: null });
  },
}));
