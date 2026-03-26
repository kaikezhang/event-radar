import type { Rule } from '@event-radar/shared';

const POLITICAL_LLM_TAGS = ['political-market-impact', 'force-llm-classification'] as const;

function createPoliticalTags(
  actor: 'trump',
  tags: readonly string[],
): string[] {
  return [actor, ...POLITICAL_LLM_TAGS, ...tags];
}

const TRUTH_SOCIAL_MARKET_IMPACT_KEYWORDS = [
  {
    id: 'trump-geopolitical-iran',
    name: 'Trump — Iran Keywords',
    keyword: 'iran',
    tags: ['geopolitics', 'iran'],
  },
  {
    id: 'trump-geopolitical-china',
    name: 'Trump — China Keywords',
    keyword: 'china',
    tags: ['geopolitics', 'china'],
  },
  {
    id: 'trump-policy-tariff',
    name: 'Trump — Tariff Boost',
    keyword: 'tariff',
    tags: ['trade-policy', 'tariff'],
  },
  {
    id: 'trump-geopolitical-military',
    name: 'Trump — Military Keywords',
    keyword: 'military',
    tags: ['geopolitics', 'military'],
  },
  {
    id: 'trump-policy-sanctions',
    name: 'Trump — Sanctions Keywords',
    keyword: 'sanctions',
    tags: ['policy', 'sanctions'],
  },
  {
    id: 'trump-geopolitical-strike',
    name: 'Trump — Strike Keywords',
    keyword: 'strike',
    tags: ['geopolitics', 'strike'],
  },
  {
    id: 'trump-geopolitical-war',
    name: 'Trump — War Keywords',
    keyword: 'war',
    tags: ['geopolitics', 'war'],
  },
  {
    id: 'trump-geopolitical-peace',
    name: 'Trump — Peace Keywords',
    keyword: 'peace',
    tags: ['geopolitics', 'peace'],
  },
  {
    id: 'trump-geopolitical-ceasefire',
    name: 'Trump — Ceasefire Keywords',
    keyword: 'ceasefire',
    tags: ['geopolitics', 'ceasefire'],
  },
  {
    id: 'trump-geopolitical-complete-total',
    name: 'Trump — Complete And Total Keywords',
    keyword: 'complete and total',
    tags: ['geopolitics', 'ceasefire'],
  },
  {
    id: 'trump-trade-deal',
    name: 'Trump — Trade Deal Keywords',
    keyword: 'trade deal',
    tags: ['trade-policy', 'trade-deal'],
  },
  {
    id: 'trump-policy-executive-order',
    name: 'Trump — Executive Order Keywords',
    keyword: 'executive order',
    tags: ['policy', 'executive-order'],
  },
  {
    id: 'trump-fed',
    name: 'Trump — Fed Keywords',
    keyword: 'fed',
    tags: ['macro', 'fed'],
  },
  {
    id: 'trump-interest-rate',
    name: 'Trump — Interest Rate Keywords',
    keyword: 'interest rate',
    tags: ['macro', 'rates'],
  },
  {
    id: 'trump-policy-ban',
    name: 'Trump — Ban Keywords',
    keyword: 'ban',
    tags: ['policy', 'ban'],
  },
  {
    id: 'trump-policy-postpone',
    name: 'Trump — Postpone Keywords',
    keyword: 'postpone',
    tags: ['policy', 'postpone'],
  },
  {
    id: 'trump-policy-halt',
    name: 'Trump — Halt Keywords',
    keyword: 'halt',
    tags: ['policy', 'halt'],
  },
] as const;

function createTruthSocialBoostRules(): Rule[] {
  return TRUTH_SOCIAL_MARKET_IMPACT_KEYWORDS.map((rule) => ({
    id: rule.id,
    name: rule.name,
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: rule.keyword },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('trump', rule.tags) },
      { type: 'setPriority', value: 12 },
    ],
    priority: 12,
    enabled: true,
  }));
}

/**
 * Default classification rules for SEC filings, Truth Social political posts,
 * and surviving macro/geopolitical sources.
 * Lower priority number = applied first. Severity uses "highest wins" logic in RuleEngine.
 */
