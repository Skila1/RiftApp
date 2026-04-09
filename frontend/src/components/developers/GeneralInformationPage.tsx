import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';

export default function GeneralInformationPage() {
  const { appId } = useParams();
  const navigate = useNavigate();
  const { currentApp, fetchApplication, updateApplication, deleteApplication } = useDeveloperStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tosUrl, setTosUrl] = useState('');
  const [privacyUrl, setPrivacyUrl] = useState('');
  const [interactionsUrl, setInteractionsUrl] = useState('');
  const [customInstallUrl, setCustomInstallUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const loadFields = useCallback(() => {
    if (!currentApp) return;
    setName(currentApp.name);
    setDescription(currentApp.description || '');
    setTags(currentApp.tags || []);
    setTosUrl(currentApp.terms_of_service_url || '');
    setPrivacyUrl(currentApp.privacy_policy_url || '');
    setInteractionsUrl(currentApp.interactions_endpoint_url || '');
    setCustomInstallUrl(currentApp.custom_install_url || '');
    setIconPreview(currentApp.icon || null);
    setIconFile(null);
    setDirty(false);
  }, [currentApp]);

  useEffect(() => {
    if (appId) fetchApplication(appId);
  }, [appId, fetchApplication]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const markDirty = () => setDirty(true);

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
    markDirty();
  };

  const handleRemoveIcon = () => {
    setIconFile(null);
    setIconPreview(null);
    markDirty();
  };

  const handleSave = async () => {
    if (!appId) return;
    setSaving(true);
    try {
      let iconUrl: string | null | undefined = undefined;
      if (iconFile) {
        const att = await api.uploadFile(iconFile);
        iconUrl = att.url;
      } else if (!iconPreview && currentApp?.icon) {
        iconUrl = null;
      }

      await updateApplication(appId, {
        name,
        description,
        tags,
        terms_of_service_url: tosUrl || null,
        privacy_policy_url: privacyUrl || null,
        interactions_endpoint_url: interactionsUrl || null,
        custom_install_url: customInstallUrl || null,
        ...(iconUrl !== undefined ? { icon: iconUrl } : {}),
      });
      setIconFile(null);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput('');
      markDirty();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
    markDirty();
  };

  const handleDelete = async () => {
    if (!appId || deleteConfirm !== currentApp?.name) return;
    await deleteApplication(appId);
    navigate('/developers');
  };

  if (!currentApp) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-white mb-6">General Information</h2>

      <div className="space-y-6">
        <div className="flex items-start gap-6">
          <div className="relative group flex-shrink-0">
            <div
              className="w-20 h-20 rounded-xl bg-indigo-600/20 flex items-center justify-center text-3xl font-bold text-indigo-400 cursor-pointer overflow-hidden"
              onClick={() => iconInputRef.current?.click()}
            >
              {iconPreview ? (
                <img src={iconPreview} alt="" className="w-full h-full rounded-xl object-cover" />
              ) : (
                currentApp.name.charAt(0).toUpperCase()
              )}
              <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-medium">Change</span>
              </div>
            </div>
            <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconSelect} className="hidden" />
            {iconPreview && (
              <button
                onClick={handleRemoveIcon}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
              >
                &times;
              </button>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Name</label>
            <input value={name} onChange={e => { setName(e.target.value); markDirty(); }} className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Description</label>
          <textarea value={description} onChange={e => { setDescription(e.target.value); markDirty(); }} rows={4} className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Tags (max 5)</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => (
              <span key={tag} className="px-2 py-1 bg-indigo-600/10 text-indigo-400 rounded text-xs flex items-center gap-1">
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="text-indigo-400/60 hover:text-white">&times;</button>
              </span>
            ))}
          </div>
          {tags.length < 5 && (
            <div className="flex gap-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTag()} placeholder="Add tag" className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <button onClick={handleAddTag} className="px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded text-sm hover:bg-indigo-600/30 transition-colors">Add</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Application ID</label>
            <div className="bg-black/20 border border-white/5 rounded px-3 py-2 text-sm text-gray-400 font-mono select-all">{currentApp.id}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Public Key</label>
            <div className="bg-black/20 border border-white/5 rounded px-3 py-2 text-sm text-gray-400 font-mono truncate select-all">{currentApp.verify_key || 'N/A'}</div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Interactions Endpoint URL</label>
          <input value={interactionsUrl} onChange={e => { setInteractionsUrl(e.target.value); markDirty(); }} placeholder="https://" className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Terms of Service URL</label>
            <input value={tosUrl} onChange={e => { setTosUrl(e.target.value); markDirty(); }} placeholder="https://" className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Privacy Policy URL</label>
            <input value={privacyUrl} onChange={e => { setPrivacyUrl(e.target.value); markDirty(); }} placeholder="https://" className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Custom Install URL</label>
          <input value={customInstallUrl} onChange={e => { setCustomInstallUrl(e.target.value); markDirty(); }} placeholder="https://" className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
        </div>

        <div className="border-t border-white/5 pt-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-gray-400 mb-3">Deleting your application is irreversible. All bot tokens will be invalidated.</p>
          <button onClick={() => setShowDelete(true)} className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-sm font-medium transition-colors">Delete Application</button>
        </div>
      </div>

      {dirty && (
        <div className="fixed bottom-0 left-60 right-0 bg-[#12122a] border-t border-white/10 px-6 py-3 flex items-center justify-between z-40">
          <span className="text-sm text-gray-400">You have unsaved changes</span>
          <div className="flex gap-2">
            <button onClick={loadFields} className="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Reset</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDelete(false)}>
          <div className="bg-[#1e1e3a] rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-400 mb-2">Delete Application</h3>
            <p className="text-sm text-gray-400 mb-4">Type <strong className="text-white">{currentApp.name}</strong> to confirm.</p>
            <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 mb-4" autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirm !== currentApp.name} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
