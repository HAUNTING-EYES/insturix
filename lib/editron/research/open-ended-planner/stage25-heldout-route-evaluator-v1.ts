import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  STAGE25_HELDOUT_ROUTE_ARMS_V1,
  STAGE25_HELDOUT_ROUTE_FREEZE_V1,
  type Stage25HeldoutRouteArmV1,
} from './stage25-heldout-route-freeze-v1';

type JsonRecord = Record<string, unknown>;
type Route = 'NATIVE' | 'GENERATED_COMPOSITION' | 'HYBRID';
const ROUTES: readonly Route[] = ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'];

export const STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1 =
  'EDITRON_OE_STAGE25_HELDOUT_ROUTE_EVALUATOR_V1_1' as const;

export interface Stage25HeldoutRouteCandidateV1 {
  version: typeof STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1;
  taskId: string;
  arm: Stage25HeldoutRouteArmV1;
  taskSha256: string;
  armSha256: string;
  disposition: 'EXECUTED' | 'CAPABILITY_GAP';
  selectedRoute: Route | null;
  capabilityAvailable: boolean;
  attemptedUnavailableOwner: boolean;
  checkedRouteFamilies: readonly Route[];
  canonicalEditableRepresentation: boolean;
  qualifications: Readonly<{
    nativeOwner: boolean;
    generatedSandbox: boolean;
    timebaseHandoff: boolean;
    audioHandoff: boolean;
    boundaryHandoff: boolean;
  }>;
  targetPredicatePassIds: readonly string[];
  preservationPredicatePassIds: readonly string[];
  capabilityGapCode: string | null;
  proofLevel: 'STRUCTURAL_SENTINEL' | 'SAFE_STOP_OWNER_PROOF' | 'NO_PROOF';
  stateEffects: readonly [];
  candidateSha256: string;
}

export function hashStage25HeldoutRouteCandidateV1(
  value: Omit<Stage25HeldoutRouteCandidateV1, 'candidateSha256'>,
): string { return hashCanonicalJsonV1(value); }

