import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HoldoutMediaManifestV2R } from './holdout-media-materializer-v2r';
import type {
  BudgetedSealedHoldoutEvaluationReceiptV2R,
  BudgetedSealedHoldoutEvaluationReceiptV3R2,
  BudgetedSealedHoldoutEvaluationReceiptV4R,
}
  from './sealed-holdout-evaluator-v2r';
import {
  evaluateBudgetedSealedHoldoutTraceV3R2,
  evaluateBudgetedSealedHoldoutTraceV4R,
} from './sealed-holdout-evaluator-v2r';
import type { SealedHoldoutCohortManifestV2R } from './sealed-holdout-cohort-v2r';
import type { SealedHoldoutCohortManifestV3R2 } from './sealed-holdout-cohort-v3r2';
import {
  bindHoldoutMediaArtifactV2R,
  extractHoldoutRgbFrameV2R,
  measureHoldoutColorBoundsV2R,
  probeHoldoutVideoV2R,
  renderConcatenatedProxyV2R,
} from './sealed-holdout-media-proof-runtime-v2r';
import {
  bindSealedHoldoutProofInputV2R,
  bindSealedHoldoutProofInputV3R2,
  type BoundSealedHoldoutProofInputV2R,
  type BoundSealedHoldoutProofInputV3R2,
} from './sealed-holdout-proof-input-v2r';
import type {
  BudgetedSealedHoldoutSelectedOperationTraceV2R,
  BudgetedSealedHoldoutSelectedOperationTraceV3R2,
  SealedHoldoutTraceNodeV2R,
}
  from './sealed-holdout-trace-v2r';

type JsonRecord = Record<string, unknown>;
type Placement = Readonly<{
  node: Readonly<SealedHoldoutTraceNodeV2R>;
  assetId: string;
  target: Readonly<{ startFrame: number; endFrame: number }>;
  source: Readonly<{ startFrame: number; endFrame: number }>;
}>;

export const SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H02_RENDERED_NATIVE_PROOF_V2R_1' as const;
export const SEALED_HOLDOUT_H02_C2_NATIVE_PROOF_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_H02_RENDERED_NATIVE_PROOF_V2R_2_C2' as const;
export const SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V3R2 =
  'EDITRON_OE_SEALED_HOLDOUT_H02_RENDERED_NATIVE_PROOF_V3R_2_RESOURCE_BOUND_1' as const;
export const SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V4R =
  'EDITRON_OE_SEALED_HOLDOUT_H02_RENDERED_SEMANTIC_SEQUENCE_PROOF_V4R_1' as const;

export interface SealedHoldoutH02NativeProofMechanicsV2R {
  writerIssuedProjectRevisions: readonly [string, string, string];
  selectedSequence: readonly Readonly<{
    nodeId: string; assetId: string; targetRange: JsonRecord; sourceRange: JsonRecord;
  }>[];
  sourceArtifactSha256: Readonly<{ door: string; process: string }>;
  outputArtifact: Readonly<{ filename: string; sha256: string; bytes: number }>;
  video: Readonly<{ codec: string; width: number; height: number; averageFrameRate: string; decodedFrameCount: number; audioStreamCount: number }>;
  actionProof: Readonly<{
    openingDoorWidthRatio: number; closingDoorWidthRatio: number;
    middleMeanRgb: readonly [number, number, number];
  }>;
  affectedRange: Readonly<{ startFrame: 0; endFrame: 240 }>;
  outsideRangeProof: 'NOT_RENDERED_NOT_CLAIMED';
}

export interface SealedHoldoutH02NativeProofReceiptV2R
  extends SealedHoldoutH02NativeProofMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V2R
    | typeof SEALED_HOLDOUT_H02_C2_NATIVE_PROOF_VERSION_V2R;
  authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION';
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2'; taskId: 'HOLD-02'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY';
  stateEffects: readonly []; receiptSha256: string;
}

export interface SealedHoldoutH02NativeProofReceiptV3R2
  extends SealedHoldoutH02NativeProofMechanicsV2R {
  version: typeof SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V3R2;
  authority: 'RESEARCH_RENDERED_NATIVE_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION';
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2'; taskId: 'HOLD-02'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET';
  assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY';
  stateEffects: readonly []; receiptSha256: string;
}

