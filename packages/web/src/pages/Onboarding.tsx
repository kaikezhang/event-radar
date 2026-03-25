import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Plus,
  TrendingUp,
  X,
} from 'lucide-react';
import { getSuggestedTickers, initializeWatchlist } from '../lib/api.js';

const ONBOARDING_KEY = 'onboardingComplete';
const TOTAL_STEPS = 2;

type Step = 1 | 2;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i < current
              ? 'w-6 bg-accent-default'
              : 'w-3 bg-overlay-medium'
          }`}
        />
      ))}
    </div>
  );
}

function SkipLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-text-tertiary transition hover:text-text-secondary"
    >
      Skip setup
    </button>
  );
}

interface WatchlistStepProps {
  selectedTickers: Set<string>;
  onToggleTicker: (ticker: string) => void;
  onAddPack: (tickers: string[]) => void;
  onManualAdd: (ticker: string) => void;
  onNext: () => void;
  onSkip: () => void;
  isPending: boolean;
}

const POPULAR_TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'SPY'];

function WatchlistStep({
  selectedTickers,
  onToggleTicker,
  onAddPack,
  onManualAdd,
  onNext,
  onSkip,
  isPending,
}: WatchlistStepProps) {
  const [manualInput, setManualInput] = useState('');

  const { data } = useQuery({
    queryKey: ['onboarding', 'suggested-tickers'],
    queryFn: getSuggestedTickers,
    staleTime: 60_000,
  });

  const trendingTickers = data?.tickers ?? [];
  const packs = data?.packs ?? [];
  const totalSelected = selectedTickers.size;
  const canContinue = totalSelected >= 3;

  const handleManualAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const ticker = manualInput.trim().toUpperCase();
    if (ticker && /^[A-Z]{1,5}$/.test(ticker)) {
      onManualAdd(ticker);
      setManualInput('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Add tickers to your watchlist</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Add at least 3 tickers to get started.
          </p>
        </div>
        <SkipLink onClick={onSkip} />
      </div>

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Popular tickers</h2>
        <p className="mt-1 text-sm text-text-secondary">Quick-add the most followed names.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR_TICKERS.map((ticker) => {
            const isSelected = selectedTickers.has(ticker);
            return (
              <button
                key={ticker}
                type="button"
                onClick={() => onToggleTicker(ticker)}
                aria-label={`Quick add ${ticker}`}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                  isSelected
                    ? 'border-accent-default/40 bg-accent-default/12 text-accent-default'
                    : 'border-overlay-medium bg-overlay-subtle text-text-secondary hover:bg-overlay-medium hover:text-text-primary'
                }`}
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {ticker}
              </button>
            );
          })}
        </div>
      </section>

      {packs.length > 0 && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <h2 className="text-[17px] font-semibold text-text-primary">Sector packs</h2>
          <p className="mt-1 text-sm text-text-secondary">One tap to seed a whole theme.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {packs.map((pack) => {
              const allSelected = pack.tickers.every((ticker) => selectedTickers.has(ticker));
              return (
                <button
                  key={pack.name}
                  type="button"
                  onClick={() => onAddPack(pack.tickers)}
                  aria-label={`Add ${pack.name} pack`}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-left text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                    allSelected
                      ? 'border-accent-default/40 bg-accent-default/12 text-accent-default'
                      : 'border-overlay-medium bg-bg-elevated/70 text-text-primary hover:bg-overlay-medium'
                  }`}
                >
                  {allSelected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4 text-accent-default" />}
                  <span>{pack.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {trendingTickers.length > 0 && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-default" />
            <h2 className="text-[17px] font-semibold text-text-primary">Trending this week</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Quick-add names with the most high-signal events in the last 7 days.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {trendingTickers.map((ticker) => {
              const isSelected = selectedTickers.has(ticker.symbol);
              return (
                <button
                  key={ticker.symbol}
                  type="button"
                  onClick={() => onToggleTicker(ticker.symbol)}
                  aria-label={`Quick add ${ticker.symbol}`}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                    isSelected
                      ? 'border-accent-default/40 bg-accent-default/12 text-accent-default'
                      : 'border-overlay-medium bg-overlay-subtle text-text-secondary hover:bg-overlay-medium hover:text-text-primary'
                  }`}
                >
                  {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {ticker.symbol}
                  <span className="text-xs text-text-secondary">{ticker.eventCount7d} events</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Add custom ticker</h2>
        <form onSubmit={handleManualAdd} className="mt-3 flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value.toUpperCase())}
            placeholder="Type ticker (e.g. AAPL)"
            maxLength={5}
            className="min-h-11 flex-1 rounded-full border border-overlay-medium bg-overlay-light px-4 py-2 text-[15px] text-text-primary placeholder:text-text-secondary/60 focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
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

      <section className="sticky bottom-20 rounded-2xl border border-border-default bg-bg-primary/95 p-5 shadow-[0_-8px_30px_var(--shadow-color)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[17px] font-semibold text-text-primary">
              You&apos;re watching {totalSelected} ticker{totalSelected !== 1 ? 's' : ''}
            </p>
            {!canContinue && (
              <p className="mt-1 text-sm text-amber-400">
                Add at least {3 - totalSelected} more to continue
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!canContinue || isPending}
            onClick={onNext}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent-default px-5 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Continue'}
            {!isPending && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </section>
    </div>
  );
}

function NotificationsStep({ onNext, onSkip }: { onNext: (enabled: boolean) => void; onSkip: () => void }) {
  const severityLevels = [
    { level: 'CRITICAL', label: 'Critical', description: 'Trading halts, major SEC filings', color: 'bg-severity-critical', pushNote: 'Push + Feed' },
    { level: 'HIGH', label: 'High', description: 'Earnings surprises, analyst upgrades', color: 'bg-severity-high', pushNote: 'Push + Feed' },
    { level: 'MEDIUM', label: 'Medium', description: 'Unusual options flow, social buzz', color: 'bg-severity-medium', pushNote: 'Feed only' },
    { level: 'LOW', label: 'Low', description: 'Routine filings, minor updates', color: 'bg-severity-low', pushNote: 'Feed only' },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Enable notifications</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Get alerted instantly when a critical event hits your watchlist.
            </p>
          </div>
          <SkipLink onClick={onSkip} />
        </div>

        <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-default/12">
              <Bell className="h-5 w-5 text-accent-default" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-text-primary">Push notifications</p>
              <p className="text-xs text-text-secondary">Never miss a market-moving event</p>
            </div>
          </div>

          <div className="space-y-3">
            {severityLevels.map((level) => (
              <div key={level.level} className="flex items-center justify-between rounded-xl border border-overlay-medium bg-overlay-subtle px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${level.color}`} />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{level.label}</p>
                    <p className="text-xs text-text-tertiary">{level.description}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-text-secondary">{level.pushNote}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onNext(true)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-default px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <Bell className="h-4 w-4" />
            Enable notifications
          </button>
          <button
            type="button"
            onClick={() => onNext(false)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-overlay-medium bg-transparent px-6 py-3 text-[15px] font-medium text-text-secondary transition hover:bg-overlay-subtle focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <BellOff className="h-4 w-4" />
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  const initMutation = useMutation({
    mutationFn: (tickers: string[]) => initializeWatchlist(tickers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const markComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  };

  const skipToFeed = () => {
    markComplete();
    navigate('/');
  };

  const toggleTicker = (ticker: string) => {
    setSelectedTickers((previous) => {
      const next = new Set(previous);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  const addPack = (tickers: string[]) => {
    setSelectedTickers((previous) => {
      const next = new Set(previous);
      for (const ticker of tickers) {
        next.add(ticker);
      }
      return next;
    });
  };

  const handleManualAdd = (ticker: string) => {
    setSelectedTickers((previous) => new Set(previous).add(ticker));
  };

  const handleWatchlistContinue = async () => {
    if (selectedTickers.size < 3) {
      return;
    }

    await initMutation.mutateAsync([...selectedTickers]);
    setStep(2);
  };

  const handleNotificationsContinue = async (enabled: boolean) => {
    if (enabled && 'Notification' in window) {
      try {
        await Notification.requestPermission();
      } catch {
        // Permission denied or unavailable, continue to the feed.
      }
    }

    markComplete();
    navigate('/?tab=watchlist');
  };

  return (
    <div className="relative py-4">
      <div className="mb-6 flex items-center justify-between">
        <StepIndicator current={step} total={TOTAL_STEPS} />
        <button
          type="button"
          onClick={skipToFeed}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition hover:bg-overlay-medium hover:text-text-secondary"
          aria-label="Close onboarding"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {step === 1 ? (
        <WatchlistStep
          selectedTickers={selectedTickers}
          onToggleTicker={toggleTicker}
          onAddPack={addPack}
          onManualAdd={handleManualAdd}
          onNext={() => void handleWatchlistContinue()}
          onSkip={skipToFeed}
          isPending={initMutation.isPending}
        />
      ) : (
        <NotificationsStep
          onNext={(enabled) => void handleNotificationsContinue(enabled)}
          onSkip={skipToFeed}
        />
      )}
    </div>
  );
}
