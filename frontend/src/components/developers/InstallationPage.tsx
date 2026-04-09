import { useDeveloperStore } from '../../stores/developerStore';

export default function InstallationPage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  const installLink = `${window.location.origin}/api/oauth2/authorize?client_id=${currentApp.id}&scope=bot&permissions=0`;

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">Installation</h2>

      {/* Install Link */}
      <div className="mb-8">
        <span className="section-label">Install Link</span>
        <p className="text-xs text-riftapp-text-dim mt-1 mb-3">Choose how users can install your app.</p>

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 rounded-xl bg-riftapp-content-elevated border border-riftapp-accent/40 cursor-pointer">
            <input type="radio" name="installType" defaultChecked className="accent-riftapp-accent" />
            <div>
              <p className="text-sm font-medium">RiftApp Provided Link</p>
              <p className="text-xs text-riftapp-text-dim">Use the default authorization URL.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 cursor-pointer opacity-60">
            <input type="radio" name="installType" disabled />
            <div>
              <p className="text-sm font-medium">Custom URL</p>
              <p className="text-xs text-riftapp-text-dim">Provide your own install URL.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 cursor-pointer opacity-60">
            <input type="radio" name="installType" disabled />
            <div>
              <p className="text-sm font-medium">None</p>
              <p className="text-xs text-riftapp-text-dim">Disable install link.</p>
            </div>
          </label>
        </div>
      </div>

      {/* Default Install Settings */}
      <div className="mb-8">
        <h3 className="text-sm font-bold mb-3">Default Install Settings</h3>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40">
            <h4 className="text-sm font-medium mb-2">Guild Install</h4>
            <p className="text-xs text-riftapp-text-dim mb-3">Default settings when installed to a server.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-riftapp-bg rounded-lg px-3 py-2 text-xs font-mono text-riftapp-accent truncate border border-riftapp-border/30">
                {installLink}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(installLink)}
                className="px-3 py-2 text-xs bg-riftapp-panel rounded-lg hover:bg-riftapp-bg transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40 opacity-60">
            <h4 className="text-sm font-medium mb-2">User Install</h4>
            <p className="text-xs text-riftapp-text-dim">Default settings when installed by a user. Coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
