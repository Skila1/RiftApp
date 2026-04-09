import { useState, useEffect } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';

export default function BotPage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const updateApplication = useDeveloperStore((s) => s.updateApplication);
  const resetBotToken = useDeveloperStore((s) => s.resetBotToken);
  const fetchApplication = useDeveloperStore((s) => s.fetchApplication);

  const [token, setToken] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botPublic, setBotPublic] = useState(true);
  const [requireCodeGrant, setRequireCodeGrant] = useState(false);
  const [presenceIntent, setPresenceIntent] = useState(false);
  const [membersIntent, setMembersIntent] = useState(false);
  const [contentIntent, setContentIntent] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (currentApp) {
      setBotPublic(currentApp.bot_public);
      setRequireCodeGrant(currentApp.bot_require_code_grant);
      setPresenceIntent(!!(currentApp.flags & (1 << 12)));
      setMembersIntent(!!(currentApp.flags & (1 << 14)));
      setContentIntent(!!(currentApp.flags & (1 << 18)));
      setDirty(false);
    }
  }, [currentApp]);

  const handleResetToken = async () => {
    if (!currentApp) return;
    setResetting(true);
    try {
      const newToken = await resetBotToken(currentApp.id);
      setToken(newToken);
      setShowResetModal(false);
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    if (!currentApp) return;
    setSaving(true);
    try {
      let flags = currentApp.flags;
      flags = presenceIntent ? (flags | (1 << 13)) : (flags & ~(1 << 13));
      flags = membersIntent ? (flags | (1 << 15)) : (flags & ~(1 << 15));
      flags = contentIntent ? (flags | (1 << 19)) : (flags & ~(1 << 19));

      await updateApplication(currentApp.id, {
        bot_public: botPublic,
        bot_require_code_grant: requireCodeGrant,
        flags,
      });
      setDirty(false);
      fetchApplication(currentApp.id);
    } finally {
      setSaving(false);
    }
  };

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">Bot</h2>

      {/* Bot User Info */}
      {currentApp.bot && (
        <div className="flex items-center gap-4 mb-8 p-4 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40">
          <div className="w-16 h-16 rounded-full bg-riftapp-accent/10 flex items-center justify-center text-xl font-bold text-riftapp-accent overflow-hidden">
            {currentApp.bot.avatar_url ? (
              <img src={currentApp.bot.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              currentApp.bot.display_name?.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className="font-semibold">{currentApp.bot.display_name}</p>
            <p className="text-xs text-riftapp-text-dim">@{currentApp.bot.username}</p>
          </div>
        </div>
      )}

      {/* Token */}
      <div className="mb-8">
        <span className="section-label">Token</span>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="flex-1 bg-riftapp-bg rounded-lg px-3 py-2 text-xs font-mono text-riftapp-text-muted truncate border border-riftapp-border/30">
            {token || '••••••••••••••••••••••••••••••••'}
          </code>
          {token && (
            <button
              onClick={() => navigator.clipboard.writeText(token)}
              className="px-3 py-2 text-xs bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors flex-shrink-0"
            >
              Copy
            </button>
          )}
          <button
            onClick={() => setShowResetModal(true)}
            className="px-3 py-2 text-xs bg-riftapp-danger/10 text-riftapp-danger rounded-lg hover:bg-riftapp-danger/20 transition-colors flex-shrink-0"
          >
            Reset Token
          </button>
        </div>
        <p className="text-xs text-riftapp-text-dim mt-1">Keep this token secret. Never share it publicly.</p>
      </div>

      {/* Privileged Gateway Intents */}
      <div className="mb-8">
        <h3 className="text-sm font-bold mb-4">Privileged Gateway Intents</h3>
        <div className="space-y-4">
          <ToggleRow
            label="Presence Intent"
            description="Required for your bot to receive presence update events."
            checked={presenceIntent}
            onChange={(v) => { setPresenceIntent(v); setDirty(true); }}
          />
          <ToggleRow
            label="Server Members Intent"
            description="Required for your bot to receive member-related events."
            checked={membersIntent}
            onChange={(v) => { setMembersIntent(v); setDirty(true); }}
          />
          <ToggleRow
            label="Message Content Intent"
            description="Required for your bot to receive message content in events."
            checked={contentIntent}
            onChange={(v) => { setContentIntent(v); setDirty(true); }}
          />
        </div>
      </div>

      {/* Bot settings */}
      <div className="space-y-4 mb-8">
        <ToggleRow
          label="Public Bot"
          description="When enabled, anyone can invite your bot. When disabled, only you can add it."
          checked={botPublic}
          onChange={(v) => { setBotPublic(v); setDirty(true); }}
        />
        <ToggleRow
          label="Require OAuth2 Code Grant"
          description="When enabled, requires an OAuth2 code grant to authorize the bot."
          checked={requireCodeGrant}
          onChange={(v) => { setRequireCodeGrant(v); setDirty(true); }}
        />
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-riftapp-content border-t border-riftapp-border/40 px-6 py-3 flex items-center justify-end gap-3 z-40 shadow-lg">
          <span className="text-sm text-riftapp-text-muted mr-auto">You have unsaved changes</span>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Reset token modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowResetModal(false)}>
          <div className="bg-riftapp-content rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Reset Bot Token</h2>
            <p className="text-sm text-riftapp-text-muted mb-4">
              This will invalidate the current token. Any services using it will stop working.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg">Cancel</button>
              <button
                onClick={handleResetToken}
                disabled={resetting}
                className="px-4 py-2 text-sm bg-riftapp-danger text-white rounded-lg disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset Token'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-riftapp-text-dim mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-riftapp-accent' : 'bg-riftapp-content-elevated border border-riftapp-border/50'
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}
