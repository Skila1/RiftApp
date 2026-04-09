import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeveloperStore } from '../../stores/developerStore';

export default function GeneralInformationPage() {
  const navigate = useNavigate();
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const updateApplication = useDeveloperStore((s) => s.updateApplication);
  const deleteApplication = useDeveloperStore((s) => s.deleteApplication);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [interactionsUrl, setInteractionsUrl] = useState('');
  const [linkedRolesUrl, setLinkedRolesUrl] = useState('');
  const [tosUrl, setTosUrl] = useState('');
  const [privacyUrl, setPrivacyUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (currentApp) {
      setName(currentApp.name);
      setDescription(currentApp.description || '');
      setTags(currentApp.tags || []);
      setInteractionsUrl(currentApp.interactions_endpoint_url || '');
      setLinkedRolesUrl(currentApp.role_connections_verification_url || '');
      setTosUrl(currentApp.terms_of_service_url || '');
      setPrivacyUrl(currentApp.privacy_policy_url || '');
      setDirty(false);
    }
  }, [currentApp]);

  const markDirty = useCallback(() => setDirty(true), []);

  const handleSave = async () => {
    if (!currentApp) return;
    setSaving(true);
    try {
      await updateApplication(currentApp.id, {
        name,
        description,
        tags,
        interactions_endpoint_url: interactionsUrl || null,
        role_connections_verification_url: linkedRolesUrl || null,
        terms_of_service_url: tosUrl || null,
        privacy_policy_url: privacyUrl || null,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (currentApp) {
      setName(currentApp.name);
      setDescription(currentApp.description || '');
      setTags(currentApp.tags || []);
      setInteractionsUrl(currentApp.interactions_endpoint_url || '');
      setLinkedRolesUrl(currentApp.role_connections_verification_url || '');
      setTosUrl(currentApp.terms_of_service_url || '');
      setPrivacyUrl(currentApp.privacy_policy_url || '');
      setDirty(false);
    }
  };

  const handleDelete = async () => {
    if (!currentApp || deleteConfirm !== currentApp.name) return;
    await deleteApplication(currentApp.id);
    navigate('/developers');
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && tags.length < 5 && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput('');
      markDirty();
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    markDirty();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!currentApp) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">General Information</h2>

      {/* App Icon */}
      <div className="flex items-start gap-6 mb-8">
        <div className="relative group">
          <div className="w-24 h-24 rounded-2xl bg-riftapp-content-elevated border border-riftapp-border/40 flex items-center justify-center text-2xl font-bold text-riftapp-accent overflow-hidden">
            {currentApp.icon ? (
              <img src={currentApp.icon} alt="" className="w-full h-full object-cover" />
            ) : (
              currentApp.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <p className="text-xs text-riftapp-text-dim mt-2 text-center">1024×1024 min</p>
        </div>
        <div className="flex-1 pt-2">
          <p className="text-xs text-riftapp-text-muted">
            Minimum size: 1024x1024. Supported: PNG, JPG, GIF, WEBP. Max 10MB.
          </p>
        </div>
      </div>

      {/* Name */}
      <label className="block mb-6">
        <span className="section-label">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          maxLength={128}
          className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
        />
        <p className="text-xs text-riftapp-text-dim mt-1">{name.length}/128</p>
      </label>

      {/* Description */}
      <label className="block mb-6">
        <span className="section-label">Description</span>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          maxLength={400}
          rows={4}
          className="settings-input w-full mt-1.5 py-2 px-3 text-sm resize-none"
          placeholder="Appears in your bot's About Me section."
        />
        <p className="text-xs text-riftapp-text-dim mt-1">{description.length}/400</p>
      </label>

      {/* Tags */}
      <div className="mb-6">
        <span className="section-label">Tags</span>
        <p className="text-xs text-riftapp-text-dim mb-2">Up to 5 tags to help categorize your application.</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-riftapp-accent/10 text-riftapp-accent text-xs font-medium">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-riftapp-danger transition-colors">×</button>
            </span>
          ))}
        </div>
        {tags.length < 5 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add a tag"
              className="settings-input flex-1 py-1.5 px-3 text-sm"
              maxLength={20}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            />
            <button onClick={addTag} className="px-3 py-1.5 text-sm bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors">Add</button>
          </div>
        )}
      </div>

      {/* Read-only fields */}
      <div className="space-y-4 mb-8">
        <ReadOnlyField label="Application ID" value={currentApp.id} onCopy={() => copyToClipboard(currentApp.id)} />
        <ReadOnlyField label="Public Key" value={currentApp.verify_key} onCopy={() => copyToClipboard(currentApp.verify_key)} />
        {currentApp.approximate_guild_count !== undefined && (
          <div>
            <span className="section-label">Server Install Count</span>
            <p className="text-sm text-riftapp-text mt-1">{currentApp.approximate_guild_count}</p>
          </div>
        )}
      </div>

      {/* URL fields */}
      <div className="space-y-4 mb-8">
        <label className="block">
          <span className="section-label">Interactions Endpoint URL</span>
          <input
            type="url"
            value={interactionsUrl}
            onChange={(e) => { setInteractionsUrl(e.target.value); markDirty(); }}
            className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
            placeholder="https://example.com/interactions"
          />
        </label>
        <label className="block">
          <span className="section-label">Linked Roles Verification URL</span>
          <input
            type="url"
            value={linkedRolesUrl}
            onChange={(e) => { setLinkedRolesUrl(e.target.value); markDirty(); }}
            className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
            placeholder="https://example.com/verify"
          />
        </label>
        <label className="block">
          <span className="section-label">Terms of Service URL</span>
          <input
            type="url"
            value={tosUrl}
            onChange={(e) => { setTosUrl(e.target.value); markDirty(); }}
            className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
            placeholder="https://example.com/terms"
          />
        </label>
        <label className="block">
          <span className="section-label">Privacy Policy URL</span>
          <input
            type="url"
            value={privacyUrl}
            onChange={(e) => { setPrivacyUrl(e.target.value); markDirty(); }}
            className="settings-input w-full mt-1.5 py-2 px-3 text-sm"
            placeholder="https://example.com/privacy"
          />
        </label>
      </div>

      {/* Delete App */}
      <div className="pt-6 border-t border-riftapp-border/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-riftapp-danger">Delete Application</h3>
            <p className="text-xs text-riftapp-text-dim mt-0.5">This action is irreversible.</p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 text-sm font-medium bg-riftapp-danger/10 text-riftapp-danger rounded-lg hover:bg-riftapp-danger/20 transition-colors"
          >
            Delete App
          </button>
        </div>
      </div>

      {/* Unsaved changes bar */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-riftapp-content border-t border-riftapp-border/40 px-6 py-3 flex items-center justify-end gap-3 z-40 shadow-lg">
          <span className="text-sm text-riftapp-text-muted mr-auto">You have unsaved changes</span>
          <button onClick={handleReset} className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors">
            Reset
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-riftapp-content rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Delete Application</h2>
            <p className="text-sm text-riftapp-text-muted mb-4">
              Type <strong>{currentApp.name}</strong> to confirm deletion. This will also delete the bot user and all associated data.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="settings-input w-full py-2 px-3 text-sm mb-4"
              placeholder={currentApp.name}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== currentApp.name}
                className="px-4 py-2 text-sm bg-riftapp-danger text-white rounded-lg disabled:opacity-50 hover:bg-riftapp-danger/80"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div>
      <span className="section-label">{label}</span>
      <div className="flex items-center gap-2 mt-1.5">
        <code className="flex-1 bg-riftapp-bg rounded-lg px-3 py-2 text-xs font-mono text-riftapp-text-muted truncate border border-riftapp-border/30">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="px-3 py-2 text-xs bg-riftapp-content-elevated rounded-lg hover:bg-riftapp-panel transition-colors flex-shrink-0"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
