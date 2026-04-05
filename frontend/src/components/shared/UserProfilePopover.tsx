import { useEffect, useRef, useState, useCallback } from 'react';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useAuthStore } from '../../stores/auth';
import { useFriendStore } from '../../stores/friendStore';
import { useDMStore } from '../../stores/dmStore';
import { api } from '../../api/client';
import StatusDot, { statusLabel } from './StatusDot';
import type { RelationshipType } from '../../types';

const CARD_WIDTH = 300;
const CARD_GAP = 8;

function nameColor(name: string): string {
  const colors = [
    '#f47067', '#e0823d', '#c4a000', '#57ab5a', '#39c5cf',
    '#6cb6ff', '#dcbdfb', '#f69d50', '#fc8dc7', '#b083f0',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function UserProfilePopover() {
  const user = useProfilePopoverStore((s) => s.user);
  const anchorRect = useProfilePopoverStore((s) => s.anchorRect);
  const close = useProfilePopoverStore((s) => s.close);
  const liveStatus = usePresenceStore((s) => (user ? s.presence[user.id] : undefined));
  const currentUser = useAuthStore((s) => s.user);

  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [rel, setRel] = useState<RelationshipType>('none');
  const [relLoading, setRelLoading] = useState(false);

  const computePosition = useCallback(() => {
    if (!anchorRect || !cardRef.current) return;
    const card = cardRef.current;
    const cardH = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.right + CARD_GAP;
    if (left + CARD_WIDTH > vw - CARD_GAP) {
      left = anchorRect.left - CARD_WIDTH - CARD_GAP;
    }
    left = Math.max(CARD_GAP, Math.min(left, vw - CARD_WIDTH - CARD_GAP));

    let top = anchorRect.top;
    if (top + cardH > vh - CARD_GAP) {
      top = vh - cardH - CARD_GAP;
    }
    top = Math.max(CARD_GAP, top);

    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    if (user && anchorRect) {
      setRel('none');
      if (currentUser && user.id !== currentUser.id) {
        api.getRelationship(user.id).then((r) => setRel(r.relationship)).catch(() => {});
      }
      requestAnimationFrame(() => {
        computePosition();
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [user, anchorRect, computePosition, currentUser]);

  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick, true);
    };
  }, [user, close]);

  if (!user) return null;

  const isSelf = currentUser?.id === user.id;
  const status = liveStatus ?? user.status;
  const accent = nameColor(user.display_name || user.username);

  const handleAddFriend = async () => {
    setRelLoading(true);
    try { await useFriendStore.getState().sendRequest(user.id); setRel('pending_outgoing'); } catch { /* ignore */ }
    setRelLoading(false);
  };
  const handleAccept = async () => {
    setRelLoading(true);
    try { await useFriendStore.getState().acceptRequest(user.id); setRel('friends'); } catch { /* ignore */ }
    setRelLoading(false);
  };
  const handleRemoveFriend = async () => {
    setRelLoading(true);
    try { await useFriendStore.getState().removeFriend(user.id); setRel('none'); } catch { /* ignore */ }
    setRelLoading(false);
  };
  const handleBlock = async () => {
    setRelLoading(true);
    try { await useFriendStore.getState().blockUser(user.id); setRel('blocked'); } catch { /* ignore */ }
    setRelLoading(false);
  };
  const handleUnblock = async () => {
    setRelLoading(true);
    try { await useFriendStore.getState().unblockUser(user.id); setRel('none'); } catch { /* ignore */ }
    setRelLoading(false);
  };
  const handleMessage = async () => {
    close();
    await useDMStore.getState().openDM(user.id);
  };

  return (
    <div
      ref={cardRef}
      className="fixed z-[100] transition-all duration-150 ease-out"
      style={{
        top: pos.top,
        left: pos.left,
        width: CARD_WIDTH,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className="bg-riftapp-surface rounded-xl border border-riftapp-border/50 shadow-modal overflow-hidden">
        {/* Banner area */}
        <div className="h-16 relative" style={{ backgroundColor: accent + '40' }}>
          <div className="absolute -bottom-8 left-4">
            <div
              className="w-[72px] h-[72px] rounded-full border-[4px] border-riftapp-surface flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: accent }}
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-white">
                  {(user.display_name || user.username).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute bottom-[2px] right-[2px] border-[3px] border-riftapp-surface rounded-full">
              <StatusDot userId={user.id} fallbackStatus={user.status} size="lg" />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="pt-10 px-4 pb-4">
          <p className="text-lg font-bold leading-tight">{user.display_name || user.username}</p>
          <p className="text-sm text-riftapp-text-dim">@{user.username}</p>

          <div className="mt-3 pt-3 border-t border-riftapp-border/40 space-y-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim mb-0.5">Status</p>
              <p className="text-sm">{statusLabel(status)}</p>
            </div>

            {user.bio && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim mb-0.5">About Me</p>
                <p className="text-sm text-riftapp-text-muted leading-relaxed">{user.bio}</p>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim mb-0.5">Member Since</p>
              <p className="text-sm">{new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          {!isSelf && (
            <div className="mt-3 pt-3 border-t border-riftapp-border/40 flex gap-2">
              <button
                onClick={handleMessage}
                className="flex-1 btn-primary py-1.5 text-sm font-medium"
              >
                Message
              </button>
              {rel === 'none' && (
                <button onClick={handleAddFriend} disabled={relLoading} className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-riftapp-success/20 text-riftapp-success hover:bg-riftapp-success/30 transition-colors">
                  {relLoading ? '...' : 'Add Friend'}
                </button>
              )}
              {rel === 'pending_incoming' && (
                <button onClick={handleAccept} disabled={relLoading} className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-riftapp-success/20 text-riftapp-success hover:bg-riftapp-success/30 transition-colors">
                  {relLoading ? '...' : 'Accept Request'}
                </button>
              )}
              {rel === 'pending_outgoing' && (
                <button disabled className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-riftapp-surface text-riftapp-text-dim cursor-default border border-riftapp-border/40">
                  Pending
                </button>
              )}
              {rel === 'friends' && (
                <button onClick={handleRemoveFriend} disabled={relLoading} className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-riftapp-danger/10 text-riftapp-danger hover:bg-riftapp-danger/20 transition-colors">
                  {relLoading ? '...' : 'Unfriend'}
                </button>
              )}
              {rel === 'blocked' ? (
                <button onClick={handleUnblock} disabled={relLoading} className="py-1.5 px-3 text-sm font-medium rounded-lg bg-riftapp-surface text-riftapp-text-dim hover:text-riftapp-text border border-riftapp-border/40 transition-colors">
                  {relLoading ? '...' : 'Unblock'}
                </button>
              ) : (
                <button onClick={handleBlock} disabled={relLoading} className="py-1.5 px-3 text-sm font-medium rounded-lg text-riftapp-danger/60 hover:bg-riftapp-danger/10 hover:text-riftapp-danger transition-colors" title="Block User">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
