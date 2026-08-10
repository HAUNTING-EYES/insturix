import { describe, expect, it } from 'vitest';
import { resolveDataBankEntryProvenance } from '@/lib/thinkforge/services/db';

describe('DataBank memory provenance', () => {
  it('requires explicit global memory authority', () => {
    expect(() => resolveDataBankEntryProvenance({
      scope: 'global',
      content: { claim: 'A one-off old campaign phrase' },
    })).toThrow('Global DataBank entries require an explicit brand or universal memory scope.');
  });

  it('promotes only trusted post-mortem lessons into first-class brand memory', () => {
    expect(resolveDataBankEntryProvenance({
      scope: 'global',
      content: {
        claim: 'Lead this brand with operational proof.',
        source: 'post-mortem',
        memoryScope: 'brand',
        brandId: 'brand_1',
      },
      tags: ['lesson-learned'],
    })).toEqual({
      scope: 'global',
      memoryScope: 'brand',
      brandId: 'brand_1',
      tags: expect.arrayContaining(['lesson-learned', 'memory:brand', 'brand:brand_1']),
    });
  });

  it('keeps explicit universal memory unassigned to every brand', () => {
    expect(resolveDataBankEntryProvenance({
      scope: 'global',
      memoryScope: 'universal',
      content: { claim: 'Always use accessible language.' },
    })).toEqual({
      scope: 'global',
      memoryScope: 'universal',
      tags: ['memory:universal'],
    });
  });

  it('rejects a brand memory record without its source brand', () => {
    expect(() => resolveDataBankEntryProvenance({
      scope: 'global',
      memoryScope: 'brand',
      content: { claim: 'Use customer proof.' },
    })).toThrow('Brand memory requires a brandId.');
  });
});
