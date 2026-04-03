import { create } from 'zustand';
import type { User } from '../types';
import { api } from '../api/client';

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
    api.setToken(res.access_token);
    localStorage.setItem('riptide_token', res.access_token);
    localStorage.setItem('riptide_refresh', res.refresh_token);
    set({
      user: res.user,
      token: res.access_token,
      refreshToken: res.refresh_token,
      isAuthenticated: true,
    });
  },

  register: async (username, password, email) => {
    const res = await api.register(username, password, email);
    api.setToken(res.access_token);
    localStorage.setItem('riptide_token', res.access_token);
    localStorage.setItem('riptide_refresh', res.refresh_token);
    set({
      user: res.user,
      token: res.access_token,
      refreshToken: res.refresh_token,
      isAuthenticated: true,
    });
  },

  logout: () => {
    api.setToken(null);
    localStorage.removeItem('riptide_token');
    localStorage.removeItem('riptide_refresh');
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  restore: async () => {
    const token = localStorage.getItem('riptide_token');
    const refresh = localStorage.getItem('riptide_refresh');
    if (!token) {
      set({ isLoading: false });
      return;
    }

    api.setToken(token);
    try {
      const user = await api.getMe();
      set({ user, token, refreshToken: refresh, isAuthenticated: true, isLoading: false });
    } catch {
      // Try refresh
      if (refresh) {
        try {
          const res = await api.refreshToken(refresh);
          api.setToken(res.access_token);
          localStorage.setItem('riptide_token', res.access_token);
          localStorage.setItem('riptide_refresh', res.refresh_token);
          set({
            user: res.user,
            token: res.access_token,
            refreshToken: res.refresh_token,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        } catch {
          // Fall through to logout
        }
      }
      get().logout();
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));
