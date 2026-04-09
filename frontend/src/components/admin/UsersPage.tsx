import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminUser } from '../../api/adminClient';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<(AdminUser & { hub_count?: number; message_count?: number }) | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.listUsers({ search: committedSearch || undefined, limit, offset });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [offset, committedSearch]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setCommittedSearch(search);
  };

  const handleSelect = async (u: AdminUser) => {
    if (selected?.id === u.id) { setSelected(null); return; }
    try {
      const detail = await adminApi.getUser(u.id);
      setSelected(detail);
    } catch {
      setSelected({ ...u, hub_count: 0, message_count: 0 });
    }
  };

  const handleBan = async (id: string) => {
    try {
      await adminApi.banUser(id);
      load();
      if (selected?.id === id) setSelected((s) => s ? { ...s, banned_at: new Date().toISOString() } : s);
    } catch (err) { setError(err instanceof Error ? err.message : 'Ban failed'); }
  };

  const handleUnban = async (id: string) => {
    try {
      await adminApi.unbanUser(id);
      load();
      if (selected?.id === id) setSelected((s) => s ? { ...s, banned_at: undefined } : s);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unban failed'); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <span className="text-sm text-[#949ba4]">{total} total</span>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username or email..."
          className="flex-1 bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a8fc]" />
        <button type="submit" className="px-5 py-2.5 bg-[#00a8fc] hover:bg-[#0090d6] text-white text-sm font-medium rounded-lg transition-colors">Search</button>
      </form>

      {error && <p className="text-[#ed4245] text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id}>
              <button type="button" onClick={() => handleSelect(u)}
                aria-pressed={selected?.id === u.id}
                className={`w-full text-left bg-[#2b2d31] border rounded-lg p-4 cursor-pointer hover:border-[#3f4147]/80 transition-colors ${selected?.id === u.id ? 'border-[#00a8fc]/50 ring-1 ring-[#00a8fc]/30' : 'border-[#3f4147]/30'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(u.display_name || u.username)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{u.display_name}</span>
                      <span className="text-[#949ba4] text-sm">@{u.username}</span>
                      {u.is_bot && <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-[#5865f2]/20 text-[#5865f2] rounded">BOT</span>}
                      {u.banned_at && <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-[#ed4245]/20 text-[#ed4245] rounded">BANNED</span>}
                    </div>
                    <p className="text-xs text-[#949ba4]">{u.email || 'No email'} &middot; Joined {new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${u.status > 0 ? 'bg-[#57f287]' : 'bg-[#949ba4]'}`} />
                </div>
              </button>
              {selected?.id === u.id && (
                <div className="bg-[#2b2d31] border border-[#3f4147]/30 border-t-0 rounded-b-lg p-4 -mt-1">
                  <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                    <div><span className="text-[#949ba4]">ID:</span> <span className="text-white font-mono text-xs">{u.id}</span></div>
                    <div><span className="text-[#949ba4]">Hubs:</span> <span className="text-white">{selected.hub_count ?? '—'}</span></div>
                    <div><span className="text-[#949ba4]">Messages:</span> <span className="text-white">{selected.message_count ?? '—'}</span></div>
                  </div>
                  <div className="flex gap-2">
                    {u.banned_at ? (
                      <button onClick={() => handleUnban(u.id)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#57f287]/20 text-[#57f287] hover:bg-[#57f287]/30 transition-colors">Unban</button>
                    ) : (
                      <button onClick={() => handleBan(u.id)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30 transition-colors">Ban User</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-4 py-2 text-sm rounded-lg bg-[#2b2d31] border border-[#3f4147]/30 text-white disabled:opacity-50 hover:bg-[#35373c] transition-colors">Previous</button>
          <span className="text-sm text-[#949ba4]">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}
            className="px-4 py-2 text-sm rounded-lg bg-[#2b2d31] border border-[#3f4147]/30 text-white disabled:opacity-50 hover:bg-[#35373c] transition-colors">Next</button>
        </div>
      )}
    </div>
  );
}
