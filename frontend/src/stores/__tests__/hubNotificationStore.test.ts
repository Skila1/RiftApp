import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  api: {
    getHubNotificationSettings: vi.fn(),
    patchHubNotificationSettings: vi.fn(),
  },
}));

import { getMutedHubIds, isHubMuted, useHubNotificationStore } from '../hubNotificationStore';

describe('hubNotificationStore', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    });
    useHubNotificationStore.setState({
      hubSettingsByHubId: {},
      localMutedUntilByHubId: {},
    });
    vi.clearAllMocks();
  });

  it('treats backend-muted and locally-muted hubs as muted', () => {
    expect(isHubMuted({
      notification_level: 'mentions_only',
      suppress_everyone: false,
      suppress_role_mentions: false,
      suppress_highlights: false,
      mute_events: false,
      mobile_push: true,
      hide_muted_channels: false,
      server_muted: true,
    }, undefined)).toBe(true);

    expect(isHubMuted(undefined, Date.now() + 60_000)).toBe(true);
    expect(isHubMuted(undefined, undefined)).toBe(false);
  });

  it('collects all effectively muted hub ids', () => {
    const mutedHubIds = getMutedHubIds({
      alpha: {
        notification_level: 'mentions_only',
        suppress_everyone: false,
        suppress_role_mentions: false,
        suppress_highlights: false,
        mute_events: false,
        mobile_push: true,
        hide_muted_channels: false,
        server_muted: true,
      },
      beta: {
        notification_level: 'all',
        suppress_everyone: false,
        suppress_role_mentions: false,
        suppress_highlights: false,
        mute_events: false,
        mobile_push: true,
        hide_muted_channels: false,
        server_muted: false,
      },
    }, {
      beta: Date.now() + 60_000,
    });

    expect([...mutedHubIds].sort()).toEqual(['alpha', 'beta']);
  });

  it('stores and clears local timed hub mutes', () => {
    useHubNotificationStore.getState().muteHubLocally('hub-1', 60_000);
    expect(useHubNotificationStore.getState().localMutedUntilByHubId['hub-1']).toBeGreaterThan(Date.now());

    useHubNotificationStore.getState().unmuteHubLocally('hub-1');
    expect(useHubNotificationStore.getState().localMutedUntilByHubId['hub-1']).toBeUndefined();
  });
});