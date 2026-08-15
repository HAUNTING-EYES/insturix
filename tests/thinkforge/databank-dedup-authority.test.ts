import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimDataBankEntriesForEmbedding: vi.fn(),
  claimDataBankEntryForEmbedding: vi.fn(),
  completeDataBankEmbedding: vi.fn(),
  failDataBankEmbedding: vi.fn(),
  getAuthorizedDataBankEntriesByIds: vi.fn(),
  vectorQuery: vi.fn(),
  vectorUpsert: vi.fn(),
}));

vi.mock('@upstash/vector', () => ({
  Index: class {
    query = mocks.vectorQuery;
    upsert = mocks.vectorUpsert;
  },
}));

vi.mock('@/lib/thinkforge/services/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/services/db')>();
  return {
    ...actual,
    claimDataBankEntriesForEmbedding: mocks.claimDataBankEntriesForEmbedding,
    claimDataBankEntryForEmbedding: mocks.claimDataBankEntryForEmbedding,
    completeDataBankEmbedding: mocks.completeDataBankEmbedding,
    failDataBankEmbedding: mocks.failDataBankEmbedding,
    getAuthorizedDataBankEntriesByIds: mocks.getAuthorizedDataBankEntriesByIds,
  };
});

import {
  buildAuthorizedDataBankEntriesByIdsQuery,
  type DataBankEntry,
} from '@/lib/thinkforge/services/db';
import {
  checkDuplicateBeforeSave,
  DataBankEmbeddingAuthorityError,
} from '@/lib/thinkforge/services/embedding-service';

function entry(claim: string): DataBankEntry {
  return {
    _id: 'entry_1',
    userId: 'member_1',
    ownerType: 'organization',
    orgId: 'org_1',
    sessionId: 'session_1',
    projectId: 'session_1',
    classification: 'business_confidential',
    consentStatus: 'not_required',
    lifecycleStatus: 'active',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'verified',
    title: 'Stored fact',
    content: { claim },
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
  };
}

describe('DataBank duplicate authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.example.test';
    process.env.UPSTASH_VECTOR_REST_TOKEN = 'test-token';
    mocks.vectorQuery.mockResolvedValue([{ id: 'entry_1', score: 0.99 }]);
    mocks.getAuthorizedDataBankEntriesByIds.mockResolvedValue([
      entry('Use verified evidence before interpretation.'),
    ]);
  });

  it('suppresses only an exact normalized duplicate in the authorized organization session', async () => {
    await expect(checkDuplicateBeforeSave({
      principal: { userId: 'member_1', orgId: 'org_1' },
      scope: 'project',
      sessionId: 'session_1',
    }, '  USE verified\t evidence before interpretation. ')).resolves.toBe(true);

    expect(mocks.vectorQuery).toHaveBeenCalledWith(expect.objectContaining({
      topK: 10,
      includeMetadata: false,
      filter: "ownerType = 'organization' AND orgId = 'org_1' AND provenanceStatus = 'verified' AND lifecycleStatus = 'active' AND metadataVersion = 3 AND scope = 'project' AND memoryScope = 'project' AND sessionId = 'session_1'",
    }));
    expect(mocks.getAuthorizedDataBankEntriesByIds).toHaveBeenCalledWith(
      ['entry_1'],
      { userId: 'member_1', orgId: 'org_1' },
      { scope: 'project', memoryScope: 'project', sessionId: 'session_1' },
    );
  });

  it('does not suppress a semantically similar but textually distinct fact', async () => {
    mocks.getAuthorizedDataBankEntriesByIds.mockResolvedValue([
      entry('Use evidence before making the claim.'),
    ]);

    await expect(checkDuplicateBeforeSave({
      principal: { userId: 'member_1', orgId: 'org_1' },
      scope: 'project',
      sessionId: 'session_1',
    }, 'Use verified evidence before interpretation.')).resolves.toBe(false);
  });

  it('does not trust a stale or cross-boundary vector candidate rejected by Mongo', async () => {
    mocks.getAuthorizedDataBankEntriesByIds.mockResolvedValue([]);

    await expect(checkDuplicateBeforeSave({
      principal: { userId: 'member_1', orgId: 'org_1' },
      scope: 'project',
      sessionId: 'session_1',
    }, 'Use verified evidence before interpretation.')).resolves.toBe(false);
  });

  it('allows persistence when vector candidate lookup is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.vectorQuery.mockRejectedValue(new Error('vector unavailable'));

    await expect(checkDuplicateBeforeSave({
      principal: { userId: 'member_1', orgId: 'org_1' },
      scope: 'project',
      sessionId: 'session_1',
    }, 'Use verified evidence before interpretation.')).resolves.toBe(false);
    expect(mocks.getAuthorizedDataBankEntriesByIds).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[EmbeddingService] Dedup check failed, allowing save:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('rejects missing project authority before contacting the vector provider', async () => {
    await expect(checkDuplicateBeforeSave({
      principal: { userId: 'member_1', orgId: 'org_1' },
      scope: 'project',
      sessionId: ' ',
    }, 'Use verified evidence before interpretation.')).rejects.toBeInstanceOf(
      DataBankEmbeddingAuthorityError,
    );
    expect(mocks.vectorQuery).not.toHaveBeenCalled();
  });

  it('builds the Mongo candidate query with the same exact project boundary', () => {
    const query = buildAuthorizedDataBankEntriesByIdsQuery(
      ['entry_1'],
      { userId: 'member_1', orgId: 'org_1' },
      { scope: 'project', memoryScope: 'project', sessionId: 'session_1' },
    );

    expect(query.$and).toEqual(expect.arrayContaining([
      { _id: { $in: ['entry_1'] } },
      { memoryScope: 'project' },
      { $or: [{ sessionId: 'session_1' }, { projectId: 'session_1' }] },
    ]));
  });

  it('rejects contradictory Mongo authority combinations', () => {
    expect(() => buildAuthorizedDataBankEntriesByIdsQuery(
      ['entry_1'],
      { userId: 'member_1' },
      { scope: 'global', memoryScope: 'brand' },
    )).toThrow('Brand DataBank authority requires a brandId.');
    expect(() => buildAuthorizedDataBankEntriesByIdsQuery(
      ['entry_1'],
      { userId: 'member_1' },
      { scope: 'project', memoryScope: 'project', brandId: 'brand_1' },
    )).toThrow('Project DataBank authority cannot carry a brandId.');
  });
});
