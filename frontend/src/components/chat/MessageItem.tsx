import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import type { Message } from '../../types';
import { useMessageStore } from '../../stores/messageStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useUserContextMenuStore } from '../../stores/userContextMenuStore';
import InviteEmbed from '../shared/InviteEmbed';
import MessageContextMenu from '../context-menus/MessageContextMenu';

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

function renderContent(content: string, usernames?: Set<string>, onMentionClick?: (username: string, rect: DOMRect) => void) {
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{renderInline(remaining.slice(lastIndex, match.index), usernames, onMentionClick)}</span>
      );
    }
    parts.push(
      <pre key={key++} className="bg-riftapp-bg border border-riftapp-border/60 rounded-lg p-3 my-2 overflow-x-auto text-[13px] font-mono leading-relaxed">
        <code>{match[2]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(
      <span key={key++}>{renderInline(remaining.slice(lastIndex), usernames, onMentionClick)}</span>
    );
  }

  const inviteCodes: string[] = [];
  const textForParsing = parts.length > 0 ? content : content;
  let inviteMatch;
  const inviteRe = new RegExp(INVITE_URL_RE.source, 'g');
  while ((inviteMatch = inviteRe.exec(textForParsing)) !== null) {
    inviteCodes.push(inviteMatch[1]);
  }

  const result = parts.length > 0 ? parts : [<span key={0}>{renderInline(content, usernames, onMentionClick)}</span>];

  if (inviteCodes.length > 0) {
    result.push(
      ...inviteCodes.map((code) => <InviteEmbed key={`inv-${code}`} code={code} />)
    );
  }

  return result;
}

