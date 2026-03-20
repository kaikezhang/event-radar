import { ArrowLeft, ExternalLink, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState.js';
import { SkeletonCard } from '../../components/SkeletonCard.js';
import { useEventDetail } from '../../hooks/useEventDetail.js';
import { cn } from '../../lib/utils.js';
import { EventEnrichment, RegimeContextCard } from './EventEnrichment.js';
import { EventHeader } from './EventHeader.js';
import { EventHistory } from './EventHistory.js';
import { EventMarketData } from './EventMarketData.js';
import { EventVerdict } from './EventVerdict.js';
import { getDirectionContextLine, getPrimaryConfidence, getPrimaryDirection } from './utils.js';

function AnchorNav({ activeSection }: { activeSection: string }) {
  const sections = [
    { id: 'verdict', label: 'Summary' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'trust', label: 'Trust' },
  ];

  return (
    <nav className="sticky top-[60px] z-10 flex gap-1 overflow-x-auto rounded-2xl border border-border-default bg-bg-primary/92 px-3 py-2 shadow-[0_8px_20px_rgba(0,0,0,0.18)] backdrop-blur-md" aria-label="Page sections">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => document.getElementById(`zone-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className={cn(
            'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
            activeSection === section.id
              ? 'border-b-2 border-accent-default bg-white/6 text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

function DetailToolbar({
  backLabel,
  onBack,
  onShare,
}: {
  backLabel: string;
  onBack: () => void;
  onShare?: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl border border-border-default bg-bg-primary/92 px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </button>
      {onShare ? (
        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-bg-elevated/70 px-3 py-2 text-text-secondary transition hover:bg-white/6 focus:outline-none focus:ring-2 focus:ring-accent-default"
          aria-label="Share alert"
        >
          <Share2 className="h-5 w-5" />
        </button>
      ) : (
        <Share2 className="h-5 w-5 text-text-secondary" />
      )}
    </div>
  );
}

export function EventDetail({ eventId, onBack }: { eventId?: string; onBack?: () => void } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const id = eventId ?? paramId;
  const isInline = Boolean(eventId);
  const { data, isLoading } = useEventDetail(id);
  const [feedback, setFeedback] = useState<'up' | 'down' | 'bad' | null>(null);
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const [activeSection, setActiveSection] = useState('verdict');
  const shouldFallbackToWatchlist = location.key === 'default';
  const verdictRef = useRef<HTMLDivElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLDivElement>(null);
  const backLabel = isInline ? '← Back to list' : shouldFallbackToWatchlist ? 'Back to watchlist' : 'Back';

  useEffect(() => {
    const refs = [
      { id: 'verdict', ref: verdictRef },
      { id: 'evidence', ref: evidenceRef },
      { id: 'trust', ref: trustRef },
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const match = refs.find((section) => section.ref.current === entry.target);
            if (match) setActiveSection(match.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );

    for (const { ref } of refs) {
      if (ref.current) observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [data]);

  const handleBack = useCallback(() => {
    if (onBack) return onBack();
    if (shouldFallbackToWatchlist) return navigate('/watchlist');
    return navigate(-1);
  }, [navigate, onBack, shouldFallbackToWatchlist]);

  const handleShare = useCallback(() => {
    if (!data) return;
    if (navigator.share) return void navigator.share({ title: data.title, url: window.location.href });
    return void navigator.clipboard?.writeText(window.location.href);
  }, [data]);

  const visibleSimilarEvents = useMemo(() => {
    const similarEvents = data?.historicalPattern.similarEvents ?? [];
    return showAllSimilar ? similarEvents : similarEvents.slice(0, 3);
  }, [data?.historicalPattern.similarEvents, showAllSimilar]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <DetailToolbar backLabel={backLabel} onBack={handleBack} />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="⚠️"
        title="Alert not found"
        description="This event could not be loaded."
        ctaLabel="Back to feed"
      />
    );
  }

  const direction = getPrimaryDirection(data);
  const confidence = getPrimaryConfidence(data);
  const directionContextLine = getDirectionContextLine(direction, data.enrichment);

  return (
    <div className="space-y-4">
      <DetailToolbar backLabel={backLabel} onBack={handleBack} onShare={handleShare} />
      <AnchorNav activeSection={activeSection} />
      <div className="lg:flex lg:gap-6">
        <div className="min-w-0 space-y-4 lg:flex-[2]">
          <div id="zone-verdict" ref={verdictRef} className="scroll-mt-28">
            <EventHeader
              data={data}
              direction={direction}
              confidence={confidence}
              directionContextLine={directionContextLine}
            />
            <EventEnrichment
              summary={data.aiAnalysis.summary}
              enrichment={data.enrichment}
              direction={direction}
              source={data.sourceKey ?? data.source}
              sourceMetadata={data.sourceMetadata}
            />
          </div>

          <div className="border-t-2 border-white/10" />

          <div id="zone-evidence" ref={evidenceRef} className="scroll-mt-28">
            <div className="lg:hidden">
              <EventMarketData data={data} />
            </div>
            <RegimeContextCard regimeContext={data.enrichment?.regimeContext} className="mt-4 lg:mt-0" />
            <EventHistory
              historicalPattern={data.historicalPattern}
              visibleSimilarEvents={visibleSimilarEvents}
              showAllSimilar={showAllSimilar}
              onToggleShowAll={() => setShowAllSimilar((current) => !current)}
            />
          </div>

          <div className="border-t-2 border-white/10" />

          <div id="zone-trust" ref={trustRef} className="scroll-mt-28">
            <EventVerdict data={data} feedback={feedback} onFeedbackChange={setFeedback} />
          </div>
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:flex-1 lg:self-start">
          <EventMarketData data={data} />
          <RegimeContextCard regimeContext={data.enrichment?.regimeContext} />
          <div className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Quick actions
            </p>
            <div className="space-y-2">
              {data.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6"
                >
                  <ExternalLink className="h-4 w-4" /> View original
                </a>
              )}
              <button
                type="button"
                onClick={handleShare}
                className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-bg-elevated/70 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/6"
              >
                <Share2 className="h-4 w-4" /> Share alert
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
