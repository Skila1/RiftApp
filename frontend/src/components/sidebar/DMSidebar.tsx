import { useEffect, useState, useRef } from 'react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useFriendStore } from '../../stores/friendStore';
import { api } from '../../api/client';
import type { Conversation, User } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { normalizeUser } from '../../utils/entityAssets';
import {
  getConversationIconUrl,
  getConversationOtherMembers,
  getConversationTitle,
  isGroupConversation,
} from '../../utils/conversations';
import StatusDot from '../shared/StatusDot';
import BotBadge from '../shared/BotBadge';

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
  const currentUserId = useAuthStore((s) => s.user?.id);
  const presence = usePresenceStore((s) => s.presence);
  const pendingCount = useFriendStore((s) => s.pendingCount);
  const loadPendingCount = useFriendStore((s) => s.loadPendingCount);

  // New-DM search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<User | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState(false);
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

  return (
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
              const primaryMember = otherMembers[0] ?? conv.recipient;
              const recipientStatus = primaryMember ? (presence[primaryMember.id] ?? primaryMember.status) : undefined;
              const conversationTitle = getConversationTitle(conv, currentUserId);
              const isGroupDm = isGroupConversation(conv, currentUserId);

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setActiveConversation(conv.id);
                    if ((conv.unread_count ?? 0) > 0) ackDM(conv.id);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-riftapp-chrome-hover text-riftapp-text'
                      : 'text-riftapp-text-muted hover:bg-riftapp-chrome-hover/80 hover:text-riftapp-text'
                  }`}
                >
                  <ConversationAvatar conversation={conv} viewerUserId={currentUserId} fallbackStatus={recipientStatus} />

                  {/* Name + last message */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{conversationTitle}</span>
                      {!isGroupDm && primaryMember?.is_bot && <BotBadge />}
                      {isGroupDm ? (
                        <span className="rounded-full bg-riftapp-content-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-riftapp-text-dim">
                          Group
                        </span>
                      ) : null}
                    </div>
                    {conv.last_message && (
                      <div className="text-xs text-riftapp-text-dim truncate">
                        {conv.last_message.content}
                      </div>
                    )}
                  </div>

                  {/* Time + unread badge */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
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
  );
}