export interface SealedHoldoutH02NativeProofMechanicsV4R {
  writerIssuedProjectRevisions: readonly string[];
  operationAttempts: readonly Readonly<{
    nodeId: string; operatorId: string; operatorKind: string;
    executionDisposition: string; argumentSha256: string; appliedToOutcome: boolean;
  }>[];
  selectedSequence: readonly Readonly<{
    nodeId: string; assetId: string; targetRange: JsonRecord; sourceRange: JsonRecord;
  }>[];
  sourceArtifactSha256: Readonly<{ door: string; process: string }>;
  outputArtifact: Readonly<{ filename: string; sha256: string; bytes: number }>;
  video: Readonly<{ codec: string; width: number; height: number; averageFrameRate: string; decodedFrameCount: number; audioStreamCount: number }>;
  actionProof: Readonly<{
    openingDoorWidthRatio: number; closingDoorWidthRatio: number;
    processMeanRgb: readonly (readonly [number, number, number])[];
  }>;
  affectedRange: Readonly<{ startFrame: 0; endFrame: number }>;
  outsideRangeProof: 'NOT_RENDERED_NOT_CLAIMED';
}

export interface SealedHoldoutH02NativeProofReceiptV4R
  extends SealedHoldoutH02NativeProofMechanicsV4R {
  version: typeof SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V4R;
  authority: 'RESEARCH_RENDERED_SEMANTIC_SEQUENCE_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION';
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2'; taskId: 'HOLD-02'; manifestSha256: string;
  publicCaseSha256: string; traceArtifactSha256: string;
  evaluationReceiptSha256: string; runtimeBudgetReceiptSha256: string;
  resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET';
  assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY';
  stateEffects: readonly []; receiptSha256: string;
}

