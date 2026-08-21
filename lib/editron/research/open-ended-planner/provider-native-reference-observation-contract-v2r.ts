import { deepFreezeV1 } from './contracts-v1';
import {
  REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256,
  REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
  REFERENCE_HOLDOUT_01_NATIVE_INPUT_ARM_V2R,
  REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R,
  buildReferenceHoldout01NativeManifestV2R,
  buildReferenceHoldout01ManifestV2R,
} from './provider-native-reference-holdout-01-v2r';
import {
  bindReferenceNativeObserverDiagnosticV2R,
  type ReferenceNativeObserverSemanticRuleIdV2R,
} from './provider-native-reference-semantics-v2r';
import { validateJsonSchemaV2 } from './stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

export const REFERENCE_OBSERVER_SUBMISSION_VERSION_V2R =
  'EDITRON_REFERENCE_OBSERVER_SUBMISSION_V2R_1' as const;
export const REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R =
  'EDITRON_REFERENCE_NATIVE_OBSERVER_SUBMISSION_V2R_1' as const;

export type ReferenceObserverSubmissionDispositionV2R =
  | 'READY_FOR_EVALUATION'
  | 'UNVERIFIABLE'
  | 'NEEDS_REVIEW';

export interface ReferenceObservationMapV2R extends JsonRecord {
  artifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_1';
  taskId: 'HREF-01';
  inputArm: 'ORDERED_TIMESTAMPED_IMAGES_WITHOUT_AUDIO';
  globalEditorialLanguage: readonly Readonly<JsonRecord>[];
  recurringDesignGrammar: readonly Readonly<JsonRecord>[];
  boundedHeroMoments: readonly Readonly<JsonRecord>[];
  contentLiterals: readonly Readonly<JsonRecord>[];
  temporalStructure: readonly Readonly<JsonRecord>[];
  uncertainties: readonly Readonly<JsonRecord>[];
  requestedDenseReinspectionWindows: readonly Readonly<JsonRecord>[];
}

export interface ReferenceObserverSubmissionV2R extends JsonRecord {
  submissionVersion: typeof REFERENCE_OBSERVER_SUBMISSION_VERSION_V2R;
  taskManifestSha256: string;
  referenceInputManifestSha256: string;
  disposition: ReferenceObserverSubmissionDispositionV2R;
  reasonCodes: readonly string[];
  evidenceIds: readonly string[];
  summary: string;
  observation: Readonly<ReferenceObservationMapV2R> | null;
}

export interface ReferenceNativeObservationMapV2R extends JsonRecord {
  artifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_2';
  taskId: typeof REFERENCE_HOLDOUT_01_NATIVE_TASK_ID_V2R;
  inputArm: typeof REFERENCE_HOLDOUT_01_NATIVE_INPUT_ARM_V2R;
  globalEditorialLanguage: readonly Readonly<JsonRecord>[];
  recurringDesignGrammar: readonly Readonly<JsonRecord>[];
  boundedHeroMoments: readonly Readonly<JsonRecord>[];
  contentLiterals: readonly Readonly<JsonRecord>[];
  temporalStructure: readonly Readonly<JsonRecord>[];
  audioBehaviour: readonly Readonly<JsonRecord>[];
  uncertainties: readonly Readonly<JsonRecord>[];
  requestedDenseReinspectionWindows: readonly Readonly<JsonRecord>[];
}

export interface ReferenceNativeObserverSubmissionV2R extends JsonRecord {
  submissionVersion: typeof REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R;
  taskManifestSha256: string;
  referenceInputManifestSha256: string;
  disposition: ReferenceObserverSubmissionDispositionV2R;
  reasonCodes: readonly string[];
  evidenceIds: readonly string[];
  summary: string;
  observation: Readonly<ReferenceNativeObservationMapV2R> | null;
}

export type ReferenceObserverObservationV2R =
  | ReferenceObservationMapV2R
  | ReferenceNativeObservationMapV2R;

export type ReferenceObserverTerminalSubmissionV2R =
  | ReferenceObserverSubmissionV2R
  | ReferenceNativeObserverSubmissionV2R;

export interface ReferenceObserverSubmissionValidationV2R {
  disposition: 'PASS' | 'FAIL';
  diagnostics: readonly string[];
}

