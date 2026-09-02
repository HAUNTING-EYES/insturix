import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertNativeMediaFinalRenderProfileReceiptV1,
  createNativeMediaFinalRenderProfileReceiptV1,
  NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1,
  NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
} from '@/lib/editron/services/native-media-final-render-profile-v1';

const require = createRequire(import.meta.url);
const FRAME_COUNT = 4;
const SAMPLE_RATE = 48_000;
const CHANNEL_COUNT = 2;
const SAMPLE_FRAME_COUNT = 6_400;
const PROCESS_TIMEOUT_MS = 120_000;
let directory = '';
let sourcePath = '';
let inputVideoPath = '';
let inputPcmPath = '';
let outputPath = '';
let encoderFfmpegPath = '';
let ffprobePath = '';
let ffmpegVersion = '';
let compositorPackageVersion = '';
let browserLogs: string[] = [];

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'editron-remotion-profile-v1-'));
  sourcePath = path.join(directory, 'exact-source.mkv');
  inputVideoPath = path.join(directory, 'input.rgb24');
  inputPcmPath = path.join(directory, 'input.s32le');
  outputPath = path.join(directory, 'remotion-output.mp4');
  encoderFfmpegPath = process.env.EDITRON_FINAL_RENDER_FFMPEG_PATH?.trim() || 'ffmpeg';
  ({ ffprobePath, packageVersion: compositorPackageVersion } = compositorTools());
  ffmpegVersion = (await capture(encoderFfmpegPath, ['-hide_banner', '-version']))
    .split(/\r?\n/, 1)[0]!.trim();
  expect(ffmpegVersion).toMatch(/^ffmpeg version (?:[7-9]|[1-9]\d)/);

  const pcm = deterministicStereoPcm();
  const rgb = deterministicRgbFrames();
  await writeFile(inputVideoPath, rgb, { flag: 'wx' });
  await writeFile(inputPcmPath, pcm, { flag: 'wx' });
  await execute(encoderFfmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', '64x64',
    '-framerate', '30', '-i', inputVideoPath,
    '-f', 's32le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNEL_COUNT),
    '-i', inputPcmPath,
    '-map', '0:v:0', '-frames:v', String(FRAME_COUNT),
    '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'medium', '-g', '1',
    '-pix_fmt', 'bgr0',
    '-map', '1:a:0', '-c:a', 'pcm_s32le', '-shortest',
    '-f', 'matroska', '-y', sourcePath,
  ]);

  const decodedVideoPath = path.join(directory, 'decoded-source.rgb24');
  await execute(encoderFfmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', sourcePath,
    '-map', '0:v:0', '-an', '-sn', '-dn', '-pix_fmt', 'rgb24',
    '-f', 'rawvideo', '-y', decodedVideoPath,
  ]);
  expect(await readFile(decodedVideoPath)).toEqual(rgb);

  const decodedPcmPath = path.join(directory, 'decoded-source.s32le');
  await execute(encoderFfmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', sourcePath,
    '-map', '0:a:0', '-vn', '-sn', '-dn', '-c:a', 'pcm_s32le',
    '-f', 's32le', '-y', decodedPcmPath,
  ]);
  expect(await readFile(decodedPcmPath)).toEqual(pcm);

  const serveUrl = await bundle({
    entryPoint: path.resolve(
      process.cwd(),
      'tests/editron/fixtures/remotion-exact-source-profile-v1.tsx',
    ),
    publicDir: directory,
    webpackOverride: (configuration) => ({
      ...configuration,
      resolve: {
        ...configuration.resolve,
        alias: {
          ...(Array.isArray(configuration.resolve?.alias)
            ? {}
            : configuration.resolve?.alias),
          '@': process.cwd(),
        },
      },
    }),
  });
  const composition = await selectComposition({
    serveUrl,
    id: 'ExactSourceProfileV1',
  });
  browserLogs = [];
  await renderMedia({
    composition,
    serveUrl,
    outputLocation: outputPath,
    codec: 'h264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    chromiumOptions: { headless: true },
    concurrency: 1,
    overwrite: true,
    timeoutInMilliseconds: PROCESS_TIMEOUT_MS,
    onBrowserLog: (log) => browserLogs.push(`${log.type}:${log.text}`),
  });
}, PROCESS_TIMEOUT_MS);

afterAll(async () => {
  if (directory) await rm(directory, { force: true, recursive: true });
});

