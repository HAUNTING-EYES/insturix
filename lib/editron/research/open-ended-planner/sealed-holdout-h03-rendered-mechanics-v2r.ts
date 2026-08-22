import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

import type { HoldoutMediaManifestV2R }
  from './holdout-media-materializer-v2r';
import {
  bindHoldoutMediaArtifactV2R,
  extractHoldoutRgbFrameV2R,
  probeHoldoutVideoV2R,
  renderConcatenatedProxyV2R,
} from './sealed-holdout-media-proof-runtime-v2r';

type JsonRecord = Record<string, unknown>;
type NormalizedBounds = readonly [left: number, top: number, width: number, height: number];

const PANELS: readonly NormalizedBounds[] = [
  [0.03, 0.03, 0.27, 0.39], [0.03, 0.60, 0.27, 0.37],
  [0.33, 0.03, 0.34, 0.29], [0.33, 0.60, 0.34, 0.37],
  [0.70, 0.03, 0.27, 0.39], [0.70, 0.60, 0.27, 0.37],
];

export interface SealedH03BoundSourceArtifactsV2R {
  sourceA: Readonly<{ artifactSha256: string; artifactPath: string }>;
  sourceB: Readonly<{ artifactSha256: string; artifactPath: string }>;
}

export interface SealedH03RenderedHybridMechanicsV2R {
  sourceArtifacts: Readonly<{ sourceA: string; sourceB: string }>;
  generatedIsland: Readonly<{
    projectRange: { startFrame: 90; endFrame: 270 };
    programId: string;
    programHash: string;
    sourceBundleHash: string;
    proxySha256: string;
    layout: {
      detectedPanelCount: 6;
      minimumPanelFillRatio: number;
      titleYellowPixels: number;
      titleYellowBounds: { left: number; right: number; top: number; bottom: number };
      sourcePanelTitleFootprintIntersectionPixels: number;
    };
    motion: { entryEdgeLumaDelta: number; exitEdgeLumaDelta: number };
    referenceAssetRendered: false;
  }>;
  nativeSurround: Readonly<{
    segments: readonly [
      { assetId: 'h03-a'; sourceStartFrame: 0; sourceEndFrame: 90 },
      { generatedProgramId: string; localStartFrame: 0; localEndFrame: 180 },
      { assetId: 'h03-a'; sourceStartFrame: 270; sourceEndFrame: 420 },
    ];
    sampledOutsideRangeMaxMeanAbsoluteRgbError: number;
    returnFrame270MeanAbsoluteRgbError: number;
    structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION';
  }>;
  outputArtifact: Readonly<{ sha256: string; bytes: number }>;
  video: Readonly<{
    codec: string;
    width: number;
    height: number;
    averageFrameRate: string;
    decodedFrameCount: number;
    audioStreamCount: number;
  }>;
}

/**
 * Sole HOLD-03 source-media binding seam. Proof-version adapters may select the
 * generated source, but they must not reinterpret public media identity.
 */
export async function bindSealedH03SourceArtifactsV2R(input: {
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  publicMedia: unknown;
}): Promise<Readonly<SealedH03BoundSourceArtifactsV2R>> {
  const media = records(input.publicMedia);
  const [sourceA, sourceB] = await Promise.all([
    bindAsset(input.mediaManifest, media, 'h03-a'),
    bindAsset(input.mediaManifest, media, 'h03-b'),
  ]);
  return Object.freeze({ sourceA, sourceB });
}

/**
 * Sole HOLD-03 decoded-output measurement owner. It never chooses a program,
 * generates source, mutates a project, or attests how the proxy was isolated.
 */
