import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useUserContextMenuStore } from '../../stores/userContextMenuStore';
import StatusDot, { statusLabel } from '../shared/StatusDot';
import BotBadge from '../shared/BotBadge';
import type { User } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import {
  dispatchChatSearchRequest,
  type ChatSearchFocusFilter,
} from '../../utils/chatSearchBridge';

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 9h14" />
      <path d="M3 15h14" />
      <path d="M11 3 8 21" />
      <path d="M16 3 13 21" />
    </svg>
  );
}

function MentionIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1a4 4 0 1 0 4-4" />
      <path d="M12 4a8 8 0 1 0 8 8" />
    </svg>
  );
}

function SlidersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="11" cy="18" r="2" />
    </svg>
  );
}

type SearchShortcut = {
  key: ChatSearchFocusFilter | 'more';
  title: string;
  description: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode;
};

const SEARCH_SHORTCUTS: ReadonlyArray<SearchShortcut> = [
  {
    key: 'author_id',
    title: 'From a specific user',
    description: 'from: user',
    Icon: UserIcon,
  },
  {
    key: 'stream_id',
    title: 'Sent in a specific channel',
    description: 'in: channel',
    Icon: HashIcon,
  },
  {
    key: 'has',
    title: 'Includes a specific type of data',
    description: 'has: link, embed or file',
    Icon: FilterIcon,
  },
  {
    key: 'mentions',
    title: 'Mentions a specific user',
    description: 'mentions: user',
    Icon: MentionIcon,
  },
  {
    key: 'more',
    title: 'More filters',
    description: 'dates, author type and more',
    Icon: SlidersIcon,
  },
];

function SearchShortcutRow({
  title,
  description,
  Icon,
  onClick,
}: {
  title: string;
  description: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-[6px] px-3 py-[8px] text-left transition-colors hover:bg-[#36393f]"
    >
      <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center text-[#b5bac1]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-[18px] text-[#f2f3f5]">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-[16px] text-[#949ba4]">{description}</span>
      </span>
    </button>
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
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!searchMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchWrapRef.current?.contains(target)) {
        return;
      }
      setSearchMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSearchMenuOpen(false);
      searchInputRef.current?.blur();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchMenuOpen]);

  const runMessageSearch = useCallback(() => {
    dispatchChatSearchRequest({ query: messageSearch, run: true, clearFiltersOnRun: true });
    setSearchMenuOpen(false);
  }, [messageSearch]);

  const openAdvancedSearch = useCallback((focusFilter?: ChatSearchFocusFilter) => {
    dispatchChatSearchRequest({ query: messageSearch, focusFilter });
    setSearchMenuOpen(false);
  }, [messageSearch]);

  if (Object.keys(hubMembers).length === 0) return null;

  return (
    <div className="relative w-60 border-l border-riftapp-border/60 bg-riftapp-content flex flex-col overflow-visible flex-shrink-0">
      <div className="relative z-20 h-12 border-b border-riftapp-border/50 bg-riftapp-content px-4">
        <div ref={searchWrapRef} className="relative flex h-full items-center justify-end">
          <div className={`flex h-6 w-[168px] min-w-0 items-center gap-1 rounded-[4px] px-1.5 text-[#b5bac1] shadow-[0_1px_0_rgba(0,0,0,0.32)] transition-colors ${searchMenuOpen ? 'bg-[#262930] text-[#dcddde]' : 'bg-[#24272d] hover:bg-[#262930]'}`}>
            <input
              ref={searchInputRef}
              type="text"
              value={messageSearch}
              onFocus={() => setSearchMenuOpen(true)}
              onChange={(event) => {
                setMessageSearch(event.target.value);
                setSearchMenuOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  runMessageSearch();
                }
              }}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent py-0 text-[12px] leading-5 text-[#dcddde] outline-none placeholder:text-[#72767d]"
              aria-label="Search messages"
            />
            <button
              type="button"
              onClick={runMessageSearch}
              className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-[3px] bg-[#2d3138] text-[#8f949c] transition-colors hover:bg-[#363a43] hover:text-[#dcddde]"
              aria-label="Search messages"
            >
              <SearchIcon className="h-[13px] w-[13px]" />
            </button>
          </div>

          {searchMenuOpen ? (
            <div className="absolute right-[-4px] top-[calc(100%+7px)] z-50 w-[244px] overflow-hidden rounded-[8px] border border-[#1f2023] bg-[#2b2d31] shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
              <div className="px-3 pb-1 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Filters</p>
              </div>
              <div className="px-1.5 pb-2">
                {SEARCH_SHORTCUTS.map((shortcut) => (
                  <SearchShortcutRow
                    key={shortcut.key}
                    title={shortcut.title}
                    description={shortcut.description}
                    Icon={shortcut.Icon}
                    onClick={() => {
                      if (shortcut.key === 'more') {
                        openAdvancedSearch();
                        return;
                      }
                      openAdvancedSearch(shortcut.key);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
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
