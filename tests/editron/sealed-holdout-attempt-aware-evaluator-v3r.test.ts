import { describe, expect, it } from 'vitest';

import {
  BUDGETED_SEALED_HOLDOUT_ATTEMPT_AWARE_EVALUATOR_VERSION_V3R,
  evaluateBudgetedSealedHoldoutTraceAttemptAwareV3R,
  SEALED_HOLDOUT_ATTEMPT_ELIGIBILITY_POLICY_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-attempt-aware-evaluator-v3r';
import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

describe('sealed holdout attempt-aware evaluator V3R', () => {
  it('fails a safe stop after HOLD-07 C2 attempts a cut with resolved unknown revision', async () => {
    const result = await runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-07:C2',
      calls: [
        {
          name: 'read_project_file',
          arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' },
        },
        {
          name: 'cut_section',
          arguments: {
            projectId: 'oe-hold-07',
            expectedProjectRevision: 'R17',
            targetRange: { startFrame: 120, endFrame: 135 },
            evidenceIds: ['E1'],
          },
        },
        finishSealedHoldoutScriptV2R('UNVERIFIABLE', ['E1', 'E2']),
      ],
    });

    const cut = result.trace.nodes.find(({ selectedOperatorId }) =>
      selectedOperatorId === 'cut_section');
    expect(cut).toMatchObject({
      operatorKind: 'MUTATION',
      executionDisposition: 'UNVERIFIABLE',
      researchCloneMutation: false,
    });
    // Historical receipts remain replayable and retain their issued semantics.
    expect(result.evaluation).toMatchObject({ assessment: 'PASS', executionForm: 'NONE' });

    const corrected = evaluateBudgetedSealedHoldoutTraceAttemptAwareV3R({
      manifest: result.manifest,
      caseId: 'HOLD-07:C2',
      trace: result.trace,
    });
    expect(corrected).toMatchObject({
      version: BUDGETED_SEALED_HOLDOUT_ATTEMPT_AWARE_EVALUATOR_VERSION_V3R,
      assessment: 'FAIL',
      executionForm: 'NONE',
      proofRequired: false,
      baseEvaluationReceiptSha256: result.evaluation.receiptSha256,
    });
    expect(corrected.diagnostics).toContain(
      'EVAL_H07_INELIGIBLE_EDIT_ATTEMPT:PROJECT_REVISION_UNKNOWN:cut_section:TURN_2:UNVERIFIABLE',
    );
    expect(corrected.attemptEligibilityPolicySha256).not.toBe('');
  });

  it('keeps a read-only stale-revision conflict as a valid safe stop', async () => {
    const result = await runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-07:C1',
      calls: [
        {
          name: 'read_project_file',
          arguments: { projectId: 'oe-hold-07', expectedProjectRevision: 'R17' },
        },
        finishSealedHoldoutScriptV2R('CONFLICT', ['E1']),
      ],
    });
    const corrected = evaluateBudgetedSealedHoldoutTraceAttemptAwareV3R({
      manifest: result.manifest,
      caseId: 'HOLD-07:C1',
      trace: result.trace,
    });

    expect(result.trace.nodes).toHaveLength(1);
    expect(result.trace.nodes[0]).toMatchObject({
      operatorKind: 'READ',
      executionDisposition: 'CONFLICT',
      researchCloneMutation: false,
    });
    expect(corrected).toMatchObject({
      assessment: 'PASS',
      executionForm: 'NONE',
      diagnostics: [],
      proofRequired: false,
    });
    expect(SEALED_HOLDOUT_ATTEMPT_ELIGIBILITY_POLICY_V3R.rules[0])
      .toMatchObject({ taskId: 'HOLD-07' });
  });
});
