import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

import { COMP_NAME } from '@/components/editron/editor/version-7.0.0/constants';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';

import {
  renderDev01TruthfulFrameV2,
  synthesizeDev01StemPcm16V2,
} from './dev01-native-proxy-fixture-v2';
import {
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6ArtifactIdV2,
  type Dev01Stage6ProjectSnapshotV2,
  type Dev01Stage6RenderProofV2,
  type Dev01Stage6RenderResultV2,
} from './dev01-stage6-native-proxy-contract-v2';

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 30;
const SOURCE_FRAMES = 480;
const OUTPUT_FRAMES = 435;
const SAMPLE_RATE = 48_000;
const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false, '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false, '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false, '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

type JsonRecord = Record<string, unknown>;
type Bounds = { left: number; top: number; width: number; height: number; centerX: number; centerY: number; pixels: number };

export async function renderDev01Stage6NativeProxyV2(input: {
  projectSnapshot: Dev01Stage6ProjectSnapshotV2;
  outputDir: string;
}): Promise<Dev01Stage6RenderResultV2> {
  await mkdir(input.outputDir, { recursive: true });
  const paths: Record<Dev01Stage6ArtifactIdV2, string> = {
    SOURCE_VIDEO: path.join(input.outputDir, 'source-host.mp4'),
    SOURCE_DIALOGUE_WAV: path.join(input.outputDir, 'source-dialogue.wav'),
    SOURCE_BGM_WAV: path.join(input.outputDir, 'source-bgm.wav'),
    PRE_REVEAL_STILL: path.join(input.outputDir, 'frame-0159.png'),
    REVEAL_STILL: path.join(input.outputDir, 'frame-0160.png'),
    ZOOMED_STILL: path.join(input.outputDir, 'frame-0171.png'),
    FULL_AV_PROXY: path.join(input.outputDir, 'dev01-native-proxy.mp4'),
    BGM_GAIN_PROOF_WAV: path.join(input.outputDir, 'dev01-bgm-gain-proof.wav'),
  };
  await materializeVideo(paths.SOURCE_VIDEO);
  await materializeWav(paths.SOURCE_DIALOGUE_WAV, synthesizeDev01StemPcm16V2('DIALOGUE'));
  await materializeWav(paths.SOURCE_BGM_WAV, synthesizeDev01StemPcm16V2('BGM'));

  const mediaServer = await startMediaServer(paths);
  try {
    const overlays = attachRenderableMedia(input.projectSnapshot, paths, mediaServer.baseUrl);
    const fullProps = assemble(overlays, 'full', mediaServer.baseUrl);
    const bgmProofProps = assemble(overlays.map((overlay) => (
      overlay.assetId === 'dev01-dialogue-truth-v2'
        ? { ...overlay, styles: { ...record(overlay.styles), volume: 0 } }
        : overlay
    )), 'audio-only', mediaServer.baseUrl);
    const serveUrl = await bundle(
      path.resolve(process.cwd(), 'components', 'editron', 'editor', 'version-7.0.0', 'remotion', 'index.ts'),
      undefined,
      { webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...(Array.isArray(config.resolve?.alias) ? {} : config.resolve?.alias), '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }) },
    );
    const composition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps: fullProps });
    const bgmProofComposition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps: bgmProofProps });
    const browserErrors: string[] = [];
    const browserLog = (entry: { type: string; text: string }) => {
      if (entry.type === 'error') browserErrors.push(entry.text);
    };
    for (const [frame, output] of [[159, paths.PRE_REVEAL_STILL], [160, paths.REVEAL_STILL], [171, paths.ZOOMED_STILL]] as const) {
      await renderStill({ composition, serveUrl, output, frame, inputProps: fullProps, imageFormat: 'png',
        chromiumOptions: { headless: true }, overwrite: true, onBrowserLog: browserLog });
    }
    await renderMedia({ composition, serveUrl, codec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p',
      colorSpace: 'bt709', outputLocation: paths.FULL_AV_PROXY, inputProps: fullProps,
      chromiumOptions: { headless: true }, concurrency: 2, overwrite: true,
      timeoutInMilliseconds: 240_000, onBrowserLog: browserLog });
    await renderMedia({ composition: bgmProofComposition, serveUrl, codec: 'wav', audioCodec: 'pcm-16',
      outputLocation: paths.BGM_GAIN_PROOF_WAV, inputProps: bgmProofProps,
      chromiumOptions: { headless: true }, concurrency: 1, overwrite: true,
      timeoutInMilliseconds: 240_000, onBrowserLog: browserLog });
    if (browserErrors.length) throw new Error(`DEV01_STAGE6_BROWSER_ERRORS:${browserErrors.join(' | ')}`);
    return { artifactPaths: paths, proof: await inspectProof(paths, browserErrors) };
  } finally {
    await mediaServer.close();
  }
}

