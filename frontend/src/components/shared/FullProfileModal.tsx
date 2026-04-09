import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { useDMStore } from '../../stores/dmStore';
import { useFriendStore } from '../../stores/friendStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { useAppSettingsStore } from '../../stores/appSettingsStore';
import { useHubStore } from '../../stores/hubStore';
import type { HubRole, RelationshipType, User } from '../../types';
import ModalCloseButton from './ModalCloseButton';
import BotBadge from './BotBadge';
import StatusDot, { statusLabel } from './StatusDot';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { normalizeUser } from '../../utils/entityAssets';
import { formatUserCreatedAt } from '../../utils/profileDates';

function nameColor(name: string): string {
  const colors = [
    '#f47067', '#e0823d', '#c4a000', '#57ab5a', '#39c5cf',
    '#6cb6ff', '#dcbdfb', '#f69d50', '#fc8dc7', '#b083f0',
  ];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function roleLabel(member: User | undefined, roles: HubRole[]): { label: string; color?: string } | null {
  if (!member) return null;
  if (member.rank_id) {
    const role = roles.find((entry) => entry.id === member.rank_id);
    if (role) return { label: role.name, color: role.color };
  }
  if (member.role === 'owner') return { label: 'Owner', color: '#f59e0b' };
  if (member.role === 'admin') return { label: 'Admin', color: '#ef4444' };
  if (member.role === 'member') return { label: 'Member' };
  return null;
}

export default function FullProfileModal() {
  const modalUser = useProfilePopoverStore((state) => state.modalUser);
  const closeModal = useProfilePopoverStore((state) => state.closeModal);
  const currentUser = useAuthStore((state) => state.user);
  const setCurrentUser = useAuthStore((state) => state.setUser);
  const developerMode = useAppSettingsStore((state) => state.developerMode);
  const openSettings = useAppSettingsStore((state) => state.openSettings);
  const liveStatus = usePresenceStore((state) => (modalUser ? state.presence[modalUser.id] : undefined));
  const mergeUser = usePresenceStore((state) => state.mergeUser);
  const activeHubId = useHubStore((state) => state.activeHubId);
  const hubMembers = usePresenceStore((state) => state.hubMembers);
  const openDM = useDMStore((state) => state.openDM);
  const navigate = useNavigate();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [relationship, setRelationship] = useState<RelationshipType>('none');
  const [relLoading, setRelLoading] = useState(false);
  const [roles, setRoles] = useState<HubRole[]>([]);

  useEffect(() => {
    if (!modalUser) return;
    setProfileUser(currentUser?.id === modalUser.id ? currentUser : modalUser);
    setRelationship('none');
    setRoles([]);

    api.getUser(modalUser.id).then((user) => {
      const normalized = normalizeUser(user);
      setProfileUser(normalized);
      mergeUser(normalized);
      if (currentUser?.id === normalized.id) {
        setCurrentUser(normalized);
      }
    }).catch(() => {});

    if (currentUser && modalUser.id !== currentUser.id) {
      api.getRelationship(modalUser.id).then((response) => setRelationship(response.relationship)).catch(() => {});
    }

    if (activeHubId) {
      api.getRoles(activeHubId).then((nextRoles) => setRoles(nextRoles)).catch(() => {});
    }
  }, [modalUser, currentUser, activeHubId, mergeUser, setCurrentUser]);

  useEffect(() => {
    if (!modalUser) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalUser, closeModal]);

  if (!modalUser) return null;

  const user = profileUser ?? modalUser;
  const isSelf = currentUser?.id === user.id;
  const status = liveStatus ?? user.status;
  const accent = nameColor(user.display_name || user.username);
  const hubMember = hubMembers[user.id] ?? (activeHubId ? undefined : user);
  const currentRole = roleLabel(hubMember, roles);

  const handleMessage = async () => {
    closeModal();
    await openDM(user.id);
    const conversationId = useDMStore.getState().activeConversationId;
    if (conversationId) navigate(`/app/dms/${conversationId}`);
  };

  const handleAddFriend = async () => {
    setRelLoading(true);
    try {
      await useFriendStore.getState().sendRequest(user.id);
      setRelationship('pending_outgoing');
    } catch {
      /* ignore */
    }
    setRelLoading(false);
  };

  const handleAccept = async () => {
    setRelLoading(true);
    try {
      await useFriendStore.getState().acceptRequest(user.id);
      setRelationship('friends');
    } catch {
      /* ignore */
    }
    setRelLoading(false);
  };

  const handleRemoveFriend = async () => {
    setRelLoading(true);
    try {
      await useFriendStore.getState().removeFriend(user.id);
      setRelationship('none');
    } catch {
      /* ignore */
    }
    setRelLoading(false);
  };

  const handleBlock = async () => {
    setRelLoading(true);
    try {
      await useFriendStore.getState().blockUser(user.id);
      setRelationship('blocked');
    } catch {
      /* ignore */
    }
    setRelLoading(false);
  };

  const handleUnblock = async () => {
    setRelLoading(true);
    try {
      await useFriendStore.getState().unblockUser(user.id);
      setRelationship('none');
    } catch {
      /* ignore */
    }
    setRelLoading(false);
  };

  return createPortal(
    <motion.div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="w-full max-w-[720px] rounded-2xl border border-riftapp-border/50 bg-riftapp-content-elevated shadow-modal overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="h-36 relative" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}99 100%)` }}>
          <ModalCloseButton onClick={closeModal} variant="overlay" className="absolute right-4 top-4" />
          <div className="absolute -bottom-14 left-8">
            <div className="relative w-28 h-28 rounded-full border-[6px] border-riftapp-content-elevated bg-black/20 overflow-hidden flex items-center justify-center">
              {user.avatar_url ? (
                <img src={publicAssetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-white">
                  {(user.display_name || user.username).slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute bottom-[6px] right-[6px] rounded-full border-[4px] border-riftapp-content-elevated bg-riftapp-content-elevated">
              <StatusDot userId={user.id} fallbackStatus={user.status} size="lg" />
            </div>
          </div>
        </div>

        <div className="px-8 pt-20 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[28px] font-black tracking-tight leading-none flex items-center gap-2">
                {user.display_name || user.username}
                {user.is_bot && <BotBadge className="text-[11px] px-1.5 py-0.5" />}
              </h2>
              <p className="mt-2 text-sm text-riftapp-text-dim">@{user.username}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-riftapp-border/50 bg-riftapp-panel/60 px-3 py-1 text-[12px] font-semibold text-riftapp-text-muted">
                  {statusLabel(status)}
                </span>
                {currentRole && (
                  <span
                    className="inline-flex items-center rounded-full border border-riftapp-border/50 px-3 py-1 text-[12px] font-semibold"
                    style={{ color: currentRole.color ?? '#dbdee1' }}
                  >
                    {currentRole.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              {isSelf ? (
                <button
                  type="button"
                  onClick={() => {
                    closeModal();
                    openSettings('profile');
                  }}
                  className="btn-primary"
                >
                  Edit Profile
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => void handleMessage()} className="btn-primary">
                    Message
                  </button>
                  {relationship === 'none' && (
                    <button type="button" onClick={() => void handleAddFriend()} disabled={relLoading} className="rounded-lg bg-riftapp-success/20 px-4 py-2 text-sm font-semibold text-riftapp-success hover:bg-riftapp-success/30 transition-colors">
                      {relLoading ? 'Sending...' : 'Add Friend'}
                    </button>
                  )}
                  {relationship === 'pending_incoming' && (
                    <button type="button" onClick={() => void handleAccept()} disabled={relLoading} className="rounded-lg bg-riftapp-success/20 px-4 py-2 text-sm font-semibold text-riftapp-success hover:bg-riftapp-success/30 transition-colors">
                      {relLoading ? 'Accepting...' : 'Accept Request'}
                    </button>
                  )}
                  {relationship === 'pending_outgoing' && (
                    <button type="button" disabled className="rounded-lg border border-riftapp-border/40 px-4 py-2 text-sm font-semibold text-riftapp-text-dim">
                      Request Pending
                    </button>
                  )}
                  {relationship === 'friends' && (
                    <button type="button" onClick={() => void handleRemoveFriend()} disabled={relLoading} className="rounded-lg bg-riftapp-danger/10 px-4 py-2 text-sm font-semibold text-riftapp-danger hover:bg-riftapp-danger/20 transition-colors">
                      {relLoading ? 'Removing...' : 'Remove Friend'}
                    </button>
                  )}
                  {relationship === 'blocked' ? (
                    <button type="button" onClick={() => void handleUnblock()} disabled={relLoading} className="rounded-lg border border-riftapp-border/40 px-4 py-2 text-sm font-semibold text-riftapp-text-muted hover:text-riftapp-text hover:bg-riftapp-panel/60 transition-colors">
                      {relLoading ? 'Unblocking...' : 'Unblock'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void handleBlock()} disabled={relLoading} className="rounded-lg px-4 py-2 text-sm font-semibold text-riftapp-danger hover:bg-riftapp-danger/10 transition-colors">
                      {relLoading ? 'Blocking...' : 'Block'}
                    </button>
                  )}
                </>
              )}
              {developerMode && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(user.id)}
                  className="rounded-lg border border-riftapp-border/40 px-4 py-2 text-sm font-semibold text-riftapp-text-muted hover:text-riftapp-text hover:bg-riftapp-panel/60 transition-colors"
                >
                  Copy User ID
                </button>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-riftapp-text-dim mb-2">About Me</h3>
              <p className="text-sm text-riftapp-text-muted leading-relaxed min-h-[48px]">
                {user.bio?.trim() ? user.bio : 'No bio set.'}
              </p>
            </section>
            <section className="rounded-xl border border-riftapp-border/40 bg-riftapp-panel/40 p-4 space-y-3">
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-riftapp-text-dim mb-1">Member Since</h3>
                <p className="text-sm text-riftapp-text">{formatUserCreatedAt(user)}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-riftapp-text-dim mb-1">Username</h3>
                <p className="text-sm text-riftapp-text">@{user.username}</p>
              </div>
              {currentRole && (
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-riftapp-text-dim mb-1">Current Hub Role</h3>
                  <p className="text-sm" style={{ color: currentRole.color ?? '#dbdee1' }}>{currentRole.label}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}