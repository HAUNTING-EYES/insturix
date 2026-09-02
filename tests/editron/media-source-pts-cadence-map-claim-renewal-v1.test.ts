import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  renewMediaSourcePtsCadenceMapClaimV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-claim-renewal-v1';
import {
  claimMediaSourcePtsCadenceMapV1,
  createMediaSourcePtsCadenceMapRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 }
  from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('media source PTS cadence claim renewal V1', () => {
  it('extends only the active claimant without incrementing the mapping attempt', () => {
    const record = activeRecord();
    const renewed = renewMediaSourcePtsCadenceMapClaimV1({
      record,
      claimId: 'cadence-job-a',
      now: new Date('2026-08-25T00:04:00.000Z'),
      expiresAt: new Date('2026-08-25T00:10:00.000Z'),
    });

    expect(renewed.attemptCount).toBe(record.attemptCount);
    expect(renewed.activeClaim).toEqual({
      claimId: 'cadence-job-a',
      claimedAt: '2026-08-25T00:00:00.000Z',
      expiresAt: '2026-08-25T00:10:00.000Z',
    });
    expect(renewMediaSourcePtsCadenceMapClaimV1({
      record: renewed,
      claimId: 'cadence-job-a',
      now: new Date('2026-08-25T00:05:00.000Z'),
      expiresAt: new Date('2026-08-25T00:09:00.000Z'),
    })).toStrictEqual(renewed);
  });

  it('rejects foreign and expired claim renewal', () => {
    const record = activeRecord();
    expect(() => renewMediaSourcePtsCadenceMapClaimV1({
      record,
      claimId: 'foreign-job',
      now: new Date('2026-08-25T00:04:00.000Z'),
      expiresAt: new Date('2026-08-25T00:10:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_CLAIM_NOT_ACTIVE');
    expect(() => renewMediaSourcePtsCadenceMapClaimV1({
      record,
      claimId: 'cadence-job-a',
      now: new Date('2026-08-25T00:05:00.000Z'),
      expiresAt: new Date('2026-08-25T00:10:00.000Z'),
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_CLAIM_NOT_ACTIVE');
  });
});

function activeRecord() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/source.mov' },
    byteLength: 10,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-a' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: 10,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 1,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1,
      codedHeight: 1,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '1000' },
      sourceStartPts: '0',
      sourceDurationTicks: '1',
      averageFrameRate: { numerator: '1', denominator: '1' },
      realFrameRate: { numerator: '1', denominator: '1' },
      frameCount: '1',
      colorSpace: null,
      colorTransfer: null,
      colorPrimaries: null,
      colorRange: null,
      timecode: null,
      reelId: null,
    }],
    audioStreams: [],
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: 'asset-a',
    locator: storageVersion.locator,
    sourceBindingSha256: 'b'.repeat(64),
    requestId: 'qualification-a',
    attemptCount: 1,
    requestedAt: '2026-08-24T23:59:00.000Z',
    startedAt: '2026-08-24T23:59:01.000Z',
    completedAt: '2026-08-24T23:59:02.000Z',
    storageVersion,
    observation: {
      ...observation,
      observationSha256: hashEditronCanonicalJsonV1(observation),
    },
    diagnostic: null,
  };
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion,
    qualification,
    videoStreamIndex: 0,
    mapper: {
      mapperVersion: 'mapper-a',
      ffprobeVersion: 'ffprobe-8.1',
      commandPolicyVersion: 'policy-a',
      timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
    },
    shardSequence: 0,
    firstFrameOrdinal: '0',
    frames: [{ presentationTimestampTicks: '0', durationTicks: '1' }],
  });
  return claimMediaSourcePtsCadenceMapV1({
    record: createMediaSourcePtsCadenceMapRecordV1({
      bootstrapShard: shard,
      now: new Date('2026-08-24T23:59:00.000Z'),
    }),
    claimId: 'cadence-job-a',
    now: new Date('2026-08-25T00:00:00.000Z'),
    expiresAt: new Date('2026-08-25T00:05:00.000Z'),
  });
}
