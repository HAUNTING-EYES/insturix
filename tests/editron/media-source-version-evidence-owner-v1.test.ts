import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1,
  MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
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
  readMediaSourcePtsCadenceMapAssetStateV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  captureMediaSourceVersionEvidenceV1,
  mediaSourceVersionEvidenceAssetViewV1,
  persistMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourceVersionEvidenceOwnerV1', () => {
  it('captures and reloads a real terminal V3 root by immutable source version', () => {
    const fixture = evidenceFixture('a');
    const record = captureMediaSourceVersionEvidenceV1(fixture.completeAsset);

    expect(record).toMatchObject({
      kind: 'EDITRON_MEDIA_SOURCE_VERSION_EVIDENCE_RECORD_V1',
      sourceVersionV1: {
        assetId: 'asset-version-evidence',
        sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
      },
      sourcePtsCadenceMapV3: { status: 'COMPLETE' },
      sourceAudioArtifactsV1: null,
    });
    expect(assertMediaSourceVersionEvidenceRecordV1(record)).toEqual(record);
    const view = mediaSourceVersionEvidenceAssetViewV1(record);
    expect(readMediaSourcePtsCadenceMapAssetStateV3(view)).toMatchObject({
      sourcePtsCadenceMapV3: { status: 'COMPLETE' },
      sourcePtsCadenceMapStateSha256V3:
        record.sourcePtsCadenceMapStateSha256V3,
    });
  });

  it('rejects nonterminal, partial, and tampered evidence instead of dropping it', () => {
    const fixture = evidenceFixture('a');
    expect(() => captureMediaSourceVersionEvidenceV1(fixture.pendingAsset))
      .toThrow('MEDIA_SOURCE_VERSION_EVIDENCE_V3_NOT_TERMINAL');

    const record = captureMediaSourceVersionEvidenceV1(fixture.completeAsset);
    expect(() => assertMediaSourceVersionEvidenceRecordV1({
      ...record,
      evidenceSha256: hash('tampered-record'),
    })).toThrow('MEDIA_SOURCE_VERSION_EVIDENCE_HASH_MISMATCH');
    expect(() => assertMediaSourceVersionEvidenceRecordV1({
      ...record,
      sourcePtsCadenceMapStateSha256V3: null,
    })).toThrow('MEDIA_SOURCE_VERSION_EVIDENCE_ROOTS_INCOMPLETE');
    expect(() => assertMediaSourceVersionEvidenceRecordV1({
      ...record,
      sourceQualificationV1: {
        ...record.sourceQualificationV1,
        sourceBindingSha256: hash('wrong-binding'),
      },
    })).toThrow();
  });

  it('applies once, treats exact replay as unchanged, and rejects stale or raced writes', async () => {
    const candidate = captureMediaSourceVersionEvidenceV1(
      evidenceFixture('a').completeAsset,
    );
    const store = memoryStore();
    const applied = await persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: null,
      candidate,
    }, store.ports);
    expect(applied).toMatchObject({ disposition: 'APPLIED' });

    await expect(persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: candidate.evidenceSha256,
      candidate,
    }, store.ports)).resolves.toMatchObject({ disposition: 'UNCHANGED' });
    await expect(persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: hash('stale'),
      candidate,
    }, store.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH',
    });

    const raced = memoryStore(null, true);
    await expect(persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: null,
      candidate,
    }, raced.ports)).resolves.toEqual({ disposition: 'RACE_LOST' });
  });

  it('adds a verified audio root monotonically and rejects a conflicting V3 root', async () => {
    const first = evidenceFixture('a');
    const current = captureMediaSourceVersionEvidenceV1(first.completeAsset);
    const withAudio = captureMediaSourceVersionEvidenceV1({
      ...first.completeAsset,
      ...audioState(first),
    });
    const store = memoryStore(current);
    const merged = await persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: current.evidenceSha256,
      candidate: withAudio,
    }, store.ports);
    expect(merged).toMatchObject({
      disposition: 'APPLIED',
      record: {
        sourcePtsCadenceMapV3: { status: 'COMPLETE' },
        sourceAudioArtifactsV1: { records: [{ streamId: 'audio-0' }] },
      },
    });

    const conflicting = captureMediaSourceVersionEvidenceV1(
      evidenceFixture('b').completeAsset,
    );
    const conflictStore = memoryStore(current);
    await expect(persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: current.evidenceSha256,
      candidate: conflicting,
    }, conflictStore.ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'CONFLICTING_EVIDENCE',
    });
  });

  it('rejects a malformed current row without attempting a write', async () => {
    const candidate = captureMediaSourceVersionEvidenceV1(
      evidenceFixture('a').completeAsset,
    );
    const compareAndSet = vi.fn(async () => true);
    await expect(persistMediaSourceVersionEvidenceV1({
      expectedEvidenceSha256: null,
      candidate,
    }, {
      load: vi.fn(async () => ({ forged: true })),
      compareAndSet,
    })).resolves.toEqual({
      disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID',
    });
    expect(compareAndSet).not.toHaveBeenCalled();
  });
});

