import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type { BudgetedSealedHoldoutEvaluationReceiptV2R }
  from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import {
  bindHoldoutMediaArtifactV2R,
  extractHoldoutRgbFrameV2R,
  measureHoldoutColorBoundsV2R,
  probeHoldoutVideoV2R,
  renderHardCutProxyV2R,
} from './sealed-holdout-media-proof-runtime-v2r';
import { bindSealedHoldoutProofInputV2R } from './sealed-holdout-proof-input-v2r';
import type { BudgetedSealedHoldoutSelectedOperationTraceV2R }
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H01_RENDERED_NATIVE_PROOF_V2R_1' as const;

export interface SealedHoldoutH01NativeProofReceiptV2R {
  version: typeof SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V2R;
  authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-01:C1';
  taskId: 'HOLD-01';
  manifestSha256: string;
  publicCaseSha256: string;
  traceArtifactSha256: string;
  evaluationReceiptSha256: string;
  runtimeBudgetReceiptSha256: string;
  writerIssuedProjectRevision: string;
  selectedMutation: Readonly<{
    nodeId: string; operatorId: 'use_matching_footage'; argumentSha256: string;
    incomingStartFrame: number; incomingEndFrame: number;
  }>;
  sourceArtifactSha256: Readonly<{ outgoing: string; incoming: string }>;
  outputArtifact: Readonly<{ filename: string; sha256: string; bytes: number }>;
  video: Readonly<{
    codec: string; width: number; height: number; averageFrameRate: string;
    decodedFrameCount: number; audioStreamCount: number;
  }>;
  geometry: Readonly<{
    outgoingFrame: 149; incomingFrame: 150;
    normalizedCenterDistance: number; diameterRatio: number;
  }>;
  assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY';
  productProjectMutationProof: 'NOT_CLAIMED';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function proveSealedHoldoutH01NativeOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-01:C1';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string;
  ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH01NativeProofReceiptV2R>> {
  const bound = bindSealedHoldoutProofInputV2R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-01'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId);
  const publicCase = record(taskCase?.publicCase);
  const publicMedia = records(publicCase.media);
  const successfulMutations = bound.trace.nodes.filter((node) =>
    node.executionDisposition === 'OK' && node.researchCloneMutation);
  if (successfulMutations.length !== 1
    || successfulMutations[0].selectedOperatorId !== 'use_matching_footage') {
    fail('SEALED_H01_PROOF_MUTATION_FORM_UNSUPPORTED');
  }
  if (bound.trace.nodes.some(({ selectedOperatorId, executionDisposition }) =>
    executionDisposition === 'OK' && ['add_transition', 'apply_fade'].includes(selectedOperatorId))) {
    fail('SEALED_H01_PROOF_TRANSITION_FORBIDDEN');
  }
  const mutation = successfulMutations[0];
  const args = mutation.normalizedArguments;
  const targetRange = frameRange(args.targetRange, 'TARGET');
  const sourceRange = frameRange(args.sourceRange, 'SOURCE');
  const evidenceIds = strings(args.evidenceIds);
  if (args.projectId !== 'oe-hold-01' || args.expectedProjectRevision !== 'R9'
    || args.assetId !== 'h01-dial' || targetRange.startFrame !== 150
    || targetRange.endFrame !== 300 || sourceRange.startFrame < 30
    || sourceRange.startFrame >= 120 || sourceRange.endFrame < sourceRange.startFrame + 150
    || sourceRange.endFrame > 300 || !['E1', 'E2'].every((ref) => evidenceIds.includes(ref))
    || !mutation.writerIssuedProjectRevision) {
    fail('SEALED_H01_PROOF_SELECTED_MUTATION_INVALID');
  }
  const [outgoing, incoming] = await Promise.all([
    bindAsset(input.mediaManifest, publicMedia, 'h01-clock'),
    bindAsset(input.mediaManifest, publicMedia, 'h01-dial'),
  ]);
  const rendered = await renderHardCutProxyV2R({
    outgoingPath: outgoing.artifactPath, incomingPath: incoming.artifactPath,
    incomingStartFrame: sourceRange.startFrame, boundaryFrame: 150, durationFrames: 300,
    width: 640, height: 360, outputDirectory: input.outputDirectory,
  });
  const [probe, outgoingFrame, incomingFrame] = await Promise.all([
    probeHoldoutVideoV2R(rendered.outputPath, input.ffprobePath),
    extractHoldoutRgbFrameV2R({ filePath: rendered.outputPath, frame: 149, width: 640, height: 360 }),
    extractHoldoutRgbFrameV2R({ filePath: rendered.outputPath, frame: 150, width: 640, height: 360 }),
  ]);
  if (probe.codec !== 'h264' || probe.width !== 640 || probe.height !== 360
    || probe.averageFrameRate !== '30/1' || probe.decodedFrameCount !== 300
    || probe.audioStreamCount !== 0) fail('SEALED_H01_PROOF_VIDEO_CONTRACT_INVALID');
  const clock = measureHoldoutColorBoundsV2R(outgoingFrame, 640, 360, 'CLOCK_GOLD');
  const dial = measureHoldoutColorBoundsV2R(incomingFrame, 640, 360, 'DIAL_CYAN');
  const centerDistance = round(Math.hypot(
    (clock.centerX - dial.centerX) / 640,
    (clock.centerY - dial.centerY) / 360,
  ));
  const clockDiameter = (clock.width + clock.height) / 2;
  const dialDiameter = (dial.width + dial.height) / 2;
  const diameterRatio = round(dialDiameter / clockDiameter);
  if (centerDistance > 0.03 || diameterRatio < 0.9 || diameterRatio > 1.1) {
    fail(`SEALED_H01_PROOF_GEOMETRY_FAILED:${centerDistance}:${diameterRatio}`);
  }
  const material = {
    version: SEALED_HOLDOUT_H01_NATIVE_PROOF_VERSION_V2R,
    authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId, taskId: 'HOLD-01' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    writerIssuedProjectRevision: mutation.writerIssuedProjectRevision,
    selectedMutation: {
      nodeId: mutation.nodeId, operatorId: 'use_matching_footage' as const,
      argumentSha256: mutation.argumentSha256,
      incomingStartFrame: sourceRange.startFrame, incomingEndFrame: sourceRange.endFrame,
    },
    sourceArtifactSha256: {
      outgoing: outgoing.artifactSha256, incoming: incoming.artifactSha256,
    },
    outputArtifact: {
      filename: 'sealed-holdout-hard-cut-proxy.mp4',
      sha256: rendered.artifactSha256, bytes: rendered.bytes,
    },
    video: probe,
    geometry: {
      outgoingFrame: 149 as const, incomingFrame: 150 as const,
      normalizedCenterDistance: centerDistance, diameterRatio,
    },
    assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY' as const,
    productProjectMutationProof: 'NOT_CLAIMED' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function bindAsset(
  mediaManifest: Readonly<HoldoutMediaManifestV2R>,
  publicMedia: readonly JsonRecord[],
  assetId: string,
) {
  const media = publicMedia.find((entry) => entry.assetId === assetId);
  return bindHoldoutMediaArtifactV2R({
    manifest: mediaManifest, taskId: 'HOLD-01', assetId,
    publicArtifactSha256: text(media?.artifactSha256),
  });
}
function frameRange(value: unknown, label: string): { startFrame: number; endFrame: number } {
  const range = record(value); const startFrame = integer(range.startFrame); const endFrame = integer(range.endFrame);
  if (startFrame < 0 || endFrame <= startFrame) fail(`SEALED_H01_PROOF_${label}_RANGE_INVALID`);
  return { startFrame, endFrame };
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function round(value: number): number { return Number(value.toFixed(8)); }
function fail(code: string): never { throw new Error(code); }
