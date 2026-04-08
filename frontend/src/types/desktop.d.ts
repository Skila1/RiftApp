export interface DesktopBuildInfo {
  appVersion: string;
  electronVersion: string;
  platform: string;
  arch: string;
  osVersion: string;
}

export interface DesktopUpdateStatus {
  state: 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error';
  version: string;
  progress: number | null;
  message: string;
}

export interface DesktopDisplaySource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnailDataUrl: string | null;
  appIconDataUrl: string | null;
}

export interface DesktopAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  getVersion: () => Promise<string>;
  getBuildInfo: () => Promise<DesktopBuildInfo>;
  getUpdateStatus: () => Promise<DesktopUpdateStatus>;
  isUpdateReady: () => Promise<boolean>;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  listDisplaySources: () => Promise<DesktopDisplaySource[]>;
  selectDisplaySource: (sourceId: string) => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  onUpdateStatus: (cb: (status: DesktopUpdateStatus) => void) => () => void;
  onUpdateReady: (cb: () => void) => () => void;
  restartToUpdate: () => void;
}

declare global {
  interface Window {
    desktop?: DesktopAPI;
    /** @deprecated Prefer window.desktop */
    riftDesktop?: {
      minimize: () => void | Promise<void>;
      maximizeToggle: () => void | Promise<void>;
      close: () => void | Promise<void>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
    };
  }
}

export {};
