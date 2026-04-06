import { create } from 'zustand';
import type { Hub } from '../types';
import { api } from '../api/client';
import { normalizeHub, normalizeHubs } from '../utils/entityAssets';
import { useVoiceChannelUiStore } from './voiceChannelUiStore';

/** Session-scoped hub list for instant paint after refresh (revalidated against API). */
export const HUBS_SESSION_STORAGE_KEY = 'riftapp.session.hubs.v1';

/** Ignore stale `loadHubs` responses when multiple loads overlap (e.g. Strict Mode, refocus). */
let loadHubsRequestId = 0;

interface HubState {
  hubs: Hub[];
  activeHubId: string | null;
  hubPermissions: Record<string, number>;

  loadHubs: () => Promise<void>;
  setActiveHub: (hubId: string) => Promise<void>;
  loadHubPermissions: (hubId: string) => Promise<void>;
  createHub: (name: string) => Promise<Hub>;
  updateHub: (hubId: string, data: { name?: string; icon_url?: string; banner_url?: string }) => Promise<Hub>;
  applyHubUpdate: (hub: Hub) => void;
  deleteHub: (hubId: string) => Promise<void>;
  leaveHub: (hubId: string) => Promise<void>;
  clearActive: () => void;
}

function persistHubs(hubs: Hub[]) {
  try {
    sessionStorage.setItem(HUBS_SESSION_STORAGE_KEY, JSON.stringify({ hubs }));
  } catch {
    /* quota / private mode */
  }
}

