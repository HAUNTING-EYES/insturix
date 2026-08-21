import holdoutV1Json from '@/tests/fixtures/editron/open-ended-planner-v1/holdout-tasks-v1.json';
import holdoutMediaIdentityJson
  from '@/tests/fixtures/editron/open-ended-planner-v2/holdout-media-identity-v2r.json';
import tasksV2Json from '@/tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json';

import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3 }
  from '../capability-census/cap2-current-truth-reissue-audit-v3';
import { buildCap2aPlannerToolSheetV2R } from './cap2a-planner-dossier-v2r';
import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG } from './operator-catalog-v2r';
import { assertNoEvaluatorLeakV2 } from './staged-packet-v2';

type JsonRecord = Record<string, unknown>;
type Evidence = { evidenceId: string; kind: string; binding: string; value: unknown };
type Condition = {
  conditionId: string; availableEvidenceIds: string[]; omittedEvidenceIds: string[];
  replacementEvidenceIds?: string[]; activePredicateIds: string[]; allowedDispositions: string[];
};
type V1Task = {
  taskId: string; project: JsonRecord & { assets: JsonRecord[] }; userRequest: string;
  behaviourBrief: JsonRecord; evidence: Evidence[];
  conditionEvidence: { C4_NOISY_OR_MISSING_EVIDENCE: { omitEvidenceIds: string[]; replaceEvidence: Evidence[] } };
  plannerEnvelope: JsonRecord; evaluatorOnly: JsonRecord;
};
type V2Task = {
  taskId: string; split: string; sealed: boolean; originalRequest: string;
  projectBinding: { projectId: string; projectRevision: string };
  mediaBindings: Array<{ assetId: string; recipeSha256: string }>;
  evidenceIds: string[]; predicates: JsonRecord[];
  conditionCases: Condition[]; evaluatorOnly: JsonRecord;
};

export const SEALED_HOLDOUT_COHORT_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_COHORT_V2R_1' as const;
export const SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R =
  'lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r.ts' as const;

export interface SealedHoldoutCaseV2R {
  caseId: string;
  publicCase: Readonly<JsonRecord>;
  ownerOnly: Readonly<JsonRecord>;
  evaluatorOnly: Readonly<JsonRecord>;
  publicCaseSha256: string;
  ownerOnlySha256: string;
  evaluatorOnlySha256: string;
}

export interface SealedHoldoutCohortManifestV2R {
  version: typeof SEALED_HOLDOUT_COHORT_VERSION_V2R;
  authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION';
  contractSource: Readonly<{ path: typeof SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R; sha256: string }>;
  cap2CurrentTruthBinding: Readonly<JsonRecord>;
  mediaIdentity: Readonly<JsonRecord>;
  sharedModelContext: Readonly<JsonRecord>;
  sharedModelContextSha256: string;
  cases: readonly Readonly<SealedHoldoutCaseV2R>[];
  executionPolicy: Readonly<JsonRecord>;
  manifestSha256: string;
}

