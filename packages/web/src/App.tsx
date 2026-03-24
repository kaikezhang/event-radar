import { Suspense, lazy, useState, useEffect, useCallback, type ReactNode } from 'react';
import { HelpCircle, Settings as SettingsIcon, Volume2, Zap } from 'lucide-react';
import {
  Outlet,
  RouterProvider,
  ScrollRestoration,
  createBrowserRouter,
  Link,
  useLocation,
  type RouteObject,
} from 'react-router-dom';
import { cn } from './lib/utils.js';
import { BottomNav } from './components/BottomNav.js';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp.js';
import { TickerSearch } from './components/TickerSearch.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useAudioSquawk } from './hooks/useAudioSquawk.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ConnectionProvider, useConnectionStatus } from './contexts/ConnectionContext.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Footer } from './components/Footer.js';
import { Landing } from './pages/Landing.js';

const AuthVerifyPage = lazy(async () => ({ default: (await import('./pages/AuthVerify.js')).AuthVerify }));
const CalendarPage = lazy(async () => ({ default: (await import('./pages/Calendar.js')).Calendar }));
const EventDetailPage = lazy(async () => ({ default: (await import('./pages/EventDetail.js')).EventDetail }));
const FeedPage = lazy(async () => ({ default: (await import('./pages/Feed.js')).Feed }));
const LoginPage = lazy(async () => ({ default: (await import('./pages/Login.js')).Login }));
const ScorecardPage = lazy(async () => ({ default: (await import('./pages/Scorecard.js')).Scorecard }));
const SearchPage = lazy(async () => ({ default: (await import('./pages/Search.js')).Search }));
const SettingsPage = lazy(async () => ({ default: (await import('./pages/Settings.js')).Settings }));
const TickerProfilePage = lazy(async () => ({ default: (await import('./pages/TickerProfile.js')).TickerProfile }));
const OnboardingPage = lazy(async () => ({ default: (await import('./pages/Onboarding.js')).Onboarding }));
const HistoryPage = lazy(async () => ({ default: (await import('./pages/History.js')).History }));
const WatchlistPage = lazy(async () => ({ default: (await import('./pages/Watchlist.js')).Watchlist }));
const AboutPage = lazy(async () => ({ default: (await import('./pages/About.js')).About }));
const ApiDocsPage = lazy(async () => ({ default: (await import('./pages/ApiDocs.js')).ApiDocs }));
const NotFoundPage = lazy(async () => ({ default: (await import('./pages/NotFound.js')).NotFound }));
const PrivacyPage = lazy(async () => ({ default: (await import('./pages/Privacy.js')).Privacy }));
const TermsPage = lazy(async () => ({ default: (await import('./pages/Terms.js')).Terms }));

export const APP_SHELL_BOTTOM_PADDING_CLASS = 'pb-[calc(7rem+env(safe-area-inset-bottom))]';

function SquawkIndicator() {
  const { preferences, isSpeaking } = useAudioSquawk();

  if (!preferences.enabled) return null;

  return (
    <span
      className={`flex h-5 w-5 items-center justify-center text-accent-default${isSpeaking ? ' animate-pulse' : ''}`}
      title={isSpeaking ? 'Squawk: speaking' : 'Squawk: active'}
    >
      <Volume2 className="h-3.5 w-3.5" />
    </span>
  );
}

function AppHeader({ onShowHelp }: { onShowHelp: () => void }) {
  const { user, isLoading } = useAuth();
  const connectionStatus = useConnectionStatus();
  const location = useLocation();
  const isMarketingRoute = location.pathname === '/pricing' || (location.pathname === '/' && !user && !isLoading);

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

  if (isMarketingRoute) {
    return (
      <header className="flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent-default" />
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            Event Radar
          </span>
        </Link>

        <div className="flex items-center gap-2 text-sm">
          <Link
            to="/pricing"
            className="rounded-full border border-border-default px-3 py-1.5 text-text-secondary transition hover:text-text-primary"
          >
            Pricing
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-accent-default px-3 py-1.5 font-medium text-white transition hover:bg-accent-strong"
          >
            Sign in
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="flex h-12 items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-accent-default" />
        <span className="text-sm font-semibold tracking-tight text-text-primary">
          Event Radar
        </span>
      </Link>

      <div className="flex items-center gap-3">
        <SquawkIndicator />
        {statusIndicator}

        <button
          type="button"
          onClick={onShowHelp}
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:text-text-primary transition"
          title="Keyboard shortcuts"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

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
      // Don't trigger when typing in inputs/textareas
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
  const [showHelp, setShowHelp] = useState(false);

  const handleShowHelp = useCallback(() => setShowHelp(true), []);
  const handleCloseHelp = useCallback(() => setShowHelp(false), []);

  useKeyboardShortcuts({ onShowHelp: handleShowHelp });

  return (
    <AuthProvider>
      <ConnectionProvider>
        <ShellFrame
          showHelp={showHelp}
          onShowHelp={handleShowHelp}
          onCloseHelp={handleCloseHelp}
        />
      </ConnectionProvider>
    </AuthProvider>
  );
}

function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-[40vh]" aria-label="Loading home" />;
  }

  return isAuthenticated ? loadPage(<FeedPage />) : <Landing />;
}

function ShellFrame({
  showHelp,
  onShowHelp,
  onCloseHelp,
}: {
  showHelp: boolean;
  onShowHelp: () => void;
  onCloseHelp: () => void;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const isMarketingRoute = location.pathname === '/pricing'
    || (location.pathname === '/' && !isAuthenticated && !isLoading);

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
              isMarketingRoute ? 'max-w-7xl' : 'max-w-3xl lg:max-w-7xl',
              !isMarketingRoute && APP_SHELL_BOTTOM_PADDING_CLASS,
            )}
          >
            <AppHeader onShowHelp={onShowHelp} />

            <main className="flex-1">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
            <Footer />
          </div>
          {!isMarketingRoute && <BottomNav />}
          <ScrollRestoration />
          {!isMarketingRoute && <GlobalTickerSearch />}
          {!isMarketingRoute && <KeyboardShortcutsHelp open={showHelp} onClose={onCloseHelp} />}
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
      { index: true, element: <HomeRoute /> },
      { path: 'calendar', element: loadPage(<CalendarPage />) },
      { path: 'scorecard', element: loadPage(<ScorecardPage />) },
      { path: 'event/:id', element: loadPage(<EventDetailPage />) },
      { path: 'ticker/:symbol', element: loadPage(<TickerProfilePage />) },
      { path: 'onboarding', element: loadPage(<OnboardingPage />) },
      { path: 'watchlist', element: loadPage(<WatchlistPage />) },
      { path: 'history', element: loadPage(<HistoryPage />) },
      { path: 'search', element: loadPage(<SearchPage />) },
      { path: 'settings', element: loadPage(<SettingsPage />) },
      { path: 'login', element: loadPage(<LoginPage />) },
      { path: 'auth/verify', element: loadPage(<AuthVerifyPage />) },
      { path: 'about', element: loadPage(<AboutPage />) },
      { path: 'api-docs', element: loadPage(<ApiDocsPage />) },
      { path: 'pricing', element: <Landing /> },
      { path: 'privacy', element: loadPage(<PrivacyPage />) },
      { path: 'terms', element: loadPage(<TermsPage />) },
      { path: '*', element: loadPage(<NotFoundPage />) },
    ],
  },
];

const router = createBrowserRouter(appRoutes);

export function App() {
  return <RouterProvider router={router} />;
}
