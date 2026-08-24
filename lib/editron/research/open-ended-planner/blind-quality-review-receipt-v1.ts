import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';

export const BLIND_QUALITY_REVIEW_CONTRACT_VERSION_V1 =
  'EDITRON_BLIND_QUALITY_REVIEW_CONTRACT_V1' as const;
export const BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1 =
  'EDITRON_BLIND_QUALITY_REVIEW_RECEIPT_V1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const DECISIONS = ['PASS', 'PARTIAL', 'FAIL', 'UNVERIFIABLE'] as const;
const CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
const PLAYBACK_CONFIRMATIONS = [
  'FULL_NORMAL_SPEED_AUDIOVISUAL', 'FULL_NORMAL_SPEED_VISUAL', 'FULL_AUDIO',
  'COMPLETE_STATIC_OR_STRUCTURED_INSPECTION', 'NOT_APPLICABLE',
] as const;
const CORRECTION_STATUSES = [
  'MEASURED_HANDS_ON', 'ESTIMATED_ONLY', 'NOT_PERFORMED', 'NOT_APPLICABLE',
] as const;

type JsonRecord = Record<string, unknown>;
export type BlindQualityDecisionV1 = typeof DECISIONS[number];
export type BlindQualityPlaybackConfirmationV1 = typeof PLAYBACK_CONFIRMATIONS[number];
export type BlindQualityCorrectionStatusV1 = typeof CORRECTION_STATUSES[number];

export interface BlindQualityArtifactBindingV1 {
  artifactId: string;
  sha256: string;
  durationMilliseconds: number | null;
  requiredPlaybackConfirmation: BlindQualityPlaybackConfirmationV1;
}

export interface BlindQualityRubricDimensionV1 {
  dimensionId: string;
  requiredForPass: boolean;
}

export interface BlindQualityReviewContractV1 {
  version: typeof BLIND_QUALITY_REVIEW_CONTRACT_VERSION_V1;
  artifactType: 'BlindQualityReviewContractV1';
  taskId: string;
  publicPackHash: string;
  rubricHash: string;
  rubricDimensions: readonly BlindQualityRubricDimensionV1[];
  mediaBindings: readonly BlindQualityArtifactBindingV1[];
  resultBindings: readonly BlindQualityArtifactBindingV1[];
  singleReviewerMode: true;
  stateEffects: readonly [];
  contractHash: string;
}

export type BlindQualityConfidenceV1 = Readonly<
  | { disposition: 'REPORTED'; level: typeof CONFIDENCE_LEVELS[number] }
  | { disposition: 'NOT_REPORTED'; level: null }
>;

export interface BlindQualityMeasuredCorrectionEvidenceV1 {
  freshWorkspaceOrCloneDisposition: 'FRESH_ISOLATED_WORKSPACE_OR_PROJECT_CLONE';
  freshWorkspaceOrCloneSha256: string;
  beforeResultSha256: string;
  correctedResultSha256: string;
  correctedProofSha256: string;
  workLogSha256: string;
  manualActionCount: number;
  wallClockDurationMilliseconds: number;
  pausedDurationMilliseconds: number;
  externalOrHiddenRescueDurationMilliseconds: 0;
  startedAt: string;
  completedAt: string;
  notes: string;
  exclusions: readonly string[];
}

export interface BlindQualityCorrectionV1 {
  status: BlindQualityCorrectionStatusV1;
  durationMilliseconds: number | null;
  estimatedMinutes: number | null;
  measuredEvidence: BlindQualityMeasuredCorrectionEvidenceV1 | null;
  notes: string;
}

export interface BlindQualityTimecodedDefectV1 {
  defectId: string;
  severity: 'BLOCKING' | 'MAJOR' | 'MINOR';
  description: string;
  timecode: Readonly<
    | { disposition: 'MEASURED'; startMilliseconds: number; endMilliseconds: number }
    | { disposition: 'NOT_APPLICABLE_NON_TEMPORAL'; startMilliseconds: null; endMilliseconds: null }
  >;
}