export async function proveSealedHoldoutH02NativeOutcomeV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R>;
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV2R>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV2R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH02NativeProofReceiptV2R>> {
  const bound = bindSealedHoldoutProofInputV2R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-02'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const mechanics = await executeSealedHoldoutH02NativeProofMechanicsV2R({
    ...input,
    bound,
  });
  const material = {
    version: input.caseId === 'HOLD-02:C1'
      ? SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V2R
      : SEALED_HOLDOUT_H02_C2_NATIVE_PROOF_VERSION_V2R,
    authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId: 'HOLD-02' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    ...mechanics,
    assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function proveSealedHoldoutH02NativeOutcomeV3R2(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH02NativeProofReceiptV3R2>> {
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: input.evaluation, allowedTaskIds: ['HOLD-02'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const mechanics = await executeSealedHoldoutH02NativeProofMechanicsV2R({
    ...input,
    bound,
  });
  const material = {
    version: SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V3R2,
    authority: 'RESEARCH_RENDERED_NATIVE_PROXY_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId: 'HOLD-02' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: bound.evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET' as const,
    ...mechanics,
    assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

export async function proveSealedHoldoutH02NativeOutcomeV4R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2';
  trace: Readonly<BudgetedSealedHoldoutSelectedOperationTraceV3R2>;
  evaluation: Readonly<BudgetedSealedHoldoutEvaluationReceiptV4R>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH02NativeProofReceiptV4R>> {
  const legacyEvaluation = evaluateBudgetedSealedHoldoutTraceV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
  });
  const bound = bindSealedHoldoutProofInputV3R2({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
    evaluation: legacyEvaluation, allowedTaskIds: ['HOLD-02'],
    allowedAssessments: ['READY_FOR_PROOF'], allowedExecutionForms: ['NATIVE'],
  });
  const evaluation = evaluateBudgetedSealedHoldoutTraceV4R({
    manifest: input.manifest, caseId: input.caseId, trace: input.trace,
  });
  if (hashCanonicalJsonV1(input.evaluation) !== hashCanonicalJsonV1(evaluation)
    || evaluation.assessment !== 'READY_FOR_PROOF'
    || evaluation.executionForm !== 'NATIVE') fail('SEALED_H02_V4_PROOF_EVALUATION_INVALID');
  const mechanics = await executeSealedHoldoutH02NativeProofMechanicsV4R({
    ...input,
    bound,
  });
  const material = {
    version: SEALED_HOLDOUT_H02_NATIVE_PROOF_VERSION_V4R,
    authority: 'RESEARCH_RENDERED_SEMANTIC_SEQUENCE_CURRENT_RESOURCE_BOUND_NO_PROJECT_MUTATION' as const,
    caseId: input.caseId,
    taskId: 'HOLD-02' as const,
    manifestSha256: input.manifest.manifestSha256,
    publicCaseSha256: bound.publicCaseSha256,
    traceArtifactSha256: bound.trace.artifactSha256,
    evaluationReceiptSha256: evaluation.receiptSha256,
    runtimeBudgetReceiptSha256: bound.trace.runtimeBudgetReceiptSha256,
    resourceBudgetProof: 'BOUND_ACCOUNTED_WITHIN_BUDGET' as const,
    ...mechanics,
    assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

async function executeSealedHoldoutH02NativeProofMechanicsV2R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV2R | SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2';
  bound: Readonly<BoundSealedHoldoutProofInputV2R | BoundSealedHoldoutProofInputV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH02NativeProofMechanicsV2R>> {
  const { bound } = input;
  const evidence = new Set(bound.trace.nodes.flatMap(({ executionEvidenceRefs }) => executionEvidenceRefs));
  const mutationNodes = bound.trace.nodes.filter((node) =>
    node.executionDisposition === 'OK' && node.researchCloneMutation);
  if (mutationNodes.length !== 3 || mutationNodes.some(({ selectedOperatorId }) => selectedOperatorId !== 'add_overlay')
    || !['E1', 'E2'].every((ref) => evidence.has(ref))) fail('SEALED_H02_PROOF_TRACE_FORM_INVALID');
  const placements = mutationNodes.map(placement);
  assertSequence(placements);
  const revisions = placements.map(({ node }) => node.writerIssuedProjectRevision);
  if (revisions.some((revision) => !revision)
    || placements[0].node.normalizedArguments.expectedProjectRevision !== 'R4'
    || placements[1].node.normalizedArguments.expectedProjectRevision !== revisions[0]
    || placements[2].node.normalizedArguments.expectedProjectRevision !== revisions[1]) {
    fail('SEALED_H02_PROOF_REVISION_CHAIN_INVALID');
  }
  const publicMedia = records(record(input.manifest.cases.find(({ caseId }) => caseId === input.caseId)?.publicCase).media);
  const [door, process] = await Promise.all([
    bindAsset(input.mediaManifest, publicMedia, 'h02-door'),
    bindAsset(input.mediaManifest, publicMedia, 'h02-process'),
  ]);
  const paths = new Map([['h02-door', door.artifactPath], ['h02-process', process.artifactPath]]);
  const rendered = await renderConcatenatedProxyV2R({
    segments: placements.map(({ assetId, source }) => ({
      sourcePath: paths.get(assetId) ?? fail('SEALED_H02_PROOF_SOURCE_PATH_MISSING'),
      ...source,
    })),
    width: 360, height: 640, outputDirectory: input.outputDirectory,
    outputFilename: 'sealed-holdout-h02-bookend-proxy.mp4',
  });
  const [probe, openStartFrame, openEndFrame, middleFrame, closeStartFrame, closeEndFrame] = await Promise.all([
    probeHoldoutVideoV2R(rendered.outputPath, input.ffprobePath),
    ...[0, 74, 100, 165, 239].map((frame) => extractHoldoutRgbFrameV2R({
      filePath: rendered.outputPath, frame, width: 360, height: 640,
    })),
  ]);
  if (probe.codec !== 'h264' || probe.width !== 360 || probe.height !== 640
    || probe.averageFrameRate !== '30/1' || probe.decodedFrameCount !== 240
    || probe.audioStreamCount !== 0) fail('SEALED_H02_PROOF_VIDEO_CONTRACT_INVALID');
  const openStart = measureHoldoutColorBoundsV2R(openStartFrame, 360, 640, 'DOOR_BROWN');
  const openEnd = measureHoldoutColorBoundsV2R(openEndFrame, 360, 640, 'DOOR_BROWN');
  const closeStart = measureHoldoutColorBoundsV2R(closeStartFrame, 360, 640, 'DOOR_BROWN');
  const closeEnd = measureHoldoutColorBoundsV2R(closeEndFrame, 360, 640, 'DOOR_BROWN');
  const openingDoorWidthRatio = round(openEnd.width / openStart.width);
  const closingDoorWidthRatio = round(closeEnd.width / closeStart.width);
  const middleMeanRgb = meanRgb(middleFrame);
  if (openingDoorWidthRatio >= 0.4 || closingDoorWidthRatio <= 2.5
    || middleMeanRgb[2] - middleMeanRgb[0] < 50
    || middleMeanRgb[1] - middleMeanRgb[0] < 30) fail('SEALED_H02_PROOF_ACTION_SEQUENCE_FAILED');
  return deepFreezeV1({
    writerIssuedProjectRevisions: revisions as [string, string, string],
    selectedSequence: placements.map(({ node, assetId, target, source }) => ({
      nodeId: node.nodeId, assetId, targetRange: target, sourceRange: source,
    })),
    sourceArtifactSha256: { door: door.artifactSha256, process: process.artifactSha256 },
    outputArtifact: { filename: 'sealed-holdout-h02-bookend-proxy.mp4', sha256: rendered.artifactSha256, bytes: rendered.bytes },
    video: probe,
    actionProof: { openingDoorWidthRatio, closingDoorWidthRatio, middleMeanRgb },
    affectedRange: { startFrame: 0 as const, endFrame: 240 as const },
    outsideRangeProof: 'NOT_RENDERED_NOT_CLAIMED' as const,
  });
}

async function executeSealedHoldoutH02NativeProofMechanicsV4R(input: {
  manifest: Readonly<SealedHoldoutCohortManifestV3R2>;
  caseId: 'HOLD-02:C1' | 'HOLD-02:C2';
  bound: Readonly<BoundSealedHoldoutProofInputV3R2>;
  mediaManifest: Readonly<HoldoutMediaManifestV2R>;
  outputDirectory: string; ffprobePath?: string;
}): Promise<Readonly<SealedHoldoutH02NativeProofMechanicsV4R>> {
  const taskCase = input.manifest.cases.find(({ caseId }) => caseId === input.caseId)
    ?? fail('SEALED_H02_V4_PROOF_CASE_MISSING');
  const publicCase = record(taskCase.publicCase);
  const publicMedia = records(publicCase.media);
  const initialProjectRevision = text(record(publicCase.project).expectedProjectRevision);
  if (!initialProjectRevision) fail('SEALED_H02_V4_PROOF_PUBLIC_PROJECT_INVALID');
  const contract = h02EvidenceContract(record(taskCase.ownerOnly), publicCase);
  const suppliedEvidence = new Set(input.bound.trace.nodes
    .flatMap(({ executionEvidenceRefs }) => executionEvidenceRefs));
  if (!contract.requiredEvidenceRefs.every((ref) => suppliedEvidence.has(ref))) {
    fail('SEALED_H02_V4_PROOF_EVIDENCE_UNRESOLVED');
  }
  const operationAttempts = outcomeOperationAttempts(input.bound.trace.nodes);
  const mutationNodes = input.bound.trace.nodes.filter((node) =>
    node.executionDisposition === 'OK' && node.researchCloneMutation);
  if (mutationNodes.length < 3
    || mutationNodes.some(({ selectedOperatorId }) => selectedOperatorId !== 'add_overlay')) {
    fail('SEALED_H02_V4_PROOF_TRACE_FORM_INVALID');
  }
  const writerIssuedProjectRevisions = assertSealedHoldoutH02RevisionChainV4R({
    initialProjectRevision,
    mutations: mutationNodes.map((node) => ({
      expectedProjectRevision: text(node.normalizedArguments.expectedProjectRevision),
      writerIssuedProjectRevision: node.writerIssuedProjectRevision,
    })),
  });
  const placements = mutationNodes.map(placement)
    .sort((left, right) => left.target.startFrame - right.target.startFrame);
  const { endFrame } = assertSealedHoldoutH02SemanticSequenceV4R({
    placements,
    contract,
  });
  const [door, process] = await Promise.all([
    bindAsset(input.mediaManifest, publicMedia, contract.doorAssetId),
    bindAsset(input.mediaManifest, publicMedia, contract.processAssetId),
  ]);
  const paths = new Map([
    [contract.doorAssetId, door.artifactPath],
    [contract.processAssetId, process.artifactPath],
  ]);
  const rendered = await renderConcatenatedProxyV2R({
    segments: placements.map(({ assetId, source }) => ({
      sourcePath: paths.get(assetId) ?? fail('SEALED_H02_V4_PROOF_SOURCE_PATH_MISSING'),
      ...source,
    })),
    width: 360, height: 640, outputDirectory: input.outputDirectory,
    outputFilename: 'sealed-holdout-h02-semantic-bookend-proxy-v4r.mp4',
  });
  const opening = placements[0];
  const closing = placements[placements.length - 1];
  const processPlacements = placements.slice(1, -1);
  const sampleFrames = [
    opening.target.startFrame,
    opening.target.endFrame - 1,
    ...processPlacements.map(({ target }) =>
      target.startFrame + Math.floor((target.endFrame - target.startFrame - 1) / 2)),
    closing.target.startFrame,
    closing.target.endFrame - 1,
  ];
  const [probe, ...frames] = await Promise.all([
    probeHoldoutVideoV2R(rendered.outputPath, input.ffprobePath),
    ...sampleFrames.map((frame) => extractHoldoutRgbFrameV2R({
      filePath: rendered.outputPath, frame, width: 360, height: 640,
    })),
  ]);
  if (probe.codec !== 'h264' || probe.width !== 360 || probe.height !== 640
    || probe.averageFrameRate !== '30/1' || probe.decodedFrameCount !== endFrame
    || probe.audioStreamCount !== 0) fail('SEALED_H02_V4_PROOF_VIDEO_CONTRACT_INVALID');
  const openStart = measureHoldoutColorBoundsV2R(frames[0], 360, 640, 'DOOR_BROWN');
  const openEnd = measureHoldoutColorBoundsV2R(frames[1], 360, 640, 'DOOR_BROWN');
  const processFrames = frames.slice(2, 2 + processPlacements.length);
  const closeStart = measureHoldoutColorBoundsV2R(
    frames[frames.length - 2], 360, 640, 'DOOR_BROWN');
  const closeEnd = measureHoldoutColorBoundsV2R(
    frames[frames.length - 1], 360, 640, 'DOOR_BROWN');
  const processMeanRgb = processFrames.map(meanRgb);
  if (openStart.width <= openEnd.width || closeEnd.width <= closeStart.width
    || processMeanRgb.some(([red, green, blue]) =>
      blue - red < 50 || green - red < 30)) {
    fail('SEALED_H02_V4_PROOF_ACTION_SEQUENCE_FAILED');
  }
  return deepFreezeV1({
    writerIssuedProjectRevisions,
    operationAttempts,
    selectedSequence: placements.map(({ node, assetId, target, source }) => ({
      nodeId: node.nodeId, assetId, targetRange: target, sourceRange: source,
    })),
    sourceArtifactSha256: { door: door.artifactSha256, process: process.artifactSha256 },
    outputArtifact: {
      filename: 'sealed-holdout-h02-semantic-bookend-proxy-v4r.mp4',
      sha256: rendered.artifactSha256, bytes: rendered.bytes,
    },
    video: probe,
    actionProof: {
      openingDoorWidthRatio: round(openEnd.width / Math.max(1, openStart.width)),
      closingDoorWidthRatio: round(closeEnd.width / Math.max(1, closeStart.width)),
      processMeanRgb,
    },
    affectedRange: { startFrame: 0 as const, endFrame },
    outsideRangeProof: 'NOT_RENDERED_NOT_CLAIMED' as const,
  });
}

function placement(node: Readonly<SealedHoldoutTraceNodeV2R>): Placement {
  return { node, assetId: text(node.normalizedArguments.assetId),
    target: frameRange(node.normalizedArguments.targetRange),
    source: frameRange(node.normalizedArguments.sourceRange) };
}
function assertSequence(value: readonly Placement[]): void {
  const [opening, process, closing] = value;
  const exact = (range: Placement['target'], startFrame: number, endFrame: number) =>
    range.startFrame === startFrame && range.endFrame === endFrame;
  const processRanges = [[0, 90], [120, 210], [240, 330]];
  if (opening.assetId !== 'h02-door' || !exact(opening.target, 0, 75) || !exact(opening.source, 30, 105)
    || process.assetId !== 'h02-process' || !exact(process.target, 75, 165)
    || !processRanges.some(([start, end]) => exact(process.source, start, end))
    || closing.assetId !== 'h02-door' || !exact(closing.target, 165, 240)
    || !exact(closing.source, 240, 315)) fail('SEALED_H02_PROOF_SELECTED_SEQUENCE_INVALID');
}
export type H02EvidenceContractV4R = Readonly<{
  doorAssetId: string;
  processAssetId: string;
  projectDurationInFrames: number;
  doorOpen: Readonly<{ startFrame: number; endFrame: number }>;
  doorClose: Readonly<{ startFrame: number; endFrame: number }>;
  processWindows: readonly Readonly<{ startFrame: number; endFrame: number }>[];
  requiredEvidenceRefs: readonly string[];
}>;
export type H02SemanticPlacementV4R = Readonly<{
  assetId: string;
  target: Readonly<{ startFrame: number; endFrame: number }>;
  source: Readonly<{ startFrame: number; endFrame: number }>;
}>;
export type H02RevisionMutationV4R = Readonly<{
  expectedProjectRevision: string;
  writerIssuedProjectRevision: string | null;
}>;
export function assertSealedHoldoutH02RevisionChainV4R(input: Readonly<{
  initialProjectRevision: string;
  mutations: readonly H02RevisionMutationV4R[];
}>): readonly string[] {
  if (!input.initialProjectRevision || !input.mutations.length) {
    fail('SEALED_H02_V4_PROOF_REVISION_CHAIN_INVALID');
  }
  let expectedRevision = input.initialProjectRevision;
  const writerIssuedProjectRevisions: string[] = [];
  for (const mutation of input.mutations) {
    if (!mutation.writerIssuedProjectRevision
      || mutation.expectedProjectRevision !== expectedRevision) {
      fail('SEALED_H02_V4_PROOF_REVISION_CHAIN_INVALID');
    }
    writerIssuedProjectRevisions.push(mutation.writerIssuedProjectRevision);
    expectedRevision = mutation.writerIssuedProjectRevision;
  }
  return deepFreezeV1(writerIssuedProjectRevisions);
}
function h02EvidenceContract(
  ownerOnly: JsonRecord,
  publicCase: JsonRecord,
): H02EvidenceContractV4R {
  const publicMedia = records(publicCase.media);
  const projectDurationInFrames = integer(record(publicCase.project).durationFrames);
  const evidence = records(ownerOnly.evidence);
  const windowsEvidence = evidence.find(({ kind }) => kind === 'SOURCE_WINDOWS');
  const narrativeEvidence = evidence.find(({ kind }) => kind === 'NARRATIVE');
  const windows = record(windowsEvidence?.value);
  const narrative = record(narrativeEvidence?.value);
  const doorAssetId = text(narrative.requiredCallbackAssetId);
  const requiredOrder = strings(narrative.requiredOrder);
  const processAssets = publicMedia.map(({ assetId }) => text(assetId))
    .filter((assetId) => assetId && assetId !== doorAssetId);
  const processWindows = recordsFromRanges(windows.process);
  const requiredEvidenceRefs = [text(windowsEvidence?.evidenceRef), text(narrativeEvidence?.evidenceRef)];
  if (!doorAssetId || processAssets.length !== 1 || projectDurationInFrames <= 0
    || hashCanonicalJsonV1(requiredOrder) !== hashCanonicalJsonV1(['open', 'process', 'close'])
    || !processWindows.length || requiredEvidenceRefs.some((ref) => !ref)) {
    fail('SEALED_H02_V4_PROOF_EVIDENCE_CONTRACT_INVALID');
  }
  return {
    doorAssetId,
    processAssetId: processAssets[0],
    projectDurationInFrames,
    doorOpen: rangeFromTuple(windows.doorOpen),
    doorClose: rangeFromTuple(windows.doorClose),
    processWindows,
    requiredEvidenceRefs,
  };
}
export function assertSealedHoldoutH02SemanticSequenceV4R(input: Readonly<{
  placements: readonly H02SemanticPlacementV4R[];
  contract: H02EvidenceContractV4R;
}>): Readonly<{ endFrame: number }> {
  const { placements, contract } = input;
  if (placements.length < 3) fail('SEALED_H02_V4_PROOF_SEMANTIC_SEQUENCE_INVALID');
  const opening = placements[0];
  const closing = placements[placements.length - 1];
  const processes = placements.slice(1, -1);
  if (opening.assetId !== contract.doorAssetId
    || closing.assetId !== contract.doorAssetId
    || processes.some(({ assetId }) => assetId !== contract.processAssetId)
    || opening.target.startFrame !== 0
    || !contains(contract.doorOpen, opening.source)
    || !contains(contract.doorClose, closing.source)
    || processes.some(({ source }) =>
      !contract.processWindows.some((window) => contains(window, source)))
    || closing.target.endFrame > contract.projectDurationInFrames
    || placements.some(({ target, source }) =>
      target.endFrame - target.startFrame !== source.endFrame - source.startFrame)
    || placements.slice(1).some((entry, index) =>
      placements[index].target.endFrame !== entry.target.startFrame)) {
    fail('SEALED_H02_V4_PROOF_SEMANTIC_SEQUENCE_INVALID');
  }
  return deepFreezeV1({ endFrame: closing.target.endFrame });
}
function rangeFromTuple(value: unknown): { startFrame: number; endFrame: number } {
  const values = numbers(value);
  if (values.length !== 2) fail('SEALED_H02_V4_PROOF_EVIDENCE_RANGE_INVALID');
  return frameRange({ startFrame: values[0], endFrame: values[1] });
}
function recordsFromRanges(value: unknown): readonly { startFrame: number; endFrame: number }[] {
  return Array.isArray(value) ? value.map(rangeFromTuple) : [];
}
function contains(
  container: Readonly<{ startFrame: number; endFrame: number }>,
  candidate: Readonly<{ startFrame: number; endFrame: number }>,
): boolean {
  return candidate.startFrame >= container.startFrame
    && candidate.endFrame <= container.endFrame;
}
function outcomeOperationAttempts(
  nodes: readonly Readonly<SealedHoldoutTraceNodeV2R>[],
) {
  return nodes.filter(({ operatorKind }) =>
    ['MUTATION', 'MUTATION_LEGACY', 'GENERATED_COMPOSITION'].includes(operatorKind))
    .map((node) => ({
      nodeId: node.nodeId,
      operatorId: node.selectedOperatorId,
      operatorKind: node.operatorKind,
      executionDisposition: node.executionDisposition,
      argumentSha256: node.argumentSha256,
      appliedToOutcome: node.executionDisposition === 'OK',
    }));
}
async function bindAsset(manifest: Readonly<HoldoutMediaManifestV2R>, media: readonly JsonRecord[], assetId: string) {
  const recordForAsset = media.find((entry) => entry.assetId === assetId);
  return bindHoldoutMediaArtifactV2R({ manifest, taskId: 'HOLD-02', assetId,
    publicArtifactSha256: text(recordForAsset?.artifactSha256) });
}
function meanRgb(rgb: Buffer): readonly [number, number, number] {
  const totals = [0, 0, 0];
  for (let index = 0; index < rgb.length; index += 3) {
    totals[0] += rgb[index]; totals[1] += rgb[index + 1]; totals[2] += rgb[index + 2];
  }
  const pixels = rgb.length / 3;
  return [round(totals[0] / pixels), round(totals[1] / pixels), round(totals[2] / pixels)];
}
function frameRange(value: unknown) { const range = record(value); const startFrame = integer(range.startFrame); const endFrame = integer(range.endFrame); if (startFrame < 0 || endFrame <= startFrame) fail('SEALED_H02_PROOF_RANGE_INVALID'); return { startFrame, endFrame }; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.filter((entry): entry is number => Number.isSafeInteger(entry)) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function integer(value: unknown): number { return Number.isSafeInteger(value) ? Number(value) : -1; }
function round(value: number): number { return Number(value.toFixed(8)); }
function fail(code: string): never { throw new Error(code); }
