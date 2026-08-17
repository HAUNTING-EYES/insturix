import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { evaluateDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-evaluator-v2';
import {
  DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2,
  DEV02_HYBRID_STAGE6_VERSION_V2,
  hasValidDev02HybridStage6ReceiptHashV2,
  type Dev02HybridStage6ExecutionEvidenceV2,
  type Dev02HybridStage6RenderProofV2,
} from './dev02-hybrid-stage6-contract-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

type Dimension = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Dev02HybridStage6EvaluationV2 {
  assessment: Dimension;
  authorization: Dimension;
  sourceIdentity: Dimension;
  artifactIntegrity: Dimension;
  upstreamBinding: Dimension;
  hybridTiming: Dimension;
  boundaryContinuity: Dimension;
  nativeContinuation: Dimension;
  projectIsolation: Dimension;
  diagnostics: readonly string[];
}

const FILENAMES = {
  FULL_HYBRID_PROXY: 'dev02-full-hybrid-proxy.mp4',
  ISLAND_SAMPLE_0108: 'island-sample-0108.png',
  HYBRID_SAMPLE_0108: 'hybrid-sample-0108.png',
  HYBRID_EXIT_0179: 'hybrid-exit-0179.png',
  HYBRID_NATIVE_ENTRY_0180: 'hybrid-native-entry-0180.png',
  NATIVE_SOURCE_ENTRY_0180: 'native-source-entry-0180.png',
  HYBRID_NATIVE_FINAL_0344: 'hybrid-native-final-0344.png',
  NATIVE_SOURCE_FINAL_0344: 'native-source-final-0344.png',
} as const;

export async function evaluateDev02HybridStage6V2(input: {
  graph: unknown;
  evidence: Dev02HybridStage6ExecutionEvidenceV2;
}): Promise<Readonly<Dev02HybridStage6EvaluationV2>> {
  if (!input?.evidence?.receipt) return emptyEvaluation();
  const diagnostics: string[] = [];
  validateAuthorization(input.graph, input.evidence, diagnostics);
  await validateSources(input.evidence, diagnostics);
  await validateArtifacts(input.evidence, diagnostics);
  validateUpstreamBinding(input.graph, input.evidence, diagnostics);
  validateNativeContinuation(input.graph, input.evidence, diagnostics);
  validateRenderProof(input.evidence.receipt.renderProof, diagnostics);
  validateIsolation(input.evidence, diagnostics);
  const authorization = dimension(diagnostics, /^AUTH_/);
  const sourceIdentity = dimension(diagnostics, /^SOURCE_/);
  const artifactIntegrity = dimension(diagnostics, /^ARTIFACT_/);
  const upstreamBinding = dimension(diagnostics, /^UPSTREAM_/);
  const hybridTiming = dimension(diagnostics, /^TIMING_/);
  const boundaryContinuity = dimension(diagnostics, /^BOUNDARY_/);
  const nativeContinuation = dimension(diagnostics, /^CONTINUATION_/);
  const projectIsolation = dimension(diagnostics, /^ISOLATION_/);
  const dimensions = [authorization, sourceIdentity, artifactIntegrity, upstreamBinding, hybridTiming,
    boundaryContinuity, nativeContinuation, projectIsolation];
  return Object.freeze({
    assessment: dimensions.includes('FAIL') ? 'FAIL' : 'PASS',
    authorization, sourceIdentity, artifactIntegrity, upstreamBinding, hybridTiming, boundaryContinuity,
    nativeContinuation, projectIsolation,
    diagnostics: unique(diagnostics).sort(compareUtf16),
  });
}

function validateNativeContinuation(
  graph: unknown,
  evidence: Dev02HybridStage6ExecutionEvidenceV2,
  diagnostics: string[],
): void {
  const graphNode = records(record(graph).nodes)
    .find(({ nodeId }) => nodeId === 'compile-resolve-native-continuation');
  const receipt = evidence.receipt.inputs.nativeContinuation;
  if (!graphNode || !receipt) { diagnostics.push('CONTINUATION_RECEIPT_MISSING'); return; }
  const { receiptHash: _receiptHash, ...unsigned } = receipt;
  const expectedScope = graphNode.operatorId === 'move_retime_overlay'
    ? 'ISOLATED_PROXY_CLONE' : 'READ_ONLY';
  const expectedDisposition = graphNode.operatorId === 'move_retime_overlay'
    ? 'APPLIED_IDEMPOTENT' : 'RESOLVED_EXISTING_BINDING';
  const native = evidence.receipt.inputs.nativeSource;
  const expectedRange = {
    assetId: native.assetId,
    sourceStartFrame: native.sourceStartFrame,
    sourceEndExclusiveFrame: native.sourceEndExclusiveFrame,
    projectStartFrame: native.projectStartFrame,
    projectEndExclusiveFrame: native.projectEndExclusiveFrame,
  };
  const operation = evidence.receipt.operations[1];
  if (!['resolve_user_asset_overlay', 'move_retime_overlay'].includes(String(graphNode.operatorId))
    || receipt.receiptHash !== hashCanonicalJsonV1(unsigned)
    || receipt.operatorId !== graphNode.operatorId
    || receipt.ownerRef !== graphNode.ownerRef
    || receipt.sourceGraphNodeHash !== hashCanonicalJsonV1(graphNode)
    || receipt.scope !== expectedScope
    || receipt.disposition !== expectedDisposition
    || receipt.overlayId !== 'ov-next'
    || !same(receipt.before, expectedRange)
    || !same(receipt.after, expectedRange)
    || receipt.changedProxyPaths.length
    || receipt.appliedStateEffects.length
    || operation.owner !== receipt.operatorId) {
    diagnostics.push('CONTINUATION_GRAPH_OR_RECEIPT_BINDING_INVALID');
  }
}

function validateUpstreamBinding(
  graph: unknown,
  evidence: Dev02HybridStage6ExecutionEvidenceV2,
  diagnostics: string[],
): void {
  const island = evidence.receipt.inputs.island;
  const graphRecord = record(graph);
  const islandNode = records(graphRecord.nodes).find(({ nodeId }) => nodeId === 'compile-preview-generated-island');
  const islandInputs = record(islandNode?.inputs);
  const hashes = [
    island.programHash, island.sourceStage4GraphHash, island.upstreamStage6ReceiptHash,
    island.hostReceiptHash, island.proxyReceiptHash, island.localEvidenceHash,
    island.renderedProofHash, island.videoSha256,
  ];
  if (hashes.some((value) => !/^[a-f0-9]{64}$/.test(value))
    || graphRecord.sourceIslandGraphHash !== island.sourceStage4GraphHash
    || islandInputs.programHash !== island.programHash) {
    diagnostics.push('UPSTREAM_RECEIPT_OR_GRAPH_BINDING_INVALID');
  }
}

function validateAuthorization(graph: unknown, evidence: Dev02HybridStage6ExecutionEvidenceV2, diagnostics: string[]): void {
  const stage4 = evaluateDev02HybridStage4GraphV2(graph);
  const stage5 = decideStage5ProceedOrStopV2(graph);
  const receipt = evidence.receipt;
  if (stage4.assessment !== 'PASS') diagnostics.push('AUTH_STAGE4_NOT_PASS');
  if (stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') diagnostics.push('AUTH_STAGE5_NOT_BOUNDED');
  if (receipt.schemaVersion !== DEV02_HYBRID_STAGE6_VERSION_V2
    || receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION'
    || receipt.taskId !== 'DEV-02'
    || receipt.stage4GraphHash !== hashCanonicalJsonV1(graph)
    || receipt.stage5DecisionHash !== hashCanonicalJsonV1(stage5)
    || !hasValidDev02HybridStage6ReceiptHashV2(receipt)) diagnostics.push('AUTH_RECEIPT_IDENTITY_OR_HASH_INVALID');
}

async function validateSources(evidence: Dev02HybridStage6ExecutionEvidenceV2, diagnostics: string[]): Promise<void> {
  const { island, nativeSource } = evidence.receipt.inputs;
  try {
    const [islandBytes, nativeBytes] = await Promise.all([
      readFile(evidence.sourcePaths.island), readFile(evidence.sourcePaths.nativeSource),
    ]);
    if (sha256(islandBytes) !== island.videoSha256 || sha256(nativeBytes) !== nativeSource.videoSha256) {
      diagnostics.push('SOURCE_BYTES_HASH_DRIFT');
    }
  } catch { diagnostics.push('SOURCE_BYTES_UNREADABLE'); }
  if (island.hardGateDisposition !== 'PASS'
    || nativeSource.assetId !== 'dev02-close'
    || nativeSource.assetVersion !== `sha256:${nativeSource.videoSha256}`
    || nativeSource.sourceStartFrame !== 180 || nativeSource.sourceEndExclusiveFrame !== 345
    || nativeSource.projectStartFrame !== 180 || nativeSource.projectEndExclusiveFrame !== 345) {
    diagnostics.push('SOURCE_CONTRACT_BINDING_DRIFT');
  }
}

async function validateArtifacts(evidence: Dev02HybridStage6ExecutionEvidenceV2, diagnostics: string[]): Promise<void> {
  const bindings = evidence.receipt.artifacts;
  if (bindings.length !== DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2.length
    || !DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2.every((id) => bindings.filter((entry) => entry.artifactId === id).length === 1)) {
    diagnostics.push('ARTIFACT_SET_INVALID'); return;
  }
  const root = path.resolve(path.dirname(evidence.receiptPath));
  for (const binding of bindings) {
    const resolved = path.resolve(binding.path);
    if (path.dirname(resolved) !== root || path.basename(resolved) !== FILENAMES[binding.artifactId]) {
      diagnostics.push(`ARTIFACT_PATH_INVALID:${binding.artifactId}`); continue;
    }
    try {
      const bytes = await readFile(resolved);
      if (!bytes.length || bytes.length !== binding.byteLength || sha256(bytes) !== binding.sha256) {
        diagnostics.push(`ARTIFACT_BYTES_DRIFT:${binding.artifactId}`);
      }
    } catch { diagnostics.push(`ARTIFACT_UNREADABLE:${binding.artifactId}`); }
  }
}

function validateRenderProof(proof: Dev02HybridStage6RenderProofV2, diagnostics: string[]): void {
  if (proof.schemaVersion !== DEV02_HYBRID_STAGE6_VERSION_V2
    || proof.assembler !== 'FFMPEG_FILTER_GRAPH_BOUND_TO_STAGE4_TIME_ANCHOR'
    || !same(proof.composition, {
      width: 1080, height: 1920, fpsNumerator: 30, fpsDenominator: 1,
      generatedFrames: 180, nativeFrames: 165, totalFrames: 345,
    })) diagnostics.push('TIMING_COMPOSITION_CONTRACT_INVALID');
  const input = proof.inputVideo;
  if (input.islandCodec !== 'h264' || input.islandFrameRate !== '30/1'
    || input.islandFrameCount !== 180 || input.islandAudioStreams !== 0
    || input.nativeCodec !== 'h264' || input.nativeFrameRate !== '30/1'
    || input.nativeFrameCount < 345 || input.nativeAudioStreams !== 0) diagnostics.push('TIMING_INPUT_VIDEO_INVALID');
  const output = proof.outputVideo;
  if (output.codec !== 'h264' || output.width !== 1080 || output.height !== 1920
    || output.averageFrameRate !== '30/1' || output.decodedFrameCount !== 345
    || Math.abs(output.durationSeconds - 11.5) > 0.04 || output.audioStreamCount !== 0) {
    diagnostics.push('TIMING_OUTPUT_VIDEO_INVALID');
  }
  const frames = proof.decodedFrameEvidence;
  if (frames.generatedSegmentNormalizedDifference > 0.005) diagnostics.push('BOUNDARY_GENERATED_SEGMENT_NOT_PRESERVED');
  if (frames.generatedExitToNativeSourceNormalizedDifference > 0.015) diagnostics.push('BOUNDARY_GENERATED_EXIT_MISMATCH');
  if (frames.nativeEntryToSourceNormalizedDifference > 0.008) diagnostics.push('BOUNDARY_NATIVE_ENTRY_MISMATCH');
  if (frames.nativeFinalToSourceNormalizedDifference > 0.008) diagnostics.push('BOUNDARY_NATIVE_FINAL_MISMATCH');
  if (frames.outputBoundaryNormalizedDifference > 0.02) diagnostics.push('BOUNDARY_VISIBLE_HANDOFF_DISCONTINUITY');
}

function validateIsolation(evidence: Dev02HybridStage6ExecutionEvidenceV2, diagnostics: string[]): void {
  const receipt = evidence.receipt;
  if (!same(receipt.projectBinding, {
    projectId: 'oe-dev-02', expectedProjectRevision: 'R3', observedProjectRevision: 'NOT_READ', changedProjectPaths: [],
  }) || receipt.stateEffects.length || receipt.fullProjectExecutionEligibility !== 'NOT_EXECUTABLE'
    || receipt.inputs.nativeContinuation.changedProxyPaths.length
    || receipt.inputs.nativeContinuation.appliedStateEffects.length
    || receipt.proof.projectMutation !== 'NONE'
    || !same(receipt.renderProof.externalCalls, {
      providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0,
    })) diagnostics.push('ISOLATION_PROJECT_OR_EXTERNAL_EFFECT_CLAIM');
  if (receipt.proof.generatedIslandHardGates !== 'PASS' || receipt.proof.hybridTiming !== 'PASS'
    || receipt.proof.boundaryContinuity !== 'PASS' || receipt.proof.nativeContinuation !== 'PASS'
    || receipt.proof.creativeTaste !== 'UNVERIFIABLE' || receipt.proof.flashSafety !== 'UNVERIFIABLE') {
    diagnostics.push('ISOLATION_PROOF_DISPOSITION_DRIFT');
  }
}

function emptyEvaluation(): Readonly<Dev02HybridStage6EvaluationV2> {
  return Object.freeze({
    assessment: 'UNVERIFIABLE', authorization: 'UNVERIFIABLE', sourceIdentity: 'UNVERIFIABLE',
    artifactIntegrity: 'UNVERIFIABLE', upstreamBinding: 'UNVERIFIABLE', hybridTiming: 'UNVERIFIABLE',
    boundaryContinuity: 'UNVERIFIABLE', nativeContinuation: 'UNVERIFIABLE',
    projectIsolation: 'UNVERIFIABLE', diagnostics: ['NO_STAGE6_EVIDENCE'],
  });
}
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function dimension(diagnostics: string[], pattern: RegExp): Dimension { return diagnostics.some((item) => pattern.test(item)) ? 'FAIL' : 'PASS'; }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
