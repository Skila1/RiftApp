import { lazy, Suspense, useEffect } from 'react';
import { useAuthStore } from './stores/auth';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AppLayout = lazy(() => import('./components/layout/AppLayout'));

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    restore();
  }, [restore]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-riptide-bg">
        <div className="text-center animate-fade-in">
          <h1 className="text-3xl font-bold text-riptide-accent mb-4 font-display tracking-tight">riptide</h1>
          <div className="w-8 h-8 border-2 border-riptide-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-riptide-bg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-riptide-accent mb-4 font-display tracking-tight">riptide</h1>
          <div className="w-8 h-8 border-2 border-riptide-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    }>
      {isAuthenticated ? <AppLayout /> : <AuthPage />}
    </Suspense>
  );
}
