import type { ReactNode } from 'react';
import { SectionHeading } from './shared.js';
import { formatTimeShort } from './utils.js';

export function EventSourceCard({
  source,
  metadata,
}: {
  source: string;
  metadata: Record<string, unknown>;
}) {
  const content = renderSourceDetails(source, metadata);
  if (!content) return null;

  return (
    <section className="mt-4 rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <SectionHeading eyebrow="Source details" title={sourceDetailTitle(source)} />
      {content}
    </section>
  );
}

function sourceDetailTitle(source: string): string {
  switch (source) {
    case 'breaking-news':
      return 'News Source';
    case 'sec-edgar':
      return 'SEC Filing Details';
    case 'trading-halt':
      return 'Halt Details';
    case 'econ-calendar':
      return 'Economic Indicator';
    case 'stocktwits':
      return 'StockTwits Activity';
    case 'reddit':
      return 'Reddit Activity';
    case 'earnings':
      return 'Earnings Details';
    default:
      return 'Source Details';
  }
}

function renderSourceDetails(source: string, metadata: Record<string, unknown>): ReactNode {
  switch (source) {
    case 'breaking-news': {
      const feed = metadata.sourceFeed as string | undefined;
      const url = metadata.url as string | undefined;
      if (!feed && !url) return null;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {feed && (
            <p>
              📰 Source: <span className="font-medium text-text-primary">{feed}</span>
            </p>
          )}
          {url && (
            <p>
              🔗{' '}
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent-default hover:underline">
                View original article →
              </a>
            </p>
          )}
        </div>
      );
    }

    case 'sec-edgar': {
      const formType = metadata.formType as string | undefined;
      const company = metadata.companyName as string | undefined;
      const items = metadata.itemDescriptions as string[] | undefined;
      const link = metadata.filingLink as string | undefined;
      if (!formType && !company && !items?.length) return null;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {formType && (
            <p>
              📋 Form Type: <span className="font-semibold text-text-primary">{formType}</span>
            </p>
          )}
          {company && <p>🏢 Company: {company}</p>}
          {items && items.length > 0 && (
            <div>
              <p className="mb-1 text-text-tertiary">Items:</p>
              <ul className="space-y-1 pl-4">
                {items.map((item, index) => (
                  <li key={index} className="text-text-secondary">
                    📄 {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {link && (
            <p>
              🔗{' '}
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent-default hover:underline">
                View SEC filing →
              </a>
            </p>
          )}
        </div>
      );
    }

    case 'trading-halt': {
      const isResume = metadata.isResume as boolean | undefined;
      const code = metadata.haltReasonCode as string | undefined;
      const desc = metadata.haltReasonDescription as string | undefined;
      const haltTime = metadata.haltTime as string | undefined;
      const resumeTime = metadata.resumeTime as string | undefined;
      const market = metadata.market as string | undefined;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {isResume ? (
            <p className="font-medium text-emerald-400">✅ Trading RESUMED{resumeTime ? ` at ${resumeTime}` : ''}</p>
          ) : (
            <p className="font-medium text-red-400">🔒 Trading HALTED{haltTime ? ` at ${haltTime}` : ''}</p>
          )}
          {(code || desc) && <p>⏸ Reason: {desc ?? code}{code && desc ? ` (${code})` : ''}</p>}
          {market && <p>📍 Exchange: {market}</p>}
          {!isResume && resumeTime && <p>▶️ Expected resume: {resumeTime}</p>}
        </div>
      );
    }

    case 'econ-calendar': {
      const name = metadata.indicatorName as string | undefined;
      const scheduled = metadata.scheduledTime as string | undefined;
      const frequency = metadata.frequency as string | undefined;
      const tags = metadata.tags as string[] | undefined;
      if (!name && !frequency) return null;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {name && (
            <p>
              📋 Indicator: <span className="font-medium text-text-primary">{name}</span>
            </p>
          )}
          {scheduled && <p>⏱ Scheduled: {formatTimeShort(scheduled)}</p>}
          {frequency && (
            <p>
              🔄 Frequency: <span className="capitalize">{frequency}</span>
            </p>
          )}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, index) => (
                <span key={index} className="rounded-full bg-bg-elevated px-2.5 py-0.5 text-[12px] text-text-tertiary">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'stocktwits': {
      const current = metadata.currentVolume as number | undefined;
      const previous = metadata.previousVolume as number | undefined;
      const ratio = metadata.ratio as number | undefined;
      if (current == null && ratio == null) return null;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {current != null && (
            <p>
              📊 Message volume: <span className="font-medium text-text-primary">{current}</span>
              {previous != null ? ` (prev: ${previous})` : ''}
            </p>
          )}
          {ratio != null && (
            <p>
              📈 Sentiment ratio: <span className="font-medium text-text-primary">{ratio.toFixed(2)}</span>
            </p>
          )}
          {current != null && previous != null && previous > 0 && (
            <p>
              🔥 Volume spike: <span className="font-medium text-text-primary">{(current / previous).toFixed(1)}x</span> normal
            </p>
          )}
        </div>
      );
    }

    case 'reddit': {
      const upvotes = metadata.upvotes as number | undefined;
      const comments = metadata.comments as number | undefined;
      const highEngagement = metadata.highEngagement as boolean | undefined;
      if (upvotes == null && comments == null) return null;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {upvotes != null && (
            <p>
              ⬆️ Upvotes: <span className="font-medium text-text-primary">{upvotes.toLocaleString()}</span>
            </p>
          )}
          {comments != null && (
            <p>
              💬 Comments: <span className="font-medium text-text-primary">{comments.toLocaleString()}</span>
            </p>
          )}
          {highEngagement && <p className="font-medium text-amber-400">🔥 High engagement post</p>}
        </div>
      );
    }

    case 'earnings': {
      const quarter = metadata.fiscalQuarter as string | undefined;
      const reportDate = metadata.reportDate as string | undefined;
      const reportTime = metadata.reportTime as string | undefined;
      const epsActual = metadata.epsActual as number | undefined;
      const epsEstimate = metadata.epsEstimate as number | undefined;
      const revenueActual = metadata.revenueActual as number | undefined;
      const revenueEstimate = metadata.revenueEstimate as number | undefined;
      const surprisePct = metadata.surprisePct as number | undefined;
      const surpriseType = metadata.surpriseType as string | undefined;
      const guidance = metadata.guidance as string | undefined;

      return (
        <div className="space-y-2 text-[15px] leading-7 text-text-secondary">
          {quarter && (
            <p>
              📅 Quarter: <span className="font-medium text-text-primary">{quarter}</span>
              {reportDate ? ` (${reportDate}${reportTime ? ` ${reportTime}` : ''})` : ''}
            </p>
          )}
          {epsActual != null && (
            <p>
              💰 EPS: <span className="font-semibold text-text-primary">${epsActual}</span>
              {epsEstimate != null ? ` vs est. $${epsEstimate}` : ''}
              {surprisePct != null && (
                <span className={surprisePct >= 0 ? 'ml-2 text-emerald-400' : 'ml-2 text-red-400'}>
                  ({surprisePct > 0 ? '+' : ''}{surprisePct.toFixed(1)}% {surpriseType ?? 'surprise'})
                </span>
              )}
            </p>
          )}
          {revenueActual != null && (
            <p>
              📊 Revenue: <span className="font-medium text-text-primary">${(revenueActual / 1e6).toFixed(1)}M</span>
              {revenueEstimate != null ? ` vs est. $${(revenueEstimate / 1e6).toFixed(1)}M` : ''}
            </p>
          )}
          {guidance && (
            <p>
              🔮 Guidance: <span className="font-medium text-text-primary">{guidance}</span>
            </p>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
