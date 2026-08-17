import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { cloneCanonicalJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { readDev02Stage4RoleSymbolsFromBlockedGraphV2 } from './dev02-stage4-role-resolver-v2';
import {
  evaluateStage4ResearchProxyPreviewV2,
  type Stage4ResearchProxyEvaluationSourceV2,
} from './stage4-research-proxy-evaluator-v2';
import { compileCanonicalStage4ResearchProxyPreviewV2 } from './stage4-research-proxy-compiler-v2';
import { compileCanonicalStage4DeterministicBaselineV2 } from './stage4-deterministic-compiler-v2';

type JsonRecord = Record<string, unknown>;

export const DEV02_HYBRID_STAGE4_COMPILER_VERSION_V2 =
  'EDITRON_DEV02_HYBRID_STAGE4_COMPILER_V2' as const;

const operatorCatalog = operatorCatalogJson as unknown as JsonRecord;

export interface Dev02HybridStage4SourceV2 {
  islandGraph: unknown;
  islandEvaluationSource: Stage4ResearchProxyEvaluationSourceV2;
}

/**
 * Extends the already-verified DEV-02 generated-island graph with the native
 * continuation and proof reads needed for a complete hybrid research proxy.
 * It does not add a writer or resolve any generated-composition render form.
 */
export function compileCanonicalDev02HybridStage4GraphV2(): Readonly<JsonRecord> {
  return compileDev02HybridStage4GraphV2();
}

export function compileDev02HybridStage4GraphV2(
  source?: Readonly<Dev02HybridStage4SourceV2>,
): Readonly<JsonRecord> {
  const islandGraph = source
    ? requiredRecord(source.islandGraph, 'DEV02_HYBRID_SOURCE_GRAPH_INVALID')
    : compileCanonicalStage4ResearchProxyPreviewV2();
  const islandEvaluation = evaluateStage4ResearchProxyPreviewV2(
    islandGraph,
    source?.islandEvaluationSource,
  );
  if (islandEvaluation.disposition !== 'PASS') {
    throw new Error(`DEV02_HYBRID_SOURCE_GRAPH_INVALID:${islandEvaluation.diagnostics.join(',')}`);
  }
  const blockedGraph = source
    ? requiredRecord(source.islandEvaluationSource.sourceBlockedGraph, 'DEV02_HYBRID_BLOCKED_GRAPH_INVALID')
    : compileCanonicalStage4DeterministicBaselineV2();
  const roles = readDev02Stage4RoleSymbolsFromBlockedGraphV2(blockedGraph);
  const sourceIntentNodes = source
    ? records(requiredRecord(
      source.islandEvaluationSource.sourceCompilationSource.editorialIntent,
      'DEV02_HYBRID_EDITORIAL_INTENT_INVALID',
    ).nodes)
    : [];
  const continuationIntent = sourceIntentNodes.find((node) =>
    node.intentNodeId === roles.nativeContinuationIntentNodeId);
  const proofIntent = sourceIntentNodes.find((node) => node.intentNodeId === roles.proofIntentNodeId);
  const continuationOperatorId = selectContinuationOperator(
    source ? strings(continuationIntent?.candidateCapabilityIds) : ['resolve_user_asset_overlay'],
  );
  if (source && !strings(proofIntent?.candidateCapabilityIds).includes('get_timeline_view')) {
    throw new Error('DEV02_HYBRID_PROOF_OPERATOR_NOT_SELECTED:get_timeline_view');
  }
  const sourceBoundNodes = source
    ? records(requiredRecord(
      source.islandEvaluationSource.sourceCompilationSource.evidenceBoundIntent,
      'DEV02_HYBRID_BOUND_INTENT_INVALID',
    ).nodes)
    : [];
  const continuationBound = sourceBoundNodes.find((node) =>
    node.intentNodeId === roles.nativeContinuationIntentNodeId);
  const proofBound = sourceBoundNodes.find((node) => node.intentNodeId === roles.proofIntentNodeId);

  const sourceNodes = records(islandGraph.nodes);
  const sourceEdges = records(islandGraph.edges);
  const closeResolver = requiredNode(sourceNodes, 'compile-resolve-dev02-close');
  const islandNode = requiredNode(sourceNodes, 'compile-preview-generated-island');
  const continuationOperator = requiredOperator(continuationOperatorId);
  const proofOperator = requiredOperator('get_timeline_view');
  const continuationNodeId = 'compile-resolve-native-continuation';
  const proofNodeId = 'compile-prove-dev02-hybrid-proxy';
  const continuationRange = {
    coordinateDomain: 'PROJECT_TICK' as const,
    start: '180',
    endExclusive: '345',
  };
  const continuationSourceRange = {
    coordinateDomain: 'SOURCE_FRAME' as const,
    start: '180',
    endExclusive: '345',
  };

  const mutatesIsolatedProxy = continuationOperatorId === 'move_retime_overlay';
  const continuationProduces = mutatesIsolatedProxy
    ? [`${continuationNodeId}.receipt`]
    : [`${continuationNodeId}.proposedOperation`, `${continuationNodeId}.evidence`];
  const continuationNode: JsonRecord = {
    nodeId: continuationNodeId,
    intentNodeId: roles.nativeContinuationIntentNodeId,
    operatorId: continuationOperatorId,
    operatorSpecRef: operatorSpecRef(continuationOperatorId),
    ownerRef: text(continuationOperator.ownerRef),
    inputs: mutatesIsolatedProxy ? {
      projectId: islandGraph.projectId,
      expectedProjectRevision: islandGraph.expectedProjectRevision,
      overlayId: 'ov-next',
      targetRange: continuationRange,
      sourceRange: continuationSourceRange,
    } : {
      projectId: islandGraph.projectId,
      expectedProjectRevision: islandGraph.expectedProjectRevision,
      assetId: 'dev02-close',
      targetRange: continuationRange,
      sourceRange: continuationSourceRange,
      intent: 'CONTINUE_THE_GENERATED_CENTRE_PANEL_AS_NATIVE_FULL_SCREEN_FOOTAGE',
      evidenceFactIds: [
        'fact-exit-continuity',
        'fact-project-timebase',
        'fact-project-revision',
        'fact-source-dev02-close',
        'fact-source-windows',
        'fact-rights-policy',
      ],
    },
    reads: [
      'fact-exit-continuity',
      'fact-project-timebase',
      'fact-project-revision',
      'fact-source-dev02-close',
      'fact-source-windows',
      'fact-rights-policy',
    ],
    writes: mutatesIsolatedProxy ? [
      'isolatedProxy.timeline.overlay:ov-next.targetRange',
      'isolatedProxy.timeline.overlay:ov-next.sourceRange',
    ] : [],
    requires: [
      `${String(closeResolver.nodeId)}.evidence`,
      `${String(islandNode.nodeId)}.renderedProxy`,
      `${String(islandNode.nodeId)}.renderedProof`,
    ],
    produces: continuationProduces,
    invalidates: mutatesIsolatedProxy ? [
      'isolatedProxy.proof.boundary-continuity',
      'isolatedProxy.proof.state-reload',
    ] : [],
    coordinateBindings: [
      {
        coordinateDomain: 'PROJECT_TICK',
        timebaseFactIds: ['fact-project-timebase'],
        rangeFactIds: ['fact-exit-continuity'],
        assetFactIds: ['fact-source-dev02-close'],
      },
      {
        coordinateDomain: 'SOURCE_FRAME',
        timebaseFactIds: ['fact-source-dev02-close'],
        rangeFactIds: ['fact-exit-continuity', 'fact-source-windows'],
        assetFactIds: ['fact-source-dev02-close'],
      },
    ],
    revisionBinding: {
      projectId: islandGraph.projectId,
      expectedProjectRevision: islandGraph.expectedProjectRevision,
    },
    stabilityRequirement: 'RANGE_STABLE',
    mutationScope: mutatesIsolatedProxy ? 'ISOLATED_PROXY_CLONE' : 'NONE',
    stateEffects: mutatesIsolatedProxy ? ['isolated proxy timeline and optional source range'] : [],
    idempotency: {
      scope: 'RESEARCH_PROXY_INPUT_HASHES',
      keyMaterialRefs: [
        String(islandGraph.graphHash),
        'fact-exit-continuity',
        'fact-source-dev02-close',
      ],
    },
    proofObligationIds: [
      'proof-source-ranges',
      'proof-boundary-continuity',
      'proof-state-reload',
    ],
    failureDisposition: 'ABORT_PREVIEW',
    retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: ['fact-rights-policy', 'fact-privacy-egress-policy'],
    concurrency: {
      class: mutatesIsolatedProxy ? 'RESEARCH_PROXY_ISOLATED_WRITE' : 'RESOLVER_ISOLATED',
      conflictDomainRefs: mutatesIsolatedProxy ? ['isolatedProxy.timeline.overlay:ov-next'] : [],
    },
    resourcePolicyId: mutatesIsolatedProxy
      ? 'OE_DEV02_HYBRID_NATIVE_CONTINUATION_ISOLATED_WRITE_V1'
      : 'OE_DEV02_HYBRID_NATIVE_CONTINUATION_V1',
    reversibility: { disposition: 'NOT_APPLICABLE_NO_PROJECT_STATE', undoBindingRefs: [] },
    traceRefs: continuationBound ? [
      roles.nativeContinuationIntentNodeId,
      ...strings(continuationBound.evidenceBindingIds),
      ...strings(continuationBound.proofObligationIds),
      ...strings(continuationBound.preservationIds),
    ] : [
      roles.nativeContinuationIntentNodeId,
      'bind-exit-continuity',
      'bind-source-media-and-windows',
      'preserve-following-timing',
      'preserve-project-duration',
    ],
  };

  const proofNode: JsonRecord = {
    nodeId: proofNodeId,
    intentNodeId: roles.proofIntentNodeId,
    operatorId: 'get_timeline_view',
    operatorSpecRef: operatorSpecRef('get_timeline_view'),
    ownerRef: text(proofOperator.ownerRef),
    inputs: {
      projectId: islandGraph.projectId,
      expectedProjectRevision: islandGraph.expectedProjectRevision,
      targetRange: {
        coordinateDomain: 'PROJECT_TICK',
        start: '0',
        endExclusive: '345',
      },
      proofMode: 'FULL_HYBRID_PROXY_RENDER_AND_BOUNDARY',
      evidenceFactIds: [
        'fact-project-revision',
        'fact-project-timebase',
        'fact-project-target-range',
        'fact-exit-continuity',
        'fact-reference-observation',
      ],
    },
    reads: [
      'fact-project-revision',
      'fact-project-timebase',
      'fact-project-target-range',
      'fact-exit-continuity',
      'fact-reference-observation',
    ],
    writes: [],
    requires: [
      `${String(islandNode.nodeId)}.renderedProxy`,
      `${String(islandNode.nodeId)}.renderedProof`,
      ...continuationProduces,
    ],
    produces: [`${proofNodeId}.result`, `${proofNodeId}.evidence`],
    invalidates: [],
    coordinateBindings: [{
      coordinateDomain: 'PROJECT_TICK',
      timebaseFactIds: ['fact-project-timebase'],
      rangeFactIds: ['fact-project-target-range', 'fact-exit-continuity'],
      assetFactIds: ['fact-source-dev02-close', 'fact-source-dev02-wide'],
    }],
    revisionBinding: {
      projectId: islandGraph.projectId,
      expectedProjectRevision: islandGraph.expectedProjectRevision,
    },
    stabilityRequirement: 'RANGE_STABLE',
    stateEffects: [],
    idempotency: {
      scope: 'RESEARCH_PROXY_INPUT_HASHES',
      keyMaterialRefs: [String(islandGraph.graphHash), continuationNodeId],
    },
    proofObligationIds: [
      'proof-revision-freshness',
      'proof-rendered-geometry',
      'proof-rendered-legibility',
      'proof-boundary-continuity',
      'proof-sandbox-compile',
      'proof-state-reload',
    ],
    failureDisposition: 'ABORT_PREVIEW',
    retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: ['fact-rights-policy', 'fact-privacy-egress-policy'],
    concurrency: { class: 'READ_SHARED', conflictDomainRefs: [] },
    resourcePolicyId: 'OE_DEV02_HYBRID_RENDER_PROOF_V1',
    reversibility: { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] },
    traceRefs: proofBound ? [
      roles.proofIntentNodeId,
      ...strings(proofBound.evidenceBindingIds),
      ...strings(proofBound.proofObligationIds),
      ...strings(proofBound.preservationIds),
    ] : [
      roles.proofIntentNodeId,
      'bind-project-revision-timebase',
      'bind-reference-island',
      'bind-exit-continuity',
      'preserve-following-timing',
      'preserve-project-duration',
      'preserve-title-legibility',
    ],
  };

  const hybridEdges = [
    {
      edgeId: `edge-${String(closeResolver.nodeId)}-${continuationNodeId}`,
      fromNodeId: closeResolver.nodeId,
      toNodeId: continuationNodeId,
      edgeType: 'DATA',
    },
    {
      edgeId: `edge-${String(islandNode.nodeId)}-${continuationNodeId}`,
      fromNodeId: islandNode.nodeId,
      toNodeId: continuationNodeId,
      edgeType: 'TIME_ANCHOR',
    },
    {
      edgeId: `edge-${String(islandNode.nodeId)}-${proofNodeId}`,
      fromNodeId: islandNode.nodeId,
      toNodeId: proofNodeId,
      edgeType: 'PROOF',
    },
    {
      edgeId: `edge-${continuationNodeId}-${proofNodeId}`,
      fromNodeId: continuationNodeId,
      toNodeId: proofNodeId,
      edgeType: 'PROOF',
    },
  ];

  const unsigned: JsonRecord = {
    artifactType: 'CompiledDev02HybridResearchGraphV2',
    compilerVersion: DEV02_HYBRID_STAGE4_COMPILER_VERSION_V2,
    taskId: islandGraph.taskId,
    compileDisposition: 'COMPILED_FULL_HYBRID_RESEARCH_PROXY',
    executionEligibility: 'RESEARCH_PROXY_ONLY',
    productionProjectExecutionEligibility: 'NOT_EXECUTABLE',
    sourceIslandGraphHash: hashCanonicalJsonV1(islandGraph),
    sourceIslandGraph: cloneCanonicalJsonV1(islandGraph),
    sourceIslandEvaluationSourceHash: source
      ? hashCanonicalJsonV1(source.islandEvaluationSource)
      : null,
    sourceIslandEvaluationSource: source
      ? cloneCanonicalJsonV1(source.islandEvaluationSource)
      : null,
    sourceEditorialIntentHash: islandGraph.sourceEditorialIntentHash,
    sourceEvidenceBoundIntentHash: islandGraph.sourceEvidenceBoundIntentHash,
    evidencePackHash: islandGraph.evidencePackHash,
    operatorCatalogVersion: islandGraph.operatorCatalogVersion,
    projectId: islandGraph.projectId,
    expectedProjectRevision: islandGraph.expectedProjectRevision,
    capabilityPromotion: cloneCanonicalJsonV1(islandGraph.capabilityPromotion),
    previewInputBundle: cloneCanonicalJsonV1(islandGraph.previewInputBundle),
    nodes: [...sourceNodes, continuationNode, proofNode],
    edges: [...sourceEdges, ...hybridEdges],
    hybridScope: {
      executionForm: 'HYBRID',
      generatedIslandRange: { coordinateDomain: 'PROJECT_TICK', start: '0', endExclusive: '180' },
      nativeContinuationRange: continuationRange,
      fullProxyRange: { coordinateDomain: 'PROJECT_TICK', start: '0', endExclusive: '345' },
      projectMutation: 'DENY',
      stateEffects: [],
    },
    proofPolicy: {
      proofVersion: 'OE_DEV02_FULL_HYBRID_RESEARCH_PROOF_V1',
      mode: 'FULL_HYBRID_PROXY_RENDER_PROOF_REQUIRED',
      proofObligationIds: strings(proofNode.proofObligationIds),
      onUnverifiable: 'BLOCK_PREVIEW_ACCEPTANCE',
    },
    compiledIntentNodeIds: [
      roles.sourceResolutionIntentNodeId,
      roles.generatedIslandIntentNodeId,
      roles.nativeContinuationIntentNodeId,
      roles.proofIntentNodeId,
    ],
    unresolvedResearchIntentNodeIds: [],
    unresolvedProductionRequirements: [
      'PROJECTSERVICE_INSERT_UPDATE_COMMAND_NOT_EXERCISED',
      'LEGACY_EDITOR_RENDERER_NOT_WIRED_TO_CANONICAL_NESTED_COMPOSITION',
      'CREATIVE_EASING_REMAINS_UNVERIFIABLE',
    ],
    stateEffects: [],
  };
  return deepFreezeV1({ ...unsigned, graphHash: hashCanonicalJsonV1(unsigned) });
}

