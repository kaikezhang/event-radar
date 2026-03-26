import type { LlmClassificationResult, RawEvent, Severity } from '@event-radar/shared';
import { COMPANY_TICKER_MAP } from './company-ticker-map.js';
import {
  isValidNakedTickerCandidate,
  normalizeTickerCandidate as normalizeCandidateSymbol,
} from './ticker-candidate.js';

const HIGH_PRIORITY_SEVERITIES = new Set<Severity>(['HIGH', 'CRITICAL']);
const AMBIGUOUS_SINGLE_WORD_COMPANIES = new Set([
  'target',
]);
const AMBIGUOUS_COMPANY_CONTEXT_PATTERN = /\b(?:shares?|stock|earnings|revenue|guidance|retailer|company|corp|inc|stores?|sales|results|forecast|beat|miss|ticker|investors?|traders?|quarter|q[1-4]|sec|filing|outlook)\b/;

export interface InferredTickerResult {
  ticker: string;
  tickerInferred: true;
  strategy: 'regex' | 'company-map';
}

interface TickerMatchResult {
  ticker: string;
  strategy: 'regex' | 'company-map';
}

function requiresFinancialContext(company: string): boolean {
  return AMBIGUOUS_SINGLE_WORD_COMPANIES.has(company);
}

function hasFinancialContextAroundMention(
  normalizedText: string,
  start: number,
  length: number,
): boolean {
  const contextStart = Math.max(0, start - 32);
  const contextEnd = Math.min(normalizedText.length, start + length + 32);
  return AMBIGUOUS_COMPANY_CONTEXT_PATTERN.test(
    normalizedText.slice(contextStart, contextEnd),
  );
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

function resolveMappedTicker(value: string): string | null {
  const mappedTicker = COMPANY_TICKER_MAP[value.trim().toLowerCase()];
  return mappedTicker ? normalizeCandidateSymbol(mappedTicker) : null;
}

function extractTickerMatchFromText(text: string): TickerMatchResult | null {
  const normalizedText = text.toLowerCase();

  for (const match of text.matchAll(/\$([A-Z]{1,10})\b/g)) {
    const rawValue = match[1] ?? '';
    const mappedTicker = resolveMappedTicker(rawValue);
    if (mappedTicker) {
      return {
        ticker: mappedTicker,
        strategy: 'company-map',
      };
    }

    const ticker = normalizeExplicitTickerCandidate(rawValue);
    if (ticker) {
      return {
        ticker,
        strategy: 'regex',
      };
    }
  }

  for (const match of text.matchAll(/\b([A-Z]{2,10})\b/g)) {
    const rawValue = match[1] ?? '';
    const companyKey = rawValue.trim().toLowerCase();
    const mappedTicker = resolveMappedTicker(rawValue);
    if (mappedTicker) {
      if (
        requiresFinancialContext(companyKey) &&
        !hasFinancialContextAroundMention(
          normalizedText,
          match.index ?? 0,
          rawValue.length,
        )
      ) {
        continue;
      }

      return {
        ticker: mappedTicker,
        strategy: 'company-map',
      };
    }

    const ticker = normalizeNakedTickerCandidate(rawValue);
    if (ticker) {
      return {
        ticker,
        strategy: 'regex',
      };
    }
  }

  return null;
}

export function extractTickerCandidateFromText(text: string): string | null {
  return extractTickerMatchFromText(text)?.ticker ?? null;
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

    if (
      requiresFinancialContext(company) &&
      !hasFinancialContextAroundMention(normalizedText, matchIndex, company.length)
    ) {
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

export function inferHighPriorityTicker(event: RawEvent): InferredTickerResult | null {
  const combinedText = `${event.title} ${event.body}`;
  const tickerFromText = extractTickerMatchFromText(combinedText);
  if (tickerFromText) {
    return {
      ticker: tickerFromText.ticker,
      tickerInferred: true,
      strategy: tickerFromText.strategy,
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
