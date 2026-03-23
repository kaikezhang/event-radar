import { BarChart3, Eye, House, Search, Settings2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils.js';

const navItems = [
  { to: '/', label: 'Feed', icon: House, end: true, badge: null },
  { to: '/watchlist', label: 'Watchlist', icon: Eye, end: false, badge: null },
  { to: '/scorecard', label: 'Scorecard', icon: BarChart3, end: false, badge: null },
  { to: '/search', label: 'Search', icon: Search, end: false, badge: null },
  { to: '/settings', label: 'Settings', icon: Settings2, end: false, badge: null },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-bg-primary/95 backdrop-blur-xl">
      <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {navItems.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
                isActive
                  ? 'text-interactive-default'
                  : 'text-text-tertiary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.5} />
                <span>{label}</span>
                {badge && (
                  <span className="absolute -right-0.5 top-0.5 rounded-full bg-interactive-default/20 px-1 text-[7px] font-bold uppercase tracking-wider text-interactive-default">
                    {badge}
                  </span>
                )}
                {isActive && (
                  <span className="mt-0.5 h-0.5 w-4 rounded-full bg-interactive-default" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
