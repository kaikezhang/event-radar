import type { Rule } from '@event-radar/shared';
import { POLITICAL_RULES } from './political-rules.js';

/**
 * Default classification rules for SEC filings (8-K items + Form 4 insider trading)
 * and political post classification (Truth Social + X).
 * Lower priority number = applied first. Severity uses "highest wins" logic in RuleEngine.
 */
export const DEFAULT_RULES: Rule[] = [
  ...POLITICAL_RULES,
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

  // ── M&A / Merger Keywords (HIGH) ─────────────────────────────────────
  {
    id: 'ma-acquire',
    name: 'M&A — Acquisition',
    conditions: [
      { type: 'titleContains', value: 'acquire' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['ma', 'acquisition'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'ma-acquisition',
    name: 'M&A — Acquisition (full word)',
    conditions: [
      { type: 'titleContains', value: 'acquisition' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['ma', 'acquisition'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'ma-merge',
    name: 'M&A — Merger',
    conditions: [
      { type: 'titleContains', value: 'merger' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['ma', 'merger'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'ma-merge-verb',
    name: 'M&A — Merge (verb)',
    conditions: [
      { type: 'titleContains', value: 'merge' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.85 },
      { type: 'addTags', values: ['ma', 'merger'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'ma-buyout',
    name: 'M&A — Buyout',
    conditions: [
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

  // ── Earnings Keywords (HIGH) ────────────────────────────────────────
  {
    id: 'earnings-q1',
    name: 'Earnings — Q1 Results',
    conditions: [
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

  // ── FDA Keywords (HIGH) ────────────────────────────────────────────
  {
    id: 'fda-approval',
    name: 'FDA — Approval',
    conditions: [
      { type: 'titleContains', value: 'FDA approval' },
    ],
    actions: [
      { type: 'setSeverity', value: 'HIGH' },
      { type: 'setConfidence', value: 0.9 },
      { type: 'addTags', values: ['fda', 'approval'] },
    ],
    priority: 20,
    enabled: true,
  },
  {
    id: 'fda-clinical-trial',
    name: 'FDA — Clinical Trial',
    conditions: [
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
