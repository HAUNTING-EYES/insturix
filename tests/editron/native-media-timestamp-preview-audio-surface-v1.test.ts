import { createHash } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { createMediaSourcePtsCadenceR2RuntimePortsV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-runtime-v1';
import {
  createNativeMediaTimestampR2PreviewAudioSurfaceReaderV1,
  createNativeMediaTimestampR2PreviewAudioSurfaceStoreV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
} from '@/lib/editron/services/native-media-timestamp-r2-preview-audio-surface-v1';

const NOW = 1_900_000_000_000;
const HANDLE = 'nmpa1_' + '1'.repeat(64);
const OBJECT_KEY = 'private/editron/native-media-preview-audio/v1/'
  + '1'.repeat(64) + '.wav';
const PCM = Uint8Array.from([
  0, 0, 0, 0, 255, 255, 255, 127,
  0, 0, 0, 128, 1, 2, 3, 4,
]);
const privateStorage = {
  bucketName: 'editron-media-pts-private',
  browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  storagePolicyVersion: 'TEST_PRIVATE_MEDIA_V1',
};
const revision = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
};
const leaseScope = {
  userId: 'user-owner',
  projectId: 'project-1',
  sequenceId: 'main',
  overlayId: 'video-1',
  projectRevision: revision,
};

type Stored = Readonly<{
  body: Uint8Array;
  cacheControl: string;
  contentLength: number;
  contentType: string;
  metadata: Record<string, string>;
}>;

