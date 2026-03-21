import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  PartyPopper,
  Plus,
  Radar,
  Shield,
  TrendingUp,
  X,
} from 'lucide-react';
import { getSuggestedTickers, bulkAddToWatchlist } from '../lib/api.js';
import { useWatchlist } from '../hooks/useWatchlist.js';

const ONBOARDING_KEY = 'onboardingComplete';
const TOTAL_STEPS = 4;

type Step = 1 | 2 | 3 | 4;

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

/* ── Step 1: Welcome ─────────────────────────────────────────────────────── */
function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-default/12">
        <Radar className="h-8 w-8 text-accent-default" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-text-primary">
        Welcome to Event Radar
      </h1>

      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-text-secondary">
        Track market-moving events before they hit the headlines.
      </p>

      <p className="mt-1 text-sm text-text-tertiary">
        Let's set up your feed in 30 seconds.
      </p>

      {/* Sample alert preview */}
      <div className="mt-6 w-full max-w-sm rounded-2xl border border-border-default bg-bg-surface/96 p-4 text-left">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-severity-high/15 text-severity-high">
            HIGH
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-red-400">BEARISH ▼</span>
              <span className="text-xs font-semibold text-text-primary">AAL</span>
            </div>
            <p className="mt-1 text-sm font-medium text-text-primary">
              American Airlines reports unexpected Q4 revenue miss
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-text-secondary">
              <span>$10.43 → $10.12</span>
              <span className="text-red-400">−2.9%</span>
              <span>·</span>
              <span>Breaking News</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-text-tertiary">
          AI-powered event analysis with price tracking — here's what your alerts look like
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent-default px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        Get started
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="mt-4">
        <SkipLink onClick={onSkip} />
      </div>
    </div>
  );
}

