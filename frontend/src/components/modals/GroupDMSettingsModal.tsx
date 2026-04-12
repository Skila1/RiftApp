import { useEffect, useRef, useState } from 'react';
import type { Conversation } from '../../types';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import {
  getConversationIconUrl,
  getConversationTitle,
} from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ModalOverlay from '../shared/ModalOverlay';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

function GroupPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-10 w-10 text-[#4f545c]">
      <path d="M15.5 15.5a4.5 4.5 0 0 1 4.49 4.19l.01.31h-2a2.5 2.5 0 0 0-2.34-2.49L15.5 17.5h-1.04c.37-.6.72-1.28 1.04-2ZM8.5 14c3.2 0 5.8 2.47 5.99 5.62L14.5 20H2.5c0-3.31 2.69-6 6-6Zm0 2c-1.96 0-3.6 1.41-3.95 3.27L4.5 20h8a4 4 0 0 0-3.73-3.99L8.5 16Zm7-10a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm-7 1a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm7 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" fill="currentColor" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

export default function GroupDMSettingsModal({ conversation, onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentConversation = useDMStore((s) => s.conversations.find((entry) => entry.id === conversation.id) ?? conversation);
  const patchConversation = useDMStore((s) => s.patchConversation);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentConversation.name ?? '');
  const [iconPreview, setIconPreview] = useState<string | null>(getConversationIconUrl(currentConversation) ?? null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(currentConversation.name ?? '');
    setIconPreview(getConversationIconUrl(currentConversation) ?? null);
    setIconFile(null);
  }, [currentConversation.id, currentConversation.name, currentConversation.icon_url]);

  const initialName = currentConversation.name ?? '';
  const initialIcon = getConversationIconUrl(currentConversation) ?? null;
  const metadataDirty = name.trim() !== initialName.trim() || iconPreview !== initialIcon || iconFile != null;

  const handleIconSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
    event.target.value = '';
  };

  const handleSave = async () => {
    if (!metadataDirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const patch: { name?: string | null; icon_url?: string | null } = {};
      if (name.trim() !== initialName.trim()) {
        patch.name = name.trim() || null;
      }
      if (iconFile) {
        const attachment = await api.uploadFile(iconFile);
        patch.icon_url = attachment.url;
      } else if (iconPreview !== initialIcon) {
        patch.icon_url = iconPreview;
      }
      if (Object.keys(patch).length > 0) {
        await patchConversation(currentConversation.id, patch);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update the group DM');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (saving) {
      return;
    }
    onClose();
  };

  return (
    <ModalOverlay isOpen onClose={saving ? () => {} : onClose} zIndex={340} className="p-4 sm:p-6">
      <div className="w-[min(92vw,308px)] overflow-hidden rounded-2xl bg-[#2b2d31] shadow-[0_28px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 className="text-[22px] font-bold leading-none text-[#f2f3f5]">Edit Group</h2>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            aria-label="Close edit group dialog"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#b5bac1] transition-colors hover:bg-white/6 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleIconSelect}
          />

          <div className="mb-4 mt-1 flex justify-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex h-[92px] w-[92px] items-center justify-center rounded-full bg-[#1f2124] transition-transform hover:scale-[1.02]"
              aria-label="Change group icon"
            >
              {iconPreview ? (
                <img src={publicAssetUrl(iconPreview)} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <GroupPlaceholderIcon />
              )}
              <span className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1f2124] text-[#dcddde] shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-colors group-hover:bg-[#292b2f] group-hover:text-white">
                <PencilIcon />
              </span>
            </button>
          </div>

          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            placeholder={getConversationTitle(currentConversation, currentUserId)}
            className="w-full rounded-[6px] border border-[#5865f2] bg-[#1e1f22] px-3 py-[9px] text-[14px] text-[#f2f3f5] outline-none transition-colors placeholder:text-[#a3a6ad] focus:border-[#6f7bf7]"
          />

          {error ? <p className="mt-2 text-[12px] text-[#ed4245]">{error}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-[5px] bg-[#4f545c] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#5d6269] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!metadataDirty || saving}
              className="rounded-[5px] bg-[#5865f2] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#6b77ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}