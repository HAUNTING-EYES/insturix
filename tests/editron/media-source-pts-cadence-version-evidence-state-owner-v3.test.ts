import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3,
  assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3,
  expectedMediaSourcePtsCadenceEpochIndexObjectKeyV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV3,
  completeMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetStateV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3,
  MediaSourcePtsCadenceVersionEvidenceErrorV3,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-state-owner-v3';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceVersionEvidenceStateOwnerV3', () => {
  it('durably captures COMPLETE evidence before invoking the active asset writer', async () => {
    const fixture = terminalFixture('a');
    const order: string[] = [];
    const evidence = memoryEvidenceStore(null, 0, order);
    const base = baseStateOwner(fixture, order);
    const owner = createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      stateOwner: base,
      evidenceStorePorts: evidence.ports,
    });

    await expect(owner.persist(persistInput(fixture.complete))).resolves.toMatchObject({
      disposition: 'APPLIED',
      state: { sourcePtsCadenceMapV3: { status: 'COMPLETE' } },
    });
    expect(order).toEqual(['evidence', 'asset']);
    expect(evidence.current()).toMatchObject({
      sourceVersionV1: {
        sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
      },
      sourcePtsCadenceMapV3: { status: 'COMPLETE' },
    });
  });

  it('repairs one evidence CAS race, then writes the active state once', async () => {
    const fixture = terminalFixture('a');
    const evidence = memoryEvidenceStore(null, 1);
    const base = baseStateOwner(fixture);
    const owner = createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      stateOwner: base,
      evidenceStorePorts: evidence.ports,
    });

    await expect(owner.persist(persistInput(fixture.complete))).resolves.toMatchObject({
      disposition: 'APPLIED',
    });
    expect(evidence.compareAndSet).toHaveBeenCalledTimes(2);
    expect(base.persist).toHaveBeenCalledTimes(1);
  });

  it('blocks the active write for conflicting evidence and store failure', async () => {
    const fixture = terminalFixture('a');
    const conflictingFixture = terminalFixture('b');
    const conflicting = captureMediaSourceVersionEvidenceV1(
      conflictingFixture.completeAsset,
    );
    const base = baseStateOwner(fixture);
    const owner = createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      stateOwner: base,
      evidenceStorePorts: memoryEvidenceStore(conflicting).ports,
    });
    const conflict = await owner.persist(persistInput(fixture.complete))
      .catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(MediaSourcePtsCadenceVersionEvidenceErrorV3);
    expect(conflict).toMatchObject({
      reason: 'SOURCE_VERSION_EVIDENCE_CONFLICT', retryable: false,
    });
    expect(base.persist).not.toHaveBeenCalled();

    const failedBase = baseStateOwner(fixture);
    const failed = createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      stateOwner: failedBase,
      evidenceStorePorts: {
        load: vi.fn(async () => { throw new Error('Atlas offline'); }),
        compareAndSet: vi.fn(async () => true),
      },
    });
    const unavailable = await failed.persist(persistInput(fixture.complete))
      .catch((error: unknown) => error);
    expect(unavailable).toMatchObject({
      reason: 'SOURCE_VERSION_EVIDENCE_STORE_LOAD_FAILED', retryable: true,
    });
    expect(failedBase.persist).not.toHaveBeenCalled();
  });

  it('does not create historical evidence for a nonterminal V3 transition', async () => {
    const fixture = terminalFixture('a');
    const evidence = memoryEvidenceStore();
    const base = baseStateOwner(fixture);
    const owner = createMediaSourcePtsCadenceVersionEvidenceStateOwnerV3({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      stateOwner: base,
      evidenceStorePorts: evidence.ports,
    });

    await expect(owner.persist(persistInput(fixture.pending))).resolves.toMatchObject({
      disposition: 'APPLIED',
      state: { sourcePtsCadenceMapV3: { status: 'PENDING' } },
    });
    expect(evidence.load).not.toHaveBeenCalled();
    expect(evidence.compareAndSet).not.toHaveBeenCalled();
    expect(base.persist).toHaveBeenCalledTimes(1);
  });
});

function baseStateOwner(
  fixture: ReturnType<typeof terminalFixture>,
  order: string[] = [],
) {
  return {
    load: vi.fn(async () => fixture.completeAsset),
    persist: vi.fn(async (input: ReturnType<typeof persistInput>) => {
      order.push('asset');
      return {
        disposition: 'APPLIED' as const,
        state: createMediaSourcePtsCadenceMapAssetStateV3({
          asset: fixture.baseAsset,
          record: input.nextRecord,
        }),
      };
    }),
  };
}

function persistInput(
  nextRecord: ReturnType<typeof terminalFixture>['complete'],
) {
  return {
    assetId: 'asset-version-evidence',
    userId: 'user-version-evidence',
    expectedStateSha256: null,
    nextRecord,
  };
}

