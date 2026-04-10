import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '../../types';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import {
  getConversationIconUrl,
  getConversationMembers,
  getConversationTitle,
  getUserLabel,
} from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import AddFriendsToDMModal from './AddFriendsToDMModal';
import ModalOverlay from '../shared/ModalOverlay';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

function MemberAvatar({ label, avatarUrl }: { label: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return <img src={publicAssetUrl(avatarUrl)} alt="" className="h-10 w-10 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-riftapp-accent/20 text-sm font-semibold text-riftapp-accent">
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function GroupDMSettingsModal({ conversation, onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentConversation = useDMStore((s) => s.conversations.find((entry) => entry.id === conversation.id) ?? conversation);
  const patchConversation = useDMStore((s) => s.patchConversation);
  const removeConversationMember = useDMStore((s) => s.removeConversationMember);
  const leaveConversation = useDMStore((s) => s.leaveConversation);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentConversation.name ?? '');
  const [iconPreview, setIconPreview] = useState<string | null>(getConversationIconUrl(currentConversation) ?? null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);

  useEffect(() => {
    setName(currentConversation.name ?? '');
    setIconPreview(getConversationIconUrl(currentConversation) ?? null);
    setIconFile(null);
  }, [currentConversation.id, currentConversation.name, currentConversation.icon_url]);

  const members = useMemo(() => {
    const entries = getConversationMembers(currentConversation);
    return [...entries].sort((left, right) => {
      if (left.id === currentUserId) return -1;
      if (right.id === currentUserId) return 1;
      return getUserLabel(left).localeCompare(getUserLabel(right));
    });
  }, [currentConversation, currentUserId]);

  const initialName = currentConversation.name ?? '';
  const initialIcon = getConversationIconUrl(currentConversation) ?? null;
  const metadataDirty = name.trim() !== initialName.trim() || iconPreview !== initialIcon || iconFile != null;

  const handleIconSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update the group DM');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (memberActionId) return;
    const member = members.find((entry) => entry.id === userId);
    const confirmed = window.confirm(`Remove ${getUserLabel(member)} from this group DM?`);
    if (!confirmed) return;
    setMemberActionId(userId);
    setError(null);
    try {
      await removeConversationMember(currentConversation.id, userId);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove member');
    } finally {
      setMemberActionId(null);
    }
  };

  const handleLeave = async () => {
    if (memberActionId) return;
    const confirmed = window.confirm('Leave this group DM?');
    if (!confirmed) return;
    setMemberActionId(currentUserId ?? 'leave');
    setError(null);
    try {
      await leaveConversation(currentConversation.id);
      onClose();
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : 'Could not leave group DM');
    } finally {
      setMemberActionId(null);
    }
  };

  return (
    <>
      <ModalOverlay isOpen onClose={saving || memberActionId ? () => {} : onClose} zIndex={340} className="p-4 sm:p-6">
        <div className="w-[min(94vw,640px)] overflow-hidden rounded-2xl border border-white/10 bg-[#111214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="border-b border-white/6 px-5 py-4">
            <h2 className="text-lg font-semibold text-[#f2f3f5]">Group DM Settings</h2>
            <p className="mt-1 text-sm text-[#949ba4]">Manage {getConversationTitle(currentConversation, currentUserId)}.</p>
          </div>

          <div className="grid gap-5 px-5 py-5 lg:grid-cols-[220px,minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/8 bg-[#17181c] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Group Icon</div>
                <div className="mt-4 flex flex-col items-center gap-3">
                  {iconPreview ? (
                    <img src={publicAssetUrl(iconPreview)} alt="" className="h-28 w-28 rounded-3xl object-cover" />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-[#23252b] text-3xl font-semibold text-[#f2f3f5]">
                      {getConversationTitle(currentConversation, currentUserId).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleIconSelect} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg bg-[#5865f2] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6b77ff]"
                  >
                    Upload Icon
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIconFile(null); setIconPreview(null); }}
                    className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/5"
                  >
                    Remove Icon
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/8 bg-[#17181c] p-4">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Group Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  placeholder="Give your group a name"
                  className="w-full rounded-xl border border-[#2e3138] bg-[#111214] px-3 py-2.5 text-sm text-[#f2f3f5] outline-none transition-colors placeholder:text-[#72767d] focus:border-[#5865f2]"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!metadataDirty || saving}
                    className="rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6b77ff] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-[#17181c] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Members</div>
                    <div className="mt-1 text-sm text-[#949ba4]">{members.length} member{members.length === 1 ? '' : 's'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddMembersModal(true)}
                    className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/5"
                  >
                    Add Members
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {members.map((member) => {
                    const isCurrentUser = member.id === currentUserId;
                    const label = getUserLabel(member);
                    return (
                      <div key={member.id} className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#111214] px-3 py-2.5">
                        <MemberAvatar label={label} avatarUrl={member.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[#f2f3f5]">{label}</div>
                          <div className="truncate text-xs text-[#949ba4]">@{member.username}{isCurrentUser ? ' • You' : ''}</div>
                        </div>
                        {!isCurrentUser ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(member.id)}
                            disabled={memberActionId === member.id}
                            className="rounded-lg border border-[#5c2b2e] px-3 py-2 text-xs font-semibold text-[#ffb3b8] transition-colors hover:bg-[#5c2b2e]/30 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {memberActionId === member.id ? 'Removing…' : 'Remove'}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error ? <div className="text-sm text-[#ed4245]">{error}</div> : null}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#5c2b2e]/70 bg-[#201214] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[#ffb3b8]">Leave Group</div>
                  <div className="mt-1 text-xs text-[#c98f95]">You will stop seeing this conversation unless someone adds you again.</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  disabled={memberActionId === (currentUserId ?? 'leave')}
                  className="rounded-lg bg-[#ed4245] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ff5458] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberActionId === (currentUserId ?? 'leave') ? 'Leaving…' : 'Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalOverlay>

      {showAddMembersModal ? (
        <AddFriendsToDMModal
          conversation={currentConversation}
          mode="add"
          onClose={() => setShowAddMembersModal(false)}
        />
      ) : null}
    </>
  );
}