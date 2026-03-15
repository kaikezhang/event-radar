import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, TrendingUp } from 'lucide-react';
import { getSuggestedTickers, bulkAddToWatchlist } from '../lib/api.js';
import { useWatchlist } from '../hooks/useWatchlist.js';

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { items: watchlistItems } = useWatchlist();
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [manualInput, setManualInput] = useState('');

  const { data } = useQuery({
    queryKey: ['onboarding', 'suggested-tickers'],
    queryFn: getSuggestedTickers,
    staleTime: 60_000,
  });

  const bulkAddMutation = useMutation({
    mutationFn: (tickers: string[]) => bulkAddToWatchlist(tickers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const trendingTickers = data?.tickers ?? [];
  const packs = data?.packs ?? [];

  const totalSelected = selectedTickers.size;
  const canContinue = totalSelected >= 3;

  const toggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  const addPack = (tickers: string[]) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      for (const t of tickers) next.add(t);
      return next;
    });
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = manualInput.trim().toUpperCase();
    if (ticker && /^[A-Z]{1,5}$/.test(ticker)) {
      setSelectedTickers((prev) => new Set(prev).add(ticker));
      setManualInput('');
    }
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    const tickers = [...selectedTickers];
    await bulkAddMutation.mutateAsync(tickers);
    navigate('/');
  };

  // Already on watchlist (from a prior session)
  const alreadyOnWatchlist = new Set(watchlistItems.map((w) => w.ticker));

  return (
    <div className="space-y-4">
      {/* Welcome header */}
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-default">
          Welcome
        </p>
        <h1 className="mb-1 text-[20px] font-semibold leading-7 text-text-primary">
          Add tickers to get personalized alerts
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Pick at least 3 tickers you care about. Event Radar will surface high-confidence signals for these names.
        </p>
      </section>

      {/* Sector packs */}
      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Sector packs</h2>
        <p className="mt-1 text-sm text-text-secondary">One tap to add an entire sector.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {packs.map((pack) => {
            const allSelected = pack.tickers.every((t) => selectedTickers.has(t));
            return (
              <button
                key={pack.name}
                type="button"
                onClick={() => addPack(pack.tickers)}
                className={`rounded-2xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                  allSelected
                    ? 'border-accent-default/40 bg-accent-default/12'
                    : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">{pack.name}</span>
                  {allSelected && <Check className="h-4 w-4 text-accent-default" />}
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {pack.tickers.join(', ')}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Trending tickers */}
      {trendingTickers.length > 0 && (
        <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-default" />
            <h2 className="text-[17px] font-semibold text-text-primary">Trending this week</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Tickers with the most high-signal events in the last 7 days.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {trendingTickers.map((t) => {
              const isSelected = selectedTickers.has(t.symbol);
              const onWatchlist = alreadyOnWatchlist.has(t.symbol);
              return (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => toggleTicker(t.symbol)}
                  disabled={onWatchlist}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                    isSelected || onWatchlist
                      ? 'border-accent-default/40 bg-accent-default/12 text-accent-default'
                      : 'border-white/10 bg-white/5 text-text-secondary hover:bg-white/8 hover:text-text-primary'
                  } ${onWatchlist ? 'opacity-60' : ''}`}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {t.symbol}
                  <span className="text-xs text-text-secondary">{t.eventCount7d} events</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Manual input */}
      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Add custom ticker</h2>
        <form onSubmit={handleManualAdd} className="mt-3 flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value.toUpperCase())}
            placeholder="Type ticker (e.g. AAPL)"
            maxLength={5}
            className="min-h-11 flex-1 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[15px] text-text-primary placeholder:text-text-secondary/60 focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
            aria-label="Add custom ticker"
          />
          <button
            type="submit"
            disabled={!manualInput.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-default px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
      </section>

      {/* Counter + continue */}
      <section className="sticky bottom-20 rounded-[28px] border border-white/8 bg-bg-primary/95 p-5 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[17px] font-semibold text-text-primary">
              You're watching {totalSelected} ticker{totalSelected !== 1 ? 's' : ''}
            </p>
            {!canContinue && (
              <p className="mt-1 text-sm text-amber-400">
                Add at least {3 - totalSelected} more to continue
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!canContinue || bulkAddMutation.isPending}
            onClick={() => void handleContinue()}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent-default px-5 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:opacity-50"
          >
            {bulkAddMutation.isPending ? 'Saving...' : 'Start watching'}
          </button>
        </div>
      </section>
    </div>
  );
}
