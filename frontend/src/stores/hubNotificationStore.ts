import { create } from 'zustand';

import { api } from '../api/client';
import type { HubNotificationSettings } from '../types';

const HUB_MUTE_STORAGE_KEY = 'riftapp.hub-mutes.v1';
const INDEFINITE_HUB_MUTE = -1;

type HubMuteMap = Record<string, number>;

export const DEFAULT_HUB_NOTIFICATION_SETTINGS: HubNotificationSettings = {
  notification_level: 'mentions_only',
  suppress_everyone: false,
  suppress_role_mentions: false,
  suppress_highlights: false,
  mute_events: false,
  mobile_push: true,
  hide_muted_channels: false,
  server_muted: false,
};

function isHubId(value: string) {
  return value.trim().length > 0;
}

function isLocalHubMuteActive(value: number | null | undefined) {
  return value === INDEFINITE_HUB_MUTE
    || (typeof value === 'number' && Number.isFinite(value) && value > Date.now());
}

function normalizeHubMuteMap(value: unknown): HubMuteMap {
  if (typeof value !== 'object' || value == null) {
    return {};
  }

  const next: HubMuteMap = {};
  for (const [hubId, mutedUntil] of Object.entries(value as Record<string, unknown>)) {
    if (!isHubId(hubId)) {
      continue;
    }
    if (typeof mutedUntil !== 'number' || !Number.isFinite(mutedUntil)) {
      continue;
    }
    if (!isLocalHubMuteActive(mutedUntil)) {
      continue;
    }
    next[hubId] = mutedUntil;
  }

  return next;
}

function loadPersistedHubMutes(): HubMuteMap {
  try {
    const raw = localStorage.getItem(HUB_MUTE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return normalizeHubMuteMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function persistHubMutes(localMutedUntilByHubId: HubMuteMap) {
  try {
    localStorage.setItem(HUB_MUTE_STORAGE_KEY, JSON.stringify(localMutedUntilByHubId));
  } catch {
    /* ignore storage failures */
  }
}

function withCleanHubMutes(localMutedUntilByHubId: HubMuteMap) {
  return normalizeHubMuteMap(localMutedUntilByHubId);
}

type HubNotificationState = {
  hubSettingsByHubId: Record<string, HubNotificationSettings>;
  localMutedUntilByHubId: HubMuteMap;
  ensureHubSettings: (hubId: string) => Promise<HubNotificationSettings>;
  loadHubSettings: (hubIds: string[]) => Promise<void>;
  patchHubSettings: (hubId: string, next: HubNotificationSettings) => Promise<HubNotificationSettings>;
  muteHubLocally: (hubId: string, durationMs: number | null) => void;
  unmuteHubLocally: (hubId: string) => void;
  clearExpiredHubMutes: () => void;
};

const persistedHubMutes = loadPersistedHubMutes();

export function isHubMuted(settings: HubNotificationSettings | null | undefined, localMutedUntil: number | null | undefined) {
  return Boolean(settings?.server_muted) || isLocalHubMuteActive(localMutedUntil);
}

export function getMutedHubIds(
  hubSettingsByHubId: Record<string, HubNotificationSettings>,
  localMutedUntilByHubId: HubMuteMap,
) {
  const mutedHubIds = new Set<string>();
  const candidateHubIds = new Set([
    ...Object.keys(hubSettingsByHubId),
    ...Object.keys(localMutedUntilByHubId),
  ]);

  for (const hubId of candidateHubIds) {
    if (isHubMuted(hubSettingsByHubId[hubId], localMutedUntilByHubId[hubId])) {
      mutedHubIds.add(hubId);
    }
  }

  return mutedHubIds;
}

export const useHubNotificationStore = create<HubNotificationState>((set, get) => ({
  hubSettingsByHubId: {},
  localMutedUntilByHubId: persistedHubMutes,

  ensureHubSettings: async (hubId) => {
    if (!isHubId(hubId)) {
      return DEFAULT_HUB_NOTIFICATION_SETTINGS;
    }

    const cached = get().hubSettingsByHubId[hubId];
    if (cached) {
      return cached;
    }

    let settings = DEFAULT_HUB_NOTIFICATION_SETTINGS;
    try {
      settings = await api.getHubNotificationSettings(hubId);
    } catch {
      settings = { ...DEFAULT_HUB_NOTIFICATION_SETTINGS };
    }

    set((state) => ({
      hubSettingsByHubId: {
        ...state.hubSettingsByHubId,
        [hubId]: settings,
      },
    }));
    return settings;
  },

  loadHubSettings: async (hubIds) => {
    const missingHubIds = [...new Set(hubIds.filter((hubId) => isHubId(hubId) && !(hubId in get().hubSettingsByHubId)))];
    if (missingHubIds.length === 0) {
      return;
    }

    const entries = await Promise.all(missingHubIds.map(async (hubId) => {
      try {
        return [hubId, await api.getHubNotificationSettings(hubId)] as const;
      } catch {
        return [hubId, { ...DEFAULT_HUB_NOTIFICATION_SETTINGS }] as const;
      }
    }));

    set((state) => ({
      hubSettingsByHubId: {
        ...state.hubSettingsByHubId,
        ...Object.fromEntries(entries),
      },
    }));
  },

  patchHubSettings: async (hubId, next) => {
    const previous = get().hubSettingsByHubId[hubId];
    set((state) => ({
      hubSettingsByHubId: {
        ...state.hubSettingsByHubId,
        [hubId]: next,
      },
    }));

    try {
      const saved = await api.patchHubNotificationSettings(hubId, next);
      set((state) => ({
        hubSettingsByHubId: {
          ...state.hubSettingsByHubId,
          [hubId]: saved,
        },
      }));
      return saved;
    } catch (error) {
      try {
        const fresh = await api.getHubNotificationSettings(hubId);
        set((state) => ({
          hubSettingsByHubId: {
            ...state.hubSettingsByHubId,
            [hubId]: fresh,
          },
        }));
      } catch {
        set((state) => {
          const hubSettingsByHubId = { ...state.hubSettingsByHubId };
          if (previous) {
            hubSettingsByHubId[hubId] = previous;
          } else {
            delete hubSettingsByHubId[hubId];
          }
          return { hubSettingsByHubId };
        });
      }
      throw error;
    }
  },

  muteHubLocally: (hubId, durationMs) => {
    if (!isHubId(hubId)) {
      return;
    }

    const mutedUntil = durationMs == null
      ? INDEFINITE_HUB_MUTE
      : Date.now() + Math.max(durationMs, 0);

    set((state) => {
      const localMutedUntilByHubId = withCleanHubMutes({
        ...state.localMutedUntilByHubId,
        [hubId]: mutedUntil,
      });
      persistHubMutes(localMutedUntilByHubId);
      return { localMutedUntilByHubId };
    });
  },

  unmuteHubLocally: (hubId) => {
    if (!isHubId(hubId)) {
      return;
    }

    set((state) => {
      const localMutedUntilByHubId = { ...state.localMutedUntilByHubId };
      delete localMutedUntilByHubId[hubId];
      const cleaned = withCleanHubMutes(localMutedUntilByHubId);
      persistHubMutes(cleaned);
      return { localMutedUntilByHubId: cleaned };
    });
  },

  clearExpiredHubMutes: () => {
    set((state) => {
      const localMutedUntilByHubId = withCleanHubMutes(state.localMutedUntilByHubId);
      persistHubMutes(localMutedUntilByHubId);
      return { localMutedUntilByHubId };
    });
  },
}));