function renderInline(text: string, usernames?: Set<string>, onMentionClick?: (username: string, rect: DOMRect) => void): React.ReactNode {
  // Split on inline code first
  return text.split(/(`[^`]+`)/).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-riftapp-bg/80 px-1.5 py-0.5 rounded text-[13px] font-mono text-riftapp-accent-hover">
          {part.slice(1, -1)}
        </code>
      );
    }
    // Parse @mentions in non-code text
    if (usernames && usernames.size > 0) {
      return renderMentions(part, usernames, i, onMentionClick);
    }
    return part;
  });
}

function renderMentions(text: string, usernames: Set<string>, parentKey: number, onMentionClick?: (username: string, rect: DOMRect) => void): React.ReactNode {
  // Match @word patterns (username chars: letters, digits, underscores, dots, hyphens)
  const mentionRe = /@([\w.\-]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let m;
  let k = 0;
  while ((m = mentionRe.exec(text)) !== null) {
    const name = m[1];
    if (!usernames.has(name.toLowerCase())) continue;
    if (m.index > lastIdx) {
      nodes.push(text.slice(lastIdx, m.index));
    }
    const capturedName = name;
    nodes.push(
      <span
        key={`${parentKey}-m${k++}`}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (onMentionClick) {
            onMentionClick(capturedName, (e.currentTarget as HTMLElement).getBoundingClientRect());
          }
        }}
        className="rounded px-1 py-px bg-riftapp-accent/20 text-riftapp-accent-hover font-medium cursor-pointer hover:bg-riftapp-accent/30 hover:underline"
      >
        @{name}
      </span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (nodes.length === 0) return text;
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return <>{nodes}</>;
}

interface MessageItemProps {
  message: Message;
  showHeader: boolean;
  isOwn: boolean;
  /** Direct messages: only the author may delete. Hub streams: author or hub owner/admin. */
  isDM?: boolean;
  /** Active hub (for message link in context menu). */
  hubId?: string | null;
}

function roleCanModerateMessages(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

const MessageItem = memo(function MessageItem({ message, showHeader, isOwn, isDM = false, hubId = null }: MessageItemProps) {
  const author = message.author;
  const authorName = author?.display_name || 'Unknown';
  const toggleReaction = useMessageStore((s) => s.toggleReaction);
  const deleteStreamMessage = useMessageStore((s) => s.deleteMessage);
  const deleteDMMessage = useDMStore((s) => s.deleteDMMessage);
  const editStreamMessage = useMessageStore((s) => s.editMessageContent);
  const editDMMessage = useDMStore((s) => s.editDMMessage);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUsername = useAuthStore((s) => s.user?.username);
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const myHubRole = hubMembers[currentUserId ?? '']?.role;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [savingEdit, setSavingEdit] = useState(false);

  const canDelete =
    isOwn ||
    (!isDM && !!message.stream_id && roleCanModerateMessages(myHubRole));

  const canEdit = isOwn && Boolean((message.content || '').trim());

  const color = useMemo(() => nameColor(authorName), [authorName]);
  const bg = useMemo(() => avatarBg(authorName), [authorName]);

  // Build a lowercase set of known usernames for mention detection
  const knownUsernames = useMemo(() => {
    const set = new Set<string>();
    for (const uid in hubMembers) {
      const u = hubMembers[uid];
      if (u.username) set.add(u.username.toLowerCase());
    }
    return set;
  }, [hubMembers]);

  const pickerRef = useRef<HTMLDivElement>(null);
  const openProfile = useProfilePopoverStore((s) => s.open);
  const openContextMenu = useUserContextMenuStore((s) => s.open);

  const handleMentionClick = useCallback((username: string, rect: DOMRect) => {
    const user = Object.values(hubMembers).find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (user) openProfile(user, rect);
  }, [hubMembers, openProfile]);

  const renderedContent = useMemo(
    () => message.content ? renderContent(message.content, knownUsernames, handleMentionClick) : null,
    [message.content, knownUsernames, handleMentionClick],
  );

  // Detect whether the current user is mentioned in this message
  const mentionsSelf = useMemo(() => {
    if (!currentUsername || !message.content) return false;
    const re = new RegExp(`@${currentUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.\\-])`, 'i');
    return re.test(message.content);
  }, [message.content, currentUsername]);

  const handleProfileClick = useCallback((e: React.MouseEvent) => {
    if (author) {
      openProfile(author, (e.currentTarget as HTMLElement).getBoundingClientRect());
    }
  }, [author, openProfile]);

  const handleUserContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (author) {
        e.preventDefault();
        openContextMenu(author, e.clientX, e.clientY);
      }
    },
    [author, openContextMenu],
  );

  const handleMessageContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMessageMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!editing) setEditDraft(message.content);
  }, [message.content, editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(false);
        setEditDraft(message.content);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, message.content]);

  const saveEdit = useCallback(async () => {
    const t = editDraft.trim();
    if (!t || savingEdit) return;
    setSavingEdit(true);
    try {
      if (isDM) await editDMMessage(message.id, t);
      else await editStreamMessage(message.id, t);
      setEditing(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not save edit');
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, editDMMessage, editStreamMessage, isDM, message.id, savingEdit]);

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

  const handleDelete = useCallback(async () => {
    if (!canDelete || deleting) return;
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    setDeleting(true);
    try {
      if (isDM) {
        await deleteDMMessage(message.id);
      } else {
        await deleteStreamMessage(message.id);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not delete message');
    } finally {
      setDeleting(false);
    }
  }, [canDelete, deleting, isDM, message.id, deleteDMMessage, deleteStreamMessage]);

  const reactions = message.reactions || [];

  const contentBlock =
    editing ? (
      <div className="mt-1 space-y-2">
        <textarea
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void saveEdit();
            }
          }}
          className="w-full min-h-[80px] bg-riftapp-bg border border-riftapp-border/60 rounded-lg px-3 py-2 text-[15px] text-riftapp-text outline-none focus:ring-2 focus:ring-riftapp-accent/30 resize-y"
          maxLength={4000}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={savingEdit || !editDraft.trim()}
            onClick={() => void saveEdit()}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-riftapp-accent text-white hover:bg-riftapp-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            disabled={savingEdit}
            onClick={() => {
              setEditing(false);
              setEditDraft(message.content);
            }}
            className="px-3 py-1.5 rounded-md text-sm text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-surface-hover"
          >
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <>
        <div className="text-[15px] leading-[1.375rem] text-riftapp-text/[0.90]">{renderedContent}</div>
        <Attachments message={message} />
        {reactions.length > 0 && (
          <ReactionPills reactions={reactions} currentUserId={currentUserId} onToggle={handleToggle} />
        )}
      </>
    );

  return (
    <div
      onContextMenu={handleMessageContextMenu}
      className={`group relative py-0.5 -mx-4 px-4 transition-colors duration-100 ${
        mentionsSelf
          ? 'bg-riftapp-accent/[0.06] border-l-2 border-riftapp-accent/60 hover:bg-riftapp-accent/[0.10]'
          : 'hover:bg-riftapp-surface/20'
      } ${
        showHeader ? 'mt-[17px]' : ''
      }`}
    >
      {/* Hover timestamp for compact messages */}
      {!showHeader && (
        <span className="absolute left-4 top-1 text-[10px] text-riftapp-text-dim opacity-0 group-hover:opacity-100 transition-opacity duration-100 select-none w-10 text-right">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      {/* Hover action bar */}
      <div className="absolute -top-3 right-4 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 ease-out z-10">
        <div className="flex items-center bg-riftapp-surface border border-riftapp-border/60 rounded-lg shadow-elevation-low">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="px-2 py-1 text-riftapp-text-dim hover:text-riftapp-text hover:bg-riftapp-surface-hover rounded-lg transition-colors duration-100"
            title="Add Reaction"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="px-2 py-1 text-riftapp-text-dim hover:text-riftapp-danger hover:bg-riftapp-danger/10 rounded-lg transition-colors duration-100 disabled:opacity-50 border-l border-riftapp-border/40"
              title={isOwn ? 'Delete message' : 'Delete message (moderator)'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
        </div>
        {/* Emoji picker */}
        {pickerOpen && (
          <div ref={pickerRef} className="absolute right-0 top-full mt-1 bg-riftapp-panel border border-riftapp-border/60 rounded-xl shadow-elevation-high p-2 animate-scale-in z-50">
            <div className="grid grid-cols-4 gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleToggle(emoji)}
                  className="w-10 h-10 flex items-center justify-center text-2xl leading-none rounded-lg hover:bg-riftapp-surface-hover active:bg-riftapp-panel transition-colors duration-150"
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
            onContextMenu={handleUserContextMenu}
            className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity`}
          >
            {authorName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span onClick={handleProfileClick} onContextMenu={handleUserContextMenu} className={`font-semibold text-[15px] cursor-pointer hover:underline ${isOwn ? 'text-riftapp-accent-hover' : color}`}>
                {authorName}
              </span>
              <span className="text-[11px] text-riftapp-text-dim/80 select-none">
                {formatTime(message.created_at)}
              </span>
              {message.edited_at && (
                <span className="text-[10px] text-riftapp-text-dim/60 select-none" title={`Edited ${formatTime(message.edited_at)}`}>(edited)</span>
              )}
            </div>
            {contentBlock}
          </div>
        </div>
      ) : (
        <div className="pl-[52px]">{contentBlock}</div>
      )}

      {messageMenu && (
        <MessageContextMenu
          message={message}
          x={messageMenu.x}
          y={messageMenu.y}
          isDM={isDM}
          hubId={hubId}
          isOwn={isOwn}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setMessageMenu(null)}
          onEdit={() => {
            setMessageMenu(null);
            setEditDraft(message.content);
            setEditing(true);
          }}
        />
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
            className={`inline-flex items-center gap-1.5 h-6 min-w-[42px] px-1.5 rounded-full text-xs font-medium border transition-colors duration-150 cursor-pointer select-none ${
              reacted
                ? 'bg-riftapp-accent/15 border-riftapp-accent/50 text-riftapp-accent'
                : 'bg-riftapp-surface border-riftapp-border/50 text-riftapp-text-dim hover:border-riftapp-border hover:bg-riftapp-surface-hover'
            }`}
          >
            <span className="w-4 h-4 text-[15px] leading-4 text-center shrink-0">{r.emoji}</span>
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
                className="max-w-[400px] max-h-[300px] rounded-xl border border-riftapp-border/40 object-contain
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
            className="inline-flex items-center gap-3 bg-riftapp-surface border border-riftapp-border/50 rounded-xl px-4 py-3
              hover:bg-riftapp-surface-hover hover:border-riftapp-border transition-all duration-150 max-w-[380px] group/file"
          >
            <div className="w-10 h-10 rounded-lg bg-riftapp-accent/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-accent">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-riftapp-accent group-hover/file:underline truncate font-medium">{att.filename}</p>
              <p className="text-[11px] text-riftapp-text-dim">{formatBytes(att.size_bytes)}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="text-riftapp-text-dim opacity-0 group-hover/file:opacity-100 transition-opacity flex-shrink-0">
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
