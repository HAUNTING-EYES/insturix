import { deepFreezeV1 } from './contracts-v1';

export interface StageBudgetV2Shape {
  maxInputTokens: number;
  maxVisibleOutputTokens: number;
  maxReasoningTokens: number;
  maxWallClockMs: number;
  maxProviderCostUsd: number;
}

export const PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R =
  'EDITRON_OE_PER_ATTEMPT_BUDGET_POLICY_V2R' as const;

// V2-1R per-attempt budget law.
//
// Under the pre-V2R harness the stage budget was a single shared pool that each
// attempt decremented. A slow first attempt therefore left the repair attempt
// only the residue of the wall clock, producing a false PROVIDER_TIMEOUT that
// was misrecorded as an editing failure (the DEV-01 Luna incident: a 25.6 s
// first response left the repair ~14.4 s of a shared 40 s stage budget).
//
// The corrected rule: every permitted attempt receives its own declared budget,
// freshly allocated from the stage budget. No attempt inherits another attempt's
// residue. The stage budget is the per-attempt declaration; the run records each
// attempt's actual spend so total cost remains auditable.
export const PER_ATTEMPT_BUDGET_POLICY_V2R = deepFreezeV1({
  policyVersion: PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R,
  authority: 'RESEARCH_ONLY_FAIR_BUDGET_ALLOCATION',
  rule: 'EVERY_PERMITTED_ATTEMPT_RECEIVES ITS_OWN_DECLARED_BUDGET',
  allocation: 'FRESH_PER_ATTEMPT_FROM_STAGE_BUDGET',
  prohibited: 'INHERITING_RESIDUAL_WALL_CLOCK_OR_TOKENS_FROM_A_PRIOR_ATTEMPT',
});

export function perAttemptStageBudgetV2R(limit: StageBudgetV2Shape): {
  input: number; visible: number; reasoning: number; wall: number; cost: number;
} {
  return {
    input: limit.maxInputTokens,
    visible: limit.maxVisibleOutputTokens,
    reasoning: limit.maxReasoningTokens,
    wall: limit.maxWallClockMs,
    cost: limit.maxProviderCostUsd,
  };
}