const FRAME_ID_PATTERN = /^frame_[0-9]{6}$/;
const OPAQUE_OBSERVATION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const REASON_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/;
const TIMESTAMP_US_PATTERN = /^(?:0|[1-9][0-9]{0,17})$/;
const EXECUTION_DECISION_PATTERN =
  /\b(?:route|execute|implement|apply|choose|select|must use|should use)\s+(?:as\s+)?(?:native|hybrid|generated(?:[_ ]composition)?)\b|\b(?:selectedOperatorId|alternativeOperatorIds|create_generated_composition)\b/i;

export function buildReferenceObservationMapSchemaV2R(): Readonly<JsonRecord> {
  const manifest = buildReferenceHoldout01ManifestV2R();
  return manifest.providerVisibleTask.outputContract as Readonly<JsonRecord>;
}

export function buildReferenceObserverFinishSchemaV2R(): Readonly<JsonRecord> {
  const manifest = buildReferenceHoldout01ManifestV2R();
  return deepFreezeV1(closed({
    submissionVersion: { const: REFERENCE_OBSERVER_SUBMISSION_VERSION_V2R },
    taskManifestSha256: { const: manifest.manifestSha256 },
    referenceInputManifestSha256: { const: REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256 },
    disposition: {
      type: 'string', enum: ['READY_FOR_EVALUATION', 'UNVERIFIABLE', 'NEEDS_REVIEW'],
    },
    reasonCodes: {
      type: 'array', minItems: 1, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    evidenceIds: {
      type: 'array', uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 32 },
    },
    summary: { type: 'string', minLength: 1, maxLength: 2000 },
    observation: {
      anyOf: [buildReferenceObservationMapSchemaV2R(), { type: 'null' }],
    },
  }));
}

export function validateReferenceObserverSubmissionV2R(
  value: unknown,
): Readonly<ReferenceObserverSubmissionValidationV2R> {
  const diagnostics = validateJsonSchemaV2(
    value,
    buildReferenceObserverFinishSchemaV2R(),
    '$.submission',
  );
  if (!diagnostics.length) {
    diagnostics.push(...semanticDiagnostics(value as ReferenceObserverSubmissionV2R));
  }
  return deepFreezeV1({
    disposition: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics,
  });
}

export function buildReferenceNativeObservationMapSchemaV2R(): Readonly<JsonRecord> {
  const manifest = buildReferenceHoldout01NativeManifestV2R();
  return manifest.providerVisibleTask.outputContract as Readonly<JsonRecord>;
}

