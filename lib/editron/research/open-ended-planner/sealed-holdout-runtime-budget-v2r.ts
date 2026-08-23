import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG_REVISION } from './operator-catalog-v2r';
import {
  PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R,
  PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
  type ProviderNativeRuntimeGuardResumeStateV2R,
} from './provider-native-episode-resume-v2r';
import type {
  ProviderNativeInvokeResponseV2R,
  ProviderNativeRuntimeGuardDecisionV2R,
  ProviderNativeRuntimeGuardV2R,
  ProviderNativeTerminalDispositionV2R,
  ProviderNativeToolExecutionV2R,
} from './provider-native-tool-episode-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  assertProviderNativeDurableAttemptReceiptV2R,
  type ProviderNativeDurableAttemptReceiptV2R,
} from './provider-native-durable-attempt-receipt-v2r';
import {
  assertProviderNativeDurableDispatchIntentV2R,
  type ProviderNativeDurableDispatchIntentV2R,
} from './provider-native-durable-dispatch-intent-v2r';

type JsonRecord = Record<string, unknown>;

const SEALED_HOLDOUT_RUNTIME_BUDGET_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_BUDGET_V2R_1' as const;
export const SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_V2R_1' as const;
const SEALED_HOLDOUT_INPUT_TOKEN_BOUND_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_INPUT_TOKEN_BOUND_V2R_1' as const;
export const SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_GUARD_V2R_1' as const;
const SUPPORTED_CANDIDATE_POLICY_CATALOG_REVISION =
  'EDITRON_OPERATOR_SPECS_V2R_9' as const;

export interface ProviderNativeRuntimeBudgetPricingV2R {
  normalInputNanoUsdPerToken: number;
  cachedInputNanoUsdPerToken: number;
  cacheWriteNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
}

export type SealedHoldoutRuntimePricingV2R =
  ProviderNativeRuntimeBudgetPricingV2R;

export interface SealedHoldoutRuntimeAuthorizationV2R {
  version: typeof SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R;
  manifestSha256: string;
  caseId: string;
  publicCaseSha256: string;
  routeId: ProviderNativeRouteV2R['routeId'];
  claimedModelIdentity: string;
  routeSha256: string;
  approvedBy: string;
  approvedAt: string;
  maxInputTokensPerTurn: number;
  absoluteMaxSpendMicroUsd: number;
  pricing: Readonly<SealedHoldoutRuntimePricingV2R>;
}

export interface ProviderNativeRuntimeInputTokenBoundV2R {
  inputTokensUpperBound: number;
  method: string;
  evidenceSha256: string;
}

export type SealedHoldoutInputTokenBoundV2R =
  ProviderNativeRuntimeInputTokenBoundV2R;

export interface ProviderNativeRuntimeBudgetLimitsV2R {
  maxProviderTurns: number;
  maxSelectedOperations: number;
  maxCandidatesPerOperation: number;
  maxCumulativeOutputTokens: number;
  maxInputTokensPerTurn: number;
  absoluteMaxSpendNanoUsd: number;
}

export interface ProviderNativeRuntimeBudgetControllerInputV2R {
  guardKind: string;
  guardIdentitySha256: string;
  authorizationSha256: string;
  inputTokenBoundVersion: string;
  limits: Readonly<ProviderNativeRuntimeBudgetLimitsV2R>;
  pricing: Readonly<ProviderNativeRuntimeBudgetPricingV2R>;
  countInputTokens: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<ProviderNativeRuntimeInputTokenBoundV2R>>;
}

export interface SealedHoldoutRuntimeBudgetReceiptV2R {
  version: typeof SEALED_HOLDOUT_RUNTIME_BUDGET_VERSION_V2R;
  authority: 'RESEARCH_RESOURCE_ACCOUNTING_NO_PROJECT_MUTATION';
  authorizationSha256: string;
  limits: Readonly<JsonRecord>;
  usage: Readonly<JsonRecord>;
  events: readonly Readonly<JsonRecord>[];
  episodeTerminalDisposition: ProviderNativeTerminalDispositionV2R;
  assessment: 'ACCOUNTED_WITHIN_BUDGET' | 'BUDGET_EXHAUSTED'
    | 'ACCOUNTING_UNVERIFIABLE';
  receiptSha256: string;
}

type PendingRequest = Readonly<{
  turn: number;
  requestHash: string;
  inputTokensUpperBound: number;
  maxOutputTokens: number;
  reservedWorstCaseNanoUsd: number;
}>;

type Usage = Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}>;

type RuntimeUsage = {
  providerTurns: number;
  selectedOperations: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  reasoningTokens: number;
  spentNanoUsd: number;
  conservativeReservedOutputTokens?: number;
  conservativeReservedNanoUsd?: number;
};

const CANDIDATE_OUTPUT_PATHS: Readonly<Record<string, readonly (readonly string[])[]>> =
  deepFreezeV1({
    find_transcript_moment: [['result', 'observations'], ['result', 'candidates'], ['candidates']],
    find_visual_moment: [['result', 'observations'], ['result', 'candidates'], ['candidates']],
    find_audio_moment: [['result', 'observations'], ['result', 'candidates'], ['candidates']],
    list_user_assets: [['assets']],
    search_user_assets: [['assets']],
    search_stock_footage: [['assets'], ['remoteCandidates']],
    resolve_transcript_edit: [['candidates']],
    resolve_visual_edit: [['candidates']],
    resolve_audio_edit: [['candidates']],
    resolve_user_asset_overlay: [['candidates']],
  });

