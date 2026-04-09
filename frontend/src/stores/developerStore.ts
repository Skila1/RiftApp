import { create } from 'zustand';
import { api } from '../api/client';
import type { Application } from '../types';

interface DeveloperState {
  applications: Application[];
  currentApp: Application | null;
  isSuperAdmin: boolean;
  isLoading: boolean;

  fetchMe: () => Promise<void>;
  fetchApplications: () => Promise<void>;
  fetchApplication: (appId: string) => Promise<void>;
  createApplication: (name: string) => Promise<{ application: Application; bot_token: string }>;
  updateApplication: (appId: string, data: Partial<Application>) => Promise<void>;
  deleteApplication: (appId: string) => Promise<void>;
  setCurrentApp: (app: Application | null) => void;
  resetBotToken: (appId: string) => Promise<string>;
}

export const useDeveloperStore = create<DeveloperState>((set, get) => ({
  applications: [],
  currentApp: null,
  isSuperAdmin: false,
  isLoading: false,

  fetchMe: async () => {
    try {
      const resp = await api.getDeveloperMe();
      set({ isSuperAdmin: resp.is_super_admin });
    } catch {
      set({ isSuperAdmin: false });
    }
  },

  fetchApplications: async () => {
    set({ isLoading: true });
    try {
      const apps = await api.listApplications();
      set({ applications: apps ?? [], isLoading: false });
    } catch {
      set({ applications: [], isLoading: false });
    }
  },

  fetchApplication: async (appId: string) => {
    set({ isLoading: true });
    try {
      const app = await api.getApplication(appId);
      set({ currentApp: app, isLoading: false });

      const apps = get().applications;
      const idx = apps.findIndex((a) => a.id === appId);
      if (idx >= 0) {
        const updated = [...apps];
        updated[idx] = app;
        set({ applications: updated });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  createApplication: async (name: string) => {
    const result = await api.createApplication(name);
    set((s) => ({ applications: [result.application, ...s.applications] }));
    return result;
  },

  updateApplication: async (appId: string, data: Partial<Application>) => {
    const updated = await api.updateApplication(appId, data);
    set((s) => ({
      applications: s.applications.map((a) => (a.id === appId ? updated : a)),
      currentApp: s.currentApp?.id === appId ? updated : s.currentApp,
    }));
  },

  deleteApplication: async (appId: string) => {
    await api.deleteApplication(appId);
    set((s) => ({
      applications: s.applications.filter((a) => a.id !== appId),
      currentApp: s.currentApp?.id === appId ? null : s.currentApp,
    }));
  },

  setCurrentApp: (app) => set({ currentApp: app }),

  resetBotToken: async (appId: string) => {
    const result = await api.resetBotToken(appId);
    return result.token;
  },
}));
