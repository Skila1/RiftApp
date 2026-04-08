import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  session,
  desktopCapturer,
} from "electron";
import os from "os";
import path from "path";
import fs from "fs";
import { autoUpdater } from "electron-updater";

const VITE_DEV_URL = "http://localhost:5173";
const PRODUCTION_WEB_APP_URL = "https://riftapp.io/login";
const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const TRUSTED_RENDERER_ORIGINS = new Set<string>([
  new URL(VITE_DEV_URL).origin,
  new URL(PRODUCTION_WEB_APP_URL).origin,
  "https://www.riftapp.io",
]);
const ALLOWED_RENDERER_PERMISSIONS = new Set<string>([
  "media",
  "display-capture",
  "speaker-selection",
  "fullscreen",
  "clipboard-sanitized-write",
]);

type DesktopUpdateState = "idle" | "checking" | "downloading" | "ready" | "up-to-date" | "error";

type DesktopUpdateStatus = {
  state: DesktopUpdateState;
  version: string;
  progress: number | null;
  message: string;
};

type DesktopDisplaySource = {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnailDataUrl: string | null;
  appIconDataUrl: string | null;
};

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const appVersion = app.getVersion();

console.log(`[Rift] v${appVersion} — ${isDev ? "dev" : "production"}`);

app.setAppUserModelId("io.riftapp.desktop");

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let allowMainWindowClose = false;
let updateReady = false;
let updateDownloading = false;
let updateCheckInFlight = false;
let backgroundUpdateTimer: ReturnType<typeof setInterval> | null = null;
let updateStatusResetTimer: ReturnType<typeof setTimeout> | null = null;
let updateStatus: DesktopUpdateStatus = {
  state: "idle",
  version: "",
  progress: null,
  message: "",
};
let pendingDisplaySourceId: string | null = null;

// ── Paths ──────────────────────────────────────────────────

function getAssetPath(...segments: string[]): string {
  if (isDev) return path.join(__dirname, "..", "assets", ...segments);
  return path.join(app.getAppPath(), "assets", ...segments);
}

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getAppIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(getAssetPath("icon.png"));
}

function isTrustedRendererOrigin(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return false;

  try {
    return TRUSTED_RENDERER_ORIGINS.has(new URL(rawUrl).origin);
  } catch {
    return false;
  }
}

function shouldAllowRendererPermission(
  permission: string,
  requestingOrigin: string | null | undefined,
  details?: { requestingUrl?: string; securityOrigin?: string },
): boolean {
  if (!ALLOWED_RENDERER_PERMISSIONS.has(permission)) {
    return false;
  }

  return isTrustedRendererOrigin(requestingOrigin)
    || isTrustedRendererOrigin(details?.requestingUrl)
    || isTrustedRendererOrigin(details?.securityOrigin);
}

function getPermissionRequestOrigin(
  details?: { requestingUrl?: string; securityOrigin?: string },
): string | undefined {
  return details?.requestingUrl ?? details?.securityOrigin;
}

function serializeNativeImage(image: Electron.NativeImage | null | undefined): string | null {
  if (!image || image.isEmpty()) {
    return null;
  }

  try {
    return image.toDataURL();
  } catch {
    return null;
  }
}

function mapDesktopDisplaySource(source: Electron.DesktopCapturerSource): DesktopDisplaySource {
  return {
    id: source.id,
    name: source.name,
    kind: source.id.startsWith("window:") ? "window" : "screen",
    thumbnailDataUrl: serializeNativeImage(source.thumbnail),
    appIconDataUrl: serializeNativeImage(source.appIcon),
  };
}

async function getDesktopDisplaySources(thumbnailSize: Electron.Size): Promise<DesktopDisplaySource[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    fetchWindowIcons: true,
    thumbnailSize,
  });

  return sources
    .filter((source) => source.id.startsWith("screen:") || source.name.trim().length > 0)
    .map(mapDesktopDisplaySource);
}

async function findDesktopDisplaySourceById(sourceId: string): Promise<Electron.DesktopCapturerSource | null> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    fetchWindowIcons: false,
    thumbnailSize: { width: 0, height: 0 },
  });

  return sources.find((source) => source.id === sourceId) ?? null;
}

function configureRendererPermissions(): void {
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    return shouldAllowRendererPermission(
      permission,
      requestingOrigin,
      details as { requestingUrl?: string; securityOrigin?: string } | undefined,
    );
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const permissionDetails = details as { requestingUrl?: string; securityOrigin?: string } | undefined;
    const allowed = shouldAllowRendererPermission(
      permission,
      webContents.getURL(),
      permissionDetails,
    );

    if (!allowed && (permission === "media" || permission === "display-capture" || permission === "speaker-selection")) {
      console.warn(
        `[Rift permissions] Denied ${permission} for ${getPermissionRequestOrigin(permissionDetails) ?? webContents.getURL()}`,
      );
    }

    callback(allowed);
  });
}

