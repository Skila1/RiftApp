import { create } from 'zustand';
import type { SlashCommand } from '../types';
import { api } from '../api/client';

interface CommandState {
  hubCommands: Record<string, SlashCommand[]>;
  loading: Record<string, boolean>;
  loadCommandsForHub: (hubId: string) => Promise<SlashCommand[]>;
  getCommandsForHub: (hubId: string) => SlashCommand[];
  invalidateHub: (hubId: string) => void;
  clear: () => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  hubCommands: {},
  loading: {},

  loadCommandsForHub: async (hubId: string) => {
    const cached = get().hubCommands[hubId];
    if (cached) return cached;
    if (get().loading[hubId]) return [];

    set((s) => ({ loading: { ...s.loading, [hubId]: true } }));
    try {
      const commands = await api.getHubCommands(hubId);
      set((s) => ({
        hubCommands: { ...s.hubCommands, [hubId]: commands },
        loading: { ...s.loading, [hubId]: false },
      }));
      return commands;
    } catch {
      set((s) => ({ loading: { ...s.loading, [hubId]: false } }));
      return [];
    }
  },

  getCommandsForHub: (hubId: string) => {
    const cached = get().hubCommands[hubId];
    if (cached) return cached;
    void get().loadCommandsForHub(hubId);
    return [];
  },

  invalidateHub: (hubId: string) => {
    set((s) => {
      const { [hubId]: _, ...rest } = s.hubCommands;
      return { hubCommands: rest };
    });
  },

  clear: () => set({ hubCommands: {}, loading: {} }),
}));
