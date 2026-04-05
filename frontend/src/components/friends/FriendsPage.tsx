import { useEffect, useState, useRef } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useDMStore } from '../../stores/dmStore';
import { api } from '../../api/client';
import StatusDot, { statusLabel } from '../shared/StatusDot';
import type { User, Friendship, Block } from '../../types';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

export default function FriendsPage() {
  const [tab, setTab] = useState<Tab>('online');
  const friends = useFriendStore((s) => s.friends);
  const pendingIncoming = useFriendStore((s) => s.pendingIncoming);
  const pendingOutgoing = useFriendStore((s) => s.pendingOutgoing);
  const blocked = useFriendStore((s) => s.blocked);
  const pendingCount = useFriendStore((s) => s.pendingCount);
  const loading = useFriendStore((s) => s.loading);
  const loadFriends = useFriendStore((s) => s.loadFriends);
  const loadPending = useFriendStore((s) => s.loadPending);
  const loadBlocked = useFriendStore((s) => s.loadBlocked);
  const presence = usePresenceStore((s) => s.presence);

  useEffect(() => {
    loadFriends();
    loadPending();
    loadBlocked();
  }, [loadFriends, loadPending, loadBlocked]);

  const onlineFriends = friends.filter(
    (f) => f.user && (presence[f.user.id] ?? f.user.status) > 0
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'online', label: 'Online', count: onlineFriends.length },
    { key: 'all', label: 'All', count: friends.length },
    { key: 'pending', label: 'Pending', count: pendingCount || undefined },
    { key: 'blocked', label: 'Blocked' },
    { key: 'add', label: 'Add Friend' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-riftapp-bg min-w-0">
      {/* Header bar */}
      <div className="h-12 flex items-center gap-1 px-4 border-b border-riftapp-border/60 flex-shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-riftapp-text-dim">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span className="font-semibold text-[15px]">Friends</span>
        </div>
        <div className="h-6 w-px bg-riftapp-border/40 mx-1" />
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors relative ${
              t.key === 'add'
                ? tab === 'add'
                  ? 'bg-transparent text-riftapp-success'
                  : 'bg-riftapp-success/20 text-riftapp-success hover:bg-riftapp-success/30'
                : tab === t.key
                  ? 'bg-riftapp-surface-hover text-riftapp-text'
                  : 'text-riftapp-text-muted hover:bg-riftapp-surface-hover/50 hover:text-riftapp-text'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-1.5 min-w-[18px] h-[16px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none ${
                t.key === 'pending' ? 'bg-riftapp-danger text-white' : 'bg-riftapp-surface text-riftapp-text-dim'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && friends.length === 0 ? (
          <div className="flex items-center justify-center h-full text-riftapp-text-dim">
            <div className="w-6 h-6 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === 'online' && <FriendList friends={onlineFriends} emptyLabel="No friends online right now" />}
            {tab === 'all' && <FriendList friends={friends} emptyLabel="You don't have any friends yet. Add some!" />}
            {tab === 'pending' && <PendingList incoming={pendingIncoming} outgoing={pendingOutgoing} />}
            {tab === 'blocked' && <BlockedList blocked={blocked} />}
            {tab === 'add' && <AddFriend />}
          </>
        )}
      </div>
    </div>
  );
}

function FriendList({ friends, emptyLabel }: { friends: Friendship[]; emptyLabel: string }) {
  const removeFriend = useFriendStore((s) => s.removeFriend);
  const blockUser = useFriendStore((s) => s.blockUser);

  if (friends.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="px-6 py-4">
      <p className="section-label px-2 mb-2">Friends — {friends.length}</p>
      <div className="space-y-px">
        {friends.map((f) => {
          const user = f.user!;
          return (
            <FriendRow key={user.id} user={user}>
              <ActionBtn icon="message" title="Message" onClick={() => useDMStore.getState().openDM(user.id)} />
              <ActionBtn icon="remove" title="Remove Friend" onClick={() => removeFriend(user.id)} danger />
              <ActionBtn icon="block" title="Block" onClick={() => blockUser(user.id)} danger />
            </FriendRow>
          );
        })}
      </div>
    </div>
  );
}

function PendingList({ incoming, outgoing }: { incoming: Friendship[]; outgoing: Friendship[] }) {
  const acceptRequest = useFriendStore((s) => s.acceptRequest);
  const rejectRequest = useFriendStore((s) => s.rejectRequest);
  const cancelRequest = useFriendStore((s) => s.cancelRequest);

  if (incoming.length === 0 && outgoing.length === 0) {
    return <EmptyState label="No pending friend requests" />;
  }

  return (
    <div className="px-6 py-4 space-y-4">
      {incoming.length > 0 && (
        <div>
          <p className="section-label px-2 mb-2">Incoming — {incoming.length}</p>
          <div className="space-y-px">
            {incoming.map((f) => {
              const user = f.user!;
              return (
                <FriendRow key={user.id} user={user} subtitle="Incoming Friend Request">
                  <ActionBtn icon="accept" title="Accept" onClick={() => acceptRequest(user.id)} success />
                  <ActionBtn icon="reject" title="Reject" onClick={() => rejectRequest(user.id)} danger />
                </FriendRow>
              );
            })}
          </div>
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <p className="section-label px-2 mb-2">Outgoing — {outgoing.length}</p>
          <div className="space-y-px">
            {outgoing.map((f) => {
              const user = f.user!;
              return (
                <FriendRow key={user.id} user={user} subtitle="Outgoing Friend Request">
                  <ActionBtn icon="reject" title="Cancel" onClick={() => cancelRequest(user.id)} danger />
                </FriendRow>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockedList({ blocked }: { blocked: Block[] }) {
  const unblockUser = useFriendStore((s) => s.unblockUser);

  if (blocked.length === 0) {
    return <EmptyState label="You haven't blocked anyone" />;
  }

  return (
    <div className="px-6 py-4">
      <p className="section-label px-2 mb-2">Blocked — {blocked.length}</p>
      <div className="space-y-px">
        {blocked.map((b) => {
          const user = b.user!;
          return (
            <div key={user.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-riftapp-surface/60 transition-colors group">
              <div className="w-9 h-9 rounded-full bg-riftapp-panel flex items-center justify-center text-sm font-semibold text-riftapp-text-dim flex-shrink-0 overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.display_name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.display_name}</p>
                <p className="text-xs text-riftapp-text-dim">@{user.username}</p>
              </div>
              <button
                onClick={() => unblockUser(user.id)}
                className="px-3 py-1 rounded text-xs font-medium bg-riftapp-surface hover:bg-riftapp-surface-hover border border-riftapp-border/40 text-riftapp-text-muted hover:text-riftapp-text transition-colors opacity-0 group-hover:opacity-100"
              >
                Unblock
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddFriend() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendRequest = useFriendStore((s) => s.sendRequest);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus('loading');
    setFoundUser(null);
    try {
      const user = await api.searchUser(q);
      setFoundUser(user);
      setStatus('idle');
    } catch {
      setStatus('error');
      setErrorMsg('User not found. Make sure the username is correct.');
    }
  };

  const handleSendRequest = async () => {
    if (!foundUser) return;
    setStatus('loading');
    try {
      await sendRequest(foundUser.id);
      setStatus('success');
      setQuery('');
      setFoundUser(null);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send request');
    }
  };

  return (
    <div className="px-6 py-6">
      <h3 className="text-lg font-bold mb-1">Add Friend</h3>
      <p className="text-sm text-riftapp-text-muted mb-4">You can add friends by their username.</p>
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setStatus('idle'); setFoundUser(null); }}
            placeholder="Enter a username"
            className="settings-input w-full py-3 px-4 text-sm"
            maxLength={32}
          />
          {status === 'success' && (
            <p className="text-xs text-riftapp-success mt-1.5">Friend request sent successfully!</p>
          )}
          {status === 'error' && (
            <p className="text-xs text-riftapp-danger mt-1.5">{errorMsg}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={!query.trim() || status === 'loading'}
          className="btn-primary px-6 py-3 text-sm font-medium"
        >
          {status === 'loading' ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : 'Search'}
        </button>
      </form>

      {foundUser && (
        <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-riftapp-surface border border-riftapp-border/40">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-riftapp-accent/20 flex items-center justify-center text-sm font-semibold text-riftapp-accent overflow-hidden">
              {foundUser.avatar_url ? (
                <img src={foundUser.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                foundUser.display_name.slice(0, 2).toUpperCase()
              )}
            </div>
            <StatusDot userId={foundUser.id} fallbackStatus={foundUser.status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-riftapp-surface" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{foundUser.display_name}</p>
            <p className="text-xs text-riftapp-text-dim">@{foundUser.username}</p>
          </div>
          <button
            onClick={handleSendRequest}
            disabled={status === 'loading'}
            className="btn-primary px-4 py-1.5 text-sm font-medium"
          >
            Send Request
          </button>
        </div>
      )}
    </div>
  );
}

function FriendRow({ user, subtitle, children }: { user: User; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-riftapp-surface/60 transition-colors group">
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-riftapp-accent/20 flex items-center justify-center text-sm font-semibold text-riftapp-accent overflow-hidden">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            user.display_name.slice(0, 2).toUpperCase()
          )}
        </div>
        <StatusDot userId={user.id} fallbackStatus={user.status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-riftapp-bg" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user.display_name}</p>
        <p className="text-xs text-riftapp-text-dim">{subtitle || statusLabel(user.status)}</p>
      </div>
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {children}
      </div>
    </div>
  );
}

function ActionBtn({ icon, title, onClick, danger, success }: { icon: string; title: string; onClick: () => void; danger?: boolean; success?: boolean }) {
  const color = danger ? 'text-riftapp-danger hover:bg-riftapp-danger/20' : success ? 'text-riftapp-success hover:bg-riftapp-success/20' : 'text-riftapp-text-muted hover:bg-riftapp-surface-hover';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded-full bg-riftapp-surface border border-riftapp-border/40 flex items-center justify-center transition-colors ${color}`}
    >
      {icon === 'message' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      {icon === 'remove' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="11" x2="23" y2="11" />
        </svg>
      )}
      {icon === 'block' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      )}
      {icon === 'accept' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {icon === 'reject' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-riftapp-text-dim/30 mb-4">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
      <p className="text-sm text-riftapp-text-dim">{label}</p>
    </div>
  );
}
