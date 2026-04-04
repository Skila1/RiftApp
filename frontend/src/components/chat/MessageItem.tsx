import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import type { Message } from '../../types';
import { useMessageStore } from '../../stores/messageStore';
import { useAuthStore } from '../../stores/auth';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useUserContextMenuStore } from '../../stores/userContextMenuStore';
import InviteEmbed from '../shared/InviteEmbed';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '😮', '🙏'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  return `${date.toLocaleDateString()} ${time}`;
}

// Generate a stable pastel accent color from string
function nameColor(name: string): string {
  const colors = [
    'text-[#f47067]', 'text-[#e0823d]', 'text-[#c4a000]',
    'text-[#57ab5a]', 'text-[#39c5cf]', 'text-[#6cb6ff]',
    'text-[#dcbdfb]', 'text-[#f69d50]', 'text-[#fc8dc7]',
    'text-[#b083f0]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function avatarBg(name: string): string {
  const colors = [
    'bg-[#f47067]', 'bg-[#e0823d]', 'bg-[#c4a000]',
    'bg-[#57ab5a]', 'bg-[#39c5cf]', 'bg-[#6cb6ff]',
    'bg-[#dcbdfb]', 'bg-[#f69d50]', 'bg-[#fc8dc7]',
    'bg-[#b083f0]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const INVITE_URL_RE = /https?:\/\/[^\s/]+\/invite\/([A-Za-z0-9]+)/g;

function renderContent(content: string) {
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{renderInline(remaining.slice(lastIndex, match.index))}</span>
      );
    }
    parts.push(
      <pre key={key++} className="bg-riptide-bg border border-riptide-border/60 rounded-lg p-3 my-2 overflow-x-auto text-[13px] font-mono leading-relaxed">
        <code>{match[2]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(
      <span key={key++}>{renderInline(remaining.slice(lastIndex))}</span>
    );
  }

  const inviteCodes: string[] = [];
  const textForParsing = parts.length > 0 ? content : content;
  let inviteMatch;
  const inviteRe = new RegExp(INVITE_URL_RE.source, 'g');
  while ((inviteMatch = inviteRe.exec(textForParsing)) !== null) {
    inviteCodes.push(inviteMatch[1]);
  }

  const result = parts.length > 0 ? parts : [<span key={0}>{renderInline(content)}</span>];

  if (inviteCodes.length > 0) {
    result.push(
      ...inviteCodes.map((code) => <InviteEmbed key={`inv-${code}`} code={code} />)
    );
  }

  return result;
}

function renderInline(text: string): React.ReactNode {
  return text.split(/(`[^`]+`)/).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-riptide-bg/80 px-1.5 py-0.5 rounded text-[13px] font-mono text-riptide-accent-hover">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

interface MessageItemProps {
  message: Message;
  showHeader: boolean;
  isOwn: boolean;
}

const MessageItem = memo(function MessageItem({ message, showHeader, isOwn }: MessageItemProps) {
  const author = message.author;
  const authorName = author?.display_name || 'Unknown';
  const toggleReaction = useMessageStore((s) => s.toggleReaction);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const color = useMemo(() => nameColor(authorName), [authorName]);
  const bg = useMemo(() => avatarBg(authorName), [authorName]);
  const renderedContent = useMemo(
    () => message.content ? renderContent(message.content) : null,
    [message.content],
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const openProfile = useProfilePopoverStore((s) => s.open);
  const openContextMenu = useUserContextMenuStore((s) => s.open);

  const handleProfileClick = useCallback((e: React.MouseEvent) => {
    if (author) {
      openProfile(author, (e.currentTarget as HTMLElement).getBoundingClientRect());
    }
  }, [author, openProfile]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (author) {
      e.preventDefault();
      openContextMenu(author, e.clientX, e.clientY);
    }
  }, [author, openContextMenu]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [pickerOpen]);

  const handleToggle = (emoji: string) => {
    toggleReaction(message.id, emoji);
    setPickerOpen(false);
  };

  const reactions = message.reactions || [];

  return (
    <div
      className={`group relative py-0.5 -mx-4 px-4 hover:bg-riptide-surface/20 transition-colors duration-100 ${
        showHeader ? 'mt-[17px]' : ''
      }`}
    >
      {/* Hover timestamp for compact messages */}
      {!showHeader && (
        <span className="absolute left-4 top-1 text-[10px] text-riptide-text-dim opacity-0 group-hover:opacity-100 transition-opacity duration-100 select-none w-10 text-right">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      {/* Hover action bar */}
      <div className="absolute -top-3 right-4 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 ease-out z-10">
        <div className="flex items-center bg-riptide-surface border border-riptide-border/60 rounded-lg shadow-elevation-low">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="px-2 py-1 text-riptide-text-dim hover:text-riptide-text hover:bg-riptide-surface-hover rounded-lg transition-colors duration-100"
            title="Add Reaction"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
        </div>
        {/* Emoji picker */}
        {pickerOpen && (
          <div ref={pickerRef} className="absolute right-0 top-full mt-1 bg-riptide-panel border border-riptide-border/60 rounded-xl shadow-elevation-high p-2 animate-scale-in z-50">
            <div className="grid grid-cols-4 gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleToggle(emoji)}
                  className="w-9 h-9 flex items-center justify-center text-lg rounded-lg hover:bg-riptide-surface-hover hover:scale-110 active:scale-95 transition-all duration-150"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showHeader ? (
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            onClick={handleProfileClick}
            onContextMenu={handleContextMenu}
            className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity`}
          >
            {authorName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span onClick={handleProfileClick} onContextMenu={handleContextMenu} className={`font-semibold text-[15px] cursor-pointer hover:underline ${isOwn ? 'text-riptide-accent-hover' : color}`}>
                {authorName}
              </span>
              <span className="text-[11px] text-riptide-text-dim/80 select-none">
                {formatTime(message.created_at)}
              </span>
              {message.edited_at && (
                <span className="text-[10px] text-riptide-text-dim/60 select-none" title={`Edited ${formatTime(message.edited_at)}`}>(edited)</span>
              )}
            </div>
            {/* Content */}
            <div className="text-[15px] leading-[1.375rem] text-riptide-text/[0.90]">
              {renderedContent}
            </div>
            {/* Attachments */}
            <Attachments message={message} />
            {/* Reactions */}
            {reactions.length > 0 && (
              <ReactionPills reactions={reactions} currentUserId={currentUserId} onToggle={handleToggle} />
            )}
          </div>
        </div>
      ) : (
        <div className="pl-[52px]">
          <div className="text-[15px] leading-[1.375rem] text-riptide-text/[0.90]">
            {renderedContent}
          </div>
          <Attachments message={message} />
          {reactions.length > 0 && (
            <ReactionPills reactions={reactions} currentUserId={currentUserId} onToggle={handleToggle} />
          )}
        </div>
      )}
    </div>
  );
});

