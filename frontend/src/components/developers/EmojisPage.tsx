import { useState, useEffect } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';
import type { AppEmoji } from '../../types';

export default function EmojisPage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const [emojis, setEmojis] = useState<AppEmoji[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (currentApp) {
      setLoading(true);
      api.listAppEmojis(currentApp.id).then((e) => setEmojis(e ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [currentApp]);

  const handleUpload = async () => {
    if (!currentApp || !newName.trim()) return;
    const emoji = await api.createAppEmoji(currentApp.id, newName.trim(), 'placeholder_hash');
    setEmojis([...emojis, emoji]);
    setNewName('');
  };

  const handleDelete = async (id: string) => {
    if (!currentApp) return;
    await api.deleteAppEmoji(currentApp.id, id);
    setEmojis(emojis.filter((e) => e.id !== id));
  };

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">Emojis</h2>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Emoji name"
          className="settings-input flex-1 py-2 px-3 text-sm"
          maxLength={128}
          onKeyDown={(e) => { if (e.key === 'Enter') handleUpload(); }}
        />
        <button onClick={handleUpload} className="btn-primary px-4 py-2 text-sm font-medium">Upload Emoji</button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-riftapp-text-dim text-sm">Loading emojis...</div>
      ) : emojis.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-riftapp-text-dim text-sm">No emojis yet. Upload your first emoji above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {emojis.map((emoji) => (
            <div key={emoji.id} className="flex items-center gap-3 p-3 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 group">
              <div className="w-10 h-10 rounded-lg bg-riftapp-accent/10 flex items-center justify-center text-lg">
                😀
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{emoji.name}</p>
              </div>
              <button
                onClick={() => handleDelete(emoji.id)}
                className="text-riftapp-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
