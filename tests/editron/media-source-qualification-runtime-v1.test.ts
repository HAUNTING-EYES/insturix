import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const qstashMocks = vi.hoisted(() => ({ client: vi.fn(), publishJSON: vi.fn() }));
vi.mock('@upstash/qstash', () => ({ Client: qstashMocks.client }));

import {
  assertMediaSourceQualificationWorkerMessageV1,
  dispatchMediaSourceQualificationV1,
  executeMediaSourceQualificationWorkerV1,
  type MediaSourceQualificationWorkerPortsV1,
} from '@/lib/editron/services/media-source-qualification-runtime-v1';
import { createMediaSourceQualificationV1, type MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import type { MediaSourceProbeResultV1 } from '@/lib/editron/services/media-source-probe-v1';
import {
  createMediaSourceStorageVersionV1,
  type MediaSourceStorageVersionInspectionV1,
  type MediaSourceStorageVersionV1,
} from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaProxyMasterRelationV1,
  type MediaSourceInvalidationPlanV1,
  type MediaSourceVersionV1,
} from '@/lib/editron/services/media-source-version-v1';

const repoRoot = resolve(__dirname, '../..');
const now = new Date('2026-08-25T08:00:00.000Z');

describe('MediaSourceQualificationRuntimeV1', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    qstashMocks.client.mockReset();
    qstashMocks.publishJSON.mockReset();
    qstashMocks.client.mockImplementation(() => ({ publishJSON: qstashMocks.publishJSON }));
    qstashMocks.publishJSON.mockResolvedValue({ messageId: 'qualification-message-1' });
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://editron.test');
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-key');
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('permits only a signed publisher to enqueue the exact source binding', async () => {
    const message = messageFor(record());
    await expect(dispatchMediaSourceQualificationV1(message)).resolves.toEqual({
      dispatched: true,
      messageId: 'qualification-message-1',
    });
    expect(qstashMocks.publishJSON).toHaveBeenCalledWith({
      url: 'https://editron.test/api/internal/workers/media-source-qualification',
      body: message,
      retries: 2,
    });
  });

  it('does not claim a production fallback when signed worker configuration is absent', async () => {
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '');
    await expect(dispatchMediaSourceQualificationV1(messageFor(record()))).resolves.toEqual({
      dispatched: false,
      error: 'INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED',
    });
    expect(qstashMocks.publishJSON).not.toHaveBeenCalled();
  });

  it('rejects an insecure or local worker origin even when the queue keys are present', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    await expect(dispatchMediaSourceQualificationV1(messageFor(record()))).resolves.toEqual({
      dispatched: false,
      error: 'MEDIA_SOURCE_PROBE_WORKER_URL_NOT_CONFIGURED',
    });
    expect(qstashMocks.publishJSON).not.toHaveBeenCalled();
  });

  it('claims, probes, and completes only the exact persisted source binding', async () => {
    let stored = record();
    const memory = inMemoryPorts(() => stored, (next) => { stored = next; });
    const result = await executeMediaSourceQualificationWorkerV1(messageFor(stored), memory.ports);

    expect(result).toEqual({
      disposition: 'COMPLETED',
      status: 'MEASURED_TECHNICAL',
      sourceIdentity: 'ISSUED',
    });
    expect(stored.status).toBe('MEASURED_TECHNICAL');
    expect(stored.observation?.observationSha256).toBe('a'.repeat(64));
    expect(stored.storageVersion?.storageVersionSha256).toBe(storageVersion().storageVersionSha256);
    expect(memory.sourceVersion()).toMatchObject({
      assetId: 'asset_a',
      mediaKind: 'video',
      byteLength: 1_024,
      contentSha256: createHash('sha256').update(Buffer.alloc(1_024, 1)).digest('hex'),
      storageVersion: storageVersion(),
    });
    expect(memory.proxyMasterRelation()).toBeNull();
    expect(memory.sourceInvalidationPlan()).toBeNull();
    expect(memory.cadenceMapWrites()).toEqual([
      {
        sourcePtsCadenceMapV1: null,
        sourcePtsCadenceMapStateSha256V1: null,
        sourcePtsCadenceMapV2: null,
        sourcePtsCadenceMapStateSha256V2: null,
        sourcePtsCadenceMapV3: null,
        sourcePtsCadenceMapStateSha256V3: null,
      },
      {
        sourcePtsCadenceMapV1: null,
        sourcePtsCadenceMapStateSha256V1: null,
        sourcePtsCadenceMapV2: null,
        sourcePtsCadenceMapStateSha256V2: null,
        sourcePtsCadenceMapV3: null,
        sourcePtsCadenceMapStateSha256V3: null,
      },
    ]);
  });

  it('materializes proxy/master relation and invalidation intent only after the exact master qualifies', async () => {
    let stored = record('master-r2-key');
    const proxy = sourceVersionFor(storageVersion('proxy-r2-key', 'proxy-etag'));
    const masterStorage = storageVersion('master-r2-key', 'master-etag');
    const memory = inMemoryPorts(
      () => stored,
      (next) => { stored = next; },
      true,
      {
        disposition: 'AVAILABLE',
        sourceUrl: 'https://storage.test/presigned-secret',
        storageVersion: masterStorage,
      },
      undefined,
      {
        r2Key: 'proxy-r2-key',
        originalR2Key: 'master-r2-key',
        isProxy: false,
        proxySourceVersionV1: proxy,
      },
    );

    await expect(executeMediaSourceQualificationWorkerV1(messageFor(stored), memory.ports))
      .resolves.toEqual({
        disposition: 'COMPLETED',
        status: 'MEASURED_TECHNICAL',
        sourceIdentity: 'ISSUED',
      });

    expect(memory.proxyMasterRelation()).toMatchObject({
      proxy: { sourceVersionSha256: proxy.sourceVersionSha256 },
      master: { sourceVersionSha256: memory.sourceVersion()?.sourceVersionSha256 },
      mapping: { disposition: 'UNQUALIFIED', diagnostic: 'SOURCE_PTS_MAPPING_REQUIRED' },
    });
    expect(memory.sourceInvalidationPlan()).toMatchObject({
      disposition: 'INVALIDATE_DERIVATIVES',
      reason: 'PROXY_MASTER_PROMOTED',
      previousSourceVersionSha256: proxy.sourceVersionSha256,
      nextSourceVersionSha256: memory.sourceVersion()?.sourceVersionSha256,
      projectServiceReviewRequired: true,
    });
  });

  it('withholds proxy/master artifacts when historical proxy identity is forged or points at another object', async () => {
    let stored = record('master-r2-key');
    const masterStorage = storageVersion('master-r2-key', 'master-etag');
    const memory = inMemoryPorts(
      () => stored,
      (next) => { stored = next; },
      true,
      {
        disposition: 'AVAILABLE',
        sourceUrl: 'https://storage.test/presigned-secret',
        storageVersion: masterStorage,
      },
      undefined,
      {
        r2Key: 'proxy-r2-key',
        originalR2Key: 'master-r2-key',
        isProxy: false,
        proxySourceVersionV1: sourceVersionFor(storageVersion('other-r2-key', 'other-etag')),
      },
    );

    await expect(executeMediaSourceQualificationWorkerV1(messageFor(stored), memory.ports))
      .resolves.toMatchObject({
        disposition: 'COMPLETED',
        status: 'MEASURED_TECHNICAL',
        sourceIdentity: 'ISSUED',
      });
    expect(memory.sourceVersion()).not.toBeNull();
    expect(memory.proxyMasterRelation()).toBeNull();
    expect(memory.sourceInvalidationPlan()).toBeNull();
  });

  it('does not retain technical evidence when the storage object changes during probing', async () => {
    let stored = record();
    const before = storageVersion('before-etag');
    const after = storageVersion('after-etag');
    const memory = inMemoryPorts(
      () => stored,
      (next) => { stored = next; },
      true,
      { disposition: 'AVAILABLE', sourceUrl: 'https://storage.test/presigned-secret', storageVersion: before },
      { disposition: 'OBSERVED', storageVersion: after },
    );

    await expect(executeMediaSourceQualificationWorkerV1(messageFor(stored), memory.ports))
      .resolves.toEqual({
        disposition: 'COMPLETED',
        status: 'UNVERIFIABLE',
        sourceIdentity: 'UNVERIFIABLE',
      });
    expect(stored).toMatchObject({
      status: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_CHANGED',
      storageVersion: null,
      observation: null,
    });
    expect(memory.sourceVersion()).toBeNull();
  });

  it('does not issue a source version when technical qualification fails after a complete byte read', async () => {
    let stored = record();
    const memory = inMemoryPorts(() => stored, (next) => { stored = next; });
    const probe = vi.fn(async (): Promise<MediaSourceProbeResultV1> => ({
      disposition: 'UNVERIFIABLE',
      observation: null,
      diagnostics: ['MEDIA_SOURCE_PROBE_REQUEST_FAILED'],
    }));

    await expect(executeMediaSourceQualificationWorkerV1(messageFor(stored), {
      ...memory.ports,
      probe,
    })).resolves.toEqual({
      disposition: 'COMPLETED',
      status: 'UNVERIFIABLE',
      sourceIdentity: 'UNVERIFIABLE',
    });
    expect(memory.sourceVersion()).toBeNull();
    expect(stored.status).toBe('UNVERIFIABLE');
  });

  it('never probes a mismatched, active, raced, or terminal record', async () => {
    const initial = record();
    const mismatch = inMemoryPorts(() => initial, () => {});
    await expect(executeMediaSourceQualificationWorkerV1({ ...messageFor(initial), sourceBindingSha256: 'f'.repeat(64) }, mismatch.ports))
      .resolves.toEqual({ disposition: 'SKIPPED', reason: 'SOURCE_BINDING_MISMATCH' });
    expect(mismatch.resolveVerifiedSourceUrl).not.toHaveBeenCalled();

    const race = inMemoryPorts(() => record(), () => {}, false);
    await expect(executeMediaSourceQualificationWorkerV1(messageFor(record()), race.ports))
      .resolves.toEqual({ disposition: 'RACE_LOST' });
    expect(race.resolveVerifiedSourceUrl).not.toHaveBeenCalled();
  });

  it('records unavailable storage as explicit unverifiable evidence without exposing a signed URL', async () => {
    let stored = record();
    const memory = inMemoryPorts(
      () => stored,
      (next) => { stored = next; },
      true,
      { disposition: 'UNVERIFIABLE', result: { disposition: 'UNVERIFIABLE', observation: null, diagnostics: ['MEDIA_SOURCE_STORAGE_UNAVAILABLE'] } },
    );
    const result = await executeMediaSourceQualificationWorkerV1(messageFor(stored), memory.ports);

    expect(result).toEqual({
      disposition: 'COMPLETED',
      status: 'UNVERIFIABLE',
      sourceIdentity: 'UNVERIFIABLE',
    });
    expect(stored.diagnostic).toBe('MEDIA_SOURCE_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain('presigned-secret');
    expect(memory.probe).not.toHaveBeenCalled();
  });

  it('rejects malformed worker messages and wires the upload after persistence', () => {
    expect(() => assertMediaSourceQualificationWorkerMessageV1({ assetId: 'a', userId: 'u', sourceBindingSha256: 'nope' }))
      .toThrow('MEDIA_SOURCE_QUALIFICATION_ASSET_ID_INVALID');
    const upload = readFileSync(resolve(repoRoot, 'app/api/services/editron/media/upload/route.ts'), 'utf8');
    const worker = readFileSync(resolve(repoRoot, 'app/api/internal/workers/media-source-qualification/route.ts'), 'utf8');
    expect(upload.indexOf('const sourceQualification = createMediaSourceQualificationV1')).toBeLessThan(upload.indexOf('insertOne(mediaAsset)'));
    expect(upload.indexOf('insertOne(mediaAsset)')).toBeLessThan(upload.indexOf('const qualificationDispatch = await dispatchMediaSourceQualificationV1'));
    expect(upload).toContain('} catch (qualificationDispatchError: unknown) {');
    expect(worker).toContain("withInternalQStashWorkerAuth(handler, MEDIA_SOURCE_QUALIFICATION_WORKER_ROUTE_ID_V1)");
  });
});

