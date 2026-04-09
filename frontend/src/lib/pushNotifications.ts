import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

let currentToken: string | null = null;

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('riftapp_token');
  if (token) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
  return { 'Content-Type': 'application/json' };
}

async function registerTokenOnServer(token: string, platform: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/device-tokens`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token, platform }),
    });
    currentToken = token;
  } catch (err) {
    console.error('Failed to register device token:', err);
  }
}

async function unregisterTokenOnServer(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/device-tokens`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    console.error('Failed to unregister device token:', err);
  }
}

export async function initPushNotifications(
  navigate: (path: string) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    console.warn('Push notification permission not granted');
    return;
  }

  await PushNotifications.register();

  await PushNotifications.addListener('registration', (token) => {
    const platform = Capacitor.getPlatform() as 'ios' | 'android';
    void registerTokenOnServer(token.value, platform);
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration failed:', err);
  });

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received in foreground:', notification);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data;
    if (!data) return;

    const { hub_id, stream_id, type } = data as Record<string, string>;

    if (type === 'dm' && data.reference_id) {
      navigate(`/app/dms/${data.reference_id}`);
    } else if (hub_id && stream_id) {
      navigate(`/app/hubs/${hub_id}/${stream_id}`);
    } else if (hub_id) {
      navigate(`/app/hubs/${hub_id}`);
    } else {
      navigate('/app');
    }
  });
}

export async function teardownPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (currentToken) {
    await unregisterTokenOnServer(currentToken);
    currentToken = null;
  }

  await PushNotifications.removeAllListeners();
}
