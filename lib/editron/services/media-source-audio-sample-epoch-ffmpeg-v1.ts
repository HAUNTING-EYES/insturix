import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import {
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  assertMediaSourceAudioSampleEpochResourcePolicyV1,
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  serializeMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioDecodedFrameEvidenceV1,
  type MediaSourceAudioSampleEpochMapSerializationV1,
  type MediaSourceAudioSampleEpochResourcePolicyV1,
} from './media-source-audio-sample-epoch-map-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import { sameMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';
import { assertMediaSourceVersionV1, type MediaSourceVersionV1 } from './media-source-version-v1';
import { getFFmpegPath } from './media/ffmpeg-runtime';
import type { NativeMediaTimestampPreviewSourceLeasePortV1 } from './native-media-timestamp-ffmpeg-preview-decoder-v1';

const TEMP_PREFIX = 'editron-audio-sample-epoch-v1-';
const MAX_PROCESS_DIAGNOSTIC_BYTES = 1024 * 1024;
const MAX_FRAME_RECORD_BYTES = 4 * 1024;
const MAX_TOOL_IDENTITY_BYTES = 16 * 1024;

/**
 * Server-only evidence adapter. It measures source PTS and decoded PCM but
 * does not persist an artifact, expose a browser handle, authorize playback,
 * or mutate a project. Those remain later owners.
 */
export async function materializeMediaSourceAudioSampleEpochMapFfmpegV1(input: Readonly<{
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  audioStreamIndex: number;
  sourceLease: NativeMediaTimestampPreviewSourceLeasePortV1;
  resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
  ffmpegPath?: string;
  ffprobePath?: string;
}>): Promise<MediaSourceAudioSampleEpochMapSerializationV1> {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  const resourcePolicy = assertMediaSourceAudioSampleEpochResourcePolicyV1(
    input.resourcePolicy,
  );
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion,
    qualification: input.qualification,
    audioStreamIndex: input.audioStreamIndex,
  });
  if (sourceVersion.byteLength > resourcePolicy.maxSourceBytes) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_BYTE_LIMIT_EXCEEDED');
  }
  const lease = await input.sourceLease.open(sourceVersion);
  if (!sameMediaSourceStorageVersionV1(lease.storageVersion, sourceVersion.storageVersion)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_VERSION_STALE');
  }

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), TEMP_PREFIX));
  try {
    const sourcePath = path.join(temporaryDirectory, 'source.bin');
    const pcmPath = path.join(temporaryDirectory, 'decoded.s32le');
    await downloadExactSource(
      lease.sourceUrl,
      sourcePath,
      sourceVersion,
      resourcePolicy.maxSourceBytes,
      resourcePolicy.timeoutMs,
    );
    if (!await lease.revalidate()) {
      throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_VERSION_STALE');
    }

    const ffmpegPath = input.ffmpegPath ?? getFFmpegPath();
    const ffprobePath = input.ffprobePath ?? 'ffprobe';
    const [ffmpegVersion, ffprobeVersion, frames] = await Promise.all([
      readToolIdentity(ffmpegPath, resourcePolicy.timeoutMs, 'FFMPEG'),
      readToolIdentity(ffprobePath, resourcePolicy.timeoutMs, 'FFPROBE'),
      scanDecodedAudioFrames({
        ffprobePath,
        sourcePath,
        audioStreamIndex: binding.audioStreamIndex,
        policy: resourcePolicy,
      }),
    ]);
    await decodePcm({
      ffmpegPath,
      sourcePath,
      pcmPath,
      audioStreamIndex: binding.audioStreamIndex,
      channelCount: binding.channelCount,
      policy: resourcePolicy,
    });
    if (!await lease.revalidate()) {
      throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_VERSION_STALE');
    }
    const pcm = await inspectPcm(pcmPath, resourcePolicy.maxDecodedPcmBytes);
    const map = createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: {
        adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
        ffmpegVersion,
        ffprobeVersion,
      },
      resourcePolicy,
      frames,
      pcm,
    });
    return serializeMediaSourceAudioSampleEpochMapV1(map);
  } finally {
    await removeOwnedTemporaryDirectory(temporaryDirectory);
  }
}

