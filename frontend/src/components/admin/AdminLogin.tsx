import { useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { adminApi } from '../../api/adminClient';
import { useAdminStore } from '../../stores/adminStore';

type Step = 'credentials' | 'set-password' | '2fa' | 'setup-totp' | 'confirm-totp';

export default function AdminLogin() {
  const loginSuccess = useAdminStore((s) => s.loginSuccess);
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loginToken, setLoginToken] = useState('');
  const [qrUri, setQrUri] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.login(email, password);
      if (res.admin_token) {
        loginSuccess(res.admin_token, res.role || 'moderator', null);
        return;
      }
      if (!res.login_token) {
        setError('Server did not return a login token');
        return;
      }
      setLoginToken(res.login_token);
      if (res.needs_password_set) {
        setStep('set-password');
      } else if (res.needs_setup) {
        const setup = await adminApi.setupTotp(res.login_token);
        setQrUri(setup.qr_uri);
        setTotpSecret(setup.secret);
        setStep('setup-totp');
      } else if (res.requires_2fa) {
        setStep('2fa');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await adminApi.setPassword(loginToken, newPassword);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStep('credentials');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.verify2fa(loginToken, code);
      loginSuccess(res.admin_token, res.role, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTotp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.confirmTotp(loginToken, code);
      loginSuccess(res.admin_token, res.role, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1b1e]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white font-display tracking-tight">riftapp</h1>
          <p className="text-[#949ba4] text-sm mt-2">Admin Panel</p>
        </div>

        <div className="bg-[#2b2d31] rounded-2xl border border-[#3f4147]/60 p-8 shadow-xl">
          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-2">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                  className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00a8fc] transition-colors"
                  placeholder="admin@riftapp.io"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-2">Admin Password</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00a8fc] transition-colors"
                  placeholder="Enter your admin password"
                />
              </div>
              {error && <p className="text-[#ed4245] text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-[#00a8fc] hover:bg-[#0090d6] text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {step === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-14 h-14 bg-[#fee75c]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-[#fee75c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-white">Set Your Admin Password</h2>
                <p className="text-[#949ba4] text-sm mt-1">This account requires a password to be set before first use.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-2">New Password</label>
                <input
                  type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus
                  autoComplete="new-password" minLength={12}
                  className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00a8fc] transition-colors"
                  placeholder="At least 12 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-[#b5bac1] mb-2">Confirm Password</label>
                <input
                  type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
                  autoComplete="new-password"
                  className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00a8fc] transition-colors"
                  placeholder="Repeat your password"
                />
              </div>
              {error && <p className="text-[#ed4245] text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-[#00a8fc] hover:bg-[#0090d6] text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Setting password...' : 'Set Password & Continue'}
              </button>
            </form>
          )}

          {step === '2fa' && (
            <form onSubmit={handleVerify2FA} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-14 h-14 bg-[#00a8fc]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-[#00a8fc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-white">Two-Factor Authentication</h2>
                <p className="text-[#949ba4] text-sm mt-1">Enter the code from your authenticator app</p>
              </div>
              <input
                type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoFocus
                className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-4 text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-[#00a8fc] transition-colors"
                placeholder="000000" maxLength={6}
              />
              {error && <p className="text-[#ed4245] text-sm text-center">{error}</p>}
              <button type="submit" disabled={loading || code.length !== 6}
                className="w-full bg-[#00a8fc] hover:bg-[#0090d6] text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button type="button" onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                className="w-full text-[#949ba4] hover:text-white text-sm transition-colors">
                Back to login
              </button>
            </form>
          )}

          {step === 'setup-totp' && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold text-white">Set Up Two-Factor Authentication</h2>
                <p className="text-[#949ba4] text-sm mt-1">Scan this QR code with your authenticator app</p>
              </div>
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeSVG value={qrUri} size={200} />
                </div>
              </div>
              <div className="bg-[#1e1f22] rounded-lg p-3">
                <p className="text-[#949ba4] text-xs mb-1">Or enter this secret manually:</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-mono text-sm break-all select-all flex-1">{totpSecret}</p>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(totpSecret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                    aria-label="Copy secret to clipboard"
                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded bg-[#3f4147]/60 text-[#b5bac1] hover:text-white hover:bg-[#3f4147] transition-colors">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <button onClick={() => { setStep('confirm-totp'); setCode(''); }}
                className="w-full bg-[#00a8fc] hover:bg-[#0090d6] text-white font-medium py-3 rounded-lg transition-colors">
                I've scanned the code
              </button>
            </div>
          )}

          {step === 'confirm-totp' && (
            <form onSubmit={handleConfirmTotp} className="space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold text-white">Confirm Setup</h2>
                <p className="text-[#949ba4] text-sm mt-1">Enter the 6-digit code from your authenticator to verify</p>
              </div>
              <input
                type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoFocus
                className="w-full bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-4 py-4 text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-[#00a8fc] transition-colors"
                placeholder="000000" maxLength={6}
              />
              {error && <p className="text-[#ed4245] text-sm text-center">{error}</p>}
              <button type="submit" disabled={loading || code.length !== 6}
                className="w-full bg-[#00a8fc] hover:bg-[#0090d6] text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Confirming...' : 'Confirm & Sign In'}
              </button>
              <button type="button" onClick={() => { setStep('setup-totp'); setCode(''); setError(''); }}
                className="w-full text-[#949ba4] hover:text-white text-sm transition-colors">
                Back to QR code
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[#949ba4] text-xs mt-6">
          <a href="/app" className="hover:text-white transition-colors">Back to App</a>
        </p>
      </div>
    </div>
  );
}
