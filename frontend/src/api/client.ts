import type { AuthResponse, Hub, HubInvite, Stream, Category, Message, User, Attachment, Notification, Conversation, Friendship, Block, RelationshipType } from '../types';

const BASE = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
  private token: string | null = null;
  private refreshTokenValue: string | null = null;
  private refreshPromise: Promise<AuthResponse> | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setRefreshToken(token: string | null) {
    this.refreshTokenValue = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let res = await fetch(`${BASE}${path}`, { ...options, headers });

    if (res.status === 401 && this.refreshTokenValue && !path.includes('/auth/')) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.token}`;
        res = await fetch(`${BASE}${path}`, { ...options, headers });
      }
    }

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data as T;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshTokenValue) return false;
    try {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken(this.refreshTokenValue);
      }
      const res = await this.refreshPromise;
      this.token = res.access_token;
      this.refreshTokenValue = res.refresh_token;
      localStorage.setItem('riftapp_token', res.access_token);
      localStorage.setItem('riftapp_refresh', res.refresh_token);
      return true;
    } catch {
      this.token = null;
      this.refreshTokenValue = null;
      localStorage.removeItem('riftapp_token');
      localStorage.removeItem('riftapp_refresh');
      return false;
    } finally {
      this.refreshPromise = null;
    }
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

  logout(refreshToken?: string) {
    return this.request<void>('/auth/logout', {
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

  getHubs() { return this.request<Hub[]>('/hubs'); }
  createHub(name: string) { return this.request<Hub>('/hubs', { method: 'POST', body: JSON.stringify({ name }) }); }
  getHub(hubId: string) { return this.request<Hub>(`/hubs/${hubId}`); }
  getHubMembers(hubId: string) { return this.request<User[]>(`/hubs/${hubId}/members`); }
  joinHub(hubId: string) { return this.request(`/hubs/${hubId}/join`, { method: 'POST' }); }
  updateHub(hubId: string, data: { name?: string; icon_url?: string }) { return this.request<Hub>(`/hubs/${hubId}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  createInvite(hubId: string, options?: { max_uses?: number; expires_in?: number }) { return this.request<HubInvite>(`/hubs/${hubId}/invite`, { method: 'POST', body: JSON.stringify(options ?? {}) }); }
  joinInvite(code: string) { return this.request<{ status: string; hub: Hub }>(`/invites/${code}`, { method: 'POST' }); }
  getInviteInfo(code: string) { return this.request<{ code: string; hub_id: string; hub_name: string; hub_icon_url?: string; member_count: number; expires_at?: string }>(`/invites/${code}`); }

  getStreams(hubId: string) { return this.request<Stream[]>(`/hubs/${hubId}/streams`); }
  createStream(hubId: string, name: string, type: number = 0, categoryId?: string) { return this.request<Stream>(`/hubs/${hubId}/streams`, { method: 'POST', body: JSON.stringify({ name, type, category_id: categoryId }) }); }

  getCategories(hubId: string) { return this.request<Category[]>(`/hubs/${hubId}/categories`); }
  createCategory(hubId: string, name: string) { return this.request<Category>(`/hubs/${hubId}/categories`, { method: 'POST', body: JSON.stringify({ name }) }); }
  deleteCategory(hubId: string, categoryId: string) { return this.request(`/hubs/${hubId}/categories/${categoryId}`, { method: 'DELETE' }); }

  getMessages(streamId: string, before?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request<Message[]>(`/streams/${streamId}/messages?${params}`);
  }
  sendMessage(streamId: string, content: string, attachmentIds?: string[]) { return this.request<Message>(`/streams/${streamId}/messages`, { method: 'POST', body: JSON.stringify({ content, attachment_ids: attachmentIds }) }); }
  editMessage(messageId: string, content: string) { return this.request<Message>(`/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ content }) }); }
  deleteMessage(messageId: string) { return this.request(`/messages/${messageId}`, { method: 'DELETE' }); }

  addReaction(messageId: string, emoji: string) { return this.request(`/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }); }
  removeReaction(messageId: string, emoji: string) { return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }); }

  ackStream(streamId: string, messageId: string) { return this.request(`/streams/${streamId}/ack`, { method: 'PUT', body: JSON.stringify({ message_id: messageId }) }); }
  getReadStates(hubId: string) { return this.request<import('../types').StreamReadState[]>(`/hubs/${hubId}/read-states`); }

  getNotifications() { return this.request<Notification[]>('/notifications'); }
  markNotificationRead(notifId: string) { return this.request(`/notifications/${notifId}/read`, { method: 'PATCH' }); }
  markAllNotificationsRead() { return this.request('/notifications/read-all', { method: 'POST' }); }

  getDMs() { return this.request<Conversation[]>('/dms'); }
  createOrOpenDM(recipientId: string) { return this.request<Conversation>('/dms', { method: 'POST', body: JSON.stringify({ recipient_id: recipientId }) }); }
  getDMMessages(conversationId: string, before?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request<Message[]>(`/dms/${conversationId}/messages?${params}`);
  }
  sendDMMessage(conversationId: string, content: string, attachmentIds?: string[]) { return this.request<Message>(`/dms/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, attachment_ids: attachmentIds }) }); }
  ackDM(conversationId: string, messageId: string) { return this.request(`/dms/${conversationId}/ack`, { method: 'PUT', body: JSON.stringify({ message_id: messageId }) }); }
  getDMReadStates() { return this.request<import('../types').DMReadState[]>('/dms/read-states'); }

  searchUser(username: string) { return this.request<User>(`/users/search?q=${encodeURIComponent(username)}`); }

  // Friends
  listFriends() { return this.request<Friendship[]>('/friends'); }
  sendFriendRequest(userId: string) { return this.request('/friends/request', { method: 'POST', body: JSON.stringify({ user_id: userId }) }); }
  acceptFriendRequest(userId: string) { return this.request(`/friends/${userId}/accept`, { method: 'POST' }); }
  rejectFriendRequest(userId: string) { return this.request(`/friends/${userId}/reject`, { method: 'POST' }); }
  cancelFriendRequest(userId: string) { return this.request(`/friends/${userId}/cancel`, { method: 'POST' }); }
  removeFriend(userId: string) { return this.request(`/friends/${userId}`, { method: 'DELETE' }); }
  pendingIncoming() { return this.request<Friendship[]>('/friends/pending/incoming'); }
  pendingOutgoing() { return this.request<Friendship[]>('/friends/pending/outgoing'); }
  pendingCount() { return this.request<{ count: number }>('/friends/pending/count'); }
  getRelationship(userId: string) { return this.request<{ relationship: RelationshipType }>(`/relationships/${userId}`); }

  // Blocks
  blockUser(userId: string) { return this.request('/blocks', { method: 'POST', body: JSON.stringify({ user_id: userId }) }); }
  unblockUser(userId: string) { return this.request(`/blocks/${userId}`, { method: 'DELETE' }); }
  listBlocked() { return this.request<Block[]>('/blocks'); }
  getVoiceToken(streamId: string) { return this.request<{ token: string; url: string; room: string }>(`/voice/token?streamID=${streamId}`); }
  getVoiceStates(hubId: string) { return this.request<Record<string, string[]>>(`/hubs/${hubId}/voice-states`); }

  async uploadFile(file: File): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    const headers: Record<string, string> = {};
    if (this.token) { headers['Authorization'] = `Bearer ${this.token}`; }
    const res = await fetch(`${BASE}/upload`, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data as Attachment;
  }
}

export const api = new ApiClient();
