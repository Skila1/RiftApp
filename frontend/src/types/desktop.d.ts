export interface DesktopAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  isUpdateReady: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
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
