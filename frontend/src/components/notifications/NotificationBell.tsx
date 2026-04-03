import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/app';

export default function NotificationBell() {
  const notifications = useAppStore((s) => s.notifications);
  const unreadCount = useAppStore((s) => s.unreadCount);
  const loadNotifications = useAppStore((s) => s.loadNotifications);
  const markNotifRead = useAppStore((s) => s.markNotifRead);
  const markAllNotifsRead = useAppStore((s) => s.markAllNotifsRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'mention':
        return '@';
      case 'invite':
        return '→';
      case 'dm':
        return '✉';
      default:
        return '•';
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md hover:bg-riptide-surface/80 active:scale-95 transition-all duration-150"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riptide-text-dim">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-riptide-surface border border-riptide-border rounded-lg shadow-xl overflow-hidden z-50 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-riptide-border/60">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllNotifsRead()}
                className="text-xs text-riptide-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-riptide-text-dim text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markNotifRead(n.id);
                  }}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-riptide-bg/50 transition-colors border-b border-riptide-border/30 ${
                    !n.read ? 'bg-riptide-accent/5' : ''
                  }`}
                >
                  {/* Icon / Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-riptide-bg flex items-center justify-center text-sm font-bold text-riptide-accent">
                    {n.actor?.avatar_url ? (
                      <img
                        src={n.actor.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      typeIcon(n.type)
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-riptide-text-dim mt-0.5 truncate">
                        {n.body}
                      </p>
                    )}
                    <span className="text-[10px] text-riptide-text-dim mt-0.5 block">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-riptide-accent mt-2" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