export async function executeSealedH03RenderedHybridMechanicsV2R(input: {
  sources: Readonly<SealedH03BoundSourceArtifactsV2R>;
  generated: Readonly<{
    programId: string;
    programHash: string;
    sourceBundleHash: string;
    playableProxyPath: string;
    playableProxySha256: string;
  }>;
  outputDirectory: string;
  outputFilename: string;
  ffprobePath?: string;
}): Promise<Readonly<SealedH03RenderedHybridMechanicsV2R>> {
  if (!input.generated.programId.trim()
    || !isSha(input.generated.programHash)
    || !isSha(input.generated.sourceBundleHash)
    || !isSha(input.generated.playableProxySha256)
    || await sha256File(input.generated.playableProxyPath)
      !== input.generated.playableProxySha256) {
    fail('SEALED_H03_MECHANICS_GENERATED_IDENTITY_INVALID');
  }
  const hybrid = await renderConcatenatedProxyV2R({
    segments: [
      { sourcePath: input.sources.sourceA.artifactPath, startFrame: 0, endFrame: 90 },
      { sourcePath: input.generated.playableProxyPath, startFrame: 0, endFrame: 180 },
      { sourcePath: input.sources.sourceA.artifactPath, startFrame: 270, endFrame: 420 },
    ],
    width: 360,
    height: 640,
    outputDirectory: input.outputDirectory,
    outputFilename: input.outputFilename,
  });
  const [generatedProbe, probe, entry, settled, exit, ...continuityFrames] = await Promise.all([
    probeHoldoutVideoV2R(input.generated.playableProxyPath, input.ffprobePath),
    probeHoldoutVideoV2R(hybrid.outputPath, input.ffprobePath),
    extract(input.generated.playableProxyPath, 0, 1080, 1920),
    extract(input.generated.playableProxyPath, 90, 1080, 1920),
    extract(input.generated.playableProxyPath, 179, 1080, 1920),
    ...[0, 89, 270, 419].flatMap((frame) => [
      extract(hybrid.outputPath, frame, 360, 640),
      extract(input.sources.sourceA.artifactPath, frame, 360, 640),
    ]),
  ]);
  if (generatedProbe.codec !== 'h264' || generatedProbe.width !== 1080
    || generatedProbe.height !== 1920 || generatedProbe.averageFrameRate !== '30/1'
    || generatedProbe.decodedFrameCount !== 180 || generatedProbe.audioStreamCount !== 0) {
    fail('SEALED_H03_MECHANICS_GENERATED_PROXY_INVALID');
  }
  if (probe.codec !== 'h264' || probe.width !== 360 || probe.height !== 640
    || probe.averageFrameRate !== '30/1' || probe.decodedFrameCount !== 420
    || probe.audioStreamCount !== 0) fail('SEALED_H03_MECHANICS_VIDEO_CONTRACT_INVALID');
  const layout = measureLayout(settled, 1080, 1920);
  const motion = measureMotion(entry, settled, exit, 1080, 1920);
  const errors = [0, 1, 2, 3].map((index) => meanAbsoluteRgbError(
    continuityFrames[index * 2], continuityFrames[index * 2 + 1],
  ));
  if (layout.minimumPanelFillRatio < 0.82 || layout.titleYellowPixels < 1_000
    || layout.sourcePanelTitleFootprintIntersectionPixels !== 0
    || !titleBoundsInsideFootprint(layout.titleYellowBounds, 1080, 1920)
    || motion.entryEdgeLumaDelta < 20 || motion.exitEdgeLumaDelta < 20
    || Math.max(...errors) > 6) {
    fail(`SEALED_H03_MECHANICS_RENDERED_PREDICATE_FAILED:${JSON.stringify({
      layout,
      motion,
      continuityMeanAbsoluteRgbErrors: errors.map(round),
    })}`);
  }
  return Object.freeze({
    sourceArtifacts: {
      sourceA: input.sources.sourceA.artifactSha256,
      sourceB: input.sources.sourceB.artifactSha256,
    },
    generatedIsland: {
      projectRange: { startFrame: 90 as const, endFrame: 270 as const },
      programId: input.generated.programId,
      programHash: input.generated.programHash,
      sourceBundleHash: input.generated.sourceBundleHash,
      proxySha256: input.generated.playableProxySha256,
      layout,
      motion,
      referenceAssetRendered: false as const,
    },
    nativeSurround: {
      segments: [
        { assetId: 'h03-a' as const, sourceStartFrame: 0 as const, sourceEndFrame: 90 as const },
        { generatedProgramId: input.generated.programId, localStartFrame: 0 as const, localEndFrame: 180 as const },
        { assetId: 'h03-a' as const, sourceStartFrame: 270 as const, sourceEndFrame: 420 as const },
      ] as const,
      sampledOutsideRangeMaxMeanAbsoluteRgbError: round(Math.max(...errors)),
      returnFrame270MeanAbsoluteRgbError: round(errors[2]),
      structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION' as const,
    },
    outputArtifact: { sha256: hybrid.artifactSha256, bytes: hybrid.bytes },
    video: probe,
  });
}

