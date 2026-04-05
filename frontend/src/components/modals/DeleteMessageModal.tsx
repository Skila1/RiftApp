import { useState, useCallback } from 'react';
import type { Message } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ConfirmModal from './ConfirmModal';

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

interface Props {
  message: Message;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function DeleteMessageModal({ message, onConfirm, onCancel }: Props) {
  const [deleting, setDeleting] = useState(false);
  const authorName = message.author?.display_name || 'Unknown';
  const bg = avatarBg(authorName);

  const handleConfirm = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await Promise.resolve(onConfirm());
    } finally {
      setDeleting(false);
    }
  }, [deleting, onConfirm]);

  return (
    <ConfirmModal
      isOpen
      title="Delete Message"
      description="Are you sure you want to delete this message?"
      confirmText="Delete"
      variant="danger"
      onConfirm={handleConfirm}
      onCancel={onCancel}
      loading={deleting}
    >
      <div className="rounded-lg bg-[#2b2d31] border border-[#1e1f22] p-3">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden">
            {message.author?.avatar_url ? (
              <img
                src={publicAssetUrl(message.author.avatar_url)}
                alt={authorName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-full h-full ${bg} flex items-center justify-center text-xs font-bold text-white`}>
                {authorName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-semibold text-[15px] text-[#dbdee1] truncate">{authorName}</span>
              <span className="text-[11px] text-[#949ba4] select-none flex-shrink-0">{formatTime(message.created_at)}</span>
            </div>

            <p className="text-[14px] text-[#dbdee1]/80 break-words line-clamp-4 whitespace-pre-wrap">
              {message.content || <span className="text-[#949ba4] italic">No text content</span>}
            </p>

            {message.attachments && message.attachments.length > 0 && (
              <p className="text-[12px] text-[#949ba4] mt-1 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                </svg>
                {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>
      <p className="text-[12px] text-[#949ba4] mt-3">
        <span className="font-semibold text-[#b5bac1]">Protip:</span>{' '}
        You can hold <kbd className="px-1 py-0.5 rounded bg-[#1e1f22] text-[#dbdee1] text-[11px] font-mono">Shift</kbd> while clicking delete to skip this confirmation.
      </p>
    </ConfirmModal>
  );
}
