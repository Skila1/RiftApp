import { useState, useEffect, useRef, useCallback, useMemo, memo, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useHubStore } from '../../stores/hubStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { useFriendStore } from '../../stores/friendStore';
import { useProfilePopoverStore } from '../../stores/profilePopoverStore';
import { api } from '../../api/client';
import ConfirmModal from '../modals/ConfirmModal';
import { MenuOverlay, menuDivider } from '../context-menus/MenuOverlay';
import ModalOverlay from '../shared/ModalOverlay';
import StatusDot from '../shared/StatusDot';
import type { Hub, User, HubEmoji, HubSticker, HubSound, HubRole, HubInvite, RelationshipType } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { normalizeUser, normalizeUsers } from '../../utils/entityAssets';
import {
  hasPermission,
  PermViewStreams,
  PermSendMessages,
  PermManageMessages,
  PermManageStreams,
  PermManageHub,
  PermManageRanks,
  PermKickMembers,
  PermBanMembers,
  PermConnectVoice,
  PermSpeakVoice,
  PermUseSoundboard,
  PermAdministrator,
} from '../../utils/permissions';
import { CloseButtonEsc, ToggleRow } from './hubSettingsUi';
import {
  ServerTagPanel,
  EngagementPanel,
  BoostPerksPanel,
  EmojiPanelShell,
  StickersPanelShell,
  SoundboardPanelShell,
  AccessPanel,
  IntegrationsPanel,
  SafetySetupPanel,
  AuditLogPanel,
  BansPanel,
  AutoModPanel,
  EnableCommunityPanel,
  ServerTemplatePanel,
  AppDirectoryLinkPanel,
} from './hubSettingsPanels';

type SettingsPage =
  | 'server-profile'
  | 'server-tag'
  | 'engagement'
  | 'boost-perks'
  | 'emoji'
  | 'stickers'
  | 'soundboard'
  | 'members'
  | 'roles'
  | 'invites'
  | 'access'
  | 'integrations'
  | 'app-directory'
  | 'safety'
  | 'audit-log'
  | 'bans'
  | 'automod'
  | 'enable-community'
  | 'server-template'
  | 'delete-server';

interface NavSection {
  label: string;
  items: { id: SettingsPage; label: string; external?: boolean }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: '',
    items: [
      { id: 'server-profile', label: 'Server Profile' },
      { id: 'server-tag', label: 'Server Tag' },
      { id: 'engagement', label: 'Engagement' },
      { id: 'boost-perks', label: 'Boost Perks' },
    ],
  },
  {
    label: 'EXPRESSION',
    items: [
      { id: 'emoji', label: 'Emoji' },
      { id: 'stickers', label: 'Stickers' },
      { id: 'soundboard', label: 'Soundboard' },
    ],
  },
  {
    label: 'PEOPLE',
    items: [
      { id: 'members', label: 'Members' },
      { id: 'roles', label: 'Roles' },
      { id: 'invites', label: 'Invites' },
      { id: 'access', label: 'Access' },
    ],
  },
  {
    label: 'APPS',
    items: [
      { id: 'integrations', label: 'Integrations' },
      { id: 'app-directory', label: 'App Directory', external: true },
    ],
  },
  {
    label: 'MODERATION',
    items: [
      { id: 'safety', label: 'Safety Setup' },
      { id: 'audit-log', label: 'Audit Log' },
      { id: 'bans', label: 'Bans' },
      { id: 'automod', label: 'AutoMod' },
    ],
  },
];

const FOOTER_NAV: { id: SettingsPage; label: string; danger?: boolean }[] = [
  { id: 'enable-community', label: 'Enable Community' },
  { id: 'server-template', label: 'Server Template' },
  { id: 'delete-server', label: 'Delete Server', danger: true },
];

