import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

type JsonRecord = Record<string, unknown>;

export interface HoldoutAudioProbeV2R {
  codec: string;
  sampleRate: number;
  channels: number;
}

export async function renderRangeRemovalAvProxyV2R(input: {
  sourcePath: string;
  removedRange: Readonly<{ startFrame: number; endFrame: number }>;
  durationFrames: number;
  width: number;
  height: number;
  outputDirectory: string;
  outputFilename: string;
  ffmpegPath?: string;
}): Promise<Readonly<{
  outputPath: string;
  artifactSha256: string;
  bytes: number;
  frameCount: number;
}>> {
  const { startFrame, endFrame } = input.removedRange;
  if (![startFrame, endFrame, input.durationFrames, input.width, input.height]
    .every(Number.isSafeInteger)
    || startFrame <= 0 || endFrame <= startFrame || endFrame >= input.durationFrames
    || input.width < 16 || input.height < 16
    || !/^[a-z0-9][a-z0-9-]*\.mp4$/.test(input.outputFilename)) {
    fail('SEALED_AV_RANGE_REMOVAL_CONTRACT_INVALID');
  }
  const samplesPerFrame = 48_000 / 30;
  const root = resolve(input.outputDirectory);
  if (root === parse(root).root || root === resolve(process.cwd())) {
    fail('SEALED_AV_OUTPUT_ROOT_UNSAFE');
  }
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  const outputPath = resolve(root, input.outputFilename);
  const frameCount = input.durationFrames - (endFrame - startFrame);
  const filter = [
    `[0:v]trim=start_frame=0:end_frame=${startFrame},setpts=PTS-STARTPTS,scale=${input.width}:${input.height}:flags=lanczos,setsar=1[v0]`,
    `[0:a]atrim=start_sample=0:end_sample=${startFrame * samplesPerFrame},asetpts=PTS-STARTPTS[a0]`,
    `[0:v]trim=start_frame=${endFrame}:end_frame=${input.durationFrames},setpts=PTS-STARTPTS,scale=${input.width}:${input.height}:flags=lanczos,setsar=1[v1]`,
    `[0:a]atrim=start_sample=${endFrame * samplesPerFrame}:end_sample=${input.durationFrames * samplesPerFrame},asetpts=PTS-STARTPTS[a1]`,
    '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
  ].join(';');
  await capture(input.ffmpegPath ?? getFFmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input.sourcePath,
    '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
    '-frames:v', String(frameCount), '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-ac', '1', '-map_metadata', '-1', '-movflags', '+faststart', '-n', outputPath,
  ]);
  const bytes = await readFile(outputPath);
  return Object.freeze({
    outputPath,
    artifactSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    bytes: bytes.length,
    frameCount,
  });
}

export async function probeHoldoutAudioV2R(
  filePath: string,
  ffprobePath = 'ffprobe',
): Promise<Readonly<HoldoutAudioProbeV2R>> {
  const value = JSON.parse((await capture(ffprobePath, [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,sample_rate,channels', '-of', 'json', filePath,
  ])).toString('utf8')) as JsonRecord;
  const audio = records(value.streams)[0] ?? {};
  return Object.freeze({
    codec: text(audio.codec_name),
    sampleRate: integer(audio.sample_rate),
    channels: integer(audio.channels),
  });
}

export async function decodeHoldoutPcmS16leV2R(input: {
  filePath: string;
  ffmpegPath?: string;
}): Promise<Buffer> {
  const bytes = await capture(input.ffmpegPath ?? getFFmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input.filePath,
    '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', 'pipe:1',
  ]);
  if (bytes.length < 2 || bytes.length % 2 !== 0) fail('SEALED_AV_PCM_BYTES_INVALID');
  return bytes;
}

export function meanAbsolutePcmWindowV2R(
  pcm: Buffer,
  range: Readonly<{ startFrame: number; endFrame: number }>,
): number {
  if (!Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame)
    || range.startFrame < 0 || range.endFrame <= range.startFrame) {
    fail('SEALED_AV_PCM_WINDOW_INVALID');
  }
  const samplesPerFrame = 48_000 / 30;
  const start = range.startFrame * samplesPerFrame;
  const end = Math.min(range.endFrame * samplesPerFrame, pcm.length / 2);
  if (start >= end) fail('SEALED_AV_PCM_WINDOW_OUT_OF_RANGE');
  let total = 0;
  for (let sample = start; sample < end; sample += 1) {
    total += Math.abs(pcm.readInt16LE(sample * 2));
  }
  return Number((total / (end - start)).toFixed(6));
}

async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`SEALED_AV_PROCESS_FAILED:${command}:${code}:${stderr.slice(-2000)}`)));
  });
  return Buffer.concat(stdout);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
function fail(code: string): never { throw new Error(code); }
