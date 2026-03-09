import type { RawEvent, Severity } from '@event-radar/shared';

/**
 * SEC 8-K item number → severity mapping (stub classification).
 * Full AI-powered classification comes in Phase 1B.
 */
const ITEM_SEVERITY: Record<string, Severity> = {
  // CRITICAL — existential / market-moving
  '1.02': 'CRITICAL', // Termination of Material Definitive Agreement
  '1.03': 'CRITICAL', // Bankruptcy or Receivership
  '4.01': 'CRITICAL', // Changes in Registrant's Certifying Accountant
  '4.02': 'CRITICAL', // Non-Reliance on Previously Issued Financial Statements

  // HIGH — significant corporate actions
  '1.01': 'HIGH', // Entry into Material Definitive Agreement
  '2.01': 'HIGH', // Completion of Acquisition or Disposition
  '2.04': 'HIGH', // Triggering Events (acceleration of obligations)
  '2.05': 'HIGH', // Costs Associated with Exit / Restructuring Activities
  '2.06': 'HIGH', // Material Impairments
  '3.01': 'HIGH', // Delisting or Transfer of Securities
  '5.01': 'HIGH', // Changes in Control of Registrant
  '5.02': 'HIGH', // Departure/Election of Directors or Principal Officers

  // MEDIUM — notable but routine
  '2.02': 'MEDIUM', // Results of Operations and Financial Condition
  '2.03': 'MEDIUM', // Creation of Direct Financial Obligation
  '3.02': 'MEDIUM', // Unregistered Sales of Equity Securities
  '3.03': 'MEDIUM', // Material Modification to Rights of Security Holders
  '5.03': 'MEDIUM', // Amendments to Articles / Bylaws
  '5.07': 'MEDIUM', // Submission of Matters to a Vote
  '8.01': 'MEDIUM', // Other Events

  // LOW — informational
  '5.04': 'LOW', // Temporary Suspension of Trading Under Benefit Plans
  '5.05': 'LOW', // Amendments to Code of Ethics
  '5.06': 'LOW', // Change in Shell Company Status
  '5.08': 'LOW', // Shareholder Director Nominations
  '7.01': 'LOW', // Regulation FD Disclosure
  '9.01': 'LOW', // Financial Statements and Exhibits
};

const DEFAULT_SEVERITY: Severity = 'MEDIUM';

/**
 * Classify severity from a RawEvent based on 8-K item numbers.
 * Picks the highest severity among all items in the filing.
 */
export function classifySeverity(event: RawEvent): Severity {
  const items = extractItemTypes(event);
  if (items.length === 0) return DEFAULT_SEVERITY;

  const ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  let best: Severity | undefined;
  for (const item of items) {
    const sev = ITEM_SEVERITY[item];
    if (!sev) continue;
    if (!best || ORDER.indexOf(sev) < ORDER.indexOf(best)) {
      best = sev;
    }
  }

  return best ?? DEFAULT_SEVERITY;
}

function extractItemTypes(event: RawEvent): string[] {
  const meta = event.metadata;
  if (!meta) return [];

  const items = meta['item_types'];
  if (Array.isArray(items) && items.every((i) => typeof i === 'string')) {
    return items as string[];
  }

  return [];
}
