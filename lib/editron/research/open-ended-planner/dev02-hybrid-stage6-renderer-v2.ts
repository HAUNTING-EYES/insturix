import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import sharp from 'sharp';

import {
  DEV02_HYBRID_STAGE6_VERSION_V2,
  type Dev02HybridIslandBindingV2,
  type Dev02HybridNativeSourceBindingV2,
  type Dev02HybridStage6ArtifactIdV2,
  type Dev02HybridStage6RenderProofV2,
  type Dev02HybridStage6RenderResultV2,
} from './dev02-hybrid-stage6-contract-v2';

type JsonRecord = Record<string, unknown>;

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const ISLAND_FRAMES = 180;
const NATIVE_END = 345;
const TOTAL_FRAMES = 345;

export async function renderDev02HybridStage6ProxyV2(input: {
  island: Dev02HybridIslandBindingV2;
  nativeSource: Dev02HybridNativeSourceBindingV2;
  outputDir: string;
}): Promise<Dev02HybridStage6RenderResultV2> {
  await Promise.all([
    assertBoundFile(input.island.videoPath, input.island.videoSha256, 'ISLAND'),
    assertBoundFile(input.nativeSource.videoPath, input.nativeSource.videoSha256, 'NATIVE_SOURCE'),
  ]);
  const [islandProbe, nativeProbe] = await Promise.all([
    probeVideo(input.island.videoPath),
    probeVideo(input.nativeSource.videoPath),
  ]);
  assertInputProbe(islandProbe, nativeProbe);
  await mkdir(input.outputDir, { recursive: true });
  const artifacts = artifactPaths(input.outputDir);

  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', input.island.videoPath, '-i', input.nativeSource.videoPath,
    '-filter_complex',
    `[0:v]trim=start_frame=0:end_frame=${ISLAND_FRAMES},setpts=PTS-STARTPTS,scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p[island];`
      + `[1:v]trim=start_frame=${input.nativeSource.sourceStartFrame}:end_frame=${input.nativeSource.sourceEndExclusiveFrame},setpts=PTS-STARTPTS,scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p[native];`
      + `[island][native]concat=n=2:v=1:a=0,fps=${FPS}[outv]`,
    '-map', '[outv]', '-frames:v', String(TOTAL_FRAMES), '-an', '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-color_range', 'tv', '-movflags', '+faststart', artifacts.FULL_HYBRID_PROXY,
  ]);

  await Promise.all([
    extractFrame(input.island.videoPath, 108, artifacts.ISLAND_SAMPLE_0108),
    extractFrame(artifacts.FULL_HYBRID_PROXY, 108, artifacts.HYBRID_SAMPLE_0108),
    extractFrame(artifacts.FULL_HYBRID_PROXY, 179, artifacts.HYBRID_EXIT_0179),
    extractFrame(artifacts.FULL_HYBRID_PROXY, 180, artifacts.HYBRID_NATIVE_ENTRY_0180),
    extractFrame(input.nativeSource.videoPath, 180, artifacts.NATIVE_SOURCE_ENTRY_0180, true),
    extractFrame(artifacts.FULL_HYBRID_PROXY, 344, artifacts.HYBRID_NATIVE_FINAL_0344),
    extractFrame(input.nativeSource.videoPath, 344, artifacts.NATIVE_SOURCE_FINAL_0344, true),
  ]);
  const outputProbe = await probeVideo(artifacts.FULL_HYBRID_PROXY);
  const evidence = await Promise.all([
    normalizedImageDiff(artifacts.HYBRID_SAMPLE_0108, artifacts.ISLAND_SAMPLE_0108),
    normalizedImageDiff(artifacts.HYBRID_EXIT_0179, artifacts.NATIVE_SOURCE_ENTRY_0180),
    normalizedImageDiff(artifacts.HYBRID_NATIVE_ENTRY_0180, artifacts.NATIVE_SOURCE_ENTRY_0180),
    normalizedImageDiff(artifacts.HYBRID_NATIVE_FINAL_0344, artifacts.NATIVE_SOURCE_FINAL_0344),
    normalizedImageDiff(artifacts.HYBRID_EXIT_0179, artifacts.HYBRID_NATIVE_ENTRY_0180),
  ]);
  return {
    artifactPaths: artifacts,
    proof: {
      schemaVersion: DEV02_HYBRID_STAGE6_VERSION_V2,
      assembler: 'FFMPEG_FILTER_GRAPH_BOUND_TO_STAGE4_TIME_ANCHOR',
      composition: {
        width: WIDTH, height: HEIGHT, fpsNumerator: FPS, fpsDenominator: 1,
        generatedFrames: ISLAND_FRAMES, nativeFrames: 165,
        totalFrames: TOTAL_FRAMES,
      },
      inputVideo: {
        islandCodec: islandProbe.codec,
        islandFrameRate: islandProbe.frameRate,
        islandFrameCount: islandProbe.frameCount,
        islandAudioStreams: islandProbe.audioStreams,
        nativeCodec: nativeProbe.codec,
        nativeFrameRate: nativeProbe.frameRate,
        nativeFrameCount: nativeProbe.frameCount,
        nativeAudioStreams: nativeProbe.audioStreams,
      },
      outputVideo: {
        codec: outputProbe.codec, width: outputProbe.width, height: outputProbe.height,
        averageFrameRate: outputProbe.frameRate, decodedFrameCount: outputProbe.frameCount,
        durationSeconds: outputProbe.durationSeconds, audioStreamCount: outputProbe.audioStreams,
      },
      decodedFrameEvidence: {
        generatedSegmentNormalizedDifference: round(evidence[0]),
        generatedExitToNativeSourceNormalizedDifference: round(evidence[1]),
        nativeEntryToSourceNormalizedDifference: round(evidence[2]),
        nativeFinalToSourceNormalizedDifference: round(evidence[3]),
        outputBoundaryNormalizedDifference: round(evidence[4]),
      },
      externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
    },
  };
}