function assemble(overlays: JsonRecord[], renderMediaMode: 'full' | 'audio-only', baseUrl: string): JsonRecord {
  return buildLambdaRenderInputProps({ overlays, durationInFrames: OUTPUT_FRAMES, fps: FPS,
    width: WIDTH, height: HEIGHT, baseUrl, isRendering: true, renderMediaMode }) as JsonRecord;
}

function attachRenderableMedia(
  project: Dev01Stage6ProjectSnapshotV2,
  paths: Record<Dev01Stage6ArtifactIdV2, string>,
  baseUrl: string,
): JsonRecord[] {
  const sources = {
    'dev01-host-truth-v2': `${baseUrl}/${path.basename(paths.SOURCE_VIDEO)}`,
    'dev01-dialogue-truth-v2': `${baseUrl}/${path.basename(paths.SOURCE_DIALOGUE_WAV)}`,
    'dev01-bgm-truth-v2': `${baseUrl}/${path.basename(paths.SOURCE_BGM_WAV)}`,
  } as const;
  return records(project.overlays).map((overlay) => {
    const assetId = text(overlay.assetId) as keyof typeof sources;
    const src = sources[assetId];
    if (!src) throw new Error(`DEV01_STAGE6_UNKNOWN_ASSET:${assetId}`);
    const base = { ...overlay, left: 0, top: 0, width: WIDTH, height: HEIGHT, rotation: 0, isDragging: false, src, content: src };
    if (overlay.type === 'video') return { ...base, styles: { ...record(overlay.styles), objectFit: 'cover', opacity: 1, volume: 0 } };
    const mediaRole = assetId === 'dev01-bgm-truth-v2' ? 'music' : 'voiceover';
    return {
      ...base,
      styles: { ...record(overlay.styles), volume: number(record(overlay.styles).volume) ?? (mediaRole === 'music' ? 0.355 : 1) },
      audioRights: { mediaRole, source: 'generated', userChoice: 'attested', licensed: true,
        evidence: { kind: 'generated-provider', sourceAssetId: assetId, licenseId: 'dev01-local-synthetic-fixture-v2' } },
    };
  });
}

async function inspectProof(
  paths: Record<Dev01Stage6ArtifactIdV2, string>, browserErrors: string[],
): Promise<Dev01Stage6RenderProofV2> {
  const probe = JSON.parse((await capture('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels:format=duration',
    '-of', 'json', paths.FULL_AV_PROXY])).toString('utf8')) as JsonRecord;
  const streams = records(probe.streams);
  const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  const pre = await yellowBounds(paths.PRE_REVEAL_STILL);
  const reveal = await yellowBounds(paths.REVEAL_STILL);
  const zoomed = await yellowBounds(paths.ZOOMED_STILL);
  if (!reveal || !zoomed) throw new Error('DEV01_STAGE6_PRODUCT_BOUNDS_MISSING');
  const bgmPcm = await decodeMonoPcm(paths.BGM_GAIN_PROOF_WAV);
  const fullPcm = await decodeMonoPcm(paths.FULL_AV_PROXY);
  const soloBefore = rms(bgmPcm, 20, 45); const ducked = rms(bgmPcm, 90, 130); const soloAfter = rms(bgmPcm, 330, 390);
  const fullSpeech = rms(fullPcm, 90, 130);
  return {
    schemaVersion: DEV01_STAGE6_NATIVE_PROXY_V2,
    renderer: {
      root: 'components/editron/editor/version-7.0.0/remotion/index.ts',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx',
      audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    composition: { width: WIDTH, height: HEIGHT, fpsNumerator: FPS, fpsDenominator: 1, durationInFrames: OUTPUT_FRAMES },
    sourceBindings: { hostVideoAssetId: 'dev01-host-truth-v2', dialogueAssetId: 'dev01-dialogue-truth-v2', bgmAssetId: 'dev01-bgm-truth-v2' },
    video: { codec: text(video.codec_name), width: integer(video.width), height: integer(video.height),
      averageFrameRate: text(video.avg_frame_rate), decodedFrameCount: integer(video.nb_read_frames),
      durationSeconds: Number(record(probe.format).duration), audioStreamCount: streams.filter((stream) => stream.codec_type === 'audio').length },
    visual: { preRevealFrame: 159, revealFrame: 160, zoomedFrame: 171, preRevealYellowPixels: pre?.pixels ?? 0,
      revealYellowPixels: reveal.pixels, revealBounds: withoutPixels(reveal), zoomedBounds: withoutPixels(zoomed),
      widthScale: round(zoomed.width / reveal.width), heightScale: round(zoomed.height / reveal.height),
      centerDriftPixels: round(Math.hypot(zoomed.centerX - reveal.centerX, zoomed.centerY - reveal.centerY)) },
    audio: { sampleRateHz: SAMPLE_RATE, bgmProofSampleFrames: bgmPcm.length / 2, fullMixSampleFrames: fullPcm.length / 2,
      bgmSoloBeforeRms: round(soloBefore), bgmDuckedRms: round(ducked), bgmSoloAfterRms: round(soloAfter),
      duckReductionDb: round(db((soloBefore + soloAfter) / 2, ducked)), soloRecoveryRatio: round(soloAfter / soloBefore),
      fullSpeechRms: round(fullSpeech), dialogueLiftOverDuckedBgmDb: round(db(fullSpeech, ducked)), fullMixPeak: round(peak(fullPcm)) },
    browserErrors,
    externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
  };
}