describe('native final-render Remotion exact-source profile v1', () => {
  it('consumes lossless RGB H.264 plus exact PCM-S32LE from Matroska', async () => {
    const sourceProbe = JSON.parse(await capture(ffprobePath, [
      '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', sourcePath,
    ])) as { streams?: Array<Record<string, unknown>> };
    const sourceVideo = sourceProbe.streams?.find((stream) => stream.codec_type === 'video');
    const sourceAudio = sourceProbe.streams?.find((stream) => stream.codec_type === 'audio');
    expect(sourceVideo).toMatchObject({
      codec_name: 'h264',
      pix_fmt: 'gbrp',
      nb_read_frames: String(FRAME_COUNT),
    });
    expect(sourceAudio).toMatchObject({
      codec_name: 'pcm_s32le',
      sample_rate: String(SAMPLE_RATE),
      channels: CHANNEL_COUNT,
    });

    const outputProbe = JSON.parse(await capture(ffprobePath, [
      '-v', 'error', '-count_frames', '-show_streams', '-of', 'json', outputPath,
    ])) as { streams?: Array<Record<string, unknown>> };
    const outputVideo = outputProbe.streams?.find((stream) => stream.codec_type === 'video');
    const outputAudio = outputProbe.streams?.find((stream) => stream.codec_type === 'audio');
    expect(outputVideo).toMatchObject({
      codec_name: 'h264',
      nb_read_frames: String(FRAME_COUNT),
    });
    expect(outputAudio).toMatchObject({ codec_name: 'aac' });
    const errors = browserLogs.filter((entry) => /error|exception|failed/i.test(entry));
    expect(errors).toEqual([]);
    expect((await readFile(outputPath)).byteLength).toBeGreaterThan(0);

    const sourceRgb = await readFile(inputVideoPath);
    const artifactRgb = await readFile(path.join(directory, 'decoded-source.rgb24'));
    const sourcePcm = await readFile(inputPcmPath);
    const artifactPcm = await readFile(path.join(directory, 'decoded-source.s32le'));
    const receipt = createNativeMediaFinalRenderProfileReceiptV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_FINAL_RENDER_PROFILE_RECEIPT_KIND_V1,
      profileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      platform: `${process.platform}-${process.arch}`,
      ffmpegVersion,
      remotionVersion: String(require('remotion/package.json').version),
      compositorPackageVersion,
      container: 'matroska',
      videoEncoder: 'libx264rgb',
      videoCodec: 'h264',
      pixelFormat: 'gbrp',
      videoLosslessMode: 'CRF_0_INTRA_ONLY',
      audioCodec: 'pcm_s32le',
      sourceDecodedRgbSha256: digest(sourceRgb),
      artifactDecodedRgbSha256: digest(artifactRgb),
      sourceDecodedPcmSha256: digest(sourcePcm),
      artifactDecodedPcmSha256: digest(artifactPcm),
      sourceVideoFrameCount: String(sourceVideo?.nb_read_frames),
      remotionVideoFrameCount: String(outputVideo?.nb_read_frames),
      sourceAudioSampleFrameCount: String(SAMPLE_FRAME_COUNT),
      remotionOutputVideoCodec: 'h264',
      remotionOutputAudioCodec: 'aac',
      browserErrorCount: 0,
    });
    expect(assertNativeMediaFinalRenderProfileReceiptV1(receipt)).toEqual(receipt);
    expect(() => assertNativeMediaFinalRenderProfileReceiptV1({
      ...receipt,
      artifactDecodedRgbSha256: 'f'.repeat(64),
    })).toThrow('NATIVE_MEDIA_FINAL_RENDER_PROFILE_RGB_NOT_LOSSLESS');
  });
});

function deterministicStereoPcm(): Buffer {
  const pcm = Buffer.alloc(SAMPLE_FRAME_COUNT * CHANNEL_COUNT * 4);
  for (let frame = 0; frame < SAMPLE_FRAME_COUNT; frame += 1) {
    const value = Math.trunc(Math.sin(frame / 37) * 0x3fffffff);
    pcm.writeInt32LE(value, frame * 8);
    pcm.writeInt32LE(-value, frame * 8 + 4);
  }
  return pcm;
}

function deterministicRgbFrames(): Buffer {
  const frames = Buffer.alloc(FRAME_COUNT * 64 * 64 * 3);
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    for (let pixel = 0; pixel < 64 * 64; pixel += 1) {
      const offset = (frame * 64 * 64 + pixel) * 3;
      frames[offset] = (pixel + frame * 31) % 256;
      frames[offset + 1] = (Math.trunc(pixel / 64) * 4 + frame * 47) % 256;
      frames[offset + 2] = (pixel % 64) * 4;
    }
  }
  return frames;
}

function compositorTools(): Readonly<{ ffprobePath: string; packageVersion: string }> {
  const packageName = process.platform === 'win32'
    ? '@remotion/compositor-win32-x64-msvc'
    : process.platform === 'darwin'
      ? process.arch === 'arm64'
        ? '@remotion/compositor-darwin-arm64'
        : '@remotion/compositor-darwin-x64'
      : process.arch === 'arm64'
        ? '@remotion/compositor-linux-arm64-gnu'
        : '@remotion/compositor-linux-x64-gnu';
  const packageDirectory = path.dirname(require.resolve(`${packageName}/package.json`));
  const extension = process.platform === 'win32' ? '.exe' : '';
  return Object.freeze({
    ffprobePath: path.join(packageDirectory, `ffprobe${extension}`),
    packageVersion: String(require(`${packageName}/package.json`).version),
  });
}

async function execute(executable: string, args: readonly string[]): Promise<void> {
  await run(executable, args, false);
}

async function capture(executable: string, args: readonly string[]): Promise<string> {
  return run(executable, args, true);
}

async function run(
  executable: string,
  args: readonly string[],
  captureStdout: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      windowsHide: true,
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), PROCESS_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`PROFILE_PROCESS_FAILED:${code}:${digest(Buffer.from(stderr))}`));
    });
  });
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
