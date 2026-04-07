import { contextBridge, ipcRenderer } from "electron";

const desktop = {
  minimize: () => {
    ipcRenderer.send("window:minimize");
  },
  maximize: () => {
    ipcRenderer.send("window:maximize-toggle");
  },
  close: () => {
    ipcRenderer.send("window:close");
  },
  isMaximized: () => ipcRenderer.invoke("window:is-maximized") as Promise<boolean>,
  getVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  getBuildInfo: () =>
    ipcRenderer.invoke("app:get-build-info") as Promise<{
      appVersion: string;
      electronVersion: string;
      platform: string;
      arch: string;
      osVersion: string;
    }>,
  getUpdateStatus: () =>
    ipcRenderer.invoke("app:get-update-status") as Promise<{
      state: "idle" | "checking" | "downloading" | "ready" | "up-to-date" | "error";
      version: string;
      progress: number | null;
      message: string;
    }>,
  isUpdateReady: () => ipcRenderer.invoke("app:is-update-ready") as Promise<boolean>,
  checkForUpdates: () =>
    ipcRenderer.invoke("app:check-for-updates") as Promise<{
      state: "idle" | "checking" | "downloading" | "ready" | "up-to-date" | "error";
      version: string;
      progress: number | null;
      message: string;
    }>,
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, v: boolean) => cb(v);
    ipcRenderer.on("window-maximized", handler);
    return () => ipcRenderer.removeListener("window-maximized", handler);
  },
  onUpdateStatus: (
    cb: (status: {
      state: "idle" | "checking" | "downloading" | "ready" | "up-to-date" | "error";
      version: string;
      progress: number | null;
      message: string;
    }) => void,
  ) => {
    const handler = (_e: Electron.IpcRendererEvent, status: {
      state: "idle" | "checking" | "downloading" | "ready" | "up-to-date" | "error";
      version: string;
      progress: number | null;
      message: string;
    }) => cb(status);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
  onUpdateReady: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("update-ready", handler);
    return () => ipcRenderer.removeListener("update-ready", handler);
  },
  restartToUpdate: () => {
    ipcRenderer.send("app:restart-to-update");
  },
};

contextBridge.exposeInMainWorld("desktop", desktop);
/** @deprecated Use window.desktop — kept for older bundles. */
contextBridge.exposeInMainWorld("riftDesktop", {
  minimize: () => desktop.minimize(),
  maximizeToggle: () => desktop.maximize(),
  close: () => desktop.close(),
  isMaximized: () => desktop.isMaximized(),
  onMaximizedChange: desktop.onMaximizedChange,
});
