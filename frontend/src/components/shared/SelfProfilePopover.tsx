import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelfProfileStore } from '../../stores/selfProfileStore';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useWsSend } from '../../hooks/useWebSocket';
import StatusDot, { statusLabel } from './StatusDot';
import { publicAssetUrl } from '../../utils/publicAssetUrl';

const CARD_WIDTH = 300;
const CARD_GAP = 8;

const STATUS_OPTIONS = [
  { value: 1, label: 'Online',         color: 'bg-emerald-500', desc: '' },
  { value: 2, label: 'Idle',           color: 'bg-yellow-500',  desc: '' },
  { value: 3, label: 'Do Not Disturb', color: 'bg-rose-500',    desc: 'You will not receive desktop notifications' },
  { value: 0, label: 'Invisible',      color: 'bg-gray-500',    desc: 'You will appear offline' },
] as const;

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

export default function SelfProfilePopover() {
  const isOpen = useSelfProfileStore((s) => s.isOpen);
  const anchorRect = useSelfProfileStore((s) => s.anchorRect);
  const close = useSelfProfileStore((s) => s.close);
  const user = useAuthStore((s) => s.user);
  const liveStatus = usePresenceStore((s) => (user ? s.presence[user.id] : undefined));
  const send = useWsSend();

  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const computePosition = useCallback(() => {
    if (!anchorRect || !cardRef.current) return;
    const card = cardRef.current;
    const cardH = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left;
    if (left + CARD_WIDTH > vw - CARD_GAP) {
      left = vw - CARD_WIDTH - CARD_GAP;
    }
    left = Math.max(CARD_GAP, left);

    let top = anchorRect.top - cardH - CARD_GAP;
    if (top < CARD_GAP) {
      top = anchorRect.bottom + CARD_GAP;
    }
    top = Math.max(CARD_GAP, Math.min(top, vh - cardH - CARD_GAP));

    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    if (isOpen && anchorRect) {
      setShowStatusPicker(false);
      setCopied(false);
      requestAnimationFrame(() => {
        computePosition();
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [isOpen, anchorRect, computePosition]);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen && visible) {
      requestAnimationFrame(computePosition);
    }
  }, [showStatusPicker, isOpen, visible, computePosition]);

  if (!isOpen || !user) return null;

  const status = liveStatus ?? user.status;
  const accent = nameColor(user.display_name || user.username);

  const handleSetStatus = (newStatus: number) => {
    send('set_status', { status: newStatus });
    usePresenceStore.getState().setPresence(user.id, newStatus);
    setShowStatusPicker(false);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(user.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        {/* Banner */}
        <div className="h-16 relative" style={{ backgroundColor: accent + '40' }}>
          <div className="absolute -bottom-8 left-4">
            <div
              className="w-[72px] h-[72px] rounded-full border-[4px] border-riftapp-surface flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: accent }}
            >
              {user.avatar_url ? (
                <img src={publicAssetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
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

        {/* Name section */}
        <div className="pt-10 px-4 pb-0">
          <p className="text-lg font-bold leading-tight">{user.display_name || user.username}</p>
          <p className="text-sm text-riftapp-text-dim">@{user.username}</p>
        </div>

        <div className="mx-3 mt-3 border-t border-riftapp-border/40" />

        {/* Action items */}
        <div className="px-2 py-2 space-y-0.5">
          <button
            onClick={() => setShowStatusPicker((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-riftapp-panel/60 transition-colors text-left group"
          >
            <div className={`w-4 h-4 rounded-full flex-shrink-0 ${STATUS_OPTIONS.find((o) => o.value === status)?.color ?? 'bg-gray-500'}`} />
            <span className="flex-1 text-sm font-medium">{statusLabel(status)}</span>
            <svg
              className={`w-4 h-4 text-riftapp-text-dim transition-transform duration-150 ${showStatusPicker ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20" fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {showStatusPicker && (
            <div className="ml-2 mr-2 mb-1 rounded-lg bg-riftapp-bg/80 border border-riftapp-border/30 overflow-hidden animate-fade-in">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetStatus(opt.value)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-riftapp-panel/60 transition-colors text-left ${status === opt.value ? 'bg-riftapp-panel/40' : ''}`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{opt.label}</p>
                    {opt.desc && <p className="text-[11px] text-riftapp-text-dim leading-tight">{opt.desc}</p>}
                  </div>
                  {status === opt.value && (
                    <svg className="w-4 h-4 text-riftapp-accent flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="mx-1 border-t border-riftapp-border/30" />

          {/* Edit Profile */}
          <button
            onClick={() => {
              close();
              document.dispatchEvent(new CustomEvent('open-settings'));
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-riftapp-panel/60 transition-colors text-left"
          >
            <svg className="w-4 h-4 text-riftapp-text-dim" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
            <span className="text-sm font-medium">Edit Profile</span>
          </button>

          {/* Copy User ID */}
          <button
            onClick={handleCopyId}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-riftapp-panel/60 transition-colors text-left"
          >
            <svg className="w-4 h-4 text-riftapp-text-dim" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5v-3.379a3 3 0 00-.879-2.121l-3.12-3.121a3 3 0 00-1.402-.791 2.252 2.252 0 011.913-1.576A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-.25z" clipRule="evenodd" />
              <path d="M3.5 6A1.5 1.5 0 002 7.5v9A1.5 1.5 0 003.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L8.44 6.439A1.5 1.5 0 007.378 6H3.5z" />
            </svg>
            <span className="text-sm font-medium">{copied ? 'Copied!' : 'Copy User ID'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
