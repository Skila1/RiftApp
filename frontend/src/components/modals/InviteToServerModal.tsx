import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFriendStore } from '../../stores/friendStore';
import { api } from '../../api/client';
import type { Hub, Friendship } from '../../types';
import StatusDot from '../shared/StatusDot';

interface Props {
  hub: Hub;
  onClose: () => void;
}

function getInviteUrl(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}

export default function InviteToServerModal({ hub, onClose }: Props) {
  const friends = useFriendStore((s) => s.friends);
  const loadFriends = useFriendStore((s) => s.loadFriends);

  const [search, setSearch] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        const invite = await api.createInvite(hub.id, { expires_in: 604800 });
        if (!cancelled) {
          setInviteUrl(getInviteUrl(invite.code));
        }
      } catch {
        // fallback: generate on demand
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hub.id]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = friends.filter((f) => {
    if (!f.user) return false;
    const q = search.toLowerCase();
    return (
      f.user.display_name.toLowerCase().includes(q) ||
      f.user.username.toLowerCase().includes(q)
    );
  });

  const handleInvite = async (friend: Friendship) => {
    if (!friend.user || !inviteUrl) return;
    const uid = friend.user.id;
    setSending((s) => new Set(s).add(uid));
    try {
      const conv = await api.createOrOpenDM(uid);
      await api.sendDMMessage(conv.id, inviteUrl);
      setSentTo((s) => new Set(s).add(uid));
    } catch {
      // silently fail
    } finally {
      setSending((s) => {
        const next = new Set(s);
        next.delete(uid);
        return next;
      });
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-riftapp-surface rounded-xl w-[440px] max-h-[600px] flex flex-col shadow-modal animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-0 flex-shrink-0">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-lg font-bold">Invite friends to {hub.name}</h2>
              <p className="text-[13px] text-riftapp-text-dim mt-0.5">
                They'll receive a DM with the invite link
              </p>
            </div>
            <button onClick={onClose} className="text-riftapp-text-dim hover:text-riftapp-text p-1 -mr-1 -mt-1 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3 mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-riftapp-text-dim pointer-events-none">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for friends"
              className="w-full pl-10 pr-3 py-2 rounded-lg bg-riftapp-bg border border-riftapp-border/50 text-sm
                placeholder-riftapp-text-dim focus:outline-none focus:border-riftapp-accent/50 transition-colors"
            />
          </div>
        </div>

        {/* Friends list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
          {friends.length === 0 && !generating && (
            <div className="text-center py-8 text-riftapp-text-dim text-sm">
              No friends to invite yet
            </div>
          )}
          {filtered.map((friend) => {
            if (!friend.user) return null;
            const u = friend.user;
            const isSent = sentTo.has(u.id);
            const isSending = sending.has(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-riftapp-surface-hover/60 transition-colors">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-riftapp-panel flex items-center justify-center overflow-hidden">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-riftapp-text-muted">
                        {u.display_name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <StatusDot userId={u.id} fallbackStatus={u.status} size="md"
                    className="absolute -bottom-0.5 -right-0.5 border-2 border-riftapp-surface" />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.display_name}</p>
                  <p className="text-[11px] text-riftapp-text-dim truncate">{u.username}</p>
                </div>

                {/* Invite button */}
                <button
                  onClick={() => handleInvite(friend)}
                  disabled={isSent || isSending || !inviteUrl}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                    isSent
                      ? 'bg-riftapp-success/20 text-riftapp-success border border-riftapp-success/30 cursor-default'
                      : 'bg-riftapp-surface border border-riftapp-border/60 text-riftapp-text hover:bg-riftapp-surface-hover hover:border-riftapp-border active:scale-95'
                  } disabled:opacity-50`}
                >
                  {isSent ? 'Sent' : isSending ? 'Sending...' : 'Invite'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer: invite link */}
        <div className="px-5 py-4 border-t border-riftapp-border/40 flex-shrink-0 bg-riftapp-bg/30">
          <p className="text-[12px] text-riftapp-text-dim mb-2 font-medium">
            Or, send a server invite link to a friend
          </p>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg bg-riftapp-bg border border-riftapp-border/50 text-sm text-riftapp-text font-mono truncate select-all">
              {generating ? 'Generating...' : inviteUrl || '—'}
            </div>
            <button
              onClick={handleCopy}
              disabled={!inviteUrl}
              className="btn-primary px-4 py-2 text-[13px] flex-shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-riftapp-text-dim mt-2">
            Your invite link expires in 7 days.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
