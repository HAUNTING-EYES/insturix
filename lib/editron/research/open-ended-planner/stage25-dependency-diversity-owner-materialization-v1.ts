import {
  applyFilterToProject,
  findVisualMomentCandidates,
  resolveVisualEditPlacement,
  type FilterIntent,
  type VisualMomentCandidate,
} from '../../agent/chat-visual-tools';
import {
  resolveUserAssetOverlayPlacement,
  type NormalizedAssetCandidate,
} from '../../agent/chat-asset-tools';
import {
  mapTimelineRangeAfterRangeCutV1,
  type TimelineFrameRangeV1,
  type TimelineRangeCutCoordinateTransformV1,
} from '../../services/timeline-range-cut';
import type { Project, ProjectRevisionV1 } from '../../services/project-service';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  changedProjectProposalPathsV2R,
  projectProposalStateV2R,
} from './project-service-proposal-state-v2r';
import {
  createProviderNativeProjectServiceCloneOwnerV2R,
  issueProjectServiceIsolatedWriterRevisionV2R,
  type ProjectServiceIsolatedOperatorOwnerV2R,
} from './provider-native-project-service-clone-owner-v2r';
import { createProviderNativeProjectServiceCutOwnerV2R }
  from './provider-native-project-service-cut-owner-v2r';
import type { ProviderNativeToolExecutionV2R }
  from './provider-native-tool-episode-v2r';
import { v2rOperatorCatalogIdentity, v2rOperatorFieldSchema }
  from './operator-catalog-v2r';
import { STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1 }
  from './stage25-dependency-diversity-holdout-v1';

type JsonRecord = Record<string, unknown>;
type TaskId = typeof STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks[number]['taskId'];
type OwnerDisposition = 'EDIT_APPLIED' | 'ZERO_WRITE_SAFE_STOP'
  | 'UNSAFE_ATTEMPT_BLOCKED' | 'TAMPER_REJECTED' | 'PUBLIC_CONTRACT_GAP';
type ProofArtifactKind = 'CURRENT_EDIT_RECEIPT' | 'SAFE_STOP_RECEIPT' | 'NONE';

export const STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_VERSION_V1 =
  'EDITRON_OE_STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1_1' as const;
export const STAGE25_DEPENDENCY_DIVERSITY_OWNER_OUTCOME_VERSION_V1 =
  'EDITRON_OE_STAGE25_DEPENDENCY_DIVERSITY_OWNER_OUTCOME_V1_1' as const;

const FILTER_WRITER_AUTHORITY =
  'STAGE25_DEPENDENCY_DIVERSITY_FILTER_CLONE_WRITER_V1_1' as const;
const TASK_OWNER_RECEIPT_AUTHORITY =
  'STAGE25_DEPENDENCY_DIVERSITY_TASK_OWNER_RECEIPT_V1_1' as const;
const D01_ALL_EVIDENCE = [
  'EV-D01-TIMELINE', 'EV-D01-WARM', 'EV-D01-COOL', 'EV-D01-FLAT', 'EV-D01-PRESERVE',
] as const;
const D04_ALL_EVIDENCE = [
  'EV-D04-FLASH-A', 'EV-D04-FLASH-B', 'EV-D04-TIMELINE', 'EV-D04-AUDIO',
] as const;

const D01_TARGETS = [
  {
    overlayId: 102, evidenceId: 'EV-D01-WARM',
    targetRange: { startFrame: 60, endFrame: 150 },
    query: 'measured warm cast neutral correction requires cooler filter',
    filterIntent: 'cooler' as FilterIntent,
  },
  {
    overlayId: 103, evidenceId: 'EV-D01-COOL',
    targetRange: { startFrame: 210, endFrame: 300 },
    query: 'measured cool cast neutral correction requires warmer filter',
    filterIntent: 'warmer' as FilterIntent,
  },
  {
    overlayId: 104, evidenceId: 'EV-D01-FLAT',
    targetRange: { startFrame: 360, endFrame: 450 },
    query: 'measured flat contrast neutral correction requires higher contrast filter',
    filterIntent: 'higher-contrast' as FilterIntent,
  },
] as const;

const D04_RANGES = {
  A: { startFrame: 150, endFrame: 153 },
  B: { startFrame: 750, endFrame: 753 },
} as const;
const D04_QUERIES = {
  A: 'exact first three frame flash glitch',
  B: 'exact second three frame flash glitch',
} as const;

interface EvidenceFactV1 extends JsonRecord {
  evidenceId: string;
  factSha256: string;
}

export interface Stage25DependencyDiversityOwnerOutcomeV1 {
  version: typeof STAGE25_DEPENDENCY_DIVERSITY_OWNER_OUTCOME_VERSION_V1;
  artifactType: 'Stage25DependencyDiversityOwnerOutcomeV1';
  taskId: TaskId;
  sentinelId: string;
  ownerDisposition: OwnerDisposition;
  proofArtifactKind: ProofArtifactKind;
  operationAttemptCount: number;
  unsafeAttemptCount: number;
  ownerBlockedAttemptCount: number;
  isolatedMutationCount: number;
  canonicalProjectMutationCount: 0;
  finalSemanticStateSha256: string | null;
  contractGap: string | null;
  observations: readonly Readonly<JsonRecord>[];
  trace: readonly Readonly<JsonRecord>[];
  ownerReceipt: Readonly<JsonRecord> | null;
  outcomeSha256: string;
}

const D01_EVIDENCE = materializeD01Evidence();
const D04_EVIDENCE = materializeD04Evidence();
const D02_OWNER_GAP_AUDIT = auditDep02PublicOwnerGapV1();
const D01_EXPECTED_STATE = expectedD01TaskState();
const D04_EXPECTED_STATE = expectedD04TaskState();

