import { cn } from '../../lib/utils.js';
import type { LlmEnrichment } from '../../types/index.js';
import { EventSourceCard } from './EventSourceCard.js';
import { SectionHeading } from './shared.js';
import { deriveBullBear } from './utils.js';

/** Summary tab content: What Happened + Bull/Bear Thesis */
export function EventSummaryContent({
  summary,
  enrichment,
  direction,
  severity,
}: {
  summary: string;
  enrichment: LlmEnrichment | null;
  direction: string;
  severity: string;
}) {
  const { bullPoints, bearPoints } = deriveBullBear(enrichment, direction);

  return (
    <>
      <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <SectionHeading eyebrow="Catalyst / event summary" title="What Happened" />
        <p className="text-[15px] leading-relaxed text-text-primary">{summary}</p>
      </section>

      <div className="mt-4">
        <BullBearColumns bullPoints={bullPoints} bearPoints={bearPoints} severity={severity} />
      </div>
    </>
  );
}

/** Evidence tab content: Market Context + Source Details + Risk Factors */
export function EventEvidenceContent({
  enrichment,
  eventUrl,
  rawExcerpt,
  source,
  sourceMetadata,
}: {
  enrichment: LlmEnrichment | null;
  eventUrl: string | null;
  rawExcerpt: string | null;
  source: string;
  sourceMetadata?: Record<string, unknown>;
}) {
  const whyNowBullets = [enrichment?.impact, enrichment?.whyNow, enrichment?.currentSetup].filter(
    (value): value is string => Boolean(value),
  );
  const accessionNumber = typeof sourceMetadata?.accessionNumber === 'string'
    ? sourceMetadata.accessionNumber
    : null;
  const edgarUrl = accessionNumber
    ? `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(accessionNumber)}`
    : null;
  const sourceTypeLabel = getSourceTypeLabel(source);
  const hasEvidence = Boolean(eventUrl || rawExcerpt || edgarUrl);

  const hasSourceCard = sourceMetadata && Object.keys(sourceMetadata).length > 0;
  const hasContent = whyNowBullets.length > 0 || hasSourceCard || enrichment?.risks || enrichment?.filingItems?.length || hasEvidence;

  return (
    <>
      <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <SectionHeading eyebrow="Original source evidence" title="Source Evidence" />
        <div className="space-y-4 text-sm leading-6 text-text-secondary">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">Source type</p>
            <p className="mt-1 text-text-primary">{sourceTypeLabel}</p>
          </div>

          {eventUrl ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">Source URL</p>
              <a
                href={eventUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center break-all text-accent-default hover:underline"
                aria-label="Source URL"
              >
                {eventUrl}
              </a>
            </div>
          ) : null}

          {rawExcerpt ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">Original filing excerpt:</p>
              <p className="mt-1 whitespace-pre-wrap rounded-xl border border-overlay-medium bg-bg-elevated/50 px-4 py-3 text-text-primary">
                {rawExcerpt}
              </p>
            </div>
          ) : null}

          {edgarUrl ? (
            <a
              href={edgarUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-accent-default hover:underline"
              aria-label="View on EDGAR"
            >
              View on EDGAR
            </a>
          ) : null}

          {!hasEvidence ? (
            <p>Source data not available for this event. Classification was based on the original alert text.</p>
          ) : null}
        </div>
      </section>

      {whyNowBullets.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Market context" title="Why It Matters Now" />
          <ul className="space-y-2">
            {whyNowBullets.map((bullet, index) => (
              <li key={index} className="text-[15px] leading-7 text-text-secondary">
                • {bullet}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasSourceCard && (
        <EventSourceCard source={source} metadata={sourceMetadata} />
      )}

      {enrichment?.risks && (
        <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Risk factors" title="Key Risks" />
          <div className="rounded-lg border-l-2 border-amber-500/30 bg-amber-500/5 py-3 pl-4 pr-3">
            <p className="text-[15px] leading-7 text-text-secondary">⚠ {enrichment.risks}</p>
          </div>
        </section>
      )}

      {enrichment?.filingItems && enrichment.filingItems.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="SEC filing" title="Filing Items" />
          <p className="font-mono text-[15px] leading-7 text-text-primary">{enrichment.filingItems.join(', ')}</p>
        </section>
      )}
    </>
  );
}

export function RegimeContextCard({
  regimeContext,
  className,
}: {
  regimeContext: string | null | undefined;
  className?: string;
}) {
  if (!regimeContext) return null;

  return (
    <section className={cn('rounded-2xl border border-border-default bg-bg-surface/96 p-5', className)}>
      <SectionHeading eyebrow="Market regime" title="Regime Context" />
      <p className="text-[15px] leading-7 text-text-secondary">{regimeContext}</p>
    </section>
  );
}

function BullBearColumns({
  bullPoints,
  bearPoints,
  severity,
}: {
  bullPoints: string[];
  bearPoints: string[];
  severity: string;
}) {
  const shouldForceLayout = severity === 'HIGH' || severity === 'CRITICAL';
  if (!shouldForceLayout && bullPoints.length === 0 && bearPoints.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Directional thesis" title="Bull Case vs Bear Case" />
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-emerald-400">▲ Bull</h3>
          {bullPoints.length > 0 ? (
            <ul className="space-y-2">
              {bullPoints.map((point, index) => (
                <li key={index} className="text-sm leading-6 text-text-secondary">
                  • {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-tertiary">Analysis not available</p>
          )}
        </div>

        <div className="flex-1 rounded-xl border border-red-500/15 bg-red-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-red-400">▼ Bear</h3>
          {bearPoints.length > 0 ? (
            <ul className="space-y-2">
              {bearPoints.map((point, index) => (
                <li key={index} className="text-sm leading-6 text-text-secondary">
                  • {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-tertiary">Analysis not available</p>
          )}
        </div>
      </div>
    </section>
  );
}

function getSourceTypeLabel(source: string): string {
  switch (source) {
    case 'sec-edgar':
      return 'SEC Filing';
    case 'breaking-news':
    case 'businesswire':
    case 'pr-newswire':
    case 'reuters':
      return 'Breaking News';
    case 'reddit':
    case 'stocktwits':
    case 'truth-social':
      return 'Social Media';
    case 'fed':
    case 'econ-calendar':
      return 'Macro Data';
    default:
      return source;
  }
}
