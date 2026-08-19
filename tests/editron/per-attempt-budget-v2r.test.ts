import { describe, expect, it } from 'vitest';

import {
  PER_ATTEMPT_BUDGET_POLICY_V2R,
  PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
  V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE,
  V2R_PROVIDER_ATTEMPT_NUMBERS,
  V2R_PROVIDER_STAGE_BUDGETS,
  perAttemptStageBudgetV2R,
  v2rProviderStageBudgetScheduleIdentity,
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

  it('freezes and hashes the exact fair provider schedule', () => {
    const identity = v2rProviderStageBudgetScheduleIdentity();
    expect(identity.maximumAttemptsPerStage).toBe(V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE);
    expect(V2R_PROVIDER_ATTEMPT_NUMBERS).toEqual([1, 2]);
    expect(Object.isFrozen(V2R_PROVIDER_ATTEMPT_NUMBERS)).toBe(true);
    expect(identity.stageBudgets).toEqual(V2R_PROVIDER_STAGE_BUDGETS);
    expect(identity.stageBudgets[1].maxInputTokens).toBe(30000);
    expect(identity.stageBudgets[2].maxInputTokens).toBe(70000);
    expect(identity.stageBudgets[3].maxInputTokens).toBe(60000);
    expect(identity.scheduleSha256).toHaveLength(64);
    expect(v2rProviderStageBudgetScheduleIdentity()).toEqual(identity);
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.stageBudgets[2])).toBe(true);
  });
});
