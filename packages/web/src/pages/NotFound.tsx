import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center py-8">
      <section className="w-full rounded-3xl border border-border-default bg-bg-surface/96 p-8 text-center shadow-[0_18px_40px_var(--shadow-color)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
          Navigation error
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-text-primary">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent-default px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          Go to Feed →
        </Link>
      </section>
    </div>
  );
}