export type BlindQualityDimensionOutcomeV1 = Readonly<
  | { dimensionId: string; disposition: 'SCORED'; score: number; rationale: string }
  | { dimensionId: string; disposition: 'UNVERIFIABLE'; score: null; rationale: string }
>;

export interface BlindQualityResultReviewV1 {
  resultId: string;
  decision: BlindQualityDecisionV1;
  confidence: BlindQualityConfidenceV1;
  dimensionOutcomes: readonly BlindQualityDimensionOutcomeV1[];
  defects: readonly BlindQualityTimecodedDefectV1[];
  correction: BlindQualityCorrectionV1;
  notes: string;
}

export interface BlindQualityReviewSubmissionV1 {
  contractHash: string;
  publicPackHash: string;
  rubricHash: string;
  mediaBindingsHash: string;
  resultBindingsHash: string;
  reviewer: Readonly<{
    pseudonym: string;
    qualification: Readonly<{ status: 'QUALIFIED_FOR_THIS_REVIEW'; basis: string }>;
    blinding: Readonly<{
      candidateIdentityAccess: 'NOT_ACCESSED_BEFORE_COMPLETION';
      operatorKeyAccess: 'NOT_ACCESSED_BEFORE_COMPLETION';
      otherReviewerDecisionAccess: 'NOT_ACCESSED_BEFORE_COMPLETION';
    }>;
  }>;
  completedAt: string;
  playbackConfirmations: readonly Readonly<{
    artifactRole: 'MEDIA' | 'RESULT';
    artifactId: string;
    confirmation: BlindQualityPlaybackConfirmationV1;
  }>[];
  resultReviews: readonly BlindQualityResultReviewV1[];
  ranking: Readonly<{
    orderedResultIds: readonly string[];
    preferredResultId: string | null;
    rationale: string;
    confidence: BlindQualityConfidenceV1;
  }>;
  overallDecision: BlindQualityDecisionV1;
  notes: string;
}

export interface BlindQualityReviewReceiptV1 extends BlindQualityReviewSubmissionV1 {
  version: typeof BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1;
  artifactType: 'BlindQualityReviewReceiptV1';
  taskId: string;
  rubricDimensions: readonly BlindQualityRubricDimensionV1[];
  mediaBindings: readonly BlindQualityArtifactBindingV1[];
  resultBindings: readonly BlindQualityArtifactBindingV1[];
  reviewerCount: 1;
  independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER';
  consensusDisposition: 'NOT_AVAILABLE_SINGLE_REVIEWER';
  formalPromotionStatus: 'RESEARCH_EVIDENCE_ONLY_NO_PRODUCTION_PROMOTION';
  stateEffects: readonly [];
  receiptHash: string;
}

export function createBlindQualityReviewContractV1(input: Readonly<{
  taskId: string;
  publicPackHash: string;
  rubricHash: string;
  rubricDimensions: readonly BlindQualityRubricDimensionV1[];
  mediaBindings: readonly BlindQualityArtifactBindingV1[];
  resultBindings: readonly BlindQualityArtifactBindingV1[];
}>): Readonly<BlindQualityReviewContractV1> {
  const unsigned = {
    version: BLIND_QUALITY_REVIEW_CONTRACT_VERSION_V1,
    artifactType: 'BlindQualityReviewContractV1' as const,
    taskId: input.taskId,
    publicPackHash: input.publicPackHash,
    rubricHash: input.rubricHash,
    rubricDimensions: structuredClone(input.rubricDimensions),
    mediaBindings: structuredClone(input.mediaBindings),
    resultBindings: structuredClone(input.resultBindings),
    singleReviewerMode: true as const,
    stateEffects: [] as const,
  };
  validateContractMaterial(unsigned);
  return deepFreezeV1({ ...unsigned, contractHash: hashCanonicalJsonV1(unsigned) });
}