function requiredOperator(operatorId: string): JsonRecord {
  return records(operatorCatalog.operators).find((operator) => operator.operatorId === operatorId)
    ?? fail(`DEV02_HYBRID_OPERATOR_MISSING:${operatorId}`);
}
function selectContinuationOperator(candidateIds: string[]): 'resolve_user_asset_overlay' | 'move_retime_overlay' {
  if (candidateIds.includes('resolve_user_asset_overlay')) return 'resolve_user_asset_overlay';
  if (candidateIds.includes('move_retime_overlay')) return 'move_retime_overlay';
  throw new Error(`DEV02_HYBRID_CONTINUATION_OPERATOR_UNSUPPORTED:${candidateIds.join('|') || 'NONE'}`);
}
function operatorSpecRef(operatorId: string): string {
  return `EDITRON_OPERATOR_SPECS_V2@${String(operatorCatalog.version)}#${operatorId}`;
}
function requiredNode(nodes: JsonRecord[], nodeId: string): JsonRecord {
  return nodes.find((node) => node.nodeId === nodeId) ?? fail(`DEV02_HYBRID_SOURCE_NODE_MISSING:${nodeId}`);
}
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function requiredRecord(value: unknown, message: string): JsonRecord { return isRecord(value) ? value : fail(message); }
function fail(message: string): never { throw new Error(message); }
