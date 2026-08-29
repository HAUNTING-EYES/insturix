import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  link,
  mkdtemp,
  open,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { MediaSourceAudioPrivateArtifactStoreV1 } from './media-source-audio-r2-private-artifact-v1';
import type { MediaSourceAudioArtifactAssetStateInputV1 } from './media-source-audio-artifact-asset-owner-v1';
import type { NativeMediaExactAudioEvidenceV1 } from './native-media-exact-audio-evidence-v1';
import {
  type NativeMediaFinalRenderEncodedArtifactV1,
  type NativeMediaFinalRenderEncoderPortV1,
} from './native-media-final-render-materializer-v1';
import {
  assertNativeMediaFinalRenderPcmEquivalenceReceiptV1,
  createNativeMediaFinalRenderPcmEquivalenceReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1,
  type NativeMediaFinalRenderPcmRangeEvidenceV1,
  type NativeMediaFinalRenderSilenceEvidenceV1,
} from './native-media-final-render-pcm-equivalence-v1';
import {
  assertNativeMediaFinalRenderProfileReceiptV1,
  type NativeMediaFinalRenderProfileReceiptV1,
} from './native-media-final-render-profile-v1';
import {
  sameMediaSourceStorageVersionV1,
} from './media-source-storage-version-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';
import {
  assertVideoSourceTimestampConformV3,
  type VideoSourceTimestampConformV3,
} from './video-source-time-transform-v1';
import {
  createVerifiedAssetMediaSourceLeasePortV1,
  materializeVerifiedMediaSourceLocalFileV1,
  type VerifiedMediaSourceLeasePortV1,
} from './verified-media-source-local-file-v1';

const require = createRequire(import.meta.url);
const TEMP_PREFIX_V1 = 'editron-native-final-render-v1-';
const MAX_PROCESS_DIAGNOSTIC_BYTES_V1 = 1024 * 1024;
const MAX_TIMEOUT_MS_V1 = 60 * 60 * 1_000;
const MAX_TIMELINE_FRAMES_V1 = 10_000;
const QUALIFIED_PROJECT_RATE_V1 = Object.freeze({ numerator: '30', denominator: '1' });
const QUALIFIED_AUDIO_V1 = Object.freeze({ sampleRate: '48000', channelCount: 2 });
const SUPPORTED_SDR_PIXEL_FORMATS_V1 = new Set([
  '0bgr', '0rgb', 'bgr0', 'bgr24', 'gbrp', 'gray', 'gray8', 'nv12', 'nv21',
  'rgb0', 'rgb24', 'uyvy422', 'yuv420p', 'yuv422p', 'yuv444p', 'yuvj420p',
  'yuvj422p', 'yuvj444p', 'yuyv422',
]);
const HDR_TRANSFERS_V1 = new Set(['arib-std-b67', 'smpte2084', 'smpte428']);

export const NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_V1' as const;

type NativeMediaFinalRenderFfmpegEncoderPolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1;
  maxSourceBytes: number;
  maxTimelineFrames: number;
  maxFrameBytes: number;
  maxDecodedSequenceBytes: number;
  maxPcmBytes: number;
  maxArtifactBytes: number;
  maxDimension: number;
  timeoutMs: number;
}>;

export interface NativeMediaFinalRenderArtifactStagerPortV1 {
  stage(input: Readonly<{
    localPath: string;
    contentType: 'video/x-matroska';
    artifactContentSha256: string;
    artifactByteLength: string;
    transformSha256: string;
    profileReceiptSha256: string;
    abortSignal?: AbortSignal;
  }>): Promise<Readonly<{
    publishHandle: string;
    artifactHandle: string;
    artifactContentSha256: string;
    artifactByteLength: string;
  }>>;
}

type NativeMediaFinalRenderSourceLeaseFactoryV1 = (
  asset: MediaSourceAudioArtifactAssetStateInputV1,
) => VerifiedMediaSourceLeasePortV1;

export function createNativeMediaFinalRenderFfmpegEncoderV1(input: Readonly<{
  ffmpegPath: string;
  ffprobePath: string;
  compatibilityReceipt: NativeMediaFinalRenderProfileReceiptV1;
  artifactStager: NativeMediaFinalRenderArtifactStagerPortV1;
  pcmReader?: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
  sourceLeaseFactory?: NativeMediaFinalRenderSourceLeaseFactoryV1;
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
}>): NativeMediaFinalRenderEncoderPortV1 {
  const ffmpegPath = executable(input.ffmpegPath);
  const ffprobePath = executable(input.ffprobePath);
  const policy = normalizePolicy(input.policy);
  const profile = assertNativeMediaFinalRenderProfileReceiptV1(input.compatibilityReceipt);
  if (!input.artifactStager || typeof input.artifactStager.stage !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_STAGER_INVALID');
  }
  if (input.pcmReader && typeof input.pcmReader.readPcmSampleRange !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_READER_INVALID');
  }
  const sourceLeaseFactory = input.sourceLeaseFactory ?? defaultSourceLeaseFactory;
  if (typeof sourceLeaseFactory !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_FACTORY_INVALID');
  }
  let runtimeQualification: Promise<void> | null = null;

  return {
    async encode(encodeInput) {
      try {
        throwIfAborted(encodeInput.abortSignal);
        runtimeQualification ??= qualifyRuntime({ ffmpegPath, ffprobePath, profile, policy });
        await runtimeQualification;
        throwIfAborted(encodeInput.abortSignal);
        return Object.freeze({
          disposition: 'ARTIFACT_ENCODED' as const,
          encoded: await encodeArtifact({
            ...encodeInput,
            ffmpegPath,
            ffprobePath,
            profile,
            artifactStager: input.artifactStager,
            pcmReader: input.pcmReader,
            sourceLeaseFactory,
            policy,
          }),
        });
      } catch (error) {
        return Object.freeze({
          disposition: 'UNVERIFIABLE' as const,
          diagnostic: encodeInput.abortSignal?.aborted
            ? 'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_CANCELLED'
            : diagnostic(error),
        });
      }
    },
  };
}

