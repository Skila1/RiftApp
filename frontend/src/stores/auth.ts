import { create } from 'zustand';
import type { User } from '../types';
import { api } from '../api/client';
import { HUBS_SESSION_STORAGE_KEY } from './hubStore';
import { useStreamStore } from './streamStore';
import { useMessageStore } from './messageStore';
import { normalizeUser } from '../utils/entityAssets';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username, password) => {
    const res = await api.login(username, password);
    const user = normalizeUser(res.user);
    api.setToken(res.access_token);
    api.setRefreshToken(res.refresh_token);
    localStorage.setItem('riftapp_token', res.access_token);
    localStorage.setItem('riftapp_refresh', res.refresh_token);
    set({
      user,
      token: res.access_token,
      refreshToken: res.refresh_token,
      isAuthenticated: true,
    });
  },

  register: async (username, password, email) => {
    const res = await api.register(username, password, email);
    const user = normalizeUser(res.user);
    api.setToken(res.access_token);
    api.setRefreshToken(res.refresh_token);
    localStorage.setItem('riftapp_token', res.access_token);
    localStorage.setItem('riftapp_refresh', res.refresh_token);
    set({
      user,
      token: res.access_token,
      refreshToken: res.refresh_token,
      isAuthenticated: true,
    });
  },

  logout: () => {
    const refreshToken = get().refreshToken;
    if (refreshToken) {
      api.logout(refreshToken).catch(() => {});
    }
    api.setToken(null);
    api.setRefreshToken(null);
    localStorage.removeItem('riftapp_token');
    localStorage.removeItem('riftapp_refresh');
    try {
      sessionStorage.removeItem(HUBS_SESSION_STORAGE_KEY);
    } catch { /* ignore */ }
    useStreamStore.getState().clearSessionCaches();
    useMessageStore.getState().clearSessionCaches();
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  restore: async () => {
    const token = localStorage.getItem('riftapp_token');
    const refresh = localStorage.getItem('riftapp_refresh');
    if (!token) {
      set({ isLoading: false });
      return;
    }

    api.setToken(token);
    api.setRefreshToken(refresh);
    try {
      const user = normalizeUser(await api.getMe());
      // The API client may have silently refreshed the token during getMe().
      // Re-read localStorage to pick up any updated tokens.
      const currentToken = localStorage.getItem('riftapp_token') || token;
      const currentRefresh = localStorage.getItem('riftapp_refresh') || refresh;
      set({ user, token: currentToken, refreshToken: currentRefresh, isAuthenticated: true, isLoading: false });
    } catch {
      if (refresh) {
        try {
          const res = await api.refreshToken(refresh);
          const user = normalizeUser(res.user);
          api.setToken(res.access_token);
          api.setRefreshToken(res.refresh_token);
          localStorage.setItem('riftapp_token', res.access_token);
          localStorage.setItem('riftapp_refresh', res.refresh_token);
          set({
            user,
            token: res.access_token,
            refreshToken: res.refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        } catch {}
      }
      get().logout();
      set({ isLoading: false });
    }
  },

  setUser: (user) => set((s) => ({
    user: normalizeUser(
      s.user?.id === user.id && user.email == null
        ? { ...s.user, ...user }
        : user,
    ),
  })),
}));
