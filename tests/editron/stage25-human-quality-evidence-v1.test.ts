import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBlindQualityReviewContractV1 }
  from '@/lib/editron/research/open-ended-planner/blind-quality-review-receipt-v1';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1,
  STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1,
  STAGE25_HUMAN_QUALITY_TASK_IDS_V1,
  assertStage25HumanQualityEvidenceReceiptV1,
  finalizeStage25HumanQualityEvidenceV1,
  type Stage25HumanQualityEvidenceInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-human-quality-evidence-v1';

describe('Stage 2.5 human quality evidence V1', () => {
  it('freezes an incomplete human-evidence receipt without inventing a judgment', () => {
    const receipt = finalizeStage25HumanQualityEvidenceV1(validInput());

    expect(receipt).toMatchObject({
      assessment: 'MODIFY_HUMAN_QUALITY_CORRECTION_EVIDENCE_INCOMPLETE',
      proofCeiling: 'HASH_BOUND_PLAYABLE_REVIEW_INPUTS_AND_TECHNICAL_TELEMETRY_ONLY',
      qualifiedHumanReviewReceiptCount: 0,
      independentAgreement: 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION',
      providerInferenceCalls: 0,
      canonicalProjectMutations: 0,
      stage25DecisionImpact: 'BLOCKS_GO_SUPPORTS_MODIFY',
    });
    expect(receipt.tasks).toHaveLength(4);
    expect(receipt.tasks.every(({ humanQualityDisposition }) =>
      humanQualityDisposition === 'UNVERIFIABLE_NO_QUALIFIED_REVIEW_SUBMISSION')).toBe(true);
    expect(() => assertStage25HumanQualityEvidenceReceiptV1(receipt)).not.toThrow();
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('rejects substituted technical evidence and a replacement RHC-01 public pack', () => {
    const receipt = validInput();
    (receipt.tasks[1].technicalReceipt as { receiptSha256: string }).receiptSha256 = 'f'.repeat(64);
    expect(() => finalizeStage25HumanQualityEvidenceV1(receipt))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_TASK_EVIDENCE_INVALID:RHC-02');

    const pack = validInput();
    pack.tasks[0] = taskInput('RHC-01', 'e'.repeat(64));
    expect(() => finalizeStage25HumanQualityEvidenceV1(pack))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_TASK_EVIDENCE_INVALID:RHC-01');
  });

  it('rejects a forged human receipt and claimed hands-on correction', () => {
    const human = validInput();
    (human.tasks[0] as unknown as { humanReviewReceiptSha256: string }).humanReviewReceiptSha256 =
      'a'.repeat(64);
    expect(() => finalizeStage25HumanQualityEvidenceV1(human))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_TASK_EVIDENCE_INVALID:RHC-01');

    const correction = validInput();
    (correction.tasks[3] as unknown as { correctionDisposition: string }).correctionDisposition =
      'MEASURED_HANDS_ON';
    expect(() => finalizeStage25HumanQualityEvidenceV1(correction))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_TASK_EVIDENCE_INVALID:RHC-04');
  });

  it('rejects changed rubric/artifacts and invented latency or cost', () => {
    const rubric = validInput();
    const old = rubric.tasks[2];
    rubric.tasks[2] = {
      ...old,
      reviewContract: createBlindQualityReviewContractV1({
        taskId: old.taskId, publicPackHash: old.publicPackHash,
        rubricHash: 'a'.repeat(64),
        rubricDimensions: [{ dimensionId: 'replacement', requiredForPass: true }],
        mediaBindings: old.reviewContract.mediaBindings,
        resultBindings: old.reviewContract.resultBindings,
      }),
    };
    expect(() => finalizeStage25HumanQualityEvidenceV1(rubric))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_REVIEW_CONTRACT_INVALID:RHC-03');

    const telemetry = validInput();
    (telemetry.tasks[1].telemetry as unknown as { renderWallTimesMs: number[] })
      .renderWallTimesMs = [1];
    expect(() => finalizeStage25HumanQualityEvidenceV1(telemetry))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_TASK_EVIDENCE_INVALID:RHC-02');

    const cost = validInput();
    (cost.tasks[3].telemetry as unknown as { costUsd: number }).costUsd = 0;
    expect(() => finalizeStage25HumanQualityEvidenceV1(cost))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_TASK_EVIDENCE_INVALID:RHC-04');
  });

  it('rejects dirty source, missing tests, and a tampered sealed receipt', () => {
    const dirty = validInput();
    (dirty.source as unknown as { relevantStatusEntries: string[] }).relevantStatusEntries =
      [' M lib/editron/unsafe.ts'];
    expect(() => finalizeStage25HumanQualityEvidenceV1(dirty))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_SOURCE_OR_TEST_IDENTITY_INVALID');

    const tests = validInput();
    (tests.ownerTests as unknown as { testFiles: string[] }).testFiles =
      tests.ownerTests.testFiles.slice(1);
    expect(() => finalizeStage25HumanQualityEvidenceV1(tests))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_SOURCE_OR_TEST_IDENTITY_INVALID');

    const receipt = structuredClone(finalizeStage25HumanQualityEvidenceV1(validInput()));
    receipt.tasks[0].humanQualityDisposition = 'PASS' as typeof receipt.tasks[0]['humanQualityDisposition'];
    expect(() => assertStage25HumanQualityEvidenceReceiptV1(receipt))
      .toThrow('STAGE25_HUMAN_QUALITY_EVIDENCE_RECEIPT_INVALID');
  });

  it('keeps the one-shot operator outside secret, provider, project, and route-key authority', () => {
    const source = readFileSync(path.join(
      process.cwd(), 'tests/editron/helpers/stage25-human-quality-evidence-operator-v1.ts',
    ), 'utf8');

    expect(source).toContain('createBlindQualityReviewContractV1');
    expect(source).toContain('copyFile');
    for (const forbidden of [
      'candidate-key.json', 'operator-only', 'generateContent(', 'Sandbox.create(',
      'ProjectService', 'connectToDatabase(', 'uploadToR2(', 'PutObjectCommand',
    ]) expect(source).not.toContain(forbidden);
  });
});

function validInput(): Stage25HumanQualityEvidenceInputV1 & { tasks: ReturnType<typeof taskInput>[] } {
  return structuredClone({
    source: { commitSha: '1'.repeat(40), treeSha: '2'.repeat(40), relevantScopeSha256: '3'.repeat(64), relevantTrackedFileCount: 2_000, relevantStatusEntries: [] },
    generatedAt: '2026-08-28T00:00:00.000Z', reviewerPacketSha256: '4'.repeat(64),
    ownerTests: { reportSha256: '5'.repeat(64), testFiles: [...STAGE25_HUMAN_QUALITY_OWNER_TEST_FILES_V1], passedTestCount: 10, failedTestCount: 0 },
    tasks: STAGE25_HUMAN_QUALITY_TASK_IDS_V1.map((taskId) => taskInput(taskId)),
  });
}

function taskInput(taskId: typeof STAGE25_HUMAN_QUALITY_TASK_IDS_V1[number], publicPackOverride?: string) {
  const accepted = STAGE25_HUMAN_QUALITY_ACCEPTED_TASKS_V1[taskId];
  const publicPackHash = publicPackOverride ?? accepted.publicPackSha256 ?? hashCanonicalJsonV1({ taskId, pack: 'public-review-v1' });
  const rubricDimensions = accepted.rubricDimensionIds.map((dimensionId) => ({ dimensionId, requiredForPass: true }));
  const reviewContract = createBlindQualityReviewContractV1({
    taskId, publicPackHash, rubricHash: hashCanonicalJsonV1(rubricDimensions),
    rubricDimensions, mediaBindings: accepted.mediaBindings, resultBindings: accepted.resultBindings,
  });
  return {
    taskId, taskSha256: hashCanonicalJsonV1({ taskId }),
    technicalReceipt: { receiptSha256: accepted.technicalReceiptSha256, receiptFileSha256: '6'.repeat(64), assessment: accepted.technicalAssessment, humanQuality: 'UNJUDGED' as const },
    publicPackHash, reviewContract, humanReviewReceiptSha256: null,
    correctionDisposition: accepted.correctionDisposition,
    telemetry: { latencyDisposition: accepted.latencyDisposition, renderWallTimesMs: accepted.renderWallTimesMs, costDisposition: accepted.costDisposition, costUsd: null, sourceReceiptSha256: accepted.technicalReceiptSha256 },
  };
}
