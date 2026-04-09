import { create } from 'zustand';
import { adminApi, type AdminAccount } from '../api/adminClient';

export type AdminSection = 'dashboard' | 'users' | 'hubs' | 'reports' | 'sessions' | 'status' | 'smtp' | 'settings';

interface AdminState {
  adminToken: string | null;
  adminUser: AdminAccount | null;
  role: string | null;
  activeSection: AdminSection;
  isAuthenticated: boolean;

  setSection: (section: AdminSection) => void;
  loginSuccess: (token: string, role: string, user: AdminAccount | null) => void;
  logout: () => void;
  restore: () => boolean;
}

export const useAdminStore = create<AdminState>((set) => ({
  adminToken: null,
  adminUser: null,
  role: null,
  activeSection: 'dashboard',
  isAuthenticated: false,

  setSection: (section) => set({ activeSection: section }),

  loginSuccess: (token, role, user) => {
    adminApi.setToken(token);
    set({ adminToken: token, role, adminUser: user, isAuthenticated: true });
  },

  logout: () => {
    adminApi.logout().catch(() => {});
    adminApi.setToken(null);
    set({ adminToken: null, role: null, adminUser: null, isAuthenticated: false, activeSection: 'dashboard' });
  },

  restore: () => {
    return false;
  },
}));
