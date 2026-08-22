import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { COMP_NAME } from '@/components/editron/editor/version-7.0.0/constants';
import { getFFmpegPath } from '@/lib/editron/services/media/ffmpeg-runtime';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';
import blueprint from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import { DEV02_GENERATED_COMPOSITION_PROGRAM_V1 } from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  DEV02_FORCED_NATIVE_BASELINE_HASH_V1, DEV02_FORCED_NATIVE_BASELINE_V1,
  DEV02_FORCED_NATIVE_CANVAS_V1, DEV02_FORCED_NATIVE_STILL_PATHS_V1,
  DEV02_FORCED_NATIVE_BASELINE_VERSION_V1, buildDev02ForcedNativeOverlaysV1,
} from './dev02-forced-native-baseline-v1';
import {
  DEV02_RENDERED_PROOF_POLICY_V1, evaluateDev02RenderedTargetCandidateV1,
  type Dev02RenderedTargetCandidateProofV1,
} from './generated-composition-dev02-rendered-proof-v1';

const WIDE_SHA = 'dacb93870b9050251ebcd285fae783f378af66301813b47f074f44ed75b97219';
const CLOSE_SHA = '645d5ecbf7cec49f837768cee0fa2469c9fec79f54f4928160920c3a1a22782a';
const COMPOSITOR_FALLBACKS = { '@remotion/compositor': false, '@remotion/compositor-darwin-arm64': false, '@remotion/compositor-darwin-x64': false, '@remotion/compositor-linux-x64': false, '@remotion/compositor-linux-arm64': false, '@remotion/compositor-win32-x64-msvc': false, '@remotion/compositor-windows-x64': false } as const;
type JsonRecord = Record<string, unknown>;

export interface Dev02ForcedNativeExecutionReceiptV1 {
  schemaVersion: typeof DEV02_FORCED_NATIVE_BASELINE_VERSION_V1;
  authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION';
  executionId: string; createdAt: string; baselineHash: string;
  sourceBindings: readonly { assetId: string; sha256: string }[];
  overlayPlan: typeof DEV02_FORCED_NATIVE_BASELINE_V1.editability & { overlayPlanHash: string };
  output: { path: string; sha256: string; codec: string; width: number; height: number; frameRate: string; decodedFrameCount: number; durationSeconds: number; audioStreamCount: number };
  targetProof: Dev02RenderedTargetCandidateProofV1;
  browserErrors: readonly string[];
  externalCalls: { providerApiCalls: 0; cloudRenderCalls: 0; projectServiceCalls: 0; databaseCalls: 0 };
  stateEffects: readonly [];
  receiptHash: string;
}

