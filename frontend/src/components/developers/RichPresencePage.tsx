import { useState, useEffect } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';
import type { RichPresenceAsset } from '../../types';

export default function RichPresencePage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const [assets, setAssets] = useState<RichPresenceAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'large' | 'small'>('large');

  useEffect(() => {
    if (currentApp) {
      setLoading(true);
      api.listRichPresenceAssets(currentApp.id).then((a) => setAssets(a ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [currentApp]);

  const handleUpload = async () => {
    if (!currentApp || !newName.trim()) return;
    const asset = await api.createRichPresenceAsset(currentApp.id, newName.trim(), newType, 'placeholder_hash');
    setAssets([...assets, asset]);
    setNewName('');
  };

  const handleDelete = async (id: string) => {
    if (!currentApp) return;
    await api.deleteRichPresenceAsset(currentApp.id, id);
    setAssets(assets.filter((a) => a.id !== id));
  };

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">Rich Presence</h2>

      {/* Art Assets */}
      <div className="mb-8">
        <h3 className="text-sm font-bold mb-4">Art Assets</h3>
        <p className="text-xs text-riftapp-text-dim mb-4">Upload images for Rich Presence display on user profiles.</p>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Asset name"
            className="settings-input flex-1 py-2 px-3 text-sm"
            maxLength={128}
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as 'large' | 'small')}
            className="h-9 px-2 rounded-md bg-riftapp-content-elevated border border-riftapp-border/50 text-sm text-riftapp-text outline-none"
          >
            <option value="large">Large Image</option>
            <option value="small">Small Image</option>
          </select>
          <button onClick={handleUpload} disabled={!newName.trim()} className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">
            Upload
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-riftapp-text-dim text-sm">Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-riftapp-text-dim text-sm">No art assets uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <div key={asset.id} className="flex items-center gap-3 p-3 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 group">
              <div className={`${asset.type === 'large' ? 'w-16 h-16' : 'w-8 h-8'} rounded-lg bg-riftapp-accent/10 flex items-center justify-center`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-riftapp-text-dim">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{asset.name}</p>
                <p className="text-xs text-riftapp-text-dim capitalize">{asset.type} image</p>
              </div>
              <button onClick={() => handleDelete(asset.id)} className="text-riftapp-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      <div className="mt-8 p-6 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40">
        <h3 className="text-sm font-bold mb-3">Preview</h3>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-riftapp-bg flex items-center justify-center">
            <span className="text-xs text-riftapp-text-dim">Large</span>
          </div>
          <div>
            <p className="text-sm font-medium">{currentApp.name}</p>
            <p className="text-xs text-riftapp-text-dim">Playing a game</p>
          </div>
        </div>
      </div>
    </div>
  );
}