function HubSettingsModal({ hub, onClose }: { hub: Hub; onClose: () => void }) {
  const [page, setPage] = useState<SettingsPage>('server-profile');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => modalRef.current?.focus());
  }, []);

  const currentUser = useAuthStore((s) => s.user);
  const isOwner = currentUser?.id === hub.owner_id;

  const renderContent = () => {
    switch (page) {
      case 'server-profile':
        return <OverviewTab hub={hub} isOwner={isOwner} />;
      case 'server-tag':
        return <ServerTagPanel />;
      case 'engagement':
        return <EngagementPanel />;
      case 'boost-perks':
        return <BoostPerksPanel />;
      case 'emoji':
        return (
          <EmojiPanelShell>
            <CustomizationTab hub={hub} isOwner={isOwner} kind="emojis" discordLayout />
          </EmojiPanelShell>
        );
      case 'stickers':
        return (
          <StickersPanelShell>
            <CustomizationTab hub={hub} isOwner={isOwner} kind="stickers" discordLayout />
          </StickersPanelShell>
        );
      case 'soundboard':
        return (
          <SoundboardPanelShell>
            <CustomizationTab hub={hub} isOwner={isOwner} kind="sounds" discordLayout />
          </SoundboardPanelShell>
        );
      case 'members':
        return <MembersDiscordTab hub={hub} />;
      case 'roles':
        return <RolesTab hub={hub} />;
      case 'invites':
        return <InvitesTab hub={hub} currentUser={currentUser} />;
      case 'access':
        return <AccessPanel />;
      case 'integrations':
        return <IntegrationsPanel />;
      case 'app-directory':
        return <AppDirectoryLinkPanel />;
      case 'safety':
        return <SafetySetupPanel />;
      case 'audit-log':
        return <AuditLogPanel />;
      case 'bans':
        return <BansPanel />;
      case 'automod':
        return <AutoModPanel />;
      case 'enable-community':
        return <EnableCommunityPanel />;
      case 'server-template':
        return <ServerTemplatePanel />;
      case 'delete-server':
        return <DeleteServerTab hub={hub} isOwner={isOwner} onCloseSettings={onClose} />;
      default:
        return null;
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300} center className="p-3 sm:p-6">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-[#1e1f22] rounded-none sm:rounded-lg w-[min(1200px,calc(100vw-24px))] h-[min(92vh,900px)] flex shadow-2xl overflow-hidden outline-none border border-[#1e1f22]"
      >
        <nav className="w-[min(240px,32vw)] min-w-[200px] bg-[#2b2d31] flex flex-col flex-shrink-0 overflow-y-auto border-r border-black/20">
          <div className="px-3 pt-4 pb-3">
            <p className="px-2 text-[15px] font-semibold text-white truncate">{hub.name}</p>
          </div>
          <div className="flex-1 px-2 pb-2 space-y-3">
            {NAV_SECTIONS.map((section, si) => (
              <div key={si}>
                {section.label ? (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] px-2.5 mb-1">{section.label}</p>
                ) : null}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.external) {
                          window.open('https://discord.com/application-directory', '_blank', 'noopener,noreferrer');
                          return;
                        }
                        setPage(item.id);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-[7px] rounded-[4px] text-[14px] text-left transition-colors ${
                        page === item.id
                          ? 'bg-[#404249] text-white font-medium'
                          : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#35373c]'
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.external && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-70">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="h-px bg-[#3f4147] mx-1 my-2" />
            <div className="space-y-0.5">
              {FOOTER_NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-[4px] text-[14px] text-left transition-colors ${
                    page === item.id
                      ? 'bg-[#404249] text-white font-medium'
                      : item.danger
                        ? 'text-[#ed4245] hover:bg-[#35373c]'
                        : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#35373c]'
                  }`}
                >
                  {item.label}
                  {item.danger && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1f22] relative">
          <div className="absolute top-3 right-4 z-10">
            <CloseButtonEsc onClose={onClose} />
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 sm:px-10 py-6 pt-14 overscroll-contain">{renderContent()}</div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ═══════════════════════════════════════════════════
   Overview Tab
   ═══════════════════════════════════════════════════ */

function OverviewTab({ hub, isOwner }: { hub: Hub; isOwner: boolean }) {
  const updateHub = useHubStore((s) => s.updateHub);

  const [name, setName] = useState(hub.name);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(hub.icon_url ? publicAssetUrl(hub.icon_url) : null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(hub.banner_url ? publicAssetUrl(hub.banner_url) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [iconDragOver, setIconDragOver] = useState(false);
  const [bannerDragOver, setBannerDragOver] = useState(false);

  useEffect(() => {
    setName(hub.name);
    setIconPreview(hub.icon_url ? publicAssetUrl(hub.icon_url) : null);
    setBannerPreview(hub.banner_url ? publicAssetUrl(hub.banner_url) : null);
    setIconFile(null);
    setBannerFile(null);
  }, [hub.name, hub.icon_url, hub.banner_url]);

  const dirty = name !== hub.name || iconFile !== null || bannerFile !== null;

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };

  const handleRemoveIcon = () => {
    setIconFile(null);
    setIconPreview(null);
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const patch: Record<string, string> = {};

      if (name !== hub.name) patch.name = name;

      // Upload icon if changed
      if (iconFile) {
        const att = await api.uploadFile(iconFile);
        patch.icon_url = att.url;
      } else if (!iconPreview && hub.icon_url) {
        patch.icon_url = '';
      }

      // Upload banner if changed
      if (bannerFile) {
        const att = await api.uploadFile(bannerFile);
        patch.banner_url = att.url;
      } else if (!bannerPreview && hub.banner_url) {
        patch.banner_url = '';
      }

      if (Object.keys(patch).length > 0) {
        await updateHub(hub.id, patch);
      }

      setSuccess(true);
      setIconFile(null);
      setBannerFile(null);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <h1 className="text-[20px] font-bold text-white">Server Profile</h1>
        {/* Read-only banner */}
        <div className="rounded-xl overflow-hidden bg-[#2b2d31] border border-[#1e1f22]">
          {bannerPreview ? (
            <img src={bannerPreview} alt="" className="w-full h-[140px] object-cover" />
          ) : (
            <div className="w-full h-[140px] bg-gradient-to-br from-[#5865f2] to-[#eb459e]" />
          )}
          <div className="p-4 flex items-center gap-4 -mt-8">
            <div className="w-16 h-16 rounded-2xl border-4 border-[#2b2d31] overflow-hidden bg-[#313338] flex-shrink-0">
              {iconPreview ? (
                <img src={iconPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#5865f2] flex items-center justify-center text-lg font-bold text-white">
                  {name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="pt-6">
              <p className="text-[16px] font-bold text-white">{name}</p>
              <p className="text-[12px] text-[#949ba4]">Created {new Date(hub.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-[#2b2d31] rounded-lg p-4 border border-[#1e1f22]">
          <p className="text-[13px] text-[#949ba4]">
            Only the server owner can edit settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <h1 className="text-[20px] font-bold text-white">Server Profile</h1>
      {/* ── Banner Section ── */}
      <div>
        <label className="text-[12px] font-bold uppercase tracking-wider text-[#b5bac1] mb-2 block">
          Server Banner
        </label>
        <div
          className={`relative rounded-xl overflow-hidden cursor-pointer group ${bannerDragOver ? 'ring-2 ring-[#5865f2]' : ''}`}
          onClick={() => bannerInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setBannerDragOver(true); }}
          onDragLeave={() => setBannerDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setBannerDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) {
              setBannerFile(file);
              setBannerPreview(URL.createObjectURL(file));
            }
          }}
        >
          {bannerPreview ? (
            <img src={bannerPreview} alt="" className="w-full h-[160px] object-cover" />
          ) : (
            <div className="w-full h-[160px] bg-gradient-to-br from-[#5865f2] to-[#eb459e]" />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
            <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-3 py-1.5 rounded-md">
              Change Banner
            </span>
          </div>
        </div>
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerSelect} />
        {bannerPreview && (
          <button
            onClick={handleRemoveBanner}
            className="text-[12px] text-[#f23f42] hover:underline mt-1.5"
          >
            Remove Banner
          </button>
        )}
      </div>

      {/* ── Icon + Name Row ── */}
      <div className="flex gap-6 items-start">
        {/* Icon */}
        <div className="flex-shrink-0">
          <label className="text-[12px] font-bold uppercase tracking-wider text-[#b5bac1] mb-2 block">
            Server Icon
          </label>
          <div className="relative group">
            <div
              className={`w-24 h-24 rounded-2xl overflow-hidden cursor-pointer bg-[#2b2d31] border-2 border-dashed transition-colors ${
                iconDragOver ? 'border-[#5865f2] bg-[#5865f2]/10' : 'border-[#4e5058] hover:border-[#5865f2]'
              }`}
              onClick={() => iconInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIconDragOver(true); }}
              onDragLeave={() => setIconDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIconDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file?.type.startsWith('image/')) {
                  setIconFile(file);
                  setIconPreview(URL.createObjectURL(file));
                }
              }}
            >
              {iconPreview ? (
                <img src={iconPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#949ba4]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <span className="text-[10px] mt-1 font-medium">Upload</span>
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <span className="text-white text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Change
                </span>
              </div>
            </div>
          </div>
          <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconSelect} />
          <p className="text-[11px] text-[#949ba4] mt-1.5">Min. 512×512</p>
          {iconPreview && (
            <button onClick={handleRemoveIcon} className="text-[11px] text-[#f23f42] hover:underline mt-0.5">
              Remove
            </button>
          )}
        </div>

        {/* Name + info */}
        <div className="flex-1 space-y-4">
          <div>
            <label className="text-[12px] font-bold uppercase tracking-wider text-[#b5bac1] mb-2 block">
              Server Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2.5 rounded-[4px] bg-[#1e1f22] text-[15px] text-white border-none
                focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div className="bg-[#2b2d31] rounded-lg p-3 border border-[#1e1f22]">
              <p className="text-[11px] text-[#949ba4] uppercase tracking-wide mb-0.5">Created</p>
              <p className="text-[#dbdee1]">{new Date(hub.created_at).toLocaleDateString()}</p>
            </div>
            <div className="bg-[#2b2d31] rounded-lg p-3 border border-[#1e1f22]">
              <p className="text-[11px] text-[#949ba4] uppercase tracking-wide mb-0.5">Owner</p>
              <p className="text-[#dbdee1]">You</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feedback ── */}
      {error && (
        <div className="flex items-center gap-2 text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-lg px-4 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-[13px] text-[#23a559] bg-[#23a559]/10 rounded-lg px-4 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          Server updated!
        </div>
      )}

      {/* ── Save Button ── */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            setName(hub.name);
            setIconPreview(hub.icon_url ? publicAssetUrl(hub.icon_url) : null);
            setBannerPreview(hub.banner_url ? publicAssetUrl(hub.banner_url) : null);
            setIconFile(null);
            setBannerFile(null);
            setError(null);
          }}
          className="px-4 py-2.5 rounded-[4px] text-[13px] font-medium text-[#b5bac1] hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
          className="px-5 py-2.5 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium
            hover:bg-[#4752c4] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function DeleteServerTab({ hub, isOwner, onCloseSettings }: { hub: Hub; isOwner: boolean; onCloseSettings: () => void }) {
  const navigate = useNavigate();
  const deleteHub = useHubStore((s) => s.deleteHub);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteNameMatches = deleteConfirmName.trim() === hub.name.trim() && hub.name.trim().length > 0;

  const handleDeleteServer = async () => {
    if (!deleteNameMatches) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteHub(hub.id);
      onCloseSettings();
      const nextHubId = useHubStore.getState().activeHubId;
      if (nextHubId) {
        navigate(`/app/hubs/${nextHubId}`, { replace: true });
      } else {
        navigate('/app', { replace: true });
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete server');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="max-w-xl">
        <h1 className="text-[20px] font-bold text-white mb-2">Delete Server</h1>
        <p className="text-[13px] text-[#b5bac1]">Only the server owner can delete this server.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-[20px] font-bold text-white">Delete Server</h1>
      <p className="text-[13px] text-[#b5bac1] leading-relaxed">
        Deleting <span className="text-white font-medium">{hub.name}</span> removes all channels, messages, and invites permanently. This cannot be undone.
      </p>
      <div className="rounded-lg border border-[#f23f42]/35 bg-[#f23f42]/08 p-4">
        <button
          type="button"
          onClick={() => {
            setDeleteOpen(true);
            setDeleteConfirmName('');
            setDeleteError(null);
          }}
          className="px-4 py-2 rounded-[4px] text-[13px] font-medium border border-[#ed4245] text-[#ed4245] hover:bg-[#ed4245] hover:text-white transition-colors"
        >
          Delete Server
        </button>
      </div>
      <ConfirmModal
        isOpen={deleteOpen}
        title={`Delete '${hub.name}'`}
        description="This will permanently delete the server for everyone. Type the server name below to confirm."
        confirmText="Delete Server"
        variant="danger"
        onConfirm={handleDeleteServer}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteConfirmName('');
          setDeleteError(null);
        }}
        loading={deleteBusy}
        confirmDisabled={!deleteNameMatches}
      >
        <label className="text-[12px] font-bold uppercase tracking-wider text-[#b5bac1] mb-1.5 block">
          Server Name
        </label>
        <input
          value={deleteConfirmName}
          onChange={(e) => setDeleteConfirmName(e.target.value)}
          autoComplete="off"
          placeholder={hub.name}
          className="w-full px-3 py-2.5 rounded-[4px] bg-[#1e1f22] text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
        />
        {deleteError && (
          <p className="text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-md px-3 py-2 mt-3">{deleteError}</p>
        )}
      </ConfirmModal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Members (Discord-style table)
   ═══════════════════════════════════════════════════ */

const MEMBER_TABLE_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

type MemberOverlayState = {
  memberId: string;
  x: number;
  y: number;
};

const MIN_VALID_MEMBER_YEAR = 1900;

function isUsableMemberDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= MIN_VALID_MEMBER_YEAR;
}

function formatMemberTableDate(value: string | null | undefined): string {
  if (!isUsableMemberDate(value)) return 'Unknown';
  return new Date(value as string).toLocaleDateString(undefined, MEMBER_TABLE_DATE_FORMAT);
}

function formatMemberSinceDate(member: Pick<User, 'joined_at' | 'created_at'>): string {
  if (isUsableMemberDate(member.joined_at)) {
    return formatMemberTableDate(member.joined_at);
  }
  return formatMemberTableDate(member.created_at);
}

function DarkCheckboxMark({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${
        checked
          ? 'border-[#7d84f7] bg-[#7d84f7] text-white'
          : disabled
            ? 'border-[#3d4048] bg-[#17181c] text-transparent'
            : 'border-[#565b66] bg-[#17181c] text-transparent'
      }`}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

function DarkCheckbox({
  checked,
  onToggle,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#7d84f7]/60 focus:ring-offset-2 focus:ring-offset-[#23262d] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <DarkCheckboxMark checked={checked} disabled={disabled} />
    </button>
  );
}

function MemberActionRow({
  label,
  onClick,
  disabled = false,
  danger = false,
  trailing,
}: {
  label: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2 text-left text-[14px] font-medium transition-colors ${
        disabled
          ? danger
            ? 'cursor-not-allowed text-[#9c6469]'
            : 'cursor-not-allowed text-[#6f737c]'
          : danger
            ? 'text-[#f28b82] hover:bg-[#3a2d31]'
            : 'text-[#f2f3f5] hover:bg-[#35373c]'
      }`}
    >
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  );
}

function MemberOverflowMenu({
  member,
  relationship,
  x,
  y,
  canManageRanks,
  onClose,
  onOpenProfile,
  onMessage,
  onToggleBlock,
  onOpenRolePicker,
}: {
  member: User | null;
  relationship: RelationshipType;
  x: number;
  y: number;
  canManageRanks: boolean;
  onClose: () => void;
  onOpenProfile: (member: User) => void;
  onMessage: (member: User) => void;
  onToggleBlock: (member: User) => void;
  onOpenRolePicker: (member: User, rect: DOMRect) => void;
}) {
  if (!member) return null;

  return (
    <MenuOverlay x={x} y={y} onClose={onClose} zIndex={360}>
      <div className="min-w-[188px] rounded-[8px] border border-[#1f2124] bg-[#2b2d31] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]" onContextMenu={(event) => event.preventDefault()}>
        <div className="px-1">
          <MemberActionRow label="Profile" onClick={() => onOpenProfile(member)} />
          <MemberActionRow label="Message" onClick={() => onMessage(member)} />
        </div>

        {menuDivider()}

        <div className="px-1">
          <MemberActionRow label="Change Nickname" disabled />
          <MemberActionRow label="Ignore" disabled />
          <MemberActionRow label={relationship === 'blocked' ? 'Unblock' : 'Block'} danger={relationship !== 'blocked'} onClick={() => onToggleBlock(member)} />
        </div>

        {menuDivider()}

        <div className="px-1">
          <MemberActionRow
            label="Role"
            disabled={!canManageRanks}
            trailing={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-80">
                <path d="M9 6l6 6-6 6" />
              </svg>
            }
            onClick={(event) => onOpenRolePicker(member, event.currentTarget.getBoundingClientRect())}
          />
          <MemberActionRow label="Open in Mod View" disabled />
        </div>

        {menuDivider()}

        <div className="px-1">
          <MemberActionRow label={`Timeout ${member.username}`} danger disabled />
          <MemberActionRow label={`Kick ${member.username}`} danger disabled />
          <MemberActionRow label={`Ban ${member.username}`} danger disabled />
        </div>

        {menuDivider()}

        <div className="px-1">
          <MemberActionRow
            label="Copy User ID"
            onClick={() => {
              void navigator.clipboard.writeText(member.id);
              onClose();
            }}
            trailing={<span className="rounded-[4px] bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c9ccd3]">ID</span>}
          />
        </div>
      </div>
    </MenuOverlay>
  );
}

function MemberRolePickerMenu({
  member,
  roles,
  busy,
  x,
  y,
  onClose,
  onToggleRole,
}: {
  member: User | null;
  roles: HubRole[];
  busy: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onToggleRole: (member: User, nextRoleId: string) => void;
}) {
  if (!member) return null;

  return (
    <MenuOverlay x={x} y={y} onClose={onClose} zIndex={360}>
      <div className="min-w-[168px] rounded-[8px] border border-[#1f2124] bg-[#2b2d31] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]" onContextMenu={(event) => event.preventDefault()}>
        {roles.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-[#8f96a3]">No custom roles available.</div>
        ) : (
          roles.map((role) => {
            const checked = member.rank_id === role.id;
            return (
              <button
                key={role.id}
                type="button"
                disabled={busy}
                onClick={() => onToggleRole(member, checked ? '' : role.id)}
                className={`flex w-full items-center gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors ${checked ? 'bg-[#35373c]' : 'hover:bg-[#35373c]'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#f2f3f5]">{role.name}</span>
                <DarkCheckboxMark checked={checked} disabled={busy} />
              </button>
            );
          })
        )}
      </div>
    </MenuOverlay>
  );
}

function MembersDiscordTab({ hub }: { hub: Hub }) {
  const [showInList, setShowInList] = useState(true);
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<HubRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'joined'>('name');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<Record<string, RelationshipType>>({});
  const [rolePickerMenu, setRolePickerMenu] = useState<MemberOverlayState | null>(null);
  const [memberMenu, setMemberMenu] = useState<MemberOverlayState | null>(null);
  const pageSize = 10;
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const currentUser = useAuthStore((s) => s.user);
  const openProfileModal = useProfilePopoverStore((s) => s.openModal);
  const hubPermissions = useHubStore((s) => s.hubPermissions[hub.id]);
  const canManageRanks = hasPermission(hubPermissions, PermManageRanks);

  const hydrateMembers = useCallback(async (memberData: User[]) => {
    const normalizedMembers = normalizeUsers(memberData);
    const missingCreatedAt = normalizedMembers.filter((member) => !isUsableMemberDate(member.created_at));

    if (missingCreatedAt.length === 0) {
      return normalizedMembers;
    }

    const resolvedUsers = await Promise.all(
      missingCreatedAt.map(async (member) => {
        try {
          return normalizeUser(await api.getUser(member.id));
        } catch {
          return null;
        }
      }),
    );

    const canonicalById = new Map(
      resolvedUsers.filter((user): user is User => user !== null).map((user) => [user.id, user]),
    );

    return normalizedMembers.map((member) => {
      const canonical = canonicalById.get(member.id);
      return canonical
        ? { ...member, ...canonical, role: member.role, rank_id: member.rank_id, joined_at: member.joined_at }
        : member;
    });
  }, []);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name)),
    [roles],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getHubMembers(hub.id), api.getRoles(hub.id)])
      .then(async ([memberData, roleData]) => {
        const hydratedMembers = await hydrateMembers(memberData);
        if (!cancelled) setMembers(hydratedMembers);
        if (!cancelled) setRoles(roleData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load members');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [hub.id, hydrateMembers]);

  useEffect(() => {
    if (rolePickerMenu && !members.some((member) => member.id === rolePickerMenu.memberId)) {
      setRolePickerMenu(null);
    }
    if (memberMenu && !members.some((member) => member.id === memberMenu.memberId)) {
      setMemberMenu(null);
    }
  }, [memberMenu, members, rolePickerMenu]);

  const refreshMembers = useCallback(async () => {
    const memberData = await api.getHubMembers(hub.id);
    setMembers(await hydrateMembers(memberData));
  }, [hub.id, hydrateMembers]);

  const handleRoleAssign = useCallback(async (member: User, nextRoleId: string) => {
    if (!canManageRanks || member.id === hub.owner_id) return;
    setAssigningUserId(member.id);
    try {
      if (nextRoleId) await api.assignRole(hub.id, member.id, nextRoleId);
      else await api.removeRole(hub.id, member.id);
      await refreshMembers();
      setRolePickerMenu(null);
      setMemberMenu(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setAssigningUserId(null);
    }
  }, [canManageRanks, hub.id, hub.owner_id, refreshMembers]);

  const handleMessage = useCallback(async (member: User) => {
    try {
      const conv = await api.createOrOpenDM(member.id);
      await loadConversations();
      await setActiveConversation(conv.id);
      setMemberMenu(null);
    } catch { /* noop */ }
  }, [loadConversations, setActiveConversation]);

  const handlePrimaryFriendAction = useCallback(async (member: User) => {
    const relationship = relationships[member.id] ?? 'none';
    try {
      if (relationship === 'none') {
        await useFriendStore.getState().sendRequest(member.id);
        setRelationships((prev) => ({ ...prev, [member.id]: 'pending_outgoing' }));
      } else if (relationship === 'pending_incoming') {
        await useFriendStore.getState().acceptRequest(member.id);
        setRelationships((prev) => ({ ...prev, [member.id]: 'friends' }));
      }
    } catch {
      setError('Failed to update friendship');
    }
  }, [relationships]);

  const handleToggleBlock = useCallback(async (member: User) => {
    const relationship = relationships[member.id] ?? 'none';
    try {
      if (relationship === 'blocked') {
        await useFriendStore.getState().unblockUser(member.id);
        setRelationships((prev) => ({ ...prev, [member.id]: 'none' }));
      } else {
        await useFriendStore.getState().blockUser(member.id);
        setRelationships((prev) => ({ ...prev, [member.id]: 'blocked' }));
      }
      setMemberMenu(null);
    } catch {
      setError('Failed to update block status');
    }
  }, [relationships]);

  const openRolePicker = useCallback((member: User, rect: DOMRect) => {
    setRolePickerMenu({
      memberId: member.id,
      x: Math.round(rect.right + 6),
      y: Math.round(rect.top - 4),
    });
    setMemberMenu(null);
  }, []);

  const openMemberMenu = useCallback((member: User, rect: DOMRect) => {
    setMemberMenu({
      memberId: member.id,
      x: Math.round(rect.left - 140),
      y: Math.round(rect.bottom + 6),
    });
  }, []);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.display_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'name') {
      return a.display_name.localeCompare(b.display_name);
    }
    return new Date(b.joined_at ?? b.created_at).getTime() - new Date(a.joined_at ?? a.created_at).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const rolePickerMember = members.find((member) => member.id === rolePickerMenu?.memberId) ?? null;
  const memberMenuMember = members.find((member) => member.id === memberMenu?.memberId) ?? null;

  useEffect(() => {
    const unresolved = slice
      .filter((member) => member.id !== currentUser?.id && relationships[member.id] == null)
      .map((member) => member.id);

    if (unresolved.length === 0) return;

    let cancelled = false;
    Promise.all(
      unresolved.map(async (memberId) => {
        try {
          const response = await api.getRelationship(memberId);
          return [memberId, response.relationship] as const;
        } catch {
          return [memberId, 'none' as const] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setRelationships((prev) => {
        const next = { ...prev };
        entries.forEach(([memberId, relationship]) => {
          next[memberId] = relationship;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, relationships, slice]);

  const toggleAllPage = () => {
    const ids = slice.map((m) => m.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-[#2b2d31] rounded animate-pulse" />
        <div className="h-64 bg-[#2b2d31] rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return <div className="text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-lg px-4 py-3">{error}</div>;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-[20px] font-bold text-white">Server Members</h1>
      <ToggleRow
        label="Show Members in Channel List"
        description="Display members separately in the channel list."
        checked={showInList}
        onChange={setShowInList}
      />
      <div className="overflow-hidden rounded-2xl border border-[#17181b] bg-[#23262d] shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-white">Recent Members</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#949ba4]">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search"
                className="w-40 rounded-[10px] border border-[#363942] bg-[#17181c] py-1.5 pl-8 pr-3 text-[13px] text-white placeholder-[#949ba4] focus:outline-none focus:ring-1 focus:ring-[#5865f2] sm:w-52"
              />
            </div>
            <button
              type="button"
              onClick={() => setSortKey((k) => (k === 'name' ? 'joined' : 'name'))}
              className="rounded-[10px] border border-[#363942] bg-[#17181c] px-3 py-1.5 text-[12px] text-[#dbdee1] transition-colors hover:bg-[#202229]"
            >
              Sort: {sortKey === 'name' ? 'Name' : 'Joined'}
            </button>
            <button type="button" className="rounded-[10px] px-3 py-1.5 text-[12px] font-medium text-[#ed4245] transition-colors hover:bg-[#ed4245]/10">
              Prune
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12px]">
            <thead className="border-b border-white/5 text-[#8f96a3] uppercase tracking-wide">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <DarkCheckbox
                    checked={slice.length > 0 && slice.every((member) => selected.has(member.id))}
                    onToggle={toggleAllPage}
                    ariaLabel="Select all members on this page"
                  />
                </th>
                <th className="px-2 py-2.5 font-semibold">Name</th>
                <th className="px-2 py-2.5 font-semibold">Member Since</th>
                <th className="px-2 py-2.5 font-semibold">Joined Rift</th>
                <th className="px-2 py-2.5 font-semibold">Join Method</th>
                <th className="px-2 py-2.5 font-semibold">Roles</th>
                <th className="px-2 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-[#8f96a3]">
                    No members match your current filters.
                  </td>
                </tr>
              ) : (
                slice.map((member) => {
                  const role = member.rank_id ? roles.find((entry) => entry.id === member.rank_id) : undefined;
                  const canEditRoles = canManageRanks && member.id !== hub.owner_id;
                  const relationship = relationships[member.id] ?? 'none';
                  const friendButtonLabel = relationship === 'pending_incoming'
                    ? 'Accept'
                    : relationship === 'pending_outgoing'
                      ? 'Pending'
                      : relationship === 'friends'
                        ? 'Friends'
                        : relationship === 'blocked'
                          ? 'Blocked'
                          : 'Add Friend';
                  const friendButtonDisabled = member.id === currentUser?.id || relationship === 'pending_outgoing' || relationship === 'friends' || relationship === 'blocked';

                  return (
                    <tr key={member.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                      <td className="px-3 py-2 align-middle">
                        <DarkCheckbox
                          checked={selected.has(member.id)}
                          onToggle={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(member.id)) next.delete(member.id);
                              else next.add(member.id);
                              return next;
                            });
                          }}
                          ariaLabel={`Select ${member.display_name}`}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative shrink-0">
                            {member.avatar_url ? (
                              <img src={publicAssetUrl(member.avatar_url)} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-[10px] font-bold text-white">
                                {member.display_name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <StatusDot userId={member.id} fallbackStatus={member.status} size="sm" className="absolute -bottom-0.5 -right-0.5 border-2 border-[#23262d]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] text-white font-medium truncate">{member.display_name}</p>
                            <p className="text-[11px] text-[#949ba4] truncate">@{member.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-[#b5bac1] whitespace-nowrap">{formatMemberSinceDate(member)}</td>
                      <td className="px-2 py-2 text-[#b5bac1] whitespace-nowrap">{formatMemberTableDate(member.created_at)}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1 text-[#00a8fc]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          Invite
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className={`group relative min-h-[40px] rounded-xl border border-transparent px-2 py-1.5 transition-colors ${canEditRoles ? 'hover:border-white/5 hover:bg-[#17181c]' : ''}`}>
                          <div className="flex max-w-[180px] flex-wrap items-center gap-1 pr-10">
                            {member.id === hub.owner_id && (
                              <span className="rounded-full bg-[#5865f2]/25 px-1.5 py-0.5 text-[10px] font-semibold text-[#c9cdfb]">Owner</span>
                            )}
                            {member.role === 'admin' && member.id !== hub.owner_id && (
                              <span className="rounded-full bg-[#57f287]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#57f287]">Admin</span>
                            )}
                            {role && (
                              <span className="max-w-[118px] truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${role.color}33`, color: role.color }}>
                                {role.name}
                              </span>
                            )}
                          </div>
                          {canEditRoles && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRolePicker(member, event.currentTarget.getBoundingClientRect());
                              }}
                              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#2c3038] text-[#d4d8df] opacity-0 transition-all hover:bg-[#353943] hover:text-white group-hover:opacity-100 group-focus-within:opacity-100"
                              aria-label={`Edit roles for ${member.display_name}`}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {member.id !== currentUser?.id && (
                            <button
                              type="button"
                              disabled={friendButtonDisabled}
                              onClick={() => void handlePrimaryFriendAction(member)}
                              className="rounded-[8px] border border-[#404249] bg-[#17181c] px-3 py-1.5 text-[11px] font-semibold text-[#d7d9dd] transition-colors hover:bg-[#202229] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {friendButtonLabel}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => openMemberMenu(member, event.currentTarget.getBoundingClientRect())}
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#404249] bg-[#17181c] text-[#c2c7cf] transition-colors hover:bg-[#202229] hover:text-white"
                            aria-label={`Open actions for ${member.display_name}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="5" cy="12" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="19" cy="12" r="1.6" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-4 py-3 text-[12px] text-[#b5bac1]">
          <span>Showing {sorted.length} member{sorted.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-[10px] border border-[#363942] bg-[#17181c] px-2 py-1 text-[#dbdee1] transition-colors disabled:opacity-40"
            >
              Back
            </button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-[28px] rounded-[10px] py-1 text-[12px] ${n === pageSafe ? 'bg-[#5865f2] text-white' : 'border border-[#363942] bg-[#17181c] text-[#b5bac1] hover:bg-[#202229]'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-[10px] border border-[#363942] bg-[#17181c] px-2 py-1 text-[#dbdee1] transition-colors disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <MemberRolePickerMenu
        member={rolePickerMember}
        roles={sortedRoles}
        busy={assigningUserId === rolePickerMember?.id}
        x={rolePickerMenu?.x ?? 0}
        y={rolePickerMenu?.y ?? 0}
        onClose={() => setRolePickerMenu(null)}
        onToggleRole={(member, nextRoleId) => void handleRoleAssign(member, nextRoleId)}
      />

      <MemberOverflowMenu
        member={memberMenuMember}
        relationship={memberMenuMember ? (relationships[memberMenuMember.id] ?? 'none') : 'none'}
        x={memberMenu?.x ?? 0}
        y={memberMenu?.y ?? 0}
        canManageRanks={Boolean(canManageRanks && memberMenuMember?.id !== hub.owner_id)}
        onClose={() => setMemberMenu(null)}
        onOpenProfile={(member) => {
          openProfileModal(member);
          setMemberMenu(null);
        }}
        onMessage={(member) => {
          void handleMessage(member);
        }}
        onToggleBlock={(member) => {
          void handleToggleBlock(member);
        }}
        onOpenRolePicker={openRolePicker}
      />
    </div>
  );
}

function InvitesTab({ hub, currentUser }: { hub: Hub; currentUser: User | null }) {
  const [invites, setInvites] = useState<HubInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const createInvite = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const inv = await api.createInvite(hub.id);
      setInvites((prev) => [inv, ...prev]);
    } catch (e: unknown) {
      setBanner(e instanceof Error ? e.message : 'Could not create invite');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-[20px] font-bold text-white">Invites</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="px-3 py-2 rounded-[4px] text-[13px] font-medium text-[#ed4245] hover:bg-[#ed4245]/10"
          >
            {paused ? 'Resume Invites' : 'Pause Invites'}
          </button>
          <button
            type="button"
            disabled={busy || paused}
            onClick={() => void createInvite()}
            className="px-4 py-2 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium hover:bg-[#4752c4] disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create invite link'}
          </button>
        </div>
      </div>
      {banner && <p className="text-[13px] text-[#f23f42]">{banner}</p>}
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4]">Active invite links</p>
      <div className="rounded-lg border border-[#1e1f22] bg-[#2b2d31] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="text-[#949ba4] uppercase tracking-wide border-b border-[#1e1f22] bg-[#1e1f22]/40">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Inviter</th>
                <th className="px-2 py-2.5 font-semibold">Invite Code</th>
                <th className="px-2 py-2.5 font-semibold">Uses</th>
                <th className="px-2 py-2.5 font-semibold">Expires</th>
                <th className="px-2 py-2.5 font-semibold">Roles</th>
              </tr>
            </thead>
            <tbody>
              {invites.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#949ba4] text-[13px]">
                    No active invites. Create one to get started.
                  </td>
                </tr>
              ) : (
                invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#1e1f22]/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center text-[10px] font-bold text-white">
                          {(currentUser?.display_name ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[13px] text-white font-medium">
                            {inv.creator_id === currentUser?.id ? 'You' : 'Member'}
                          </p>
                          <p className="text-[11px] text-[#949ba4] flex items-center gap-1">
                            <span className="text-[#b5bac1]">#</span> general
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-[#00a8fc] font-mono text-[13px]">{inv.code}</td>
                    <td className="px-2 py-3 text-[#b5bac1]">
                      {inv.uses}
                      {inv.max_uses > 0 ? ` / ${inv.max_uses}` : ''}
                    </td>
                    <td className="px-2 py-3 text-[#b5bac1]">
                      {inv.expires_at ? formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true }) : '∞'}
                    </td>
                    <td className="px-2 py-3 text-[#949ba4]">—</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Customization Tab (Emojis / Stickers / Sounds)
   ═══════════════════════════════════════════════════ */

type CustomKind = 'emojis' | 'stickers' | 'sounds';
type CustomItem = HubEmoji | HubSticker | HubSound;

const kindConfig: Record<CustomKind, {
  label: string;
  singular: string;
  accept: string;
  maxItems: number;
  listFn: (hubId: string) => Promise<CustomItem[]>;
  createFn: (hubId: string, name: string, fileUrl: string) => Promise<CustomItem>;
  deleteFn: (hubId: string, itemId: string) => Promise<void>;
}> = {
  emojis: {
    label: 'Emojis',
    singular: 'emoji',
    accept: 'image/png,image/jpeg,image/gif,image/webp',
    maxItems: 50,
    listFn: (hubId) => api.getHubEmojis(hubId),
    createFn: (hubId, name, url) => api.createHubEmoji(hubId, name, url),
    deleteFn: (hubId, id) => api.deleteHubEmoji(hubId, id),
  },
  stickers: {
    label: 'Stickers',
    singular: 'sticker',
    accept: 'image/png,image/jpeg,image/gif,image/webp',
    maxItems: 50,
    listFn: (hubId) => api.getHubStickers(hubId),
    createFn: (hubId, name, url) => api.createHubSticker(hubId, name, url),
    deleteFn: (hubId, id) => api.deleteHubSticker(hubId, id),
  },
  sounds: {
    label: 'Sounds',
    singular: 'sound',
    accept: 'audio/mpeg,audio/ogg,audio/wav',
    maxItems: 20,
    listFn: (hubId) => api.getHubSounds(hubId),
    createFn: (hubId, name, url) => api.createHubSound(hubId, name, url),
    deleteFn: (hubId, id) => api.deleteHubSound(hubId, id),
  },
};

function CustomizationTab({ hub, isOwner, kind, discordLayout }: { hub: Hub; isOwner: boolean; kind: CustomKind; discordLayout?: boolean }) {
  const cfg = kindConfig[kind];
  const [items, setItems] = useState<CustomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [newItemId, setNewItemId] = useState<string | null>(null);
  const [fadingOutId, setFadingOutId] = useState<string | null>(null);
  const [errorShake, setErrorShake] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hubPermissions = useHubStore((s) => s.hubPermissions[hub.id]);
  const canManage = isOwner || hasPermission(hubPermissions, PermManageHub);

  const showError = useCallback((msg: string) => {
    setError(msg);
    setErrorShake(true);
    setTimeout(() => setErrorShake(false), 400);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 5000);
  }, []);

  // Clear error timer on unmount
  useEffect(() => {
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); };
  }, []);

  const parseApiError = useCallback((err: unknown, fallback: string) => {
    const msg = err instanceof Error ? err.message : fallback;
    if (msg.includes('already exists')) return `A ${cfg.singular} with this name already exists.`;
    if (msg.includes('limit reached')) return msg.charAt(0).toUpperCase() + msg.slice(1) + '.';
    return msg;
  }, [cfg.singular]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cfg.listFn(hub.id)
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hub.id, cfg]);

  // Stop audio on unmount / tab switch
  useEffect(() => {
    return () => {
      if (playingAudioRef.current) {
        playingAudioRef.current.pause();
        playingAudioRef.current = null;
      }
    };
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    // Validate file type before uploading
    const accepted = cfg.accept.split(',').map((t) => t.trim());
    if (!accepted.some((t) => file.type === t || (t.endsWith('/*') && file.type.startsWith(t.replace('/*', '/'))))) {
      showError(`Unsupported file type. Accepted: ${accepted.map((t) => t.split('/')[1]).join(', ')}`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const att = await api.uploadFile(file);
      const nameBase = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || cfg.singular;
      const item = await cfg.createFn(hub.id, nameBase, att.url);
      setNewItemId(item.id);
      setItems((prev) => [...prev, item]);
      setTimeout(() => setNewItemId(null), 600);
    } catch (err: unknown) {
      showError(parseApiError(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }, [hub.id, cfg, parseApiError, showError]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    e.target.value = '';
  }, [handleUpload]);

  const handleDelete = useCallback(async (itemId: string) => {
    setDeletingId(itemId);
    setConfirmDeleteId(null);
    try {
      await cfg.deleteFn(hub.id, itemId);
      // Fade-out then remove
      setFadingOutId(itemId);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        setFadingOutId(null);
      }, 200);
    } catch (err: unknown) {
      showError(parseApiError(err, 'Delete failed'));
    } finally {
      setDeletingId(null);
    }
  }, [hub.id, cfg, parseApiError, showError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!canManage) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    void handleUpload(file);
  }, [canManage, handleUpload]);

  const isImage = kind !== 'sounds';

  if (loading) {
    return isImage ? (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-3.5 rounded bg-[#404249] animate-pulse w-20" />
          <div className="h-9 rounded bg-[#404249] animate-pulse w-28" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-[#2b2d31] rounded-lg border border-[#1e1f22] p-3 flex flex-col items-center">
              <div className="w-14 h-14 rounded-md bg-[#404249] animate-pulse mb-2" />
              <div className="h-3 rounded bg-[#404249] animate-pulse w-16" />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-3.5 rounded bg-[#404249] animate-pulse w-20" />
          <div className="h-9 rounded bg-[#404249] animate-pulse w-28" />
        </div>
        <div className="space-y-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#2b2d31]">
              <div className="w-10 h-10 rounded-full bg-[#404249] animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 rounded bg-[#404249] animate-pulse w-24" />
                <div className="h-2.5 rounded bg-[#404249]/60 animate-pulse w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const atLimit = items.length >= cfg.maxItems;

  return (
    <div
      className="space-y-4 relative"
      onDragOver={(e) => {
        e.preventDefault();
        if (!canManage || atLimit) { e.dataTransfer.dropEffect = 'none'; }
        else { e.dataTransfer.dropEffect = 'copy'; }
        setDragOver(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && canManage && (
        <div className={`absolute inset-0 z-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 pointer-events-none animate-fade-in transition-colors ${
          atLimit ? 'bg-[#f23f42]/10 border-[#f23f42]' : 'bg-[#5865f2]/10 border-[#5865f2]'
        }`}>
          {atLimit ? (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f23f42" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <p className="text-[14px] font-medium text-[#f23f42]">Limit reached ({cfg.maxItems} {cfg.label.toLowerCase()})</p>
            </>
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5865f2" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-[14px] font-medium text-[#5865f2]">Drop to upload {cfg.singular}</p>
            </>
          )}
        </div>
      )}
      {/* Header + Upload */}
      <div className={`flex items-center justify-between gap-4 ${discordLayout ? 'flex-wrap' : ''}`}>
        {discordLayout ? (
          <p className="text-[13px] text-[#949ba4] max-w-xl">
            {kind === 'sounds'
              ? 'Upload audio files your members can play in voice channels.'
              : 'Drag and drop multiple image files here, or use the upload button.'}{' '}
            <span className="text-[#b5bac1]">
              ({items.length} / {cfg.maxItems})
            </span>
          </p>
        ) : (
          <p className="text-[13px] text-[#949ba4]">
            {items.length} / {cfg.maxItems} {cfg.label.toLowerCase()}
          </p>
        )}
        {canManage && (
          <>
            <button
              disabled={uploading || atLimit}
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium
                hover:bg-[#4752c4] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
              title={atLimit ? `Maximum ${cfg.maxItems} ${cfg.label.toLowerCase()} reached` : undefined}
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {discordLayout
                    ? (kind === 'emojis' ? 'Upload Emoji' : kind === 'stickers' ? 'Upload Sticker' : 'Upload Sound')
                    : `Upload ${cfg.singular}`}
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept={cfg.accept} className="hidden" onChange={handleFileChange} />
          </>
        )}
      </div>

      {error && (
        <div className={`flex items-center gap-2 text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-lg px-4 py-2.5 animate-fade-in ${errorShake ? 'animate-shake' : ''}`}>
          <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => { setError(null); if (errorTimerRef.current) clearTimeout(errorTimerRef.current); }} className="flex-shrink-0 p-0.5 rounded hover:bg-[#f23f42]/20 transition-colors" aria-label="Dismiss error" title="Dismiss">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#2b2d31] border border-[#1e1f22] flex items-center justify-center mb-4 text-[#949ba4]">
            {kind === 'emojis' && <div className="scale-150"><IconEmoji /></div>}
            {kind === 'stickers' && <div className="scale-150"><IconSticker /></div>}
            {kind === 'sounds' && <div className="scale-150"><IconSoundboard /></div>}
          </div>
          <h3 className={`${discordLayout ? 'text-[18px] tracking-wide' : 'text-[16px]'} font-bold text-white mb-1`}>
            {discordLayout
              ? (kind === 'emojis' ? 'NO EMOJI' : kind === 'stickers' ? 'NO STICKERS' : 'NO SOUNDS')
              : `No ${cfg.label.toLowerCase()} yet`}
          </h3>
          <p className="text-[13px] text-[#949ba4] max-w-xs leading-relaxed">
            {discordLayout
              ? (kind === 'sounds'
                ? 'Upload a sound to get started.'
                : 'Get the party started by uploading an emoji or sticker.')
              : canManage
                ? `Upload ${cfg.label.toLowerCase()} by clicking the button above or dragging files here.`
                : `This server doesn't have any custom ${cfg.label.toLowerCase()} yet.`}
          </p>
        </div>
      )}

      {/* Grid for images, list for sounds */}
      {items.length > 0 && isImage && (
        <div className="grid grid-cols-4 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-[#2b2d31] rounded-lg border border-[#1e1f22] p-3 flex flex-col items-center group relative transition-all duration-200 ${
                newItemId === item.id ? 'animate-fade-in' : ''
              } ${fadingOutId === item.id ? 'animate-fade-out' : ''}`}
            >
              <img
                src={publicAssetUrl(item.file_url)}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="w-14 h-14 object-contain rounded-md mb-2"
              />
              <p className="text-[12px] text-[#dbdee1] truncate w-full text-center font-medium">
                {item.name}
              </p>
              {canManage && (
                <button
                  onClick={() => setConfirmDeleteId(item.id)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center
                    opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-[#f23f42] hover:bg-[#f23f42]/10
                    transition-all duration-150"
                  aria-label={`Delete ${item.name}`}
                  title="Delete"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && !isImage && (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#2b2d31] border border-[#1e1f22] hover:bg-[#35373c] transition-all duration-200 group ${
                newItemId === item.id ? 'animate-fade-in' : ''
              } ${fadingOutId === item.id ? 'animate-fade-out' : ''}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                playingId === item.id ? 'bg-[#5865f2]/20 text-[#5865f2] ring-2 ring-[#5865f2]/40' : 'bg-[#404249] text-[#949ba4]'
              }`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[#dbdee1] truncate">{item.name}</p>
                <p className="text-[11px] text-[#949ba4]">
                  {new Date(item.created_at).toLocaleDateString()}
                </p>
              </div>
              <>
                  {/* Play button */}
                  <button
                    onClick={() => {
                      if (playingAudioRef.current) {
                        playingAudioRef.current.pause();
                        playingAudioRef.current.currentTime = 0;
                        playingAudioRef.current = null;
                      }
                      if (playingId === item.id) {
                        setPlayingId(null);
                        return;
                      }
                      const audio = new Audio(publicAssetUrl(item.file_url));
                      playingAudioRef.current = audio;
                      setPlayingId(item.id);
                      audio.addEventListener('ended', () => {
                        setPlayingId(null);
                        playingAudioRef.current = null;
                      });
                      audio.play().catch(() => {
                        setPlayingId(null);
                        playingAudioRef.current = null;
                      });
                    }}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                      playingId === item.id
                        ? 'text-[#5865f2] bg-[#5865f2]/10'
                        : 'text-[#b5bac1] hover:text-[#5865f2] hover:bg-[#5865f2]/10'
                    }`}
                    aria-label={playingId === item.id ? `Stop ${item.name}` : `Play ${item.name}`}
                    title={playingId === item.id ? 'Stop' : 'Play'}
                  >
                    {playingId === item.id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  {canManage && (
                    <button
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="w-8 h-8 rounded-md flex items-center justify-center
                        opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-[#f23f42] hover:bg-[#f23f42]/10
                        transition-all duration-150"
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId != null}
        title={`Delete ${cfg.singular}`}
        description={confirmDeleteId
          ? `Remove ${items.find((item) => item.id === confirmDeleteId)?.name ?? cfg.singular}? This cannot be undone.`
          : ''}
        confirmText={`Delete ${cfg.singular}`}
        variant="danger"
        onConfirm={() => confirmDeleteId ? handleDelete(confirmDeleteId) : Promise.resolve()}
        onCancel={() => setConfirmDeleteId(null)}
        loading={confirmDeleteId ? deletingId === confirmDeleteId : false}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Roles Tab
   ═══════════════════════════════════════════════════ */

const ROLE_PERMISSION_OPTIONS = [
  { key: PermViewStreams, label: 'View channels' },
  { key: PermSendMessages, label: 'Send messages' },
  { key: PermManageMessages, label: 'Manage messages' },
  { key: PermManageStreams, label: 'Manage channels' },
  { key: PermManageHub, label: 'Manage server' },
  { key: PermManageRanks, label: 'Manage roles' },
  { key: PermKickMembers, label: 'Kick members' },
  { key: PermBanMembers, label: 'Ban members' },
  { key: PermConnectVoice, label: 'Connect to voice' },
  { key: PermSpeakVoice, label: 'Speak in voice' },
  { key: PermUseSoundboard, label: 'Use soundboard' },
  { key: PermAdministrator, label: 'Administrator' },
] as const;

function RolesTab({ hub }: { hub: Hub }) {
  const [roles, setRoles] = useState<HubRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#99aab5');
  const [newPerms, setNewPerms] = useState<number>(PermViewStreams | PermSendMessages | PermConnectVoice | PermSpeakVoice | PermUseSoundboard);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteRoleId, setConfirmDeleteRoleId] = useState<string | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<'create' | string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#99aab5');
  const [editPerms, setEditPerms] = useState<number>(0);
  const hubPermissions = useHubStore((s) => s.hubPermissions[hub.id]);
  const canManage = hasPermission(hubPermissions, PermManageRanks);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRoles(hub.id);
      setRoles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [hub.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.position - b.position),
    [roles],
  );

  const firstRoleId = sortedRoles[0]?.id ?? null;

  useEffect(() => {
    if (loading || firstRoleId == null) return;
    if (selectedPanel === null) setSelectedPanel(firstRoleId);
  }, [loading, firstRoleId, selectedPanel]);

  useEffect(() => {
    if (selectedPanel && selectedPanel !== 'create' && !roles.some((r) => r.id === selectedPanel)) {
      setSelectedPanel(firstRoleId ?? 'create');
    }
  }, [roles, selectedPanel, firstRoleId]);

  const activeRole = selectedPanel && selectedPanel !== 'create' ? roles.find((r) => r.id === selectedPanel) : undefined;

  useEffect(() => {
    if (activeRole) {
      setEditName(activeRole.name);
      setEditColor(activeRole.color || '#99aab5');
      setEditPerms(activeRole.permissions);
    }
  }, [activeRole?.id, activeRole?.name, activeRole?.color, activeRole?.permissions]);

  const toggleBit = useCallback((value: number, bit: number): number => {
    return (value & bit) !== 0 ? (value & ~bit) : (value | bit);
  }, []);

  const createRole = useCallback(async () => {
    const name = newName.trim();
    if (!name || !canManage) return;
    setBusyId('new');
    setError(null);
    try {
      await api.createRole(hub.id, { name, color: newColor, permissions: newPerms });
      setNewName('');
      await load();
      setSelectedPanel('create');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setBusyId(null);
    }
  }, [canManage, hub.id, load, newColor, newName, newPerms]);

  const deleteRole = useCallback(async (roleID: string) => {
    if (!canManage) return;
    setBusyId(roleID);
    setError(null);
    try {
      await api.deleteRole(hub.id, roleID);
      if (selectedPanel === roleID) setSelectedPanel(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    } finally {
      setBusyId(null);
    }
  }, [canManage, hub.id, load, selectedPanel]);

  const saveRole = useCallback(async () => {
    if (!activeRole || !canManage) return;
    const name = editName.trim();
    if (!name) return;
    setBusyId(activeRole.id);
    setError(null);
    try {
      await api.updateRole(hub.id, activeRole.id, { name, color: editColor, permissions: editPerms });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setBusyId(null);
    }
  }, [canManage, hub.id, activeRole, editName, editColor, editPerms, load]);

  const isAdminPerm = (perms: number) => (perms & PermAdministrator) !== 0;

  const renderPermGrid = (value: number, setVal: Dispatch<SetStateAction<number>>) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ROLE_PERMISSION_OPTIONS.map((opt) => (
        <label key={opt.key} className={`flex items-center gap-2 text-[12px] ${isAdminPerm(value) && opt.key !== PermAdministrator ? 'text-[#949ba4]' : 'text-[#dbdee1]'}`}>
          <input
            type="checkbox"
            checked={isAdminPerm(value) || (value & opt.key) !== 0}
            onChange={() => setVal((p) => toggleBit(p, opt.key))}
            disabled={isAdminPerm(value) && opt.key !== PermAdministrator}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );

  if (!canManage) {
    return (
      <div className="bg-[#2b2d31] rounded-lg p-4 border border-[#1e1f22]">
        <p className="text-[13px] text-[#949ba4]">You do not have permission to manage roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-[20px] font-bold text-white">Roles</h1>
      {error && <div className="text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-lg px-4 py-3">{error}</div>}

      <div className="flex flex-col lg:flex-row gap-0 min-h-[420px] rounded-lg border border-[#1e1f22] overflow-hidden bg-[#2b2d31]">
        <aside className="w-full lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-[#1e1f22] flex flex-col max-h-[40vh] lg:max-h-none">
          <div className="p-2 border-b border-[#1e1f22]">
            <button
              type="button"
              onClick={() => {
                setSelectedPanel('create');
                setNewName('');
                setNewColor('#99aab5');
                setNewPerms(PermViewStreams | PermSendMessages | PermConnectVoice | PermSpeakVoice | PermUseSoundboard);
              }}
              className="w-full py-2 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium hover:bg-[#4752c4]"
            >
              Add role
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
            {loading ? (
              <p className="text-[12px] text-[#949ba4] px-2 py-2">Loading…</p>
            ) : sortedRoles.length === 0 ? (
              <p className="text-[12px] text-[#949ba4] px-2 py-2">No roles yet.</p>
            ) : (
              sortedRoles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedPanel(role.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[4px] text-left text-[13px] transition-colors ${
                    selectedPanel === role.id ? 'bg-[#404249] text-white' : 'text-[#b5bac1] hover:bg-[#35373c]'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color || '#99aab5' }} />
                  <span className="truncate">{role.name}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 p-4 overflow-y-auto">
          {selectedPanel === 'create' && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-[16px] font-semibold text-white">Create role</h2>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Role name"
                  maxLength={32}
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-[4px] bg-[#1e1f22] text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[#5865f2]"
                />
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-10 h-10 rounded bg-transparent cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => void createRole()}
                  disabled={!newName.trim() || busyId === 'new'}
                  className="px-4 py-2 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium hover:bg-[#4752c4] disabled:opacity-40"
                >
                  {busyId === 'new' ? 'Creating…' : 'Create role'}
                </button>
              </div>
              {renderPermGrid(newPerms, setNewPerms)}
              {isAdminPerm(newPerms) && (
                <p className="text-[11px] text-[#faa61a]">Administrator grants full access to all permissions.</p>
              )}
            </div>
          )}

          {selectedPanel !== 'create' && activeRole && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-[16px] font-semibold text-white">Edit role — {activeRole.name}</h2>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteRoleId(activeRole.id)}
                  disabled={busyId === activeRole.id}
                  className="text-[12px] px-3 py-1.5 rounded-[4px] bg-[#f23f42]/10 text-[#f23f42] hover:bg-[#f23f42]/20 disabled:opacity-40"
                >
                  Delete role
                </button>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Role name"
                  maxLength={32}
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-[4px] bg-[#1e1f22] text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[#5865f2]"
                />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-10 h-10 rounded bg-transparent cursor-pointer"
                />
              </div>
              {renderPermGrid(editPerms, setEditPerms)}
              {isAdminPerm(editPerms) && (
                <p className="text-[11px] text-[#faa61a]">Administrator grants full access to all permissions.</p>
              )}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => void saveRole()}
                  disabled={!editName.trim() || busyId === activeRole.id}
                  className="px-4 py-2 rounded-[4px] bg-[#248046] text-white text-[13px] font-medium hover:bg-[#1a6334] disabled:opacity-40"
                >
                  {busyId === activeRole.id ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {!loading && selectedPanel !== 'create' && !activeRole && (
            <p className="text-[13px] text-[#949ba4]">Select a role to edit permissions.</p>
          )}
        </section>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteRoleId != null}
        title="Delete Role"
        description={confirmDeleteRoleId
          ? `Delete ${roles.find((role) => role.id === confirmDeleteRoleId)?.name ?? 'this role'}? Members assigned to it will lose the role.`
          : ''}
        confirmText="Delete Role"
        variant="danger"
        onConfirm={async () => {
          if (!confirmDeleteRoleId) return;
          await deleteRole(confirmDeleteRoleId);
          setConfirmDeleteRoleId(null);
        }}
        onCancel={() => setConfirmDeleteRoleId(null)}
        loading={confirmDeleteRoleId ? busyId === confirmDeleteRoleId : false}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Icons
   ═══════════════════════════════════════════════════ */

function IconEmoji() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function IconSticker() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9.5 12.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5" />
      <line x1="10" y1="9.5" x2="10.01" y2="9.5" />
      <line x1="14" y1="9.5" x2="14.01" y2="9.5" />
    </svg>
  );
}

function IconSoundboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export default memo(HubSettingsModal);
