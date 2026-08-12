import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, relative, resolve } from 'node:path';

import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';

import { hashCanonicalJsonV1 } from './contracts-v1';

const FPS = 30;
const SAMPLE_RATE = 48_000;
const MATERIALIZER_PATH = 'lib/editron/research/open-ended-planner/media-materializer-v2.ts';
const V1_TASK_PATH = 'tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json';
const V2_TASK_PATH = 'tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json';

type AssetType = 'video' | 'audio' | 'image';

interface SourceAssetV2 {
  assetId: string;
  type: AssetType;
  generator: string;
  seed: number;
  recipe: string;
  rightsStatus: string;
}

interface SourceTaskV2 {
  taskId: string;
  project: {
    fps: number;
    canvas: { width: number; height: number };
    durationFrames: number;
    assets: SourceAssetV2[];
  };
}

export interface MaterializedMediaArtifactV2 {
  assetId: string;
  taskId: string;
  type: AssetType;
  mimeType: string;
  artifactPath: string;
  recipeSha256: string;
  contentSha256: string;
  artifactSha256: string;
  bytes: number;
  materializationStatus: 'MATERIALIZED_AND_HASHED_V2_1A';
  technical: Record<string, number | string>;
}

export interface DevelopmentMediaManifestV2 {
  schemaVersion: 'EDITRON_OE_DEVELOPMENT_MEDIA_MANIFEST_V2';
  version: '2.1.0-a';
  scope: 'DEVELOPMENT_ONLY';
  authority: 'RESEARCH_ONLY_NO_PROVIDER_OR_PROJECT_AUTHORITY';
  sourceBindings: Array<{ path: string; sha256: string }>;
  toolchain: {
    node: string;
    platform: string;
    arch: string;
    ffmpegVersion: string;
    ffmpegBinarySha256: string;
    videoEncoding: string;
  };
  artifacts: MaterializedMediaArtifactV2[];
}

export class MediaMaterializationErrorV2 extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MediaMaterializationErrorV2';
  }
}

