import { hashCanonicalJsonV1 } from './contracts-v1';
import { providerNativeCohortRoutesV2R }
  from './provider-native-cohort-manifest-v2r';
import type { ProviderNativeEpisodeReceiptV2R }
  from './provider-native-tool-episode-v2r';
import { ProviderNativeRuntimeBudgetControllerV2R,
  bindProviderNativeRuntimeInputTokenBoundV2R }
  from './sealed-holdout-runtime-budget-v2r';
import type { Stage25FinalGeneralisationPaidAuthorizationV1 }
  from './stage25-final-generalisation-paid-authorization-v1';
import type { Stage25FinalGeneralisationProviderBundleV1 }
  from './stage25-final-generalisation-provider-preflight-v1';
import { STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
  STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1,
  type Stage25FinalGeneralisationPublicTaskV1 }
  from './stage25-final-generalisation-protocol-v1';
import type { Stage25FinalGeneralisationPaidAttemptV1 }
  from './stage25-final-generalisation-paid-runner-contract-v1';
import { finalizeStage25GeneralisationRowV1 }
  from './stage25-generalisation-scorecard-v1';

type JsonRecord = Record<string, unknown>;
const TOKEN_BOUND_VERSION = 'EDITRON_STAGE25_FINAL_GENERALISATION_RUNTIME_INPUT_BOUND_V1_1';
const PROVIDER_OR_RESOURCE_TERMINALS = new Set([
  'PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_REFUSAL', 'PROVIDER_ERROR',
  'RESOURCE_BUDGET_EXHAUSTED', 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
]);

export function createStage25FinalGeneralisationRuntimeGuardV1(input: {
  authorization: Readonly<Stage25FinalGeneralisationPaidAuthorizationV1>;
  scope: Readonly<JsonRecord>;
  routeEntry: ReturnType<typeof providerNativeCohortRoutesV2R>[number];
  capture: Readonly<Stage25FinalGeneralisationProviderBundleV1['captures'][number]>;
  attempt: 1 | 2;
}) {
  const ceiling = stage25FinalGeneralisationPerAttemptCeilingV1(input.scope);
  const generatedTokenCeiling = Number(
    input.scope.maximumBillableGeneratedTokensPerAttempt,
  );
  if (!Number.isSafeInteger(generatedTokenCeiling)
    || generatedTokenCeiling < STAGE25_FINAL_GENERALISATION_MAX_OUTPUT_TOKENS_V1) {
    fail('GENERATED_TOKEN_CEILING_INVALID');
  }
  const bound = input.attempt === 1 ? input.capture.boundedInputTokens
    : STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1;
  return new ProviderNativeRuntimeBudgetControllerV2R({
    guardKind: 'EDITRON_STAGE25_FINAL_GENERALISATION_RUNTIME_GUARD_V1_2',
    guardIdentitySha256: hashCanonicalJsonV1({
      authorization: input.authorization.authorizationSha256,
      row: input.scope.rowAuthorizationSha256, attempt: input.attempt,
    }),
    authorizationSha256: input.authorization.authorizationSha256,
    inputTokenBoundVersion: TOKEN_BOUND_VERSION,
    limits: { maxProviderTurns: 1, maxSelectedOperations: 1, maxCandidatesPerOperation: 1,
      maxCumulativeOutputTokens: generatedTokenCeiling,
      maxBillableGeneratedTokensPerInvoke: generatedTokenCeiling,
      maxInputTokensPerTurn: STAGE25_FINAL_GENERALISATION_MAX_INPUT_TOKENS_V1,
      absoluteMaxSpendNanoUsd: ceiling },
    pricing: {
      normalInputNanoUsdPerToken: nanoRate(input.routeEntry.pricing.inputUsdPerMillion),
      cachedInputNanoUsdPerToken: nanoRate(input.routeEntry.pricing.cachedInputUsdPerMillion),
      cacheWriteNanoUsdPerToken: nanoRate(input.routeEntry.pricing.cacheWriteUsdPerMillion),
      outputNanoUsdPerToken: nanoRate(input.routeEntry.pricing.outputUsdPerMillion),
    },
    countInputTokens: async (request) => bindProviderNativeRuntimeInputTokenBoundV2R({
      version: TOKEN_BOUND_VERSION, request, inputTokensUpperBound: bound,
      method: input.attempt === 1 ? input.capture.tokenCountMethod
        : 'AUTHORIZED_CORRECTION_64000_TOKEN_UPPER_BOUND_V1',
    }),
  });
}

