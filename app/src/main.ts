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
import { execFileSync, spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
import { autoUpdater } from "electron-updater";

const VITE_DEV_URL = "http://localhost:5173";
const PRODUCTION_WEB_APP_URL = "https://riftapp.io/login";
const DEFAULT_UPDATE_FEED_URL = "https://updates.riftapp.io";
const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const UPDATE_RESTART_MARKER_FILENAME = "update-restart-pending.json";
const UPDATE_RESTART_MARKER_TTL_MS = 90_000;
const MAIN_WINDOW_READY_TIMEOUT_MS = 15_000;
const FRONTEND_RELOAD_SPLASH_MIN_MS = 250;
const FRONTEND_RELOAD_FALLBACK_READY_TIMEOUT_MS = 2_500;
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

type UpdateRestartMarker = {
  createdAt: number;
  expiresAt: number;
  version: string | null;
};

type DesktopDisplaySource = {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnailDataUrl: string | null;
  appIconDataUrl: string | null;
};

type DesktopDateTimePreferences = {
  locale: string;
  shortDatePattern: string | null;
  longDatePattern: string | null;
  shortTimePattern: string | null;
  uses24HourClock: boolean | null;
};

type WindowsInternationalValueName =
  | "LocaleName"
  | "sShortDate"
  | "sLongDate"
  | "sShortTime"
  | "sTimeFormat"
  | "iTime";

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
let pendingDisplaySourceKind: DesktopDisplaySource["kind"] | null = null;
let desktopDateTimePreferencesCache: DesktopDateTimePreferences | null = null;
let taskbarAttentionRequested = false;

// ── Paths ──────────────────────────────────────────────────

function getAssetPath(...segments: string[]): string {
  if (isDev) return path.join(__dirname, "..", "assets", ...segments);
  return path.join(app.getAppPath(), "assets", ...segments);
}

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getUpdateRestartMarkerPath(): string {
  return path.join(app.getPath("userData"), UPDATE_RESTART_MARKER_FILENAME);
}

function readUpdateRestartMarker(): UpdateRestartMarker | null {
  try {
    const raw = fs.readFileSync(getUpdateRestartMarkerPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<UpdateRestartMarker>;
    if (typeof parsed.createdAt !== "number" || typeof parsed.expiresAt !== "number") {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      expiresAt: parsed.expiresAt,
      version: typeof parsed.version === "string" && parsed.version.trim().length > 0
        ? parsed.version
        : null,
    };
  } catch {
    return null;
  }
}

function clearUpdateRestartMarker(): void {
  try {
    fs.rmSync(getUpdateRestartMarkerPath(), { force: true });
  } catch {
    /* ignore cleanup errors */
  }
}

function hasPendingUpdateRestartMarker(): boolean {
  const marker = readUpdateRestartMarker();
  if (!marker) {
    return false;
  }

  if (marker.expiresAt <= Date.now()) {
    clearUpdateRestartMarker();
    return false;
  }

  return true;
}

function writeUpdateRestartMarker(): UpdateRestartMarker | null {
  const marker: UpdateRestartMarker = {
    createdAt: Date.now(),
    expiresAt: Date.now() + UPDATE_RESTART_MARKER_TTL_MS,
    version: updateStatus.version || null,
  };

  try {
    fs.mkdirSync(path.dirname(getUpdateRestartMarkerPath()), { recursive: true });
    fs.writeFileSync(getUpdateRestartMarkerPath(), JSON.stringify(marker), "utf8");
    return marker;
  } catch (error) {
    console.warn("[Rift updater] Failed to write restart marker:", error);
    return null;
  }
}

function getAppIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(getAssetPath("icon.png"));
}

function normalizePattern(value: string | null | undefined): string | null {
  const pattern = value?.trim();
  return pattern && pattern.length > 0 ? pattern : null;
}

function getSystemLocale(): string {
  try {
    const preferred = app.getPreferredSystemLanguages();
    if (preferred.length > 0 && preferred[0]?.trim()) {
      return preferred[0];
    }
  } catch {
    /* ignore */
  }

  try {
    const locale = app.getLocale();
    if (locale?.trim()) {
      return locale;
    }
  } catch {
    /* ignore */
  }

  return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
}

function readWindowsInternationalValues(): Partial<Record<WindowsInternationalValueName, string>> | null {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const output = execFileSync("reg.exe", ["query", "HKCU\\Control Panel\\International"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1500,
    });

    const values: Partial<Record<WindowsInternationalValueName, string>> = {};
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const match = line.match(/^([^\s]+)\s+REG_\w+\s+(.*)$/);
      if (!match) {
        continue;
      }

      const [, name, value] = match;
      if (
        name === "LocaleName"
        || name === "sShortDate"
        || name === "sLongDate"
        || name === "sShortTime"
        || name === "sTimeFormat"
        || name === "iTime"
      ) {
        values[name] = value.trim();
      }
    }

    return values;
  } catch (error) {
    console.warn("[Rift] Failed to read Windows international settings:", error);
    return null;
  }
}