async function encodeArtifact(input: Readonly<{
  asset: MediaSourceAudioArtifactAssetStateInputV1;
  transform: VideoSourceTimestampConformV3;
  audioEvidence: NativeMediaExactAudioEvidenceV1 | null;
  abortSignal?: AbortSignal;
  ffmpegPath: string;
  ffprobePath: string;
  profile: NativeMediaFinalRenderProfileReceiptV1;
  artifactStager: NativeMediaFinalRenderArtifactStagerPortV1;
  pcmReader?: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
  sourceLeaseFactory: NativeMediaFinalRenderSourceLeaseFactoryV1;
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
}>): Promise<NativeMediaFinalRenderEncodedArtifactV1> {
  const sourceVersion = assertMediaSourceVersionV1(input.asset.sourceVersionV1);
  const transform = assertVideoSourceTimestampConformV3(input.transform);
  if (sourceVersion.mediaKind !== 'video'
    || transform.sourceBinding.sourceVersionSha256 !== sourceVersion.sourceVersionSha256
    || transform.sourceBinding.storageVersionSha256
      !== sourceVersion.storageVersion.storageVersionSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ENCODER_SOURCE_SCOPE_MISMATCH');
  }
  if (transform.projectRate.numerator !== QUALIFIED_PROJECT_RATE_V1.numerator
    || transform.projectRate.denominator !== QUALIFIED_PROJECT_RATE_V1.denominator) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PROJECT_RATE_NOT_PROFILED');
  }
  if (transform.frameSelections.length < 1
    || transform.frameSelections.length > input.policy.maxTimelineFrames) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_TIMELINE_RESOURCE_LIMIT');
  }
  assertSupportedSourceVideo(input.asset, transform, input.policy);
  throwIfAborted(input.abortSignal);
  const sourceLease = input.sourceLeaseFactory(input.asset);
  if (!sourceLease || typeof sourceLease.open !== 'function') {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_SOURCE_LEASE_INVALID');
  }
  const lease = await sourceLease.open(sourceVersion);
  throwIfAborted(input.abortSignal);
  if (!sameMediaSourceStorageVersionV1(lease.storageVersion, sourceVersion.storageVersion)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_SOURCE_VERSION_STALE');
  }

  const directory = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX_V1));
  try {
    const sourcePath = path.join(directory, 'source.bin');
    await materializeVerifiedMediaSourceLocalFileV1({
      sourceUrl: lease.sourceUrl,
      outputPath: sourcePath,
      sourceVersion,
      maximumBytes: input.policy.maxSourceBytes,
      timeoutMs: input.policy.timeoutMs,
      abortSignal: input.abortSignal,
      errorCodes: {
        sourceByteLimitExceeded: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_BYTE_LIMIT_EXCEEDED',
        sourceUrlInvalid: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_URL_INVALID',
        sourceReadFailed: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_READ_FAILED',
        sourceByteLengthMismatch: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_LENGTH_MISMATCH',
        sourceContentMismatch: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_CONTENT_MISMATCH',
        outputWriteFailed: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_WRITE_FAILED',
      },
    });
    throwIfAborted(input.abortSignal);
    if (!await lease.revalidate()) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_SOURCE_VERSION_STALE');
    }
    const frames = await decodeTimelineFrames({
      ffmpegPath: input.ffmpegPath,
      sourcePath,
      outputDirectory: directory,
      transform,
      policy: input.policy,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);
    const audio = await assembleAudio({
      outputDirectory: directory,
      transform,
      audioEvidence: input.audioEvidence,
      pcmReader: input.pcmReader,
      policy: input.policy,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);
    const artifactPath = path.join(directory, 'artifact.mkv');
    await encodeMezzanine({
      ffmpegPath: input.ffmpegPath,
      artifactPath,
      timelinePattern: frames.timelinePattern,
      frameCount: frames.frameCount,
      transform,
      audio,
      timeoutMs: input.policy.timeoutMs,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);
    const proof = await verifyMezzanine({
      ffmpegPath: input.ffmpegPath,
      ffprobePath: input.ffprobePath,
      artifactPath,
      frameCount: frames.frameCount,
      width: frames.width,
      height: frames.height,
      expectedRgbSha256: frames.decodedFrameSequenceSha256,
      transformSha256: transform.transformSha256,
      audio,
      policy: input.policy,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);
    const artifactStats = await stat(artifactPath);
    if (!artifactStats.isFile() || artifactStats.size < 1
      || artifactStats.size > input.policy.maxArtifactBytes) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_BYTE_LIMIT_EXCEEDED');
    }
    const artifactContentSha256 = await hashFile(artifactPath, input.abortSignal);
    throwIfAborted(input.abortSignal);
    const artifactByteLength = String(artifactStats.size);
    const staged = await input.artifactStager.stage({
      localPath: artifactPath,
      contentType: 'video/x-matroska',
      artifactContentSha256,
      artifactByteLength,
      transformSha256: transform.transformSha256,
      profileReceiptSha256: input.profile.receiptSha256,
      abortSignal: input.abortSignal,
    });
    throwIfAborted(input.abortSignal);
    if (!staged || staged.artifactContentSha256 !== artifactContentSha256
      || staged.artifactByteLength !== artifactByteLength) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_STAGE_SCOPE_MISMATCH');
    }
    if (!await lease.revalidate()) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_SOURCE_VERSION_STALE');
    }
    throwIfAborted(input.abortSignal);
    return Object.freeze({
      publishHandle: handle(staged.publishHandle),
      artifactHandle: handle(staged.artifactHandle),
      container: 'matroska',
      videoCodec: 'h264',
      pixelFormat: 'gbrp',
      videoFrameCount: String(frames.frameCount),
      decodedFrameSequenceSha256: frames.decodedFrameSequenceSha256,
      remotionCompatibilityReceiptSha256: input.profile.receiptSha256,
      audio: proof.audio,
      contentType: 'video/x-matroska',
      artifactContentSha256,
      artifactByteLength,
    });
  } finally {
    await removeOwnedDirectory(directory);
  }
}

