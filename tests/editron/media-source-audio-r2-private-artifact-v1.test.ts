import { createHash } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourceAudioPcmChunkPlanV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  type MediaSourceAudioPrivateArtifactPolicyV1,
} from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import {
  createMediaSourceAudioR2PrivateArtifactStoreV1,
  type MediaSourceAudioPcmChunkUploadV1,
} from '@/lib/editron/services/media-source-audio-r2-private-artifact-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  serializeMediaSourceAudioSampleEpochMapV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

describe('media source audio R2 private artifact V1', () => {
  it('publishes chunks then map then manifest and reads an exact cross-chunk range', async () => {
    const fixture = audioFixture();
    const memory = memoryR2();
    const store = createStore(memory, fixture.policy);
    const uploads = chunkUploads(fixture);

    const first = await store.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: uploads,
    });
    expect(memory.objects).toHaveLength(5);
    expect(memory.putKeys.slice(0, 3).every((key) => key.endsWith('.pcm'))).toBe(true);
    expect(memory.putKeys[3]).toContain('/epoch-map/');
    expect(memory.putKeys[4]).toContain('/manifests/');

    const beforeRetry = snapshotObjects(memory.objects);
    const second = await store.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: uploads,
    });
    expect(second).toEqual(first);
    expect(snapshotObjects(memory.objects)).toEqual(beforeRetry);

    const artifactSet = await store.readArtifactSet(first.reference);
    expect(artifactSet.map).toEqual(fixture.map);
    const range = await store.readPcmSampleRange({
      manifestReference: first.reference,
      startSampleFrame: '3',
      endExclusiveSampleFrame: '9',
    });
    expect(range).toMatchObject({
      audioSampleEpochMapSha256: fixture.map.audioSampleEpochMapSha256,
      decodedPcmSha256: fixture.map.pcm.decodedPcmSha256,
      startSampleFrame: '3',
      endExclusiveSampleFrame: '9',
      rangeSha256: digest(fixture.pcm.subarray(24, 72)),
    });
    expect(range.pcmBytes).toEqual(fixture.pcm.subarray(24, 72));
  });

  it('rejects unsafe storage and incomplete, extra, or aggregate-invalid uploads before a manifest exists', async () => {
    const fixture = audioFixture();
    const unsafeMemory = memoryR2();
    expect(() => createMediaSourceAudioR2PrivateArtifactStoreV1({
      privateStorage: { ...privateStorage(), bucketName: 'editron-cdn' },
      client: unsafeMemory.client,
      policy: fixture.policy,
    })).toThrow('MEDIA_SOURCE_AUDIO_R2_PRIVATE_STORAGE_INVALID');
    expect(unsafeMemory.commands).toHaveLength(0);

    const incompleteMemory = memoryR2();
    const incompleteStore = createStore(incompleteMemory, fixture.policy);
    await expect(incompleteStore.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: chunkUploads(fixture).slice(0, 2),
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_COVERAGE_INCOMPLETE');
    expect(manifestKeys(incompleteMemory)).toHaveLength(0);

    const extraMemory = memoryR2();
    const extraStore = createStore(extraMemory, fixture.policy);
    const uploads = chunkUploads(fixture);
    await expect(extraStore.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: [...uploads, uploads[2]!],
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_EXTRA_PCM_CHUNK');
    expect(manifestKeys(extraMemory)).toHaveLength(0);

    const corruptMemory = memoryR2();
    const corruptStore = createStore(corruptMemory, fixture.policy);
    const corruptUploads = chunkUploads(fixture).map((upload, index) => index === 1
      ? { ...upload, bytes: Uint8Array.from(upload.bytes, (byte, offset) => (
        offset === 0 ? byte ^ 0xff : byte
      )) }
      : upload);
    await expect(corruptStore.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: corruptUploads,
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_PCM_AGGREGATE_HASH_MISMATCH');
    expect(manifestKeys(corruptMemory)).toHaveLength(0);
  });

  it('rejects reordered uploads, stored-byte tampering, invalid headers, and oversized reads', async () => {
    const fixture = audioFixture();
    const reorderedMemory = memoryR2();
    const reorderedStore = createStore(reorderedMemory, fixture.policy);
    const uploads = chunkUploads(fixture);
    await expect(reorderedStore.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: [uploads[1]!, uploads[0]!, uploads[2]!],
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_PCM_CHUNK_ORDER_MISMATCH');

    const tamperedMemory = memoryR2();
    const tamperedStore = createStore(tamperedMemory, fixture.policy);
    const manifest = await tamperedStore.writeArtifactSet({
      mapSerialization: fixture.mapSerialization,
      chunks: uploads,
    });
    const firstPcmKey = tamperedMemory.putKeys.find((key) => key.endsWith('.pcm'))!;
    const storedChunk = tamperedMemory.objects.get(firstPcmKey)!;
    storedChunk.bytes[0] = storedChunk.bytes[0]! ^ 0xff;
    await expect(tamperedStore.readPcmSampleRange({
      manifestReference: manifest.reference,
      startSampleFrame: '0',
      endExclusiveSampleFrame: '1',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_CONTENT_MISMATCH');

    storedChunk.bytes[0] = storedChunk.bytes[0]! ^ 0xff;
    storedChunk.contentType = 'application/json; charset=utf-8';
    await expect(tamperedStore.readPcmSampleRange({
      manifestReference: manifest.reference,
      startSampleFrame: '0',
      endExclusiveSampleFrame: '1',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_HEADERS_OR_METADATA_INVALID');

    const limitedStore = createStore(tamperedMemory, {
      ...fixture.policy,
      maxReadBytes: 8,
    });
    await expect(limitedStore.readPcmSampleRange({
      manifestReference: manifest.reference,
      startSampleFrame: '0',
      endExclusiveSampleFrame: '2',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_R2_RANGE_BYTE_LIMIT_EXCEEDED');
  });
});

type AudioFixture = ReturnType<typeof audioFixture>;

function createStore(memory: ReturnType<typeof memoryR2>, policy: MediaSourceAudioPrivateArtifactPolicyV1) {
  return createMediaSourceAudioR2PrivateArtifactStoreV1({
    privateStorage: privateStorage(),
    client: memory.client,
    policy,
  });
}

function privateStorage() {
  return {
    bucketName: 'editron-private-artifacts',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
    storagePolicyVersion: 'r2-private-media-evidence-v1',
  };
}

function chunkUploads(fixture: AudioFixture): MediaSourceAudioPcmChunkUploadV1[] {
  return createMediaSourceAudioPcmChunkPlanV1({
    map: fixture.map,
    policy: fixture.policy,
  }).map((planEntry) => ({
    planEntry,
    bytes: fixture.pcm.slice(
      Number(BigInt(planEntry.startSampleFrame) * BigInt(8)),
      Number(BigInt(planEntry.endExclusiveSampleFrame) * BigInt(8)),
    ),
  }));
}

function memoryR2() {
  type StoredObject = {
    bytes: Uint8Array;
    cacheControl: string;
    contentType: string;
    metadata: Record<string, string>;
  };
  const objects = new Map<string, StoredObject>();
  const commands: unknown[] = [];
  const putKeys: string[] = [];
  return {
    objects,
    commands,
    putKeys,
    client: {
      send: async (command: unknown): Promise<unknown> => {
        commands.push(command);
        if (command instanceof PutObjectCommand) {
          const {
            Body, CacheControl, ContentLength, ContentType, IfNoneMatch, Key, Metadata,
          } = command.input;
          if (typeof Key !== 'string' || !(Body instanceof Uint8Array)
            || typeof CacheControl !== 'string' || typeof ContentType !== 'string'
            || typeof ContentLength !== 'number' || Body.byteLength !== ContentLength
            || !Metadata || Object.values(Metadata).some((value) => typeof value !== 'string')) {
            throw new Error('TEST_PUT_INVALID');
          }
          putKeys.push(Key);
          if (IfNoneMatch === '*' && objects.has(Key)) {
            throw Object.assign(new Error('exists'), {
              name: 'PreconditionFailed',
              $metadata: { httpStatusCode: 412 },
            });
          }
          objects.set(Key, {
            bytes: Body.slice(),
            cacheControl: CacheControl,
            contentType: ContentType,
            metadata: { ...Metadata } as Record<string, string>,
          });
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const { Key } = command.input;
          if (typeof Key !== 'string' || !objects.has(Key)) throw new Error('TEST_GET_MISSING');
          const stored = objects.get(Key)!;
          return {
            Body: byteChunks(stored.bytes),
            CacheControl: stored.cacheControl,
            ContentLength: stored.bytes.byteLength,
            ContentType: stored.contentType,
            Metadata: { ...stored.metadata },
          };
        }
        throw new Error('TEST_COMMAND_UNEXPECTED');
      },
    },
  };
}

async function* byteChunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  const midpoint = Math.max(1, Math.floor(value.byteLength / 2));
  yield value.slice(0, midpoint);
  if (midpoint < value.byteLength) yield value.slice(midpoint);
}

function manifestKeys(memory: ReturnType<typeof memoryR2>): string[] {
  return [...memory.objects.keys()].filter((key) => key.includes('/manifests/'));
}

function snapshotObjects(objects: ReturnType<typeof memoryR2>['objects']) {
  return [...objects.entries()].map(([key, value]) => ({
    key,
    bytes: [...value.bytes],
    cacheControl: value.cacheControl,
    contentType: value.contentType,
    metadata: value.metadata,
  }));
}

function audioFixture(tag = 'primary') {
  const pcm = Uint8Array.from({ length: 80 }, (_, index) => index);
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `media/${tag}.mov` },
    byteLength: 100,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: `asset-${tag}`,
    mediaKind: 'video',
    byteLength: 100,
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
    audioStreams: [{
      streamIndex: 1,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: { numerator: '1', denominator: '48000' },
      sourceStartPts: '0',
      sourceDurationTicks: '10',
    }],
  };
  const qualification = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
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
  const map = createMediaSourceAudioSampleEpochMapV1({
    binding: createMediaSourceAudioStreamBindingV1({
      sourceVersion,
      qualification,
      audioStreamIndex: 1,
    }),
    toolchain: {
      adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
      ffmpegVersion: 'ffmpeg-8.1',
      ffprobeVersion: 'ffprobe-8.1',
    },
    resourcePolicy: {
      policyVersion: 'audio-evidence-test-v1',
      maxSourceBytes: 100,
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
  return {
    map,
    mapSerialization: serializeMediaSourceAudioSampleEpochMapV1(map),
    pcm,
    policy: {
      policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      maxChunkBytes: 32,
      maxChunkCount: 10,
      maxManifestBytes: 100_000,
      maxReadBytes: 100_000,
    } satisfies MediaSourceAudioPrivateArtifactPolicyV1,
  };
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
