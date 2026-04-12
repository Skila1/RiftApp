import { useEffect, useRef, useState } from 'react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { isConversationMuted, useConversationMuteStore } from '../../stores/conversationMuteStore';
import { useHubStore } from '../../stores/hubStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useFriendStore } from '../../stores/friendStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { api } from '../../api/client';
import type { Conversation, User } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { normalizeUser } from '../../utils/entityAssets';
import {
  getConversationMembers,
  getConversationIconUrl,
  getConversationOtherMembers,
  getConversationTitle,
  isGroupConversation,
} from '../../utils/conversations';
import { getConversationCallStatus } from '../../utils/dmCallStatus';
import { getConversationCallSystemMessagePreview } from '../../utils/messageSystem';
import StatusDot from '../shared/StatusDot';
import BotBadge from '../shared/BotBadge';
import { MenuOverlay, menuDivider } from '../context-menus/MenuOverlay';
import GroupDMSettingsModal from '../modals/GroupDMSettingsModal';
import ConfirmModal from '../modals/ConfirmModal';
import InviteHubToConversationModal from '../modals/InviteHubToConversationModal';

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function AvatarCircle({
  user,
  sizeClass = 'w-8 h-8',
  textClass = 'text-xs',
  ringClassName = '',
}: {
  user?: User;
  sizeClass?: string;
  textClass?: string;
  ringClassName?: string;
}) {
  if (user?.avatar_url) {
    return (
      <img
        src={publicAssetUrl(user.avatar_url)}
        alt=""
        className={`${sizeClass} rounded-full object-cover ${ringClassName}`.trim()}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-riftapp-accent/20 flex items-center justify-center font-semibold text-riftapp-accent ${textClass} ${ringClassName}`.trim()}>
      {(user?.display_name || user?.username || '?').slice(0, 2).toUpperCase()}
    </div>
  );
}

function ConversationAvatar({
  conversation,
  viewerUserId,
  fallbackStatus,
}: {
  conversation: Conversation;
  viewerUserId?: string | null;
  fallbackStatus?: number;
}) {
  const conversationIconUrl = getConversationIconUrl(conversation);
  const otherMembers = getConversationOtherMembers(conversation, viewerUserId);

  if (conversationIconUrl) {
    return (
      <img
        src={publicAssetUrl(conversationIconUrl)}
        alt=""
        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
      />
    );
  }

  if (otherMembers.length <= 1) {
    const member = otherMembers[0] ?? conversation.recipient;
    return (
      <div className="relative flex-shrink-0">
        <AvatarCircle user={member} />
        <StatusDot
          userId={member?.id}
          fallbackStatus={fallbackStatus}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-riftapp-chrome"
        />
      </div>
    );
  }

  const avatarMembers = otherMembers.slice(0, 2);
  return (
    <div className="relative h-8 w-8 flex-shrink-0">
      <div className="absolute left-0 top-0">
        <AvatarCircle user={avatarMembers[0]} sizeClass="h-[19px] w-[19px]" textClass="text-[9px]" ringClassName="ring-2 ring-riftapp-chrome" />
      </div>
      <div className="absolute bottom-0 right-0">
        <AvatarCircle user={avatarMembers[1]} sizeClass="h-[19px] w-[19px]" textClass="text-[9px]" ringClassName="ring-2 ring-riftapp-chrome" />
      </div>
    </div>
  );
}

export default function DMSidebar() {
  const conversations = useDMStore((s) => s.conversations);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const openDM = useDMStore((s) => s.openDM);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const ackDM = useDMStore((s) => s.ackDM);
  const leaveConversation = useDMStore((s) => s.leaveConversation);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const developerMode = useAppSettingsStore((s) => s.developerMode);
  const hubs = useHubStore((s) => s.hubs);
  const loadHubs = useHubStore((s) => s.loadHubs);
  const mutedUntilByConversationId = useConversationMuteStore((s) => s.mutedUntilByConversationId);
  const muteConversation = useConversationMuteStore((s) => s.muteConversation);
  const unmuteConversation = useConversationMuteStore((s) => s.unmuteConversation);
  const clearExpiredConversationMutes = useConversationMuteStore((s) => s.clearExpiredConversationMutes);
  const presence = usePresenceStore((s) => s.presence);
  const conversationVoiceMembers = useVoiceStore((s) => s.conversationVoiceMembers);
  const conversationCallRings = useVoiceStore((s) => s.conversationCallRings);
  const conversationCallOutcomes = useVoiceStore((s) => s.conversationCallOutcomes);
  const pendingCount = useFriendStore((s) => s.pendingCount);
  const loadPendingCount = useFriendStore((s) => s.loadPendingCount);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<User | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ conversation: Conversation; x: number; y: number } | null>(null);
  const [editConversation, setEditConversation] = useState<Conversation | null>(null);
  const [inviteConversation, setInviteConversation] = useState<Conversation | null>(null);
  const [leaveConversationTarget, setLeaveConversationTarget] = useState<Conversation | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [muteSubmenuOpen, setMuteSubmenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConversations();
    loadPendingCount();
  }, [loadConversations, loadPendingCount]);

  useEffect(() => {
    clearExpiredConversationMutes();
  }, [clearExpiredConversationMutes]);

  useEffect(() => {
    if (hubs.length === 0) {
      void loadHubs();
    }
  }, [hubs.length, loadHubs]);

  const runUserSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setSearchError(null);
    setSearchResult(null);
    setSearching(true);
    try {
      const user = await api.searchUser(q);
      setSearchResult(normalizeUser(user));
    } catch {
      setSearchError('User not found.');
    } finally {
      setSearching(false);
    }
  };

  const handleOpenDM = async (userId: string) => {
    setOpening(true);
    try {
      await openDM(userId);
      setSearchQuery('');
      setSearchResult(null);
      setSearchError(null);
    } finally {
      setOpening(false);
    }
  };

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const closeContextMenu = () => {
    setMuteSubmenuOpen(false);
    setContextMenu(null);
  };

  const handleOpenConversationMenu = (event: React.MouseEvent, conversation: Conversation) => {
    event.preventDefault();
    clearExpiredConversationMutes();
    setMuteSubmenuOpen(false);
    setContextMenu({ conversation, x: event.clientX, y: event.clientY });
  };

  const handleCopyConversationId = async (conversationId: string) => {
    try {
      await navigator.clipboard.writeText(conversationId);
    } catch {
      /* ignore clipboard failures */
    }
    closeContextMenu();
  };

  const handleLeaveGroup = async () => {
    if (!leaveConversationTarget || leaveBusy) {
      return;
    }

    setLeaveBusy(true);
    setLeaveError(null);
    try {
      await leaveConversation(leaveConversationTarget.id);
      setLeaveConversationTarget(null);
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : 'Could not leave group');
    } finally {
      setLeaveBusy(false);
    }
  };

  const filteredConversations = conversations.filter((conversation) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    const title = getConversationTitle(conversation, currentUserId).toLowerCase();
    if (title.includes(normalizedQuery)) {
      return true;
    }

    return getConversationMembers(conversation).some((member) => {
      const haystack = `${member.display_name} ${member.username}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  });
  const shouldShowSearchPanel = Boolean(searchResult || searchError || (searchQuery.trim() && filteredConversations.length === 0));

  const contextConversationMuted = contextMenu
    ? isConversationMuted(mutedUntilByConversationId[contextMenu.conversation.id])
    : false;

  const muteOptions: Array<{ label: string; durationMs: number | null }> = [
    { label: 'For 15 Minutes', durationMs: 15 * 60 * 1000 },
    { label: 'For 1 Hour', durationMs: 60 * 60 * 1000 },
    { label: 'For 8 Hours', durationMs: 8 * 60 * 60 * 1000 },
    { label: 'For 24 Hours', durationMs: 24 * 60 * 60 * 1000 },
    { label: 'Until I Turn It Back On', durationMs: null },
  ];

  const menuItemClassName = 'mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-left text-[13px] text-[#dbdee1] transition-colors hover:bg-[#232428]';
  const submenuItemClassName = 'mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-left text-[13px] text-[#dbdee1] transition-colors hover:bg-[#232428]';

  return (
    <>
      <div className="w-60 flex-shrink-0 border-r border-riftapp-border/60 bg-riftapp-chrome flex flex-col">
      <div className="relative z-20 h-12 border-b border-riftapp-border/50 bg-riftapp-chrome px-3 flex-shrink-0">
        <div className="flex h-full items-center">
          <div className="flex h-[28px] w-full min-w-0 items-center gap-1 rounded-[4px] bg-[#24272d] px-2 text-[#b5bac1] shadow-[0_1px_0_rgba(0,0,0,0.32)] transition-colors hover:bg-[#262930] focus-within:bg-[#262930]">
            <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#72767d]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchResult(null);
                setSearchError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void runUserSearch();
                }
              }}
              placeholder="Find or start a conversation"
              className="min-w-0 flex-1 bg-transparent py-0 text-[12px] leading-5 text-[#dcddde] outline-none placeholder:text-[#72767d]"
              aria-label="Find or start a conversation"
            />
            <button
              type="button"
              onClick={() => {
                void runUserSearch();
              }}
              disabled={!searchQuery.trim() || searching}
              className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-[3px] bg-[#2d3138] text-[#8f949c] transition-colors hover:bg-[#363a43] hover:text-[#dcddde] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Search for a user"
            >
              {searching ? (
                <div className="h-[13px] w-[13px] rounded-full border border-current border-t-transparent animate-spin" />
              ) : (
                <SearchIcon className="h-[13px] w-[13px]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {shouldShowSearchPanel && (
        <div className="border-b border-riftapp-border/50 px-3 py-2 animate-fade-in">
          {searchResult ? (
            <button
              onClick={() => void handleOpenDM(searchResult.id)}
              disabled={opening}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-riftapp-chrome-hover hover:bg-riftapp-chrome-hover/90 border border-riftapp-border/40 transition-all duration-150 active:scale-[0.98]"
            >
              <div className="w-7 h-7 rounded-full bg-riftapp-accent/20 flex items-center justify-center text-[10px] font-semibold text-riftapp-accent flex-shrink-0">
                {searchResult.display_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium truncate">{searchResult.display_name}</p>
                <p className="text-[10px] text-riftapp-text-dim">@{searchResult.username}</p>
              </div>
              <span className="text-[11px] text-riftapp-accent font-medium flex-shrink-0">
                {opening ? '...' : 'Message'}
              </span>
            </button>
          ) : searchError ? (
            <p className="px-1 text-[11px] text-riftapp-danger">{searchError}</p>
          ) : searchQuery.trim() ? (
            <p className="px-1 text-[11px] text-riftapp-text-dim">Press Enter to search for <span className="font-medium text-riftapp-text">@{searchQuery.trim()}</span>.</p>
          ) : null}
        </div>
      )}

      {/* Navigation items */}
      <div className="px-2 pt-2 pb-1 space-y-0.5">
        <button
          onClick={() => useDMStore.getState().clearActive()}
          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md transition-colors ${
            !activeConversationId
              ? 'bg-riftapp-chrome-hover text-riftapp-text'
              : 'text-riftapp-text-muted hover:bg-riftapp-chrome-hover/80 hover:text-riftapp-text'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <span className="text-sm font-medium">Friends</span>
          {pendingCount > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-riftapp-danger text-white text-[10px] font-bold leading-none">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Separator */}
      <div className="px-4 pt-2 pb-1">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim">Direct Messages</h3>
          <button
            onClick={() => {
              searchInputRef.current?.focus();
              searchInputRef.current?.select();
            }}
            title="New direct message"
            className="w-5 h-5 flex items-center justify-center text-riftapp-text-dim hover:text-riftapp-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1 px-2">
        {filteredConversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-riftapp-text-dim text-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="font-medium text-[13px]">{searchQuery.trim() ? 'No matching conversations' : 'No conversations yet'}</p>
            {searchQuery.trim() ? (
              <p className="mt-1 text-[11px] text-riftapp-text-dim/70">Try a different name or press Enter to search for a user.</p>
            ) : (
              <p className="mt-1 text-[11px] text-riftapp-text-dim/70">Click <span className="font-bold text-riftapp-accent">+</span> above to message someone.</p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredConversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const otherMembers = getConversationOtherMembers(conv, currentUserId);
              const allMembers = getConversationMembers(conv);
              const primaryMember = otherMembers[0] ?? conv.recipient;
              const recipientStatus = primaryMember ? (presence[primaryMember.id] ?? primaryMember.status) : undefined;
              const conversationTitle = getConversationTitle(conv, currentUserId);
              const isGroupDm = isGroupConversation(conv, currentUserId);
              const groupMemberCountLabel = `${allMembers.length} Member${allMembers.length === 1 ? '' : 's'}`;
              const activeVoiceMembers = conversationVoiceMembers[conv.id] ?? [];
              const activeRing = conversationCallRings[conv.id];
              const lastMessagePreview = conv.last_message
                ? getConversationCallSystemMessagePreview(conv.last_message.system_type, conv.last_message.content) ?? conv.last_message.content
                : null;
              const callStatus = getConversationCallStatus({
                conversation: conv,
                currentUserId,
                ring: activeRing,
                voiceMemberIds: activeVoiceMembers,
                outcome: conversationCallOutcomes[conv.id] ?? null,
              });
              const callStatusClass = callStatus?.tone === 'warning'
                ? 'text-[#f0b232]'
                : callStatus?.tone === 'success'
                  ? 'text-[#23a55a]'
                  : callStatus?.tone === 'danger'
                    ? 'text-[#f87171]'
                    : 'text-[#b5bac1]';
              const statusDotClass = callStatus?.tone === 'warning'
                ? 'bg-white/25'
                : callStatus?.tone === 'success'
                  ? 'bg-[#23a55a]'
                  : callStatus?.tone === 'danger'
                    ? 'bg-[#f87171]'
                    : 'bg-[#72767d]';

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setActiveConversation(conv.id);
                    if ((conv.unread_count ?? 0) > 0) ackDM(conv.id);
                  }}
                  onContextMenu={(event) => handleOpenConversationMenu(event, conv)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-riftapp-chrome-hover text-riftapp-text'
                      : 'text-riftapp-text-muted hover:bg-riftapp-chrome-hover/80 hover:text-riftapp-text'
                  }`}
                >
                  <ConversationAvatar conversation={conv} viewerUserId={currentUserId} fallbackStatus={recipientStatus} />

                  {/* Name + subtitle */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{conversationTitle}</span>
                      {!isGroupDm && primaryMember?.is_bot && <BotBadge />}
                    </div>
                    {callStatus ? (
                      <div className={`truncate text-[11px] font-medium ${callStatusClass}`}>
                        {callStatus.label}
                      </div>
                    ) : isGroupDm ? (
                      <div className="text-xs text-riftapp-text-dim truncate">
                      {groupMemberCountLabel}
                      </div>
                    ) : lastMessagePreview ? (
                      <div className="text-xs text-riftapp-text-dim truncate">
                        {lastMessagePreview}
                      </div>
                    ) : null}
                  </div>

                  {/* Time + unread badge */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {callStatus ? (
                      <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
                    ) : null}
                    {conv.last_message && (
                      <span className="text-[10px] text-riftapp-text-dim">
                        {timeAgo(conv.last_message.created_at)}
                      </span>
                    )}
                    {(conv.unread_count ?? 0) > 0 && !isActive && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-riftapp-accent text-white text-[10px] font-bold px-1 leading-none">
                        {(conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {contextMenu ? (
        <MenuOverlay x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} zIndex={350}>
          <div className="rift-context-menu-shell min-w-[210px] text-[#dbdee1]" onContextMenu={(event) => event.preventDefault()}>
            <button
              type="button"
              onClick={() => {
                void ackDM(contextMenu.conversation.id);
                closeContextMenu();
              }}
              disabled={(contextMenu.conversation.unread_count ?? 0) === 0}
              className={`${menuItemClassName} disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <span className="w-4 shrink-0" aria-hidden />
              Mark as Read
            </button>

            {menuDivider()}

            <button
              type="button"
              onClick={() => {
                setInviteConversation(contextMenu.conversation);
                closeContextMenu();
              }}
              className={menuItemClassName}
            >
              <span className="w-4 shrink-0" aria-hidden />
              Invites
            </button>

            {isGroupConversation(contextMenu.conversation, currentUserId) ? (
              <button
                type="button"
                onClick={() => {
                  setEditConversation(contextMenu.conversation);
                  closeContextMenu();
                }}
                className={menuItemClassName}
              >
                <span className="w-4 shrink-0" aria-hidden />
                Edit Group
              </button>
            ) : null}

            {menuDivider()}

            <div
              className="relative mx-0.5"
              onMouseEnter={() => setMuteSubmenuOpen(true)}
              onMouseLeave={() => setMuteSubmenuOpen(false)}
            >
              <div className={`${menuItemClassName} cursor-default ${muteSubmenuOpen ? 'bg-[#232428]' : ''}`}>
                <span className="w-4 shrink-0" aria-hidden />
                <span className="flex-1">Mute Conversation</span>
                <span className="text-[#8f949c]">›</span>
              </div>

              {muteSubmenuOpen ? (
                <div className="absolute left-full top-0 z-10 pl-1" onMouseEnter={() => setMuteSubmenuOpen(true)}>
                  <div className="rift-context-submenu-shell min-w-[220px]">
                    {contextConversationMuted ? (
                      <button
                        type="button"
                        onClick={() => {
                          unmuteConversation(contextMenu.conversation.id);
                          closeContextMenu();
                        }}
                        className={submenuItemClassName}
                      >
                        <span className="w-4 shrink-0" aria-hidden />
                        Unmute Conversation
                      </button>
                    ) : null}

                    {contextConversationMuted ? menuDivider() : null}

                    {muteOptions.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          muteConversation(contextMenu.conversation.id, option.durationMs);
                          closeContextMenu();
                        }}
                        className={submenuItemClassName}
                      >
                        <span className="w-4 shrink-0" aria-hidden />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {isGroupConversation(contextMenu.conversation, currentUserId) ? (
              <>
                {menuDivider()}
                <button
                  type="button"
                  onClick={() => {
                    setLeaveError(null);
                    setLeaveConversationTarget(contextMenu.conversation);
                    closeContextMenu();
                  }}
                  className={`${menuItemClassName} text-[#f38b8f]`}
                >
                  <span className="w-4 shrink-0" aria-hidden />
                  Leave Group
                </button>
              </>
            ) : null}

            {developerMode ? (
              <>
                {menuDivider()}
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyConversationId(contextMenu.conversation.id);
                  }}
                  className={`${menuItemClassName} justify-between gap-2`}
                >
                  <span>Copy Channel ID</span>
                  <span className="text-[10px] font-mono font-semibold px-1 py-0.5 rounded bg-[#1e1f22] border border-[#3f4147] text-[#b5bac1]">ID</span>
                </button>
              </>
            ) : null}
          </div>
        </MenuOverlay>
      ) : null}

      {editConversation ? (
        <GroupDMSettingsModal
          conversation={editConversation}
          onClose={() => setEditConversation(null)}
        />
      ) : null}

      {inviteConversation ? (
        <InviteHubToConversationModal
          conversation={inviteConversation}
          onClose={() => setInviteConversation(null)}
        />
      ) : null}

      <ConfirmModal
        isOpen={leaveConversationTarget != null}
        title="Leave Group"
        description={leaveConversationTarget
          ? `Leave ${getConversationTitle(leaveConversationTarget, currentUserId)}? You can be re-added later by another group member.`
          : 'Leave this group?'}
        confirmText="Leave Group"
        variant="danger"
        onConfirm={handleLeaveGroup}
        onCancel={() => {
          if (leaveBusy) {
            return;
          }
          setLeaveConversationTarget(null);
          setLeaveError(null);
        }}
        loading={leaveBusy}
      >
        {leaveError ? <p className="text-sm text-[#f23f42]">{leaveError}</p> : null}
      </ConfirmModal>
    </>
  );
}