type DecodedTimelineFramesV1 = Readonly<{
  timelinePattern: string;
  frameCount: number;
  width: number;
  height: number;
  decodedFrameSequenceSha256: string;
}>;

async function decodeTimelineFrames(input: Readonly<{
  ffmpegPath: string;
  sourcePath: string;
  outputDirectory: string;
  transform: VideoSourceTimestampConformV3;
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
  abortSignal?: AbortSignal;
}>): Promise<DecodedTimelineFramesV1> {
  const unique: Array<Readonly<{
    sourceFrameOrdinal: string;
    epochId: string;
    presentationTimestampTicks: string;
  }>> = [];
  const uniqueIndex = new Map<string, number>();
  let priorOrdinal: bigint | null = null;
  for (const selection of input.transform.frameSelections) {
    const ordinal = BigInt(selection.sourceFrameOrdinal);
    if (ordinal > BigInt(Number.MAX_SAFE_INTEGER)
      || (priorOrdinal !== null && ordinal < priorOrdinal)) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_FRAME_ORDER_UNSUPPORTED');
    }
    priorOrdinal = ordinal;
    const existingIndex = uniqueIndex.get(selection.sourceFrameOrdinal);
    if (existingIndex !== undefined) {
      const existing = unique[existingIndex]!;
      if (existing.epochId !== selection.epochId
        || existing.presentationTimestampTicks !== selection.presentationTimestampTicks) {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_FRAME_IDENTITY_CONFLICT');
      }
      continue;
    }
    uniqueIndex.set(selection.sourceFrameOrdinal, unique.length);
    unique.push(Object.freeze({
      sourceFrameOrdinal: selection.sourceFrameOrdinal,
      epochId: selection.epochId,
      presentationTimestampTicks: selection.presentationTimestampTicks,
    }));
  }
  const filterPath = path.join(input.outputDirectory, 'decode-filter.txt');
  const rawPath = path.join(input.outputDirectory, 'unique.rgb24');
  const uniquePattern = path.join(input.outputDirectory, 'unique-%08d.png');
  const selector = unique.map(({ sourceFrameOrdinal }) => `eq(n,${sourceFrameOrdinal})`).join('+');
  await writeFile(
    filterPath,
    `[0:${input.transform.sourceBinding.videoStreamIndex}]select='${selector}',`
      + 'format=rgb24,showinfo,split=2[raw][png]',
    { encoding: 'utf8', flag: 'wx' },
  );
  const stderr = await execute(input.ffmpegPath, [
    '-hide_banner', '-nostdin', '-copyts', '-i', input.sourcePath,
    '-filter_complex_script', filterPath,
    '-map', '[raw]', '-an', '-sn', '-dn', '-pix_fmt', 'rgb24', '-vsync', '0',
    '-frames:v', String(unique.length), '-f', 'rawvideo', '-y', rawPath,
    '-map', '[png]', '-an', '-sn', '-dn', '-c:v', 'png', '-pix_fmt', 'rgb24',
    '-vsync', '0', '-frames:v', String(unique.length), '-start_number', '0',
    '-f', 'image2', '-y', uniquePattern,
  ], input.policy.timeoutMs, 'stderr', input.abortSignal);
  const metadata = parseShowInfo(stderr);
  if (metadata.length !== unique.length) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODED_FRAME_COUNT_MISMATCH');
  }
  const width = metadata[0]!.width;
  const height = metadata[0]!.height;
  for (let index = 0; index < metadata.length; index += 1) {
    const observed = metadata[index]!;
    const expected = unique[index]!;
    if (observed.presentationTimestampTicks !== expected.presentationTimestampTicks) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODED_PTS_MISMATCH');
    }
    if (observed.width !== width || observed.height !== height) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_VARIABLE_GEOMETRY_UNSUPPORTED');
    }
  }
  if (width > input.policy.maxDimension || height > input.policy.maxDimension) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_DIMENSION_LIMIT_EXCEEDED');
  }
  const frameBytes = width * height * 3;
  const uniqueBytes = frameBytes * unique.length;
  const timelineBytes = frameBytes * input.transform.frameSelections.length;
  if (!Number.isSafeInteger(frameBytes) || frameBytes < 1
    || frameBytes > input.policy.maxFrameBytes
    || !Number.isSafeInteger(uniqueBytes) || !Number.isSafeInteger(timelineBytes)
    || uniqueBytes > input.policy.maxDecodedSequenceBytes
    || timelineBytes > input.policy.maxDecodedSequenceBytes) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODED_BYTE_LIMIT_EXCEEDED');
  }
  const rawStats = await stat(rawPath);
  if (!rawStats.isFile() || rawStats.size !== uniqueBytes) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODED_BYTE_LENGTH_MISMATCH');
  }
  const raw = await open(rawPath, 'r');
  const digest = createHash('sha256');
  const buffer = Buffer.alloc(frameBytes);
  const timelinePattern = path.join(input.outputDirectory, 'timeline-%08d.png');
  try {
    for (let index = 0; index < input.transform.frameSelections.length; index += 1) {
      throwIfAborted(input.abortSignal);
      const selection = input.transform.frameSelections[index]!;
      const sourceIndex = uniqueIndex.get(selection.sourceFrameOrdinal);
      if (sourceIndex === undefined) {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_FRAME_COVERAGE_INVALID');
      }
      const read = await raw.read(buffer, 0, frameBytes, sourceIndex * frameBytes);
      if (read.bytesRead !== frameBytes) {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODED_READ_INCOMPLETE');
      }
      digest.update(buffer);
      await link(
        path.join(input.outputDirectory, `unique-${String(sourceIndex).padStart(8, '0')}.png`),
        path.join(input.outputDirectory, `timeline-${String(index).padStart(8, '0')}.png`),
      );
    }
  } finally {
    await raw.close();
  }
  return Object.freeze({
    timelinePattern,
    frameCount: input.transform.frameSelections.length,
    width,
    height,
    decodedFrameSequenceSha256: digest.digest('hex'),
  });
}

