import { useState, useEffect } from 'react';
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

export default function InviteEmbed({ code }: { code: string }) {
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const hubs = useHubStore((s) => s.hubs);

  const alreadyMember = info ? hubs.some((h) => h.id === info.hub_id) : false;

  useEffect(() => {
    let cancelled = false;
    api.getInviteInfo(code).then((data) => {
      if (!cancelled) setInfo(data);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [code]);

  const handleJoin = async () => {
    if (!info || alreadyMember || joined) return;
    setJoining(true);
    try {
      await api.joinInvite(code);
      setJoined(true);
      await useHubStore.getState().loadHubs();
      useHubStore.getState().setActiveHub(info.hub_id);
    } catch {
      // ignore
    } finally {
      setJoining(false);
    }
  };

  const handleGoTo = () => {
    if (!info) return;
    useHubStore.getState().setActiveHub(info.hub_id);
  };

  if (error) return null;
  if (!info) {
    return (
      <div className="mt-2 w-[380px] h-[72px] rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 animate-pulse" />
    );
  }

  return (
    <div className="mt-2 w-[380px] rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 p-4 flex items-center gap-3">
      {/* Hub icon */}
      <div className="w-12 h-12 rounded-2xl bg-riftapp-panel flex items-center justify-center flex-shrink-0 overflow-hidden">
        {info.hub_icon_url ? (
          <img src={publicAssetUrl(info.hub_icon_url)} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-riftapp-text-muted">
            {info.hub_name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{info.hub_name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full bg-riftapp-text-dim/40 flex-shrink-0" />
          <span className="text-[12px] text-riftapp-text-dim">
            {info.member_count} {info.member_count === 1 ? 'Member' : 'Members'}
          </span>
        </div>
      </div>

      {/* Action button */}
      {alreadyMember || joined ? (
        <button
          onClick={handleGoTo}
          className="btn-ghost px-4 py-1.5 text-[13px] font-medium flex-shrink-0 border border-riftapp-border/50"
        >
          Joined
        </button>
      ) : (
        <button
          onClick={handleJoin}
          disabled={joining}
          className="btn-primary px-4 py-1.5 text-[13px] font-medium flex-shrink-0"
        >
          {joining ? 'Joining...' : 'Join'}
        </button>
      )}
    </div>
  );
}
