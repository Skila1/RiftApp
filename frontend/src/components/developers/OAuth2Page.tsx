import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useDeveloperStore } from '../../stores/developerStore';
import type { OAuth2Redirect } from '../../types';

const SCOPES = ['bot', 'identify', 'email', 'guilds', 'guilds.join', 'messages.read', 'applications.commands'];

export default function OAuth2Page() {
  const { appId } = useParams();
  const { currentApp } = useDeveloperStore();
  const [redirects, setRedirects] = useState<OAuth2Redirect[]>([]);
  const [newRedirect, setNewRedirect] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['bot']);
  const [permissions, setPermissions] = useState('0');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (appId) {
      api.listOAuth2Redirects(appId).then(r => setRedirects(r || []));
    }
  }, [appId]);

  const addRedirect = async () => {
    if (!appId || !newRedirect.trim()) return;
    const rd = await api.createOAuth2Redirect(appId, newRedirect.trim());
    setRedirects([...redirects, rd]);
    setNewRedirect('');
  };

  const removeRedirect = async (id: string) => {
    if (!appId) return;
    await api.deleteOAuth2Redirect(appId, id);
    setRedirects(redirects.filter(r => r.id !== id));
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const generatedUrl = () => {
    if (!currentApp) return '';
    const base = window.location.origin;
    const params = new URLSearchParams({
      client_id: currentApp.id,
      scope: selectedScopes.join(' '),
      permissions,
      response_type: 'code',
    });
    if (redirects.length > 0) {
      params.set('redirect_uri', redirects[0].redirect_uri);
    }
    return `${base}/oauth2/authorize?${params.toString()}`;
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-white mb-6">OAuth2</h2>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Client ID</label>
            <div className="bg-black/20 border border-white/5 rounded px-3 py-2 text-sm text-gray-300 font-mono select-all">{currentApp?.id || ''}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Client Secret</label>
            <div className="bg-black/20 border border-white/5 rounded px-3 py-2 text-sm text-gray-400 font-mono">••••••••••••</div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Redirects</h3>
          <div className="space-y-2 mb-3">
            {redirects.map(rd => (
              <div key={rd.id} className="flex items-center justify-between bg-black/20 border border-white/5 rounded px-3 py-2">
                <span className="text-sm text-gray-300 font-mono truncate">{rd.redirect_uri}</span>
                <button onClick={() => removeRedirect(rd.id)} className="text-red-400 hover:text-red-300 text-sm ml-2 flex-shrink-0">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newRedirect} onChange={e => setNewRedirect(e.target.value)} placeholder="https://example.com/callback" onKeyDown={e => e.key === 'Enter' && addRedirect()} className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            <button onClick={addRedirect} className="px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded text-sm transition-colors">Add</button>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h3 className="text-sm font-semibold text-white mb-3">OAuth2 URL Generator</h3>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Scopes</label>
            <div className="flex flex-wrap gap-2">
              {SCOPES.map(scope => (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    selectedScopes.includes(scope)
                      ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30'
                      : 'bg-black/20 text-gray-400 border border-white/5 hover:border-white/10'
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Bot Permissions</label>
            <input value={permissions} onChange={e => setPermissions(e.target.value)} placeholder="0" className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Generated URL</label>
            <div className="bg-black/20 border border-white/5 rounded px-3 py-2 text-sm text-indigo-400 font-mono break-all select-all">{generatedUrl()}</div>
            <button onClick={() => { navigator.clipboard.writeText(generatedUrl()); setCopied(true); setTimeout(() => setCopied(false), 1000); }} className="mt-2 px-4 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded text-sm transition-colors">{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
