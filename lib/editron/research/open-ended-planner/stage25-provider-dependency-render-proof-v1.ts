import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import sharp from 'sharp';

import { COMP_NAME } from '@/components/editron/editor/version-7.0.0/constants';
import { buildLambdaRenderInputProps } from '@/lib/editron/shared/render-request-payload';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { getCanonicalDev03NativeProxyFixtureV2 } from './dev03-native-proxy-fixture-v2';
import { probeHoldoutVideoV2R } from './sealed-holdout-media-proof-runtime-v2r';
import { Stage25ProviderDependencyOwnerV1 } from './stage25-provider-dependency-owner-v1';

export const STAGE25_DEPENDENCY_RENDER_PROOF_VERSION_V1 =
  'EDITRON_STAGE25_PROVIDER_DEPENDENCY_RENDER_PROOF_V1' as const;

type JsonRecord = Record<string, unknown>;
type Rgb = readonly [number, number, number];
type Bounds = Readonly<{ left: number; right: number; top: number; bottom: number;
  width: number; height: number; centerX: number; centerY: number }>;

const WIDTH = 640; const HEIGHT = 360; const FPS = 30; const FRAMES = 720;
const SOURCE_PATH = path.resolve('.calibration-temp/open-ended-planner-v2/development-media/dev03-cards.mp4');
const SOURCE_OFFSET_BY_ASSET = { 'clip-a': 0, 'clip-b': 117, 'clip-c': 267, product: 450 } as const;
const COMPOSITOR_FALLBACKS = { '@remotion/compositor': false, '@remotion/compositor-darwin-arm64': false, '@remotion/compositor-darwin-x64': false, '@remotion/compositor-linux-x64': false, '@remotion/compositor-linux-arm64': false, '@remotion/compositor-win32-x64-msvc': false, '@remotion/compositor-windows-x64': false } as const;

export interface Stage25DependencyVisualMeasurementsV1 {
  boundarySamples: readonly { frame: 118 | 119 | 238 | 239; rgb: Rgb }[];
  boundaryMeanAbsDiffs: readonly [number, number];
  initialToFilteredMeanAbsDiff: number;
  scale1CreamBounds: Bounds;
  scale108CreamBounds: Bounds;
  widthScaleRatio: number;
  heightScaleRatio: number;
  centerShiftX: number;
  centerShiftY: number;
}

export function evaluateStage25DependencyVisualMeasurementsV1(
  value: Stage25DependencyVisualMeasurementsV1,
): Readonly<{ assessment: 'PASS' | 'FAIL'; diagnostics: readonly string[] }> {
  const diagnostics: string[] = [];
  const samples = value.boundarySamples;
  if (samples.length !== 4 || samples.map(({ frame }) => frame).join(',') !== '118,119,238,239'
    || !blue(samples[0]?.rgb) || !purple(samples[1]?.rgb)
    || !purple(samples[2]?.rgb) || !green(samples[3]?.rgb)
    || rgbDiff(samples[1]?.rgb, samples[2]?.rgb) > 3) diagnostics.push('CUT_SAMPLE_IDENTITY_INVALID');
  if (value.boundaryMeanAbsDiffs.length !== 2
    || value.boundaryMeanAbsDiffs.some((difference) => difference < 20)) {
    diagnostics.push('CUT_BOUNDARY_NOT_VISIBLE');
  }
  if (value.initialToFilteredMeanAbsDiff < 2) diagnostics.push('FILTER_NOT_VISIBLE');
  if (!within(value.widthScaleRatio, 1.05, 1.12)
    || !within(value.heightScaleRatio, 1.05, 1.12)) diagnostics.push('PUSH_IN_GEOMETRY_INVALID');
  if (!within(value.centerShiftX, -25, -4) || !within(value.centerShiftY, -3, 3)) {
    diagnostics.push('FOCAL_ORIGIN_GEOMETRY_INVALID');
  }
  return Object.freeze({ assessment: diagnostics.length ? 'FAIL' : 'PASS', diagnostics });
}

