import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHubStore } from '../../stores/hubStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { api } from '../../api/client';
import ConfirmModal from '../modals/ConfirmModal';
import ModalOverlay from '../shared/ModalOverlay';
import StatusDot from '../shared/StatusDot';
import type { Hub, User, HubEmoji, HubSticker, HubSound, HubRole } from '../../types';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { normalizeUsers } from '../../utils/entityAssets';
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

type Tab = 'overview' | 'members' | 'roles' | 'emojis' | 'stickers' | 'soundboard';

interface SidebarSection {
  label: string;
  items: { id: Tab; label: string; icon: React.ReactNode }[];
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: '',
    items: [
      { id: 'overview', label: 'Overview', icon: <IconGear /> },
      { id: 'members', label: 'Members', icon: <IconMembers /> },
      { id: 'roles', label: 'Roles', icon: <IconRoles /> },
    ],
  },
  {
    label: 'CUSTOMIZATION',
    items: [
      { id: 'emojis', label: 'Emojis', icon: <IconEmoji /> },
      { id: 'stickers', label: 'Stickers', icon: <IconSticker /> },
      { id: 'soundboard', label: 'Soundboard', icon: <IconSoundboard /> },
    ],
  },
];

function HubSettingsModal({ hub, onClose }: { hub: Hub; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus modal on mount
  useEffect(() => {
    requestAnimationFrame(() => modalRef.current?.focus());
  }, []);

  const currentUser = useAuthStore((s) => s.user);
  const isOwner = currentUser?.id === hub.owner_id;

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab hub={hub} isOwner={isOwner} onCloseSettings={onClose} />;
      case 'members':
        return <MembersTab hub={hub} />;
      case 'emojis':
        return <CustomizationTab hub={hub} isOwner={isOwner} kind="emojis" />;
      case 'stickers':
        return <CustomizationTab hub={hub} isOwner={isOwner} kind="stickers" />;
      case 'soundboard':
        return <CustomizationTab hub={hub} isOwner={isOwner} kind="sounds" />;
      case 'roles':
        return <RolesTab hub={hub} />;
      default:
        return null;
    }
  };

  const tabTitle: Record<Tab, string> = {
    overview: 'Server Overview',
    members: 'Members',
    roles: 'Roles',
    emojis: 'Emojis',
    stickers: 'Stickers',
    soundboard: 'Soundboard',
  };

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-[#313338] rounded-xl w-[940px] h-[660px] flex shadow-modal overflow-hidden outline-none"
      >
        {/* ───── Left Sidebar ───── */}
        <nav className="w-[220px] bg-[#2b2d31] flex flex-col flex-shrink-0 overflow-y-auto">
          {/* Hub name header */}
          <div className="px-4 pt-5 pb-3 border-b border-[#1e1f22]/60">
            <div className="flex items-center gap-2.5 mb-0.5">
              {hub.icon_url ? (
                <img
                  src={publicAssetUrl(hub.icon_url)}
                  alt=""
                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {hub.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#f2f3f5] truncate">{hub.name}</p>
                <p className="text-[11px] text-[#949ba4]">Server Settings</p>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <div className="flex-1 px-2 py-3 space-y-4">
            {SIDEBAR_SECTIONS.map((section, si) => (
              <div key={si}>
                {section.label && (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] px-2.5 mb-1.5">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[14px] transition-all duration-100 ${
                        activeTab === item.id
                          ? 'bg-[#404249] text-white font-medium'
                          : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#35373c]'
                      }`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 opacity-80">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* ───── Main Content ───── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 h-14 border-b border-[#1e1f22]/60 flex-shrink-0">
            <h2 className="text-[17px] font-bold text-white">{tabTitle[activeTab]}</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#b5bac1]
                hover:text-white hover:bg-[#404249] transition-all duration-150"
              title="Close (Esc)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-6 overscroll-contain">
            {renderContent()}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ═══════════════════════════════════════════════════
   Overview Tab
   ═══════════════════════════════════════════════════ */

function OverviewTab({ hub, isOwner, onCloseSettings }: { hub: Hub; isOwner: boolean; onCloseSettings: () => void }) {
  const navigate = useNavigate();
  const updateHub = useHubStore((s) => s.updateHub);
  const deleteHub = useHubStore((s) => s.deleteHub);

  const [name, setName] = useState(hub.name);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(hub.icon_url ? publicAssetUrl(hub.icon_url) : null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(hub.banner_url ? publicAssetUrl(hub.banner_url) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [iconDragOver, setIconDragOver] = useState(false);
  const [bannerDragOver, setBannerDragOver] = useState(false);

  const deleteNameMatches = deleteConfirmName.trim() === hub.name.trim() && hub.name.trim().length > 0;

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

  const handleDeleteServer = async () => {
    if (!deleteNameMatches) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteHub(hub.id);
      onCloseSettings();
      const nextHubId = useHubStore.getState().activeHubId;
      if (nextHubId) {
        navigate(`/hubs/${nextHubId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete server');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="space-y-6">
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
      <div className="flex justify-end">
        <button
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
          className="px-5 py-2.5 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium
            hover:bg-[#4752c4] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* ── Separator ── */}
      <div className="h-px bg-[#3f4147]" />

      {/* ── Danger Zone ── */}
      <div className="rounded-lg border border-[#f23f42]/30 bg-[#f23f42]/5 p-4">
        <h3 className="text-[14px] font-semibold text-[#f23f42] mb-1">Danger Zone</h3>
        <p className="text-[13px] text-[#949ba4] mb-3 leading-relaxed">
          Deleting this server removes all channels, messages, and invites permanently. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeleteOpen(true);
            setDeleteConfirmName('');
            setDeleteError(null);
          }}
          className="px-4 py-2 rounded-[4px] text-[13px] font-medium border border-[#f23f42] text-[#f23f42]
            hover:bg-[#f23f42] hover:text-white active:scale-95 transition-all"
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
   Members Tab
   ═══════════════════════════════════════════════════ */

function MembersTab({ hub }: { hub: Hub }) {
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<HubRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const currentUser = useAuthStore((s) => s.user);
  const hubPermissions = useHubStore((s) => s.hubPermissions[hub.id]);
  const canManageRanks = hasPermission(hubPermissions, PermManageRanks);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([api.getHubMembers(hub.id), api.getRoles(hub.id)])
      .then(([memberData, roleData]) => {
        if (!cancelled) setMembers(normalizeUsers(memberData));
        if (!cancelled) setRoles(roleData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load members');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hub.id]);

  const handleRoleAssign = useCallback(async (member: User, nextRoleId: string) => {
    if (!canManageRanks || member.id === hub.owner_id) return;
    setAssigningUserId(member.id);
    try {
      if (nextRoleId) await api.assignRole(hub.id, member.id, nextRoleId);
      else await api.removeRole(hub.id, member.id);
      const data = await api.getHubMembers(hub.id);
      setMembers(normalizeUsers(data));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setAssigningUserId(null);
    }
  }, [canManageRanks, hub.id, hub.owner_id]);

  const handleMessage = useCallback(async (member: User) => {
    try {
      const conv = await api.createOrOpenDM(member.id);
      await loadConversations();
      await setActiveConversation(conv.id);
    } catch { /* silently fail */ }
  }, [loadConversations, setActiveConversation]);

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.display_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-[#404249] animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 rounded bg-[#404249] animate-pulse" style={{ width: `${60 + (i * 20) % 40}%` }} />
              <div className="h-2.5 rounded bg-[#404249]/60 animate-pulse w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-lg px-4 py-3">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#949ba4]">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#949ba4] pointer-events-none">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members"
            className="pl-9 pr-3 py-1.5 rounded-md bg-[#1e1f22] text-[13px] text-white w-48
              placeholder-[#949ba4] focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
          />
        </div>
      </div>

      <div className="space-y-0.5">
        {filtered.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#35373c] transition-colors group/member"
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {member.avatar_url ? (
                <img
                  src={publicAssetUrl(member.avatar_url)}
                  alt={member.display_name}
                  loading="lazy"
                  decoding="async"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
                  {member.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <StatusDot
                userId={member.id}
                fallbackStatus={member.status}
                size="md"
                className="absolute -bottom-0.5 -right-0.5 border-2 border-[#313338]"
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-medium text-[#dbdee1] truncate">{member.display_name}</p>
                {member.id === hub.owner_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#5865f2]/20 text-[#5865f2] font-semibold flex-shrink-0">
                    Owner
                  </span>
                )}
                {member.role === 'admin' && member.id !== hub.owner_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#57f287]/15 text-[#57f287] font-semibold flex-shrink-0">
                    Admin
                  </span>
                )}
                {member.rank_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0b232]/15 text-[#f0b232] font-semibold flex-shrink-0">
                    {roles.find((r) => r.id === member.rank_id)?.name ?? 'Role'}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[#949ba4] truncate">@{member.username}</p>
            </div>

            {canManageRanks && member.id !== hub.owner_id && (
              <select
                value={member.rank_id ?? ''}
                onChange={(e) => void handleRoleAssign(member, e.target.value)}
                disabled={assigningUserId === member.id}
                className="bg-[#1e1f22] text-[#dbdee1] text-[12px] rounded px-2 py-1 border border-[#404249] focus:outline-none"
              >
                <option value="">No role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            )}

            {/* Message button — fixed width to prevent layout shift */}
            <div className="w-8 flex-shrink-0">
              {member.id !== currentUser?.id && (
                <button
                  onClick={() => void handleMessage(member)}
                  title={`Message ${member.display_name}`}
                  className="opacity-0 group-hover/member:opacity-100 w-8 h-8 rounded-md flex items-center justify-center
                    text-[#b5bac1] hover:text-[#5865f2] hover:bg-[#5865f2]/10 transition-all duration-150 active:scale-95"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
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

function CustomizationTab({ hub, isOwner, kind }: { hub: Hub; isOwner: boolean; kind: CustomKind }) {
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
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#949ba4]">
          {items.length} / {cfg.maxItems} {cfg.label.toLowerCase()}
        </p>
        {canManage && (
          <>
            <button
              disabled={uploading || atLimit}
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium
                hover:bg-[#4752c4] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
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
                  Upload {cfg.singular}
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
          <h3 className="text-[16px] font-semibold text-white mb-1">No {cfg.label.toLowerCase()} yet</h3>
          <p className="text-[13px] text-[#949ba4] max-w-xs leading-relaxed">
            {canManage
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
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
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
      if (editingRoleId === roleID) setEditingRoleId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
    } finally {
      setBusyId(null);
    }
  }, [canManage, hub.id, load, editingRoleId]);

  const startEditing = useCallback((role: HubRole) => {
    if (editingRoleId === role.id) {
      setEditingRoleId(null);
      return;
    }
    setEditingRoleId(role.id);
    setEditName(role.name);
    setEditColor(role.color || '#99aab5');
    setEditPerms(role.permissions);
  }, [editingRoleId]);

  const saveRole = useCallback(async () => {
    if (!editingRoleId || !canManage) return;
    const name = editName.trim();
    if (!name) return;
    setBusyId(editingRoleId);
    setError(null);
    try {
      await api.updateRole(hub.id, editingRoleId, { name, color: editColor, permissions: editPerms });
      setEditingRoleId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setBusyId(null);
    }
  }, [canManage, hub.id, editingRoleId, editName, editColor, editPerms, load]);

  const isAdminPerm = (perms: number) => (perms & PermAdministrator) !== 0;

  if (!canManage) {
    return (
      <div className="bg-[#2b2d31] rounded-lg p-4 border border-[#1e1f22]">
        <p className="text-[13px] text-[#949ba4]">You do not have permission to manage roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-[13px] text-[#f23f42] bg-[#f23f42]/10 rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-[#2b2d31] rounded-lg border border-[#1e1f22] p-4 space-y-3">
        <h3 className="text-[14px] font-semibold text-white">Create Role</h3>
        <div className="flex gap-3 items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Role name"
            maxLength={32}
            className="flex-1 px-3 py-2 rounded-[4px] bg-[#1e1f22] text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[#5865f2]"
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-10 rounded bg-transparent"
          />
          <button
            onClick={() => void createRole()}
            disabled={!newName.trim() || busyId === 'new'}
            className="px-4 py-2 rounded-[4px] bg-[#5865f2] text-white text-[13px] font-medium hover:bg-[#4752c4] disabled:opacity-40"
          >
            {busyId === 'new' ? 'Creating…' : 'Create'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_PERMISSION_OPTIONS.map((opt) => (
            <label key={opt.key} className={`flex items-center gap-2 text-[12px] ${isAdminPerm(newPerms) && opt.key !== PermAdministrator ? 'text-[#949ba4]' : 'text-[#dbdee1]'}`}>
              <input
                type="checkbox"
                checked={isAdminPerm(newPerms) || (newPerms & opt.key) !== 0}
                onChange={() => setNewPerms((p) => toggleBit(p, opt.key))}
                disabled={isAdminPerm(newPerms) && opt.key !== PermAdministrator}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {isAdminPerm(newPerms) && (
          <p className="text-[11px] text-[#faa61a] mt-1">Administrator grants full access to all permissions.</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-[14px] font-semibold text-white">Existing Roles</h3>
        {loading ? (
          <p className="text-[13px] text-[#949ba4]">Loading roles…</p>
        ) : roles.length === 0 ? (
          <p className="text-[13px] text-[#949ba4]">No custom roles yet.</p>
        ) : (
          roles.map((role) => (
            <div key={role.id} className="bg-[#2b2d31] border border-[#1e1f22] rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => startEditing(role)}
                  className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color || '#99aab5' }} />
                  <span className="text-[13px] text-white truncate">{role.name}</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className={`text-[#949ba4] transition-transform duration-200 flex-shrink-0 ${editingRoleId === role.id ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  onClick={() => setConfirmDeleteRoleId(role.id)}
                  disabled={busyId === role.id}
                  className="text-[12px] px-2.5 py-1 rounded bg-[#f23f42]/10 text-[#f23f42] hover:bg-[#f23f42]/20 disabled:opacity-40"
                >
                  {busyId === role.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>

              {editingRoleId === role.id && (
                <div className="border-t border-[#1e1f22] px-3 py-3 space-y-3">
                  <div className="flex gap-3 items-center">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Role name"
                      maxLength={32}
                      className="flex-1 px-3 py-2 rounded-[4px] bg-[#1e1f22] text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-[#5865f2]"
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-10 h-10 rounded bg-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_PERMISSION_OPTIONS.map((opt) => (
                      <label key={opt.key} className={`flex items-center gap-2 text-[12px] ${isAdminPerm(editPerms) && opt.key !== PermAdministrator ? 'text-[#949ba4]' : 'text-[#dbdee1]'}`}>
                        <input
                          type="checkbox"
                          checked={isAdminPerm(editPerms) || (editPerms & opt.key) !== 0}
                          onChange={() => setEditPerms((p) => toggleBit(p, opt.key))}
                          disabled={isAdminPerm(editPerms) && opt.key !== PermAdministrator}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {isAdminPerm(editPerms) && (
                    <p className="text-[11px] text-[#faa61a]">Administrator grants full access to all permissions.</p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setEditingRoleId(null)}
                      className="px-3 py-1.5 rounded-[4px] text-[13px] text-[#b5bac1] hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void saveRole()}
                      disabled={!editName.trim() || busyId === editingRoleId}
                      className="px-4 py-1.5 rounded-[4px] bg-[#248046] text-white text-[13px] font-medium hover:bg-[#1a6334] disabled:opacity-40"
                    >
                      {busyId === editingRoleId ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
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

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconMembers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconRoles() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

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