export async function executeDev02ForcedNativeBaselineV1(input: {
  outputDir: string; executionId: string; createdAt: string;
}): Promise<Readonly<Dev02ForcedNativeExecutionReceiptV1>> {
  if (!input.executionId.trim() || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('DEV02_NATIVE_EXECUTION_IDENTITY_INVALID');
  const root = path.resolve(input.outputDir); await mkdir(root, { recursive: true });
  const mediaRoot = path.resolve('.calibration-temp/open-ended-planner-v2/development-media');
  const widePath = path.join(mediaRoot, 'dev02-wide.mp4'); const closePath = path.join(mediaRoot, 'dev02-close.mp4');
  const [wide, close] = await Promise.all([readFile(widePath), readFile(closePath)]);
  if (sha256(wide) !== WIDE_SHA || sha256(close) !== CLOSE_SHA) throw new Error('DEV02_NATIVE_SOURCE_HASH_DRIFT');
  const materialized = {
    wide108: path.join(root, DEV02_FORCED_NATIVE_STILL_PATHS_V1.wide108.slice(1)),
    wide168: path.join(root, DEV02_FORCED_NATIVE_STILL_PATHS_V1.wide168.slice(1)),
    close318: path.join(root, DEV02_FORCED_NATIVE_STILL_PATHS_V1.close318.slice(1)),
    close180: path.join(root, DEV02_FORCED_NATIVE_STILL_PATHS_V1.close180.slice(1)),
  };
  await Promise.all([
    extractFrame(widePath, 108, materialized.wide108), extractFrame(widePath, 168, materialized.wide168),
    extractFrame(closePath, 318, materialized.close318), extractFrame(closePath, 180, materialized.close180),
  ]);
  const media = await startMediaServer(new Map([
    ['dev02-wide.mp4', { bytes: wide, type: 'video/mp4' }], ['dev02-close.mp4', { bytes: close, type: 'video/mp4' }],
    ['dev02-wide-0108.png', { bytes: await readFile(materialized.wide108), type: 'image/png' }],
    ['dev02-wide-0168.png', { bytes: await readFile(materialized.wide168), type: 'image/png' }],
    ['dev02-close-0318.png', { bytes: await readFile(materialized.close318), type: 'image/png' }],
    ['dev02-close-0180.png', { bytes: await readFile(materialized.close180), type: 'image/png' }],
  ]));
  const stills = DEV02_RENDERED_PROOF_POLICY_V1.requiredFrames.map((frame) => ({ frame, path: path.join(root, `native-${String(frame).padStart(4, '0')}.png`) }));
  const outputPath = path.join(root, 'dev02-forced-native-proxy.mp4'); const browserErrors: string[] = [];
  try {
    const props = buildLambdaRenderInputProps({ overlays: [...buildDev02ForcedNativeOverlaysV1()], ...DEV02_FORCED_NATIVE_CANVAS_V1, baseUrl: media.baseUrl, isRendering: true, renderMediaMode: 'full' as const, setSelectedOverlayId: () => {}, selectedOverlayId: null, changeOverlay: () => {} });
    const serveUrl = await bundle(path.resolve('components/editron/editor/version-7.0.0/remotion/index.ts'), undefined, { webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, alias: { ...(Array.isArray(config.resolve?.alias) ? {} : config.resolve?.alias), '@': process.cwd() }, fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS } } }) });
    const composition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps: props });
    const onBrowserLog = (entry: { type: string; text: string }) => { if (entry.type === 'error') browserErrors.push(entry.text); };
    for (const still of stills) await renderStill({ composition, serveUrl, output: still.path, frame: still.frame, inputProps: props, imageFormat: 'png', chromiumOptions: { headless: true }, overwrite: true, onBrowserLog });
    await renderMedia({ composition, serveUrl, outputLocation: outputPath, inputProps: props, codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', muted: true, chromiumOptions: { headless: true }, concurrency: 2, overwrite: true, timeoutInMilliseconds: 300_000, onBrowserLog });
  } finally { await media.close(); }
  if (browserErrors.length) throw new Error(`DEV02_NATIVE_BROWSER_ERRORS:${browserErrors.join(' | ')}`);
  const boundStills = await Promise.all(stills.map(async (still) => ({ ...still, sha256: sha256(await readFile(still.path)) })));
  const targetProof = await evaluateDev02RenderedTargetCandidateV1({
    candidateId: 'dev02-forced-native-v1', candidateKind: 'NATIVE', candidateHash: DEV02_FORCED_NATIVE_BASELINE_HASH_V1,
    canvas: DEV02_FORCED_NATIVE_CANVAS_V1, stills: boundStills, boundaryReferencePath: materialized.close180,
    referenceBlueprint: blueprint, expectedMeasurementRefs: DEV02_GENERATED_COMPOSITION_PROGRAM_V1.expectedMeasurementRefs,
  });
  const probe = await probeVideo(outputPath); assertOutputProbe(probe);
  const unsigned = {
    schemaVersion: DEV02_FORCED_NATIVE_BASELINE_VERSION_V1, authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
    executionId: input.executionId, createdAt: input.createdAt, baselineHash: DEV02_FORCED_NATIVE_BASELINE_HASH_V1,
    sourceBindings: [{ assetId: 'dev02-wide', sha256: WIDE_SHA }, { assetId: 'dev02-close', sha256: CLOSE_SHA }],
    overlayPlan: { ...DEV02_FORCED_NATIVE_BASELINE_V1.editability, overlayPlanHash: DEV02_FORCED_NATIVE_BASELINE_V1.overlayPlanHash },
    output: { path: outputPath, sha256: sha256(await readFile(outputPath)), ...probe }, targetProof, browserErrors,
    externalCalls: { providerApiCalls: 0 as const, cloudRenderCalls: 0 as const, projectServiceCalls: 0 as const, databaseCalls: 0 as const }, stateEffects: [] as const,
  };
  const receipt = Object.freeze({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) });
  await writeFile(path.join(root, 'forced-native-receipt-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

async function extractFrame(source: string, frame: number, output: string): Promise<void> { await capture(getFFmpegPath(), ['-y', '-v', 'error', '-i', source, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', output]); }
async function probeVideo(filePath: string) {
  const value = JSON.parse((await capture('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', filePath])).toString('utf8')) as JsonRecord;
  const streams = records(value.streams); const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  return { codec: text(video.codec_name), width: integer(video.width), height: integer(video.height), frameRate: text(video.avg_frame_rate), decodedFrameCount: integer(video.nb_read_frames), durationSeconds: Number(record(value.format).duration), audioStreamCount: streams.filter((stream) => stream.codec_type === 'audio').length };
}
function assertOutputProbe(probe: Awaited<ReturnType<typeof probeVideo>>): void {
  if (probe.codec !== 'h264' || probe.width !== 1080 || probe.height !== 1920 || probe.frameRate !== '30/1' || probe.decodedFrameCount !== 345 || Math.abs(probe.durationSeconds - 11.5) > 0.001 || probe.audioStreamCount !== 0) throw new Error('DEV02_NATIVE_OUTPUT_PROBE_INVALID');
}
async function startMediaServer(assets: Map<string, { bytes: Buffer; type: string }>): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = createServer((request, response) => { const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1); const asset = assets.get(name); if (!asset) { response.writeHead(404).end(); return; } const match = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? '')); const start = match ? Number(match[1]) : 0; const end = Math.min(match?.[2] ? Number(match[2]) : asset.bytes.length - 1, asset.bytes.length - 1); if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= asset.bytes.length) { response.writeHead(416, { 'Content-Range': `bytes */${asset.bytes.length}` }).end(); return; } const body = asset.bytes.subarray(start, end + 1); response.writeHead(match ? 206 : 200, { 'Content-Type': asset.type, 'Content-Length': body.length, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${asset.bytes.length}` } : {}) }); if (request.method === 'HEAD') response.end(); else response.end(body); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
async function capture(command: string, args: string[]): Promise<Buffer> { const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); const stdout: Buffer[] = []; let stderr = ''; child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk))); child.stderr.on('data', (chunk) => { stderr += String(chunk); }); const [code] = await once(child, 'close') as [number]; if (code !== 0) throw new Error(`${path.basename(command).toUpperCase()}_FAILED:${stderr.slice(-2000)}`); return Buffer.concat(stdout); }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isInteger(parsed) ? parsed : 0; }