type AssembledAudioV1 = Readonly<{
  inputPath: string;
  sampleRate: string;
  channelCount: number;
  sampleFrameCount: string;
  assembledPcmSha256: string;
  pcmRanges: readonly NativeMediaFinalRenderPcmRangeEvidenceV1[];
  silenceRanges: readonly NativeMediaFinalRenderSilenceEvidenceV1[];
  mapping: NonNullable<VideoSourceTimestampConformV3['audioMapping']>;
}>;

async function assembleAudio(input: Readonly<{
  outputDirectory: string;
  transform: VideoSourceTimestampConformV3;
  audioEvidence: NativeMediaExactAudioEvidenceV1 | null;
  pcmReader?: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
  abortSignal?: AbortSignal;
}>): Promise<AssembledAudioV1 | null> {
  const mapping = input.transform.audioMapping;
  if (mapping === null) {
    if (input.audioEvidence !== null) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_UNREQUESTED_AUDIO_EVIDENCE');
    }
    return null;
  }
  const evidence = input.audioEvidence;
  if (!evidence || !input.pcmReader
    || mapping.sampleRate !== QUALIFIED_AUDIO_V1.sampleRate
    || mapping.channelCount !== QUALIFIED_AUDIO_V1.channelCount
    || evidence.record.audioStreamIndex !== mapping.audioStreamIndex
    || evidence.record.audioSampleEpochMapSha256 !== mapping.audioSampleEpochMapSha256
    || evidence.record.decodedPcmSha256 !== mapping.decodedPcmSha256
    || evidence.record.sampleRate !== mapping.sampleRate
    || evidence.record.channelCount !== mapping.channelCount) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_PROFILE_OR_SCOPE_MISMATCH');
  }
  const start = integerPosition(mapping.canonicalTimelineStartSamplePosition);
  const end = integerPosition(mapping.canonicalTimelineEndExclusiveSamplePosition);
  if (end <= start) throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_RANGE_INVALID');
  const expectedFrames = BigInt(input.transform.frameSelections.length)
    * BigInt(input.transform.projectRate.denominator)
    * BigInt(mapping.sampleRate);
  if (expectedFrames % BigInt(input.transform.projectRate.numerator) !== BigInt(0)
    || end - start !== expectedFrames / BigInt(input.transform.projectRate.numerator)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_DURATION_NOT_INTEGER');
  }
  const bytesPerFrame = mapping.channelCount * 4;
  const totalBytes = (end - start) * BigInt(bytesPerFrame);
  if (totalBytes > BigInt(input.policy.maxPcmBytes)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_BYTE_LIMIT_EXCEEDED');
  }
  const audioPath = path.join(input.outputDirectory, 'timeline.s32le');
  const output = await open(audioPath, 'wx');
  const digest = createHash('sha256');
  const pcmRanges: NativeMediaFinalRenderPcmRangeEvidenceV1[] = [];
  const silenceRanges: NativeMediaFinalRenderSilenceEvidenceV1[] = [];
  let cursor = start;
  let writtenBytes = BigInt(0);
  try {
    for (let index = 0; index < mapping.segments.length; index += 1) {
      throwIfAborted(input.abortSignal);
      const segment = mapping.segments[index]!;
      const segmentStart = integerPosition(segment.canonicalStartSamplePosition);
      const segmentEnd = integerPosition(segment.canonicalEndExclusiveSamplePosition);
      if (segmentStart !== cursor || segmentEnd <= segmentStart) {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_SEGMENT_COVERAGE_INVALID');
      }
      const sampleFrames = segmentEnd - segmentStart;
      if (segment.kind === 'SILENCE') {
        await writeSilence(
          output,
          digest,
          sampleFrames,
          bytesPerFrame,
          input.abortSignal,
        );
        silenceRanges.push(Object.freeze({
          segmentOrdinal: String(index),
          sampleFrameCount: sampleFrames.toString(),
        }));
      } else {
        const sourceStart = integerPosition(segment.decodedStartSamplePosition);
        const sourceEnd = integerPosition(segment.decodedEndExclusiveSamplePosition);
        if (sourceEnd - sourceStart !== sampleFrames) {
          throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_SEGMENT_DURATION_MISMATCH');
        }
        const range = await input.pcmReader.readPcmSampleRange({
          manifestReference: evidence.record.manifestReference,
          startSampleFrame: sourceStart.toString(),
          endExclusiveSampleFrame: sourceEnd.toString(),
        });
        throwIfAborted(input.abortSignal);
        const rangeHash = createHash('sha256').update(range.pcmBytes).digest('hex');
        if (range.manifestSha256 !== evidence.record.manifestSha256
          || range.audioSampleEpochMapSha256 !== mapping.audioSampleEpochMapSha256
          || range.decodedPcmSha256 !== mapping.decodedPcmSha256
          || range.streamId !== mapping.streamId
          || range.sampleRate !== mapping.sampleRate
          || range.channelCount !== mapping.channelCount
          || range.startSampleFrame !== sourceStart.toString()
          || range.endExclusiveSampleFrame !== sourceEnd.toString()
          || range.rangeSha256 !== rangeHash
          || range.pcmBytes.byteLength !== Number(sampleFrames) * bytesPerFrame) {
          throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_RANGE_SCOPE_MISMATCH');
        }
        await writeExact(output, range.pcmBytes, input.abortSignal);
        digest.update(range.pcmBytes);
        pcmRanges.push(Object.freeze({
          segmentOrdinal: String(index),
          sourceStartSampleFrame: sourceStart.toString(),
          sourceEndExclusiveSampleFrame: sourceEnd.toString(),
          rangeSha256: rangeHash,
        }));
      }
      writtenBytes += sampleFrames * BigInt(bytesPerFrame);
      if (writtenBytes > BigInt(input.policy.maxPcmBytes)) {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_BYTE_LIMIT_EXCEEDED');
      }
      cursor = segmentEnd;
    }
  } finally {
    await output.close();
  }
  if (cursor !== end || writtenBytes !== totalBytes) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_COVERAGE_INCOMPLETE');
  }
  return Object.freeze({
    inputPath: audioPath,
    sampleRate: mapping.sampleRate,
    channelCount: mapping.channelCount,
    sampleFrameCount: (end - start).toString(),
    assembledPcmSha256: digest.digest('hex'),
    pcmRanges: Object.freeze(pcmRanges),
    silenceRanges: Object.freeze(silenceRanges),
    mapping,
  });
}

