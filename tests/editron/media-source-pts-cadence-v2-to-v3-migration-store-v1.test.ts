import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { serializeMediaSourcePtsCadenceFrameBatchV2 }
  from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  checkpointMediaSourcePtsCadenceMapAssetRecordV2,
  claimMediaSourcePtsCadenceMapAssetRecordV2,
  completeMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceManifestIndexSidecarV2,
  createMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceStoredObjectReaderV2,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-state-v2';
import { mediaSourcePtsCadenceMapBindingSha256V1 }
  from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  createMediaSourcePtsCadenceManifestIndexV2,
} from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import {
  serializeMediaSourcePtsCadenceManifestSidecarV1,
  serializeMediaSourcePtsCadenceShardSidecarV1,
} from '@/lib/editron/services/media-source-pts-cadence-private-sidecar-codec-v1';
import { createMediaSourcePtsCadenceShardV1 }
  from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourcePtsCadenceSourceCoverageV2 }
  from '@/lib/editron/services/media-source-pts-cadence-source-coverage-v2';
import {
  mediaSourcePtsCadenceV2ToV3MigrationCompareAndSetFilterV1,
  migrateMediaSourcePtsCadenceV2ToV3V1,
  type MediaSourcePtsCadenceV2ToV3MigrationStorePortsV1,
} from '@/lib/editron/services/media-source-pts-cadence-v2-to-v3-migration-store-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS cadence V2-to-V3 migration store V1', () => {
  it('writes the verified index before one exact V2-to-V3 asset CAS', async () => {
    const fixture = await migrationFixture();
    const result = await fixture.run();

    expect(result).toMatchObject({
      disposition: 'MIGRATED',
      state: { sourcePtsCadenceMapV3: { status: 'PENDING' } },
      receipt: { v2StateSha256: fixture.state.sourcePtsCadenceMapStateSha256V2 },
    });
    expect(fixture.events).toEqual(['load', 'write-index', 'replace']);
    expect(fixture.replace).toHaveBeenCalledTimes(1);
    const applied = fixture.replace.mock.calls[0]![0];
    expect(applied.expectedState).toEqual(fixture.state);
    expect(applied.receipt.migrationReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(applied.nextState.sourcePtsCadenceMapV3.epochIndexSidecar)
      .toEqual(fixture.writer.writeImmutableEpochIndex.mock.calls[0]![0].expected);

    const filter = mediaSourcePtsCadenceV2ToV3MigrationCompareAndSetFilterV1({
      assetId: fixture.asset.assetId,
      userId: 'user-1',
      expectedState: fixture.state,
    });
    expect(filter).toMatchObject({
      assetId: fixture.asset.assetId,
      userId: 'user-1',
      sourcePtsCadenceMapStateSha256V2: fixture.state.sourcePtsCadenceMapStateSha256V2,
      'sourcePtsCadenceMapV2.lifecycleV1.status': 'COMPLETE',
      'sourcePtsCadenceMapV2.terminalReceipt.terminalReceiptSha256':
        fixture.state.sourcePtsCadenceMapV2.terminalReceipt!.terminalReceiptSha256,
    });
    expect(filter.$and).toEqual(expect.arrayContaining([
      { $or: [{ sourcePtsCadenceMapV3: { $exists: false } }, { sourcePtsCadenceMapV3: null }] },
      { $or: [
        { sourcePtsCadenceMapV2ToV3MigrationReceiptV1: { $exists: false } },
        { sourcePtsCadenceMapV2ToV3MigrationReceiptV1: null },
      ] },
    ]));
  });

  it('leaves the asset untouched when the exact CAS loses a race', async () => {
    const fixture = await migrationFixture({ replaceResult: false });
    await expect(fixture.run()).resolves.toEqual({ disposition: 'RACE_LOST' });
    expect(fixture.events).toEqual(['load', 'write-index', 'replace']);
    expect(fixture.asset.sourcePtsCadenceMapV2).toEqual(fixture.state.sourcePtsCadenceMapV2);
    expect(fixture.asset.sourcePtsCadenceMapV3).toBeUndefined();
  });

  it('does no evidence or object work for a missing asset', async () => {
    const fixture = await migrationFixture({ missing: true });
    await expect(fixture.run()).resolves.toEqual({
      disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND',
    });
    expect(fixture.reader.read).not.toHaveBeenCalled();
    expect(fixture.writer.writeImmutableEpochIndex).not.toHaveBeenCalled();
    expect(fixture.replace).not.toHaveBeenCalled();
  });

  it('fails before CAS for altered evidence or an unproven index write', async () => {
    const altered = await migrationFixture();
    const batchKey = altered.batch.sidecar.objectKey;
    altered.objects.set(batchKey, {
      ...altered.objects.get(batchKey)!,
      canonicalJson: `${altered.objects.get(batchKey)!.canonicalJson} `,
    });
    await expect(altered.run()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'V2_INDEX_INTEGRITY_UNVERIFIABLE',
    });
    expect(altered.writer.writeImmutableEpochIndex).not.toHaveBeenCalled();
    expect(altered.replace).not.toHaveBeenCalled();

    const writeFailure = await migrationFixture({ writeFailure: true });
    await expect(writeFailure.run()).resolves.toEqual({
      disposition: 'UNVERIFIABLE', reason: 'EPOCH_INDEX_WRITE_FAILED', detail: null,
    });
    expect(writeFailure.replace).not.toHaveBeenCalled();
  });

  it('rejects a writer that returns a different sidecar', async () => {
    const fixture = await migrationFixture({ writeMismatch: true });
    await expect(fixture.run()).resolves.toEqual({
      disposition: 'UNVERIFIABLE', reason: 'EPOCH_INDEX_WRITE_MISMATCH', detail: null,
    });
    expect(fixture.replace).not.toHaveBeenCalled();
  });
});

