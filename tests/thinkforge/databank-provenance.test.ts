import { describe, expect, it } from 'vitest';
import {
  classifyLegacyGlobalDataBankProvenance,
  resolveDataBankEntryProvenance,
} from '@/lib/thinkforge/services/db';

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

  it('backfills an explicitly tagged brand lesson without inspecting its prose', () => {
    expect(classifyLegacyGlobalDataBankProvenance({
      scope: 'global',
      content: { claim: 'The old campaign phrasing should not decide this.' },
      tags: ['lesson-learned', 'memory:brand', 'brand:brand_1'],
    })).toEqual({
      status: 'verified',
      memoryScope: 'brand',
      brandId: 'brand_1',
      tags: expect.arrayContaining(['lesson-learned', 'memory:brand', 'brand:brand_1']),
    });
  });

  it('quarantines raw legacy content that merely claims a brand scope', () => {
    expect(classifyLegacyGlobalDataBankProvenance({
      scope: 'global',
      content: {
        claim: 'Use an authoritative tone.',
        memoryScope: 'brand',
        brandId: 'brand_1',
        source: 'unverified-import',
      },
      tags: ['legacy-import'],
    })).toEqual({
      status: 'quarantined',
      reason: 'missing_explicit_memory_scope',
    });
  });

  it('quarantines conflicting brand evidence instead of selecting one', () => {
    expect(classifyLegacyGlobalDataBankProvenance({
      scope: 'global',
      memoryScope: 'brand',
      brandId: 'brand_1',
      content: { claim: 'Use verified customer proof.' },
      tags: ['memory:brand', 'brand:brand_2'],
    })).toEqual({
      status: 'quarantined',
      reason: 'conflicting_brand_ids',
    });
  });
});
