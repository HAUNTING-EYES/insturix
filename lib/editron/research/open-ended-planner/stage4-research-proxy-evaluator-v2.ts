import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  readDev02Stage4RoleSymbolsFromBlockedGraphV2,
  type Dev02Stage4RoleSymbolsV2,
} from './dev02-stage4-role-resolver-v2';
import { assertDev02GeneratedCompositionResearchProxyCapabilityV1 } from './generated-composition-research-proxy-capability-v1';
import { verifyGeneratedCompositionProgramV1 } from './generated-composition-program-verifier-v1';
import {
  evaluateStage4CompiledGraphArtifactV2,
  type Stage4CompilationSourceV2,
} from './stage4-compilation-evaluator-v2';
import { compileCanonicalStage4DeterministicBaselineV2 } from './stage4-deterministic-compiler-v2';
import { STAGE4_RESEARCH_PROXY_COMPILER_VERSION_V2 } from './stage4-research-proxy-compiler-v2';

type JsonRecord = Record<string, unknown>;
type DimensionV2 = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface Stage4ResearchProxyEvaluationV2 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  sourceBlockedGraph: DimensionV2;
  capabilityPromotion: DimensionV2;
  programContract: DimensionV2;
  previewNode: DimensionV2;
  dependencyGraph: DimensionV2;
  policyIsolation: DimensionV2;
  fullProjectHonesty: DimensionV2;
  diagnostics: readonly string[];
}

export interface Stage4ResearchProxyEvaluationSourceV2 {
  sourceBlockedGraph: unknown;
  sourceCompilationSource: Stage4CompilationSourceV2;
}

