import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { useHubStore } from '../../stores/hubStore';
import { useMessageStore } from '../../stores/messageStore';
import type { Message, Stream, User } from '../../types';
import { normalizeConversation, normalizeUser } from '../../utils/entityAssets';
import {
  getConversationAvatarUsers,
  getConversationOtherMembers,
  getConversationSubtitle,
  getConversationTitle,
} from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ModalOverlay from '../shared/ModalOverlay';

type StreamForwardTarget = {
  kind: 'stream';
  id: string;
  title: string;
  subtitle: string;
  hubId: string;
};

type ConversationForwardTarget = {
  kind: 'conversation';
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
  initial: string;
};

type UserForwardTarget = {
  kind: 'user';
  id: string;
  title: string;
  subtitle: string;
  avatarUrl?: string;
  initial: string;
};

interface Props {
  message: Message;
  onClose: () => void;
}

function getMessagePreview(message: Message): string {
  const trimmed = message.content.trim();
  if (trimmed) return trimmed;

  const attachmentCount = message.attachments?.length ?? 0;
  if (attachmentCount === 1) {
    return `Attachment: ${message.attachments?.[0]?.filename ?? 'file'}`;
  }
  if (attachmentCount > 1) {
    return `${attachmentCount} attachments`;
  }
  return 'No message content';
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 9h14" />
      <path d="M3 15h14" />
      <path d="M11 3 8 21" />
      <path d="M16 3 13 21" />
    </svg>
  );
}

function TargetAvatar({ avatarUrl, label }: { avatarUrl?: string; label: string }) {
  if (avatarUrl) {
    return (
      <img
        src={publicAssetUrl(avatarUrl)}
        alt=""
        className="h-9 w-9 rounded-full object-cover"
      />
    );
  }

  const initial = label.trim()[0]?.toUpperCase() ?? '?';
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#313338] text-sm font-semibold text-[#f2f3f5]">
      {initial}
    </div>
  );
}