const MATERIALIZATION_MATERIAL = {
  version: STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_VERSION_V1,
  artifactType: 'Stage25DependencyDiversityOwnerMaterializationV1' as const,
  authority: 'BOUNDED_ZERO_SPEND_FIXTURE_AND_EFFECT_MATERIALIZATION' as const,
  freezeSha256: STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.freezeSha256,
  operatorCatalog: v2rOperatorCatalogIdentity(),
  tasks: [
    {
      taskId: 'HOLD-DEP-01',
      disposition: 'EXECUTABLE_ZERO_SPEND_OWNER' as const,
      fixtureMaterialization: 'MATERIALIZED_DETERMINISTIC_PROJECT_AND_PUBLIC_EVIDENCE' as const,
      expectedRevisionLabel: 'R21',
      baselineProjectStateSha256: projectStateSha256(buildProject('HOLD-DEP-01')),
      expectedFinalSemanticStateSha256: hashCanonicalJsonV1(D01_EXPECTED_STATE),
      evidence: D01_EVIDENCE,
      ownerRefs: [
        'lib/editron/agent/chat-visual-tools.ts#findVisualMomentCandidates',
        'lib/editron/agent/chat-visual-tools.ts#applyFilterToProject',
        'lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r.ts#createProviderNativeProjectServiceCloneOwnerV2R',
      ],
      effectShape: 'ALL_EVIDENCE_BARRIER_THEN_THREE_LATEST_RECEIPT_FILTER_WRITERS',
      proofCeiling: 'CURRENT_EDIT_PROOF',
    },
    {
      taskId: 'HOLD-DEP-02',
      disposition: 'NOT_EXECUTABLE_PUBLIC_FORM_OWNER_GAP' as const,
      fixtureMaterialization: 'AUDIT_FIXTURE_ONLY_NO_WRITER_EFFECTS' as const,
      expectedRevisionLabel: 'R31',
      baselineProjectStateSha256: projectStateSha256(buildProject('HOLD-DEP-02')),
      expectedFinalSemanticStateSha256: null,
      evidence: [] as const,
      ownerGapAudit: D02_OWNER_GAP_AUDIT,
      effectShape: 'BLOCKED_BEFORE_MUTATION_OWNER_MATERIALIZATION',
      proofCeiling: 'NO_PROOF',
    },
    {
      taskId: 'HOLD-DEP-03',
      disposition: 'NOT_EXECUTABLE_PUBLIC_SOURCE_TIME_MAP_GAP' as const,
      fixtureMaterialization: 'NOT_MATERIALIZED',
      expectedFinalSemanticStateSha256: null,
      publicContractGap: STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks
        .find(({ taskId }) => taskId === 'HOLD-DEP-03')!.publicContractGap,
      effectShape: 'BLOCKED_BEFORE_FIXTURE_OR_WRITER_MATERIALIZATION',
      proofCeiling: 'NO_PROOF',
    },
    {
      taskId: 'HOLD-DEP-04',
      disposition: 'EXECUTABLE_ZERO_SPEND_OWNER' as const,
      fixtureMaterialization: 'MATERIALIZED_DETERMINISTIC_PROJECT_AND_PUBLIC_EVIDENCE' as const,
      expectedRevisionLabel: 'R27',
      baselineProjectStateSha256: projectStateSha256(buildProject('HOLD-DEP-04')),
      expectedFinalSemanticStateSha256: hashCanonicalJsonV1(D04_EXPECTED_STATE),
      evidence: D04_EVIDENCE,
      ownerRefs: [
        'lib/editron/agent/chat-visual-tools.ts#findVisualMomentCandidates',
        'lib/editron/agent/chat-visual-tools.ts#resolveVisualEditPlacement',
        'lib/editron/services/timeline-range-cut.ts#cutTimelineRange',
        'lib/editron/research/open-ended-planner/provider-native-project-service-cut-owner-v2r.ts#createProviderNativeProjectServiceCutOwnerV2R',
        'lib/editron/research/open-ended-planner/provider-native-project-service-clone-owner-v2r.ts#createProviderNativeProjectServiceCloneOwnerV2R',
      ],
      effectShape: 'TWO_WRITERS_WITH_OWNER_ISSUED_TRANSFORM_COMPOSITION',
      proofCeiling: 'CURRENT_EDIT_PROOF',
    },
  ],
  fixtureEvidenceProvenance: {
    taskIds: ['HOLD-DEP-01', 'HOLD-DEP-04'] as const,
    status: 'DETERMINISTIC_SYNTHETIC_FIXTURES_ONLY' as const,
    evidenceQualityCeiling: 'STRUCTURAL_OWNER_MECHANICS_ONLY' as const,
    doesNotEstablish: [
      'REAL_COLOUR_EVIDENCE_QUALITY',
      'REAL_MOTION_EVIDENCE_QUALITY',
      'REAL_AUDIO_EVIDENCE_QUALITY',
      'REAL_EDITORIAL_QUALITY',
    ] as const,
  },
  runtimeContractClosure: {
    status: 'BOUNDED_RUNTIME_IDENTITIES_NOT_TRANSITIVE_SOURCE_CLOSURE' as const,
    identities: [
      FILTER_WRITER_AUTHORITY,
      'PROJECTSERVICE_ISOLATED_CUT_PROPOSAL_WRITER_V2R_1',
      'PROJECTSERVICE_ISOLATED_PROPOSAL_REVISION_ISSUER_V2R_1',
    ],
  },
  providerInferenceCallCount: 0 as const,
  renderCallCount: 0 as const,
  canonicalProjectMutationCount: 0 as const,
  stateEffects: [] as const,
};

export const STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1 = deepFreezeV1({
  ...MATERIALIZATION_MATERIAL,
  materializationSha256: hashCanonicalJsonV1(MATERIALIZATION_MATERIAL),
});

export function auditDep02PublicOwnerGapV1(): Readonly<JsonRecord> {
  const project = buildProject('HOLD-DEP-02');
  const candidate: NormalizedAssetCandidate = {
    assetId: 'dep02-screen-v2', type: 'video', name: 'Owned screen recording v2',
    duration: 20, dimensions: { width: 1920, height: 1080 },
    thumbnailHint: 'available', tags: ['owned', 'screen-recording', 'v2'],
    score: 1, confidence: 0.99, confidenceLabel: 'high',
    matchReasons: ['direct-asset-id'], usedInProject: false,
    overlayIds: [], sceneIndexes: [],
    useWith: {
      tool: 'use_matching_footage', assetId: 'dep02-screen-v2',
      note: 'Existing replacement route; rights and source handles still require separate evidence.',
    },
  };
  const resolution = resolveUserAssetOverlayPlacement(project, [candidate], {
    query: 'owned screen recording v2', operation: 'replace', placement: 'full-frame',
    targetOverlayId: 202, sourceStartFrame: 0,
  });
  const resolvedOperatorId = resolution.useWith?.use_matching_footage
    ? 'use_matching_footage' : resolution.useWith?.add_overlay ? 'add_overlay' : 'NONE';
  const eligible = STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'HOLD-DEP-02')!.eligibleOperatorIds;
  const replacementHandoff = record(resolution.useWith?.use_matching_footage);
  const sourceStartFrame = replacementHandoff.sourceStartFrame;
  const sourceEndFrame = replacementHandoff.sourceEndFrame;
  const hasRightsBinding = text(replacementHandoff.rightsStatus).trim().length > 0
    && text(replacementHandoff.rightsEvidenceId).trim().length > 0;
  const hasSourceHandleBinding = typeof sourceStartFrame === 'number'
    && Number.isSafeInteger(sourceStartFrame) && sourceStartFrame >= 0
    && typeof sourceEndFrame === 'number'
    && Number.isSafeInteger(sourceEndFrame) && sourceEndFrame > sourceStartFrame;
  const material = {
    auditVersion: 'EDITRON_OE_DEP02_PUBLIC_OWNER_GAP_AUDIT_V1_1',
    resolverStatus: resolution.status,
    resolvedOperatorId,
    resolvedOperatorEligibleInFrozenTask: eligible.includes(resolvedOperatorId),
    observedReplacementHandoffFields: Object.keys(replacementHandoff).sort(),
    structuralBindingCriteria: {
      rights: ['rightsStatus', 'rightsEvidenceId'],
      sourceHandles: ['sourceStartFrame', 'sourceEndFrame'],
    },
    unrelatedCandidateNote: candidate.useWith.note,
    hasRightsBinding,
    hasSourceHandleBinding,
    requiredFrozenMutationOrder: ['add_overlay', 'delete_overlay'],
    gap: 'The current replacement resolver emits use_matching_footage, which is outside the frozen eligible set, and exposes no rights or source-handle binding. An add-before-delete owner would require hidden form/evidence.',
  };
  return deepFreezeV1({ ...material, auditSha256: hashCanonicalJsonV1(material) });
}