async function encodeMezzanine(input: Readonly<{
  ffmpegPath: string;
  artifactPath: string;
  timelinePattern: string;
  frameCount: number;
  transform: VideoSourceTimestampConformV3;
  audio: AssembledAudioV1 | null;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}>): Promise<void> {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-framerate', `${input.transform.projectRate.numerator}/${input.transform.projectRate.denominator}`,
    '-start_number', '0', '-i', input.timelinePattern,
  ];
  if (input.audio !== null) {
    args.push(
      '-f', 's32le', '-ar', input.audio.sampleRate,
      '-ac', String(input.audio.channelCount), '-i', input.audio.inputPath,
    );
  }
  args.push(
    '-map', '0:v:0', '-frames:v', String(input.frameCount),
    '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'medium', '-g', '1',
    '-pix_fmt', 'bgr0',
  );
  if (input.audio !== null) args.push('-map', '1:a:0', '-c:a', 'pcm_s32le');
  args.push('-f', 'matroska', '-y', input.artifactPath);
  await execute(input.ffmpegPath, args, input.timeoutMs, 'none', input.abortSignal);
}

async function verifyMezzanine(input: Readonly<{
  ffmpegPath: string;
  ffprobePath: string;
  artifactPath: string;
  frameCount: number;
  width: number;
  height: number;
  expectedRgbSha256: string;
  transformSha256: string;
  audio: AssembledAudioV1 | null;
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
  abortSignal?: AbortSignal;
}>): Promise<Readonly<{ audio: NativeMediaFinalRenderEncodedArtifactV1['audio'] }>> {
  const probe = JSON.parse(await capture(input.ffprobePath, [
    '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', input.artifactPath,
  ], input.policy.timeoutMs, input.abortSignal)) as { streams?: Array<Record<string, unknown>> };
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
  if (video.length !== 1 || video[0]!.codec_name !== 'h264'
    || video[0]!.pix_fmt !== 'gbrp'
    || video[0]!.nb_read_frames !== String(input.frameCount)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_VIDEO_PROFILE_MISMATCH');
  }
  const decodedRgbPath = path.join(path.dirname(input.artifactPath), 'artifact.rgb24');
  await execute(input.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input.artifactPath,
    '-map', '0:v:0', '-an', '-sn', '-dn', '-pix_fmt', 'rgb24',
    '-f', 'rawvideo', '-y', decodedRgbPath,
  ], input.policy.timeoutMs, 'none', input.abortSignal);
  const decodedRgb = await stat(decodedRgbPath);
  const expectedRgbBytes = input.frameCount * input.width * input.height * 3;
  if (!decodedRgb.isFile() || decodedRgb.size !== expectedRgbBytes
    || await hashFile(decodedRgbPath, input.abortSignal) !== input.expectedRgbSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_RGB_NOT_LOSSLESS');
  }
  if (input.audio === null) {
    if (audioStreams.length !== 0) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_UNREQUESTED_AUDIO');
    }
    return Object.freeze({
      audio: Object.freeze({
        disposition: 'NO_AUDIO_MAPPING_REQUESTED' as const,
        audioCodec: null,
        audioMappingSha256: null,
        sourceDecodedPcmSha256: null,
        artifactDecodedPcmSha256: null,
        decodedPcmEquivalenceReceiptSha256: null,
        sampleRate: null,
        channelCount: null,
        decodedSampleFrameCount: null,
      }),
    });
  }
  if (audioStreams.length !== 1 || audioStreams[0]!.codec_name !== 'pcm_s32le'
    || audioStreams[0]!.sample_rate !== input.audio.sampleRate
    || audioStreams[0]!.channels !== input.audio.channelCount) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_AUDIO_PROFILE_MISMATCH');
  }
  const decodedPcmPath = path.join(path.dirname(input.artifactPath), 'artifact.s32le');
  await execute(input.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input.artifactPath,
    '-map', '0:a:0', '-vn', '-sn', '-dn', '-c:a', 'pcm_s32le',
    '-f', 's32le', '-y', decodedPcmPath,
  ], input.policy.timeoutMs, 'none', input.abortSignal);
  const decodedPcm = await stat(decodedPcmPath);
  const expectedPcmBytes = BigInt(input.audio.sampleFrameCount)
    * BigInt(input.audio.channelCount * 4);
  const artifactDecodedPcmSha256 = await hashFile(decodedPcmPath, input.abortSignal);
  if (!decodedPcm.isFile() || BigInt(decodedPcm.size) !== expectedPcmBytes
    || artifactDecodedPcmSha256 !== input.audio.assembledPcmSha256) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_PCM_NOT_LOSSLESS');
  }
  const receipt = createNativeMediaFinalRenderPcmEquivalenceReceiptV1({
    schemaVersion: 1,
    kind: NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1,
    transformSha256: input.transformSha256,
    audioMappingSha256: input.audio.mapping.audioMappingSha256,
    sourceDecodedPcmSha256: input.audio.mapping.decodedPcmSha256,
    artifactDecodedPcmSha256,
    sampleRate: input.audio.sampleRate,
    channelCount: input.audio.channelCount,
    decodedSampleFrameCount: input.audio.sampleFrameCount,
    pcmRanges: input.audio.pcmRanges,
    silenceRanges: input.audio.silenceRanges,
  });
  assertNativeMediaFinalRenderPcmEquivalenceReceiptV1(receipt);
  return Object.freeze({
    audio: Object.freeze({
      disposition: 'EMBEDDED_EXACT_NATIVE_PCM' as const,
      audioCodec: 'pcm_s32le',
      audioMappingSha256: input.audio.mapping.audioMappingSha256,
      sourceDecodedPcmSha256: input.audio.mapping.decodedPcmSha256,
      artifactDecodedPcmSha256,
      decodedPcmEquivalenceReceiptSha256: receipt.receiptSha256,
      sampleRate: input.audio.sampleRate,
      channelCount: input.audio.channelCount,
      decodedSampleFrameCount: input.audio.sampleFrameCount,
    }),
  });
}

