import { useCallback, useMemo } from 'react';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import StatusDot, { statusLabel } from '../shared/StatusDot';
import type { User } from '../../types';

function UserRow({ user }: { user: User }) {
  const status = usePresenceStore((s) => s.presence[user.id]) ?? user.status;
  const isOffline = status === 0;
  const openProfile = useProfilePopoverStore((s) => s.open);

  const handleClick = useCallback((e: React.MouseEvent) => {
    openProfile(user, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }, [user, openProfile]);

  return (
    <div onClick={handleClick} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-riptide-surface/60 transition-colors group cursor-pointer ${isOffline ? 'opacity-40' : ''}`}>
      <div className="relative flex-shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-riptide-accent/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-riptide-accent uppercase">
              {user.display_name?.[0] || user.username[0]}
            </span>
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 border-2 border-riptide-bg rounded-full">
          <StatusDot userId={user.id} fallbackStatus={user.status} size="sm" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate leading-tight">{user.display_name || user.username}</p>
      </div>
      <span className="text-[10px] text-riptide-text-dim opacity-0 group-hover:opacity-100 transition-opacity">
        {statusLabel(status)}
      </span>
    </div>
  );
}

export default function MemberList() {
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const presence = usePresenceStore((s) => s.presence);

  const { online, offline } = useMemo(() => {
    const members = Object.values(hubMembers);
    const onlineList: User[] = [];
    const offlineList: User[] = [];

    for (const m of members) {
      const status = presence[m.id] ?? m.status;
      if (status > 0) {
        onlineList.push(m);
      } else {
        offlineList.push(m);
      }
    }

    const sortByName = (a: User, b: User) =>
      (a.display_name || a.username).localeCompare(b.display_name || b.username);

    onlineList.sort(sortByName);
    offlineList.sort(sortByName);

    return { online: onlineList, offline: offlineList };
  }, [hubMembers, presence]);

  if (Object.keys(hubMembers).length === 0) return null;

  return (
    <div className="w-60 bg-riptide-sidebar border-l border-riptide-border/40 flex flex-col overflow-hidden flex-shrink-0">
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {online.length > 0 && (
          <div>
            <h4 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim mb-1">
              Online — {online.length}
            </h4>
            <div className="space-y-0.5">
              {online.map((m) => (
                <UserRow key={m.id} user={m} />
              ))}
            </div>
          </div>
        )}

        {offline.length > 0 && (
          <div>
            <h4 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim mb-1">
              Offline — {offline.length}
            </h4>
            <div className="space-y-0.5">
              {offline.map((m) => (
                <UserRow key={m.id} user={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