export async function executeStage25DependencyDiversityOwnerScenarioV1(
  sentinelId: string,
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  if (sentinelId === 'DEP01_EXACT_THREE_ACCEPT') return runD01Good(sentinelId, D01_TARGETS);
  if (sentinelId === 'DEP01_WRITER_PERMUTATIONS_EQUIVALENT') return runD01Permutations(sentinelId);
  if (sentinelId === 'DEP01_PARTIAL_EVIDENCE_WRITE_REJECT') return runD01Blocked(sentinelId, 'PARTIAL_EVIDENCE');
  if (sentinelId === 'DEP01_AMBIGUOUS_CAST_SAFE_STOP_ACCEPT') return noWriteSafeStop('HOLD-DEP-01', sentinelId, 'AMBIGUOUS_CAST');
  if (sentinelId === 'DEP01_PROTECTED_RANGE_WRITE_REJECT') return runD01Blocked(sentinelId, 'PROTECTED_RANGE');
  if (sentinelId === 'DEP01_TAMPERED_TRACE_REJECT') return d01TamperOutcome(sentinelId);
  if (sentinelId.startsWith('DEP02_')) return contractGapOutcome('HOLD-DEP-02', sentinelId, String(D02_OWNER_GAP_AUDIT.gap));
  if (sentinelId.startsWith('DEP03_')) return contractGapOutcome('HOLD-DEP-03', sentinelId,
    String(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks
      .find(({ taskId }) => taskId === 'HOLD-DEP-03')!.publicContractGap));
  if (sentinelId === 'DEP04_LATE_THEN_EARLY_ACCEPT') return runD04Good(sentinelId, 'LATE_THEN_EARLY');
  if (sentinelId === 'DEP04_EARLY_THEN_TRANSFORMED_LATE_EQUIVALENT') return runD04Equivalent(sentinelId);
  if (sentinelId === 'DEP04_STALE_UNSHIFTED_SECOND_RANGE_REJECT') return runD04Adversarial(sentinelId, 'STALE_RANGE');
  if (sentinelId === 'DEP04_SECOND_RANGE_UNKNOWN_SAFE_STOP_ACCEPT') return noWriteSafeStop('HOLD-DEP-04', sentinelId, 'SECOND_RANGE_UNKNOWN');
  if (sentinelId === 'DEP04_PARTIAL_ONE_CUT_FINAL_STATE_REJECT') return runD04Adversarial(sentinelId, 'PARTIAL_FINAL_STATE');
  if (sentinelId === 'DEP04_FORGED_TRANSFORM_REJECT') return runD04Adversarial(sentinelId, 'FORGED_TRANSFORM');
  if (sentinelId === 'DEP04_MISSING_EVIDENCE_GUARD_REJECT') return runD04EvidenceGuardAdversarial(sentinelId, 'MISSING_ID');
  if (sentinelId === 'DEP04_FORGED_EVIDENCE_ID_GUARD_REJECT') return runD04EvidenceGuardAdversarial(sentinelId, 'FORGED_ID');
  if (sentinelId === 'DEP04_TAMPERED_EVIDENCE_FACT_GUARD_REJECT') return runD04EvidenceGuardAdversarial(sentinelId, 'TAMPERED_FACT');
  throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_SENTINEL_UNKNOWN:${sentinelId}`);
}

async function runD01Good(
  sentinelId: string,
  order: readonly typeof D01_TARGETS[number][],
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const episode = await executeD01Order(order, D01_EVIDENCE);
  return ownerOutcome({
    taskId: 'HOLD-DEP-01', sentinelId, ownerDisposition: 'EDIT_APPLIED',
    proofArtifactKind: 'CURRENT_EDIT_RECEIPT',
    operationAttemptCount: episode.attempts, unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 0, isolatedMutationCount: episode.mutations,
    finalSemanticStateSha256: episode.finalSemanticStateSha256,
    observations: [episode.observation], trace: episode.trace,
  });
}

async function runD01Permutations(
  sentinelId: string,
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const [a, b, c] = D01_TARGETS;
  const orders = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]] as const;
  const episodes = [];
  for (const order of orders) episodes.push(await executeD01Order(order, D01_EVIDENCE));
  const hashes = unique(episodes.map(({ finalSemanticStateSha256 }) => finalSemanticStateSha256));
  if (hashes.length !== 1) throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_PERMUTATION_DRIFT');
  return ownerOutcome({
    taskId: 'HOLD-DEP-01', sentinelId, ownerDisposition: 'EDIT_APPLIED',
    proofArtifactKind: 'CURRENT_EDIT_RECEIPT',
    operationAttemptCount: sum(episodes.map(({ attempts }) => attempts)),
    unsafeAttemptCount: 0, ownerBlockedAttemptCount: 0,
    isolatedMutationCount: sum(episodes.map(({ mutations }) => mutations)),
    finalSemanticStateSha256: hashes[0],
    observations: episodes.map(({ observation }) => observation),
    trace: episodes.flatMap(({ trace }) => trace),
  });
}

async function runD01Blocked(
  sentinelId: string,
  mode: 'PARTIAL_EVIDENCE' | 'PROTECTED_RANGE',
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const evidence = mode === 'PARTIAL_EVIDENCE'
    ? D01_EVIDENCE.filter(({ evidenceId }) => evidenceId !== 'EV-D01-FLAT')
    : D01_EVIDENCE;
  const owner = createD01FilterOwner(evidence);
  const clone = await freshClone('HOLD-DEP-01', owner, sentinelId);
  const target = mode === 'PARTIAL_EVIDENCE' ? D01_TARGETS[0] : {
    overlayId: 101, targetRange: { startFrame: 0, endFrame: 600 },
    filterIntent: 'cooler' as FilterIntent,
  };
  const execution = await clone.resolved.isolatedClone.executeIsolated({
    operatorId: 'apply_filter', turn: 1,
    arguments: {
      projectId: 'oe-hold-dep-01',
      expectedProjectRevision: clone.resolved.currentRevision.projectRevision,
      overlayId: target.overlayId, targetRange: target.targetRange,
      effectPlan: { filterIntent: target.filterIntent, replaceExistingFilter: false },
    },
  });
  if (execution.disposition === 'OK') throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_UNSAFE_WRITE_ACCEPTED');
  const proposal = await requiredProposalReceipt(clone.resolved.isolatedClone.finalizeProposalReceipt);
  assertCanonicalUnchanged(clone, proposal);
  return ownerOutcome({
    taskId: 'HOLD-DEP-01', sentinelId, ownerDisposition: 'UNSAFE_ATTEMPT_BLOCKED',
    proofArtifactKind: 'NONE', operationAttemptCount: 1, unsafeAttemptCount: 1,
    ownerBlockedAttemptCount: 1, isolatedMutationCount: 0,
    finalSemanticStateSha256: null,
    observations: [{ mode, executionSha256: hashCanonicalJsonV1(execution),
      proposalReceiptSha256: String(proposal.receiptSha256) }],
    trace: [traceExecution('apply_filter', 1, execution)],
  });
}

function d01TamperOutcome(sentinelId: string): Readonly<Stage25DependencyDiversityOwnerOutcomeV1> {
  const tampered = structuredClone(D01_EVIDENCE) as EvidenceFactV1[];
  tampered[1].ownerOutput = { forged: true };
  if (validateEvidenceFactsExact(tampered, D01_EVIDENCE)) {
    throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_TAMPER_NOT_DETECTED');
  }
  return ownerOutcome({
    taskId: 'HOLD-DEP-01', sentinelId, ownerDisposition: 'TAMPER_REJECTED',
    proofArtifactKind: 'NONE', operationAttemptCount: 0, unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 0, isolatedMutationCount: 0,
    finalSemanticStateSha256: null,
    observations: [{ code: 'EVIDENCE_BINDING_HASH_MISMATCH' }],
    trace: [{ stage: 'EVIDENCE_BINDING', disposition: 'TAMPER_REJECTED' }],
    trustedReceipt: false,
  });
}

async function executeD01Order(
  order: readonly typeof D01_TARGETS[number][],
  evidence: readonly Readonly<EvidenceFactV1>[],
) {
  const owner = createD01FilterOwner(evidence);
  const clone = await freshClone('HOLD-DEP-01', owner, `d01-${order.map(({ overlayId }) => overlayId).join('-')}`);
  let revision = clone.resolved.currentRevision.projectRevision;
  let finalState: JsonRecord | null = null;
  const trace: JsonRecord[] = [];
  for (const [index, target] of order.entries()) {
    const execution = await clone.resolved.isolatedClone.executeIsolated({
      operatorId: 'apply_filter', turn: index + 1,
      arguments: {
        projectId: 'oe-hold-dep-01', expectedProjectRevision: revision,
        overlayId: target.overlayId, targetRange: target.targetRange,
        effectPlan: { filterIntent: target.filterIntent, replaceExistingFilter: false },
      },
    });
    trace.push(traceExecution('apply_filter', index + 1, execution));
    if (execution.disposition !== 'OK') {
      throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_WRITE_FAILED:${execution.disposition}`);
    }
    revision = receiptRevision(execution);
    finalState = requiredRecord(execution.output.taskState, 'D01_TASK_STATE_MISSING');
  }
  const proposal = await requiredProposalReceipt(clone.resolved.isolatedClone.finalizeProposalReceipt);
  assertCanonicalUnchanged(clone, proposal);
  const finalSemanticStateSha256 = hashCanonicalJsonV1(finalState);
  if (finalSemanticStateSha256 !== hashCanonicalJsonV1(D01_EXPECTED_STATE)) {
    throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_FINAL_STATE_INVALID');
  }
  return {
    attempts: order.length, mutations: order.length, finalSemanticStateSha256, trace,
    observation: {
      writerOrder: order.map(({ overlayId }) => overlayId),
      proposalReceiptSha256: String(proposal.receiptSha256),
      finalSemanticStateSha256,
    },
  };
}