export function buildReferenceNativeObserverFinishSchemaV2R(): Readonly<JsonRecord> {
  const manifest = buildReferenceHoldout01NativeManifestV2R();
  return deepFreezeV1(closed({
    submissionVersion: { const: REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R },
    taskManifestSha256: { const: manifest.manifestSha256 },
    referenceInputManifestSha256: { const: REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256 },
    disposition: {
      type: 'string', enum: ['READY_FOR_EVALUATION', 'UNVERIFIABLE', 'NEEDS_REVIEW'],
    },
    reasonCodes: {
      type: 'array', minItems: 1, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    evidenceIds: {
      type: 'array', uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    summary: { type: 'string', minLength: 1, maxLength: 4000 },
    observation: {
      anyOf: [buildReferenceNativeObservationMapSchemaV2R(), { type: 'null' }],
    },
  }));
}

export function validateReferenceNativeObserverSubmissionV2R(
  value: unknown,
): Readonly<ReferenceObserverSubmissionValidationV2R> {
  const diagnostics = validateJsonSchemaV2(
    value,
    buildReferenceNativeObserverFinishSchemaV2R(),
    '$.submission',
  );
  if (!diagnostics.length) {
    diagnostics.push(...nativeSemanticDiagnostics(value as ReferenceNativeObserverSubmissionV2R));
  }
  return deepFreezeV1({
    disposition: diagnostics.length ? 'FAIL' as const : 'PASS' as const,
    diagnostics,
  });
}

function semanticDiagnostics(submission: ReferenceObserverSubmissionV2R): string[] {
  const diagnostics: string[] = [];
  const manifest = buildReferenceHoldout01ManifestV2R();
  const samples = manifest.sourceMaterialization.samples;
  const sampleTimes = new Map(samples.map((sample) => [sample.frameId, BigInt(sample.timestampUs)]));
  const durationUs = BigInt(String(
    (manifest.sourceMaterialization.sourceTimebase as JsonRecord).durationUs,
  ));

  for (const [index, code] of submission.reasonCodes.entries()) {
    if (!REASON_CODE_PATTERN.test(code)) diagnostics.push(`REASON_CODE_INVALID:${index}`);
  }
  for (const [index, frameId] of submission.evidenceIds.entries()) {
    if (!FRAME_ID_PATTERN.test(frameId) || !sampleTimes.has(frameId)) {
      diagnostics.push(`TERMINAL_EVIDENCE_ID_UNKNOWN:${index}:${frameId}`);
    }
  }

  if (submission.disposition !== 'READY_FOR_EVALUATION') {
    if (submission.observation !== null) diagnostics.push('NON_READY_OBSERVATION_MUST_BE_NULL');
    return diagnostics;
  }
  if (!submission.observation) return [...diagnostics, 'READY_OBSERVATION_REQUIRED'];

  const observation = submission.observation;
  const layers = [
    observation.globalEditorialLanguage,
    observation.recurringDesignGrammar,
    observation.boundedHeroMoments,
    observation.contentLiterals,
    observation.temporalStructure,
  ];
  const seenObservationIds = new Set<string>();
  const citedFrameIds = new Set<string>();
  for (const record of layers.flat()) {
    const observationId = String(record.observationId);
    if (!OPAQUE_OBSERVATION_ID_PATTERN.test(observationId)) {
      diagnostics.push(`OBSERVATION_ID_INVALID:${observationId}`);
    } else if (seenObservationIds.has(observationId)) {
      diagnostics.push(`OBSERVATION_ID_DUPLICATE:${observationId}`);
    }
    seenObservationIds.add(observationId);
    validateFrameIds(record.evidenceFrameIds, observationId, sampleTimes, citedFrameIds, diagnostics);
    if (record.patternKind === 'RECURRING') {
      const occurrences = strings(record.occurrenceFrameIds);
      const counterexamples = strings(record.counterexampleFrameIds);
      validateFrameIds(occurrences, `${observationId}:occurrence`, sampleTimes, citedFrameIds, diagnostics);
      validateFrameIds(counterexamples, `${observationId}:counterexample`, sampleTimes, citedFrameIds, diagnostics);
      if (new Set(occurrences).size < 2) diagnostics.push(`RECURRENCE_REQUIRES_TWO_OCCURRENCES:${observationId}`);
      if (counterexamples.some((frameId) => occurrences.includes(frameId))) {
        diagnostics.push(`RECURRENCE_COUNTEREXAMPLE_OVERLAP:${observationId}`);
      }
    }
    if ('startTimestampUs' in record || 'endTimestampUsExclusive' in record) {
      validateRange(record, observationId, durationUs, sampleTimes, diagnostics);
    }
  }

  const seenUncertaintyIds = new Set<string>();
  for (const uncertainty of observation.uncertainties) {
    const uncertaintyId = String(uncertainty.uncertaintyId);
    if (!OPAQUE_OBSERVATION_ID_PATTERN.test(uncertaintyId)) {
      diagnostics.push(`UNCERTAINTY_ID_INVALID:${uncertaintyId}`);
    } else if (seenUncertaintyIds.has(uncertaintyId)) {
      diagnostics.push(`UNCERTAINTY_ID_DUPLICATE:${uncertaintyId}`);
    }
    seenUncertaintyIds.add(uncertaintyId);
  }
  for (const [index, window] of observation.requestedDenseReinspectionWindows.entries()) {
    validateRange(window, `dense-window-${index}`, durationUs, sampleTimes, diagnostics, false);
  }

  const limitationText = observation.uncertainties.map((entry) => (
    `${String(entry.statement)} ${strings(entry.affectedLayers).join(' ')}`
  )).join(' ').toLowerCase();
  requireInputArmLimit(limitationText, /\baudio\b/, 'AUDIO', diagnostics);
  requireInputArmLimit(limitationText, /\beasing\b/, 'EXACT_EASING', diagnostics);
  requireInputArmLimit(limitationText, /continuous[^.]{0,32}motion|motion[^.]{0,32}continuous/, 'CONTINUOUS_MOTION', diagnostics);
  requireInputArmLimit(limitationText, /\bunsampled\b/, 'UNSAMPLED_INTERVALS', diagnostics);
  if (observation.uncertainties.some((entry) => entry.disposition === 'REQUIRES_DENSE_REINSPECTION')
    && !observation.requestedDenseReinspectionWindows.length) {
    diagnostics.push('DENSE_REINSPECTION_WINDOW_REQUIRED');
  }

  const prose = JSON.stringify({ summary: submission.summary, observation });
  if (EXECUTION_DECISION_PATTERN.test(prose)) diagnostics.push('EXECUTION_DECISION_NOT_ALLOWED');

  const expectedEvidence = [...citedFrameIds].sort();
  const terminalEvidence = [...submission.evidenceIds].sort();
  if (expectedEvidence.length !== terminalEvidence.length
    || expectedEvidence.some((frameId, index) => frameId !== terminalEvidence[index])) {
    diagnostics.push('TERMINAL_EVIDENCE_SET_MISMATCH');
  }
  return diagnostics;
}

function nativeSemanticDiagnostics(submission: ReferenceNativeObserverSubmissionV2R): string[] {
  const diagnostics: string[] = [];
  const manifest = buildReferenceHoldout01NativeManifestV2R();
  const durationUs = BigInt(manifest.sourceBinding.durationUs);
  for (const [index, code] of submission.reasonCodes.entries()) {
    if (!REASON_CODE_PATTERN.test(code)) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_IDENTIFIERS',
        `REASON_CODE_INVALID:${index}`,
      );
    }
  }
  for (const [index, evidenceId] of submission.evidenceIds.entries()) {
    if (!OPAQUE_OBSERVATION_ID_PATTERN.test(evidenceId)) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_IDENTIFIERS',
        `TERMINAL_EVIDENCE_ID_INVALID:${index}:${evidenceId}`,
      );
    }
  }
  if (submission.disposition !== 'READY_FOR_EVALUATION') {
    if (submission.observation !== null) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_DISPOSITION',
        'NON_READY_OBSERVATION_MUST_BE_NULL',
      );
    }
    if (submission.evidenceIds.length) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_DISPOSITION',
        'NON_READY_EVIDENCE_IDS_MUST_BE_EMPTY',
      );
    }
    return diagnostics;
  }
  if (!submission.observation) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_DISPOSITION',
      'READY_OBSERVATION_REQUIRED',
    );
    return diagnostics;
  }

  const observation = submission.observation;
  const layers: ReadonlyArray<readonly Readonly<JsonRecord>[]> = [
    observation.globalEditorialLanguage,
    observation.recurringDesignGrammar,
    observation.boundedHeroMoments,
    observation.contentLiterals,
    observation.temporalStructure,
    observation.audioBehaviour,
  ];
  const seenEvidenceIds = new Set<string>();
  const addEvidenceId = (evidenceId: string, kind: string): void => {
    if (!OPAQUE_OBSERVATION_ID_PATTERN.test(evidenceId)) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_IDENTIFIERS',
        `${kind}_ID_INVALID:${evidenceId}`,
      );
    } else if (seenEvidenceIds.has(evidenceId)) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_IDENTIFIERS',
        `EVIDENCE_ID_DUPLICATE:${evidenceId}`,
      );
    }
    seenEvidenceIds.add(evidenceId);
  };

  for (const record of layers.flat()) {
    const observationId = String(record.observationId);
    addEvidenceId(observationId, 'OBSERVATION');
    const evidenceRanges = records(record.evidenceRanges);
    for (const [index, range] of evidenceRanges.entries()) {
      validateNativeRange(range, `${observationId}:evidence:${index}`, durationUs, diagnostics);
    }
    if (observation.audioBehaviour.includes(record)
      && !evidenceRanges.some(hasAudibleModality)) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_AUDIO_EVIDENCE',
        `AUDIO_OBSERVATION_REQUIRES_AUDIO_EVIDENCE:${observationId}`,
      );
    }
    if (record.dimension === 'AUDIOVISUAL_RELATIONSHIP'
      && !evidenceRanges.some((range) => range.modality === 'VIDEO_AND_AUDIO')) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_AUDIO_EVIDENCE',
        `AUDIOVISUAL_OBSERVATION_REQUIRES_JOINT_EVIDENCE:${observationId}`,
      );
    }
    if (record.patternKind === 'RECURRING') {
      const occurrences = records(record.occurrenceRanges);
      const counterexamples = records(record.counterexampleRanges);
      for (const [index, range] of occurrences.entries()) {
        validateNativeRange(range, `${observationId}:occurrence:${index}`, durationUs, diagnostics);
      }
      for (const [index, range] of counterexamples.entries()) {
        validateNativeRange(range, `${observationId}:counterexample:${index}`, durationUs, diagnostics);
      }
      const occurrenceKeys = occurrences.map(nativeRangeKey);
      const counterexampleKeys = counterexamples.map(nativeRangeKey);
      if (new Set(occurrenceKeys).size < 2) {
        pushNativeDiagnostic(
          diagnostics,
          'NATIVE_OBSERVER_RECURRENCE',
          `RECURRENCE_REQUIRES_TWO_DISTINCT_RANGES:${observationId}`,
        );
      }
      if (counterexampleKeys.some((key) => occurrenceKeys.includes(key))) {
        pushNativeDiagnostic(
          diagnostics,
          'NATIVE_OBSERVER_RECURRENCE',
          `RECURRENCE_COUNTEREXAMPLE_OVERLAP:${observationId}`,
        );
      }
    }
    for (const property of ['momentRange', 'phaseRange'] as const) {
      if (isRecord(record[property])) {
        validateNativeRange(
          record[property] as Readonly<JsonRecord>,
          `${observationId}:${property}`,
          durationUs,
          diagnostics,
        );
      }
    }
  }

  for (const uncertainty of observation.uncertainties) {
    addEvidenceId(String(uncertainty.uncertaintyId), 'UNCERTAINTY');
  }
  for (const [index, window] of observation.requestedDenseReinspectionWindows.entries()) {
    const windowId = String(window.windowId);
    addEvidenceId(windowId, 'DENSE_WINDOW');
    validateNativeWindow(window, windowId || `dense-window-${index}`, durationUs, diagnostics);
  }

  const limitationText = observation.uncertainties.map((entry) => (
    `${String(entry.statement)} ${strings(entry.affectedLayers).join(' ')}`
  )).join(' ').toLowerCase();
  requireNativeInputArmLimit(
    limitationText,
    /source[- ]frame|sampling|sampled|frame[- ]complete/,
    'SOURCE_FRAME_COMPLETENESS',
    diagnostics,
  );
  requireNativeInputArmLimit(
    limitationText,
    /easing|microtiming|fast[^.]{0,24}motion|motion[^.]{0,24}fast/,
    'FAST_MOTION_OR_MICROTIMING',
    diagnostics,
  );
  if (observation.uncertainties.some((entry) => (
    entry.disposition === 'REQUIRES_DENSE_REINSPECTION'
  )) && !observation.requestedDenseReinspectionWindows.length) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_DENSE_REINSPECTION',
      'DENSE_REINSPECTION_WINDOW_REQUIRED',
    );
  }

  const prose = JSON.stringify({ summary: submission.summary, observation });
  if (EXECUTION_DECISION_PATTERN.test(prose)) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_NO_EXECUTION_DECISION',
      'EXECUTION_DECISION_NOT_ALLOWED',
    );
  }
  const expectedEvidence = [...seenEvidenceIds].sort();
  const terminalEvidence = [...submission.evidenceIds].sort();
  if (expectedEvidence.length !== terminalEvidence.length
    || expectedEvidence.some((evidenceId, index) => evidenceId !== terminalEvidence[index])) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_IDENTIFIERS',
      'TERMINAL_EVIDENCE_SET_MISMATCH',
    );
  }
  return diagnostics;
}

