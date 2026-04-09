import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useAppSettingsStore } from './stores/appSettingsStore';
import { usePresenceStore } from './stores/presenceStore';
import { SELF_PRESENCE_STORAGE_KEY } from './stores/selfPresencePersistence';
import TitleBar from './components/layout/TitleBar';
import { isProtectedImportUpdateReadyError, safeImport } from './utils/safeImport';
// Push build cuz yeah hectic

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const InviteJoinPage = lazy(() => import('./components/invite/InviteJoinPage'));
const MarketingLayout = lazy(() => import('./components/marketing/MarketingLayout'));
const LandingPage = lazy(() => import('./components/marketing/LandingPage'));
const DiscoverPage = lazy(() => import('./components/marketing/DiscoverPage'));
const SupportPage = lazy(() => import('./components/marketing/SupportPage'));

const DevPortalLayout = lazy(() => import('./components/developers/DevPortalLayout'));
const ApplicationsListPage = lazy(() => import('./components/developers/ApplicationsListPage'));
const GeneralInformationPage = lazy(() => import('./components/developers/GeneralInformationPage'));
const InstallationPage = lazy(() => import('./components/developers/InstallationPage'));
const OAuth2Page = lazy(() => import('./components/developers/OAuth2Page'));
const BotPage = lazy(() => import('./components/developers/BotPage'));
const EmojisPage = lazy(() => import('./components/developers/EmojisPage'));
const WebhooksPage = lazy(() => import('./components/developers/WebhooksPage'));
const RichPresencePage = lazy(() => import('./components/developers/RichPresencePage'));
const AppTestersPage = lazy(() => import('./components/developers/AppTestersPage'));
const AppVerificationPage = lazy(() => import('./components/developers/AppVerificationPage'));
const BotAuthorizePage = lazy(() => import('./components/developers/BotAuthorizePage'));

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
  const user = useAuthStore((s) => s.user);
  const setUserStatus = useAuthStore((s) => s.setUserStatus);
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

  useEffect(() => {
    if (!user) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SELF_PRESENCE_STORAGE_KEY) {
        return;
      }

      const resolvedStatus = usePresenceStore.getState().hydrateSelfPresence(user.id, user.status);
      setUserStatus(resolvedStatus);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [setUserStatus, user]);

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

              {/* Bot authorization / invite page */}
              <Route path="/oauth2/authorize" element={<RequireAuth><BotAuthorizePage /></RequireAuth>} />

              {/* Developer Portal */}
              <Route path="/developers" element={<RequireAuth><DevPortalLayout /></RequireAuth>}>
                <Route index element={<ApplicationsListPage />} />
                <Route path=":appId">
                  <Route index element={<GeneralInformationPage />} />
                  <Route path="installation" element={<InstallationPage />} />
                  <Route path="oauth2" element={<OAuth2Page />} />
                  <Route path="bot" element={<BotPage />} />
                  <Route path="emojis" element={<EmojisPage />} />
                  <Route path="webhooks" element={<WebhooksPage />} />
                  <Route path="rich-presence" element={<RichPresencePage />} />
                  <Route path="testers" element={<AppTestersPage />} />
                  <Route path="verification" element={<AppVerificationPage />} />
                </Route>
              </Route>

              {/* Authenticated app under /app */}
              <Route path="/app/hubs/:hubId/:streamId" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app/hubs/:hubId" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app/dms/:conversationId" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app/dms" element={<RequireAuth><AppLayout /></RequireAuth>} />
              <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>} />

              {/* Developer Portal */}
              <Route path="/developers" element={<RequireAuth><DevPortalLayout /></RequireAuth>}>
                <Route index element={<ApplicationsListPage />} />
                <Route path="applications/:appId/information" element={<GeneralInformationPage />} />
                <Route path="applications/:appId/installation" element={<InstallationPage />} />
                <Route path="applications/:appId/oauth2" element={<OAuth2Page />} />
                <Route path="applications/:appId/bot" element={<BotPage />} />
                <Route path="applications/:appId/emojis" element={<EmojisPage />} />
                <Route path="applications/:appId/webhooks" element={<WebhooksPage />} />
                <Route path="applications/:appId/rich-presence" element={<RichPresencePage />} />
                <Route path="applications/:appId/testers" element={<AppTestersPage />} />
                <Route path="applications/:appId/verification" element={<AppVerificationPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {settingsOpen && isAuthenticated && <SettingsModalHost />}
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  );
}