async function bindAsset(
  manifest: Readonly<HoldoutMediaManifestV2R>,
  media: readonly JsonRecord[],
  assetId: string,
) {
  return bindHoldoutMediaArtifactV2R({
    manifest,
    taskId: 'HOLD-03',
    assetId,
    publicArtifactSha256: text(media.find((entry) => entry.assetId === assetId)?.artifactSha256),
  });
}
function extract(filePath: string, frame: number, width: number, height: number) {
  return extractHoldoutRgbFrameV2R({ filePath, frame, width, height });
}
function measureLayout(rgb: Buffer, width: number, height: number) {
  const fillRatios = PANELS.map((bounds) => nonDarkRatio(rgb, width, height, bounds));
  let titleYellowPixels = 0;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    const [r, g, b] = [rgb[offset], rgb[offset + 1], rgb[offset + 2]];
    if (r <= 220 || g <= 185 || b >= 85 || r <= g || r >= g * 1.35 || g <= b * 2.2) continue;
    titleYellowPixels += 1;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) fail('SEALED_H03_MECHANICS_TITLE_PIXELS_MISSING');
  const titleFootprint: NormalizedBounds = [0.15, 0.43, 0.70, 0.14];
  const sourcePanelTitleFootprintIntersectionPixels = Math.round(PANELS.reduce(
    (sum, panel) => sum + normalizedIntersectionArea(panel, titleFootprint),
    0,
  ) * width * height);
  return {
    detectedPanelCount: 6 as const,
    minimumPanelFillRatio: round(Math.min(...fillRatios)),
    titleYellowPixels,
    titleYellowBounds: { left, right, top, bottom },
    sourcePanelTitleFootprintIntersectionPixels,
  };
}
function measureMotion(entry: Buffer, settled: Buffer, exit: Buffer, width: number, height: number) {
  const entryEdges: readonly NormalizedBounds[] = [
    [0.282, 0.08, 0.012, 0.25], [0.706, 0.08, 0.012, 0.25],
  ];
  const exitEdges: readonly NormalizedBounds[] = [
    [0.035, 0.08, 0.012, 0.25], [0.952, 0.08, 0.012, 0.25],
  ];
  const entryEdgeLumaDelta = Math.min(...entryEdges.map((bounds) =>
    meanLuma(settled, width, height, bounds) - meanLuma(entry, width, height, bounds)));
  const exitEdgeLumaDelta = Math.min(...exitEdges.map((bounds) =>
    meanLuma(settled, width, height, bounds) - meanLuma(exit, width, height, bounds)));
  return {
    entryEdgeLumaDelta: round(entryEdgeLumaDelta),
    exitEdgeLumaDelta: round(exitEdgeLumaDelta),
  };
}
function nonDarkRatio(rgb: Buffer, width: number, height: number, bounds: NormalizedBounds): number {
  const pixels = region(rgb, width, height, inset(bounds, 0.08));
  let filled = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 75) filled += 1;
  }
  return filled / (pixels.length / 3);
}
function meanLuma(rgb: Buffer, width: number, height: number, bounds: NormalizedBounds): number {
  const pixels = region(rgb, width, height, bounds);
  let total = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    total += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  }
  return total / (pixels.length / 3);
}
function region(rgb: Buffer, width: number, height: number, bounds: NormalizedBounds): Buffer {
  const [left, top, regionWidth, regionHeight] = bounds;
  const x0 = Math.floor(left * width);
  const x1 = Math.ceil((left + regionWidth) * width);
  const y0 = Math.floor(top * height);
  const y1 = Math.ceil((top + regionHeight) * height);
  const output = Buffer.alloc((x1 - x0) * (y1 - y0) * 3);
  let offset = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const source = (y * width + x) * 3;
    output[offset++] = rgb[source];
    output[offset++] = rgb[source + 1];
    output[offset++] = rgb[source + 2];
  }
  return output;
}
function inset(
  [left, top, width, height]: NormalizedBounds,
  amount: number,
): NormalizedBounds {
  return [
    left + width * amount,
    top + height * amount,
    width * (1 - amount * 2),
    height * (1 - amount * 2),
  ];
}
function normalizedIntersectionArea(left: NormalizedBounds, right: NormalizedBounds): number {
  const overlapWidth = Math.max(
    0,
    Math.min(left[0] + left[2], right[0] + right[2]) - Math.max(left[0], right[0]),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left[1] + left[3], right[1] + right[3]) - Math.max(left[1], right[1]),
  );
  return overlapWidth * overlapHeight;
}
function titleBoundsInsideFootprint(
  bounds: { left: number; right: number; top: number; bottom: number },
  width: number,
  height: number,
): boolean {
  return bounds.left >= Math.floor(0.15 * width)
    && bounds.right < Math.ceil(0.85 * width)
    && bounds.top >= Math.floor(0.43 * height)
    && bounds.bottom < Math.ceil(0.57 * height);
}
function meanAbsoluteRgbError(left: Buffer, right: Buffer): number {
  if (left.length !== right.length) fail('SEALED_H03_MECHANICS_FRAME_SIZE_DRIFT');
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total / left.length;
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function round(value: number): number { return Number(value.toFixed(8)); }
function isSha(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }
function fail(code: string): never { throw new Error(code); }
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}
