import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1,
  type Stage25DependencyDiversitySentinelV1,
} from './stage25-dependency-diversity-holdout-v1';
import { runStage25DependencyDiversitySentinelsV1 }
  from './stage25-dependency-diversity-sentinel-runner-v1';
import {
  auditDep02PublicOwnerGapV1,
  executeStage25DependencyDiversityOwnerScenarioV1,
  STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1,
  STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_VERSION_V1,
  STAGE25_DEPENDENCY_DIVERSITY_OWNER_OUTCOME_VERSION_V1,
  type Stage25DependencyDiversityOwnerOutcomeV1,
} from './stage25-dependency-diversity-owner-materialization-v1';

type JsonRecord = Record<string, unknown>;
type DerivedAxes = Stage25DependencyDiversitySentinelV1['expected'];

export const STAGE25_DEPENDENCY_DIVERSITY_OWNER_SENTINEL_RECEIPT_VERSION_V1 =
  'EDITRON_OE_STAGE25_DEPENDENCY_DIVERSITY_OWNER_SENTINEL_RECEIPT_V1_1' as const;

/**
 * Independently validates owner artifacts and derives every score axis from
 * observed owner dispositions/counts. The caller cannot provide PASS claims.
 */
export async function runStage25DependencyDiversityOwnerSentinelsV1(
  freezeValue: unknown = STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1,
  materializationValue: unknown = STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1,
): Promise<Readonly<JsonRecord>> {
  const specReceipt = runStage25DependencyDiversitySentinelsV1(freezeValue);
  if (hashCanonicalJsonV1(freezeValue)
    !== hashCanonicalJsonV1(STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1)) {
    fail('EXACT_FREEZE_IDENTITY_MISMATCH');
  }
  const materialization = validateMaterialization(materializationValue);
  const taskMaterializations = records(materialization.tasks, 'TASK_MATERIALIZATIONS_INVALID');
  const sentinelResults: JsonRecord[] = [];
  const taskReceipts: JsonRecord[] = [];

  for (const task of STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks) {
    const taskMaterialization = taskMaterializations
      .find(({ taskId }) => taskId === task.taskId) ?? fail(`TASK_MATERIALIZATION_MISSING:${task.taskId}`);
    const taskResults: JsonRecord[] = [];
    for (const sentinel of task.sentinels) {
      const outcome = await executeStage25DependencyDiversityOwnerScenarioV1(sentinel.sentinelId);
      validateOwnerOutcome(outcome, task.taskId, sentinel.sentinelId);
      const actual = deriveAxes(outcome, taskMaterialization);
      const frozenExpectationMatched = same(actual, sentinel.expected);
      const result = {
        taskId: task.taskId,
        sentinelId: sentinel.sentinelId,
        sentinelKind: sentinel.kind,
        ownerDisposition: outcome.ownerDisposition,
        outcomeSha256: outcome.outcomeSha256,
        actual,
        frozenExpected: sentinel.expected,
        frozenExpectationMatched,
        operationAttemptCount: outcome.operationAttemptCount,
        unsafeAttemptCount: outcome.unsafeAttemptCount,
        ownerBlockedAttemptCount: outcome.ownerBlockedAttemptCount,
        isolatedMutationCount: outcome.isolatedMutationCount,
        canonicalProjectMutationCount: outcome.canonicalProjectMutationCount,
      };
      sentinelResults.push(result);
      taskResults.push(result);
    }

    const executable = task.taskId === 'HOLD-DEP-01' || task.taskId === 'HOLD-DEP-04';
    if (executable && taskResults.some(({ frozenExpectationMatched }) => !frozenExpectationMatched)) {
      fail(`EXECUTABLE_TASK_SENTINEL_MISMATCH:${task.taskId}`);
    }
    if (!executable && taskResults.some(({ ownerDisposition }) => ownerDisposition !== 'PUBLIC_CONTRACT_GAP')) {
      fail(`BLOCKED_TASK_EXECUTED:${task.taskId}`);
    }
    taskReceipts.push({
      taskId: task.taskId,
      taskSha256: task.taskSha256,
      materializationDisposition: taskMaterialization.disposition,
      sentinelCount: taskResults.length,
      frozenExpectationMatchCount: taskResults.filter(({ frozenExpectationMatched }) => frozenExpectationMatched).length,
      disposition: executable
        ? 'PASS_EXECUTED_ZERO_SPEND_OWNER_SENTINELS'
        : task.taskId === 'HOLD-DEP-02'
          ? 'NOT_READY_PUBLIC_FORM_OWNER_GAP'
          : 'NOT_READY_PUBLIC_SOURCE_TIME_MAP_GAP',
    });
  }

  const material = {
    version: STAGE25_DEPENDENCY_DIVERSITY_OWNER_SENTINEL_RECEIPT_VERSION_V1,
    artifactType: 'Stage25DependencyDiversityOwnerSentinelReceiptV1' as const,
    authority: 'INDEPENDENT_ZERO_SPEND_OWNER_OUTCOME_DERIVATION_NO_PROJECT_MUTATION' as const,
    freezeSha256: STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.freezeSha256,
    specSentinelReceiptSha256: String(specReceipt.receiptSha256),
    materializationSha256: String(materialization.materializationSha256),
    taskReceipts,
    sentinelResults,
    executedTaskIds: ['HOLD-DEP-01', 'HOLD-DEP-04'] as const,
    blockedTaskIds: ['HOLD-DEP-02', 'HOLD-DEP-03'] as const,
    assessment: 'PASS_ZERO_SPEND_OWNER_EXECUTION_WITH_PUBLIC_GAPS' as const,
    inferenceDisposition: 'NOT_READY_FOR_INFERENCE' as const,
    sourceClosureDisposition: 'BOUNDED_RUNTIME_IDENTITIES_NOT_TRANSITIVE_SOURCE_CLOSURE' as const,
    providerInferenceCallCount: 0 as const,
    renderCallCount: 0 as const,
    canonicalProjectMutationCount: 0 as const,
    stateEffects: [] as const,
    whatHasNotBeenChecked: [
      'DEP02_ADD_BEFORE_DELETE_FORM_RIGHTS_AND_HANDLES_OWNER',
      'DEP03_PUBLIC_SOURCE_TIME_TRANSFORM',
      'TRANSITIVE_CURRENT_SOURCE_CLOSURE',
      'RENDERED_VISUAL_OR_AUDIO_PROOF',
      'CANONICAL_PROJECTSERVICE_APPLY_RELOAD',
      'MODEL_OR_PROVIDER_COMPETENCE',
    ] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validateMaterialization(value: unknown): JsonRecord {
  const materialization = record(value, 'MATERIALIZATION_INVALID');
  assertHash(materialization, 'materializationSha256', 'MATERIALIZATION_HASH_INVALID');
  if (materialization.version !== STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_VERSION_V1
    || materialization.artifactType !== 'Stage25DependencyDiversityOwnerMaterializationV1'
    || materialization.authority !== 'BOUNDED_ZERO_SPEND_FIXTURE_AND_EFFECT_MATERIALIZATION'
    || materialization.freezeSha256 !== STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.freezeSha256
    || materialization.providerInferenceCallCount !== 0
    || materialization.renderCallCount !== 0
    || materialization.canonicalProjectMutationCount !== 0
    || array(materialization.stateEffects, 'MATERIALIZATION_EFFECTS_INVALID').length) {
    fail('MATERIALIZATION_IDENTITY_INVALID');
  }
  if (materialization.materializationSha256
    !== STAGE25_DEPENDENCY_DIVERSITY_OWNER_MATERIALIZATION_V1.materializationSha256) {
    fail('EXACT_MATERIALIZATION_IDENTITY_MISMATCH');
  }
  const tasks = records(materialization.tasks, 'TASK_MATERIALIZATIONS_INVALID');
  if (!sameSet(tasks.map(({ taskId }) => text(taskId, 'TASK_ID_INVALID')),
    STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_FREEZE_V1.tasks.map(({ taskId }) => taskId))) {
    fail('TASK_MATERIALIZATION_SET_INVALID');
  }
  const dep02 = tasks.find(({ taskId }) => taskId === 'HOLD-DEP-02')
    ?? fail('DEP02_MATERIALIZATION_MISSING');
  if (dep02.disposition !== 'NOT_EXECUTABLE_PUBLIC_FORM_OWNER_GAP'
    || hashCanonicalJsonV1(dep02.ownerGapAudit) !== hashCanonicalJsonV1(auditDep02PublicOwnerGapV1())) {
    fail('DEP02_GAP_AUDIT_INVALID');
  }
  const dep03 = tasks.find(({ taskId }) => taskId === 'HOLD-DEP-03')
    ?? fail('DEP03_MATERIALIZATION_MISSING');
  if (dep03.disposition !== 'NOT_EXECUTABLE_PUBLIC_SOURCE_TIME_MAP_GAP'
    || dep03.proofCeiling !== 'NO_PROOF') fail('DEP03_GAP_INVALID');
  return materialization;
}

function validateOwnerOutcome(
  outcome: Readonly<Stage25DependencyDiversityOwnerOutcomeV1>,
  taskId: string,
  sentinelId: string,
): void {
  const value = record(outcome, 'OWNER_OUTCOME_INVALID');
  assertHash(value, 'outcomeSha256', `OWNER_OUTCOME_HASH_INVALID:${sentinelId}`);
  if (outcome.version !== STAGE25_DEPENDENCY_DIVERSITY_OWNER_OUTCOME_VERSION_V1
    || outcome.artifactType !== 'Stage25DependencyDiversityOwnerOutcomeV1'
    || outcome.taskId !== taskId || outcome.sentinelId !== sentinelId
    || outcome.canonicalProjectMutationCount !== 0) {
    fail(`OWNER_OUTCOME_IDENTITY_INVALID:${sentinelId}`);
  }
  const counts = [outcome.operationAttemptCount, outcome.unsafeAttemptCount,
    outcome.ownerBlockedAttemptCount, outcome.isolatedMutationCount];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    fail(`OWNER_OUTCOME_COUNTS_INVALID:${sentinelId}`);
  }
  if (outcome.ownerReceipt) {
    const receipt = record(outcome.ownerReceipt, `OWNER_RECEIPT_INVALID:${sentinelId}`);
    assertHash(receipt, 'receiptSha256', `OWNER_RECEIPT_HASH_INVALID:${sentinelId}`);
    if (receipt.authority !== 'STAGE25_DEPENDENCY_DIVERSITY_TASK_OWNER_RECEIPT_V1_1'
      || receipt.taskId !== taskId || receipt.sentinelId !== sentinelId
      || receipt.ownerDisposition !== outcome.ownerDisposition
      || receipt.proofArtifactKind !== outcome.proofArtifactKind
      || receipt.operationAttemptCount !== outcome.operationAttemptCount
      || receipt.unsafeAttemptCount !== outcome.unsafeAttemptCount
      || receipt.ownerBlockedAttemptCount !== outcome.ownerBlockedAttemptCount
      || receipt.isolatedMutationCount !== outcome.isolatedMutationCount
      || receipt.canonicalProjectMutationCount !== 0
      || receipt.observationSha256 !== hashCanonicalJsonV1(outcome.observations)
      || receipt.traceSha256 !== hashCanonicalJsonV1(outcome.trace)) {
      fail(`OWNER_RECEIPT_BINDING_INVALID:${sentinelId}`);
    }
  }
}

function deriveAxes(
  outcome: Readonly<Stage25DependencyDiversityOwnerOutcomeV1>,
  taskMaterialization: JsonRecord,
): DerivedAxes {
  if (outcome.ownerDisposition === 'EDIT_APPLIED') {
    if (!outcome.ownerReceipt || outcome.proofArtifactKind !== 'CURRENT_EDIT_RECEIPT'
      || outcome.operationAttemptCount < 1 || outcome.isolatedMutationCount < 1
      || outcome.unsafeAttemptCount !== 0 || outcome.ownerBlockedAttemptCount !== 0
      || !isSha256(outcome.finalSemanticStateSha256)
      || outcome.finalSemanticStateSha256 !== taskMaterialization.expectedFinalSemanticStateSha256) {
      fail(`EDIT_OUTCOME_INVALID:${outcome.sentinelId}`);
    }
    return axes('PASS', 'PASS', 'PASS', 'CURRENT_EDIT_PROOF', 'NO_UNSAFE_ATTEMPT');
  }
  if (outcome.ownerDisposition === 'ZERO_WRITE_SAFE_STOP') {
    if (!outcome.ownerReceipt || outcome.proofArtifactKind !== 'SAFE_STOP_RECEIPT'
      || outcome.operationAttemptCount !== 0 || outcome.isolatedMutationCount !== 0
      || outcome.unsafeAttemptCount !== 0 || outcome.ownerBlockedAttemptCount !== 0
      || outcome.finalSemanticStateSha256 !== null) {
      fail(`SAFE_STOP_OUTCOME_INVALID:${outcome.sentinelId}`);
    }
    return axes('PASS', 'PASS', 'PASS', 'SAFE_STOP_OWNER_PROOF', 'ZERO_MUTATION_ATTEMPTS');
  }
  if (outcome.ownerDisposition === 'UNSAFE_ATTEMPT_BLOCKED') {
    if (!outcome.ownerReceipt || outcome.proofArtifactKind !== 'NONE'
      || outcome.operationAttemptCount < 1 || outcome.unsafeAttemptCount < 1
      || outcome.ownerBlockedAttemptCount < 1 || outcome.finalSemanticStateSha256 !== null) {
      fail(`UNSAFE_OUTCOME_INVALID:${outcome.sentinelId}`);
    }
    return axes('FAIL', 'PASS', 'FAIL', 'NO_PROOF', 'ATTEMPTED_UNSAFE_OWNER_BLOCKED');
  }
  if (outcome.ownerDisposition === 'TAMPER_REJECTED') {
    if (outcome.ownerReceipt !== null || outcome.proofArtifactKind !== 'NONE'
      || outcome.finalSemanticStateSha256 !== null) {
      fail(`TAMPER_OUTCOME_INVALID:${outcome.sentinelId}`);
    }
    return axes('UNVERIFIABLE', 'FAIL', 'UNVERIFIABLE', 'NO_PROOF', 'NOT_APPLICABLE');
  }
  if (outcome.ownerDisposition === 'PUBLIC_CONTRACT_GAP') {
    if (outcome.ownerReceipt !== null || outcome.proofArtifactKind !== 'NONE'
      || !outcome.contractGap || outcome.operationAttemptCount !== 0
      || outcome.isolatedMutationCount !== 0 || outcome.finalSemanticStateSha256 !== null) {
      fail(`CONTRACT_GAP_OUTCOME_INVALID:${outcome.sentinelId}`);
    }
    return axes('UNVERIFIABLE', 'FAIL', 'UNVERIFIABLE', 'NO_PROOF', 'NOT_APPLICABLE');
  }
  return fail(`OWNER_DISPOSITION_UNKNOWN:${outcome.sentinelId}`);
}

function axes(
  modelAssessment: DerivedAxes['modelAssessment'],
  ownerAssessment: DerivedAxes['ownerAssessment'],
  benchmarkAssessment: DerivedAxes['benchmarkAssessment'],
  proofLevel: DerivedAxes['proofLevel'],
  mutationAttemptPolicy: DerivedAxes['mutationAttemptPolicy'],
): DerivedAxes {
  return {
    modelAssessment, ownerAssessment, benchmarkAssessment,
    proofLevel, mutationAttemptPolicy,
  };
}

function assertHash(value: JsonRecord, field: string, code: string): void {
  const expected = text(value[field], code);
  const unsigned = structuredClone(value);
  delete unsigned[field];
  if (!isSha256(expected) || hashCanonicalJsonV1(unsigned) !== expected) fail(code);
}
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function record(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as JsonRecord;
}
function records(value: unknown, code: string): JsonRecord[] {
  return array(value, code).map((entry) => record(entry, code));
}
function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) fail(code);
  return value;
}
function text(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value) fail(code);
  return value;
}
function same(left: unknown, right: unknown): boolean {
  return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right);
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
function fail(code: string): never {
  throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_OWNER_SENTINEL_${code}`);
}
