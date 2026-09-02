import { describe, expect, it, vi } from 'vitest';

import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1,
  MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
} from '@/lib/editron/services/media-source-version-v1';

type MongoRecord = Record<string, unknown>;

const DRIVER_SESSION = Object.freeze({ sessionId: 'v3-backfill-driver-session' });

describe('MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1', () => {
  it('freezes the upper cursor in one primary snapshot transaction', async () => {
    const fixture = runtimeFixture({
      findOne: [null, { assetId: 'asset-z', userId: 'user-z' }],
    });
    const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );

    await expect(source.resolveUpperBound()).resolves.toEqual({
      assetId: 'asset-z', userId: 'user-z',
    });
    expect(fixture.session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      },
    );
    expect(fixture.collection.findOne).toHaveBeenCalledTimes(2);
    expect(fixture.collection.findOne.mock.calls[0]?.[1]).toMatchObject({
      projection: { _id: 0, assetId: 1, userId: 1 },
      collation: { locale: 'simple' },
      hint: 'assetId_userId',
      readPreference: 'primary',
      session: DRIVER_SESSION,
    });
    expect(fixture.collection.findOne.mock.calls[1]?.[1]).toMatchObject({
      sort: { assetId: -1, userId: -1 },
      session: DRIVER_SESSION,
    });
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it('rejects invalid historical identity and always ends the session', async () => {
    const fixture = runtimeFixture({
      findOne: [{ assetId: null, userId: 'user-a' }],
    });
    const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );

    await expect(source.resolveUpperBound()).rejects.toBeInstanceOf(
      MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
    );
    expect(fixture.collection.findOne).toHaveBeenCalledOnce();
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it('loads a projected majority-read page constrained to published V3 state', async () => {
    const versionB = sourceVersion(
      { kind: 'USER', userId: 'user-b' }, 'asset-b',
    );
    const versionC = sourceVersion(
      { kind: 'ORG', orgId: 'org-c' }, 'asset-c',
    );
    const fixture = runtimeFixture({
      findMany: [[
        candidateDocument(versionB, { userId: 'user-b' }),
        candidateDocument(versionC, { userId: 'user-c', orgId: 'org-c' }),
      ]],
    });
    const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );

    const candidates = await source.loadCandidates({
      afterCursor: { assetId: 'asset-a', userId: 'user-a' },
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 3,
    });

    expect(candidates.map(({ assetId, userId }) => ({ assetId, userId })))
      .toEqual([
        { assetId: 'asset-b', userId: 'user-b' },
        { assetId: 'asset-c', userId: 'user-c' },
      ]);
    expect(candidates[1]?.asset).not.toHaveProperty('orgId');
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(candidates[0]?.asset.sourceVersionV1)).toBe(true);
    const [filter, options] = fixture.collection.findMany.mock.calls[0] ?? [];
    expect(filter).toMatchObject({
      $and: [
        expect.any(Object),
        {
          'sourcePtsCadenceMapV3.status': 'COMPLETE',
          'sourcePtsCadenceMapV3.terminalReceipt.disposition': 'PUBLISHED',
          'sourcePtsCadenceMapV3.verificationReceipt.disposition':
            'EPOCH_ARTIFACT_SET_VERIFIED',
          sourcePtsCadenceMapStateSha256V3: /^[a-f0-9]{64}$/,
        },
        expect.any(Object),
        expect.any(Object),
      ],
    });
    expect(options).toMatchObject({
      projection: {
        _id: 0, assetId: 1, userId: 1, orgId: 1, type: 1,
        sourceVersionV1: 1, sourceQualificationV1: 1,
        sourcePtsCadenceMapV3: 1,
        sourcePtsCadenceMapStateSha256V3: 1,
      },
      sort: { assetId: 1, userId: 1 },
      limit: 3,
      collation: { locale: 'simple' },
      hint: 'assetId_userId',
      readPreference: 'primary',
      readConcern: { level: 'majority' },
    });
  });

  it('rejects canonical sources bound to another owner, asset, or media kind', async () => {
    for (const document of [
      candidateDocument(
        sourceVersion({ kind: 'USER', userId: 'user-source' }, 'asset-a'),
        { userId: 'user-row' },
      ),
      candidateDocument(
        sourceVersion({ kind: 'ORG', orgId: 'org-source' }, 'asset-a'),
        { userId: 'user-row', orgId: 'org-row' },
      ),
      {
        ...candidateDocument(
          sourceVersion({ kind: 'USER', userId: 'user-a' }, 'asset-other'),
          { userId: 'user-a' },
        ),
        assetId: 'asset-a',
      },
    ]) {
      const fixture = runtimeFixture({ findMany: [[document]] });
      const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
        fixture.loadRuntime,
      );
      await expect(source.loadCandidates(pageInput())).rejects.toBeInstanceOf(
        MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
      );
    }
  });

  it('passes malformed source state to the per-asset verifier for classification', async () => {
    const document = {
      ...candidateDocument(
        sourceVersion({ kind: 'USER', userId: 'user-a' }, 'asset-a'),
        { userId: 'user-a' },
      ),
      sourceVersionV1: { malformed: true },
    };
    const fixture = runtimeFixture({ findMany: [[document]] });
    const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );

    await expect(source.loadCandidates(pageInput())).resolves.toEqual([{
      assetId: 'asset-a',
      userId: 'user-a',
      asset: {
        assetId: 'asset-a',
        type: 'video',
        sourceVersionV1: { malformed: true },
        sourceQualificationV1: { status: 'fixture' },
        sourcePtsCadenceMapV3: expect.any(Object),
        sourcePtsCadenceMapStateSha256V3: 'b'.repeat(64),
      },
    }]);
  });

  it('rejects bad ordering and unbounded input without querying an empty run', async () => {
    for (const documents of [
      [row('asset-a', 'user-a'), row('asset-a', 'user-a')],
      [row('asset-b', 'user-a'), row('asset-a', 'user-a')],
      [row('asset-z', 'user-z')],
    ]) {
      const fixture = runtimeFixture({ findMany: [documents] });
      const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
        fixture.loadRuntime,
      );
      await expect(source.loadCandidates({
        afterCursor: null,
        upperBoundCursor: { assetId: 'asset-y', userId: 'user-y' },
        limit: 3,
      })).rejects.toBeInstanceOf(
        MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
      );
    }

    const empty = runtimeFixture();
    const source = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
      empty.loadRuntime,
    );
    await expect(source.loadCandidates({
      afterCursor: null,
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 102,
    })).rejects.toThrow('CANDIDATE_PAGE_INPUT_INVALID');
    await expect(source.loadCandidates({
      afterCursor: null, upperBoundCursor: null, limit: 1,
    })).resolves.toEqual([]);
    expect(empty.loadRuntime).not.toHaveBeenCalled();
  });
});

