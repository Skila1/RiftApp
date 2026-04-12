import { useEffect, useMemo, useState } from 'react';
import type { Conversation, User } from '../../types';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { useFriendStore } from '../../stores/friendStore';
import {
  getConversationOtherMembers,
  getUserLabel,
} from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ModalOverlay from '../shared/ModalOverlay';
import ModalCloseButton from '../shared/ModalCloseButton';
import StatusDot from '../shared/StatusDot';

const MAX_GROUP_DM_MEMBERS = 15;

interface Props {
  conversation: Conversation;
  mode?: 'create' | 'add';
  onClose: () => void;
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FriendAvatar({ user }: { user: User }) {
  return (
    <div className="relative flex-shrink-0">
      {user.avatar_url ? (
        <img
          src={publicAssetUrl(user.avatar_url)}
          alt=""
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-riftapp-accent/20 text-[12px] font-semibold text-riftapp-accent">
          {getUserLabel(user).slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-riftapp-menu">
        <StatusDot userId={user.id} fallbackStatus={user.status} size="sm" />
      </div>
    </div>
  );
}

export default function AddFriendsToDMModal({ conversation, mode = 'create', onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const friends = useFriendStore((s) => s.friends);
  const loading = useFriendStore((s) => s.loading);
  const loadFriends = useFriendStore((s) => s.loadFriends);
  const openGroupDM = useDMStore((s) => s.openGroupDM);
  const addConversationMembers = useDMStore((s) => s.addConversationMembers);

  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (friends.length === 0) {
      void loadFriends();
    }
  }, [friends.length, loadFriends]);

  const existingMembers = useMemo(
    () => getConversationOtherMembers(conversation, currentUserId),
    [conversation, currentUserId],
  );

  const existingMemberIds = useMemo(() => {
    const ids = new Set(existingMembers.map((member) => member.id));
    if (currentUserId) {
      ids.add(currentUserId);
    }
    return ids;
  }, [currentUserId, existingMembers]);

  const currentMemberCount = existingMemberIds.size;
  const remainingSlots = Math.max(0, MAX_GROUP_DM_MEMBERS - currentMemberCount);

  const availableFriends = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return friends
      .map((friendship) => friendship.user)
      .filter((user): user is User => user != null && !existingMemberIds.has(user.id))
      .filter((user) => {
        if (!normalizedQuery) return true;
        const haystack = `${user.display_name} ${user.username}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => getUserLabel(left).localeCompare(getUserLabel(right)));
  }, [existingMemberIds, friends, query]);

  const handleToggle = (userId: string) => {
    let hitLimit = false;
    setSelectedIds((current) => {
      if (current.includes(userId)) {
        return current.filter((id) => id !== userId);
      }

      if (current.length >= remainingSlots) {
        hitLimit = true;
        return current;
      }

      return [...current, userId];
    });

    if (hitLimit) {
      setError(`Group chats can have up to ${MAX_GROUP_DM_MEMBERS} members.`);
      return;
    }

    setError(null);
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0 || submitting || remainingSlots <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'add') {
        await addConversationMembers(conversation.id, selectedIds);
      } else {
        await openGroupDM([
          ...existingMembers.map((member) => member.id),
          ...selectedIds,
        ]);
      }
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : mode === 'add' ? 'Could not add group members' : 'Could not start group DM');
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === 'add' ? 'Add Friends to Group DM' : 'Create Group DM';
  const description = remainingSlots > 0
    ? `${mode === 'add' ? 'You can add' : 'You can choose'} ${remainingSlots} more friend${remainingSlots === 1 ? '' : 's'}.`
    : `This group chat already has the maximum ${MAX_GROUP_DM_MEMBERS} members.`;
  const submitLabel = mode === 'add' ? 'Add' : 'Create';
  const selectedSummary = selectedIds.length > 0
    ? `${selectedIds.length} selected`
    : 'Select friends to continue';

  return (
    <ModalOverlay isOpen onClose={submitting ? () => {} : onClose} zIndex={330} className="p-4 sm:p-6">
      <div className="w-[min(88vw,340px)] overflow-hidden rounded-[20px] border border-white/10 bg-riftapp-menu text-[#f2f3f5] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-3 px-3.5 pb-2.5 pt-3.5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold leading-none text-[#f2f3f5]">{title}</h2>
            <p className="mt-1.5 text-[12px] leading-5 text-[#b5bac1]">{description}</p>
          </div>
          <ModalCloseButton
            onClick={onClose}
            disabled={submitting}
            size="sm"
            className="mt-[-2px] shrink-0 border-white/10 bg-transparent hover:bg-white/5"
          />
        </div>

        <div className="px-3.5 pb-3.5">
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[#8f949c]" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for friends"
                className="h-8 w-full rounded-md border border-[#3a3d45] bg-[#23252a] pl-8 pr-2.5 text-[13px] text-[#f2f3f5] outline-none transition-colors placeholder:text-[#8f949c] focus:border-[#5865f2]"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={selectedIds.length === 0 || submitting || remainingSlots <= 0}
              className="inline-flex h-8 min-w-[54px] items-center justify-center rounded-md bg-[#5865f2] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#6b77ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (mode === 'add' ? 'Adding…' : 'Creating…') : submitLabel}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-[#b5bac1]">
            <span>{selectedSummary}</span>
            <span>{remainingSlots} slot{remainingSlots === 1 ? '' : 's'} left</span>
          </div>

          {error ? <div className="mt-2 text-[12px] text-[#ff8d8f]">{error}</div> : null}

          <div className="mt-2.5 max-h-[320px] overflow-y-auto rounded-xl bg-[#23252a] py-1">
            {loading && friends.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[#949ba4]">Loading friends…</div>
            ) : availableFriends.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-[#949ba4]">
                {friends.length === 0 ? 'You do not have any friends to add yet.' : 'No matching friends available for this group DM.'}
              </div>
            ) : (
              <div className="space-y-0.5 px-1 py-1">
                {availableFriends.map((friend) => {
                  const selected = selectedIds.includes(friend.id);
                  const disabled = !selected && (remainingSlots <= 0 || selectedIds.length >= remainingSlots);

                  return (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => {
                        if (!disabled || selected) {
                          handleToggle(friend.id);
                        }
                      }}
                      disabled={disabled && !selected}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                        selected
                          ? 'bg-[#313338] text-[#f2f3f5]'
                          : disabled
                            ? 'cursor-not-allowed text-[#7b818e] opacity-60'
                            : 'text-[#dbdee1] hover:bg-[#313338]'
                      }`}
                    >
                      <FriendAvatar user={friend} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-inherit">{getUserLabel(friend)}</div>
                        <div className="truncate text-[10px] text-[#949ba4]">@{friend.username}</div>
                      </div>
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-bold transition-colors ${
                          selected
                            ? 'border-[#7a85ff] bg-[#5865f2] text-white'
                            : 'border-[#5a5e68] bg-transparent text-transparent'
                        }`}
                        aria-hidden
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}