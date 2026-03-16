import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, XCircle } from 'lucide-react';
import { verifyMagicLink, getWatchlist } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.js';

export function AuthVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser, setSuppressInitialCheck } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Suppress AuthContext's initial session check so its 401 doesn't
  // flash "Verification failed" while we're still verifying the token.
  useEffect(() => {
    setSuppressInitialCheck(true);
    return () => { setSuppressInitialCheck(false); };
  }, [setSuppressInitialCheck]);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('Missing token');
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const result = await verifyMagicLink(token!);
        if (!cancelled) {
          setUser(result.user);
          // Redirect to onboarding if watchlist is empty
          let dest = '/';
          try {
            const wl = await getWatchlist();
            if (wl.length === 0) dest = '/onboarding';
          } catch {
            // If watchlist fetch fails, default to home
          }
          navigate(dest, { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Verification failed');
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [searchParams, navigate, setUser]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-[28px] border border-border-default bg-bg-surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-text-primary">Verification failed</h1>
          <p className="text-sm text-text-secondary">{error}</p>
          <a
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-accent-default hover:underline"
          >
            Try signing in again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-accent-default" />
        <p className="mt-4 text-sm text-text-secondary">Verifying your sign-in link...</p>
      </div>
    </div>
  );
}
