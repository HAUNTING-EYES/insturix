import { describe, expect, it, vi } from 'vitest';
import {
  createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1,
  type MediaSourceAudioEvidenceBackfillMongoCandidateCollectionV1,
  type MediaSourceAudioEvidenceBackfillMongoCandidateRuntimeV1,
  type MediaSourceAudioEvidenceBackfillMongoCandidateSessionV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-mongo-candidates-v1';
import { MediaSourceAudioEvidenceBackfillCandidatePageErrorV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-batch-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
} from '@/lib/editron/services/media-source-version-v1';

type MongoRecord = Record<string, unknown>;

const DRIVER_SESSION = Object.freeze({ sessionId: 'driver-session' });

describe('MediaSourceAudioEvidenceBackfillMongoCandidateSourceV1', () => {
  it('resolves the immutable upper cursor inside one snapshot transaction', async () => {
    const fixture = runtimeFixture({
      findOne: [null, { assetId: 'asset-z', userId: 'user-z' }],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );

    await expect(source.resolveUpperBound()).resolves.toEqual({
      assetId: 'asset-z',
      userId: 'user-z',
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
    const invalidOptions = fixture.collection.findOne.mock.calls[0]?.[1];
    const upperOptions = fixture.collection.findOne.mock.calls[1]?.[1];
    expect(invalidOptions).toMatchObject({
      projection: { _id: 0, assetId: 1, userId: 1 },
      collation: { locale: 'simple' },
      hint: 'assetId_userId',
      readPreference: 'primary',
      session: DRIVER_SESSION,
    });
    expect(upperOptions).toMatchObject({
      sort: { assetId: -1, userId: -1 },
      session: DRIVER_SESSION,
    });
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it('returns null for an empty keyspace and always ends the session', async () => {
    const fixture = runtimeFixture({ findOne: [null, null] });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.resolveUpperBound()).resolves.toBeNull();
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it('rejects an invalid historical identity before sealing a bound', async () => {
    const fixture = runtimeFixture({
      findOne: [{ assetId: null, userId: 'user-a' }],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.resolveUpperBound()).rejects.toBeInstanceOf(
      MediaSourceAudioEvidenceBackfillCandidatePageErrorV1,
    );
    expect(fixture.collection.findOne).toHaveBeenCalledOnce();
    expect(fixture.session.endSession).toHaveBeenCalledOnce();
  });

  it('loads one projected, majority-read, ascending keyset page', async () => {
    const versionB = sourceVersion(
      { kind: 'USER', userId: 'user-b' },
      'asset-b',
    );
    const versionC = sourceVersion(
      { kind: 'ORG', orgId: 'org-c' },
      'asset-c',
    );
    const fixture = runtimeFixture({
      findMany: [[
        candidateDocument(versionB, { userId: 'user-b' }),
        candidateDocument(versionC, { userId: 'user-c', orgId: 'org-c' }),
      ]],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );

    const candidates = await source.loadCandidates({
      afterCursor: { assetId: 'asset-a', userId: 'user-a' },
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 3,
    });

    expect(candidates.map(({ assetId, userId }) => ({ assetId, userId }))).toEqual([
      { assetId: 'asset-b', userId: 'user-b' },
      { assetId: 'asset-c', userId: 'user-c' },
    ]);
    expect(candidates[1]?.asset).not.toHaveProperty('orgId');
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(candidates[0]?.asset.sourceVersionV1)).toBe(true);
    const [filter, options] = fixture.collection.findMany.mock.calls[0] ?? [];
    expect(filter).toMatchObject({ $and: expect.any(Array) });
    expect((filter?.$and as unknown[])).toHaveLength(3);
    expect(options).toMatchObject({
      projection: {
        _id: 0,
        assetId: 1,
        userId: 1,
        orgId: 1,
        type: 1,
        sourceVersionV1: 1,
        sourceQualificationV1: 1,
        sourceAudioArtifactsV1: 1,
        sourceAudioArtifactsStateSha256V1: 1,
      },
      sort: { assetId: 1, userId: 1 },
      limit: 3,
      collation: { locale: 'simple' },
      hint: 'assetId_userId',
      readPreference: 'primary',
      readConcern: { level: 'majority' },
    });
  });

  it('rejects a canonical user source stored under another user', async () => {
    const version = sourceVersion(
      { kind: 'USER', userId: 'user-source' },
      'asset-a',
    );
    const fixture = runtimeFixture({
      findMany: [[candidateDocument(version, { userId: 'user-row' })]],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.loadCandidates(pageInput())).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_CANDIDATE_PAGE_OWNER_SCOPE_MISMATCH',
    );
  });

  it('rejects a canonical org source stored under another org', async () => {
    const version = sourceVersion(
      { kind: 'ORG', orgId: 'org-source' },
      'asset-a',
    );
    const fixture = runtimeFixture({
      findMany: [[candidateDocument(version, {
        userId: 'user-row',
        orgId: 'org-row',
      })]],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.loadCandidates(pageInput())).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_CANDIDATE_PAGE_OWNER_SCOPE_MISMATCH',
    );
  });

  it('rejects a canonical source bound to another asset or media kind', async () => {
    const version = sourceVersion(
      { kind: 'USER', userId: 'user-a' },
      'asset-other',
    );
    const fixture = runtimeFixture({
      findMany: [[{
        ...candidateDocument(version, { userId: 'user-a' }),
        assetId: 'asset-a',
      }]],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.loadCandidates(pageInput())).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_CANDIDATE_PAGE_SOURCE_SCOPE_MISMATCH',
    );
  });

  it('passes malformed source state to the existing per-asset classifier', async () => {
    const fixture = runtimeFixture({
      findMany: [[{
        assetId: 'asset-a',
        userId: 'user-a',
        type: 'video',
        sourceVersionV1: { malformed: true },
      }]],
    });
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.loadCandidates(pageInput())).resolves.toEqual([{
      assetId: 'asset-a',
      userId: 'user-a',
      asset: {
        assetId: 'asset-a',
        type: 'video',
        sourceVersionV1: { malformed: true },
      },
    }]);
  });

  it('rejects duplicate, descending, and out-of-bound driver results', async () => {
    for (const documents of [
      [row('asset-a', 'user-a'), row('asset-a', 'user-a')],
      [row('asset-b', 'user-a'), row('asset-a', 'user-a')],
      [row('asset-z', 'user-z')],
    ]) {
      const fixture = runtimeFixture({ findMany: [documents] });
      const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
        fixture.loadRuntime,
      );
      await expect(source.loadCandidates({
        afterCursor: null,
        upperBoundCursor: { assetId: 'asset-y', userId: 'user-y' },
        limit: 3,
      })).rejects.toBeInstanceOf(
        MediaSourceAudioEvidenceBackfillCandidatePageErrorV1,
      );
    }
  });

  it('rejects unbounded operator input and avoids a query for an empty bound', async () => {
    const fixture = runtimeFixture();
    const source = createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1(
      fixture.loadRuntime,
    );
    await expect(source.loadCandidates({
      afterCursor: null,
      upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
      limit: 102,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_CANDIDATE_PAGE_INPUT_INVALID',
    );
    await expect(source.loadCandidates({
      afterCursor: null,
      upperBoundCursor: null,
      limit: 1,
    })).resolves.toEqual([]);
    expect(fixture.loadRuntime).not.toHaveBeenCalled();
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
    owner,
    assetId,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: 'a'.repeat(64),
    storageVersion,
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
  };
}

function row(assetId: string, userId: string): MongoRecord {
  return { assetId, userId, type: 'video', sourceVersionV1: { malformed: true } };
}

function runtimeFixture(input: Readonly<{
  findOne?: readonly (MongoRecord | null)[];
  findMany?: readonly (readonly MongoRecord[])[];
}> = {}) {
  const findOneResults = [...(input.findOne ?? [])];
  const findManyResults = [...(input.findMany ?? [])];
  const findOne = vi.fn(async (
    _filter: Parameters<
      MediaSourceAudioEvidenceBackfillMongoCandidateCollectionV1['findOne']
    >[0],
    _options: Parameters<
      MediaSourceAudioEvidenceBackfillMongoCandidateCollectionV1['findOne']
    >[1],
  ) => findOneResults.shift() ?? null);
  const findMany = vi.fn(async (
    _filter: Parameters<
      MediaSourceAudioEvidenceBackfillMongoCandidateCollectionV1['findMany']
    >[0],
    _options: Parameters<
      MediaSourceAudioEvidenceBackfillMongoCandidateCollectionV1['findMany']
    >[1],
  ) => findManyResults.shift() ?? []);
  const collection = {
    findOne,
    findMany,
  };
  const session = {
    driverSession: DRIVER_SESSION,
    withTransaction: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
    endSession: vi.fn(async () => undefined),
  };
  const runtime: MediaSourceAudioEvidenceBackfillMongoCandidateRuntimeV1 = {
    startSession: vi.fn(async () => (
      session as unknown as MediaSourceAudioEvidenceBackfillMongoCandidateSessionV1
    )),
    mediaAssets: collection as unknown as
      MediaSourceAudioEvidenceBackfillMongoCandidateCollectionV1,
  };
  return {
    collection,
    session,
    loadRuntime: vi.fn(async () => runtime),
  };
}
