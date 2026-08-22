import { resolve } from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { renderTrustedGeneratedCompositionProxyV1 }
  from './generated-composition-proxy-renderer-v1';
import { hashGeneratedCompositionSourceBundleV1 }
  from './generated-composition-program-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import {
  buildSealedH03GeneratedProgramArtifactsV2R,
  SEALED_H03_FONT_PATH_V2R,
} from './sealed-holdout-h03-generated-program-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV2R }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import {
  bindHoldoutMediaArtifactV2R,
  extractHoldoutRgbFrameV2R,
  probeHoldoutVideoV2R,
  renderConcatenatedProxyV2R,
} from './sealed-holdout-media-proof-runtime-v2r';
import { bindSealedHoldoutProofInputV2R } from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV2R }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type NormalizedBounds = readonly [left: number, top: number, width: number, height: number];

const PANELS: readonly NormalizedBounds[] = [
  [0.03, 0.03, 0.27, 0.39], [0.03, 0.60, 0.27, 0.37],
  [0.33, 0.03, 0.34, 0.29], [0.33, 0.60, 0.34, 0.37],
  [0.70, 0.03, 0.27, 0.39], [0.70, 0.60, 0.27, 0.37],
];

export const SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H03_RENDERED_HYBRID_PROOF_V2R_1' as const;