type StoredObject = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

async function migrationFixture(options: Readonly<{
  missing?: boolean;
  replaceResult?: boolean;
  writeFailure?: boolean;
  writeMismatch?: boolean;
}> = {}) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/migration-store.mov' },
    byteLength: 12_345,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-migration-store' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-migration-store',
    mediaKind: 'video', byteLength: 12_345,
    contentSha256: 'b'.repeat(64), storageVersion,
  });
  const qualification = qualificationRecord(storageVersion);
  const mapper = {
    mapperVersion: 'media-pts-mapper-v2', ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'migration-store-policy-v2',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const frames = [
    { presentationTimestampTicks: '0', durationTicks: '3003' },
    { presentationTimestampTicks: '3003', durationTicks: '3003' },
  ];
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion, qualification, videoStreamIndex: 0, mapper,
    shardSequence: 0, firstFrameOrdinal: '0', frames,
  });
  const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shard);
  const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
    mapBindingSha256,
    resourcePolicy: {
      policyVersion: 'migration-store-policy-v2',
      maxCanonicalJsonBytes: 16_384, maxFrameRecords: 100,
    },
    shard, frames,
  });
  const batch = {
    serialization,
    sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
      storage: 'R2_PRIVATE', serialization,
    }),
  };
  const manifest = createMediaSourcePtsCadenceManifestIndexV2({
    mapBindingSha256,
    resourcePolicy: {
      policyVersion: 'migration-store-policy-v2',
      maxCanonicalJsonBytes: 16_384, maxBatchEntries: 100,
    },
    batches: [batch],
  });
  const manifestSidecar = createMediaSourcePtsCadenceManifestIndexSidecarV2({
    storage: 'R2_PRIVATE', manifestIndex: manifest,
  });
  const descriptorSidecar = serializeMediaSourcePtsCadenceShardSidecarV1({
    storage: 'R2_PRIVATE', mapBindingSha256, shard,
  }).sidecar;
  const objects = new Map<string, StoredObject>([
    [batch.sidecar.objectKey, stored(serialization)],
    [manifestSidecar.objectKey, stored(manifest)],
  ]);
  const reader = {
    read: vi.fn(async ({ objectKey }) => {
      const value = objects.get(objectKey);
      if (!value) throw new Error('TEST_OBJECT_MISSING');
      return value;
    }),
  } satisfies MediaSourcePtsCadenceStoredObjectReaderV2;
  const claimId = 'migration-store-claim';
  const initial = createMediaSourcePtsCadenceMapAssetRecordV2({
    bootstrapShard: shard, now: new Date('2026-08-30T00:00:00.000Z'),
  });
  const claimed = claimMediaSourcePtsCadenceMapAssetRecordV2({
    record: initial, claimId,
    now: new Date('2026-08-30T00:01:00.000Z'),
    expiresAt: new Date('2026-08-30T01:00:00.000Z'),
  });
  const checkpoint = await checkpointMediaSourcePtsCadenceMapAssetRecordV2({
    record: claimed, claimId,
    frameBatch: serialization, descriptorSidecar,
    manifestIndex: manifest, manifestIndexSidecar: manifestSidecar,
    previousManifestIndex: null,
    storedObjectReader: reader, frameBatchReader: reader,
    now: () => new Date('2026-08-30T00:02:00.000Z'),
  });
  if (checkpoint.disposition !== 'CHECKPOINTED') throw new Error(JSON.stringify(checkpoint));
  const lifecycleManifest = serializeMediaSourcePtsCadenceManifestSidecarV1({
    storage: 'R2_PRIVATE', mapBindingSha256,
    checkpoint: checkpoint.record.lifecycleV1.checkpoint,
  });
  objects.set(lifecycleManifest.sidecar.objectKey, stored(lifecycleManifest));
  const completed = await completeMediaSourcePtsCadenceMapAssetRecordV2({
    record: checkpoint.record, claimId,
    coverage: createMediaSourcePtsCadenceSourceCoverageV2({
      sourceVersion, qualification, videoStreamIndex: 0, mapper,
      coveragePolicyVersion: 'migration-store-coverage-v2',
    }),
    manifestIndex: manifest,
    lifecycleManifest: lifecycleManifest.sidecar,
    storedObjectReader: reader, frameBatchReader: reader,
    now: () => new Date('2026-08-30T00:03:00.000Z'),
  });
  if (completed.disposition !== 'COMPLETED') throw new Error(JSON.stringify(completed));
  const baseAsset = {
    assetId: 'asset-migration-store', type: 'video' as const,
    sourceVersionV1: sourceVersion, sourceQualificationV1: qualification,
  };
  const state = createMediaSourcePtsCadenceMapAssetStateV2({
    asset: baseAsset, record: completed.record,
  });
  const asset: typeof baseAsset & typeof state & Record<string, unknown> = {
    ...baseAsset,
    ...state,
  };
  const events: string[] = [];
  const writer = {
    writeImmutableEpochIndex: vi.fn(async ({ expected }) => {
      events.push('write-index');
      if (options.writeFailure) throw new Error('TEST_WRITE_FAILED');
      return options.writeMismatch
        ? { ...expected, contentSha256: 'f'.repeat(64) }
        : expected;
    }),
  };
  const replace = vi.fn(async (value: Parameters<
    MediaSourcePtsCadenceV2ToV3MigrationStorePortsV1['replace']
  >[0]) => {
    events.push('replace');
    if (options.replaceResult === false) return false;
    Object.assign(asset, {
      sourcePtsCadenceMapV2: null,
      sourcePtsCadenceMapStateSha256V2: null,
      ...value.nextState,
      sourcePtsCadenceMapV2ToV3MigrationReceiptV1: value.receipt,
      sourcePtsCadenceMapV2ToV3MigrationReceiptSha256V1:
        value.receipt.migrationReceiptSha256,
    });
    return true;
  });
  reader.read.mockClear();
  const ports = {
    load: vi.fn(async () => {
      events.push('load');
      return options.missing ? null : asset;
    }),
    replace,
    storedObjectReader: reader,
    epochIndexWriter: writer,
  } satisfies MediaSourcePtsCadenceV2ToV3MigrationStorePortsV1;
  const run = () => migrateMediaSourcePtsCadenceV2ToV3V1({
    assetId: 'asset-migration-store', userId: 'user-1',
    epochIndexResourcePolicy: {
      policyVersion: 'migration-store-epoch-index-v3',
      maxCanonicalJsonBytes: 1_000_000, maxEpochEntries: 10, maxBatchEntries: 100,
    },
    verificationPolicy: {
      policyVersion: 'migration-store-verification-v3',
      maxBatchReads: 100, maxBoundaryEvidenceReads: 0,
      maxTotalArtifactBytes: 10_000_000,
      boundaryEvidenceRegistryVersion: 'migration-store-boundary-registry-v3',
    },
    now: new Date('2026-08-30T00:04:00.000Z'),
  }, ports);
  return { asset, state, batch, objects, reader, writer, replace, events, run };
}

function qualificationRecord(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
): MediaSourceQualificationRecordV1 {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1', formatName: 'mov',
    durationMilliseconds: 67, startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: '6006',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' }, frameCount: '2',
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709',
      colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL', assetId: 'asset-migration-store',
    locator: { provider: 'R2', objectKey: 'media/migration-store.mov' },
    sourceBindingSha256: 'c'.repeat(64), requestId: 'migration-store-probe',
    attemptCount: 1, requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z', storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

function stored(value: Readonly<{
  canonicalJson: string;
  byteLength?: number;
  contentSha256?: string;
  sidecar?: Readonly<{ byteLength: number; contentSha256: string }>;
}>): StoredObject {
  const byteLength = value.byteLength ?? value.sidecar?.byteLength;
  const contentSha256 = value.contentSha256 ?? value.sidecar?.contentSha256;
  if (!byteLength || !contentSha256) throw new Error('STORED_FIXTURE_INVALID');
  return { canonicalJson: value.canonicalJson, byteLength, contentSha256 };
}