function TargetRow({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        active
          ? 'border-[#5865f2] bg-[#20243b]'
          : 'border-white/6 bg-[#17181c] hover:bg-[#1d1f24]'
      }`}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#f2f3f5]">{title}</div>
        <div className="truncate text-xs text-[#949ba4]">{subtitle}</div>
      </div>
    </button>
  );
}

export default function ForwardMessageModal({ message, onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const hubs = useHubStore((s) => s.hubs);
  const conversations = useDMStore((s) => s.conversations);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const addConversation = useDMStore((s) => s.addConversation);
  const [hubStreams, setHubStreams] = useState<Record<string, Stream[]>>({});
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [searchedUser, setSearchedUser] = useState<User | null>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadTargets = async () => {
      setLoadingTargets(true);
      setLoadingError(null);

      try {
        if (conversations.length === 0) {
          void loadConversations();
        }

        const streamResults = await Promise.all(
          hubs.map(async (hub) => {
            const streams = await api.getStreams(hub.id);
            return [hub.id, streams.filter((stream) => stream.type === 0)] as const;
          }),
        );

        if (cancelled) return;
        setHubStreams(Object.fromEntries(streamResults));
      } catch (error) {
        if (cancelled) return;
        setLoadingError(error instanceof Error ? error.message : 'Could not load forward destinations');
      } finally {
        if (!cancelled) {
          setLoadingTargets(false);
        }
      }
    };

    void loadTargets();
    return () => {
      cancelled = true;
    };
  }, [conversations.length, hubs, loadConversations]);

  const channelTargets = useMemo(() => {
    const targets: StreamForwardTarget[] = [];

    for (const hub of hubs) {
      for (const stream of hubStreams[hub.id] ?? []) {
        targets.push({
          kind: 'stream',
          id: stream.id,
          title: `#${stream.name}`,
          subtitle: hub.name,
          hubId: hub.id,
        });
      }
    }

    return targets;
  }, [hubStreams, hubs]);

  const dmTargets = useMemo<ConversationForwardTarget[]>(() => {
    return conversations.map((conversation) => ({
      kind: 'conversation',
      id: conversation.id,
      title: getConversationTitle(conversation, currentUserId),
      subtitle: getConversationSubtitle(conversation, currentUserId),
      avatarUrl: getConversationAvatarUsers(conversation, currentUserId, 1)[0]?.avatar_url,
      initial: (getConversationTitle(conversation, currentUserId) || '?')[0]?.toUpperCase() ?? '?',
    }));
  }, [conversations, currentUserId]);

  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setSearchedUser(null);
      setSearchingUser(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingUser(true);
      try {
        const user = normalizeUser(await api.searchUser(normalizedQuery));
        if (cancelled) return;
        setSearchedUser(user.id === currentUserId ? null : user);
      } catch {
        if (!cancelled) {
          setSearchedUser(null);
        }
      } finally {
        if (!cancelled) {
          setSearchingUser(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentUserId, normalizedQuery]);

  const existingConversationForSearch = useMemo(() => {
    if (!searchedUser) return null;
    return conversations.find((conversation) => {
      const otherMembers = getConversationOtherMembers(conversation, currentUserId);
      return otherMembers.length === 1 && otherMembers[0]?.id === searchedUser.id;
    }) ?? null;
  }, [conversations, currentUserId, searchedUser]);

  const newDMTarget = useMemo<UserForwardTarget | null>(() => {
    if (!searchedUser || existingConversationForSearch) {
      return null;
    }

    return {
      kind: 'user',
      id: searchedUser.id,
      title: searchedUser.display_name || searchedUser.username,
      subtitle: `Start a new DM with @${searchedUser.username}`,
      avatarUrl: searchedUser.avatar_url,
      initial: (searchedUser.display_name || searchedUser.username || '?')[0]?.toUpperCase() ?? '?',
    };
  }, [existingConversationForSearch, searchedUser]);

  const filteredChannelTargets = useMemo(() => {
    if (!normalizedQuery) return channelTargets;
    return channelTargets.filter((target) => `${target.title} ${target.subtitle}`.toLowerCase().includes(normalizedQuery));
  }, [channelTargets, normalizedQuery]);

  const filteredDMTargets = useMemo(() => {
    if (!normalizedQuery) return dmTargets;
    return dmTargets.filter((target) => `${target.title} ${target.subtitle}`.toLowerCase().includes(normalizedQuery));
  }, [dmTargets, normalizedQuery]);

  const allTargets = useMemo(() => {
    return newDMTarget ? [...channelTargets, ...dmTargets, newDMTarget] : [...channelTargets, ...dmTargets];
  }, [channelTargets, dmTargets, newDMTarget]);

  const selectedTarget = useMemo(() => {
    if (!selectedKey) return null;
    return [...filteredChannelTargets, ...filteredDMTargets, ...(newDMTarget ? [newDMTarget] : [])].find((target) => `${target.kind}:${target.id}` === selectedKey)
      ?? allTargets.find((target) => `${target.kind}:${target.id}` === selectedKey)
      ?? null;
  }, [allTargets, filteredChannelTargets, filteredDMTargets, newDMTarget, selectedKey]);

  const previewText = getMessagePreview(message);

  const handleForward = async () => {
    if (!selectedTarget || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      let destination: { stream_id?: string; conversation_id?: string };
      if (selectedTarget.kind === 'stream') {
        destination = { stream_id: selectedTarget.id };
      } else if (selectedTarget.kind === 'conversation') {
        destination = { conversation_id: selectedTarget.id };
      } else {
        const conversation = normalizeConversation(await api.createOrOpenDM(selectedTarget.id));
        addConversation(conversation);
        destination = { conversation_id: conversation.id };
      }

      const forwarded = await api.forwardMessage(
        message.id,
        destination,
      );

      if (forwarded.stream_id) {
        useMessageStore.getState().addMessage(forwarded);
      } else {
        useDMStore.getState().addDMMessage(forwarded);
      }

      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not forward message');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={320} className="p-4 sm:p-6">
      <div className="w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-white/10 bg-[#111214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-white/6 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#f2f3f5]">Forward Message</h2>
          <p className="mt-1 text-sm text-[#949ba4]">Choose a channel or DM conversation to send this message to.</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-white/6 bg-[#17181c] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Message Preview</div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#dbdee1]">{previewText}</p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#2e3138] bg-[#17181c] px-3 text-[#949ba4] focus-within:border-[#5865f2] focus-within:text-[#f2f3f5]">
            <SearchIcon className="h-4 w-4 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search channels and DMs"
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-[#f2f3f5] outline-none placeholder:text-[#7b818e]"
            />
          </div>

          <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
            {loadingTargets ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-xl bg-[#17181c]" />
                ))}
              </div>
            ) : loadingError ? (
              <div className="rounded-xl border border-[#5c2b2e] bg-[#2a1719] px-3 py-3 text-sm text-[#ffb3b8]">{loadingError}</div>
            ) : (
              <>
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Channels</div>
                  <div className="space-y-2">
                    {filteredChannelTargets.length > 0 ? (
                      filteredChannelTargets.map((target) => (
                        <TargetRow
                          key={`stream:${target.id}`}
                          active={selectedKey === `stream:${target.id}`}
                          icon={<div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#232428] text-[#b5bac1]"><HashIcon className="h-4 w-4" /></div>}
                          title={target.title}
                          subtitle={target.subtitle}
                          onClick={() => setSelectedKey(`stream:${target.id}`)}
                        />
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1012] px-3 py-4 text-sm text-[#949ba4]">No matching channels.</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Direct Messages</div>
                  <div className="space-y-2">
                    {filteredDMTargets.length > 0 ? (
                      filteredDMTargets.map((target) => {
                        return (
                          <TargetRow
                            key={`conversation:${target.id}`}
                            active={selectedKey === `conversation:${target.id}`}
                            icon={<TargetAvatar avatarUrl={target.avatarUrl} label={target.title} />}
                            title={target.title}
                            subtitle={target.subtitle}
                            onClick={() => setSelectedKey(`conversation:${target.id}`)}
                          />
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1012] px-3 py-4 text-sm text-[#949ba4]">No matching conversations.</div>
                    )}
                  </div>
                </div>

                {normalizedQuery.length >= 2 ? (
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">Start New DM</div>
                    <div className="space-y-2">
                      {newDMTarget ? (
                        <TargetRow
                          key={`user:${newDMTarget.id}`}
                          active={selectedKey === `user:${newDMTarget.id}`}
                          icon={<TargetAvatar avatarUrl={newDMTarget.avatarUrl} label={newDMTarget.title} />}
                          title={newDMTarget.title}
                          subtitle={newDMTarget.subtitle}
                          onClick={() => setSelectedKey(`user:${newDMTarget.id}`)}
                        />
                      ) : searchingUser ? (
                        <div className="h-14 animate-pulse rounded-xl bg-[#17181c]" />
                      ) : existingConversationForSearch ? (
                        <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1012] px-3 py-4 text-sm text-[#949ba4]">
                          An existing DM with {existingConversationForSearch.recipient.display_name || existingConversationForSearch.recipient.username} already exists above.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1012] px-3 py-4 text-sm text-[#949ba4]">
                          Search for a username to start a new DM directly from here.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {submitError ? (
            <div className="rounded-xl border border-[#5c2b2e] bg-[#2a1719] px-3 py-3 text-sm text-[#ffb3b8]">{submitError}</div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/6 px-5 py-4">
          <div className="min-h-[20px] text-sm text-[#949ba4]">
            {selectedTarget ? `Forwarding to ${selectedTarget.title}` : 'Select a destination to continue'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-[#b5bac1] transition-colors hover:bg-[#232428] hover:text-[#f2f3f5]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleForward()}
              disabled={!selectedTarget || loadingTargets || submitting}
              className="rounded-md bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Forwarding...' : 'Forward'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}