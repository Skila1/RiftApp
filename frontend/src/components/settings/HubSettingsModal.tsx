import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useHubStore } from '../../stores/hubStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/auth';
import { api } from '../../api/client';
import StatusDot from '../shared/StatusDot';
import type { Hub, User } from '../../types';

type Tab = 'overview' | 'members';

export default function HubSettingsModal({ hub, onClose }: { hub: Hub; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const currentUser = useAuthStore((s) => s.user);
  const isOwner = currentUser?.id === hub.owner_id;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'members', label: 'Members' },
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
        className="modal-content w-full max-w-[720px] h-[520px] flex"
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Sidebar nav */}
        <nav className="w-[180px] bg-riptide-panel/80 p-3 flex flex-col flex-shrink-0">
          <h3 className="px-2 text-[13px] font-bold truncate mb-0.5">
            {hub.name}
          </h3>
          <p className="section-label px-2 mb-3">Hub Settings</p>
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
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 h-14 border-b border-riptide-border/40 flex-shrink-0">
            <h2 className="text-[17px] font-bold tracking-tight">
              {activeTab === 'overview' ? 'Hub Overview' : 'Members'}
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
            {activeTab === 'overview' ? (
              <OverviewTab hub={hub} isOwner={isOwner} />
            ) : (
              <MembersTab hub={hub} />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────── Overview Tab ───────── */

function OverviewTab({ hub, isOwner }: { hub: Hub; isOwner: boolean }) {
  const updateHub = useHubStore((s) => s.updateHub);
  const [name, setName] = useState(hub.name);
  const [iconUrl, setIconUrl] = useState(hub.icon_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Track if the hub prop changed (e.g. after save)
  useEffect(() => {
    setName(hub.name);
    setIconUrl(hub.icon_url ?? '');
  }, [hub.name, hub.icon_url]);

  const dirty = name !== hub.name || iconUrl !== (hub.icon_url ?? '');

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const patch: Record<string, string> = {};
    if (name !== hub.name) patch.name = name;
    if (iconUrl !== (hub.icon_url ?? '')) patch.icon_url = iconUrl;

    try {
      await updateHub(hub.id, patch);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hub icon preview */}
      <div className="flex items-center gap-4">
        <div className="relative">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt="hub icon"
              className="w-16 h-16 rounded-2xl object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-riptide-panel flex items-center justify-center text-lg font-semibold text-riptide-text-muted">
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-riptide-text-dim">
            Created {new Date(hub.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Editable fields (owner only) or read-only */}
      {isOwner ? (
        <>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim flex justify-between">
              Hub Name <span className="font-normal">max 100</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="settings-input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-riptide-text-dim flex justify-between">
              Icon URL <span className="font-normal">max 512</span>
            </span>
            <input
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              maxLength={512}
              className="settings-input mt-1"
              placeholder="https://example.com/icon.png"
            />
          </label>

          {error && (
            <p className="text-sm text-riptide-danger bg-riptide-danger/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-400 bg-emerald-400/10 rounded-md px-3 py-2">
              Hub updated!
            </p>
          )}

          <div className="flex justify-end">
            <button
              disabled={!dirty || saving}
              onClick={handleSave}
              className="btn-primary"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </>
      ) : (
        <div className="bg-riptide-panel rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Hub Information</h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-riptide-text-dim text-xs uppercase tracking-wide mb-0.5">Name</p>
              <p>{hub.name}</p>
            </div>
            <div>
              <p className="text-riptide-text-dim text-xs uppercase tracking-wide mb-0.5">Created</p>
              <p>{new Date(hub.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <p className="text-xs text-riptide-text-dim mt-4">
            Only the hub owner can edit settings.
          </p>
        </div>
      )}

      {/* Invite Section */}
      <InviteSection hubId={hub.id} isOwner={isOwner} />
    </div>
  );
}

/* ───────── Invite Section ───────── */

function InviteSection({ hubId, isOwner }: { hubId: string; isOwner: boolean }) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const invite = await api.createInvite(hubId, { expires_in: 604800 });
      setInviteUrl(`${window.location.origin}/invite/${invite.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-riptide-panel/60 rounded-xl p-4 border border-riptide-border/30">
      <h3 className="text-sm font-semibold mb-1">Invite People</h3>
      <p className="text-xs text-riptide-text-dim mb-3">
        Generate an invite link to share with others.
      </p>

      {inviteUrl ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-1.5 rounded-md bg-riptide-bg border border-riptide-border text-sm font-mono text-riptide-accent select-all truncate">
            {inviteUrl}
          </code>
          <button
            onClick={handleCopy}
            className="btn-primary"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-primary"
        >
          {generating ? 'Generating…' : 'Generate Invite Link'}
        </button>
      )}

      {error && (
        <p className="text-sm text-riptide-danger mt-2">{error}</p>
      )}
    </div>
  );
}

/* ───────── Members Tab ───────── */

function MembersTab({ hub }: { hub: Hub }) {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.getHubMembers(hub.id)
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load members');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hub.id]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-riptide-surface/60 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded-full bg-riptide-surface/80 animate-pulse" style={{ width: `${50 + (i * 20) % 40}%` }} />
              <div className="h-2.5 rounded-full bg-riptide-surface/50 animate-pulse w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-riptide-danger bg-riptide-danger/10 rounded-md px-3 py-2">
        {error}
      </p>
    );
  }

  const handleMessage = async (member: User) => {
    try {
      const conv = await api.createOrOpenDM(member.id);
      await loadConversations();
      // Switch to DM mode
      await setActiveConversation(conv.id);
    } catch { /* silently fail */ }
  };

  return (
    <div className="space-y-1">
      <p className="text-xs text-riptide-text-dim mb-3">
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </p>

      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-riptide-surface-hover transition-all duration-150 group/member"
        >
          {/* Avatar */}
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-riptide-accent flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
              {member.display_name.slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{member.display_name}</p>
              {member.id === hub.owner_id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-riptide-accent/20 text-riptide-accent font-medium flex-shrink-0">
                  Owner
                </span>
              )}
            </div>
            <p className="text-xs text-riptide-text-dim truncate">@{member.username}</p>
          </div>

          {/* Status + Message button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusDot userId={member.id} fallbackStatus={member.status} />
            {member.id !== currentUser?.id && (
              <button
                onClick={() => handleMessage(member)}
                title={`Message ${member.display_name}`}
                className="opacity-0 group-hover/member:opacity-100 w-7 h-7 rounded-md flex items-center justify-center
                  text-riptide-text-dim hover:text-riptide-accent hover:bg-riptide-accent/10 transition-all duration-150 active:scale-95"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
