import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center py-8 sm:py-12">
      <div className="w-full rounded-[2rem] border border-border-default bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_32%),linear-gradient(155deg,rgba(7,19,31,0.98),rgba(17,24,39,0.96))] p-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.28)] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200">Event Radar</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Event Radar</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
          Real-time event intelligence for traders who want the catalyst before the crowd.
        </p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          Single workflow for filings, macro, halts, and breaking headlines.
        </div>
        <Link
          to="/login"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-400"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}
