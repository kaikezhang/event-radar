import type { ReactNode } from 'react';
import { cn } from '../lib/utils.js';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-radar-border bg-radar-surface p-4',
        className,
      )}
    >
      {title && (
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-radar-text-muted">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
