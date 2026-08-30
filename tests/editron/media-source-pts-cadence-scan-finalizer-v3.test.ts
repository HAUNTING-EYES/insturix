import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  prepareMediaSourcePtsCadenceScanFinalizationV3,
} from '@/lib/editron/services/media-source-pts-cadence-scan-finalizer-v3';
import { MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import { createMediaSourcePtsCadenceScanRequestV1 }
  from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
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

function finalizationFixture(runs: readonly (readonly ScanFrame[])[]) {
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
    sourceDurationTicks: (lastEnd - firstPts).toString(),
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
  const artifactPort = {
    writeImmutableFrameBatch: vi.fn(async ({ expected }) => expected),
    writeImmutableManifestIndex: vi.fn(async ({ expected }) => expected),
    read: vi.fn(async () => { throw new Error('TEST_UNUSED'); }),
  };
  const lifecycle = { heartbeat: vi.fn(async () => undefined) };
  return {
    stagingReader,
    descriptorPort,
    artifactPort,
    lifecycle,
    input: {
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
