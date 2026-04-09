import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminClient';

export default function StatusPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    adminApi.getStatus()
      .then((data) => { setStatus(data); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const statusColor = (val: unknown) => {
    if (typeof val === 'string') {
      if (val === 'connected' || val === 'ok') return 'text-[#57f287]';
      if (val.startsWith('error')) return 'text-[#ed4245]';
      if (val === 'disabled' || val === 'not configured') return 'text-[#949ba4]';
    }
    return 'text-white';
  };

  if (loading && !status) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Platform Status</h1>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-[#2b2d31] border border-[#3f4147]/30 text-white hover:bg-[#35373c] transition-colors disabled:opacity-50">
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-[#ed4245] text-sm mb-4">{error}</p>}

      {status && (
        <div className="space-y-4">
          <Section title="Services">
            <Row label="Database" value={status.database} color={statusColor(status.database)} />
            <Row label="LocalMod" value={status.localmod} color={statusColor(status.localmod)} />
            <Row label="SMTP" value={status.smtp} color={statusColor(status.smtp)} />
          </Section>

          <Section title="Connections">
            <Row label="WebSocket Clients" value={status.websocket_connections} color="text-white" />
          </Section>

          <Section title="System">
            <Row label="Uptime" value={formatUptime(status.uptime_seconds as number)} color="text-white" />
            <Row label="Go Version" value={status.go_version} color="text-[#949ba4]" />
            <Row label="Goroutines" value={status.goroutines} color="text-white" />
            <Row label="Memory Usage" value={`${status.memory_mb} MB`} color="text-white" />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#3f4147]/30">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
      </div>
      <div className="divide-y divide-[#3f4147]/20">{children}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: unknown; color: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-[#b5bac1]">{label}</span>
      <span className={`text-sm font-medium ${color}`}>{String(value ?? '—')}</span>
    </div>
  );
}

function formatUptime(seconds: number) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}
