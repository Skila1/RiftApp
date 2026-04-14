import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';

interface HubBot {
  id: string;
  hub_id: string;
  bot_user_id: string;
  template_type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const TEMPLATES = [
  {
    type: 'moderation',
    name: 'Moderation Bot',
    description: 'Auto-moderate messages, word filter, spam detection, anti-raid protection, and moderation logging.',
    icon: '🛡️',
    color: 'from-red-500 to-orange-500',
  },
  {
    type: 'welcome',
    name: 'Welcome Bot',
    description: 'Welcome new members, send goodbye messages, and auto-assign roles when they join.',
    icon: '👋',
    color: 'from-green-500 to-emerald-500',
  },
  {
    type: 'music',
    name: 'Music Bot',
    description: 'Play music in voice channels with queue management, search, and now-playing embeds.',
    icon: '🎵',
    color: 'from-purple-500 to-pink-500',
  },
  {
    type: 'utility',
    name: 'Utility Bot',
    description: 'Polls, reminders, server info, user info, and announcements.',
    icon: '🔧',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    type: 'leveling',
    name: 'Leveling Bot',
    description: 'XP tracking, level-up messages, level roles, and leaderboards.',
    icon: '📈',
    color: 'from-yellow-500 to-amber-500',
  },
];

export default function BotSettingsPanel({ hubId }: { hubId: string }) {
  const [bots, setBots] = useState<HubBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadBots = useCallback(async () => {
    try {
      const data = await api.get<HubBot[]>(`/hubs/${hubId}/bots`);
      setBots(data ?? []);
    } catch {
      setBots([]);
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  useEffect(() => {
    void loadBots();
  }, [loadBots]);

  const enableBot = async (templateType: string) => {
    setToggling(templateType);
    try {
      await api.post<HubBot>(`/hubs/${hubId}/bots`, { template_type: templateType });
      await loadBots();
    } catch {
      // failed
    } finally {
      setToggling(null);
    }
  };

  const toggleBot = async (bot: HubBot) => {
    setToggling(bot.template_type);
    try {
      await api.patch(`/hubs/${hubId}/bots/${bot.id}`, { enabled: !bot.enabled });
      await loadBots();
    } catch {
      // failed
    } finally {
      setToggling(null);
    }
  };

  const removeBot = async (bot: HubBot) => {
    setToggling(bot.template_type);
    try {
      await api.del(`/hubs/${hubId}/bots/${bot.id}`);
      await loadBots();
    } catch {
      // failed
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const enabledMap = new Map(bots.map((b) => [b.template_type, b]));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-riftapp-text">Bot Builder</h2>
        <p className="text-sm text-riftapp-text-dim mt-1">
          Enable built-in bot templates for your hub. Each template adds specialized functionality.
        </p>
      </div>

      <div className="grid gap-4">
        {TEMPLATES.map((tmpl) => {
          const bot = enabledMap.get(tmpl.type);
          const isEnabled = bot?.enabled ?? false;
          const isToggling = toggling === tmpl.type;

          return (
            <div
              key={tmpl.type}
              className={`rounded-xl border transition-colors ${
                isEnabled
                  ? 'border-riftapp-accent/40 bg-riftapp-accent/5'
                  : 'border-riftapp-border/40 bg-riftapp-content-elevated/40'
              }`}
            >
              <div className="p-4 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tmpl.color} flex items-center justify-center text-2xl shrink-0`}>
                  {tmpl.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-riftapp-text">{tmpl.name}</h3>
                    {isEnabled && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-riftapp-text-dim mt-0.5">{tmpl.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {bot ? (
                    <>
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => void toggleBot(bot)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isEnabled
                            ? 'bg-riftapp-content-elevated hover:bg-riftapp-border text-riftapp-text-dim'
                            : 'bg-riftapp-accent hover:bg-riftapp-accent-hover text-white'
                        } disabled:opacity-50`}
                      >
                        {isToggling ? '...' : isEnabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => void removeBot(bot)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => void enableBot(tmpl.type)}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium bg-riftapp-accent hover:bg-riftapp-accent-hover text-white transition-colors disabled:opacity-50"
                    >
                      {isToggling ? 'Setting up...' : 'Enable'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-riftapp-border/20">
        <p className="text-xs text-riftapp-text-dim">
          Bot templates run on Rift's infrastructure. More templates and a custom bot SDK are coming soon.
        </p>
      </div>
    </div>
  );
}
