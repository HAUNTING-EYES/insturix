import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';

import mediaIdentityJson from '@/tests/fixtures/editron/open-ended-planner-v2/holdout-media-identity-v2r.json';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';

type JsonRecord = Record<string, unknown>;

const MEDIA_IDENTITY = mediaIdentityJson as Readonly<{
  manifestSha256: string;
  artifactCount: number;
  artifactSha256ById: Readonly<Record<string, string>>;
}>;

export interface BoundHoldoutMediaArtifactV2R {
  taskId: string;
  assetId: string;
  artifactPath: string;
  artifactSha256: string;
  bytes: number;
}

export interface HoldoutVideoProbeV2R {
  codec: string;
  width: number;
  height: number;
  averageFrameRate: string;
  decodedFrameCount: number;
  audioStreamCount: number;
}

export interface HoldoutColorBoundsV2R {
  left: number; right: number; top: number; bottom: number;
  width: number; height: number; centerX: number; centerY: number; pixels: number;
}

export async function bindHoldoutMediaArtifactV2R(input: {
  manifest: Readonly<HoldoutMediaManifestV2R>;
  taskId: string;
  assetId: string;
  publicArtifactSha256: string;
}): Promise<Readonly<BoundHoldoutMediaArtifactV2R>> {
  const { manifest } = input;
  if (manifest.schemaVersion !== 'EDITRON_OE_HOLDOUT_MEDIA_MANIFEST_V2R'
    || manifest.version !== '2.2.0-r1'
    || manifest.manifestSha256 !== MEDIA_IDENTITY.manifestSha256
    || manifest.artifacts.length !== MEDIA_IDENTITY.artifactCount) {
    fail('SEALED_MEDIA_MANIFEST_IDENTITY_DRIFT');
  }
  const artifact = manifest.artifacts.find(({ assetId }) => assetId === input.assetId);
  const expectedHash = MEDIA_IDENTITY.artifactSha256ById[input.assetId];
  if (!artifact || artifact.taskId !== input.taskId || !expectedHash
    || artifact.artifactSha256 !== expectedHash
    || input.publicArtifactSha256 !== expectedHash) {
    fail(`SEALED_MEDIA_ARTIFACT_BINDING_INVALID:${input.assetId}`);
  }
  const artifactPath = resolve(artifact.artifactPath);
  const stat = await lstat(artifactPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== artifact.bytes) {
    fail(`SEALED_MEDIA_ARTIFACT_FILE_INVALID:${input.assetId}`);
  }
  const actualHash = `sha256:${sha256(await readFile(artifactPath))}`;
  if (actualHash !== expectedHash) fail(`SEALED_MEDIA_ARTIFACT_HASH_DRIFT:${input.assetId}`);
  return Object.freeze({
    taskId: artifact.taskId, assetId: artifact.assetId, artifactPath,
    artifactSha256: actualHash, bytes: stat.size,
  });
}

export async function renderHardCutProxyV2R(input: {
  outgoingPath: string;
  incomingPath: string;
  incomingStartFrame: number;
  boundaryFrame: number;
  durationFrames: number;
  width: number;
  height: number;
  outputDirectory: string;
  ffmpegPath?: string;
}): Promise<Readonly<{ outputPath: string; artifactSha256: string; bytes: number }>> {
  const values = [input.incomingStartFrame, input.boundaryFrame, input.durationFrames, input.width, input.height];
  if (!values.every(Number.isSafeInteger) || input.incomingStartFrame < 0
    || input.boundaryFrame < 1 || input.boundaryFrame >= input.durationFrames
    || input.width < 16 || input.height < 16) fail('SEALED_MEDIA_RENDER_COORDINATES_INVALID');
  const root = resolve(input.outputDirectory);
  if (root === parse(root).root || root === resolve(process.cwd())) fail('SEALED_MEDIA_OUTPUT_ROOT_UNSAFE');
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  const outputPath = resolve(root, 'sealed-holdout-hard-cut-proxy.mp4');
  const incomingFrames = input.durationFrames - input.boundaryFrame;
  const filter = [
    `[0:v]trim=start_frame=0:end_frame=${input.boundaryFrame},setpts=PTS-STARTPTS,scale=${input.width}:${input.height}:flags=lanczos,setsar=1[v0]`,
    `[1:v]trim=start_frame=${input.incomingStartFrame}:end_frame=${input.incomingStartFrame + incomingFrames},setpts=PTS-STARTPTS,scale=${input.width}:${input.height}:flags=lanczos,setsar=1[v1]`,
    '[v0][v1]concat=n=2:v=1:a=0[v]',
  ].join(';');
  await capture(input.ffmpegPath ?? getFFmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input.outgoingPath,
    '-i', input.incomingPath, '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-r', '30', '-frames:v', String(input.durationFrames), '-map_metadata', '-1',
    '-movflags', '+faststart', '-n', outputPath,
  ]);
  const bytes = await readFile(outputPath);
  return Object.freeze({ outputPath, artifactSha256: `sha256:${sha256(bytes)}`, bytes: bytes.length });
}