function readDesktopDateTimePreferences(): DesktopDateTimePreferences {
  const locale = getSystemLocale();

  if (process.platform !== "win32") {
    return {
      locale,
      shortDatePattern: null,
      longDatePattern: null,
      shortTimePattern: null,
      uses24HourClock: null,
    };
  }

  const values = readWindowsInternationalValues();
  const shortTimePattern = normalizePattern(values?.sShortTime) ?? normalizePattern(values?.sTimeFormat);
  const iTimeValue = values?.iTime?.trim();

  return {
    locale: values?.LocaleName?.trim() || locale,
    shortDatePattern: normalizePattern(values?.sShortDate),
    longDatePattern: normalizePattern(values?.sLongDate),
    shortTimePattern,
    uses24HourClock: iTimeValue === "1"
      ? true
      : iTimeValue === "0"
        ? false
        : null,
  };
}

function getDesktopDateTimePreferences(): DesktopDateTimePreferences {
  if (!desktopDateTimePreferencesCache) {
    desktopDateTimePreferencesCache = readDesktopDateTimePreferences();
  }

  return desktopDateTimePreferencesCache;
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

function clearPendingDisplaySourceSelection(): void {
  pendingDisplaySourceId = null;
  pendingDisplaySourceKind = null;
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
      const sourceKind = pendingDisplaySourceKind;
      clearPendingDisplaySourceSelection();

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

        if (request.audioRequested && process.platform === "win32" && sourceKind === "screen") {
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

function buildCacheBustedUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("riftappDesktopRefresh", String(Date.now()));
    return url.toString();
  } catch {
    return rawUrl;
  }
}

async function reloadFrontendIgnoringCache(webContents: Electron.WebContents): Promise<boolean> {
  const currentUrl = webContents.getURL();
  if (!isTrustedRendererOrigin(currentUrl)) {
    return false;
  }

  const targetWindow = BrowserWindow.fromWebContents(webContents);
  const shouldShowReloadSplash = app.isPackaged && Boolean(targetWindow && !targetWindow.isDestroyed());
  const splashMinimumPromise = shouldShowReloadSplash
    ? new Promise<void>((resolve) => setTimeout(resolve, FRONTEND_RELOAD_SPLASH_MIN_MS))
    : Promise.resolve();

  if (shouldShowReloadSplash) {
    if (!splashWindow || splashWindow.isDestroyed()) {
      createSplashWindow();
    }
    updateSplash("Refreshing Rift…", "SYNCING");
    targetWindow?.hide();
  }

  try {
    await Promise.all([
      splashMinimumPromise,
      webContents.loadURL(buildCacheBustedUrl(currentUrl), {
        extraHeaders: "pragma: no-cache\ncache-control: no-cache",
      }),
    ]);
    return true;
  } catch (error) {
    console.warn("[Rift] Failed to reload frontend after clearing cache:", error);
    try {
      const fallbackReadyPromise = waitForMainWindowReady(targetWindow, FRONTEND_RELOAD_FALLBACK_READY_TIMEOUT_MS);
      webContents.reloadIgnoringCache();
      await Promise.allSettled([splashMinimumPromise, fallbackReadyPromise]);
      return true;
    } catch {
      return false;
    }
  } finally {
    if (shouldShowReloadSplash) {
      closeSplash();
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.show();
        targetWindow.focus();
      }
    }
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
    ? `<img src="data:image/png;base64,${b64}" width="58" height="58" style="display:block;filter:drop-shadow(0 8px 20px rgba(0,0,0,0.16))"/>`
    : `<svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true"><path d="M14 22c5.5-8.5 16.5-8.5 22 0 3.5 5.5 9.5 5.5 14.5 0" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" /><path d="M14 42c5.5-8.5 16.5-8.5 22 0 3.5 5.5 9.5 5.5 14.5 0" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

  return `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%}
body{background:#17191f;color:#f2f3f5;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;
-webkit-app-region:drag;user-select:none;overflow:hidden;position:relative}
body::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at top,rgba(88,101,242,0.22),transparent 38%),linear-gradient(180deg,#1b1d23 0%,#17191f 100%)}
body::after{content:'';position:absolute;inset:0;opacity:.08;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:32px 32px;background-position:center}
.scene{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px}
.orb{position:relative;display:flex;align-items:center;justify-content:center;width:120px;height:120px;border-radius:999px;background:radial-gradient(circle at 30% 30%,#6d78ff,#4b52df 58%,#363bb1);box-shadow:0 24px 80px rgba(88,101,242,.38)}
.orb::before{content:'';position:absolute;inset:9px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at top,rgba(255,255,255,.16),transparent 58%)}
.orb > *{position:relative}
.title{margin-top:34px;font-size:32px;font-weight:600;letter-spacing:-.03em;color:white}
#message{margin-top:14px;max-width:520px;font-size:18px;line-height:1.8;font-style:italic;color:#c3cad7}
#status{margin-top:34px;font-size:11px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#7f8ea3}
.track{margin-top:12px;width:220px;height:6px;background:#20232a;border-radius:999px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.fill{height:100%;width:30%;background:linear-gradient(90deg,#5865f2,#7c86ff);border-radius:999px;transition:width .4s ease}
.fill.ind{width:38%;animation:slide 1.25s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(500%)}}
</style></head><body>
<div class="scene">
<div class="orb">${icon}</div>
<div class="title">Rift</div>
<div id="message">Warming up the latest build and getting your session ready.</div>
<div id="status">Checking</div>
<div class="track"><div class="fill ind" id="bar"></div></div>
</div>
</body></html>`;
}

function buildDetachedUpdateSplashScript(markerPath: string, version: string | null): string {
  const iconBase64 = getIconBase64();
  const detailText = version ? `Desktop update v${version}` : "Desktop update";

  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing.Drawing2D')
[System.Windows.Forms.Application]::EnableVisualStyles()

$markerPath = ${JSON.stringify(markerPath)}
$iconBase64 = ${JSON.stringify(iconBase64)}
$detailText = ${JSON.stringify(detailText)}

$background = [System.Drawing.ColorTranslator]::FromHtml('#17191f')
$panel = [System.Drawing.ColorTranslator]::FromHtml('#20232a')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#b5bac1')
$soft = [System.Drawing.ColorTranslator]::FromHtml('#7f8ea3')
$accent = [System.Drawing.ColorTranslator]::FromHtml('#5865f2')
$accentEdge = [System.Drawing.ColorTranslator]::FromHtml('#7c86ff')

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Rift'
$form.Width = 620
$form.Height = 420
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = $background
$form.ForeColor = [System.Drawing.Color]::White
$form.TopMost = $true
$form.ShowInTaskbar = $true

$shell = New-Object System.Windows.Forms.Panel
$shell.Dock = 'Fill'
$shell.BackColor = $background
$form.Controls.Add($shell)

$orb = New-Object System.Windows.Forms.Panel
$orb.Width = 120
$orb.Height = 120
$orb.Left = [Math]::Floor(($form.ClientSize.Width - $orb.Width) / 2)
$orb.Top = 76
$orb.BackColor = $accent
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $orb.Width, $orb.Height)
$orb.Region = New-Object System.Drawing.Region($path)
$shell.Controls.Add($orb)

$picture = New-Object System.Windows.Forms.PictureBox
$picture.Width = 58
$picture.Height = 58
$picture.SizeMode = 'Zoom'
$picture.Left = [Math]::Floor(($orb.Width - $picture.Width) / 2)
$picture.Top = [Math]::Floor(($orb.Height - $picture.Height) / 2)
if ($iconBase64.Length -eq 0) {
  $fallback = New-Object System.Windows.Forms.Label
  $fallback.Width = $orb.Width
  $fallback.Height = $orb.Height
  $fallback.TextAlign = 'MiddleCenter'
  $fallback.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 28)
  $fallback.ForeColor = [System.Drawing.Color]::White
  $fallback.Text = 'R'
  $orb.Controls.Add($fallback)
}
if ($iconBase64.Length -gt 0) {
  try {
    $bytes = [System.Convert]::FromBase64String($iconBase64)
    $stream = New-Object System.IO.MemoryStream(,$bytes)
    $picture.Image = [System.Drawing.Image]::FromStream($stream)
  } catch {}
}
$orb.Controls.Add($picture)

$title = New-Object System.Windows.Forms.Label
$title.AutoSize = $false
$title.Width = $form.ClientSize.Width - 120
$title.Height = 36
$title.Left = 60
$title.Top = 224
$title.TextAlign = 'MiddleCenter'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 18)
$title.ForeColor = [System.Drawing.Color]::White
$title.Text = 'Rift is relaunching'
$shell.Controls.Add($title)

$body = New-Object System.Windows.Forms.Label
$body.AutoSize = $false
$body.Width = $form.ClientSize.Width - 150
$body.Height = 54
$body.Left = 75
$body.Top = 264
$body.TextAlign = 'MiddleCenter'
$body.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 11, [System.Drawing.FontStyle]::Italic)
$body.ForeColor = $muted
$body.Text = 'Applying the update, loading the latest build, and reconnecting your session.'
$shell.Controls.Add($body)

$detail = New-Object System.Windows.Forms.Label
$detail.AutoSize = $false
$detail.Width = $form.ClientSize.Width - 120
$detail.Height = 20
$detail.Left = 60
$detail.Top = 314
$detail.TextAlign = 'MiddleCenter'
$detail.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$detail.ForeColor = $soft
$detail.Text = $detailText
$shell.Controls.Add($detail)

$status = New-Object System.Windows.Forms.Label
$status.AutoSize = $false
$status.Width = 220
$status.Height = 24
$status.Left = [Math]::Floor(($form.ClientSize.Width - $status.Width) / 2)
$status.Top = 344
$status.TextAlign = 'MiddleCenter'
$status.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$status.ForeColor = $soft
$status.Text = 'RESTARTING'
$shell.Controls.Add($status)

$barTrack = New-Object System.Windows.Forms.Panel
$barTrack.Width = 220
$barTrack.Height = 6
$barTrack.Left = [Math]::Floor(($form.ClientSize.Width - $barTrack.Width) / 2)
$barTrack.Top = 374
$barTrack.BackColor = $panel
$shell.Controls.Add($barTrack)

$barFill = New-Object System.Windows.Forms.Panel
$barFill.Width = 84
$barFill.Height = 6
$barFill.Left = 0
$barFill.Top = 0
$barFill.BackColor = $accent
$barTrack.Controls.Add($barFill)

$tick = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 80
$timer.Add_Tick({
  $script:tick = ($script:tick + 1) % 170
  $script:barFill.Left = $script:tick - 84

  if (-not (Test-Path -LiteralPath $markerPath)) {
    $timer.Stop()
    $form.Close()
    return
  }

  try {
    $json = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ($null -ne $json.expiresAt -and [int64]$json.expiresAt -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) {
      Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
      $timer.Stop()
      $form.Close()
    }
  } catch {}
})

$form.Add_Shown({ $timer.Start() })
$form.Add_FormClosed({ $timer.Stop() })
[System.Windows.Forms.Application]::Run($form)
`;
}

function launchDetachedUpdateSplash(): void {
  if (process.platform !== "win32" || !app.isPackaged) {
    return;
  }

  const marker = writeUpdateRestartMarker();
  if (!marker) {
    return;
  }

  try {
    const encodedCommand = Buffer.from(
      buildDetachedUpdateSplashScript(getUpdateRestartMarkerPath(), marker.version),
      "utf16le",
    ).toString("base64");

    const powershellPath = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );

    const child = spawn(
      powershellPath,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-STA",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        encodedCommand,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );

    child.unref();
  } catch (error) {
    clearUpdateRestartMarker();
    console.warn("[Rift updater] Failed to launch detached restart splash:", error);
  }
}

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 620,
    height: 420,
    frame: false,
    resizable: false,
    center: true,
    skipTaskbar: false,
    backgroundColor: "#17191f",
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

function waitForMainWindowReady(win: BrowserWindow | null, timeoutMs = MAIN_WINDOW_READY_TIMEOUT_MS): Promise<void> {
  if (!win || win.isDestroyed()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timer);
      win.removeListener("ready-to-show", finish);
      win.removeListener("closed", finish);
      win.webContents.removeListener("did-finish-load", finish);
      win.webContents.removeListener("did-fail-load", finish);
    };

    const timer = setTimeout(finish, timeoutMs);

    win.once("ready-to-show", finish);
    win.once("closed", finish);
    win.webContents.once("did-finish-load", finish);
    win.webContents.once("did-fail-load", finish);
  });
}

