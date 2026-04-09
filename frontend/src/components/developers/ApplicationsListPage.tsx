import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';

export default function ApplicationsListPage() {
  const navigate = useNavigate();
  const applications = useDeveloperStore((s) => s.applications);
  const isLoading = useDeveloperStore((s) => s.isLoading);
  const fetchApplications = useDeveloperStore((s) => s.fetchApplications);
  const createApplication = useDeveloperStore((s) => s.createApplication);

  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'name'>('newest');
  const [importToken, setImportToken] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleCreate = async () => {
    if (!newAppName.trim()) return;
    setCreating(true);
    try {
      const result = await createApplication(newAppName.trim());
      setNewToken(result.bot_token);
      setNewAppName('');
    } catch {
      // error handled by store
    } finally {
      setCreating(false);
    }
  };

  const handleImport = async () => {
    if (!importToken.trim() && !importName.trim()) return;
    setImporting(true);
    try {
      const result = await api.importDiscordBot(importToken.trim(), importName.trim() || undefined);
      setNewToken(result.bot_token);
      setImportToken('');
      setImportName('');
      setShowImport(false);
      setShowModal(true);
      fetchApplications();
    } catch {
      // error handled by API client
    } finally {
      setImporting(false);
    }
  };

  const sorted = [...applications].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-sm text-riftapp-text-muted mt-1">Create and manage your applications and bots.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 text-sm font-medium bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors border border-riftapp-border/40"
          >
            Import Discord Bot
          </button>
          <button
            onClick={() => { setShowModal(true); setNewToken(null); }}
            className="btn-primary px-4 py-2 text-sm font-medium"
          >
            New Application
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'newest' | 'name')}
          className="h-8 px-2 rounded-md bg-riftapp-content-elevated border border-riftapp-border/50 text-sm text-riftapp-text outline-none"
        >
          <option value="newest">Newest First</option>
          <option value="name">Name A-Z</option>
        </select>
        <span className="text-xs text-riftapp-text-dim">{applications.length} application{applications.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading && applications.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-riftapp-text-dim/30">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" /><path d="M3 9h18" />
          </svg>
          <p className="text-riftapp-text-dim">No applications yet</p>
          <button
            onClick={() => { setShowModal(true); setNewToken(null); }}
            className="btn-primary px-4 py-2 text-sm font-medium mt-4"
          >
            Create Your First Application
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((app) => (
            <button
              key={app.id}
              onClick={() => navigate(`/developers/applications/${app.id}/information`)}
              className="flex items-center gap-3 p-4 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 hover:border-riftapp-accent/40 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-riftapp-accent/10 flex items-center justify-center text-lg font-bold text-riftapp-accent flex-shrink-0 overflow-hidden">
                {app.icon ? (
                  <img src={app.icon} alt="" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  app.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate group-hover:text-riftapp-accent transition-colors">{app.name}</p>
                <p className="text-xs text-riftapp-text-dim mt-0.5">
                  Created {new Date(app.created_at).toLocaleDateString()}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowModal(false); setNewToken(null); }}>
          <div className="bg-riftapp-content rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            {newToken ? (
              <>
                <h2 className="text-lg font-bold mb-2">Application Created!</h2>
                <p className="text-sm text-riftapp-text-muted mb-4">Save this bot token — you won't be able to see it again.</p>
                <div className="bg-riftapp-bg rounded-lg p-3 font-mono text-xs break-all text-riftapp-accent mb-4">{newToken}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(newToken); }}
                    className="btn-primary px-4 py-2 text-sm flex-1"
                  >
                    Copy Token
                  </button>
                  <button
                    onClick={() => { setShowModal(false); setNewToken(null); }}
                    className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors flex-1"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-4">Create Application</h2>
                <label className="block mb-4">
                  <span className="text-xs font-semibold text-riftapp-text-muted uppercase tracking-wider">Name</span>
                  <input
                    type="text"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    placeholder="My Cool Bot"
                    maxLength={128}
                    className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  />
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newAppName.trim() || creating}
                    className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Import Discord bot modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowImport(false)}>
          <div className="bg-riftapp-content rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Import Discord Bot</h2>
            <p className="text-sm text-riftapp-text-muted mb-4">
              Paste your Discord bot token to import its profile, or just provide a name to create a matching application.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-riftapp-text-muted uppercase">Discord Bot Token</span>
                <input
                  type="password"
                  value={importToken}
                  onChange={(e) => setImportToken(e.target.value)}
                  className="settings-input w-full mt-1 py-2 px-3 text-sm"
                  placeholder="Paste your Discord bot token"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-riftapp-text-muted uppercase">App Name (optional)</span>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="settings-input w-full mt-1 py-2 px-3 text-sm"
                  placeholder="Override name (auto-detected from token)"
                  maxLength={128}
                />
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={(!importToken.trim() && !importName.trim()) || importing}
                className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