async function qualifyRuntime(input: Readonly<{
  ffmpegPath: string;
  ffprobePath: string;
  profile: NativeMediaFinalRenderProfileReceiptV1;
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1;
}>): Promise<void> {
  const ffmpegVersion = (await capture(input.ffmpegPath, [
    '-hide_banner', '-version',
  ], input.policy.timeoutMs)).split(/\r?\n/, 1)[0]!.trim();
  const ffprobeVersion = (await capture(input.ffprobePath, [
    '-hide_banner', '-version',
  ], input.policy.timeoutMs)).split(/\r?\n/, 1)[0]!.trim();
  const ffmpegToken = toolVersionToken(ffmpegVersion, 'ffmpeg');
  const ffprobeToken = toolVersionToken(ffprobeVersion, 'ffprobe');
  const ffmpegMajor = Number(/^\d+/.exec(ffmpegToken)?.[0]);
  const compositorPackage = compositorPackageName();
  if (input.profile.platform !== `${process.platform}-${process.arch}`
    || input.profile.ffmpegVersion !== ffmpegVersion
    || ffprobeToken !== ffmpegToken
    || !Number.isSafeInteger(ffmpegMajor) || ffmpegMajor < 7
    || input.profile.remotionVersion !== String(require('remotion/package.json').version)
    || input.profile.compositorPackageVersion
      !== String(require(`${compositorPackage}/package.json`).version)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_PROFILE_MISMATCH');
  }
}

