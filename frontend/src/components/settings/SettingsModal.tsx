import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../stores/auth';
import { usePresenceStore } from '../../stores/presenceStore';
import { useWsSend } from '../../hooks/useWebSocket';
import { api } from '../../api/client';
import { statusColor, statusLabel } from '../shared/StatusDot';

type Tab = 'profile' | 'account';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!user) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <motion.div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="modal-backdrop"
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal-content w-full max-w-[660px] h-[520px] flex"
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Sidebar nav */}
        <nav className="w-[180px] bg-riptide-panel/80 p-3 flex flex-col flex-shrink-0">
          <h3 className="section-label px-2 mb-3">
            User Settings
          </h3>
          <div className="space-y-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-riptide-accent/15 text-riptide-text font-medium'
                    : 'text-riptide-text-muted hover:text-riptide-text hover:bg-riptide-bg/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-riptide-border/40 pt-2">
            {confirmLogout ? (
              <div className="px-2 py-2 rounded-md bg-riptide-danger/10 border border-riptide-danger/20">
                <p className="text-[11px] text-riptide-danger font-medium mb-2">Log out of Riptide?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { logout(); onClose(); }}
                    className="flex-1 py-1 rounded-md bg-riptide-danger text-white text-[11px] font-semibold hover:bg-riptide-danger/90 active:scale-95 transition-all duration-150"
                  >
                    Log Out
                  </button>
                  <button
                    onClick={() => setConfirmLogout(false)}
                    className="flex-1 py-1 rounded-md text-[11px] text-riptide-text-muted hover:bg-riptide-bg/30 transition-all duration-150"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmLogout(true)}
                className="w-full text-left px-3 py-1.5 rounded-md text-sm text-riptide-danger hover:bg-riptide-danger/10 transition-all duration-150"
              >
                Log Out
              </button>
            )}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 h-14 border-b border-riptide-border/40 flex-shrink-0">
            <h2 className="text-[17px] font-bold tracking-tight">
              {activeTab === 'profile' ? 'Profile' : 'My Account'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-riptide-text-dim
                hover:text-riptide-text hover:bg-riptide-panel transition-all duration-150"
              title="Close (Esc)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'profile' ? (
              <ProfileTab user={user} setUser={setUser} />
            ) : (
              <AccountTab user={user} logout={logout} onClose={onClose} />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────── Profile Tab ───────── */

function ProfileTab({
  user,
  setUser,
}: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  setUser: (u: typeof user) => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImgError(false);
    setUploading(true);

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);

    try {
      const attachment = await api.uploadFile(file);
      setAvatarUrl(attachment.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
      setAvatarPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const dirty =
    username !== user.username ||
    displayName !== user.display_name ||
    bio !== (user.bio ?? '') ||
    avatarUrl !== (user.avatar_url ?? '');

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const patch: Record<string, string> = {};
    if (username !== user.username) patch.username = username;
    if (displayName !== user.display_name) patch.display_name = displayName;
    if (bio !== (user.bio ?? '')) patch.bio = bio;
    if (avatarUrl !== (user.avatar_url ?? '')) patch.avatar_url = avatarUrl;

    try {
      const updated = await api.updateMe(patch);
      setUser(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Avatar Preview — click to upload */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative group cursor-pointer"
          title="Change avatar"
        >
          {(avatarPreview || avatarUrl) && !imgError ? (
            <img
              src={avatarPreview || avatarUrl}
              alt="avatar"
              className="w-16 h-16 rounded-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-riptide-accent flex items-center justify-center text-lg font-semibold text-white">
              {(displayName || username).slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {uploading ? (
              <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </button>
        <div>
          <p className="text-sm font-medium">{displayName || username}</p>
          <p className="text-xs text-riptide-text-dim">@{username}</p>
        </div>
      </div>

      {/* Fields */}
      <Field label="Username" maxLength={32}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={32}
          className="settings-input"
        />
      </Field>

      <Field label="Display Name" maxLength={64}>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={64}
          className="settings-input"
        />
      </Field>

      <Field label="Bio" maxLength={190}>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={190}
          rows={3}
          className="settings-input resize-none"
          placeholder="Tell us about yourself"
        />
        <p className="text-[11px] text-riptide-text-dim mt-1 text-right">
          {bio.length}/190
        </p>
      </Field>

      {/* Error / Success */}
      {error && (
        <p className="text-sm text-riptide-danger bg-riptide-danger/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-400 bg-emerald-400/10 rounded-md px-3 py-2">
          Profile updated!
        </p>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          disabled={!dirty || saving}
          onClick={handleSave}
          className="btn-primary"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

/* ───────── Account Tab ───────── */

function AccountTab({
  user,
  logout,
  onClose,
}: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  logout: () => void;
  onClose: () => void;
}) {
  const send = useWsSend();
  const liveStatus = usePresenceStore((s) => s.presence[user.id]);
  const setPresence = usePresenceStore((s) => s.setPresence);
  const currentStatus = liveStatus ?? user.status;
  const [confirmLogout, setConfirmLogout] = useState(false);

  const statuses = [
    { value: 1, label: 'Online' },
    { value: 2, label: 'Idle' },
    { value: 3, label: 'Do Not Disturb' },
  ] as const;

  const handleStatusChange = (status: number) => {
    send('set_status', { status });
    setPresence(user.id, status);
  };

  return (
    <div className="space-y-6">
      {/* Status Selector */}
      <div className="bg-riptide-panel rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Status</h3>
        <div className="space-y-1">
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                currentStatus === s.value
                  ? 'bg-riptide-accent/15 text-riptide-text'
                  : 'text-riptide-text-muted hover:text-riptide-text hover:bg-riptide-bg/30'
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${statusColor(s.value)}`} />
              {s.label}
              {currentStatus === s.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="ml-auto text-riptide-accent">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-riptide-text-dim mt-2">
          Currently: {statusLabel(currentStatus)}
        </p>
      </div>

      <div className="bg-riptide-panel rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Account Details</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-riptide-text-dim text-xs uppercase tracking-wide mb-0.5">Username</p>
            <p>@{user.username}</p>
          </div>
          {user.email && (
            <div>
              <p className="text-riptide-text-dim text-xs uppercase tracking-wide mb-0.5">Email</p>
              <p>{user.email}</p>
            </div>
          )}
          <div>
            <p className="text-riptide-text-dim text-xs uppercase tracking-wide mb-0.5">Member Since</p>
            <p>{new Date(user.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-riptide-panel rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1 text-riptide-danger">Danger Zone</h3>
        <p className="text-xs text-riptide-text-dim mb-3">
          Logging out will clear your session on this device.
        </p>
        {confirmLogout ? (
          <div className="rounded-lg bg-riptide-danger/10 border border-riptide-danger/25 p-3">
            <p className="text-sm text-riptide-danger font-medium mb-3">Are you sure you want to log out?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { logout(); onClose(); }}
                className="btn-danger flex-1"
              >
                Log Out
              </button>
              <button
                onClick={() => setConfirmLogout(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            className="btn-danger"
          >
            Log Out
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── Shared Field Wrapper ───────── */

function Field({
  label,
  maxLength,
  children,
}: {
  label: string;
  maxLength?: number;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim flex justify-between">
        {label}
        {maxLength && <span className="font-normal">max {maxLength}</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
