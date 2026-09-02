import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 } from './media-source-pts-cadence-map-asset-owner-v3';
import { sameMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';
import { getFFmpegPath } from './media/ffmpeg-runtime';
import {
  NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
  type NativeMediaDecodedPictureV1,
  type NativeMediaTimestampDecoderBatchOutputV1,
  type NativeMediaTimestampDecoderBatchRequestV1,
  type NativeMediaTimestampDecoderPictureRequestV1,
  type NativeMediaTimestampMaterializingDecoderV1,
} from './native-media-timestamp-consumer-v1';
import {
  createVerifiedAssetMediaSourceLeasePortV1,
  materializeVerifiedMediaSourceLocalFileV1,
  type VerifiedMediaSourceLeasePortV1,
  type VerifiedMediaSourceLeaseV1,
} from './verified-media-source-local-file-v1';

const TEMP_PREFIX = 'editron-native-preview-v1-';
const MAX_ADAPTER_PICTURES = 1_024;
const MAX_ADAPTER_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_FFMPEG_DIAGNOSTIC_BYTES = 1024 * 1024;

export type NativeMediaTimestampPreviewDecoderPolicyV1 = Readonly<{
  policyVersion: string;
  maxSourceBytes: number;
  maxPictures: number;
  maxEncodedPreviewBytes: number;
  timeoutMs: number;
}>;

export type NativeMediaTimestampPreviewSourceLeaseV1 = VerifiedMediaSourceLeaseV1;
export type NativeMediaTimestampPreviewSourceLeasePortV1 = VerifiedMediaSourceLeasePortV1;

export interface NativeMediaTimestampPreviewSurfaceStorePortV1 {
  putPicture(input: Readonly<{
    decoderRequestSha256: string;
    pictureRequest: NativeMediaTimestampDecoderPictureRequestV1;
    sourceVersionSha256: string;
    storageVersionSha256: string;
    rgbaBytes: Uint8Array;
    pngBytes: Uint8Array;
    width: number;
    height: number;
    decodedPictureContentSha256: string;
  }>): Promise<Readonly<{ pictureHandle: string }>>;
  deletePicture(pictureHandle: string): Promise<void>;
}

export function createVerifiedAssetNativeMediaTimestampPreviewSourceLeasePortV1(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): NativeMediaTimestampPreviewSourceLeasePortV1 {
  return createVerifiedAssetMediaSourceLeasePortV1(asset, {
    bindingStale: 'NATIVE_MEDIA_PREVIEW_SOURCE_BINDING_STALE',
    versionStale: 'NATIVE_MEDIA_PREVIEW_SOURCE_VERSION_STALE',
  });
}

export function createNativeMediaTimestampFfmpegPreviewDecoderV1(input: Readonly<{
  sourceLease: NativeMediaTimestampPreviewSourceLeasePortV1;
  surfaceStore: NativeMediaTimestampPreviewSurfaceStorePortV1;
  policy: NativeMediaTimestampPreviewDecoderPolicyV1;
  ffmpegPath?: string;
}>): NativeMediaTimestampMaterializingDecoderV1 {
  const policy = normalizePolicy(input.policy);
  const ffmpegPath = input.ffmpegPath ?? getFFmpegPath();
  const handlesByBatch = new Map<string, string[]>();

  const releaseDecodedBatch = async (decoderRequestSha256: string): Promise<void> => {
    const handles = handlesByBatch.get(decoderRequestSha256);
    if (!handles) return;
    const failed: string[] = [];
    for (const handle of handles) {
      try {
        await input.surfaceStore.deletePicture(handle);
      } catch {
        failed.push(handle);
      }
    }
    if (failed.length > 0) {
      handlesByBatch.set(decoderRequestSha256, failed);
      throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_FAILED');
    }
    handlesByBatch.delete(decoderRequestSha256);
  };

  return {
    async decodePictures(request) {
      validateRequest(request, policy);
      if (handlesByBatch.has(request.decoderRequestSha256)) {
        throw new Error('NATIVE_MEDIA_PREVIEW_BATCH_ALREADY_MATERIALIZED');
      }
      handlesByBatch.set(request.decoderRequestSha256, []);
      try {
        return await decodeBatch({
          request,
          sourceLease: input.sourceLease,
          surfaceStore: input.surfaceStore,
          policy,
          ffmpegPath,
          materializedHandles: handlesByBatch.get(request.decoderRequestSha256)!,
        });
      } catch (error) {
        try {
          await releaseDecodedBatch(request.decoderRequestSha256);
        } catch {
          throw new Error('NATIVE_MEDIA_PREVIEW_RELEASE_FAILED');
        }
        throw error;
      }
    },
    releaseDecodedBatch,
  };
}

async function decodeBatch(input: Readonly<{
  request: NativeMediaTimestampDecoderBatchRequestV1;
  sourceLease: NativeMediaTimestampPreviewSourceLeasePortV1;
  surfaceStore: NativeMediaTimestampPreviewSurfaceStorePortV1;
  policy: NativeMediaTimestampPreviewDecoderPolicyV1;
  ffmpegPath: string;
  materializedHandles: string[];
}>): Promise<NativeMediaTimestampDecoderBatchOutputV1> {
  const ordered = [...input.request.pictureRequests].sort((left, right) => {
    const leftOrdinal = BigInt(left.sourceFrameOrdinal);
    const rightOrdinal = BigInt(right.sourceFrameOrdinal);
    return leftOrdinal < rightOrdinal ? -1 : leftOrdinal > rightOrdinal ? 1 : 0;
  });
  const lease = await input.sourceLease.open(input.request.sourceVersion);
  if (!sameMediaSourceStorageVersionV1(
    lease.storageVersion,
    input.request.sourceVersion.storageVersion,
  )) {
    throw new Error('NATIVE_MEDIA_PREVIEW_SOURCE_VERSION_STALE');
  }

  const tempDirectory = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX));
  try {
    const sourcePath = path.join(tempDirectory, 'source.bin');
    await materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: lease.sourceUrl,
      outputPath: sourcePath,
      sourceVersion: input.request.sourceVersion,
      maximumBytes: input.policy.maxSourceBytes,
      timeoutMs: input.policy.timeoutMs,
      errorCodes: {
        sourceByteLimitExceeded: 'NATIVE_MEDIA_PREVIEW_SOURCE_BYTE_LIMIT_EXCEEDED',
        sourceUrlInvalid: 'NATIVE_MEDIA_PREVIEW_SOURCE_URL_INVALID',
        sourceReadFailed: 'NATIVE_MEDIA_PREVIEW_SOURCE_READ_FAILED',
        sourceByteLengthMismatch: 'NATIVE_MEDIA_PREVIEW_SOURCE_BYTE_LENGTH_MISMATCH',
        sourceContentMismatch: 'NATIVE_MEDIA_PREVIEW_SOURCE_CONTENT_MISMATCH',
        outputWriteFailed: 'NATIVE_MEDIA_PREVIEW_SOURCE_WRITE_FAILED',
      },
    });
    if (!await lease.revalidate()) {
      throw new Error('NATIVE_MEDIA_PREVIEW_SOURCE_VERSION_STALE');
    }
    const decoded = await runFfmpeg({
      ffmpegPath: input.ffmpegPath,
      sourcePath,
      outputDirectory: tempDirectory,
      videoStreamIndex: input.request.videoStreamIndex,
      requests: ordered,
      policy: input.policy,
      decodedByteLimit: input.request.resourcePolicy.maxDecodedBytes,
      dimensionLimit: Math.min(
        input.request.resourcePolicy.maxCodedDimension,
        input.request.resourcePolicy.maxDisplayDimension,
      ),
    });
    const pictureByHash = new Map<string, NativeMediaDecodedPictureV1>();
    for (let index = 0; index < ordered.length; index += 1) {
      const pictureRequest = ordered[index]!;
      const frame = decoded[index]!;
      if (frame.presentationTimestampTicks !== pictureRequest.presentationTimestampTicks) {
        throw new Error('NATIVE_MEDIA_PREVIEW_DECODED_PTS_MISMATCH');
      }
      const decodedPictureContentSha256 = createHash('sha256')
        .update(frame.rgbaBytes)
        .digest('hex');
      const stored = await input.surfaceStore.putPicture({
        decoderRequestSha256: input.request.decoderRequestSha256,
        pictureRequest,
        sourceVersionSha256: input.request.sourceVersion.sourceVersionSha256,
        storageVersionSha256: input.request.sourceVersion.storageVersion.storageVersionSha256,
        rgbaBytes: frame.rgbaBytes,
        pngBytes: frame.pngBytes,
        width: frame.width,
        height: frame.height,
        decodedPictureContentSha256,
      });
      input.materializedHandles.push(stored.pictureHandle);
      const pictureHandle = validPictureHandle(stored.pictureHandle);
      input.materializedHandles[input.materializedHandles.length - 1] = pictureHandle;
      pictureByHash.set(pictureRequest.decoderPictureRequestSha256, {
        decoderPictureRequestSha256: pictureRequest.decoderPictureRequestSha256,
        sourceVersionSha256: input.request.sourceVersion.sourceVersionSha256,
        storageVersionSha256: input.request.sourceVersion.storageVersion.storageVersionSha256,
        streamId: input.request.streamId,
        sourceFrameOrdinal: pictureRequest.sourceFrameOrdinal,
        epochId: pictureRequest.epochId,
        presentationTimestampTicks: pictureRequest.presentationTimestampTicks,
        pictureHandle,
        decodedPictureContentSha256,
        decodedByteLength: frame.rgbaBytes.byteLength,
        codedWidth: frame.width,
        codedHeight: frame.height,
        displayWidth: frame.width,
        displayHeight: frame.height,
        rotationDegrees: 0,
        pixelFormat: 'RGBA',
        colorSpace: { primaries: null, transfer: null, matrix: null, fullRange: null },
      });
    }
    return {
      schemaVersion: 1,
      kind: NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1,
      decoderPortVersion: NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
      decoderRequestSha256: input.request.decoderRequestSha256,
      pictures: input.request.pictureRequests.map((request) => {
        const picture = pictureByHash.get(request.decoderPictureRequestSha256);
        if (!picture) throw new Error('NATIVE_MEDIA_PREVIEW_OUTPUT_COVERAGE_INVALID');
        return picture;
      }),
    };
  } finally {
    await removeOwnedTemporaryDirectory(tempDirectory);
  }
}

