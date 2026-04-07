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
  isUpdateReady: () => ipcRenderer.invoke("app:is-update-ready") as Promise<boolean>,
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, v: boolean) => cb(v);
    ipcRenderer.on("window-maximized", handler);
    return () => ipcRenderer.removeListener("window-maximized", handler);
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
