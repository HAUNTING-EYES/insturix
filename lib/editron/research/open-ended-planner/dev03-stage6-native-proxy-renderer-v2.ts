import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

import { COMP_NAME } from '@/components/editron/editor/version-7.0.0/constants';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';

import { getCanonicalDev03NativeProxyFixtureV2, sha256Dev03FixtureBytesV2 } from './dev03-native-proxy-fixture-v2';
import {
  DEV03_STAGE6_NATIVE_PROXY_V2, type Dev03Stage6ArtifactIdV2, type Dev03Stage6ProjectSnapshotV2,
  type Dev03Stage6RenderProofV2, type Dev03Stage6RenderResultV2,
} from './dev03-stage6-native-proxy-contract-v2';

const WIDTH = 320; const HEIGHT = 180; const FPS = 30; const FRAMES = 600; const SAMPLE_RATE = 48_000;
const SOURCE_VIDEO = path.resolve('.calibration-temp/open-ended-planner-v2/development-media/dev03-cards.mp4');
const SOURCE_AUDIO = path.resolve('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav');
const COMPOSITOR_FALLBACKS = { '@remotion/compositor': false, '@remotion/compositor-darwin-arm64': false, '@remotion/compositor-darwin-x64': false, '@remotion/compositor-linux-x64': false, '@remotion/compositor-linux-arm64': false, '@remotion/compositor-win32-x64-msvc': false, '@remotion/compositor-windows-x64': false } as const;
type JsonRecord = Record<string, unknown>;

export async function renderDev03Stage6NativeProxyV2(input: {
  alignedProjectSnapshot: Dev03Stage6ProjectSnapshotV2;
  shakenProjectSnapshot: Dev03Stage6ProjectSnapshotV2;
  outputDir: string;
}): Promise<Dev03Stage6RenderResultV2> {
  await mkdir(input.outputDir, { recursive: true });
  const paths = artifactPaths(input.outputDir);
  const fixture = getCanonicalDev03NativeProxyFixtureV2();
  const [videoBytes, audioBytes] = await Promise.all([readFile(SOURCE_VIDEO), readFile(SOURCE_AUDIO)]);
  if (sha256Dev03FixtureBytesV2(videoBytes) !== fixture.assets.cards.sha256 || sha256Dev03FixtureBytesV2(audioBytes) !== fixture.assets.beats.sha256) throw new Error('DEV03_STAGE6_SOURCE_HASH_DRIFT');
  await Promise.all([writeFile(paths.SOURCE_VIDEO, videoBytes, { flag: 'wx' }), writeFile(paths.SOURCE_AUDIO, audioBytes, { flag: 'wx' })]);
  const media = await startMediaServer(paths);
  try {
    const alignedProps = assemble(attachMedia(input.alignedProjectSnapshot, media.baseUrl));
    const shakenProps = assemble(attachMedia(input.shakenProjectSnapshot, media.baseUrl));
    const serveUrl = await bundle(path.resolve('components/editron/editor/version-7.0.0/remotion/index.ts'), undefined, { webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, alias: { ...(Array.isArray(config.resolve?.alias) ? {} : config.resolve?.alias), '@': process.cwd() }, fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS } } }) });
    const [alignedComposition, shakenComposition] = await Promise.all([
      selectComposition({ serveUrl, id: COMP_NAME, inputProps: alignedProps }), selectComposition({ serveUrl, id: COMP_NAME, inputProps: shakenProps }),
    ]);
    const browserErrors: string[] = []; const browserLog = (entry: { type: string; text: string }) => { if (entry.type === 'error') browserErrors.push(entry.text); };
    const shakenStills: Array<[number, string]> = [[118, paths.CUT1_BEFORE], [119, paths.CUT1_AFTER], [238, paths.CUT2_BEFORE], [239, paths.CUT2_AFTER], [478, paths.CUT3_BEFORE], [479, paths.CUT3_AFTER], [480, paths.SHAKE_ACTIVE], [490, paths.SHAKE_NEUTRAL]];
    for (const [frame, output] of shakenStills) await renderStill({ composition: shakenComposition, serveUrl, output, frame, inputProps: shakenProps, imageFormat: 'png', chromiumOptions: { headless: true }, overwrite: true, onBrowserLog: browserLog });
    for (const [frame, output] of [[480, paths.SHAKE_ACTIVE_BASELINE], [490, paths.SHAKE_NEUTRAL_BASELINE]] as const) await renderStill({ composition: alignedComposition, serveUrl, output, frame, inputProps: alignedProps, imageFormat: 'png', chromiumOptions: { headless: true }, overwrite: true, onBrowserLog: browserLog });
    await renderMedia({ composition: shakenComposition, serveUrl, codec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p', colorSpace: 'bt709', outputLocation: paths.FULL_AV_PROXY, inputProps: shakenProps, chromiumOptions: { headless: true }, concurrency: 2, overwrite: true, timeoutInMilliseconds: 300_000, onBrowserLog: browserLog });
    await renderMedia({ composition: alignedComposition, serveUrl, codec: 'wav', audioCodec: 'pcm-16', outputLocation: paths.PROTECTED_AUDIO_BASELINE_WAV, inputProps: alignedProps, chromiumOptions: { headless: true }, concurrency: 1, overwrite: true, timeoutInMilliseconds: 300_000, onBrowserLog: browserLog });
    await renderMedia({ composition: shakenComposition, serveUrl, codec: 'wav', audioCodec: 'pcm-16', outputLocation: paths.PROTECTED_AUDIO_WAV, inputProps: shakenProps, chromiumOptions: { headless: true }, concurrency: 1, overwrite: true, timeoutInMilliseconds: 300_000, onBrowserLog: browserLog });
    if (browserErrors.length) throw new Error(`DEV03_STAGE6_BROWSER_ERRORS:${browserErrors.join(' | ')}`);
    return { artifactPaths: paths, proof: await inspectProof(paths, browserErrors) };
  } finally { await media.close(); }
}

