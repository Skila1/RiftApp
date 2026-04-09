import { useState, useEffect } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';
import type { OAuth2Redirect } from '../../types';

const SCOPES = [
  'bot', 'identify', 'email', 'guilds', 'guilds.join',
  'messages.read', 'applications.commands', 'webhook.incoming',
];

export default function OAuth2Page() {
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const [redirects, setRedirects] = useState<OAuth2Redirect[]>([]);
  const [newUri, setNewUri] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['bot']);
  const [permissions, setPermissions] = useState('0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentApp) {
      setLoading(true);
      api.listOAuth2Redirects(currentApp.id).then(setRedirects).catch(() => {}).finally(() => setLoading(false));
    }
  }, [currentApp]);

  const handleAddRedirect = async () => {
    if (!currentApp || !newUri.trim()) return;
    const rd = await api.createOAuth2Redirect(currentApp.id, newUri.trim());
    setRedirects([...redirects, rd]);
    setNewUri('');
  };

  const handleRemoveRedirect = async (id: string) => {
    if (!currentApp) return;
    await api.deleteOAuth2Redirect(currentApp.id, id);
    setRedirects(redirects.filter((r) => r.id !== id));
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const generatedUrl = currentApp
    ? `${window.location.origin}/api/oauth2/authorize?client_id=${currentApp.id}&scope=${selectedScopes.join('+')}&permissions=${permissions}&response_type=code`
    : '';

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">OAuth2</h2>

      {/* Client ID */}
      <div className="mb-6">
        <span className="section-label">Client ID</span>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="flex-1 bg-riftapp-bg rounded-lg px-3 py-2 text-xs font-mono text-riftapp-text-muted truncate border border-riftapp-border/30">
            {currentApp.id}
          </code>
          <button onClick={() => navigator.clipboard.writeText(currentApp.id)} className="px-3 py-2 text-xs bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors">
            Copy
          </button>
        </div>
      </div>

      {/* Client Secret */}
      <div className="mb-8">
        <span className="section-label">Client Secret</span>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="flex-1 bg-riftapp-bg rounded-lg px-3 py-2 text-xs font-mono text-riftapp-text-muted truncate border border-riftapp-border/30">
            ••••••••••••••••••••••••
          </code>
          <button className="px-3 py-2 text-xs bg-riftapp-danger/10 text-riftapp-danger rounded-lg hover:bg-riftapp-danger/20 transition-colors">
            Reset Secret
          </button>
        </div>
      </div>

      {/* Redirect URIs */}
      <div className="mb-8">
        <h3 className="text-sm font-bold mb-3">Redirects</h3>
        {loading ? (
          <div className="py-4 text-center text-riftapp-text-dim text-sm">Loading...</div>
        ) : (
          <div className="space-y-2 mb-3">
            {redirects.map((rd) => (
              <div key={rd.id} className="flex items-center gap-2 p-2 rounded-lg bg-riftapp-content-elevated border border-riftapp-border/30">
                <code className="flex-1 text-xs font-mono truncate">{rd.redirect_uri}</code>
                <button onClick={() => handleRemoveRedirect(rd.id)} className="text-riftapp-danger hover:text-riftapp-danger/80 text-xs">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="url"
            value={newUri}
            onChange={(e) => setNewUri(e.target.value)}
            placeholder="https://example.com/callback"
            className="settings-input flex-1 py-1.5 px-3 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddRedirect(); }}
          />
          <button onClick={handleAddRedirect} className="px-3 py-1.5 text-sm bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors">Add</button>
        </div>
      </div>

      {/* URL Generator */}
      <div className="border-t border-riftapp-border/40 pt-6">
        <h3 className="text-sm font-bold mb-4">OAuth2 URL Generator</h3>

        <div className="mb-4">
          <span className="section-label">Scopes</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {SCOPES.map((scope) => (
              <label key={scope} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="rounded border-riftapp-border/50"
                />
                <span className="text-xs">{scope}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <span className="section-label">Bot Permissions</span>
          <input
            type="text"
            value={permissions}
            onChange={(e) => setPermissions(e.target.value)}
            className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
            placeholder="Permission integer"
          />
        </div>

        <div>
          <span className="section-label">Generated URL</span>
          <div className="flex items-center gap-2 mt-1.5">
            <code className="flex-1 bg-riftapp-bg rounded-lg px-3 py-2 text-xs font-mono text-riftapp-accent truncate border border-riftapp-border/30">
              {generatedUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(generatedUrl)}
              className="px-3 py-2 text-xs bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors flex-shrink-0"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
