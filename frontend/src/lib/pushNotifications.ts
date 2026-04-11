import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useDMStore } from '../stores/dmStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useVoiceStore } from '../stores/voiceStore';

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
    const resp = await fetch(`${API_BASE}/device-tokens`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ token, platform }),
    });
    if (!resp.ok) {
      console.error('Device token registration returned', resp.status);
      return;
    }
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

  await PushNotifications.addListener('registration', (token) => {
    const platform = Capacitor.getPlatform() as 'ios' | 'android';
    void registerTokenOnServer(token.value, platform);
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration failed:', err);
  });

  await PushNotifications.register();

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const data = notification.data as Record<string, string> | undefined;
    if (!data) {
      return;
    }

    if (data.type === 'dm') {
      void useNotificationStore.getState().loadNotifications();
      void useDMStore.getState().loadConversations();
      return;
    }

    if (data.type === 'dm_call' || data.type === 'dm_call_missed') {
      void useDMStore.getState().loadConversations();
      void useVoiceStore.getState().loadConversationCallStates();
    }
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
    const data = action.notification.data;
    if (!data) return;

    const { hub_id, stream_id, type, conversation_id } = data as Record<string, string>;

    if ((type === 'dm_call' || type === 'dm_call_missed') && conversation_id) {
      try {
        await useDMStore.getState().loadConversations();
        await useVoiceStore.getState().loadConversationCallStates();
      } catch (error) {
        console.warn('Failed to hydrate DM call state from push action.', error);
      }

	  navigate(`/app/dms/${conversation_id}`);
	  return;
	}

	if ((type === 'dm' || type === 'dm_call' || type === 'dm_call_missed') && conversation_id) {
      navigate(`/app/dms/${conversation_id}`);
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