type DecodedFrame = Readonly<{
  presentationTimestampTicks: string;
  width: number;
  height: number;
  rgbaBytes: Uint8Array;
  pngBytes: Uint8Array;
}>;

async function runFfmpeg(input: Readonly<{
  ffmpegPath: string;
  sourcePath: string;
  outputDirectory: string;
  videoStreamIndex: number;
  requests: readonly NativeMediaTimestampDecoderPictureRequestV1[];
  policy: NativeMediaTimestampPreviewDecoderPolicyV1;
  decodedByteLimit: number;
  dimensionLimit: number;
}>): Promise<readonly DecodedFrame[]> {
  const rawPath = path.join(input.outputDirectory, 'pictures.rgba');
  const pngPattern = path.join(input.outputDirectory, 'picture-%06d.png');
  const selector = input.requests
    .map((request) => `eq(n\\,${request.sourceFrameOrdinal})`)
    .join('+');
  const stderr = await executeFfmpeg(input.ffmpegPath, [
    '-hide_banner', '-nostdin', '-copyts', '-i', input.sourcePath,
    '-filter_complex', `[0:${input.videoStreamIndex}]select=${selector},showinfo,split=2[rgba][png]`,
    '-map', '[rgba]', '-an', '-sn', '-dn', '-pix_fmt', 'rgba', '-vsync', '0',
    '-frames:v', String(input.requests.length), '-f', 'rawvideo', '-y', rawPath,
    '-map', '[png]', '-an', '-sn', '-dn', '-vsync', '0',
    '-frames:v', String(input.requests.length), '-y', pngPattern,
  ], input.policy.timeoutMs);
  const metadata = parseShowInfo(stderr);
  if (metadata.length !== input.requests.length) {
    throw new Error('NATIVE_MEDIA_PREVIEW_DECODED_COUNT_MISMATCH');
  }
  let expectedRawBytes = 0;
  for (const frame of metadata) {
    if (frame.width > input.dimensionLimit || frame.height > input.dimensionLimit) {
      throw new Error('NATIVE_MEDIA_PREVIEW_DIMENSION_LIMIT_EXCEEDED');
    }
    const frameBytes = frame.width * frame.height * 4;
    if (!Number.isSafeInteger(frameBytes)
      || frameBytes > input.decodedByteLimit - expectedRawBytes) {
      throw new Error('NATIVE_MEDIA_PREVIEW_DECODED_BYTE_LIMIT_EXCEEDED');
    }
    expectedRawBytes += frameBytes;
  }
  const rawStats = await stat(rawPath);
  if (rawStats.size !== expectedRawBytes) {
    throw new Error('NATIVE_MEDIA_PREVIEW_RAW_BYTE_LENGTH_MISMATCH');
  }
  const raw = await readFile(rawPath);
  let offset = 0;
  let encodedBytes = 0;
  const frames: DecodedFrame[] = [];
  for (let index = 0; index < metadata.length; index += 1) {
    const frame = metadata[index]!;
    const frameBytes = frame.width * frame.height * 4;
    const pngBytes = await readFile(path.join(
      input.outputDirectory,
      `picture-${String(index + 1).padStart(6, '0')}.png`,
    ));
    encodedBytes += pngBytes.byteLength;
    if (encodedBytes > input.policy.maxEncodedPreviewBytes) {
      throw new Error('NATIVE_MEDIA_PREVIEW_ENCODED_BYTE_LIMIT_EXCEEDED');
    }
    frames.push({
      ...frame,
      rgbaBytes: raw.subarray(offset, offset + frameBytes),
      pngBytes,
    });
    offset += frameBytes;
  }
  return frames;
}

