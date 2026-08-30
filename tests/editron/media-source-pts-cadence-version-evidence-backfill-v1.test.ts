import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1 }
  from '@/lib/editron/contracts/canonical-media-time-v1';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
  verifyMediaSourcePtsCadenceEpochArtifactsV3,
  type MediaSourcePtsCadenceBoundarySemanticVerifierV3,
  type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
  expectedMediaSourcePtsCadenceStreamIdV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import { serializeMediaSourcePtsCadenceFrameBatchV2 }
  from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV3,
  completeMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetStateV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { mediaSourcePtsCadenceMapBindingSha256V1 }
  from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceFrameBatchSidecarV2 }
  from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import { createMediaSourcePtsCadenceShardV1 }
  from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
  backfillMediaSourcePtsCadenceVersionEvidenceV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceVersionEvidenceBackfillV1', () => {
  it('reproves every artifact before retaining and safely replays the V3 root', async () => {
    const fixture = await v3Fixture('a');
    const evidence = evidenceStore();
    const ports = fixture.ports(evidence.ports);

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.completeAsset,
      ports,
    )).resolves.toMatchObject({
      disposition: 'BACKFILLED',
      sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
      verificationSha256: fixture.verification.verificationSha256,
      evidenceWriteDisposition: 'APPLIED',
    });
    expect(fixture.reader.read).toHaveBeenCalledTimes(2);
    expect(evidence.current()?.sourcePtsCadenceMapV3?.status).toBe('COMPLETE');
    expect(evidence.current()?.sourceAudioArtifactsV1).toBeNull();

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.completeAsset,
      ports,
    )).resolves.toMatchObject({
      disposition: 'BACKFILLED', evidenceWriteDisposition: 'UNCHANGED',
    });
  });

  it('does not retain a root when immutable artifact bytes no longer verify', async () => {
    const fixture = await v3Fixture('corrupt');
    const batchKey = fixture.batch.sidecar.objectKey;
    fixture.objects.set(batchKey, {
      ...fixture.objects.get(batchKey)!,
      canonicalJson: `${fixture.objects.get(batchKey)!.canonicalJson} `,
    });
    const evidence = evidenceStore();

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.completeAsset,
      fixture.ports(evidence.ports),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'ARTIFACT_SET_UNVERIFIABLE',
      retryable: false,
    });
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
  });

  it('rejects a persisted verification receipt that fresh reproof contradicts', async () => {
    const fixture = await v3Fixture('receipt', true);
    const evidence = evidenceStore();

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.completeAsset,
      fixture.ports(evidence.ports),
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'PERSISTED_VERIFICATION_MISMATCH',
      retryable: false,
      artifactReason: null,
    });
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
  });

  it('skips absent and nonpublished V3 state without reading private objects', async () => {
    const fixture = await v3Fixture('pending');
    const evidence = evidenceStore();
    const ports = fixture.ports(evidence.ports);

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.baseAsset,
      ports,
    )).resolves.toEqual({
      disposition: 'NOT_APPLICABLE', reason: 'V3_STATE_ABSENT',
    });
    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.pendingAsset,
      ports,
    )).resolves.toEqual({
      disposition: 'NOT_APPLICABLE', reason: 'V3_NOT_PUBLISHED',
    });
    expect(fixture.reader.read).not.toHaveBeenCalled();
    expect(evidence.load).not.toHaveBeenCalled();
  });

  it('marks private-object read failure retryable and preserves the ledger', async () => {
    const fixture = await v3Fixture('outage');
    fixture.reader.read.mockRejectedValue(new Error('R2 unavailable'));
    const evidence = evidenceStore();

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      fixture.completeAsset,
      fixture.ports(evidence.ports),
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'ARTIFACT_SET_UNVERIFIABLE',
      retryable: true,
      artifactReason: 'EPOCH_INDEX_READ_FAILED',
    });
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
  });

  it('preserves an incompatible immutable root as a nonretryable conflict', async () => {
    const current = await v3Fixture('old');
    const candidate = await v3Fixture('new');
    const evidence = evidenceStore(
      captureMediaSourceVersionEvidenceV1(current.completeAsset),
    );

    await expect(backfillMediaSourcePtsCadenceVersionEvidenceV1(
      candidate.completeAsset,
      candidate.ports(evidence.ports),
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'EVIDENCE_CONFLICT',
      retryable: false,
      artifactReason: null,
    });
  });

  it('decodes durable results and rejects forged failure classification', () => {
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1({
      disposition: 'BACKFILLED',
      assetId: 'asset-v3-evidence-backfill',
      sourceVersionSha256: 'a'.repeat(64),
      terminalReceiptSha256: 'b'.repeat(64),
      verificationSha256: 'c'.repeat(64),
      evidenceWriteDisposition: 'UNCHANGED',
      evidenceSha256: 'd'.repeat(64),
    })).toMatchObject({
      disposition: 'BACKFILLED', evidenceWriteDisposition: 'UNCHANGED',
    });
    const retryable = {
      disposition: 'UNVERIFIABLE',
      reason: 'ARTIFACT_SET_UNVERIFIABLE',
      retryable: true,
      artifactReason: 'BATCH_READ_FAILED',
    } as const;
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1(
      retryable,
    )).toEqual(retryable);
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1({
      ...retryable, retryable: false,
    })).toThrow('BACKFILL_RESULT_RETRYABLE_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1({
      ...retryable, artifactReason: null,
    })).toThrow('BACKFILL_RESULT_ARTIFACT_REASON_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1({
      disposition: 'NOT_APPLICABLE', reason: 'V3_STATE_ABSENT', extra: true,
    })).toThrow('BACKFILL_RESULT_FIELDS_INVALID');
  });
});

