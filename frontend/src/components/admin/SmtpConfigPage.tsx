import { useEffect, useState } from 'react';
import { adminApi, type SmtpConfig } from '../../api/adminClient';

const DEFAULTS: SmtpConfig = {
  host: '', port: 587, username: '', password: '', from_address: '', from_name: 'RiftApp',
  tls_enabled: true, enabled: false, updated_at: '',
};

export default function SmtpConfigPage() {
  const [config, setConfig] = useState<SmtpConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testStatusType, setTestStatusType] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testStatusMsg, setTestStatusMsg] = useState('');

  useEffect(() => {
    adminApi.getSmtpConfig()
      .then((c) => setConfig({ ...c, password: '' }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await adminApi.updateSmtpConfig(config);
      setConfig({ ...res, password: '' });
      setSuccess('SMTP configuration saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const trimmed = testEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setTestStatusType('error');
      setTestStatusMsg('Please enter a valid email address');
      return;
    }
    setTestStatusType('sending');
    setTestStatusMsg('Sending...');
    try {
      await adminApi.sendTestEmail(trimmed);
      setTestStatusType('success');
      setTestStatusMsg('Test email sent successfully');
    } catch (err) {
      setTestStatusType('error');
      setTestStatusMsg(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">SMTP Configuration</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Enable SMTP</h2>
              <p className="text-xs text-[#949ba4] mt-0.5">Allow the platform to send emails</p>
            </div>
            <button type="button" onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={`w-11 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-[#00a8fc]' : 'bg-[#4e5058]'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${config.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Host" value={config.host} onChange={(v) => setConfig((c) => ({ ...c, host: v }))} placeholder="smtp.example.com" />
            <Field label="Port" value={String(config.port)} onChange={(v) => setConfig((c) => ({ ...c, port: parseInt(v) || 587 }))} placeholder="587" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Username" value={config.username} onChange={(v) => setConfig((c) => ({ ...c, username: v }))} placeholder="user@example.com" />
            <Field label="Password" value={config.password} onChange={(v) => setConfig((c) => ({ ...c, password: v }))} placeholder="Leave blank to keep current" type="password" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="From Address" value={config.from_address} onChange={(v) => setConfig((c) => ({ ...c, from_address: v }))} placeholder="noreply@riftapp.io" />
            <Field label="From Name" value={config.from_name} onChange={(v) => setConfig((c) => ({ ...c, from_name: v }))} placeholder="RiftApp" />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={config.tls_enabled} onChange={(e) => setConfig((c) => ({ ...c, tls_enabled: e.target.checked }))}
              className="w-4 h-4 rounded border-[#3f4147] bg-[#1e1f22]" />
            <label className="text-sm text-[#b5bac1]">Enable TLS</label>
          </div>
        </div>

        {error && <p className="text-[#ed4245] text-sm">{error}</p>}
        {success && <p className="text-[#57f287] text-sm">{success}</p>}

        <button type="submit" disabled={saving}
          className="px-6 py-2.5 bg-[#00a8fc] hover:bg-[#0090d6] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </form>

      <div className="mt-8 bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Send Test Email</h2>
        <div className="flex gap-3">
          <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="recipient@example.com"
            className="flex-1 bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a8fc]" />
          <button onClick={handleTest} disabled={!testEmail}
            className="px-5 py-2.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            Send Test
          </button>
        </div>
        {testStatusMsg && <p className={`text-sm mt-3 ${testStatusType === 'success' ? 'text-[#57f287]' : testStatusType === 'sending' ? 'text-[#949ba4]' : 'text-[#ed4245]'}`}>{testStatusMsg}</p>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00a8fc] transition-colors" />
    </div>
  );
}