export class ProviderNativeRuntimeBudgetControllerV2R
implements ProviderNativeRuntimeGuardV2R {
  readonly limits: Readonly<ProviderNativeRuntimeBudgetLimitsV2R>;

  private readonly authorizationSha256: string;
  private readonly guardKind: string;
  private readonly guardIdentity: string;
  private readonly inputTokenBoundVersion: string;
  private readonly pricing: Readonly<ProviderNativeRuntimeBudgetPricingV2R>;
  private readonly countInputTokens: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<ProviderNativeRuntimeInputTokenBoundV2R>>;
  private readonly events: JsonRecord[] = [];
  private pendingRequest: PendingRequest | null = null;
  private recoveredDispatchIntentReceiptSha256: string | null = null;
  private providerTurns = 0;
  private selectedOperations = 0;
  private totalInputTokens = 0;
  private totalCachedInputTokens = 0;
  private totalCacheWriteTokens = 0;
  private totalOutputTokens = 0;
  private totalThoughtTokens = 0;
  private totalReasoningTokens = 0;
  private spentNanoUsd = 0;
  private conservativeReservedOutputTokens = 0;
  private conservativeReservedNanoUsd = 0;

  constructor(input: Readonly<ProviderNativeRuntimeBudgetControllerInputV2R>) {
    this.guardKind = runtimeIdentity(input.guardKind, 'RUNTIME_GUARD_KIND_INVALID');
    this.guardIdentity = runtimeSha256(
      input.guardIdentitySha256,
      'RUNTIME_GUARD_IDENTITY_INVALID',
    );
    this.authorizationSha256 = runtimeSha256(
      input.authorizationSha256,
      'RUNTIME_AUTHORIZATION_IDENTITY_INVALID',
    );
    this.inputTokenBoundVersion = runtimeIdentity(
      input.inputTokenBoundVersion,
      'RUNTIME_TOKEN_BOUND_VERSION_INVALID',
    );
    this.limits = normalizeRuntimeLimits(input.limits);
    this.pricing = normalizeRuntimePricing(input.pricing);
    this.countInputTokens = input.countInputTokens;
  }

  createResumeState(input: Readonly<{
    completedTurns: readonly Readonly<JsonRecord>[];
    accountedProviderAttempts?:
      readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
  }>): Readonly<ProviderNativeRuntimeGuardResumeStateV2R> {
    return this.createBoundResumeState(input);
  }

  createPendingDispatchResumeState(input: Readonly<{
    completedTurns: readonly Readonly<JsonRecord>[];
    accountedProviderAttempts?:
      readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
    pendingProviderDispatchIntent: Readonly<ProviderNativeDurableDispatchIntentV2R>;
  }>): Readonly<ProviderNativeRuntimeGuardResumeStateV2R> {
    return this.createBoundResumeState(input, input.pendingProviderDispatchIntent);
  }

  private createBoundResumeState(input: Readonly<{
    completedTurns: readonly Readonly<JsonRecord>[];
    accountedProviderAttempts?:
      readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
  }>, pendingIntentInput?: Readonly<ProviderNativeDurableDispatchIntentV2R>) {
    const accountedProviderAttempts = input.accountedProviderAttempts ?? [];
    const pendingProviderDispatchIntent = pendingIntentInput
      ? assertPendingDispatchBinding(
          pendingIntentInput,
          accountedProviderAttempts,
          this.pendingRequest,
        ) : undefined;
    if (this.pendingRequest && !pendingProviderDispatchIntent) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_PENDING_REQUEST');
    }
    if (!this.pendingRequest && pendingProviderDispatchIntent) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_PENDING_REQUEST_MISSING');
    }
    assertRuntimeEventsBoundToTurns(
      this.events,
      input.completedTurns,
      accountedProviderAttempts,
      pendingProviderDispatchIntent,
    );
    const completedTurnsSha256 = hashCanonicalJsonV1(input.completedTurns);
    const state = {
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
      usage: this.usage(),
      events: structuredClone(this.events),
    };
    const material = {
      version: pendingProviderDispatchIntent
        ? PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R
        : accountedProviderAttempts.length
        ? PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R
        : PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
      authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION' as const,
      guardKind: this.guardKind,
      guardIdentitySha256: this.guardIdentity,
      completedTurnsSha256,
      nextTurn: input.completedTurns.length + 1,
      ...(accountedProviderAttempts.length || pendingProviderDispatchIntent ? {
        accountedProviderAttemptsSha256:
          hashCanonicalJsonV1(accountedProviderAttempts),
      } : {}),
      ...(pendingProviderDispatchIntent ? {
        pendingProviderDispatchIntentSha256:
          pendingProviderDispatchIntent.receiptSha256,
      } : {}),
      state,
    };
    return deepFreezeV1({
      ...material,
      resumeStateSha256: hashCanonicalJsonV1(material),
    });
  }

  restoreResumeState(input: Readonly<{
    resumeState: Readonly<ProviderNativeRuntimeGuardResumeStateV2R>;
    completedTurns: readonly Readonly<JsonRecord>[];
    accountedProviderAttempts?:
      readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[];
    pendingProviderDispatchIntent?: Readonly<ProviderNativeDurableDispatchIntentV2R>;
  }>): void {
    this.assertPristineForResume();
    const resumeState = input.resumeState;
    const material = {
      version: resumeState.version,
      authority: resumeState.authority,
      guardKind: resumeState.guardKind,
      guardIdentitySha256: resumeState.guardIdentitySha256,
      completedTurnsSha256: resumeState.completedTurnsSha256,
      nextTurn: resumeState.nextTurn,
      ...('accountedProviderAttemptsSha256' in resumeState ? {
        accountedProviderAttemptsSha256:
          resumeState.accountedProviderAttemptsSha256,
      } : {}),
      ...('pendingProviderDispatchIntentSha256' in resumeState ? {
        pendingProviderDispatchIntentSha256:
          resumeState.pendingProviderDispatchIntentSha256,
      } : {}),
      state: resumeState.state,
    };
    const accountedProviderAttempts = input.accountedProviderAttempts ?? [];
    const pendingProviderDispatchIntent = input.pendingProviderDispatchIntent
      ? assertPendingDispatchBinding(
          input.pendingProviderDispatchIntent,
          accountedProviderAttempts,
          pendingRequestFromIntent(input.pendingProviderDispatchIntent),
        ) : undefined;
    const expectedVersion = pendingProviderDispatchIntent
      ? PROVIDER_NATIVE_RUNTIME_GUARD_DISPATCH_RESUME_STATE_VERSION_V2R
      : accountedProviderAttempts.length
      ? PROVIDER_NATIVE_RUNTIME_GUARD_ATTEMPT_RESUME_STATE_VERSION_V2R
      : PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R;
    if (resumeState.version !== expectedVersion
      || resumeState.authority !== 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION'
      || resumeState.guardKind !== this.guardKind
      || hashCanonicalJsonV1(material) !== resumeState.resumeStateSha256
      || canonicalizeJsonV1(resumeState)
        !== canonicalizeJsonV1({
          ...material,
          resumeStateSha256: resumeState.resumeStateSha256,
        })) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_STATE_ENVELOPE_INVALID');
    }
    if (resumeState.guardIdentitySha256 !== this.guardIdentity) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_GUARD_IDENTITY_MISMATCH');
    }
    const completedTurnsSha256 = hashCanonicalJsonV1(input.completedTurns);
    if (resumeState.completedTurnsSha256 !== completedTurnsSha256
      || resumeState.nextTurn !== input.completedTurns.length + 1) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_TURN_BINDING_MISMATCH');
    }
    if (accountedProviderAttempts.length || pendingProviderDispatchIntent
      ? resumeState.accountedProviderAttemptsSha256
          !== hashCanonicalJsonV1(accountedProviderAttempts)
      : 'accountedProviderAttemptsSha256' in resumeState) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_ATTEMPT_BINDING_MISMATCH');
    }
    if (pendingProviderDispatchIntent
      ? resumeState.pendingProviderDispatchIntentSha256
          !== pendingProviderDispatchIntent.receiptSha256
      : 'pendingProviderDispatchIntentSha256' in resumeState) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_DISPATCH_INTENT_BINDING_MISMATCH');
    }
    const state = record(resumeState.state);
    const events = records(state.events);
    assertRuntimeEventsBoundToTurns(
      events,
      input.completedTurns,
      accountedProviderAttempts,
      pendingProviderDispatchIntent,
    );
    const usage = deriveRuntimeUsageFromEvents(events);
    const expectedState = {
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
      usage: { ...usage,
        pendingRequest: pendingProviderDispatchIntent
          ? pendingRequestFromIntent(pendingProviderDispatchIntent) : null },
      events,
    };
    if (canonicalizeJsonV1(state) !== canonicalizeJsonV1(expectedState)) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_USAGE_EVENTS_MISMATCH');
    }
    this.events.push(...structuredClone(events));
    this.providerTurns = usage.providerTurns;
    this.selectedOperations = usage.selectedOperations;
    this.totalInputTokens = usage.inputTokens;
    this.totalCachedInputTokens = usage.cachedInputTokens;
    this.totalCacheWriteTokens = usage.cacheWriteTokens;
    this.totalOutputTokens = usage.outputTokens;
    this.totalThoughtTokens = usage.thoughtTokens;
    this.totalReasoningTokens = usage.reasoningTokens;
    this.spentNanoUsd = usage.spentNanoUsd;
    this.conservativeReservedOutputTokens = usage.conservativeReservedOutputTokens ?? 0;
    this.conservativeReservedNanoUsd = usage.conservativeReservedNanoUsd ?? 0;
    this.pendingRequest = pendingProviderDispatchIntent
      ? pendingRequestFromIntent(pendingProviderDispatchIntent) : null;
    this.recoveredDispatchIntentReceiptSha256 =
      pendingProviderDispatchIntent?.receiptSha256 ?? null;
  }

  beforeTurn(input: Readonly<{
    turn: number; configuredMaxOutputTokens: number;
  }>): ProviderNativeRuntimeGuardDecisionV2R {
    if (this.pendingRequest) return this.accountingDenial('PENDING_REQUEST_USAGE_UNRESOLVED', input);
    if (input.turn > this.limits.maxProviderTurns) {
      return this.budgetDenial('PROVIDER_TURN_BUDGET_EXHAUSTED', input);
    }
    const remaining = this.limits.maxCumulativeOutputTokens - this.totalOutputTokens;
    if (remaining < 64) return this.budgetDenial('CUMULATIVE_OUTPUT_BUDGET_EXHAUSTED', input);
    return this.allow('BEFORE_TURN', {
      turn: input.turn, remainingOutputTokens: remaining,
    }, Math.min(input.configuredMaxOutputTokens, remaining));
  }

  async beforeInvoke(input: Readonly<{
    turn: number; request: Readonly<SerializedProviderNativeTurnV2R>;
    maxOutputTokens: number;
  }>): Promise<ProviderNativeRuntimeGuardDecisionV2R> {
    if (this.pendingRequest) return this.accountingDenial('PENDING_REQUEST_USAGE_UNRESOLVED', input);
    const bound = await this.countInputTokens(input.request);
    if (!validTokenBound(
      bound,
      input.request.requestHash,
      this.inputTokenBoundVersion,
    )) {
      return this.accountingDenial('INPUT_TOKEN_BOUND_INVALID', input);
    }
    if (bound.inputTokensUpperBound > this.limits.maxInputTokensPerTurn) {
      return this.budgetDenial('INPUT_TOKEN_BUDGET_EXCEEDED', {
        turn: input.turn, requestHash: input.request.requestHash,
        inputTokensUpperBound: bound.inputTokensUpperBound,
      });
    }
    const pricing = this.pricing;
    const worstInputRate = Math.max(
      pricing.normalInputNanoUsdPerToken,
      pricing.cacheWriteNanoUsdPerToken,
    );
    const reservedWorstCaseNanoUsd = safeRuntimeCostSum([
      [bound.inputTokensUpperBound, worstInputRate],
      [input.maxOutputTokens, pricing.outputNanoUsdPerToken],
    ]);
    const projectedSpendNanoUsd = reservedWorstCaseNanoUsd === null
      ? null : safeRuntimeSum([this.spentNanoUsd, reservedWorstCaseNanoUsd]);
    if (reservedWorstCaseNanoUsd === null || projectedSpendNanoUsd === null) {
      return this.accountingDenial('PREINVOKE_COST_OVERFLOW', {
        turn: input.turn,
        requestHash: input.request.requestHash,
      });
    }
    if (projectedSpendNanoUsd > this.limits.absoluteMaxSpendNanoUsd) {
      return this.budgetDenial('ABSOLUTE_SPEND_BUDGET_EXCEEDED_PREINVOKE', {
        turn: input.turn, requestHash: input.request.requestHash,
        spentNanoUsd: this.spentNanoUsd, reservedWorstCaseNanoUsd,
      });
    }
    this.providerTurns += 1;
    this.pendingRequest = {
      turn: input.turn,
      requestHash: input.request.requestHash,
      inputTokensUpperBound: bound.inputTokensUpperBound,
      maxOutputTokens: input.maxOutputTokens,
      reservedWorstCaseNanoUsd,
    };
    return this.allow('BEFORE_INVOKE', {
      turn: input.turn, requestHash: input.request.requestHash,
      inputTokensUpperBound: bound.inputTokensUpperBound,
      tokenCountMethod: bound.method, tokenCountEvidenceSha256: bound.evidenceSha256,
      reservedWorstCaseNanoUsd,
    });
  }

  afterInvoke(input: Readonly<{
    turn: number; request: Readonly<SerializedProviderNativeTurnV2R>;
    response: Readonly<ProviderNativeInvokeResponseV2R>; maxOutputTokens: number;
  }>): ProviderNativeRuntimeGuardDecisionV2R {
    const pending = this.pendingRequest;
    if (!pending || pending.turn !== input.turn
      || pending.requestHash !== input.request.requestHash
      || pending.maxOutputTokens !== input.maxOutputTokens) {
      return this.accountingDenial('RESPONSE_REQUEST_BINDING_INVALID', input);
    }
    if ((input.response.status < 200 || input.response.status >= 300)
      && !record(input.response.body).usage) {
      return this.settlePendingConservatively(
        'AFTER_INVOKE_HTTP_FAILURE_CONSERVATIVE_RESERVATION',
        pending,
        { responseStatus: input.response.status },
      );
    }
    this.pendingRequest = null;
    const usage = parseUsage(input.request.provider, input.response.body);
    if (!usage) return this.accountingDenial('PROVIDER_USAGE_MISSING_OR_INVALID', {
      turn: input.turn, requestHash: input.request.requestHash,
      responseStatus: input.response.status,
    });
    const actualCostNanoUsd = calculateCostNanoUsd(usage, this.pricing);
    const nextInputTokens = safeRuntimeSum([this.totalInputTokens, usage.inputTokens]);
    const nextCachedInputTokens = safeRuntimeSum([
      this.totalCachedInputTokens,
      usage.cachedInputTokens,
    ]);
    const nextCacheWriteTokens = safeRuntimeSum([
      this.totalCacheWriteTokens,
      usage.cacheWriteTokens,
    ]);
    const nextOutputTokens = safeRuntimeSum([
      this.totalOutputTokens,
      usage.outputTokens,
      usage.thoughtTokens,
    ]);
    const nextThoughtTokens = safeRuntimeSum([
      this.totalThoughtTokens,
      usage.thoughtTokens,
    ]);
    const nextReasoningTokens = safeRuntimeSum([
      this.totalReasoningTokens,
      usage.reasoningTokens,
    ]);
    const nextSpendNanoUsd = actualCostNanoUsd === null
      ? null : safeRuntimeSum([this.spentNanoUsd, actualCostNanoUsd]);
    if ([actualCostNanoUsd, nextInputTokens, nextCachedInputTokens,
      nextCacheWriteTokens, nextOutputTokens, nextThoughtTokens,
      nextReasoningTokens, nextSpendNanoUsd].some((value) => value === null)) {
      return this.accountingDenial('ACTUAL_USAGE_OR_COST_OVERFLOW', {
        turn: input.turn,
        requestHash: input.request.requestHash,
      });
    }
    this.totalInputTokens = nextInputTokens!;
    this.totalCachedInputTokens = nextCachedInputTokens!;
    this.totalCacheWriteTokens = nextCacheWriteTokens!;
    this.totalOutputTokens = nextOutputTokens!;
    this.totalThoughtTokens = nextThoughtTokens!;
    this.totalReasoningTokens = nextReasoningTokens!;
    this.spentNanoUsd = nextSpendNanoUsd!;
    const audit = {
      turn: input.turn, requestHash: input.request.requestHash,
      responseStatus: input.response.status, usage, actualCostNanoUsd,
      cumulativeOutputTokens: this.totalOutputTokens,
      cumulativeSpentNanoUsd: this.spentNanoUsd,
    };
    if (usage.inputTokens > pending.inputTokensUpperBound) {
      return this.accountingDenial('ACTUAL_INPUT_EXCEEDS_PREFLIGHT_BOUND', audit);
    }
    if (usage.outputTokens + usage.thoughtTokens > pending.maxOutputTokens) {
      return this.accountingDenial('ACTUAL_OUTPUT_EXCEEDS_REQUEST_LIMIT', audit);
    }
    if (this.totalOutputTokens > this.limits.maxCumulativeOutputTokens) {
      return this.budgetDenial('CUMULATIVE_OUTPUT_BUDGET_EXCEEDED', audit);
    }
    if (this.spentNanoUsd > this.limits.absoluteMaxSpendNanoUsd) {
      return this.budgetDenial('ABSOLUTE_SPEND_BUDGET_EXCEEDED_ACTUAL', audit);
    }
    return this.allow('AFTER_INVOKE', audit);
  }

  settleUnknownInvoke(input: Readonly<{
    turn: number;
    request: Readonly<SerializedProviderNativeTurnV2R>;
    maxOutputTokens: number;
    transportErrorCode: string;
  }>): ProviderNativeRuntimeGuardDecisionV2R {
    const pending = this.pendingRequest;
    if (!pending || pending.turn !== input.turn
      || pending.requestHash !== input.request.requestHash
      || pending.maxOutputTokens !== input.maxOutputTokens
      || !input.transportErrorCode.trim()) {
      return this.accountingDenial('UNKNOWN_RESULT_REQUEST_BINDING_INVALID', {
        turn: input.turn,
        requestHash: input.request.requestHash,
      });
    }
    return this.settlePendingConservatively(
      'AFTER_INVOKE_RESULT_UNAVAILABLE_CONSERVATIVE_RESERVATION',
      pending,
      { transportErrorCode: input.transportErrorCode },
    );
  }

  settleRecoveredDispatchIntent(input: Readonly<{
    pendingProviderDispatchIntent: Readonly<ProviderNativeDurableDispatchIntentV2R>;
    transportErrorCode: string;
  }>): ProviderNativeRuntimeGuardDecisionV2R {
    const pending = this.pendingRequest;
    const intent = assertProviderNativeDurableDispatchIntentV2R(
      input.pendingProviderDispatchIntent,
    );
    if (!pending || !input.transportErrorCode.trim()
      || this.recoveredDispatchIntentReceiptSha256 !== intent.receiptSha256
      || canonicalizeJsonV1(pending)
        !== canonicalizeJsonV1(pendingRequestFromIntent(intent))) {
      return this.accountingDenial('RECOVERED_DISPATCH_INTENT_BINDING_INVALID', {
        dispatchIntentReceiptSha256: intent.receiptSha256,
      });
    }
    this.recoveredDispatchIntentReceiptSha256 = null;
    return this.settlePendingConservatively(
      'RECOVERED_DISPATCH_INTENT_CONSERVATIVE_RESERVATION',
      pending,
      { transportErrorCode: input.transportErrorCode,
        dispatchIntentReceiptSha256: intent.receiptSha256 },
    );
  }

  beforeExecute(input: Readonly<{
    turn: number; operatorId: string; arguments: Readonly<JsonRecord>;
  }>): ProviderNativeRuntimeGuardDecisionV2R {
    if (this.selectedOperations >= this.limits.maxSelectedOperations) {
      return this.budgetDenial('SELECTED_OPERATION_BUDGET_EXHAUSTED', input);
    }
    const candidates = inspectCandidateArrays(input.operatorId, input.arguments, 'arguments');
    if (candidates.maximum > this.limits.maxCandidatesPerOperation) {
      return this.budgetDenial('CANDIDATE_BUDGET_EXCEEDED_ARGUMENTS', candidates);
    }
    return this.allow('BEFORE_EXECUTE', {
      turn: input.turn, operatorId: input.operatorId,
      selectedOperationsBefore: this.selectedOperations, candidateAudit: candidates,
    });
  }

  afterExecute(input: Readonly<{
    turn: number; operatorId: string; arguments: Readonly<JsonRecord>;
    execution: Readonly<ProviderNativeToolExecutionV2R>;
  }>): ProviderNativeRuntimeGuardDecisionV2R {
    this.selectedOperations += 1;
    const candidates = inspectCandidateArrays(
      input.operatorId,
      input.execution.output,
      'output',
    );
    if (candidates.maximum > this.limits.maxCandidatesPerOperation) {
      return this.budgetDenial('CANDIDATE_BUDGET_EXCEEDED_OUTPUT', {
        turn: input.turn, operatorId: input.operatorId, candidateAudit: candidates,
      });
    }
    return this.allow('AFTER_EXECUTE', {
      turn: input.turn, operatorId: input.operatorId,
      selectedOperationsAfter: this.selectedOperations, candidateAudit: candidates,
    });
  }

  private allow(
    phase: string,
    details: Readonly<JsonRecord>,
    maxOutputTokens?: number,
  ): ProviderNativeRuntimeGuardDecisionV2R {
    const audit = this.event({ phase, status: 'ALLOW', ...details });
    return { status: 'ALLOW', audit, ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }) };
  }

  private budgetDenial(
    reasonCode: string,
    details: Readonly<JsonRecord>,
  ): ProviderNativeRuntimeGuardDecisionV2R {
    const audit = this.event({ status: 'DENY', reasonCode, ...details });
    return {
      status: 'DENY', disposition: 'RESOURCE_BUDGET_EXHAUSTED', reasonCode,
      summary: reasonCode, audit,
    };
  }

  private accountingDenial(
    reasonCode: string,
    details: Readonly<JsonRecord>,
  ): ProviderNativeRuntimeGuardDecisionV2R {
    const audit = this.event({ status: 'DENY', reasonCode, ...details });
    return {
      status: 'DENY', disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE', reasonCode,
      summary: reasonCode, audit,
    };
  }

  private settlePendingConservatively(
    phase: string,
    pending: PendingRequest,
    details: Readonly<JsonRecord>,
  ): ProviderNativeRuntimeGuardDecisionV2R {
    this.pendingRequest = null;
    const nextOutputTokens = safeRuntimeSum([
      this.totalOutputTokens,
      pending.maxOutputTokens,
    ]);
    const nextSpendNanoUsd = safeRuntimeSum([
      this.spentNanoUsd,
      pending.reservedWorstCaseNanoUsd,
    ]);
    const nextReservedOutputTokens = safeRuntimeSum([
      this.conservativeReservedOutputTokens,
      pending.maxOutputTokens,
    ]);
    const nextReservedNanoUsd = safeRuntimeSum([
      this.conservativeReservedNanoUsd,
      pending.reservedWorstCaseNanoUsd,
    ]);
    if ([nextOutputTokens, nextSpendNanoUsd, nextReservedOutputTokens,
      nextReservedNanoUsd].some((value) => value === null)) {
      return this.accountingDenial('CONSERVATIVE_SETTLEMENT_OVERFLOW', {
        turn: pending.turn,
        requestHash: pending.requestHash,
      });
    }
    this.totalOutputTokens = nextOutputTokens!;
    this.spentNanoUsd = nextSpendNanoUsd!;
    this.conservativeReservedOutputTokens = nextReservedOutputTokens!;
    this.conservativeReservedNanoUsd = nextReservedNanoUsd!;
    return this.allow(phase, {
      turn: pending.turn,
      requestHash: pending.requestHash,
      inputTokensUpperBound: pending.inputTokensUpperBound,
      accountingMode: 'CONSERVATIVE_WORST_CASE_RESERVATION',
      accountedOutputTokens: pending.maxOutputTokens,
      accountedCostNanoUsd: pending.reservedWorstCaseNanoUsd,
      cumulativeOutputTokens: this.totalOutputTokens,
      cumulativeSpentNanoUsd: this.spentNanoUsd,
      ...details,
    });
  }

  private event(value: Readonly<JsonRecord>): Readonly<JsonRecord> {
    const event = deepFreezeV1({ ordinal: this.events.length + 1, ...value });
    this.events.push(event);
    return event;
  }

  private usage(): Readonly<JsonRecord> {
    return {
      providerTurns: this.providerTurns,
      selectedOperations: this.selectedOperations,
      inputTokens: this.totalInputTokens,
      cachedInputTokens: this.totalCachedInputTokens,
      cacheWriteTokens: this.totalCacheWriteTokens,
      outputTokens: this.totalOutputTokens,
      thoughtTokens: this.totalThoughtTokens,
      reasoningTokens: this.totalReasoningTokens,
      spentNanoUsd: this.spentNanoUsd,
      ...(this.conservativeReservedOutputTokens ? {
        conservativeReservedOutputTokens: this.conservativeReservedOutputTokens,
        conservativeReservedNanoUsd: this.conservativeReservedNanoUsd,
      } : {}),
      pendingRequest: this.pendingRequest,
    };
  }

  protected runtimeBudgetSnapshot(): Readonly<{
    authorizationSha256: string;
    limits: Readonly<ProviderNativeRuntimeBudgetLimitsV2R>;
    usage: Readonly<JsonRecord>;
    events: readonly Readonly<JsonRecord>[];
    pendingRequest: PendingRequest | null;
  }> {
    return {
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
      usage: this.usage(),
      events: structuredClone(this.events),
      pendingRequest: this.pendingRequest,
    };
  }

  private assertPristineForResume(): void {
    if (this.pendingRequest || this.recoveredDispatchIntentReceiptSha256
      || this.events.length || this.providerTurns
      || this.selectedOperations || this.totalInputTokens
      || this.totalCachedInputTokens || this.totalCacheWriteTokens
      || this.totalOutputTokens || this.totalThoughtTokens
      || this.totalReasoningTokens || this.spentNanoUsd) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_TARGET_NOT_PRISTINE');
    }
  }
}

