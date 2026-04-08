import { create } from 'zustand';
import { reloadOnceForFrontendUpdate } from '../utils/frontendUpdate';

interface FrontendUpdateState {
  currentCommitSha: string;
  currentBuildId: string;
  currentSignature: string | null;
  latestSignature: string | null;
  updateReady: boolean;
  setCurrentSignature: (signature: string | null) => void;
  markUpdateReady: (signature: string) => void;
  markUpdateReadyFromAssetFailure: () => void;
  applyUpdate: () => void;
}

const ASSET_FAILURE_SIGNATURE = '__asset_failure__';

export const useFrontendUpdateStore = create<FrontendUpdateState>((set, get) => ({
  currentCommitSha: __RIFT_FRONTEND_COMMIT_SHA__,
  currentBuildId: __RIFT_FRONTEND_BUILD_ID__,
  currentSignature: null,
  latestSignature: null,
  updateReady: false,

  setCurrentSignature: (signature) => {
    set({ currentSignature: signature });
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

    reloadOnceForFrontendUpdate();
  },
}));
