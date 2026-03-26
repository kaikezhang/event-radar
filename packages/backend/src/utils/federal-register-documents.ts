const MARKET_KEYWORDS = [
  'tariff',
  'trade',
  'sanction',
  'regulation',
  'industry',
  'energy',
  'technology',
  'defense',
  'semiconductor',
  'oil',
  'gas',
  'pharmaceutical',
  'healthcare',
  'tax',
  'import',
  'export',
  'embargo',
  'infrastructure',
] as const;

export interface FederalRegisterDocument {
  document_number: string;
  title: string;
  type: string;
  abstract: string | null;
  html_url: string;
  pdf_url: string | null;
  publication_date: string;
  signing_date: string | null;
  executive_order_number: string | null;
  subtype: string | null;
  agencies?: Array<{
    raw_name?: string;
    name?: string;
    id?: number;
    url?: string;
    json_url?: string;
    parent_id?: number | null;
    slug?: string;
  }>;
}

export interface FederalRegisterApiResponse {
  count: number;
  results: FederalRegisterDocument[];
}

export function parseFederalRegisterDocs(
  json: FederalRegisterApiResponse,
): FederalRegisterDocument[] {
  if (!json?.results) return [];
  return json.results;
}

export function isMarketRelevant(doc: FederalRegisterDocument): boolean {
  const text = `${doc.title} ${doc.abstract ?? ''}`.toLowerCase();
  return MARKET_KEYWORDS.some((kw) => text.includes(kw));
}

export function extractTopics(doc: FederalRegisterDocument): string[] {
  const text = `${doc.title} ${doc.abstract ?? ''}`.toLowerCase();
  const topics: string[] = [];

  if (text.includes('tariff') || text.includes('trade') || text.includes('import') || text.includes('export')) {
    topics.push('trade');
  }
  if (text.includes('sanction') || text.includes('embargo')) {
    topics.push('sanctions');
  }
  if (text.includes('energy') || text.includes('oil') || text.includes('gas')) {
    topics.push('energy');
  }
  if (text.includes('technology') || text.includes('semiconductor')) {
    topics.push('technology');
  }
  if (text.includes('defense')) {
    topics.push('defense');
  }
  if (text.includes('healthcare') || text.includes('pharmaceutical')) {
    topics.push('healthcare');
  }
  if (text.includes('tax')) {
    topics.push('tax');
  }
  if (text.includes('regulation') || text.includes('industry')) {
    topics.push('regulation');
  }
  if (text.includes('infrastructure')) {
    topics.push('infrastructure');
  }

  return topics;
}