/**
 * Sealed benchmark policy layered over the shared accounting mechanics. This
 * class remains the sole research authorization/receipt owner; product callers
 * configure the shared controller from their own accepted reservation instead.
 */
export class SealedHoldoutRuntimeBudgetControllerV2R
extends ProviderNativeRuntimeBudgetControllerV2R {
  constructor(input: Readonly<{
    publicCase: Readonly<JsonRecord>;
    publicCaseSha256: string;
    manifestSha256: string;
    route: Readonly<ProviderNativeRouteV2R>;
    authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
    countInputTokens: (
      request: Readonly<SerializedProviderNativeTurnV2R>,
    ) => Promise<Readonly<SealedHoldoutInputTokenBoundV2R>>;
  }>) {
    assertAuthorization(input);
    const authorization = deepFreezeV1(structuredClone(input.authorization));
    const authorizationSha256 = hashCanonicalJsonV1(authorization);
    const resourceBudget = record(input.publicCase.resourceBudget);
    const maxSelectedOperations = positiveInteger(
      resourceBudget.maxNodes,
      'MAX_NODES_INVALID',
    );
    const limits = deepFreezeV1({
      maxProviderTurns: Math.min(32, maxSelectedOperations + 3),
      maxSelectedOperations,
      maxCandidatesPerOperation: positiveInteger(
        resourceBudget.maxCandidates,
        'MAX_CANDIDATES_INVALID',
      ),
      maxCumulativeOutputTokens: positiveInteger(
        resourceBudget.maxOutputTokens,
        'MAX_OUTPUT_TOKENS_INVALID',
      ),
      maxInputTokensPerTurn: authorization.maxInputTokensPerTurn,
      absoluteMaxSpendNanoUsd: authorization.absoluteMaxSpendMicroUsd * 1_000,
    });
    super({
      guardKind: SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
      guardIdentitySha256: hashCanonicalJsonV1({
        version: PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
        guardKind: SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
        authorizationSha256,
        limits,
      }),
      authorizationSha256,
      inputTokenBoundVersion: SEALED_HOLDOUT_INPUT_TOKEN_BOUND_VERSION_V2R,
      limits,
      pricing: authorization.pricing,
      countInputTokens: input.countInputTokens,
    });
  }

  receipt(
    episodeTerminalDisposition: ProviderNativeTerminalDispositionV2R,
  ): Readonly<SealedHoldoutRuntimeBudgetReceiptV2R> {
    const snapshot = this.runtimeBudgetSnapshot();
    const assessment: SealedHoldoutRuntimeBudgetReceiptV2R['assessment'] =
      snapshot.pendingRequest
        || episodeTerminalDisposition === 'RESOURCE_ACCOUNTING_UNVERIFIABLE'
        ? 'ACCOUNTING_UNVERIFIABLE'
        : episodeTerminalDisposition === 'RESOURCE_BUDGET_EXHAUSTED'
          ? 'BUDGET_EXHAUSTED' : 'ACCOUNTED_WITHIN_BUDGET';
    const material = {
      version: SEALED_HOLDOUT_RUNTIME_BUDGET_VERSION_V2R,
      authority: 'RESEARCH_RESOURCE_ACCOUNTING_NO_PROJECT_MUTATION' as const,
      authorizationSha256: snapshot.authorizationSha256,
      limits: snapshot.limits,
      usage: snapshot.usage,
      events: snapshot.events,
      episodeTerminalDisposition,
      assessment,
    };
    return deepFreezeV1({
      ...material,
      receiptSha256: hashCanonicalJsonV1(material),
    });
  }
}

