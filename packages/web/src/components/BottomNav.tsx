import { Eye, House, Search, Settings2, Target } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils.js';

const navItems = [
  { to: '/', label: 'Feed', icon: House, end: true },
  { to: '/scorecard', label: 'Scorecard', icon: Target, end: false },
  { to: '/watchlist', label: 'Watchlist', icon: Eye, end: false },
  { to: '/search', label: 'Search', icon: Search, end: false },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-bg-primary/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-3xl grid-cols-5 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium text-text-secondary transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                isActive && 'bg-white/6 text-text-primary',
              )
            }
          >
            <Icon className="mb-1 h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