/* ── Step 2: Watchlist ───────────────────────────────────────────────────── */
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

  const { items: watchlistItems } = useWatchlist();
  const alreadyOnWatchlist = new Set(watchlistItems.map((w) => w.ticker));

  const { data } = useQuery({
    queryKey: ['onboarding', 'suggested-tickers'],
    queryFn: getSuggestedTickers,
    staleTime: 60_000,
  });

  const trendingTickers = data?.tickers ?? [];
  const packs = data?.packs ?? [];
  const totalSelected = selectedTickers.size;
  const canContinue = totalSelected >= 3;

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = manualInput.trim().toUpperCase();
    if (ticker && /^[A-Z]{1,5}$/.test(ticker)) {
      onManualAdd(ticker);
      setManualInput('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Add tickers to your watchlist</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Add at least 3 tickers to get started.
          </p>
        </div>
        <SkipLink onClick={onSkip} />
      </div>

      {/* Popular quick-add chips */}
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Popular tickers</h2>
        <p className="mt-1 text-sm text-text-secondary">Quick-add the most followed names.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {POPULAR_TICKERS.map((ticker) => {
            const isSelected = selectedTickers.has(ticker);
            const onWL = alreadyOnWatchlist.has(ticker);
            return (
              <button
                key={ticker}
                type="button"
                onClick={() => onToggleTicker(ticker)}
                disabled={onWL}
                aria-label={`Quick add ${ticker}`}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                  isSelected || onWL
                    ? 'border-accent-default/40 bg-accent-default/12 text-accent-default'
                    : 'border-overlay-medium bg-overlay-subtle text-text-secondary hover:bg-overlay-medium hover:text-text-primary'
                } ${onWL ? 'opacity-60' : ''}`}
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {ticker}
              </button>
            );
          })}
        </div>
      </section>

      {/* Sector packs */}
      {packs.length > 0 && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <h2 className="text-[17px] font-semibold text-text-primary">Sector packs</h2>
          <p className="mt-1 text-sm text-text-secondary">One tap to seed a whole theme.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {packs.map((pack) => {
              const allSelected = pack.tickers.every((t) => selectedTickers.has(t));
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

      {/* Trending tickers */}
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
            {trendingTickers.map((t) => {
              const isSelected = selectedTickers.has(t.symbol);
              const onWL = alreadyOnWatchlist.has(t.symbol);
              return (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => onToggleTicker(t.symbol)}
                  disabled={onWL}
                  aria-label={`Quick add ${t.symbol}`}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                    isSelected || onWL
                      ? 'border-accent-default/40 bg-accent-default/12 text-accent-default'
                      : 'border-overlay-medium bg-overlay-subtle text-text-secondary hover:bg-overlay-medium hover:text-text-primary'
                  } ${onWL ? 'opacity-60' : ''}`}
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
      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <h2 className="text-[17px] font-semibold text-text-primary">Add custom ticker</h2>
        <form onSubmit={handleManualAdd} className="mt-3 flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value.toUpperCase())}
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

      {/* Counter + continue */}
      <section className="sticky bottom-20 rounded-2xl border border-border-default bg-bg-primary/95 p-5 shadow-[0_-8px_30px_var(--shadow-color)] backdrop-blur-md">
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

/* ── Step 3: Notifications ───────────────────────────────────────────────── */
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
            {severityLevels.map((s) => (
              <div key={s.level} className="flex items-center justify-between rounded-xl border border-overlay-medium bg-overlay-subtle px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{s.label}</p>
                    <p className="text-xs text-text-tertiary">{s.description}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-text-secondary">{s.pushNote}</span>
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

/* ── Step 4: Done ────────────────────────────────────────────────────────── */
function DoneStep({ onGoToFeed }: { onGoToFeed: () => void }) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    // Trigger confetti animation after mount
    const t = setTimeout(() => setShowConfetti(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      {/* CSS confetti */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="absolute block h-2 w-2 rounded-full opacity-0"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: '-5%',
                backgroundColor: ['#f97316', '#fb923c', '#facc15', '#34d399', '#60a5fa', '#a78bfa'][i % 6],
                animation: `confetti-fall ${1.5 + Math.random() * 1.5}s ease-out ${Math.random() * 0.5}s forwards`,
              }}
            />
          ))}
        </div>
      )}

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/12">
        <PartyPopper className="h-8 w-8 text-emerald-500" />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-text-primary">
        You're all set!
      </h1>

      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-text-secondary">
        Your watchlist is ready. Events will start streaming into your feed immediately.
      </p>

      {/* Scorecard trust cues */}
      <div className="mt-6 w-full max-w-sm rounded-2xl border border-border-default bg-bg-surface/96 p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-accent-default" />
          <p className="text-sm font-semibold text-text-primary">Scorecard & trust cues</p>
        </div>
        <p className="mt-2 text-left text-xs leading-5 text-text-secondary">
          Every alert includes a confidence score and historical pattern match. Check the Scorecard tab to see how our signals have performed over time — full transparency, no black boxes.
        </p>
      </div>

      <button
        type="button"
        onClick={onGoToFeed}
        className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent-default px-6 py-3 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        Go to Feed
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Main Onboarding Component ───────────────────────────────────────────── */
export function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  const bulkAddMutation = useMutation({
    mutationFn: (tickers: string[]) => bulkAddToWatchlist(tickers),
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

  const handleManualAdd = (ticker: string) => {
    setSelectedTickers((prev) => new Set(prev).add(ticker));
  };

  const handleWatchlistContinue = async () => {
    if (selectedTickers.size < 3) return;
    await bulkAddMutation.mutateAsync([...selectedTickers]);
    setStep(3);
  };

  const handleNotificationsContinue = async (enabled: boolean) => {
    if (enabled && 'Notification' in window) {
      try {
        await Notification.requestPermission();
      } catch {
        // Permission denied or unavailable — continue anyway
      }
    }
    setStep(4);
  };

  const handleGoToFeed = () => {
    markComplete();
    navigate('/?tab=watchlist');
  };

  return (
    <div className="relative py-4">
      {/* Step indicator + close */}
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

      {/* Steps */}
      {step === 1 && (
        <WelcomeStep onNext={() => setStep(2)} onSkip={skipToFeed} />
      )}

      {step === 2 && (
        <WatchlistStep
          selectedTickers={selectedTickers}
          onToggleTicker={toggleTicker}
          onAddPack={addPack}
          onManualAdd={handleManualAdd}
          onNext={() => void handleWatchlistContinue()}
          onSkip={skipToFeed}
          isPending={bulkAddMutation.isPending}
        />
      )}

      {step === 3 && (
        <NotificationsStep
          onNext={(enabled) => void handleNotificationsContinue(enabled)}
          onSkip={skipToFeed}
        />
      )}

      {step === 4 && (
        <DoneStep onGoToFeed={handleGoToFeed} />
      )}
    </div>
  );
}