function assertRuntimeEventsBoundToTurns(
  events: readonly Readonly<JsonRecord>[],
  completedTurns: readonly Readonly<JsonRecord>[],
  accountedProviderAttempts:
    readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[] = [],
  pendingProviderDispatchIntent?: Readonly<ProviderNativeDurableDispatchIntentV2R>,
): void {
  const turnEvents = completedTurns.flatMap((turn) => {
    if (!Array.isArray(turn.runtimeGuardAudit)
      || !Number.isSafeInteger(turn.maxOutputTokens)
      || Number(turn.maxOutputTokens) < 64) {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_TURN_AUDIT_INVALID');
    }
    return records(turn.runtimeGuardAudit);
  });
  const attemptEvents = accountedProviderAttempts.flatMap((value) => {
    const attempt = assertProviderNativeDurableAttemptReceiptV2R(value);
    return records(attempt.accounting.runtimeGuardAudit);
  });
  const dispatchEvents = pendingProviderDispatchIntent
    ? records(assertProviderNativeDurableDispatchIntentV2R(
        pendingProviderDispatchIntent,
      ).reservation.runtimeGuardAudit) : [];
  const boundEvents = [...turnEvents, ...attemptEvents, ...dispatchEvents].sort(
    (left, right) => Number(left.ordinal) - Number(right.ordinal),
  );
  if (canonicalizeJsonV1(events) !== canonicalizeJsonV1(boundEvents)) {
    fail('PROVIDER_NATIVE_RUNTIME_RESUME_TURN_AUDIT_MISMATCH');
  }
}

