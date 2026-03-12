import { describe, it, expect } from 'vitest';
import {
  extractTickers,
  extractKeywords,
  estimateSentiment,
  POLITICAL_KEYWORDS,
} from '../utils/keyword-extractor.js';

describe('extractTickers', () => {
  it('should extract $AAPL cashtag format', () => {
    const tickers = extractTickers('Just bought $AAPL and $TSLA');
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('TSLA');
  });

  it('should extract ticker from company name "Apple announced"', () => {
    const tickers = extractTickers('Apple announced record quarterly earnings');
    expect(tickers).toContain('AAPL');
  });

  it('should extract TSLA from "Tesla" mention', () => {
    const tickers = extractTickers('Truth about Tesla and its future');
    expect(tickers).toContain('TSLA');
  });

  it('should return empty for "tariff on China" (no ticker)', () => {
    const tickers = extractTickers('tariff on China is going up');
    expect(tickers).toHaveLength(0);
  });

  it('should not match false positives like USD, CEO, SEC', () => {
    const tickers = extractTickers('The CEO told the SEC about USD trades');
    expect(tickers).toHaveLength(0);
  });

  it('should match exchange prefix format (NYSE: XYZ)', () => {
    const tickers = extractTickers('Company (NYSE: MSFT) reported earnings');
    expect(tickers).toContain('MSFT');
  });

  it('should extract multiple company names', () => {
    const tickers = extractTickers('Amazon and Google are competing in AI');
    expect(tickers).toContain('AMZN');
    expect(tickers).toContain('GOOGL');
  });

  it('should map SpaceX to TSLA', () => {
    const tickers = extractTickers('SpaceX launched another rocket');
    expect(tickers).toContain('TSLA');
  });

  it('should deduplicate tickers', () => {
    const tickers = extractTickers('Tesla $TSLA Tesla is great');
    expect(tickers.filter((t) => t === 'TSLA')).toHaveLength(1);
  });
});

describe('extractKeywords', () => {
  it('should match keywords from dictionary', () => {
    const result = extractKeywords('New tariff on China trade deal', POLITICAL_KEYWORDS);
    expect(result).toContain('tariff');
    expect(result).toContain('china');
    expect(result).toContain('trade');
    expect(result).toContain('deal');
  });

  it('should be case-insensitive', () => {
    const result = extractKeywords('TARIFF on CHINA', ['tariff', 'china']);
    expect(result).toContain('tariff');
    expect(result).toContain('china');
  });

  it('should return empty array when no matches', () => {
    const result = extractKeywords('Hello world', ['tariff', 'trade']);
    expect(result).toHaveLength(0);
  });
});

describe('estimateSentiment', () => {
  it('should return bearish for "ban imports"', () => {
    expect(estimateSentiment('ban imports from foreign countries')).toBe('bearish');
  });

  it('should return bullish for "great deal"', () => {
    expect(estimateSentiment('great deal with our partners')).toBe('bullish');
  });

  it('should return bearish for tariff-related text', () => {
    expect(estimateSentiment('New tariffs and sanctions on trade')).toBe('bearish');
  });

  it('should return bullish for positive market text', () => {
    expect(estimateSentiment('Record growth and partnership expansion')).toBe('bullish');
  });

  it('should return neutral when no sentiment keywords', () => {
    expect(estimateSentiment('The meeting is scheduled for Tuesday')).toBe('neutral');
  });

  it('should handle mixed sentiment (more bearish wins)', () => {
    expect(estimateSentiment('ban tariff sanctions but great deal')).toBe('bearish');
  });
});