export async function materializeDevelopmentMediaV2(
  outputDirectory: string,
): Promise<DevelopmentMediaManifestV2> {
  const outputRoot = assertSafeOutputDirectory(outputDirectory);
  const source = JSON.parse(await readFile(resolve(V1_TASK_PATH), 'utf8')) as { tasks: SourceTaskV2[] };
  const expected = JSON.parse(await readFile(resolve(V2_TASK_PATH), 'utf8')) as {
    tasks: Array<{ taskId: string; split: string; mediaBindings: Array<{ assetId: string; recipeSha256: string }> }>;
  };
  const development = expected.tasks.filter(({ split }) => split === 'DEVELOPMENT');
  const expectedByAsset = new Map(development.flatMap((task) => task.mediaBindings.map((binding) => [binding.assetId, { ...binding, taskId: task.taskId }])));
  const sourceAssets = source.tasks.flatMap((task) => task.project.assets.map((asset) => ({ asset, task })));
  if (sourceAssets.length !== 8 || expectedByAsset.size !== 8) fail('ASSET_SET_MISMATCH', 'V2-1A requires exactly eight development assets');
  await mkdir(outputRoot, { recursive: true });

  const ffmpegPath = getFFmpegPath();
  const ffmpegVersion = await readFfmpegVersionV2(ffmpegPath);
  const artifacts: MaterializedMediaArtifactV2[] = [];
  for (const { asset, task } of sourceAssets) {
    const binding = expectedByAsset.get(asset.assetId);
    if (!binding || binding.taskId !== task.taskId) fail('UNBOUND_ASSET', `Missing V2 binding for ${asset.assetId}`);
    const recipeSha256 = `sha256:${hashCanonicalJsonV1(asset)}`;
    if (recipeSha256 !== binding.recipeSha256) fail('RECIPE_HASH_DRIFT', `Recipe hash drift for ${asset.assetId}`);
    const dimensions = scaledDimensions(task.project.canvas);
    const extension = asset.type === 'video' ? 'mp4' : asset.type === 'audio' ? 'wav' : 'png';
    const artifactPath = resolve(outputRoot, `${asset.assetId}.${extension}`);
    let contentSha256: string;
    let technical: Record<string, number | string>;
    if (asset.type === 'video') {
      contentSha256 = await encodeSyntheticVideoV2({
        assetId: asset.assetId,
        outputPath: artifactPath,
        width: dimensions.width,
        height: dimensions.height,
        frameCount: task.project.durationFrames,
        ffmpegPath,
      });
      technical = { width: dimensions.width, height: dimensions.height, fps: FPS, frames: task.project.durationFrames, durationSeconds: task.project.durationFrames / FPS };
    } else if (asset.type === 'audio') {
      const wav = synthesizeAudioWavV2(asset.assetId, task.project.durationFrames);
      contentSha256 = sha256(wav.subarray(44));
      await writeAtomic(artifactPath, wav);
      technical = { sampleRate: SAMPLE_RATE, channels: 1, sampleCount: Math.round(task.project.durationFrames / FPS * SAMPLE_RATE), durationSeconds: task.project.durationFrames / FPS };
    } else {
      const rgb = renderSyntheticFrameV2(asset.assetId, 0, dimensions.width, dimensions.height, 1);
      contentSha256 = sha256(rgb);
      await encodePngV2(rgb, dimensions.width, dimensions.height, artifactPath, ffmpegPath);
      technical = { width: dimensions.width, height: dimensions.height };
    }
    const bytes = await readFile(artifactPath);
    artifacts.push({
      assetId: asset.assetId,
      taskId: task.taskId,
      type: asset.type,
      mimeType: asset.type === 'video' ? 'video/mp4' : asset.type === 'audio' ? 'audio/wav' : 'image/png',
      artifactPath: normalizePath(relative(process.cwd(), artifactPath)),
      recipeSha256,
      contentSha256: `sha256:${contentSha256}`,
      artifactSha256: `sha256:${sha256(bytes)}`,
      bytes: bytes.length,
      materializationStatus: 'MATERIALIZED_AND_HASHED_V2_1A',
      technical,
    });
  }
  artifacts.sort((left, right) => left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0);
  return {
    schemaVersion: 'EDITRON_OE_DEVELOPMENT_MEDIA_MANIFEST_V2',
    version: '2.1.0-a',
    scope: 'DEVELOPMENT_ONLY',
    authority: 'RESEARCH_ONLY_NO_PROVIDER_OR_PROJECT_AUTHORITY',
    sourceBindings: await Promise.all([V1_TASK_PATH, V2_TASK_PATH, MATERIALIZER_PATH].map(async (path) => ({ path, sha256: sha256(await readFile(resolve(path))) }))),
    toolchain: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      ffmpegVersion,
      ffmpegBinarySha256: sha256(await readFile(ffmpegPath)),
      videoEncoding: 'raw-rgb24->h264(libx264,crf18,threads1,bitexact)->mp4',
    },
    artifacts,
  };
}

