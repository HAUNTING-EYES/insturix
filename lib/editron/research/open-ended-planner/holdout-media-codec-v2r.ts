import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { renderHoldoutFrameV2R } from './holdout-media-fixtures-v2r';

const FPS = 30;

export interface HoldoutCodecIdentityV2R {
  ffmpegPath: string;
  ffmpegVersion: string;
  ffmpegBinarySha256: string;
}

export async function readHoldoutCodecIdentityV2R(): Promise<HoldoutCodecIdentityV2R> {
  const ffmpegPath = getFFmpegPath();
  const ffmpegVersion = await runCapture(ffmpegPath, ['-version']);
  return {
    ffmpegPath,
    ffmpegVersion: ffmpegVersion.split(/\r?\n/, 1)[0] ?? fail('FFMPEG_VERSION_EMPTY'),
    ffmpegBinarySha256: sha256(await readFile(ffmpegPath)),
  };
}

export async function encodeHoldoutVideoV2R(input: {
  assetId: string;
  outputPath: string;
  width: number;
  height: number;
  frameCount: number;
  ffmpegPath: string;
}): Promise<string> {
  validateRaster(input.width, input.height, input.frameCount);
  const partial = `${input.outputPath}.partial.mp4`;
  await mkdir(dirname(input.outputPath), { recursive: true });
  await rm(partial, { force: true });
  const child = spawn(input.ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact',
    '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${input.width}x${input.height}`,
    '-framerate', String(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '1', '-g', '30', '-keyint_min', '30',
    '-sc_threshold', '0', '-flags:v', '+bitexact', '-map_metadata', '-1', '-movflags', '+faststart', partial,
  ], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  child.stdin.on('error', () => undefined);
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`HOLDOUT_FFMPEG_VIDEO_FAILED:${input.assetId}:${code}:${stderr.slice(-500)}`)));
  });
  const contentHash = createHash('sha256');
  try {
    for (let frame = 0; frame < input.frameCount; frame += 1) {
      const rgb = renderHoldoutFrameV2R(input.assetId, frame, input.width, input.height, input.frameCount);
      if (rgb.length !== input.width * input.height * 3) fail('HOLDOUT_FRAME_BYTES_INVALID');
      contentHash.update(rgb);
      if (!child.stdin.write(rgb)) await new Promise<void>((resolve) => child.stdin.once('drain', resolve));
    }
    child.stdin.end(); await closed;
    await rename(partial, input.outputPath);
    return contentHash.digest('hex');
  } catch (error) {
    child.kill(); await closed.catch(() => undefined); await rm(partial, { force: true }); throw error;
  }
}

export async function encodeHoldoutPngV2R(input: {
  assetId: string; outputPath: string; width: number; height: number; ffmpegPath: string;
}): Promise<string> {
  validateRaster(input.width, input.height, 1);
  const rgb = renderHoldoutFrameV2R(input.assetId, 0, input.width, input.height, 1);
  const partial = `${input.outputPath}.partial.png`;
  await runWithInput(input.ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact', '-f', 'rawvideo',
    '-pixel_format', 'rgb24', '-video_size', `${input.width}x${input.height}`, '-i', 'pipe:0',
    '-frames:v', '1', '-flags:v', '+bitexact', partial,
  ], rgb, 'HOLDOUT_FFMPEG_PNG_FAILED');
  await rename(partial, input.outputPath);
  return sha256(rgb);
}

export async function muxHoldoutAudioV2R(input: {
  videoPath: string; audioBytes: Buffer; outputPath: string; ffmpegPath: string;
}): Promise<string> {
  const wavPath = `${input.outputPath}.source.wav`;
  const partial = `${input.outputPath}.partial.mp4`;
  await writeFile(wavPath, input.audioBytes, { flag: 'wx' });
  try {
    await runCapture(input.ffmpegPath, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact', '-i', input.videoPath,
      '-i', wavPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-ar', '48000', '-ac', '1', '-flags:a', '+bitexact', '-map_metadata', '-1', '-shortest', partial,
    ]);
    await rename(partial, input.outputPath);
    return sha256(input.audioBytes.subarray(44));
  } finally {
    await Promise.all([rm(wavPath, { force: true }), rm(partial, { force: true })]);
  }
}

async function runWithInput(command: string, args: string[], bytes: Buffer, code: string): Promise<void> {
  const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exit) => exit === 0 ? resolve() : reject(new Error(`${code}:${stderr.slice(-500)}`)));
  });
  child.stdin.end(bytes); await closed;
}
async function runCapture(command: string, args: string[]): Promise<string> {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exit) => exit === 0 ? resolve() : reject(new Error(`HOLDOUT_FFMPEG_FAILED:${exit}:${stderr.slice(-500)}`)));
  });
  return stdout;
}
function validateRaster(width: number, height: number, frames: number): void {
  if (!Number.isInteger(width) || width < 16 || !Number.isInteger(height) || height < 16
    || !Number.isInteger(frames) || frames < 1) fail('HOLDOUT_RASTER_INVALID');
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function fail(code: string): never { throw new Error(code); }