function memoryEvidenceStore(
  initial: MediaSourceVersionEvidenceRecordV1 | null = null,
  forcedRaces = 0,
  order: string[] = [],
) {
  let current = initial;
  let races = forcedRaces;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<MediaSourceVersionEvidenceStorePortsV1['compareAndSet']>[0]) => {
    if (races > 0) {
      races -= 1;
      return false;
    }
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) return false;
    current = next;
    order.push('evidence');
    return true;
  });
  return {
    ports: { load, compareAndSet } satisfies MediaSourceVersionEvidenceStorePortsV1,
    load,
    compareAndSet,
    current: () => current,
  };
}

function terminalFixture(mapTag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/version-evidence.mov' },
    byteLength: 10_000,
    providerVersion: { kind: 'R2_ETAG', value: 'version-evidence-etag' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-version-evidence' },
    assetId: 'asset-version-evidence',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash('source-content'),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'quicktime',
    durationMilliseconds: 1_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '1000' },
      sourceStartPts: '0',
      sourceDurationTicks: '1000',
      averageFrameRate: { numerator: '1', denominator: '1' },
      realFrameRate: { numerator: '1', denominator: '1' },
      frameCount: '1',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId: sourceVersion.assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: hash('source-binding'),
    requestId: 'version-evidence-request',
    attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  const source = {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation.observationSha256,
    mapBindingSha256: hash(`map-binding-${mapTag}`),
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '1000' },
  };
  const indexContentSha256 = hash(`index-${mapTag}`);
  const indexSidecar = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3,
    storage: 'R2_PRIVATE' as const,
    objectKey: expectedMediaSourcePtsCadenceEpochIndexObjectKeyV3(
      source.sourceVersionSha256,
      source.mapBindingSha256,
      indexContentSha256,
    ),
    byteLength: 100,
    contentSha256: indexContentSha256,
    sourceVersionSha256: source.sourceVersionSha256,
    mapBindingSha256: source.mapBindingSha256,
    epochCount: 1,
    batchCount: 1,
    endExclusiveFrameOrdinal: '1',
  };
  const policy = {
    policyVersion: 'version-evidence-v3-policy',
    maxBatchReads: 10,
    maxBoundaryEvidenceReads: 0,
    maxTotalArtifactBytes: 1_000,
    boundaryEvidenceRegistryVersion: 'version-evidence-boundary-registry',
  };
  const pending = createMediaSourcePtsCadenceMapAssetRecordV3({
    source,
    epochIndexSidecar: indexSidecar,
    verificationPolicy: policy,
    now: new Date('2026-08-30T00:00:03.000Z'),
  });
  const claimed = claimMediaSourcePtsCadenceMapAssetRecordV3({
    record: pending,
    claimId: 'version-evidence-claim',
    now: new Date('2026-08-30T00:00:04.000Z'),
    expiresAt: new Date('2026-08-30T00:10:04.000Z'),
  });
  const batchReceipt = {
    batchSequence: 0,
    epochId: 'epoch-0',
    byteLength: 50,
    contentSha256: hash(`batch-${mapTag}`),
    shardDescriptorSha256: hash(`shard-${mapTag}`),
    frameCount: '1',
  };
  const verificationMaterial = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFICATION_KIND_V3,
    disposition: 'EPOCH_ARTIFACT_SET_VERIFIED' as const,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_ARTIFACT_VERIFIER_VERSION_V3,
    source,
    verificationPolicy: policy,
    epochIndexSidecar: indexSidecar,
    verifiedEpochCount: 1,
    verifiedBatchCount: 1,
    verifiedFrameCount: '1',
    verifiedBoundaryEvidenceCount: 0,
    totalArtifactBytes: 150,
    observedCadence: {
      kind: 'UNIFORM_FRAME_DURATIONS' as const,
      durationTicks: '1000',
    },
    verifiedBatches: [batchReceipt],
    verifiedBoundaryEvidence: [],
  };
  const verification = assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3({
    ...verificationMaterial,
    verificationSha256: hashEditronCanonicalJsonV1(verificationMaterial),
  });
  const complete = completeMediaSourcePtsCadenceMapAssetRecordV3({
    record: claimed,
    claimId: 'version-evidence-claim',
    verificationReceipt: verification,
    now: new Date('2026-08-30T00:05:00.000Z'),
  });
  const baseAsset = {
    assetId: sourceVersion.assetId,
    type: 'video' as const,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return {
    sourceVersion,
    qualification,
    pending,
    complete,
    baseAsset,
    completeAsset: {
      ...baseAsset,
      ...createMediaSourcePtsCadenceMapAssetStateV3({
        asset: baseAsset,
        record: complete,
      }),
    },
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
