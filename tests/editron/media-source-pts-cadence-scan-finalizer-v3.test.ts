import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type {
  MediaSourcePtsCadenceBoundarySemanticVerifierV3,
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  persistMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
  type MediaSourcePtsCadenceMapAssetStorePortsV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import type { MediaSourcePtsCadenceR2EpochIndexWriterV3 }
  from '@/lib/editron/services/media-source-pts-cadence-r2-epoch-index-writer-v3';
import {
  prepareMediaSourcePtsCadenceScanFinalizationV3,
} from '@/lib/editron/services/media-source-pts-cadence-scan-finalizer-v3';
import {
  publishMediaSourcePtsCadenceScanV3,
  type MediaSourcePtsCadenceScanPublisherStateOwnerV3,
} from '@/lib/editron/services/media-source-pts-cadence-scan-publisher-v3';
import { MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import { createMediaSourcePtsCadenceScanRequestV1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
import { createMediaSourcePtsCadenceSourceCoverageV2 }
  from '@/lib/editron/services/media-source-pts-cadence-source-coverage-v2';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS cadence scan finalizer V3 preparation', () => {
  it('keeps contiguous variable-duration resource splits in one epoch', async () => {
    const fixture = finalizationFixture([
      [frame('0', '40'), frame('40', '60')],
      [frame('100', '40'), frame('140', '60')],
    ]);

    const result = await prepareMediaSourcePtsCadenceScanFinalizationV3(fixture.input);

    expect(result).toMatchObject({
      disposition: 'PREPARED',
      promotedBatchCount: 2,
      epochIndex: {
        index: {
          epochs: [{
            epoch: {
              epochId: 'direct-v3-epoch-0',
              boundaryKind: 'INITIAL',
              sourceStartPresentationTimestampTicks: '0',
              sourceEndExclusivePresentationTimestampTicks: '200',
              canonicalStartTime: { ticks: '0', timescale: '1' },
            },
            firstBatchSequence: 0,
            endExclusiveBatchSequence: 2,
          }],
          batches: [
            { epochId: 'direct-v3-epoch-0', batchSequence: 0 },
            { epochId: 'direct-v3-epoch-0', batchSequence: 1 },
          ],
        },
      },
    });
    expect(fixture.stagingReader.read).toHaveBeenCalledTimes(2);
    expect(fixture.artifactPort.writeImmutableFrameBatch).toHaveBeenCalledTimes(2);
    expect(fixture.lifecycle.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('derives reduced canonical starts for negative-PTS GAP and safe OVERLAP epochs', async () => {
    const fixture = finalizationFixture([
      [frame('-1000', '100'), frame('-900', '200')],
      [frame('-500', '100')],
      [frame('-450', '50')],
    ]);

    const first = await prepareMediaSourcePtsCadenceScanFinalizationV3(fixture.input);
    const replay = await prepareMediaSourcePtsCadenceScanFinalizationV3(fixture.input);

    expect(first.disposition).toBe('PREPARED');
    expect(replay.disposition).toBe('PREPARED');
    if (first.disposition !== 'PREPARED' || replay.disposition !== 'PREPARED') return;
    expect(first.epochIndex.index.epochs.map(({ epoch, boundary }) => ({
      id: epoch.epochId,
      kind: epoch.boundaryKind,
      source: [
        epoch.sourceStartPresentationTimestampTicks,
        epoch.sourceEndExclusivePresentationTimestampTicks,
      ],
      canonical: epoch.canonicalStartTime,
      basis: boundary.classificationBasis,
      externalEvidence: boundary.externalEvidence,
    }))).toEqual([
      {
        id: 'direct-v3-epoch-0', kind: 'INITIAL', source: ['-1000', '-700'],
        canonical: { ticks: '0', timescale: '1' },
        basis: 'FIRST_DECODED_PRESENTATION', externalEvidence: null,
      },
      {
        id: 'direct-v3-epoch-2', kind: 'GAP', source: ['-500', '-400'],
        canonical: { ticks: '1', timescale: '2' },
        basis: 'PTS_DELTA', externalEvidence: null,
      },
      {
        id: 'direct-v3-epoch-3', kind: 'OVERLAP', source: ['-450', '-400'],
        canonical: { ticks: '3', timescale: '5' },
        basis: 'PTS_DELTA', externalEvidence: null,
      },
    ]);
    expect(replay.epochIndex.canonicalJson).toBe(first.epochIndex.canonicalJson);
    expect(replay.epochIndexSidecar).toEqual(first.epochIndexSidecar);
    expect(JSON.stringify(first)).not.toContain('signed-source-secret');
  });

  it('re-proves frames and blocks a summary-admissible backward boundary', async () => {
    const fixture = finalizationFixture([
      [frame('0', '100'), frame('100', '100')],
      [frame('50', '25')],
    ]);

    await expect(prepareMediaSourcePtsCadenceScanFinalizationV3(fixture.input))
      .resolves.toEqual({
        disposition: 'UNVERIFIABLE',
        reason: 'BOUNDARY_EVIDENCE_REQUIRED',
        diagnostic: 'SCAN_BACKWARD_BOUNDARY_EVIDENCE_REQUIRED',
        promotedBatchCount: 2,
      });
    expect(fixture.stagingReader.read).toHaveBeenCalledTimes(2);
    expect(fixture.artifactPort.writeImmutableFrameBatch).toHaveBeenCalledTimes(2);
  });

  it('returns a bound upstream diagnostic without touching immutable storage', async () => {
    const fixture = finalizationFixture([[frame('0', '40')]]);
    const result = {
      ...fixture.input.result,
      status: 'UNVERIFIABLE' as const,
      diagnostic: 'SCAN_FFPROBE_FRAME_SCAN_FAILED',
    };

    await expect(prepareMediaSourcePtsCadenceScanFinalizationV3({
      ...fixture.input,
      result,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'SCAN_RESULT_UNVERIFIABLE',
      diagnostic: 'SCAN_FFPROBE_FRAME_SCAN_FAILED',
      promotedBatchCount: 0,
    });
    expect(fixture.stagingReader.read).not.toHaveBeenCalled();
    expect(fixture.artifactPort.writeImmutableFrameBatch).not.toHaveBeenCalled();
  });

  it('rejects result-scope forgery and propagates a transient staging outage', async () => {
    const forged = finalizationFixture([[frame('0', '40')]]);
    await expect(prepareMediaSourcePtsCadenceScanFinalizationV3({
      ...forged.input,
      result: { ...forged.input.result, ffprobeVersion: 'forged-ffprobe' },
    })).rejects.toThrow('MEDIA_SOURCE_PTS_SCAN_PROMOTION_RESULT_BINDING_MISMATCH');
    expect(forged.stagingReader.read).not.toHaveBeenCalled();

    const outage = finalizationFixture([[frame('0', '40')]]);
    outage.stagingReader.read.mockRejectedValueOnce(
      new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_READ_FAILED'),
    );
    await expect(prepareMediaSourcePtsCadenceScanFinalizationV3(outage.input))
      .rejects.toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_READ_FAILED');
    expect(outage.artifactPort.writeImmutableFrameBatch).not.toHaveBeenCalled();
  });
});

describe('media source PTS cadence scan publication V3', () => {
  it('writes, claims, renews, verifies, completes, and replays without false work', async () => {
    const fixture = finalizationFixture([
      [frame('0', '40'), frame('40', '60')],
      [frame('100', '40'), frame('140', '60')],
    ]);

    const first = await publishMediaSourcePtsCadenceScanV3(fixture.publicationInput);
    expect(first).toMatchObject({
      disposition: 'COMPLETED',
      state: {
        sourcePtsCadenceMapV3: {
          status: 'COMPLETE',
          attemptCount: 1,
          terminalReceipt: { disposition: 'PUBLISHED' },
          verificationReceipt: {
            disposition: 'EPOCH_ARTIFACT_SET_VERIFIED',
            verifiedBatchCount: 2,
            verifiedFrameCount: '4',
          },
        },
      },
    });
    expect(fixture.persistedStatuses).toEqual([
      'PENDING', 'VERIFYING', 'VERIFYING', 'COMPLETE',
    ]);
    expect(fixture.epochIndexWriter.writeImmutableEpochIndex).toHaveBeenCalledTimes(1);
    expect(fixture.lifecycle.nextClaimExpiresAt).toHaveBeenCalledTimes(5);

    const replay = await publishMediaSourcePtsCadenceScanV3(fixture.publicationInput);
    expect(replay).toMatchObject({ disposition: 'ALREADY_COMPLETE' });
    expect(fixture.epochIndexWriter.writeImmutableEpochIndex).toHaveBeenCalledTimes(1);
    expect(fixture.stateOwner.persist).toHaveBeenCalledTimes(4);
  });

  it('keeps transient artifact reads retryable and blocks a foreign claimant', async () => {
    const fixture = finalizationFixture([[frame('0', '40')]]);
    fixture.controls.failNextArtifactRead = true;

    const retryable = await publishMediaSourcePtsCadenceScanV3(fixture.publicationInput);
    expect(retryable).toMatchObject({
      disposition: 'RETRYABLE',
      reason: 'EPOCH_INDEX_READ_FAILED',
      state: { sourcePtsCadenceMapV3: { status: 'VERIFYING', attemptCount: 1 } },
    });
    expect(fixture.asset.sourcePtsCadenceMapV3).toMatchObject({
      status: 'VERIFYING',
      terminalReceipt: null,
    });

    const busy = await publishMediaSourcePtsCadenceScanV3({
      ...fixture.publicationInput,
      claimId: 'foreign-publication-claim',
    });
    expect(busy).toEqual({
      disposition: 'BUSY',
      activeClaimId: 'direct-v3-publication-claim',
    });
    expect(fixture.asset.sourcePtsCadenceMapV3).toMatchObject({ status: 'VERIFYING' });
  });

  it('terminalizes deterministic stored-batch corruption without reporting success', async () => {
    const fixture = finalizationFixture([[frame('0', '40'), frame('40', '60')]]);
    fixture.controls.tamperFrameBatchReads = true;

    const result = await publishMediaSourcePtsCadenceScanV3(fixture.publicationInput);
    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'BATCH_BYTE_LENGTH_MISMATCH',
      state: {
        sourcePtsCadenceMapV3: {
          status: 'UNVERIFIABLE',
          verificationReceipt: null,
          terminalReceipt: { disposition: 'UNVERIFIABLE' },
        },
      },
    });
    expect(fixture.persistedStatuses.at(-1)).toBe('UNVERIFIABLE');
  });

  it('keeps a post-read lifecycle heartbeat outage retryable', async () => {
    const fixture = finalizationFixture([[frame('0', '40')]]);
    fixture.controls.failHeartbeatAfterArtifactRead = true;

    const result = await publishMediaSourcePtsCadenceScanV3(fixture.publicationInput);
    expect(result).toMatchObject({
      disposition: 'RETRYABLE',
      reason: 'LIFECYCLE_HEARTBEAT_FAILED',
      state: { sourcePtsCadenceMapV3: { status: 'VERIFYING' } },
    });
    expect(fixture.asset.sourcePtsCadenceMapV3).toMatchObject({
      status: 'VERIFYING',
      terminalReceipt: null,
    });
  });

  it('leaves state untouched when the immutable index write is unavailable', async () => {
    const fixture = finalizationFixture([[frame('0', '40')]]);
    fixture.epochIndexWriter.writeImmutableEpochIndex.mockRejectedValueOnce(
      new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_WRITE_FAILED'),
    );

    await expect(publishMediaSourcePtsCadenceScanV3(fixture.publicationInput))
      .resolves.toEqual({
        disposition: 'RETRYABLE',
        reason: 'EPOCH_INDEX_WRITE_FAILED',
        state: null,
      });
    expect(fixture.asset.sourcePtsCadenceMapV3).toBeUndefined();
    expect(fixture.stateOwner.persist).not.toHaveBeenCalled();
  });

  it('does not create an index or state for an ambiguous backward boundary', async () => {
    const fixture = finalizationFixture([
      [frame('0', '100'), frame('100', '100')],
      [frame('50', '25')],
    ]);

    await expect(publishMediaSourcePtsCadenceScanV3(fixture.publicationInput))
      .resolves.toEqual({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'SCAN_BACKWARD_BOUNDARY_EVIDENCE_REQUIRED',
        state: null,
      });
    expect(fixture.epochIndexWriter.writeImmutableEpochIndex).not.toHaveBeenCalled();
    expect(fixture.stateOwner.load).not.toHaveBeenCalled();
    expect(fixture.stateOwner.persist).not.toHaveBeenCalled();
  });

  it('blocks a valid scan summary that does not cover the qualified source tail', async () => {
    const fixture = finalizationFixture(
      [[frame('0', '40'), frame('40', '60')]],
      { qualifiedTailTicks: '40' },
    );

    await expect(publishMediaSourcePtsCadenceScanV3(fixture.publicationInput))
      .resolves.toEqual({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'SOURCE_PRESENTATION_COVERAGE_INCOMPLETE',
        state: null,
      });
    expect(fixture.stagingReader.read).not.toHaveBeenCalled();
    expect(fixture.epochIndexWriter.writeImmutableEpochIndex).not.toHaveBeenCalled();
    expect(fixture.stateOwner.load).not.toHaveBeenCalled();
    expect(fixture.stateOwner.persist).not.toHaveBeenCalled();
  });
});

type ScanFrame = Readonly<{
  presentationTimestampTicks: string;
  durationTicks: string;
}>;

function frame(
  presentationTimestampTicks: string,
  durationTicks: string,
): ScanFrame {
  return { presentationTimestampTicks, durationTicks };
}

function finalizationFixture(
  runs: readonly (readonly ScanFrame[])[],
  options: Readonly<{ qualifiedTailTicks?: string }> = {},
) {
  const sourceTimebase = { numerator: '1', denominator: '1000' } as const;
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/v3-source.mov' },
    byteLength: 123_456,
    providerVersion: { kind: 'R2_ETAG', value: 'v3-source-etag' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-v3' },
    assetId: 'asset-v3',
    mediaKind: 'video',
    byteLength: 123_456,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const allFrames = runs.flat();
  const firstPts = BigInt(allFrames[0]!.presentationTimestampTicks);
  const lastFrame = allFrames.at(-1)!;
  const lastEnd = BigInt(lastFrame.presentationTimestampTicks)
    + BigInt(lastFrame.durationTicks);
  const qualification = qualificationFixture({
    storageVersion,
    sourceStartPts: firstPts.toString(),
    sourceDurationTicks: (
      lastEnd - firstPts + BigInt(options.qualifiedTailTicks ?? '0')
    ).toString(),
    frameCount: String(allFrames.length),
    sourceTimebase,
  });
  const mapper = {
    mapperVersion: 'epoch-ffprobe-v3',
    ffprobeVersion: 'ffprobe version 8.1',
    commandPolicyVersion: 'epoch-ffprobe-v3',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const request = createMediaSourcePtsCadenceScanRequestV1({
    mapBinding: {
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1',
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      storageVersionSha256: storageVersion.storageVersionSha256,
      sourceBindingSha256: qualification.sourceBindingSha256,
      technicalObservationSha256: qualification.observation!.observationSha256,
      videoStreamIndex: 0,
      sourceTimebase,
      mapper,
    },
    resourcePolicy: {
      policyVersion: mapper.commandPolicyVersion,
      maxCanonicalJsonBytes: 65_536,
      maxFrameRecords: 100,
    },
    sourceUrl: 'https://tenant.r2.cloudflarestorage.com/source.mov?signed-source-secret',
  });
  const expectedCoverage = createMediaSourcePtsCadenceSourceCoverageV2({
    sourceVersion,
    qualification,
    videoStreamIndex: 0,
    mapper,
    coveragePolicyVersion: 'direct-v3-source-coverage-policy-v1',
  });

  let firstFrameOrdinal = BigInt(0);
  let previousBatchContentSha256: string | null = null;
  const staging = runs.map((frames, shardSequence) => {
    const serialization = serializeMediaSourcePtsCadenceScanStagingBatchV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
      mapBindingSha256: request.mapBindingSha256,
      resourcePolicy: request.resourcePolicy,
      sourceTimebase,
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      shardSequence,
      firstFrameOrdinal: firstFrameOrdinal.toString(),
      previousBatchContentSha256,
      frames,
    });
    firstFrameOrdinal += BigInt(frames.length);
    previousBatchContentSha256 = serialization.contentSha256;
    return serialization;
  });
  const batches = staging.map((serialization) => {
    const frames = serialization.batch.frames;
    const last = frames.at(-1)!;
    return {
      shardSequence: serialization.batch.shardSequence,
      firstFrameOrdinal: serialization.batch.firstFrameOrdinal,
      frameCount: String(frames.length),
      startPresentationTimestampTicks: frames[0]!.presentationTimestampTicks,
      endExclusivePresentationTimestampTicks: (
        BigInt(last.presentationTimestampTicks) + BigInt(last.durationTicks)
      ).toString(),
      previousBatchContentSha256: serialization.batch.previousBatchContentSha256,
      sidecar: createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization }),
    };
  });
  const result = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE' as const,
    diagnostic: null,
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    ffprobeVersion: mapper.ffprobeVersion,
    videoStreamIndex: 0,
    sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
    batches,
    totalFrameCount: firstFrameOrdinal.toString(),
    sourceStartPresentationTimestampTicks: batches[0]!.startPresentationTimestampTicks,
    sourceEndExclusivePresentationTimestampTicks:
      batches.at(-1)!.endExclusivePresentationTimestampTicks,
  };
  const stored = new Map(staging.map((serialization) => [
    createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization }).objectKey,
    serialization.batch,
  ]));
  const stagingReader = {
    read: vi.fn(async (sidecar) => {
      const batch = stored.get(sidecar.objectKey);
      if (!batch) throw new Error('MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_READ_FAILED');
      return batch;
    }),
  };
  const descriptorPort = {
    writeImmutableShard: vi.fn(async ({ expected }) => expected),
    writeImmutableManifest: vi.fn(async ({ expected }) => expected),
  };
  type StoredArtifact = Readonly<{
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>;
  const artifacts = new Map<string, StoredArtifact>();
  const frameBatchKeys = new Set<string>();
  const artifactPort = {
    writeImmutableFrameBatch: vi.fn(async ({ serialization, expected }) => {
      artifacts.set(expected.objectKey, {
        canonicalJson: serialization.canonicalJson,
        byteLength: serialization.byteLength,
        contentSha256: serialization.contentSha256,
      });
      frameBatchKeys.add(expected.objectKey);
      return expected;
    }),
    writeImmutableManifestIndex: vi.fn(async ({ expected }) => expected),
    read: vi.fn(async (sidecar) => {
      const object = artifacts.get(sidecar.objectKey);
      if (!object) throw new Error('TEST_ARTIFACT_NOT_FOUND');
      return object;
    }),
  };
  const epochIndexWriter = {
    writeImmutableEpochIndex: vi.fn(async ({ serialization, expected }) => {
      artifacts.set(expected.objectKey, {
        canonicalJson: serialization.canonicalJson,
        byteLength: serialization.byteLength,
        contentSha256: serialization.contentSha256,
      });
      return expected;
    }),
  } satisfies MediaSourcePtsCadenceR2EpochIndexWriterV3;
  const controls = {
    failNextArtifactRead: false,
    tamperFrameBatchReads: false,
    failHeartbeatAfterArtifactRead: false,
    failNextHeartbeat: false,
  };
  const epochArtifactReader = {
    read: vi.fn(async (sidecar) => {
      if (controls.failNextArtifactRead) {
        controls.failNextArtifactRead = false;
        throw new Error('TEST_TRANSIENT_ARTIFACT_READ_FAILED');
      }
      const object = artifacts.get(sidecar.objectKey);
      if (!object) throw new Error('TEST_ARTIFACT_NOT_FOUND');
      if (controls.failHeartbeatAfterArtifactRead) {
        controls.failHeartbeatAfterArtifactRead = false;
        controls.failNextHeartbeat = true;
      }
      return controls.tamperFrameBatchReads && frameBatchKeys.has(sidecar.objectKey)
        ? { ...object, canonicalJson: `${object.canonicalJson} ` }
        : object;
    }),
  } satisfies MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  const boundarySemanticVerifier = {
    verify: vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'TEST_UNEXPECTED_EXTERNAL_BOUNDARY_EVIDENCE',
    })),
  } satisfies MediaSourcePtsCadenceBoundarySemanticVerifierV3;
  const asset: MediaSourcePtsCadenceMapAssetStateInputV3 = {
    assetId: 'asset-v3',
    type: 'video',
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  const persistedStatuses: string[] = [];
  const statePorts: MediaSourcePtsCadenceMapAssetStorePortsV3 = {
    load: vi.fn(async () => asset),
    replace: vi.fn(async ({ expectedState, nextState }) => {
      if ((asset.sourcePtsCadenceMapStateSha256V3 ?? null)
        !== (expectedState?.sourcePtsCadenceMapStateSha256V3 ?? null)) return false;
      Object.assign(asset, nextState, {
        sourcePtsCadenceMapV1: null,
        sourcePtsCadenceMapStateSha256V1: null,
        sourcePtsCadenceMapV2: null,
        sourcePtsCadenceMapStateSha256V2: null,
      });
      persistedStatuses.push(nextState.sourcePtsCadenceMapV3.status);
      return true;
    }),
  };
  const stateOwner = {
    load: vi.fn((assetId: string, userId: string) => statePorts.load(assetId, userId)),
    persist: vi.fn((stateInput) => persistMediaSourcePtsCadenceMapAssetStateV3(
      stateInput,
      statePorts,
    )),
  } satisfies MediaSourcePtsCadenceScanPublisherStateOwnerV3;
  let claimExpiryCall = 0;
  const lifecycle = {
    heartbeat: vi.fn(async () => {
      if (controls.failNextHeartbeat) {
        controls.failNextHeartbeat = false;
        throw new Error('TEST_LIFECYCLE_HEARTBEAT_FAILED');
      }
    }),
    nextClaimExpiresAt: vi.fn(() => {
      claimExpiryCall += 1;
      return new Date(claimExpiryCall === 1
        ? '2026-08-30T00:10:00.000Z'
        : '2026-08-30T00:20:00.000Z');
    }),
  };
  const verificationPolicy = {
    policyVersion: 'direct-v3-verification-policy-v1',
    maxBatchReads: 100,
    maxBoundaryEvidenceReads: 100,
    maxTotalArtifactBytes: 10_000_000,
    boundaryEvidenceRegistryVersion: 'direct-v3-boundary-registry-v1',
  };
  const preparationInput = {
    request,
    result,
    sourceVersion,
    qualification,
    epochIndexResourcePolicy: {
      policyVersion: 'direct-v3-epoch-index-policy-v1',
      maxCanonicalJsonBytes: 1_000_000,
      maxEpochEntries: 100,
      maxBatchEntries: 100,
    },
    stagingReader,
    descriptorPort,
    artifactPort,
    lifecycle,
  };
  return {
    stagingReader,
    descriptorPort,
    artifactPort,
    epochIndexWriter,
    stateOwner,
    asset,
    persistedStatuses,
    controls,
    lifecycle,
    input: preparationInput,
    publicationInput: {
      ...preparationInput,
      assetId: 'asset-v3',
      userId: 'user-v3',
      claimId: 'direct-v3-publication-claim',
      now: () => new Date('2026-08-30T00:01:00.000Z'),
      expectedCoverage,
      verificationPolicy,
      epochIndexWriter,
      epochArtifactReader,
      boundarySemanticVerifier,
      stateOwner,
    },
  };
}

function qualificationFixture(input: {
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>;
  sourceStartPts: string;
  sourceDurationTicks: string;
  frameCount: string;
  sourceTimebase: Readonly<{ numerator: string; denominator: string }>;
}): MediaSourceQualificationRecordV1 {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'EDITRON_MEDIA_SOURCE_PROBE_V1; ffprobe version 8.1',
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: input.sourceTimebase,
      sourceStartPts: input.sourceStartPts,
      sourceDurationTicks: input.sourceDurationTicks,
      averageFrameRate: { numerator: '25', denominator: '1' },
      realFrameRate: { numerator: '25', denominator: '1' },
      frameCount: input.frameCount,
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
    assetId: 'asset-v3',
    locator: { provider: 'R2', objectKey: 'media/v3-source.mov' },
    sourceBindingSha256: 'b'.repeat(64),
    requestId: 'media-source-probe:v3-fixture',
    attemptCount: 1,
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
    storageVersion: input.storageVersion,
    observation: {
      ...observation,
      observationSha256: hashEditronCanonicalJsonV1(observation),
    },
    diagnostic: null,
  };
}
