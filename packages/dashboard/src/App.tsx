import { useState, useEffect } from 'react';
import { LayoutDashboard, ScrollText, History, Radio, Bell } from 'lucide-react';
import { Overview } from './pages/Overview.js';
import { AuditTrail } from './pages/AuditTrail.js';
import { Historical } from './pages/Historical.js';
import { AlertFeed } from './pages/AlertFeed.js';
import { cn } from './lib/utils.js';

type Page = 'overview' | 'audit' | 'historical' | 'alerts';

const tabs: { id: Page; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'audit', label: 'Audit Trail', icon: ScrollText },
  { id: 'historical', label: 'Historical', icon: History },
];

export function App() {
  const [page, setPage] = useState<Page>('overview');
  const [tick, setTick] = useState(0);

  // Pulse indicator every 10s to show auto-refresh is working
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-radar-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-radar-border bg-radar-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-radar-green" />
            <span className="font-mono text-sm font-bold tracking-wider">EVENT RADAR</span>
          </div>

          <nav className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  page === id
                    ? 'bg-radar-green/10 text-radar-green'
                    : 'text-radar-text-muted hover:bg-white/5 hover:text-radar-text',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div
              key={tick}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-radar-green"
            />
            <span className="text-xs text-radar-text-muted">Auto-refresh</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {page === 'overview' && <Overview />}
        {page === 'alerts' && <AlertFeed />}
        {page === 'audit' && <AuditTrail />}
        {page === 'historical' && <Historical />}
      </main>
    </div>
  );
}