async function executeFfmpeg(
  ffmpegPath: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;
    let terminationError: Error | null = null;
    const finish = (error: Error | null, value = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => {
      terminationError = new Error('NATIVE_MEDIA_PREVIEW_DECODER_TIMEOUT');
      child.kill();
    }, timeoutMs);
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) + chunk.byteLength > MAX_FFMPEG_DIAGNOSTIC_BYTES) {
        terminationError ??=
          new Error('NATIVE_MEDIA_PREVIEW_DECODER_DIAGNOSTIC_LIMIT_EXCEEDED');
        child.kill();
        return;
      }
      stderr += chunk.toString('utf8');
    });
    child.once('error', () => finish(new Error('NATIVE_MEDIA_PREVIEW_DECODER_UNAVAILABLE')));
    child.once('close', (code) => finish(
      terminationError ?? (code === 0 ? null : new Error('NATIVE_MEDIA_PREVIEW_DECODER_FAILED')),
      stderr,
    ));
  });
}

function parseShowInfo(stderr: string): readonly Readonly<{
  presentationTimestampTicks: string;
  width: number;
  height: number;
}>[] {
  const frames = [];
  for (const line of stderr.split(/\r?\n/)) {
    if (!line.includes('showinfo') || !line.includes(' pts:')) continue;
    const match = /\bpts:\s*(-?\d+)\b.*\bs:(\d+)x(\d+)\b/.exec(line);
    if (!match) throw new Error('NATIVE_MEDIA_PREVIEW_DECODER_METADATA_INVALID');
    const width = Number(match[2]);
    const height = Number(match[3]);
    if (!Number.isSafeInteger(width) || width < 1
      || !Number.isSafeInteger(height) || height < 1) {
      throw new Error('NATIVE_MEDIA_PREVIEW_DECODER_GEOMETRY_INVALID');
    }
    frames.push({ presentationTimestampTicks: BigInt(match[1]!).toString(), width, height });
  }
  return frames;
}

