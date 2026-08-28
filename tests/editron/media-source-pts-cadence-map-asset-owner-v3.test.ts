import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import { createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3 } from '@/lib/editron/services/media-source-pts-cadence-epoch-boundary-v3';
import {
  assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
  createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3,
  verifyMediaSourcePtsCadenceEpochArtifactsV3,
  type MediaSourcePtsCadenceBoundarySemanticVerifierV3,
  type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
  type MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV3,
  completeMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetStateV3,
  markMediaSourcePtsCadenceMapAssetRecordUnverifiableV3,
  mediaSourcePtsCadenceMapAssetCompareAndSetFilterV3,
  persistMediaSourcePtsCadenceMapAssetStateV3,
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
  type MediaSourcePtsCadenceMapAssetStorePortsV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceFrameBatchSidecarV2 } from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import {
  createMediaSourcePtsCadenceShardV1,
  type MediaSourcePtsCadenceFrameInputV1,
} from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceMapAssetOwnerV3', () => {
  it('reads and verifies the complete stored epoch, batch, and semantic-evidence set', async () => {
    const fixture = artifactFixture();
    const result = await fixture.verify();

    expect(result).toMatchObject({
      disposition: 'EPOCH_ARTIFACT_SET_VERIFIED',
      verifiedEpochCount: 3,
      verifiedBatchCount: 3,
      verifiedFrameCount: '6',
      verifiedBoundaryEvidenceCount: 1,
      observedCadence: { kind: 'VARIABLE_FRAME_DURATIONS' },
      source: {
        sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
        storageVersionSha256: fixture.sourceVersion.storageVersion.storageVersionSha256,
        mapBindingSha256: fixture.mapBindingSha256,
      },
    });
    if (result.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED') {
      throw new Error(JSON.stringify(result));
    }
    expect(result.totalArtifactBytes).toBe(
      fixture.indexSidecar.byteLength
      + fixture.batches.reduce((sum, batch) => sum + batch.serialization.byteLength, 0)
      + fixture.evidenceStored.byteLength,
    );
    expect(result.verificationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.semanticVerifier.verify).toHaveBeenCalledTimes(1);
    expect(assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3(result)).toEqual(result);
    expect(() => assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3({
      ...result,
      totalArtifactBytes: result.totalArtifactBytes + 1,
    })).toThrow();
  });

  it('fails closed for missing or altered index, batch, and boundary-evidence bytes', async () => {
    const missingIndex = artifactFixture();
    missingIndex.objects.delete(missingIndex.indexSidecar.objectKey);
    await expect(missingIndex.verify()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'EPOCH_INDEX_READ_FAILED',
    });

    const alteredIndex = artifactFixture();
    alteredIndex.objects.set(alteredIndex.indexSidecar.objectKey, {
      ...alteredIndex.objects.get(alteredIndex.indexSidecar.objectKey)!,
      contentSha256: 'f'.repeat(64),
    });
    await expect(alteredIndex.verify()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'EPOCH_INDEX_CONTENT_HASH_MISMATCH',
    });

    const alteredBatch = artifactFixture();
    const firstBatchKey = alteredBatch.batches[0]!.sidecar.objectKey;
    alteredBatch.objects.set(firstBatchKey, {
      ...alteredBatch.objects.get(firstBatchKey)!,
      canonicalJson: `${alteredBatch.objects.get(firstBatchKey)!.canonicalJson} `,
    });
    await expect(alteredBatch.verify()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BATCH_BYTE_LENGTH_MISMATCH',
      failedBatchSequence: 0,
    });

    const missingEvidence = artifactFixture();
    missingEvidence.objects.delete(missingEvidence.evidenceSidecar.objectKey);
    await expect(missingEvidence.verify()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BOUNDARY_EVIDENCE_READ_FAILED',
      failedEpochId: 'epoch-1',
    });

    const alteredEvidence = artifactFixture();
    alteredEvidence.objects.set(alteredEvidence.evidenceSidecar.objectKey, {
      ...alteredEvidence.evidenceStored,
      contentSha256: 'e'.repeat(64),
    });
    await expect(alteredEvidence.verify()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BOUNDARY_EVIDENCE_CONTENT_HASH_MISMATCH',
    });

    const nonCanonicalEvidence = artifactFixture({ nonCanonicalEvidence: true });
    await expect(nonCanonicalEvidence.verify()).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BOUNDARY_EVIDENCE_JSON_NON_CANONICAL',
    });
  });

  it('rejects unregistered, cross-scope, and over-budget verification attempts', async () => {
    const unregistered = artifactFixture();
    await expect(unregistered.verify({
      boundarySemanticVerifier: {
        verify: vi.fn(async (
          _input: Parameters<MediaSourcePtsCadenceBoundarySemanticVerifierV3['verify']>[0],
        ) => ({
          disposition: 'UNVERIFIABLE' as const,
          reason: 'CONTRACT_NOT_REGISTERED',
        })),
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BOUNDARY_EVIDENCE_SEMANTIC_UNVERIFIED',
    });

    const wrongRegistry = artifactFixture();
    await expect(wrongRegistry.verify({
      boundarySemanticVerifier: {
        verify: vi.fn(async ({ boundary, sidecar }) => (
          createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3({
            registryVersion: 'different-registry-v3',
            verifierId: 'fixture-boundary-verifier',
            verifierVersion: 'fixture-boundary-verifier-v3',
            boundary,
            sidecar,
          })
        )),
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BOUNDARY_EVIDENCE_SEMANTIC_RECEIPT_INVALID',
    });

    const forgedReceipt = artifactFixture();
    await expect(forgedReceipt.verify({
      boundarySemanticVerifier: {
        verify: vi.fn(async ({ boundary, sidecar }) => ({
          ...createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3({
            registryVersion: forgedReceipt.policy.boundaryEvidenceRegistryVersion,
            verifierId: 'fixture-boundary-verifier',
            verifierVersion: 'fixture-boundary-verifier-v3',
            boundary,
            sidecar,
          }),
          verifierVersion: 'forged-without-rehashing',
        })),
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'BOUNDARY_EVIDENCE_SEMANTIC_RECEIPT_INVALID',
    });

    const wrongSource = artifactFixture();
    await expect(wrongSource.verify({
      expectedSource: { ...wrongSource.expectedSource, mapBindingSha256: '9'.repeat(64) },
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_SCOPE_MISMATCH' });
    expect(wrongSource.reader.read).not.toHaveBeenCalled();

    const batchBudget = artifactFixture();
    await expect(batchBudget.verify({
      verificationPolicy: { ...batchBudget.policy, maxBatchReads: 2 },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'RESOURCE_LIMIT_EXCEEDED',
    });

    const evidenceBudget = artifactFixture();
    await expect(evidenceBudget.verify({
      verificationPolicy: { ...evidenceBudget.policy, maxBoundaryEvidenceReads: 0 },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'RESOURCE_LIMIT_EXCEEDED',
    });

    const byteBudget = artifactFixture();
    await expect(byteBudget.verify({
      verificationPolicy: {
        ...byteBudget.policy,
        maxTotalArtifactBytes: byteBudget.indexSidecar.byteLength,
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'RESOURCE_LIMIT_EXCEEDED',
    });
  });

  it('claims, reclaims, completes, and terminalizes only an active source-bound attempt', async () => {
    const fixture = artifactFixture();
    const verification = await fixture.verify();
    if (verification.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED') {
      throw new Error(JSON.stringify(verification));
    }
    const pending = fixture.pendingRecord();
    const first = claimMediaSourcePtsCadenceMapAssetRecordV3({
      record: pending,
      claimId: 'claim-1',
      now: new Date('2026-08-29T01:00:00.000Z'),
      expiresAt: new Date('2026-08-29T01:10:00.000Z'),
    });
    expect(first).toMatchObject({ status: 'VERIFYING', attemptCount: 1 });
    expect(() => claimMediaSourcePtsCadenceMapAssetRecordV3({
      record: first,
      claimId: 'claim-too-soon',
      now: new Date('2026-08-29T01:05:00.000Z'),
      expiresAt: new Date('2026-08-29T01:15:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_ACTIVE');

    const reclaimed = claimMediaSourcePtsCadenceMapAssetRecordV3({
      record: first,
      claimId: 'claim-2',
      now: new Date('2026-08-29T01:10:00.000Z'),
      expiresAt: new Date('2026-08-29T01:20:00.000Z'),
    });
    expect(reclaimed).toMatchObject({ status: 'VERIFYING', attemptCount: 2 });
    expect(() => completeMediaSourcePtsCadenceMapAssetRecordV3({
      record: reclaimed,
      claimId: 'claim-1',
      verificationReceipt: verification,
      now: new Date('2026-08-29T01:15:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_NOT_ACTIVE');

    const complete = completeMediaSourcePtsCadenceMapAssetRecordV3({
      record: reclaimed,
      claimId: 'claim-2',
      verificationReceipt: verification,
      now: new Date('2026-08-29T01:15:00.000Z'),
    });
    expect(complete).toMatchObject({
      status: 'COMPLETE',
      attemptCount: 2,
      activeClaim: null,
      terminalReceipt: {
        disposition: 'PUBLISHED',
        verificationSha256: verification.verificationSha256,
      },
    });
    expect(() => claimMediaSourcePtsCadenceMapAssetRecordV3({
      record: complete,
      claimId: 'claim-replay',
      now: new Date('2026-08-29T01:16:00.000Z'),
      expiresAt: new Date('2026-08-29T01:20:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL');

    const failedClaim = claimMediaSourcePtsCadenceMapAssetRecordV3({
      record: fixture.pendingRecord(),
      claimId: 'claim-failed',
      now: new Date('2026-08-29T02:00:00.000Z'),
      expiresAt: new Date('2026-08-29T02:10:00.000Z'),
    });
    const failed = markMediaSourcePtsCadenceMapAssetRecordUnverifiableV3({
      record: failedClaim,
      claimId: 'claim-failed',
      diagnostic: 'BOUNDARY_EVIDENCE_CONTRACT_NOT_REGISTERED',
      now: new Date('2026-08-29T02:05:00.000Z'),
    });
    expect(failed).toMatchObject({
      status: 'UNVERIFIABLE',
      verificationReceipt: null,
      terminalReceipt: { disposition: 'UNVERIFIABLE' },
    });
  });

  it('persists the lifecycle with source-bound CAS and rejects stale, skipped, or parallel states', async () => {
    const fixture = artifactFixture();
    const verification = await fixture.verify();
    if (verification.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED') {
      throw new Error(JSON.stringify(verification));
    }
    const pending = fixture.pendingRecord();
    const memory = assetMemory(fixture.asset);
    const appliedPending = await persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3',
      userId: 'user-1',
      expectedStateSha256: null,
      nextRecord: pending,
    }, memory.ports);
    expect(appliedPending).toMatchObject({ disposition: 'APPLIED' });
    if (appliedPending.disposition !== 'APPLIED') throw new Error('TEST_PENDING_NOT_APPLIED');

    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1',
      expectedStateSha256: appliedPending.state.sourcePtsCadenceMapStateSha256V3,
      nextRecord: pending,
    }, memory.ports)).resolves.toMatchObject({ disposition: 'UNCHANGED' });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1',
      expectedStateSha256: 'f'.repeat(64), nextRecord: pending,
    }, memory.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH',
    });

    const claimed = claimMediaSourcePtsCadenceMapAssetRecordV3({
      record: pending,
      claimId: 'claim-store',
      now: new Date('2026-08-29T03:00:00.000Z'),
      expiresAt: new Date('2026-08-29T03:10:00.000Z'),
    });
    const completed = completeMediaSourcePtsCadenceMapAssetRecordV3({
      record: claimed,
      claimId: 'claim-store',
      verificationReceipt: verification,
      now: new Date('2026-08-29T03:05:00.000Z'),
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1',
      expectedStateSha256: appliedPending.state.sourcePtsCadenceMapStateSha256V3,
      nextRecord: completed,
    }, memory.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'INVALID_TRANSITION',
    });

    const appliedClaim = await persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1',
      expectedStateSha256: appliedPending.state.sourcePtsCadenceMapStateSha256V3,
      nextRecord: claimed,
    }, memory.ports);
    expect(appliedClaim).toMatchObject({ disposition: 'APPLIED' });
    if (appliedClaim.disposition !== 'APPLIED') throw new Error('TEST_CLAIM_NOT_APPLIED');
    const appliedComplete = await persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1',
      expectedStateSha256: appliedClaim.state.sourcePtsCadenceMapStateSha256V3,
      nextRecord: completed,
    }, memory.ports);
    expect(appliedComplete).toMatchObject({ disposition: 'APPLIED' });

    const initialState = createMediaSourcePtsCadenceMapAssetStateV3({
      asset: fixture.asset,
      record: pending,
    });
    const filter = mediaSourcePtsCadenceMapAssetCompareAndSetFilterV3({
      assetId: 'asset-epoch-v3', userId: 'user-1', expectedState: null, nextState: initialState,
    });
    expect(filter).toMatchObject({
      type: 'video',
      'sourceVersionV1.sourceVersionSha256': fixture.sourceVersion.sourceVersionSha256,
      'sourceQualificationV1.observation.observationSha256':
        fixture.qualification.observation.observationSha256,
    });
    expect(filter.$and).toHaveLength(6);

    const earlier = assetMemory({ ...fixture.asset, sourcePtsCadenceMapV2: {} });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1', expectedStateSha256: null, nextRecord: pending,
    }, earlier.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'EARLIER_STATE_PRESENT',
    });
    const partial = assetMemory({ ...fixture.asset, sourcePtsCadenceMapV3: pending });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1', expectedStateSha256: null, nextRecord: pending,
    }, partial.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID',
    });
    const changed = assetMemory({
      ...fixture.asset,
      sourceVersionV1: { ...fixture.sourceVersion, sourceVersionSha256: '9'.repeat(64) },
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1', expectedStateSha256: null, nextRecord: pending,
    }, changed.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'NEXT_STATE_INVALID',
    });
    const raced = assetMemory(fixture.asset, false);
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'asset-epoch-v3', userId: 'user-1', expectedStateSha256: null, nextRecord: pending,
    }, raced.ports)).resolves.toEqual({ disposition: 'RACE_LOST' });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV3({
      assetId: 'missing', userId: 'user-1', expectedStateSha256: null, nextRecord: pending,
    }, { load: vi.fn(async () => null), replace: vi.fn(async () => true) })).resolves.toEqual({
      disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND',
    });
  });

  it('rejects partial, altered, wrong-stream, and earlier-version state pairs', () => {
    const fixture = artifactFixture();
    const pending = fixture.pendingRecord();
    const state = createMediaSourcePtsCadenceMapAssetStateV3({
      asset: fixture.asset,
      record: pending,
    });
    expect(readMediaSourcePtsCadenceMapAssetStateV3({ ...fixture.asset, ...state })).toEqual(state);
    expect(() => readMediaSourcePtsCadenceMapAssetStateV3({
      ...fixture.asset,
      sourcePtsCadenceMapV3: state.sourcePtsCadenceMapV3,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_V3_INCOMPLETE');
    expect(() => readMediaSourcePtsCadenceMapAssetStateV3({
      ...fixture.asset,
      ...state,
      sourcePtsCadenceMapStateSha256V3: 'f'.repeat(64),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_V3_HASH_MISMATCH');
    expect(() => createMediaSourcePtsCadenceMapAssetStateV3({
      asset: { ...fixture.asset, sourcePtsCadenceMapV1: {} },
      record: pending,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_PARALLEL_EARLIER_STATE_FORBIDDEN');
    expect(() => createMediaSourcePtsCadenceMapAssetStateV3({
      asset: {
        ...fixture.asset,
        sourceQualificationV1: {
          ...fixture.qualification,
          observation: {
            ...fixture.qualification.observation,
            videoStreams: [{
              ...fixture.qualification.observation.videoStreams[0],
              streamIndex: 1,
            }],
          },
        },
      },
      record: pending,
    })).toThrow();
  });
});

type StoredObject = Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;

function artifactFixture(options: { nonCanonicalEvidence?: boolean } = {}) {
  const sourceTimebase = { numerator: '1', denominator: '1000' } as const;
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/epoch-source.mkv' },
    byteLength: 99_999,
    providerVersion: { kind: 'R2_ETAG', value: 'epoch-etag-v3' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-epoch-v3',
    mediaKind: 'video',
    byteLength: 99_999,
    contentSha256: '1'.repeat(64),
    storageVersion,
  });
  const qualification = qualificationFixture(storageVersion, sourceTimebase);
  const mapper = {
    mapperVersion: 'pts-epoch-mapper-v3',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'pts-epoch-policy-v3',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const specs = [
    epochSpec('10000', ['1000', '1000'], '0', 'INITIAL'),
    epochSpec('-2000', ['500', '1500'], '2', 'TIMESTAMP_RESET'),
    epochSpec('2000', ['1000', '1000'], '6', 'GAP'),
  ] as const;
  let firstFrameOrdinal = BigInt(0);
  const shards = specs.map((spec, sequence) => {
    const frames = framesFromSpec(spec);
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion,
      qualification,
      videoStreamIndex: 0,
      mapper,
      shardSequence: sequence,
      firstFrameOrdinal: firstFrameOrdinal.toString(),
      frames,
    });
    firstFrameOrdinal += BigInt(frames.length);
    return { shard, frames };
  });
  const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shards[0]!.shard);
  const batches = shards.map(({ shard, frames }) => {
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: {
        policyVersion: mapper.commandPolicyVersion,
        maxCanonicalJsonBytes: 64_000,
        maxFrameRecords: 100,
      },
      shard,
      frames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: 'R2_PRIVATE',
        serialization,
      }),
    };
  });

  const evidenceMaterial = {
    schemaVersion: 3,
    evidenceContractVersion: 'boundary-evidence-fixture-v3',
    epochId: 'epoch-1',
    boundaryKind: 'TIMESTAMP_RESET',
    detectorVersion: 'epoch-detector-v3',
    demuxerMarker: { packetOrdinal: '200', marker: 'DISCONTINUITY' },
  };
  const canonicalEvidence = canonicalizeEditronJsonV1(evidenceMaterial);
  const evidenceCanonicalJson = options.nonCanonicalEvidence
    ? `${canonicalEvidence} `
    : canonicalEvidence;
  const evidenceStored = {
    canonicalJson: evidenceCanonicalJson,
    byteLength: Buffer.byteLength(evidenceCanonicalJson, 'utf8'),
    contentSha256: hashUtf8(evidenceCanonicalJson),
  };
  const evidenceSidecar = createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3({
    evidenceContractVersion: 'boundary-evidence-fixture-v3',
    storage: 'R2_PRIVATE',
    byteLength: evidenceStored.byteLength,
    contentSha256: evidenceStored.contentSha256,
    mapBindingSha256,
    epochId: 'epoch-1',
  });
  const epochs = specs.map((spec, index) => ({
    epoch: presentationEpoch(spec, index),
    boundary: {
      classificationBasis: spec.classificationBasis,
      detectorVersion: 'epoch-detector-v3',
      externalEvidence: index === 1 ? evidenceSidecar : null,
    },
    batches: [batches[index]!],
  }));
  const indexSerialization = createMediaSourcePtsCadenceEpochIndexV3({
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase,
    resourcePolicy: {
      policyVersion: 'pts-epoch-index-policy-v3',
      maxCanonicalJsonBytes: 1_000_000,
      maxEpochEntries: 100,
      maxBatchEntries: 100,
    },
    epochs,
  });
  const indexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
    storage: 'R2_PRIVATE',
    serialization: indexSerialization,
  });
  const objects = new Map<string, StoredObject>([
    [indexSidecar.objectKey, stored(indexSerialization)],
    ...batches.map((batch) => [
      batch.sidecar.objectKey,
      stored(batch.serialization),
    ] as const),
    [evidenceSidecar.objectKey, evidenceStored],
  ]);
  const reader = {
    read: vi.fn(async (sidecar: Parameters<MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3['read']>[0]) => {
      const object = objects.get(sidecar.objectKey);
      if (!object) throw new Error('OBJECT_NOT_FOUND');
      return object;
    }),
  } satisfies MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  const policy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3 = {
    policyVersion: 'epoch-artifact-verification-policy-v3',
    maxBatchReads: 100,
    maxBoundaryEvidenceReads: 100,
    maxTotalArtifactBytes: 10_000_000,
    boundaryEvidenceRegistryVersion: 'boundary-registry-v3',
  };
  const semanticVerifier = {
    verify: vi.fn(async ({ boundary, sidecar, evidence }) => {
      const parsed = evidence as typeof evidenceMaterial;
      if (parsed.epochId !== sidecar.epochId
        || parsed.boundaryKind !== boundary.boundaryKind
        || parsed.detectorVersion !== boundary.detectorVersion) {
        return { disposition: 'UNVERIFIABLE' as const, reason: 'EVIDENCE_SCOPE_MISMATCH' };
      }
      return createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3({
        registryVersion: policy.boundaryEvidenceRegistryVersion,
        verifierId: 'fixture-boundary-verifier',
        verifierVersion: 'fixture-boundary-verifier-v3',
        boundary,
        sidecar,
      });
    }),
  } satisfies MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  const expectedSource = {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation.observationSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase,
  };
  const baseVerificationInput: Parameters<
    typeof verifyMediaSourcePtsCadenceEpochArtifactsV3
  >[0] = {
    epochIndexSidecar: indexSidecar,
    expectedSource,
    verificationPolicy: policy,
    storedObjectReader: reader,
    boundarySemanticVerifier: semanticVerifier,
  };
  const asset: MediaSourcePtsCadenceMapAssetStateInputV3 = {
    assetId: 'asset-epoch-v3',
    type: 'video',
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return {
    sourceVersion,
    qualification,
    mapBindingSha256,
    batches,
    evidenceSidecar,
    evidenceStored,
    indexSerialization,
    indexSidecar,
    objects,
    reader,
    semanticVerifier,
    expectedSource,
    policy,
    asset,
    verify: (overrides: Partial<Parameters<
      typeof verifyMediaSourcePtsCadenceEpochArtifactsV3
    >[0]> = {}) => (
      verifyMediaSourcePtsCadenceEpochArtifactsV3({ ...baseVerificationInput, ...overrides })
    ),
    pendingRecord: () => createMediaSourcePtsCadenceMapAssetRecordV3({
      source: expectedSource,
      epochIndexSidecar: indexSidecar,
      verificationPolicy: policy,
      now: new Date('2026-08-29T00:00:00.000Z'),
    }),
  };
}

