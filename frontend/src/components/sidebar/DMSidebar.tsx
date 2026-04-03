import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../stores/app';
import { api } from '../../api/client';
import type { User } from '../../types';
import StatusDot from '../shared/StatusDot';

export default function DMSidebar() {
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const loadConversations = useAppStore((s) => s.loadConversations);
  const ackDM = useAppStore((s) => s.ackDM);
  const presence = useAppStore((s) => s.presence);

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
  }, [loadConversations]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchError(null);
    setSearchResult(null);
    setSearching(true);
    try {
      const user = await api.searchUser(q);
      setSearchResult(user);
    } catch {
      setSearchError('User not found.');
    } finally {
      setSearching(false);
    }
  };

  const handleOpenDM = async (userId: string) => {
    setOpening(true);
    try {
      const conv = await api.createOrOpenDM(userId);
      await loadConversations();
      setActiveConversation(conv.id);
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
    <div className="w-60 flex-shrink-0 bg-riptide-surface flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-riptide-border/60 flex-shrink-0 shadow-[0_1px_0_rgba(0,0,0,0.1)]">
        <h2 className="font-semibold text-[15px]">Direct Messages</h2>
        <button
          onClick={handleSearchToggle}
          title="New direct message"
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150 active:scale-95 ${
            showSearch
              ? 'bg-riptide-accent/20 text-riptide-accent'
              : 'text-riptide-text-dim hover:text-riptide-text hover:bg-riptide-panel/60'
          }`}
          aria-label="New direct message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* New DM search panel */}
      {showSearch && (
        <div className="px-3 py-2.5 border-b border-riptide-border/40 bg-riptide-bg/30 animate-fade-in">
          <p className="text-[11px] text-riptide-text-dim mb-1.5 font-medium">Find user by username</p>
          <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchResult(null); setSearchError(null); }}
              placeholder="username"
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
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
            </button>
          </form>
          {searchError && (
            <p className="text-[11px] text-riptide-danger mt-1.5">{searchError}</p>
          )}
          {searchResult && (
            <button
              onClick={() => handleOpenDM(searchResult.id)}
              disabled={opening}
              className="w-full flex items-center gap-2.5 mt-2 px-2.5 py-2 rounded-lg bg-riptide-surface hover:bg-riptide-surface-hover border border-riptide-border/40 transition-all duration-150 active:scale-[0.98]"
            >
              <div className="w-7 h-7 rounded-full bg-riptide-accent/20 flex items-center justify-center text-[10px] font-semibold text-riptide-accent flex-shrink-0">
                {searchResult.display_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium truncate">{searchResult.display_name}</p>
                <p className="text-[10px] text-riptide-text-dim">@{searchResult.username}</p>
              </div>
              <span className="text-[11px] text-riptide-accent font-medium flex-shrink-0">
                {opening ? '…' : 'Message →'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {conversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-riptide-text-dim text-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="font-medium text-[13px]">No conversations yet</p>
            <p className="mt-1 text-[11px] text-riptide-text-dim/70">Click <span className="font-bold text-riptide-accent">+</span> above to message someone.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const recipientStatus = presence[conv.recipient.id] ?? conv.recipient.status;

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setActiveConversation(conv.id);
                    if ((conv.unread_count ?? 0) > 0) ackDM(conv.id);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors ${
                    isActive
                      ? 'bg-riptide-surface-hover text-riptide-text'
                      : 'text-riptide-text-muted hover:bg-riptide-surface-hover/50 hover:text-riptide-text'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-riptide-accent/20 flex items-center justify-center text-xs font-semibold text-riptide-accent">
                      {conv.recipient.avatar_url ? (
                        <img
                          src={conv.recipient.avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        conv.recipient.display_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <StatusDot
                      userId={conv.recipient.id}
                      fallbackStatus={recipientStatus}
                      className="absolute -bottom-0.5 -right-0.5 ring-2 ring-riptide-surface"
                    />
                  </div>

                  {/* Name + last message */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate">
                      {conv.recipient.display_name}
                    </div>
                    {conv.last_message && (
                      <div className="text-xs text-riptide-text-dim truncate">
                        {conv.last_message.content}
                      </div>
                    )}
                  </div>

                  {/* Time + unread badge */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {conv.last_message && (
                      <span className="text-[10px] text-riptide-text-dim">
                        {timeAgo(conv.last_message.created_at)}
                      </span>
                    )}
                    {(conv.unread_count ?? 0) > 0 && !isActive && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-riptide-accent text-white text-[10px] font-bold px-1 leading-none">
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
