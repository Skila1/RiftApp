import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

export async function initStatusBar(): Promise<void> {
  if (!isNative()) return;

  await StatusBar.setStyle({ style: Style.Dark });

  if (getPlatform() === 'android') {
    await StatusBar.setBackgroundColor({ color: '#111214' });
  }
}

export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  await SplashScreen.hide();
}



export function setupBackButton(callback: () => void): () => void {
  if (getPlatform() !== 'android') return () => {};

  const listener = App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      callback();
    }
  });

  return () => {
    void listener.then((h) => h.remove());
  };
}

export function setupDeepLinks(
  navigate: (path: string) => void,
): () => void {
  if (!isNative()) return () => {};

  const listener = App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    const url = new URL(event.url);
    const hostPrefix = url.host && url.protocol !== 'https:' && url.protocol !== 'http:' ? `/${url.host}` : '';
    const path = hostPrefix + url.pathname + url.search + url.hash;
    if (path) {
      navigate(path);
    }
  });

  return () => {
    void listener.then((h) => h.remove());
  };
}

export async function initCapacitor(): Promise<void> {
  if (!isNative()) return;
  await initStatusBar();
  await hideSplash();
}
