import { useState, useEffect, useRef, useCallback } from 'react';
import { useStreamStore } from '../../stores/streamStore';
import { useHubStore } from '../../stores/hubStore';
import ModalOverlay from '../shared/ModalOverlay';
import ConfirmModal from './ConfirmModal';
import type { Stream, HubRole } from '../../types';
import { api } from '../../api/client';

/* ────────── constants ────────── */

type Tab = 'overview' | 'permissions' | 'delete';

/* ────────── icons ────────── */

function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* ────────── sub-components ────────── */

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
        enabled ? 'bg-riftapp-accent border-riftapp-accent' : 'bg-riftapp-bg/70 border-riftapp-border/60'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

/* ────────── Overview tab ────────── */

function OverviewTab({
  stream,
  name,
  setName,
  bitrate,
  setBitrate,
  userLimit,
  setUserLimit,
  error,
  setError,
}: {
  stream: Stream;
  name: string;
  setName: (v: string) => void;
  bitrate: number;
  setBitrate: (v: number) => void;
  userLimit: number;
  setUserLimit: (v: number) => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const isVoice = stream.type === 1;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  return (
    <div className="space-y-6">
      {/* Channel Name */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-[#b5bac1] block mb-2">Channel Name</label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
          className="w-full bg-[#1e1f22] border border-[#1e1f22] rounded-[4px] px-3 py-2.5 text-[15px] text-[#dbdee1] outline-none focus:border-[#00a8fc] transition-colors"
          autoComplete="off"
          maxLength={100}
        />
      </div>

      {isVoice && (
        <>
          <div className="h-px bg-[#3f4147]" />

          {/* Bitrate */}
          <div>
            <label className="text-sm font-bold text-[#f2f3f5] block mb-1">Bitrate</label>
            <div className="flex items-center justify-between text-[12px] text-[#949ba4] mb-2">
              <span>8kbps</span>
              <span>{Math.round(bitrate / 1000)}kbps</span>
              <span>96kbps</span>
            </div>
            <input
              type="range"
              min={8000}
              max={96000}
              step={1000}
              value={bitrate}
              onChange={(e) => setBitrate(Number(e.target.value))}
              className="w-full accent-riftapp-accent"
            />
            <p className="text-[12px] text-[#949ba4] mt-2">
              {bitrate > 64000 ? 'ALL THE BITS! Going above 64 kbps may adversely affect people on poor connections.' : 'Higher bitrate means better audio quality but uses more bandwidth.'}
            </p>
          </div>

          {/* Video Quality */}
          <div>
            <label className="text-sm font-bold text-[#f2f3f5] block mb-2">Video Quality</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="videoQuality" value="auto" defaultChecked className="accent-riftapp-accent" />
                <span className="text-[14px] text-[#dbdee1]">Auto</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="videoQuality" value="720" className="accent-riftapp-accent" />
                <span className="text-[14px] text-[#dbdee1]">720p</span>
              </label>
            </div>
            <p className="text-[12px] text-[#949ba4] mt-2">
              Sets camera video quality for all channel participants. Choose <strong className="text-[#dbdee1]">Auto</strong> for optimal performance.
            </p>
          </div>

          {/* User Limit */}
          <div>
            <label className="text-sm font-bold text-[#f2f3f5] block mb-2">User Limit</label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12px] text-[#949ba4]">∞</span>
              <input
                type="range"
                min={0}
                max={99}
                step={1}
                value={userLimit}
                onChange={(e) => setUserLimit(Number(e.target.value))}
                className="flex-1 accent-riftapp-accent"
              />
              <span className="text-[12px] text-[#949ba4]">99</span>
            </div>
            <p className="text-[12px] text-[#949ba4]">
              {userLimit === 0
                ? 'No user limit set.'
                : `Limits the number of users that can connect to this voice channel. Users with the Move Members permission ignore this limit and can move other users into the channel.`}
            </p>
          </div>
        </>
      )}

      {error && <p className="text-sm text-riftapp-danger">{error}</p>}
    </div>
  );
}

/* ────────── Permissions tab ────────── */

type PermState = 'neutral' | 'deny' | 'allow';

const GENERAL_PERMS = [
  { key: 'view_channel', name: 'View Channel', descText: (v: boolean) => `Allows members to ${v ? 'see' : 'view'} this channel.` },
  { key: 'manage_channel', name: 'Manage Channel', descText: () => 'Allows members to change this channel\'s name, description and voice settings. They can also delete the channel.' },
] as const;

const VOICE_PERMS = [
  { key: 'connect', name: 'Connect', descText: () => 'Allows members to join this voice channel and hear others.' },
  { key: 'speak', name: 'Speak', descText: () => 'Allows members to talk in this voice channel.' },
] as const;

const TEXT_PERMS = [
  { key: 'send_messages', name: 'Send Messages', descText: () => 'Allows members to send messages in this channel.' },
  { key: 'manage_messages', name: 'Manage Messages', descText: () => 'Allows members to delete or pin messages by other members.' },
] as const;

function PermissionsTab({
  stream,
  isPrivate,
  setIsPrivate,
  roles,
  rolesLoading,
}: {
  stream: Stream;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  roles: HubRole[];
  rolesLoading: boolean;
}) {
  const isVoice = stream.type === 1;
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  // Per-role permission overrides: roleKey → permKey → state
  const [overrides, setOverrides] = useState<Record<string, Record<string, PermState>>>({});

  const getPermState = (roleKey: string, permKey: string): PermState =>
    overrides[roleKey]?.[permKey] ?? 'neutral';

  const setPermState = (roleKey: string, permKey: string, value: PermState) => {
    setOverrides((prev) => ({
      ...prev,
      [roleKey]: { ...prev[roleKey], [permKey]: value },
    }));
  };

  const selectedRoleInfo = selectedRole === 'everyone'
    ? { name: '@everyone', color: '#5865f2' }
    : roles.find((r) => r.id === selectedRole);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-[#f2f3f5]">Channel Permissions</h3>
        <p className="text-[13px] text-[#949ba4] mt-1">
          Use permissions to customise who can do what in this channel.
        </p>
      </div>

      {/* Private Channel toggle */}
      <div className="rounded-lg border border-[#3f4147] bg-[#2b2d31] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 text-[#949ba4]"><IconLock /></span>
            <div>
              <p className="text-sm font-semibold text-[#f2f3f5]">Private Channel</p>
              <p className="text-[13px] text-[#949ba4] mt-0.5">
                By making a channel private, only select members and roles will have access to view {isVoice ? 'or connect to' : ''} this channel.
              </p>
            </div>
          </div>
          <Toggle enabled={isPrivate} onToggle={() => setIsPrivate(!isPrivate)} />
        </div>
      </div>

      <div className="h-px bg-[#3f4147]" />

      {/* Roles / Members list */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-[#b5bac1] mb-3">
          Roles / Members
        </h4>

        {rolesLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[#949ba4]">
            <div className="w-4 h-4 border-2 border-[#949ba4] border-t-transparent rounded-full animate-spin" />
            Loading roles…
          </div>
        ) : (
          <div className="space-y-1">
            {/* @everyone pseudo-role */}
            <button
              type="button"
              onClick={() => setSelectedRole(selectedRole === 'everyone' ? null : 'everyone')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                selectedRole === 'everyone'
                  ? 'bg-[#404249] border border-[#5865f2]/50'
                  : 'bg-[#2b2d31] border border-[#3f4147] hover:bg-[#35373c]'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-[#5865f2] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">@</div>
              <span className="text-[14px] text-[#dbdee1] font-medium">@everyone</span>
              <span className="ml-auto text-[12px] text-[#949ba4]">Default role</span>
            </button>

            {/* Custom roles */}
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRole(selectedRole === role.id ? null : role.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                  selectedRole === role.id
                    ? 'bg-[#404249] border border-[#5865f2]/50'
                    : 'border border-transparent hover:bg-[#35373c]'
                }`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: role.color || '#5865f2' }}
                >
                  {role.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-[14px] text-[#dbdee1]">{role.name}</span>
              </button>
            ))}

            {roles.length === 0 && (
              <p className="text-[13px] text-[#949ba4] px-3 py-2">
                No custom roles yet. Create roles in Server Settings → Roles.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Permission overrides for selected role */}
      <div className="h-px bg-[#3f4147]" />

      {selectedRole && selectedRoleInfo ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: ('color' in selectedRoleInfo ? selectedRoleInfo.color : null) || '#5865f2' }}
            >
              {selectedRoleInfo.name === '@everyone' ? '@' : selectedRoleInfo.name.slice(0, 1).toUpperCase()}
            </div>
            <h4 className="text-sm font-bold text-[#f2f3f5]">{selectedRoleInfo.name} — Channel Permissions</h4>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-[#b5bac1]">General Channel Permissions</h4>
            {GENERAL_PERMS.map((p) => (
              <PermissionRow
                key={p.key}
                name={p.name}
                description={p.descText(isVoice)}
                value={getPermState(selectedRole, p.key)}
                onChange={(v) => setPermState(selectedRole, p.key, v)}
              />
            ))}

            <div className="h-px bg-[#3f4147]" />

            <h4 className="text-xs font-bold uppercase tracking-wide text-[#b5bac1]">
              {isVoice ? 'Voice Channel Permissions' : 'Text Channel Permissions'}
            </h4>
            {(isVoice ? VOICE_PERMS : TEXT_PERMS).map((p) => (
              <PermissionRow
                key={p.key}
                name={p.name}
                description={p.descText()}
                value={getPermState(selectedRole, p.key)}
                onChange={(v) => setPermState(selectedRole, p.key, v)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#2b2d31] flex items-center justify-center mb-3">
            <IconShield />
          </div>
          <p className="text-[14px] text-[#dbdee1] font-medium">Select a role to configure permissions</p>
          <p className="text-[13px] text-[#949ba4] mt-1">Click on a role above to view and edit its channel permissions.</p>
        </div>
      )}
    </div>
  );
}

function PermissionRow({ name, description, value, onChange }: { name: string; description: string; value: PermState; onChange: (v: PermState) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[#dbdee1]">{name}</p>
        <p className="text-[12px] text-[#949ba4] mt-0.5 leading-snug">{description}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange(value === 'deny' ? 'neutral' : 'deny')}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            value === 'deny' ? 'bg-[#da373c] text-white' : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
          }`}
          title="Deny"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onChange('neutral')}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            value === 'neutral' ? 'bg-[#4e5058] text-white' : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
          }`}
          title="Neutral"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onChange(value === 'allow' ? 'neutral' : 'allow')}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
            value === 'allow' ? 'bg-[#248046] text-white' : 'text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c]'
          }`}
          title="Allow"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ────────── Delete tab ────────── */

function DeleteTab({ stream, onClose }: { stream: Stream; onClose: () => void }) {
  const deleteStream = useStreamStore((s) => s.deleteStream);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isVoice = stream.type === 1;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteStream(stream.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete channel');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-[#f2f3f5]">Delete Channel</h3>
        <p className="text-[13px] text-[#949ba4] mt-2 leading-relaxed">
          Are you sure you want to delete <strong className="text-[#dbdee1]">#{stream.name}</strong>?
          {isVoice
            ? ' This will disconnect all members currently in the voice channel.'
            : ' All messages and data in this channel will be permanently deleted.'}
        </p>
        <p className="text-[13px] text-riftapp-danger mt-2 font-medium">This action cannot be undone.</p>
      </div>

      {error && <p className="text-sm text-riftapp-danger">{error}</p>}

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={deleting}
        className="px-4 py-2 rounded-md text-sm font-semibold bg-[#da373c] text-white hover:bg-[#a12828] transition-colors disabled:opacity-50"
      >
        {deleting ? 'Deleting…' : 'Delete Channel'}
      </button>

      {confirmOpen && (
        <ConfirmModal
          isOpen
          title={`Delete #${stream.name}`}
          description={`This will permanently delete the ${isVoice ? 'voice' : 'text'} channel and all its data. This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmOpen(false)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/* ────────── Main Modal ────────── */

interface Props {
  stream: Stream;
  onClose: () => void;
}

export default function EditChannelModal({ stream, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [name, setName] = useState(stream.name);
  const [bitrate, setBitrate] = useState(stream.bitrate || 64000);
  const [userLimit, setUserLimit] = useState(stream.user_limit || 0);
  const [isPrivate, setIsPrivate] = useState(stream.is_private);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<HubRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const patchStream = useStreamStore((s) => s.patchStream);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const modalRef = useRef<HTMLDivElement>(null);
  const isVoice = stream.type === 1;

  useEffect(() => {
    requestAnimationFrame(() => modalRef.current?.focus());
  }, []);

  // Load roles for permissions tab
  useEffect(() => {
    if (!activeHubId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getRoles(activeHubId);
        if (!cancelled) setRoles(r);
      } catch { /* ignore */ }
      if (!cancelled) setRolesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeHubId]);

  const hasChanges = useCallback(() => {
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const nameChanged = trimmed !== stream.name;
    const voiceChanged = isVoice && (
      bitrate !== (stream.bitrate || 64000) ||
      userLimit !== (stream.user_limit || 0)
    );
    const privacyChanged = isPrivate !== stream.is_private;
    return nameChanged || voiceChanged || privacyChanged;
  }, [name, bitrate, userLimit, isPrivate, stream, isVoice]);

  const handleSave = async () => {
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!trimmed || saving) return;

    if (!hasChanges()) {
      onClose();
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const voiceSettings = isVoice ? { bitrate, user_limit: userLimit } : undefined;
      const privacyArg = isPrivate !== stream.is_private ? isPrivate : undefined;
      await patchStream(stream.id, trimmed, voiceSettings, privacyArg);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update channel');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; danger?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: <IconGear /> },
    { id: 'permissions', label: 'Permissions', icon: <IconShield /> },
    { id: 'delete', label: 'Delete Channel', icon: <IconTrash />, danger: true },
  ];

  const channelPrefix = isVoice ? '🔊' : '#';

  return (
    <ModalOverlay isOpen onClose={onClose} zIndex={300}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-[#313338] rounded-xl w-[940px] h-[660px] flex shadow-modal overflow-hidden outline-none"
      >
        {/* ───── Left Sidebar ───── */}
        <nav className="w-[220px] bg-[#2b2d31] flex flex-col flex-shrink-0 overflow-y-auto">
          {/* Channel header */}
          <div className="px-4 pt-5 pb-3 border-b border-[#1e1f22]/60">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] truncate">
              {channelPrefix} {stream.name}
            </p>
            <p className="text-[11px] text-[#949ba4] mt-0.5 uppercase tracking-wider">
              {isVoice ? 'Voice Channels' : 'Text Channels'}
            </p>
          </div>

          {/* Nav items */}
          <div className="flex-1 px-2 py-3">
            <div className="space-y-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[14px] transition-all duration-100 ${
                    activeTab === tab.id
                      ? tab.danger
                        ? 'bg-[#da373c]/15 text-[#da373c] font-medium'
                        : 'bg-[#404249] text-white font-medium'
                      : tab.danger
                        ? 'text-[#da373c] hover:bg-[#da373c]/10'
                        : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#35373c]'
                  }`}
                >
                  <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 opacity-80">
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* ───── Main Content ───── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 h-14 border-b border-[#1e1f22]/60 flex-shrink-0">
            <h2 className="text-[18px] font-bold text-[#f2f3f5]">
              {activeTab === 'overview' ? 'Overview' : activeTab === 'permissions' ? 'Channel Permissions' : 'Delete Channel'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="group flex items-center gap-2 rounded-full border border-[#3f4147] bg-transparent px-3 py-1.5 text-[#949ba4] transition-all duration-150 hover:border-[#dbdee1]/40 hover:text-white"
              title="Close (Esc)"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-70 group-hover:opacity-100">Esc</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'overview' && (
              <OverviewTab
                stream={stream}
                name={name}
                setName={setName}
                bitrate={bitrate}
                setBitrate={setBitrate}
                userLimit={userLimit}
                setUserLimit={setUserLimit}
                error={error}
                setError={setError}
              />
            )}
            {activeTab === 'permissions' && (
              <PermissionsTab
                stream={stream}
                isPrivate={isPrivate}
                setIsPrivate={setIsPrivate}
                roles={roles}
                rolesLoading={rolesLoading}
              />
            )}
            {activeTab === 'delete' && <DeleteTab stream={stream} onClose={onClose} />}
          </div>

          {/* Save bar (only for overview & permissions tabs) */}
          {activeTab !== 'delete' && hasChanges() && (
            <div className="px-6 py-3 bg-[#1e1f22] border-t border-[#1e1f22]/80 flex items-center justify-end gap-3 animate-slide-up">
              <p className="text-[13px] text-[#dbdee1] mr-auto">Careful — you have unsaved changes!</p>
              <button
                type="button"
                onClick={() => {
                  setName(stream.name);
                  setBitrate(stream.bitrate || 64000);
                  setUserLimit(stream.user_limit || 0);
                  setIsPrivate(stream.is_private);
                  setError(null);
                }}
                className="px-4 py-2 rounded-md text-[13px] font-medium text-[#dbdee1] hover:underline"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="px-4 py-2 rounded-md text-[13px] font-semibold bg-[#248046] text-white hover:bg-[#1a6334] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
