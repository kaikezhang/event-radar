import type { Rule } from '@event-radar/shared';

const POLITICAL_LLM_TAGS = ['political-market-impact', 'force-llm-classification'] as const;

function createPoliticalTags(
  actor: 'trump' | 'elon',
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
 * Classification rules for political posts (Truth Social + X).
 * Used alongside the existing SEC rules in default-rules.ts.
 */
export const POLITICAL_RULES: Rule[] = [
  // ── CRITICAL ─────────────────────────────────────────────────────────
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

  // ── HIGH ─────────────────────────────────────────────────────────────
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
  {
    id: 'elon-doge-govt',
    name: 'Elon — DOGE/Government Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'x' },
      { type: 'titleContains', value: 'doge' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('elon', ['doge', 'government']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'elon-government',
    name: 'Elon — Government Efficiency',
    conditions: [
      { type: 'sourceEquals', value: 'x' },
      { type: 'titleContains', value: 'government' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('elon', ['government']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'elon-crypto',
    name: 'Elon — Crypto Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'x' },
      { type: 'titleContains', value: 'crypto' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('elon', ['crypto']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'elon-bitcoin',
    name: 'Elon — Bitcoin Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'x' },
      { type: 'titleContains', value: 'bitcoin' },
    ],
    actions: [
      { type: 'addTags', values: createPoliticalTags('elon', ['crypto', 'bitcoin']) },
      { type: 'setPriority', value: 10 },
    ],
    priority: 15,
    enabled: true,
  },

  // ── MEDIUM ───────────────────────────────────────────────────────────
  {
    id: 'elon-tesla',
    name: 'Elon — Tesla Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'x' },
      { type: 'titleContains', value: 'tesla' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'addTags', values: ['elon', 'tesla'] },
      { type: 'setPriority', value: 25 },
    ],
    priority: 25,
    enabled: true,
  },
  {
    id: 'elon-spacex',
    name: 'Elon — SpaceX Keywords',
    conditions: [
      { type: 'sourceEquals', value: 'x' },
      { type: 'titleContains', value: 'spacex' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'addTags', values: ['elon', 'spacex'] },
      { type: 'setPriority', value: 25 },
    ],
    priority: 25,
    enabled: true,
  },
];