function artifactPaths(outputDir: string): Record<Dev03Stage6ArtifactIdV2, string> { return {
  SOURCE_VIDEO: path.join(outputDir, 'source-cards.mp4'), SOURCE_AUDIO: path.join(outputDir, 'source-beats.wav'),
  CUT1_BEFORE: path.join(outputDir, 'cut1-before-0118.png'), CUT1_AFTER: path.join(outputDir, 'cut1-after-0119.png'), CUT2_BEFORE: path.join(outputDir, 'cut2-before-0238.png'), CUT2_AFTER: path.join(outputDir, 'cut2-after-0239.png'), CUT3_BEFORE: path.join(outputDir, 'cut3-before-0478.png'), CUT3_AFTER: path.join(outputDir, 'cut3-after-0479.png'),
  SHAKE_ACTIVE_BASELINE: path.join(outputDir, 'shake-baseline-0480.png'), SHAKE_ACTIVE: path.join(outputDir, 'shake-active-0480.png'), SHAKE_NEUTRAL_BASELINE: path.join(outputDir, 'shake-baseline-0490.png'), SHAKE_NEUTRAL: path.join(outputDir, 'shake-neutral-0490.png'),
  FULL_AV_PROXY: path.join(outputDir, 'dev03-native-proxy.mp4'), PROTECTED_AUDIO_BASELINE_WAV: path.join(outputDir, 'dev03-protected-audio-baseline.wav'), PROTECTED_AUDIO_WAV: path.join(outputDir, 'dev03-protected-audio.wav'),
}; }
function assemble(overlays: JsonRecord[]): JsonRecord { return buildLambdaRenderInputProps({ overlays, durationInFrames: FRAMES, fps: FPS, width: WIDTH, height: HEIGHT, baseUrl: '', isRendering: true, renderMediaMode: 'full' }) as JsonRecord; }
function attachMedia(project: Dev03Stage6ProjectSnapshotV2, baseUrl: string): JsonRecord[] { return records(project.overlays).map((overlay) => {
  const video = overlay.assetId === 'dev03-cards'; const audio = overlay.assetId === 'dev03-beats'; if (!video && !audio) throw new Error(`DEV03_STAGE6_UNKNOWN_ASSET:${String(overlay.assetId)}`);
  const src = `${baseUrl}/${video ? 'source-cards.mp4' : 'source-beats.wav'}`; const base = { ...overlay, left: 0, top: 0, width: WIDTH, height: HEIGHT, rotation: 0, isDragging: false, src, content: src };
  return video ? { ...base, styles: { ...record(overlay.styles), objectFit: 'cover', opacity: 1, volume: 0 } } : { ...base, styles: { ...record(overlay.styles), volume: 1 }, audioRights: { mediaRole: 'music', source: 'generated', userChoice: 'attested', licensed: true, evidence: { kind: 'generated-provider', sourceAssetId: 'dev03-beats', licenseId: 'dev03-local-synthetic-fixture-v2' } } };
}); }