export const DEFAULT_RULES: Rule[] = [
  // ── Truth Social Political Rules ────────────────────────────────────
  {
    id: 'trump-tariff',
    name: 'Trump — Tariff/Trade Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: 'tariff' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'addTags', values: createPoliticalTags('trump', ['tariff', 'trade-policy']) },
      { type: 'setPriority', value: 5 },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'trump-trade',
    name: 'Trump — Trade Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: 'trade' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'addTags', values: createPoliticalTags('trump', ['trade-policy']) },
      { type: 'setPriority', value: 5 },
    ],
    priority: 10,
    enabled: true,
  },
  ...createTruthSocialBoostRules(),
  {
    id: 'trump-company',
    name: 'Trump — Company Name Mentions',
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: 'company' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('trump', ['company-mention']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'trump-crypto',
    name: 'Trump — Crypto Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: 'crypto' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('trump', ['crypto']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'trump-bitcoin',
    name: 'Trump — Bitcoin Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: 'bitcoin' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('trump', ['crypto', 'bitcoin']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },

  // ── Macro Rules For Surviving Sources ───────────────────────────────
  {
    id: 'breaking-news-war',
    name: 'Breaking News — War/Conflict',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'war' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'geopolitical', 'war'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-sanctions-imposed',
    name: 'Breaking News — Sanctions Imposed',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'sanctions imposed' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'sanction', 'geopolitical'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-defaults-on',
    name: 'Breaking News — Defaults On Debt',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'defaults on' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'default', 'credit'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-tariff',
    name: 'Breaking News — Tariff',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'tariff' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'tariff', 'trade'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-sanction',
    name: 'Breaking News — Sanction',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'sanction' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'sanction', 'geopolitical'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-embargo',
    name: 'Breaking News — Embargo',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'embargo' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'embargo', 'trade'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-opec',
    name: 'Breaking News — OPEC',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'opec' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'opec', 'energy'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-recession',
    name: 'Breaking News — Recession',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'recession' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'recession', 'macro'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-bailout',
    name: 'Breaking News — Bailout',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'bailout' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['breaking-news', 'bailout', 'financial'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-default',
    name: 'Breaking News — Default',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'default' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['breaking-news', 'default', 'credit'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'breaking-news-fed',
    name: 'Breaking News — Federal Reserve',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'fed' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['breaking-news', 'fed', 'monetary-policy'] },
    ],
    priority: 25,
    enabled: true,
  },
  {
    id: 'breaking-news-rate',
    name: 'Breaking News — Interest Rate',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'rate' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.75 },
      { type: 'addTags', values: ['breaking-news', 'rates'] },
    ],
    priority: 25,
    enabled: true,
  },
  {
    id: 'breaking-news-inflation',
    name: 'Breaking News — Inflation',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'inflation' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['breaking-news', 'inflation', 'macro'] },
    ],
    priority: 25,
    enabled: true,
  },

  // ── CRITICAL ───────────────────────────────────────────────────────
  {
    id: '8k-1.02-bankruptcy',
    name: '8-K 1.02 — Termination of Material Agreement',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '1.02' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'addTags', values: ['8-K', 'material-agreement-termination'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: '8k-1.03-bankruptcy',
    name: '8-K 1.03 — Bankruptcy or Receivership',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '1.03' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'addTags', values: ['8-K', 'bankruptcy'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: '8k-4.01-accountant-change',
    name: '8-K 4.01 — Changes in Certifying Accountant',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '4.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'addTags', values: ['8-K', 'accountant-change'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: '8k-4.02-restatement',
    name: '8-K 4.02 — Non-Reliance on Financial Statements',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '4.02' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'addTags', values: ['8-K', 'financial-restatement'] },
    ],
    priority: 10,
    enabled: true,
  },

  // ── HIGH ───────────────────────────────────────────────────────────
  {
    id: '8k-5.02-ceo-change',
    name: '8-K 5.02 — Departure/Election of Directors or Officers',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '5.02' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'leadership-change'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-2.01-acquisition',
    name: '8-K 2.01 — Completion of Acquisition or Disposition',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '2.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'acquisition'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-2.04-triggering-events',
    name: '8-K 2.04 — Triggering Events',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '2.04' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'triggering-event'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-2.05-restructuring',
    name: '8-K 2.05 — Exit/Restructuring Activities',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '2.05' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'restructuring'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-2.06-impairment',
    name: '8-K 2.06 — Material Impairments',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '2.06' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'impairment'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-3.01-delisting',
    name: '8-K 3.01 — Delisting/Transfer',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '3.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'delisting'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-5.01-control-change',
    name: '8-K 5.01 — Changes in Control',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '5.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'control-change'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: '8k-1.01-material-agreement',
    name: '8-K 1.01 — Entry into Material Agreement',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '1.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['8-K', 'material-agreement'] },
    ],
    priority: 20,
    enabled: true,
  },

  // ── MEDIUM ─────────────────────────────────────────────────────────
  {
    id: '8k-2.02-earnings',
    name: '8-K 2.02 — Results of Operations',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '2.02' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'addTags', values: ['8-K', 'earnings'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: '8k-2.03-financial-obligation',
    name: '8-K 2.03 — Direct Financial Obligation',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '2.03' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'addTags', values: ['8-K', 'financial-obligation'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: '8k-8.01-other',
    name: '8-K 8.01 — Other Events',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '8.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'LOW' },
      { type: 'addTags', values: ['8-K', 'other-event'] },
    ],
    priority: 30,
    enabled: true,
  },

  // ── LOW ────────────────────────────────────────────────────────────
  {
    id: '8k-7.01-reg-fd',
    name: '8-K 7.01 — Regulation FD Disclosure',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '7.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'LOW' },
      { type: 'addTags', values: ['8-K', 'reg-fd'] },
    ],
    priority: 40,
    enabled: true,
  },
  {
    id: '8k-9.01-exhibits',
    name: '8-K 9.01 — Financial Statements and Exhibits',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'itemTypeContains', value: '9.01' },
    ],
    actions: [
      { type: 'setSeverity', value: 'LOW' },
      { type: 'addTags', values: ['8-K', 'exhibits'] },
    ],
    priority: 40,
    enabled: true,
  },

  // ── Form 4 — Insider Trading ────────────────────────────────────────

  {
    id: 'form4-insider-purchase',
    name: 'Form 4 — Insider Purchase (>$100k)',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'titleContains', value: 'Form 4' },
      { type: 'titleContains', value: 'Purchase' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['Form-4', 'insider-purchase'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'form4-insider-sale',
    name: 'Form 4 — Insider Sale',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'titleContains', value: 'Form 4' },
      { type: 'titleContains', value: 'Sale' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'addTags', values: ['Form-4', 'insider-sale'] },
    ],
    priority: 25,
    enabled: true,
  },
  {
    id: 'form4-routine-10b5-1',
    name: 'Form 4 — Routine 10b5-1 Plan Sale',
    conditions: [
      { type: 'sourceEquals', value: 'sec-edgar' },
      { type: 'titleContains', value: 'Form 4' },
      { type: 'titleContains', value: 'Sale' },
      { type: 'titleContains', value: '10b5-1' },
    ],
    actions: [
      { type: 'setSeverity', value: 'LOW' },
      { type: 'addTags', values: ['Form-4', 'insider-sale', '10b5-1-plan'] },
    ],
    priority: 35,
    enabled: true,
  },

  // ── Breaking News — Specific Actions (CRITICAL) ──────────────────────
  {
    id: 'breaking-news-trading-halt',
    name: 'Breaking News — Trading Halt',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'halted' },
      { type: 'titleContains', value: 'trading' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'trading-halt'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-trading-suspended',
    name: 'Breaking News — Trading Suspended',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'suspended' },
      { type: 'titleContains', value: 'trading' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'trading-halt'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-executive-order-signed',
    name: 'Breaking News — Executive Order Signed',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'executive order' },
      { type: 'titleContains', value: 'signs' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'executive-order'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-executive-order-issued',
    name: 'Breaking News — Executive Order Issued',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'executive order' },
      { type: 'titleContains', value: 'issues' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'executive-order'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-bankruptcy-filed',
    name: 'Breaking News — Bankruptcy Filed',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'files for bankruptcy' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['breaking-news', 'bankruptcy'] },
    ],
    priority: 10,
    enabled: true,
  },

  // ── M&A / Merger Keywords ────────────────────────────────────────────
  {
    id: 'breaking-news-ma-announces-acquisition',
    name: 'Breaking News — Acquisition Announcement',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'announces' },
      { type: 'titleContains', value: 'acquisition' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['ma', 'acquisition'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-ma-to-acquire',
    name: 'Breaking News — To Acquire',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'to acquire' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['ma', 'acquisition'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-ma-merger-agreement',
    name: 'Breaking News — Merger Agreement',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'merger agreement' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['ma', 'merger'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'breaking-news-ma-buyout',
    name: 'Breaking News — Buyout',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'buyout' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['ma', 'buyout'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'breaking-news-ma-merger-talks',
    name: 'Breaking News — Merger Talks',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'merger talks' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['ma', 'merger'] },
    ],
    priority: 20,
    enabled: true,
  },

  // ── Earnings Keywords (HIGH) ────────────────────────────────────────
  {
    id: 'earnings-q1',
    name: 'Earnings — Q1 Results',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Q1 earnings' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['earnings', 'quarterly-results'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'earnings-q2',
    name: 'Earnings — Q2 Results',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Q2 earnings' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['earnings', 'quarterly-results'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'earnings-q3',
    name: 'Earnings — Q3 Results',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Q3 earnings' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['earnings', 'quarterly-results'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'earnings-q4',
    name: 'Earnings — Q4 Results',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Q4 earnings' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['earnings', 'quarterly-results'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'earnings-eps',
    name: 'Earnings — EPS',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'EPS' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['earnings', 'eps'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'earnings-revenue-beat',
    name: 'Earnings — Revenue Beat',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'revenue beat' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['earnings', 'revenue-beat'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'earnings-guidance-raise',
    name: 'Earnings — Guidance Raise',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'guidance raise' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['earnings', 'guidance'] },
    ],
    priority: 20,
    enabled: true,
  },

  // ── FDA Keywords ────────────────────────────────────────────────────
  {
    id: 'fda-approval',
    name: 'FDA — Approval',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'fda approved' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['fda', 'approval'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'fda-approval-granted',
    name: 'FDA — Approval Granted',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'fda approval granted' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['fda', 'approval'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'fda-rejected',
    name: 'FDA — Rejected',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'fda rejected' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['fda', 'rejection'] },
    ],
    priority: 10,
    enabled: true,
  },
  {
    id: 'fda-clinical-trial',
    name: 'FDA — Clinical Trial',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'clinical trial' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['fda', 'clinical-trial'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'fda-phase-1',
    name: 'FDA — Phase 1 Trial',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Phase 1' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['fda', 'phase-1'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'fda-phase-2',
    name: 'FDA — Phase 2 Trial',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Phase 2' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['fda', 'phase-2'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'fda-phase-3',
    name: 'FDA — Phase 3 Trial',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'Phase 3' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['fda', 'phase-3'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'fda-nda',
    name: 'FDA — NDA',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'NDA' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['fda', 'nda'] },
    ],
    priority: 20,
    enabled: true,
  },

  // ── Executive Changes (MEDIUM) ─────────────────────────────────────
  {
    id: 'exec-appoint',
    name: 'Executive — Appointment',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'appoint' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['executive', 'appointment'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: 'exec-resign',
    name: 'Executive — Resignation',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'resign' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['executive', 'resignation'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: 'exec-promote',
    name: 'Executive — Promotion',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'promote' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['executive', 'promotion'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: 'exec-ceo',
    name: 'Executive — CEO Change',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'CEO' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['executive', 'ceo'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: 'exec-cfo',
    name: 'Executive — CFO Change',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'CFO' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['executive', 'cfo'] },
    ],
    priority: 30,
    enabled: true,
  },

  // ── Partnerships (MEDIUM) ───────────────────────────────────────────
  {
    id: 'partner-with',
    name: 'Partnership — Partner With',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'partner with' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['partnership', 'strategic'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: 'strategic-alliance',
    name: 'Partnership — Strategic Alliance',
    conditions: [
      { type: 'sourceEquals', value: 'breaking-news' },
      { type: 'titleContains', value: 'strategic alliance' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.8 },
      { type: 'addTags', values: ['partnership', 'strategic-alliance'] },
    ],
    priority: 30,
    enabled: true,
  },
  {
    id: 'joint-venture',
    name: 'Partnership — Joint Venture',
    conditions: [
      { type: 'titleContains', value: 'joint venture' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['partnership', 'joint-venture'] },
    ],
    priority: 30,
    enabled: true,
  },
];
