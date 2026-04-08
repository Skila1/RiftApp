import { beforeEach, describe, expect, it } from 'vitest';

import { useFrontendUpdateStore } from '../../stores/frontendUpdateStore';
import { isProtectedImportUpdateReadyError, safeImport } from '../safeImport';

describe('safeImport', () => {
  beforeEach(() => {
    useFrontendUpdateStore.setState({
      currentCommitSha: __RIFT_FRONTEND_COMMIT_SHA__,
      currentBuildId: __RIFT_FRONTEND_BUILD_ID__,
      currentSignature: null,
      latestSignature: null,
      updateReady: false,
    });
  });

  it('marks frontend update ready instead of silently reloading on a protected stale chunk failure', async () => {
    let caught: unknown;

    try {
      await safeImport(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));
    } catch (error) {
      caught = error;
    }

    expect(isProtectedImportUpdateReadyError(caught)).toBe(true);
    expect(useFrontendUpdateStore.getState().updateReady).toBe(true);
  });

  it('passes through non-asset failures unchanged', async () => {
    const failure = new Error('Unexpected runtime error');
    let caught: unknown;

    try {
      await safeImport(() => Promise.reject(failure));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
    expect(useFrontendUpdateStore.getState().updateReady).toBe(false);
  });
});