function validateRequest(
  request: NativeMediaTimestampDecoderBatchRequestV1,
  policy: NativeMediaTimestampPreviewDecoderPolicyV1,
): void {
  const sourceVersion = assertMediaSourceVersionV1(request.sourceVersion);
  const { decoderRequestSha256, ...material } = request;
  if (request.schemaVersion !== 1
    || request.kind !== NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_REQUEST_KIND_V1
    || request.decoderPortVersion !== NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1
    || decoderRequestSha256 !== hashEditronCanonicalJsonV1(material)
    || sourceVersion.mediaKind !== 'video'
    || !Number.isSafeInteger(request.videoStreamIndex) || request.videoStreamIndex < 0
    || request.pictureRequests.length < 1
    || request.pictureRequests.length > request.resourcePolicy.maxUniquePictures
    || request.pictureRequests.length > policy.maxPictures) {
    throw new Error('NATIVE_MEDIA_PREVIEW_REQUEST_INVALID');
  }
  const ordinals = new Set<string>();
  for (const picture of request.pictureRequests) {
    if (!/^(0|[1-9]\d{0,127})$/.test(picture.sourceFrameOrdinal)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_PICTURE_REQUEST_INVALID');
    }
    const ordinal = BigInt(picture.sourceFrameOrdinal);
    const expectedPictureHash = hashEditronCanonicalJsonV1({
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
      streamId: request.streamId,
      sourceFrameOrdinal: picture.sourceFrameOrdinal,
      epochId: picture.epochId,
      presentationTimestampTicks: picture.presentationTimestampTicks,
    });
    if (ordinal > BigInt(Number.MAX_SAFE_INTEGER)
      || !/^-?(0|[1-9]\d{0,127})$/.test(picture.presentationTimestampTicks)
      || !picture.epochId
      || picture.decoderPictureRequestSha256 !== expectedPictureHash
      || ordinals.has(picture.sourceFrameOrdinal)) {
      throw new Error('NATIVE_MEDIA_PREVIEW_PICTURE_REQUEST_INVALID');
    }
    ordinals.add(picture.sourceFrameOrdinal);
  }
}

function normalizePolicy(
  value: NativeMediaTimestampPreviewDecoderPolicyV1,
): NativeMediaTimestampPreviewDecoderPolicyV1 {
  if (!value || typeof value.policyVersion !== 'string' || !value.policyVersion.trim()) {
    throw new Error('NATIVE_MEDIA_PREVIEW_POLICY_INVALID');
  }
  const positive = (candidate: number, maximum: number) => (
    Number.isSafeInteger(candidate) && candidate > 0 && candidate <= maximum
  );
  if (!positive(value.maxSourceBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.maxPictures, MAX_ADAPTER_PICTURES)
    || !positive(value.maxEncodedPreviewBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.timeoutMs, MAX_ADAPTER_TIMEOUT_MS)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_POLICY_INVALID');
  }
  return { ...value, policyVersion: value.policyVersion.trim() };
}

function validPictureHandle(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024
    || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_PICTURE_HANDLE_INVALID');
  }
  return value.trim();
}

async function removeOwnedTemporaryDirectory(directory: string): Promise<void> {
  const tempRoot = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(tempRoot)
    || !path.basename(resolved).startsWith(TEMP_PREFIX)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_TEMP_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}
