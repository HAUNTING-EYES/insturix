import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MediaSourceAudioPrivateArtifactStreamWriterV1 } from '@/lib/editron/services/media-source-audio-private-artifact-port-v1';
import { MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1 } from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import { createMediaSourceAudioR2PrivateArtifactStoreV1 } from '@/lib/editron/services/media-source-audio-r2-private-artifact-v1';
import { materializeMediaSourceAudioPrivateArtifactFfmpegV1 } from '@/lib/editron/services/media-source-audio-sample-epoch-ffmpeg-v1';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 } from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { parseMediaSourceProbeResponseV1 } from '@/lib/editron/services/media-source-probe-v1';
import {
  claimMediaSourceQualificationV1,
  completeMediaSourceQualificationV1,
  createMediaSourceQualificationV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import type { NativeMediaTimestampPreviewSourceLeasePortV1 } from '@/lib/editron/services/native-media-timestamp-ffmpeg-preview-decoder-v1';

describe('media source audio FFmpeg private artifact V1', () => {
  let fixtureDirectory: string;
  let fixtureBytes: Buffer;
  let fixtureUrl: string;
  let server: Server;

  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'editron-audio-private-test-'));
    const fixturePath = path.join(fixtureDirectory, 'fixture.wav');
    await run(getFFmpegPath(), [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.1',
      '-ac', '2', '-c:a', 'pcm_s16le', '-y', fixturePath,
    ]);
    fixtureBytes = await readFile(fixturePath);
    server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-length': String(fixtureBytes.byteLength),
        'content-type': 'audio/wav',
      });
      response.end(fixtureBytes);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_INVALID');
    fixtureUrl = `http://127.0.0.1:${address.port}/fixture.wav`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
    await removeOwnedFixtureDirectory(fixtureDirectory);
  });

  it('streams the real decoded PCM into private artifacts before exact temp cleanup', async () => {
    const fixture = sourceFixture(fixtureBytes);
    const memory = memoryR2();
    const store = createStore(memory);
    const revalidate = vi.fn(async () => true);
    let streamedPcmPath = '';
    const artifactWriter: MediaSourceAudioPrivateArtifactStreamWriterV1 = {
      async writeArtifactSetFromPcmStream(input) {
        const candidatePath = (input.pcmBytes as { path?: unknown }).path;
        if (typeof candidatePath !== 'string') throw new Error('TEST_PCM_PATH_MISSING');
        streamedPcmPath = candidatePath;
        return store.writeArtifactSetFromPcmStream(input);
      },
    };

    const result = await materializeMediaSourceAudioPrivateArtifactFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: sourceLease(fixture.sourceVersion, fixtureUrl, revalidate),
      resourcePolicy: sourcePolicy(),
      artifactWriter,
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    });

    expect(result.mapSerialization.map.pcm).toMatchObject({
      decodedSampleFrameCount: '4800',
      decodedByteLength: 38_400,
      channelCount: 2,
      sampleRate: '48000',
    });
    expect(result.manifestSerialization.manifest).toMatchObject({
      audioSampleEpochMapSha256:
        result.mapSerialization.map.audioSampleEpochMapSha256,
      decodedPcmSha256: result.mapSerialization.map.pcm.decodedPcmSha256,
      decodedSampleFrameCount: '4800',
      decodedByteLength: 38_400,
    });
    const complete = await store.readPcmSampleRange({
      manifestReference: result.manifestSerialization.reference,
      startSampleFrame: '0',
      endExclusiveSampleFrame: '4800',
    });
    expect(complete.pcmBytes).toHaveLength(38_400);
    expect(digest(complete.pcmBytes)).toBe(result.mapSerialization.map.pcm.decodedPcmSha256);
    expect(memory.putKeys.at(-1)).toContain('/manifests/');
    expect(revalidate).toHaveBeenCalledTimes(3);
    expect(streamedPcmPath).toContain('editron-audio-sample-epoch-v1-');
    await expect(access(streamedPcmPath)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 30_000);

  it('rejects an invalid writer before opening a source lease', async () => {
    const fixture = sourceFixture(fixtureBytes);
    const open = vi.fn(async () => {
      throw new Error('TEST_LEASE_MUST_NOT_OPEN');
    });
    await expect(materializeMediaSourceAudioPrivateArtifactFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: { open },
      resourcePolicy: sourcePolicy(),
      artifactWriter: {} as never,
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ARTIFACT_WRITER_INVALID');
    expect(open).not.toHaveBeenCalled();
  });

  it('does not report success for a forged writer receipt or a post-write stale lease', async () => {
    const fixture = sourceFixture(fixtureBytes);
    const forgedMemory = memoryR2();
    const forgedStore = createStore(forgedMemory);
    const forgedWriter: MediaSourceAudioPrivateArtifactStreamWriterV1 = {
      async writeArtifactSetFromPcmStream(input) {
        const result = await forgedStore.writeArtifactSetFromPcmStream(input);
        return {
          ...result,
          reference: { ...result.reference, contentSha256: 'f'.repeat(64) },
        };
      },
    };
    await expect(materializeMediaSourceAudioPrivateArtifactFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: sourceLease(
        fixture.sourceVersion,
        fixtureUrl,
        vi.fn(async () => true),
      ),
      resourcePolicy: sourcePolicy(),
      artifactWriter: forgedWriter,
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ARTIFACT_RESULT_MISMATCH');
    expect(manifestKeys(forgedMemory)).toHaveLength(1);

    const staleMemory = memoryR2();
    const staleStore = createStore(staleMemory);
    const revalidate = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(materializeMediaSourceAudioPrivateArtifactFfmpegV1({
      sourceVersion: fixture.sourceVersion,
      qualification: fixture.qualification,
      audioStreamIndex: 0,
      sourceLease: sourceLease(fixture.sourceVersion, fixtureUrl, revalidate),
      resourcePolicy: sourcePolicy(),
      artifactWriter: staleStore,
      ffmpegPath: getFFmpegPath(),
      ffprobePath: 'ffprobe',
    })).rejects.toThrow('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_VERSION_STALE');
    expect(revalidate).toHaveBeenCalledTimes(3);
    expect(manifestKeys(staleMemory)).toHaveLength(1);
  }, 30_000);
});