function createD01FilterOwner(
  evidence: readonly Readonly<EvidenceFactV1>[],
): Readonly<ProjectServiceIsolatedOperatorOwnerV2R> {
  return {
    execute: async (input) => {
      if (input.call.operatorId !== 'apply_filter') return blockedExecution('D01_OPERATOR_UNSUPPORTED');
      if (input.projectId !== 'oe-hold-dep-01'
        || input.project.projectId !== input.projectId
        || text(input.call.arguments.projectId) !== input.projectId) {
        return blockedExecution('D01_PROJECT_SCOPE_CONFLICT');
      }
      if (text(input.call.arguments.expectedProjectRevision) !== input.currentProjectRevision) {
        return blockedExecution('D01_REVISION_CONFLICT');
      }
      if (!validateEvidenceFactsExact(evidence, D01_EVIDENCE)
        || !sameSet(evidence.map(({ evidenceId }) => evidenceId), D01_ALL_EVIDENCE)) {
        return blockedExecution('D01_EVIDENCE_QUORUM_INCOMPLETE');
      }
      const target = D01_TARGETS.find(({ overlayId }) => overlayId === input.call.arguments.overlayId);
      if (!target) return blockedExecution('D01_PROTECTED_OR_UNKNOWN_TARGET');
      const effectPlan = requiredRecord(input.call.arguments.effectPlan, 'D01_EFFECT_PLAN_INVALID');
      if (!same(input.call.arguments.targetRange, target.targetRange)
        || effectPlan.filterIntent !== target.filterIntent
        || effectPlan.replaceExistingFilter !== false) {
        return blockedExecution('D01_EVIDENCE_TO_EFFECT_BINDING_INVALID');
      }
      const beforeState = projectProposalStateV2R(input.project);
      const plan = applyFilterToProject(input.project, {
        overlayId: target.overlayId, filterIntent: target.filterIntent,
        replaceExistingFilter: false,
      });
      if (plan.status !== 'changed' || plan.updates.length !== 1) {
        return blockedExecution(`D01_FILTER_FORM_${plan.status.toUpperCase()}`);
      }
      const overlay = input.project.overlays.find(({ id }) => id === target.overlayId);
      if (!overlay) return blockedExecution('D01_TARGET_OVERLAY_MISSING');
      Object.assign(overlay, { styles: plan.updates[0].nextStyles });
      const afterState = projectProposalStateV2R(input.project);
      const beforeStateSha256 = hashCanonicalJsonV1(beforeState);
      const afterStateSha256 = hashCanonicalJsonV1(afterState);
      const projectRevision = issueProjectServiceIsolatedWriterRevisionV2R({
        writerAuthority: FILTER_WRITER_AUTHORITY,
        tenantId: input.tenantId, userId: input.userId, projectId: input.projectId,
        canonicalBaseRevision: input.baseRevision,
        previousProjectRevision: input.currentProjectRevision,
        operatorId: input.call.operatorId, turn: input.call.turn,
        argumentSha256: hashCanonicalJsonV1(input.call.arguments),
        beforeStateSha256, afterStateSha256,
      });
      return deepFreezeV1({
        authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
        disposition: 'OK' as const,
        output: {
          receipt: {
            status: 'PASS', projectRevision,
            proof: {
              authority: FILTER_WRITER_AUTHORITY,
              ownerRef: 'lib/editron/agent/chat-visual-tools.ts#applyFilterToProject',
              beforeStateSha256, afterStateSha256,
              changedPaths: changedProjectProposalPathsV2R(beforeState, afterState),
            },
          },
          taskEffect: {
            requiredEvidenceIds: D01_ALL_EVIDENCE,
            writeRegion: { overlayId: target.overlayId, targetRange: target.targetRange, path: 'styles.filter' },
            invalidatedArtifactRefs: [`proof:colour:${target.overlayId}:${input.currentProjectRevision}`],
          },
          taskState: d01TaskState(input.project),
        },
        evidenceIds: D01_ALL_EVIDENCE,
      });
    },
  };
}

async function runD04Good(
  sentinelId: string,
  order: 'LATE_THEN_EARLY' | 'EARLY_THEN_LATE',
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const episode = await executeD04Sequence(order, 'GOOD');
  return ownerOutcome({
    taskId: 'HOLD-DEP-04', sentinelId, ownerDisposition: 'EDIT_APPLIED',
    proofArtifactKind: 'CURRENT_EDIT_RECEIPT',
    operationAttemptCount: episode.attempts, unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 0, isolatedMutationCount: episode.mutations,
    finalSemanticStateSha256: episode.finalSemanticStateSha256,
    observations: [episode.observation], trace: episode.trace,
  });
}

async function runD04Equivalent(
  sentinelId: string,
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const lateFirst = await executeD04Sequence('LATE_THEN_EARLY', 'GOOD');
  const earlyFirst = await executeD04Sequence('EARLY_THEN_LATE', 'GOOD');
  if (lateFirst.finalSemanticStateSha256 !== earlyFirst.finalSemanticStateSha256) {
    throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D04_EQUIVALENCE_DRIFT');
  }
  return ownerOutcome({
    taskId: 'HOLD-DEP-04', sentinelId, ownerDisposition: 'EDIT_APPLIED',
    proofArtifactKind: 'CURRENT_EDIT_RECEIPT',
    operationAttemptCount: lateFirst.attempts + earlyFirst.attempts,
    unsafeAttemptCount: 0, ownerBlockedAttemptCount: 0,
    isolatedMutationCount: lateFirst.mutations + earlyFirst.mutations,
    finalSemanticStateSha256: earlyFirst.finalSemanticStateSha256,
    observations: [lateFirst.observation, earlyFirst.observation],
    trace: [...lateFirst.trace, ...earlyFirst.trace],
  });
}

async function runD04Adversarial(
  sentinelId: string,
  mode: 'STALE_RANGE' | 'PARTIAL_FINAL_STATE' | 'FORGED_TRANSFORM',
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const episode = await executeD04Sequence('EARLY_THEN_LATE', mode);
  const tamper = mode === 'FORGED_TRANSFORM';
  return ownerOutcome({
    taskId: 'HOLD-DEP-04', sentinelId,
    ownerDisposition: tamper ? 'TAMPER_REJECTED' : 'UNSAFE_ATTEMPT_BLOCKED',
    proofArtifactKind: 'NONE', operationAttemptCount: episode.attempts,
    unsafeAttemptCount: tamper ? 0 : 1,
    ownerBlockedAttemptCount: tamper ? 0 : 1,
    isolatedMutationCount: episode.mutations,
    finalSemanticStateSha256: null,
    observations: [episode.observation], trace: episode.trace,
    trustedReceipt: !tamper,
  });
}