async function inspectProof(paths: Record<Dev03Stage6ArtifactIdV2, string>, browserErrors: string[]): Promise<Dev03Stage6RenderProofV2> {
  const probe = JSON.parse((await capture('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', paths.FULL_AV_PROXY])).toString('utf8')) as JsonRecord;
  const streams = records(probe.streams); const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  const samples = await Promise.all(([[118, paths.CUT1_BEFORE], [119, paths.CUT1_AFTER], [238, paths.CUT2_BEFORE], [239, paths.CUT2_AFTER], [478, paths.CUT3_BEFORE], [479, paths.CUT3_AFTER]] as const).map(async ([frame, file]) => ({ frame, rgb: await cornerRgb(file) })));
  const activeDiff = await imageDiff(paths.SHAKE_ACTIVE_BASELINE, paths.SHAKE_ACTIVE); const neutralDiff = await imageDiff(paths.SHAKE_NEUTRAL_BASELINE, paths.SHAKE_NEUTRAL);
  const [sourcePcm, baselinePcm, renderedPcm, sourceChannels, baselineChannels, renderedChannels] = await Promise.all([
    decodeFirstChannelPcm(paths.SOURCE_AUDIO), decodeFirstChannelPcm(paths.PROTECTED_AUDIO_BASELINE_WAV), decodeFirstChannelPcm(paths.PROTECTED_AUDIO_WAV),
    probeAudioChannels(paths.SOURCE_AUDIO), probeAudioChannels(paths.PROTECTED_AUDIO_BASELINE_WAV), probeAudioChannels(paths.PROTECTED_AUDIO_WAV),
  ]); const start = 250 * SAMPLE_RATE / FPS; const end = 350 * SAMPLE_RATE / FPS;
  const sourceRms = rms(sourcePcm, start, end); const baselineRms = rms(baselinePcm, start, end); const renderedRms = rms(renderedPcm, start, end);
  return { schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2, renderer: { root: 'components/editron/editor/version-7.0.0/remotion/index.ts', assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps', visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx', audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx' }, composition: { width: WIDTH, height: HEIGHT, fpsNumerator: FPS, fpsDenominator: 1, durationInFrames: FRAMES }, sourceBindings: { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' },
    video: { codec: text(video.codec_name), width: integer(video.width), height: integer(video.height), averageFrameRate: text(video.avg_frame_rate), decodedFrameCount: integer(video.nb_read_frames), durationSeconds: Number(record(probe.format).duration), audioStreamCount: streams.filter((stream) => stream.codec_type === 'audio').length },
    visual: { boundarySamples: samples, boundaryMeanAbsDiffs: [await imageDiff(paths.CUT1_BEFORE, paths.CUT1_AFTER), await imageDiff(paths.CUT2_BEFORE, paths.CUT2_AFTER), await imageDiff(paths.CUT3_BEFORE, paths.CUT3_AFTER)], shakeActiveFrame: 480, shakeNeutralFrame: 490, shakeActiveMeanAbsDiff: activeDiff, shakeNeutralMeanAbsDiff: neutralDiff },
    audio: { sampleRateHz: SAMPLE_RATE, sourceChannels: exactChannels(sourceChannels, 1, 'SOURCE'), baselineChannels: exactChannels(baselineChannels, 2, 'BASELINE'), renderedChannels: exactChannels(renderedChannels, 2, 'RENDERED'), sourceSampleFrames: sourcePcm.length / 2, baselineSampleFrames: baselinePcm.length / 2, renderedSampleFrames: renderedPcm.length / 2, protectedStartFrame: 250, protectedEndFrame: 350, sourceProtectedRms: round(sourceRms), baselineProtectedRms: round(baselineRms), renderedProtectedRms: round(renderedRms), sourceToRenderedGainRatio: round(renderedRms / sourceRms), sourceToRenderedCorrelation: round(correlation(sourcePcm, renderedPcm, start, end)), baselineToRenderedGainRatio: round(renderedRms / baselineRms), baselineToRenderedCorrelation: round(correlation(baselinePcm, renderedPcm, start, end)), renderedPeak: round(peak(renderedPcm)) },
    browserErrors, externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 } };
}