function pageInput() {
  return {
    afterCursor: null,
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    limit: 2,
  } as const;
}

function sourceVersion(owner: MediaSourceOwnerV1, assetId: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `tests/${assetId}.mov` },
    byteLength: 100,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${assetId}` },
  });
  return createMediaSourceVersionV1({
    owner, assetId, mediaKind: 'video', byteLength: storageVersion.byteLength,
    contentSha256: 'a'.repeat(64), storageVersion,
  });
}

function candidateDocument(
  sourceVersionV1: ReturnType<typeof sourceVersion>,
  scope: Readonly<{ userId: string; orgId?: string }>,
): MongoRecord {
  return {
    assetId: sourceVersionV1.assetId,
    userId: scope.userId,
    ...(scope.orgId ? { orgId: scope.orgId } : {}),
    type: sourceVersionV1.mediaKind,
    sourceVersionV1,
    sourceQualificationV1: { status: 'fixture' },
    sourcePtsCadenceMapV3: {
      status: 'COMPLETE',
      terminalReceipt: { disposition: 'PUBLISHED' },
      verificationReceipt: { disposition: 'EPOCH_ARTIFACT_SET_VERIFIED' },
    },
    sourcePtsCadenceMapStateSha256V3: 'b'.repeat(64),
  };
}

function row(assetId: string, userId: string): MongoRecord {
  return {
    ...candidateDocument(
      sourceVersion({ kind: 'USER', userId }, assetId),
      { userId },
    ),
    assetId,
    userId,
  };
}

function runtimeFixture(input: Readonly<{
  findOne?: readonly (MongoRecord | null)[];
  findMany?: readonly (readonly MongoRecord[])[];
}> = {}) {
  const findOneResults = [...(input.findOne ?? [])];
  const findManyResults = [...(input.findMany ?? [])];
  const findOne = vi.fn(async (
    _filter: Parameters<
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1['findOne']
    >[0],
    _options: Parameters<
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1['findOne']
    >[1],
  ) => findOneResults.shift() ?? null);
  const findMany = vi.fn(async (
    _filter: Parameters<
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1['findMany']
    >[0],
    _options: Parameters<
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1['findMany']
    >[1],
  ) => findManyResults.shift() ?? []);
  const collection = { findOne, findMany };
  const session = {
    driverSession: DRIVER_SESSION,
    withTransaction: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
    endSession: vi.fn(async () => undefined),
  };
  const runtime: MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1 = {
    startSession: vi.fn(async () => (
      session as unknown as
        MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1
    )),
    mediaAssets: collection as unknown as
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1,
  };
  return {
    collection,
    session,
    loadRuntime: vi.fn(async () => runtime),
  };
}
