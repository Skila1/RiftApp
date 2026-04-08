import { beforeEach, describe, expect, it } from 'vitest';

import { useFrontendUpdateStore } from '../frontendUpdateStore';

describe('frontendUpdateStore', () => {
  beforeEach(() => {
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
});