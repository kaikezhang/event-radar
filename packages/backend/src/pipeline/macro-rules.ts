import type { Rule } from '@event-radar/shared';

/**
 * Classification rules for macro & geopolitical scanners (P3.2).
 * Economic calendar releases, FedWatch rate shifts, and breaking news.
 */
export const MACRO_RULES: Rule[] = [
  // ── Economic Calendar — CRITICAL ──────────────────────────────────────
  {
    id: 'econ-nfp-release',
    name: 'Econ — Non-Farm Payrolls Release',
    conditions: [
      { type: 'sourceEquals', value: 'econ-calendar' },
      { type: 'titleContains', value: 'Non-Farm Payrolls' },
    ],
    actions: [
      { type: 'setSeverity', value: 'CRITICAL' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['econ', 'nfp', 'employment'] },
    ],
    priority: 10,
    enabled: true,
  },

  // ── Economic Calendar — HIGH ──────────────────────────────────────────
  {
    id: 'econ-cpi-release',
    name: 'Econ — CPI Release',
    conditions: [
      { type: 'sourceEquals', value: 'econ-calendar' },
      { type: 'titleContains', value: 'Consumer Price Index' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['econ', 'cpi', 'inflation'] },
    ],
    priority: 15,
    enabled: true,
  },
  {
    id: 'econ-gdp-release',
    name: 'Econ — GDP Release',
    conditions: [
      { type: 'sourceEquals', value: 'econ-calendar' },
      { type: 'titleContains', value: 'Gross Domestic Product' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.95 },
      { type: 'addTags', values: ['econ', 'gdp', 'growth'] },
    ],
    priority: 15,
    enabled: true,
  },

  // ── Economic Calendar — MEDIUM ────────────────────────────────────────
  {
    id: 'econ-ppi-release',
    name: 'Econ — PPI Release',
    conditions: [
      { type: 'sourceEquals', value: 'econ-calendar' },
      { type: 'titleContains', value: 'Producer Price Index' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['econ', 'ppi', 'inflation'] },
    ],
    priority: 25,
    enabled: true,
  },
  {
    id: 'econ-retail-sales',
    name: 'Econ — Retail Sales',
    conditions: [
      { type: 'sourceEquals', value: 'econ-calendar' },
      { type: 'titleContains', value: 'Retail Sales' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['econ', 'retail', 'consumer-spending'] },
    ],
    priority: 25,
    enabled: true,
  },
  {
    id: 'econ-jobless-claims',
    name: 'Econ — Jobless Claims',
    conditions: [
      { type: 'sourceEquals', value: 'econ-calendar' },
      { type: 'titleContains', value: 'Jobless Claims' },
    ],
    actions: [
      { type: 'setSeverity', value: 'MEDIUM' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['econ', 'employment', 'jobless-claims'] },
    ],
    priority: 25,
    enabled: true,
  },

  // ── FedWatch — HIGH ───────────────────────────────────────────────────
  {
    id: 'fedwatch-probability-shift',
    name: 'FedWatch — Rate Probability Shift',
    conditions: [
      { type: 'sourceEquals', value: 'fedwatch' },
      { type: 'titleContains', value: 'probability shift' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['fedwatch', 'rates', 'fomc'] },
    ],
    priority: 15,
    enabled: true,
  },

  // ── FedWatch — LOW (snapshot/informational) ───────────────────────────
  {
    id: 'fedwatch-snapshot',
    name: 'FedWatch — Snapshot',
    conditions: [
      { type: 'sourceEquals', value: 'fedwatch' },
      { type: 'titleContains', value: 'snapshot' },
    ],
    actions: [
      { type: 'setSeverity', value: 'LOW' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['fedwatch', 'rates', 'snapshot'] },
    ],
    priority: 40,
    enabled: true,
  },

  // ── Breaking News — CRITICAL ──────────────────────────────────────────
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

  // ── Breaking News — HIGH ──────────────────────────────────────────────
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

  // ── Breaking News — MEDIUM ────────────────────────────────────────────
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
];
