import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import {
  createNativeMediaTimestampFfmpegPreviewDecoderV1,
  type NativeMediaTimestampPreviewSourceLeasePortV1,
  type NativeMediaTimestampPreviewSurfaceStorePortV1,
} from '@/lib/editron/services/native-media-timestamp-ffmpeg-preview-decoder-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
  type NativeMediaTimestampDecoderBatchRequestV1,
} from '@/lib/editron/services/native-media-timestamp-consumer-v1';

describe('native media timestamp FFmpeg preview decoder V1', () => {
  let fixtureDirectory: string;
  let fixtureBytes: Buffer;
  let fixtureUrl: string;
  let server: Server;

  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'editron-preview-decoder-test-'));
    const fixturePath = path.join(fixtureDirectory, 'timestamped.mkv');
    await run(getFFmpegPath(), [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc=size=16x16:rate=1:duration=3',
      '-vf', 'setpts=PTS+10/TB', '-c:v', 'ffv1', '-y', fixturePath,
    ]);
    fixtureBytes = await readFile(fixturePath);
    server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-length': String(fixtureBytes.byteLength),
        'content-type': 'video/x-matroska',
      });
      response.end(fixtureBytes);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
    fixtureUrl = `http://127.0.0.1:${address.port}/timestamped.mkv`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
    await removeOwnedFixtureDirectory(fixtureDirectory);
  });

  it('decodes real ordinal-addressed frames and materializes verified RGBA and PNG surfaces', async () => {
    const fixture = createFixture();
    const surfaceInputs: Parameters<NativeMediaTimestampPreviewSurfaceStorePortV1['putPicture']>[0][] = [];
    const deletePicture = vi.fn(async () => undefined);
    const decoder = createNativeMediaTimestampFfmpegPreviewDecoderV1({
      sourceLease: sourceLease(fixture.sourceVersion, true),
      surfaceStore: {
        async putPicture(input) {
          surfaceInputs.push(input);
          return { pictureHandle: `preview://${input.pictureRequest.decoderPictureRequestSha256}` };
        },
        deletePicture,
      },
      policy: policy(),
      ffmpegPath: getFFmpegPath(),
    });
    const request = decoderRequest(fixture.sourceVersion, [
      { ordinal: '0', epochId: 'epoch-a', pts: '10000' },
      { ordinal: '2', epochId: 'epoch-b', pts: '12000' },
    ]);

    const output = await decoder.decodePictures(request);

    expect(output.pictures.map((picture) => picture.presentationTimestampTicks))
      .toEqual(['10000', '12000']);
    expect(output.pictures.map((picture) => picture.decodedByteLength)).toEqual([1024, 1024]);
    expect(surfaceInputs).toHaveLength(2);
    for (const input of surfaceInputs) {
      expect(input.rgbaBytes).toHaveLength(1024);
      expect(Buffer.from(input.pngBytes.subarray(0, 8)).toString('hex'))
        .toBe('89504e470d0a1a0a');
      expect(input.decodedPictureContentSha256).toBe(
        createHash('sha256').update(input.rgbaBytes).digest('hex'),
      );
    }
    await decoder.releaseDecodedBatch(request.decoderRequestSha256);
    expect(deletePicture).toHaveBeenCalledTimes(2);
    await decoder.releaseDecodedBatch(request.decoderRequestSha256);
    expect(deletePicture).toHaveBeenCalledTimes(2);
  }, 30_000);

  it('rejects altered bytes, wrong PTS, duplicate ordinals, and unsafe ordinal projection', async () => {
    const fixture = createFixture();
    const putPicture = vi.fn(async () => ({ pictureHandle: 'preview://unused' }));
    const lease = sourceLease(fixture.sourceVersion, true);
    const decoder = createNativeMediaTimestampFfmpegPreviewDecoderV1({
      sourceLease: lease,
      surfaceStore: { putPicture, deletePicture: vi.fn(async () => undefined) },
      policy: policy(),
      ffmpegPath: getFFmpegPath(),
    });

    await expect(decoder.decodePictures(decoderRequest(fixture.sourceVersion, [
      { ordinal: '0', epochId: 'epoch-a', pts: '9999' },
    ]))).rejects.toThrow('NATIVE_MEDIA_PREVIEW_DECODED_PTS_MISMATCH');
    expect(putPicture).not.toHaveBeenCalled();

    const duplicate = decoderRequest(fixture.sourceVersion, [
      { ordinal: '0', epochId: 'epoch-a', pts: '10000' },
      { ordinal: '0', epochId: 'epoch-b', pts: '-2000' },
    ]);
    await expect(decoder.decodePictures(duplicate))
      .rejects.toThrow('NATIVE_MEDIA_PREVIEW_PICTURE_REQUEST_INVALID');

    const unsafe = decoderRequest(fixture.sourceVersion, [
      { ordinal: '9007199254740992', epochId: 'epoch-a', pts: '10000' },
    ]);
    await expect(decoder.decodePictures(unsafe))
      .rejects.toThrow('NATIVE_MEDIA_PREVIEW_PICTURE_REQUEST_INVALID');

    const wrongIdentity = createMediaSourceVersionV1({
      ...fixture.sourceInput,
      contentSha256: 'f'.repeat(64),
    });
    const wrongDecoder = createNativeMediaTimestampFfmpegPreviewDecoderV1({
      sourceLease: sourceLease(wrongIdentity, true),
      surfaceStore: { putPicture, deletePicture: vi.fn(async () => undefined) },
      policy: policy(),
      ffmpegPath: getFFmpegPath(),
    });
    await expect(wrongDecoder.decodePictures(decoderRequest(wrongIdentity, [
      { ordinal: '0', epochId: 'epoch-a', pts: '10000' },
    ]))).rejects.toThrow('NATIVE_MEDIA_PREVIEW_SOURCE_CONTENT_MISMATCH');
  }, 30_000);

  it('deletes already materialized pictures when a later store operation fails', async () => {
    const fixture = createFixture();
    const deletePicture = vi.fn(async () => undefined);
    const putPicture = vi.fn()
      .mockResolvedValueOnce({ pictureHandle: 'preview://first' })
      .mockRejectedValueOnce(new Error('STORE_FAILED'));
    const decoder = createNativeMediaTimestampFfmpegPreviewDecoderV1({
      sourceLease: sourceLease(fixture.sourceVersion, true),
      surfaceStore: { putPicture, deletePicture },
      policy: policy(),
      ffmpegPath: getFFmpegPath(),
    });

    await expect(decoder.decodePictures(decoderRequest(fixture.sourceVersion, [
      { ordinal: '0', epochId: 'epoch-a', pts: '10000' },
      { ordinal: '2', epochId: 'epoch-b', pts: '12000' },
    ]))).rejects.toThrow('STORE_FAILED');
    expect(deletePicture).toHaveBeenCalledWith('preview://first');
  }, 30_000);

  function createFixture() {
    const storageVersion = createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'tests/timestamped.mkv' },
      byteLength: fixtureBytes.byteLength,
      providerVersion: { kind: 'R2_ETAG', value: 'fixture-etag' },
    });
    const sourceInput = {
      owner: { kind: 'USER' as const, userId: 'user-1' },
      assetId: 'asset-preview-decoder',
      mediaKind: 'video' as const,
      byteLength: fixtureBytes.byteLength,
      contentSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
      storageVersion,
    };
    return { sourceInput, sourceVersion: createMediaSourceVersionV1(sourceInput) };
  }

  function sourceLease(
    sourceVersion: ReturnType<typeof createMediaSourceVersionV1>,
    current: boolean,
  ): NativeMediaTimestampPreviewSourceLeasePortV1 {
    return {
      async open(expected) {
        if (expected.sourceVersionSha256 !== sourceVersion.sourceVersionSha256) {
          throw new Error('TEST_SOURCE_MISMATCH');
        }
        return {
          sourceUrl: fixtureUrl,
          storageVersion: sourceVersion.storageVersion,
          revalidate: vi.fn(async () => current),
        };
      },
    };
  }
});

