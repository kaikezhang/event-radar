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
    setLoading(true);

    try {
      await sendMagicLink(email);
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
        <div className="w-full max-w-sm rounded-[28px] border border-border-default bg-bg-surface p-8 text-center">
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
      <div className="w-full max-w-sm rounded-[28px] border border-border-default bg-bg-surface p-8">
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
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border-default bg-bg-primary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-default focus:outline-none focus:ring-1 focus:ring-accent-default"
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-default px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-default/90 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send magic link'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
