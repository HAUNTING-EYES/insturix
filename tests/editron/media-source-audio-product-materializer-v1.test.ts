import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourceAudioArtifactAssetRecordV1,
  createMediaSourceAudioArtifactAssetStateV1,
  readMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import {
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
} from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import {
  materializeMediaSourceAudioProductV1,
  MediaSourceAudioProductMaterializationErrorV1,
  type MediaSourceAudioProductMaterializationPortsV1,
} from '@/lib/editron/services/media-source-audio-product-materializer-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  serializeMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioSampleEpochResourcePolicyV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import type { MediaSourceQualificationRecordV1 }
  from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from '@/lib/editron/services/media-source-version-evidence-owner-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('MediaSourceAudioProductMaterializerV1', () => {
  it('materializes every observed stream in canonical order and proves the terminal root', async () => {
    const fixture = sourceFixture('complete', [9, 4]);
    const active = activeStore(fixture.asset);
    const evidence = evidenceStore();
    const materializeStream = materializer(fixture);

    const receipt = await materializeMediaSourceAudioProductV1(
      productInput(fixture),
      productPorts(active.ports, evidence.ports, materializeStream),
    );

    expect(receipt).toMatchObject({
      disposition: 'COMPLETED',
      observedAudioStreamIndexes: [4, 9],
      materializedAudioStreamIndexes: [4, 9],
      audioArtifactStateSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceVersionEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(materializeStream.mock.calls.map(([input]) => input.audioStreamIndex))
      .toEqual([4, 9]);
    expect(readMediaSourceAudioArtifactAssetStateV1(active.current())
      ?.sourceAudioArtifactsV1.records.map(
      ({ audioStreamIndex }) => audioStreamIndex,
    )).toEqual([4, 9]);
    expect(evidence.current()?.sourceAudioArtifactsV1?.records.map(
      ({ audioStreamIndex }) => audioStreamIndex,
    )).toEqual([4, 9]);
  });

  it('resumes a validated partial set without rematerializing completed streams', async () => {
    const fixture = sourceFixture('resume', [4, 9]);
    const partial = createMediaSourceAudioArtifactAssetStateV1({
      asset: fixture.asset,
      records: [record(fixture, 4)],
    });
    const active = activeStore({ ...fixture.asset, ...partial });
    const evidence = evidenceStore();
    const materializeStream = materializer(fixture);

    const receipt = await materializeMediaSourceAudioProductV1(
      productInput(fixture),
      productPorts(active.ports, evidence.ports, materializeStream),
    );

    expect(receipt.materializedAudioStreamIndexes).toEqual([9]);
    expect(materializeStream).toHaveBeenCalledTimes(1);
    expect(materializeStream.mock.calls[0]?.[0].audioStreamIndex).toBe(9);
    expect(evidence.current()?.sourceAudioArtifactsStateSha256V1)
      .toBe(receipt.audioArtifactStateSha256);
  });

  it('requires explicit migration evidence for a historically complete active set', async () => {
    const fixture = sourceFixture('historical', [4]);
    const complete = createMediaSourceAudioArtifactAssetStateV1({
      asset: fixture.asset,
      records: [record(fixture, 4)],
    });
    const active = activeStore({ ...fixture.asset, ...complete });
    const materializeStream = materializer(fixture);

    const error = await materializeMediaSourceAudioProductV1(
      productInput(fixture),
      productPorts(active.ports, evidenceStore().ports, materializeStream),
    ).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(MediaSourceAudioProductMaterializationErrorV1);
    expect(error).toMatchObject({
      reason: 'HISTORICAL_EVIDENCE_REQUIRED', retryable: false,
    });
    expect(materializeStream).not.toHaveBeenCalled();
  });

  it('reuses a complete historical root without decoding the streams again', async () => {
    const fixture = sourceFixture('already-complete', [4]);
    const complete = createMediaSourceAudioArtifactAssetStateV1({
      asset: fixture.asset,
      records: [record(fixture, 4)],
    });
    const completeAsset = { ...fixture.asset, ...complete };
    const active = activeStore(completeAsset);
    const evidence = evidenceStore(captureMediaSourceVersionEvidenceV1(completeAsset));
    const materializeStream = materializer(fixture);

    const receipt = await materializeMediaSourceAudioProductV1(
      productInput(fixture),
      productPorts(active.ports, evidence.ports, materializeStream),
    );

    expect(receipt).toMatchObject({
      disposition: 'ALREADY_COMPLETE',
      observedAudioStreamIndexes: [4],
      materializedAudioStreamIndexes: [],
    });
    expect(materializeStream).not.toHaveBeenCalled();
    expect(active.replace).not.toHaveBeenCalled();
  });

  it('blocks an audio-less observation pending its separate no-audio proof owner', async () => {
    const fixture = sourceFixture('silent', []);
    const active = activeStore(fixture.asset);
    const materializeStream = materializer(fixture);

    const error = await materializeMediaSourceAudioProductV1(
      productInput(fixture),
      productPorts(active.ports, evidenceStore().ports, materializeStream),
    ).catch((value: unknown) => value);

    expect(error).toMatchObject({
      reason: 'NO_AUDIO_PROOF_REQUIRED', retryable: false,
    });
    expect(materializeStream).not.toHaveBeenCalled();
    expect(active.replace).not.toHaveBeenCalled();
  });

  it('classifies a private-store outage as retryable without changing active state', async () => {
    const fixture = sourceFixture('outage', [4]);
    const active = activeStore(fixture.asset);
    const materializeStream = vi.fn((async () => {
      throw new Error('MEDIA_SOURCE_AUDIO_R2_WRITE_FAILED');
    }) satisfies MaterializeStreamV1);

    const error = await materializeMediaSourceAudioProductV1(
      productInput(fixture),
      productPorts(active.ports, evidenceStore().ports, materializeStream),
    ).catch((value: unknown) => value);

    expect(error).toMatchObject({
      reason: 'STREAM_MATERIALIZATION_FAILED',
      retryable: true,
      diagnosticCode: 'MEDIA_SOURCE_AUDIO_R2_WRITE_FAILED',
    });
    expect(active.replace).not.toHaveBeenCalled();
  });
});

