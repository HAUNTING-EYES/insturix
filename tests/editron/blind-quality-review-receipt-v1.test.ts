import { describe, expect, it } from 'vitest';

import {
  assertBlindQualityReviewContractV1,
  assertBlindQualityReviewReceiptV1,
  createBlindQualityReviewContractV1,
  finalizeBlindQualityReviewReceiptV1,
  type BlindQualityReviewContractV1,
  type BlindQualityReviewSubmissionV1,
} from '@/lib/editron/research/open-ended-planner/blind-quality-review-receipt-v1';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';

type JsonRecord = Record<string, unknown>;

describe('generic blind-quality review receipt V1', () => {
  it('issues one immutable, hash-bound research receipt without inventing consensus', () => {
    const contract = contractFixture();
    const receipt = finalizeBlindQualityReviewReceiptV1(contract, submissionFixture(contract));

    expect(receipt).toMatchObject({
      taskId: 'STAGE25-BLIND-QUALITY-01',
      reviewerCount: 1,
      independentAgreement: 'UNVERIFIABLE_SINGLE_REVIEWER',
      consensusDisposition: 'NOT_AVAILABLE_SINGLE_REVIEWER',
      formalPromotionStatus: 'RESEARCH_EVIDENCE_ONLY_NO_PRODUCTION_PROMOTION',
      stateEffects: [],
    });
    expect(receipt.resultReviews.map(({ correction }) => correction.status))
      .toEqual(['MEASURED_HANDS_ON', 'ESTIMATED_ONLY']);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.resultReviews[0].correction)).toBe(true);
    expect(Object.isFrozen(receipt.resultReviews[0].dimensionOutcomes[0])).toBe(true);
    expect(() => assertBlindQualityReviewReceiptV1(receipt)).not.toThrow();
  });

  it.each([
    ['stale contract', (value: JsonRecord) => { value.contractHash = digest('old-contract'); }],
    ['forged pack', (value: JsonRecord) => { value.publicPackHash = digest('forged-pack'); }],
    ['missing rubric', (value: JsonRecord) => { delete value.rubricHash; }],
    ['forged result set', (value: JsonRecord) => { value.resultBindingsHash = digest('forged-results'); }],
  ])('rejects a %s binding', (_name, mutate) => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    mutate(submission);
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_SUBMISSION_BINDING_INVALID');
  });

  it('rejects altered contract material that retains a stale contract hash', () => {
    const contract = mutable(contractFixture());
    const results = contract.resultBindings as JsonRecord[];
    results[0].sha256 = digest('different-result-bytes');
    expect(() => assertBlindQualityReviewContractV1(contract))
      .toThrow('BLIND_QUALITY_REVIEW_CONTRACT_INVALID');
  });

  it('rejects a self-rehashed receipt that claims consensus', () => {
    const contract = contractFixture();
    const receipt = mutable(finalizeBlindQualityReviewReceiptV1(contract, submissionFixture(contract)));
    receipt.reviewerCount = 2;
    receipt.independentAgreement = 'CONSENSUS';
    receipt.consensusDisposition = 'ACCEPTED';
    delete receipt.receiptHash;
    receipt.receiptHash = hashCanonicalJsonV1(receipt);
    expect(() => assertBlindQualityReviewReceiptV1(receipt))
      .toThrow('BLIND_QUALITY_REVIEW_RECEIPT_INVALID');
  });

  it('refuses to issue a blind receipt when candidate identity may have been known', () => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    const reviewer = submission.reviewer as JsonRecord;
    (reviewer.blinding as JsonRecord).candidateIdentityAccess = 'MAY_HAVE_BEEN_KNOWN';
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_REVIEWER_INVALID');
  });

  it.each([
    ['missing', (outcomes: JsonRecord[]) => { outcomes.pop(); }],
    ['duplicate', (outcomes: JsonRecord[]) => { outcomes[1].dimensionId = outcomes[0].dimensionId; }],
    ['unknown', (outcomes: JsonRecord[]) => { outcomes[1].dimensionId = 'unknown-dimension'; }],
  ])('rejects %s rubric-dimension coverage', (_name, mutate) => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    mutate(dimensionOutcomes(submission));
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_DIMENSION_OUTCOMES_INVALID');
  });

  it.each([-1, 1_001, 0.5])('rejects an out-of-contract dimension score %s', (score) => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    dimensionOutcomes(submission)[0].score = score;
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_DIMENSION_SCORE_INVALID');
  });

  it('rejects result and overall PASS when a required dimension is unverifiable', () => {
    const contract = contractFixture();
    const resultPass = mutable(submissionFixture(contract));
    firstReview(resultPass).decision = 'PASS';
    markRequiredTimingUnverifiable(resultPass);
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, resultPass as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_PASS_WITH_UNVERIFIABLE_REQUIRED_DIMENSION');

    const overallPass = mutable(submissionFixture(contract));
    overallPass.overallDecision = 'PASS';
    markRequiredTimingUnverifiable(overallPass);
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, overallPass as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_OVERALL_PASS_WITH_UNVERIFIABLE_REQUIRED_DIMENSION');
  });

  it('keeps a blocking defect incompatible with a result PASS', () => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    firstReview(submission).decision = 'PASS';
    (firstReview(submission).defects as JsonRecord[])[0].severity = 'BLOCKING';
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_PASS_WITH_BLOCKING_DEFECT');
  });

  it('does not conflate estimated correction with measured hands-on evidence', () => {
    const contract = contractFixture();
    const estimatedWithMeasuredEvidence = mutable(submissionFixture(contract));
    const first = firstReview(estimatedWithMeasuredEvidence);
    (first.correction as JsonRecord).status = 'ESTIMATED_ONLY';
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, estimatedWithMeasuredEvidence as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_CORRECTION_DISPOSITION_CONFLATED');

    const measuredWithoutEvidence = mutable(submissionFixture(contract));
    (firstReview(measuredWithoutEvidence).correction as JsonRecord).measuredEvidence = null;
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, measuredWithoutEvidence as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_MEASURED_CORRECTION_EVIDENCE_REQUIRED');

    const zeroEstimate = mutable(submissionFixture(contract));
    const second = secondReview(zeroEstimate);
    (second.correction as JsonRecord).estimatedMinutes = 0;
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, zeroEstimate as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_ESTIMATED_CORRECTION_INVALID');
  });

  it.each([
    ['reviewed-before hash', (evidence: JsonRecord) => { evidence.beforeResultSha256 = digest('other-before'); }],
    ['corrected-result hash', (evidence: JsonRecord) => { evidence.correctedResultSha256 = evidence.beforeResultSha256; }],
    ['fresh-workspace hash', (evidence: JsonRecord) => { evidence.freshWorkspaceOrCloneSha256 = 'missing'; }],
    ['corrected-proof hash', (evidence: JsonRecord) => { delete evidence.correctedProofSha256; }],
    ['work-log hash', (evidence: JsonRecord) => { evidence.workLogSha256 = 'invalid'; }],
    ['manual action count', (evidence: JsonRecord) => { evidence.manualActionCount = 0; }],
    ['recorded wall duration', (evidence: JsonRecord) => { evidence.wallClockDurationMilliseconds = 89_000; }],
    ['active-plus-paused arithmetic', (evidence: JsonRecord) => { evidence.pausedDurationMilliseconds = 29_000; }],
    ['zero hidden rescue', (evidence: JsonRecord) => { evidence.externalOrHiddenRescueDurationMilliseconds = 1; }],
  ])('rejects invalid measured correction %s evidence', (_name, mutate) => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    mutate(measuredEvidence(submission));
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_MEASURED_CORRECTION_EVIDENCE_INVALID');
  });

  it('rejects a submission timestamp earlier than measured correction completion', () => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    submission.completedAt = '2026-08-25T12:01:00.000Z';
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_MEASURED_CORRECTION_EVIDENCE_INVALID');
  });

  it('requires explicit nulls instead of zero or omitted values for work not performed', () => {
    const contract = contractFixture();
    const submission = mutable(submissionFixture(contract));
    const correction = firstReview(submission).correction as JsonRecord;
    correction.status = 'NOT_PERFORMED';
    correction.durationMilliseconds = null;
    correction.estimatedMinutes = null;
    correction.measuredEvidence = null;
    correction.notes = '';
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_CORRECTION_MISSING_VALUES_NOT_EXPLICIT');

    correction.notes = 'No correction session was performed.';
    correction.durationMilliseconds = 0;
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, submission as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_CORRECTION_DISPOSITION_CONFLATED');
  });

  it('rejects incomplete playback and out-of-range timecoded defects', () => {
    const contract = contractFixture();
    const incomplete = mutable(submissionFixture(contract));
    const confirmations = incomplete.playbackConfirmations as JsonRecord[];
    confirmations[1].confirmation = 'NOT_APPLICABLE';
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, incomplete as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_PLAYBACK_INCOMPLETE');

    const invalidTimecode = mutable(submissionFixture(contract));
    const defect = (firstReview(invalidTimecode).defects as JsonRecord[])[0];
    (defect.timecode as JsonRecord).endMilliseconds = 20_000;
    expect(() => finalizeBlindQualityReviewReceiptV1(
      contract, invalidTimecode as unknown as BlindQualityReviewSubmissionV1,
    )).toThrow('BLIND_QUALITY_REVIEW_DEFECT_TIMECODE_INVALID');
  });
});