export interface SealedHoldoutH03HybridProofReceiptV2R {
  version: typeof SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V2R;
  authority: 'RESEARCH_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-03:C1'; taskId: 'HOLD-03'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string; evaluationReceiptSha256: string;
  executionBoundary: Readonly<{
    modelSelectedForm: 'GENERATED_COMPOSITION';
    projectRangeForm: 'HYBRID_NATIVE_SURROUND_GENERATED_ISLAND';
    generatedProgramSource: 'HUMAN_AUTHORED_FIXTURE_NOT_MODEL_OUTPUT';
    sandboxStatus: 'TRUSTED_LOCAL_PROCESS_NOT_PRODUCTION_SECURITY_SANDBOX';
  }>;
  sourceArtifacts: Readonly<{ sourceA: string; sourceB: string }>;
  generatedIsland: Readonly<{
    projectRange: { startFrame: 90; endFrame: 270 };
    programHash: string; sourceBundleHash: string; proxySha256: string;
    layout: {
      detectedPanelCount: 6; minimumPanelFillRatio: number; titleYellowPixels: number;
      titleYellowBounds: { left: number; right: number; top: number; bottom: number };
      sourcePanelTitleFootprintIntersectionPixels: number;
    };
    motion: { entryEdgeLumaDelta: number; exitEdgeLumaDelta: number };
    referenceAssetRendered: false;
  }>;
  nativeSurround: Readonly<{
    segments: readonly [
      { assetId: 'h03-a'; sourceStartFrame: 0; sourceEndFrame: 90 },
      { generatedProgramId: 'gcp-hold-03-six-window-v2r-1'; localStartFrame: 0; localEndFrame: 180 },
      { assetId: 'h03-a'; sourceStartFrame: 270; sourceEndFrame: 420 },
    ];
    sampledOutsideRangeMaxMeanAbsoluteRgbError: number;
    returnFrame270MeanAbsoluteRgbError: number;
    structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION';
  }>;
  outputArtifact: Readonly<{ sha256: string; bytes: number }>;
  video: Readonly<{ codec: string; width: number; height: number; averageFrameRate: string; decodedFrameCount: number; audioStreamCount: number }>;
  assessment: 'PASS_RESEARCH_RENDERED_HYBRID_PROXY'; stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH03HybridOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-03:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH03HybridProofReceiptV2R>> {
  const bound = bindSealedHoldoutProofInputV2R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-03'],
    allowedAssessments: ['READY_FOR_PROOF'],
    allowedExecutionForms: ['GENERATED_COMPOSITION', 'HYBRID'],
  });
  const generated = bound.trace.nodes.filter(({ executionDisposition, operatorKind }) =>
    executionDisposition === 'OK' && operatorKind === 'GENERATED_COMPOSITION');
  if (generated.length !== 1 || generated[0].selectedOperatorId !== 'generated_composition_program') {
    fail('SEALED_H03_PROOF_GENERATED_NODE_INVALID');
  }
  assertGeneratedArguments(generated[0].normalizedArguments);
  if (!['E1', 'E2', 'E3'].every((ref) => generated[0].executionEvidenceRefs.includes(ref))) {
    fail('SEALED_H03_PROOF_EVIDENCE_BINDING_INVALID');
  }
  const publicMedia = records(record(input.manifest.cases.find(({ caseId }) => caseId === input.caseId)?.publicCase).media);
  const [sourceA, sourceB] = await Promise.all([
    bindAsset(input.mediaManifest, publicMedia, 'h03-a'),
    bindAsset(input.mediaManifest, publicMedia, 'h03-b'),
  ]);
  const artifacts = buildSealedH03GeneratedProgramArtifactsV2R({
    sourceAArtifactSha256: sourceA.artifactSha256,
    sourceBArtifactSha256: sourceB.artifactSha256,
  });
  const programHash = hashCanonicalJsonV1(artifacts.program);
  const sourceBundleHash = hashGeneratedCompositionSourceBundleV1(artifacts.sourceBundle);
  const generatedReceipt = await renderTrustedGeneratedCompositionProxyV1({
    ...artifacts, expectedProgramHash: programHash, expectedSourceBundleHash: sourceBundleHash,
    materializedInputs: {
      assetPaths: { 'h03-a': sourceA.artifactPath, 'h03-b': sourceB.artifactPath },
      fontPaths: { 'font-noto-sans-v27-regular': resolve(SEALED_H03_FONT_PATH_V2R) },
    },
  }, {
    workspaceRoot: resolve(input.outputDirectory, 'generated'),
    proofFrames: [0, 24, 90, 150, 179], includePlayableProxy: true,
  });
  const playable = generatedReceipt.playableProxy;
  if (!playable || playable.durationInFrames !== 180 || playable.width !== 1080
    || playable.height !== 1920 || playable.frameRate.numerator !== '30'
    || playable.frameRate.denominator !== '1') fail('SEALED_H03_PROOF_GENERATED_PROXY_INVALID');
  const hybrid = await renderConcatenatedProxyV2R({
    segments: [
      { sourcePath: sourceA.artifactPath, startFrame: 0, endFrame: 90 },
      { sourcePath: playable.path, startFrame: 0, endFrame: 180 },
      { sourcePath: sourceA.artifactPath, startFrame: 270, endFrame: 420 },
    ],
    width: 360, height: 640, outputDirectory: resolve(input.outputDirectory, 'hybrid'),
    outputFilename: 'sealed-holdout-h03-hybrid-proxy.mp4',
  });
  const [probe, entry, settled, exit, ...continuityFrames] = await Promise.all([
    probeHoldoutVideoV2R(hybrid.outputPath, input.ffprobePath),
    extract(playable.path, 0, 1080, 1920), extract(playable.path, 90, 1080, 1920),
    extract(playable.path, 179, 1080, 1920),
    ...[0, 89, 270, 419].flatMap((frame) => [
      extract(hybrid.outputPath, frame, 360, 640), extract(sourceA.artifactPath, frame, 360, 640),
    ]),
  ]);
  if (probe.codec !== 'h264' || probe.width !== 360 || probe.height !== 640
    || probe.averageFrameRate !== '30/1' || probe.decodedFrameCount !== 420
    || probe.audioStreamCount !== 0) fail('SEALED_H03_PROOF_VIDEO_CONTRACT_INVALID');
  const layout = measureLayout(settled, 1080, 1920);
  const motion = measureMotion(entry, settled, exit, 1080, 1920);
  const errors = [0, 1, 2, 3].map((index) => meanAbsoluteRgbError(
    continuityFrames[index * 2], continuityFrames[index * 2 + 1],
  ));
  if (layout.minimumPanelFillRatio < 0.82 || layout.titleYellowPixels < 1_000
    || layout.sourcePanelTitleFootprintIntersectionPixels !== 0
    || !titleBoundsInsideFootprint(layout.titleYellowBounds, 1080, 1920)
    || motion.entryEdgeLumaDelta < 20
    || motion.exitEdgeLumaDelta < 20 || Math.max(...errors) > 6) {
    fail(`SEALED_H03_PROOF_RENDERED_PREDICATE_FAILED:${JSON.stringify({
      layout, motion, continuityMeanAbsoluteRgbErrors: errors.map(round),
    })}`);
  }
  const material = {
    version: SEALED_HOLDOUT_H03_HYBRID_PROOF_VERSION_V2R,
    authority: 'RESEARCH_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-03' as const,
    manifestSha256: input.manifest.manifestSha256, publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    executionBoundary: {
      modelSelectedForm: 'GENERATED_COMPOSITION' as const,
      projectRangeForm: 'HYBRID_NATIVE_SURROUND_GENERATED_ISLAND' as const,
      generatedProgramSource: 'HUMAN_AUTHORED_FIXTURE_NOT_MODEL_OUTPUT' as const,
      sandboxStatus: 'TRUSTED_LOCAL_PROCESS_NOT_PRODUCTION_SECURITY_SANDBOX' as const,
    },
    sourceArtifacts: { sourceA: sourceA.artifactSha256, sourceB: sourceB.artifactSha256 },
    generatedIsland: {
      projectRange: { startFrame: 90 as const, endFrame: 270 as const },
      programHash, sourceBundleHash, proxySha256: playable.sha256, layout, motion,
      referenceAssetRendered: false as const,
    },
    nativeSurround: {
      segments: [
        { assetId: 'h03-a' as const, sourceStartFrame: 0 as const, sourceEndFrame: 90 as const },
        { generatedProgramId: 'gcp-hold-03-six-window-v2r-1' as const, localStartFrame: 0 as const, localEndFrame: 180 as const },
        { assetId: 'h03-a' as const, sourceStartFrame: 270 as const, sourceEndFrame: 420 as const },
      ] as const,
      sampledOutsideRangeMaxMeanAbsoluteRgbError: round(Math.max(...errors)),
      returnFrame270MeanAbsoluteRgbError: round(errors[2]),
      structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION' as const,
    },
    outputArtifact: { sha256: hybrid.artifactSha256, bytes: hybrid.bytes }, video: probe,
    assessment: 'PASS_RESEARCH_RENDERED_HYBRID_PROXY' as const, stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertGeneratedArguments(args: Readonly<JsonRecord>): void {
  const target = record(args.targetRange);
  const assets = strings(args.assetIds);
  if (args.projectId !== 'oe-hold-03' || args.expectedProjectRevision !== 'R12'
    || target.startFrame !== 90 || target.endFrame !== 270
    || assets.length !== 2 || assets[0] !== 'h03-a' || assets[1] !== 'h03-b'
    || args.referenceBlueprintId !== 'HOLD-03-REFERENCE-BLUEPRINT-V2R-1') {
    fail('SEALED_H03_PROOF_GENERATED_ARGUMENTS_INVALID');
  }
}
async function bindAsset(manifest: Readonly<HoldoutMediaManifestV2R>, media: readonly JsonRecord[], assetId: string) {
  return bindHoldoutMediaArtifactV2R({ manifest, taskId: 'HOLD-03', assetId,
    publicArtifactSha256: text(media.find((entry) => entry.assetId === assetId)?.artifactSha256) });
}
function extract(filePath: string, frame: number, width: number, height: number) {
  return extractHoldoutRgbFrameV2R({ filePath, frame, width, height });
}
function measureLayout(rgb: Buffer, width: number, height: number) {
  const fillRatios = PANELS.map((bounds) => nonDarkRatio(rgb, width, height, bounds));
  let titleYellowPixels = 0; let left = width; let right = -1; let top = height; let bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 3;
    const [r, g, b] = [rgb[offset], rgb[offset + 1], rgb[offset + 2]];
    if (r <= 220 || g <= 185 || b >= 85 || r <= g || r >= g * 1.35 || g <= b * 2.2) continue;
    titleYellowPixels += 1; left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) fail('SEALED_H03_PROOF_TITLE_PIXELS_MISSING');
  const titleFootprint: NormalizedBounds = [0.15, 0.43, 0.70, 0.14];
  const sourcePanelTitleFootprintIntersectionPixels = Math.round(PANELS.reduce(
    (sum, panel) => sum + normalizedIntersectionArea(panel, titleFootprint), 0,
  ) * width * height);
  return {
    detectedPanelCount: 6 as const, minimumPanelFillRatio: round(Math.min(...fillRatios)),
    titleYellowPixels, titleYellowBounds: { left, right, top, bottom },
    sourcePanelTitleFootprintIntersectionPixels,
  };
}
function measureMotion(entry: Buffer, settled: Buffer, exit: Buffer, width: number, height: number) {
  const entryEdges: readonly NormalizedBounds[] = [[0.282, 0.08, 0.012, 0.25], [0.706, 0.08, 0.012, 0.25]];
  const exitEdges: readonly NormalizedBounds[] = [[0.035, 0.08, 0.012, 0.25], [0.952, 0.08, 0.012, 0.25]];
  const entryEdgeLumaDelta = Math.min(...entryEdges.map((bounds) => meanLuma(settled, width, height, bounds) - meanLuma(entry, width, height, bounds)));
  const exitEdgeLumaDelta = Math.min(...exitEdges.map((bounds) => meanLuma(settled, width, height, bounds) - meanLuma(exit, width, height, bounds)));
  return { entryEdgeLumaDelta: round(entryEdgeLumaDelta), exitEdgeLumaDelta: round(exitEdgeLumaDelta) };
}
function nonDarkRatio(rgb: Buffer, width: number, height: number, bounds: NormalizedBounds): number {
  const pixels = region(rgb, width, height, inset(bounds, 0.08)); let filled = 0;
  for (let index = 0; index < pixels.length; index += 3) if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 75) filled += 1;
  return filled / (pixels.length / 3);
}
function meanLuma(rgb: Buffer, width: number, height: number, bounds: NormalizedBounds): number {
  const pixels = region(rgb, width, height, bounds); let total = 0;
  for (let index = 0; index < pixels.length; index += 3) total += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  return total / (pixels.length / 3);
}
function region(rgb: Buffer, width: number, height: number, bounds: NormalizedBounds): Buffer {
  const [left, top, regionWidth, regionHeight] = bounds;
  const x0 = Math.floor(left * width); const x1 = Math.ceil((left + regionWidth) * width);
  const y0 = Math.floor(top * height); const y1 = Math.ceil((top + regionHeight) * height);
  const output = Buffer.alloc((x1 - x0) * (y1 - y0) * 3); let offset = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    const source = (y * width + x) * 3;
    output[offset++] = rgb[source]; output[offset++] = rgb[source + 1]; output[offset++] = rgb[source + 2];
  }
  return output;
}
function inset([left, top, width, height]: NormalizedBounds, amount: number): NormalizedBounds {
  return [left + width * amount, top + height * amount, width * (1 - amount * 2), height * (1 - amount * 2)];
}
function normalizedIntersectionArea(left: NormalizedBounds, right: NormalizedBounds): number {
  const overlapWidth = Math.max(0, Math.min(left[0] + left[2], right[0] + right[2]) - Math.max(left[0], right[0]));
  const overlapHeight = Math.max(0, Math.min(left[1] + left[3], right[1] + right[3]) - Math.max(left[1], right[1]));
  return overlapWidth * overlapHeight;
}
function titleBoundsInsideFootprint(
  bounds: { left: number; right: number; top: number; bottom: number }, width: number, height: number,
): boolean {
  return bounds.left >= Math.floor(0.15 * width) && bounds.right < Math.ceil(0.85 * width)
    && bounds.top >= Math.floor(0.43 * height) && bounds.bottom < Math.ceil(0.57 * height);
}
function meanAbsoluteRgbError(left: Buffer, right: Buffer): number {
  if (left.length !== right.length) fail('SEALED_H03_PROOF_FRAME_SIZE_DRIFT');
  let total = 0; for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function round(value: number): number { return Number(value.toFixed(8)); }
function fail(code: string): never { throw new Error(code); }
