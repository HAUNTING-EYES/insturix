import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaSourceAudioArtifactAssetRecordV1,
  createMediaSourceAudioArtifactAssetRecordV1,
  createMediaSourceAudioArtifactAssetStateV1,
  mediaSourceAudioArtifactAssetCompareAndSetFilterV1,
  persistMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  serializeMediaSourceAudioSampleEpochMapV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import {
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  type MediaSourceAudioPrivateArtifactPolicyV1,
} from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import type { MediaSourceQualificationRecordV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source audio artifact asset owner V1', () => {
  it('applies sorted multi-stream state and treats identical publication retries as idempotent', async () => {
    const fixture = sourceFixture('primary');
    const streamTwo = artifactFixture(fixture, 2, 20);
    const streamOne = artifactFixture(fixture, 1, 10);
    let storedAsset = fixture.asset;
    let replaceCalls = 0;
    const ports: MediaSourceAudioArtifactAssetStorePortsV1 = {
      load: async () => storedAsset,
      replace: async ({ nextState }) => {
        replaceCalls += 1;
        storedAsset = { ...storedAsset, ...nextState };
        return true;
      },
    };

    const first = await persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: null,
      ...streamTwo,
      publishedAt: new Date('2026-08-29T01:00:00.000Z'),
    }, ports);
    expect(first.disposition).toBe('APPLIED');
    if (first.disposition !== 'APPLIED') throw new Error('TEST_FIRST_WRITE_FAILED');
    expect(first.state.sourceAudioArtifactsV1.records.map(({ audioStreamIndex }) => (
      audioStreamIndex
    ))).toEqual([2]);

    const retry = await persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: first.state.sourceAudioArtifactsStateSha256V1,
      ...streamTwo,
      publishedAt: new Date('2026-08-29T02:00:00.000Z'),
    }, ports);
    expect(retry).toEqual({ disposition: 'UNCHANGED', state: first.state });
    expect(replaceCalls).toBe(1);

    const second = await persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: first.state.sourceAudioArtifactsStateSha256V1,
      ...streamOne,
      publishedAt: new Date('2026-08-29T03:00:00.000Z'),
    }, ports);
    expect(second.disposition).toBe('APPLIED');
    if (second.disposition !== 'APPLIED') throw new Error('TEST_SECOND_WRITE_FAILED');
    expect(second.state.sourceAudioArtifactsV1.records.map(({ audioStreamIndex }) => (
      audioStreamIndex
    ))).toEqual([1, 2]);
    expect(replaceCalls).toBe(2);
  });

  it('rejects wrong-source, stale, conflicting, corrupt, and raced writes', async () => {
    const fixture = sourceFixture('primary');
    const artifact = artifactFixture(fixture, 1, 10);
    let storedAsset = fixture.asset;
    let allowReplace = true;
    const ports: MediaSourceAudioArtifactAssetStorePortsV1 = {
      load: async () => storedAsset,
      replace: async ({ nextState }) => {
        if (!allowReplace) return false;
        storedAsset = { ...storedAsset, ...nextState };
        return true;
      },
    };

    await expect(persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: '0'.repeat(64),
      ...artifact,
      publishedAt: new Date('2026-08-29T01:00:00.000Z'),
    }, ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH',
    });

    const otherArtifact = artifactFixture(sourceFixture('other'), 1, 10);
    await expect(persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: null,
      ...otherArtifact,
      publishedAt: new Date('2026-08-29T01:00:00.000Z'),
    }, ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'ARTIFACT_INVALID',
    });

    const applied = await persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: null,
      ...artifact,
      publishedAt: new Date('2026-08-29T01:00:00.000Z'),
    }, ports);
    expect(applied.disposition).toBe('APPLIED');
    if (applied.disposition !== 'APPLIED') throw new Error('TEST_APPLY_FAILED');

    const conflicting = artifactFixture(fixture, 1, 99);
    await expect(persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: applied.state.sourceAudioArtifactsStateSha256V1,
      ...conflicting,
      publishedAt: new Date('2026-08-29T02:00:00.000Z'),
    }, ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'CONFLICTING_STREAM_ARTIFACT',
    });

    storedAsset = {
      ...storedAsset,
      sourceAudioArtifactsStateSha256V1: 'f'.repeat(64),
    };
    await expect(persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: applied.state.sourceAudioArtifactsStateSha256V1,
      ...artifact,
      publishedAt: new Date('2026-08-29T02:00:00.000Z'),
    }, ports)).resolves.toEqual({
      disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID',
    });

    storedAsset = fixture.asset;
    allowReplace = false;
    await expect(persistMediaSourceAudioArtifactAssetStateV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedStateSha256: null,
      ...artifact,
      publishedAt: new Date('2026-08-29T03:00:00.000Z'),
    }, ports)).resolves.toEqual({ disposition: 'RACE_LOST' });
  });

  it('builds exact absent/existing CAS predicates and rejects record tampering', () => {
    const fixture = sourceFixture('filter');
    const artifact = artifactFixture(fixture, 1, 10);
    const record = createRecord(fixture, artifact);
    const state = createMediaSourceAudioArtifactAssetStateV1({
      asset: fixture.asset,
      records: [record],
    });
    const absentFilter = mediaSourceAudioArtifactAssetCompareAndSetFilterV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedState: null,
      nextState: state,
    });
    expect(absentFilter.$and).toEqual([
      { $or: [{ sourceAudioArtifactsV1: { $exists: false } }, { sourceAudioArtifactsV1: null }] },
      {
        $or: [
          { sourceAudioArtifactsStateSha256V1: { $exists: false } },
          { sourceAudioArtifactsStateSha256V1: null },
        ],
      },
    ]);
    const existingFilter = mediaSourceAudioArtifactAssetCompareAndSetFilterV1({
      assetId: fixture.sourceVersion.assetId,
      userId: 'user-1',
      expectedState: state,
      nextState: state,
    });
    expect(existingFilter.$and).toBeUndefined();
    expect(existingFilter.sourceAudioArtifactsStateSha256V1)
      .toBe(state.sourceAudioArtifactsStateSha256V1);
    expect(() => assertMediaSourceAudioArtifactAssetRecordV1({
      ...record,
      decodedPcmSha256: '0'.repeat(64),
    })).toThrow('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_RECORD_BINDING_INVALID');
    expect(() => createMediaSourceAudioArtifactAssetStateV1({
      asset: fixture.asset,
      records: [record, record],
    })).toThrow('MEDIA_SOURCE_AUDIO_ARTIFACT_ASSET_STREAM_DUPLICATE');
  });
});

