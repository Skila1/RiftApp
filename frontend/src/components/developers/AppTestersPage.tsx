import { useState, useEffect } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';
import type { AppTester } from '../../types';

export default function AppTestersPage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const [testers, setTesters] = useState<AppTester[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (currentApp) {
      setLoading(true);
      api.listAppTesters(currentApp.id).then((t) => setTesters(t ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [currentApp]);

  const handleAdd = async () => {
    if (!currentApp || !userId.trim()) return;
    setAdding(true);
    try {
      await api.addAppTester(currentApp.id, userId.trim());
      const updated = await api.listAppTesters(currentApp.id);
      setTesters(updated ?? []);
      setUserId('');
    } catch {
      // handled by API client
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (testerUserId: string) => {
    if (!currentApp) return;
    await api.removeAppTester(currentApp.id, testerUserId);
    setTesters(testers.filter((t) => t.user_id !== testerUserId));
  };

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">App Testers</h2>

      <p className="text-sm text-riftapp-text-muted mb-6">
        Add testers who can access your application during development. Testers receive an invitation and must accept it.
      </p>

      {/* Add tester */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User ID"
          className="settings-input flex-1 py-2 px-3 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button onClick={handleAdd} disabled={!userId.trim() || adding} className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">
          {adding ? 'Adding...' : 'Add Tester'}
        </button>
      </div>

      {/* Testers list */}
      {loading ? (
        <div className="py-8 text-center text-riftapp-text-dim text-sm">Loading testers...</div>
      ) : testers.length === 0 ? (
        <div className="text-center py-16">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-riftapp-text-dim/30">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <p className="text-riftapp-text-dim text-sm">No testers added yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {testers.map((tester) => (
            <div key={tester.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 group">
              <div className="w-10 h-10 rounded-full bg-riftapp-accent/10 flex items-center justify-center text-sm font-semibold text-riftapp-accent overflow-hidden">
                {tester.user?.avatar_url ? (
                  <img src={tester.user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (tester.user?.display_name || tester.user_id).slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tester.user?.display_name || tester.user_id}</p>
                <p className="text-xs text-riftapp-text-dim">
                  {tester.user?.username ? `@${tester.user.username}` : ''} · Status: {tester.status}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                tester.status === 'accepted' ? 'bg-riftapp-success/10 text-riftapp-success' : 'bg-yellow-500/10 text-yellow-400'
              }`}>
                {tester.status}
              </span>
              <button
                onClick={() => handleRemove(tester.user_id)}
                className="text-riftapp-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