async function scanDecodedAudioFrames(input: Readonly<{
  ffprobePath: string;
  sourcePath: string;
  audioStreamIndex: number;
  policy: MediaSourceAudioSampleEpochResourcePolicyV1;
}>): Promise<readonly MediaSourceAudioDecodedFrameEvidenceV1[]> {
  const child = spawn(input.ffprobePath, [
    '-v', 'error',
    '-select_streams', String(input.audioStreamIndex),
    '-show_frames',
    '-show_entries', 'frame=stream_index,best_effort_timestamp,nb_samples',
    '-of', 'compact=p=0:nk=0',
    input.sourcePath,
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const frames: MediaSourceAudioDecodedFrameEvidenceV1[] = [];
  let terminationError: Error | null = null;
  let stderr = '';
  let settled = false;
  const timer = setTimeout(() => {
    terminationError = new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFPROBE_TIMEOUT');
    child.kill();
  }, input.policy.timeoutMs);
  child.stderr.on('data', (chunk: Buffer) => {
    if (Buffer.byteLength(stderr) + chunk.byteLength > MAX_PROCESS_DIAGNOSTIC_BYTES) {
      terminationError ??=
        new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFPROBE_DIAGNOSTIC_LIMIT_EXCEEDED');
      child.kill();
      return;
    }
    stderr += chunk.toString('utf8');
  });
  const closed = new Promise<number | null>((resolve) => {
    child.once('error', () => {
      terminationError ??= new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFPROBE_UNAVAILABLE');
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });
    child.once('close', (code) => {
      if (!settled) {
        settled = true;
        resolve(code);
      }
    });
  });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (Buffer.byteLength(line, 'utf8') > MAX_FRAME_RECORD_BYTES) {
        terminationError = new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_RECORD_TOO_LARGE');
        child.kill();
        break;
      }
      if (frames.length >= input.policy.maxDecodedFrameEntries) {
        terminationError = new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_LIMIT_EXCEEDED');
        child.kill();
        break;
      }
      frames.push(parseFrameRecord(line, input.audioStreamIndex));
    }
  } catch (error) {
    terminationError ??= error instanceof Error
      ? error
      : new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_STREAM_FAILED');
    child.kill();
  } finally {
    lines.close();
  }
  const exitCode = await closed;
  clearTimeout(timer);
  if (terminationError) throw terminationError;
  if (exitCode !== 0) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFPROBE_FAILED');
  }
  if (frames.length === 0) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_NO_DECODED_FRAMES');
  }
  return frames;
}

function parseFrameRecord(
  line: string,
  expectedStreamIndex: number,
): MediaSourceAudioDecodedFrameEvidenceV1 {
  const values = new Map<string, string>();
  for (const token of line.split('|')) {
    const separator = token.indexOf('=');
    if (separator < 0) continue;
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (values.has(key)) {
      throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_RECORD_DUPLICATE_FIELD');
    }
    values.set(key, value);
  }
  const streamIndex = values.get('stream_index');
  const presentationTimestampTicks = values.get('best_effort_timestamp');
  const decodedSampleFrameCount = values.get('nb_samples');
  if (streamIndex !== String(expectedStreamIndex)
    || !presentationTimestampTicks
    || !/^-?(0|[1-9]\d{0,127})$/.test(presentationTimestampTicks)
    || !decodedSampleFrameCount
    || !/^[1-9]\d{0,127}$/.test(decodedSampleFrameCount)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_RECORD_INVALID');
  }
  return {
    presentationTimestampTicks: BigInt(presentationTimestampTicks).toString(),
    decodedSampleFrameCount: BigInt(decodedSampleFrameCount).toString(),
  };
}

async function decodePcm(input: Readonly<{
  ffmpegPath: string;
  sourcePath: string;
  pcmPath: string;
  audioStreamIndex: number;
  channelCount: number;
  policy: MediaSourceAudioSampleEpochResourcePolicyV1;
}>): Promise<void> {
  const bytesPerSampleFrame = input.channelCount * 4;
  const outputLimit = input.policy.maxDecodedPcmBytes
    > Number.MAX_SAFE_INTEGER - bytesPerSampleFrame
    ? Number.MAX_SAFE_INTEGER
    : input.policy.maxDecodedPcmBytes + bytesPerSampleFrame;
  await executeBounded(input.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-copyts', '-i', input.sourcePath,
    '-map', `0:${input.audioStreamIndex}`,
    '-vn', '-sn', '-dn',
    '-c:a', 'pcm_s32le',
    '-f', 's32le',
    '-fs', String(outputLimit),
    '-y', input.pcmPath,
  ], input.policy.timeoutMs, 'FFMPEG');
}

