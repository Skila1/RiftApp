import { create } from 'zustand';
import type { User } from '../types';
import { api } from '../api/client';
import { normalizeUser, normalizeUsers } from '../utils/entityAssets';
import {
  clearPersistedSelfPresence,
  getPersistedSelfPresence,
  persistSelfPresence,
  resolveInitialSelfPresenceStatus,
} from './selfPresencePersistence';

let loadPresenceForHubRequestId = 0;
let presenceSessionToken = 0;
const pendingPresenceUserFetches = new Map<string, Promise<User | null>>();

function resolveSelfPresenceStatus(
  selfUserId: string | null,
  presence: Record<string, number>,
  userId: string,
  incomingStatus: number,
) {
  const persistedStatus = getPersistedSelfPresence(userId);
  if (persistedStatus !== null) {
    return persistedStatus;
  }

  if (selfUserId === userId) {
    const currentStatus = presence[userId];
    if (typeof currentStatus === 'number') {
      return currentStatus;
    }
    return resolveInitialSelfPresenceStatus(userId, incomingStatus);
  }

  return incomingStatus;
}

interface PresenceState {
  selfUserId: string | null;
  presence: Record<string, number>;
  usersById: Record<string, User>;
  hubMembers: Record<string, User>;
  typers: Record<string, Set<string>>;

  setPresence: (userId: string, status: number) => void;
  setSelfPresence: (userId: string, status: number) => void;
  hydrateSelfPresence: (userId: string, fallbackStatus?: number) => number;
  clearSelfPresence: (userId?: string) => void;
  setBulkPresence: (entries: Record<string, number>) => void;
  loadPresenceForHub: (hubId: string) => Promise<void>;
  mergeUser: (user: User) => void;
  clearSessionCaches: () => void;

  addTyper: (streamId: string, userId: string) => void;
  removeTyper: (streamId: string, userId: string) => void;
  clearTypers: (streamId: string) => void;
}

function patchCachedUserStatus(users: Record<string, User>, userId: string, status: number) {
  const existingUser = users[userId];
  if (!existingUser || existingUser.status === status) {
    return users;
  }

  return {
    ...users,
    [userId]: { ...existingUser, status },
  };
}

function mergeCachedUser(existingUser: User | undefined, nextUser: User, status: number) {
  if (!existingUser) {
    return { ...nextUser, status };
  }

  return {
    ...existingUser,
    ...nextUser,
    status,
  };
}

