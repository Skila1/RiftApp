import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
} from "electron";
import path from "path";
import fs from "fs";
import { autoUpdater } from "electron-updater";

const VITE_DEV_URL = "http://localhost:5173";
const PRODUCTION_WEB_APP_URL = "https://riftapp.io/login";
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

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

function createTray(): void {
  const iconPath = getAssetPath("tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Rift",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Rift",
      click: () => {
        allowMainWindowClose = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Rift");
  tray.setContextMenu(menu);

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

  ipcMain.handle("app:is-update-ready", () => updateReady);

  ipcMain.on("app:restart-to-update", () => {
    allowMainWindowClose = true;
    autoUpdater.quitAndInstall(false, true);
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

async function runBackgroundUpdateCheck(reason: string): Promise<void> {
  if (updateReady || updateDownloading || updateCheckInFlight) return;

  updateCheckInFlight = true;
  configureUpdaterFeed();
  console.log(`[Rift updater] Checking for update (${reason})…`);

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error(`[Rift updater] checkForUpdates failed (${reason}):`, err);
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
    console.log("[Rift updater] Checking for update…");
  });
  autoUpdater.on("update-available", (info) => {
    updateDownloading = true;
    console.log(`[Rift updater] Update available: v${info.version}`);
  });
  autoUpdater.on("update-not-available", (info) => {
    updateDownloading = false;
    console.log(`[Rift updater] Already up-to-date (v${info.version})`);
  });
  autoUpdater.on("download-progress", (info) => {
    console.log(`[Rift updater] Downloading… ${Math.round(info.percent)}%`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloading = false;
    updateReady = true;
    console.log(`[Rift updater] Downloaded v${info.version} — notifying renderer`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-ready");
    }
  });
  autoUpdater.on("error", (err) => {
    updateDownloading = false;
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
    clearBackgroundUpdateTimer();
    tray?.destroy();
    tray = null;
  });
}
