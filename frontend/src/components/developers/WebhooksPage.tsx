import { useState, useEffect } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';
import { api } from '../../api/client';
import type { AppWebhook } from '../../types';

export default function WebhooksPage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const [webhooks, setWebhooks] = useState<AppWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [newEvents, setNewEvents] = useState('');

  useEffect(() => {
    if (currentApp) {
      setLoading(true);
      api.listAppWebhooks(currentApp.id).then((w) => setWebhooks(w ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [currentApp]);

  const handleCreate = async () => {
    if (!currentApp || !newUrl.trim()) return;
    const events = newEvents.split(',').map((e) => e.trim()).filter(Boolean);
    const webhook = await api.createAppWebhook(currentApp.id, newUrl.trim(), newSecret, events);
    setWebhooks([...webhooks, webhook]);
    setNewUrl('');
    setNewSecret('');
    setNewEvents('');
    setShowCreate(false);
  };

  const handleDelete = async (id: string) => {
    if (!currentApp) return;
    await api.deleteAppWebhook(currentApp.id, id);
    setWebhooks(webhooks.filter((w) => w.id !== id));
  };

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Webhooks</h2>
        <button onClick={() => setShowCreate(true)} className="btn-primary px-4 py-2 text-sm font-medium">
          Create Webhook
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-riftapp-text-dim text-sm">Loading webhooks...</div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-riftapp-text-dim text-sm">No webhooks configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="p-4 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{wh.url}</p>
                  <div className="flex gap-2 mt-1.5">
                    {wh.event_types?.map((et) => (
                      <span key={et} className="px-2 py-0.5 rounded-full text-[10px] bg-riftapp-accent/10 text-riftapp-accent font-medium">{et}</span>
                    ))}
                  </div>
                  <p className="text-xs text-riftapp-text-dim mt-1.5">
                    {wh.enabled ? '● Enabled' : '○ Disabled'} · Created {new Date(wh.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => handleDelete(wh.id)} className="text-riftapp-danger text-xs hover:underline ml-4">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="bg-riftapp-content rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Create Webhook</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-riftapp-text-muted uppercase">Endpoint URL</span>
                <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="settings-input w-full mt-1 py-2 px-3 text-sm" placeholder="https://example.com/webhook" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-riftapp-text-muted uppercase">Secret</span>
                <input type="text" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} className="settings-input w-full mt-1 py-2 px-3 text-sm" placeholder="Optional secret" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-riftapp-text-muted uppercase">Events (comma-separated)</span>
                <input type="text" value={newEvents} onChange={(e) => setNewEvents(e.target.value)} className="settings-input w-full mt-1 py-2 px-3 text-sm" placeholder="message_create, member_join" />
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm bg-riftapp-content-elevated rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newUrl.trim()} className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
