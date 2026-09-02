import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { COMP_NAME } from '@/components/editron/editor/version-7.0.0/constants';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import sharp from 'sharp';

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

export interface Stage25PreviewVideoProbeV1 {
  codec: string;
  width: number;
  height: number;
  frameRate: string;
  frameCount: number;
  durationSeconds: number;
  audioStreamCount: number;
}

export async function renderStage25NativeOverlayPreviewV1(input: {
  overlays: readonly Overlay[];
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  assetPaths: Readonly<Record<string, string>>;
  outputDir: string;
  outputFileName: string;
  proofFrames: readonly number[];
}) {
  assertRenderContract(input);
  const root = safeOutputRoot(input.outputDir);
  await mkdir(root, { recursive: true });
  const outputPath = path.join(root, safeFileName(input.outputFileName, '.mp4'));
  await assertAbsent(outputPath);
  const assets = new Map<string, { bytes: Buffer; type: string }>();
  for (const [assetId, filePath] of Object.entries(input.assetPaths)) {
    assets.set(`${assetId}.mp4`, { bytes: await readRegularFile(filePath), type: 'video/mp4' });
  }
  const server = await startMediaServer(assets);
  const stills = input.proofFrames.map((frame) => ({
    frame,
    path: path.join(root, `${path.parse(input.outputFileName).name}-${String(frame).padStart(4, '0')}.png`),
  }));
  const browserErrors: string[] = [];
  const started = performance.now();
  try {
    const props = buildLambdaRenderInputProps({
      overlays: [...input.overlays],
      durationInFrames: input.durationInFrames,
      fps: input.fps,
      width: input.width,
      height: input.height,
      baseUrl: server.baseUrl,
      isRendering: true,
      renderMediaMode: 'full' as const,
      setSelectedOverlayId: () => {},
      selectedOverlayId: null,
      changeOverlay: () => {},
    });
    const serveUrl = await bundle(
      path.resolve('components/editron/editor/version-7.0.0/remotion/index.ts'),
      undefined,
      {
        webpackOverride: (config) => ({
          ...config,
          resolve: {
            ...config.resolve,
            alias: {
              ...(Array.isArray(config.resolve?.alias) ? {} : config.resolve?.alias),
              '@': process.cwd(),
            },
            fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
          },
        }),
      },
    );
    const composition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps: props });
    const onBrowserLog = (entry: { type: string; text: string }) => {
      if (entry.type === 'error') browserErrors.push(entry.text);
    };
    for (const still of stills) {
      await renderStill({
        composition,
        serveUrl,
        output: still.path,
        frame: still.frame,
        inputProps: props,
        imageFormat: 'png',
        overwrite: false,
        chromiumOptions: { headless: true },
        onBrowserLog,
      });
    }
    await renderMedia({
      composition,
      serveUrl,
      outputLocation: outputPath,
      inputProps: props,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      muted: true,
      concurrency: 2,
      overwrite: false,
      timeoutInMilliseconds: 300_000,
      chromiumOptions: { headless: true },
      onBrowserLog,
    });
  } finally {
    await server.close();
  }
  if (browserErrors.length) fail(`NATIVE_BROWSER_ERRORS:${browserErrors.join('|')}`);
  const probe = await probeStage25PreviewVideoV1(outputPath);
  assertProbe(probe, input.width, input.height, input.fps, input.durationInFrames);
  return Object.freeze({
    outputPath,
    outputSha256: sha256(await readRegularFile(outputPath)),
    probe,
    stills: await Promise.all(stills.map(async (still) => ({
      ...still,
      sha256: sha256(await readRegularFile(still.path)),
    }))),
    browserErrors,
    elapsedMilliseconds: Math.round(performance.now() - started),
  });
}

