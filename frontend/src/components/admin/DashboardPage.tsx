import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminClient';

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.getAnalytics()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (error) return <p className="text-[#ed4245] text-sm p-8">{error}</p>;

  const cards: { label: string; key: string; color: string }[] = [
    { label: 'Total Users', key: 'total_users', color: 'text-[#00a8fc]' },
    { label: 'Online Users', key: 'online_users', color: 'text-[#57f287]' },
    { label: 'Banned Users', key: 'banned_users', color: 'text-[#ed4245]' },
    { label: 'Total Hubs', key: 'total_hubs', color: 'text-[#fee75c]' },
    { label: 'Total Messages', key: 'total_messages', color: 'text-[#5865f2]' },
    { label: 'Active Sessions', key: 'active_sessions', color: 'text-[#eb459e]' },
    { label: 'Open Reports', key: 'open_reports', color: 'text-[#ed4245]' },
    { label: 'Total Reports', key: 'total_reports', color: 'text-[#949ba4]' },
  ];

  const activity: { label: string; key: string }[] = [
    { label: 'New Users (24h)', key: 'new_users_24h' },
    { label: 'New Users (7d)', key: 'new_users_7d' },
    { label: 'Messages (24h)', key: 'messages_24h' },
    { label: 'Messages (7d)', key: 'messages_7d' },
    { label: 'Total Bots', key: 'total_bots' },
    { label: 'Total DMs', key: 'total_dms' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.key} className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-5">
            <p className="text-xs text-[#949ba4] uppercase tracking-wider mb-1">{c.label}</p>
            <p className={`text-3xl font-bold ${c.color}`}>{stats?.[c.key]?.toLocaleString() ?? '—'}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-4">Activity</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {activity.map((a) => (
          <div key={a.key} className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-5">
            <p className="text-xs text-[#949ba4] uppercase tracking-wider mb-1">{a.label}</p>
            <p className="text-2xl font-bold text-white">{stats?.[a.key]?.toLocaleString() ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