export function finalizeBlindQualityReviewReceiptV1(
  contract: Readonly<BlindQualityReviewContractV1>,
  submission: Readonly<BlindQualityReviewSubmissionV1>,
): Readonly<BlindQualityReviewReceiptV1> {
  assertBlindQualityReviewContractV1(contract);
  validateSubmission(contract, submission);
  const unsigned = {
    version: BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1,
    artifactType: 'BlindQualityReviewReceiptV1' as const,
    taskId: contract.taskId,
    ...structuredClone(submission),
    rubricDimensions: structuredClone(contract.rubricDimensions),
    mediaBindings: structuredClone(contract.mediaBindings),
    resultBindings: structuredClone(contract.resultBindings),
    reviewerCount: 1 as const,
    independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER' as const,
    consensusDisposition: 'NOT_AVAILABLE_SINGLE_REVIEWER' as const,
    formalPromotionStatus: 'RESEARCH_EVIDENCE_ONLY_NO_PRODUCTION_PROMOTION' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...unsigned, receiptHash: hashCanonicalJsonV1(unsigned) });
}

export function assertBlindQualityReviewContractV1(
  value: unknown,
): asserts value is Readonly<BlindQualityReviewContractV1> {
  const candidate = record(value, 'CONTRACT_MISSING');
  const contractHash = sha(candidate.contractHash, 'CONTRACT_HASH_INVALID');
  const unsigned = structuredClone(candidate); delete unsigned.contractHash;
  if (candidate.version !== BLIND_QUALITY_REVIEW_CONTRACT_VERSION_V1
    || candidate.artifactType !== 'BlindQualityReviewContractV1'
    || hashCanonicalJsonV1(unsigned) !== contractHash) fail('CONTRACT_INVALID');
  validateContractMaterial(unsigned);
}

export function assertBlindQualityReviewReceiptV1(
  value: unknown,
): asserts value is Readonly<BlindQualityReviewReceiptV1> {
  const candidate = record(value, 'RECEIPT_MISSING');
  const receiptHash = sha(candidate.receiptHash, 'RECEIPT_HASH_INVALID');
  const unsigned = structuredClone(candidate); delete unsigned.receiptHash;
  if (candidate.version !== BLIND_QUALITY_REVIEW_RECEIPT_VERSION_V1
    || candidate.artifactType !== 'BlindQualityReviewReceiptV1'
    || hashCanonicalJsonV1(unsigned) !== receiptHash
    || candidate.reviewerCount !== 1
    || candidate.independentAgreement !== 'UNVERIFIABLE_SINGLE_REVIEWER'
    || candidate.consensusDisposition !== 'NOT_AVAILABLE_SINGLE_REVIEWER'
    || candidate.formalPromotionStatus !== 'RESEARCH_EVIDENCE_ONLY_NO_PRODUCTION_PROMOTION'
    || !Array.isArray(candidate.stateEffects) || candidate.stateEffects.length) fail('RECEIPT_INVALID');
  const contract = {
    version: BLIND_QUALITY_REVIEW_CONTRACT_VERSION_V1,
    artifactType: 'BlindQualityReviewContractV1' as const,
    taskId: candidate.taskId,
    publicPackHash: candidate.publicPackHash,
    rubricHash: candidate.rubricHash,
    rubricDimensions: candidate.rubricDimensions,
    mediaBindings: candidate.mediaBindings,
    resultBindings: candidate.resultBindings,
    singleReviewerMode: true as const,
    stateEffects: [] as const,
    contractHash: candidate.contractHash,
  };
  assertBlindQualityReviewContractV1(contract);
  validateSubmission(contract, candidate as unknown as BlindQualityReviewSubmissionV1);
}

