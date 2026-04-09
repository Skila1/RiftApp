import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import { useAppSettingsStore } from './stores/appSettingsStore';
import { usePresenceStore } from './stores/presenceStore';
import { useFrontendUpdateStore } from './stores/frontendUpdateStore';
import { SELF_PRESENCE_STORAGE_KEY } from './stores/selfPresencePersistence';
import TitleBar from './components/layout/TitleBar';
import { isProtectedImportUpdateReadyError, safeImport } from './utils/safeImport';
// Push build cuz yeah hectic

function protectedLazy<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(() => safeImport(loader));
}

const AuthPage = protectedLazy(() => import('./components/auth/AuthPage'));
const AppLayout = protectedLazy(() => import('./components/layout/AppLayout'));
const InviteJoinPage = protectedLazy(() => import('./components/invite/InviteJoinPage'));
const MarketingLayout = protectedLazy(() => import('./components/marketing/MarketingLayout'));
const LandingPage = protectedLazy(() => import('./components/marketing/LandingPage'));
const DiscoverPage = protectedLazy(() => import('./components/marketing/DiscoverPage'));
const SupportPage = protectedLazy(() => import('./components/marketing/SupportPage'));

const DevPortalLayout = protectedLazy(() => import('./components/developers/DevPortalLayout'));
const ApplicationsListPage = protectedLazy(() => import('./components/developers/ApplicationsListPage'));
const GeneralInformationPage = protectedLazy(() => import('./components/developers/GeneralInformationPage'));
const InstallationPage = protectedLazy(() => import('./components/developers/InstallationPage'));
const OAuth2Page = protectedLazy(() => import('./components/developers/OAuth2Page'));
const BotPage = protectedLazy(() => import('./components/developers/BotPage'));
const EmojisPage = protectedLazy(() => import('./components/developers/EmojisPage'));
const WebhooksPage = protectedLazy(() => import('./components/developers/WebhooksPage'));
const RichPresencePage = protectedLazy(() => import('./components/developers/RichPresencePage'));
const AppTestersPage = protectedLazy(() => import('./components/developers/AppTestersPage'));
const AppVerificationPage = protectedLazy(() => import('./components/developers/AppVerificationPage'));
const BotAuthorizePage = protectedLazy(() => import('./components/developers/BotAuthorizePage'));
const ModerationDashboard = protectedLazy(() => import('./components/admin/ModerationDashboard'));
const AdminLogin = protectedLazy(() => import('./components/admin/AdminLogin'));
const AdminPanel = protectedLazy(() => import('./components/admin/AdminPanel'));

type SettingsModalModule = typeof import('./components/settings/SettingsModal');
type SettingsModalComponent = ComponentType;

type RouteChunkErrorBoundaryProps = {
  resetKey: string;
  children: ReactNode;
};

type RouteChunkErrorBoundaryState = {
  error: unknown;
};

let settingsModalModulePromise: Promise<SettingsModalModule> | null = null;
let settingsModalLoadError: unknown = null;

class RouteChunkErrorBoundary extends Component<RouteChunkErrorBoundaryProps, RouteChunkErrorBoundaryState> {
  state: RouteChunkErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): RouteChunkErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    if (isProtectedImportUpdateReadyError(error)) {
      return;
    }

    console.error('Route chunk failed to load:', error);
  }

  componentDidUpdate(prevProps: RouteChunkErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <RouteChunkFailureView error={this.state.error} />;
    }

    return this.props.children;
  }
}

function RouteChunkFailureView({ error }: { error: unknown }) {
  const frontendUpdateReady = useFrontendUpdateStore((s) => s.updateReady);
  const applyFrontendUpdate = useFrontendUpdateStore((s) => s.applyUpdate);
  const protectedImportFailure = isProtectedImportUpdateReadyError(error);

  return (
    <div className="flex h-full items-center justify-center bg-riftapp-bg px-6">
      <div className="w-full max-w-md rounded-2xl border border-riftapp-border/60 bg-riftapp-content-elevated px-6 py-7 text-center shadow-modal">
        <h2 className="text-lg font-semibold text-riftapp-text">
          {protectedImportFailure ? 'Update Ready' : 'Unable To Load Rift'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-riftapp-text-dim">
          {protectedImportFailure
            ? 'This desktop app has an older cached frontend bundle. Reload to fetch the latest build.'
            : 'A frontend chunk failed while this screen was loading. Reload the app and try again.'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (frontendUpdateReady) {
                applyFrontendUpdate();
                return;
              }

              window.location.reload();
            }}
            className="rounded-lg bg-riftapp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-riftapp-accent-hover"
          >
            {frontendUpdateReady || protectedImportFailure ? 'Reload To Update' : 'Reload App'}
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.assign('/login');
            }}
            className="rounded-lg bg-riftapp-content px-4 py-2 text-sm font-medium text-riftapp-text-dim transition-colors hover:bg-riftapp-content-elevated hover:text-riftapp-text"
          >
            Go To Login
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <RouteChunkErrorBoundary resetKey={location.pathname}>
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

        {/* Admin moderation dashboard (legacy) */}
        <Route path="/admin/moderation" element={<RequireAuth><ModerationDashboard /></RequireAuth>} />

        {/* Super Admin Panel */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminPanel />} />

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
    </RouteChunkErrorBoundary>
  );
}

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
            <AppRoutes />
            {settingsOpen && isAuthenticated && <SettingsModalHost />}
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  );
}
