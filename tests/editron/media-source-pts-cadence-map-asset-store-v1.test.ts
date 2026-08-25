import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  mediaSourcePtsCadenceMapAssetCompareAndSetFilterV1,
  persistMediaSourcePtsCadenceMapAssetStateV1,
  type MediaSourcePtsCadenceMapAssetStorePortsV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-store-v1';
import {
  claimMediaSourcePtsCadenceMapV1,
  createMediaSourcePtsCadenceMapRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceShardV1 } from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourcePtsCadenceMapAssetStoreV1', () => {
  it('writes a fresh source-bound map with an absent expected state', async () => {
    const value = fixture();
    const memory = inMemory(value.asset);

    const result = await persistMediaSourcePtsCadenceMapAssetStateV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedStateSha256: null,
      nextRecord: value.record,
    }, memory.ports);

    expect(result).toMatchObject({ disposition: 'APPLIED' });
    expect(memory.replace).toHaveBeenCalledTimes(1);
    expect(memory.asset.sourcePtsCadenceMapStateSha256V1).toBe(
      (result as Extract<typeof result, { disposition: 'APPLIED' }>).state.sourcePtsCadenceMapStateSha256V1,
    );
    const filter = mediaSourcePtsCadenceMapAssetCompareAndSetFilterV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedState: null,
      nextState: (result as Extract<typeof result, { disposition: 'APPLIED' }>).state,
    });
    expect(filter).toMatchObject({
      assetId: 'asset-1',
      type: 'video',
      'sourceVersionV1.sourceVersionSha256': value.record.sourceVersionSha256,
      'sourceQualificationV1.observation.observationSha256': value.record.technicalObservationSha256,
    });
    expect(filter.$or).toEqual(expect.any(Array));
  });

  it('rejects stale expectations and malformed persisted state without attempting a write', async () => {
    const value = fixture();
    const stale = inMemory(value.asset);
    await expect(persistMediaSourcePtsCadenceMapAssetStateV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedStateSha256: 'f'.repeat(64),
      nextRecord: value.record,
    }, stale.ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'EXPECTED_STATE_MISMATCH',
    });
    expect(stale.replace).not.toHaveBeenCalled();

    const tampered = inMemory({
      ...value.asset,
      sourcePtsCadenceMapV1: value.record,
      sourcePtsCadenceMapStateSha256V1: 'e'.repeat(64),
    });
    await expect(persistMediaSourcePtsCadenceMapAssetStateV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedStateSha256: null,
      nextRecord: value.record,
    }, tampered.ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'CURRENT_STATE_INVALID',
    });
    expect(tampered.replace).not.toHaveBeenCalled();
  });

  it('carries an exact prior state hash through a claimed lifecycle transition', async () => {
    const value = fixture();
    const memory = inMemory(value.asset);
    const initial = await persistMediaSourcePtsCadenceMapAssetStateV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedStateSha256: null,
      nextRecord: value.record,
    }, memory.ports);
    if (initial.disposition !== 'APPLIED') throw new Error('TEST_INITIAL_MAP_WRITE_FAILED');
    const claimed = claimMediaSourcePtsCadenceMapV1({
      record: value.record,
      claimId: 'cadence_claim_0001',
      now: new Date('2026-08-25T12:01:00.000Z'),
      expiresAt: new Date('2026-08-25T12:02:00.000Z'),
    });

    const result = await persistMediaSourcePtsCadenceMapAssetStateV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedStateSha256: initial.state.sourcePtsCadenceMapStateSha256V1,
      nextRecord: claimed,
    }, memory.ports);

    expect(result).toMatchObject({ disposition: 'APPLIED' });
    expect(memory.replace).toHaveBeenCalledTimes(2);
    const update = memory.replace.mock.calls[1][0];
    if (!update.expectedState) throw new Error('TEST_EXPECTED_STATE_MISSING');
    expect(update.expectedState.sourcePtsCadenceMapStateSha256V1).toBe(
      initial.state.sourcePtsCadenceMapStateSha256V1,
    );
    expect(update.nextState.sourcePtsCadenceMapV1.activeClaim).toMatchObject({
      claimId: 'cadence_claim_0001',
    });
  });

  it('reports a compare-and-set race rather than overwriting a concurrent state', async () => {
    const value = fixture();
    const memory = inMemory(value.asset, false);

    await expect(persistMediaSourcePtsCadenceMapAssetStateV1({
      assetId: 'asset-1',
      userId: 'user-1',
      expectedStateSha256: null,
      nextRecord: value.record,
    }, memory.ports)).resolves.toEqual({ disposition: 'RACE_LOST' });
  });
});

function inMemory(asset: Record<string, unknown>, replaceResult = true) {
  const memory = { asset: { ...asset } };
  const replace = vi.fn(async (input: Parameters<MediaSourcePtsCadenceMapAssetStorePortsV1['replace']>[0]) => {
    if (!replaceResult) return false;
    const currentHash = memory.asset.sourcePtsCadenceMapStateSha256V1 ?? null;
    if (currentHash !== (input.expectedState?.sourcePtsCadenceMapStateSha256V1 ?? null)) return false;
    Object.assign(memory.asset, input.nextState);
    return true;
  });
  return {
    asset: memory.asset,
    replace,
    ports: {
      load: vi.fn(async () => memory.asset),
      replace,
    } satisfies MediaSourcePtsCadenceMapAssetStorePortsV1,
  };
}

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
