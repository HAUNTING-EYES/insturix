import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_VERSION_V1,
  STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1,
  STAGE25_DEPENDENCY_SENTINEL_KINDS_V1,
} from './stage25-dependency-diversity-holdout-v1';
import { V2R_OPERATOR_CATALOG, v2rOperatorCatalogIdentity, v2rOperatorSpecRef }
  from './operator-catalog-v2r';
import { STAGE25_DEPENDENCY_DIVERSITY_NO_SPEND_POLICY_V1 }
  from './stage25-dependency-diversity-no-spend-policy-v1';

type JsonRecord = Record<string, unknown>;

export const STAGE25_DEPENDENCY_DIVERSITY_SENTINEL_RECEIPT_VERSION_V1 =
  'EDITRON_OE_STAGE25_DEPENDENCY_DIVERSITY_SENTINEL_RECEIPT_V1_1' as const;

export function runStage25DependencyDiversitySentinelsV1(
  freezeValue: unknown,
): Readonly<JsonRecord> {
  const freeze = record(freezeValue, 'FREEZE_MISSING');
  assertHash(freeze, 'freezeSha256', 'FREEZE_HASH_INVALID');
  if (freeze.version !== STAGE25_DEPENDENCY_DIVERSITY_HOLDOUT_VERSION_V1
    || freeze.artifactType !== 'Stage25DependencyDiversityHoldoutFreezeV1'
    || freeze.authority !== 'RESEARCH_SPEC_ONLY_NO_EXECUTION_OR_PROJECT_MUTATION') fail('FREEZE_IDENTITY_INVALID');
  if (freeze.dispatchAuthorized !== false || freeze.providerInferenceCallCount !== 0) fail('DISPATCH_ENABLED');
  if (array(freeze.stateEffects, 'FREEZE_EFFECTS_INVALID').length) fail('FREEZE_EFFECTS_INVALID');
  const policy = record(STAGE25_DEPENDENCY_DIVERSITY_NO_SPEND_POLICY_V1, 'POLICY_INVALID');
  assertHash(policy, 'policySha256', 'POLICY_HASH_INVALID');
  if (policy.providerDispatchPermitted !== false
    || array(policy.stateEffects, 'POLICY_EFFECTS_INVALID').length
    || !sameSet(uniqueStrings(policy.requiredSentinelKinds, 'POLICY_SENTINELS_INVALID'),
      STAGE25_DEPENDENCY_SENTINEL_KINDS_V1)) fail('POLICY_INVALID');
  if (hashCanonicalJsonV1(freeze.operatorCatalog) !== hashCanonicalJsonV1(v2rOperatorCatalogIdentity())) {
    fail('CATALOG_IDENTITY_INVALID');
  }
  const tasks = records(freeze.tasks, 'TASKS_INVALID');
  const taskIds = tasks.map((task) => text(task.taskId, 'TASK_ID_INVALID'));
  if (!sameSet(taskIds, STAGE25_DEPENDENCY_DIVERSITY_TASK_IDS_V1)) fail('TASK_SET_INVALID');
  for (const task of tasks) validateTask(task);
  validateSpeedRampGap(tasks.find(({ taskId }) => taskId === 'HOLD-DEP-03') as JsonRecord);

  const material = {
    version: STAGE25_DEPENDENCY_DIVERSITY_SENTINEL_RECEIPT_VERSION_V1,
    artifactType: 'Stage25DependencyDiversitySentinelReceiptV1' as const,
    authority: 'ZERO_INFERENCE_INDEPENDENT_RECOMPUTATION_NO_PROJECT_MUTATION' as const,
    freezeSha256: text(freeze.freezeSha256, 'FREEZE_HASH_INVALID'),
    policySha256: text(policy.policySha256, 'POLICY_HASH_INVALID'),
    taskReceipts: tasks.map((task) => ({
      taskId: task.taskId,
      taskSha256: task.taskSha256,
      sentinelCount: records(task.sentinels, 'SENTINELS_INVALID').length,
      disposition: task.status === 'NOT_READY_PUBLIC_CONTRACT_GAP'
        ? 'NOT_READY_PUBLIC_CONTRACT_GAP' as const
        : 'READY_FOR_OWNER_IMPLEMENTATION_NOT_INFERENCE' as const,
    })),
    assessment: 'PASS_ZERO_SPEND_SPEC_FREEZE' as const,
    inferenceDisposition: 'NOT_READY_FOR_INFERENCE' as const,
    providerInferenceCallCount: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function validateTask(task: JsonRecord): void {
  assertHash(task, 'taskSha256', `TASK_HASH_INVALID:${String(task.taskId)}`);
  const taskId = text(task.taskId, 'TASK_ID_INVALID');
  if (/^HOLD-(0[1-8]|FORK-JOIN-01)$/.test(taskId)) fail(`HISTORICAL_TASK_REUSED:${taskId}`);
  const project = record(task.project, `PROJECT_INVALID:${taskId}`);
  if (!text(project.projectId, `PROJECT_INVALID:${taskId}`).startsWith('oe-hold-dep-')
    || !/^R\d+$/.test(text(project.expectedProjectRevision, `PROJECT_INVALID:${taskId}`))) {
    fail(`PROJECT_INVALID:${taskId}`);
  }
  uniqueStrings(task.freshAssetIds, `ASSETS_INVALID:${taskId}`);
  uniqueStrings(task.evidenceIds, `EVIDENCE_INVALID:${taskId}`);
  const operatorIds = uniqueStrings(task.eligibleOperatorIds, `OPERATORS_INVALID:${taskId}`);
  const operatorRefs = uniqueStrings(task.eligibleOperatorRefs, `OPERATOR_REFS_INVALID:${taskId}`);
  if (operatorRefs.length !== operatorIds.length
    || operatorIds.some((id, index) => operatorRefs[index] !== v2rOperatorSpecRef(id))) {
    fail(`OPERATOR_REFS_INVALID:${taskId}`);
  }
  const rules = records(task.publicRules, `PUBLIC_RULES_INVALID:${taskId}`);
  const publicRuleIds = rules.map((rule) => text(rule.ruleId, `PUBLIC_RULES_INVALID:${taskId}`));
  if (new Set(publicRuleIds).size !== publicRuleIds.length
    || rules.some((rule) => !text(rule.text, `PUBLIC_RULES_INVALID:${taskId}`).trim())) {
    fail(`PUBLIC_RULES_INVALID:${taskId}`);
  }
  const scoredRuleIds = uniqueStrings(task.scoredRuleIds, `SCORED_RULES_INVALID:${taskId}`);
  if (!sameSet(publicRuleIds, scoredRuleIds)) fail(`HIDDEN_OR_UNSCORED_RULE:${taskId}`);
  const sentinels = records(task.sentinels, `SENTINELS_INVALID:${taskId}`);
  const sentinelIds = sentinels.map((value) => text(value.sentinelId, `SENTINEL_ID_INVALID:${taskId}`));
  if (new Set(sentinelIds).size !== sentinelIds.length) fail(`SENTINEL_ID_INVALID:${taskId}`);
  const kinds = sentinels.map((value) => text(value.kind, `SENTINEL_KIND_INVALID:${taskId}`));
  for (const required of STAGE25_DEPENDENCY_SENTINEL_KINDS_V1) {
    if (!kinds.includes(required)) fail(`SENTINEL_COVERAGE_MISSING:${taskId}:${required}`);
  }
  for (const sentinel of sentinels) validateSentinel(taskId, sentinel, publicRuleIds);
  if (task.fixtureMaterialization !== 'NOT_MATERIALIZED') fail(`FIXTURE_STATUS_INVALID:${taskId}`);
  if (task.proofCeiling !== 'CURRENT_EDIT_PROOF' && task.proofCeiling !== 'NO_PROOF') {
    fail(`PROOF_CEILING_INVALID:${taskId}`);
  }
  if (taskId === 'HOLD-DEP-03') {
    if (task.status !== 'NOT_READY_PUBLIC_CONTRACT_GAP' || task.proofCeiling !== 'NO_PROOF'
      || !text(task.publicContractGap, `PUBLIC_GAP_INVALID:${taskId}`).includes('receipt')) fail(`PUBLIC_GAP_INVALID:${taskId}`);
  } else if (task.status !== 'OWNER_IMPLEMENTATION_REQUIRED' || task.publicContractGap !== null) {
    fail(`TASK_STATUS_INVALID:${taskId}`);
  }
}

function validateSentinel(taskId: string, sentinel: JsonRecord, publicRuleIds: string[]): void {
  const ruleIds = uniqueStrings(sentinel.ruleIds, `SENTINEL_RULES_INVALID:${taskId}`);
  if (ruleIds.some((id) => !publicRuleIds.includes(id))) fail(`SENTINEL_HIDDEN_RULE:${taskId}`);
  const kind = text(sentinel.kind, `SENTINEL_KIND_INVALID:${taskId}`);
  const expected = record(sentinel.expected, `SENTINEL_EXPECTED_INVALID:${taskId}`);
  if (kind === 'KNOWN_GOOD' || kind === 'EQUIVALENT_GOOD') {
    const blockedBlueprint = taskId === 'HOLD-DEP-03';
    if (blockedBlueprint ? (expected.modelAssessment !== 'UNVERIFIABLE'
      || expected.ownerAssessment !== 'FAIL' || expected.benchmarkAssessment !== 'UNVERIFIABLE'
      || expected.proofLevel !== 'NO_PROOF' || expected.mutationAttemptPolicy !== 'NOT_APPLICABLE')
      : (expected.modelAssessment !== 'PASS' || expected.ownerAssessment !== 'PASS'
        || expected.benchmarkAssessment !== 'PASS' || expected.proofLevel !== 'CURRENT_EDIT_PROOF'
        || expected.mutationAttemptPolicy !== 'NO_UNSAFE_ATTEMPT')) fail(`GOOD_SENTINEL_INVALID:${taskId}`);
  }
  if (kind === 'SAFE_STOP' && (expected.modelAssessment !== 'PASS'
    || expected.benchmarkAssessment !== 'PASS'
    || expected.proofLevel !== 'SAFE_STOP_OWNER_PROOF'
    || expected.mutationAttemptPolicy !== 'ZERO_MUTATION_ATTEMPTS')) fail(`SAFE_STOP_INVALID:${taskId}`);
  if (kind === 'KNOWN_BAD' && (expected.modelAssessment !== 'FAIL'
    || expected.ownerAssessment !== 'PASS' || expected.benchmarkAssessment !== 'FAIL'
    || expected.proofLevel !== 'NO_PROOF'
    || expected.mutationAttemptPolicy !== 'ATTEMPTED_UNSAFE_OWNER_BLOCKED')) fail(`UNSAFE_ATTEMPT_CREDIT_INVALID:${taskId}`);
  if (kind === 'TAMPER' && (expected.modelAssessment !== 'UNVERIFIABLE'
    || expected.ownerAssessment !== 'FAIL' || expected.benchmarkAssessment !== 'UNVERIFIABLE')) fail(`TAMPER_EXPECTATION_INVALID:${taskId}`);
}

function validateSpeedRampGap(task: JsonRecord): void {
  const operator = records(V2R_OPERATOR_CATALOG.operators, 'CATALOG_OPERATORS_INVALID')
    .find(({ operatorId }) => operatorId === 'apply_speed_ramp');
  const output = record(record(operator, 'SPEED_RAMP_OPERATOR_MISSING').output, 'SPEED_RAMP_OUTPUT_INVALID');
  const outputs = uniqueStrings(output.fields, 'SPEED_RAMP_OUTPUT_INVALID');
  if (!sameSet(outputs, ['receipt']) || task.status !== 'NOT_READY_PUBLIC_CONTRACT_GAP') {
    fail('SPEED_RAMP_GAP_NOT_FAIL_CLOSED');
  }
}

function assertHash(value: JsonRecord, field: string, code: string): void {
  const expected = text(value[field], code); const unsigned = structuredClone(value); delete unsigned[field];
  if (!/^[a-f0-9]{64}$/.test(expected) || hashCanonicalJsonV1(unsigned) !== expected) fail(code);
}
function record(value: unknown, code: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as JsonRecord; }
function records(value: unknown, code: string): JsonRecord[] { return array(value, code).map((entry) => record(entry, code)); }
function array(value: unknown, code: string): unknown[] { if (!Array.isArray(value)) fail(code); return value; }
function text(value: unknown, code: string): string { if (typeof value !== 'string' || !value.trim()) fail(code); return value; }
function uniqueStrings(value: unknown, code: string): string[] { const result = array(value, code); if (result.some((entry) => typeof entry !== 'string' || !entry.trim()) || new Set(result).size !== result.length) fail(code); return result as string[]; }
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value)); }
function fail(code: string): never { throw new Error(`STAGE25_DEPENDENCY_DIVERSITY_${code}`); }