export const usePresenceStore = create<PresenceState>((set) => ({
  selfUserId: null,
  presence: {},
  usersById: {},
  hubMembers: {},
  typers: {},

  setPresence: (userId, status) => {
    set((s) => {
      if (s.presence[userId] === status) return s;
      return {
        presence: { ...s.presence, [userId]: status },
        usersById: patchCachedUserStatus(s.usersById, userId, status),
        hubMembers: patchCachedUserStatus(s.hubMembers, userId, status),
      };
    });
  },

  setSelfPresence: (userId, status) => {
    persistSelfPresence(userId, status);
    set((s) => ({
      selfUserId: userId,
      presence: s.presence[userId] === status ? s.presence : { ...s.presence, [userId]: status },
      usersById: patchCachedUserStatus(s.usersById, userId, status),
      hubMembers: patchCachedUserStatus(s.hubMembers, userId, status),
    }));
  },

  hydrateSelfPresence: (userId, fallbackStatus) => {
    const resolvedStatus = resolveInitialSelfPresenceStatus(userId, fallbackStatus);
    set((s) => ({
      selfUserId: userId,
      presence: s.presence[userId] === resolvedStatus ? s.presence : { ...s.presence, [userId]: resolvedStatus },
      usersById: patchCachedUserStatus(s.usersById, userId, resolvedStatus),
      hubMembers: patchCachedUserStatus(s.hubMembers, userId, resolvedStatus),
    }));
    return resolvedStatus;
  },

  clearSelfPresence: (userId) => {
    clearPersistedSelfPresence(userId);
    set((s) => {
      const targetUserId = userId ?? s.selfUserId;
      if (!targetUserId) {
        return { selfUserId: null };
      }
      const nextPresence = { ...s.presence };
      delete nextPresence[targetUserId];
      return {
        selfUserId: s.selfUserId === targetUserId ? null : s.selfUserId,
        presence: nextPresence,
      };
    });
  },

  setBulkPresence: (entries) => {
    set((s) => {
      let nextUsersById = s.usersById;
      let nextHubMembers = s.hubMembers;
      const nextPresence = Object.entries(entries).reduce<Record<string, number>>((acc, [userId, status]) => {
        const resolvedStatus = resolveSelfPresenceStatus(s.selfUserId, s.presence, userId, status);
        acc[userId] = resolvedStatus;
        nextUsersById = patchCachedUserStatus(nextUsersById, userId, resolvedStatus);
        nextHubMembers = patchCachedUserStatus(nextHubMembers, userId, resolvedStatus);
        return acc;
      }, { ...s.presence });

      return {
        presence: nextPresence,
        usersById: nextUsersById,
        hubMembers: nextHubMembers,
      };
    });
  },

  loadPresenceForHub: async (hubId) => {
    const requestId = ++loadPresenceForHubRequestId;
    const sessionToken = presenceSessionToken;
    try {
      const members = normalizeUsers(await api.getHubMembers(hubId));
      const entries: Record<string, number> = {};
      const memberMap: Record<string, User> = {};
      for (const m of members) {
        const status = resolveSelfPresenceStatus(usePresenceStore.getState().selfUserId, usePresenceStore.getState().presence, m.id, m.status);
        entries[m.id] = status;
        memberMap[m.id] = status === m.status ? m : { ...m, status };
      }
      set((s) => {
        if (sessionToken !== presenceSessionToken) {
          return s;
        }

        const nextUsersById = { ...s.usersById };
        for (const member of Object.values(memberMap)) {
          nextUsersById[member.id] = mergeCachedUser(nextUsersById[member.id], member, member.status);
        }

        return {
          presence: { ...s.presence, ...entries },
          usersById: nextUsersById,
          hubMembers: requestId === loadPresenceForHubRequestId ? memberMap : s.hubMembers,
        };
      });
    } catch {}
  },

  mergeUser: (user) => {
    const nextUser = normalizeUser(user);
    set((s) => {
      const resolvedStatus = resolveSelfPresenceStatus(s.selfUserId, s.presence, nextUser.id, nextUser.status);
      return {
        presence: s.presence[nextUser.id] === resolvedStatus
          ? s.presence
          : { ...s.presence, [nextUser.id]: resolvedStatus },
        usersById: {
          ...s.usersById,
          [nextUser.id]: mergeCachedUser(s.usersById[nextUser.id], nextUser, resolvedStatus),
        },
        hubMembers: s.hubMembers[nextUser.id]
          ? {
              ...s.hubMembers,
              [nextUser.id]: mergeCachedUser(s.hubMembers[nextUser.id], nextUser, resolvedStatus),
            }
          : s.hubMembers,
      };
    });
  },

  clearSessionCaches: () => {
    loadPresenceForHubRequestId = 0;
    presenceSessionToken += 1;
    pendingPresenceUserFetches.clear();
    set({
      selfUserId: null,
      presence: {},
      usersById: {},
      hubMembers: {},
      typers: {},
    });
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

export function getOrFetchPresenceUser(userId: string): Promise<User | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return Promise.resolve(null);
  }

  const cachedUser = usePresenceStore.getState().usersById[normalizedUserId];
  if (cachedUser) {
    return Promise.resolve(cachedUser);
  }

  const pendingFetch = pendingPresenceUserFetches.get(normalizedUserId);
  if (pendingFetch) {
    return pendingFetch;
  }

  const sessionToken = presenceSessionToken;
  let fetchPromise: Promise<User | null>;
  fetchPromise = api.getUser(normalizedUserId)
    .then((user) => {
      if (sessionToken === presenceSessionToken) {
        usePresenceStore.getState().mergeUser(user);
      }
      return user;
    })
    .finally(() => {
      if (pendingPresenceUserFetches.get(normalizedUserId) === fetchPromise) {
        pendingPresenceUserFetches.delete(normalizedUserId);
      }
    });

  pendingPresenceUserFetches.set(normalizedUserId, fetchPromise);
  return fetchPromise;
}
