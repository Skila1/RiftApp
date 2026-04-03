import type { AuthResponse, Hub, HubInvite, Stream, Message, User, Attachment, Notification, Conversation } from '../types';

const BASE = '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${BASE}${path}`, { ...options, headers });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data as T;
  }

  // Auth
  register(username: string, password: string, email?: string) {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email }),
    });
  }

  login(username: string, password: string) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  refreshToken(refreshToken: string) {
    return this.request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  getMe() {
    return this.request<User>('/users/@me');
  }

  updateMe(data: { username?: string; display_name?: string; bio?: string; avatar_url?: string }) {
    return this.request<User>('/users/@me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Hubs
  getHubs() {
    return this.request<Hub[]>('/hubs');
  }

  createHub(name: string) {
    return this.request<Hub>('/hubs', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  getHub(hubId: string) {
    return this.request<Hub>(`/hubs/${hubId}`);
  }

  getHubMembers(hubId: string) {
    return this.request<User[]>(`/hubs/${hubId}/members`);
  }

  joinHub(hubId: string) {
    return this.request(`/hubs/${hubId}/join`, { method: 'POST' });
  }

  updateHub(hubId: string, data: { name?: string; icon_url?: string }) {
    return this.request<Hub>(`/hubs/${hubId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  createInvite(hubId: string, options?: { max_uses?: number; expires_in?: number }) {
    return this.request<HubInvite>(`/hubs/${hubId}/invite`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  }

  joinInvite(code: string) {
    return this.request<{ status: string; hub: Hub }>(`/invites/${code}`, {
      method: 'POST',
    });
  }

  // Streams
  getStreams(hubId: string) {
    return this.request<Stream[]>(`/hubs/${hubId}/streams`);
  }

  createStream(hubId: string, name: string, type: number = 0) {
    return this.request<Stream>(`/hubs/${hubId}/streams`, {
      method: 'POST',
      body: JSON.stringify({ name, type }),
    });
  }

  // Messages
  getMessages(streamId: string, before?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request<Message[]>(`/streams/${streamId}/messages?${params}`);
  }

  sendMessage(streamId: string, content: string, attachmentIds?: string[]) {
    return this.request<Message>(`/streams/${streamId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, attachment_ids: attachmentIds }),
    });
  }

  editMessage(messageId: string, content: string) {
    return this.request<Message>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  deleteMessage(messageId: string) {
    return this.request(`/messages/${messageId}`, { method: 'DELETE' });
  }

  addReaction(messageId: string, emoji: string) {
    return this.request(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  removeReaction(messageId: string, emoji: string) {
    return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    });
  }

  // Read states
  ackStream(streamId: string, messageId: string) {
    return this.request(`/streams/${streamId}/ack`, {
      method: 'PUT',
      body: JSON.stringify({ message_id: messageId }),
    });
  }

  getReadStates(hubId: string) {
    return this.request<import('../types').StreamReadState[]>(`/hubs/${hubId}/read-states`);
  }

  // Notifications
  getNotifications() {
    return this.request<Notification[]>('/notifications');
  }

  markNotificationRead(notifId: string) {
    return this.request(`/notifications/${notifId}/read`, { method: 'PATCH' });
  }

  markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  // Direct Messages
  getDMs() {
    return this.request<Conversation[]>('/dms');
  }

  createOrOpenDM(recipientId: string) {
    return this.request<Conversation>('/dms', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: recipientId }),
    });
  }

  getDMMessages(conversationId: string, before?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request<Message[]>(`/dms/${conversationId}/messages?${params}`);
  }

  sendDMMessage(conversationId: string, content: string, attachmentIds?: string[]) {
    return this.request<Message>(`/dms/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, attachment_ids: attachmentIds }),
    });
  }

  ackDM(conversationId: string, messageId: string) {
    return this.request(`/dms/${conversationId}/ack`, {
      method: 'PUT',
      body: JSON.stringify({ message_id: messageId }),
    });
  }

  getDMReadStates() {
    return this.request<import('../types').DMReadState[]>('/dms/read-states');
  }

  // User search
  searchUser(username: string) {
    return this.request<User>(`/users/search?q=${encodeURIComponent(username)}`);
  }

  // Voice
  getVoiceToken(streamId: string) {
    return this.request<{ token: string; url: string; room: string }>(`/voice/token?streamID=${streamId}`);
  }

  // Uploads
  async uploadFile(file: File): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    return data as Attachment;
  }
}

export const api = new ApiClient();
