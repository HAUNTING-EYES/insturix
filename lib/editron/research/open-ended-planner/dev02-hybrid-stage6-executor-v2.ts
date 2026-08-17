import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import { evaluateDev02HybridStage4GraphV2 } from './dev02-hybrid-stage4-evaluator-v2';
import {
  bindVerifiedDev02HybridIslandV2,
  type Dev02HybridIslandUpstreamEvidenceV2,
} from './dev02-hybrid-island-binding-v2';
import {
  DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2,
  DEV02_HYBRID_STAGE6_VERSION_V2,
  type Dev02HybridIslandBindingV2,
  type Dev02HybridNativeContinuationReceiptV2,
  type Dev02HybridNativeSourceBindingV2,
  type Dev02HybridStage6ArtifactBindingV2,
  type Dev02HybridStage6ExecutionEvidenceV2,
  type Dev02HybridStage6ReceiptV2,
  type Dev02HybridStage6RendererV2,
} from './dev02-hybrid-stage6-contract-v2';
import { evaluateDev02HybridStage6V2 } from './dev02-hybrid-stage6-evaluator-v2';
import { renderDev02HybridStage6ProxyV2 } from './dev02-hybrid-stage6-renderer-v2';
import { decideStage5ProceedOrStopV2 } from './stage5-proceed-stop-gate-v2';

const DEV02_CLOSE_SHA256 = '645d5ecbf7cec49f837768cee0fa2469c9fec79f54f4928160920c3a1a22782a';

export async function executeDev02HybridStage6V2(input: {
  graph: unknown;
  executionId: string;
  createdAt: string;
  outputDir: string;
  islandUpstream: Dev02HybridIslandUpstreamEvidenceV2;
  nativeSource: Dev02HybridNativeSourceBindingV2;
  renderer?: Dev02HybridStage6RendererV2;
}): Promise<Dev02HybridStage6ExecutionEvidenceV2> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  const stage4 = evaluateDev02HybridStage4GraphV2(input.graph);
  if (stage4.assessment !== 'PASS') throw new Error(`DEV02_HYBRID_STAGE6_STAGE4_BLOCKED:${stage4.diagnostics.join('|')}`);
  const stage5 = decideStage5ProceedOrStopV2(input.graph);
  if (stage5.disposition !== 'PROCEED'
    || stage5.executionAuthorization?.scope !== 'BOUNDED_RESEARCH_PROXY_PREVIEW_ONLY'
    || stage5.executionAuthorization.projectMutation !== 'DENY'
    || stage5.executionAuthorization.fullProjectExecution !== 'DENY') {
    throw new Error(`DEV02_HYBRID_STAGE6_STAGE5_BLOCKED:${stage5.disposition}:${stage5.reasonCode}`);
  }
  const island = await bindVerifiedDev02HybridIslandV2(input.islandUpstream);
  validateInputBindings(input.graph, island, input.nativeSource);
  const nativeContinuation = executeNativeContinuationInIsolatedProxy(input.graph, input.nativeSource);

  await mkdir(input.outputDir, { recursive: true });
  const rendered = await (input.renderer ?? renderDev02HybridStage6ProxyV2)({
    island,
    nativeSource: nativeContinuation.effectiveNativeSource,
    outputDir: input.outputDir,
  });
  const artifacts = await bindArtifacts(rendered.artifactPaths);
  const unsigned = {
    schemaVersion: DEV02_HYBRID_STAGE6_VERSION_V2,
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION' as const,
    taskId: 'DEV-02' as const,
    executionId: input.executionId,
    createdAt: input.createdAt,
    stage4GraphHash: hashCanonicalJsonV1(input.graph),
    stage5DecisionHash: hashCanonicalJsonV1(stage5),
    projectBinding: {
      projectId: 'oe-dev-02' as const,
      expectedProjectRevision: 'R3' as const,
      observedProjectRevision: 'NOT_READ' as const,
      changedProjectPaths: [] as const,
    },
    inputs: {
      island: withoutPath(island),
      nativeSource: withoutPath(nativeContinuation.effectiveNativeSource),
      nativeContinuation: nativeContinuation.receipt,
    },
    operations: [
      { nodeId: 'compile-preview-generated-island' as const, owner: 'executeGeneratedCompositionInSandboxV1' as const },
      { nodeId: 'compile-resolve-native-continuation' as const, owner: nativeContinuation.receipt.operatorId },
      { nodeId: 'compile-prove-dev02-hybrid-proxy' as const, owner: 'renderDev02HybridStage6ProxyV2' as const },
    ] as const,
    artifacts,
    renderProof: rendered.proof,
    proof: {
      generatedIslandHardGates: 'PASS' as const,
      hybridTiming: 'PASS' as const,
      boundaryContinuity: 'PASS' as const,
      nativeContinuation: 'PASS' as const,
      creativeTaste: 'UNVERIFIABLE' as const,
      flashSafety: 'UNVERIFIABLE' as const,
      projectMutation: 'NONE' as const,
    },
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE' as const,
    stateEffects: [] as const,
  };
  const receipt: Dev02HybridStage6ReceiptV2 = {
    ...unsigned,
    receiptHash: hashCanonicalJsonV1(unsigned),
  };
  const evidence: Dev02HybridStage6ExecutionEvidenceV2 = {
    sourcePaths: { island: island.videoPath, nativeSource: input.nativeSource.videoPath },
    receipt,
    receiptPath: path.join(input.outputDir, 'dev02-hybrid-stage6-receipt-v2.json'),
  };
  const evaluation = await evaluateDev02HybridStage6V2({ graph: input.graph, evidence });
  if (evaluation.assessment !== 'PASS') throw new Error(`DEV02_HYBRID_STAGE6_PROOF_FAILED:${evaluation.diagnostics.join('|')}`);
  await writeFile(evidence.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return evidence;
}

