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
      latestSignature: null,
      updateReady: false,
    });
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