export function evaluateStage4ResearchProxyPreviewV2(
  value: unknown,
  source?: Stage4ResearchProxyEvaluationSourceV2,
): Readonly<Stage4ResearchProxyEvaluationV2> {
  const graph = record(value);
  if (!Object.keys(graph).length) return emptyEvaluation();
  const diagnostics: string[] = [];
  const embeddedSourceGraph = record(graph.sourceBlockedGraph);
  const embeddedCompilationSource = isRecord(graph.sourceCompilationSource)
    ? graph.sourceCompilationSource as unknown as Stage4CompilationSourceV2
    : undefined;
  const sourceGraph = source
    ? record(source.sourceBlockedGraph)
    : Object.keys(embeddedSourceGraph).length
      ? embeddedSourceGraph
      : compileCanonicalStage4DeterministicBaselineV2();
  const compilationSource = source?.sourceCompilationSource ?? embeddedCompilationSource;
  const sourceEvaluation = evaluateStage4CompiledGraphArtifactV2(
    sourceGraph,
    compilationSource,
  );
  if (sourceEvaluation.disposition !== 'CAPABILITY_BLOCKED' || sourceEvaluation.diagnostics.length
    || graph.sourceBlockedGraphHash !== hashCanonicalJsonV1(sourceGraph)
    || hashCanonicalJsonV1(record(graph.sourceBlockedGraph)) !== graph.sourceBlockedGraphHash
    || (compilationSource
      ? graph.sourceCompilationSourceHash !== hashCanonicalJsonV1(compilationSource)
        || hashCanonicalJsonV1(record(graph.sourceCompilationSource)) !== graph.sourceCompilationSourceHash
      : graph.sourceCompilationSourceHash !== null || graph.sourceCompilationSource !== null)) {
    diagnostics.push('SOURCE_BLOCKED_GRAPH_DRIFT');
  }
  let roles: Readonly<Dev02Stage4RoleSymbolsV2> | undefined;
  try { roles = readDev02Stage4RoleSymbolsFromBlockedGraphV2(sourceGraph); }
  catch { diagnostics.push('SOURCE_BLOCKED_ROLE_SYMBOLS_INVALID'); }
  for (const field of [
    'taskId', 'sourceEditorialIntentHash', 'sourceEvidenceBoundIntentHash', 'evidencePackHash',
    'operatorCatalogVersion', 'projectId', 'expectedProjectRevision',
  ]) if (graph[field] !== sourceGraph[field]) diagnostics.push(`SOURCE_BLOCKED_${field.toUpperCase()}_DRIFT`);

  try { assertDev02GeneratedCompositionResearchProxyCapabilityV1(graph.capabilityPromotion); }
  catch { diagnostics.push('CAPABILITY_PROMOTION_INVALID'); }
  const capability = record(graph.capabilityPromotion);
  const bundle = record(graph.previewInputBundle);
  const programVerification = verifyGeneratedCompositionProgramV1({
    program: bundle.program as never,
    sourceBundle: bundle.sourceBundle as never,
    evidencePack: bundle.evidencePack,
    referenceBlueprint: bundle.referenceBlueprint,
    supplementalFacts: bundle.supplementalFacts,
  });
  if (programVerification.disposition !== 'CONTRACT_PASS' || !programVerification.programHash
    || !programVerification.sourceBundleHash) {
    diagnostics.push(...programVerification.diagnostics.map((entry) => `PROGRAM_CONTRACT_${entry}`));
    if (!programVerification.diagnostics.length) diagnostics.push('PROGRAM_CONTRACT_UNVERIFIABLE');
  }

  const nodes = records(graph.nodes);
  const sourceNodes = records(sourceGraph.nodes);
  const previewNodes = nodes.filter((node) => node.intentNodeId === roles?.generatedIslandIntentNodeId);
  if (nodes.length !== sourceNodes.length + 1 || previewNodes.length !== 1) diagnostics.push('PREVIEW_NODE_SET_INVALID');
  if (hashCanonicalJsonV1(nodes.slice(0, sourceNodes.length)) !== hashCanonicalJsonV1(sourceNodes)) {
    diagnostics.push('PREVIEW_SOURCE_NODE_DRIFT');
  }
  const previewNode = previewNodes[0] ?? {};
  const inputs = record(previewNode.inputs);
  if (previewNode.operatorId !== capability.operatorId || previewNode.ownerRef !== capability.ownerRef
    || previewNode.executionAuthority !== capability.authority) diagnostics.push('PREVIEW_NODE_OWNER_OR_AUTHORITY_DRIFT');
  if (inputs.programHash !== programVerification.programHash || inputs.sourceBundleHash !== programVerification.sourceBundleHash
    || inputs.evidencePackHash !== hashCanonicalJsonV1(bundle.evidencePack)
    || inputs.referenceBlueprintHash !== hashCanonicalJsonV1(bundle.referenceBlueprint)
    || inputs.supplementalFactsHash !== hashCanonicalJsonV1(bundle.supplementalFacts)
    || inputs.capabilityHash !== capability.capabilityHash) diagnostics.push('PREVIEW_NODE_INPUT_BINDING_DRIFT');
  const resolveNodes = sourceNodes.filter((node) => node.operatorId === 'resolve_user_asset_overlay');
  const requiredRefs = unique(resolveNodes.flatMap((node) => strings(node.produces))).sort(compareUtf16);
  if (!sameArray(strings(previewNode.requires).sort(compareUtf16), requiredRefs)
    || !sameArray(strings(inputs.sourceProposalRefs).sort(compareUtf16), requiredRefs)) diagnostics.push('DEPENDENCY_REQUIRED_OUTPUT_DRIFT');
  validateEdges(records(graph.edges), records(sourceGraph.edges), resolveNodes, String(previewNode.nodeId ?? ''), diagnostics);

  const allStateEffects = [...strings(graph.stateEffects), ...strings(record(graph.previewScope).stateEffects),
    ...nodes.flatMap((node) => strings(node.stateEffects))];
  const allWrites = nodes.flatMap((node) => strings(node.writes));
  const allInvalidates = nodes.flatMap((node) => strings(node.invalidates));
  const sandboxPolicy = record(capability.sandboxPolicy);
  if (allStateEffects.length || allWrites.length || allInvalidates.length
    || record(graph.previewScope).projectMutation !== 'DENY'
    || sandboxPolicy.projectMutation !== 'DENY' || sandboxPolicy.network !== 'DENY_ALL'
    || sandboxPolicy.secrets !== 'NONE' || sandboxPolicy.database !== 'DENY' || sandboxPolicy.persistent !== false) {
    diagnostics.push('POLICY_ISOLATION_DRIFT');
  }
  if (graph.artifactType !== 'CompiledResearchProxyPreviewGraphV2'
    || graph.compilerVersion !== STAGE4_RESEARCH_PROXY_COMPILER_VERSION_V2
    || graph.compileDisposition !== 'COMPILED_RESEARCH_PROXY_PREVIEW'
    || graph.executionEligibility !== 'RESEARCH_PROXY_ONLY') diagnostics.push('PREVIEW_EXECUTION_DISPOSITION_DRIFT');
  if (graph.fullProjectExecutionEligibility !== 'NOT_EXECUTABLE'
    || !roles
    || !sameArray(strings(graph.previewEligibleIntentNodeIds), [roles.generatedIslandIntentNodeId])
    || !sameArray(strings(graph.unresolvedFullProjectIntentNodeIds), [
      roles.nativeContinuationIntentNodeId, roles.proofIntentNodeId,
    ])
    || !records(graph.diagnostics).some((entry) => entry.code === 'FULL_PROJECT_DEPENDENCY_BLOCKED')) {
    diagnostics.push('FULL_PROJECT_HONESTY_DRIFT');
  }
  const { graphHash: _graphHash, ...unsigned } = graph;
  if (graph.graphHash !== hashCanonicalJsonV1(unsigned)) diagnostics.push('GRAPH_HASH_INVALID');

  const sourceBlockedGraph = dimension(diagnostics, /^SOURCE_BLOCKED_/);
  const capabilityPromotion = dimension(diagnostics, /^CAPABILITY_PROMOTION_/);
  const programContract = dimension(diagnostics, /^PROGRAM_CONTRACT_/);
  const previewNodeDimension = dimension(diagnostics, /^PREVIEW_(NODE|SOURCE|EXECUTION)/);
  const dependencyGraph = dimension(diagnostics, /^DEPENDENCY_/);
  const policyIsolation = dimension(diagnostics, /^POLICY_ISOLATION_/);
  const fullProjectHonesty = dimension(diagnostics, /^(FULL_PROJECT_|GRAPH_HASH_)/);
  const dimensions = [sourceBlockedGraph, capabilityPromotion, programContract, previewNodeDimension,
    dependencyGraph, policyIsolation, fullProjectHonesty];
  return deepFreezeV1({
    disposition: dimensions.includes('FAIL') ? 'FAIL' : 'PASS',
    sourceBlockedGraph, capabilityPromotion, programContract, previewNode: previewNodeDimension,
    dependencyGraph, policyIsolation, fullProjectHonesty,
    diagnostics: unique(diagnostics).sort(compareUtf16),
  });
}