export async function encodeSyntheticVideoV2(input: {
  assetId: string;
  outputPath: string;
  width: number;
  height: number;
  frameCount: number;
  ffmpegPath?: string;
}): Promise<string> {
  if (!Number.isInteger(input.frameCount) || input.frameCount < 1) fail('INVALID_FRAME_COUNT', 'frameCount must be a positive integer');
  const ffmpegPath = input.ffmpegPath ?? getFFmpegPath();
  const partial = `${input.outputPath}.partial.mp4`;
  await mkdir(dirname(input.outputPath), { recursive: true });
  await rm(partial, { force: true });
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${input.width}x${input.height}`, '-framerate', String(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '1', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-flags:v', '+bitexact', '-map_metadata', '-1', '-movflags', '+faststart', partial];
  const child = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const closed = new Promise<void>((accept, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? accept() : reject(new MediaMaterializationErrorV2('FFMPEG_FAILED', `${input.assetId}: ffmpeg exited ${code}: ${stderr.slice(-1000)}`)));
  });
  const rawHash = createHash('sha256');
  try {
    for (let frame = 0; frame < input.frameCount; frame += 1) {
      const rgb = renderSyntheticFrameV2(input.assetId, frame, input.width, input.height, input.frameCount);
      rawHash.update(rgb);
      if (!child.stdin.write(rgb)) await new Promise<void>((accept) => child.stdin.once('drain', accept));
    }
    child.stdin.end();
    await closed;
    await rm(input.outputPath, { force: true });
    await rename(partial, input.outputPath);
    return rawHash.digest('hex');
  } catch (error) {
    child.kill();
    await rm(partial, { force: true });
    throw error;
  }
}

export function renderSyntheticFrameV2(assetId: string, frame: number, width: number, height: number, frameCount: number): Buffer {
  if (!['dev01-host', 'dev02-wide', 'dev02-close', 'dev02-reference', 'dev03-cards', 'dev04-crossing'].includes(assetId)) fail('UNKNOWN_VISUAL_ASSET', `No visual recipe for ${assetId}`);
  const rgb = Buffer.alloc(width * height * 3);
  fill(rgb, 18, 24, 38);
  const progress = frameCount <= 1 ? 0.5 : frame / (frameCount - 1);
  if (assetId === 'dev01-host') {
    circle(rgb, width, height, Math.round(width * 0.25), Math.round(height * 0.28), Math.round(height * 0.11), [236, 183, 137]);
    rect(rgb, width, height, 0.16, 0.39, 0.20, 0.46, [38, 110, 178]);
    if (frame >= 180) rect(rgb, width, height, 0.62, 0.24, 0.25, 0.52, [247, 187, 52]);
  } else if (assetId === 'dev02-wide') {
    rect(rgb, width, height, 0.08, 0.12, 0.84, 0.76, [47, 58, 78]);
    for (let index = 0; index < 4; index += 1) circle(rgb, width, height, Math.round(width * (0.2 + index * 0.2)), Math.round(height * (0.3 + (index % 2) * 0.25)), Math.round(width * 0.07), [220, 160 + index * 15, 130]);
    rect(rgb, width, height, 0.08 + progress * 0.62, 0.72, 0.16, 0.10, [45, 126, 247]);
  } else if (assetId === 'dev02-close') {
    rect(rgb, width, height, 0.08, 0.08, 0.84, 0.84, [72, 46, 88]);
    circle(rgb, width, height, Math.round(width * (0.8 - progress * 0.6)), Math.round(height * 0.52), Math.round(width * 0.18), [251, 205, 45]);
  } else if (assetId === 'dev02-reference') {
    fill(rgb, 0, 0, 0);
    rect(rgb, width, height, 0.03, 0.03, 0.28, 0.94, [60, 87, 120]);
    rect(rgb, width, height, 0.34, 0.03, 0.34, 0.30, [118, 66, 95]);
    rect(rgb, width, height, 0.34, 0.36, 0.34, 0.61, [52, 105, 90]);
    rect(rgb, width, height, 0.71, 0.03, 0.26, 0.45, [117, 83, 53]);
    rect(rgb, width, height, 0.71, 0.51, 0.26, 0.46, [67, 74, 118]);
    rect(rgb, width, height, 0.23, 0.44, 0.54, 0.055, [252, 218, 45]);
    rect(rgb, width, height, 0.30, 0.52, 0.40, 0.04, [252, 218, 45]);
  } else if (assetId === 'dev03-cards') {
    const section = Math.min(3, Math.floor(progress * 4));
    const colors: Array<[number, number, number]> = [[33, 82, 145], [111, 54, 124], [39, 121, 91], [151, 72, 48]];
    fill(rgb, ...colors[section]);
    for (let index = 0; index <= section; index += 1) rect(rgb, width, height, 0.12 + index * 0.19, 0.32, 0.13, 0.36, [238, 238, 226]);
  } else {
    rect(rgb, width, height, 0.18, 0.40, 0.64, 0.20, [80, 80, 95]);
    const x = Math.round(width * (0.08 + progress * 0.84));
    circle(rgb, width, height, x, Math.round(height * 0.48), Math.round(height * (0.16 + 0.025 * Math.sin(progress * Math.PI * 4))), [235, 144, 72]);
  }
  return rgb;
}

export function synthesizeAudioWavV2(assetId: string, durationFrames: number): Buffer {
  if (!['dev01-music', 'dev03-beats'].includes(assetId)) fail('UNKNOWN_AUDIO_ASSET', `No audio recipe for ${assetId}`);
  const samples = Math.round(durationFrames / FPS * SAMPLE_RATE);
  const pcm = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const time = index / SAMPLE_RATE;
    const frame = time * FPS;
    let value: number;
    if (assetId === 'dev01-music') {
      value = 0.12 * Math.sin(2 * Math.PI * 220 * time) + 0.05 * Math.sin(2 * Math.PI * 330 * time);
      if ((frame >= 60 && frame < 151) || (frame >= 196 && frame < 330)) value += 0.14 * Math.sin(2 * Math.PI * (105 + 12 * Math.sin(2 * Math.PI * 3 * time)) * time);
    } else {
      value = 0.025 * Math.sin(2 * Math.PI * 110 * time);
      const beatPhase = time % 0.5;
      if (beatPhase < 0.035) value += 0.38 * Math.exp(-beatPhase * 90) * Math.sin(2 * Math.PI * 900 * time);
      const strongPhase = time % 4;
      if (strongPhase < 0.08) value += 0.45 * Math.exp(-strongPhase * 45) * Math.sin(2 * Math.PI * 95 * time);
      if (frame >= 250 && frame < 350) value += 0.1 * Math.sin(2 * Math.PI * (125 + 18 * Math.sin(2 * Math.PI * 2.8 * time)) * time);
    }
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function encodePngV2(rgb: Buffer, width: number, height: number, outputPath: string, ffmpegPath: string): Promise<void> {
  const partial = `${outputPath}.partial.png`;
  await rm(partial, { force: true });
  await runFfmpegV2(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-fflags', '+bitexact', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-flags:v', '+bitexact', partial], rgb, 'PNG_ENCODE_FAILED');
  await rm(outputPath, { force: true });
  await rename(partial, outputPath);
}

async function runFfmpegV2(command: string, args: string[], input: Buffer, code: string): Promise<void> {
  const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const closed = new Promise<void>((accept, reject) => { child.once('error', reject); child.once('close', (exit) => exit === 0 ? accept() : reject(new MediaMaterializationErrorV2(code, stderr.slice(-1000)))); });
  child.stdin.end(input);
  await closed;
}

async function readFfmpegVersionV2(command: string): Promise<string> {
  const child = spawn(command, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; }); child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  await new Promise<void>((accept, reject) => { child.once('error', reject); child.once('close', (exit) => exit === 0 ? accept() : reject(new MediaMaterializationErrorV2('FFMPEG_VERSION_FAILED', stderr.slice(-1000)))); });
  return stdout.split(/\r?\n/, 1)[0] ?? fail('FFMPEG_VERSION_EMPTY', 'FFmpeg returned no version');
}

async function writeAtomic(path: string, bytes: Buffer): Promise<void> {
  const partial = `${path}.partial`;
  await writeFile(partial, bytes); await rm(path, { force: true }); await rename(partial, path);
}

function scaledDimensions(canvas: { width: number; height: number }): { width: number; height: number } {
  return canvas.width >= canvas.height ? { width: 640, height: 360 } : { width: 360, height: 640 };
}

function fill(buffer: Buffer, red: number, green: number, blue: number): void {
  for (let index = 0; index < buffer.length; index += 3) { buffer[index] = red; buffer[index + 1] = green; buffer[index + 2] = blue; }
}

function rect(buffer: Buffer, width: number, height: number, x: number, y: number, w: number, h: number, color: [number, number, number]): void {
  const left = Math.max(0, Math.floor(x * width)); const right = Math.min(width, Math.ceil((x + w) * width));
  const top = Math.max(0, Math.floor(y * height)); const bottom = Math.min(height, Math.ceil((y + h) * height));
  for (let py = top; py < bottom; py += 1) for (let px = left; px < right; px += 1) { const index = (py * width + px) * 3; buffer[index] = color[0]; buffer[index + 1] = color[1]; buffer[index + 2] = color[2]; }
}

function circle(buffer: Buffer, width: number, height: number, centerX: number, centerY: number, radius: number, color: [number, number, number]): void {
  for (let y = Math.max(0, centerY - radius); y < Math.min(height, centerY + radius); y += 1) for (let x = Math.max(0, centerX - radius); x < Math.min(width, centerX + radius); x += 1) if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) { const index = (y * width + x) * 3; buffer[index] = color[0]; buffer[index + 1] = color[1]; buffer[index + 2] = color[2]; }
}

function assertSafeOutputDirectory(path: string): string {
  const absolute = resolve(path); const parsed = parse(absolute);
  if (absolute === parsed.root || absolute === resolve(process.cwd())) fail('UNSAFE_OUTPUT_DIRECTORY', `Refusing broad output directory: ${absolute}`);
  return absolute;
}

function normalizePath(path: string): string { return path.replaceAll('\\', '/'); }
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function fail(code: string, message: string): never { throw new MediaMaterializationErrorV2(code, message); }
