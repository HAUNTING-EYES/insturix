import { deepFreezeV1 } from './contracts-v1';

export const REFERENCE_NATIVE_OBSERVER_SEMANTIC_CONTRACT_VERSION_V2R =
  'EDITRON_REFERENCE_NATIVE_OBSERVER_SEMANTIC_CONTRACT_V2R_1' as const;

export type ReferenceNativeObserverSemanticRuleIdV2R =
  | 'NATIVE_OBSERVER_DISPOSITION'
  | 'NATIVE_OBSERVER_IDENTIFIERS'
  | 'NATIVE_OBSERVER_RANGES'
  | 'NATIVE_OBSERVER_AUDIO_EVIDENCE'
  | 'NATIVE_OBSERVER_RECURRENCE'
  | 'NATIVE_OBSERVER_DENSE_WINDOW_RATE'
  | 'NATIVE_OBSERVER_SAMPLING_LIMITS'
  | 'NATIVE_OBSERVER_DENSE_REINSPECTION'
  | 'NATIVE_OBSERVER_NO_EXECUTION_DECISION';

export interface ReferenceNativeObserverSemanticRuleV2R {
  ruleId: ReferenceNativeObserverSemanticRuleIdV2R;
  requirement: string;
  diagnosticPrefixes: readonly string[];
}

export const REFERENCE_NATIVE_OBSERVER_SEMANTIC_RULES_V2R = deepFreezeV1([
  rule(
    'NATIVE_OBSERVER_DISPOSITION',
    'READY_FOR_EVALUATION requires a non-null observation. UNVERIFIABLE or NEEDS_REVIEW requires observation=null and evidenceIds=[].',
    ['NON_READY_OBSERVATION_MUST_BE_NULL', 'NON_READY_EVIDENCE_IDS_MUST_BE_EMPTY', 'READY_OBSERVATION_REQUIRED'],
  ),
  rule(
    'NATIVE_OBSERVER_IDENTIFIERS',
    'Use valid reason codes and opaque IDs. Every observationId, uncertaintyId and windowId must be globally unique. Terminal evidenceIds must be the exact union of every observationId, uncertaintyId and windowId.',
    [
      'REASON_CODE_INVALID', 'TERMINAL_EVIDENCE_ID_INVALID',
      'OBSERVATION_ID_INVALID', 'UNCERTAINTY_ID_INVALID', 'DENSE_WINDOW_ID_INVALID',
      'EVIDENCE_ID_DUPLICATE', 'TERMINAL_EVIDENCE_SET_MISMATCH',
    ],
  ),
  rule(
    'NATIVE_OBSERVER_RANGES',
    'Every timestamp range must use non-negative integer microseconds with startTimestampUs < endTimestampUsExclusive <= the declared source duration.',
    ['RANGE_TIMESTAMP_INVALID', 'RANGE_BOUNDS_INVALID'],
  ),
  rule(
    'NATIVE_OBSERVER_AUDIO_EVIDENCE',
    'Every audioBehaviour evidence must include AUDIO or VIDEO_AND_AUDIO modality. AUDIOVISUAL_RELATIONSHIP evidence must include VIDEO_AND_AUDIO modality.',
    ['AUDIO_OBSERVATION_REQUIRES_AUDIO_EVIDENCE', 'AUDIOVISUAL_OBSERVATION_REQUIRES_JOINT_EVIDENCE'],
  ),
  rule(
    'NATIVE_OBSERVER_RECURRENCE',
    'Every recurring claim requires at least two distinct occurrence ranges, and no counterexample range may equal an occurrence range.',
    ['RECURRENCE_REQUIRES_TWO_DISTINCT_RANGES', 'RECURRENCE_COUNTEREXAMPLE_OVERLAP'],
  ),
  rule(
    'NATIVE_OBSERVER_DENSE_WINDOW_RATE',
    'requestedRate must be null unless requiredModality is CUSTOM_FPS_VIDEO. CUSTOM_FPS_VIDEO requires a reduced positive rational rate no greater than the declared source rate 60/1.',
    [
      'DENSE_RATE_ONLY_FOR_CUSTOM_FPS', 'CUSTOM_FPS_RATE_REQUIRED',
      'CUSTOM_FPS_RATE_NOT_REDUCED', 'CUSTOM_FPS_RATE_EXCEEDS_SOURCE',
    ],
  ),
  rule(
    'NATIVE_OBSERVER_SAMPLING_LIMITS',
    'The uncertainties must explicitly acknowledge that provider sampling is not source-frame-complete and cannot prove exact easing, microtiming or fast motion.',
    ['INPUT_ARM_LIMIT_NOT_ACKNOWLEDGED'],
  ),
  rule(
    'NATIVE_OBSERVER_DENSE_REINSPECTION',
    'If any uncertainty uses REQUIRES_DENSE_REINSPECTION, requestedDenseReinspectionWindows must contain at least one bounded window.',
    ['DENSE_REINSPECTION_WINDOW_REQUIRED'],
  ),
  rule(
    'NATIVE_OBSERVER_NO_EXECUTION_DECISION',
    'The observation and summary must not choose or recommend native, generated-composition or hybrid execution, operators or implementation.',
    ['EXECUTION_DECISION_NOT_ALLOWED'],
  ),
] as const) as readonly Readonly<ReferenceNativeObserverSemanticRuleV2R>[];

export function buildReferenceNativeObserverProviderSemanticContractV2R(): Readonly<{
  version: typeof REFERENCE_NATIVE_OBSERVER_SEMANTIC_CONTRACT_VERSION_V2R;
  rules: readonly Readonly<Pick<ReferenceNativeObserverSemanticRuleV2R, 'ruleId' | 'requirement'>>[];
}> {
  return deepFreezeV1({
    version: REFERENCE_NATIVE_OBSERVER_SEMANTIC_CONTRACT_VERSION_V2R,
    rules: REFERENCE_NATIVE_OBSERVER_SEMANTIC_RULES_V2R.map(({ ruleId, requirement }) => ({
      ruleId,
      requirement,
    })),
  });
}

export function bindReferenceNativeObserverDiagnosticV2R(
  ruleId: ReferenceNativeObserverSemanticRuleIdV2R,
  diagnostic: string,
): string {
  const ruleEntry = REFERENCE_NATIVE_OBSERVER_SEMANTIC_RULES_V2R.find((entry) => (
    entry.ruleId === ruleId
  ));
  if (!ruleEntry) throw new Error(`REFERENCE_NATIVE_SEMANTIC_RULE_UNKNOWN:${ruleId}`);
  const matches = ruleEntry.diagnosticPrefixes.some((prefix) => (
    diagnostic === prefix || diagnostic.startsWith(`${prefix}:`)
  ));
  if (!matches) {
    throw new Error(`REFERENCE_NATIVE_SEMANTIC_DIAGNOSTIC_RULE_MISMATCH:${ruleId}:${diagnostic}`);
  }
  return diagnostic;
}

function rule(
  ruleId: ReferenceNativeObserverSemanticRuleIdV2R,
  requirement: string,
  diagnosticPrefixes: readonly string[],
): Readonly<ReferenceNativeObserverSemanticRuleV2R> {
  return { ruleId, requirement, diagnosticPrefixes };
}