function validateContractMaterial(value: JsonRecord): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/.test(text(value.taskId))
    || !SHA256.test(text(value.publicPackHash)) || !SHA256.test(text(value.rubricHash))
    || value.singleReviewerMode !== true || !Array.isArray(value.stateEffects) || value.stateEffects.length) {
    fail('CONTRACT_MATERIAL_INVALID');
  }
  const media = bindings(value.mediaBindings, 'MEDIA_BINDINGS_INVALID');
  const results = bindings(value.resultBindings, 'RESULT_BINDINGS_INVALID');
  const rubricDimensions = dimensions(value.rubricDimensions);
  if (!results.length) fail('RESULT_BINDINGS_INVALID');
  if (!rubricDimensions.length) fail('RUBRIC_DIMENSIONS_INVALID');
  assertUnique(media.map(({ artifactId }) => artifactId), 'MEDIA_BINDINGS_INVALID');
  assertUnique(results.map(({ artifactId }) => artifactId), 'RESULT_BINDINGS_INVALID');
  assertUnique(rubricDimensions.map(({ dimensionId }) => dimensionId), 'RUBRIC_DIMENSIONS_INVALID');
}

function validateSubmission(
  contract: Readonly<BlindQualityReviewContractV1>, submission: Readonly<BlindQualityReviewSubmissionV1>,
): void {
  if (submission.contractHash !== contract.contractHash || submission.publicPackHash !== contract.publicPackHash
    || submission.rubricHash !== contract.rubricHash
    || submission.mediaBindingsHash !== hashCanonicalJsonV1(contract.mediaBindings)
    || submission.resultBindingsHash !== hashCanonicalJsonV1(contract.resultBindings)) fail('SUBMISSION_BINDING_INVALID');
  const reviewer = record(submission.reviewer, 'REVIEWER_INVALID');
  const qualification = record(reviewer.qualification, 'REVIEWER_INVALID');
  const blinding = record(reviewer.blinding, 'BLINDING_INVALID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(text(reviewer.pseudonym))
    || qualification.status !== 'QUALIFIED_FOR_THIS_REVIEW'
    || !boundedRequiredText(qualification.basis, 2_000)
    || blinding.candidateIdentityAccess !== 'NOT_ACCESSED_BEFORE_COMPLETION'
    || blinding.operatorKeyAccess !== 'NOT_ACCESSED_BEFORE_COMPLETION'
    || blinding.otherReviewerDecisionAccess !== 'NOT_ACCESSED_BEFORE_COMPLETION') fail('REVIEWER_INVALID');
  const submissionCompletedAt = iso(submission.completedAt, 'COMPLETED_AT_INVALID');
  validatePlayback(contract, submission.playbackConfirmations);
  const resultIds = contract.resultBindings.map(({ artifactId }) => artifactId);
  const reviews = array(submission.resultReviews, 'RESULT_REVIEWS_INVALID') as unknown as BlindQualityResultReviewV1[];
  if (!sameSet(reviews.map(({ resultId }) => resultId), resultIds)) fail('RESULT_REVIEWS_INVALID');
  const requiredDimensionsUnverifiable = reviews.map((review) => validateResultReview(
    requiredBinding(contract.resultBindings, review.resultId), contract.rubricDimensions,
    review, submissionCompletedAt,
  ));
  const ranking = record(submission.ranking, 'RANKING_INVALID');
  const ordered = strings(ranking.orderedResultIds, 'RANKING_INVALID');
  if (!sameSet(ordered, resultIds) || (ranking.preferredResultId !== null
    && (ranking.preferredResultId !== ordered[0] || !resultIds.includes(String(ranking.preferredResultId))))
    || !boundedRequiredText(ranking.rationale, 8_000)) fail('RANKING_INVALID');
  confidence(ranking.confidence, 'RANKING_CONFIDENCE_INVALID');
  const overallDecision = decision(submission.overallDecision, 'OVERALL_DECISION_INVALID');
  if (overallDecision === 'PASS' && requiredDimensionsUnverifiable.some(Boolean)) {
    fail('OVERALL_PASS_WITH_UNVERIFIABLE_REQUIRED_DIMENSION');
  }
  boundedText(submission.notes, 8_000, 'NOTES_INVALID');
}

