const BASE = import.meta.env.VITE_API_URL || '/api';

class AdminApiClient {
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal }).finally(() => clearTimeout(timer));

    if (res.status === 204) return undefined as unknown as T;

    const contentType = res.headers.get('content-type') || '';
    let body: Record<string, unknown> | undefined;
    if (contentType.includes('application/json')) {
      try { body = await res.json(); } catch { /* non-parseable JSON */ }
    }
    if (!res.ok) {
      const msg = body?.error ? String(body.error) : await res.text().catch(() => `Request failed (${res.status})`);
      throw new Error(msg);
    }
    return (body ?? {}) as T;
  }

  // Auth
  login(email: string, password: string) {
    return this.request<{ admin_token?: string; login_token?: string; requires_2fa?: boolean; needs_setup?: boolean; needs_password_set?: boolean; totp_method?: string; role?: string }>('/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
  }

  setPassword(loginToken: string, newPassword: string) {
    return this.request<{ status: string }>('/admin/auth/set-password', {
      method: 'POST', body: JSON.stringify({ login_token: loginToken, new_password: newPassword }),
    });
  }

  verify2fa(loginToken: string, code: string) {
    return this.request<{ admin_token: string; role: string; user: AdminAccount }>('/admin/auth/verify-2fa', {
      method: 'POST', body: JSON.stringify({ login_token: loginToken, code }),
    });
  }

  setupTotp(loginToken: string) {
    return this.request<{ secret: string; qr_uri: string }>('/admin/auth/setup-totp', {
      method: 'POST', body: JSON.stringify({ login_token: loginToken }),
    });
  }

  confirmTotp(loginToken: string, code: string) {
    return this.request<{ admin_token: string; role: string; user: AdminAccount }>('/admin/auth/confirm-totp', {
      method: 'POST', body: JSON.stringify({ login_token: loginToken, code }),
    });
  }

  logout() {
    return this.request<void>('/admin/auth/logout', { method: 'POST' });
  }

  me() {
    return this.request<AdminAccount>('/admin/auth/me');
  }

  // Users
  listUsers(params: { search?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return this.request<{ users: AdminUser[]; total: number }>(`/admin/users?${q}`);
  }

  getUser(id: string) {
    return this.request<AdminUser & { hub_count: number; message_count: number }>(`/admin/users/${id}`);
  }

  editUser(id: string, data: { username?: string; display_name?: string; bio?: string }) {
    return this.request<{ status: string }>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  banUser(id: string) {
    return this.request<{ status: string }>(`/admin/users/${id}/ban`, { method: 'POST' });
  }

  unbanUser(id: string) {
    return this.request<{ status: string }>(`/admin/users/${id}/ban`, { method: 'DELETE' });
  }

  // Hubs
  listHubs(params: { search?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return this.request<{ hubs: AdminHub[]; total: number }>(`/admin/hubs?${q}`);
  }

  getHub(id: string) {
    return this.request<AdminHub & { stream_count: number; message_count: number }>(`/admin/hubs/${id}`);
  }

  deleteHub(id: string) {
    return this.request<{ status: string }>(`/admin/hubs/${id}`, { method: 'DELETE' });
  }

  // Reports
  listReports(params: { status?: string; category?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.category) q.set('category', params.category);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return this.request<{ reports: import('../types').Report[]; total: number }>(`/admin/reports?${q}`);
  }

  updateReport(id: string, data: { status: string; note?: string }) {
    return this.request<{ status: string }>(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  takeReportAction(reportId: string, data: { action_type: string; target_user_id?: string }) {
    return this.request<{ status: string }>(`/admin/reports/${reportId}/action`, { method: 'POST', body: JSON.stringify(data) });
  }

  getModerationStats() {
    return this.request<{ total_reports: number; open: number; resolved: number; dismissed: number; flagged_images: number }>('/admin/moderation/stats');
  }

  // Analytics
  getAnalytics() {
    return this.request<Record<string, number>>('/admin/analytics');
  }

  // Sessions
  listAdminSessions() {
    return this.request<{ sessions: AdminSession[] }>('/admin/sessions/admin');
  }

  listUserSessions(params: { limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return this.request<{ sessions: UserSession[]; total: number }>(`/admin/sessions/users?${q}`);
  }

  revokeSession(id: string, type: 'admin' | 'user') {
    return this.request<{ status: string }>(`/admin/sessions/${id}`, { method: 'DELETE', body: JSON.stringify({ type }) });
  }

  // Status
  getStatus() {
    return this.request<Record<string, unknown>>('/admin/status');
  }

  // SMTP
  getSmtpConfig() {
    return this.request<SmtpConfig>('/admin/smtp');
  }

  updateSmtpConfig(config: SmtpConfig) {
    return this.request<SmtpConfig>('/admin/smtp', { method: 'PUT', body: JSON.stringify(config) });
  }

  sendTestEmail(to: string) {
    return this.request<{ status: string }>('/admin/smtp/test', { method: 'POST', body: JSON.stringify({ to }) });
  }

  // Admin Accounts
  listAccounts() {
    return this.request<{ accounts: AdminAccount[] }>('/admin/accounts');
  }

  createAccount(data: { user_id: string; password: string; role: string }) {
    return this.request<AdminAccount>('/admin/accounts', { method: 'POST', body: JSON.stringify(data) });
  }

  updateAccount(id: string, data: { role: string }) {
    return this.request<{ status: string }>(`/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  deleteAccount(id: string) {
    return this.request<{ status: string }>(`/admin/accounts/${id}`, { method: 'DELETE' });
  }

  resetAccountTotp(id: string) {
    return this.request<{ status: string }>(`/admin/accounts/${id}/reset-totp`, { method: 'POST' });
  }
}

export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  status: number;
  last_seen?: string;
  created_at: string;
  updated_at: string;
  banned_at?: string;
  is_bot: boolean;
}

export interface AdminHub {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  icon_url?: string;
  banner_url?: string;
  member_count: number;
  created_at: string;
}

export interface AdminAccount {
  id: string;
  user_id: string;
  totp_enabled: boolean;
  totp_method: string;
  role: string;
  created_at: string;
  updated_at: string;
  username: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
}

export interface AdminSession {
  id: string;
  admin_account_id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string;
  username: string;
  email?: string;
  display_name: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  username: string;
  email?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from_address: string;
  from_name: string;
  tls_enabled: boolean;
  enabled: boolean;
  updated_at: string;
}

export const adminApi = new AdminApiClient();