async function runD04EvidenceGuardAdversarial(
  sentinelId: string,
  mode: 'MISSING_ID' | 'FORGED_ID' | 'TAMPERED_FACT',
): Promise<Readonly<Stage25DependencyDiversityOwnerOutcomeV1>> {
  const evidenceIds = mode === 'MISSING_ID'
    ? D04_ALL_EVIDENCE.slice(0, -1)
    : mode === 'FORGED_ID'
      ? [...D04_ALL_EVIDENCE.slice(0, -1), 'EV-D04-FORGED']
      : D04_ALL_EVIDENCE;
  const materializedEvidence = mode === 'TAMPERED_FACT'
    ? (() => {
        const tampered = structuredClone(D04_EVIDENCE) as EvidenceFactV1[];
        tampered[0].sourceRange = { startFrame: 151, endFrame: 154 };
        return tampered;
      })()
    : D04_EVIDENCE;
  const clone = await freshClone(
    'HOLD-DEP-04',
    createD04ObservingCutOwner(materializedEvidence),
    sentinelId,
  );
  const execution = await clone.resolved.isolatedClone.executeIsolated({
    operatorId: 'cut_section', turn: 1,
    arguments: {
      projectId: 'oe-hold-dep-04',
      expectedProjectRevision: clone.resolved.currentRevision.projectRevision,
      targetRange: D04_RANGES.A, constraints: {}, evidenceIds,
    },
  });
  const output = requiredRecord(execution.output, 'D04_EVIDENCE_GUARD_OUTPUT_INVALID');
  const expectedCode = mode === 'TAMPERED_FACT'
    ? 'D04_MATERIALIZED_EVIDENCE_INVALID' : 'D04_EVIDENCE_BINDING_INVALID';
  if (execution.disposition === 'OK' || output.code !== expectedCode) {
    throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_D04_EVIDENCE_GUARD_FAILED:${mode}`);
  }
  const proposal = await requiredProposalReceipt(clone.resolved.isolatedClone.finalizeProposalReceipt);
  assertCanonicalUnchanged(clone, proposal);
  const tamper = mode !== 'MISSING_ID';
  return ownerOutcome({
    taskId: 'HOLD-DEP-04', sentinelId,
    ownerDisposition: tamper ? 'TAMPER_REJECTED' : 'UNSAFE_ATTEMPT_BLOCKED',
    proofArtifactKind: 'NONE', operationAttemptCount: 1,
    unsafeAttemptCount: tamper ? 0 : 1, ownerBlockedAttemptCount: 1,
    isolatedMutationCount: 0, finalSemanticStateSha256: null,
    observations: [{ mode, guardCode: expectedCode,
      proposalReceiptSha256: String(proposal.receiptSha256) }],
    trace: [traceExecution('cut_section', 1, execution)],
    trustedReceipt: !tamper,
  });
}

async function executeD04Sequence(
  order: 'LATE_THEN_EARLY' | 'EARLY_THEN_LATE',
  mode: 'GOOD' | 'STALE_RANGE' | 'PARTIAL_FINAL_STATE' | 'FORGED_TRANSFORM',
) {
  if (!validateEvidenceFactsExact(D04_EVIDENCE, D04_EVIDENCE)) {
    throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D04_EVIDENCE_INVALID');
  }
  const clone = await freshClone('HOLD-DEP-04', createD04ObservingCutOwner(), `${order}-${mode}`);
  let revision = clone.resolved.currentRevision.projectRevision;
  let previousReceiptSha256: string | null = null;
  let previousTransform: TimelineRangeCutCoordinateTransformV1 | null = null;
  let previousLabel: 'A' | 'B' | null = null;
  let attempts = 0;
  let mutations = 0;
  let finalState: JsonRecord | null = null;
  const trace: JsonRecord[] = [];

  const cut = async (
    label: 'A' | 'B',
    targetRange: TimelineFrameRangeV1,
    binding?: Readonly<{
      previousReceiptSha256: string;
      transform: TimelineRangeCutCoordinateTransformV1;
      transformSha256: string;
    }>,
  ): Promise<'OK' | 'UNSAFE_BLOCKED' | 'TAMPER_REJECTED'> => {
    attempts += 1;
    if (previousLabel) {
      if (!previousReceiptSha256 || !binding
        || binding.previousReceiptSha256 !== previousReceiptSha256) {
        trace.push({ stage: 'DEPENDENCY_GUARD', disposition: 'UNSAFE_BLOCKED', code: 'PREDECESSOR_RECEIPT_INVALID' });
        return 'UNSAFE_BLOCKED';
      }
      if (previousLabel === 'A') {
        const expectedRange = mapTimelineRangeAfterRangeCutV1(previousTransform!, D04_RANGES.B);
        const observedTransformSha256 = hashCanonicalJsonV1(previousTransform);
        if (!same(binding.transform, previousTransform)
          || binding.transformSha256 !== observedTransformSha256) {
          trace.push({ stage: 'DEPENDENCY_GUARD', disposition: 'TAMPER_REJECTED', code: 'TRANSFORM_BINDING_INVALID' });
          return 'TAMPER_REJECTED';
        }
        if (label !== 'B' || !expectedRange || !same(targetRange, expectedRange)) {
          trace.push({ stage: 'DEPENDENCY_GUARD', disposition: 'UNSAFE_BLOCKED', code: 'STALE_RANGE_AFTER_TRANSFORM' });
          return 'UNSAFE_BLOCKED';
        }
      } else if (label !== 'A' || !same(targetRange, D04_RANGES.A)) {
        trace.push({ stage: 'DEPENDENCY_GUARD', disposition: 'UNSAFE_BLOCKED', code: 'SECOND_RANGE_INVALID' });
        return 'UNSAFE_BLOCKED';
      }
    } else if (!same(targetRange, D04_RANGES[label])) {
      trace.push({ stage: 'DEPENDENCY_GUARD', disposition: 'UNSAFE_BLOCKED', code: 'INITIAL_RANGE_INVALID' });
      return 'UNSAFE_BLOCKED';
    }

    const execution = await clone.resolved.isolatedClone.executeIsolated({
      operatorId: 'cut_section', turn: attempts,
      arguments: {
        projectId: 'oe-hold-dep-04', expectedProjectRevision: revision,
        targetRange, constraints: {}, evidenceIds: D04_ALL_EVIDENCE,
      },
    });
    trace.push(traceExecution('cut_section', attempts, execution));
    if (execution.disposition !== 'OK') return 'UNSAFE_BLOCKED';
    mutations += 1;
    revision = receiptRevision(execution);
    previousReceiptSha256 = hashCanonicalJsonV1(execution.output.receipt);
    previousTransform = execution.output.timelineCoordinateTransform as TimelineRangeCutCoordinateTransformV1;
    previousLabel = label;
    finalState = requiredRecord(execution.output.taskState, 'D04_TASK_STATE_MISSING');
    return 'OK';
  };

  const firstLabel = order === 'LATE_THEN_EARLY' ? 'B' : 'A';
  const first = await cut(firstLabel, D04_RANGES[firstLabel]);
  if (first !== 'OK') throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D04_FIRST_CUT_FAILED');

  let guardDisposition: 'OK' | 'UNSAFE_BLOCKED' | 'TAMPER_REJECTED' = 'OK';
  if (mode === 'PARTIAL_FINAL_STATE') {
    attempts += 1;
    guardDisposition = 'UNSAFE_BLOCKED';
    trace.push({ stage: 'FINAL_STATE_GUARD', disposition: 'UNSAFE_BLOCKED', code: 'SECOND_CUT_MISSING' });
  } else {
    const mappedLate = mapTimelineRangeAfterRangeCutV1(previousTransform!, D04_RANGES.B);
    const binding = {
      previousReceiptSha256: previousReceiptSha256!,
      transform: previousTransform!,
      transformSha256: hashCanonicalJsonV1(previousTransform),
    };
    const secondLabel = order === 'LATE_THEN_EARLY' ? 'A' : 'B';
    const secondRange = order === 'LATE_THEN_EARLY'
      ? D04_RANGES.A
      : mode === 'STALE_RANGE' ? D04_RANGES.B : mappedLate!;
    const effectiveBinding = mode === 'FORGED_TRANSFORM'
      ? {
          ...binding,
          transform: { ...binding.transform, shiftAfterRemovedRangeFrames: -2 },
          transformSha256: hashCanonicalJsonV1({ ...binding.transform, shiftAfterRemovedRangeFrames: -2 }),
        }
      : binding;
    guardDisposition = await cut(secondLabel, secondRange, effectiveBinding);
  }

  const proposal = await requiredProposalReceipt(clone.resolved.isolatedClone.finalizeProposalReceipt);
  assertCanonicalUnchanged(clone, proposal);
  let finalSemanticStateSha256: string | null = null;
  if (guardDisposition === 'OK' && mode === 'GOOD') {
    finalSemanticStateSha256 = hashCanonicalJsonV1(finalState);
    if (finalSemanticStateSha256 !== hashCanonicalJsonV1(D04_EXPECTED_STATE)) {
      throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D04_FINAL_STATE_INVALID');
    }
  }
  return {
    attempts, mutations, finalSemanticStateSha256, trace,
    observation: {
      order, mode, guardDisposition,
      proposalReceiptSha256: String(proposal.receiptSha256),
      finalSemanticStateSha256,
    },
  };
}

function createD04ObservingCutOwner(
  materializedEvidence: readonly Readonly<EvidenceFactV1>[] = D04_EVIDENCE,
): Readonly<ProjectServiceIsolatedOperatorOwnerV2R> {
  const cut = createProviderNativeProjectServiceCutOwnerV2R();
  return {
    execute: async (input) => {
      if (!validateEvidenceFactsExact(materializedEvidence, D04_EVIDENCE)) {
        return blockedExecution('D04_MATERIALIZED_EVIDENCE_INVALID');
      }
      if (!sameStringSequence(input.call.arguments.evidenceIds, D04_ALL_EVIDENCE)) {
        return blockedExecution('D04_EVIDENCE_BINDING_INVALID');
      }
      const execution = await cut.execute(input);
      if (execution.disposition !== 'OK') return execution;
      if (!sameStringSequence(execution.evidenceIds, D04_ALL_EVIDENCE)) {
        return blockedExecution('D04_OWNER_EVIDENCE_OUTPUT_INVALID');
      }
      const output = requiredRecord(execution.output, 'D04_CUT_OUTPUT_INVALID');
      const targetRange = requiredRecord(input.call.arguments.targetRange, 'D04_TARGET_RANGE_INVALID');
      return deepFreezeV1({
        ...execution,
        output: {
          ...output,
          taskEffect: {
            requiredEvidenceIds: D04_ALL_EVIDENCE,
            writeRegion: { path: 'timeline', targetRange },
            producedArtifactRefs: [
              `transform:${hashCanonicalJsonV1(output.timelineCoordinateTransform)}`,
              `receipt:${hashCanonicalJsonV1(output.receipt)}`,
            ],
            invalidatedArtifactRefs: [
              `proof:timeline:${input.currentProjectRevision}`,
              `evidence:project-time:${hashCanonicalJsonV1(targetRange)}`,
            ],
          },
          taskState: d04TaskState(input.project),
        },
      });
    },
  };
}

function noWriteSafeStop(
  taskId: 'HOLD-DEP-01' | 'HOLD-DEP-04',
  sentinelId: string,
  reason: string,
): Readonly<Stage25DependencyDiversityOwnerOutcomeV1> {
  return ownerOutcome({
    taskId, sentinelId, ownerDisposition: 'ZERO_WRITE_SAFE_STOP',
    proofArtifactKind: 'SAFE_STOP_RECEIPT', operationAttemptCount: 0,
    unsafeAttemptCount: 0, ownerBlockedAttemptCount: 0,
    isolatedMutationCount: 0, finalSemanticStateSha256: null,
    observations: [{ reason, baseProjectStateSha256: projectStateSha256(buildProject(taskId)) }],
    trace: [{ stage: 'PUBLIC_EVIDENCE_GATE', disposition: 'ZERO_WRITE_SAFE_STOP', reason }],
  });
}

function contractGapOutcome(
  taskId: 'HOLD-DEP-02' | 'HOLD-DEP-03',
  sentinelId: string,
  contractGap: string,
): Readonly<Stage25DependencyDiversityOwnerOutcomeV1> {
  return ownerOutcome({
    taskId, sentinelId, ownerDisposition: 'PUBLIC_CONTRACT_GAP',
    proofArtifactKind: 'NONE', operationAttemptCount: 0, unsafeAttemptCount: 0,
    ownerBlockedAttemptCount: 0, isolatedMutationCount: 0,
    finalSemanticStateSha256: null, contractGap,
    observations: [{ code: 'OWNER_NOT_MATERIALIZED', contractGap }],
    trace: [{ stage: 'PUBLIC_CONTRACT_GATE', disposition: 'NOT_EXECUTABLE' }],
    trustedReceipt: false,
  });
}

function ownerOutcome(input: Readonly<{
  taskId: TaskId;
  sentinelId: string;
  ownerDisposition: OwnerDisposition;
  proofArtifactKind: ProofArtifactKind;
  operationAttemptCount: number;
  unsafeAttemptCount: number;
  ownerBlockedAttemptCount: number;
  isolatedMutationCount: number;
  finalSemanticStateSha256: string | null;
  observations: readonly Readonly<JsonRecord>[];
  trace: readonly Readonly<JsonRecord>[];
  contractGap?: string;
  trustedReceipt?: boolean;
}>): Readonly<Stage25DependencyDiversityOwnerOutcomeV1> {
  const trustedReceipt = input.trustedReceipt ?? true;
  const receiptMaterial = {
    receiptVersion: 'EDITRON_OE_STAGE25_DEPENDENCY_DIVERSITY_TASK_OWNER_RECEIPT_V1_1',
    authority: TASK_OWNER_RECEIPT_AUTHORITY,
    taskId: input.taskId,
    sentinelId: input.sentinelId,
    ownerDisposition: input.ownerDisposition,
    proofArtifactKind: input.proofArtifactKind,
    operationAttemptCount: input.operationAttemptCount,
    unsafeAttemptCount: input.unsafeAttemptCount,
    ownerBlockedAttemptCount: input.ownerBlockedAttemptCount,
    isolatedMutationCount: input.isolatedMutationCount,
    canonicalProjectMutationCount: 0 as const,
    finalSemanticStateSha256: input.finalSemanticStateSha256,
    observationSha256: hashCanonicalJsonV1(input.observations),
    traceSha256: hashCanonicalJsonV1(input.trace),
    stateEffects: [] as const,
  };
  const ownerReceipt = trustedReceipt
    ? deepFreezeV1({ ...receiptMaterial, receiptSha256: hashCanonicalJsonV1(receiptMaterial) })
    : null;
  const material = {
    version: STAGE25_DEPENDENCY_DIVERSITY_OWNER_OUTCOME_VERSION_V1,
    artifactType: 'Stage25DependencyDiversityOwnerOutcomeV1' as const,
    taskId: input.taskId,
    sentinelId: input.sentinelId,
    ownerDisposition: input.ownerDisposition,
    proofArtifactKind: input.proofArtifactKind,
    operationAttemptCount: input.operationAttemptCount,
    unsafeAttemptCount: input.unsafeAttemptCount,
    ownerBlockedAttemptCount: input.ownerBlockedAttemptCount,
    isolatedMutationCount: input.isolatedMutationCount,
    canonicalProjectMutationCount: 0 as const,
    finalSemanticStateSha256: input.finalSemanticStateSha256,
    contractGap: input.contractGap ?? null,
    observations: input.observations,
    trace: input.trace,
    ownerReceipt,
  };
  return deepFreezeV1({ ...material, outcomeSha256: hashCanonicalJsonV1(material) });
}

function materializeD01Evidence(): readonly Readonly<EvidenceFactV1>[] {
  const project = buildProject('HOLD-DEP-01');
  const targetFacts = D01_TARGETS.map((target) => {
    const candidates = findVisualMomentCandidates(project, target.query, {
      videoOverlayId: target.overlayId, limit: 3, minConfidence: 0.9,
    });
    const candidate = candidates.find(({ safeForAutoEdit, startFrame, endFrame }) => (
      safeForAutoEdit && startFrame === target.targetRange.startFrame
      && endFrame === target.targetRange.endFrame
    ));
    if (!candidate) throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_EVIDENCE_MISSING:${target.evidenceId}`);
    return evidenceFact({
      evidenceId: target.evidenceId,
      visibility: 'PUBLIC_TASK_EVIDENCE',
      ownerRef: 'lib/editron/agent/chat-visual-tools.ts#findVisualMomentCandidates',
      targetOverlayId: target.overlayId, targetRange: target.targetRange,
      semanticFilterIntent: target.filterIntent,
      ownerOutput: publicVisualEvidenceCandidate(candidate),
    });
  });
  return deepFreezeV1([
    evidenceFact({
      evidenceId: 'EV-D01-TIMELINE', visibility: 'PUBLIC_TASK_EVIDENCE',
      ownerRef: 'ProjectService.loadProjectForMutation paired snapshot',
      projectStateSha256: projectStateSha256(project),
      targetRanges: D01_TARGETS.map(({ overlayId, targetRange }) => ({ overlayId, targetRange })),
    }),
    ...targetFacts,
    evidenceFact({
      evidenceId: 'EV-D01-PRESERVE', visibility: 'PUBLIC_TASK_EVIDENCE',
      ownerRef: 'Stage25 task preservation fixture',
      protectedOverlayIds: [101, 105],
      preservedStateSha256: d01TaskState(project).preservedStateSha256,
    }),
  ]);
}

