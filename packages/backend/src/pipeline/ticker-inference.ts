import type { LlmClassificationResult, RawEvent, Severity } from '@event-radar/shared';
import { COMPANY_TICKER_MAP } from './company-ticker-map.js';
import {
  isValidNakedTickerCandidate,
  normalizeTickerCandidate as normalizeCandidateSymbol,
} from './ticker-candidate.js';

const HIGH_PRIORITY_SEVERITIES = new Set<Severity>(['HIGH', 'CRITICAL']);

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
  strategy: 'regex' | 'company-map';
}

function normalizeExplicitTickerCandidate(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(normalized)) {
    return null;
  }

  return normalizeCandidateSymbol(normalized);
}

function normalizeNakedTickerCandidate(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(normalized)) {
    return null;
  }

  return isValidNakedTickerCandidate(normalized) ? normalized : null;
}

export function extractTickerCandidateFromText(text: string): string | null {
  for (const match of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    const ticker = normalizeExplicitTickerCandidate(match[1] ?? '');
    if (ticker) {
      return ticker;
    }
  }

  for (const match of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const ticker = normalizeNakedTickerCandidate(match[1] ?? '');
    if (ticker) {
      return ticker;
    }
  }

  return null;
}

function isCompanyMatchBoundary(text: string, start: number, length: number): boolean {
  const before = start === 0 ? '' : text[start - 1]!;
  const afterIndex = start + length;
  const after = afterIndex >= text.length ? '' : text[afterIndex]!;

  const isBoundary = (value: string): boolean => value === '' || /[^a-z0-9]/.test(value);

  return isBoundary(before) && isBoundary(after);
}

function findCompanyMentionIndex(text: string, company: string): number {
  let fromIndex = 0;

  while (fromIndex < text.length) {
    const foundIndex = text.indexOf(company, fromIndex);
    if (foundIndex === -1) {
      return -1;
    }

    if (isCompanyMatchBoundary(text, foundIndex, company.length)) {
      return foundIndex;
    }

    fromIndex = foundIndex + 1;
  }

  return -1;
}

export function extractCompanyTickerFromText(text: string): string | null {
  const normalizedText = text.toLowerCase();
  let firstMatch: { index: number; ticker: string } | null = null;

  for (const [company, ticker] of Object.entries(COMPANY_TICKER_MAP)) {
    const matchIndex = findCompanyMentionIndex(normalizedText, company);
    if (matchIndex === -1) {
      continue;
    }

    if (!firstMatch || matchIndex < firstMatch.index) {
      const normalizedTicker = normalizeCandidateSymbol(ticker);
      if (!normalizedTicker) {
        continue;
      }

      firstMatch = { index: matchIndex, ticker: normalizedTicker };
    }
  }

  return firstMatch?.ticker ?? null;
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

export function inferHighPriorityTicker(event: RawEvent): InferredTickerResult | null {
  const combinedText = `${event.title} ${event.body}`;
  const tickerFromText = extractTickerCandidateFromText(combinedText);
  if (tickerFromText) {
    return {
      ticker: tickerFromText,
      tickerInferred: true,
      strategy: 'regex',
    };
  }

  const tickerFromCompanyName = extractCompanyTickerFromText(combinedText);
  if (tickerFromCompanyName) {
    return {
      ticker: tickerFromCompanyName,
      tickerInferred: true,
      strategy: 'company-map',
    };
  }

  return null;
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