function createRecord(
  fixture: ReturnType<typeof sourceFixture>,
  artifact: ReturnType<typeof artifactFixture>,
) {
  return createMediaSourceAudioArtifactAssetRecordV1({
    asset: fixture.asset,
    ...artifact,
    publishedAt: new Date('2026-08-29T01:00:00.000Z'),
  });
}

function artifactFixture(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
  pcmSeed: number,
) {
  const pcm = Uint8Array.from({ length: 80 }, (_, index) => (index + pcmSeed) % 256);
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion: fixture.sourceVersion,
    qualification: fixture.qualification,
    audioStreamIndex,
  });
  const map = createMediaSourceAudioSampleEpochMapV1({
    binding,
    toolchain: {
      adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
      ffmpegVersion: 'ffmpeg-8.1',
      ffprobeVersion: 'ffprobe-8.1',
    },
    resourcePolicy: {
      policyVersion: 'asset-owner-test-v1',
      maxSourceBytes: 1_000,
      maxCanonicalJsonBytes: 100_000,
      maxDecodedFrameEntries: 10,
      maxEpochEntries: 10,
      maxDecodedSampleFrames: 100,
      maxDecodedPcmBytes: 1_000,
      timeoutMs: 1_000,
    },
    frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '10' }],
    pcm: { decodedByteLength: pcm.byteLength, decodedPcmSha256: digest(pcm) },
  });
  const policy: MediaSourceAudioPrivateArtifactPolicyV1 = {
    policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
    maxChunkBytes: 32,
    maxChunkCount: 10,
    maxManifestBytes: 100_000,
    maxReadBytes: 100_000,
  };
  const mapSerialization = serializeMediaSourceAudioSampleEpochMapV1(map);
  const epochMapArtifact = createMediaSourceAudioEpochMapArtifactReferenceV1({
    serialization: mapSerialization,
  });
  const pcmChunks = createMediaSourceAudioPcmChunkPlanV1({ map, policy }).map((entry) => (
    createMediaSourceAudioPcmChunkReferenceV1({
      map,
      planEntry: entry,
      contentSha256: digest(pcm.subarray(
        Number(BigInt(entry.startSampleFrame) * BigInt(8)),
        Number(BigInt(entry.endExclusiveSampleFrame) * BigInt(8)),
      )),
    })
  ));
  const manifestSerialization = serializeMediaSourceAudioPrivateArtifactManifestV1(
    createMediaSourceAudioPrivateArtifactManifestV1({
      map,
      epochMapArtifact,
      pcmChunks,
      policy,
    }),
  );
  return { mapSerialization, manifestSerialization };
}

function sourceFixture(tag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `tests/${tag}.mov` },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: `asset-${tag}`,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: digest(Buffer.from(`source-${tag}`)),
    storageVersion,
  });
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'mov',
    durationMilliseconds: 1,
    startTimeMilliseconds: 0,
    videoStreams: [],
    audioStreams: [1, 2].map((streamIndex) => ({
      streamIndex,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '10',
    })),
  };
  const qualification: MediaSourceQualificationRecordV1 = {
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1',
    status: 'MEASURED_TECHNICAL',
    assetId: sourceVersion.assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: digest(Buffer.from(`binding-${tag}`)),
    requestId: `request-${tag}`,
    attemptCount: 1,
    requestedAt: '2026-08-29T00:00:00.000Z',
    startedAt: '2026-08-29T00:00:01.000Z',
    completedAt: '2026-08-29T00:00:02.000Z',
    storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
    diagnostic: null,
  };
  const asset: MediaSourceAudioArtifactAssetStateInputV1 = {
    assetId: sourceVersion.assetId,
    type: 'video',
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  return { asset, qualification, sourceVersion };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