function validateEdges(
  edges: JsonRecord[], sourceEdges: JsonRecord[], resolveNodes: JsonRecord[], previewNodeId: string, diagnostics: string[],
): void {
  if (hashCanonicalJsonV1(edges.slice(0, sourceEdges.length)) !== hashCanonicalJsonV1(sourceEdges)) {
    diagnostics.push('DEPENDENCY_SOURCE_EDGE_DRIFT');
  }
  const previewEdges = edges.slice(sourceEdges.length);
  if (previewEdges.length !== resolveNodes.length || resolveNodes.some((node) => !previewEdges.some((edge) =>
    edge.fromNodeId === node.nodeId && edge.toNodeId === previewNodeId && edge.edgeType === 'DATA'))) {
    diagnostics.push('DEPENDENCY_PREVIEW_EDGE_DRIFT');
  }
}

function emptyEvaluation(): Readonly<Stage4ResearchProxyEvaluationV2> {
  return deepFreezeV1({
    disposition: 'UNVERIFIABLE', sourceBlockedGraph: 'UNVERIFIABLE', capabilityPromotion: 'UNVERIFIABLE',
    programContract: 'UNVERIFIABLE', previewNode: 'UNVERIFIABLE', dependencyGraph: 'UNVERIFIABLE',
    policyIsolation: 'UNVERIFIABLE', fullProjectHonesty: 'UNVERIFIABLE', diagnostics: ['NO_ACCEPTED_ARTIFACT'],
  });
}
function dimension(diagnostics: string[], pattern: RegExp): DimensionV2 { return diagnostics.some((entry) => pattern.test(entry)) ? 'FAIL' : 'PASS'; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function sameArray(left: string[], right: string[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
