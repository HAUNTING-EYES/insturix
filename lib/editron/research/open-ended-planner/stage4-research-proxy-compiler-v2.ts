import {
  DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
  DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
  DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
  DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
  DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-generated-composition-program-v1';

import { cloneCanonicalJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { readDev02Stage4RoleSymbolsFromBlockedGraphV2 } from './dev02-stage4-role-resolver-v2';
import {
  DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
  assertDev02GeneratedCompositionResearchProxyCapabilityV1,
  type GeneratedCompositionResearchProxyCapabilityV1,
} from './generated-composition-research-proxy-capability-v1';
import type { GeneratedCompositionProgramV1, GeneratedCompositionSourceBundleV1 } from './generated-composition-program-v1';
import { verifyGeneratedCompositionProgramV1 } from './generated-composition-program-verifier-v1';
import {
  evaluateStage4CompiledGraphArtifactV2,
  type Stage4CompilationSourceV2,
} from './stage4-compilation-evaluator-v2';
import { compileCanonicalStage4DeterministicBaselineV2 } from './stage4-deterministic-compiler-v2';

type JsonRecord = Record<string, unknown>;

export const STAGE4_RESEARCH_PROXY_COMPILER_VERSION_V2 =
  'EDITRON_STAGE4_RESEARCH_PROXY_COMPILER_V2' as const;

export interface Stage4ResearchProxyCompilerInputV2 {
  program: GeneratedCompositionProgramV1;
  sourceBundle: GeneratedCompositionSourceBundleV1;
  evidencePack: unknown;
  referenceBlueprint: unknown;
  supplementalFacts: unknown;
  capabilityPromotion: unknown;
  sourceBlockedGraph?: unknown;
  sourceCompilationSource?: Stage4CompilationSourceV2;
}

export function compileCanonicalStage4ResearchProxyPreviewV2(): Readonly<JsonRecord> {
  return compileStage4ResearchProxyPreviewV2({
    program: DEV02_GENERATED_COMPOSITION_PROGRAM_V1,
    sourceBundle: DEV02_GENERATED_COMPOSITION_SOURCE_BUNDLE_V1,
    evidencePack: DEV02_GENERATED_COMPOSITION_EVIDENCE_PACK_V1,
    referenceBlueprint: DEV02_GENERATED_COMPOSITION_BLUEPRINT_V1,
    supplementalFacts: DEV02_GENERATED_COMPOSITION_SUPPLEMENTAL_FACTS_V1,
    capabilityPromotion: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V1,
  });
}

export function compileStage4ResearchProxyPreviewV2(
  input: Stage4ResearchProxyCompilerInputV2,
): Readonly<JsonRecord> {
  assertDev02GeneratedCompositionResearchProxyCapabilityV1(input.capabilityPromotion);
  const capability = input.capabilityPromotion as GeneratedCompositionResearchProxyCapabilityV1;
  const verification = verifyGeneratedCompositionProgramV1(input);
  if (verification.disposition !== 'CONTRACT_PASS' || !verification.programHash || !verification.sourceBundleHash) {
    throw new Error(`STAGE4_RESEARCH_PROXY_PROGRAM_INVALID:${verification.diagnostics.join(',')}`);
  }
  assertAcceptedProfile(input.program, capability);

  if ((input.sourceBlockedGraph === undefined) !== (input.sourceCompilationSource === undefined)) {
    throw new Error('STAGE4_RESEARCH_PROXY_SOURCE_CONTRACT_INCOMPLETE');
  }
  const sourceGraph = input.sourceBlockedGraph === undefined
    ? compileCanonicalStage4DeterministicBaselineV2()
    : requireRecord(input.sourceBlockedGraph, 'STAGE4_RESEARCH_PROXY_SOURCE_GRAPH_INVALID');
  const sourceEvaluation = evaluateStage4CompiledGraphArtifactV2(
    sourceGraph,
    input.sourceCompilationSource,
  );
  if (sourceEvaluation.disposition !== 'CAPABILITY_BLOCKED' || sourceEvaluation.diagnostics.length) {
    throw new Error('STAGE4_RESEARCH_PROXY_SOURCE_GRAPH_INVALID');
  }
  const roles = readDev02Stage4RoleSymbolsFromBlockedGraphV2(sourceGraph);
  const sourceNodes = records(sourceGraph.nodes);
  const sourceEdges = records(sourceGraph.edges);
  const resolutionNodes = sourceNodes.filter((node) => node.operatorId === 'resolve_user_asset_overlay');
  if (resolutionNodes.length !== 2) throw new Error('STAGE4_RESEARCH_PROXY_SOURCE_RESOLVER_SET_DRIFT');
  const sourceProposalRefs = unique(resolutionNodes.flatMap((node) => strings(node.produces))).sort(compareUtf16);
  const generatedBoundNode = input.sourceCompilationSource
    ? records(requireRecord(input.sourceCompilationSource.evidenceBoundIntent, 'STAGE4_RESEARCH_PROXY_BOUND_INTENT_INVALID').nodes)
      .find((node) => node.intentNodeId === roles.generatedIslandIntentNodeId)
    : undefined;
  if (input.sourceCompilationSource && !generatedBoundNode) {
    throw new Error('STAGE4_RESEARCH_PROXY_GENERATED_BOUND_INTENT_MISSING');
  }
  const generatedTraceRefs = generatedBoundNode ? [
    roles.generatedIslandIntentNodeId,
    ...strings(generatedBoundNode.evidenceBindingIds),
    ...strings(generatedBoundNode.proofObligationIds),
    ...strings(generatedBoundNode.preservationIds),
    capability.capabilityHash,
  ] : [
    roles.generatedIslandIntentNodeId, 'bind-reference-island', 'bind-source-media-and-windows',
    'bind-island-target-geometry', 'proof-rendered-geometry', 'proof-rendered-legibility',
    'proof-sandbox-compile', capability.capabilityHash,
  ];
  const capabilityHash = capability.capabilityHash;
  const previewNodeId = 'compile-preview-generated-island';
  const previewNode: JsonRecord = {
    nodeId: previewNodeId,
    intentNodeId: roles.generatedIslandIntentNodeId,
    operatorId: capability.operatorId,
    operatorSpecRef: `${capability.contractVersion}@${capabilityHash}#${capability.operatorId}`,
    ownerRef: capability.ownerRef,
    executionAuthority: capability.authority,
    inputs: {
      projectId: capability.acceptedProfile.projectId,
      expectedProjectRevision: capability.acceptedProfile.expectedProjectRevision,
      programHash: verification.programHash,
      sourceBundleHash: verification.sourceBundleHash,
      evidencePackHash: hashCanonicalJsonV1(input.evidencePack),
      referenceBlueprintHash: hashCanonicalJsonV1(input.referenceBlueprint),
      supplementalFactsHash: hashCanonicalJsonV1(input.supplementalFacts),
      capabilityHash,
      sourceProposalRefs,
      targetRange: capability.acceptedProfile.targetRange,
    },
    reads: [
      'fact-project-revision', 'fact-project-timebase', 'fact-project-target-range', 'fact-project-canvas',
      'fact-source-dev02-close', 'fact-source-dev02-wide', 'fact-source-windows', 'fact-reference-observation',
      'fact-rights-policy', 'fact-privacy-egress-policy', capabilityHash,
    ],
    writes: [],
    requires: sourceProposalRefs,
    produces: [
      `${previewNodeId}.renderedProxy`, `${previewNodeId}.proxyReceipt`, `${previewNodeId}.renderedProof`,
    ],
    invalidates: [],
    coordinateBindings: [
      {
        coordinateDomain: 'PROJECT_TICK', timebaseFactIds: ['fact-project-timebase'],
        rangeFactIds: ['fact-project-target-range'], assetFactIds: ['fact-source-dev02-close', 'fact-source-dev02-wide'],
      },
      {
        coordinateDomain: 'COMPOSITION_TICK', timebaseFactIds: [input.program.compositionTimebase.timebaseId],
        rangeFactIds: [verification.programHash], assetFactIds: [],
      },
    ],
    revisionBinding: {
      projectId: capability.acceptedProfile.projectId,
      expectedProjectRevision: capability.acceptedProfile.expectedProjectRevision,
    },
    stabilityRequirement: 'RANGE_STABLE',
    stateEffects: [],
    idempotency: {
      scope: 'RESEARCH_PROXY_INPUT_HASHES',
      keyMaterialRefs: [verification.programHash, verification.sourceBundleHash, capabilityHash],
    },
    proofObligationIds: [
      'proof-asset-rights', 'proof-source-ranges', 'proof-rendered-geometry',
      'proof-rendered-legibility', 'proof-sandbox-compile',
    ],
    failureDisposition: 'ABORT_PREVIEW',
    retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: ['fact-rights-policy', 'fact-privacy-egress-policy'],
    concurrency: { class: 'RESEARCH_PROXY_ISOLATED', conflictDomainRefs: [] },
    resourcePolicyId: 'OE_STAGE4_GENERATED_COMPOSITION_PROXY_V1',
    reversibility: { disposition: 'NOT_APPLICABLE_NO_PROJECT_STATE', undoBindingRefs: [] },
    traceRefs: generatedTraceRefs,
  };
  const previewEdges = resolutionNodes.map((node) => ({
    edgeId: `edge-${String(node.nodeId)}-${previewNodeId}`,
    fromNodeId: String(node.nodeId),
    toNodeId: previewNodeId,
    edgeType: 'DATA',
  }));
  const unsigned: JsonRecord = {
    artifactType: 'CompiledResearchProxyPreviewGraphV2',
    compilerVersion: STAGE4_RESEARCH_PROXY_COMPILER_VERSION_V2,
    taskId: sourceGraph.taskId,
    compileDisposition: 'COMPILED_RESEARCH_PROXY_PREVIEW',
    executionEligibility: 'RESEARCH_PROXY_ONLY',
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
    sourceBlockedGraphHash: hashCanonicalJsonV1(sourceGraph),
    sourceBlockedGraph: cloneCanonicalJsonV1(sourceGraph),
    sourceCompilationSourceHash: input.sourceCompilationSource
      ? hashCanonicalJsonV1(input.sourceCompilationSource)
      : null,
    sourceCompilationSource: input.sourceCompilationSource
      ? cloneCanonicalJsonV1(input.sourceCompilationSource)
      : null,
    sourceEditorialIntentHash: sourceGraph.sourceEditorialIntentHash,
    sourceEvidenceBoundIntentHash: sourceGraph.sourceEvidenceBoundIntentHash,
    evidencePackHash: sourceGraph.evidencePackHash,
    operatorCatalogVersion: sourceGraph.operatorCatalogVersion,
    projectId: sourceGraph.projectId,
    expectedProjectRevision: sourceGraph.expectedProjectRevision,
    capabilityPromotion: cloneCanonicalJsonV1(capability),
    previewInputBundle: cloneCanonicalJsonV1({
      program: input.program, sourceBundle: input.sourceBundle, evidencePack: input.evidencePack,
      referenceBlueprint: input.referenceBlueprint, supplementalFacts: input.supplementalFacts,
    }),
    nodes: [...sourceNodes, previewNode],
    edges: [...sourceEdges, ...previewEdges],
    previewScope: {
      intentNodeIds: [roles.generatedIslandIntentNodeId],
      targetRange: capability.acceptedProfile.targetRange,
      projectMutation: 'DENY',
      stateEffects: [],
    },
    proofPolicy: {
      proofVersion: 'OE_STAGE4_RESEARCH_PROXY_PROOF_POLICY_V1',
      mode: 'BOUNDED_PREVIEW_PROOF_REQUIRED',
      proofObligationIds: strings(previewNode.proofObligationIds),
      onUnverifiable: 'BLOCK_PREVIEW_ACCEPTANCE',
    },
    diagnostics: [
      { code: 'FULL_PROJECT_DEPENDENCY_BLOCKED', intentNodeIds: [
        roles.nativeContinuationIntentNodeId, roles.proofIntentNodeId,
      ] },
    ],
    previewEligibleIntentNodeIds: [roles.generatedIslandIntentNodeId],
    unresolvedFullProjectIntentNodeIds: [roles.nativeContinuationIntentNodeId, roles.proofIntentNodeId],
    stateEffects: [],
  };
  return deepFreezeV1({ ...unsigned, graphHash: hashCanonicalJsonV1(unsigned) });
}

function assertAcceptedProfile(
  program: GeneratedCompositionProgramV1,
  capability: GeneratedCompositionResearchProxyCapabilityV1,
): void {
  const profile = capability.acceptedProfile;
  if (program.taskId !== capability.taskId || program.projectBinding.projectId !== profile.projectId
    || program.projectBinding.expectedProjectRevision !== profile.expectedProjectRevision
    || program.canvas.width !== profile.canvas.width || program.canvas.height !== profile.canvas.height
    || program.canvas.colorIntent !== profile.canvas.colorIntent
    || hashCanonicalJsonV1(program.projectTimebase.rate) !== hashCanonicalJsonV1(profile.projectRate)
    || program.duration.projectStartTick !== profile.targetRange.start
    || program.duration.projectEndExclusiveTick !== profile.targetRange.endExclusive
    || hashCanonicalJsonV1([...new Set(program.sourceSlots.map(({ assetId }) => assetId))].sort(compareUtf16))
      !== hashCanonicalJsonV1(profile.allowedAssetIds)) {
    throw new Error('STAGE4_RESEARCH_PROXY_PROFILE_NOT_PROMOTED');
  }
}

function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function requireRecord(value: unknown, errorCode: string): JsonRecord {
  if (!isRecord(value)) throw new Error(errorCode);
  return value;
}
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
