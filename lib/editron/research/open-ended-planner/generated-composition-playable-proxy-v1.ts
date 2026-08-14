import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { renderMedia, type CancelSignal } from '@remotion/renderer';
import type { VideoConfig } from 'remotion/no-react';
import { z } from 'zod';

const execFileAsync = promisify(execFile);
const probeSchema = z.object({
  streams: z.array(z.object({
    codec_type: z.string(), codec_name: z.string(), width: z.number().int().positive(), height: z.number().int().positive(),
    pix_fmt: z.string(), avg_frame_rate: z.string(), r_frame_rate: z.string(), nb_frames: z.string(), duration: z.string(),
    color_space: z.string(), color_transfer: z.string(), color_primaries: z.string(), color_range: z.string(),
  }).passthrough()).min(1),
  format: z.object({ format_name: z.string(), duration: z.string() }).passthrough(),
}).passthrough();

export interface GeneratedCompositionPlayableProxyV1 {
  path: string;
  sha256: string;
  container: 'MP4';
  codec: 'H264';
  pixelFormat: 'YUV420P';
  color: { space: 'BT709'; transfer: 'BT709'; primaries: 'BT709'; range: 'LIMITED' };
  audio: 'ABSENT';
  width: number;
  height: number;
  frameRate: { numerator: string; denominator: string };
  durationInFrames: number;
}

export interface GeneratedCompositionPlayableProxyExpectedV1 {
  width: number;
  height: number;
  frameRate: { numerator: string; denominator: string };
  durationInFrames: number;
}

export async function renderGeneratedCompositionPlayableProxyV1(input: {
  serveUrl: string;
  composition: VideoConfig;
  output: string;
  cancelSignal: CancelSignal;
  expected: GeneratedCompositionPlayableProxyExpectedV1;
}): Promise<Readonly<GeneratedCompositionPlayableProxyV1>> {
  if (input.expected.width % 2 !== 0 || input.expected.height % 2 !== 0) {
    throw new Error('Generated composition playable proxy requires an even YUV420 raster');
  }
  await renderMedia({
    serveUrl: input.serveUrl,
    composition: input.composition,
    outputLocation: input.output,
    codec: 'h264',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    muted: true,
    enforceAudioTrack: false,
    concurrency: 1,
    overwrite: true,
    cancelSignal: input.cancelSignal,
    logLevel: 'error',
  });
  return probeGeneratedCompositionPlayableProxyV1(input.output, input.expected);
}

export async function probeGeneratedCompositionPlayableProxyV1(
  filePath: string,
  expected: GeneratedCompositionPlayableProxyExpectedV1,
): Promise<Readonly<GeneratedCompositionPlayableProxyV1>> {
  const resolved = path.resolve(filePath);
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || path.extname(resolved).toLowerCase() !== '.mp4') {
    throw new Error('Generated composition playable proxy is not a regular MP4 file');
  }
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=format_name,duration:stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,duration,color_space,color_transfer,color_primaries,color_range',
    '-of', 'json', resolved,
  ], { timeout: 30_000, maxBuffer: 1_024 * 1_024, windowsHide: true });
  const metadata = parseGeneratedCompositionPlayableProxyProbeV1(JSON.parse(stdout), expected);
  return Object.freeze({ path: resolved, sha256: await sha256File(resolved), ...metadata });
}

export function parseGeneratedCompositionPlayableProxyProbeV1(
  value: unknown,
  expected: GeneratedCompositionPlayableProxyExpectedV1,
): Omit<GeneratedCompositionPlayableProxyV1, 'path' | 'sha256'> {
  const parsed = probeSchema.parse(value);
  if (parsed.streams.length !== 1 || parsed.streams[0].codec_type !== 'video') {
    throw new Error('Generated composition playable proxy must contain exactly one video stream and no audio');
  }
  const video = parsed.streams[0];
  if (!parsed.format.format_name.split(',').includes('mp4') || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p') {
    throw new Error('Generated composition playable proxy codec contract drift');
  }
  if (video.width !== expected.width || video.height !== expected.height) {
    throw new Error('Generated composition playable proxy raster drift');
  }
  const expectedRate = reducedRate(expected.frameRate);
  const averageRate = reducedRate(parseRate(video.avg_frame_rate));
  const realRate = reducedRate(parseRate(video.r_frame_rate));
  if (!sameRate(expectedRate, averageRate) || !sameRate(expectedRate, realRate)) {
    throw new Error('Generated composition playable proxy frame-rate drift');
  }
  if (positiveInteger(video.nb_frames, 'frame count') !== expected.durationInFrames) {
    throw new Error('Generated composition playable proxy frame-count drift');
  }
  const expectedSeconds = expected.durationInFrames * Number(expectedRate.denominator) / Number(expectedRate.numerator);
  for (const duration of [video.duration, parsed.format.duration]) {
    const seconds = Number(duration);
    if (!Number.isFinite(seconds) || Math.abs(seconds - expectedSeconds) > 0.5 / (Number(expectedRate.numerator) / Number(expectedRate.denominator))) {
      throw new Error('Generated composition playable proxy duration drift');
    }
  }
  if (video.color_space !== 'bt709' || video.color_transfer !== 'bt709' || video.color_primaries !== 'bt709' || video.color_range !== 'tv') {
    throw new Error('Generated composition playable proxy color contract drift');
  }
  return {
    container: 'MP4', codec: 'H264', pixelFormat: 'YUV420P',
    color: { space: 'BT709', transfer: 'BT709', primaries: 'BT709', range: 'LIMITED' }, audio: 'ABSENT',
    width: video.width, height: video.height, frameRate: expectedRate, durationInFrames: expected.durationInFrames,
  };
}

function parseRate(value: string): { numerator: string; denominator: string } {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) throw new Error('Generated composition playable proxy rate is invalid');
  return { numerator: match[1], denominator: match[2] };
}

function reducedRate(value: { numerator: string; denominator: string }) {
  const numerator = positiveInteger(value.numerator, 'rate numerator');
  const denominator = positiveInteger(value.denominator, 'rate denominator');
  const divisor = gcd(numerator, denominator);
  return { numerator: String(numerator / divisor), denominator: String(denominator / divisor) };
}

function sameRate(left: { numerator: string; denominator: string }, right: { numerator: string; denominator: string }): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function gcd(left: number, right: number): number { let a = left; let b = right; while (b) { [a, b] = [b, a % b]; } return a; }
function positiveInteger(value: string, label: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Generated composition playable proxy ${label} is invalid`); return parsed; }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => { const stream = createReadStream(filePath); stream.on('data', (chunk) => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve); });
  return hash.digest('hex');
}