function assertPendingDispatchBinding(
  value: Readonly<ProviderNativeDurableDispatchIntentV2R>,
  attempts: readonly Readonly<ProviderNativeDurableAttemptReceiptV2R>[],
  pendingRequest: PendingRequest | null,
): Readonly<ProviderNativeDurableDispatchIntentV2R> {
  const intent = assertProviderNativeDurableDispatchIntentV2R(value);
  const previous = attempts.length
    ? assertProviderNativeDurableAttemptReceiptV2R(attempts.at(-1)) : undefined;
  if (!pendingRequest
    || intent.dispatch.attemptOrdinal !== attempts.length + 1
    || intent.previousAttemptReceiptSha256 !== (previous?.receiptSha256 ?? null)
    || canonicalizeJsonV1(pendingRequest)
      !== canonicalizeJsonV1(pendingRequestFromIntent(intent))) {
    fail('PROVIDER_NATIVE_RUNTIME_RESUME_DISPATCH_INTENT_INVALID');
  }
  return intent;
}

function pendingRequestFromIntent(
  intentInput: Readonly<ProviderNativeDurableDispatchIntentV2R>,
): PendingRequest {
  const intent = assertProviderNativeDurableDispatchIntentV2R(intentInput);
  return {
    turn: intent.dispatch.turn,
    requestHash: intent.dispatch.requestHash,
    inputTokensUpperBound: intent.reservation.inputTokensUpperBound,
    maxOutputTokens: intent.dispatch.maxOutputTokens,
    reservedWorstCaseNanoUsd: intent.reservation.reservedWorstCaseNanoUsd,
  };
}

