import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canonicalizeEditronJsonV1, hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_RECORDS_V2,
  parseMediaSourcePtsCadenceFrameBatchV2,
  serializeMediaSourcePtsCadenceFrameBatchV2,
} from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import { createMediaSourcePtsCadenceMapRecordV1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

const FRAMES = [
  { presentationTimestampTicks: '0', durationTicks: '3003' },
  { presentationTimestampTicks: '3003', durationTicks: '3003' },
] as const;

describe('MediaSourcePtsCadenceFrameBatchV2', () => {
  it('retains, canonicalizes, and decodes the exact frame timing behind a shard descriptor', () => {
    const { shard, mapBindingSha256 } = fixture();
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: policy(),
      shard,
      frames: FRAMES,
    });

    expect(serialization.payload.frames).toEqual(FRAMES);
    expect(serialization.payload.shard.frameEvidenceSha256).toBe(hashEditronCanonicalJsonV1({
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SHARD_V1',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
      frames: FRAMES,
    }));
    expect(serialization.contentSha256).toBe(createHash('sha256').update(serialization.canonicalJson, 'utf8').digest('hex'));
    expect(parseMediaSourcePtsCadenceFrameBatchV2(serialization.canonicalJson)).toEqual(serialization.payload);
    expect(Object.isFrozen(parseMediaSourcePtsCadenceFrameBatchV2(serialization.canonicalJson))).toBe(true);
  });

  it('rejects a descriptor whose retained frames no longer match its evidence, range, or declared resource policy', () => {
    const { shard, mapBindingSha256 } = fixture();

    expect(() => serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: policy(),
      shard,
      frames: [
        { presentationTimestampTicks: '0', durationTicks: '3003' },
        { presentationTimestampTicks: '3003', durationTicks: '3004' },
      ],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_DESCRIPTOR_END_MISMATCH');
    expect(() => serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: { ...policy(), maxFrameRecords: 1 },
      shard,
      frames: FRAMES,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_FRAME_COUNT_INVALID');
    expect(() => serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: {
        ...policy(),
        maxFrameRecords: MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_RECORDS_V2 + 1,
      },
      shard,
      frames: FRAMES,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_RECORDS_INVALID');
  });

  it('rejects noncanonical, forged-binding, and policy-unbound stored payloads', () => {
    const { shard, mapBindingSha256 } = fixture();
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: policy(),
      shard,
      frames: FRAMES,
    });

    expect(() => parseMediaSourcePtsCadenceFrameBatchV2(` ${serialization.canonicalJson}`))
      .toThrow('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_JSON_NON_CANONICAL');
    expect(() => parseMediaSourcePtsCadenceFrameBatchV2(canonicalizeEditronJsonV1({
      ...serialization.payload,
      mapBindingSha256: '0'.repeat(64),
    }))).toThrow('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_BINDING_MISMATCH');
    expect(() => parseMediaSourcePtsCadenceFrameBatchV2(canonicalizeEditronJsonV1({
      ...serialization.payload,
      resourcePolicy: { ...policy(), policyVersion: 'other-policy' },
    }))).toThrow('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_BINDING_MISMATCH');
  });
});

function fixture() {
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'media/source.mp4' },
      byteLength: 12_345,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
    }),
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-7.1',
    formatName: 'mov',
    durationMilliseconds: 12_345,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '1111050',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '370',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification: {
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
      status: 'MEASURED_TECHNICAL',
      assetId: 'asset-1',
      locator: { provider: 'R2', objectKey: 'media/source.mp4' },
      sourceBindingSha256: 'a'.repeat(64),
      requestId: 'media-source-probe:fixture',
      attemptCount: 1,
      requestedAt: '2026-08-25T00:00:00.000Z',
      startedAt: '2026-08-25T00:00:01.000Z',
      completedAt: '2026-08-25T00:00:02.000Z',
      storageVersion: sourceVersion.storageVersion,
      observation: {
        ...observationMaterial,
        observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
      },
      diagnostic: null,
    },
    videoStreamIndex: 0,
    mapper: {
      mapperVersion: 'media-pts-mapper-v2',
      ffprobeVersion: 'ffprobe-8.1',
      commandPolicyVersion: 'policy-v2',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: FRAMES,
  });
  const record = createMediaSourcePtsCadenceMapRecordV1({
    bootstrapShard: shard,
    now: new Date('2026-08-25T12:00:00.000Z'),
  });
  return { shard, mapBindingSha256: record.mapBindingSha256 };
}

function policy() {
  return {
    policyVersion: 'policy-v2',
    maxCanonicalJsonBytes: 16_384,
    maxFrameRecords: 100,
  };
}
