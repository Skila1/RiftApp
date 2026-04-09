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
    sessionStorage.setItem('riftapp_admin_token', token);
    sessionStorage.setItem('riftapp_admin_role', role);
    if (user) {
      sessionStorage.setItem('riftapp_admin_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('riftapp_admin_user');
    }
    adminApi.setToken(token);
    set({ adminToken: token, role, adminUser: user, isAuthenticated: true });
  },

  logout: () => {
    adminApi.logout().catch(() => {});
    sessionStorage.removeItem('riftapp_admin_token');
    sessionStorage.removeItem('riftapp_admin_role');
    sessionStorage.removeItem('riftapp_admin_user');
    adminApi.setToken(null);
    set({ adminToken: null, role: null, adminUser: null, isAuthenticated: false, activeSection: 'dashboard' });
  },

  restore: () => {
    const token = sessionStorage.getItem('riftapp_admin_token');
    const role = sessionStorage.getItem('riftapp_admin_role');
    const userJson = sessionStorage.getItem('riftapp_admin_user');
    if (token && role) {
      let user: AdminAccount | null = null;
      try { if (userJson) user = JSON.parse(userJson); } catch {}
      adminApi.setToken(token);
      set({ adminToken: token, role, adminUser: user, isAuthenticated: true });
      return true;
    }
    return false;
  },
}));