async function materializeVideo(output: string): Promise<void> {
  const child = startPipe(['-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${WIDTH}x${HEIGHT}`,
    '-framerate', String(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12',
    '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-y', output]);
  for (let frame = 0; frame < SOURCE_FRAMES; frame += 1) {
    if (!child.stdin.write(renderDev01TruthfulFrameV2(frame, WIDTH, HEIGHT))) await once(child.stdin, 'drain');
  }
  child.stdin.end(); await child.done;
}

async function materializeWav(output: string, pcm: Buffer): Promise<void> {
  const child = startPipe(['-v', 'error', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0', '-c:a', 'pcm_s16le', '-y', output]);
  child.stdin.end(pcm); await child.done;
}

async function startMediaServer(paths: Record<Dev01Stage6ArtifactIdV2, string>): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> {
  const assets = new Map<string, { bytes: Buffer; contentType: string }>([
    [path.basename(paths.SOURCE_VIDEO), { bytes: await readFile(paths.SOURCE_VIDEO), contentType: 'video/mp4' }],
    [path.basename(paths.SOURCE_DIALOGUE_WAV), { bytes: await readFile(paths.SOURCE_DIALOGUE_WAV), contentType: 'audio/wav' }],
    [path.basename(paths.SOURCE_BGM_WAV), { bytes: await readFile(paths.SOURCE_BGM_WAV), contentType: 'audio/wav' }],
  ]);
  const server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1);
    const asset = assets.get(name);
    if (!asset) { response.writeHead(404).end(); return; }
    const parsedRange = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? ''));
    const start = parsedRange ? Number(parsedRange[1]) : 0;
    const requestedEnd = parsedRange?.[2] ? Number(parsedRange[2]) : asset.bytes.length - 1;
    const end = Math.min(requestedEnd, asset.bytes.length - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= asset.bytes.length) {
      response.writeHead(416, { 'Content-Range': `bytes */${asset.bytes.length}` }).end(); return;
    }
    const body = asset.bytes.subarray(start, end + 1);
    response.writeHead(parsedRange ? 206 : 200, {
      'Content-Type': asset.contentType, 'Content-Length': body.length, 'Accept-Ranges': 'bytes',
      ...(parsedRange ? { 'Content-Range': `bytes ${start}-${end}/${asset.bytes.length}` } : {}),
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

function startPipe(args: string[]) {
  const child = spawn('ffmpeg', args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFMPEG_FAILED:${stderr.slice(-2000)}`)));
  });
  return { stdin: child.stdin, done };
}

async function capture(command: string, args: string[]): Promise<Buffer> {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout: Buffer[] = []; let stderr = '';
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const [code] = await once(child, 'close') as [number];
  if (code !== 0) throw new Error(`${command.toUpperCase()}_FAILED:${stderr.slice(-2000)}`);
  return Buffer.concat(stdout);
}

async function decodeMonoPcm(file: string): Promise<Buffer> { return capture('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1']); }
async function yellowBounds(file: string): Promise<Bounds | null> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width; let right = -1; let top = info.height; let bottom = -1; let pixels = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * info.channels; const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
    if (red > 180 && green > 120 && blue < 120 && red - blue > 100) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels += 1; }
  }
  return pixels ? { left, top, width: right - left + 1, height: bottom - top + 1, centerX: (left + right) / 2, centerY: (top + bottom) / 2, pixels } : null;
}
function rms(pcm: Buffer, startFrame: number, endFrame: number): number { let energy = 0; const start = startFrame * SAMPLE_RATE / FPS; const end = Math.min(pcm.length / 2, endFrame * SAMPLE_RATE / FPS); for (let i = start; i < end; i += 1) { const value = pcm.readInt16LE(i * 2) / 32768; energy += value * value; } return Math.sqrt(energy / Math.max(1, end - start)); }
function peak(pcm: Buffer): number { let value = 0; for (let i = 0; i < pcm.length; i += 2) value = Math.max(value, Math.abs(pcm.readInt16LE(i)) / 32768); return value; }
function db(numerator: number, denominator: number): number { if (numerator <= 0 || denominator <= 0) throw new Error('DEV01_STAGE6_AUDIO_WINDOW_SILENT'); return 20 * Math.log10(numerator / denominator); }
function withoutPixels(bounds: Bounds) { const { pixels: _pixels, ...rest } = bounds; return rest; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : 0; }
function round(value: number): number { return Number(value.toFixed(6)); }
