import type { RawEvent } from '@event-radar/shared';

export function extractSecMetadata(event: RawEvent) {
  const m = event.metadata ?? {};
  return {
    formType: m.form_type as string | undefined,
    itemTypes: m.item_types as string[] | undefined,
    itemDescriptions: m.item_descriptions as string[] | undefined,
    companyName: m.company_name as string | undefined,
    cik: m.cik as string | undefined,
    filingLink: m.filing_link as string | undefined,
  };
}

export function extractHaltMetadata(event: RawEvent) {
  const m = event.metadata ?? {};
  return {
    haltReasonCode: m.haltReasonCode as string | undefined,
    haltReasonDescription: m.haltReasonDescription as string | undefined,
    haltTime: m.haltTime as string | undefined,
    resumeTime: m.resumeTime as string | undefined,
    isLULD: m.isLULD as boolean | undefined,
    issueName: m.issueName as string | undefined,
    market: m.market as string | undefined,
  };
}

export function extractNewsMetadata(event: RawEvent) {
  const m = event.metadata ?? {};
  return {
    sourceFeed: m.source_feed as string | undefined,
    url: m.url as string | undefined,
    matchedKeywords: m.matched_keywords as string[] | undefined,
  };
}