async function inspectPcm(
  pcmPath: string,
  maximumBytes: number,
): Promise<Readonly<{ decodedByteLength: number; decodedPcmSha256: string }>> {
  const file = await stat(pcmPath);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maximumBytes) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_BYTE_LIMIT_EXCEEDED');
  }
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(pcmPath)) digest.update(chunk as Buffer);
  return { decodedByteLength: file.size, decodedPcmSha256: digest.digest('hex') };
}

async function readToolIdentity(
  executable: string,
  timeoutMs: number,
  tool: 'FFMPEG' | 'FFPROBE',
): Promise<string> {
  const stdout = await captureBounded(executable, ['-version'], timeoutMs, tool);
  const identity = stdout.split(/\r?\n/, 1)[0]?.trim();
  if (!identity || identity.length > 256 || /[\u0000-\u001F\u007F]/.test(identity)) {
    throw new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_VERSION_INVALID`);
  }
  return identity;
}

async function captureBounded(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
  tool: 'FFMPEG' | 'FFPROBE',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let terminationError: Error | null = null;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(stdout);
    };
    const timer = setTimeout(() => {
      terminationError = new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_TIMEOUT`);
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + chunk.byteLength > MAX_TOOL_IDENTITY_BYTES) {
        terminationError ??=
          new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_IDENTITY_LIMIT_EXCEEDED`);
        child.kill();
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) + chunk.byteLength > MAX_TOOL_IDENTITY_BYTES) {
        terminationError ??=
          new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_IDENTITY_LIMIT_EXCEEDED`);
        child.kill();
        return;
      }
      stderr += chunk.toString('utf8');
    });
    child.once('error', () => finish(
      new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_UNAVAILABLE`),
    ));
    child.once('close', (code) => finish(
      terminationError ?? (code === 0
        ? null
        : new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_FAILED`)),
    ));
  });
}

async function executeBounded(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
  tool: 'FFMPEG',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderrBytes = 0;
    let settled = false;
    let terminationError: Error | null = null;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      terminationError = new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_TIMEOUT`);
      child.kill();
    }, timeoutMs);
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_PROCESS_DIAGNOSTIC_BYTES) {
        terminationError ??=
          new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_DIAGNOSTIC_LIMIT_EXCEEDED`);
        child.kill();
      }
    });
    child.once('error', () => finish(
      new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_UNAVAILABLE`),
    ));
    child.once('close', (code) => finish(
      terminationError ?? (code === 0
        ? null
        : new Error(`MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_${tool}_FAILED`)),
    ));
  });
}

async function downloadExactSource(
  sourceUrl: string,
  outputPath: string,
  sourceVersion: Readonly<MediaSourceVersionV1>,
  maximumBytes: number,
  timeoutMs: number,
): Promise<void> {
  if (sourceVersion.byteLength > maximumBytes) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_BYTE_LIMIT_EXCEEDED');
  }
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_URL_INVALID');
  }
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'accept-encoding': 'identity' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
  if (!response.ok || !response.body || (encoding && encoding !== 'identity')) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_READ_FAILED');
  }
  const digest = createHash('sha256');
  let byteLength = 0;
  const verifier = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      byteLength += chunk.byteLength;
      if (byteLength > sourceVersion.byteLength || byteLength > maximumBytes) {
        callback(new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_BYTE_LENGTH_MISMATCH'));
        return;
      }
      digest.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
    verifier,
    createWriteStream(outputPath, { flags: 'wx' }),
  );
  if (byteLength !== sourceVersion.byteLength
    || digest.digest('hex') !== sourceVersion.contentSha256) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_CONTENT_MISMATCH');
  }
}

async function removeOwnedTemporaryDirectory(directory: string): Promise<void> {
  const temporaryRoot = `${path.resolve(tmpdir())}${path.sep}`;
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(temporaryRoot)
    || !path.basename(resolved).startsWith(TEMP_PREFIX)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_TEMP_DIRECTORY_INVALID');
  }
  await rm(resolved, { force: true, recursive: true });
}