function evidenceFixture(mapTag: string) {
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
    audioStreams: [{
      streamIndex: 0,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '48000',
    }],
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
    observedCadence: { kind: 'UNIFORM_FRAME_DURATIONS' as const, durationTicks: '1000' },
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
    completeAsset: {
      ...baseAsset,
      ...createMediaSourcePtsCadenceMapAssetStateV3({
        asset: baseAsset,
        record: complete,
      }),
    },
    pendingAsset: {
      ...baseAsset,
      ...createMediaSourcePtsCadenceMapAssetStateV3({
        asset: baseAsset,
        record: pending,
      }),
    },
  };
}

function audioState(fixture: ReturnType<typeof evidenceFixture>) {
  const source = {
    assetId: fixture.sourceVersion.assetId,
    mediaKind: 'video' as const,
    sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
    storageVersionSha256:
      fixture.sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: fixture.qualification.sourceBindingSha256,
    technicalObservationSha256:
      fixture.qualification.observation.observationSha256,
  };
  const audioSampleEpochMapSha256 = hash('audio-map');
  const manifestSha256 = hash('audio-manifest');
  const recordMaterial = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_KIND_V1,
    source,
    audioStreamIndex: 0,
    streamId: 'audio-0',
    sampleRate: '48000',
    channelCount: 2,
    audioSampleEpochMapSha256,
    decodedPcmSha256: hash('decoded-pcm'),
    decodedSampleFrameCount: '48000',
    manifestSha256,
    manifestReference: {
      schemaVersion: 1 as const,
      storage: 'R2_PRIVATE' as const,
      artifactKind: 'MANIFEST' as const,
      objectKey: `private/editron/media-source-audio/v1/${source.sourceVersionSha256}/${audioSampleEpochMapSha256}/manifests/${manifestSha256}.json`,
      byteLength: 256,
      contentSha256: manifestSha256,
    },
    publishedAt: '2026-08-30T00:06:00.000Z',
  };
  const set = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_SET_KIND_V1,
    source,
    records: [{
      ...recordMaterial,
      recordSha256: hashEditronCanonicalJsonV1(recordMaterial),
    }],
  };
  return {
    sourceAudioArtifactsV1: set,
    sourceAudioArtifactsStateSha256V1: hashEditronCanonicalJsonV1(set),
  };
}

function memoryStore(
  initial: MediaSourceVersionEvidenceRecordV1 | null = null,
  forceRace = false,
) {
  let current = initial;
  const ports: MediaSourceVersionEvidenceStorePortsV1 = {
    load: vi.fn(async () => current),
    compareAndSet: vi.fn(async ({ expectedEvidenceSha256, next }) => {
      if (forceRace || (current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) {
        return false;
      }
      current = next;
      return true;
    }),
  };
  return { ports, current: () => current };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
