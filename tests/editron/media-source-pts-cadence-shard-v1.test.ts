import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import type { MediaSourceTechnicalObservationV1 } from '@/lib/editron/services/media-source-probe-v1';
import {
  createMediaSourcePtsCadenceShardV1,
} from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceShardV1', () => {
  it('binds lossless large and negative presentation timestamps to one measured source', () => {
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion: sourceVersion(),
      qualification: qualification(),
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 3,
      firstFrameOrdinal: '900719925474099300',
      frames: [
        { presentationTimestampTicks: '-900719925474099300', durationTicks: '3003' },
        { presentationTimestampTicks: '-900719925474096297', durationTicks: '3003' },
      ],
    });

    expect(shard).toMatchObject({
      sourceVersionSha256: sourceVersion().sourceVersionSha256,
      storageVersionSha256: sourceVersion().storageVersion.storageVersionSha256,
      sourceBindingSha256: 'a'.repeat(64),
      technicalObservationSha256: qualification().observation!.observationSha256,
      sourceTimebase: { numerator: '1', denominator: '90000' },
      firstFrameOrdinal: '900719925474099300',
      frameCount: '2',
      startPresentationTimestampTicks: '-900719925474099300',
      endExclusivePresentationTimestampTicks: '-900719925474093294',
      localCadence: { kind: 'UNIFORM_LOCAL', durationTicks: '3003' },
    });
    expect(shard.shardSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(shard)).toBe(true);
  });

  it('records variable timing only as a local observation, even with matching stream rate labels', () => {
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion: sourceVersion(),
      qualification: qualification(),
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames: [
        { presentationTimestampTicks: '0', durationTicks: '3003' },
        { presentationTimestampTicks: '3003', durationTicks: '6006' },
      ],
    });

    expect(shard.localCadence).toEqual({ kind: 'VARIABLE_LOCAL' });
    expect(JSON.stringify(shard)).not.toContain('CFR');
    expect(JSON.stringify(shard)).not.toContain('VFR');
  });

  it.each([
    ['duplicate timestamp', [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '0', durationTicks: '3003' },
    ]],
    ['gap', [
      { presentationTimestampTicks: '0', durationTicks: '3003' },
      { presentationTimestampTicks: '6006', durationTicks: '3003' },
    ]],
    ['unknown duration', [
      { presentationTimestampTicks: '0', durationTicks: '0' },
    ]],
  ])('fails closed for a %s shard', (_label, frames) => {
    expect(() => createMediaSourcePtsCadenceShardV1({
      sourceVersion: sourceVersion(),
      qualification: qualification(),
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames,
    })).toThrow();
  });

  it('rejects a source version that was not measured with the supplied technical observation', () => {
    const mismatched = sourceVersion({ objectKey: 'media/other.mp4' });
    expect(() => createMediaSourcePtsCadenceShardV1({
      sourceVersion: mismatched,
      qualification: qualification(),
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames: [{ presentationTimestampTicks: '0', durationTicks: '3003' }],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_STORAGE_VERSION_MISMATCH');
  });

  it('rejects a tampered technical observation before deriving a shard', () => {
    const forged = qualification();
    forged.observation = {
      ...forged.observation!,
      videoStreams: [{
        ...forged.observation!.videoStreams[0]!,
        sourceTimebase: { numerator: '1', denominator: '1000' },
      }],
    };
    expect(() => createMediaSourcePtsCadenceShardV1({
      sourceVersion: sourceVersion(),
      qualification: forged,
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames: [{ presentationTimestampTicks: '0', durationTicks: '3003' }],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_OBSERVATION_HASH_MISMATCH');
  });

  it('rejects an unreduced selected source timebase', () => {
    const record = qualification({ timebase: { numerator: '2', denominator: '180000' } });
    expect(() => createMediaSourcePtsCadenceShardV1({
      sourceVersion: sourceVersion(),
      qualification: record,
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames: [{ presentationTimestampTicks: '0', durationTicks: '3003' }],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_TIMEBASE_NOT_REDUCED');
  });

  it('rejects hostile overlong timestamp text before BigInt parsing', () => {
    expect(() => createMediaSourcePtsCadenceShardV1({
      sourceVersion: sourceVersion(),
      qualification: qualification(),
      videoStreamIndex: 0,
      mapper: mapper(),
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames: [{
        presentationTimestampTicks: '1'.repeat(129),
        durationTicks: '3003',
      }],
    })).toThrow('MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_TIMESTAMP_INVALID');
  });

  it('changes the descriptor identity when mapper policy changes', () => {
    const base = {
      sourceVersion: sourceVersion(),
      qualification: qualification(),
      videoStreamIndex: 0,
      shardSequence: 0,
      firstFrameOrdinal: '0',
      frames: [{ presentationTimestampTicks: '0', durationTicks: '3003' }],
    } as const;
    const first = createMediaSourcePtsCadenceShardV1({ ...base, mapper: mapper() });
    const second = createMediaSourcePtsCadenceShardV1({
      ...base,
      mapper: { ...mapper(), commandPolicyVersion: 'frame-timing-policy-v2' },
    });

    expect(second.shardSha256).not.toBe(first.shardSha256);
  });
});

function sourceVersion(options: { objectKey?: string } = {}) {
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 12_345,
    contentSha256: 'b'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: options.objectKey ?? 'media/source.mp4' },
      byteLength: 12_345,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-1' },
    }),
  });
}

function qualification(options: { timebase?: { numerator: string; denominator: string } } = {}) {
  const observation = technicalObservation(options.timebase);
  return {
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
    storageVersion: sourceVersion().storageVersion,
    observation,
    diagnostic: null,
  } satisfies MediaSourceQualificationRecordV1;
}

function technicalObservation(
  timebase: { numerator: string; denominator: string } = { numerator: '1', denominator: '90000' },
): MediaSourceTechnicalObservationV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-7.1',
    formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
    durationMilliseconds: 12_345,
    startTimeMilliseconds: 0,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase: timebase,
      sourceStartPts: '-4500',
      sourceDurationTicks: '1111050',
      averageFrameRate: { numerator: '30000', denominator: '1001' },
      realFrameRate: { numerator: '30000', denominator: '1001' },
      frameCount: '370',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: '01:00:00;00',
      reelId: 'A001',
    }],
    audioStreams: [],
  };
  return {
    ...material,
    observationSha256: hashEditronCanonicalJsonV1(material),
  };
}

function mapper() {
  return {
    mapperVersion: 'media-pts-mapper-v1',
    ffprobeVersion: 'ffprobe-7.1',
    commandPolicyVersion: 'frame-timing-policy-v1',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
}