function validatePlayback(contract: Readonly<BlindQualityReviewContractV1>, value: unknown): void {
  const confirmations = array(value, 'PLAYBACK_INVALID').map((item) => record(item, 'PLAYBACK_INVALID'));
  const expected = [
    ...contract.mediaBindings.map((binding) => ({ artifactRole: 'MEDIA', binding })),
    ...contract.resultBindings.map((binding) => ({ artifactRole: 'RESULT', binding })),
  ];
  const keys = confirmations.map((item) => `${item.artifactRole}:${item.artifactId}`);
  if (!sameSet(keys, expected.map(({ artifactRole, binding }) => `${artifactRole}:${binding.artifactId}`))) fail('PLAYBACK_INVALID');
  for (const { artifactRole, binding } of expected) {
    const item = confirmations.find((entry) => entry.artifactRole === artifactRole && entry.artifactId === binding.artifactId);
    if (item?.confirmation !== binding.requiredPlaybackConfirmation) fail('PLAYBACK_INCOMPLETE');
  }
}

function validateResultReview(
  binding: BlindQualityArtifactBindingV1, rubricDimensions: readonly BlindQualityRubricDimensionV1[],
  review: BlindQualityResultReviewV1, submissionCompletedAt: string,
): boolean {
  const value = record(review, 'RESULT_REVIEW_INVALID');
  const resultDecision = decision(value.decision, 'RESULT_DECISION_INVALID');
  confidence(value.confidence, 'RESULT_CONFIDENCE_INVALID');
  boundedText(value.notes, 8_000, 'RESULT_NOTES_INVALID');
  const requiredDimensionUnverifiable = validateDimensionOutcomes(rubricDimensions, value.dimensionOutcomes);
  const defects = array(value.defects, 'DEFECTS_INVALID').map((item) => record(item, 'DEFECT_INVALID'));
  assertUnique(defects.map(({ defectId }) => text(defectId)), 'DEFECTS_INVALID');
  for (const defect of defects) validateDefect(binding, defect);
  if (resultDecision === 'PASS' && defects.some(({ severity }) => severity === 'BLOCKING')) fail('PASS_WITH_BLOCKING_DEFECT');
  if (resultDecision === 'PASS' && requiredDimensionUnverifiable) fail('PASS_WITH_UNVERIFIABLE_REQUIRED_DIMENSION');
  validateCorrection(binding, record(value.correction, 'CORRECTION_INVALID'), submissionCompletedAt);
  return requiredDimensionUnverifiable;
}

function validateDimensionOutcomes(
  rubricDimensions: readonly BlindQualityRubricDimensionV1[], value: unknown,
): boolean {
  const outcomes = array(value, 'DIMENSION_OUTCOMES_INVALID').map((item) => record(item, 'DIMENSION_OUTCOME_INVALID'));
  const expectedIds = rubricDimensions.map(({ dimensionId }) => dimensionId);
  const actualIds = outcomes.map(({ dimensionId }) => text(dimensionId));
  if (!sameSet(actualIds, expectedIds)) fail('DIMENSION_OUTCOMES_INVALID');
  for (const outcome of outcomes) {
    if (!boundedRequiredText(outcome.rationale, 4_000)) fail('DIMENSION_RATIONALE_INVALID');
    if (outcome.disposition === 'SCORED') {
      if (!nonNegativeInteger(outcome.score) || Number(outcome.score) > 1_000) fail('DIMENSION_SCORE_INVALID');
    } else if (outcome.disposition !== 'UNVERIFIABLE' || outcome.score !== null) {
      fail('DIMENSION_OUTCOME_INVALID');
    }
  }
  return rubricDimensions.some(({ dimensionId, requiredForPass }) => requiredForPass
    && outcomes.find((outcome) => outcome.dimensionId === dimensionId)?.disposition === 'UNVERIFIABLE');
}