async function startMediaServer(paths: Record<Dev03Stage6ArtifactIdV2, string>): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const assets = new Map([['source-cards.mp4', { bytes: await readFile(paths.SOURCE_VIDEO), type: 'video/mp4' }], ['source-beats.wav', { bytes: await readFile(paths.SOURCE_AUDIO), type: 'audio/wav' }]]);
  const server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1); const asset = assets.get(name); if (!asset) { response.writeHead(404).end(); return; } const match = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? '')); const start = match ? Number(match[1]) : 0; const end = Math.min(match?.[2] ? Number(match[2]) : asset.bytes.length - 1, asset.bytes.length - 1); if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= asset.bytes.length) { response.writeHead(416, { 'Content-Range': `bytes */${asset.bytes.length}` }).end(); return; } const body = asset.bytes.subarray(start, end + 1); response.writeHead(match ? 206 : 200, { 'Content-Type': asset.type, 'Content-Length': body.length, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${asset.bytes.length}` } : {}) }); if (request.method === 'HEAD') response.end(); else response.end(body); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
async function capture(command: string, args: string[]): Promise<Buffer> { const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); const stdout: Buffer[] = []; let stderr = ''; child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk))); child.stderr.on('data', (chunk) => { stderr += String(chunk); }); const [code] = await once(child, 'close') as [number]; if (code !== 0) throw new Error(`${command.toUpperCase()}_FAILED:${stderr.slice(-2000)}`); return Buffer.concat(stdout); }
async function decodeFirstChannelPcm(file: string): Promise<Buffer> { return capture('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-af', 'pan=mono|c0=c0', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1']); }
async function probeAudioChannels(file: string): Promise<number> { const value = JSON.parse((await capture('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'json', file])).toString('utf8')) as JsonRecord; return integer(records(value.streams)[0]?.channels); }
function exactChannels<const T extends 1 | 2>(actual: number, expected: T, label: string): T { if (actual !== expected) throw new Error(`DEV03_STAGE6_${label}_CHANNEL_COUNT_INVALID:${actual}`); return expected; }
async function raw(file: string) { return sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function cornerRgb(file: string): Promise<readonly [number, number, number]> { const { data, info } = await raw(file); const offset = (Math.min(5, info.height - 1) * info.width + Math.min(5, info.width - 1)) * info.channels; return [data[offset], data[offset + 1], data[offset + 2]]; }
async function imageDiff(left: string, right: string): Promise<number> { const [a, b] = await Promise.all([raw(left), raw(right)]); if (a.data.length !== b.data.length) throw new Error('DEV03_STAGE6_IMAGE_DIMENSION_DRIFT'); let total = 0; for (let i = 0; i < a.data.length; i += 1) total += Math.abs(a.data[i] - b.data[i]); return round(total / a.data.length); }
function rms(pcm: Buffer, start: number, end: number): number { let energy = 0; const stop = Math.min(end, pcm.length / 2); for (let i = start; i < stop; i += 1) { const value = pcm.readInt16LE(i * 2) / 32768; energy += value * value; } return Math.sqrt(energy / Math.max(1, stop - start)); }
function correlation(left: Buffer, right: Buffer, start: number, end: number): number { const stop = Math.min(end, left.length / 2, right.length / 2); let xy = 0; let xx = 0; let yy = 0; for (let i = start; i < stop; i += 1) { const x = left.readInt16LE(i * 2); const y = right.readInt16LE(i * 2); xy += x * y; xx += x * x; yy += y * y; } return xy / Math.sqrt(xx * yy); }
function peak(pcm: Buffer): number { let value = 0; for (let i = 0; i < pcm.length; i += 2) value = Math.max(value, Math.abs(pcm.readInt16LE(i)) / 32768); return value; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : 0; }
function round(value: number): number { return Number(value.toFixed(6)); }