export async function assembleStage25GeneratedContinuationPreviewV1(input: {
  islandPath: string;
  followingPath: string;
  islandFrames: number;
  followingSourceStartFrame: number;
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
  outputPath: string;
}) {
  const islandBytes = await readRegularFile(input.islandPath);
  const followingBytes = await readRegularFile(input.followingPath);
  const islandProbe = await probeStage25PreviewVideoV1(input.islandPath);
  const followingProbe = await probeStage25PreviewVideoV1(input.followingPath);
  assertProbe(islandProbe, input.width, input.height, input.fps, input.islandFrames);
  if (followingProbe.codec !== 'h264' || followingProbe.frameRate !== `${input.fps}/1`
    || followingProbe.frameCount < input.followingSourceStartFrame
      + (input.totalFrames - input.islandFrames)) fail('FOLLOWING_VIDEO_CONTRACT_INVALID');
  const output = path.resolve(input.outputPath);
  safeOutputRoot(path.dirname(output));
  await mkdir(path.dirname(output), { recursive: true });
  await assertAbsent(output);
  const followingEnd = input.followingSourceStartFrame + (input.totalFrames - input.islandFrames);
  await capture(getFFmpegPath(), [
    '-v', 'error',
    '-i', input.islandPath,
    '-i', input.followingPath,
    '-filter_complex',
    `[0:v]trim=start_frame=0:end_frame=${input.islandFrames},setpts=N/${input.fps}/TB,scale=${input.width}:${input.height}:flags=lanczos,format=yuv420p[island];`
      + `[1:v]trim=start_frame=${input.followingSourceStartFrame}:end_frame=${followingEnd},setpts=N/${input.fps}/TB,scale=${input.width}:${input.height}:flags=lanczos,format=yuv420p[native];`
      + '[island][native]concat=n=2:v=1:a=0[outv]',
    '-map', '[outv]',
    '-frames:v', String(input.totalFrames),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    '-color_range', 'tv',
    '-movflags', '+faststart',
    output,
  ]);
  const evidenceDir = path.join(path.dirname(output), `${path.parse(output).name}-boundary`);
  await mkdir(evidenceDir);
  const frames = {
    islandExit: path.join(evidenceDir, 'island-exit.png'),
    outputExit: path.join(evidenceDir, 'output-exit.png'),
    outputEntry: path.join(evidenceDir, 'output-entry.png'),
    sourceExit: path.join(evidenceDir, 'source-exit.png'),
    sourceEntry: path.join(evidenceDir, 'source-entry.png'),
  };
  await Promise.all([
    extractStage25PreviewFrameV1(input.islandPath, input.islandFrames - 1, frames.islandExit, input.width, input.height),
    extractStage25PreviewFrameV1(output, input.islandFrames - 1, frames.outputExit, input.width, input.height),
    extractStage25PreviewFrameV1(output, input.islandFrames, frames.outputEntry, input.width, input.height),
    extractStage25PreviewFrameV1(input.followingPath, input.followingSourceStartFrame - 1, frames.sourceExit, input.width, input.height),
    extractStage25PreviewFrameV1(input.followingPath, input.followingSourceStartFrame, frames.sourceEntry, input.width, input.height),
  ]);
  const probe = await probeStage25PreviewVideoV1(output);
  assertProbe(probe, input.width, input.height, input.fps, input.totalFrames);
  return Object.freeze({
    outputPath: output,
    outputSha256: sha256(await readRegularFile(output)),
    probe,
    inputHashes: { island: sha256(islandBytes), following: sha256(followingBytes) },
    boundaryEvidence: {
      frames,
      islandExitToOutputExit: await normalizedStage25ImageDiffV1(frames.islandExit, frames.outputExit),
      outputEntryToSourceEntry: await normalizedStage25ImageDiffV1(frames.outputEntry, frames.sourceEntry),
      outputBoundaryDelta: await normalizedStage25ImageDiffV1(frames.outputExit, frames.outputEntry),
      naturalSourceBoundaryDelta: await normalizedStage25ImageDiffV1(frames.sourceExit, frames.sourceEntry),
    },
  });
}

export async function probeStage25PreviewVideoV1(filePath: string): Promise<Stage25PreviewVideoProbeV1> {
  const value = JSON.parse((await capture('ffprobe', [
    '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', filePath,
  ])).toString('utf8')) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  const streams = value.streams ?? [];
  const video = streams.find(({ codec_type }) => codec_type === 'video') ?? {};
  return {
    codec: String(video.codec_name ?? ''),
    width: Number(video.width),
    height: Number(video.height),
    frameRate: String(video.avg_frame_rate ?? ''),
    frameCount: Number(video.nb_read_frames),
    durationSeconds: Number(value.format?.duration),
    audioStreamCount: streams.filter(({ codec_type }) => codec_type === 'audio').length,
  };
}