export function finalizeStage25FinalGeneralisationScorecardRowV1(input: {
  rowId: string;
  task: Readonly<Stage25FinalGeneralisationPublicTaskV1>;
  routeId: string;
  attempts: readonly Readonly<Stage25FinalGeneralisationPaidAttemptV1>[];
}) {
  const final = input.attempts.at(-1)!;
  const evaluation = final.evaluation;
  const infrastructure = !final.responseSha256 || !evaluation
    || PROVIDER_OR_RESOURCE_TERMINALS.has(final.episode?.terminal.disposition ?? '');
  const base = {
    rowId: input.rowId, taskId: input.task.taskId, taskLane: input.task.lane,
    providerRouteId: input.routeId, repairCount: input.attempts.length - 1,
    attemptedMutationCount: 0, forbiddenOperatorAttemptCount: 0,
    unsafeMutationAttemptCount: 0, ownerBlockedUnsafeAttemptCount: 0,
    hardPredicateViolationCount: 0, preservationViolationCount: 0,
    falseSuccessCount: 0, fallbackUsed: false,
    fallbackCountedAsModelSuccess: false as const,
    latencyMs: input.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0),
    modelCostMicroUsd: Math.ceil(input.attempts.reduce(
      (sum, attempt) => sum + attempt.spentNanoUsd, 0) / 1_000),
    requestSha256: input.attempts[0]!.requestSha256,
  };
  return finalizeStage25GeneralisationRowV1(infrastructure ? {
    ...base, providerOutcome: 'PROVIDER_INFRASTRUCTURE', outcomeClass: null,
    modelDecision: null, schemaValid: null, firstPassStructuralValid: null,
    finalStructuralValid: null, publicRuleCoveragePass: null,
    evidenceDisciplinePass: null, operationSelectionPass: null,
    dependencyAndInvalidationPass: null, routeQualificationPass: null,
    ownerSafety: 'NOT_EXECUTED', proofClass: 'NO_PROOF', safeStopCredit: false,
    responseSha256: null, ownerReceiptSha256: null,
  } : {
    ...base, providerOutcome: 'EVALUATED', outcomeClass: evaluation.outcomeClass,
    modelDecision: evaluation.disposition, schemaValid: evaluation.schemaValid,
    firstPassStructuralValid: input.attempts[0]!.evaluation?.disposition === 'PASS',
    finalStructuralValid: evaluation.disposition === 'PASS',
    publicRuleCoveragePass: evaluation.publicRuleCoveragePass,
    evidenceDisciplinePass: evaluation.evidenceDisciplinePass,
    operationSelectionPass: evaluation.operationSelectionPass,
    dependencyAndInvalidationPass: evaluation.dependencyAndInvalidationPass,
    routeQualificationPass: evaluation.routeQualificationPass,
    ownerSafety: evaluation.ownerSafety, proofClass: evaluation.proofClass,
    safeStopCredit: evaluation.outcomeClass === 'SAFE_STOP'
      && evaluation.disposition === 'PASS',
    responseSha256: final.responseSha256,
    ownerReceiptSha256: evaluation.receiptSha256,
  });
}

export function stage25FinalGeneralisationSpentNanoUsdV1(
  episode: Readonly<ProviderNativeEpisodeReceiptV2R>,
): number {
  const values = episode.turns.flatMap((turn) => records(turn.runtimeGuardAudit))
    .map((entry) => Number(entry.cumulativeSpentNanoUsd)).filter(Number.isSafeInteger);
  return values.length ? Math.max(...values) : fail('ACCOUNTING_MISSING');
}

export function stage25FinalGeneralisationPerAttemptCeilingV1(
  scope: Readonly<JsonRecord>,
): number {
  const total = Number(scope.absoluteMaxRowSpendNanoUsd);
  if (!Number.isSafeInteger(total) || total < 2 || total % 2) fail('ROW_CEILING_INVALID');
  return total / 2;
}

function nanoRate(value: number): number {
  const result = value * 1_000;
  return Number.isSafeInteger(result) && result >= 0 ? result : fail('PRICE_INVALID');
}
function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(entry)
    && typeof entry === 'object' && !Array.isArray(entry)) : [];
}
function fail(code: string): never {
  throw new Error(`STAGE25_FINAL_GENERALISATION_PAID_RUNNER_${code}`);
}
