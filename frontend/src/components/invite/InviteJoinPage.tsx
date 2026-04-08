import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { useHubStore } from '../../stores/hubStore';

interface InviteInfo {
  code: string;
  hub_id: string;
  hub_name: string;
  hub_icon_url?: string;
  member_count: number;
  expires_at?: string;
}

export default function InviteJoinPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const hubs = useHubStore((s) => s.hubs);
  const loadHubs = useHubStore((s) => s.loadHubs);

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const alreadyMember = info ? hubs.some((h) => h.id === info.hub_id) : false;

  useEffect(() => {
    if (!code) return;
    api.getInviteInfo(code)
      .then(setInfo)
      .catch((err) => setError(err instanceof Error ? err.message : 'Invalid or expired invite'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!code || !info) return;
    setJoining(true);
    try {
      await api.joinInvite(code);
      await loadHubs();
      navigate(`/app/hubs/${info.hub_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleGoTo = () => {
    if (info) navigate(`/app/hubs/${info.hub_id}`);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-riftapp-bg">
        <div className="text-center animate-fade-in">
          <h1 className="text-3xl font-bold text-riftapp-accent mb-4 font-display tracking-tight">riftapp</h1>
          <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-riftapp-text-dim text-sm mt-4">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="h-full flex items-center justify-center bg-riftapp-bg">
        <div className="text-center max-w-sm animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-riftapp-content-elevated flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-danger">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Invalid Invite</h2>
          <p className="text-riftapp-text-dim text-sm mb-6">{error || 'This invite is invalid or has expired.'}</p>
          <button onClick={() => navigate('/app')} className="btn-primary px-6 py-2.5">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-riftapp-bg">
      <div className="text-center max-w-sm animate-scale-in">
        {/* Hub icon */}
        <div className="w-20 h-20 rounded-3xl bg-riftapp-content-elevated flex items-center justify-center mx-auto mb-4 overflow-hidden shadow-elevation-low">
          {info.hub_icon_url ? (
            <img src={publicAssetUrl(info.hub_icon_url)} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-riftapp-text-muted">
              {info.hub_name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <p className="text-riftapp-text-dim text-sm mb-1">You've been invited to join</p>
        <h2 className="text-2xl font-bold mb-2">{info.hub_name}</h2>
        <div className="flex items-center justify-center gap-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-riftapp-text-dim/40" />
          <span className="text-sm text-riftapp-text-dim">
            {info.member_count} {info.member_count === 1 ? 'Member' : 'Members'}
          </span>
        </div>

        {alreadyMember ? (
          <button onClick={handleGoTo} className="btn-primary px-8 py-3 text-base font-semibold">
            Go to Server
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="btn-primary px-8 py-3 text-base font-semibold"
          >
            {joining ? 'Joining...' : 'Accept Invite'}
          </button>
        )}

        <button
          onClick={() => navigate('/app')}
          className="block mx-auto mt-3 text-sm text-riftapp-text-dim hover:text-riftapp-text transition-colors"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
