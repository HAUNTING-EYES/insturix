import { spawn } from 'node:child_process';
import { COPYFILE_EXCL } from 'node:constants';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertTransform: vi.fn((value) => value),
}));

vi.mock('@/lib/editron/services/video-source-time-transform-v1', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/video-source-time-transform-v1')
  >();
  return { ...actual, assertVideoSourceTimestampConformV3: mocks.assertTransform };
});

import {
  createNativeMediaFinalRenderFfmpegEncoderV1,
  NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import {
  assertNativeMediaFinalRenderPcmEquivalenceReceiptV1,
  createNativeMediaFinalRenderPcmEquivalenceReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1,
} from '@/lib/editron/services/native-media-final-render-pcm-equivalence-v1';
import {
  createNativeMediaFinalRenderProfileReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1,
  NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-profile-v1';
import type { MediaSourceAudioPrivateArtifactStoreV1 } from '@/lib/editron/services/media-source-audio-r2-private-artifact-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

const require = createRequire(import.meta.url);
const FRAME_COUNT = 3;
const OUTPUT_FRAME_COUNT = 4;
const WIDTH = 64;
const HEIGHT = 64;
const SAMPLE_RATE = 48_000;
const CHANNEL_COUNT = 2;
const SAMPLE_FRAME_COUNT = 6_400;
const TIMEOUT_MS = 120_000;
const HASH = Object.freeze({
  binding: '1'.repeat(64),
  map: '4'.repeat(64),
  manifest: '5'.repeat(64),
  transform: '6'.repeat(64),
  audioMapping: '7'.repeat(64),
});

let directory = '';
let sourcePath = '';
let sourceUrl = '';
let sourceRgb: Uint8Array = new Uint8Array();
let sourcePcm: Uint8Array = new Uint8Array();
let sourceVersion: ReturnType<typeof createMediaSourceVersionV1>;
let pts: string[] = [];
let ffmpegPath = '';
let ffprobePath = '';
let server: Server;
let profile: ReturnType<typeof createNativeMediaFinalRenderProfileReceiptV1>;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'editron-final-encoder-test-'));
  ffmpegPath = process.env.EDITRON_FINAL_RENDER_FFMPEG_PATH?.trim() || 'ffmpeg';
  ffprobePath = process.env.EDITRON_FINAL_RENDER_FFPROBE_PATH?.trim() || 'ffprobe';
  sourceRgb = deterministicRgbFrames();
  sourcePcm = deterministicStereoPcm();
  const rawPath = path.join(directory, 'source.rgb24');
  sourcePath = path.join(directory, 'source.mkv');
  await writeFile(rawPath, sourceRgb, { flag: 'wx' });
  await execute(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${WIDTH}x${HEIGHT}`,
    '-framerate', '30', '-i', rawPath,
    '-frames:v', String(FRAME_COUNT), '-c:v', 'libx264rgb', '-crf', '0',
    '-preset', 'medium', '-g', '1', '-pix_fmt', 'bgr0',
    '-f', 'matroska', '-y', sourcePath,
  ]);
  const sourceProbe = JSON.parse(await capture(ffprobePath, [
    '-v', 'error', '-select_streams', 'v:0', '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp', '-of', 'json', sourcePath,
  ])) as { frames?: Array<{ best_effort_timestamp?: string }> };
  pts = sourceProbe.frames?.map((frame) => String(frame.best_effort_timestamp)) ?? [];
  expect(pts).toHaveLength(FRAME_COUNT);
  const sourceBytes = await readFile(sourcePath);
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'tests/exact-source.mkv' },
    byteLength: sourceBytes.byteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'test-source-etag-v1' },
  });
  sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: sourceBytes.byteLength,
    contentSha256: digest(sourceBytes),
    storageVersion,
  });
  server = createServer((request, response) => {
    if (request.url !== '/source.mkv') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'video/x-matroska',
      'content-length': String(sourceBytes.byteLength),
    });
    createReadStream(sourcePath).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS_INVALID');
  sourceUrl = `http://127.0.0.1:${address.port}/source.mkv`;

  const ffmpegVersion = (await capture(ffmpegPath, ['-hide_banner', '-version']))
    .split(/\r?\n/, 1)[0]!.trim();
  profile = createNativeMediaFinalRenderProfileReceiptV1({
    schemaVersion: 1,
    kind: NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1,
    profileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
    platform: `${process.platform}-${process.arch}`,
    ffmpegVersion,
    remotionVersion: String(require('remotion/package.json').version),
    compositorPackageVersion: compositorVersion(),
    container: 'matroska',
    videoEncoder: 'libx264rgb',
    videoCodec: 'h264',
    pixelFormat: 'gbrp',
    videoLosslessMode: 'CRF_0_INTRA_ONLY',
    audioCodec: 'pcm_s32le',
    sourceDecodedRgbSha256: 'a'.repeat(64),
    artifactDecodedRgbSha256: 'a'.repeat(64),
    sourceDecodedPcmSha256: 'b'.repeat(64),
    artifactDecodedPcmSha256: 'b'.repeat(64),
    sourceVideoFrameCount: '4',
    remotionVideoFrameCount: '4',
    sourceAudioSampleFrameCount: '6400',
    remotionOutputVideoCodec: 'h264',
    remotionOutputAudioCodec: 'aac',
    browserErrorCount: 0,
  });
}, TIMEOUT_MS);

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  if (directory) await rm(directory, { force: true, recursive: true });
});