function configureDisplayMediaHandling(): void {
  const ses = session.defaultSession;

  ses.setDisplayMediaRequestHandler((request, callback) => {
    void (async () => {
      if (!shouldAllowRendererPermission("display-capture", request.securityOrigin)) {
        console.warn(`[Rift permissions] Denied display media request for ${request.securityOrigin}`);
        callback({});
        return;
      }

      const sourceId = pendingDisplaySourceId;
      pendingDisplaySourceId = null;

      if (!sourceId) {
        console.warn(`[Rift permissions] Missing pending display source for ${request.securityOrigin}`);
        callback({});
        return;
      }

      try {
        const source = await findDesktopDisplaySourceById(sourceId);
        if (!source) {
          console.warn(`[Rift permissions] Display source ${sourceId} is no longer available.`);
          callback({});
          return;
        }

        if (request.audioRequested && process.platform === "win32" && source.id.startsWith("screen:")) {
          callback({ video: source, audio: "loopback" });
          return;
        }

        callback({ video: source });
      } catch (error) {
        console.warn("[Rift permissions] Failed to resolve display media request:", error);
        callback({});
      }
    })();
  });
}

function clearUpdateStatusResetTimer(): void {
  if (updateStatusResetTimer) {
    clearTimeout(updateStatusResetTimer);
    updateStatusResetTimer = null;
  }
}

function broadcastUpdateStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", updateStatus);
  }
}

function setUpdateStatus(
  next: DesktopUpdateStatus,
  options?: { resetToIdleMs?: number },
): void {
  clearUpdateStatusResetTimer();
  updateStatus = next;
  broadcastUpdateStatus();
  refreshTrayMenu();

  if (options?.resetToIdleMs) {
    updateStatusResetTimer = setTimeout(() => {
      if (updateReady || updateDownloading || updateCheckInFlight) return;
      updateStatus = {
        state: "idle",
        version: "",
        progress: null,
        message: "",
      };
      broadcastUpdateStatus();
      refreshTrayMenu();
      updateStatusResetTimer = null;
    }, options.resetToIdleMs);
  }
}

// ── Splash / updater window ────────────────────────────────

function getIconBase64(): string {
  try {
    return fs.readFileSync(getAssetPath("icon.png")).toString("base64");
  } catch {
    return "";
  }
}