function executeNativeContinuationInIsolatedProxy(
  graph: unknown,
  nativeSource: Dev02HybridNativeSourceBindingV2,
): {
  receipt: Dev02HybridNativeContinuationReceiptV2;
  effectiveNativeSource: Dev02HybridNativeSourceBindingV2;
} {
  const graphRecord = record(graph);
  const node = records(graphRecord.nodes)
    .find(({ nodeId }) => nodeId === 'compile-resolve-native-continuation');
  if (!node) throw new Error('DEV02_HYBRID_STAGE6_CONTINUATION_NODE_MISSING');
  const inputs = record(node.inputs);
  const operatorId: Dev02HybridNativeContinuationReceiptV2['operatorId'] =
    node.operatorId === 'resolve_user_asset_overlay'
      ? 'resolve_user_asset_overlay'
      : node.operatorId === 'move_retime_overlay'
        ? 'move_retime_overlay'
        : fail('DEV02_HYBRID_STAGE6_CONTINUATION_OPERATOR_UNSUPPORTED');
  if ((operatorId === 'resolve_user_asset_overlay' && node.mutationScope !== 'NONE')
    || (operatorId === 'move_retime_overlay' && node.mutationScope !== 'ISOLATED_PROXY_CLONE')
    || (operatorId === 'resolve_user_asset_overlay' && inputs.assetId !== nativeSource.assetId)
    || (operatorId === 'move_retime_overlay' && inputs.overlayId !== 'ov-next')) {
    throw new Error('DEV02_HYBRID_STAGE6_CONTINUATION_SCOPE_OR_TARGET_INVALID');
  }
  const targetRange = record(inputs.targetRange);
  const sourceRange = record(inputs.sourceRange);
  if (integerString(sourceRange.start, 'SOURCE_START') !== 180
    || integerString(sourceRange.endExclusive, 'SOURCE_END') !== 345
    || integerString(targetRange.start, 'PROJECT_START') !== 180
    || integerString(targetRange.endExclusive, 'PROJECT_END') !== 345) {
    throw new Error('DEV02_HYBRID_STAGE6_NON_IDEMPOTENT_PROXY_MUTATION_NOT_AUTHORIZED');
  }
  const before = continuationRangeBinding(nativeSource);
  const after: Dev02HybridNativeContinuationReceiptV2['after'] = {
    assetId: nativeSource.assetId,
    sourceStartFrame: 180,
    sourceEndExclusiveFrame: 345,
    projectStartFrame: 180,
    projectEndExclusiveFrame: 345,
  };
  if (hashCanonicalJsonV1(before) !== hashCanonicalJsonV1(after)) {
    throw new Error('DEV02_HYBRID_STAGE6_NON_IDEMPOTENT_PROXY_MUTATION_NOT_AUTHORIZED');
  }
  const unsigned = {
    nodeId: 'compile-resolve-native-continuation' as const,
    operatorId,
    ownerRef: typeof node.ownerRef === 'string' ? node.ownerRef : '',
    scope: operatorId === 'move_retime_overlay' ? 'ISOLATED_PROXY_CLONE' as const : 'READ_ONLY' as const,
    overlayId: 'ov-next' as const,
    before,
    after,
    changedProxyPaths: [] as const,
    appliedStateEffects: [] as const,
    disposition: operatorId === 'move_retime_overlay'
      ? 'APPLIED_IDEMPOTENT' as const : 'RESOLVED_EXISTING_BINDING' as const,
    sourceGraphNodeHash: hashCanonicalJsonV1(node),
  };
  return {
    receipt: { ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) },
    effectiveNativeSource: nativeSource,
  };
}