describe.sequential('native media final-render FFmpeg encoder v1', () => {
  it('materializes repeated exact frames and no unrequested audio', async () => {
    const runtime = setup();
    const result = await runtime.encoder.encode({
      asset: asset() as never,
      transform: transform(null) as never,
      audioEvidence: null,
    });

    expect(result.disposition).toBe('ARTIFACT_ENCODED');
    if (result.disposition !== 'ARTIFACT_ENCODED') return;
    expect(result.encoded).toMatchObject({
      container: 'matroska',
      videoCodec: 'h264',
      pixelFormat: 'gbrp',
      videoFrameCount: String(OUTPUT_FRAME_COUNT),
      remotionCompatibilityReceiptSha256: profile.receiptSha256,
      audio: { disposition: 'NO_AUDIO_MAPPING_REQUESTED' },
    });
    expect(await decodeRgb(runtime.stagedPath)).toEqual(expectedTimelineRgb());
    const streams = await probeStreams(runtime.stagedPath);
    expect(streams.filter((stream) => stream.codec_type === 'audio')).toHaveLength(0);
    expect(runtime.revalidate).toHaveBeenCalledTimes(2);
    expect(runtime.stage).toHaveBeenCalledTimes(1);
  }, TIMEOUT_MS);

  it('assembles verified PCM and explicit silence without waveform changes', async () => {
    const expectedPcm = Buffer.concat([
      sourcePcm.subarray(0, 3_200 * CHANNEL_COUNT * 4),
      Buffer.alloc(800 * CHANNEL_COUNT * 4),
      sourcePcm.subarray(3_200 * CHANNEL_COUNT * 4, 5_600 * CHANNEL_COUNT * 4),
    ]);
    const pcmReader = { readPcmSampleRange: vi.fn(async (range) => {
      const start = Number(range.startSampleFrame);
      const end = Number(range.endExclusiveSampleFrame);
      const pcmBytes = sourcePcm.subarray(start * CHANNEL_COUNT * 4, end * CHANNEL_COUNT * 4);
      return {
        manifestSha256: HASH.manifest,
        audioSampleEpochMapSha256: HASH.map,
        decodedPcmSha256: digest(sourcePcm),
        streamId: 'audio-0',
        sampleRate: String(SAMPLE_RATE),
        channelCount: CHANNEL_COUNT,
        startSampleFrame: String(start),
        endExclusiveSampleFrame: String(end),
        pcmBytes,
        rangeSha256: digest(pcmBytes),
      };
    }) };
    const runtime = setup({ pcmReader });
    const result = await runtime.encoder.encode({
      asset: asset() as never,
      transform: transform(audioMapping()) as never,
      audioEvidence: audioEvidence() as never,
    });

    expect(result.disposition).toBe('ARTIFACT_ENCODED');
    if (result.disposition !== 'ARTIFACT_ENCODED') return;
    expect(result.encoded.audio).toMatchObject({
      disposition: 'EMBEDDED_EXACT_NATIVE_PCM',
      audioCodec: 'pcm_s32le',
      audioMappingSha256: HASH.audioMapping,
      sourceDecodedPcmSha256: digest(sourcePcm),
      artifactDecodedPcmSha256: digest(expectedPcm),
      sampleRate: String(SAMPLE_RATE),
      channelCount: CHANNEL_COUNT,
      decodedSampleFrameCount: String(SAMPLE_FRAME_COUNT),
    });
    expect(await decodePcm(runtime.stagedPath)).toEqual(expectedPcm);
    expect(pcmReader.readPcmSampleRange).toHaveBeenCalledTimes(2);
  }, TIMEOUT_MS);

  it('blocks an unprofiled project rate before opening the source', async () => {
    const runtime = setup();
    const incompatible = transform(null);
    incompatible.projectRate = { numerator: '30000', denominator: '1001' };
    const result = await runtime.encoder.encode({
      asset: asset() as never,
      transform: incompatible as never,
      audioEvidence: null,
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PROJECT_RATE_NOT_PROFILED',
    });
    expect(runtime.openLease).not.toHaveBeenCalled();
    expect(runtime.stage).not.toHaveBeenCalled();
  });

  it('rejects caller cancellation before opening or staging source media', async () => {
    const runtime = setup();
    const controller = new AbortController();
    controller.abort();
    const result = await runtime.encoder.encode({
      asset: asset() as never,
      transform: transform(null) as never,
      audioEvidence: null,
      abortSignal: controller.signal,
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_CANCELLED',
    });
    expect(runtime.openLease).not.toHaveBeenCalled();
    expect(runtime.stage).not.toHaveBeenCalled();
  });

  it('rejects a source that changes before staging', async () => {
    const runtime = setup({ revalidate: vi.fn(async () => false) });
    const result = await runtime.encoder.encode({
      asset: asset() as never,
      transform: transform(null) as never,
      audioEvidence: null,
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_SOURCE_VERSION_STALE',
    });
    expect(runtime.stage).not.toHaveBeenCalled();
  });
});