type StoredObject = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

async function v3Fixture(tag: string, mismatchedReceipt = false) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/v3-evidence-backfill.mov' },
    byteLength: 10_000,
    providerVersion: { kind: 'R2_ETAG', value: 'v3-evidence-backfill-etag' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-v3-evidence-backfill' },
    assetId: 'asset-v3-evidence-backfill',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: digest('source'),
    storageVersion,
  });
  const qualification = qualificationRecord(sourceVersion.assetId, storageVersion);
  const mapper = {
    mapperVersion: 'media-pts-mapper-v3-test',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: `v3-backfill-${tag}`,
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
  const batchSerialization = serializeMediaSourcePtsCadenceFrameBatchV2({
    mapBindingSha256,
    resourcePolicy: {
      policyVersion: mapper.commandPolicyVersion,
      maxCanonicalJsonBytes: 100_000,
      maxFrameRecords: 100,
    },
    shard,
    frames,
  });
  const batch = {
    serialization: batchSerialization,
    sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
      storage: 'R2_PRIVATE', serialization: batchSerialization,
    }),
  };
  const epochIndex = createMediaSourcePtsCadenceEpochIndexV3({
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    resourcePolicy: {
      policyVersion: 'v3-backfill-index-v1',
      maxCanonicalJsonBytes: 1_000_000,
      maxEpochEntries: 10,
      maxBatchEntries: 100,
    },
    epochs: [{
      epoch: {
        schemaVersion: 1,
        contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
        kind: 'presentation-epoch',
        epochId: `epoch-${tag}`,
        streamId: expectedMediaSourcePtsCadenceStreamIdV3(0),
        secondsPerSourceTick: { numerator: '1', denominator: '90000' },
        sourceStartPresentationTimestampTicks: '0',
        sourceEndExclusivePresentationTimestampTicks: '6006',
        canonicalStartTime: { ticks: '0', timescale: '1' },
        boundaryKind: 'INITIAL',
      },
      boundary: {
        classificationBasis: 'FIRST_DECODED_PRESENTATION',
        detectorVersion: 'v3-backfill-detector-v1',
        externalEvidence: null,
      },
      batches: [batch],
    }],
  });
  const indexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
    storage: 'R2_PRIVATE', serialization: epochIndex,
  });
  const objects = new Map<string, StoredObject>([
    [indexSidecar.objectKey, stored(epochIndex)],
    [batch.sidecar.objectKey, stored(batchSerialization)],
  ]);
  const reader = {
    read: vi.fn(async ({ objectKey }) => {
      const value = objects.get(objectKey);
      if (!value) throw new Error('TEST_OBJECT_MISSING');
      return value;
    }),
  } satisfies MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  const boundarySemanticVerifier = {
    verify: vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'TEST_HAS_NO_EXTERNAL_BOUNDARY',
    })),
  } satisfies MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  const source = {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation!.observationSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '90000' },
  };
  const verificationPolicy = {
    policyVersion: 'v3-backfill-verification-v1',
    maxBatchReads: 100,
    maxBoundaryEvidenceReads: 0,
    maxTotalArtifactBytes: 1_000_000,
    boundaryEvidenceRegistryVersion: 'v3-backfill-boundary-registry-v1',
  };
  const verification = await verifyMediaSourcePtsCadenceEpochArtifactsV3({
    epochIndexSidecar: indexSidecar,
    expectedSource: source,
    verificationPolicy,
    storedObjectReader: reader,
    boundarySemanticVerifier,
  });
  if (verification.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED') {
    throw new Error(JSON.stringify(verification));
  }
  const persistedVerification = mismatchedReceipt
    ? alteredCadenceReceipt(verification)
    : verification;
  const pending = createMediaSourcePtsCadenceMapAssetRecordV3({
    source, epochIndexSidecar: indexSidecar, verificationPolicy,
    now: new Date('2026-08-30T00:00:00.000Z'),
  });
  const claimed = claimMediaSourcePtsCadenceMapAssetRecordV3({
    record: pending,
    claimId: `v3-backfill-${tag}`,
    now: new Date('2026-08-30T00:01:00.000Z'),
    expiresAt: new Date('2026-08-30T00:11:00.000Z'),
  });
  const complete = completeMediaSourcePtsCadenceMapAssetRecordV3({
    record: claimed,
    claimId: `v3-backfill-${tag}`,
    verificationReceipt: persistedVerification,
    now: new Date('2026-08-30T00:02:00.000Z'),
  });
  const baseAsset = {
    assetId: sourceVersion.assetId,
    type: 'video' as const,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  const asset = (record: typeof pending) => ({
    ...baseAsset,
    ...createMediaSourcePtsCadenceMapAssetStateV3({ asset: baseAsset, record }),
  });
  reader.read.mockClear();
  return {
    sourceVersion, baseAsset, pendingAsset: asset(pending),
    completeAsset: asset(complete), batch, objects, reader, verification,
    ports: (evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1) => ({
      storedObjectReader: reader,
      boundarySemanticVerifier,
      evidenceStorePorts,
    }),
  };
}

