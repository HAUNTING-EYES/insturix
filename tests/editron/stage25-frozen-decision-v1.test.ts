import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  STAGE25_FROZEN_DECISION_EVIDENCE_V1,
  STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1,
  assertStage25FrozenDecisionReceiptV1,
  finalizeStage25FrozenDecisionV1,
  type Stage25FrozenDecisionInputV1,
} from '@/lib/editron/research/open-ended-planner/stage25-frozen-decision-v1';

describe('Stage 2.5 frozen decision V1', () => {
  it('issues the one frozen MODIFY decision and blocks Stage 3', () => {
    const receipt = finalizeStage25FrozenDecisionV1(validInput());

    expect(receipt).toMatchObject({
      decision: 'MODIFY',
      stage25Status: 'FROZEN_MODIFY_DECISION_ISSUED',
      stage3ProductionModelDrivenMutation: 'BLOCKED_NOT_AUTHORIZED',
      goAuthorized: false,
      noGoIssued: false,
      modelRankingAuthorized: false,
      paidCohortRerunAuthorized: false,
      providerInferenceCalls: 0,
      canonicalProjectMutations: 0,
      historicalPaidCohortInterpretation: {
        validStructuralPassCount: 7,
        validOwnerSupportedSafeStopCount: 9,
        genuineFailureCount: 2,
        confoundedCount: 5,
        providerResourceNonEvaluationCount: 1,
        confoundedDisposition:
          'PERMANENTLY_CONFOUNDED_UNVERIFIABLE_EXCLUDED_FROM_MODEL_SCORING',
        providerNonEvaluationDisposition: 'UNVERIFIABLE_NOT_PASS_OR_FAILURE',
      },
    });
    expect(receipt.requiredModificationsBeforeReconsideration)
      .toContain('COLLECT_QUALIFIED_BLIND_RHC01_TO_RHC04_HUMAN_REVIEWS');
    expect(() => assertStage25FrozenDecisionReceiptV1(receipt)).not.toThrow();
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('rejects omitted, reordered, and substituted evidence', () => {
    const omitted = validInput();
    omitted.evidence.pop();
    expect(() => finalizeStage25FrozenDecisionV1(omitted))
      .toThrow('STAGE25_FROZEN_DECISION_EVIDENCE_SET_INVALID');

    const reordered = validInput();
    [reordered.evidence[0], reordered.evidence[1]] =
      [reordered.evidence[1], reordered.evidence[0]];
    expect(() => finalizeStage25FrozenDecisionV1(reordered))
      .toThrow('STAGE25_FROZEN_DECISION_EVIDENCE_INVALID:HREF01_REFERENCE_REVIEW');

    const substituted = validInput();
    substituted.evidence[9].canonicalSha256 = 'f'.repeat(64);
    expect(() => finalizeStage25FrozenDecisionV1(substituted))
      .toThrow('STAGE25_FROZEN_DECISION_EVIDENCE_INVALID:LONG_FORM_PRODUCT_EVIDENCE');
  });

  it('rejects promoted dispositions and a fabricated successor episode', () => {
    const promoted = validInput();
    promoted.evidence[10].disposition = 'PASS';
    expect(() => finalizeStage25FrozenDecisionV1(promoted))
      .toThrow('STAGE25_FROZEN_DECISION_EVIDENCE_INVALID:HUMAN_QUALITY_EVIDENCE');

    const successor = validInput();
    (successor.successorWholeEpisode as unknown as { providerInferenceCalls: number })
      .providerInferenceCalls = 1;
    expect(() => finalizeStage25FrozenDecisionV1(successor))
      .toThrow('STAGE25_FROZEN_DECISION_DECISION_PREMISE_INVALID');

    const spend = validInput();
    (spend.successorWholeEpisode as unknown as { providerSpendUsd: number }).providerSpendUsd = 1;
    expect(() => finalizeStage25FrozenDecisionV1(spend))
      .toThrow('STAGE25_FROZEN_DECISION_DECISION_PREMISE_INVALID');
  });

  it('rejects dirty source, changed test closure, and a tampered receipt', () => {
    const dirty = validInput();
    dirty.source.relevantStatusEntries.push(' M lib/editron/unsafe.ts');
    expect(() => finalizeStage25FrozenDecisionV1(dirty))
      .toThrow('STAGE25_FROZEN_DECISION_SOURCE_OR_TEST_IDENTITY_INVALID');

    const tests = validInput();
    tests.ownerTests.testFiles.pop();
    expect(() => finalizeStage25FrozenDecisionV1(tests))
      .toThrow('STAGE25_FROZEN_DECISION_SOURCE_OR_TEST_IDENTITY_INVALID');

    const receipt = structuredClone(
      finalizeStage25FrozenDecisionV1(validInput()),
    ) as unknown as { decision: string };
    receipt.decision = 'GO';
    expect(() => assertStage25FrozenDecisionReceiptV1(receipt))
      .toThrow('STAGE25_FROZEN_DECISION_RECEIPT_INVALID');
  });

  it('keeps the operator read-only and outside provider/project authority', () => {
    const source = readFileSync(path.join(
      process.cwd(), 'tests/editron/helpers/stage25-frozen-decision-operator-v1.ts',
    ), 'utf8');

    expect(source).toContain('finalizeStage25FrozenDecisionV1');
    for (const forbidden of [
      'generateContent(', 'fetch(', 'Sandbox.create(', 'ProjectService',
      'connectToDatabase(', 'uploadToR2(', 'PutObjectCommand', 'insertOne(', 'updateOne(',
    ]) expect(source).not.toContain(forbidden);
  });
});

function validInput(): MutableInput {
  return structuredClone({
    source: {
      commitSha: '1'.repeat(40), treeSha: '2'.repeat(40),
      relevantScopeSha256: '3'.repeat(64), relevantTrackedFileCount: 2_000,
      relevantStatusEntries: [],
    },
    generatedAt: '2026-08-28T00:00:00.000Z',
    ownerTests: {
      reportSha256: '4'.repeat(64),
      testFiles: [...STAGE25_FROZEN_DECISION_OWNER_TEST_FILES_V1],
      passedTestCount: 20, failedTestCount: 0,
    },
    evidence: STAGE25_FROZEN_DECISION_EVIDENCE_V1.map((item, index) => ({
      ...item, fileSha256: index.toString(16).padStart(64, '0'),
    })),
    successorWholeEpisode: {
      disposition: 'NOT_RUN_NOT_AUTHORIZED_AND_NOT_DECISION_CRITICAL',
      providerInferenceCalls: 0, providerSpendUsd: 0,
    },
  } satisfies Stage25FrozenDecisionInputV1) as MutableInput;
}

type MutableInput = Omit<Stage25FrozenDecisionInputV1, 'source' | 'ownerTests' | 'evidence'> & {
  source: Omit<Stage25FrozenDecisionInputV1['source'], 'relevantStatusEntries'> & {
    relevantStatusEntries: string[];
  };
  ownerTests: Omit<Stage25FrozenDecisionInputV1['ownerTests'], 'testFiles'> & {
    testFiles: string[];
  };
  evidence: Array<{
    evidenceId: typeof STAGE25_FROZEN_DECISION_EVIDENCE_V1[number]['evidenceId'];
    canonicalSha256: string;
    fileSha256: string;
    disposition: string;
  }>;
};