describe('native final-render PCM equivalence receipt v1', () => {
  it('binds range/silence coverage and rejects mutation', () => {
    const receipt = createNativeMediaFinalRenderPcmEquivalenceReceiptV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_FINAL_RENDER_PCM_EQUIVALENCE_KIND_V1,
      transformSha256: HASH.transform,
      audioMappingSha256: HASH.audioMapping,
      sourceDecodedPcmSha256: digest(sourcePcm),
      artifactDecodedPcmSha256: '8'.repeat(64),
      sampleRate: String(SAMPLE_RATE),
      channelCount: CHANNEL_COUNT,
      decodedSampleFrameCount: '10',
      pcmRanges: [{
        segmentOrdinal: '0', sourceStartSampleFrame: '20',
        sourceEndExclusiveSampleFrame: '26', rangeSha256: '9'.repeat(64),
      }],
      silenceRanges: [{ segmentOrdinal: '1', sampleFrameCount: '4' }],
    });
    expect(assertNativeMediaFinalRenderPcmEquivalenceReceiptV1(receipt)).toEqual(receipt);
    expect(() => assertNativeMediaFinalRenderPcmEquivalenceReceiptV1({
      ...receipt,
      decodedSampleFrameCount: '11',
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PCM_COVERAGE_MISMATCH');
    expect(() => createNativeMediaFinalRenderPcmEquivalenceReceiptV1({
      ...receipt,
      decodedSampleFrameCount: '9',
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PCM_COVERAGE_MISMATCH');
  });
});

function setup(options: Readonly<{
  pcmReader?: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
  revalidate?: () => Promise<boolean>;
}> = {}) {
  const stagedPath = path.join(directory, `staged-${randomUUID()}.mkv`);
  const revalidate = options.revalidate ?? vi.fn(async () => true);
  const openLease = vi.fn(async () => ({
    sourceUrl,
    storageVersion: sourceVersion.storageVersion,
    revalidate,
  }));
  const stage = vi.fn(async (input: Readonly<{
    localPath: string;
    artifactContentSha256: string;
    artifactByteLength: string;
  }>) => {
    await copyFile(input.localPath, stagedPath, COPYFILE_EXCL);
    const staged = await readFile(stagedPath);
    return {
      publishHandle: `local:${path.basename(stagedPath)}`,
      artifactHandle: `sha256:${digest(staged)}`,
      artifactContentSha256: digest(staged),
      artifactByteLength: String(staged.byteLength),
    };
  });
  const encoder = createNativeMediaFinalRenderFfmpegEncoderV1({
    ffmpegPath,
    ffprobePath,
    compatibilityReceipt: profile,
    artifactStager: { stage: stage as never },
    ...(options.pcmReader ? { pcmReader: options.pcmReader as never } : {}),
    sourceLeaseFactory: () => ({ open: openLease as never }),
    policy: {
      policyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      maxSourceBytes: 10 * 1024 * 1024,
      maxTimelineFrames: 100,
      maxFrameBytes: 1024 * 1024,
      maxDecodedSequenceBytes: 100 * 1024 * 1024,
      maxPcmBytes: 100 * 1024 * 1024,
      maxArtifactBytes: 100 * 1024 * 1024,
      maxDimension: 1024,
      timeoutMs: TIMEOUT_MS,
    },
  });
  return { encoder, stagedPath, revalidate, openLease, stage };
}

function asset() {
  return {
    assetId: 'asset-1',
    type: 'video' as const,
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: {
      observation: {
        videoStreams: [{
          streamIndex: 0,
          codedWidth: WIDTH,
          codedHeight: HEIGHT,
          pixelFormat: 'gbrp',
          colorTransfer: null,
        }],
      },
    },
  };
}

function transform(mapping: ReturnType<typeof audioMapping> | null) {
  const ordinals = ['0', '1', '1', '2'];
  return {
    sourceBinding: {
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
      sourceBindingSha256: HASH.binding,
      videoStreamIndex: 0,
    },
    projectRate: { numerator: '30', denominator: '1' },
    frameSelections: ordinals.map((sourceFrameOrdinal, index) => ({
      timelineFrame: String(index),
      sourceFrameOrdinal,
      epochId: 'epoch-0',
      presentationTimestampTicks: pts[Number(sourceFrameOrdinal)]!,
      selection: 'COVERING_PRESENTATION',
    })),
    audioMapping: mapping,
    transformSha256: HASH.transform,
  };
}

function audioMapping() {
  return {
    sourceBindingSha256: HASH.binding,
    audioSampleEpochMapSha256: HASH.map,
    decodedPcmSha256: digest(sourcePcm),
    streamId: 'audio-0',
    audioStreamIndex: 0,
    sampleRate: String(SAMPLE_RATE),
    channelCount: CHANNEL_COUNT,
    canonicalTimelineStartSamplePosition: position(0),
    canonicalTimelineEndExclusiveSamplePosition: position(SAMPLE_FRAME_COUNT),
    segments: [
      {
        kind: 'PCM' as const,
        canonicalStartSamplePosition: position(0),
        canonicalEndExclusiveSamplePosition: position(3_200),
        decodedStartSamplePosition: position(0),
        decodedEndExclusiveSamplePosition: position(3_200),
      },
      {
        kind: 'SILENCE' as const,
        canonicalStartSamplePosition: position(3_200),
        canonicalEndExclusiveSamplePosition: position(4_000),
      },
      {
        kind: 'PCM' as const,
        canonicalStartSamplePosition: position(4_000),
        canonicalEndExclusiveSamplePosition: position(6_400),
        decodedStartSamplePosition: position(3_200),
        decodedEndExclusiveSamplePosition: position(5_600),
      },
    ],
    audioMappingSha256: HASH.audioMapping,
  };
}

function audioEvidence() {
  return {
    record: {
      audioStreamIndex: 0,
      audioSampleEpochMapSha256: HASH.map,
      decodedPcmSha256: digest(sourcePcm),
      sampleRate: String(SAMPLE_RATE),
      channelCount: CHANNEL_COUNT,
      manifestSha256: HASH.manifest,
      manifestReference: { objectKey: 'test-manifest' },
    },
  };
}

function position(value: number) {
  return { numerator: String(value), denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME' as const };
}

function deterministicRgbFrames(): Buffer {
  const frames = Buffer.alloc(FRAME_COUNT * WIDTH * HEIGHT * 3);
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
      const offset = (frame * WIDTH * HEIGHT + pixel) * 3;
      frames[offset] = (pixel + frame * 31) % 256;
      frames[offset + 1] = (Math.trunc(pixel / WIDTH) * 4 + frame * 47) % 256;
      frames[offset + 2] = (pixel % WIDTH) * 4;
    }
  }
  return frames;
}

function deterministicStereoPcm(): Buffer {
  const pcm = Buffer.alloc(SAMPLE_FRAME_COUNT * CHANNEL_COUNT * 4);
  for (let frame = 0; frame < SAMPLE_FRAME_COUNT; frame += 1) {
    const value = Math.trunc(Math.sin(frame / 37) * 0x3fffffff);
    pcm.writeInt32LE(value, frame * 8);
    pcm.writeInt32LE(-value, frame * 8 + 4);
  }
  return pcm;
}

function expectedTimelineRgb(): Buffer {
  const frameBytes = WIDTH * HEIGHT * 3;
  return Buffer.concat([0, 1, 1, 2].map((frame) => (
    sourceRgb.subarray(frame * frameBytes, (frame + 1) * frameBytes)
  )));
}

async function decodeRgb(filePath: string): Promise<Buffer> {
  const output = path.join(directory, `decoded-${randomUUID()}.rgb24`);
  await execute(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', filePath,
    '-map', '0:v:0', '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', output,
  ]);
  return readFile(output);
}

async function decodePcm(filePath: string): Promise<Buffer> {
  const output = path.join(directory, `decoded-${randomUUID()}.s32le`);
  await execute(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', filePath,
    '-map', '0:a:0', '-vn', '-c:a', 'pcm_s32le', '-f', 's32le', '-y', output,
  ]);
  return readFile(output);
}

async function probeStreams(filePath: string): Promise<Array<Record<string, unknown>>> {
  const parsed = JSON.parse(await capture(ffprobePath, [
    '-v', 'error', '-show_streams', '-of', 'json', filePath,
  ])) as { streams?: Array<Record<string, unknown>> };
  return parsed.streams ?? [];
}

function compositorVersion(): string {
  const packageName = process.platform === 'win32'
    ? '@remotion/compositor-win32-x64-msvc'
    : process.platform === 'darwin'
      ? process.arch === 'arm64'
        ? '@remotion/compositor-darwin-arm64'
        : '@remotion/compositor-darwin-x64'
      : process.arch === 'arm64'
        ? '@remotion/compositor-linux-arm64-gnu'
        : '@remotion/compositor-linux-x64-gnu';
  return String(require(`${packageName}/package.json`).version);
}

async function execute(command: string, args: readonly string[]): Promise<void> {
  await run(command, args, false);
}

async function capture(command: string, args: readonly string[]): Promise<string> {
  return run(command, args, true);
}

async function run(command: string, args: readonly string[], captureOutput: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      windowsHide: true,
      stdio: ['ignore', captureOutput ? 'pipe' : 'ignore', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`TEST_PROCESS_FAILED:${code}:${digest(Buffer.from(stderr))}`));
    });
  });
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