function toolVersionToken(line: string, tool: 'ffmpeg' | 'ffprobe'): string {
  const match = new RegExp(`^${tool} version ([^\\s]+)`).exec(line);
  if (!match) throw new Error('NATIVE_MEDIA_FINAL_RENDER_RUNTIME_VERSION_INVALID');
  return match[1]!;
}

function assertSupportedSourceVideo(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
  transform: VideoSourceTimestampConformV3,
  policy: NativeMediaFinalRenderFfmpegEncoderPolicyV1,
): void {
  const qualification = asset.sourceQualificationV1 as {
    observation?: { videoStreams?: unknown };
  } | undefined;
  const streams = qualification?.observation?.videoStreams;
  if (!Array.isArray(streams)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_VIDEO_OBSERVATION_REQUIRED');
  }
  const stream = streams.find((value) => value && typeof value === 'object'
    && (value as { streamIndex?: unknown }).streamIndex
      === transform.sourceBinding.videoStreamIndex) as Record<string, unknown> | undefined;
  const width = stream?.codedWidth;
  const height = stream?.codedHeight;
  const pixelFormat = stream?.pixelFormat;
  const transfer = stream?.colorTransfer;
  if (!stream || !Number.isSafeInteger(width) || Number(width) < 1
    || !Number.isSafeInteger(height) || Number(height) < 1
    || Number(width) > policy.maxDimension || Number(height) > policy.maxDimension
    || typeof pixelFormat !== 'string' || !SUPPORTED_SDR_PIXEL_FORMATS_V1.has(pixelFormat)
    || (typeof transfer === 'string' && HDR_TRANSFERS_V1.has(transfer))) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_SOURCE_PIXEL_PROFILE_UNSUPPORTED');
  }
}

function defaultSourceLeaseFactory(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): VerifiedMediaSourceLeasePortV1 {
  return createVerifiedAssetMediaSourceLeasePortV1(asset, {
    bindingStale: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_BINDING_STALE',
    versionStale: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_VERSION_STALE',
  });
}

function normalizePolicy(
  value: NativeMediaFinalRenderFfmpegEncoderPolicyV1,
): NativeMediaFinalRenderFfmpegEncoderPolicyV1 {
  const positive = (candidate: unknown, maximum: number) => (
    Number.isSafeInteger(candidate) && Number(candidate) > 0 && Number(candidate) <= maximum
  );
  if (!value || value.policyVersion !== NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1
    || !positive(value.maxSourceBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.maxTimelineFrames, MAX_TIMELINE_FRAMES_V1)
    || !positive(value.maxFrameBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.maxDecodedSequenceBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.maxPcmBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.maxArtifactBytes, Number.MAX_SAFE_INTEGER)
    || !positive(value.maxDimension, 32_768)
    || !positive(value.timeoutMs, MAX_TIMEOUT_MS_V1)
    || value.maxFrameBytes > value.maxDecodedSequenceBytes) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ENCODER_POLICY_INVALID');
  }
  return Object.freeze({ ...value });
}

function parseShowInfo(stderr: string): readonly Readonly<{
  presentationTimestampTicks: string;
  width: number;
  height: number;
}>[] {
  const frames = [];
  for (const line of stderr.split(/\r?\n/)) {
    if (!line.includes('showinfo') || !line.includes(' n:') || !line.includes(' pts:')) continue;
    const match = /\bpts:\s*(-?\d+)\b.*\bs:(\d+)x(\d+)\b/.exec(line);
    if (!match) throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODER_METADATA_INVALID');
    const width = Number(match[2]);
    const height = Number(match[3]);
    if (!Number.isSafeInteger(width) || width < 1
      || !Number.isSafeInteger(height) || height < 1) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_DECODER_GEOMETRY_INVALID');
    }
    frames.push(Object.freeze({
      presentationTimestampTicks: BigInt(match[1]!).toString(),
      width,
      height,
    }));
  }
  return Object.freeze(frames);
}