export function buildSealedHoldoutCohortManifestV2R(
  contractSourceSha256: string,
): Readonly<SealedHoldoutCohortManifestV2R> {
  requireSha(contractSourceSha256, 'HOLDOUT_COHORT_SOURCE_HASH_INVALID');
  const operators = records(V2R_OPERATOR_CATALOG.operators);
  if (operators.length !== 40) fail('HOLDOUT_COHORT_OPERATOR_COUNT_INVALID');
  const planningToolSheet = buildCap2aPlannerToolSheetV2R(operators);
  const callableOperatorIds = operators
    .filter((operator) => text(operator.compilerEligibility) !== 'NOT_COMPILABLE')
    .map((operator) => text(operator.operatorId));
  const unavailableOperatorIds = operators
    .filter((operator) => text(operator.compilerEligibility) === 'NOT_COMPILABLE')
    .map((operator) => text(operator.operatorId));
  if (callableOperatorIds.length !== 33 || unavailableOperatorIds.length !== 7) {
    fail('HOLDOUT_COHORT_OPERATOR_ELIGIBILITY_DRIFT');
  }
  const sharedModelContext = deepFreezeV1({
    version: 'EDITRON_OE_SEALED_HOLDOUT_SHARED_MODEL_CONTEXT_V2R_1',
    rule: 'The same complete forty-operation dossier is supplied to every case; unavailable operations remain visible but cannot be called.',
    operatorCatalog: V2R_OPERATOR_CATALOG,
    planningToolSheet,
    callableOperatorIds,
    unavailableOperatorIds,
  });
  assertNoEvaluatorLeakV2(sharedModelContext);
  const sharedModelContextSha256 = hashCanonicalJsonV1(sharedModelContext);
  const v1Tasks = records(holdoutV1Json.tasks) as V1Task[];
  const v2Tasks = (records(tasksV2Json.tasks) as V2Task[])
    .filter(({ split, sealed }) => split === 'HOLDOUT' && sealed);
  if (v1Tasks.length !== 8 || v2Tasks.length !== 8) fail('HOLDOUT_COHORT_TASK_SET_INVALID');
  const cases = v2Tasks.flatMap((taskV2) => {
    const taskV1 = v1Tasks.find(({ taskId }) => taskId === taskV2.taskId);
    if (!taskV1 || taskV1.userRequest !== taskV2.originalRequest) {
      return fail(`HOLDOUT_COHORT_TASK_BINDING_INVALID:${taskV2.taskId}`);
    }
    return taskV2.conditionCases.map((condition, index) => buildCase({
      taskV1, taskV2, condition, conditionOrdinal: index + 1, sharedModelContextSha256,
    }));
  });
  if (cases.length !== 16 || new Set(cases.map(({ caseId }) => caseId)).size !== 16) {
    fail('HOLDOUT_COHORT_CASE_SET_INVALID');
  }
  const material = {
    version: SEALED_HOLDOUT_COHORT_VERSION_V2R,
    authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION' as const,
    contractSource: { path: SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R, sha256: contractSourceSha256 },
    cap2CurrentTruthBinding: {
      artifactType: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.artifactType,
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.manifestHash,
      normalizedSourceSnapshotSha256:
        CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V3.sourceBinding.normalizedSourceSnapshotHash,
      runtimeAuthorityDenied: true as const,
    },
    mediaIdentity: holdoutMediaIdentityJson as JsonRecord,
    sharedModelContext,
    sharedModelContextSha256,
    cases,
    executionPolicy: {
      networkCalls: 0 as const, inferenceCalls: 0 as const, projectReads: 0 as const,
      projectMutations: 0 as const, dispatchAuthorized: false as const,
      modelVisibleConditionNames: false as const,
    },
  };
  return deepFreezeV1({ ...material, manifestSha256: hashCanonicalJsonV1(material) });
}

export function assertSealedHoldoutCohortManifestV2R(
  candidate: unknown,
): Readonly<SealedHoldoutCohortManifestV2R> {
  if (!isRecord(candidate)) fail('HOLDOUT_COHORT_MANIFEST_MISSING');
  const manifest = candidate as unknown as SealedHoldoutCohortManifestV2R;
  const { manifestSha256, ...material } = manifest;
  if (manifest.version !== SEALED_HOLDOUT_COHORT_VERSION_V2R
    || manifest.authority !== 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_MUTATION'
    || manifest.cases.length !== 16
    || manifest.sharedModelContextSha256 !== hashCanonicalJsonV1(manifest.sharedModelContext)
    || manifestSha256 !== hashCanonicalJsonV1(material)
    || manifest.executionPolicy.dispatchAuthorized !== false) {
    fail('HOLDOUT_COHORT_MANIFEST_DRIFT');
  }
  assertNoEvaluatorLeakV2(manifest.sharedModelContext);
  for (const entry of manifest.cases) {
    assertNoEvaluatorLeakV2(entry.publicCase);
    if (entry.publicCaseSha256 !== hashCanonicalJsonV1(entry.publicCase)
      || entry.ownerOnlySha256 !== hashCanonicalJsonV1(entry.ownerOnly)
      || entry.evaluatorOnlySha256 !== hashCanonicalJsonV1(entry.evaluatorOnly)) {
      fail(`HOLDOUT_COHORT_CASE_HASH_DRIFT:${entry.caseId}`);
    }
  }
  return deepFreezeV1(manifest);
}

