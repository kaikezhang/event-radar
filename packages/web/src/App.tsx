import { useState, useEffect, useCallback } from 'react';
import { HelpCircle, Settings as SettingsIcon, Volume2, Zap } from 'lucide-react';
import { Outlet, RouterProvider, ScrollRestoration, createBrowserRouter, Link } from 'react-router-dom';
import { cn } from './lib/utils.js';
import { BottomNav } from './components/BottomNav.js';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp.js';
import { TickerSearch } from './components/TickerSearch.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useAudioSquawk } from './hooks/useAudioSquawk.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import { ConnectionProvider, useConnectionStatus } from './contexts/ConnectionContext.js';
import { AuthVerify } from './pages/AuthVerify.js';
import { EventDetail } from './pages/EventDetail.js';
import { Feed } from './pages/Feed.js';
import { Login } from './pages/Login.js';
import { Scorecard } from './pages/Scorecard.js';
import { Search } from './pages/Search.js';
import { Settings } from './pages/Settings.js';
import { TickerProfile } from './pages/TickerProfile.js';
import { Onboarding } from './pages/Onboarding.js';
import { History } from './pages/History.js';
import { Watchlist } from './pages/Watchlist.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { Footer } from './components/Footer.js';
import { About } from './pages/About.js';
import { NotFound } from './pages/NotFound.js';
import { Privacy } from './pages/Privacy.js';
import { Terms } from './pages/Terms.js';

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
  const { user } = useAuth();
  const connectionStatus = useConnectionStatus();

  const statusLabel = connectionStatus === 'connected'
    ? 'Connected'
    : connectionStatus === 'reconnecting'
      ? 'Reconnecting'
      : 'Offline';

  const statusIndicator = (
    <span role="status" aria-label={statusLabel}>
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          connectionStatus === 'connected' && 'bg-emerald-500 animate-pulse',
          connectionStatus === 'reconnecting' && 'bg-amber-500 animate-pulse',
          connectionStatus === 'disconnected' && 'bg-red-500',
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

function AppShell() {
  const [showHelp, setShowHelp] = useState(false);

  const handleShowHelp = useCallback(() => setShowHelp(true), []);
  const handleCloseHelp = useCallback(() => setShowHelp(false), []);

  useKeyboardShortcuts({ onShowHelp: handleShowHelp });

  return (
    <AuthProvider>
      <ConnectionProvider>
        <div className="min-h-screen bg-bg-primary text-text-primary">
          <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-24 pt-[calc(env(safe-area-inset-top)+8px)] lg:max-w-7xl">
            <AppHeader onShowHelp={handleShowHelp} />

            <main className="flex-1">
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </main>
            <Footer />
          </div>
          <BottomNav />
          <ScrollRestoration />
          <GlobalTickerSearch />
          <KeyboardShortcutsHelp open={showHelp} onClose={handleCloseHelp} />
        </div>
      </ConnectionProvider>
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Feed /> },
      { path: 'scorecard', element: <Scorecard /> },
      { path: 'event/:id', element: <EventDetail /> },
      { path: 'ticker/:symbol', element: <TickerProfile /> },
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'watchlist', element: <Watchlist /> },
      { path: 'history', element: <History /> },
      { path: 'search', element: <Search /> },
      { path: 'settings', element: <Settings /> },
      { path: 'login', element: <Login /> },
      { path: 'auth/verify', element: <AuthVerify /> },
      { path: 'about', element: <About /> },
      { path: 'privacy', element: <Privacy /> },
      { path: 'terms', element: <Terms /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
