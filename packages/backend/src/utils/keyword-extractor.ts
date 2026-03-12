import type { Sentiment } from '@event-radar/shared';

/** Common words that look like tickers but aren't */
const FALSE_POSITIVES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CNY', 'CHF',
  'CEO', 'CFO', 'CTO', 'COO', 'IPO', 'ETF', 'SEC', 'FDA',
  'THE', 'FOR', 'AND', 'NOT', 'BUT', 'ALL', 'ARE', 'WAS',
  'HAS', 'HAD', 'HIS', 'HER', 'WHO', 'HOW', 'ITS', 'MAY',
  'NEW', 'NOW', 'OLD', 'OUR', 'OUT', 'OWN', 'SAY', 'SHE',
  'TOO', 'USE', 'WAY', 'GET', 'GOT', 'LET', 'PUT', 'RUN',
  'SET', 'TRY', 'ASK', 'BIG', 'EPS', 'GDP', 'CPI', 'IMO',
  'YOLO', 'FOMO', 'LMAO', 'ROFL', 'HODL', 'TLDR',
  'DD', 'PT', 'SI', 'IV', 'OI', 'DTE', 'ATH', 'ATL',
  'FYI', 'TBH', 'USA', 'FBI', 'CIA', 'NSA', 'DOJ', 'IRS',
  'AFC', 'NFC', 'NFL', 'NBA', 'MLB', 'NHL', 'UFC',
  'EST', 'PST', 'CST', 'MST', 'UTC', 'GMT',
  'BAN', 'TAX', 'WAR', 'OIL', 'GAS', 'AI',
]);

/** Top 50 company name → ticker mapping */
const COMPANY_TO_TICKER: ReadonlyMap<string, string> = new Map([
  ['apple', 'AAPL'],
  ['microsoft', 'MSFT'],
  ['amazon', 'AMZN'],
  ['alphabet', 'GOOGL'],
  ['google', 'GOOGL'],
  ['meta', 'META'],
  ['facebook', 'META'],
  ['tesla', 'TSLA'],
  ['nvidia', 'NVDA'],
  ['berkshire', 'BRK.B'],
  ['jpmorgan', 'JPM'],
  ['johnson & johnson', 'JNJ'],
  ['visa', 'V'],
  ['walmart', 'WMT'],
  ['exxon', 'XOM'],
  ['exxonmobil', 'XOM'],
  ['unitedhealth', 'UNH'],
  ['procter & gamble', 'PG'],
  ['mastercard', 'MA'],
  ['home depot', 'HD'],
  ['chevron', 'CVX'],
  ['pfizer', 'PFE'],
  ['coca-cola', 'KO'],
  ['coca cola', 'KO'],
  ['disney', 'DIS'],
  ['nike', 'NKE'],
  ['intel', 'INTC'],
  ['cisco', 'CSCO'],
  ['adobe', 'ADBE'],
  ['netflix', 'NFLX'],
  ['paypal', 'PYPL'],
  ['salesforce', 'CRM'],
  ['amd', 'AMD'],
  ['boeing', 'BA'],
  ['goldman sachs', 'GS'],
  ['morgan stanley', 'MS'],
  ['caterpillar', 'CAT'],
  ['3m', 'MMM'],
  ['lockheed', 'LMT'],
  ['lockheed martin', 'LMT'],
  ['raytheon', 'RTX'],
  ['starbucks', 'SBUX'],
  ['uber', 'UBER'],
  ['airbnb', 'ABNB'],
  ['palantir', 'PLTR'],
  ['coinbase', 'COIN'],
  ['robinhood', 'HOOD'],
  ['spacex', 'TSLA'],
  ['twitter', 'TSLA'],
  ['truth social', 'DJT'],
]);

/** Cashtag pattern like $TSLA */
const CASHTAG_PATTERN = /\$([A-Z]{1,5})\b/g;

/** Exchange-prefix patterns like (NYSE: XYZ) */
const EXCHANGE_PATTERN = /\((?:NYSE|NASDAQ|TSX|AMEX|OTC)\s*:\s*([A-Z]{1,5})\)/gi;

