import dev02CanonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import dev02CanonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';

import { deepFreezeV1 } from './contracts-v1';

type JsonRecord = Record<string, unknown>;

const v2Intent = dev02CanonicalEditorialIntentJson as unknown as JsonRecord;
const v2Bound = dev02CanonicalEvidenceBoundIntentJson as unknown as JsonRecord;

const ISLAND_CLAIM_IDS = [
  'claim-user-stacked-layout', 'claim-user-centred-title', 'claim-user-varied-crops',
  'claim-ref-five-panels', 'claim-ref-black-gutters', 'claim-ref-yellow-two-line-title',
  'claim-ref-opposed-motion', 'claim-ref-stable-hold', 'claim-ref-green-centre-takeover',
  'claim-ref-temporal-progression',
];
const CONTINUATION_CLAIM_IDS = ['claim-user-exit-continuity', 'claim-ref-green-centre-takeover'];
const PROOF_CLAIM_IDS = [
  'claim-user-stacked-layout', 'claim-user-centred-title', 'claim-user-varied-crops',
  'claim-user-exit-continuity',
];
const ISLAND_UNRESOLVED = ['req-generated-owner', 'req-exact-easing-review'];

export interface Dev02CanonicalV2RV2 {
  editorialIntent: JsonRecord;
  evidenceBoundIntent: JsonRecord;
}

export function getCanonicalDev02V2RV2(): Readonly<Dev02CanonicalV2RV2> {
  return deepFreezeV1({
    editorialIntent: editorialIntentV2R(),
    evidenceBoundIntent: evidenceBoundIntentV2R(),
  });
}

function intentNodeV2R(
  intentNodeId: string,
  operationFamily: string,
  targetClaimIds: string[],
  selectedOperatorId: string,
  executionForm: 'NATIVE' | 'GENERATED_COMPOSITION',
  requiresNodeIds: string[],
  invalidates: string[],
  evidenceIds: string[],
): JsonRecord {
  return {
    intentNodeId, operationFamily, targetClaimIds, selectedOperatorId,
    alternativeOperatorIds: [], executionForm, requiresNodeIds, invalidates,
    evidenceIds, failureDisposition: 'NEEDS_REVIEW',
  };
}