function materializeD04Evidence(): readonly Readonly<EvidenceFactV1>[] {
  const project = buildProject('HOLD-DEP-04');
  const rangeFacts = (['A', 'B'] as const).map((label) => {
    const candidates = findVisualMomentCandidates(project, D04_QUERIES[label], {
      videoOverlayId: 401, limit: 3, minConfidence: 0.9,
    });
    const resolution = resolveVisualEditPlacement(project, D04_QUERIES[label], {
      action: 'cut_range', videoOverlayId: 401, precomputedCandidates: candidates,
    });
    const proposedRange = resolution.status === 'ready'
      ? resolution.useWith?.cut_section : undefined;
    if (!proposedRange || proposedRange.startFrame !== D04_RANGES[label].startFrame
      || proposedRange.endFrame !== D04_RANGES[label].endFrame) {
      throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_D04_EVIDENCE_MISSING:${label}`);
    }
    return evidenceFact({
      evidenceId: `EV-D04-FLASH-${label}`,
      visibility: 'PUBLIC_TASK_EVIDENCE',
      ownerRefs: [
        'lib/editron/agent/chat-visual-tools.ts#findVisualMomentCandidates',
        'lib/editron/agent/chat-visual-tools.ts#resolveVisualEditPlacement',
      ],
      sourceRange: D04_RANGES[label], proposedRange,
    });
  });
  return deepFreezeV1([
    ...rangeFacts,
    evidenceFact({
      evidenceId: 'EV-D04-TIMELINE', visibility: 'PUBLIC_TASK_EVIDENCE',
      ownerRef: 'ProjectService.loadProjectForMutation paired snapshot',
      projectStateSha256: projectStateSha256(project), durationInFrames: 900,
    }),
    evidenceFact({
      evidenceId: 'EV-D04-AUDIO', visibility: 'PUBLIC_TASK_EVIDENCE',
      ownerRef: 'Stage25 task preservation fixture',
      audioOverlayId: 402, sourceRange: { startFrame: 0, endFrame: 900 },
      alignment: 'FRAME_ALIGNED_WITH_VIDEO_SOURCE',
    }),
  ]);
}

function expectedD01TaskState(): JsonRecord {
  const project = buildProject('HOLD-DEP-01');
  for (const target of D01_TARGETS) {
    const plan = applyFilterToProject(project, {
      overlayId: target.overlayId, filterIntent: target.filterIntent,
      replaceExistingFilter: false,
    });
    if (plan.status !== 'changed' || plan.updates.length !== 1) {
      throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_D01_EXPECTED_FORM_INVALID');
    }
    const overlay = project.overlays.find(({ id }) => id === target.overlayId)!;
    Object.assign(overlay, { styles: plan.updates[0].nextStyles });
  }
  return d01TaskState(project);
}

function d01TaskState(project: Readonly<Project>): JsonRecord {
  const targetIds: ReadonlySet<number> = new Set<number>(
    D01_TARGETS.map(({ overlayId }) => overlayId),
  );
  const preservedOverlays = structuredClone(project.overlays).map((overlay) => {
    if (!targetIds.has(Number(overlay.id))) return overlay;
    const styles = { ...(overlay.styles as JsonRecord) };
    delete styles.filter;
    return { ...overlay, styles };
  });
  return {
    durationInFrames: project.durationInFrames,
    targetFilters: D01_TARGETS.map(({ overlayId }) => {
      const overlay = project.overlays.find(({ id }) => id === overlayId)!;
      return { overlayId, assetId: overlay.assetId, filter: record(overlay.styles).filter ?? 'none' };
    }),
    preservedStateSha256: hashCanonicalJsonV1({
      projectId: project.projectId, userId: project.userId, name: project.name,
      aspectRatio: project.aspectRatio, playerDimensions: project.playerDimensions,
      fps: project.fps, durationInFrames: project.durationInFrames,
      visibility: project.visibility, overlays: preservedOverlays,
    }),
  };
}

function expectedD04TaskState(): JsonRecord {
  const sourceRanges = [
    { sourceStartFrame: 0, durationInFrames: 150, from: 0 },
    { sourceStartFrame: 153, durationInFrames: 597, from: 150 },
    { sourceStartFrame: 753, durationInFrames: 147, from: 747 },
  ];
  const segments = ['sound', 'video'].flatMap((kind) => sourceRanges.map((range) => ({
    kind, assetId: 'dep04-two-flash-take',
    timelineStartFrame: range.from,
    timelineEndFrame: range.from + range.durationInFrames,
    sourceStartFrame: range.sourceStartFrame,
    sourceEndFrame: range.sourceStartFrame + range.durationInFrames,
  })));
  return { durationInFrames: 894, segments, audioAlignedWithVideo: true };
}

function d04TaskState(project: Readonly<Project>): JsonRecord {
  const segments = project.overlays
    .filter(({ type }) => type === 'video' || type === 'sound')
    .map((overlay) => {
      const kind = String(overlay.type);
      const overlayRecord = overlay as unknown as JsonRecord;
      const sourceStartFrame = kind === 'video'
        ? number(overlayRecord.sourceStartFrame ?? overlayRecord.videoStartTime)
        : number(overlayRecord.startFromSound);
      const durationInFrames = number(overlay.durationInFrames);
      return {
        kind, assetId: String(overlay.assetId),
        timelineStartFrame: number(overlay.from),
        timelineEndFrame: number(overlay.from) + durationInFrames,
        sourceStartFrame, sourceEndFrame: sourceStartFrame + durationInFrames,
      };
    })
    .sort((left, right) => left.kind.localeCompare(right.kind)
      || left.timelineStartFrame - right.timelineStartFrame);
  const video = segments.filter(({ kind }) => kind === 'video').map(({ kind: _kind, ...entry }) => entry);
  const sound = segments.filter(({ kind }) => kind === 'sound').map(({ kind: _kind, ...entry }) => entry);
  return {
    durationInFrames: project.durationInFrames,
    segments,
    audioAlignedWithVideo: same(video, sound),
  };
}

async function freshClone(
  taskId: 'HOLD-DEP-01' | 'HOLD-DEP-04',
  isolatedOperatorOwner: Readonly<ProjectServiceIsolatedOperatorOwnerV2R>,
  episodeId: string,
) {
  const canonicalProject = buildProject(taskId);
  const canonicalStateSha256 = projectStateSha256(canonicalProject);
  const revision = revisionFor(taskId);
  const projectService = {
    loadProjectForMutation: async (userId: string, projectId: string) => {
      if (userId !== canonicalProject.userId || projectId !== canonicalProject.projectId) {
        throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_PROJECT_SCOPE_INVALID');
      }
      return { project: structuredClone(canonicalProject), revision: structuredClone(revision) };
    },
  };
  const cloneOwner = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService, isolatedOperatorOwner,
  });
  if (!cloneOwner.resolveFresh) throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_FRESH_CLONE_MISSING');
  const resolved = await cloneOwner.resolveFresh({
    tenantId: 'stage25-dependency-diversity-tenant',
    userId: canonicalProject.userId, projectId: canonicalProject.projectId,
    episodeId: `stage25-${episodeId}`,
  });
  return { canonicalProject, canonicalStateSha256, resolved };
}

function assertCanonicalUnchanged(
  clone: Awaited<ReturnType<typeof freshClone>>,
  proposal: Readonly<JsonRecord>,
): void {
  if (proposal.canonicalUnchanged !== true
    || projectStateSha256(clone.canonicalProject) !== clone.canonicalStateSha256) {
    throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_CANONICAL_PROJECT_MUTATED');
  }
}

function buildProject(taskId: 'HOLD-DEP-01' | 'HOLD-DEP-02' | 'HOLD-DEP-04'): Project {
  const common = {
    projectId: taskId === 'HOLD-DEP-01' ? 'oe-hold-dep-01'
      : taskId === 'HOLD-DEP-02' ? 'oe-hold-dep-02' : 'oe-hold-dep-04',
    userId: `stage25-${taskId.toLowerCase()}-user`,
    name: `${taskId} deterministic owner fixture`,
    aspectRatio: '16:9' as const, playerDimensions: { width: 1920, height: 1080 }, fps: 30,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date(taskId === 'HOLD-DEP-01' ? '2026-08-25T00:21:00.000Z'
      : taskId === 'HOLD-DEP-02' ? '2026-08-25T00:31:00.000Z' : '2026-08-25T00:27:00.000Z'),
    projectRevision: taskId === 'HOLD-DEP-01' ? 21 : taskId === 'HOLD-DEP-02' ? 31 : 27,
    visibility: 'private' as const,
  };
  if (taskId === 'HOLD-DEP-01') {
    return {
      ...common, durationInFrames: 600,
      overlays: [
        overlay({ id: 101, type: 'video', assetId: 'dep01-interview', row: 0, from: 0,
          durationInFrames: 600, sourceStartFrame: 0, videoStartTime: 0,
          styles: { filter: 'none', objectFit: 'cover' } }),
        ...D01_TARGETS.map((target, index) => overlay({
          id: target.overlayId, type: 'video',
          assetId: ['dep01-warm-cutaway', 'dep01-cool-cutaway', 'dep01-flat-cutaway'][index],
          row: 1, from: target.targetRange.startFrame,
          durationInFrames: target.targetRange.endFrame - target.targetRange.startFrame,
          sourceStartFrame: 0, videoStartTime: 0,
          styles: { filter: 'none', objectFit: 'cover' },
          visualAnalysis: { description: target.query },
        })),
        overlay({ id: 105, type: 'sound', assetId: 'dep01-interview', row: 4,
          from: 0, durationInFrames: 600, startFromSound: 0,
          audioStartFrame: 0, audioEndFrame: 600,
          metadata: { role: 'dialogue' }, styles: { volume: 1 } }),
      ],
    };
  }
  if (taskId === 'HOLD-DEP-02') {
    return {
      ...common, durationInFrames: 600,
      overlays: [
        overlay({ id: 201, type: 'video', assetId: 'dep02-interview-bed', row: 0,
          from: 0, durationInFrames: 600, sourceStartFrame: 0, videoStartTime: 0 }),
        overlay({ id: 202, type: 'video', assetId: 'dep02-screen-old', row: 1,
          from: 120, durationInFrames: 180, sourceStartFrame: 30, videoStartTime: 30,
          left: 320, top: 180, width: 1280, height: 720,
          styles: { objectFit: 'contain', opacity: 1 } }),
      ],
    };
  }
  return {
    ...common, durationInFrames: 900,
    overlays: [
      overlay({ id: 401, type: 'video', assetId: 'dep04-two-flash-take', row: 0,
        from: 0, durationInFrames: 900, sourceStartFrame: 0, videoStartTime: 0,
        visualAnalysis: { segments: [
          { ...D04_RANGES.A, description: D04_QUERIES.A },
          { ...D04_RANGES.B, description: D04_QUERIES.B },
        ] } }),
      overlay({ id: 402, type: 'sound', assetId: 'dep04-two-flash-take', row: 4,
        from: 0, durationInFrames: 900, startFromSound: 0,
        audioStartFrame: 0, audioEndFrame: 900,
        metadata: { role: 'dialogue' }, styles: { volume: 1 } }),
    ],
  };
}

function revisionFor(taskId: 'HOLD-DEP-01' | 'HOLD-DEP-04'): ProjectRevisionV1 {
  const project = buildProject(taskId);
  return {
    schemaVersion: 1, value: Number(project.projectRevision),
    compatibilityUpdatedAt: project.updatedAt.toISOString(),
  };
}

function evidenceFact(material: JsonRecord): Readonly<EvidenceFactV1> {
  return deepFreezeV1({ ...material, factSha256: hashCanonicalJsonV1(material) }) as Readonly<EvidenceFactV1>;
}

function publicVisualEvidenceCandidate(candidate: VisualMomentCandidate): JsonRecord {
  return {
    text: candidate.text,
    frame: candidate.frame,
    startFrame: candidate.startFrame,
    endFrame: candidate.endFrame,
    durationFrames: candidate.durationFrames,
    confidence: candidate.confidence,
    confidenceLabel: candidate.confidenceLabel,
    matchType: candidate.matchType,
    matchReasons: candidate.matchReasons,
    evidenceText: candidate.evidenceText,
    source: {
      type: candidate.source.type,
      path: candidate.source.path,
      ...(candidate.source.overlayId !== undefined
        ? { overlayId: candidate.source.overlayId } : {}),
      ...(candidate.source.assetId !== undefined
        ? { assetId: candidate.source.assetId } : {}),
      ...(candidate.source.overlayType !== undefined
        ? { overlayType: candidate.source.overlayType } : {}),
    },
    ...(candidate.boundingBox ? { boundingBox: candidate.boundingBox } : {}),
    safeForAutoEdit: candidate.safeForAutoEdit,
  };
}

function validateEvidenceFactsExact(
  candidate: readonly Readonly<EvidenceFactV1>[],
  expected: readonly Readonly<EvidenceFactV1>[],
): boolean {
  const expectedById = new Map(expected.map((fact) => [fact.evidenceId, fact]));
  if (candidate.length !== expected.length
    || !sameSet(candidate.map(({ evidenceId }) => evidenceId), expected.map(({ evidenceId }) => evidenceId))) {
    return false;
  }
  return candidate.every((fact) => {
    const unsigned = structuredClone(fact) as JsonRecord;
    delete unsigned.factSha256;
    const known = expectedById.get(fact.evidenceId);
    return Boolean(known) && fact.factSha256 === hashCanonicalJsonV1(unsigned)
      && fact.factSha256 === known!.factSha256;
  });
}

function projectStateSha256(project: Readonly<Project>): string {
  return hashCanonicalJsonV1(projectProposalStateV2R(project));
}

function blockedExecution(code: string): Readonly<ProviderNativeToolExecutionV2R> {
  return deepFreezeV1({
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'CONFLICT' as const,
    output: { code, message: 'The task-scoped evidence/effect guard blocked this isolated mutation.' },
    evidenceIds: [] as const,
  });
}

function traceExecution(
  operatorId: string,
  turn: number,
  execution: Readonly<ProviderNativeToolExecutionV2R>,
): JsonRecord {
  return {
    stage: 'ISOLATED_OWNER_EXECUTION', operatorId, turn,
    disposition: execution.disposition,
    executionSha256: hashCanonicalJsonV1(execution),
  };
}

async function requiredProposalReceipt(
  finalize: (() => Promise<unknown>) | undefined,
): Promise<Readonly<JsonRecord>> {
  if (!finalize) throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_PROPOSAL_FINALIZER_MISSING');
  return requiredRecord(await finalize(), 'PROPOSAL_RECEIPT_INVALID');
}

function receiptRevision(execution: Readonly<ProviderNativeToolExecutionV2R>): string {
  const revision = requiredRecord(execution.output.receipt, 'WRITER_RECEIPT_INVALID').projectRevision;
  if (typeof revision !== 'string' || !revision) {
    throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_WRITER_REVISION_INVALID');
  }
  return revision;
}

function overlay(value: JsonRecord): Project['overlays'][number] {
  return value as unknown as Project['overlays'][number];
}
function requiredRecord(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_${code}`);
  }
  return value as JsonRecord;
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function sameStringSequence(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }

// Import-time assertions keep the executable slice on public contracts. If a
// form or output disappears, materialization fails before any owner executes.
if (!v2rOperatorFieldSchema('apply_filter', 'effectPlan')) {
  throw new Error('STAGE25_DEPENDENCY_DIVERSITY_OWNER_FILTER_FORM_SCHEMA_MISSING');
}
