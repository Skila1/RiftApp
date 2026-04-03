import { useEffect, useRef, useState, useCallback } from 'react';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { usePresenceStore } from '../../stores/presenceStore';
import StatusDot, { statusLabel } from './StatusDot';

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

  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

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
      requestAnimationFrame(() => {
        computePosition();
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [user, anchorRect, computePosition]);

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

  const status = liveStatus ?? user.status;
  const accent = nameColor(user.display_name || user.username);

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
      <div className="bg-riptide-surface rounded-xl border border-riptide-border/50 shadow-modal overflow-hidden">
        {/* Banner area */}
        <div className="h-16 relative" style={{ backgroundColor: accent + '40' }}>
          <div
            className="absolute -bottom-8 left-4 w-[72px] h-[72px] rounded-full border-[4px] border-riptide-surface flex items-center justify-center overflow-hidden"
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
        </div>

        {/* Status dot positioned on the avatar */}
        <div className="absolute top-[60px] left-[60px] border-[3px] border-riptide-surface rounded-full">
          <StatusDot userId={user.id} fallbackStatus={user.status} size="lg" />
        </div>

        {/* Body */}
        <div className="pt-10 px-4 pb-4">
          <p className="text-lg font-bold leading-tight">{user.display_name || user.username}</p>
          <p className="text-sm text-riptide-text-dim">@{user.username}</p>

          <div className="mt-3 pt-3 border-t border-riptide-border/40 space-y-2.5">
            {/* Status */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim mb-0.5">Status</p>
              <p className="text-sm">{statusLabel(status)}</p>
            </div>

            {/* Bio */}
            {user.bio && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim mb-0.5">About Me</p>
                <p className="text-sm text-riptide-text-muted leading-relaxed">{user.bio}</p>
              </div>
            )}

            {/* Member since */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim mb-0.5">Member Since</p>
              <p className="text-sm">{new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