function editorialIntentV2R(): JsonRecord {
  return {
    artifactType: 'EditorialIntentGraphV2',
    taskId: 'DEV-02',
    executionForm: v2Intent.executionForm,
    routeDecision: v2Intent.routeDecision,
    nodes: [
      intentNodeV2R('node-inspect-source', 'owned_source_inspection', ['claim-user-varied-crops'], 'inspect_user_asset', 'NATIVE', [], [], ['EV-DEV02-S1']),
      intentNodeV2R('node-resolve-source', 'owned_source_resolution', ['claim-user-varied-crops'], 'resolve_user_asset_overlay', 'NATIVE', ['node-inspect-source'], [], ['EV-DEV02-S1']),
      intentNodeV2R('node-generated-island', 'bounded_relational_panel_composition', ISLAND_CLAIM_IDS, 'generated_composition_program', 'GENERATED_COMPOSITION', ['node-resolve-source'], ['GENERATED_ISLAND_RENDER_PROOF', 'BOUNDARY_CONTINUITY_PROOF'], ['EV-DEV02-R1', 'EV-DEV02-S1']),
      intentNodeV2R('node-continuation-timeline', 'native_boundary_observation', CONTINUATION_CLAIM_IDS, 'get_timeline_view', 'NATIVE', ['node-generated-island'], ['BOUNDARY_CONTINUITY_PROOF'], ['EV-DEV02-C1']),
      intentNodeV2R('node-resolve-continuation', 'native_boundary_continuation', CONTINUATION_CLAIM_IDS, 'resolve_user_asset_overlay', 'NATIVE', ['node-continuation-timeline'], ['BOUNDARY_CONTINUITY_PROOF'], ['EV-DEV02-C1']),
      intentNodeV2R('node-proof-project', 'post_mutation_project_state_proof', PROOF_CLAIM_IDS, 'read_project_file', 'NATIVE', ['node-resolve-continuation'], [], ['EV-DEV02-R1', 'EV-DEV02-S1', 'EV-DEV02-C1']),
      intentNodeV2R('node-proof-timeline', 'post_mutation_timeline_proof', PROOF_CLAIM_IDS, 'get_timeline_view', 'NATIVE', ['node-proof-project'], [], ['EV-DEV02-R1', 'EV-DEV02-S1', 'EV-DEV02-C1']),
    ],
    edges: [
      { edgeId: 'edge-inspect-resolve-source', fromNodeId: 'node-inspect-source', toNodeId: 'node-resolve-source', edgeType: 'DATA' },
      { edgeId: 'edge-source-island', fromNodeId: 'node-resolve-source', toNodeId: 'node-generated-island', edgeType: 'DATA' },
      { edgeId: 'edge-island-continuation', fromNodeId: 'node-generated-island', toNodeId: 'node-continuation-timeline', edgeType: 'TIME_ANCHOR' },
      { edgeId: 'edge-continuation-resolve', fromNodeId: 'node-continuation-timeline', toNodeId: 'node-resolve-continuation', edgeType: 'DATA' },
      { edgeId: 'edge-island-proof', fromNodeId: 'node-generated-island', toNodeId: 'node-proof-project', edgeType: 'PROOF' },
      { edgeId: 'edge-continuation-proof', fromNodeId: 'node-resolve-continuation', toNodeId: 'node-proof-project', edgeType: 'PROOF' },
      { edgeId: 'edge-proof-project-timeline', fromNodeId: 'node-proof-project', toNodeId: 'node-proof-timeline', edgeType: 'PROOF' },
    ],
    preservationIntents: v2Intent.preservationIntents,
    unresolvedRequirements: v2Intent.unresolvedRequirements,
  };
}

function boundNodeV2R(
  intentNodeId: string,
  selectedOperatorId: string,
  evidenceBindingIds: string[],
  proofObligationIds: string[],
  unresolvedRequirementIds: string[] = [],
): JsonRecord {
  return {
    intentNodeId, selectedOperatorId, alternativeOperatorIds: [],
    evidenceBindingIds,
    preservationIds: boundNodePreservationIds(intentNodeId),
    proofObligationIds,
    bindingStatus: 'BOUND',
    unresolvedRequirementIds,
  };
}

