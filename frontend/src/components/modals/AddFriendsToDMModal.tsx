import { useEffect, useMemo, useState } from 'react';
import type { Conversation, User } from '../../types';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { useFriendStore } from '../../stores/friendStore';
import {
  getConversationOtherMembers,
  getConversationTitle,
  getUserLabel,
} from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ModalOverlay from '../shared/ModalOverlay';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

function FriendAvatar({ user }: { user: User }) {
  if (user.avatar_url) {
    return (
      <img
        src={publicAssetUrl(user.avatar_url)}
        alt=""
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-riftapp-accent/20 text-sm font-semibold text-riftapp-accent">
      {getUserLabel(user).slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function AddFriendsToDMModal({ conversation, onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const friends = useFriendStore((s) => s.friends);
  const loading = useFriendStore((s) => s.loading);
  const loadFriends = useFriendStore((s) => s.loadFriends);
  const openGroupDM = useDMStore((s) => s.openGroupDM);

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
    setSelectedIds((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ));
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await openGroupDM([
        ...existingMembers.map((member) => member.id),
        ...selectedIds,
      ]);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not start group DM');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay isOpen onClose={submitting ? () => {} : onClose} zIndex={330} className="p-4 sm:p-6">
      <div className="w-[min(92vw,520px)] overflow-hidden rounded-2xl border border-white/10 bg-[#111214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-white/6 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#f2f3f5]">Add Friends to DM</h2>
          <p className="mt-1 text-sm text-[#949ba4]">
            Start a group conversation from {getConversationTitle(conversation, currentUserId)}.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">
              Search Friends
            </label>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or username"
              className="w-full rounded-xl border border-[#2e3138] bg-[#17181c] px-3 py-2.5 text-sm text-[#f2f3f5] outline-none transition-colors placeholder:text-[#72767d] focus:border-[#5865f2]"
            />
          </div>

          <div className="rounded-xl border border-white/6 bg-[#17181c]">
            <div className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">
              Available Friends
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {loading && friends.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-[#949ba4]">Loading friends…</div>
              ) : availableFriends.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-[#949ba4]">
                  {friends.length === 0 ? 'You do not have any friends to add yet.' : 'No matching friends available for this DM.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {availableFriends.map((friend) => {
                    const selected = selectedIds.includes(friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => handleToggle(friend.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'border-[#5865f2] bg-[#1f2340] text-[#f2f3f5]'
                            : 'border-transparent bg-transparent text-[#dbdee1] hover:border-white/6 hover:bg-[#1c1d22]'
                        }`}
                      >
                        <FriendAvatar user={friend} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-inherit">{getUserLabel(friend)}</div>
                          <div className="truncate text-xs text-[#949ba4]">@{friend.username}</div>
                        </div>
                        <div className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-bold ${selected ? 'border-[#7a85ff] bg-[#5865f2] text-white' : 'border-white/10 text-transparent'}`}>
                          ✓
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {error ? <div className="text-sm text-[#ed4245]">{error}</div> : null}
        </div>

        <div className="flex items-center justify-between border-t border-white/6 px-5 py-4">
          <div className="text-sm text-[#949ba4]">
            {selectedIds.length === 0 ? 'Select at least one friend to create a group DM.' : `${selectedIds.length} friend${selectedIds.length === 1 ? '' : 's'} selected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedIds.length === 0 || submitting}
              className="rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6b77ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Starting…' : 'Create Group DM'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}