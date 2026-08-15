import { describe, expect, it } from 'vitest';
import {
  buildVerifiedDataBankOwnershipQuery,
  type DataBankEntry,
} from '@/lib/thinkforge/services/db';
import {
  buildDataBankVectorFilter,
  buildDataBankVectorMetadata,
  DataBankEmbeddingAuthorityError,
} from '@/lib/thinkforge/services/embedding-service';

function dataBankEntry(overrides: Partial<DataBankEntry> = {}): DataBankEntry {
  return {
    _id: 'entry_1',
    sessionId: 'session_1',
    projectId: 'session_1',
    userId: 'user_1',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'verified',
    title: 'Verified fact',
    content: { claim: 'Use verified evidence.' },
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DataBank visibility authority', () => {
  it('never treats a missing legacy scope as project ownership', () => {
    expect(buildVerifiedDataBankOwnershipQuery('project')).toEqual({
      provenanceStatus: 'verified',
      scope: 'project',
      memoryScope: 'project',
    });
  });

  it('allows only structurally valid brand or universal records into global reads', () => {
    expect(buildVerifiedDataBankOwnershipQuery('global')).toEqual({
      provenanceStatus: 'verified',
      $or: [
        {
          scope: 'global',
          memoryScope: 'brand',
          brandId: { $type: 'string', $ne: '' },
        },
        {
          scope: 'global',
          memoryScope: 'universal',
          $or: [
            { brandId: { $exists: false } },
            { brandId: null },
            { brandId: '' },
          ],
        },
      ],
    });
  });

  it('builds exact vector metadata without project or brand defaults', () => {
    expect(buildDataBankVectorMetadata(dataBankEntry())).toEqual({
      userId: 'user_1',
      type: 'atomic_fact',
      scope: 'project',
      memoryScope: 'project',
      provenanceStatus: 'verified',
      metadataVersion: 2,
      sessionId: 'session_1',
      projectId: 'session_1',
    });
  });

  it('rejects quarantined or structurally ambiguous entries before vector upsert', () => {
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      provenanceStatus: 'quarantined',
    }))).toThrow(DataBankEmbeddingAuthorityError);
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      scope: 'global',
      memoryScope: undefined,
      sessionId: undefined,
      projectId: undefined,
    }))).toThrow(DataBankEmbeddingAuthorityError);
  });

  it('requires exact brand authority for brand vector metadata', () => {
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      scope: 'global',
      memoryScope: 'brand',
      brandId: undefined,
    }))).toThrow('Brand memory requires a brandId.');
  });

  it('builds a provenance-bound brand vector filter', () => {
    expect(buildDataBankVectorFilter({
      userId: 'user_1',
      scope: 'global',
      memoryScope: 'brand',
      brandId: 'brand_1',
    })).toBe(
      "userId = 'user_1' AND provenanceStatus = 'verified' AND scope = 'global' AND memoryScope = 'brand' AND brandId = 'brand_1'",
    );
  });

  it('rejects global vector retrieval without a valid memory authority', () => {
    expect(() => buildDataBankVectorFilter({
      userId: 'user_1',
      scope: 'global',
    })).toThrow('Global vector retrieval requires brand or universal memory scope.');
    expect(() => buildDataBankVectorFilter({
      userId: 'user_1',
      scope: 'global',
      memoryScope: 'project',
    })).toThrow('Global vector retrieval requires brand or universal memory scope.');
  });
});