function validateNativeRange(
  value: Readonly<JsonRecord>,
  owner: string,
  durationUs: bigint,
  diagnostics: string[],
): void {
  const startText = String(value.startTimestampUs);
  const endText = String(value.endTimestampUsExclusive);
  if (!TIMESTAMP_US_PATTERN.test(startText) || !TIMESTAMP_US_PATTERN.test(endText)) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_RANGES',
      `RANGE_TIMESTAMP_INVALID:${owner}`,
    );
    return;
  }
  const start = BigInt(startText);
  const end = BigInt(endText);
  if (start >= end || end > durationUs) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_RANGES',
      `RANGE_BOUNDS_INVALID:${owner}`,
    );
  }
}

function validateNativeWindow(
  window: Readonly<JsonRecord>,
  owner: string,
  durationUs: bigint,
  diagnostics: string[],
): void {
  validateNativeRange(window, owner, durationUs, diagnostics);
  const rate = window.requestedRate;
  if (window.requiredModality !== 'CUSTOM_FPS_VIDEO') {
    if (rate !== null) {
      pushNativeDiagnostic(
        diagnostics,
        'NATIVE_OBSERVER_DENSE_WINDOW_RATE',
        `DENSE_RATE_ONLY_FOR_CUSTOM_FPS:${owner}`,
      );
    }
    return;
  }
  if (!isRecord(rate)) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_DENSE_WINDOW_RATE',
      `CUSTOM_FPS_RATE_REQUIRED:${owner}`,
    );
    return;
  }
  const numerator = BigInt(String(rate.numerator));
  const denominator = BigInt(String(rate.denominator));
  if (greatestCommonDivisor(numerator, denominator) !== BigInt(1)) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_DENSE_WINDOW_RATE',
      `CUSTOM_FPS_RATE_NOT_REDUCED:${owner}`,
    );
  }
  if (numerator > BigInt(60) * denominator) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_DENSE_WINDOW_RATE',
      `CUSTOM_FPS_RATE_EXCEEDS_SOURCE:${owner}`,
    );
  }
}

