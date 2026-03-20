import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../lib/utils.js';

interface CollapsiblePanelProps {
  id: string;
  title: string;
  eyebrow?: string;
  description?: string;
  defaultOpen?: boolean;
  headerSlot?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function CollapsiblePanel({
  id,
  title,
  eyebrow,
  description,
  defaultOpen = false,
  headerSlot,
  className,
  contentClassName,
  children,
}: CollapsiblePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = `${id}-panel`;

  return (
    <section
      id={id}
      className={cn(
        'rounded-2xl border border-border-default bg-bg-surface/96 p-4 shadow-[0_18px_36px_var(--shadow-color)]',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <div className="flex-1">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {eyebrow}
            </p>
          ) : null}
          <span className="mt-1 block text-[17px] font-semibold leading-6 text-text-primary">
            {title}
          </span>
          {description ? (
            <span className="mt-1 block max-w-2xl text-sm leading-6 text-text-secondary">
              {description}
            </span>
          ) : null}
        </div>
        {headerSlot ? <div className="hidden sm:block">{headerSlot}</div> : null}
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-overlay-medium bg-bg-elevated/70 text-text-secondary">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen ? 'rotate-180' : '')}
            aria-hidden="true"
          />
        </span>
      </button>

      {isOpen ? (
        <div id={panelId} className={cn('mt-4', contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