function createStore(memory: ReturnType<typeof memoryR2>) {
  return createMediaSourceAudioR2PrivateArtifactStoreV1({
    privateStorage: {
      bucketName: 'editron-private-artifacts',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
      storagePolicyVersion: 'r2-private-media-evidence-v1',
    },
    client: memory.client,
    policy: {
      policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      maxChunkBytes: 4096,
      maxChunkCount: 100,
      maxManifestBytes: 1024 * 1024,
      maxReadBytes: 1024 * 1024,
    },
  });
}

function memoryR2() {
  type StoredObject = Readonly<{
    bytes: Uint8Array;
    cacheControl: string;
    contentType: string;
    metadata: Record<string, string>;
  }>;
  const objects = new Map<string, StoredObject>();
  const putKeys: string[] = [];
  return {
    objects,
    putKeys,
    client: {
      send: async (command: unknown): Promise<unknown> => {
        if (command instanceof PutObjectCommand) {
          const {
            Body, CacheControl, ContentLength, ContentType, IfNoneMatch, Key, Metadata,
          } = command.input;
          if (typeof Key !== 'string' || !(Body instanceof Uint8Array)
            || typeof CacheControl !== 'string' || typeof ContentType !== 'string'
            || ContentLength !== Body.byteLength || !Metadata) {
            throw new Error('TEST_R2_PUT_INVALID');
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
          if (typeof Key !== 'string' || !objects.has(Key)) throw new Error('TEST_R2_GET_MISSING');
          const stored = objects.get(Key)!;
          return {
            Body: stored.bytes,
            CacheControl: stored.cacheControl,
            ContentLength: stored.bytes.byteLength,
            ContentType: stored.contentType,
            Metadata: stored.metadata,
          };
        }
        throw new Error('TEST_R2_COMMAND_UNEXPECTED');
      },
    },
  };
}

function manifestKeys(memory: ReturnType<typeof memoryR2>): string[] {
  return [...memory.objects.keys()].filter((key) => key.includes('/manifests/'));
}

function sourceFixture(bytes: Buffer) {
  const observation = parseMediaSourceProbeResponseV1({
    ok: true,
    probe_version: 'ffprobe version 8.1',
    format: { format_name: 'wav', duration: '0.1', start_time: '0' },
    streams: [{
      index: 0,
      codec_type: 'audio',
      codec_name: 'pcm_s16le',
      sample_rate: '48000',
      channels: 2,
      channel_layout: 'stereo',
      time_base: '1/48000',
      start_pts: '0',
      duration_ts: '4800',
    }],
  });
  if (!observation) throw new Error('TEST_OBSERVATION_INVALID');
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'tests/audio-private-real-fixture.wav' },
    byteLength: bytes.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'audio-private-real-fixture-etag' },
  });
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: 'audio-private-real-fixture',
      source: 'user-upload',
      r2Key: storageVersion.locator.objectKey,
    },
    now: new Date('2026-08-29T00:00:00.000Z'),
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_CREATE_FAILED');
  const claimed = claimMediaSourceQualificationV1({
    record: created.record,
    sourceBindingSha256: created.record.sourceBindingSha256,
    now: new Date('2026-08-29T00:00:01.000Z'),
  });
  if (claimed.disposition !== 'CLAIMED') throw new Error('TEST_CLAIM_FAILED');
  const completed = completeMediaSourceQualificationV1({
    record: claimed.record,
    sourceBindingSha256: claimed.record.sourceBindingSha256,
    result: { disposition: 'MEASURED', observation, diagnostics: [] },
    storageVersion,
    now: new Date('2026-08-29T00:00:02.000Z'),
  });
  if (completed.disposition !== 'COMPLETED') throw new Error('TEST_COMPLETE_FAILED');
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'audio-private-owner' },
    assetId: completed.record.assetId,
    mediaKind: 'audio',
    byteLength: bytes.byteLength,
    contentSha256: digest(bytes),
    storageVersion,
  });
  return { qualification: completed.record, sourceVersion };
}