function productInput(fixture: ReturnType<typeof sourceFixture>) {
  return {
    assetId: fixture.sourceVersion.assetId,
    userId: 'user-product-audio',
    resourcePolicy: resourcePolicy(),
    publishedAt: new Date('2026-08-30T13:00:00.000Z'),
  };
}

function productPorts(
  assetStorePorts: MediaSourceAudioArtifactAssetStorePortsV1,
  evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1,
  materializeStream: MaterializeStreamV1,
): MediaSourceAudioProductMaterializationPortsV1 {
  return {
    assetStorePorts,
    evidenceStorePorts,
    artifactWriter: {
      writeArtifactSetFromPcmStream: vi.fn(async () => {
        throw new Error('TEST_UNEXPECTED_REAL_ARTIFACT_WRITE');
      }),
    },
    createSourceLease: vi.fn(() => ({
      open: vi.fn(async () => {
        throw new Error('TEST_UNEXPECTED_REAL_SOURCE_LEASE');
      }),
    })),
    materializeStream,
  };
}

function materializer(fixture: ReturnType<typeof sourceFixture>) {
  return vi.fn((async ({ audioStreamIndex }) => (
    artifact(fixture, audioStreamIndex)
  )) satisfies MaterializeStreamV1);
}

type MaterializeStreamV1 = NonNullable<
  MediaSourceAudioProductMaterializationPortsV1['materializeStream']
>;

function activeStore(initial: MediaSourceAudioArtifactAssetStateInputV1) {
  let asset = initial;
  const load = vi.fn(async () => asset);
  const replace = vi.fn(async ({ nextState }: Parameters<
    MediaSourceAudioArtifactAssetStorePortsV1['replace']
  >[0]) => {
    asset = { ...asset, ...nextState };
    return true;
  });
  return {
    ports: { load, replace } satisfies MediaSourceAudioArtifactAssetStorePortsV1,
    replace,
    current: () => asset,
  };
}

function evidenceStore(
  initial: MediaSourceVersionEvidenceRecordV1 | null = null,
) {
  let current = initial;
  const load = vi.fn(async () => current);
  const compareAndSet = vi.fn(async ({
    expectedEvidenceSha256,
    next,
  }: Parameters<MediaSourceVersionEvidenceStorePortsV1['compareAndSet']>[0]) => {
    if ((current?.evidenceSha256 ?? null) !== expectedEvidenceSha256) return false;
    current = next;
    return true;
  });
  return {
    ports: { load, compareAndSet } satisfies MediaSourceVersionEvidenceStorePortsV1,
    current: () => current,
  };
}

function record(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
) {
  return createMediaSourceAudioArtifactAssetRecordV1({
    asset: fixture.asset,
    ...artifact(fixture, audioStreamIndex),
    publishedAt: new Date('2026-08-30T13:00:00.000Z'),
  });
}

function artifact(
  fixture: ReturnType<typeof sourceFixture>,
  audioStreamIndex: number,
) {
  const pcm = Uint8Array.from(
    { length: 80 },
    (_, index) => (index + audioStreamIndex) % 256,
  );
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
    resourcePolicy: resourcePolicy(),
    frames: [{ presentationTimestampTicks: '0', decodedSampleFrameCount: '10' }],
    pcm: { decodedByteLength: pcm.byteLength, decodedPcmSha256: digest(pcm) },
  });
  const privatePolicy = {
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
  const pcmChunks = createMediaSourceAudioPcmChunkPlanV1({
    map,
    policy: privatePolicy,
  }).map((entry) => createMediaSourceAudioPcmChunkReferenceV1({
    map,
    planEntry: entry,
    contentSha256: digest(pcm.subarray(
      Number(BigInt(entry.startSampleFrame) * BigInt(8)),
      Number(BigInt(entry.endExclusiveSampleFrame) * BigInt(8)),
    )),
  }));
  const manifestSerialization = serializeMediaSourceAudioPrivateArtifactManifestV1(
    createMediaSourceAudioPrivateArtifactManifestV1({
      map,
      epochMapArtifact,
      pcmChunks,
      policy: privatePolicy,
    }),
  );
  return { mapSerialization, manifestSerialization };
}

function sourceFixture(tag: string, audioStreamIndexes: readonly number[]) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `tests/product-audio-${tag}.mov` },
    byteLength: 1_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-product-audio' },
    assetId: `asset-product-audio-${tag}`,
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
    audioStreams: audioStreamIndexes.map((streamIndex) => ({
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
    requestedAt: '2026-08-30T00:00:00.000Z',
    startedAt: '2026-08-30T00:00:01.000Z',
    completedAt: '2026-08-30T00:00:02.000Z',
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

function resourcePolicy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'product-audio-materializer-test-v1',
    maxSourceBytes: 1_000,
    maxCanonicalJsonBytes: 100_000,
    maxDecodedFrameEntries: 10,
    maxEpochEntries: 10,
    maxDecodedSampleFrames: 100,
    maxDecodedPcmBytes: 1_000,
    timeoutMs: 1_000,
  };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
