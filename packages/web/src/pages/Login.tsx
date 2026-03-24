import { useState } from 'react';
import { Mail, ArrowRight, CheckCircle } from 'lucide-react';
import { sendMagicLink } from '../lib/api.js';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);

    try {
      await sendMagicLink(trimmed);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-surface/96 p-8 text-center shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-7 w-7 text-green-400" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-text-primary">Check your email</h1>
          <p className="text-sm text-text-secondary">
            We sent a sign-in link to <span className="font-medium text-text-primary">{email}</span>.
            Click the link to continue.
          </p>
          <p className="mt-4 text-xs text-text-tertiary">
            The link expires in 15 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-5">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-default">
            Event Radar
          </p>
          <h2 className="text-2xl font-semibold text-text-primary">
            Track market-moving events.
          </h2>
          <p className="text-sm leading-6 text-text-secondary">
            Get alerts that matter.
          </p>
        </div>

        <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-8 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent-default/12">
            <Mail className="h-7 w-7 text-accent-default" />
          </div>
          <h1 className="mb-2 text-center text-xl font-semibold text-text-primary">
            Sign in to Event Radar
          </h1>
          <p className="mb-6 text-center text-sm text-text-secondary">
            Enter your email to receive a magic sign-in link.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              className="w-full rounded-2xl border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-default focus:outline-none focus:ring-1 focus:ring-accent-default"
            />

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-default px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-default/90 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send magic link'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