export const useHubStore = create<HubState>((set, get) => ({
  hubs: [],
  activeHubId: null,
  hubPermissions: {},

  loadHubs: async () => {
    const myId = ++loadHubsRequestId;
    try {
      const raw = sessionStorage.getItem(HUBS_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { hubs?: unknown };
        if (Array.isArray(parsed.hubs) && parsed.hubs.length > 0) {
          set({ hubs: normalizeHubs(parsed.hubs as Hub[]) });
        }
      }
    } catch {
      /* ignore corrupt session cache */
    }

    try {
      const hubs = normalizeHubs(await api.getHubs());
      if (myId !== loadHubsRequestId) return;
      if (!Array.isArray(hubs)) return;
      set({ hubs });
      persistHubs(hubs);
    } catch {
      if (myId !== loadHubsRequestId) return;
      // Never wipe the server list on transient errors / rate limits.
    }
  },

  setActiveHub: async (hubId) => {
    const { useStreamStore } = await import('./streamStore');
    const { useDMStore } = await import('./dmStore');
    const { usePresenceStore } = await import('./presenceStore');
    const { useEmojiStore } = await import('./emojiStore');

    set({ activeHubId: hubId });
    useDMStore.getState().clearActive();

    // Show cached channels for this hub immediately (or clear if unknown) — avoids empty UI and cuts API spam.
    useStreamStore.getState().applyHubLayoutOrClear(hubId);

    try {
      await Promise.all([
        useStreamStore.getState().loadStreams(hubId),
        usePresenceStore.getState().loadPresenceForHub(hubId),
        useStreamStore.getState().loadReadStates(hubId),
        useEmojiStore.getState().loadHubEmojis(hubId),
        get().loadHubPermissions(hubId),
      ]);
    } catch {
      // Streams may still be visible from cache; avoid throwing to click handlers.
    }
  },

  loadHubPermissions: async (hubId) => {
    try {
      const data = await api.getHubPermissions(hubId);
      set((s) => ({
        hubPermissions: {
          ...s.hubPermissions,
          [hubId]: data.permissions,
        },
      }));
    } catch {
      // Ignore permission fetch failures to avoid blocking hub open.
    }
  },

  createHub: async (name) => {
    const hub = normalizeHub(await api.createHub(name));
    set((s) => {
      const hubs = [...s.hubs, hub];
      persistHubs(hubs);
      return { hubs };
    });
    return hub;
  },

  updateHub: async (hubId, data) => {
    const hub = normalizeHub(await api.updateHub(hubId, data));
    set((s) => {
      const hubs = s.hubs.map((h) => (h.id === hubId ? hub : h));
      persistHubs(hubs);
      return { hubs };
    });
    return hub;
  },

  applyHubUpdate: (hub) => {
    const nextHub = normalizeHub(hub);
    set((s) => {
      const exists = s.hubs.some((item) => item.id === nextHub.id);
      const hubs = exists
        ? s.hubs.map((item) => (item.id === nextHub.id ? nextHub : item))
        : [...s.hubs, nextHub];
      persistHubs(hubs);
      return { hubs };
    });
  },

  deleteHub: async (hubId) => {
    const { useStreamStore } = await import('./streamStore');
    const { useMessageStore } = await import('./messageStore');
    const { usePresenceStore } = await import('./presenceStore');
    const { useVoiceStore } = await import('./voiceStore');

    const streamState = useStreamStore.getState();
    const streamIds = Object.entries(streamState.streamHubMap)
      .filter(([, h]) => h === hubId)
      .map(([id]) => id);

    const voiceStreamId = useVoiceStore.getState().streamId;
    if (voiceStreamId && streamIds.includes(voiceStreamId)) {
      useVoiceStore.getState().leave();
    }

    await api.deleteHub(hubId);

    for (const sid of streamIds) {
      useMessageStore.getState().removeStreamCache(sid);
    }

    useStreamStore.setState((s) => {
      const streamHubMap = { ...s.streamHubMap };
      const streamUnreads = { ...s.streamUnreads };
      const lastReadMessageIds = { ...s.lastReadMessageIds };
      const voiceMembers = { ...s.voiceMembers };
      for (const sid of streamIds) {
        delete streamHubMap[sid];
        delete streamUnreads[sid];
        delete lastReadMessageIds[sid];
        delete voiceMembers[sid];
      }
      const hubLayoutCache = { ...s.hubLayoutCache };
      delete hubLayoutCache[hubId];
      return { streamHubMap, streamUnreads, lastReadMessageIds, voiceMembers, hubLayoutCache };
    });

    const wasActive = get().activeHubId === hubId;

    set((s) => {
      const hubs = s.hubs.filter((h) => h.id !== hubId);
      const activeHubId = s.activeHubId === hubId ? hubs[0]?.id ?? null : s.activeHubId;
      persistHubs(hubs);
      return { hubs, activeHubId };
    });

    if (wasActive) {
      const nextId = get().activeHubId;
      if (nextId) {
        await get().setActiveHub(nextId);
      } else {
        useStreamStore.getState().clearStreams();
        useMessageStore.getState().clearMessages();
        usePresenceStore.setState({ hubMembers: {} });
      }
    }
  },

  clearActive: () => {
    useVoiceChannelUiStore.getState().closeVoiceView();
    set({ activeHubId: null });
  },

  leaveHub: async (hubId) => {
    const { useStreamStore } = await import('./streamStore');
    const { useMessageStore } = await import('./messageStore');
    const { usePresenceStore } = await import('./presenceStore');
    const { useVoiceStore } = await import('./voiceStore');

    const streamState = useStreamStore.getState();
    const streamIds = Object.entries(streamState.streamHubMap)
      .filter(([, h]) => h === hubId)
      .map(([id]) => id);

    const voiceStreamId = useVoiceStore.getState().streamId;
    if (voiceStreamId && streamIds.includes(voiceStreamId)) {
      useVoiceStore.getState().leave();
    }

    await api.leaveHub(hubId);

    for (const sid of streamIds) {
      useMessageStore.getState().removeStreamCache(sid);
    }

    useStreamStore.setState((s) => {
      const streamHubMap = { ...s.streamHubMap };
      const streamUnreads = { ...s.streamUnreads };
      const lastReadMessageIds = { ...s.lastReadMessageIds };
      const voiceMembers = { ...s.voiceMembers };
      for (const sid of streamIds) {
        delete streamHubMap[sid];
        delete streamUnreads[sid];
        delete lastReadMessageIds[sid];
        delete voiceMembers[sid];
      }
      const hubLayoutCache = { ...s.hubLayoutCache };
      delete hubLayoutCache[hubId];
      return { streamHubMap, streamUnreads, lastReadMessageIds, voiceMembers, hubLayoutCache };
    });

    const wasActive = get().activeHubId === hubId;

    set((s) => {
      const hubs = s.hubs.filter((h) => h.id !== hubId);
      const activeHubId = s.activeHubId === hubId ? hubs[0]?.id ?? null : s.activeHubId;
      persistHubs(hubs);
      return { hubs, activeHubId };
    });

    if (wasActive) {
      const nextId = get().activeHubId;
      if (nextId) {
        await get().setActiveHub(nextId);
      } else {
        useStreamStore.getState().clearStreams();
        useMessageStore.getState().clearMessages();
        usePresenceStore.setState({ hubMembers: {} });
      }
    }
  },
}));
