import { useState } from 'react';
import { useAuthStore } from '../../stores/auth';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password, email || undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-riftapp-bg">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-riftapp-accent tracking-tight font-display">
            riftapp
          </h1>
          <p className="text-riftapp-text-muted mt-2 text-sm">
            Instant communication.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-riftapp-surface rounded-xl p-6 border border-riftapp-border/60 shadow-elevation-md"
        >
          <h2 className="text-lg font-bold mb-4 tracking-tight">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-riftapp-danger/10 text-riftapp-danger text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="section-label mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="settings-input"
                placeholder="Enter username"
                required
                minLength={2}
                maxLength={32}
                autoFocus
              />
            </div>

            {!isLogin && (
              <div className="animate-fade-in">
                <label className="section-label mb-1.5">
                  Email <span className="text-riftapp-text-dim font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="settings-input"
                  placeholder="Enter email"
                />
              </div>
            )}

            <div>
              <label className="section-label mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="settings-input"
                placeholder="Enter password"
                required
                minLength={8}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-5 py-2.5 rounded-lg bg-riftapp-accent hover:bg-riftapp-accent-hover
              text-white font-medium transition-all duration-150 disabled:opacity-50
              active:translate-y-px shadow-lg shadow-riftapp-accent/20 hover:shadow-riftapp-accent/30"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
                </svg>
                {isLogin ? 'Logging in…' : 'Creating account…'}
              </span>
            ) : isLogin ? 'Log In' : 'Register'}
          </button>

          <p className="text-center text-sm text-riftapp-text-muted mt-4">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-riftapp-accent hover:underline font-medium"
            >
              {isLogin ? 'Register' : 'Log In'}
            </button>
          </p>
        </form>

        <p className="text-center text-xs text-riftapp-text-dim mt-6">
          Fast. Clean. Yours.
        </p>
      </div>
    </div>
  );
}