function record(r2Key = 'r2-key-a'): MediaSourceQualificationRecordV1 {
  const result = createMediaSourceQualificationV1({
    asset: { assetId: 'asset_a', source: 'user-upload', r2Key },
    now,
  });
  if (result.disposition !== 'CREATED') throw new Error('expected qualification record');
  return result.record;
}

function messageFor(value: MediaSourceQualificationRecordV1) {
  return { assetId: value.assetId, userId: 'user_a', sourceBindingSha256: value.sourceBindingSha256 };
}

function inMemoryPorts(
  loadRecord: () => MediaSourceQualificationRecordV1,
  persist: (next: MediaSourceQualificationRecordV1) => void,
  compareAndSet = true,
  source: { disposition: 'AVAILABLE'; sourceUrl: string; storageVersion: MediaSourceStorageVersionV1 } | { disposition: 'UNVERIFIABLE'; result: MediaSourceProbeResultV1 } = {
    disposition: 'AVAILABLE', sourceUrl: 'https://storage.test/presigned-secret', storageVersion: storageVersion(),
  },
  afterProbeObservation?: MediaSourceStorageVersionInspectionV1,
  asset: Record<string, unknown> = {},
): {
  ports: MediaSourceQualificationWorkerPortsV1;
  resolveVerifiedSourceUrl: unknown;
  inspectStorageVersion: unknown;
  probe: unknown;
  sourceVersion(): Readonly<MediaSourceVersionV1> | null;
  cadenceMapWrites(): Array<{
    sourcePtsCadenceMapV1: null;
    sourcePtsCadenceMapStateSha256V1: null;
    sourcePtsCadenceMapV2: null;
    sourcePtsCadenceMapStateSha256V2: null;
    sourcePtsCadenceMapV3: null;
    sourcePtsCadenceMapStateSha256V3: null;
  }>;
  proxyMasterRelation(): Readonly<MediaProxyMasterRelationV1> | null;
  sourceInvalidationPlan(): Readonly<MediaSourceInvalidationPlanV1> | null;
} {
  let storedSourceVersion: Readonly<MediaSourceVersionV1> | null = null;
  const cadenceMapWrites: Array<{
    sourcePtsCadenceMapV1: null;
    sourcePtsCadenceMapStateSha256V1: null;
    sourcePtsCadenceMapV2: null;
    sourcePtsCadenceMapStateSha256V2: null;
    sourcePtsCadenceMapV3: null;
    sourcePtsCadenceMapStateSha256V3: null;
  }> = [];
  let storedProxyMasterRelation: Readonly<MediaProxyMasterRelationV1> | null = null;
  let storedSourceInvalidationPlan: Readonly<MediaSourceInvalidationPlanV1> | null = null;
  const resolveVerifiedSourceUrl = vi.fn(async () => source);
  const inspectStorageVersion = vi.fn(async (): Promise<MediaSourceStorageVersionInspectionV1> => (
    afterProbeObservation ?? (source.disposition === 'AVAILABLE'
      ? { disposition: 'OBSERVED', storageVersion: source.storageVersion }
      : { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' })
  ));
  const probe = vi.fn(async (): Promise<MediaSourceProbeResultV1> => ({
    disposition: 'MEASURED', diagnostics: [], observation: {
      schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1', probeVersion: 'test',
      formatName: 'mov', durationMilliseconds: 1_000, startTimeMilliseconds: 0,
      videoStreams: [], audioStreams: [], observationSha256: 'a'.repeat(64),
    },
  }));
  return {
    ports: {
    load: vi.fn(async () => ({ sourceQualificationV1: loadRecord(), type: 'video', ...asset })),
    replace: vi.fn(async ({
      next,
      sourceVersionV1,
      sourcePtsCadenceMapV1,
      sourcePtsCadenceMapStateSha256V1,
      sourcePtsCadenceMapV2,
      sourcePtsCadenceMapStateSha256V2,
      sourcePtsCadenceMapV3,
      sourcePtsCadenceMapStateSha256V3,
      proxyMasterRelationV1,
      sourceInvalidationPlanV1,
    }) => {
      if (!compareAndSet) return false;
      persist(next);
      storedSourceVersion = sourceVersionV1;
      cadenceMapWrites.push({
        sourcePtsCadenceMapV1,
        sourcePtsCadenceMapStateSha256V1,
        sourcePtsCadenceMapV2,
        sourcePtsCadenceMapStateSha256V2,
        sourcePtsCadenceMapV3,
        sourcePtsCadenceMapStateSha256V3,
      });
      storedProxyMasterRelation = proxyMasterRelationV1;
      storedSourceInvalidationPlan = sourceInvalidationPlanV1;
      return true;
    }),
    resolveVerifiedSourceUrl,
    inspectStorageVersion,
    openExactByteStream: async function* () {
      yield Buffer.alloc(1_024, 1);
    },
    probe,
    now: () => now,
    },
    resolveVerifiedSourceUrl,
    inspectStorageVersion,
    probe,
    sourceVersion: () => storedSourceVersion,
    cadenceMapWrites: () => cadenceMapWrites,
    proxyMasterRelation: () => storedProxyMasterRelation,
    sourceInvalidationPlan: () => storedSourceInvalidationPlan,
  };
}

function sourceVersionFor(storage: MediaSourceStorageVersionV1): Readonly<MediaSourceVersionV1> {
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user_a' },
    assetId: 'asset_a',
    mediaKind: 'video',
    byteLength: 1_024,
    contentSha256: 'b'.repeat(64),
    storageVersion: storage,
  });
}

function storageVersion(
  objectKey = 'r2-key-a',
  eTag = 'r2-etag-a',
): MediaSourceStorageVersionV1 {
  return createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey },
    byteLength: 1_024,
    providerVersion: { kind: 'R2_ETAG', value: eTag },
  });
}