function digest(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function segment() {
  return {
    audioMappingSha256: 'a'.repeat(64),
    audioSampleEpochMapSha256: 'b'.repeat(64),
    sourceVersionSha256: 'c'.repeat(64),
    storageVersionSha256: 'd'.repeat(64),
    decodedPcmSha256: 'e'.repeat(64),
    sampleRate: 48_000,
    channelCount: 2,
    sourceStartSampleFrame: '10',
    sourceEndExclusiveSampleFrame: '12',
    decodedStartSamplePosition: {
      numerator: '21',
      denominator: '2',
      disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
    },
    decodedEndExclusiveSamplePosition: {
      numerator: '23',
      denominator: '2',
      disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
    },
    timelineStartSamplePosition: {
      numerator: '201',
      denominator: '2',
      disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
    },
    timelineEndExclusiveSamplePosition: {
      numerator: '203',
      denominator: '2',
      disposition: 'BETWEEN_SAMPLE_FRAMES' as const,
    },
    pcmBytes: PCM,
  };
}

function memoryClient() {
  const objects = new Map<string, Stored>();
  const commands: unknown[] = [];
  const client = {
    async send(command: unknown): Promise<unknown> {
      commands.push(command);
      if (command instanceof PutObjectCommand) {
        const key = String(command.input.Key);
        if (command.input.IfNoneMatch === '*' && objects.has(key)) {
          throw Object.assign(new Error('collision'), {
            name: 'PreconditionFailed',
            $metadata: { httpStatusCode: 412 },
          });
        }
        if (!(command.input.Body instanceof Uint8Array)
          || typeof command.input.CacheControl !== 'string'
          || typeof command.input.ContentLength !== 'number'
          || typeof command.input.ContentType !== 'string'
          || !command.input.Metadata) {
          throw new Error('TEST_AUDIO_SURFACE_PUT_INVALID');
        }
        objects.set(key, {
          body: Uint8Array.from(command.input.Body),
          cacheControl: command.input.CacheControl,
          contentLength: command.input.ContentLength,
          contentType: command.input.ContentType,
          metadata: { ...command.input.Metadata },
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const stored = objects.get(String(command.input.Key));
        if (!stored) {
          throw Object.assign(new Error('missing'), {
            name: 'NoSuchKey',
            $metadata: { httpStatusCode: 404 },
          });
        }
        return {
          Body: Uint8Array.from(stored.body),
          CacheControl: stored.cacheControl,
          ContentLength: stored.contentLength,
          ContentType: stored.contentType,
          Metadata: { ...stored.metadata },
        };
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(String(command.input.Key));
        return {};
      }
      throw new Error('TEST_AUDIO_SURFACE_COMMAND_UNEXPECTED');
    },
  };
  return { client, objects, commands };
}

function store(
  memory: ReturnType<typeof memoryClient>,
  identifiers: string[] = ['1'.repeat(64)],
) {
  return createNativeMediaTimestampR2PreviewAudioSurfaceStoreV1({
    privateStorage,
    client: memory.client,
    policy: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
    leaseScope,
    now: () => NOW,
    randomIdentifier: () => identifiers.shift()!,
  });
}

function reader(
  memory: ReturnType<typeof memoryClient>,
  now = NOW + 1,
) {
  return createNativeMediaTimestampR2PreviewAudioSurfaceReaderV1({
    privateStorage,
    client: memory.client,
    policy: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
    now: () => now,
  });
}

describe('native media timestamp private audio preview surface V1', () => {
  it('stores and rereads a lease-bound canonical lossless WAV over exact PCM', async () => {
    const memory = memoryClient();
    const surfaceStore = store(memory);

    const stored = await surfaceStore.putAudioSegment(segment());

    expect(stored).toEqual({
      audioHandle: HANDLE,
      segmentIdentitySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAtEpochMs: NOW + 60 * 60 * 1_000,
    });
    const object = memory.objects.get(OBJECT_KEY)!;
    expect(object).toMatchObject({
      cacheControl: 'private, no-store, max-age=0',
      contentType: 'audio/wav',
      contentLength: PCM.byteLength + 44,
    });
    expect(String.fromCharCode(...object.body.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...object.body.subarray(8, 12))).toBe('WAVE');
    expect(object.body.subarray(44)).toEqual(PCM);
    expect(object.metadata.user).toBe(digest(leaseScope.userId));
    expect(object.metadata.project).toBe(digest(leaseScope.projectId));

    const read = await reader(memory).readAudioSegment(HANDLE);
    expect(read).toMatchObject({
      disposition: 'AVAILABLE',
      binding: {
        audioHandle: HANDLE,
        projectRevision: revision,
        sampleRate: 48_000,
        channelCount: 2,
        sourceStartSampleFrame: '10',
        sourceEndExclusiveSampleFrame: '12',
        decodedStartSamplePosition: segment().decodedStartSamplePosition,
        timelineStartSamplePosition: segment().timelineStartSamplePosition,
        segmentPcmSha256: digest(PCM),
        pcmByteLength: PCM.byteLength,
        wavByteLength: PCM.byteLength + 44,
      },
      wavBytes: object.body,
    });

    await surfaceStore.deleteAudioSegment(HANDLE);
    await expect(reader(memory).readAudioSegment(HANDLE)).resolves.toEqual({
      disposition: 'NOT_FOUND',
      audioHandle: HANDLE,
    });
  });

  it('rejects byte, coverage, duration, and rational-phase mismatches before storage', async () => {
    const memory = memoryClient();
    const surfaceStore = store(memory);
    await expect(surfaceStore.putAudioSegment({
      ...segment(),
      pcmBytes: PCM.subarray(0, PCM.byteLength - 1),
    })).rejects.toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PCM_RANGE_MISMATCH');
    await expect(surfaceStore.putAudioSegment({
      ...segment(),
      timelineEndExclusiveSamplePosition: {
        numerator: '205',
        denominator: '2',
        disposition: 'BETWEEN_SAMPLE_FRAMES',
      },
    })).rejects.toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PHASE_OR_DURATION_MISMATCH');
    await expect(surfaceStore.putAudioSegment({
      ...segment(),
      decodedStartSamplePosition: {
        numerator: '42',
        denominator: '4',
        disposition: 'BETWEEN_SAMPLE_FRAMES',
      },
    })).rejects.toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_RANGE_INVALID');
    expect(memory.commands).toHaveLength(0);
  });

  it('retries opaque collisions and rejects altered metadata or WAV bytes', async () => {
    const memory = memoryClient();
    await store(memory).putAudioSegment(segment());
    const secondHandle = 'nmpa1_' + '2'.repeat(64);
    const secondKey = 'private/editron/native-media-preview-audio/v1/'
      + '2'.repeat(64) + '.wav';
    const stored = await store(memory, ['1'.repeat(64), '2'.repeat(64)])
      .putAudioSegment(segment());
    expect(stored.audioHandle).toBe(secondHandle);

    const original = memory.objects.get(secondKey)!;
    memory.objects.set(secondKey, {
      ...original,
      metadata: { ...original.metadata, project: 'f'.repeat(64) },
    });
    await expect(reader(memory).readAudioSegment(secondHandle))
      .rejects.toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BINDING_MISMATCH');

    memory.objects.set(secondKey, {
      ...original,
      body: Uint8Array.from(original.body),
    });
    memory.objects.get(secondKey)!.body[44] ^= 1;
    await expect(reader(memory).readAudioSegment(secondHandle))
      .rejects.toThrow('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WAV_INVALID');
  });

  it('expires and deletes private WAV objects before returning bytes', async () => {
    const memory = memoryClient();
    await store(memory).putAudioSegment(segment());
    const expired = await reader(
      memory,
      NOW + 60 * 60 * 1_000,
    ).readAudioSegment(HANDLE);

    expect(expired).toMatchObject({
      disposition: 'EXPIRED',
      binding: { audioHandle: HANDLE },
    });
    expect(memory.objects).toHaveLength(0);
    expect(memory.commands.some((command) => command instanceof DeleteObjectCommand))
      .toBe(true);
  });

  it('exposes the audio surface through the single private runtime client', () => {
    const client = { send: vi.fn(async () => ({})) };
    const clientFactory = vi.fn(() => client);
    const runtime = createMediaSourcePtsCadenceR2RuntimePortsV1({
      EDITRON_MEDIA_PTS_R2_ACCOUNT_ID: 'a'.repeat(32),
      EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID: 'private-access-key',
      EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY: 'private-secret-key',
      EDITRON_MEDIA_PTS_R2_BUCKET_NAME: privateStorage.bucketName,
    }, { clientFactory });

    expect(runtime.audioPreviewSurface.createStore).toBeTypeOf('function');
    expect(runtime.audioPreviewSurface.createReader).toBeTypeOf('function');
    expect(clientFactory).toHaveBeenCalledTimes(1);
  });
});