export async function executeStage25DependencyRenderProofV1(input: Readonly<{
  sourceRow: unknown; expectedSourceRowSha256: string;
  outputDir: string; executionId: string; createdAt: string;
}>): Promise<Readonly<JsonRecord>> {
  if (!input.executionId.trim() || !Number.isFinite(Date.parse(input.createdAt))) fail('EXECUTION_IDENTITY_INVALID');
  const row = record(input.sourceRow);
  if (row.rowId !== 'openai_luna-p1'
    || hashCanonicalJsonV1(row) !== input.expectedSourceRowSha256) fail('SOURCE_ROW_IDENTITY_INVALID');
  const episode = record(row.episode); assertSelfHash(episode, 'receiptSha256', 'EPISODE');
  const owner = new Stage25ProviderDependencyOwnerV1(); const before = owner.snapshot();
  for (const turn of records(episode.turns).filter(({ execution }) => Boolean(execution))) {
    const observed = await owner.execute({ turn: integer(turn.turn),
      operatorId: text(record(turn.modelCall).name), arguments: record(turn.normalizedArguments) });
    if (!same(observed, turn.execution)) fail(`OWNER_REPLAY_DRIFT:${integer(turn.turn)}`);
  }
  const after = owner.snapshot();
  if (!same(after, row.ownerSnapshot) || record(after.currentProject).projectRevision !== 'R45') {
    fail('OWNER_SNAPSHOT_DRIFT');
  }

  const root = safeOutputRoot(input.outputDir); await mkdir(path.dirname(root), { recursive: true }); await mkdir(root);
  const fixture = getCanonicalDev03NativeProxyFixtureV2(); const sourceBytes = await readFile(SOURCE_PATH);
  const sourceSha256 = sha256(sourceBytes);
  if (sourceSha256 !== fixture.assets.cards.sha256) fail('SOURCE_MEDIA_HASH_DRIFT');
  const media = await startMediaServer(sourceBytes);
  const paths = { output: path.join(root, 'stage25-dependency-final.mp4'),
    initial660: path.join(root, 'initial-0660.png'), final660: path.join(root, 'final-0660.png'),
    final672: path.join(root, 'final-0672.png'), b118: path.join(root, 'boundary-0118.png'),
    b119: path.join(root, 'boundary-0119.png'), b238: path.join(root, 'boundary-0238.png'),
    b239: path.join(root, 'boundary-0239.png') };
  const browserErrors: string[] = [];
  try {
    const initialProps = renderProps(record(before.currentProject), media.baseUrl);
    const finalProps = renderProps(record(after.currentProject), media.baseUrl);
    const serveUrl = await bundle(path.resolve('components/editron/editor/version-7.0.0/remotion/index.ts'), undefined,
      { webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve,
        alias: { ...(Array.isArray(config.resolve?.alias) ? {} : config.resolve?.alias), '@': process.cwd() },
        fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS } } }) });
    const [initialComposition, finalComposition] = await Promise.all([
      selectComposition({ serveUrl, id: COMP_NAME, inputProps: initialProps }),
      selectComposition({ serveUrl, id: COMP_NAME, inputProps: finalProps }),
    ]);
    const browserLog = (entry: { type: string; text: string }) => { if (entry.type === 'error') browserErrors.push(entry.text); };
    for (const [frame, output, props, composition] of [
      [660, paths.initial660, initialProps, initialComposition],
      [660, paths.final660, finalProps, finalComposition],
      [672, paths.final672, finalProps, finalComposition],
      [118, paths.b118, finalProps, finalComposition],
      [119, paths.b119, finalProps, finalComposition],
      [238, paths.b238, finalProps, finalComposition],
      [239, paths.b239, finalProps, finalComposition],
    ] as const) {
      await renderStill({ composition, serveUrl, output, frame, inputProps: props, imageFormat: 'png',
        chromiumOptions: { headless: true }, overwrite: true, onBrowserLog: browserLog });
    }
    await renderMedia({ composition: finalComposition, serveUrl, outputLocation: paths.output, inputProps: finalProps,
      codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', muted: true,
      chromiumOptions: { headless: true }, concurrency: 2, overwrite: true,
      timeoutInMilliseconds: 300_000, onBrowserLog: browserLog });
  } finally { await media.close(); }
  if (browserErrors.length) fail(`BROWSER_ERRORS:${browserErrors.join('|')}`);

  const measurements = await inspect(paths); const visual = evaluateStage25DependencyVisualMeasurementsV1(measurements);
  if (visual.assessment !== 'PASS') fail(`VISUAL_PROOF_INVALID:${visual.diagnostics.join('|')}`);
  const probe = await probeHoldoutVideoV2R(paths.output);
  if (probe.codec !== 'h264' || probe.width !== WIDTH || probe.height !== HEIGHT
    || probe.averageFrameRate !== '30/1' || probe.decodedFrameCount !== FRAMES
    || probe.audioStreamCount !== 0) fail('OUTPUT_PROBE_INVALID');
  const outputBytes = await readFile(paths.output);
  const material = { schemaVersion: STAGE25_DEPENDENCY_RENDER_PROOF_VERSION_V1,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const, executionId: input.executionId,
    createdAt: input.createdAt, sourceRowSha256: input.expectedSourceRowSha256,
    sourceEpisodeReceiptSha256: text(episode.receiptSha256), ownerBeforeStateHash: text(before.beforeStateHash),
    ownerAfterStateHash: text(after.afterStateHash), sourceBinding: { assetId: 'dev03-cards', sha256: sourceSha256,
      rightsStatus: 'INTERNAL_OWNED_FIXTURE', sourceOffsetByEpisodeAssetId: SOURCE_OFFSET_BY_ASSET },
    renderer: { root: 'components/editron/editor/version-7.0.0/remotion/index.ts',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps' },
    output: { path: paths.output, sha256: sha256(outputBytes), bytes: outputBytes.length, ...probe },
    visualMeasurements: measurements, visualEvaluation: visual,
    proof: { isolatedOwnerReplay: 'PASS', renderedVisual: visual.assessment,
      renderedAudio: 'UNVERIFIABLE_NO_AUDIO_OVERLAY_IN_SOURCE_EPISODE',
      projectServiceReload: 'UNVERIFIABLE_RESEARCH_CLONE_ONLY', projectMutation: 'NONE' },
    browserErrors, externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0,
      projectServiceCalls: 0, databaseCalls: 0 }, stateEffects: [] as const };
  const receipt = Object.freeze({ ...material, receiptHash: hashCanonicalJsonV1(material) });
  await writeFile(path.join(root, 'stage25-dependency-render-proof-receipt-v1.json'),
    `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
}

function renderProps(project: JsonRecord, baseUrl: string): JsonRecord {
  const overlays = records(project.overlays).map((overlay) => {
    const assetId = text(overlay.assetId) as keyof typeof SOURCE_OFFSET_BY_ASSET;
    const offset = SOURCE_OFFSET_BY_ASSET[assetId]; if (offset === undefined) fail(`ASSET_UNBOUND:${assetId}`);
    const src = `${baseUrl}/source-cards.mp4`; const styles = record(overlay.styles);
    return { ...overlay, left: 0, top: 0, width: WIDTH, height: HEIGHT, rotation: 0,
      isDragging: false, src, content: src, sourceStartFrame: offset + integer(overlay.sourceStartFrame),
      videoStartTime: offset + integer(overlay.videoStartTime), hasNativeAudio: false,
      styles: { ...styles, objectFit: 'cover', opacity: 1, volume: 0 } };
  });
  return buildLambdaRenderInputProps({ overlays, durationInFrames: FRAMES, fps: FPS, width: WIDTH,
    height: HEIGHT, baseUrl, isRendering: true, renderMediaMode: 'full' }) as JsonRecord;
}

async function inspect(paths: Record<string, string>): Promise<Stage25DependencyVisualMeasurementsV1> {
  const samples = await Promise.all(([[118, paths.b118], [119, paths.b119], [238, paths.b238],
    [239, paths.b239]] as const).map(async ([frame, file]) => ({ frame, rgb: await cornerRgb(file) })));
  const [scale1, scale108] = await Promise.all([creamBounds(paths.final660), creamBounds(paths.final672)]);
  return { boundarySamples: samples, boundaryMeanAbsDiffs: [await imageDiff(paths.b118, paths.b119),
    await imageDiff(paths.b238, paths.b239)], initialToFilteredMeanAbsDiff: await imageDiff(paths.initial660, paths.final660),
    scale1CreamBounds: scale1, scale108CreamBounds: scale108,
    widthScaleRatio: round(scale108.width / scale1.width), heightScaleRatio: round(scale108.height / scale1.height),
    centerShiftX: round(scale108.centerX - scale1.centerX), centerShiftY: round(scale108.centerY - scale1.centerY) };
}
async function raw(file: string) { return sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function cornerRgb(file: string): Promise<Rgb> { const { data, info } = await raw(file); const at = (5 * info.width + 5) * info.channels; return [data[at], data[at + 1], data[at + 2]]; }
async function imageDiff(left: string, right: string): Promise<number> { const [a, b] = await Promise.all([raw(left), raw(right)]); if (a.data.length !== b.data.length) fail('IMAGE_DIMENSION_DRIFT'); let total = 0; for (let i = 0; i < a.data.length; i += 1) total += Math.abs(a.data[i] - b.data[i]); return round(total / a.data.length); }
async function creamBounds(file: string): Promise<Bounds> { const { data, info } = await raw(file); let left = info.width; let right = -1; let top = info.height; let bottom = -1; let pixels = 0; for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) { const at = (y * info.width + x) * info.channels; const [r, g, b] = [data[at], data[at + 1], data[at + 2]]; if (r < 150 || g < 130 || b < 100 || Math.max(r, g, b) - Math.min(r, g, b) > 80) continue; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels += 1; } if (pixels < 500) fail('CREAM_GEOMETRY_MISSING'); return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1, centerX: (left + right) / 2, centerY: (top + bottom) / 2 }; }
async function startMediaServer(bytes: Buffer): Promise<{ baseUrl: string; close(): Promise<void> }> { const server = createServer((request, response) => { const match = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? '')); const start = match ? Number(match[1]) : 0; const end = Math.min(match?.[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1); if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== '/source-cards.mp4' || start < 0 || end < start || start >= bytes.length) { response.writeHead(404).end(); return; } const body = bytes.subarray(start, end + 1); response.writeHead(match ? 206 : 200, { 'Content-Type': 'video/mp4', 'Content-Length': body.length, 'Accept-Ranges': 'bytes', ...(match ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}) }); if (request.method === 'HEAD') response.end(); else response.end(body); }); await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const address = server.address() as AddressInfo; return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); }) }; }
function safeOutputRoot(value: string): string { const root = path.resolve(value); if (root === path.parse(root).root || root === path.resolve(process.cwd())) fail('OUTPUT_ROOT_UNSAFE'); return root; }
function assertSelfHash(value: JsonRecord, field: string, label: string): void { const unsigned = { ...value }; delete unsigned[field]; if (value[field] !== hashCanonicalJsonV1(unsigned)) fail(`${label}_HASH_INVALID`); }
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function blue(rgb?: Rgb): boolean { return Boolean(rgb && rgb[2] > rgb[0] + 20 && rgb[2] > rgb[1] + 20); }
function purple(rgb?: Rgb): boolean { return Boolean(rgb && rgb[0] > rgb[1] + 35 && rgb[2] > rgb[1] + 35); }
function green(rgb?: Rgb): boolean { return Boolean(rgb && rgb[1] > rgb[0] + 20 && rgb[1] > rgb[2] + 20); }
function rgbDiff(left?: Rgb, right?: Rgb): number { return !left || !right ? Infinity : (Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2])) / 3; }
function within(value: number, min: number, max: number): boolean { return value >= min && value <= max; }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0; }
function round(value: number): number { return Number(value.toFixed(6)); }
function fail(code: string): never { throw new Error(`STAGE25_DEPENDENCY_RENDER_PROOF_${code}`); }
