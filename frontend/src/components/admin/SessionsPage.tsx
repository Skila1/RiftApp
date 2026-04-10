import { useEffect, useState } from 'react';
import { adminApi, type AdminSession, type UserSession } from '../../api/adminClient';
import { formatShortDateTime } from '../../utils/dateTime';

export default function SessionsPage() {
  const [tab, setTab] = useState<'admin' | 'user'>('admin');

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Sessions</h1>

      <div className="flex gap-1 bg-[#1e1f22] rounded-lg p-1 mb-6 w-fit">
        <button onClick={() => setTab('admin')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'admin' ? 'bg-[#2b2d31] text-white' : 'text-[#949ba4] hover:text-white'}`}>
          Admin Sessions
        </button>
        <button onClick={() => setTab('user')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'user' ? 'bg-[#2b2d31] text-white' : 'text-[#949ba4] hover:text-white'}`}>
          User Sessions
        </button>
      </div>

      {tab === 'admin' ? <AdminSessions /> : <UserSessions />}
    </div>
  );
}

function AdminSessions() {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    setLoading(true);
    adminApi.listAdminSessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id: string) => {
    try { await adminApi.revokeSession(id, 'admin'); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke'); }
  };

  if (loading) return <Loader />;
  if (error) return <p className="text-[#ed4245] text-sm">{error}</p>;

  return (
    <div className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[#3f4147]/30">
          <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">User</th>
          <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">IP</th>
          <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Created</th>
          <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Expires</th>
          <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Status</th>
          <th className="text-right px-5 py-3"></th>
        </tr></thead>
        <tbody>
          {sessions.map((s) => {
            const expired = new Date(s.expires_at) < new Date();
            const revoked = !!s.revoked_at;
            return (
              <tr key={s.id} className="border-b border-[#3f4147]/20 last:border-0">
                <td className="px-5 py-3 text-white">{s.display_name || s.username}</td>
                <td className="px-5 py-3 text-[#949ba4] font-mono text-xs">{s.ip_address}</td>
                <td className="px-5 py-3 text-[#949ba4]">{formatShortDateTime(s.created_at)}</td>
                <td className="px-5 py-3 text-[#949ba4]">{formatShortDateTime(s.expires_at)}</td>
                <td className="px-5 py-3">
                  {revoked ? <span className="text-[#ed4245] text-xs">Revoked</span>
                    : expired ? <span className="text-[#949ba4] text-xs">Expired</span>
                    : <span className="text-[#57f287] text-xs">Active</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  {!revoked && !expired && (
                    <button onClick={() => revoke(s.id)} className="px-3 py-1 text-xs font-medium rounded bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30 transition-colors">Revoke</button>
                  )}
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#949ba4]">No sessions</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function UserSessions() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = () => {
    setError('');
    setLoading(true);
    adminApi.listUserSessions({ limit, offset })
      .then((r) => { setSessions(r.sessions); setTotal(r.total); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [offset]);

  const revoke = async (id: string) => {
    try { await adminApi.revokeSession(id, 'user'); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke'); }
  };

  if (loading) return <Loader />;
  if (error) return <p className="text-[#ed4245] text-sm">{error}</p>;

  return (
    <>
      <div className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#3f4147]/30">
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">User</th>
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Email</th>
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Created</th>
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Expires</th>
            <th className="text-right px-5 py-3"></th>
          </tr></thead>
          <tbody>
            {sessions.map((s) => {
              const expired = new Date(s.expires_at) < new Date();
              return (
              <tr key={s.id} className="border-b border-[#3f4147]/20 last:border-0">
                <td className="px-5 py-3 text-white">{s.username}</td>
                <td className="px-5 py-3 text-[#949ba4]">{s.email || '—'}</td>
                <td className="px-5 py-3 text-[#949ba4]">{formatShortDateTime(s.created_at)}</td>
                <td className="px-5 py-3 text-[#949ba4]">{formatShortDateTime(s.expires_at)}</td>
                <td className="px-5 py-3 text-right">
                  {!expired && (
                    <button onClick={() => revoke(s.id)} className="px-3 py-1 text-xs font-medium rounded bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30 transition-colors">Revoke</button>
                  )}
                </td>
              </tr>
              );
            })}
            {sessions.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-[#949ba4]">No active sessions</td></tr>}
          </tbody>
        </table>
      </div>
      {total > limit && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-4 py-2 text-sm rounded-lg bg-[#2b2d31] border border-[#3f4147]/30 text-white disabled:opacity-50">Previous</button>
          <span className="text-sm text-[#949ba4]">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}
            className="px-4 py-2 text-sm rounded-lg bg-[#2b2d31] border border-[#3f4147]/30 text-white disabled:opacity-50">Next</button>
        </div>
      )}
    </>
  );
}

function Loader() {
  return <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>;
}
