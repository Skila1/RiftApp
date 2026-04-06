import { create } from 'zustand';
import type { User } from '../types';
import { api } from '../api/client';
import { normalizeUser, normalizeUsers } from '../utils/entityAssets';

interface PresenceState {
  presence: Record<string, number>;
  hubMembers: Record<string, User>;
  typers: Record<string, Set<string>>;

  setPresence: (userId: string, status: number) => void;
  setBulkPresence: (entries: Record<string, number>) => void;
  loadPresenceForHub: (hubId: string) => Promise<void>;
  mergeUser: (user: User) => void;

  addTyper: (streamId: string, userId: string) => void;
  removeTyper: (streamId: string, userId: string) => void;
  clearTypers: (streamId: string) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  presence: {},
  hubMembers: {},
  typers: {},

  setPresence: (userId, status) => {
    set((s) => {
      if (s.presence[userId] === status) return s;
      return { presence: { ...s.presence, [userId]: status } };
    });
  },

  setBulkPresence: (entries) => {
    set((s) => ({
      presence: { ...s.presence, ...entries },
    }));
  },

  loadPresenceForHub: async (hubId) => {
    try {
      const members = normalizeUsers(await api.getHubMembers(hubId));
      const entries: Record<string, number> = {};
      const memberMap: Record<string, User> = {};
      for (const m of members) {
        entries[m.id] = m.status;
        memberMap[m.id] = m;
      }
      set((s) => ({
        presence: { ...s.presence, ...entries },
        hubMembers: memberMap,
      }));
    } catch {}
  },

  mergeUser: (user) => {
    const nextUser = normalizeUser(user);
    set((s) => ({
      presence: s.presence[nextUser.id] === nextUser.status
        ? s.presence
        : { ...s.presence, [nextUser.id]: nextUser.status },
      hubMembers: { ...s.hubMembers, [nextUser.id]: s.hubMembers[nextUser.id] ? { ...s.hubMembers[nextUser.id], ...nextUser } : nextUser },
    }));
  },

  addTyper: (streamId, userId) => {
    set((s) => {
      const current = new Set(s.typers[streamId]);
      current.add(userId);
      return { typers: { ...s.typers, [streamId]: current } };
    });
  },

  removeTyper: (streamId, userId) => {
    set((s) => {
      const current = new Set(s.typers[streamId]);
      current.delete(userId);
      return { typers: { ...s.typers, [streamId]: current } };
    });
  },

  clearTypers: (streamId) => {
    set((s) => {
      const next = { ...s.typers };
      delete next[streamId];
      return { typers: next };
    });
  },
}));