function boundNodePreservationIds(intentNodeId: string): string[] {
  const v2Nodes = records(v2Bound.nodes);
  const sourceId = intentNodeId === 'node-inspect-source' || intentNodeId === 'node-resolve-source'
    ? 'node-source-resolution'
    : intentNodeId === 'node-continuation-timeline' || intentNodeId === 'node-resolve-continuation'
    ? 'node-native-continuation'
    : intentNodeId.startsWith('node-proof') ? 'node-proof' : intentNodeId;
  const source = v2Nodes.find((node) => node.intentNodeId === sourceId);
  return Array.isArray(source?.preservationIds)
    ? (source.preservationIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
}

function evidenceBoundIntentV2R(): JsonRecord {
  const islandProofs = ['proof-asset-rights', 'proof-source-ranges', 'proof-rendered-geometry', 'proof-rendered-legibility', 'proof-sandbox-compile'];
  const continuationProofs = ['proof-source-ranges', 'proof-boundary-continuity', 'proof-state-reload'];
  const proofProofs = [
    'proof-revision-freshness', 'proof-rendered-geometry', 'proof-rendered-legibility',
    'proof-boundary-continuity', 'proof-sandbox-compile', 'proof-state-reload',
  ];
  return {
    artifactType: 'EvidenceBoundIntentGraphV2',
    taskId: 'DEV-02',
    stageDisposition: v2Bound.stageDisposition,
    nodes: [
      boundNodeV2R('node-inspect-source', 'inspect_user_asset', ['bind-source-media-and-windows'], ['proof-asset-rights', 'proof-source-ranges']),
      boundNodeV2R('node-resolve-source', 'resolve_user_asset_overlay', ['bind-source-media-and-windows'], ['proof-asset-rights', 'proof-source-ranges']),
      boundNodeV2R('node-generated-island', 'generated_composition_program', ['bind-reference-island', 'bind-source-media-and-windows', 'bind-island-target-geometry'], islandProofs, ISLAND_UNRESOLVED),
      boundNodeV2R('node-continuation-timeline', 'get_timeline_view', ['bind-exit-continuity', 'bind-source-media-and-windows'], continuationProofs),
      boundNodeV2R('node-resolve-continuation', 'resolve_user_asset_overlay', ['bind-exit-continuity', 'bind-source-media-and-windows'], continuationProofs),
      boundNodeV2R('node-proof-project', 'read_project_file', ['bind-project-revision-timebase', 'bind-reference-island', 'bind-exit-continuity'], proofProofs, ISLAND_UNRESOLVED),
      boundNodeV2R('node-proof-timeline', 'get_timeline_view', ['bind-project-revision-timebase', 'bind-reference-island', 'bind-exit-continuity'], proofProofs, ISLAND_UNRESOLVED),
    ],
    evidenceBindings: [
      { bindingId: 'bind-project-revision-timebase', factIds: ['fact-project-revision', 'fact-project-timebase', 'fact-project-target-range'], nodeIds: ['node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
      { bindingId: 'bind-source-media-and-windows', factIds: ['fact-source-dev02-wide', 'fact-source-dev02-close', 'fact-source-windows', 'fact-rights-policy'], nodeIds: ['node-inspect-source', 'node-resolve-source', 'node-generated-island', 'node-continuation-timeline', 'node-resolve-continuation'], status: 'BOUND' },
      { bindingId: 'bind-reference-island', factIds: ['fact-reference-observation', 'fact-source-dev02-reference', 'fact-rights-policy'], nodeIds: ['node-generated-island', 'node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
      { bindingId: 'bind-island-target-geometry', factIds: ['fact-project-canvas', 'fact-project-target-range', 'fact-reference-observation'], nodeIds: ['node-generated-island'], status: 'BOUND' },
      { bindingId: 'bind-exit-continuity', factIds: ['fact-exit-continuity', 'fact-project-timebase', 'fact-project-revision'], nodeIds: ['node-continuation-timeline', 'node-resolve-continuation', 'node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
    ],
    rightsDecision: v2Bound.rightsDecision,
    privacyDecision: v2Bound.privacyDecision,
    revisionBinding: v2Bound.revisionBinding,
    preservationBindings: v2Bound.preservationBindings,
    proofPlan: records(v2Bound.proofPlan).map((entry) => ({ ...entry, nodeIds: remapProofNodeIds(text(entry.proofObligationId)) })),
    unresolvedRequirements: v2Bound.unresolvedRequirements,
  };
}

function remapProofNodeIds(proofObligationId: string): string[] {
  const map: Record<string, string[]> = {
    'proof-revision-freshness': ['node-proof-project', 'node-proof-timeline'],
    'proof-asset-rights': ['node-inspect-source', 'node-resolve-source', 'node-generated-island'],
    'proof-source-ranges': ['node-inspect-source', 'node-resolve-source', 'node-generated-island', 'node-continuation-timeline', 'node-resolve-continuation'],
    'proof-rendered-geometry': ['node-generated-island', 'node-proof-project', 'node-proof-timeline'],
    'proof-rendered-legibility': ['node-generated-island', 'node-proof-project', 'node-proof-timeline'],
    'proof-boundary-continuity': ['node-continuation-timeline', 'node-resolve-continuation', 'node-proof-project', 'node-proof-timeline'],
    'proof-sandbox-compile': ['node-generated-island', 'node-proof-project', 'node-proof-timeline'],
    'proof-state-reload': ['node-continuation-timeline', 'node-resolve-continuation', 'node-proof-project', 'node-proof-timeline'],
  };
  return map[proofObligationId] ?? [];
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
