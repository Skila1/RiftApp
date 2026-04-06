import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFriendStore } from '../../stores/friendStore';
import { api } from '../../api/client';
import type { Hub, Friendship } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import StatusDot from '../shared/StatusDot';

interface Props {
  hub: Hub;
  onClose: () => void;
}

/* ───── Expire / Max-uses options ───── */

const EXPIRE_OPTIONS = [
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: 'Never', value: 0 },
] as const;

const MAX_USES_OPTIONS = [
  { label: 'No limit', value: 0 },
  { label: '1 use', value: 1 },
  { label: '5 uses', value: 5 },
  { label: '10 uses', value: 10 },
  { label: '25 uses', value: 25 },
  { label: '50 uses', value: 50 },
  { label: '100 uses', value: 100 },
] as const;

function expireLabel(seconds: number): string {
  const opt = EXPIRE_OPTIONS.find((o) => o.value === seconds);
  return opt?.label ?? '7 days';
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
  const [showSettings, setShowSettings] = useState(false);
  const [expireAfter, setExpireAfter] = useState(604800); // 7 days default
  const inputRef = useRef<HTMLInputElement>(null);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showSettings]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const generateInvite = useCallback(async (expires: number, maxUses?: number) => {
    setGenerating(true);
    try {
      const opts: { expires_in?: number; max_uses?: number } = {};
      if (expires > 0) opts.expires_in = expires;
      if (maxUses && maxUses > 0) opts.max_uses = maxUses;
      const invite = await api.createInvite(hub.id, opts);
      setInviteUrl(getInviteUrl(invite.code));
    } catch {
      // fallback
    } finally {
      setGenerating(false);
    }
  }, [hub.id]);

  // Auto-generate on mount
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
        // fallback
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

  // Get first text channel name for subtitle
  const firstChannelName = 'general';

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={showSettings ? () => setShowSettings(false) : onClose}
    >
      {/* ───── Invite Friends View ───── */}
      {!showSettings && (
      <div
        className="bg-[#313338] rounded-xl w-[440px] max-h-[620px] flex flex-col shadow-modal animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ───── Header ───── */}
        <div className="px-5 pt-5 pb-0 flex-shrink-0">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[18px] font-bold text-white leading-snug">
                Invite friends to {hub.name}
              </h2>
              <p className="text-[13px] text-[#b5bac1] mt-0.5">
                Recipients will land in <span className="font-medium text-[#dbdee1]">#{firstChannelName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[#b5bac1] hover:text-white p-1 -mr-1 -mt-1 transition-colors rounded-md hover:bg-white/[0.06]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3 mb-3">
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#949ba4] pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for friends"
              className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-[#1e1f22] border border-transparent text-sm text-white
                placeholder-[#949ba4] focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
            />
          </div>
        </div>

        {/* ───── Friends list ───── */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[120px] max-h-[320px]">
          {friends.length === 0 && !generating && (
            <div className="text-center py-8 text-[#949ba4] text-sm">
              No friends to invite yet
            </div>
          )}
          {filtered.length === 0 && friends.length > 0 && search && (
            <div className="text-center py-8 text-[#949ba4] text-sm">
              No results for "{search}"
            </div>
          )}
          {filtered.map((friend) => {
            if (!friend.user) return null;
            const u = friend.user;
            const isSent = sentTo.has(u.id);
            const isSending = sending.has(u.id);
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-[#2b2d31] flex items-center justify-center overflow-hidden">
                    {u.avatar_url ? (
                      <img src={publicAssetUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-[#dbdee1]">
                        {u.display_name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <StatusDot
                    userId={u.id}
                    fallbackStatus={u.status}
                    size="md"
                    className="absolute -bottom-0.5 -right-0.5 border-2 border-[#313338]"
                  />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-[#dbdee1]">{u.display_name}</p>
                  <p className="text-[11px] text-[#949ba4] truncate">{u.username}</p>
                </div>

                {/* Invite button */}
                <button
                  onClick={() => handleInvite(friend)}
                  disabled={isSent || isSending || !inviteUrl}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-[4px] text-[13px] font-medium transition-all ${
                    isSent
                      ? 'bg-[#248046]/20 text-[#57f287] border border-[#248046]/40 cursor-default'
                      : 'bg-[#5865f2] text-white hover:bg-[#4752c4] active:scale-95'
                  } disabled:opacity-50`}
                >
                  {isSent ? (
                    <span className="flex items-center gap-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Sent
                    </span>
                  ) : isSending ? 'Sending...' : 'Invite'}
                </button>
              </div>
            );
          })}
        </div>

        {/* ───── Divider ───── */}
        <div className="mx-5">
          <div className="h-px bg-[#3f4147]" />
        </div>

        {/* ───── Footer: invite link ───── */}
        <div className="px-5 py-4 flex-shrink-0">
          <p className="text-[12px] text-[#b5bac1] mb-2 font-semibold uppercase tracking-wide">
            Or send a server invite link
          </p>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2.5 rounded-[4px] bg-[#1e1f22] text-sm text-[#dbdee1] font-mono truncate select-all">
              {generating ? (
                <span className="text-[#949ba4]">Generating...</span>
              ) : inviteUrl || (
                <span className="text-[#949ba4]">—</span>
              )}
            </div>
            <button
              onClick={handleCopy}
              disabled={!inviteUrl}
              className={`px-5 py-2.5 rounded-[4px] text-[13px] font-medium flex-shrink-0 transition-all active:scale-95 ${
                copied
                  ? 'bg-[#248046] text-white'
                  : 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex items-center gap-1 mt-2">
            <p className="text-[11px] text-[#949ba4]">
              Invite expires in {expireLabel(expireAfter)}.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="text-[11px] text-[#00a8fc] hover:underline font-medium"
            >
              Edit invite link
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ───── Invite Settings View (replaces invite view) ───── */}
      {showSettings && (
        <InviteSettingsModal
          currentExpire={expireAfter}
          onGenerate={(expire, maxUses) => {
            setExpireAfter(expire);
            setShowSettings(false);
            generateInvite(expire, maxUses);
          }}
          onBack={() => setShowSettings(false)}
        />
      )}
    </div>,
    document.body,
  );
}

/* ───── Invite Link Settings Modal ───── */

function InviteSettingsModal({
  currentExpire,
  onGenerate,
  onBack,
}: {
  currentExpire: number;
  onGenerate: (expire: number, maxUses: number) => void;
  onBack: () => void;
}) {
  const [expire, setExpire] = useState(currentExpire);
  const [maxUses, setMaxUses] = useState(0);
  const [tempMembership, setTempMembership] = useState(false);

  return (
      <div
        className="bg-[#313338] rounded-xl w-[400px] shadow-modal animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBack}
              className="text-[#b5bac1] hover:text-white p-1 -ml-1 transition-colors rounded-md hover:bg-white/[0.06]"
              title="Back"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h3 className="text-[16px] font-bold text-white">Server invite link settings</h3>
              <p className="text-[13px] text-[#b5bac1] mt-0.5">
                Customize your invite link
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="text-[#b5bac1] hover:text-white p-1 -mr-1 -mt-1 transition-colors rounded-md hover:bg-white/[0.06]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Expire after */}
          <div>
            <label className="text-[12px] font-semibold text-[#b5bac1] uppercase tracking-wide mb-1.5 block">
              Expire after
            </label>
            <select
              value={expire}
              onChange={(e) => setExpire(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-[4px] bg-[#1e1f22] text-sm text-[#dbdee1] border-none
                focus:outline-none focus:ring-1 focus:ring-[#5865f2] appearance-none cursor-pointer"
            >
              {EXPIRE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Max uses */}
          <div>
            <label className="text-[12px] font-semibold text-[#b5bac1] uppercase tracking-wide mb-1.5 block">
              Max number of uses
            </label>
            <select
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-[4px] bg-[#1e1f22] text-sm text-[#dbdee1] border-none
                focus:outline-none focus:ring-1 focus:ring-[#5865f2] appearance-none cursor-pointer"
            >
              {MAX_USES_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Grant temporary membership */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-[#dbdee1]">
                Grant temporary membership
              </p>
              <p className="text-[12px] text-[#949ba4] mt-0.5 leading-relaxed">
                Temporary members are automatically kicked when they disconnect unless a role has been assigned
              </p>
            </div>
            <button
              onClick={() => setTempMembership(!tempMembership)}
              className={`flex-shrink-0 mt-0.5 w-10 h-6 rounded-full transition-colors relative ${
                tempMembership ? 'bg-[#5865f2]' : 'bg-[#72767d]'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  tempMembership ? 'left-5' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 bg-[#2b2d31] flex items-center justify-end gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 text-[13px] font-medium text-[#dbdee1] hover:underline"
          >
            Cancel
          </button>
          <button
            onClick={() => onGenerate(expire, maxUses)}
            className="px-5 py-2.5 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium
              hover:bg-[#4752c4] active:scale-95 transition-all"
          >
            Generate a New Link
          </button>
        </div>
      </div>
  );
}
