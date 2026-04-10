import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.riftapp.app',
  appName: 'RiftApp',
  webDir: 'dist',
  server: {
    ...(process.env.CAPACITOR_DEV_URL
      ? { url: process.env.CAPACITOR_DEV_URL, cleartext: true }
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
