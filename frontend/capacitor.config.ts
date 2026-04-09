import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.riftapp.app',
  appName: 'RiftApp',
  webDir: 'dist',
  server: {
    // During local dev, point the native WebView at the Vite dev server
    // so HMR works. Comment out (or remove) for production builds.
    ...(process.env.CAPACITOR_DEV === '1'
      ? { url: 'http://10.0.2.2:5173', cleartext: true }
      : {}),
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#111214',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
