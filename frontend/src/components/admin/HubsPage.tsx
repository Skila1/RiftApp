import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminHub } from '../../api/adminClient';
import { formatShortDate } from '../../utils/dateTime';

export default function HubsPage() {
  const [hubs, setHubs] = useState<AdminHub[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const limit = 50;

  const load = async (explicitOffset?: number, explicitSearch?: string) => {
    setLoading(true);
    setError('');
    try {
      const s = explicitSearch ?? committedSearch;
      const o = explicitOffset ?? offset;
      const res = await adminApi.listHubs({ search: s || undefined, limit, offset: o });
      setHubs(res.hubs);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hubs');
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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this hub? This action cannot be undone.')) return;
    setDeletingId(id);
    try {
      await adminApi.deleteHub(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Hubs</h1>
        <span className="text-sm text-[#949ba4]">{total} total</span>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by hub name..."
          className="flex-1 bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a8fc]" />
        <button type="submit" className="px-5 py-2.5 bg-[#00a8fc] hover:bg-[#0090d6] text-white text-sm font-medium rounded-lg transition-colors">Search</button>
      </form>

      {error && <p className="text-[#ed4245] text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#3f4147]/30">
                <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Name</th>
                <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Owner</th>
                <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Members</th>
                <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Created</th>
                <th className="text-right px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {hubs.map((h) => (
                <tr key={h.id} className="border-b border-[#3f4147]/20 last:border-0 hover:bg-[#35373c]/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-white">{h.name}</td>
                  <td className="px-5 py-3 text-[#b5bac1]">{h.owner_name}</td>
                  <td className="px-5 py-3 text-[#b5bac1]">{h.member_count}</td>
                  <td className="px-5 py-3 text-[#949ba4]">{formatShortDate(h.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(h.id)} disabled={deletingId === h.id} className="px-3 py-1 text-xs font-medium rounded bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30 transition-colors disabled:opacity-50">
                      {deletingId === h.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
              {hubs.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-[#949ba4]">No hubs found</td></tr>}
            </tbody>
          </table>
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
