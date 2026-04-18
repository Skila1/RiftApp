import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFrontendUpdateStore } from '../frontendUpdateStore';

const { desktopRef, reloadFrontendIgnoringCache, reloadOnceForFrontendUpdate } = vi.hoisted(() => ({
  desktopRef: { current: { reloadFrontendIgnoringCache: vi.fn() } as { reloadFrontendIgnoringCache: ReturnType<typeof vi.fn> } | undefined },
  reloadFrontendIgnoringCache: vi.fn(),
  reloadOnceForFrontendUpdate: vi.fn(),
}));

vi.mock('../../utils/desktop', () => ({
  getDesktop: () => desktopRef.current,
}));

vi.mock('../../utils/frontendUpdate', () => ({
  reloadOnceForFrontendUpdate,
}));

describe('frontendUpdateStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    desktopRef.current = {
      reloadFrontendIgnoringCache,
    };
    reloadFrontendIgnoringCache.mockReset();
    reloadFrontendIgnoringCache.mockResolvedValue(false);
    reloadOnceForFrontendUpdate.mockReset();
    useFrontendUpdateStore.setState({
      currentCommitSha: __RIFT_FRONTEND_COMMIT_SHA__,
      currentBuildId: __RIFT_FRONTEND_BUILD_ID__,
      currentSignature: null,
      currentBackendIdentity: null,
      latestSignature: null,
      latestBackendIdentity: null,
      updateReady: false,
      applyingUpdate: false,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('marks an update ready when the backend identity changes', () => {
    useFrontendUpdateStore.setState({ currentBackendIdentity: 'backend-sha-a|run-1' });

    useFrontendUpdateStore.getState().markBackendUpdateReady('backend-sha-b|run-2');

    const state = useFrontendUpdateStore.getState();
    expect(state.updateReady).toBe(true);
    expect(state.latestBackendIdentity).toBe('backend-sha-b|run-2');
  });

  it('does not mark an update ready when the backend identity is unchanged', () => {
    useFrontendUpdateStore.setState({ currentBackendIdentity: 'backend-sha-a|run-1' });

    useFrontendUpdateStore.getState().markBackendUpdateReady('backend-sha-a|run-1');

    const state = useFrontendUpdateStore.getState();
    expect(state.updateReady).toBe(false);
    expect(state.latestBackendIdentity).toBeNull();
  });

  it('marks an update ready when a protected asset load fails before signature polling completes', () => {
    useFrontendUpdateStore.getState().markUpdateReadyFromAssetFailure();

    const state = useFrontendUpdateStore.getState();
    expect(state.updateReady).toBe(true);
    expect(state.latestSignature).toBeTruthy();
  });

  it('preserves the discovered signature when an asset failure happens later', () => {
    useFrontendUpdateStore.setState({
      latestSignature: '/assets/app-new.js|/assets/app-new.css',
      updateReady: false,
    });

    useFrontendUpdateStore.getState().markUpdateReadyFromAssetFailure();

    expect(useFrontendUpdateStore.getState().latestSignature).toBe('/assets/app-new.js|/assets/app-new.css');
  });

  it('reloads the desktop shell immediately when a desktop bridge is available', async () => {
    useFrontendUpdateStore.setState({ updateReady: true });
    reloadFrontendIgnoringCache.mockResolvedValueOnce(true);

    useFrontendUpdateStore.getState().applyUpdate();
    await Promise.resolve();

    expect(useFrontendUpdateStore.getState().applyingUpdate).toBe(true);
    expect(reloadFrontendIgnoringCache).toHaveBeenCalledTimes(1);
    expect(reloadOnceForFrontendUpdate).not.toHaveBeenCalled();
  });

  it('keeps a short transition before reloading in the browser', async () => {
    desktopRef.current = undefined;
    useFrontendUpdateStore.setState({ updateReady: true });

    useFrontendUpdateStore.getState().applyUpdate();

    expect(useFrontendUpdateStore.getState().applyingUpdate).toBe(true);
    expect(reloadOnceForFrontendUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(199);

    expect(reloadOnceForFrontendUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(reloadOnceForFrontendUpdate).toHaveBeenCalledTimes(1);
  });
});