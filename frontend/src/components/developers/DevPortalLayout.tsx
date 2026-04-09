import { useEffect } from 'react';
import { Outlet, useParams, useNavigate, NavLink } from 'react-router-dom';
import { useDeveloperStore } from '../../stores/developerStore';
import { useAuthStore } from '../../stores/auth';

const sidebarLinks = [
  { to: 'information', label: 'General Information' },
  { to: 'installation', label: 'Installation' },
  { to: 'oauth2', label: 'OAuth2' },
  { to: 'bot', label: 'Bot' },
  { to: 'emojis', label: 'Emojis' },
  { to: 'webhooks', label: 'Webhooks' },
  { to: 'rich-presence', label: 'Rich Presence' },
  { to: 'testers', label: 'App Testers' },
  { to: 'verification', label: 'App Verification' },
];

export default function DevPortalLayout() {
  const { appId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const currentApp = useDeveloperStore((s) => s.currentApp);
  const applications = useDeveloperStore((s) => s.applications);
  const fetchApplication = useDeveloperStore((s) => s.fetchApplication);
  const fetchApplications = useDeveloperStore((s) => s.fetchApplications);
  const fetchMe = useDeveloperStore((s) => s.fetchMe);
  const isSuperAdmin = useDeveloperStore((s) => s.isSuperAdmin);

  useEffect(() => {
    fetchMe();
    if (applications.length === 0) fetchApplications();
  }, [fetchMe, fetchApplications, applications.length]);

  useEffect(() => {
    if (appId && (!currentApp || currentApp.id !== appId)) {
      fetchApplication(appId);
    }
  }, [appId, currentApp, fetchApplication]);

  const showSidebar = !!appId;

  return (
    <div className="flex flex-col h-full bg-riftapp-bg text-riftapp-text">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-riftapp-border/40 bg-riftapp-content flex-shrink-0">
        <div className="flex items-center gap-3">
          <NavLink to="/developers" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/icon.png" alt="RiftApp" className="w-6 h-6" />
            <span className="font-bold text-sm tracking-wide uppercase text-riftapp-text-muted">Developer Portal</span>
          </NavLink>
          {isSuperAdmin && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-riftapp-danger/20 text-riftapp-danger uppercase tracking-wider">Admin</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/developers')}
            className="btn-primary px-3 py-1.5 text-xs font-medium"
          >
            + New Application
          </button>
          <div className="w-8 h-8 rounded-full bg-riftapp-accent/20 flex items-center justify-center text-xs font-semibold text-riftapp-accent overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.display_name?.slice(0, 2).toUpperCase() || '?'
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {showSidebar && (
          <nav className="w-60 flex-shrink-0 border-r border-riftapp-border/40 bg-riftapp-panel overflow-y-auto">
            <div className="p-3">
              <button
                onClick={() => navigate('/developers')}
                className="flex items-center gap-2 text-xs text-riftapp-text-muted hover:text-riftapp-text transition-colors mb-3 px-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back to Applications
              </button>

              {/* App selector */}
              <select
                value={appId || ''}
                onChange={(e) => {
                  if (e.target.value) navigate(`/developers/applications/${e.target.value}/information`);
                }}
                className="w-full h-8 px-2 rounded-md bg-riftapp-content-elevated border border-riftapp-border/50 text-sm text-riftapp-text mb-4 outline-none focus:border-riftapp-accent"
              >
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>

              {/* Overview section */}
              <div className="mb-2 px-2">
                <span className="text-[11px] font-bold uppercase text-riftapp-text-dim tracking-wider">Overview</span>
              </div>
              <div className="space-y-0.5">
                {sidebarLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={`/developers/applications/${appId}/${link.to}`}
                    className={({ isActive }) =>
                      `block px-3 py-1.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-riftapp-accent/10 text-riftapp-accent font-medium'
                          : 'text-riftapp-text-muted hover:bg-riftapp-content-elevated/60 hover:text-riftapp-text'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </nav>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