export async function renderConcatenatedProxyV2R(input: {
  segments: readonly Readonly<{ sourcePath: string; startFrame: number; endFrame: number }>[];
  width: number;
  height: number;
  outputDirectory: string;
  outputFilename: string;
  ffmpegPath?: string;
}): Promise<Readonly<{ outputPath: string; artifactSha256: string; bytes: number; frameCount: number }>> {
  if (input.segments.length < 2 || input.segments.length > 16
    || !Number.isSafeInteger(input.width) || input.width < 16
    || !Number.isSafeInteger(input.height) || input.height < 16
    || !/^[a-z0-9][a-z0-9-]*\.mp4$/.test(input.outputFilename)) {
    fail('SEALED_MEDIA_CONCAT_CONTRACT_INVALID');
  }
  for (const segment of input.segments) {
    if (!Number.isSafeInteger(segment.startFrame) || segment.startFrame < 0
      || !Number.isSafeInteger(segment.endFrame) || segment.endFrame <= segment.startFrame) {
      fail('SEALED_MEDIA_CONCAT_RANGE_INVALID');
    }
  }
  const root = resolve(input.outputDirectory);
  if (root === parse(root).root || root === resolve(process.cwd())) fail('SEALED_MEDIA_OUTPUT_ROOT_UNSAFE');
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  const outputPath = resolve(root, input.outputFilename);
  const frameCount = input.segments.reduce(
    (total, segment) => total + segment.endFrame - segment.startFrame, 0,
  );
  const inputs = input.segments.flatMap((segment) => ['-i', segment.sourcePath]);
  const filters = input.segments.map((segment, index) =>
    `[${index}:v]trim=start_frame=${segment.startFrame}:end_frame=${segment.endFrame},setpts=PTS-STARTPTS,scale=${input.width}:${input.height}:flags=lanczos,setsar=1[v${index}]`);
  filters.push(`${input.segments.map((_, index) => `[v${index}]`).join('')}concat=n=${input.segments.length}:v=1:a=0[v]`);
  await capture(input.ffmpegPath ?? getFFmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', ...inputs,
    '-filter_complex', filters.join(';'), '-map', '[v]', '-an', '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
    '-frames:v', String(frameCount), '-map_metadata', '-1', '-movflags', '+faststart',
    '-n', outputPath,
  ]);
  const bytes = await readFile(outputPath);
  return Object.freeze({
    outputPath, artifactSha256: `sha256:${sha256(bytes)}`, bytes: bytes.length, frameCount,
  });
}

export async function probeHoldoutVideoV2R(
  filePath: string,
  ffprobePath = 'ffprobe',
): Promise<Readonly<HoldoutVideoProbeV2R>> {
  const value = JSON.parse((await capture(ffprobePath, [
    '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames',
    '-of', 'json', filePath,
  ])).toString('utf8')) as JsonRecord;
  const streams = records(value.streams);
  const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  return Object.freeze({
    codec: text(video.codec_name), width: integer(video.width), height: integer(video.height),
    averageFrameRate: text(video.avg_frame_rate), decodedFrameCount: integer(video.nb_read_frames),
    audioStreamCount: streams.filter(({ codec_type }) => codec_type === 'audio').length,
  });
}

export async function extractHoldoutRgbFrameV2R(input: {
  filePath: string; frame: number; width: number; height: number; ffmpegPath?: string;
}): Promise<Buffer> {
  if (![input.frame, input.width, input.height].every(Number.isSafeInteger)
    || input.frame < 0 || input.width < 16 || input.height < 16) fail('SEALED_MEDIA_FRAME_COORDINATES_INVALID');
  const bytes = await capture(input.ffmpegPath ?? getFFmpegPath(), [
    '-v', 'error', '-i', input.filePath, '-vf', `select=eq(n\\,${input.frame})`,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ]);
  if (bytes.length !== input.width * input.height * 3) fail('SEALED_MEDIA_FRAME_BYTES_INVALID');
  return bytes;
}

export function measureHoldoutColorBoundsV2R(
  rgb: Buffer,
  width: number,
  height: number,
  color: 'CLOCK_GOLD' | 'DIAL_CYAN' | 'DOOR_BROWN',
): Readonly<HoldoutColorBoundsV2R> {
  if (rgb.length !== width * height * 3) fail('SEALED_MEDIA_COLOR_FRAME_INVALID');
  let left = width; let right = -1; let top = height; let bottom = -1; let pixels = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    const red = rgb[offset]; const green = rgb[offset + 1]; const blue = rgb[offset + 2];
    const matches = color === 'CLOCK_GOLD'
      ? red > 150 && green > 120 && blue < 135 && red > green && green > blue * 1.2
      : color === 'DIAL_CYAN'
        ? blue > 145 && green > 125 && red < 155 && blue > red * 1.15
        : red > 90 && green > 40 && green < 125 && blue < 95 && red > green * 1.25;
    if (!matches) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y); pixels += 1;
  }
  if (right < left || bottom < top || pixels < 100) fail(`SEALED_MEDIA_${color}_BOUNDS_MISSING`);
  return Object.freeze({
    left, right, top, bottom, width: right - left + 1, height: bottom - top + 1,
    centerX: (left + right) / 2, centerY: (top + bottom) / 2, pixels,
  });
}

async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = []; let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0
      ? resolvePromise() : reject(new Error(`SEALED_MEDIA_PROCESS_FAILED:${command}:${code}:${stderr.slice(-2000)}`)));
  });
  return Buffer.concat(stdout);
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }
function fail(code: string): never { throw new Error(code); }
