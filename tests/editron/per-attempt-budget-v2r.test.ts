import { describe, expect, it } from 'vitest';

import {
  PER_ATTEMPT_BUDGET_POLICY_V2R,
  PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
  perAttemptStageBudgetV2R,
} from '@/lib/editron/research/open-ended-planner/per-attempt-budget-v2r';

const stageBudget = {
  maxInputTokens: 30000,
  maxVisibleOutputTokens: 8000,
  maxReasoningTokens: 5000,
  maxWallClockMs: 40000,
  maxProviderCostUsd: 0.3,
};

describe('V2-1R per-attempt budget policy', () => {
  it('freezes the per-attempt budget law', () => {
    expect(Object.isFrozen(PER_ATTEMPT_BUDGET_POLICY_V2R)).toBe(true);
    expect(PER_ATTEMPT_BUDGET_POLICY_V2R.policyVersion).toBe(PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R);
    expect(PER_ATTEMPT_BUDGET_POLICY_V2R.rule).toBe('EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET');
    expect(PER_ATTEMPT_BUDGET_POLICY_V2R.prohibited).toBe('INHERITING_RESIDUAL_WALL_CLOCK_OR_TOKENS_FROM_A_PRIOR_ATTEMPT');
  });

  it('allocates every attempt the full declared stage budget, never a residue', () => {
    const budget = perAttemptStageBudgetV2R(stageBudget);
    expect(budget).toEqual({
      input: 30000,
      visible: 8000,
      reasoning: 5000,
      wall: 40000,
      cost: 0.3,
    });
    const again = perAttemptStageBudgetV2R(stageBudget);
    expect(again).toEqual(budget);
  });
});