function artifactPaths(root: string): Record<Dev02HybridStage6ArtifactIdV2, string> {
  return {
    FULL_HYBRID_PROXY: path.join(root, 'dev02-full-hybrid-proxy.mp4'),
    ISLAND_SAMPLE_0108: path.join(root, 'island-sample-0108.png'),
    HYBRID_SAMPLE_0108: path.join(root, 'hybrid-sample-0108.png'),
    HYBRID_EXIT_0179: path.join(root, 'hybrid-exit-0179.png'),
    HYBRID_NATIVE_ENTRY_0180: path.join(root, 'hybrid-native-entry-0180.png'),
    NATIVE_SOURCE_ENTRY_0180: path.join(root, 'native-source-entry-0180.png'),
    HYBRID_NATIVE_FINAL_0344: path.join(root, 'hybrid-native-final-0344.png'),
    NATIVE_SOURCE_FINAL_0344: path.join(root, 'native-source-final-0344.png'),
  };
}

async function assertBoundFile(filePath: string, expectedHash: string, label: string): Promise<void> {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) throw new Error(`DEV02_HYBRID_${label}_FILE_INVALID`);
  if (sha256(await readFile(filePath)) !== expectedHash) throw new Error(`DEV02_HYBRID_${label}_HASH_DRIFT`);
}

async function probeVideo(filePath: string) {
  const value = JSON.parse((await capture('ffprobe', [
    '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', filePath,
  ])).toString('utf8')) as JsonRecord;
  const streams = records(value.streams);
  const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  return {
    codec: text(video.codec_name), width: integer(video.width), height: integer(video.height),
    frameRate: text(video.avg_frame_rate), frameCount: integer(video.nb_read_frames),
    audioStreams: streams.filter((stream) => stream.codec_type === 'audio').length,
    durationSeconds: Number(record(value.format).duration),
  };
}

function assertInputProbe(island: Awaited<ReturnType<typeof probeVideo>>, native: Awaited<ReturnType<typeof probeVideo>>): void {
  if (island.codec !== 'h264' || island.width !== WIDTH || island.height !== HEIGHT
    || island.frameRate !== '30/1' || island.frameCount !== ISLAND_FRAMES || island.audioStreams !== 0) {
    throw new Error('DEV02_HYBRID_ISLAND_VIDEO_CONTRACT_INVALID');
  }
  if (native.codec !== 'h264' || native.frameRate !== '30/1'
    || native.frameCount < NATIVE_END || native.audioStreams !== 0) {
    throw new Error('DEV02_HYBRID_NATIVE_VIDEO_CONTRACT_INVALID');
  }
}

async function extractFrame(source: string, frame: number, output: string, scale = false): Promise<void> {
  const filter = `select=eq(n\\,${frame})${scale ? `,scale=${WIDTH}:${HEIGHT}:flags=lanczos` : ''}`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-vf', filter, '-frames:v', '1', output]);
}

async function normalizedImageDiff(left: string, right: string): Promise<number> {
  const [a, b] = await Promise.all([raw(left), raw(right)]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.data.length !== b.data.length) {
    throw new Error('DEV02_HYBRID_FRAME_DIMENSION_DRIFT');
  }
  let total = 0;
  for (let index = 0; index < a.data.length; index += 1) total += Math.abs(a.data[index] - b.data[index]);
  return total / (a.data.length * 255);
}

async function raw(filePath: string) { return sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = []; let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const [code] = await once(child, 'close') as [number];
  if (code !== 0) throw new Error(`${command.toUpperCase()}_FAILED:${stderr.slice(-2000)}`);
  return Buffer.concat(stdout);
}
async function run(command: string, args: string[]): Promise<void> { await capture(command, args); }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : 0; }
function round(value: number): number { return Number(value.toFixed(8)); }