function deriveRuntimeUsageFromEvents(
  events: readonly Readonly<JsonRecord>[],
): RuntimeUsage {
  const usage: RuntimeUsage & {
    conservativeReservedOutputTokens: number;
    conservativeReservedNanoUsd: number;
  } = {
    providerTurns: 0,
    selectedOperations: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    reasoningTokens: 0,
    spentNanoUsd: 0,
    conservativeReservedOutputTokens: 0,
    conservativeReservedNanoUsd: 0,
  };
  events.forEach((event, index) => {
    if (event.ordinal !== index + 1 || event.status !== 'ALLOW') {
      fail('PROVIDER_NATIVE_RUNTIME_RESUME_EVENT_SEQUENCE_INVALID');
    }
    if (event.phase === 'BEFORE_INVOKE') usage.providerTurns += 1;
    if (event.phase === 'AFTER_EXECUTE') usage.selectedOperations += 1;
    if (event.phase === 'AFTER_INVOKE_RESULT_UNAVAILABLE_CONSERVATIVE_RESERVATION'
      || event.phase === 'AFTER_INVOKE_HTTP_FAILURE_CONSERVATIVE_RESERVATION'
      || event.phase === 'RECOVERED_DISPATCH_INTENT_CONSERVATIVE_RESERVATION') {
      const outputTokens = resumeInteger(event.accountedOutputTokens);
      const costNanoUsd = resumeInteger(event.accountedCostNanoUsd);
      usage.outputTokens += outputTokens;
      usage.spentNanoUsd += costNanoUsd;
      usage.conservativeReservedOutputTokens += outputTokens;
      usage.conservativeReservedNanoUsd += costNanoUsd;
      return;
    }
    if (event.phase !== 'AFTER_INVOKE') return;
    const eventUsage = record(event.usage);
    const inputTokens = resumeInteger(eventUsage.inputTokens);
    const cachedInputTokens = resumeInteger(eventUsage.cachedInputTokens);
    const cacheWriteTokens = resumeInteger(eventUsage.cacheWriteTokens);
    const outputTokens = resumeInteger(eventUsage.outputTokens);
    const thoughtTokens = resumeInteger(eventUsage.thoughtTokens);
    const reasoningTokens = resumeInteger(eventUsage.reasoningTokens);
    const actualCostNanoUsd = resumeInteger(event.actualCostNanoUsd);
    usage.inputTokens += inputTokens;
    usage.cachedInputTokens += cachedInputTokens;
    usage.cacheWriteTokens += cacheWriteTokens;
    usage.outputTokens += outputTokens + thoughtTokens;
    usage.thoughtTokens += thoughtTokens;
    usage.reasoningTokens += reasoningTokens;
    usage.spentNanoUsd += actualCostNanoUsd;
  });
  if (Object.values(usage).some((value) => !Number.isSafeInteger(value))) {
    fail('PROVIDER_NATIVE_RUNTIME_RESUME_USAGE_OVERFLOW');
  }
  if (!usage.conservativeReservedOutputTokens) {
    const {
      conservativeReservedOutputTokens: _output,
      conservativeReservedNanoUsd: _cost,
      ...reportedOnly
    } = usage;
    return reportedOnly;
  }
  return usage;
}

