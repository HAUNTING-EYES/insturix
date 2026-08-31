import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  findOne: vi.fn(),
  getDatabase: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: persistence.getDatabase,
}));

import {
  assertAssetAnalysisSourceBindingV2,
  createAssetAnalysisSourceBindingV2,
  getSourceBoundAnalysisV2,
  saveSourceBoundAnalysisV2,
} from '@/lib/editron/services/asset-analysis-source-cache-v2';

describe('source-bound asset analysis cache V2', () => {
  beforeEach(() => {
    persistence.documents.clear();
    persistence.findOne.mockReset();
    persistence.getDatabase.mockReset();
    persistence.updateOne.mockReset();
    persistence.updateOne.mockImplementation(async (
      filter: Record<string, unknown>,
      update: { $setOnInsert: Record<string, unknown> },
    ) => {
      const id = String(filter._id);
      const inserted = !persistence.documents.has(id);
      if (inserted) persistence.documents.set(id, update.$setOnInsert);
      return { upsertedCount: inserted ? 1 : 0 };
    });
    persistence.findOne.mockImplementation(async (filter: Record<string, unknown>) =>
      persistence.documents.get(String(filter._id)) ?? null);
    persistence.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: persistence.findOne,
        updateOne: persistence.updateOne,
      })),
    });
  });

  it('creates a stable exact-byte identity and rejects forged bindings', () => {
    const first = binding();
    const equivalent = binding();
    const master = binding({
      sourceRole: 'MASTER',
      sourceVersionSha256: 'c'.repeat(64),
      storageVersionSha256: 'd'.repeat(64),
    });
    const differentInput = binding({ analysisInputSha256: 'e'.repeat(64) });

    expect(first).toEqual(equivalent);
    expect(master.bindingSha256).not.toBe(first.bindingSha256);
    expect(differentInput.bindingSha256).not.toBe(first.bindingSha256);
    expect(() => assertAssetAnalysisSourceBindingV2({
      ...first,
      sourceVersionSha256: 'e'.repeat(64),
    })).toThrow('ASSET_ANALYSIS_SOURCE_BINDING_HASH_MISMATCH');
  });

  it('stores canonical completed output and restores analyzedAt as a Date', async () => {
    const source = binding();
    const stored = await saveSourceBoundAnalysisV2(source, analysis({
      optionalObjectField: undefined,
      nested: { z: 2, a: 1 },
    }));
    const read = await getSourceBoundAnalysisV2<Record<string, unknown>>(source);

    expect(stored.analyzedAt).toBeInstanceOf(Date);
    expect(read).toMatchObject({
      assetId: 'asset-1',
      userId: 'user-1',
      status: 'complete',
      nested: { a: 1, z: 2 },
    });
    expect(read).not.toHaveProperty('optionalObjectField');
    expect(persistence.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: `asset_analysis_v2_${source.bindingSha256}` }),
      expect.objectContaining({ $setOnInsert: expect.any(Object) }),
      { upsert: true, writeConcern: { w: 'majority' } },
    );
  });

  it('preserves the first valid writer instead of overwriting provider output', async () => {
    const source = binding();
    const first = await saveSourceBoundAnalysisV2(source, analysis({ score: 0.91 }));
    const second = await saveSourceBoundAnalysisV2(source, analysis({ score: 0.12 }));

    expect(first).toMatchObject({ score: 0.91 });
    expect(second).toMatchObject({ score: 0.91 });
    expect(persistence.documents).toHaveLength(1);
  });

  it('isolates owner and source versions without consulting an asset-only row', async () => {
    const proxy = binding();
    const otherOwner = binding({ userId: 'user-2' });
    const otherBytes = binding({ sourceVersionSha256: 'f'.repeat(64) });
    await saveSourceBoundAnalysisV2(proxy, analysis());

    expect(await getSourceBoundAnalysisV2(otherOwner)).toBeNull();
    expect(await getSourceBoundAnalysisV2(otherBytes)).toBeNull();
    expect(persistence.documents).toHaveLength(1);
  });

  it('fails loudly when a stored payload is changed after hashing', async () => {
    const source = binding();
    await saveSourceBoundAnalysisV2(source, analysis({ score: 0.91 }));
    const [id, stored] = [...persistence.documents.entries()][0]!;
    persistence.documents.set(id, {
      ...stored,
      analysis: {
        ...(stored.analysis as Record<string, unknown>),
        score: 0.12,
      },
    });

    await expect(getSourceBoundAnalysisV2(source))
      .rejects.toThrow('ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_HASH_MISMATCH');
  });

  it('rejects cross-scope, incomplete, and non-canonical analysis payloads', async () => {
    const source = binding();
    await expect(saveSourceBoundAnalysisV2(source, analysis({ userId: 'attacker' })))
      .rejects.toThrow('ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_SCOPE_MISMATCH');
    await expect(saveSourceBoundAnalysisV2(source, analysis({ status: 'failed' })))
      .rejects.toThrow('ASSET_ANALYSIS_SOURCE_CACHE_ANALYSIS_CONTRACT_INVALID');
    await expect(saveSourceBoundAnalysisV2(source, analysis({ samples: [1, undefined] })))
      .rejects.toThrow('ASSET_ANALYSIS_SOURCE_CACHE_UNDEFINED_ARRAY_VALUE');
    await expect(saveSourceBoundAnalysisV2(source, analysis({ score: Number.NaN })))
      .rejects.toThrow('ASSET_ANALYSIS_SOURCE_CACHE_NUMBER_INVALID');
  });
});

function binding(overrides: Partial<{
  userId: string;
  assetId: string;
  sourceRole: 'PROXY' | 'MASTER';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  analysisInputSha256: string;
}> = {}) {
  return createAssetAnalysisSourceBindingV2({
    userId: 'user-1',
    assetId: 'asset-1',
    sourceRole: 'PROXY',
    sourceVersionSha256: 'a'.repeat(64),
    storageVersionSha256: 'b'.repeat(64),
    analysisInputSha256: 'c'.repeat(64),
    ...overrides,
  });
}

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'asset-1',
    userId: 'user-1',
    status: 'complete',
    analyzedAt: new Date('2026-08-31T12:00:00.000Z'),
    analysisVersion: 2,
    shots: [],
    ...overrides,
  };
}
