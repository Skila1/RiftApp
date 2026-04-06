import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useAppSettingsStore } from './stores/appSettingsStore';
import TitleBar from './components/layout/TitleBar';
import UpdateBar from './components/layout/UpdateBar';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const InviteJoinPage = lazy(() => import('./components/invite/InviteJoinPage'));
const SettingsModal = lazy(() => import('./components/settings/SettingsModal'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-riftapp-bg">
        <div className="text-center animate-fade-in">
          <h1 className="text-3xl font-bold text-riftapp-accent mb-4 font-display tracking-tight">riftapp</h1>
          <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-riftapp-bg">
        <div className="text-center animate-fade-in">
          <h1 className="text-3xl font-bold text-riftapp-accent mb-4 font-display tracking-tight">riftapp</h1>
          <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const restore = useAuthStore((s) => s.restore);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const settingsOpen = useAppSettingsStore((s) => s.settingsOpen);
  const closeSettings = useAppSettingsStore((s) => s.closeSettings);

  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(() => {
    if (!isAuthenticated && settingsOpen) {
      closeSettings();
    }
  }, [closeSettings, isAuthenticated, settingsOpen]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar />
      <UpdateBar />
      <div className="flex-1 min-h-0">
    <BrowserRouter>
      <Suspense fallback={
        <div className="h-full flex items-center justify-center bg-riftapp-bg">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-riftapp-accent mb-4 font-display tracking-tight">riftapp</h1>
            <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      }>
        <Routes>
          <Route path="/login" element={<RequireGuest><AuthPage /></RequireGuest>} />
          <Route path="/register" element={<RequireGuest><AuthPage /></RequireGuest>} />
          <Route path="/invite/:code" element={<RequireAuth><InviteJoinPage /></RequireAuth>} />
          <Route path="/hubs/:hubId/:streamId" element={<RequireAuth><AppLayout /></RequireAuth>} />
          <Route path="/hubs/:hubId" element={<RequireAuth><AppLayout /></RequireAuth>} />
          <Route path="/dms/:conversationId" element={<RequireAuth><AppLayout /></RequireAuth>} />
          <Route path="/dms" element={<RequireAuth><AppLayout /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {settingsOpen && isAuthenticated && <SettingsModal />}
      </Suspense>
    </BrowserRouter>
      </div>
    </div>
  );
}
