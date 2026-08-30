import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { serializeMediaSourcePtsCadenceFrameBatchV2 }
  from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  createMediaSourcePtsCadenceMapAssetStateV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import {
  checkpointMediaSourcePtsCadenceMapAssetRecordV2,
  claimMediaSourcePtsCadenceMapAssetRecordV2,
  completeMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceManifestIndexSidecarV2,
  createMediaSourcePtsCadenceMapAssetRecordV2,
  createMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetRecordV2,
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
  prepareMediaSourcePtsCadenceV2ToV3MigrationV1,
} from '@/lib/editron/services/media-source-pts-cadence-v2-to-v3-migration-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

type MigrationInputV1 = Parameters<
  typeof prepareMediaSourcePtsCadenceV2ToV3MigrationV1
>[0];

describe('MediaSourcePtsCadenceV2ToV3MigrationV1', () => {
  it('reverifies complete V2 evidence and builds one source-bound V3 epoch', async () => {
    const fixture = await completeFixture();
    const result = await fixture.run();

    expect(result).toMatchObject({
      disposition: 'MIGRATION_READY',
      epochIndex: {
        index: {
          epochs: [{
            epoch: {
              epochId: 'v2-contiguous-epoch-0',
              boundaryKind: 'INITIAL',
              canonicalStartTime: { ticks: '0', timescale: '1' },
            },
            boundary: {
              classificationBasis: 'FIRST_DECODED_PRESENTATION',
              externalEvidence: null,
            },
          }],
          batches: [{ epochId: 'v2-contiguous-epoch-0' }, {
            epochId: 'v2-contiguous-epoch-0',
          }],
        },
      },
      pendingRecord: { status: 'PENDING', attemptCount: 0 },
      receipt: {
        v2StateSha256: fixture.state.sourcePtsCadenceMapStateSha256V2,
        v2TerminalReceiptSha256:
          fixture.state.sourcePtsCadenceMapV2.terminalReceipt!.terminalReceiptSha256,
      },
    });
    if (result.disposition !== 'MIGRATION_READY') throw new Error(JSON.stringify(result));
    expect(result.epochIndex.index.batches.map(({ sidecar }) => sidecar))
      .toEqual(fixture.batches.map(({ sidecar }) => sidecar));
    expect(result.receipt.migrationReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.reader.read).toHaveBeenCalledTimes(3);
  });

  it('distinguishes absent, incomplete, and already-V3 state without writes', async () => {
    const fixture = await completeFixture();
    await expect(fixture.run({ asset: fixture.baseAsset })).resolves.toEqual({
      disposition: 'NOT_APPLICABLE', reason: 'NO_V2_STATE',
    });

    const initial = createMediaSourcePtsCadenceMapAssetRecordV2({
      bootstrapShard: fixture.batches[0]!.serialization.payload.shard,
      now: new Date('2026-08-30T00:00:00.000Z'),
    });
    const incomplete = createMediaSourcePtsCadenceMapAssetStateV2({
      asset: fixture.baseAsset,
      record: initial,
    });
    await expect(fixture.run({
      asset: { ...fixture.baseAsset, ...incomplete },
    })).resolves.toEqual({
      disposition: 'NOT_APPLICABLE', reason: 'V2_NOT_COMPLETE',
    });

    const ready = await fixture.run();
    if (ready.disposition !== 'MIGRATION_READY') throw new Error(JSON.stringify(ready));
    const v3 = createMediaSourcePtsCadenceMapAssetStateV3({
      asset: fixture.baseAsset,
      record: ready.pendingRecord,
    });
    await expect(fixture.run({
      asset: { ...fixture.baseAsset, ...v3 },
    })).resolves.toEqual({
      disposition: 'NOT_APPLICABLE', reason: 'V3_ALREADY_PRESENT',
    });
  });

  it('fails closed for partial, parallel, stale-source, and altered artifacts', async () => {
    const partial = await completeFixture();
    await expect(partial.run({
      asset: {
        ...partial.baseAsset,
        sourcePtsCadenceMapV2: partial.state.sourcePtsCadenceMapV2,
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'CURRENT_STATE_INVALID',
    });

    const parallel = await completeFixture();
    await expect(parallel.run({
      asset: {
        ...parallel.asset,
        sourcePtsCadenceMapV3: {},
        sourcePtsCadenceMapStateSha256V3: 'a'.repeat(64),
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'PARALLEL_V2_V3_STATE',
    });

    const stale = await completeFixture();
    await expect(stale.run({
      asset: {
        ...stale.asset,
        sourceVersionV1: {
          ...stale.sourceVersion,
          sourceVersionSha256: 'f'.repeat(64),
        },
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'CURRENT_STATE_INVALID',
    });

    const altered = await completeFixture();
    const firstKey = altered.batches[0]!.sidecar.objectKey;
    altered.objects.set(firstKey, {
      ...altered.objects.get(firstKey)!,
      canonicalJson: `${altered.objects.get(firstKey)!.canonicalJson} `,
    });
    await expect(altered.run()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'V2_INDEX_INTEGRITY_UNVERIFIABLE',
    });
  });

  it('does not trust a rehashed V2 cadence claim over freshly read frames', async () => {
    const fixture = await completeFixture();
    const record = fixture.state.sourcePtsCadenceMapV2;
    const { terminalReceiptSha256: _oldHash, ...terminalMaterial } =
      record.terminalReceipt!;
    const forgedMaterial = {
      ...terminalMaterial,
      sourceCadence: { kind: 'VFR' as const },
    };
    const forgedRecord = {
      ...record,
      terminalReceipt: {
        ...forgedMaterial,
        terminalReceiptSha256: hashEditronCanonicalJsonV1(forgedMaterial),
      },
    };
    const forgedState = {
      sourcePtsCadenceMapV2: forgedRecord,
      sourcePtsCadenceMapStateSha256V2: hashEditronCanonicalJsonV1(forgedRecord),
    };

    await expect(fixture.run({
      asset: { ...fixture.baseAsset, ...forgedState },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'V2_CADENCE_MISMATCH',
    });
  });
});

type StoredObject = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

async function completeFixture() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/v2-migration.mov' },
    byteLength: 12_345,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-v2-migration' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-v2-migration',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion,
  });
  const qualification = qualificationRecord(storageVersion);
  const mapper = {
    mapperVersion: 'media-pts-mapper-v2',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'policy-v2',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const frames = [
    { presentationTimestampTicks: '0', durationTicks: '3003' },
    { presentationTimestampTicks: '3003', durationTicks: '3003' },
    { presentationTimestampTicks: '6006', durationTicks: '3003' },
    { presentationTimestampTicks: '9009', durationTicks: '3003' },
  ] as const;
  const batches = [frames.slice(0, 2), frames.slice(2)].map(
    (batchFrames, index) => {
      const shard = createMediaSourcePtsCadenceShardV1({
        sourceVersion,
        qualification,
        videoStreamIndex: 0,
        mapper,
        shardSequence: index,
        firstFrameOrdinal: String(index * 2),
        frames: batchFrames,
      });
      const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
        mapBindingSha256: mediaSourcePtsCadenceMapBindingSha256V1(shard),
        resourcePolicy: {
          policyVersion: 'policy-v2',
          maxCanonicalJsonBytes: 16_384,
          maxFrameRecords: 100,
        },
        shard,
        frames: batchFrames,
      });
      return {
        serialization,
        sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
          storage: 'R2_PRIVATE', serialization,
        }),
      };
    },
  );
  const indexes = [1, 2].map((count) => (
    createMediaSourcePtsCadenceManifestIndexV2({
      mapBindingSha256: batches[0]!.serialization.payload.mapBindingSha256,
      resourcePolicy: {
        policyVersion: 'policy-v2',
        maxCanonicalJsonBytes: 16_384,
        maxBatchEntries: 100,
      },
      batches: batches.slice(0, count),
    })
  ));
  const indexSidecars = indexes.map((manifestIndex) => (
    createMediaSourcePtsCadenceManifestIndexSidecarV2({
      storage: 'R2_PRIVATE', manifestIndex,
    })
  ));
  const descriptorSidecars = batches.map(({ serialization }) => (
    serializeMediaSourcePtsCadenceShardSidecarV1({
      storage: 'R2_PRIVATE',
      mapBindingSha256: serialization.payload.mapBindingSha256,
      shard: serialization.payload.shard,
    }).sidecar
  ));
  const objects = new Map<string, StoredObject>();
  batches.forEach(({ serialization, sidecar }) => {
    objects.set(sidecar.objectKey, stored(serialization));
  });
  indexes.forEach((serialization, index) => {
    objects.set(indexSidecars[index]!.objectKey, stored(serialization));
  });
  const reader = {
    read: vi.fn(async ({ objectKey }) => {
      const value = objects.get(objectKey);
      if (!value) throw new Error('TEST_OBJECT_MISSING');
      return value;
    }),
  } satisfies MediaSourcePtsCadenceStoredObjectReaderV2;
  const claimId = 'cadence-claim-v2-migration';
  const initial = createMediaSourcePtsCadenceMapAssetRecordV2({
    bootstrapShard: batches[0]!.serialization.payload.shard,
    now: new Date('2026-08-30T00:00:00.000Z'),
  });
  let current = claimMediaSourcePtsCadenceMapAssetRecordV2({
    record: initial,
    claimId,
    now: new Date('2026-08-30T00:01:00.000Z'),
    expiresAt: new Date('2026-08-30T01:00:00.000Z'),
  });
  for (let index = 0; index < batches.length; index += 1) {
    const checkpoint = await checkpointMediaSourcePtsCadenceMapAssetRecordV2({
      record: current,
      claimId,
      frameBatch: batches[index]!.serialization,
      descriptorSidecar: descriptorSidecars[index]!,
      manifestIndex: indexes[index]!,
      manifestIndexSidecar: indexSidecars[index]!,
      previousManifestIndex: index === 0 ? null : indexes[index - 1]!,
      storedObjectReader: reader,
      frameBatchReader: reader,
      now: () => new Date(`2026-08-30T00:0${index + 2}:00.000Z`),
    });
    if (checkpoint.disposition !== 'CHECKPOINTED') {
      throw new Error(JSON.stringify(checkpoint));
    }
    current = checkpoint.record;
  }
  const lifecycleManifest = serializeMediaSourcePtsCadenceManifestSidecarV1({
    storage: 'R2_PRIVATE',
    mapBindingSha256: current.lifecycleV1.mapBindingSha256,
    checkpoint: current.lifecycleV1.checkpoint,
  });
  objects.set(lifecycleManifest.sidecar.objectKey, stored(lifecycleManifest));
  const terminal = await completeMediaSourcePtsCadenceMapAssetRecordV2({
    record: current,
    claimId,
    coverage: createMediaSourcePtsCadenceSourceCoverageV2({
      sourceVersion,
      qualification,
      videoStreamIndex: 0,
      mapper,
      coveragePolicyVersion: 'coverage-v2',
    }),
    manifestIndex: indexes[1]!,
    lifecycleManifest: lifecycleManifest.sidecar,
    storedObjectReader: reader,
    frameBatchReader: reader,
    now: () => new Date('2026-08-30T00:05:00.000Z'),
  });
  if (terminal.disposition !== 'COMPLETED') throw new Error(JSON.stringify(terminal));
  const baseAsset = {
    assetId: 'asset-v2-migration',
    type: 'video' as const,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  const state = createMediaSourcePtsCadenceMapAssetStateV2({
    asset: baseAsset,
    record: terminal.record,
  });
  const asset = { ...baseAsset, ...state };
  const defaults: MigrationInputV1 = {
    asset,
    storedObjectReader: reader,
    epochIndexResourcePolicy: {
      policyVersion: 'epoch-index-migration-v1',
      maxCanonicalJsonBytes: 1_000_000,
      maxEpochEntries: 10,
      maxBatchEntries: 100,
    },
    verificationPolicy: {
      policyVersion: 'epoch-verification-migration-v1',
      maxBatchReads: 100,
      maxBoundaryEvidenceReads: 0,
      maxTotalArtifactBytes: 10_000_000,
      boundaryEvidenceRegistryVersion: 'boundary-registry-v1',
    },
    now: new Date('2026-08-30T00:06:00.000Z'),
  };
  reader.read.mockClear();
  return {
    sourceVersion,
    baseAsset,
    state,
    asset,
    batches,
    objects,
    reader,
    run: (overrides: Partial<MigrationInputV1> = {}) => (
      prepareMediaSourcePtsCadenceV2ToV3MigrationV1({
        ...defaults,
        ...overrides,
      })
    ),
  };
}

function qualificationRecord(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
): MediaSourceQualificationRecordV1 {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 134,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '12012',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '4',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-v2-migration',
    locator: { provider: 'R2', objectKey: 'media/v2-migration.mov' },
    sourceBindingSha256: 'c'.repeat(64),
    requestId: 'media-source-probe:v2-migration',
    attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion,
    observation: {
      ...observation,
      observationSha256: hashEditronCanonicalJsonV1(observation),
    },
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