function continuationRangeBinding(
  value: Dev02HybridNativeSourceBindingV2,
): Dev02HybridNativeContinuationReceiptV2['before'] {
  return {
    assetId: value.assetId,
    sourceStartFrame: value.sourceStartFrame,
    sourceEndExclusiveFrame: value.sourceEndExclusiveFrame,
    projectStartFrame: value.projectStartFrame,
    projectEndExclusiveFrame: value.projectEndExclusiveFrame,
  };
}

function integerString(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`DEV02_HYBRID_STAGE6_${label}_INVALID`);
  }
  return Number(value);
}
function fail(message: string): never { throw new Error(message); }

function validateInputBindings(
  graph: unknown,
  island: Dev02HybridIslandBindingV2,
  native: Dev02HybridNativeSourceBindingV2,
): void {
  for (const [label, value] of Object.entries({
    program: island.programHash,
    sourceStage4Graph: island.sourceStage4GraphHash,
    upstreamStage6Receipt: island.upstreamStage6ReceiptHash,
    hostReceipt: island.hostReceiptHash,
    proxyReceipt: island.proxyReceiptHash,
    localEvidence: island.localEvidenceHash,
    renderedProof: island.renderedProofHash,
    islandVideo: island.videoSha256,
    nativeVideo: native.videoSha256,
  })) if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`DEV02_HYBRID_STAGE6_${label.toUpperCase()}_HASH_INVALID`);
  if (island.hardGateDisposition !== 'PASS') throw new Error('DEV02_HYBRID_STAGE6_ISLAND_HARD_GATES_NOT_PASS');
  const graphRecord = record(graph);
  const islandNode = records(graphRecord.nodes).find(({ nodeId }) => nodeId === 'compile-preview-generated-island');
  const islandInputs = record(islandNode?.inputs);
  if (graphRecord.sourceIslandGraphHash !== island.sourceStage4GraphHash
    || islandInputs.programHash !== island.programHash) {
    throw new Error('DEV02_HYBRID_STAGE6_UPSTREAM_GRAPH_BINDING_INVALID');
  }
  if (native.assetId !== 'dev02-close' || native.videoSha256 !== DEV02_CLOSE_SHA256
    || native.assetVersion !== `sha256:${DEV02_CLOSE_SHA256}`
    || native.sourceStartFrame !== 180 || native.sourceEndExclusiveFrame !== 345
    || native.projectStartFrame !== 180 || native.projectEndExclusiveFrame !== 345) {
    throw new Error('DEV02_HYBRID_STAGE6_NATIVE_BINDING_INVALID');
  }
}

async function bindArtifacts(paths: Readonly<Record<string, string>>): Promise<Dev02HybridStage6ArtifactBindingV2[]> {
  if (!sameSet(Object.keys(paths), [...DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2])) throw new Error('DEV02_HYBRID_STAGE6_ARTIFACT_SET_INVALID');
  return Promise.all(DEV02_HYBRID_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
    const bytes = await readFile(paths[artifactId]);
    if (!bytes.length) throw new Error(`DEV02_HYBRID_STAGE6_ARTIFACT_EMPTY:${artifactId}`);
    return { artifactId, path: paths[artifactId], sha256: sha256(bytes), byteLength: bytes.length };
  }));
}

function withoutPath<T extends { videoPath: string }>(value: T): Omit<T, 'videoPath'> {
  const { videoPath: _videoPath, ...rest } = value;
  return rest;
}
function validateExecutionIdentity(executionId: string, createdAt: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(executionId)) throw new Error('DEV02_HYBRID_STAGE6_EXECUTION_ID_INVALID');
  if (new Date(createdAt).toISOString() !== createdAt) throw new Error('DEV02_HYBRID_STAGE6_CREATED_AT_INVALID');
}
function sameSet(left: string[], right: string[]): boolean { return left.length === right.length && right.every((entry) => left.includes(entry)); }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