type EpochSpec = Readonly<{
  start: string;
  durations: readonly string[];
  canonicalStart: string;
  boundaryKind: PresentationEpochV1['boundaryKind'];
  classificationBasis:
    | 'FIRST_DECODED_PRESENTATION'
    | 'PTS_DELTA'
    | 'DEMUXER_DISCONTINUITY_MARKER';
}>;

function epochSpec(
  start: string,
  durations: readonly string[],
  canonicalStart: string,
  boundaryKind: EpochSpec['boundaryKind'],
): EpochSpec {
  const classificationBasis = boundaryKind === 'INITIAL'
    ? 'FIRST_DECODED_PRESENTATION' as const
    : boundaryKind === 'TIMESTAMP_RESET'
      ? 'DEMUXER_DISCONTINUITY_MARKER' as const
      : 'PTS_DELTA' as const;
  return { start, durations, canonicalStart, boundaryKind, classificationBasis };
}

function presentationEpoch(spec: EpochSpec, index: number): PresentationEpochV1 {
  const end = spec.durations.reduce((pts, duration) => pts + BigInt(duration), BigInt(spec.start));
  return {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId: `epoch-${index}`,
    streamId: 'video-0',
    secondsPerSourceTick: { numerator: '1', denominator: '1000' },
    sourceStartPresentationTimestampTicks: spec.start,
    sourceEndExclusivePresentationTimestampTicks: end.toString(),
    canonicalStartTime: { ticks: spec.canonicalStart, timescale: '1' },
    boundaryKind: spec.boundaryKind,
  };
}

