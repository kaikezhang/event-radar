import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema.js';
import * as shared from '../../../shared/src/index.js';

describe('subtraction round 7 dead code cleanup', () => {
  it('removes dead schema exports', () => {
    expect(schema).not.toHaveProperty('priceCache');
    expect(schema).not.toHaveProperty('storyGroups');
    expect(schema).not.toHaveProperty('storyEvents');
  });

  it('removes dead shared exports', () => {
    expect(shared).not.toHaveProperty('CrossSourceMatchTypeSchema');
    expect(shared).not.toHaveProperty('CrossSourceDedupResultSchema');
    expect(shared).not.toHaveProperty('SourceUrlSchema');
    expect(shared).not.toHaveProperty('MergedEventDataSchema');
    expect(shared).not.toHaveProperty('CrossSourceDedupOptionsSchema');
    expect(shared).not.toHaveProperty('ConfirmationResultSchema');
    expect(shared).not.toHaveProperty('ConfirmationConfigSchema');
    expect(shared).not.toHaveProperty('ImpactEventSchema');
    expect(shared).not.toHaveProperty('ImpactResponseSchema');
  });
});
