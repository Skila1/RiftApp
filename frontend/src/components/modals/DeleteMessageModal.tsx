import { useState, useCallback } from 'react';
import type { Message } from '../../types';
import { useAuthStore } from '../../stores/auth';
import { useHubStore } from '../../stores/hubStore';
import MessageItem from '../chat/MessageItem';
import ConfirmModal from './ConfirmModal';

interface Props {
  message: Message;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function DeleteMessageModal({ message, onConfirm, onCancel }: Props) {
  const [deleting, setDeleting] = useState(false);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const isDM = Boolean(message.conversation_id && !message.stream_id);
  const isOwn = message.author_id === currentUserId;

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
      allowBackdropClose
    >
      <div className="rounded-xl border border-riftapp-border/50 bg-riftapp-content-elevated/70 p-3 shadow-elevation-low">
        <div className="max-h-[52vh] overflow-y-auto pr-1">
          <MessageItem
            message={message}
            showHeader
            isOwn={isOwn}
            isDM={isDM}
            hubId={activeHubId}
            isPreview
          />
        </div>
      </div>
      <p className="text-[12px] text-[#949ba4] mt-3">
        <span className="font-semibold text-[#b5bac1]">Protip:</span>{' '}
        You can hold <kbd className="px-1 py-0.5 rounded bg-[#1e1f22] text-[#dbdee1] text-[11px] font-mono">Shift</kbd> while clicking delete to skip this confirmation.
      </p>
    </ConfirmModal>
  );
}
