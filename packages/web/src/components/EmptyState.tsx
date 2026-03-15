import { Link } from 'react-router-dom';

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaHref = '/',
}: {
  icon: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-6 text-center shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/6 text-2xl">
        <span aria-hidden="true">{icon}</span>
      </div>
      <h2 className="mb-2 text-[17px] font-semibold leading-[1.4] text-text-primary">{title}</h2>
      <p className="mx-auto mb-5 max-w-sm text-[15px] leading-6 text-text-secondary">
        {description}
      </p>
      <Link
        to={ctaHref}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent-default px-4 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default focus:ring-offset-2 focus:ring-offset-bg-primary"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