function validateDefect(binding: BlindQualityArtifactBindingV1, defect: JsonRecord): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/.test(text(defect.defectId))
    || !['BLOCKING', 'MAJOR', 'MINOR'].includes(text(defect.severity))
    || !boundedRequiredText(defect.description, 4_000)) fail('DEFECT_INVALID');
  const timecode = record(defect.timecode, 'DEFECT_TIMECODE_INVALID');
  if (binding.durationMilliseconds === null) {
    if (timecode.disposition !== 'NOT_APPLICABLE_NON_TEMPORAL'
      || timecode.startMilliseconds !== null || timecode.endMilliseconds !== null) fail('DEFECT_TIMECODE_INVALID');
    return;
  }
  if (timecode.disposition !== 'MEASURED' || !nonNegativeInteger(timecode.startMilliseconds)
    || !positiveInteger(timecode.endMilliseconds)
    || Number(timecode.endMilliseconds) <= Number(timecode.startMilliseconds)
    || Number(timecode.endMilliseconds) > binding.durationMilliseconds) fail('DEFECT_TIMECODE_INVALID');
}

function validateCorrection(
  binding: BlindQualityArtifactBindingV1, correction: JsonRecord, submissionCompletedAt: string,
): void {
  const status = text(correction.status) as BlindQualityCorrectionStatusV1;
  if (!CORRECTION_STATUSES.includes(status) || typeof correction.notes !== 'string'
    || correction.notes.length > 8_000) fail('CORRECTION_INVALID');
  if (status === 'MEASURED_HANDS_ON') {
    const evidence = record(correction.measuredEvidence, 'MEASURED_CORRECTION_EVIDENCE_REQUIRED');
    const started = iso(evidence.startedAt, 'MEASURED_CORRECTION_TIME_INVALID');
    const completed = iso(evidence.completedAt, 'MEASURED_CORRECTION_TIME_INVALID');
    const activeDuration = correction.durationMilliseconds;
    const wallDuration = new Date(completed).getTime() - new Date(started).getTime();
    const exclusions = strings(evidence.exclusions, 'MEASURED_CORRECTION_EXCLUSIONS_INVALID');
    if (!positiveInteger(activeDuration) || correction.estimatedMinutes !== null
      || evidence.freshWorkspaceOrCloneDisposition !== 'FRESH_ISOLATED_WORKSPACE_OR_PROJECT_CLONE'
      || !SHA256.test(text(evidence.freshWorkspaceOrCloneSha256))
      || sha(evidence.beforeResultSha256, 'MEASURED_CORRECTION_HASH_INVALID') !== binding.sha256
      || sha(evidence.correctedResultSha256, 'MEASURED_CORRECTION_HASH_INVALID') === binding.sha256
      || !SHA256.test(text(evidence.correctedProofSha256))
      || !SHA256.test(text(evidence.workLogSha256))
      || !positiveInteger(evidence.manualActionCount)
      || !positiveInteger(evidence.wallClockDurationMilliseconds)
      || !nonNegativeInteger(evidence.pausedDurationMilliseconds)
      || evidence.externalOrHiddenRescueDurationMilliseconds !== 0
      || new Date(completed).getTime() > new Date(submissionCompletedAt).getTime()
      || evidence.wallClockDurationMilliseconds !== wallDuration
      || activeDuration + evidence.pausedDurationMilliseconds
        + evidence.externalOrHiddenRescueDurationMilliseconds !== wallDuration
      || !boundedRequiredText(evidence.notes, 8_000)
      || new Set(exclusions).size !== exclusions.length
      || exclusions.some((value) => !boundedRequiredText(value, 2_000))) {
      fail('MEASURED_CORRECTION_EVIDENCE_INVALID');
    }
    return;
  }
  if (correction.durationMilliseconds !== null || correction.measuredEvidence !== null) fail('CORRECTION_DISPOSITION_CONFLATED');
  if (status === 'ESTIMATED_ONLY') {
    if (typeof correction.estimatedMinutes !== 'number' || !Number.isFinite(correction.estimatedMinutes)
      || correction.estimatedMinutes <= 0) fail('ESTIMATED_CORRECTION_INVALID');
    return;
  }
  if (correction.estimatedMinutes !== null || !boundedRequiredText(correction.notes, 8_000)) {
    fail('CORRECTION_MISSING_VALUES_NOT_EXPLICIT');
  }
}

