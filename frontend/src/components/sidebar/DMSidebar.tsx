import { useEffect, useRef, useState } from 'react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
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
  const presence = usePresenceStore((s) => s.presence);
  const conversationVoiceMembers = useVoiceStore((s) => s.conversationVoiceMembers);
  const conversationCallRings = useVoiceStore((s) => s.conversationCallRings);
  const conversationCallOutcomes = useVoiceStore((s) => s.conversationCallOutcomes);
  const pendingCount = useFriendStore((s) => s.pendingCount);
  const loadPendingCount = useFriendStore((s) => s.loadPendingCount);

  // New-DM search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<User | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ conversation: Conversation; x: number; y: number } | null>(null);
  const [editConversation, setEditConversation] = useState<Conversation | null>(null);
  const [leaveConversationTarget, setLeaveConversationTarget] = useState<Conversation | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConversations();
    loadPendingCount();
  }, [loadConversations, loadPendingCount]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setShowSearch(false);
      setSearchQuery('');
      setSearchResult(null);
    } finally {
      setOpening(false);
    }
  };

  const handleSearchToggle = () => {
    setShowSearch((s) => !s);
    setSearchQuery('');
    setSearchResult(null);
    setSearchError(null);
    if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
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

  const closeContextMenu = () => setContextMenu(null);

  const handleOpenConversationMenu = (event: React.MouseEvent, conversation: Conversation) => {
    const isGroupDm = isGroupConversation(conversation, currentUserId);
    const hasActions = (conversation.unread_count ?? 0) > 0 || isGroupDm || developerMode;
    if (!hasActions) {
      return;
    }
    event.preventDefault();
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

  return (
    <>
      <div className="w-60 flex-shrink-0 border-r border-riftapp-border/60 bg-riftapp-chrome flex flex-col">
      {/* Search bar */}
      <div className="h-12 flex items-center border-b border-riftapp-border/50 px-3 flex-shrink-0">
        <button
          onClick={handleSearchToggle}
          className="w-full h-[28px] flex items-center gap-2 px-2 rounded bg-riftapp-chrome-hover/80 text-riftapp-text-dim text-[13px] hover:bg-riftapp-chrome-hover transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0 opacity-60">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Find or start a conversation</span>
        </button>
      </div>

      {/* New DM search panel */}
      {showSearch && (
        <div className="px-3 py-2.5 animate-fade-in">
          <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchResult(null); setSearchError(null); }}
              placeholder="Search by username..."
              className="settings-input text-[13px] flex-1 py-1.5"
              maxLength={32}
            />
            <button
              type="submit"
              disabled={!searchQuery.trim() || searching}
              className="btn-primary py-1.5 px-2.5 text-[13px]"
            >
              {searching ? (
                <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
              ) : 'Go'}
            </button>
          </form>
          {searchError && (
            <p className="text-[11px] text-riftapp-danger mt-1.5">{searchError}</p>
          )}
          {searchResult && (
            <button
              onClick={() => handleOpenDM(searchResult.id)}
              disabled={opening}
              className="w-full flex items-center gap-2.5 mt-2 px-2.5 py-2 rounded-lg bg-riftapp-chrome-hover hover:bg-riftapp-chrome-hover/90 border border-riftapp-border/40 transition-all duration-150 active:scale-[0.98]"
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
          )}
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
            onClick={() => { if (!showSearch) handleSearchToggle(); }}
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
        {conversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-riftapp-text-dim text-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="font-medium text-[13px]">No conversations yet</p>
            <p className="mt-1 text-[11px] text-riftapp-text-dim/70">Click <span className="font-bold text-riftapp-accent">+</span> above to message someone.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => {
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
          <div className="min-w-[188px] rounded-[8px] border border-[#1f2124] bg-[#2b2d31] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]" onContextMenu={(event) => event.preventDefault()}>
            {(contextMenu.conversation.unread_count ?? 0) > 0 ? (
              <button
                type="button"
                onClick={() => {
                  void ackDM(contextMenu.conversation.id);
                  closeContextMenu();
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
              >
                <span className="w-4 shrink-0" aria-hidden />
                Mark as Read
              </button>
            ) : null}

            {isGroupConversation(contextMenu.conversation, currentUserId) ? (
              <>
                {(contextMenu.conversation.unread_count ?? 0) > 0 ? menuDivider() : null}
                <button
                  type="button"
                  onClick={() => {
                    setEditConversation(contextMenu.conversation);
                    closeContextMenu();
                  }}
                  className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
                >
                  <span className="w-4 shrink-0" aria-hidden />
                  Edit Group
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLeaveError(null);
                    setLeaveConversationTarget(contextMenu.conversation);
                    closeContextMenu();
                  }}
                  className="flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)] text-[#f23f42]"
                >
                  <span className="w-4 shrink-0" aria-hidden />
                  Leave Group
                </button>
              </>
            ) : null}

            {developerMode ? (
              <>
                {(contextMenu.conversation.unread_count ?? 0) > 0 || isGroupConversation(contextMenu.conversation, currentUserId) ? menuDivider() : null}
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyConversationId(contextMenu.conversation.id);
                  }}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 mx-1 rounded hover:bg-[#232428] text-left w-[calc(100%-8px)]"
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
