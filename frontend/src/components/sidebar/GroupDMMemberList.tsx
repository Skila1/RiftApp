import { useCallback, useMemo, useState } from 'react';

import type { Conversation, User } from '../../types';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useUserContextMenuStore } from '../../stores/userContextMenuStore';
import { getConversationMembers, getUserLabel } from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import BotBadge from '../shared/BotBadge';
import CrownIcon from '../shared/CrownIcon';
import StatusDot, { statusLabel } from '../shared/StatusDot';

function GroupMemberRow({
  member,
  ownerId,
  currentUserId,
  canRemoveMembers,
  memberActionId,
  onRemove,
}: {
  member: User;
  ownerId?: string | null;
  currentUserId?: string | null;
  canRemoveMembers: boolean;
  memberActionId: string | null;
  onRemove: (userId: string, label: string) => void;
}) {
  const status = usePresenceStore((s) => s.presence[member.id]) ?? member.status;
  const isOffline = status === 0;
  const openProfile = useProfilePopoverStore((s) => s.open);
  const openContextMenu = useUserContextMenuStore((s) => s.open);
  const label = getUserLabel(member);
  const isOwner = ownerId === member.id;
  const isCurrentUser = currentUserId === member.id;
  const canRemove = canRemoveMembers && !isCurrentUser;
  const isRemoving = memberActionId === member.id;

  const handleClick = useCallback((event: React.MouseEvent) => {
    openProfile(member, (event.currentTarget as HTMLElement).getBoundingClientRect());
  }, [member, openProfile]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    openContextMenu(member, event.clientX, event.clientY);
  }, [member, openContextMenu]);

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${isOffline ? 'opacity-50 hover:bg-riftapp-content-elevated' : 'hover:bg-riftapp-content-elevated'} cursor-pointer`}
    >
      <div className="relative flex-shrink-0">
        {member.avatar_url ? (
          <img src={publicAssetUrl(member.avatar_url)} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-riftapp-content-elevated">
            <span className="text-xs font-semibold uppercase text-[#c7ced9]">{label.slice(0, 2)}</span>
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-riftapp-content">
          <StatusDot userId={member.id} fallbackStatus={member.status} size="sm" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium leading-tight text-[#e4e6eb]">
          <span className="truncate">{label}</span>
          {isOwner ? <CrownIcon className="h-3.5 w-3.5 shrink-0 text-[#f0b232]" /> : null}
          {member.is_bot ? <BotBadge /> : null}
        </p>
        <p className="truncate text-[11px] text-[#777d88]">
          @{member.username}{isCurrentUser ? ' • You' : ''}
        </p>
      </div>

      {canRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(member.id, label);
          }}
          disabled={isRemoving}
          className="rounded-md border border-[#5c2b2e] px-2 py-1 text-[10px] font-semibold text-[#ffb3b8] opacity-0 transition-all hover:bg-[#5c2b2e]/30 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-60"
          title={`Remove ${label}`}
        >
          {isRemoving ? 'Removing…' : 'Remove'}
        </button>
      ) : (
        <span className="text-[10px] text-[#777d88] opacity-0 transition-opacity group-hover:opacity-100">
          {statusLabel(status)}
        </span>
      )}
    </div>
  );
}

export default function GroupDMMemberList({ conversation }: { conversation: Conversation }) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const currentConversation = useDMStore((s) => s.conversations.find((entry) => entry.id === conversation.id) ?? conversation);
  const removeConversationMember = useDMStore((s) => s.removeConversationMember);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownerId = currentConversation.owner_id ?? null;
  const canRemoveMembers = Boolean(ownerId && ownerId === currentUserId);
  const members = useMemo(() => {
    const allMembers = getConversationMembers(currentConversation);
    return [...allMembers].sort((left, right) => {
      const leftOwnerRank = left.id === ownerId ? 0 : 1;
      const rightOwnerRank = right.id === ownerId ? 0 : 1;
      if (leftOwnerRank !== rightOwnerRank) {
        return leftOwnerRank - rightOwnerRank;
      }

      const leftSelfRank = left.id === currentUserId ? 0 : 1;
      const rightSelfRank = right.id === currentUserId ? 0 : 1;
      if (leftSelfRank !== rightSelfRank) {
        return leftSelfRank - rightSelfRank;
      }

      return getUserLabel(left).localeCompare(getUserLabel(right));
    });
  }, [currentConversation, currentUserId, ownerId]);

  const handleRemove = useCallback(async (userId: string, label: string) => {
    if (memberActionId) {
      return;
    }

    const confirmed = window.confirm(`Remove ${label} from this group DM?`);
    if (!confirmed) {
      return;
    }

    setMemberActionId(userId);
    setError(null);
    try {
      await removeConversationMember(currentConversation.id, userId);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove member');
    } finally {
      setMemberActionId(null);
    }
  }, [currentConversation.id, memberActionId, removeConversationMember]);

  if (members.length === 0) {
    return null;
  }

  return (
    <div className="relative w-60 flex-shrink-0 border-l border-riftapp-border/60 bg-riftapp-content">
      <div className="border-b border-riftapp-border/50 px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b818e]">
          Members — {members.length}
        </h3>
        <p className="mt-1 text-xs text-[#949ba4]">
          {canRemoveMembers ? 'You can remove group members.' : ownerId ? 'Only the group owner can remove members.' : 'Group members'}
        </p>
      </div>

      <div className="space-y-3 overflow-y-auto px-2 py-3">
        <div className="space-y-0.5">
          {members.map((member) => (
            <GroupMemberRow
              key={member.id}
              member={member}
              ownerId={ownerId}
              currentUserId={currentUserId}
              canRemoveMembers={canRemoveMembers}
              memberActionId={memberActionId}
              onRemove={handleRemove}
            />
          ))}
        </div>

        {error ? <div className="px-2 text-xs text-[#ed4245]">{error}</div> : null}
      </div>
    </div>
  );
}