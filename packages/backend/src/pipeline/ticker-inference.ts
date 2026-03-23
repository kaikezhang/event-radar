import type { LlmClassificationResult, RawEvent, Severity } from '@event-radar/shared';

const HIGH_PRIORITY_SEVERITIES = new Set<Severity>(['HIGH', 'CRITICAL']);
const FALSE_POSITIVES = new Set([
  'AI',
  'CEO',
  'CFO',
  'CPI',
  'EPS',
  'ETF',
  'FDA',
  'FED',
  'FOMC',
  'GDP',
  'IPO',
  'IRS',
  'SEC',
  'THE',
  'USA',
  'USD',
]);
const CASHTAG_PATTERN = /\$([A-Z]{1,5})\b/g;
const UPPERCASE_TICKER_PATTERN = /\b([A-Z]{2,5})\b/g;

interface SectorFallback {
  ticker: string;
  keywords: string[];
}

const SECTOR_FALLBACKS: SectorFallback[] = [
  { ticker: 'QQQ', keywords: ['ai', 'chip', 'chips', 'cloud', 'megacap', 'nasdaq', 'semiconductor', 'software', 'tech'] },
  { ticker: 'XLF', keywords: ['bank', 'banks', 'broker', 'credit', 'financial', 'regional bank'] },
  { ticker: 'TLT', keywords: ['bond', 'bonds', 'rates', 'treasury', 'treasuries', 'yield', 'yields'] },
  { ticker: 'XLE', keywords: ['crude', 'energy', 'gas', 'oil', 'opec'] },
  { ticker: 'XLV', keywords: ['biotech', 'drug', 'fda', 'healthcare', 'medical', 'pharma'] },
  { ticker: 'XLI', keywords: ['aerospace', 'airline', 'defense', 'industrial', 'transport'] },
  { ticker: 'IWM', keywords: ['microcap', 'russell 2000', 'small cap', 'small-cap'] },
];

export interface InferredTickerResult {
  ticker: string;
  tickerInferred: true;
  strategy: 'regex' | 'fallback';
}

function normalizeTickerCandidate(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(normalized) || FALSE_POSITIVES.has(normalized)) {
    return null;
  }

  return normalized;
}

export function extractTickerCandidateFromText(text: string): string | null {
  let match: RegExpExecArray | null;

  while ((match = CASHTAG_PATTERN.exec(text)) !== null) {
    const ticker = normalizeTickerCandidate(match[1] ?? '');
    if (ticker) {
      return ticker;
    }
  }

  while ((match = UPPERCASE_TICKER_PATTERN.exec(text)) !== null) {
    const ticker = normalizeTickerCandidate(match[1] ?? '');
    if (ticker) {
      return ticker;
    }
  }

  return null;
}

export function inferMarketContextEtf(event: RawEvent): string {
  const haystack = `${event.title} ${event.body} ${event.source} ${event.type}`.toLowerCase();

  for (const fallback of SECTOR_FALLBACKS) {
    if (fallback.keywords.some((keyword) => haystack.includes(keyword))) {
      return fallback.ticker;
    }
  }

  return 'SPY';
}

export function inferHighPriorityTicker(event: RawEvent): InferredTickerResult {
  const fromText = extractTickerCandidateFromText(`${event.title} ${event.body}`);
  if (fromText) {
    return {
      ticker: fromText,
      tickerInferred: true,
      strategy: 'regex',
    };
  }

  return {
    ticker: inferMarketContextEtf(event),
    tickerInferred: true,
    strategy: 'fallback',
  };
}

export function shouldInferTicker(
  event: RawEvent,
  severity: Severity,
  llmResult?: LlmClassificationResult,
): boolean {
  if (!HIGH_PRIORITY_SEVERITIES.has(llmResult?.severity ?? severity)) {
    return false;
  }

  const metadata = event.metadata;
  if (!metadata) {
    return true;
  }

  if (typeof metadata['ticker'] === 'string' && metadata['ticker'].trim().length > 0) {
    return false;
  }

  if (Array.isArray(metadata['tickers'])) {
    const firstTicker = metadata['tickers'].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (firstTicker) {
      return false;
    }
  }

  return true;
}
