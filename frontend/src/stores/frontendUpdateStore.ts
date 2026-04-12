import { create } from 'zustand';
import { getDesktop } from '../utils/desktop';
import { reloadOnceForFrontendUpdate } from '../utils/frontendUpdate';

interface FrontendUpdateState {
  currentCommitSha: string;
  currentBuildId: string;
  currentSignature: string | null;
  currentBackendIdentity: string | null;
  latestSignature: string | null;
  latestBackendIdentity: string | null;
  updateReady: boolean;
  setCurrentSignature: (signature: string | null) => void;
  setCurrentBackendIdentity: (identity: string | null) => void;
  markUpdateReady: (signature: string) => void;
  markBackendUpdateReady: (identity: string) => void;
  markUpdateReadyFromAssetFailure: () => void;
  applyUpdate: () => void;
}

const ASSET_FAILURE_SIGNATURE = '__asset_failure__';

export const useFrontendUpdateStore = create<FrontendUpdateState>((set, get) => ({
  currentCommitSha: __RIFT_FRONTEND_COMMIT_SHA__,
  currentBuildId: __RIFT_FRONTEND_BUILD_ID__,
  currentSignature: null,
  currentBackendIdentity: null,
  latestSignature: null,
  latestBackendIdentity: null,
  updateReady: false,

  setCurrentSignature: (signature) => {
    set({ currentSignature: signature });
  },

  setCurrentBackendIdentity: (identity) => {
		set({ currentBackendIdentity: identity });
	},

  markUpdateReady: (signature) => {
    set((state) => {
      if (state.currentSignature && state.currentSignature === signature) {
        return state;
      }

      if (state.updateReady && state.latestSignature === signature) {
        return state;
      }

      return {
        updateReady: true,
        latestSignature: signature,
      };
    });
  },

  markBackendUpdateReady: (identity) => {
    set((state) => {
      if (!identity) {
        return state;
      }

      if (state.currentBackendIdentity && state.currentBackendIdentity === identity) {
        return state;
      }

      if (state.updateReady && state.latestBackendIdentity === identity) {
        return state;
      }

      return {
        updateReady: true,
        latestBackendIdentity: identity,
      };
    });
  },

  markUpdateReadyFromAssetFailure: () => {
    set((state) => {
      if (state.updateReady) {
        return state;
      }

      return {
        updateReady: true,
        latestSignature: state.latestSignature ?? ASSET_FAILURE_SIGNATURE,
      };
    });
  },

  applyUpdate: () => {
    if (!get().updateReady) {
      return;
    }

    const desktop = getDesktop();
    if (desktop) {
      void desktop.reloadFrontendIgnoringCache().then((reloaded) => {
        if (!reloaded) {
          reloadOnceForFrontendUpdate();
        }
      });
      return;
    }

    reloadOnceForFrontendUpdate();
  },
}));