function resumeInteger(value: unknown): number {
  const parsed = safeInteger(value);
  if (parsed === null) fail('PROVIDER_NATIVE_RUNTIME_RESUME_USAGE_INVALID');
  return parsed;
}

function assertAuthorization(input: Readonly<{
  publicCase: Readonly<JsonRecord>; publicCaseSha256: string; manifestSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
}>): void {
  const auth = input.authorization;
  if (V2R_OPERATOR_CATALOG_REVISION !== SUPPORTED_CANDIDATE_POLICY_CATALOG_REVISION) {
    fail('CANDIDATE_POLICY_CATALOG_REVISION_UNSUPPORTED');
  }
  if (auth.version !== SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R
    || auth.manifestSha256 !== input.manifestSha256
    || auth.caseId !== text(input.publicCase.caseId)
    || auth.publicCaseSha256 !== input.publicCaseSha256
    || auth.routeId !== input.route.routeId
    || auth.claimedModelIdentity !== input.route.claimedModelIdentity
    || auth.routeSha256 !== hashCanonicalJsonV1(input.route)) {
    fail('SEALED_RUNTIME_AUTHORIZATION_BINDING_INVALID');
  }
  requireSha(auth.manifestSha256, 'SEALED_RUNTIME_MANIFEST_HASH_INVALID');
  requireSha(auth.publicCaseSha256, 'SEALED_RUNTIME_CASE_HASH_INVALID');
  requireSha(auth.routeSha256, 'SEALED_RUNTIME_ROUTE_HASH_INVALID');
  if (!auth.approvedBy.trim() || !Number.isFinite(Date.parse(auth.approvedAt))) {
    fail('SEALED_RUNTIME_APPROVAL_INVALID');
  }
  positiveInteger(auth.maxInputTokensPerTurn, 'SEALED_RUNTIME_INPUT_LIMIT_INVALID');
  positiveInteger(auth.absoluteMaxSpendMicroUsd, 'SEALED_RUNTIME_SPEND_LIMIT_INVALID');
  if (!Number.isSafeInteger(auth.absoluteMaxSpendMicroUsd * 1_000)) {
    fail('SEALED_RUNTIME_SPEND_LIMIT_OVERFLOW');
  }
  for (const [name, value] of Object.entries(auth.pricing)) {
    if (!Number.isSafeInteger(value) || value < 0) fail(`SEALED_RUNTIME_PRICE_INVALID:${name}`);
  }
  if (auth.pricing.normalInputNanoUsdPerToken === 0
    || auth.pricing.outputNanoUsdPerToken === 0) {
    fail('SEALED_RUNTIME_PRICE_ZERO');
  }
}

function parseUsage(provider: 'openai' | 'google', body: unknown): Usage | null {
  const usage = record(record(body).usage);
  if (!Object.keys(usage).length) return null;
  if (provider === 'openai') {
    const input = safeInteger(usage.input_tokens);
    const output = safeInteger(usage.output_tokens);
    const total = safeInteger(usage.total_tokens);
    const inputDetails = record(usage.input_tokens_details);
    const outputDetails = record(usage.output_tokens_details);
    const cached = safeInteger(inputDetails.cached_tokens, 0);
    const cacheWrite = safeInteger(inputDetails.cache_write_tokens, 0);
    const reasoning = safeInteger(outputDetails.reasoning_tokens, 0);
    if ([input, output, total, cached, cacheWrite, reasoning].includes(null)
      || cached! + cacheWrite! > input! || reasoning! > output!
      || total !== input! + output!) return null;
    return {
      inputTokens: input!, cachedInputTokens: cached!, cacheWriteTokens: cacheWrite!,
      outputTokens: output!, thoughtTokens: 0, reasoningTokens: reasoning!,
      totalTokens: total!,
    };
  }
  const input = safeInteger(usage.total_input_tokens);
  const cached = safeInteger(usage.total_cached_tokens, 0);
  const output = safeInteger(usage.total_output_tokens);
  const thought = safeInteger(usage.total_thought_tokens, 0);
  const total = safeInteger(usage.total_tokens);
  if ([input, cached, output, thought, total].includes(null)
    || cached! > input! || total !== input! + output! + thought!) return null;
  return {
    inputTokens: input!, cachedInputTokens: cached!, cacheWriteTokens: 0,
    outputTokens: output!, thoughtTokens: thought!, reasoningTokens: thought!,
    totalTokens: total!,
  };
}

function calculateCostNanoUsd(
  usage: Usage,
  pricing: Readonly<SealedHoldoutRuntimePricingV2R>,
): number | null {
  const normal = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  const generatedTokens = safeRuntimeSum([usage.outputTokens, usage.thoughtTokens]);
  if (generatedTokens === null) return null;
  return safeRuntimeCostSum([
    [normal, pricing.normalInputNanoUsdPerToken],
    [usage.cachedInputTokens, pricing.cachedInputNanoUsdPerToken],
    [usage.cacheWriteTokens, pricing.cacheWriteNanoUsdPerToken],
    [generatedTokens, pricing.outputNanoUsdPerToken],
  ]);
}

function inspectCandidateArrays(
  operatorId: string,
  value: unknown,
  root: string,
): Readonly<{ maximum: number; observations: readonly Readonly<JsonRecord>[] }> {
  const observations: JsonRecord[] = [];
  walk(value, root, (path, key, child) => {
    if (Array.isArray(child) && ['candidate', 'candidates', 'remotecandidates']
      .includes(key.toLowerCase())) observations.push({ path, count: child.length });
  });
  for (const path of CANDIDATE_OUTPUT_PATHS[operatorId] ?? []) {
    const candidate = atPath(value, path);
    if (Array.isArray(candidate)) {
      observations.push({ path: `${root}.${path.join('.')}`, count: candidate.length });
    }
  }
  const unique = [...new Map(observations.map((entry) => [text(entry.path), entry])).values()];
  return deepFreezeV1({
    maximum: Math.max(0, ...unique.map(({ count }) => Number(count))),
    observations: unique,
  });
}

