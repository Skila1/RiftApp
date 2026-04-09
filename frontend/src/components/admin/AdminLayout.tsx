import { useEffect, lazy, Suspense } from 'react';
import { useAdminStore, type AdminSection } from '../../stores/adminStore';

const DashboardPage = lazy(() => import('./DashboardPage'));
const UsersPage = lazy(() => import('./UsersPage'));
const HubsPage = lazy(() => import('./HubsPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const SessionsPage = lazy(() => import('./SessionsPage'));
const StatusPage = lazy(() => import('./StatusPage'));
const SmtpConfigPage = lazy(() => import('./SmtpConfigPage'));
const AdminSettingsPage = lazy(() => import('./AdminSettingsPage'));

const NAV_ITEMS: { id: AdminSection; label: string; icon: string; minRole: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', minRole: 'moderator' },
  { id: 'users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', minRole: 'moderator' },
  { id: 'hubs', label: 'Hubs', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', minRole: 'admin' },
  { id: 'reports', label: 'Reports', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z', minRole: 'moderator' },
  { id: 'sessions', label: 'Sessions', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z', minRole: 'admin' },
  { id: 'status', label: 'Status', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', minRole: 'admin' },
  { id: 'smtp', label: 'SMTP', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', minRole: 'super_admin' },
  { id: 'settings', label: 'Admin Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', minRole: 'super_admin' },
];

const ROLE_LEVELS: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1 };

function hasAccess(userRole: string, minRole: string) {
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

export default function AdminLayout() {
  const { activeSection, setSection, role, adminUser, logout, restore, isAuthenticated } = useAdminStore();

  useEffect(() => {
    restore();
  }, [restore]);

  if (!isAuthenticated) {
    return null;
  }

  const filteredNav = NAV_ITEMS.filter((item) => hasAccess(role || '', item.minRole));

  return (
    <div className="flex h-screen bg-[#1a1b1e] text-white">
      {/* Sidebar */}
      <aside className="w-[240px] bg-[#2b2d31] border-r border-[#3f4147]/40 flex flex-col shrink-0">
        <div className="p-5 border-b border-[#3f4147]/40">
          <h1 className="text-lg font-bold font-display tracking-tight text-white">riftapp</h1>
          <p className="text-[11px] text-[#949ba4] uppercase tracking-wider mt-0.5">Admin Panel</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {filteredNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeSection === item.id
                  ? 'bg-[#00a8fc]/15 text-[#00a8fc]'
                  : 'text-[#b5bac1] hover:bg-[#35373c] hover:text-white'
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#3f4147]/40">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#00a8fc] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(adminUser?.display_name || adminUser?.username || '?')[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{adminUser?.display_name || adminUser?.username || 'Admin'}</p>
              <p className="text-[11px] text-[#949ba4] capitalize">{role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-[#ed4245] hover:bg-[#ed4245]/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>}>
          {activeSection === 'dashboard' && <DashboardPage />}
          {activeSection === 'users' && <UsersPage />}
          {activeSection === 'hubs' && <HubsPage />}
          {activeSection === 'reports' && <ReportsPage />}
          {activeSection === 'sessions' && <SessionsPage />}
          {activeSection === 'status' && <StatusPage />}
          {activeSection === 'smtp' && <SmtpConfigPage />}
          {activeSection === 'settings' && <AdminSettingsPage />}
        </Suspense>
      </main>
    </div>
  );
}
