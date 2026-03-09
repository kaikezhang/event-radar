import type { Rule } from '@event-radar/shared';

/**
 * Default classification rules based on SEC 8-K item type mappings.
 * Lower priority number = applied first. Severity uses "highest wins" logic in RuleEngine.
 */
export const DEFAULT_RULES: Rule[] = [
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
      { type: 'setSeverity', value: 'MEDIUM' },
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
];
