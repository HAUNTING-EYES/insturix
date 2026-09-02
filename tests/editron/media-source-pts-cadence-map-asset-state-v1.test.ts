import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourcePtsCadenceMapAssetStateV1,
  readMediaSourcePtsCadenceMapAssetStateV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-state-v1';
import { createMediaSourcePtsCadenceMapRecordV1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceMapAssetStateV1', () => {
  it('stores only a map bound to the current video source and qualification', () => {
    const value = fixture();
    const state = createMediaSourcePtsCadenceMapAssetStateV1({
      asset: value.asset,
      record: value.record,
    });

    expect(readMediaSourcePtsCadenceMapAssetStateV1({
      ...value.asset,
      ...state,
    })).toEqual(state);
    expect(state.sourcePtsCadenceMapStateSha256V1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed for a changed source, qualification evidence, partial state, or altered hash', () => {
    const value = fixture();
    const state = createMediaSourcePtsCadenceMapAssetStateV1({
      asset: value.asset,
      record: value.record,
    });
    const changedSource = createMediaSourceVersionV1({
      owner: { kind: 'USER', userId: 'user-1' },
      assetId: 'asset-1',
      mediaKind: 'video',
      byteLength: 99,
      contentSha256: 'd'.repeat(64),
      storageVersion: createMediaSourceStorageVersionV1({
        locator: { provider: 'R2', objectKey: 'media/replaced.mov' },
        byteLength: 99,
        providerVersion: { kind: 'R2_ETAG', value: 'etag-replaced' },
      }),
    });

    expect(() => createMediaSourcePtsCadenceMapAssetStateV1({
      asset: { ...value.asset, sourceVersionV1: changedSource },
      record: value.record,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_SOURCE_VERSION_MISMATCH');
    expect(() => readMediaSourcePtsCadenceMapAssetStateV1({
      ...value.asset,
      sourcePtsCadenceMapV1: state.sourcePtsCadenceMapV1,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_INCOMPLETE');
    expect(() => readMediaSourcePtsCadenceMapAssetStateV1({
      ...value.asset,
      ...state,
      sourcePtsCadenceMapStateSha256V1: 'f'.repeat(64),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_HASH_MISMATCH');
    expect(() => createMediaSourcePtsCadenceMapAssetStateV1({
      asset: {
        ...value.asset,
        sourceQualificationV1: {
          ...value.asset.sourceQualificationV1,
          observation: { ...(value.asset.sourceQualificationV1 as MediaSourceQualificationRecordV1).observation, observationSha256: 'e'.repeat(64) },
        },
      },
      record: value.record,
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_QUALIFICATION_MISMATCH');
  });

  it('keeps an absent map explicitly absent', () => {
    const value = fixture();
    expect(readMediaSourcePtsCadenceMapAssetStateV1(value.asset)).toBeNull();
  });
});

function fixture() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    byteLength: 12_345,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion,
  });
  const technicalObservation = {
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
  const qualification = {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-1',
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    sourceBindingSha256: 'a'.repeat(64),
    requestId: 'media-source-probe:fixture',
    attemptCount: 1,
    requestedAt: '2026-08-25T00:00:00.000Z',
    startedAt: '2026-08-25T00:00:01.000Z',
    completedAt: '2026-08-25T00:00:02.000Z',
    storageVersion,
    observation: {
      ...technicalObservation,
      observationSha256: hashEditronCanonicalJsonV1(technicalObservation),
    },
    diagnostic: null,
  } satisfies MediaSourceQualificationRecordV1;
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification,
    videoStreamIndex: 0,
    mapper: {
      mapperVersion: 'media-pts-mapper-v1',
      ffprobeVersion: 'ffprobe-7.1',
      commandPolicyVersion: 'policy-v1',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '3003', durationTicks: '3003' },
    ],
  });
  return {
    record: createMediaSourcePtsCadenceMapRecordV1({
      bootstrapShard: shard,
      now: new Date('2026-08-25T12:00:00.000Z'),
    }),
    asset: {
      assetId: 'asset-1',
      type: 'video',
      sourceVersionV1: sourceVersion,
      sourceQualificationV1: qualification,
    },
  };
}
