import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  api: {
    getHubMembers: vi.fn(),
    getUser: vi.fn(),
  },
}));

import type { User } from '../../types';
import { api } from '../../api/client';
import { getOrFetchPresenceUser, usePresenceStore } from '../presenceStore';
import {
  SELF_PRESENCE_STORAGE_KEY,
  getPersistedSelfPresence,
} from '../selfPresencePersistence';

const mockedApi = vi.mocked(api);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'alpha',
    display_name: 'Alpha',
    status: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('presenceStore', () => {
  beforeEach(() => {
    const storage = createStorageMock();
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
    });
    localStorage.removeItem(SELF_PRESENCE_STORAGE_KEY);
    usePresenceStore.getState().clearSessionCaches();
    usePresenceStore.getState().clearSelfPresence();
    vi.clearAllMocks();
  });

  it('hydrates self status from persisted storage instead of falling back to offline', () => {
    usePresenceStore.getState().setSelfPresence('user-1', 2);
    usePresenceStore.getState().clearSessionCaches();

    const resolvedStatus = usePresenceStore.getState().hydrateSelfPresence('user-1', 0);

    expect(resolvedStatus).toBe(2);
    expect(usePresenceStore.getState().selfUserId).toBe('user-1');
    expect(usePresenceStore.getState().presence['user-1']).toBe(2);
  });

  it('defaults self hydration to online when no stored value exists and fallback is offline', () => {
    const resolvedStatus = usePresenceStore.getState().hydrateSelfPresence('user-1', 0);

    expect(resolvedStatus).toBe(1);
    expect(usePresenceStore.getState().presence['user-1']).toBe(1);
  });

  it('preserves the explicit self status when user merges bring back stale offline data', () => {
    usePresenceStore.setState({
      usersById: { 'user-1': makeUser({ status: 3 }) },
      hubMembers: { 'user-1': makeUser({ status: 3 }) },
    });
    usePresenceStore.getState().setSelfPresence('user-1', 3);

    usePresenceStore.getState().mergeUser(makeUser({ status: 0 }));

    const state = usePresenceStore.getState();
    expect(state.presence['user-1']).toBe(3);
    expect(state.usersById['user-1']?.status).toBe(3);
    expect(state.hubMembers['user-1']?.status).toBe(3);
  });

  it('does not add merged users into the active hub member list when they are not members', () => {
    usePresenceStore.setState({
      hubMembers: { 'user-1': makeUser() },
    });

    usePresenceStore.getState().mergeUser(makeUser({
      id: 'user-2',
      username: 'beta',
      display_name: 'Beta',
    }));

    const state = usePresenceStore.getState();
    expect(state.hubMembers['user-2']).toBeUndefined();
    expect(state.usersById['user-2']).toMatchObject({ username: 'beta' });
  });

  it('deduplicates concurrent presence user fetches across callers', async () => {
    const response = createDeferred<User>();

    mockedApi.getUser.mockImplementationOnce(() => response.promise);

    const firstFetch = getOrFetchPresenceUser('user-9');
    const secondFetch = getOrFetchPresenceUser('user-9');

    expect(mockedApi.getUser).toHaveBeenCalledTimes(1);

    response.resolve(makeUser({ id: 'user-9', username: 'delta', display_name: 'Delta' }));

    await expect(firstFetch).resolves.toMatchObject({ id: 'user-9' });
    await expect(secondFetch).resolves.toMatchObject({ id: 'user-9' });
    expect(usePresenceStore.getState().usersById['user-9']).toMatchObject({ username: 'delta' });
  });

  it('ignores stale hub member responses after session caches are cleared', async () => {
    const firstResponse = createDeferred<User[]>();
    const secondResponse = createDeferred<User[]>();

    mockedApi.getHubMembers
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);

    const firstLoad = usePresenceStore.getState().loadPresenceForHub('hub-1');
    const secondLoad = usePresenceStore.getState().loadPresenceForHub('hub-2');

    secondResponse.resolve([
      makeUser({ id: 'user-2', username: 'bravo', display_name: 'Bravo' }),
    ]);
    await secondLoad;

    expect(usePresenceStore.getState().hubMembers).toMatchObject({
      'user-2': expect.objectContaining({ username: 'bravo' }),
    });

    usePresenceStore.getState().clearSessionCaches();

    firstResponse.resolve([
      makeUser({ id: 'user-3', username: 'charlie', display_name: 'Charlie' }),
    ]);
    await firstLoad;

    const state = usePresenceStore.getState();
    expect(state.hubMembers['user-2']).toBeUndefined();
    expect(state.hubMembers['user-3']).toBeUndefined();
    expect(state.usersById['user-3']).toBeUndefined();
  });

  it('clears persisted self status on logout cleanup', () => {
    usePresenceStore.getState().setSelfPresence('user-1', 0);

    usePresenceStore.getState().clearSelfPresence('user-1');

    expect(getPersistedSelfPresence('user-1')).toBeNull();
    expect(usePresenceStore.getState().presence['user-1']).toBeUndefined();
  });
});