export default MessageItem;

function ReactionPills({
  reactions,
  currentUserId,
  onToggle,
}: {
  reactions: { emoji: string; count: number; users: string[] }[];
  currentUserId?: string;
  onToggle: (emoji: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => {
        const reacted = currentUserId ? r.users.includes(currentUserId) : false;
        return (
          <button
            key={r.emoji}
            onClick={() => onToggle(r.emoji)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all duration-150 cursor-pointer ${
              reacted
                ? 'bg-riptide-accent/15 border-riptide-accent/50 text-riptide-accent'
                : 'bg-riptide-surface border-riptide-border/50 text-riptide-text-dim hover:border-riptide-border hover:bg-riptide-surface-hover'
            }`}
          >
            <span className="text-sm leading-none">{r.emoji}</span>
            <span>{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function Attachments({ message }: { message: Message }) {
  if (!message.attachments || message.attachments.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {message.attachments.map((att) => {
        const isImage = att.content_type.startsWith('image/');
        if (isImage) {
          return (
            <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block group/img">
              <img
                src={att.url}
                alt={att.filename}
                className="max-w-[400px] max-h-[300px] rounded-xl border border-riptide-border/40 object-contain
                  hover:shadow-elevation-md transition-shadow duration-200 cursor-pointer"
              />
            </a>
          );
        }
        return (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-riptide-surface border border-riptide-border/50 rounded-xl px-4 py-3
              hover:bg-riptide-surface-hover hover:border-riptide-border transition-all duration-150 max-w-[380px] group/file"
          >
            <div className="w-10 h-10 rounded-lg bg-riptide-accent/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riptide-accent">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-riptide-accent group-hover/file:underline truncate font-medium">{att.filename}</p>
              <p className="text-[11px] text-riptide-text-dim">{formatBytes(att.size_bytes)}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="text-riptide-text-dim opacity-0 group-hover/file:opacity-100 transition-opacity flex-shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
        );
      })}
    </div>
  );
}