function buildSplashHTML(): string {
  const b64 = getIconBase64();
  const icon = b64
    ? `<img src="data:image/png;base64,${b64}" width="80" height="80" style="border-radius:16px"/>`
    : `<div style="font-size:42px;font-weight:700;letter-spacing:6px;color:#6366f1">RIFT</div>`;

  return `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#2b2d31;color:#f2f3f5;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;
-webkit-app-region:drag;user-select:none;overflow:hidden}
.icon{margin-bottom:32px}
#status{font-size:13px;color:#b5bac1;margin-bottom:14px;min-height:18px}
.track{width:200px;height:6px;background:#1e1f22;border-radius:3px;overflow:hidden}
.fill{height:100%;width:30%;background:linear-gradient(90deg,#6366f1,#818cf8);border-radius:3px;transition:width .4s ease}
.fill.ind{width:40%;animation:slide 1.2s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(500%)}}
</style></head><body>
<div class="icon">${icon}</div>
<div id="status">Checking for updates\u2026</div>
<div class="track"><div class="fill ind" id="bar"></div></div>
</body></html>`;
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 350,
    frame: false,
    resizable: false,
    center: true,
    skipTaskbar: false,
    backgroundColor: "#2b2d31",
    icon: getAppIcon(),
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildSplashHTML())}`
  );
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function updateSplash(text: string, percent?: number): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const js =
    percent !== undefined
      ? `document.getElementById('status').textContent=${JSON.stringify(text)};
         var b=document.getElementById('bar');b.classList.remove('ind');b.style.width='${Math.round(percent)}%';`
      : `document.getElementById('status').textContent=${JSON.stringify(text)};`;
  splashWindow.webContents.executeJavaScript(js).catch(() => {});
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ── Main window ────────────────────────────────────────────

function broadcastMaximized(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("window-maximized", win.isMaximized());
}

function createWindow(show: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    frame: false,
    show,
    center: true,
    title: `Rift v${appVersion}`,
    icon: getAppIcon(),
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(VITE_DEV_URL);
  } else {
    void mainWindow.loadURL(PRODUCTION_WEB_APP_URL);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("maximize", () => broadcastMaximized(mainWindow));
  mainWindow.on("unmaximize", () => broadcastMaximized(mainWindow));

  mainWindow.on("close", (e) => {
    if (allowMainWindowClose) return;
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("focus", () => {
    if (!isDev) {
      void runBackgroundUpdateCheck("focus");
    }
  });
}

// ── Tray ───────────────────────────────────────────────────

function restartToApplyUpdate(): void {
  allowMainWindowClose = true;
  autoUpdater.quitAndInstall(false, true);
}

function buildTrayMenu(): Electron.Menu {
  const updateMenuItem: Electron.MenuItemConstructorOptions = updateReady
    ? {
        label: updateStatus.version
          ? `Restart to Update (v${updateStatus.version})`
          : "Restart to Update",
        click: () => {
          restartToApplyUpdate();
        },
      }
    : updateDownloading
      ? {
          label: updateStatus.progress !== null
            ? `Downloading Update... ${Math.round(updateStatus.progress)}%`
            : "Downloading Update...",
          enabled: false,
        }
      : updateCheckInFlight || updateStatus.state === "checking"
        ? {
            label: "Checking for Updates...",
            enabled: false,
          }
        : {
            label: isDev ? "Check for Updates (Unavailable in Dev)" : "Check for Updates...",
            enabled: !isDev,
            click: () => {
              void runBackgroundUpdateCheck("tray");
            },
          };

  return Menu.buildFromTemplate([
    {
      label: "Show Rift",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    updateMenuItem,
    { type: "separator" },
    {
      label: "Quit Rift",
      click: () => {
        allowMainWindowClose = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function createTray(): void {
  const iconPath = getAssetPath("tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  tray.setToolTip("Rift");
  refreshTrayMenu();

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC ────────────────────────────────────────────────────

function windowFromEvent(sender: Electron.WebContents): BrowserWindow | null {
  const w = BrowserWindow.fromWebContents(sender);
  return w && !w.isDestroyed() ? w : null;
}

function registerIpc(): void {
  ipcMain.on("window:minimize", (e) => {
    windowFromEvent(e.sender)?.minimize();
  });

  ipcMain.on("window:maximize-toggle", (e) => {
    const win = windowFromEvent(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    broadcastMaximized(win);
  });

  ipcMain.on("window:close", (e) => {
    windowFromEvent(e.sender)?.close();
  });

  ipcMain.handle("window:is-maximized", (e) => {
    return windowFromEvent(e.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle("app:get-version", () => appVersion);
  ipcMain.handle("app:get-build-info", () => ({
    appVersion,
    electronVersion: process.versions.electron ?? "",
    platform: process.platform === "win32"
      ? "Windows"
      : process.platform === "darwin"
        ? "macOS"
        : process.platform === "linux"
          ? "Linux"
          : process.platform,
    arch: process.arch,
    osVersion: process.platform === "win32"
      ? `${os.version()} (${os.release()})`
      : os.release(),
  }));
  ipcMain.handle("app:get-update-status", () => updateStatus);
  ipcMain.handle("app:is-update-ready", () => updateReady);
  ipcMain.handle("app:check-for-updates", async () => {
    if (isDev) {
      setUpdateStatus(
        {
          state: "error",
          version: "",
          progress: null,
          message: "Updates are unavailable in development builds.",
        },
        { resetToIdleMs: 5000 },
      );
      return updateStatus;
    }

    return runBackgroundUpdateCheck("manual");
  });

  ipcMain.on("app:restart-to-update", () => {
    restartToApplyUpdate();
  });

  ipcMain.handle("desktop:list-display-sources", async (event) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) {
      return [];
    }

    return getDesktopDisplaySources({ width: 320, height: 180 });
  });

  ipcMain.handle("desktop:select-display-source", async (event, sourceId: string) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) {
      return false;
    }

    if (typeof sourceId !== "string" || sourceId.trim().length === 0) {
      pendingDisplaySourceId = null;
      return false;
    }

    const source = await findDesktopDisplaySourceById(sourceId);
    if (!source) {
      pendingDisplaySourceId = null;
      return false;
    }

    pendingDisplaySourceId = source.id;
    return true;
  });
}

// ── Auto-updater ───────────────────────────────────────────
// Splash: quick check only (no download).
// After main window: download in background, notify frontend when ready.

function configureUpdaterFeed(): void {
  const customUrl = process.env.RIFT_UPDATE_URL?.trim();
  if (customUrl) {
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: customUrl });
    } catch {
      /* ignore */
    }
  }
}

async function runBackgroundUpdateCheck(reason: string): Promise<DesktopUpdateStatus> {
  if (updateReady || updateDownloading || updateCheckInFlight) return updateStatus;

  updateCheckInFlight = true;
  configureUpdaterFeed();
  setUpdateStatus({
    state: "checking",
    version: updateStatus.version,
    progress: null,
    message: reason === "manual" ? "Checking for updates..." : "",
  });
  console.log(`[Rift updater] Checking for update (${reason})...`);

  try {
    await autoUpdater.checkForUpdates();
    return updateStatus;
  } catch (err) {
    setUpdateStatus(
      {
        state: "error",
        version: "",
        progress: null,
        message: err instanceof Error ? err.message : "Update check failed.",
      },
      { resetToIdleMs: 5000 },
    );
    console.error(`[Rift updater] checkForUpdates failed (${reason}):`, err);
    return updateStatus;
  } finally {
    updateCheckInFlight = false;
  }
}

function clearBackgroundUpdateTimer(): void {
  if (backgroundUpdateTimer) {
    clearInterval(backgroundUpdateTimer);
    backgroundUpdateTimer = null;
  }
}

/** Splash phase: just check if an update exists (no download yet). */
function splashUpdateCheck(): Promise<void> {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  configureUpdaterFeed();

  return new Promise<void>((resolve) => {
    autoUpdater.on("checking-for-update", () =>
      updateSplash("Checking for updates\u2026")
    );
    autoUpdater.on("update-available", () => {
      updateSplash("Starting Rift\u2026", 100);
      resolve();
    });
    autoUpdater.on("update-not-available", () => {
      updateSplash("Starting Rift\u2026", 100);
      resolve();
    });
    autoUpdater.on("error", () => {
      updateSplash("Starting Rift\u2026", 100);
      resolve();
    });

    autoUpdater.checkForUpdates().catch(() => resolve());
  });
}

/** Post-splash: download in background, notify frontend when ready. */
function backgroundUpdateDownload(): void {
  autoUpdater.removeAllListeners();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  configureUpdaterFeed();

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      state: "checking",
      version: updateStatus.version,
      progress: null,
      message: "Checking for updates...",
    });
    console.log("[Rift updater] Checking for update...");
  });
  autoUpdater.on("update-available", (info) => {
    updateDownloading = true;
    setUpdateStatus({
      state: "downloading",
      version: info.version,
      progress: 0,
      message: `Downloading v${info.version}...`,
    });
    console.log(`[Rift updater] Update available: v${info.version}`);
  });
  autoUpdater.on("update-not-available", (info) => {
    updateDownloading = false;
    setUpdateStatus(
      {
        state: "up-to-date",
        version: info.version,
        progress: null,
        message: `You're on the latest version (${info.version}).`,
      },
      { resetToIdleMs: 4000 },
    );
    console.log(`[Rift updater] Already up-to-date (v${info.version})`);
  });
  autoUpdater.on("download-progress", (info) => {
    setUpdateStatus({
      state: "downloading",
      version: updateStatus.version,
      progress: Math.round(info.percent),
      message: `Downloading update... ${Math.round(info.percent)}%`,
    });
    console.log(`[Rift updater] Downloading... ${Math.round(info.percent)}%`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloading = false;
    updateReady = true;
    setUpdateStatus({
      state: "ready",
      version: info.version,
      progress: 100,
      message: `Restart to install v${info.version}.`,
    });
    console.log(`[Rift updater] Downloaded v${info.version} — notifying renderer`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-ready");
    }
  });
  autoUpdater.on("error", (err) => {
    updateDownloading = false;
    setUpdateStatus(
      {
        state: "error",
        version: updateStatus.version,
        progress: null,
        message: err instanceof Error ? err.message : "Update download failed.",
      },
      { resetToIdleMs: 5000 },
    );
    console.error("[Rift updater] Error:", err?.message ?? err);
  });

  void runBackgroundUpdateCheck("startup");
  clearBackgroundUpdateTimer();
  backgroundUpdateTimer = setInterval(() => {
    void runBackgroundUpdateCheck("interval");
  }, UPDATE_CHECK_INTERVAL_MS);
}

// ── Bootstrap ──────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === "darwin") {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ])
      );
    } else {
      Menu.setApplicationMenu(null);
    }

    configureRendererPermissions();
    configureDisplayMediaHandling();
    registerIpc();

    if (isDev) {
      createWindow(true);
      createTray();
    } else {
      createSplashWindow();
      createWindow(false);
      createTray();

      const minDisplayTime = new Promise<void>((r) => setTimeout(r, 3000));
      const updateCheck = splashUpdateCheck();
      await Promise.all([minDisplayTime, updateCheck]);

      closeSplash();
      mainWindow?.show();
      mainWindow?.focus();

      backgroundUpdateDownload();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(true);
      else mainWindow?.show();
    });
  });

  app.on("before-quit", () => {
    allowMainWindowClose = true;
    pendingDisplaySourceId = null;
    clearUpdateStatusResetTimer();
    clearBackgroundUpdateTimer();
    tray?.destroy();
    tray = null;
  });
}
