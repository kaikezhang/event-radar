import { createHash } from 'node:crypto';

export const SEC_USER_AGENT = 'EventRadar/1.0 (contact@example.com)';
export const SEC_XML_ACCEPT = 'application/atom+xml, application/xml, text/xml';

export function deterministicScannerUuid(seed: string): string {
  const hex = createHash('sha256')
    .update(seed)
    .digest('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
