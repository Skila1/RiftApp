import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminAccount } from '../../api/adminClient';
import { useAdminStore } from '../../stores/adminStore';

const ROLES = ['super_admin', 'admin', 'moderator'] as const;

export default function AdminSettingsPage() {
  const currentAdminUser = useAdminStore((s) => s.adminUser);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('moderator');
  const [adding, setAdding] = useState(false);

  const load = () => {
    setError('');
    setLoading(true);
    adminApi.listAccounts()
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUserId || !newPassword) return;
    setAdding(true); setError('');
    try {
      await adminApi.createAccount({ user_id: newUserId, password: newPassword, role: newRole });
      setShowAdd(false); setNewUserId(''); setNewPassword(''); setNewRole('moderator');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateRole = async (id: string, role: string) => {
    if (currentAdminUser && id === currentAdminUser.id) {
      setError('Cannot change your own role');
      return;
    }
    try { await adminApi.updateAccount(id, { role }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (currentAdminUser && id === currentAdminUser.id) {
      setError('Cannot remove your own admin account');
      return;
    }
    if (!confirm('Remove this admin account?')) return;
    try { await adminApi.deleteAccount(id); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleResetTotp = async (id: string) => {
    if (!confirm('Reset 2FA for this account? They will need to set it up again.')) return;
    try { await adminApi.resetAccountTotp(id); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Accounts</h1>
        <button onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[#00a8fc] hover:bg-[#0090d6] text-white transition-colors">
          {showAdd ? 'Cancel' : 'Add Admin'}
        </button>
      </div>

      {error && <p className="text-[#ed4245] text-sm mb-4">{error}</p>}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-6 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-white">Add New Admin</h2>
          <p className="text-xs text-[#949ba4]">Enter the existing RiftApp user ID and set an admin password for them.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-1.5">User ID</label>
              <input value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="Existing user UUID"
                className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a8fc]" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-1.5">Admin Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Set admin password"
                autoComplete="new-password"
                className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a8fc]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-1.5">Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
              className="bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none">
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').toUpperCase()}</option>)}
            </select>
          </div>
          <button type="submit" disabled={adding}
            className="px-5 py-2.5 bg-[#57f287] hover:bg-[#47d176] text-black text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {adding ? 'Creating...' : 'Create Admin Account'}
          </button>
        </form>
      )}

      <div className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#3f4147]/30">
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">User</th>
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Email</th>
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">Role</th>
            <th className="text-left px-5 py-3 text-[#949ba4] text-xs uppercase tracking-wider font-semibold">2FA</th>
            <th className="text-right px-5 py-3"></th>
          </tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-[#3f4147]/20 last:border-0">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-xs font-bold">
                      {(a.display_name || a.username || '?')[0]?.toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{a.display_name || a.username}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-[#949ba4]">{a.email || '—'}</td>
                <td className="px-5 py-3">
                  <select value={a.role} onChange={(e) => handleUpdateRole(a.id, e.target.value)}
                    className="bg-[#1e1f22] border border-[#3f4147]/50 rounded px-2 py-1 text-xs text-white">
                    {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ').toUpperCase()}</option>)}
                  </select>
                </td>
                <td className="px-5 py-3">
                  {a.totp_enabled ? (
                    <span className="text-[#57f287] text-xs">Enabled ({a.totp_method})</span>
                  ) : (
                    <span className="text-[#ed4245] text-xs">Not set up</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right space-x-2">
                  <button onClick={() => handleResetTotp(a.id)} aria-label={`Reset 2FA for ${a.email || a.username || a.id}`} className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors">Reset 2FA</button>
                  <button onClick={() => handleDelete(a.id)} aria-label={`Remove account ${a.email || a.username || a.id}`} className="px-2 py-1 text-xs rounded bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30 transition-colors">Remove</button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-[#949ba4]">No admin accounts</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-8 bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-2">Role Permissions</h2>
        <div className="text-xs text-[#949ba4] space-y-1">
          <p><span className="text-[#00a8fc] font-medium">Super Admin</span> &mdash; Full access: manage users, hubs, reports, sessions, status, SMTP, admin accounts</p>
          <p><span className="text-[#57f287] font-medium">Admin</span> &mdash; Users (edit/ban), hubs (view), reports, sessions (user), status. Cannot manage admin accounts or SMTP.</p>
          <p><span className="text-yellow-400 font-medium">Moderator</span> &mdash; Users (read-only), reports, analytics. Limited access.</p>
        </div>
      </div>
    </div>
  );
}
