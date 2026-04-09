import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Application, Hub } from '../../types';

export default function BotAuthorizePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clientId = searchParams.get('client_id') || '';
  const scope = searchParams.get('scope') || '';
  const permissions = searchParams.get('permissions') || '0';

  const [app, setApp] = useState<Application | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHub, setSelectedHub] = useState('');
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setError('Missing client_id parameter');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [appData, hubList] = await Promise.all([
          api.getApplication(clientId),
          api.getHubs(),
        ]);
        setApp(appData);
        setHubs(hubList || []);
        if (hubList?.length) setSelectedHub(hubList[0].id);
      } catch {
        setError('Application not found');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clientId]);

  const handleAuthorize = async () => {
    if (!selectedHub || !app?.bot_user_id) return;
    setAuthorizing(true);
    setError('');
    try {
      await api.joinHub(selectedHub);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bot');
    } finally {
      setAuthorizing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-gray-200">
        <div className="bg-[#12122a] border border-white/5 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-2xl mx-auto mb-4">
            &#10003;
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Authorized!</h2>
          <p className="text-sm text-gray-400 mb-6">
            <strong className="text-white">{app?.name}</strong> has been added to your hub.
          </p>
          <button
            onClick={() => navigate('/app')}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Go to App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-gray-200 p-4">
      <div className="bg-[#12122a] border border-white/5 rounded-xl p-8 max-w-md w-full">
        {error && !app ? (
          <div className="text-center">
            <div className="text-4xl mb-4">&#9888;</div>
            <h2 className="text-lg font-semibold text-white mb-2">Invalid Request</h2>
            <p className="text-sm text-gray-400 mb-6">{error}</p>
            <button onClick={() => navigate('/')} className="px-4 py-2 bg-[#2d2d5e] hover:bg-[#3d3d6e] text-gray-200 rounded text-sm transition-colors">
              Go Home
            </button>
          </div>
        ) : app && (
          <>
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-xl bg-indigo-600/20 flex items-center justify-center text-3xl font-bold text-indigo-400 mx-auto mb-3 overflow-hidden">
                {app.icon ? (
                  <img src={app.icon} alt="" className="w-full h-full object-cover" />
                ) : (
                  app.name.charAt(0).toUpperCase()
                )}
              </div>
              <h2 className="text-lg font-semibold text-white">{app.name}</h2>
              {app.description && (
                <p className="text-sm text-gray-400 mt-1">{app.description}</p>
              )}
            </div>

            <div className="bg-black/20 border border-white/5 rounded-lg p-4 mb-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Requested Permissions</p>
              <div className="flex flex-wrap gap-1.5">
                {scope.split(' ').filter(Boolean).map(s => (
                  <span key={s} className="px-2 py-0.5 bg-indigo-600/10 text-indigo-400 rounded text-xs">{s}</span>
                ))}
              </div>
              {permissions !== '0' && (
                <p className="text-xs text-gray-500 mt-2">Permission bits: {permissions}</p>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Add to Hub</label>
              {hubs.length === 0 ? (
                <p className="text-sm text-gray-500">You don't have any hubs yet.</p>
              ) : (
                <select
                  value={selectedHub}
                  onChange={e => setSelectedHub(e.target.value)}
                  className="w-full bg-[#1a1a38] border border-white/10 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                >
                  {hubs.map(hub => (
                    <option key={hub.id} value={hub.id}>{hub.name}</option>
                  ))}
                </select>
              )}
            </div>

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex-1 py-2.5 bg-[#2d2d5e] hover:bg-[#3d3d6e] text-gray-200 rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAuthorize}
                disabled={authorizing || !selectedHub || hubs.length === 0}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {authorizing ? 'Authorizing...' : 'Authorize'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
