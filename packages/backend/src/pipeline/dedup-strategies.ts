import type { RawEvent } from '@event-radar/shared';
import type { DedupMatchType } from '@event-radar/shared';

export interface StrategyMatch {
  matchType: DedupMatchType;
  confidence: number;
  matchedEventId: string;
}

const ID_FIELDS = ['filingId', 'postId', 'tweetId', 'articleId'] as const;

/**
 * Exact ID match: same filingId, postId, tweetId, etc.
 */
export function exactIdMatch(
  incoming: RawEvent,
  existing: RawEvent,
): StrategyMatch | null {
  const incomingMeta = incoming.metadata ?? {};
  const existingMeta = existing.metadata ?? {};

  for (const field of ID_FIELDS) {
    const incomingVal = incomingMeta[field];
    const existingVal = existingMeta[field];
    if (
      incomingVal != null &&
      existingVal != null &&
      String(incomingVal) === String(existingVal)
    ) {
      return { matchType: 'exact-id', confidence: 1.0, matchedEventId: existing.id };
    }
  }
  return null;
}

/**
 * Ticker + time window: same ticker within 5 minutes, similar event type, and
 * a minimum title similarity to avoid false positives on genuinely different events
 * (e.g., different 8-K item types for the same company).
 */
export function tickerWindowMatch(
  incoming: RawEvent,
  existing: RawEvent,
  windowMs: number = 5 * 60 * 1000,
): StrategyMatch | null {
  const incomingTicker = incoming.metadata?.['ticker'];
  const existingTicker = existing.metadata?.['ticker'];

  if (
    typeof incomingTicker !== 'string' ||
    typeof existingTicker !== 'string' ||
    incomingTicker !== existingTicker
  ) {
    return null;
  }

  if (incoming.type !== existing.type) {
    return null;
  }

  const timeDiff = Math.abs(
    incoming.timestamp.getTime() - existing.timestamp.getTime(),
  );
  if (timeDiff > windowMs) {
    return null;
  }

  // Require minimum title similarity to avoid false positives
  const titleSimilarity = jaccardSimilarity(
    tokenize(incoming.title),
    tokenize(existing.title),
  );
  if (titleSimilarity <= 0.5) {
    return null;
  }

  // Confidence decays linearly with time difference
  const confidence = 0.9 - 0.4 * (timeDiff / windowMs);
  return {
    matchType: 'ticker-window',
    confidence: Math.max(confidence, 0.5),
    matchedEventId: existing.id,
  };
}

/**
 * Tokenize text into lowercase word tokens.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * Jaccard similarity between two sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Content similarity: title/body similarity score > threshold using Jaccard similarity.
 */
export function contentSimilarityMatch(
  incoming: RawEvent,
  existing: RawEvent,
  threshold: number = 0.8,
): StrategyMatch | null {
  const incomingTokens = tokenize(`${incoming.title} ${incoming.body}`);
  const existingTokens = tokenize(`${existing.title} ${existing.body}`);

  const similarity = jaccardSimilarity(incomingTokens, existingTokens);

  if (similarity >= threshold) {
    return {
      matchType: 'content-similarity',
      confidence: similarity,
      matchedEventId: existing.id,
    };
  }
  return null;
}

/**
 * Run all dedup strategies against an incoming event and a window of existing events.
 * Returns the highest-confidence match, or null if no match found.
 */
export function findBestMatch(
  incoming: RawEvent,
  window: RawEvent[],
): StrategyMatch | null {
  let bestMatch: StrategyMatch | null = null;

  for (const existing of window) {
    if (existing.id === incoming.id) continue;

    // Try strategies in order of specificity
    const strategies = [
      () => exactIdMatch(incoming, existing),
      () => tickerWindowMatch(incoming, existing),
      () => contentSimilarityMatch(incoming, existing),
    ];

    for (const strategy of strategies) {
      const match = strategy();
      if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
        bestMatch = match;
      }
    }
  }

  return bestMatch;
}