function buildCase(input: {
  taskV1: V1Task; taskV2: V2Task; condition: Condition;
  conditionOrdinal: number; sharedModelContextSha256: string;
}): Readonly<SealedHoldoutCaseV2R> {
  const { taskV1, taskV2, condition, conditionOrdinal, sharedModelContextSha256 } = input;
  const replacements = new Map(
    taskV1.conditionEvidence.C4_NOISY_OR_MISSING_EVIDENCE.replaceEvidence
      .map((evidence) => [evidence.evidenceId, evidence]),
  );
  const selectedEvidence = taskV1.evidence
    .filter(({ evidenceId }) => condition.availableEvidenceIds.includes(evidenceId))
    .map((evidence) => condition.replacementEvidenceIds?.includes(evidence.evidenceId)
      ? replacements.get(evidence.evidenceId) ?? fail(`HOLDOUT_COHORT_REPLACEMENT_MISSING:${evidence.evidenceId}`)
      : evidence);
  if (selectedEvidence.length !== condition.availableEvidenceIds.length) {
    fail(`HOLDOUT_COHORT_EVIDENCE_SET_INVALID:${taskV2.taskId}:${condition.conditionId}`);
  }
  const evidenceAlias = new Map(taskV2.evidenceIds.map((id, index) => [id, `E${index + 1}`]));
  const artifactHashes = record(holdoutMediaIdentityJson.artifactSha256ById);
  const media = taskV2.mediaBindings.map((binding) => {
    const asset = taskV1.project.assets.find((candidate) => text(candidate.assetId) === binding.assetId);
    const artifactSha256 = text(artifactHashes[binding.assetId]);
    if (!asset || !artifactSha256) fail(`HOLDOUT_COHORT_MEDIA_BINDING_INVALID:${binding.assetId}`);
    return {
      assetId: binding.assetId, type: asset.type, rightsStatus: asset.rightsStatus,
      recipeSha256: binding.recipeSha256, artifactSha256,
    };
  });
  const publicCase = deepFreezeV1({
    caseId: `${taskV2.taskId}:C${conditionOrdinal}`,
    taskId: taskV2.taskId,
    conditionArm: `C${conditionOrdinal}`,
    request: taskV2.originalRequest,
    project: {
      projectId: taskV2.projectBinding.projectId,
      expectedProjectRevision: taskV2.projectBinding.projectRevision,
      timebase: { rate: { numerator: '30', denominator: '1' }, coordinateDomain: 'PROJECT_FRAME' },
      canvas: taskV1.project.canvas, durationFrames: taskV1.project.durationFrames,
    },
    media,
    evidenceAvailability: selectedEvidence.map((evidence) => ({
      evidenceRef: evidenceAlias.get(evidence.evidenceId), kind: evidence.kind,
      binding: evidence.binding, access: 'CALL_OWNER_TOOL_TO_RESOLVE',
    })),
    policy: {
      rights: taskV1.plannerEnvelope.rightsPolicy,
      privacy: taskV1.plannerEnvelope.privacyPolicy,
      network: taskV1.plannerEnvelope.networkPolicy,
    },
    resourceBudget: taskV1.plannerEnvelope.resourceBudget,
    sharedModelContextSha256,
  });
  assertNoEvaluatorLeakV2(publicCase);
  const ownerOnly = deepFreezeV1({
    sourceConditionId: condition.conditionId,
    evidence: selectedEvidence.map((evidence) => ({
      evidenceRef: evidenceAlias.get(evidence.evidenceId), ...evidence,
    })),
  });
  const evaluatorOnly = deepFreezeV1({
    sourceConditionId: condition.conditionId,
    activePredicates: taskV2.predicates
      .filter((predicate) => condition.activePredicateIds.includes(text(predicate.predicateId))),
    allowedDispositions: condition.allowedDispositions,
    behaviourBrief: taskV1.behaviourBrief,
    sourceEvaluator: taskV1.evaluatorOnly,
    v2Evaluator: taskV2.evaluatorOnly,
  });
  return deepFreezeV1({
    caseId: text(publicCase.caseId), publicCase, ownerOnly, evaluatorOnly,
    publicCaseSha256: hashCanonicalJsonV1(publicCase),
    ownerOnlySha256: hashCanonicalJsonV1(ownerOnly),
    evaluatorOnlySha256: hashCanonicalJsonV1(evaluatorOnly),
  });
}

function requireSha(value: string, code: string): void { if (!/^[a-f0-9]{64}$/.test(value)) fail(code); }
function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