function dimensions(value: unknown): BlindQualityRubricDimensionV1[] {
  return array(value, 'RUBRIC_DIMENSIONS_INVALID').map((item) => {
    const dimension = record(item, 'RUBRIC_DIMENSIONS_INVALID');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/.test(text(dimension.dimensionId))
      || typeof dimension.requiredForPass !== 'boolean') fail('RUBRIC_DIMENSIONS_INVALID');
    return dimension as unknown as BlindQualityRubricDimensionV1;
  });
}

function bindings(value: unknown, code: string): BlindQualityArtifactBindingV1[] {
  return array(value, code).map((item) => {
    const binding = record(item, code);
    const duration = binding.durationMilliseconds;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/.test(text(binding.artifactId))
      || !SHA256.test(text(binding.sha256))
      || (duration !== null && !positiveInteger(duration))
      || !PLAYBACK_CONFIRMATIONS.includes(binding.requiredPlaybackConfirmation as BlindQualityPlaybackConfirmationV1)) fail(code);
    return binding as unknown as BlindQualityArtifactBindingV1;
  });
}

function confidence(value: unknown, code: string): void {
  const item = record(value, code);
  if (item.disposition === 'REPORTED') {
    if (!CONFIDENCE_LEVELS.includes(item.level as typeof CONFIDENCE_LEVELS[number])) fail(code);
  } else if (item.disposition !== 'NOT_REPORTED' || item.level !== null) fail(code);
}
function decision(value: unknown, code: string): BlindQualityDecisionV1 { if (!DECISIONS.includes(value as BlindQualityDecisionV1)) fail(code); return value as BlindQualityDecisionV1; }
function requiredBinding(values: readonly BlindQualityArtifactBindingV1[], id: string): BlindQualityArtifactBindingV1 { const value = values.find(({ artifactId }) => artifactId === id); if (!value) fail('RESULT_BINDING_MISSING'); return value; }
function sameSet(actual: string[], expected: string[]): boolean { return actual.length === expected.length && new Set(actual).size === actual.length && actual.every((value) => expected.includes(value)); }
function assertUnique(values: string[], code: string): void { if (values.some((value) => !value) || new Set(values).size !== values.length) fail(code); }
function record(value: unknown, code: string): JsonRecord { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code); return value as JsonRecord; }
function array(value: unknown, code: string): unknown[] { if (!Array.isArray(value)) fail(code); return value; }
function strings(value: unknown, code: string): string[] { const values = array(value, code); if (values.some((item) => typeof item !== 'string')) fail(code); return values as string[]; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function sha(value: unknown, code: string): string { const digest = text(value); if (!SHA256.test(digest)) fail(code); return digest; }
function boundedText(value: unknown, max: number, code: string): string { if (typeof value !== 'string' || value.length > max) fail(code); return value; }
function boundedRequiredText(value: unknown, max: number): boolean { return typeof value === 'string' && !!value.trim() && value.length <= max; }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function iso(value: unknown, code: string): string { if (typeof value !== 'string') fail(code); try { if (new Date(value).toISOString() !== value) fail(code); } catch { fail(code); } return value; }
function fail(code: string): never { throw new Error(`BLIND_QUALITY_REVIEW_${code}`); }