function contractFixture(): Readonly<BlindQualityReviewContractV1> {
  return createBlindQualityReviewContractV1({
    taskId: 'STAGE25-BLIND-QUALITY-01',
    publicPackHash: digest('public-pack'),
    rubricHash: digest('frozen-rubric'),
    rubricDimensions: [
      { dimensionId: 'geometry-integrity', requiredForPass: true },
      { dimensionId: 'timing-and-continuity', requiredForPass: true },
      { dimensionId: 'editorial-originality', requiredForPass: false },
    ],
    mediaBindings: [{
      artifactId: 'reference-video', sha256: digest('reference-video'), durationMilliseconds: 60_000,
      requiredPlaybackConfirmation: 'FULL_NORMAL_SPEED_AUDIOVISUAL',
    }],
    resultBindings: [
      { artifactId: 'candidate-a', sha256: digest('candidate-a'), durationMilliseconds: 11_500, requiredPlaybackConfirmation: 'FULL_NORMAL_SPEED_VISUAL' },
      { artifactId: 'candidate-b', sha256: digest('candidate-b'), durationMilliseconds: 11_500, requiredPlaybackConfirmation: 'FULL_NORMAL_SPEED_VISUAL' },
    ],
  });
}

function submissionFixture(contract: Readonly<BlindQualityReviewContractV1>): BlindQualityReviewSubmissionV1 {
  return {
    contractHash: contract.contractHash,
    publicPackHash: contract.publicPackHash,
    rubricHash: contract.rubricHash,
    mediaBindingsHash: hashCanonicalJsonV1(contract.mediaBindings),
    resultBindingsHash: hashCanonicalJsonV1(contract.resultBindings),
    reviewer: {
      pseudonym: 'qualified-editor-01',
      qualification: { status: 'QUALIFIED_FOR_THIS_REVIEW', basis: 'Professional editor and sole qualified project reviewer.' },
      blinding: {
        candidateIdentityAccess: 'NOT_ACCESSED_BEFORE_COMPLETION',
        operatorKeyAccess: 'NOT_ACCESSED_BEFORE_COMPLETION',
        otherReviewerDecisionAccess: 'NOT_ACCESSED_BEFORE_COMPLETION',
      },
    },
    completedAt: '2026-08-25T12:02:00.000Z',
    playbackConfirmations: [
      { artifactRole: 'MEDIA', artifactId: 'reference-video', confirmation: 'FULL_NORMAL_SPEED_AUDIOVISUAL' },
      { artifactRole: 'RESULT', artifactId: 'candidate-a', confirmation: 'FULL_NORMAL_SPEED_VISUAL' },
      { artifactRole: 'RESULT', artifactId: 'candidate-b', confirmation: 'FULL_NORMAL_SPEED_VISUAL' },
    ],
    resultReviews: [
      {
        resultId: 'candidate-a', decision: 'PARTIAL', confidence: { disposition: 'REPORTED', level: 'HIGH' },
        dimensionOutcomes: [
          { dimensionId: 'geometry-integrity', disposition: 'SCORED', score: 700, rationale: 'Geometry is usable after correction.' },
          { dimensionId: 'timing-and-continuity', disposition: 'SCORED', score: 640, rationale: 'Timing remains understandable.' },
          { dimensionId: 'editorial-originality', disposition: 'UNVERIFIABLE', score: null, rationale: 'Originality is outside this bounded fixture.' },
        ],
        defects: [{ defectId: 'gutter-drift', severity: 'MAJOR', description: 'Right gutter visibly narrows.', timecode: { disposition: 'MEASURED', startMilliseconds: 2_000, endMilliseconds: 2_800 } }],
        correction: {
          status: 'MEASURED_HANDS_ON', durationMilliseconds: 60_000, estimatedMinutes: null,
          measuredEvidence: {
            freshWorkspaceOrCloneDisposition: 'FRESH_ISOLATED_WORKSPACE_OR_PROJECT_CLONE',
            freshWorkspaceOrCloneSha256: digest('fresh-correction-workspace'),
            beforeResultSha256: digest('candidate-a'), correctedResultSha256: digest('candidate-a-corrected'),
            correctedProofSha256: digest('candidate-a-corrected-proof'), workLogSha256: digest('candidate-a-work-log'),
            manualActionCount: 7, wallClockDurationMilliseconds: 90_000, pausedDurationMilliseconds: 30_000,
            externalOrHiddenRescueDurationMilliseconds: 0, startedAt: '2026-08-25T12:00:00.000Z',
            completedAt: '2026-08-25T12:01:30.000Z', notes: 'Timed from first to final manual correction action.',
            exclusions: ['Thirty seconds of render waiting is recorded as paused time.'],
          }, notes: 'Corrected the gutter geometry in a timed hands-on session.',
        }, notes: 'Usable after a visible correction.',
      },
      {
        resultId: 'candidate-b', decision: 'PARTIAL', confidence: { disposition: 'REPORTED', level: 'MEDIUM' },
        dimensionOutcomes: [
          { dimensionId: 'geometry-integrity', disposition: 'SCORED', score: 820, rationale: 'Gutters remain visually consistent.' },
          { dimensionId: 'timing-and-continuity', disposition: 'SCORED', score: 790, rationale: 'The bounded movement reads consistently.' },
          { dimensionId: 'editorial-originality', disposition: 'SCORED', score: 680, rationale: 'The construction has a coherent visual voice.' },
        ],
        defects: [], correction: {
          status: 'ESTIMATED_ONLY', durationMilliseconds: null, estimatedMinutes: 4,
          measuredEvidence: null, notes: 'Estimate only; no correction session was performed.',
        }, notes: 'Promising, but correction time is not measured.',
      },
    ],
    ranking: {
      orderedResultIds: ['candidate-b', 'candidate-a'], preferredResultId: 'candidate-b',
      rationale: 'Candidate B has the stronger untreated geometry.', confidence: { disposition: 'REPORTED', level: 'MEDIUM' },
    },
    overallDecision: 'PARTIAL', notes: 'One qualified blinded review only.',
  };
}

function firstReview(value: JsonRecord): JsonRecord { return (value.resultReviews as JsonRecord[])[0]; }
function secondReview(value: JsonRecord): JsonRecord { return (value.resultReviews as JsonRecord[])[1]; }
function measuredEvidence(value: JsonRecord): JsonRecord {
  return (firstReview(value).correction as JsonRecord).measuredEvidence as JsonRecord;
}
function dimensionOutcomes(value: JsonRecord): JsonRecord[] {
  return firstReview(value).dimensionOutcomes as JsonRecord[];
}
function markRequiredTimingUnverifiable(value: JsonRecord): void {
  const timing = dimensionOutcomes(value).find(({ dimensionId }) => dimensionId === 'timing-and-continuity');
  if (!timing) throw new Error('TEST_TIMING_DIMENSION_MISSING');
  timing.disposition = 'UNVERIFIABLE'; timing.score = null; timing.rationale = 'Timing could not be verified.';
}
function mutable(value: unknown): JsonRecord { return structuredClone(value) as JsonRecord; }
function digest(label: string): string { return hashCanonicalJsonV1({ label }); }
