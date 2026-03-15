import { Home, RadioTower } from 'lucide-react';
import { Outlet, RouterProvider, ScrollRestoration, createBrowserRouter, Link } from 'react-router-dom';
import { BottomNav } from './components/BottomNav.js';
import { EventDetail } from './pages/EventDetail.js';
import { Feed } from './pages/Feed.js';
import { Scorecard } from './pages/Scorecard.js';
import { Search } from './pages/Search.js';
import { Settings } from './pages/Settings.js';
import { TickerProfile } from './pages/TickerProfile.js';
import { Watchlist } from './pages/Watchlist.js';

function AppShell() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
        <header className="mb-4 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-3 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-text-primary transition hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-default/12 text-accent-default">
              <RadioTower className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
                Event Radar
              </span>
              <span className="block text-sm text-text-secondary">Delayed public feed</span>
            </span>
          </Link>

          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <Home className="mr-2 h-4 w-4" />
            Feed
          </Link>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <ScrollRestoration />
    </div>
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
      { path: 'watchlist', element: <Watchlist /> },
      { path: 'search', element: <Search /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
