const GICS_SECTOR_VALUES = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
  'Communication Services',
] as const;

export type GicsSector = (typeof GICS_SECTOR_VALUES)[number];

export const GICS_SECTORS = [...GICS_SECTOR_VALUES];

export const TICKER_TO_SECTOR: Record<string, GicsSector> = {
  AAPL: 'Technology',
  MSFT: 'Technology',
  NVDA: 'Technology',
  AMD: 'Technology',
  ORCL: 'Technology',
  CRM: 'Technology',
  ADBE: 'Technology',
  CSCO: 'Technology',
  IBM: 'Technology',
  QCOM: 'Technology',
  TXN: 'Technology',
  INTC: 'Technology',
  AMAT: 'Technology',
  MU: 'Technology',
  PFE: 'Healthcare',
  JNJ: 'Healthcare',
  MRK: 'Healthcare',
  ABBV: 'Healthcare',
  LLY: 'Healthcare',
  UNH: 'Healthcare',
  TMO: 'Healthcare',
  DHR: 'Healthcare',
  GILD: 'Healthcare',
  BMY: 'Healthcare',
  JPM: 'Financials',
  BAC: 'Financials',
  WFC: 'Financials',
  GS: 'Financials',
  MS: 'Financials',
  C: 'Financials',
  BLK: 'Financials',
  SCHW: 'Financials',
  AXP: 'Financials',
  TSLA: 'Consumer Discretionary',
  AMZN: 'Consumer Discretionary',
  HD: 'Consumer Discretionary',
  MCD: 'Consumer Discretionary',
  NKE: 'Consumer Discretionary',
  SBUX: 'Consumer Discretionary',
  TGT: 'Consumer Discretionary',
  LOW: 'Consumer Discretionary',
  WMT: 'Consumer Staples',
  COST: 'Consumer Staples',
  PG: 'Consumer Staples',
  KO: 'Consumer Staples',
  PEP: 'Consumer Staples',
  PM: 'Consumer Staples',
  MO: 'Consumer Staples',
  CL: 'Consumer Staples',
  CAT: 'Industrials',
  BA: 'Industrials',
  HON: 'Industrials',
  GE: 'Industrials',
  DE: 'Industrials',
  UPS: 'Industrials',
  LMT: 'Industrials',
  RTX: 'Industrials',
  XOM: 'Energy',
  CVX: 'Energy',
  COP: 'Energy',
  SLB: 'Energy',
  EOG: 'Energy',
  OXY: 'Energy',
  KMI: 'Energy',
  MPC: 'Energy',
  NEE: 'Utilities',
  DUK: 'Utilities',
  SO: 'Utilities',
  AEP: 'Utilities',
  EXC: 'Utilities',
  SRE: 'Utilities',
  XEL: 'Utilities',
  PEG: 'Utilities',
  AMT: 'Real Estate',
  PLD: 'Real Estate',
  EQIX: 'Real Estate',
  O: 'Real Estate',
  SPG: 'Real Estate',
  WELL: 'Real Estate',
  PSA: 'Real Estate',
  CCI: 'Real Estate',
  LIN: 'Materials',
  APD: 'Materials',
  SHW: 'Materials',
  FCX: 'Materials',
  NEM: 'Materials',
  ECL: 'Materials',
  DD: 'Materials',
  NUE: 'Materials',
  GOOGL: 'Communication Services',
  GOOG: 'Communication Services',
  META: 'Communication Services',
  NFLX: 'Communication Services',
  DIS: 'Communication Services',
  TMUS: 'Communication Services',
  VZ: 'Communication Services',
  T: 'Communication Services',
  CMCSA: 'Communication Services',
  CHTR: 'Communication Services',
};

export function getSectorForTicker(ticker?: string | null): GicsSector | undefined {
  if (!ticker) {
    return undefined;
  }

  return TICKER_TO_SECTOR[ticker.toUpperCase()];
}

export function resolveSector(
  ticker?: string | null,
  metadata?: Record<string, unknown> | null,
): string {
  const mappedSector = getSectorForTicker(ticker);
  if (mappedSector) {
    return mappedSector;
  }

  const metadataSector = metadata?.sector;
  if (typeof metadataSector === 'string' && metadataSector.trim().length > 0) {
    return metadataSector.trim();
  }

  return 'Other';
}
