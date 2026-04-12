import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFrontendUpdateStore } from '../frontendUpdateStore';

const reloadFrontendIgnoringCache = vi.fn();

vi.mock('../../utils/desktop', () => ({
  getDesktop: () => ({
    reloadFrontendIgnoringCache,
  }),
}));

describe('frontendUpdateStore', () => {
  beforeEach(() => {
    reloadFrontendIgnoringCache.mockReset();
    reloadFrontendIgnoringCache.mockResolvedValue(false);
    useFrontendUpdateStore.setState({
      currentCommitSha: __RIFT_FRONTEND_COMMIT_SHA__,
      currentBuildId: __RIFT_FRONTEND_BUILD_ID__,
      currentSignature: null,
      currentBackendIdentity: null,
      latestSignature: null,
      latestBackendIdentity: null,
      updateReady: false,
    });
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

  it('asks the desktop shell to reload the frontend ignoring cache when applying an update', () => {
    useFrontendUpdateStore.setState({ updateReady: true });

    useFrontendUpdateStore.getState().applyUpdate();

    expect(reloadFrontendIgnoringCache).toHaveBeenCalledTimes(1);
  });
});