import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEV02_HYBRID_STAGE4_COMPILER_VERSION_V2 } from './dev02-hybrid-stage4-compiler-v2';
import { resolveDev02RenderedProofClaimBindingsV1 } from './dev02-rendered-proof-claim-policy-v1';
import {
  readDev02Stage4RoleSymbolsFromBlockedGraphV2,
  type Dev02Stage4RoleSymbolsV2,
} from './dev02-stage4-role-resolver-v2';
import {
  evaluateStage4ResearchProxyPreviewV2,
  type Stage4ResearchProxyEvaluationSourceV2,
} from './stage4-research-proxy-evaluator-v2';
import { compileCanonicalStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-compiler-v2';
import { compileCanonicalStage4DeterministicBaselineV2 } from './stage4-deterministic-compiler-v2';

type JsonRecord = Record<string, unknown>;
type Dimension = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Dev02HybridStage4EvaluationV2 {
  assessment: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  generatedIslandGraph: Dimension;
  nativeContinuation: Dimension;
  fullHybridProof: Dimension;
  dependencyGraph: Dimension;
  projectIsolation: Dimension;
  artifactIntegrity: Dimension;
  diagnostics: readonly string[];
}

export interface Dev02HybridStage4EvaluationSourceV2 {
  islandGraph: unknown;
  islandEvaluationSource: Stage4ResearchProxyEvaluationSourceV2;
}

export function evaluateDev02HybridStage4GraphV2(
  value: unknown,
  source?: Readonly<Dev02HybridStage4EvaluationSourceV2>,
): Readonly<Dev02HybridStage4EvaluationV2> {
  const graph = record(value);
  if (!Object.keys(graph).length) return emptyEvaluation();
  const diagnostics: string[] = [];
  const embeddedIslandGraph = record(graph.sourceIslandGraph);
  const embeddedIslandEvaluationSource = isRecord(graph.sourceIslandEvaluationSource)
    ? graph.sourceIslandEvaluationSource as unknown as Stage4ResearchProxyEvaluationSourceV2
    : undefined;
  const islandGraph = source
    ? record(source.islandGraph)
    : Object.keys(embeddedIslandGraph).length
      ? embeddedIslandGraph
      : compileCanonicalStage4ResearchProxyPreviewV2();
  const islandEvaluationSource = source?.islandEvaluationSource ?? embeddedIslandEvaluationSource;
  const islandEvaluation = evaluateStage4ResearchProxyPreviewV2(
    islandGraph,
    islandEvaluationSource,
  );
  const blockedGraph = islandEvaluationSource
    ? islandEvaluationSource.sourceBlockedGraph
    : compileCanonicalStage4DeterministicBaselineV2();
  let roles: Readonly<Dev02Stage4RoleSymbolsV2> | undefined;
  try { roles = readDev02Stage4RoleSymbolsFromBlockedGraphV2(blockedGraph); }
  catch { diagnostics.push('ARTIFACT_INTEGRITY_ROLE_SYMBOLS_INVALID'); }
  const islandNodes = records(islandGraph.nodes);
  const islandEdges = records(islandGraph.edges);
  const nodes = records(graph.nodes);
  const edges = records(graph.edges);

  validateRenderedProofClaimBindings(islandGraph, diagnostics);

  if (islandEvaluation.disposition !== 'PASS'
    || graph.sourceIslandGraphHash !== hashCanonicalJsonV1(islandGraph)
    || hashCanonicalJsonV1(record(graph.sourceIslandGraph)) !== graph.sourceIslandGraphHash
    || hashCanonicalJsonV1(record(graph.sourceIslandGraph)) !== hashCanonicalJsonV1(islandGraph)
    || (islandEvaluationSource
      ? graph.sourceIslandEvaluationSourceHash !== hashCanonicalJsonV1(islandEvaluationSource)
        || hashCanonicalJsonV1(record(graph.sourceIslandEvaluationSource))
          !== graph.sourceIslandEvaluationSourceHash
      : graph.sourceIslandEvaluationSourceHash !== null || graph.sourceIslandEvaluationSource !== null)
    || hashCanonicalJsonV1(nodes.slice(0, islandNodes.length)) !== hashCanonicalJsonV1(islandNodes)
    || hashCanonicalJsonV1(edges.slice(0, islandEdges.length)) !== hashCanonicalJsonV1(islandEdges)
    || graph.sourceEditorialIntentHash !== islandGraph.sourceEditorialIntentHash
    || graph.sourceEvidenceBoundIntentHash !== islandGraph.sourceEvidenceBoundIntentHash
    || graph.evidencePackHash !== islandGraph.evidencePackHash) {
    diagnostics.push('GENERATED_ISLAND_GRAPH_DRIFT');
  }

  const continuation = nodes.find((node) => node.nodeId === 'compile-resolve-native-continuation');
  const proof = nodes.find((node) => node.nodeId === 'compile-prove-dev02-hybrid-proxy');
  validateContinuation(continuation, graph, roles?.nativeContinuationIntentNodeId, diagnostics);
  validateProof(proof, continuation, graph, roles?.proofIntentNodeId, diagnostics);
  validateEdges(edges.slice(islandEdges.length), continuation, proof, diagnostics);

  const nonContinuationNodes = nodes.filter((node) => node !== continuation);
  const projectWrites = nonContinuationNodes.flatMap((node) => strings(node.writes));
  const projectInvalidates = nonContinuationNodes.flatMap((node) => strings(node.invalidates));
  const projectStateEffects = [
    ...strings(graph.stateEffects),
    ...strings(record(graph.hybridScope).stateEffects),
    ...nonContinuationNodes.flatMap((node) => strings(node.stateEffects)),
  ];
  if (projectWrites.length || projectInvalidates.length || projectStateEffects.length
    || !hasValidContinuationIsolation(continuation)
    || record(graph.hybridScope).projectMutation !== 'DENY'
    || graph.productionProjectExecutionEligibility !== 'NOT_EXECUTABLE') {
    diagnostics.push('PROJECT_ISOLATION_POLICY_DRIFT');
  }

  if (graph.artifactType !== 'CompiledDev02HybridResearchGraphV2'
    || graph.compilerVersion !== DEV02_HYBRID_STAGE4_COMPILER_VERSION_V2
    || graph.compileDisposition !== 'COMPILED_FULL_HYBRID_RESEARCH_PROXY'
    || graph.executionEligibility !== 'RESEARCH_PROXY_ONLY'
    || nodes.length !== islandNodes.length + 2
    || edges.length !== islandEdges.length + 4
    || !roles
    || !sameSet(strings(graph.compiledIntentNodeIds), Object.values(roles))
    || strings(graph.unresolvedResearchIntentNodeIds).length
    || !sameSet(strings(graph.unresolvedProductionRequirements), [
      'PROJECTSERVICE_INSERT_UPDATE_COMMAND_NOT_EXERCISED',
      'LEGACY_EDITOR_RENDERER_NOT_WIRED_TO_CANONICAL_NESTED_COMPOSITION',
      'CREATIVE_EASING_REMAINS_UNVERIFIABLE',
    ])) {
    diagnostics.push('ARTIFACT_INTEGRITY_DISPOSITION_DRIFT');
  }
  const scope = record(graph.hybridScope);
  if (scope.executionForm !== 'HYBRID'
    || !sameRange(record(scope.generatedIslandRange), '0', '180')
    || !sameRange(record(scope.nativeContinuationRange), '180', '345')
    || !sameRange(record(scope.fullProxyRange), '0', '345')) {
    diagnostics.push('ARTIFACT_INTEGRITY_HYBRID_SCOPE_DRIFT');
  }
  const { graphHash: _graphHash, ...unsigned } = graph;
  if (graph.graphHash !== hashCanonicalJsonV1(unsigned)) diagnostics.push('ARTIFACT_INTEGRITY_HASH_INVALID');

  const generatedIslandGraph = dimension(diagnostics, /^GENERATED_ISLAND_/);
  const nativeContinuation = dimension(diagnostics, /^NATIVE_CONTINUATION_/);
  const fullHybridProof = dimension(diagnostics, /^FULL_HYBRID_PROOF_/);
  const dependencyGraph = dimension(diagnostics, /^DEPENDENCY_GRAPH_/);
  const projectIsolation = dimension(diagnostics, /^PROJECT_ISOLATION_/);
  const artifactIntegrity = dimension(diagnostics, /^ARTIFACT_INTEGRITY_/);
  const dimensions = [generatedIslandGraph, nativeContinuation, fullHybridProof, dependencyGraph, projectIsolation, artifactIntegrity];
  return deepFreezeV1({
    assessment: dimensions.includes('FAIL') ? 'FAIL' : 'PASS',
    generatedIslandGraph,
    nativeContinuation,
    fullHybridProof,
    dependencyGraph,
    projectIsolation,
    artifactIntegrity,
    diagnostics: unique(diagnostics).sort(compareUtf16),
  });
}

function validateRenderedProofClaimBindings(
  islandGraph: JsonRecord,
  diagnostics: string[],
): void {
  const previewInputBundle = record(islandGraph.previewInputBundle);
  const program = record(previewInputBundle.program);
  try {
    resolveDev02RenderedProofClaimBindingsV1({
      expectedMeasurementRefs: strings(program.expectedMeasurementRefs),
      referenceBlueprint: previewInputBundle.referenceBlueprint,
    });
  } catch (error) {
    diagnostics.push(`GENERATED_ISLAND_PROOF_CLAIMS_UNBINDABLE:${errorMessage(error)}`);
  }
}

function validateContinuation(
  node: JsonRecord | undefined,
  graph: JsonRecord,
  intentNodeId: string | undefined,
  diagnostics: string[],
): void {
  if (!node) { diagnostics.push('NATIVE_CONTINUATION_NODE_MISSING'); return; }
  const inputs = record(node.inputs);
  const targetRange = record(inputs.targetRange);
  const sourceRange = record(inputs.sourceRange);
  const resolver = node.operatorId === 'resolve_user_asset_overlay';
  const isolatedMove = node.operatorId === 'move_retime_overlay';
  if (!intentNodeId || node.intentNodeId !== intentNodeId
    || (!resolver && !isolatedMove)
    || node.ownerRef !== operatorOwner(text(node.operatorId))
    || inputs.projectId !== graph.projectId
    || inputs.expectedProjectRevision !== graph.expectedProjectRevision
    || (resolver && inputs.assetId !== 'dev02-close')
    || (isolatedMove && (inputs.overlayId !== 'ov-next' || node.mutationScope !== 'ISOLATED_PROXY_CLONE'))
    || !sameRange(targetRange, '180', '345')
    || !sameRange(sourceRange, '180', '345')
    || targetRange.coordinateDomain !== 'PROJECT_TICK'
    || sourceRange.coordinateDomain !== 'SOURCE_FRAME') {
    diagnostics.push('NATIVE_CONTINUATION_BINDING_DRIFT');
  }
  const expectedProduces = isolatedMove
    ? ['compile-resolve-native-continuation.receipt']
    : ['compile-resolve-native-continuation.proposedOperation', 'compile-resolve-native-continuation.evidence'];
  if (!sameSet(strings(node.reads), [
    'fact-exit-continuity', 'fact-project-timebase', 'fact-project-revision',
    'fact-source-dev02-close', 'fact-source-windows', 'fact-rights-policy',
  ])
    || !sameSet(strings(node.requires), [
      'compile-resolve-dev02-close.evidence',
      'compile-preview-generated-island.renderedProxy',
      'compile-preview-generated-island.renderedProof',
    ])
    || !sameSet(strings(node.produces), expectedProduces)
    || !sameSet(strings(node.proofObligationIds), [
      'proof-source-ranges', 'proof-boundary-continuity', 'proof-state-reload',
    ])) {
    diagnostics.push('NATIVE_CONTINUATION_CONTRACT_DRIFT');
  }
}

function validateProof(
  node: JsonRecord | undefined,
  continuation: JsonRecord | undefined,
  graph: JsonRecord,
  intentNodeId: string | undefined,
  diagnostics: string[],
): void {
  if (!node) { diagnostics.push('FULL_HYBRID_PROOF_NODE_MISSING'); return; }
  const inputs = record(node.inputs);
  if (!intentNodeId || node.intentNodeId !== intentNodeId
    || node.operatorId !== 'get_timeline_view'
    || node.ownerRef !== operatorOwner('get_timeline_view')
    || inputs.projectId !== graph.projectId
    || inputs.expectedProjectRevision !== graph.expectedProjectRevision
    || inputs.proofMode !== 'FULL_HYBRID_PROXY_RENDER_AND_BOUNDARY'
    || !sameRange(record(inputs.targetRange), '0', '345')
    || !sameSet(strings(node.requires), [
      'compile-preview-generated-island.renderedProxy',
      'compile-preview-generated-island.renderedProof',
      ...strings(continuation?.produces),
    ])) {
    diagnostics.push('FULL_HYBRID_PROOF_BINDING_DRIFT');
  }
}

function hasValidContinuationIsolation(node: JsonRecord | undefined): boolean {
  if (!node) return false;
  if (node.operatorId === 'resolve_user_asset_overlay') {
    return node.mutationScope === 'NONE'
      && strings(node.writes).length === 0
      && strings(node.invalidates).length === 0
      && strings(node.stateEffects).length === 0;
  }
  return node.operatorId === 'move_retime_overlay'
    && node.mutationScope === 'ISOLATED_PROXY_CLONE'
    && sameSet(strings(node.writes), [
      'isolatedProxy.timeline.overlay:ov-next.targetRange',
      'isolatedProxy.timeline.overlay:ov-next.sourceRange',
    ])
    && sameSet(strings(node.invalidates), [
      'isolatedProxy.proof.boundary-continuity',
      'isolatedProxy.proof.state-reload',
    ])
    && sameSet(strings(node.stateEffects), ['isolated proxy timeline and optional source range']);
}

function validateEdges(
  edges: JsonRecord[], continuation: JsonRecord | undefined, proof: JsonRecord | undefined, diagnostics: string[],
): void {
  const continuationId = text(continuation?.nodeId);
  const proofId = text(proof?.nodeId);
  const expected = [
    ['compile-resolve-dev02-close', continuationId, 'DATA'],
    ['compile-preview-generated-island', continuationId, 'TIME_ANCHOR'],
    ['compile-preview-generated-island', proofId, 'PROOF'],
    [continuationId, proofId, 'PROOF'],
  ];
  if (edges.length !== expected.length || expected.some(([from, to, kind]) => !edges.some((edge) =>
    edge.fromNodeId === from && edge.toNodeId === to && edge.edgeType === kind))) {
    diagnostics.push('DEPENDENCY_GRAPH_EDGE_DRIFT');
  }
}

function operatorOwner(operatorId: string): string {
  return text(records(record(operatorCatalogJson).operators).find((operator) => operator.operatorId === operatorId)?.ownerRef);
}
function emptyEvaluation(): Readonly<Dev02HybridStage4EvaluationV2> {
  return deepFreezeV1({
    assessment: 'UNVERIFIABLE', generatedIslandGraph: 'UNVERIFIABLE', nativeContinuation: 'UNVERIFIABLE',
    fullHybridProof: 'UNVERIFIABLE', dependencyGraph: 'UNVERIFIABLE', projectIsolation: 'UNVERIFIABLE',
    artifactIntegrity: 'UNVERIFIABLE', diagnostics: ['NO_ACCEPTED_ARTIFACT'],
  });
}
function sameRange(value: JsonRecord, start: string, endExclusive: string): boolean {
  return value.start === start && value.endExclusive === endExclusive;
}
function sameSet(left: string[], right: string[]): boolean {
  const a = unique(left).sort(compareUtf16); const b = unique(right).sort(compareUtf16);
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}
function dimension(diagnostics: string[], pattern: RegExp): Dimension { return diagnostics.some((entry) => pattern.test(entry)) ? 'FAIL' : 'PASS'; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function errorMessage(value: unknown): string { return value instanceof Error ? value.message : String(value); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