function decoderRequest(
  sourceVersion: ReturnType<typeof createMediaSourceVersionV1>,
  frames: readonly Readonly<{ ordinal: string; epochId: string; pts: string }>[],
): NativeMediaTimestampDecoderBatchRequestV1 {
  const pictureRequests = frames.map((frame) => {
    const material = {
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
      streamId: 'video-0',
      sourceFrameOrdinal: frame.ordinal,
      epochId: frame.epochId,
      presentationTimestampTicks: frame.pts,
    };
    return {
      sourceFrameOrdinal: frame.ordinal,
      epochId: frame.epochId,
      presentationTimestampTicks: frame.pts,
      decoderPictureRequestSha256: hashEditronCanonicalJsonV1(material),
    };
  });
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1,
    decoderPortVersion: NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
    sourceVersion,
    streamId: 'video-0',
    videoStreamIndex: 0,
    pictureRequests,
    resourcePolicy: {
      policyVersion: 'preview-decoder-test-v1',
      maxUniquePictures: 10,
      maxDecodedBytes: 1024 * 1024,
      maxCodedDimension: 64,
      maxDisplayDimension: 64,
    },
  };
  return { ...material, decoderRequestSha256: hashEditronCanonicalJsonV1(material) };
}

function policy() {
  return {
    policyVersion: 'ffmpeg-preview-test-v1',
    maxSourceBytes: 1024 * 1024,
    maxPictures: 10,
    maxEncodedPreviewBytes: 1024 * 1024,
    timeoutMs: 20_000,
  };
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => (
      code === 0 ? resolve() : reject(new Error(`FIXTURE_FFMPEG_FAILED_${code}`))
    ));
  });
}

async function removeOwnedFixtureDirectory(directory: string): Promise<void> {
  const root = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(root)
    || !path.basename(resolved).startsWith('editron-preview-decoder-test-')) {
    throw new Error('TEST_FIXTURE_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}