function updateSplash(message: string, statusLabel = "CONNECTING", percent?: number): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const js =
    percent !== undefined
    ? `document.getElementById('message').textContent=${JSON.stringify(message)};
      document.getElementById('status').textContent=${JSON.stringify(statusLabel)};
      var b=document.getElementById('bar');b.classList.remove('ind');b.style.width='${Math.round(percent)}%';`
    : `document.getElementById('message').textContent=${JSON.stringify(message)};
      document.getElementById('status').textContent=${JSON.stringify(statusLabel)};
      var b=document.getElementById('bar');b.classList.add('ind');b.style.width='38%';`;
  splashWindow.webContents.executeJavaScript(js).catch(() => {});
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function syncTaskbarAttention(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.flashFrame(taskbarAttentionRequested && !mainWindow.isFocused());
}

function setTaskbarAttentionRequested(requested: boolean): void {
  taskbarAttentionRequested = requested;
  syncTaskbarAttention();
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
  mainWindow.on("blur", () => syncTaskbarAttention());

  mainWindow.on("close", (e) => {
    if (allowMainWindowClose) return;
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("focus", () => {
    setTaskbarAttentionRequested(false);
    if (!isDev) {
      void runBackgroundUpdateCheck("focus");
    }
  });
}

// ── Tray ───────────────────────────────────────────────────

function restartToApplyUpdate(): void {
  allowMainWindowClose = true;
  launchDetachedUpdateSplash();
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
  ipcMain.handle("app:get-date-time-preferences", () => getDesktopDateTimePreferences());
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

  ipcMain.on("app:set-attention-requested", (event, requested: boolean) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) {
      return;
    }

    setTaskbarAttentionRequested(requested === true);
  });

  ipcMain.handle("app:reload-frontend-ignoring-cache", async (event) => {
    return reloadFrontendIgnoringCache(event.sender);
  });

  ipcMain.handle("desktop:list-display-sources", async (event) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) {
      return [];
    }

    return getDesktopDisplaySources({ width: 640, height: 360 });
  });

  ipcMain.handle("desktop:select-display-source", async (event, sourceId: string) => {
    if (!isTrustedRendererOrigin(event.sender.getURL())) {
      return false;
    }

    if (typeof sourceId !== "string" || sourceId.trim().length === 0) {
      clearPendingDisplaySourceSelection();
      return false;
    }

    const source = await findDesktopDisplaySourceById(sourceId);
    if (!source) {
      clearPendingDisplaySourceSelection();
      return false;
    }

    pendingDisplaySourceId = source.id;
    pendingDisplaySourceKind = source.id.startsWith("window:") ? "window" : "screen";
    return true;
  });
}