async function writeSilence(
  output: Awaited<ReturnType<typeof open>>,
  digest: ReturnType<typeof createHash>,
  sampleFrames: bigint,
  bytesPerFrame: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  let remaining = sampleFrames * BigInt(bytesPerFrame);
  const chunkSize = 1024 * 1024 - (1024 * 1024) % bytesPerFrame;
  const zeroes = Buffer.alloc(chunkSize);
  while (remaining > BigInt(0)) {
    throwIfAborted(abortSignal);
    const length = Number(remaining < BigInt(chunkSize) ? remaining : BigInt(chunkSize));
    const chunk = zeroes.subarray(0, length);
    await writeExact(output, chunk, abortSignal);
    digest.update(chunk);
    remaining -= BigInt(length);
  }
}

async function writeExact(
  output: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
  abortSignal?: AbortSignal,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    throwIfAborted(abortSignal);
    const result = await output.write(bytes, offset, bytes.byteLength - offset);
    if (result.bytesWritten < 1) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_PCM_WRITE_INCOMPLETE');
    }
    offset += result.bytesWritten;
  }
}

function integerPosition(value: Readonly<{
  numerator: string;
  denominator: string;
  disposition: 'INTEGER_SAMPLE_FRAME' | 'BETWEEN_SAMPLE_FRAMES';
}>): bigint {
  if (!value || !/^-?(0|[1-9]\d{0,127})$/.test(value.numerator)
    || !/^[1-9]\d{0,127}$/.test(value.denominator)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_AUDIO_POSITION_INVALID');
  }
  const numerator = BigInt(value.numerator);
  const denominator = BigInt(value.denominator);
  if (value.disposition !== 'INTEGER_SAMPLE_FRAME'
    || numerator < BigInt(0) || numerator % denominator !== BigInt(0)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_FRACTIONAL_AUDIO_UNSUPPORTED');
  }
  return numerator / denominator;
}

async function hashFile(filePath: string, abortSignal?: AbortSignal): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    throwIfAborted(abortSignal);
    digest.update(chunk as Buffer);
  }
  return digest.digest('hex');
}

async function capture(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<string> {
  return execute(command, args, timeoutMs, 'stdout', abortSignal);
}

async function execute(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  capture: 'none' | 'stderr' | 'stdout',
  abortSignal?: AbortSignal,
): Promise<string> {
  throwIfAborted(abortSignal);
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      windowsHide: true,
      stdio: ['ignore', capture === 'stdout' ? 'pipe' : 'ignore', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let termination: Error | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error: Error | null, value = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => {
      if (settled || termination) return;
      termination = new Error('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_CANCELLED');
      child.kill('SIGKILL');
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();
    timer = setTimeout(() => {
      termination = new Error('NATIVE_MEDIA_FINAL_RENDER_PROCESS_TIMEOUT');
      child.kill();
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + chunk.byteLength > MAX_PROCESS_DIAGNOSTIC_BYTES_V1) {
        termination ??= new Error('NATIVE_MEDIA_FINAL_RENDER_PROCESS_OUTPUT_LIMIT');
        child.kill();
      } else stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) + chunk.byteLength > MAX_PROCESS_DIAGNOSTIC_BYTES_V1) {
        termination ??= new Error('NATIVE_MEDIA_FINAL_RENDER_PROCESS_DIAGNOSTIC_LIMIT');
        child.kill();
      } else stderr += chunk.toString('utf8');
    });
    child.once('error', () => finish(new Error('NATIVE_MEDIA_FINAL_RENDER_PROCESS_UNAVAILABLE')));
    child.once('close', (code) => finish(
      termination ?? (code === 0
        ? null
        : new Error('NATIVE_MEDIA_FINAL_RENDER_PROCESS_FAILED')),
      capture === 'stdout' ? stdout : capture === 'stderr' ? stderr : '',
    ));
  });
}

function compositorPackageName(): string {
  if (process.platform === 'win32' && process.arch === 'x64') {
    return '@remotion/compositor-win32-x64-msvc';
  }
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return '@remotion/compositor-darwin-arm64';
  }
  if (process.platform === 'darwin' && process.arch === 'x64') {
    return '@remotion/compositor-darwin-x64';
  }
  if (process.platform === 'linux' && process.arch === 'arm64') {
    return '@remotion/compositor-linux-arm64-gnu';
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return '@remotion/compositor-linux-x64-gnu';
  }
  throw new Error('NATIVE_MEDIA_FINAL_RENDER_PLATFORM_UNSUPPORTED');
}

function executable(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 4096
    || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_EXECUTABLE_INVALID');
  }
  return value.trim();
}

function handle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 1024
    || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_HANDLE_INVALID');
  }
  return value.trim();
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,200}$/.test(error.message)
    ? error.message
    : null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_EXECUTION_CANCELLED');
  }
}

async function removeOwnedDirectory(directory: string): Promise<void> {
  const root = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(root) || !path.basename(resolved).startsWith(TEMP_PREFIX_V1)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_TEMP_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}
