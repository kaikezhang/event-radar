import { Ban, ChevronDown, CircleCheckBig, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { mapSource, submitFeedback } from '../../lib/api.js';
import { formatRelativeTime } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';
import type { EventDetailData } from '../../types/index.js';
import { InfoField, SectionHeading } from './shared.js';
import { formatTimeShort, formatTrustLabel, formatTrustMove } from './utils.js';

export function EventVerdict({
  data,
  feedback,
  onFeedbackChange,
}: {
  data: EventDetailData;
  feedback: 'up' | 'down' | 'bad' | null;
  onFeedbackChange: (value: 'up' | 'down' | 'bad') => void;
}) {
  const hasHistoricalPattern = data.historicalPattern.matchCount > 0;

  return (
    <>
      {(data.audit || data.provenance.length > 0) && (
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Alert provenance" title="Source Journey" />
          <ProvenanceTimeline data={data} />
        </section>
      )}

      {(data.scorecard || hasHistoricalPattern) && (
        <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                Trust / scorecard context
              </p>
              <h2 className="mt-1 text-[17px] font-semibold leading-[1.4] text-text-primary">
                Verification
              </h2>
            </div>
            {data.scorecard?.notes.verdictWindow && (
              <div className="rounded-full border border-overlay-medium bg-overlay-light px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-text-primary">
                {data.scorecard.notes.verdictWindow} window
              </div>
            )}
          </div>

          {data.scorecard ? (
            <>
              {data.scorecard.notes.summary && (
                <p className="mb-4 text-sm leading-6 text-text-secondary">{data.scorecard.notes.summary}</p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoField
                  label="Original signal label"
                  value={data.scorecard.originalAlert.actionLabel ?? 'Not captured'}
                />
                <InfoField
                  label="Direction verdict"
                  value={formatTrustLabel(data.scorecard.outcome.directionVerdict)}
                />
                <InfoField
                  label="Setup verdict"
                  value={formatTrustLabel(data.scorecard.outcome.setupVerdict)}
                />
                <InfoField
                  label="Primary verdict window"
                  value={data.scorecard.notes.verdictWindow ?? 'Pending'}
                />
                <InfoField
                  label="T+5 move"
                  value={formatTrustMove(data.scorecard.outcome.tPlus5.movePercent)}
                />
                <InfoField
                  label="T+20 move"
                  value={formatTrustMove(data.scorecard.outcome.tPlus20.movePercent)}
                />
              </div>

              {data.scorecard.notes.items.length > 0 && (
                <div className="mt-4 rounded-2xl border border-overlay-medium bg-bg-elevated/50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    Verification notes
                  </h3>
                  <div className="mt-3 space-y-2">
                    {data.scorecard.notes.items.map((item) => (
                      <p key={item} className="text-sm leading-6 text-text-secondary">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoField label="Historical matches" value={String(data.historicalPattern.matchCount)} />
              <InfoField
                label="Pattern confidence"
                value={formatTrustLabel(data.historicalPattern.confidence)}
              />
            </div>
          )}
        </section>
      )}

      {data.confirmationCount > 1 && (
        <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <SectionHeading eyebrow="Multi-source confirmation" title="Confirmed Sources" />
          <div className="flex flex-wrap gap-2">
            {data.confirmedSources.map((source) => (
              <span
                key={source}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-200"
              >
                <CircleCheckBig className="h-3.5 w-3.5" />
                {mapSource(source)}
              </span>
            ))}
          </div>
          {data.provenance.length > 1 && (
            <div className="mt-4 space-y-3">
              {data.provenance.map((item) => (
                <div key={item.id} className="rounded-2xl border border-overlay-medium bg-bg-elevated/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary">{item.source}</span>
                    <span className="font-mono text-xs text-text-secondary">
                      {formatRelativeTime(item.receivedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-text-primary">{item.title}</p>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-accent-default transition hover:text-accent-strong"
                    >
                      View original source
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {data.url && (
        <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            View original source <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Was this alert useful?</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onFeedbackChange('up');
                void submitFeedback(data.id, true);
              }}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                feedback === 'up'
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                  : 'border-overlay-medium text-text-primary hover:bg-overlay-medium',
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Useful
            </button>
            <button
              type="button"
              onClick={() => {
                onFeedbackChange('down');
                void submitFeedback(data.id, false);
              }}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                feedback === 'down'
                  ? 'border-severity-critical/40 bg-severity-critical/10 text-severity-critical'
                  : 'border-overlay-medium text-text-primary hover:bg-overlay-medium',
              )}
            >
              <ThumbsDown className="h-3.5 w-3.5" /> Not useful
            </button>
            <button
              type="button"
              onClick={() => {
                onFeedbackChange('bad');
                void submitFeedback(data.id, false);
              }}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default',
                feedback === 'bad'
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                  : 'border-overlay-medium text-text-primary hover:bg-overlay-medium',
              )}
            >
              <Ban className="h-3.5 w-3.5" /> Bad data
            </button>
          </div>
        </div>
      </section>

      <Disclaimer />
    </>
  );
}

function ProvenanceTimeline({ data }: { data: EventDetailData }) {
  const steps: Array<{ icon: string; name: string; time: string; detail: string }> = [];
  const firstProvenance = data.provenance[0];

  if (firstProvenance) {
    steps.push({
      icon: '📡',
      name: data.source,
      time: formatTimeShort(firstProvenance.receivedAt),
      detail: '',
    });
  }

  steps.push({
    icon: '🔍',
    name: 'Rule Filter',
    time: firstProvenance ? formatTimeShort(firstProvenance.receivedAt) : '',
    detail: 'Passed L1 filter',
  });

  if (data.audit?.confidence != null) {
    steps.push({
      icon: '🤖',
      name: 'AI Judge',
      time: firstProvenance ? formatTimeShort(firstProvenance.receivedAt) : '',
      detail: `Confidence: ${data.audit.confidence.toFixed(2)}`,
    });
  }

  if (data.enrichment) {
    const enrichTime = data.audit?.enrichedAt ? formatTimeShort(data.audit.enrichedAt) : '';
    const matchInfo = data.historicalPattern.matchCount > 0
      ? `+ ${data.historicalPattern.matchCount} historical matches`
      : '+ market context';
    steps.push({
      icon: '📊',
      name: 'Enriched',
      time: enrichTime,
      detail: matchInfo,
    });
  }

  if (data.audit?.outcome === 'delivered') {
    const channels = Array.isArray(data.audit.deliveryChannels)
      ? (data.audit.deliveryChannels as Array<{ channel?: string }>)
        .map((channel) => channel.channel)
        .filter(Boolean)
        .join(', ')
      : '';
    const firstTime = firstProvenance ? new Date(firstProvenance.receivedAt).getTime() : 0;
    const enrichTime = data.audit.enrichedAt ? new Date(data.audit.enrichedAt).getTime() : firstTime;
    const totalSeconds = firstTime > 0 ? Math.round((enrichTime - firstTime) / 1000) : 0;

    steps.push({
      icon: '📱',
      name: 'Delivered',
      time: data.audit.enrichedAt ? formatTimeShort(data.audit.enrichedAt) : '',
      detail: [channels ? `via ${channels}` : '', totalSeconds > 0 ? `Total: ${totalSeconds}s` : '']
        .filter(Boolean)
        .join(' · '),
    });
  }

  if (steps.length === 0) return null;

  return (
    <div className="relative ml-4 border-l-2 border-overlay-medium pl-6">
      {steps.map((step, index) => (
        <div key={index} className="relative mb-5 last:mb-0">
          <div className="absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg-surface text-xs">
            {step.icon}
          </div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-text-primary">{step.name}</p>
              {step.detail && <p className="mt-0.5 text-xs text-text-secondary">{step.detail}</p>}
            </div>
            {step.time && (
              <span className="shrink-0 font-mono text-xs text-text-secondary">{step.time}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Disclaimer() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-4 rounded-2xl border border-border-default bg-bg-muted/88 p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="disclaimer-panel"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Informational only
          </p>
          <span className="mt-1 block text-[17px] font-semibold leading-6 text-text-primary">
            Disclaimer
          </span>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-overlay-medium bg-bg-elevated/70 text-text-secondary">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div id="disclaimer-panel" className="mt-4">
          <p className="text-xs leading-5 text-text-secondary">
            Event Radar provides AI-processed market event notifications for informational purposes only.
            Content may be generated or summarized by AI and could contain errors or inaccuracies. This is
            not investment advice or financial advice, and should not be relied upon as the sole basis for
            any investment decision. Always verify information with official sources and consult a qualified
            financial advisor before making investment decisions. Past performance and historical patterns are
            not indicative of future results.
          </p>
        </div>
      )}
    </section>
  );
}
