import { useState } from 'react';
import { useDeveloperStore } from '../../stores/developerStore';

export default function InstallationPage() {
  const { currentApp } = useDeveloperStore();
  const [copied, setCopied] = useState(false);

  const installUrl = currentApp
    ? `${window.location.origin}/oauth2/authorize?client_id=${currentApp.id}&scope=bot&permissions=0`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(installUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-white mb-6">Installation</h2>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Install Link</h3>
          <p className="text-sm text-gray-400 mb-3">
            Share this link to let others add your bot to their hubs.
          </p>
          <div className="bg-black/20 border border-white/5 rounded px-3 py-2 text-sm text-indigo-400 font-mono break-all select-all">
            {installUrl}
          </div>
          <button
            onClick={handleCopy}
            className="mt-2 px-4 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded text-sm transition-colors"
          >
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h3 className="text-sm font-semibold text-white mb-3">Default Install Settings</h3>
          <div className="bg-[#12122a] border border-white/5 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Hub Install</label>
                <div className="text-sm text-gray-300">Default scopes: bot</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">User Install</label>
                <div className="text-sm text-gray-500">Not available</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