export async function extractStage25PreviewFrameV1(
  source: string,
  frame: number,
  output: string,
  width: number,
  height: number,
): Promise<void> {
  if (!Number.isSafeInteger(frame) || frame < 0) fail('FRAME_INVALID');
  await capture(getFFmpegPath(), [
    '-v', 'error', '-i', source,
    '-vf', `select=eq(n\\,${frame}),scale=${width}:${height}:flags=lanczos`,
    '-frames:v', '1', output,
  ]);
}

export async function normalizedStage25ImageDiffV1(left: string, right: string): Promise<number> {
  const [a, b] = await Promise.all([
    sharp(left).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(right).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height
    || a.data.length !== b.data.length) fail('IMAGE_DIMENSION_DRIFT');
  let total = 0;
  for (let index = 0; index < a.data.length; index += 1) {
    total += Math.abs(a.data[index] - b.data[index]);
  }
  return Number((total / (a.data.length * 255)).toFixed(8));
}

function assertRenderContract(input: {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  proofFrames: readonly number[];
}): void {
  if (![input.durationInFrames, input.fps, input.width, input.height].every((value) => (
    Number.isSafeInteger(value) && value > 0
  )) || !input.proofFrames.length || new Set(input.proofFrames).size !== input.proofFrames.length
    || input.proofFrames.some((frame) => !Number.isSafeInteger(frame)
      || frame < 0 || frame >= input.durationInFrames)) fail('RENDER_CONTRACT_INVALID');
}
function assertProbe(value: Stage25PreviewVideoProbeV1, width: number, height: number, fps: number, frames: number): void {
  if (value.codec !== 'h264' || value.width !== width || value.height !== height
    || value.frameRate !== `${fps}/1` || value.frameCount !== frames
    || value.audioStreamCount !== 0 || Math.abs(value.durationSeconds - frames / fps) > 0.001) {
    fail(`OUTPUT_PROBE_INVALID:${JSON.stringify({
      actual: value,
      expected: {
        codec: 'h264', width, height, frameRate: `${fps}/1`, frameCount: frames,
        durationSeconds: frames / fps, audioStreamCount: 0,
      },
    })}`);
  }
}
async function startMediaServer(assets: Map<string, { bytes: Buffer; type: string }>) {
  const server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1);
    const asset = assets.get(name);
    if (!asset) { response.writeHead(404).end(); return; }
    const match = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? ''));
    const start = match ? Number(match[1]) : 0;
    const end = Math.min(match?.[2] ? Number(match[2]) : asset.bytes.length - 1, asset.bytes.length - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end < start || start >= asset.bytes.length) {
      response.writeHead(416, { 'Content-Range': `bytes */${asset.bytes.length}` }).end(); return;
    }
    const body = asset.bytes.subarray(start, end + 1);
    response.writeHead(match ? 206 : 200, {
      'Content-Type': asset.type,
      'Content-Length': body.length,
      'Accept-Ranges': 'bytes',
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${asset.bytes.length}` } : {}),
    });
    if (request.method === 'HEAD') response.end(); else response.end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
async function readRegularFile(filePath: string): Promise<Buffer> {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) fail('FILE_INVALID');
  return readFile(filePath);
}
async function assertAbsent(filePath: string): Promise<void> {
  try { await lstat(filePath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_ALREADY_EXISTS');
}
async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const [code] = await once(child, 'close') as [number];
  if (code !== 0) fail(`COMMAND_FAILED:${path.basename(command)}:${stderr.slice(-1_500)}`);
  return Buffer.concat(stdout);
}
function safeOutputRoot(value: string): string {
  const root = path.resolve(value);
  if (root === path.parse(root).root || root === path.resolve(process.cwd())) fail('OUTPUT_ROOT_UNSAFE');
  return root;
}
function safeFileName(value: string, extension: string): string {
  if (path.basename(value) !== value || path.extname(value).toLowerCase() !== extension) fail('OUTPUT_FILENAME_INVALID');
  return value;
}
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function fail(code: string): never { throw new Error(`STAGE25_PREVIEW_VIDEO_${code}`); }
