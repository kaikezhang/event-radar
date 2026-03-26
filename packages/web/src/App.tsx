import { Suspense, lazy, useEffect, useCallback, useState, type ReactNode } from 'react';
import { Settings as SettingsIcon, Zap } from 'lucide-react';
import {
  Outlet,
  RouterProvider,
  ScrollRestoration,
  createBrowserRouter,
  Link,
  type RouteObject,
} from 'react-router-dom';
import { cn } from './lib/utils.js';
import { BottomNav } from './components/BottomNav.js';
import { TickerSearch } from './components/TickerSearch.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ConnectionProvider, useConnectionStatus } from './contexts/ConnectionContext.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

const AuthVerifyPage = lazy(async () => ({ default: (await import('./pages/AuthVerify.js')).AuthVerify }));
const EventDetailPage = lazy(async () => ({ default: (await import('./pages/EventDetail.js')).EventDetail }));
const FeedPage = lazy(async () => ({ default: (await import('./pages/Feed.js')).Feed }));
const LoginPage = lazy(async () => ({ default: (await import('./pages/Login.js')).Login }));
const SearchPage = lazy(async () => ({ default: (await import('./pages/Search.js')).Search }));
const SettingsPage = lazy(async () => ({ default: (await import('./pages/Settings.js')).Settings }));
const TickerProfilePage = lazy(async () => ({ default: (await import('./pages/TickerProfile.js')).TickerProfile }));
const WatchlistPage = lazy(async () => ({ default: (await import('./pages/Watchlist.js')).Watchlist }));
const NotFoundPage = lazy(async () => ({ default: (await import('./pages/NotFound.js')).NotFound }));

export const APP_SHELL_BOTTOM_PADDING_CLASS = 'pb-[calc(7rem+env(safe-area-inset-bottom))]';

function AppHeader() {
  const { user } = useAuth();
  const connectionStatus = useConnectionStatus();

  const statusLabel = connectionStatus === 'connected'
    ? 'Connected'
    : connectionStatus === 'reconnecting'
      ? 'Reconnecting'
      : connectionStatus === 'failed'
        ? 'Connection lost'
        : 'Offline';

  const statusIndicator = (
    <span role="status" aria-label={statusLabel}>
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          connectionStatus === 'connected' && 'bg-emerald-500 animate-pulse',
          connectionStatus === 'reconnecting' && 'bg-amber-500 animate-pulse',
          (connectionStatus === 'disconnected' || connectionStatus === 'failed') && 'bg-red-500',
        )}
        aria-hidden="true"
      />
    </span>
  );

  return (
    <header className="flex h-12 items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-accent-default" />
        <span className="text-sm font-semibold tracking-tight text-text-primary">
          Event Radar
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {statusIndicator}

        {user ? (
          <Link
            to="/settings"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-elevated text-text-secondary hover:text-text-primary transition"
            title="Settings"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link to="/login" className="text-xs font-medium text-accent-default">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

function GlobalTickerSearch() {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }

      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return <TickerSearch open={open} onClose={handleClose} />;
}

function RouteFallback() {
  return <div className="min-h-[40vh]" aria-label="Loading page" />;
}

function loadPage(page: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>;
}

export function AppShell() {
  return (
    <AuthProvider>
      <ConnectionProvider>
        <ShellFrame />
      </ConnectionProvider>
    </AuthProvider>
  );
}

function ShellFrame() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.08),transparent_24%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.05),transparent_22%)]"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="min-h-screen bg-bg-primary text-text-primary">
          <div
            data-testid="app-shell-content"
            className={cn(
              'mx-auto flex min-h-screen w-full flex-col px-4 pt-[calc(env(safe-area-inset-top)+8px)]',
              'max-w-3xl lg:max-w-7xl',
              APP_SHELL_BOTTOM_PADDING_CLASS,
            )}
          >
            <AppHeader />

            <main className="flex-1">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
          </div>
          <BottomNav />
          <ScrollRestoration />
          <GlobalTickerSearch />
        </div>
      </div>
    </div>
  );
}

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: loadPage(<FeedPage />) },
      { path: 'event/:id', element: loadPage(<EventDetailPage />) },
      { path: 'ticker/:symbol', element: loadPage(<TickerProfilePage />) },
      { path: 'watchlist', element: loadPage(<WatchlistPage />) },
      { path: 'search', element: loadPage(<SearchPage />) },
      { path: 'settings', element: loadPage(<SettingsPage />) },
      { path: 'login', element: loadPage(<LoginPage />) },
      { path: 'auth/verify', element: loadPage(<AuthVerifyPage />) },
      { path: '*', element: loadPage(<NotFoundPage />) },
    ],
  },
];

const router = createBrowserRouter(appRoutes);

export function App() {
  return <RouterProvider router={router} />;
}
