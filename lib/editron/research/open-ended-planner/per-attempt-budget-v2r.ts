import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { HashedStagePacketV2 } from './staged-packet-v2';

export interface StageBudgetV2Shape {
  maxInputTokens: number;
  maxVisibleOutputTokens: number;
  maxReasoningTokens: number;
  maxWallClockMs: number;
  maxProviderCostUsd: number;
}

export const PER_ATTEMPT_BUDGET_POLICY_VERSION_V2R =
  'EDITRON_OE_PER_ATTEMPT_BUDGET_POLICY_V2R' as const;

export const V2R_PROVIDER_STAGE_BUDGET_SCHEDULE_VERSION =
  'EDITRON_OE_V2R_PROVIDER_STAGE_BUDGET_SCHEDULE_V2' as const;
export const V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE = 2 as const;
export const V2R_PROVIDER_ATTEMPT_NUMBERS = deepFreezeV1([1, 2] as const);

export type V2RProviderStage = 1 | 2 | 3;
export type V2RProviderStageBudgetSchedule = Readonly<Record<
  V2RProviderStage,
  Readonly<StageBudgetV2Shape>
>>;

export const V2R_PROVIDER_STAGE_BUDGETS: V2RProviderStageBudgetSchedule = deepFreezeV1({
  1: { maxInputTokens: 30000, maxVisibleOutputTokens: 10000, maxReasoningTokens: 3000, maxWallClockMs: 420000, maxProviderCostUsd: 0.70 },
  2: { maxInputTokens: 70000, maxVisibleOutputTokens: 16000, maxReasoningTokens: 5000, maxWallClockMs: 420000, maxProviderCostUsd: 0.70 },
  3: { maxInputTokens: 60000, maxVisibleOutputTokens: 12000, maxReasoningTokens: 3000, maxWallClockMs: 420000, maxProviderCostUsd: 0.60 },
});

export interface V2RProviderStageBudgetScheduleIdentity {
  version: typeof V2R_PROVIDER_STAGE_BUDGET_SCHEDULE_VERSION;
  maximumAttemptsPerStage: typeof V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE;
  stageBudgets: V2RProviderStageBudgetSchedule;
  scheduleSha256: string;
}

export function v2rProviderStageBudgetScheduleIdentity(): Readonly<V2RProviderStageBudgetScheduleIdentity> {
  const material = {
    version: V2R_PROVIDER_STAGE_BUDGET_SCHEDULE_VERSION,
    maximumAttemptsPerStage: V2R_MAX_PROVIDER_ATTEMPTS_PER_STAGE,
    stageBudgets: V2R_PROVIDER_STAGE_BUDGETS,
  };
  return deepFreezeV1({ ...material, scheduleSha256: hashCanonicalJsonV1(material) });
}

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

export function bindV2RProviderStageBudgetV2(
  source: HashedStagePacketV2,
): Readonly<HashedStagePacketV2> {
  const stage = source.packet.stage;
  if (stage !== 1 && stage !== 2 && stage !== 3) {
    throw new Error(`V2R_PROVIDER_STAGE_BUDGET_UNSUPPORTED:STAGE_${stage}`);
  }
  const packet = deepFreezeV1({
    ...source.packet,
    stageBudget: V2R_PROVIDER_STAGE_BUDGETS[stage],
  });
  const transportAttachments = deepFreezeV1([...source.transportAttachments]);
  return deepFreezeV1({
    packet,
    packetHash: hashCanonicalJsonV1(packet),
    transportAttachments,
    transportHash: hashCanonicalJsonV1(transportAttachments),
  });
}
