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
}: {
  summary: string;
  enrichment: LlmEnrichment | null;
  direction: string;
}) {
  const { bullPoints, bearPoints } = deriveBullBear(enrichment, direction);

  return (
    <>
      <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <SectionHeading eyebrow="Catalyst / event summary" title="What Happened" />
        <p className="text-[15px] leading-relaxed text-text-primary">{summary}</p>
      </section>

      <div className="mt-4">
        <BullBearColumns bullPoints={bullPoints} bearPoints={bearPoints} />
      </div>
    </>
  );
}

/** Evidence tab content: Market Context + Source Details + Risk Factors */
export function EventEvidenceContent({
  enrichment,
  source,
  sourceMetadata,
}: {
  enrichment: LlmEnrichment | null;
  source: string;
  sourceMetadata?: Record<string, unknown>;
}) {
  const whyNowBullets = [enrichment?.impact, enrichment?.whyNow, enrichment?.currentSetup].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <>
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

      {sourceMetadata && Object.keys(sourceMetadata).length > 0 && (
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
}: {
  bullPoints: string[];
  bearPoints: string[];
}) {
  if (bullPoints.length === 0 && bearPoints.length === 0) return null;

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
            <p className="text-sm italic text-text-secondary/60">No upside thesis identified</p>
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
            <p className="text-sm italic text-text-secondary/60">No downside thesis identified</p>
          )}
        </div>
      </div>
    </section>
  );
}
