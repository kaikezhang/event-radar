import type { Rule } from '@event-radar/shared';

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
      { type: 'addTags', values: ['trump', 'tariff', 'trade-policy'] },
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
      { type: 'addTags', values: ['trump', 'trade-policy'] },
      { type: 'setPriority', value: 5 },
    ],
    priority: 10,
    enabled: true,
  },

  // ── HIGH ─────────────────────────────────────────────────────────────
  {
    id: 'trump-company',
    name: 'Trump — Company Name Mentions',
    conditions: [
      { type: 'sourceEquals', value: 'truth-social' },
      { type: 'titleContains', value: 'company' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['trump', 'company-mention'] },
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
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['trump', 'crypto'] },
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
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['trump', 'crypto', 'bitcoin'] },
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
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['elon', 'doge', 'government'] },
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
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['elon', 'government'] },
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
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['elon', 'crypto'] },
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
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'addTags', values: ['elon', 'crypto', 'bitcoin'] },
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