function hasAudibleModality(range: Readonly<JsonRecord>): boolean {
  return range.modality === 'AUDIO' || range.modality === 'VIDEO_AND_AUDIO';
}

function nativeRangeKey(range: Readonly<JsonRecord>): string {
  return `${String(range.startTimestampUs)}:${String(range.endTimestampUsExclusive)}:${String(range.modality)}`;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function requireNativeInputArmLimit(
  text: string,
  pattern: RegExp,
  label: string,
  diagnostics: string[],
): void {
  if (!pattern.test(text)) {
    pushNativeDiagnostic(
      diagnostics,
      'NATIVE_OBSERVER_SAMPLING_LIMITS',
      `INPUT_ARM_LIMIT_NOT_ACKNOWLEDGED:${label}`,
    );
  }
}

function pushNativeDiagnostic(
  diagnostics: string[],
  ruleId: ReferenceNativeObserverSemanticRuleIdV2R,
  diagnostic: string,
): void {
  diagnostics.push(bindReferenceNativeObserverDiagnosticV2R(ruleId, diagnostic));
}

function validateFrameIds(
  value: unknown,
  owner: string,
  sampleTimes: ReadonlyMap<string, bigint>,
  cited: Set<string>,
  diagnostics: string[],
): void {
  for (const frameId of strings(value)) {
    if (!FRAME_ID_PATTERN.test(frameId) || !sampleTimes.has(frameId)) {
      diagnostics.push(`EVIDENCE_ID_UNKNOWN:${owner}:${frameId}`);
    } else {
      cited.add(frameId);
    }
  }
}

function validateRange(
  value: Readonly<JsonRecord>,
  owner: string,
  durationUs: bigint,
  sampleTimes: ReadonlyMap<string, bigint>,
  diagnostics: string[],
  requireCitedSample = true,
): void {
  const startText = String(value.startTimestampUs);
  const endText = String(value.endTimestampUsExclusive);
  if (!TIMESTAMP_US_PATTERN.test(startText) || !TIMESTAMP_US_PATTERN.test(endText)) {
    diagnostics.push(`RANGE_TIMESTAMP_INVALID:${owner}`);
    return;
  }
  const start = BigInt(startText);
  const end = BigInt(endText);
  if (start >= end || end > durationUs) diagnostics.push(`RANGE_BOUNDS_INVALID:${owner}`);
  if (requireCitedSample) {
    const hasCitedSample = strings(value.evidenceFrameIds).some((frameId) => {
      const timestamp = sampleTimes.get(frameId);
      return timestamp !== undefined && timestamp >= start && timestamp < end;
    });
    if (!hasCitedSample) diagnostics.push(`RANGE_HAS_NO_CITED_SAMPLE:${owner}`);
  }
}

function requireInputArmLimit(
  text: string,
  pattern: RegExp,
  label: string,
  diagnostics: string[],
): void {
  if (!pattern.test(text)) diagnostics.push(`INPUT_ARM_LIMIT_NOT_ACKNOWLEDGED:${label}`);
}

function closed(properties: JsonRecord): Readonly<JsonRecord> {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function records(value: unknown): Readonly<JsonRecord>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Readonly<JsonRecord> => isRecord(entry))
    : [];
}

function isRecord(value: unknown): value is Readonly<JsonRecord> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