function framesFromSpec(spec: EpochSpec): readonly MediaSourcePtsCadenceFrameInputV1[] {
  let pts = BigInt(spec.start);
  return spec.durations.map((durationTicks) => {
    const frame = { presentationTimestampTicks: pts.toString(), durationTicks };
    pts += BigInt(durationTicks);
    return frame;
  });
}

function qualificationFixture(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
  sourceTimebase: Readonly<{ numerator: string; denominator: string }>,
) {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'matroska',
    durationMilliseconds: 20_000,
    startTimeMilliseconds: -2_000,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase,
      sourceStartPts: '-2000',
      sourceDurationTicks: '20000',
      averageFrameRate: { numerator: '24', denominator: '1' },
      realFrameRate: { numerator: '24', denominator: '1' },
      frameCount: '6',
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
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: 'asset-epoch-v3',
    locator: { provider: 'R2' as const, objectKey: 'media/epoch-source.mkv' },
    sourceBindingSha256: '2'.repeat(64),
    requestId: 'epoch-index-fixture-v3',
    attemptCount: 1,
    requestedAt: '2026-08-29T00:00:00.000Z',
    startedAt: '2026-08-29T00:00:01.000Z',
    completedAt: '2026-08-29T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

function stored(value: Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>): StoredObject {
  return {
    canonicalJson: value.canonicalJson,
    byteLength: value.byteLength,
    contentSha256: value.contentSha256,
  };
}

function assetMemory(asset: MediaSourcePtsCadenceMapAssetStateInputV3, replaceResult = true) {
  const memory = { asset: { ...asset } };
  const replace = vi.fn(async (input: Parameters<MediaSourcePtsCadenceMapAssetStorePortsV3['replace']>[0]) => {
    if (!replaceResult) return false;
    const currentHash = memory.asset.sourcePtsCadenceMapStateSha256V3 ?? null;
    if (currentHash !== (input.expectedState?.sourcePtsCadenceMapStateSha256V3 ?? null)) return false;
    Object.assign(memory.asset, input.nextState, {
      sourcePtsCadenceMapV1: null,
      sourcePtsCadenceMapStateSha256V1: null,
      sourcePtsCadenceMapV2: null,
      sourcePtsCadenceMapStateSha256V2: null,
    });
    return true;
  });
  return {
    asset: memory.asset,
    replace,
    ports: {
      load: vi.fn(async () => memory.asset),
      replace,
    } satisfies MediaSourcePtsCadenceMapAssetStorePortsV3,
  };
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
