import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { promoteMediaSourcePtsCadenceScanBatchV1 } from '@/lib/editron/services/media-source-pts-cadence-scan-promoter-v1';
import { MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1 } from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import { createMediaSourcePtsCadenceScanRequestV1 } from '@/lib/editron/services/media-source-pts-cadence-scan-transport-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS scan promoter V1', () => {
  it('rebuilds source-bound V2 artifacts and splits only at measured frame boundaries', async () => {
    const fixture = promotionFixture(100, true);
    const result = await promoteMediaSourcePtsCadenceScanBatchV1(fixture.input);

    expect(result.batches.length).toBeGreaterThan(1);
    expect(result.nextFrameOrdinal).toBe('100');
    expect(result.nextShardSequence).toBe(result.batches.length);
    expect(fixture.artifactPort.writeImmutableFrameBatch)
      .toHaveBeenCalledTimes(result.batches.length);
    expect(fixture.descriptorPort.writeImmutableShard)
      .toHaveBeenCalledTimes(result.batches.length);
    expect(result.batches.map((batch) => batch.serialization.payload.shard.shardSequence))
      .toEqual(result.batches.map((_, index) => index));
    expect(result.batches.at(-1)!.serialization.payload.shard.endExclusivePresentationTimestampTicks)
      .toBe(String(100 * 3003));
  });

  it('rejects staging bytes that disagree with the signed result summary before promotion writes', async () => {
    const fixture = promotionFixture(4);
    fixture.stagingReader.read.mockResolvedValueOnce({
      ...fixture.staging.batch,
      firstFrameOrdinal: '1',
    });

    await expect(promoteMediaSourcePtsCadenceScanBatchV1(fixture.input))
      .rejects.toThrow('MEDIA_SOURCE_PTS_SCAN_PROMOTION_STAGING_MISMATCH');
    expect(fixture.artifactPort.writeImmutableFrameBatch).not.toHaveBeenCalled();
    expect(fixture.descriptorPort.writeImmutableShard).not.toHaveBeenCalled();
  });

  it('does not promote a scan under a different qualified source binding or ordinal', async () => {
    const binding = promotionFixture(4);
    await expect(promoteMediaSourcePtsCadenceScanBatchV1({
      ...binding.input,
      qualification: { ...binding.qualification, sourceBindingSha256: 'd'.repeat(64) },
    })).rejects.toThrow('MEDIA_SOURCE_PTS_SCAN_PROMOTION_SOURCE_BINDING_MISMATCH');

    const ordinal = promotionFixture(4);
    await expect(promoteMediaSourcePtsCadenceScanBatchV1({
      ...ordinal.input,
      nextFrameOrdinal: '1',
    })).rejects.toThrow('MEDIA_SOURCE_PTS_SCAN_PROMOTION_ORDINAL_MISMATCH');
  });
});

function promotionFixture(frameCount: number, forceSplit = false) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    byteLength: 123_456,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1', mediaKind: 'video', byteLength: 123_456,
    contentSha256: 'b'.repeat(64), storageVersion,
  });
  const qualification = qualificationFixture(storageVersion, frameCount);
  const mapper = {
    mapperVersion: 'continuous-ffprobe-v1',
    ffprobeVersion: 'ffprobe version 8.1',
    commandPolicyVersion: 'continuous-ffprobe-v1',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const frames = Array.from({ length: frameCount }, (_, index) => ({
    presentationTimestampTicks: String(index * 3003),
    durationTicks: '3003',
  }));
  const mapBinding = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1' as const,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation!.observationSha256,
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    mapper,
  };
  const provisional = createMediaSourcePtsCadenceScanRequestV1({
    mapBinding,
    resourcePolicy: {
      policyVersion: mapper.commandPolicyVersion,
      maxCanonicalJsonBytes: 65_536,
      maxFrameRecords: Math.max(100, frameCount),
    },
    sourceUrl: 'https://tenant.r2.cloudflarestorage.com/source.mov?signature=secret',
  });
  const provisionalStaging = stagingFixture(provisional, frames);
  const request = forceSplit ? createMediaSourcePtsCadenceScanRequestV1({
    mapBinding,
    resourcePolicy: {
      ...provisional.resourcePolicy,
      maxCanonicalJsonBytes: provisionalStaging.byteLength + 256,
    },
    sourceUrl: provisional.source_url,
  }) : provisional;
  const staging = stagingFixture(request, frames);
  const sidecar = createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization: staging });
  const result = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE' as const,
    diagnostic: null,
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    ffprobeVersion: mapper.ffprobeVersion,
    videoStreamIndex: 0,
    sourceTimebase: request.mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
    batches: [{
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frameCount: String(frameCount),
      startPresentationTimestampTicks: '0',
      endExclusivePresentationTimestampTicks: String(frameCount * 3003),
      previousBatchContentSha256: null,
      sidecar,
    }],
    totalFrameCount: String(frameCount),
    sourceStartPresentationTimestampTicks: '0',
    sourceEndExclusivePresentationTimestampTicks: String(frameCount * 3003),
  };
  const stagingReader = { read: vi.fn(async () => staging.batch) };
  const descriptorPort = {
    writeImmutableShard: vi.fn(async ({ expected }) => expected),
    writeImmutableManifest: vi.fn(async ({ expected }) => expected),
  };
  const artifactPort = {
    writeImmutableFrameBatch: vi.fn(async ({ expected }) => expected),
    writeImmutableManifestIndex: vi.fn(async ({ expected }) => expected),
    read: vi.fn(async () => { throw new Error('TEST_UNUSED'); }),
  };
  return {
    qualification,
    staging,
    stagingReader,
    descriptorPort,
    artifactPort,
    input: {
      request,
      result,
      scanBatchIndex: 0,
      nextShardSequence: 0,
      nextFrameOrdinal: '0',
      sourceVersion,
      qualification,
      stagingReader,
      descriptorPort,
      artifactPort,
    },
  };
}

function stagingFixture(
  request: ReturnType<typeof createMediaSourcePtsCadenceScanRequestV1>,
  frames: readonly { presentationTimestampTicks: string; durationTicks: string }[],
) {
  return serializeMediaSourcePtsCadenceScanStagingBatchV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
    mapBindingSha256: request.mapBindingSha256,
    resourcePolicy: request.resourcePolicy,
    sourceTimebase: request.mapBinding.sourceTimebase,
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    shardSequence: 0,
    firstFrameOrdinal: '0',
    previousBatchContentSha256: null,
    frames,
  });
}

function qualificationFixture(
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
  frameCount: number,
): MediaSourceQualificationRecordV1 {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'EDITRON_MEDIA_SOURCE_PROBE_V1; ffprobe version 8.1',
    formatName: 'mov', durationMilliseconds: 10_000, startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0, codec: 'h264', codedWidth: 1920, codedHeight: 1080,
      pixelFormat: 'yuv420p', sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0', sourceDurationTicks: String(frameCount * 3003),
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' }, frameCount: String(frameCount),
      colorSpace: 'bt709', colorTransfer: 'bt709', colorPrimaries: 'bt709', colorRange: 'tv',
      timecode: null, reelId: null,
    }],
    audioStreams: [],
  };
  return {
    schemaVersion: 1, kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL', assetId: 'asset-1',
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    sourceBindingSha256: 'c'.repeat(64), requestId: 'media-source-probe:fixture',
    attemptCount: 1, requestedAt: '2026-08-25T00:00:00.000Z',
    startedAt: '2026-08-25T00:00:01.000Z', completedAt: '2026-08-25T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}
