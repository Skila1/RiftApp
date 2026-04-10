import type {
  DesktopAPI,
  DesktopBuildInfo,
  DesktopDateTimePreferences,
  DesktopDisplaySource,
  DesktopUpdateStatus,
} from '@/types/desktop';

export const idleDesktopUpdateStatus: DesktopUpdateStatus = {
  state: 'idle',
  version: '',
  progress: null,
  message: '',
};

export const defaultDesktopDateTimePreferences: DesktopDateTimePreferences = {
  locale: typeof navigator !== 'undefined' && navigator.language ? navigator.language : Intl.DateTimeFormat().resolvedOptions().locale,
  shortDatePattern: null,
  longDatePattern: null,
  shortTimePattern: null,
  uses24HourClock: null,
};

export function getDesktop(): DesktopAPI | undefined {
  if (typeof window === 'undefined') return undefined;

  const d = window.desktop as Partial<DesktopAPI> | undefined;
  if (d && typeof d.minimize === 'function' && typeof d.maximize === 'function' && typeof d.close === 'function' && typeof d.isMaximized === 'function') {
    return {
      minimize: () => {
        void d.minimize?.();
      },
      maximize: () => {
        void d.maximize?.();
      },
      close: () => {
        void d.close?.();
      },
      isMaximized: () => d.isMaximized?.() ?? Promise.resolve(false),
      getVersion: () => d.getVersion?.() ?? Promise.resolve(''),
      getBuildInfo: () => d.getBuildInfo?.() ?? Promise.resolve({
        appVersion: '',
        electronVersion: '',
        platform: '',
        arch: '',
        osVersion: '',
      } satisfies DesktopBuildInfo),
      getDateTimePreferences: () => d.getDateTimePreferences?.() ?? Promise.resolve(defaultDesktopDateTimePreferences),
      getUpdateStatus: () => d.getUpdateStatus?.() ?? Promise.resolve(idleDesktopUpdateStatus),
      isUpdateReady: () => d.isUpdateReady?.() ?? Promise.resolve(false),
      reloadFrontendIgnoringCache: () => d.reloadFrontendIgnoringCache?.() ?? Promise.resolve(false),
      checkForUpdates: () => d.checkForUpdates?.() ?? Promise.resolve(idleDesktopUpdateStatus),
      listDisplaySources: () => d.listDisplaySources?.() ?? Promise.resolve([] satisfies DesktopDisplaySource[]),
      selectDisplaySource: (sourceId) => d.selectDisplaySource?.(sourceId) ?? Promise.resolve(false),
      onMaximizedChange: (cb) => d.onMaximizedChange?.(cb) ?? (() => {}),
      onUpdateStatus: (cb) => d.onUpdateStatus?.(cb) ?? (() => {}),
      onUpdateReady: (cb) => d.onUpdateReady?.(cb) ?? (() => {}),
      restartToUpdate: () => {
        d.restartToUpdate?.();
      },
    };
  }

  const r = window.riftDesktop;
  if (!r) return undefined;

  return {
    minimize: () => {
      void r.minimize();
    },
    maximize: () => {
      void r.maximizeToggle();
    },
    close: () => {
      void r.close();
    },
    isMaximized: () => r.isMaximized(),
    getVersion: async () => '',
    getBuildInfo: async () => ({
      appVersion: '',
      electronVersion: '',
      platform: '',
      arch: '',
      osVersion: '',
    }),
    getDateTimePreferences: async () => defaultDesktopDateTimePreferences,
    getUpdateStatus: async () => idleDesktopUpdateStatus,
    isUpdateReady: async () => false,
    reloadFrontendIgnoringCache: async () => false,
    checkForUpdates: async () => idleDesktopUpdateStatus,
    listDisplaySources: async () => [],
    selectDisplaySource: async () => false,
    onMaximizedChange: r.onMaximizedChange,
    onUpdateStatus: () => () => {},
    onUpdateReady: () => () => {},
    restartToUpdate: () => {},
  };
}