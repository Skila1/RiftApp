import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { useStreamStore } from '../../stores/streamStore';
import { api } from '../../api/client';
import type { Hub, Friendship } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ModalOverlay from '../shared/ModalOverlay';
import ModalCloseButton from '../shared/ModalCloseButton';
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

const DEFAULT_EXPIRE_AFTER = 604800;

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function expireLabel(seconds: number): string {
  const opt = EXPIRE_OPTIONS.find((o) => o.value === seconds);
  return opt?.label ?? '7 days';
}

function getInviteUrl(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}

export default function InviteToServerModal({ hub, onClose }: Props) {
  const friends = useFriendStore((s) => s.friends);
  const friendsLoading = useFriendStore((s) => s.loading);
  const loadFriends = useFriendStore((s) => s.loadFriends);
  const streams = useStreamStore((s) => s.streams);
  const activeStreamId = useStreamStore((s) => s.activeStreamId);

  const [search, setSearch] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [expireAfter, setExpireAfter] = useState(DEFAULT_EXPIRE_AFTER);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (friends.length === 0) {
      void loadFriends();
    }
  }, [friends.length, loadFriends]);

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
        const invite = await api.createInvite(hub.id, { expires_in: DEFAULT_EXPIRE_AFTER });
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
    if (!showSettings) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [showSettings]);

  const firstChannelName = useMemo(() => {
    const activeTextStream = streams.find((stream) => stream.id === activeStreamId && stream.hub_id === hub.id && stream.type === 0);
    if (activeTextStream) {
      return activeTextStream.name;
    }
    return streams.find((stream) => stream.hub_id === hub.id && stream.type === 0)?.name ?? 'general';
  }, [activeStreamId, hub.id, streams]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return friends
      .filter((friendship): friendship is Friendship & { user: NonNullable<Friendship['user']> } => friendship.user != null)
      .filter((friendship) => {
        if (!query) return true;
        const label = (friendship.user.display_name || friendship.user.username).toLowerCase();
        const username = friendship.user.username.toLowerCase();
        return label.includes(query) || username.includes(query);
      })
      .sort((left, right) => {
        const leftLabel = left.user.display_name || left.user.username;
        const rightLabel = right.user.display_name || right.user.username;
        return leftLabel.localeCompare(rightLabel);
      });
  }, [friends, search]);

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
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300} className="p-4 sm:p-6">
      {!showSettings && (
      <div
        className="flex max-h-[min(78vh,620px)] w-[min(88vw,340px)] flex-col overflow-hidden rounded-[20px] bg-riftapp-menu text-[#f2f3f5] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="flex-shrink-0 px-3.5 pb-0 pt-3.5">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold leading-snug text-[#f2f3f5]">
                Invite friends to {hub.name}
              </h2>
              <p className="mt-0.5 text-[12px] leading-5 text-[#b5bac1]">
                Recipients will land in <span className="font-medium text-[#dbdee1]">#{firstChannelName}</span>
              </p>
            </div>
            <ModalCloseButton onClick={onClose} className="-mr-1 -mt-1 border-white/10 bg-transparent hover:bg-white/5" />
          </div>

          <div className="relative mt-3">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#949ba4]" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for friends"
              className="h-9 w-full rounded-[8px] border border-white/8 bg-[#1e1f22] py-2 pl-9 pr-3 text-[13px] text-[#f2f3f5] outline-none transition-colors placeholder:text-[#878b92] focus:border-[#5865f2]"
            />
          </div>
        </div>

        <div className="mt-2.5 flex-1 overflow-y-auto px-2 pb-2">
          {friendsLoading && friends.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#949ba4]">
              Loading friends...
            </div>
          ) : null}
          {friends.length === 0 && !friendsLoading && !generating && (
            <div className="py-10 text-center text-[13px] text-[#949ba4]">
              No friends to invite yet
            </div>
          )}
          {filtered.length === 0 && friends.length > 0 && search && (
            <div className="py-10 text-center text-[13px] text-[#949ba4]">
              No results for "{search}"
            </div>
          )}
          {filtered.map((friend) => {
            const u = friend.user;
            const isSent = sentTo.has(u.id);
            const isSending = sending.has(u.id);
            const label = u.display_name || u.username;

            return (
              <div
                key={u.id}
                className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
              >
                <div className="relative flex-shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#232428]">
                    {u.avatar_url ? (
                      <img src={publicAssetUrl(u.avatar_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-semibold uppercase text-[#dbdee1]">
                        {label.slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#313338]">
                    <StatusDot userId={u.id} fallbackStatus={u.status} size="sm" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#f2f3f5]">{label}</p>
                  <p className="truncate text-[11px] text-[#949ba4]">{u.username}</p>
                </div>

                <button
                  onClick={() => handleInvite(friend)}
                  disabled={isSent || isSending || !inviteUrl}
                  className={`flex h-7 min-w-[64px] flex-shrink-0 items-center justify-center rounded-[6px] px-3 text-[12px] font-semibold transition-colors ${
                    isSent
                      ? 'cursor-default border border-[#3ba55d]/40 bg-[#2b6a43]/20 text-[#57f287]'
                      : 'border border-white/10 bg-[#4e5058] text-[#f2f3f5] hover:bg-[#5d6068]'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {isSent ? (
                    <span className="flex items-center gap-1 text-[11px]">
                      <CheckIcon className="h-3.5 w-3.5" />
                      Sent
                    </span>
                  ) : isSending ? 'Sending...' : 'Invite'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="bg-riftapp-menu px-3.5 pb-3.5 pt-2.5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
            Or send a server invite link
          </p>
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center overflow-hidden rounded-[8px] bg-[#1e1f22] px-3 font-mono text-[12px] text-[#f2f3f5]">
              {generating ? (
                <span className="text-[#878b92]">Generating...</span>
              ) : inviteUrl || (
                <span className="text-[#878b92]">—</span>
              )}
            </div>
            <button
              onClick={handleCopy}
              disabled={!inviteUrl}
              className={`flex h-9 min-w-[76px] flex-shrink-0 items-center justify-center rounded-[8px] px-4 text-[12px] font-semibold transition-colors ${
                copied
                  ? 'bg-[#248046] text-white'
                  : 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px]">
            <p className="text-[#949ba4]">
              Invite expires in {expireLabel(expireAfter)}.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="font-medium text-[#00a8fc] hover:underline"
            >
              Edit invite link
            </button>
          </div>
        </div>
      </div>
      )}

      {showSettings && (
        <InviteSettingsModal
          currentExpire={expireAfter}
          onGenerate={(expire, maxUses) => {
            setExpireAfter(expire);
            setShowSettings(false);
            generateInvite(expire, maxUses);
          }}
          onBack={() => setShowSettings(false)}
          onClose={onClose}
        />
      )}
    </ModalOverlay>
  );
}

function InviteSettingsModal({
  currentExpire,
  onGenerate,
  onBack,
  onClose,
}: {
  currentExpire: number;
  onGenerate: (expire: number, maxUses: number) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [expire, setExpire] = useState(currentExpire);
  const [maxUses, setMaxUses] = useState(0);
  const [tempMembership, setTempMembership] = useState(false);

  return (
      <div
        className="w-[min(88vw,340px)] overflow-hidden rounded-[20px] bg-riftapp-menu text-[#f2f3f5] shadow-[0_24px_80px_rgba(0,0,0,0.45)] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-3.5 pb-2.5 pt-3.5">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBack}
              className="-ml-1 rounded-md p-1 text-[#b5bac1] transition-colors hover:bg-white/5 hover:text-white"
              title="Back"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div>
              <h3 className="text-[16px] font-semibold text-[#f2f3f5]">Server invite link settings</h3>
              <p className="mt-0.5 text-[12px] text-[#b5bac1]">
                Customize your invite link
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={onClose} className="-mr-1 -mt-1 border-white/10 bg-transparent hover:bg-white/5" title="Close invite settings" ariaLabel="Close invite settings" />
        </div>

        <div className="space-y-4 px-3.5 pb-3.5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
              Expire after
            </label>
            <select
              value={expire}
              onChange={(e) => setExpire(Number(e.target.value))}
              className="h-10 w-full cursor-pointer appearance-none rounded-[8px] border border-white/8 bg-[#1e1f22] px-3 text-[13px] text-[#f2f3f5] outline-none transition-colors focus:border-[#5865f2]"
            >
              {EXPIRE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
              Max number of uses
            </label>
            <select
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="h-10 w-full cursor-pointer appearance-none rounded-[8px] border border-white/8 bg-[#1e1f22] px-3 text-[13px] text-[#f2f3f5] outline-none transition-colors focus:border-[#5865f2]"
            >
              {MAX_USES_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-[10px] bg-[#2b2d31] px-3 py-3">
            <div>
              <p className="text-[13px] font-medium text-[#dbdee1]">
                Grant temporary membership
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[#949ba4]">
                Temporary members are automatically kicked when they disconnect unless a role has been assigned
              </p>
            </div>
            <button
              onClick={() => setTempMembership(!tempMembership)}
              className={`relative mt-0.5 h-6 w-10 flex-shrink-0 rounded-full transition-colors ${
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

        <div className="flex items-center justify-end gap-3 bg-riftapp-menu px-3.5 py-3">
          <button
            onClick={onBack}
            className="px-2 py-2 text-[13px] font-medium text-[#f2f3f5] hover:underline"
          >
            Cancel
          </button>
          <button
            onClick={() => onGenerate(expire, maxUses)}
            className="rounded-[8px] bg-[#5865f2] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            Generate a New Link
          </button>
        </div>
      </div>
  );
}
