import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaSourcePtsCadenceScanResultV1,
  MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanBatchSidecarV1,
  parseMediaSourcePtsCadenceScanStagingBatchV1,
  serializeMediaSourcePtsCadenceScanStagingBatchV1,
} from '@/lib/editron/services/media-source-pts-cadence-scan-staging-v1';

describe('media source PTS cadence scan staging V1', () => {
  it('shares the exact map-binding identity used by the Python scanner', () => {
    expect(hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_V1',
      sourceVersionSha256: '1'.repeat(64),
      storageVersionSha256: '2'.repeat(64),
      sourceBindingSha256: '3'.repeat(64),
      technicalObservationSha256: '4'.repeat(64),
      videoStreamIndex: 0,
      sourceTimebase: { numerator: '1', denominator: '90000' },
      mapper: {
        mapperVersion: 'continuous-ffprobe-v1',
        ffprobeVersion: 'ffprobe version 8.1',
        commandPolicyVersion: 'continuous-ffprobe-v1',
        timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      },
    })).toBe('1f7c9f18a590f05683e9bad42069a45367f78fed1e5feafc630733e40a7acc92');
  });

  it('round-trips canonical frame evidence and derives a private content-addressed sidecar', () => {
    const serialization = batchFixture();
    const sidecar = createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization });

    expect(parseMediaSourcePtsCadenceScanStagingBatchV1(serialization.canonicalJson))
      .toEqual(serialization.batch);
    // Shared with the Python scanner suite: a mismatch blocks cross-runtime staging.
    expect(serialization.contentSha256)
      .toBe('f64f8ba465edb897feaf31f4a7d504ff03332403c57547616c17ceac46a32ad3');
    expect(sidecar).toMatchObject({
      storage: 'R2_PRIVATE',
      byteLength: serialization.byteLength,
      contentSha256: serialization.contentSha256,
    });
    expect(sidecar.objectKey).toBe(
      `private/editron/media-source-pts-scan/v1/${'a'.repeat(64)}/batches/0/${serialization.contentSha256}.json`,
    );
  });

  it('accepts only a contiguous complete result with an exact hash chain', () => {
    const first = batchFixture();
    const second = batchFixture({
      shardSequence: 1,
      firstFrameOrdinal: '2',
      previousBatchContentSha256: first.contentSha256,
      frames: [
        { presentationTimestampTicks: '6006', durationTicks: '3003' },
        { presentationTimestampTicks: '9009', durationTicks: '3003' },
      ],
    });
    const result = resultFixture([first, second]);

    expect(assertMediaSourcePtsCadenceScanResultV1(result)).toMatchObject({
      status: 'COMPLETE',
      totalFrameCount: '4',
      sourceStartPresentationTimestampTicks: '0',
      sourceEndExclusivePresentationTimestampTicks: '12012',
    });

    const brokenChain = structuredClone(result);
    brokenChain.batches[1]!.previousBatchContentSha256 = 'f'.repeat(64);
    expect(() => assertMediaSourcePtsCadenceScanResultV1(brokenChain))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_HASH_CHAIN_INVALID');

    const gap = structuredClone(result);
    gap.batches[1]!.startPresentationTimestampTicks = '7000';
    expect(() => assertMediaSourcePtsCadenceScanResultV1(gap))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_CONTINUITY_INVALID');
  });

  it('fails closed for noncanonical bytes, missing durations, forged keys and false completion', () => {
    const serialization = batchFixture();
    expect(() => parseMediaSourcePtsCadenceScanStagingBatchV1(`${serialization.canonicalJson} `))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_BATCH_JSON_NON_CANONICAL');

    const missingDuration = JSON.parse(serialization.canonicalJson) as Record<string, unknown>;
    (missingDuration.frames as Record<string, unknown>[])[0]!.durationTicks = null;
    expect(() => serializeMediaSourcePtsCadenceScanStagingBatchV1(missingDuration as never))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_FRAME_DURATION_INVALID');

    const result = resultFixture([serialization]);
    result.batches[0]!.sidecar.objectKey = 'private/editron/media-source-pts-scan/v1/forged.json';
    expect(() => assertMediaSourcePtsCadenceScanResultV1(result))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_SIDECAR_INVALID');

    const empty = resultFixture([]);
    expect(() => assertMediaSourcePtsCadenceScanResultV1(empty))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_SCAN_COMPLETE_RESULT_INVALID');
  });
});

function batchFixture(overrides: Partial<Parameters<typeof serializeMediaSourcePtsCadenceScanStagingBatchV1>[0]> = {}) {
  return serializeMediaSourcePtsCadenceScanStagingBatchV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SCAN_STAGING_BATCH_V1',
    mapBindingSha256: 'a'.repeat(64),
    resourcePolicy: {
      policyVersion: 'continuous-ffprobe-v1',
      maxCanonicalJsonBytes: 65_536,
      maxFrameRecords: 100,
    },
    sourceTimebase: { numerator: '1', denominator: '90000' },
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    shardSequence: 0,
    firstFrameOrdinal: '0',
    previousBatchContentSha256: null,
    frames: [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '3003', durationTicks: '3003' },
    ],
    ...overrides,
  });
}

function resultFixture(batches: readonly ReturnType<typeof batchFixture>[]) {
  const entries = batches.map((batch) => ({
    shardSequence: batch.batch.shardSequence,
    firstFrameOrdinal: batch.batch.firstFrameOrdinal,
    frameCount: String(batch.batch.frames.length),
    startPresentationTimestampTicks: batch.batch.frames[0]!.presentationTimestampTicks,
    endExclusivePresentationTimestampTicks: String(
      BigInt(batch.batch.frames.at(-1)!.presentationTimestampTicks)
      + BigInt(batch.batch.frames.at(-1)!.durationTicks),
    ),
    previousBatchContentSha256: batch.batch.previousBatchContentSha256,
    sidecar: { ...createMediaSourcePtsCadenceScanBatchSidecarV1({ serialization: batch }) },
  }));
  return {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SCAN_RESULT_KIND_V1,
    status: 'COMPLETE' as const,
    diagnostic: null,
    mapBindingSha256: 'a'.repeat(64),
    resourcePolicy: {
      policyVersion: 'continuous-ffprobe-v1',
      maxCanonicalJsonBytes: 65_536,
      maxFrameRecords: 100,
    },
    ffprobeVersion: 'ffprobe version 8.1',
    videoStreamIndex: 0,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
    batches: entries,
    totalFrameCount: entries.reduce(
      (sum, entry) => sum + BigInt(entry.frameCount), BigInt(0),
    ).toString(),
    sourceStartPresentationTimestampTicks: entries[0]?.startPresentationTimestampTicks ?? null,
    sourceEndExclusivePresentationTimestampTicks: entries.at(-1)?.endExclusivePresentationTimestampTicks ?? null,
  };
}
