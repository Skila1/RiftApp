import { useEffect, useMemo, useState } from 'react';

import { api } from '../../api/client';
import type { Conversation, Hub } from '../../types';
import { useAuthStore } from '../../stores/auth';
import { useHubStore } from '../../stores/hubStore';
import { getConversationTitle } from '../../utils/conversations';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import ModalOverlay from '../shared/ModalOverlay';

interface Props {
  conversation: Conversation;
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

function HubAvatar({ hub }: { hub: Hub }) {
  if (hub.icon_url) {
    return (
      <img
        src={publicAssetUrl(hub.icon_url)}
        alt=""
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-riftapp-accent/20 text-sm font-semibold text-riftapp-accent">
      {hub.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function InviteHubToConversationModal({ conversation, onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const hubs = useHubStore((s) => s.hubs);
  const loadHubs = useHubStore((s) => s.loadHubs);

  const [query, setQuery] = useState('');
  const [sendingHubId, setSendingHubId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hubs.length === 0) {
      void loadHubs();
    }
  }, [hubs.length, loadHubs]);

  const filteredHubs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return hubs
      .filter((hub) => {
        if (!normalizedQuery) {
          return true;
        }

        return hub.name.toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [hubs, query]);

  const handleInvite = async (hubId: string) => {
    if (sendingHubId) {
      return;
    }

    setSendingHubId(hubId);
    setError(null);
    try {
      const invite = await api.createInvite(hubId, { expires_in: 604800 });
      const inviteUrl = `${window.location.origin}/invite/${invite.code}`;
      await api.sendDMMessage(conversation.id, inviteUrl);
      onClose();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not send invite');
    } finally {
      setSendingHubId(null);
    }
  };

  return (
    <ModalOverlay isOpen onClose={sendingHubId ? () => {} : onClose} zIndex={360} className="p-4 sm:p-6">
      <div className="w-[min(92vw,460px)] overflow-hidden rounded-2xl border border-white/10 bg-[#111214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-white/6 px-5 py-4">
          <h2 className="text-lg font-semibold text-[#f2f3f5]">Invites</h2>
          <p className="mt-1 text-sm text-[#949ba4]">
            Send a server invite to {getConversationTitle(conversation, currentUserId)}.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex h-[36px] w-full min-w-0 items-center gap-1 rounded-[6px] bg-[#1e1f22] px-2 text-[#b5bac1] shadow-[0_1px_0_rgba(0,0,0,0.32)] transition-colors hover:bg-[#23252a] focus-within:bg-[#23252a]">
            <SearchIcon className="h-[14px] w-[14px] shrink-0 text-[#72767d]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search servers"
              className="min-w-0 flex-1 bg-transparent py-0 text-[13px] leading-5 text-[#dcddde] outline-none placeholder:text-[#72767d]"
              aria-label="Search servers"
            />
          </div>

          <div className="rounded-xl border border-white/6 bg-[#17181c]">
            <div className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#949ba4]">
              Your Servers
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {filteredHubs.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-[#949ba4]">
                  {hubs.length === 0 ? 'You do not have any servers to invite from yet.' : 'No matching servers found.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredHubs.map((hub) => {
                    const isSending = sendingHubId === hub.id;
                    return (
                      <button
                        key={hub.id}
                        type="button"
                        onClick={() => void handleInvite(hub.id)}
                        disabled={sendingHubId != null}
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-[#dbdee1] transition-colors hover:border-white/6 hover:bg-[#1c1d22] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <HubAvatar hub={hub} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-inherit">{hub.name}</div>
                          <div className="truncate text-xs text-[#949ba4]">Send a one-week invite link</div>
                        </div>
                        <span className="rounded-md bg-[#5865f2] px-3 py-1.5 text-xs font-semibold text-white">
                          {isSending ? 'Sending…' : 'Invite'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {error ? <div className="text-sm text-[#ed4245]">{error}</div> : null}
        </div>

        <div className="flex items-center justify-end border-t border-white/6 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={sendingHubId != null}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-[#dbdee1] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}