function sourceLease(
  sourceVersion: ReturnType<typeof createMediaSourceVersionV1>,
  sourceUrl: string,
  revalidate: () => Promise<boolean>,
): NativeMediaTimestampPreviewSourceLeasePortV1 {
  return {
    async open(expected) {
      if (expected.sourceVersionSha256 !== sourceVersion.sourceVersionSha256) {
        throw new Error('TEST_SOURCE_VERSION_MISMATCH');
      }
      return { sourceUrl, storageVersion: sourceVersion.storageVersion, revalidate };
    },
  };
}

function sourcePolicy(): MediaSourceAudioSampleEpochResourcePolicyV1 {
  return {
    policyVersion: 'audio-private-ffmpeg-test-v1',
    maxSourceBytes: 1024 * 1024,
    maxCanonicalJsonBytes: 1024 * 1024,
    maxDecodedFrameEntries: 100,
    maxEpochEntries: 100,
    maxDecodedSampleFrames: 100_000,
    maxDecodedPcmBytes: 1024 * 1024,
    timeoutMs: 20_000,
  };
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => (
      code === 0 ? resolve() : reject(new Error(`TEST_FFMPEG_FAILED_${code}`))
    ));
  });
}

async function removeOwnedFixtureDirectory(directory: string): Promise<void> {
  const root = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(root)
    || !path.basename(resolved).startsWith('editron-audio-private-test-')) {
    throw new Error('TEST_FIXTURE_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
