import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useAppSettingsStore } from './stores/appSettingsStore';
import TitleBar from './components/layout/TitleBar';
import { isProtectedImportUpdateReadyError, safeImport } from './utils/safeImport';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const InviteJoinPage = lazy(() => import('./components/invite/InviteJoinPage'));
const MarketingLayout = lazy(() => import('./components/marketing/MarketingLayout'));
const LandingPage = lazy(() => import('./components/marketing/LandingPage'));
const DiscoverPage = lazy(() => import('./components/marketing/DiscoverPage'));
const SupportPage = lazy(() => import('./components/marketing/SupportPage'));

type SettingsModalModule = typeof import('./components/settings/SettingsModal');
type SettingsModalComponent = ComponentType;

let settingsModalModulePromise: Promise<SettingsModalModule> | null = null;
let settingsModalLoadError: unknown = null;

function importSettingsModal() {
  if (settingsModalLoadError) {
    return Promise.reject(settingsModalLoadError);
  }

  if (!settingsModalModulePromise) {
    settingsModalModulePromise = safeImport(() => import('./components/settings/SettingsModal')).catch((error) => {
      settingsModalModulePromise = null;
      settingsModalLoadError = error;
      throw error;
    });
  }

  return settingsModalModulePromise;
}

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
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

function SettingsModalHost() {
  const closeSettings = useAppSettingsStore((s) => s.closeSettings);
  const [LoadedModal, setLoadedModal] = useState<SettingsModalComponent | null>(null);

  useEffect(() => {
    let cancelled = false;

    void importSettingsModal()
      .then((module) => {
        if (!cancelled) {
          setLoadedModal(() => module.default);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (isProtectedImportUpdateReadyError(error)) {
          closeSettings();
          return;
        }

        queueMicrotask(() => {
          throw error;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [closeSettings]);

  if (!LoadedModal) {
    return null;
  }

  return <LoadedModal />;
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

  useEffect(() => {
    if (!isAuthenticated) {
      settingsModalModulePromise = null;
      settingsModalLoadError = null;
      return;
    }

    void importSettingsModal().catch((error) => {
      if (isProtectedImportUpdateReadyError(error)) {
        return;
      }

      queueMicrotask(() => {
        throw error;
      });
    });
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen">
        <TitleBar />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center bg-riftapp-bg">
              <div className="text-center">
                <h1 className="text-3xl font-bold text-riftapp-accent mb-4 font-display tracking-tight">riftapp</h1>
                <div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            </div>
          }>
            <Routes>
              {/* Public marketing pages */}
              <Route element={<MarketingLayout />}>
                <Route index element={<LandingPage />} />
                <Route path="discover" element={<DiscoverPage />} />
                <Route path="support" element={<SupportPage />} />
              </Route>

              {/* Auth (guest-only) */}
              <Route path="/login" element={<RequireGuest><AuthPage /></RequireGuest>} />
              <Route path="/register" element={<RequireGuest><AuthPage /></RequireGuest>} />

              {/* Invite (top-level for clean share URLs) */}
              <Route path="/invite/:code" element={<RequireAuth><InviteJoinPage /></RequireAuth>} />

              {/* Authenticated app under /app */}
              <Route path="/app/hubs/:hubId/:streamId" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app/hubs/:hubId" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app/dms/:conversationId" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app/dms" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {settingsOpen && isAuthenticated && <SettingsModalHost />}
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  );
}
