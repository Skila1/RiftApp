import { useCallback, useMemo, useState } from 'react';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useUserContextMenuStore } from '../../stores/userContextMenuStore';
import StatusDot, { statusLabel } from '../shared/StatusDot';
import BotBadge from '../shared/BotBadge';
import type { User } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { dispatchChatSearchRequest } from '../../utils/chatSearchBridge';

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function UserRow({ user }: { user: User }) {
  const status = usePresenceStore((s) => s.presence[user.id]) ?? user.status;
  const isOffline = status === 0;
  const openProfile = useProfilePopoverStore((s) => s.open);
  const openContextMenu = useUserContextMenuStore((s) => s.open);

  const handleClick = useCallback((e: React.MouseEvent) => {
    openProfile(user, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }, [user, openProfile]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(user, e.clientX, e.clientY);
  }, [user, openContextMenu]);

  return (
    <div onClick={handleClick} onContextMenu={handleContextMenu} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors group cursor-pointer ${isOffline ? 'opacity-40 hover:bg-riftapp-content-elevated' : 'hover:bg-riftapp-content-elevated'}`}>
      <div className="relative flex-shrink-0">
        {user.avatar_url ? (
          <img src={publicAssetUrl(user.avatar_url)} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-riftapp-content-elevated flex items-center justify-center">
            <span className="text-xs font-semibold text-[#c7ced9] uppercase">
              {user.display_name?.[0] || user.username[0]}
            </span>
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 border-2 border-riftapp-content rounded-full">
          <StatusDot userId={user.id} fallbackStatus={user.status} size="sm" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-[#e4e6eb] flex items-center gap-1.5">
          <span className="truncate">{user.display_name || user.username}</span>
          {user.is_bot && <BotBadge />}
        </p>
      </div>
      <span className="text-[10px] text-[#777d88] opacity-0 transition-opacity group-hover:opacity-100">
        {statusLabel(status)}
      </span>
    </div>
  );
}

export default function MemberList() {
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const presence = usePresenceStore((s) => s.presence);
  const [messageSearch, setMessageSearch] = useState('');

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

  const openMessageSearch = useCallback(() => {
    const query = messageSearch.trim();
    dispatchChatSearchRequest({ query: query || undefined });
  }, [messageSearch]);

  const runMessageSearch = useCallback(() => {
    const query = messageSearch.trim();
    if (!query) {
      openMessageSearch();
      return;
    }
    dispatchChatSearchRequest({ query, run: true, clearFiltersOnRun: true });
  }, [messageSearch, openMessageSearch]);

  if (Object.keys(hubMembers).length === 0) return null;

  return (
    <div className="relative w-60 border-l border-riftapp-border/60 bg-riftapp-content flex flex-col overflow-visible flex-shrink-0">
      <div className="relative z-20 h-12 border-b border-riftapp-border/50 bg-riftapp-content px-3">
        <div className="flex h-full items-center">
          <div className="flex h-[28px] w-full min-w-0 items-center gap-1 rounded-[4px] bg-[#24272d] px-2 text-[#b5bac1] shadow-[0_1px_0_rgba(0,0,0,0.32)] transition-colors hover:bg-[#262930] focus-within:bg-[#262930]">
            <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#72767d]" />
            <input
              type="text"
              value={messageSearch}
              onChange={(event) => {
                setMessageSearch(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runMessageSearch();
                }
              }}
              placeholder="Search messages"
              className="min-w-0 flex-1 bg-transparent py-0 text-[12px] leading-5 text-[#dcddde] outline-none placeholder:text-[#72767d]"
              aria-label="Search messages"
            />
            <button
              type="button"
              onClick={runMessageSearch}
              className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-[3px] bg-[#2d3138] text-[#8f949c] transition-colors hover:bg-[#363a43] hover:text-[#dcddde]"
              aria-label={messageSearch.trim() ? 'Run message search' : 'Open message search'}
            >
              <SearchIcon className="h-[13px] w-[13px]" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {online.length > 0 && (
          <div>
            <h4 className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b818e] mb-1">
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
            <h4 className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b818e] mb-1">
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
