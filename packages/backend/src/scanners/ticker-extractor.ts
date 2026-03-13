/**
 * Extracts stock tickers from text using common patterns.
 * Matches: (NYSE: XYZ), (NASDAQ: XYZ), (TSX: XYZ), $XYZ
 */

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
]);

/** Exchange-prefix patterns like (NYSE: XYZ) or (NASDAQ: TSLA) */
const EXCHANGE_PATTERN = /\((?:NYSE|NASDAQ|TSX|AMEX|OTC)\s*:\s*([A-Z]{1,5})\)/gi;

/** Cashtag pattern like $TSLA */
const CASHTAG_PATTERN = /\$([A-Z]{1,5})\b/g;

/**
 * RSS <category> tag pattern for stock symbols.
 * Matches patterns like "Nasdaq:AAPL", "LSE:EDV", "TSX-V:ENW", "OTC Markets:BIEI"
 */
const CATEGORY_TICKER_PATTERN = /^(?:[\w\s-]+):([A-Z]{1,5}(?:W|Z|L)?)$/i;

/**
 * Extract tickers from text (title + description).
 * Optionally also extract from RSS <category> tag values.
 */
export function extractTickers(
  text: string,
  categories?: string[],
): string[] {
  const found = new Set<string>();

  // Match exchange-prefix patterns in text
  let match: RegExpExecArray | null;
  while ((match = EXCHANGE_PATTERN.exec(text)) !== null) {
    const ticker = match[1]!.toUpperCase();
    if (!FALSE_POSITIVES.has(ticker)) {
      found.add(ticker);
    }
  }

  // Match cashtag patterns in text
  while ((match = CASHTAG_PATTERN.exec(text)) !== null) {
    const ticker = match[1]!.toUpperCase();
    if (!FALSE_POSITIVES.has(ticker)) {
      found.add(ticker);
    }
  }

  // Extract tickers from RSS <category> tags (e.g. "Nasdaq:AAPL", "LSE:EDV")
  if (categories) {
    for (const cat of categories) {
      // A category may contain multiple symbols separated by ", " or "; "
      const parts = cat.split(/[,;]\s*/);
      for (const part of parts) {
        const cm = CATEGORY_TICKER_PATTERN.exec(part.trim());
        if (cm) {
          const ticker = cm[1]!.toUpperCase();
          if (!FALSE_POSITIVES.has(ticker)) {
            found.add(ticker);
          }
        }
      }
    }
  }

  return Array.from(found);
}
