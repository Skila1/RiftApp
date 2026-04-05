import { useState, type ReactNode } from 'react';
import { MenuOverlay, menuDivider } from './MenuOverlay';
import type { Message } from '../../types';
import { useMessageStore } from '../../stores/messageStore';
import { useDMStore } from '../../stores/dmStore';
import { useReplyDraftStore } from '../../stores/replyDraftStore';

const QUICK_ROW = ['😂', '✨', '🔥', '👍'];
const REACTION_PICK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✨', '👀', '🎉'];

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconReply() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10.5a5.5 5.5 0 015.5 5.5v0a5.5 5.5 0 01-5.5 5.5H11" strokeLinecap="round" />
    </svg>
  );
}

function IconForward() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <path d="M15 14l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9H9.5A5.5 5.5 0 004 14.5v0A5.5 5.5 0 009.5 20H13" strokeLinecap="round" />
    </svg>
  );
}

function IconThread() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function IconUnread() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 3L9 15" strokeLinecap="round" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07l-1.41 1.41" strokeLinecap="round" />
      <path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function IconSpeak() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b5bac1] shrink-0">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#f23f42] shrink-0">
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  message: Message;
  x: number;
  y: number;
  isDM: boolean;
  hubId: string | null;
  isOwn: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export default function MessageContextMenu({
  message,
  x,
  y,
  isDM,
  hubId,
  isOwn,
  canEdit,
  canDelete,
  onClose,
  onEdit,
}: Props) {
  const toggleReaction = useMessageStore((s) => s.toggleReaction);
  const deleteStreamMessage = useMessageStore((s) => s.deleteMessage);
  const deleteDMMessage = useDMStore((s) => s.deleteDMMessage);
  const setReplyTo = useReplyDraftStore((s) => s.setReplyTo);

  const [reactionOpen, setReactionOpen] = useState(false);

  const plainText = message.content ?? '';

  const copyText = () => {
    void navigator.clipboard.writeText(plainText);
    onClose();
  };

  const copyId = () => {
    void navigator.clipboard.writeText(message.id);
    onClose();
  };

  const copyLink = () => {
    let url: string;
    if (isDM && message.conversation_id) {
      url = `${window.location.origin}/dms/${message.conversation_id}`;
    } else if (hubId && message.stream_id) {
      url = `${window.location.origin}/hubs/${hubId}/${message.stream_id}`;
    } else {
      void navigator.clipboard.writeText(message.id);
      onClose();
      return;
    }
    void navigator.clipboard.writeText(url);
    onClose();
  };

  const speak = () => {
    if (plainText && typeof speechSynthesis !== 'undefined') {
      const u = new SpeechSynthesisUtterance(plainText);
      speechSynthesis.speak(u);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    onClose();
    try {
      if (isDM) await deleteDMMessage(message.id);
      else await deleteStreamMessage(message.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  const addReaction = (emoji: string) => {
    if (!isDM) void toggleReaction(message.id, emoji);
    onClose();
  };

  const row = (
    label: string,
    right: ReactNode,
    onClick?: () => void,
    opts?: { danger?: boolean; disabled?: boolean },
  ) => (
    <button
      type="button"
      disabled={opts?.disabled}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 px-2 py-1.5 mx-1 rounded w-[calc(100%-8px)] text-left hover:bg-[#232428] disabled:opacity-40 disabled:pointer-events-none ${
        opts?.danger ? 'text-[#f23f42]' : 'text-[#dbdee1]'
      }`}
    >
      <span>{label}</span>
      <span className="flex items-center gap-1 shrink-0">{right}</span>
    </button>
  );

  return (
    <MenuOverlay x={x} y={y} onClose={onClose}>
      <div className="bg-[#111214] rounded-md border border-black/40 shadow-modal py-1.5 min-w-[240px] max-w-[280px] text-[13px] select-none">
        {!isDM && (
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5 mb-0.5 border-b border-white/[0.06]">
            {QUICK_ROW.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addReaction(emoji)}
                className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#232428] text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="relative mx-1" onMouseEnter={() => setReactionOpen(true)} onMouseLeave={() => setReactionOpen(false)}>
          <div
            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded cursor-default ${
              reactionOpen ? 'bg-[#232428]' : 'hover:bg-[#232428]'
            } ${isDM ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <span>Add Reaction</span>
            <span className="text-[#949ba4]">›</span>
          </div>
          {reactionOpen && !isDM && (
            <div className="absolute left-full top-0 pl-1 z-10" onMouseEnter={() => setReactionOpen(true)} onMouseLeave={() => setReactionOpen(false)}>
              <div className="bg-[#111214] rounded-md border border-black/40 shadow-modal p-2 grid grid-cols-5 gap-0.5 min-w-[200px]">
                {REACTION_PICK.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => addReaction(emoji)}
                    className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-[#232428] text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {menuDivider()}

        {isOwn &&
          canEdit &&
          row('Edit Message', <IconPencil />, () => {
            onClose();
            onEdit();
          })}
        {row(
          'Reply',
          <IconReply />,
          () => {
            setReplyTo(message);
            onClose();
            setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-riftapp-message-input]')?.focus(), 0);
          },
        )}
        {row('Forward', <IconForward />, undefined, { disabled: true })}
        {row('Create Thread', <IconThread />, undefined, { disabled: true })}

        {menuDivider()}

        {row('Copy Text', <IconCopy />, copyText)}
        {row('Apps', <span className="text-[#949ba4] text-sm">›</span>, undefined, { disabled: true })}
        {row('Mark Unread', <IconUnread />, undefined, { disabled: true })}
        {row('Copy Message Link', <IconLink />, copyLink)}
        {row('Speak Message', <IconSpeak />, speak)}

        {menuDivider()}

        {canDelete &&
          row(
            'Delete Message',
            <IconTrash />,
            () => void handleDelete(),
            { danger: true },
          )}

        {menuDivider()}

        {row(
          'Copy Message ID',
          <span className="text-[10px] font-mono font-semibold px-1 py-0.5 rounded bg-[#1e1f22] border border-[#3f4147] text-[#b5bac1]">ID</span>,
          copyId,
        )}
      </div>
    </MenuOverlay>
  );
}
