import { describe, expect, it } from 'vitest';

import {
  isDynamicImportFailureMessage,
  isFrontendAssetFailureEvent,
  isFrontendAssetLoadError,
  shouldAutoReloadForFrontendAssetFailure,
  withFrontendAssetAutoReloadSuppressed,
} from '../frontendUpdate';

describe('frontendUpdate helpers', () => {
  it('detects stale chunk failure messages', () => {
    expect(isDynamicImportFailureMessage('Failed to fetch dynamically imported module')).toBe(true);
    expect(isFrontendAssetLoadError(new Error('ChunkLoadError: Loading CSS chunk 4 failed.'))).toBe(true);
  });

  it('ignores unrelated runtime errors', () => {
    expect(isDynamicImportFailureMessage('Plain network timeout')).toBe(false);
    expect(isFrontendAssetLoadError(new Error('Unexpected camera permission error'))).toBe(false);
  });

  it('detects asset element failures from script targets', () => {
    const script = document.createElement('script');
    script.src = 'https://example.com/assets/settings-modal.js';

    const event = new ErrorEvent('error');
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: script,
    });

    expect(isFrontendAssetFailureEvent(event)).toBe(true);
  });

  it('suppresses global auto reload while a protected chunk is loading', async () => {
    let releaseLoad!: () => void;
    const pendingLoad = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });

    const loadPromise = withFrontendAssetAutoReloadSuppressed(async () => {
      expect(shouldAutoReloadForFrontendAssetFailure()).toBe(false);
      await pendingLoad;
      return 'loaded';
    });

    expect(shouldAutoReloadForFrontendAssetFailure()).toBe(false);
    releaseLoad();
    await expect(loadPromise).resolves.toBe('loaded');
    expect(shouldAutoReloadForFrontendAssetFailure()).toBe(true);
  });
});