/**
 * Extract stock tickers from text.
 * Matches $AAPL format and known company name → ticker mappings.
 */
export function extractTickers(text: string): string[] {
  const found = new Set<string>();

  // Match cashtag patterns ($AAPL)
  let match: RegExpExecArray | null;
  CASHTAG_PATTERN.lastIndex = 0;
  while ((match = CASHTAG_PATTERN.exec(text)) !== null) {
    const ticker = match[1]!.toUpperCase();
    if (!FALSE_POSITIVES.has(ticker)) {
      found.add(ticker);
    }
  }

  // Match exchange-prefix patterns (NYSE: XYZ)
  EXCHANGE_PATTERN.lastIndex = 0;
  while ((match = EXCHANGE_PATTERN.exec(text)) !== null) {
    const ticker = match[1]!.toUpperCase();
    if (!FALSE_POSITIVES.has(ticker)) {
      found.add(ticker);
    }
  }

  // Match known company names
  const lower = text.toLowerCase();
  for (const [company, ticker] of COMPANY_TO_TICKER) {
    // Use word boundary check to avoid partial matches
    const idx = lower.indexOf(company);
    if (idx !== -1) {
      // Verify it's not part of a longer word
      const before = idx === 0 ? ' ' : lower[idx - 1]!;
      const after = idx + company.length >= lower.length ? ' ' : lower[idx + company.length]!;
      const wordBoundary = /[\s.,;:!?'"()\-/]| /;
      if ((idx === 0 || wordBoundary.test(before)) && (idx + company.length >= lower.length || wordBoundary.test(after))) {
        found.add(ticker);
      }
    }
  }

  return Array.from(found);
}

/**
 * Match keywords from a dictionary against text.
 * Returns matched keywords (case-insensitive).
 */
export function extractKeywords(text: string, dictionary: string[]): string[] {
  const lower = text.toLowerCase();
  return dictionary.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

/** Keywords indicating bearish sentiment */
const BEARISH_KEYWORDS = [
  'ban', 'tariff', 'tariffs', 'sanctions', 'sanctions', 'crash', 'collapse',
  'investigation', 'lawsuit', 'fraud', 'default', 'recession', 'layoffs',
  'downgrade', 'sell', 'dump', 'restrict', 'penalty', 'fine', 'war',
  'threat', 'halt', 'suspend', 'decline', 'plunge', 'tank',
];

/** Keywords indicating bullish sentiment */
const BULLISH_KEYWORDS = [
  'deal', 'agreement', 'boost', 'surge', 'rally', 'record', 'growth',
  'upgrade', 'buy', 'bull', 'partnership', 'expansion', 'approve',
  'approved', 'launch', 'breakthrough', 'innovation', 'profit', 'beat',
  'great', 'incredible', 'tremendous', 'strong', 'win', 'winning',
  'amazing', 'fantastic', 'boom', 'soar', 'moon',
];

/**
 * Estimate sentiment from text using keyword matching.
 * Simple heuristic — LLM classifier will refine.
 */
export function estimateSentiment(text: string): Sentiment {
  const lower = text.toLowerCase();

  let bullishScore = 0;
  let bearishScore = 0;

  for (const kw of BULLISH_KEYWORDS) {
    if (lower.includes(kw)) bullishScore++;
  }

  for (const kw of BEARISH_KEYWORDS) {
    if (lower.includes(kw)) bearishScore++;
  }

  if (bullishScore > bearishScore) return 'bullish';
  if (bearishScore > bullishScore) return 'bearish';
  return 'neutral';
}

/** Political keywords commonly used by Trump / relevant to markets */
export const POLITICAL_KEYWORDS = [
  'tariff', 'tariffs', 'trade', 'china', 'ban', 'executive order',
  'sanctions', 'border', 'immigration', 'tax', 'taxes', 'deal',
  'agreement', 'military', 'war', 'oil', 'energy', 'drill',
  'crypto', 'bitcoin', 'regulation', 'deregulation', 'fed',
  'interest rate', 'inflation', 'jobs', 'economy',
];
