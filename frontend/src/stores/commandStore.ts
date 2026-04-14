import { create } from 'zustand';
import type { SlashCommand } from '../types';
import { api } from '../api/client';

interface CommandState {
  hubCommands: Record<string, SlashCommand[]>;
  loadCommandsForHub: (hubId: string) => Promise<SlashCommand[]>;
  invalidateHub: (hubId: string) => void;
  clear: () => void;
}

const inflightRequests = new Map<string, Promise<SlashCommand[]>>();

export const useCommandStore = create<CommandState>((set, get) => ({
  hubCommands: {},

  loadCommandsForHub: async (hubId: string) => {
    if (hubId in get().hubCommands) return get().hubCommands[hubId];

    const inflight = inflightRequests.get(hubId);
    if (inflight) return inflight;

    const promise = api.getHubCommands(hubId).then(
      (commands) => {
        set((s) => ({ hubCommands: { ...s.hubCommands, [hubId]: commands } }));
        inflightRequests.delete(hubId);
        return commands;
      },
      () => {
        set((s) => ({ hubCommands: { ...s.hubCommands, [hubId]: [] } }));
        inflightRequests.delete(hubId);
        return [] as SlashCommand[];
      },
    );

    inflightRequests.set(hubId, promise);
    return promise;
  },

  invalidateHub: (hubId: string) => {
    set((s) => {
      const { [hubId]: _, ...rest } = s.hubCommands;
      return { hubCommands: rest };
    });
  },

  clear: () => {
    inflightRequests.clear();
    set({ hubCommands: {} });
  },
}));
