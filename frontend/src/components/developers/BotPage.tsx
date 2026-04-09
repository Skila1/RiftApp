import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useDeveloperStore } from '../../stores/developerStore';
import type { User } from '../../types';

export default function BotPage() {
  const { appId } = useParams();
  const { updateApplication, resetBotToken } = useDeveloperStore();
  const [bot, setBot] = useState<User | null>(null);
  const [botPublic, setBotPublic] = useState(true);
  const [requireCodeGrant, setRequireCodeGrant] = useState(false);
  const [flags, setFlags] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const PRESENCE_INTENT = 1 << 8;
  const MEMBERS_INTENT = 1 << 9;
  const CONTENT_INTENT = 1 << 15;

  useEffect(() => {
    if (!appId) return;
    api.getBotSettings(appId).then(res => {
      setBot(res.bot);
      setBotPublic(res.bot_public);
      setRequireCodeGrant(res.bot_require_code_grant);
      setFlags(res.flags);
      setAvatarPreview(res.bot.avatar_url || null);
    });
  }, [appId]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleReset = async () => {
    if (!appId) return;
    if (!confirm('This will invalidate the current bot token. Are you sure?')) return;
    const newToken = await resetBotToken(appId);
    setToken(newToken);
    setShowToken(true);
  };

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 1000);
  };

  const handleSave = async () => {
    if (!appId) return;
    setSaving(true);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const att = await api.uploadFile(avatarFile);
        avatarUrl = att.url;
      }

      await api.updateBotSettings(appId, {
        bot_public: botPublic,
        bot_require_code_grant: requireCodeGrant,
        flags,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });
      await updateApplication(appId, { bot_public: botPublic, bot_require_code_grant: requireCodeGrant, flags });
      setAvatarFile(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = (flag: number) => {
    setFlags(prev => prev ^ flag);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-xl font-semibold text-white mb-6">Bot</h2>

      {bot && (
        <div className="bg-[#12122a] border border-white/5 rounded-lg p-4 mb-6 flex items-center gap-4">
          <div className="relative group">
            <div
              className="w-16 h-16 rounded-full bg-indigo-600/20 flex items-center justify-center text-2xl font-bold text-indigo-400 cursor-pointer overflow-hidden"
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full rounded-full object-cover" /> : bot.display_name?.charAt(0).toUpperCase()}
              <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[10px] font-medium">Change</span>
              </div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{bot.display_name || bot.username}</h3>
            <p className="text-xs text-gray-500 font-mono">{bot.id}</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-white mb-2">Token</h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm font-mono text-gray-400">
              {showToken && token ? token : '••••••••••••••••••••••••'}
            </div>
            <button onClick={handleCopyToken} className="px-3 py-2 bg-[#2d2d5e] hover:bg-[#3d3d6e] text-gray-200 rounded text-sm transition-colors">{tokenCopied ? 'Copied' : 'Copy'}</button>
            <button onClick={handleReset} className="px-3 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded text-sm transition-colors">Reset</button>
          </div>
          {showToken && token && (
            <p className="text-xs text-yellow-500 mt-1">Copy your token now. You won't be able to see it again.</p>
          )}
        </div>

        <div className="border-t border-white/5 pt-4">
          <h3 className="text-sm font-semibold text-white mb-4">Privileged Gateway Intents</h3>
          <div className="space-y-4">
            {[
              { flag: PRESENCE_INTENT, label: 'Presence Intent', desc: 'Receive presence update events' },
              { flag: MEMBERS_INTENT, label: 'Server Members Intent', desc: 'Receive member-related events' },
              { flag: CONTENT_INTENT, label: 'Message Content Intent', desc: 'Receive message content in events' },
            ].map(({ flag, label, desc }) => (
              <label key={flag} className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input type="checkbox" checked={(flags & flag) !== 0} onChange={() => toggleFlag(flag)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-600 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-white/5 pt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={botPublic} onChange={e => setBotPublic(e.target.checked)} className="w-4 h-4 rounded border-gray-600 bg-black/30 text-indigo-600 focus:ring-indigo-500" />
            <div>
              <p className="text-sm font-medium text-white">Public Bot</p>
              <p className="text-xs text-gray-400">Allow others to add your bot to their hubs</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={requireCodeGrant} onChange={e => setRequireCodeGrant(e.target.checked)} className="w-4 h-4 rounded border-gray-600 bg-black/30 text-indigo-600 focus:ring-indigo-500" />
            <div>
              <p className="text-sm font-medium text-white">Require OAuth2 Code Grant</p>
              <p className="text-xs text-gray-400">Require users to go through OAuth2 flow to add your bot</p>
            </div>
          </label>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