function alteredCadenceReceipt(
  receipt: Awaited<ReturnType<typeof verifyMediaSourcePtsCadenceEpochArtifactsV3>> & {
    disposition: 'EPOCH_ARTIFACT_SET_VERIFIED';
  },
) {
  const material = {
    ...receipt,
    observedCadence: {
      kind: 'UNIFORM_FRAME_DURATIONS' as const,
      durationTicks: '3004',
    },
  };
  const { verificationSha256: _ignored, ...withoutHash } = material;
  return assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3({
    ...withoutHash,
    verificationSha256: hashEditronCanonicalJsonV1(withoutHash),
  });
}

function evidenceStore(initial: MediaSourceVersionEvidenceRecordV1 | null = null) {
  let current = initial;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256, next,
  }: Parameters<MediaSourceVersionEvidenceStorePortsV1['compareAndSet']>[0]) => {
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) return false;
    current = next;
    return true;
  });
  return {
    ports: { load, compareAndSet } satisfies MediaSourceVersionEvidenceStorePortsV1,
    load, compareAndSet, current: () => current,
  };
}

function qualificationRecord(
  assetId: string,
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
): MediaSourceQualificationRecordV1 {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 67,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: '6006',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '2', colorSpace: 'bt709', colorTransfer: 'bt709',
      colorPrimaries: 'bt709', colorRange: 'tv', timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL', assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: digest('source-binding'),
    requestId: 'v3-evidence-backfill-request', attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z', storageVersion,
    observation: {
      ...observation,
      observationSha256: hashEditronCanonicalJsonV1(observation),
    },
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

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