export function evaluateStage25HeldoutRouteCandidateV1(
  candidateValue: unknown,
): Readonly<JsonRecord> {
  assertFreeze();
  const candidate = record(candidateValue, 'CANDIDATE_MISSING');
  assertHash(candidate, 'candidateSha256', 'CANDIDATE_HASH_INVALID');
  if (candidate.version !== STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1
    || !STAGE25_HELDOUT_ROUTE_ARMS_V1.includes(candidate.arm as Stage25HeldoutRouteArmV1)) fail('CANDIDATE_IDENTITY_INVALID');
  const task = records(STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks)
    .find(({ taskId }) => taskId === candidate.taskId) ?? fail('TASK_UNKNOWN');
  const arm = records(STAGE25_HELDOUT_ROUTE_FREEZE_V1.arms)
    .find((value) => value.taskId === candidate.taskId && value.arm === candidate.arm)
    ?? fail('ARM_UNKNOWN');
  if (candidate.taskSha256 !== task.taskSha256 || candidate.armSha256 !== arm.armSha256) fail('TASK_OR_ARM_BINDING_INVALID');
  if (array(candidate.stateEffects, 'STATE_EFFECTS_INVALID').length) fail('STATE_EFFECTS_INVALID');
  const diagnostics: string[] = [];
  const selectedRoute = candidate.selectedRoute as Route | null;
  if (selectedRoute !== null && !ROUTES.includes(selectedRoute)) diagnostics.push('ROUTE_INVALID');
  const forcedRoute = routeForArm(candidate.arm as Stage25HeldoutRouteArmV1);
  if (forcedRoute && selectedRoute && selectedRoute !== forcedRoute) diagnostics.push('FORCED_ROUTE_SUBSTITUTED');
  if (candidate.disposition === 'CAPABILITY_GAP') {
    const expectedChecks = forcedRoute ? [forcedRoute] : ROUTES;
    const qualifications = record(candidate.qualifications, 'QUALIFICATIONS_INVALID');
    if (candidate.capabilityAvailable !== false || candidate.attemptedUnavailableOwner !== false
      || selectedRoute !== forcedRoute || candidate.canonicalEditableRepresentation !== false
      || !sameSet(strings(candidate.checkedRouteFamilies), expectedChecks)
      || !qualificationsAllFalse(qualifications)
      || !text(candidate.capabilityGapCode).startsWith('CAPABILITY_GAP:')
      || candidate.proofLevel !== 'SAFE_STOP_OWNER_PROOF'
      || strings(candidate.targetPredicatePassIds).length
      || strings(candidate.preservationPredicatePassIds).length) diagnostics.push('CAPABILITY_GAP_INVALID');
  } else if (candidate.disposition === 'EXECUTED') {
    if (!selectedRoute || candidate.capabilityAvailable !== true
      || candidate.attemptedUnavailableOwner !== false
      || !strings(candidate.checkedRouteFamilies).includes(selectedRoute)) diagnostics.push('EXECUTION_ELIGIBILITY_INVALID');
    if (candidate.canonicalEditableRepresentation !== true) diagnostics.push('EDITABLE_REPRESENTATION_MISSING');
    if (candidate.proofLevel !== 'STRUCTURAL_SENTINEL') diagnostics.push('PROOF_LEVEL_INVALID');
    requireExact(diagnostics, strings(candidate.targetPredicatePassIds), predicateIds(task, 'targetPredicates'), 'TARGET_PREDICATES');
    requireExact(diagnostics, strings(candidate.preservationPredicatePassIds), predicateIds(task, 'preservationPredicates'), 'PRESERVATION_PREDICATES');
    if (selectedRoute) {
      validateQualifications(diagnostics, selectedRoute, record(candidate.qualifications, 'QUALIFICATIONS_INVALID'));
    }
    if (candidate.capabilityGapCode !== null) diagnostics.push('EXECUTED_WITH_GAP_CODE');
  } else diagnostics.push('DISPOSITION_INVALID');
  const unique = [...new Set(diagnostics)].sort(compareUtf16);
  const material = {
    version: STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1,
    artifactType: 'Stage25HeldoutRouteEvaluationReceiptV1' as const,
    authority: 'ZERO_SPEND_SYMBOLIC_ROUTE_SENTINEL_NO_PROJECT_MUTATION' as const,
    taskId: candidate.taskId,
    arm: candidate.arm,
    candidateSha256: candidate.candidateSha256,
    assessment: unique.length ? 'FAIL' as const
      : candidate.disposition === 'CAPABILITY_GAP' ? 'PASS_SAFE_STOP' as const
        : 'PASS_STRUCTURAL_SENTINEL' as const,
    diagnostics: unique,
    proofCeiling: 'STRUCTURAL_SENTINEL' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
}

function assertFreeze(): void {
  const value = STAGE25_HELDOUT_ROUTE_FREEZE_V1 as unknown as JsonRecord;
  assertHash(value, 'freezeSha256', 'FREEZE_HASH_INVALID');
  if (value.dispatchAuthorized !== false || value.providerInferenceCallCount !== 0
    || array(value.stateEffects, 'FREEZE_EFFECTS_INVALID').length) fail('FREEZE_AUTHORITY_INVALID');
  const arms = records(value.arms);
  for (const task of records(value.tasks)) {
    const taskArms = arms.filter(({ taskId }) => taskId === task.taskId);
    if (taskArms.length !== 4 || !taskArms.every(({ taskSha256, targetMaterialSha256 }) =>
      taskSha256 === task.taskSha256 && targetMaterialSha256 === task.taskSha256)) fail('ARM_TARGET_DRIFT');
  }
}

function routeForArm(arm: Stage25HeldoutRouteArmV1): Route | null {
  return arm === 'FORCED_NATIVE' ? 'NATIVE'
    : arm === 'FORCED_GENERATED_COMPOSITION' ? 'GENERATED_COMPOSITION'
      : arm === 'FORCED_HYBRID' ? 'HYBRID' : null;
}
function validateQualifications(diagnostics: string[], route: Route, value: JsonRecord): void {
  const all = qualificationFields();
  if (!sameSet(Object.keys(value), all) || Object.values(value).some((entry) => typeof entry !== 'boolean')) {
    diagnostics.push('ROUTE_QUALIFICATION_INVALID'); return;
  }
  const required = route === 'NATIVE' ? ['nativeOwner']
    : route === 'GENERATED_COMPOSITION' ? ['generatedSandbox']
      : ['nativeOwner', 'generatedSandbox', 'timebaseHandoff', 'audioHandoff', 'boundaryHandoff'];
  if (required.some((field) => value[field] !== true)) diagnostics.push('ROUTE_QUALIFICATION_INCOMPLETE');
}
function qualificationsAllFalse(value: JsonRecord): boolean { const fields = qualificationFields(); return sameSet(Object.keys(value), fields) && fields.every((field) => value[field] === false); }
function qualificationFields(): string[] { return ['nativeOwner', 'generatedSandbox', 'timebaseHandoff', 'audioHandoff', 'boundaryHandoff']; }
function predicateIds(task: JsonRecord, field: string): string[] { return records(task[field]).map(({ predicateId }) => text(predicateId)); }
function requireExact(diagnostics: string[], actual: string[], expected: string[], label: string): void { if (!sameSet(actual, expected)) diagnostics.push(`${label}_INCOMPLETE`); }
function assertHash(value: JsonRecord, field: string, code: string): void { const expected = text(value[field]); const unsigned = structuredClone(value); delete unsigned[field]; if (!/^[a-f0-9]{64}$/.test(expected) || hashCanonicalJsonV1(unsigned) !== expected) fail(code); }
function record(value: unknown, code = 'RECORD_INVALID'): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as JsonRecord; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map((entry) => record(entry)) : []; }
function array(value: unknown, code: string): unknown[] { if (!Array.isArray(value)) fail(code); return value; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function sameSet(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value)); }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code: string): never { throw new Error(`STAGE25_HELDOUT_ROUTE_${code}`); }
