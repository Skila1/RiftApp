import { useFrontendUpdateStore } from '../stores/frontendUpdateStore';
import { isFrontendAssetLoadError, withFrontendAssetAutoReloadSuppressed } from './frontendUpdate';

const PROTECTED_IMPORT_UPDATE_READY_ERROR = 'ProtectedImportUpdateReadyError';

export class ProtectedImportUpdateReadyError extends Error {
  cause?: unknown;

  constructor(cause?: unknown) {
    super('A newer frontend build is ready. Apply the update to continue.');
    this.name = PROTECTED_IMPORT_UPDATE_READY_ERROR;
    this.cause = cause;
  }
}

export function isProtectedImportUpdateReadyError(error: unknown): error is ProtectedImportUpdateReadyError {
  return error instanceof ProtectedImportUpdateReadyError
    || (typeof error === 'object' && error !== null && 'name' in error && error.name === PROTECTED_IMPORT_UPDATE_READY_ERROR);
}

export async function safeImport<T>(load: () => Promise<T>): Promise<T> {
  return withFrontendAssetAutoReloadSuppressed(async () => {
    try {
      return await load();
    } catch (error) {
      if (isFrontendAssetLoadError(error)) {
        useFrontendUpdateStore.getState().markUpdateReadyFromAssetFailure();
        throw new ProtectedImportUpdateReadyError(error);
      }

      throw error;
    }
  });
}