// ── Auto-updater ───────────────────────────────────────────
// Splash: quick check only (no download).
// After main window: download in background, notify frontend when ready.

function configureUpdaterFeed(): void {
  const customUrl = process.env.RIFT_UPDATE_URL?.trim();
  const updateUrl = customUrl && customUrl.length > 0
    ? customUrl
    : DEFAULT_UPDATE_FEED_URL;

  try {
    autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });
  } catch {
    /* ignore */
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
      updateSplash("Warming up the latest build and checking for updates.", "CHECKING")
    );
    autoUpdater.on("update-available", () => {
      updateSplash("Everything is in sync. Starting Rift now.", "CONNECTING", 100);
      resolve();
    });
    autoUpdater.on("update-not-available", () => {
      updateSplash("Everything is in sync. Starting Rift now.", "CONNECTING", 100);
      resolve();
    });
    autoUpdater.on("error", () => {
      updateSplash("Everything is in sync. Starting Rift now.", "CONNECTING", 100);
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

    const pendingUpdateRestart = hasPendingUpdateRestartMarker();

    if (isDev) {
      createWindow(true);
      createTray();
    } else if (pendingUpdateRestart) {
      createWindow(false);
      createTray();

      await waitForMainWindowReady(mainWindow);
      clearUpdateRestartMarker();
      mainWindow?.show();
      mainWindow?.focus();

      backgroundUpdateDownload();
    } else {
      createSplashWindow();
      createWindow(false);
      createTray();

      const minDisplayTime = new Promise<void>((r) => setTimeout(r, 3000));
      const updateCheck = splashUpdateCheck();
      await Promise.all([minDisplayTime, updateCheck]);
      await waitForMainWindowReady(mainWindow);

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
    clearPendingDisplaySourceSelection();
    if (!updateReady) {
      clearUpdateRestartMarker();
    }
    taskbarAttentionRequested = false;
    clearUpdateStatusResetTimer();
    clearBackgroundUpdateTimer();
    tray?.destroy();
    tray = null;
  });
}