function walk(
  value: unknown,
  path: string,
  visit: (path: string, key: string, child: unknown) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => walk(child, `${path}[${index}]`, visit));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      visit(childPath, key, child);
      walk(child, childPath, visit);
    }
  }
}

function atPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => record(current)[key], value);
}

export function bindSealedHoldoutInputTokenBoundV2R(input: Readonly<{
  request: Readonly<SerializedProviderNativeTurnV2R>;
  inputTokensUpperBound: number;
  method: string;
}>): Readonly<SealedHoldoutInputTokenBoundV2R> {
  if (!Number.isSafeInteger(input.inputTokensUpperBound)
    || input.inputTokensUpperBound < 0 || !input.method.trim()) {
    fail('SEALED_INPUT_TOKEN_BOUND_MATERIAL_INVALID');
  }
  return bindProviderNativeRuntimeInputTokenBoundV2R({
    ...input,
    version: SEALED_HOLDOUT_INPUT_TOKEN_BOUND_VERSION_V2R,
  });
}

export function bindProviderNativeRuntimeInputTokenBoundV2R(input: Readonly<{
  version: string;
  request: Readonly<SerializedProviderNativeTurnV2R>;
  inputTokensUpperBound: number;
  method: string;
}>): Readonly<ProviderNativeRuntimeInputTokenBoundV2R> {
  const version = runtimeIdentity(input.version, 'RUNTIME_TOKEN_BOUND_VERSION_INVALID');
  const requestHash = runtimeSha256(
    input.request.requestHash,
    'RUNTIME_TOKEN_BOUND_REQUEST_HASH_INVALID',
  );
  if (!Number.isSafeInteger(input.inputTokensUpperBound)
    || input.inputTokensUpperBound < 0 || !input.method.trim()) {
    fail('PROVIDER_NATIVE_RUNTIME_INPUT_TOKEN_BOUND_INVALID');
  }
  const material = {
    version,
    requestHash,
    inputTokensUpperBound: input.inputTokensUpperBound,
    method: input.method,
  };
  return deepFreezeV1({
    inputTokensUpperBound: input.inputTokensUpperBound,
    method: input.method,
    evidenceSha256: hashCanonicalJsonV1(material),
  });
}

function validTokenBound(
  value: Readonly<ProviderNativeRuntimeInputTokenBoundV2R>,
  requestHash: string,
  version: string,
): boolean {
  return Number.isSafeInteger(value.inputTokensUpperBound)
    && value.inputTokensUpperBound >= 0 && Boolean(value.method.trim())
    && value.evidenceSha256 === hashCanonicalJsonV1({
      version,
      requestHash,
      inputTokensUpperBound: value.inputTokensUpperBound,
      method: value.method,
    });
}

function normalizeRuntimeLimits(
  value: Readonly<ProviderNativeRuntimeBudgetLimitsV2R>,
): Readonly<ProviderNativeRuntimeBudgetLimitsV2R> {
  return deepFreezeV1({
    maxProviderTurns: positiveInteger(value.maxProviderTurns, 'RUNTIME_MAX_TURNS_INVALID'),
    maxSelectedOperations: positiveInteger(
      value.maxSelectedOperations,
      'RUNTIME_MAX_OPERATIONS_INVALID',
    ),
    maxCandidatesPerOperation: positiveInteger(
      value.maxCandidatesPerOperation,
      'RUNTIME_MAX_CANDIDATES_INVALID',
    ),
    maxCumulativeOutputTokens: positiveInteger(
      value.maxCumulativeOutputTokens,
      'RUNTIME_MAX_OUTPUT_TOKENS_INVALID',
    ),
    maxInputTokensPerTurn: positiveInteger(
      value.maxInputTokensPerTurn,
      'RUNTIME_MAX_INPUT_TOKENS_INVALID',
    ),
    absoluteMaxSpendNanoUsd: positiveInteger(
      value.absoluteMaxSpendNanoUsd,
      'RUNTIME_MAX_SPEND_INVALID',
    ),
  });
}

function normalizeRuntimePricing(
  value: Readonly<ProviderNativeRuntimeBudgetPricingV2R>,
): Readonly<ProviderNativeRuntimeBudgetPricingV2R> {
  const result = {
    normalInputNanoUsdPerToken: safeRuntimeInteger(
      value.normalInputNanoUsdPerToken,
      'RUNTIME_NORMAL_INPUT_PRICE_INVALID',
    ),
    cachedInputNanoUsdPerToken: safeRuntimeInteger(
      value.cachedInputNanoUsdPerToken,
      'RUNTIME_CACHED_INPUT_PRICE_INVALID',
    ),
    cacheWriteNanoUsdPerToken: safeRuntimeInteger(
      value.cacheWriteNanoUsdPerToken,
      'RUNTIME_CACHE_WRITE_PRICE_INVALID',
    ),
    outputNanoUsdPerToken: safeRuntimeInteger(
      value.outputNanoUsdPerToken,
      'RUNTIME_OUTPUT_PRICE_INVALID',
    ),
  };
  if (!result.normalInputNanoUsdPerToken || !result.outputNanoUsdPerToken) {
    fail('PROVIDER_NATIVE_RUNTIME_PRICE_ZERO');
  }
  return deepFreezeV1(result);
}

function safeRuntimeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(code);
  return Number(value);
}

function safeRuntimeSum(values: readonly number[]): number | null {
  const result = values.reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

function safeRuntimeCostSum(
  terms: readonly (readonly [quantity: number, nanoUsdPerUnit: number])[],
): number | null {
  const products = terms.map(([quantity, nanoUsdPerUnit]) => {
    const product = quantity * nanoUsdPerUnit;
    return Number.isSafeInteger(product) && product >= 0 ? product : null;
  });
  if (products.some((value) => value === null)) return null;
  return safeRuntimeSum(products as number[]);
}

function runtimeIdentity(value: unknown, code: string): string {
  const result = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(result)) fail(code);
  return result;
}

function runtimeSha256(value: unknown, code: string): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(code);
  return result;
}

function safeInteger(value: unknown, fallback?: number): number | null {
  if (value === undefined && fallback !== undefined) return fallback;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(code);
  return Number(value);
}

function requireSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(code);
}

function fail(code: string): never { throw new Error(code); }
function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    fail('PROVIDER_NATIVE_RUNTIME_RESUME_EVENT_ARRAY_INVALID');
  }
  return value;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
