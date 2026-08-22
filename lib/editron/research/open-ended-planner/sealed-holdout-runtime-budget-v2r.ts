import { canonicalizeJsonV1, deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { V2R_OPERATOR_CATALOG_REVISION } from './operator-catalog-v2r';
import {
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

type JsonRecord = Record<string, unknown>;

export const SEALED_HOLDOUT_RUNTIME_BUDGET_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_BUDGET_V2R_1' as const;
export const SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_AUTHORIZATION_V2R_1' as const;
export const SEALED_HOLDOUT_INPUT_TOKEN_BOUND_VERSION_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_INPUT_TOKEN_BOUND_V2R_1' as const;
export const SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R =
  'EDITRON_OE_SEALED_HOLDOUT_RUNTIME_GUARD_V2R_1' as const;
const SUPPORTED_CANDIDATE_POLICY_CATALOG_REVISION =
  'EDITRON_OPERATOR_SPECS_V2R_9' as const;

export interface SealedHoldoutRuntimePricingV2R {
  normalInputNanoUsdPerToken: number;
  cachedInputNanoUsdPerToken: number;
  cacheWriteNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
}

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

export interface SealedHoldoutInputTokenBoundV2R {
  inputTokensUpperBound: number;
  method: string;
  evidenceSha256: string;
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

export class SealedHoldoutRuntimeBudgetControllerV2R
implements ProviderNativeRuntimeGuardV2R {
  readonly limits: Readonly<{
    maxProviderTurns: number;
    maxSelectedOperations: number;
    maxCandidatesPerOperation: number;
    maxCumulativeOutputTokens: number;
    maxInputTokensPerTurn: number;
    absoluteMaxSpendNanoUsd: number;
  }>;

  private readonly authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
  private readonly authorizationSha256: string;
  private readonly countInputTokens: (
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ) => Promise<Readonly<SealedHoldoutInputTokenBoundV2R>>;
  private readonly events: JsonRecord[] = [];
  private pendingRequest: PendingRequest | null = null;
  private providerTurns = 0;
  private selectedOperations = 0;
  private totalInputTokens = 0;
  private totalCachedInputTokens = 0;
  private totalCacheWriteTokens = 0;
  private totalOutputTokens = 0;
  private totalThoughtTokens = 0;
  private totalReasoningTokens = 0;
  private spentNanoUsd = 0;

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
    this.authorization = deepFreezeV1(structuredClone(input.authorization));
    this.authorizationSha256 = hashCanonicalJsonV1(this.authorization);
    this.countInputTokens = input.countInputTokens;
    const resourceBudget = record(input.publicCase.resourceBudget);
    const maxSelectedOperations = positiveInteger(resourceBudget.maxNodes, 'MAX_NODES_INVALID');
    const maxCandidatesPerOperation = positiveInteger(
      resourceBudget.maxCandidates,
      'MAX_CANDIDATES_INVALID',
    );
    const maxCumulativeOutputTokens = positiveInteger(
      resourceBudget.maxOutputTokens,
      'MAX_OUTPUT_TOKENS_INVALID',
    );
    this.limits = deepFreezeV1({
      maxProviderTurns: Math.min(32, maxSelectedOperations + 3),
      maxSelectedOperations,
      maxCandidatesPerOperation,
      maxCumulativeOutputTokens,
      maxInputTokensPerTurn: input.authorization.maxInputTokensPerTurn,
      absoluteMaxSpendNanoUsd: input.authorization.absoluteMaxSpendMicroUsd * 1_000,
    });
  }

  createResumeState(input: Readonly<{
    completedTurns: readonly Readonly<JsonRecord>[];
  }>): Readonly<ProviderNativeRuntimeGuardResumeStateV2R> {
    if (this.pendingRequest) fail('SEALED_RUNTIME_RESUME_PENDING_REQUEST');
    assertRuntimeEventsBoundToTurns(this.events, input.completedTurns);
    const completedTurnsSha256 = hashCanonicalJsonV1(input.completedTurns);
    const state = {
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
      usage: this.usage(),
      events: structuredClone(this.events),
    };
    const material = {
      version: PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
      authority: 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION' as const,
      guardKind: SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
      guardIdentitySha256: this.guardIdentitySha256(),
      completedTurnsSha256,
      nextTurn: input.completedTurns.length + 1,
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
      state: resumeState.state,
    };
    if (resumeState.version !== PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R
      || resumeState.authority !== 'RESEARCH_RUNTIME_GUARD_RESUME_NO_PROJECT_MUTATION'
      || resumeState.guardKind !== SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R
      || hashCanonicalJsonV1(material) !== resumeState.resumeStateSha256
      || canonicalizeJsonV1(resumeState)
        !== canonicalizeJsonV1({
          ...material,
          resumeStateSha256: resumeState.resumeStateSha256,
        })) {
      fail('SEALED_RUNTIME_RESUME_STATE_ENVELOPE_INVALID');
    }
    if (resumeState.guardIdentitySha256 !== this.guardIdentitySha256()) {
      fail('SEALED_RUNTIME_RESUME_GUARD_IDENTITY_MISMATCH');
    }
    const completedTurnsSha256 = hashCanonicalJsonV1(input.completedTurns);
    if (resumeState.completedTurnsSha256 !== completedTurnsSha256
      || resumeState.nextTurn !== input.completedTurns.length + 1) {
      fail('SEALED_RUNTIME_RESUME_TURN_BINDING_MISMATCH');
    }
    const state = record(resumeState.state);
    const events = records(state.events);
    assertRuntimeEventsBoundToTurns(events, input.completedTurns);
    const usage = deriveRuntimeUsageFromEvents(events);
    const expectedState = {
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
      usage: { ...usage, pendingRequest: null },
      events,
    };
    if (canonicalizeJsonV1(state) !== canonicalizeJsonV1(expectedState)) {
      fail('SEALED_RUNTIME_RESUME_USAGE_EVENTS_MISMATCH');
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
    if (!validTokenBound(bound, input.request.requestHash)) {
      return this.accountingDenial('INPUT_TOKEN_BOUND_INVALID', input);
    }
    if (bound.inputTokensUpperBound > this.limits.maxInputTokensPerTurn) {
      return this.budgetDenial('INPUT_TOKEN_BUDGET_EXCEEDED', {
        turn: input.turn, requestHash: input.request.requestHash,
        inputTokensUpperBound: bound.inputTokensUpperBound,
      });
    }
    const pricing = this.authorization.pricing;
    const worstInputRate = Math.max(
      pricing.normalInputNanoUsdPerToken,
      pricing.cacheWriteNanoUsdPerToken,
    );
    const reservedWorstCaseNanoUsd =
      bound.inputTokensUpperBound * worstInputRate
      + input.maxOutputTokens * pricing.outputNanoUsdPerToken;
    if (this.spentNanoUsd + reservedWorstCaseNanoUsd
      > this.limits.absoluteMaxSpendNanoUsd) {
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
    this.pendingRequest = null;
    if ((input.response.status < 200 || input.response.status >= 300)
      && !record(input.response.body).usage) {
      return this.allow('AFTER_INVOKE_HTTP_FAILURE', {
        turn: input.turn, requestHash: input.request.requestHash,
        responseStatus: input.response.status, chargedUsage: 'NOT_REPORTED',
      });
    }
    const usage = parseUsage(input.request.provider, input.response.body);
    if (!usage) return this.accountingDenial('PROVIDER_USAGE_MISSING_OR_INVALID', {
      turn: input.turn, requestHash: input.request.requestHash,
      responseStatus: input.response.status,
    });
    const actualCostNanoUsd = calculateCostNanoUsd(usage, this.authorization.pricing);
    this.totalInputTokens += usage.inputTokens;
    this.totalCachedInputTokens += usage.cachedInputTokens;
    this.totalCacheWriteTokens += usage.cacheWriteTokens;
    this.totalOutputTokens += usage.outputTokens + usage.thoughtTokens;
    this.totalThoughtTokens += usage.thoughtTokens;
    this.totalReasoningTokens += usage.reasoningTokens;
    this.spentNanoUsd += actualCostNanoUsd;
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

  receipt(
    episodeTerminalDisposition: ProviderNativeTerminalDispositionV2R,
  ): Readonly<SealedHoldoutRuntimeBudgetReceiptV2R> {
    const assessment: SealedHoldoutRuntimeBudgetReceiptV2R['assessment'] = this.pendingRequest
      || episodeTerminalDisposition === 'RESOURCE_ACCOUNTING_UNVERIFIABLE'
      ? 'ACCOUNTING_UNVERIFIABLE'
      : episodeTerminalDisposition === 'RESOURCE_BUDGET_EXHAUSTED'
        ? 'BUDGET_EXHAUSTED' : 'ACCOUNTED_WITHIN_BUDGET';
    const material = {
      version: SEALED_HOLDOUT_RUNTIME_BUDGET_VERSION_V2R,
      authority: 'RESEARCH_RESOURCE_ACCOUNTING_NO_PROJECT_MUTATION' as const,
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
      usage: this.usage(),
      events: structuredClone(this.events), episodeTerminalDisposition, assessment,
    };
    return deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
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
      pendingRequest: this.pendingRequest,
    };
  }

  private guardIdentitySha256(): string {
    return hashCanonicalJsonV1({
      version: PROVIDER_NATIVE_RUNTIME_GUARD_RESUME_STATE_VERSION_V2R,
      guardKind: SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
      authorizationSha256: this.authorizationSha256,
      limits: this.limits,
    });
  }

  private assertPristineForResume(): void {
    if (this.pendingRequest || this.events.length || this.providerTurns
      || this.selectedOperations || this.totalInputTokens
      || this.totalCachedInputTokens || this.totalCacheWriteTokens
      || this.totalOutputTokens || this.totalThoughtTokens
      || this.totalReasoningTokens || this.spentNanoUsd) {
      fail('SEALED_RUNTIME_RESUME_TARGET_NOT_PRISTINE');
    }
  }
}

function assertRuntimeEventsBoundToTurns(
  events: readonly Readonly<JsonRecord>[],
  completedTurns: readonly Readonly<JsonRecord>[],
): void {
  const turnEvents = completedTurns.flatMap((turn) => {
    if (!Array.isArray(turn.runtimeGuardAudit)
      || !Number.isSafeInteger(turn.maxOutputTokens)
      || Number(turn.maxOutputTokens) < 64) {
      fail('SEALED_RUNTIME_RESUME_TURN_AUDIT_INVALID');
    }
    return records(turn.runtimeGuardAudit);
  });
  if (canonicalizeJsonV1(events) !== canonicalizeJsonV1(turnEvents)) {
    fail('SEALED_RUNTIME_RESUME_TURN_AUDIT_MISMATCH');
  }
}

function deriveRuntimeUsageFromEvents(events: readonly Readonly<JsonRecord>[]) {
  const usage = {
    providerTurns: 0,
    selectedOperations: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    thoughtTokens: 0,
    reasoningTokens: 0,
    spentNanoUsd: 0,
  };
  events.forEach((event, index) => {
    if (event.ordinal !== index + 1 || event.status !== 'ALLOW') {
      fail('SEALED_RUNTIME_RESUME_EVENT_SEQUENCE_INVALID');
    }
    if (event.phase === 'BEFORE_INVOKE') usage.providerTurns += 1;
    if (event.phase === 'AFTER_EXECUTE') usage.selectedOperations += 1;
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
    if (Object.values(usage).some((value) => !Number.isSafeInteger(value))) {
      fail('SEALED_RUNTIME_RESUME_USAGE_OVERFLOW');
    }
  });
  return usage;
}

function resumeInteger(value: unknown): number {
  const parsed = safeInteger(value);
  if (parsed === null) fail('SEALED_RUNTIME_RESUME_USAGE_INVALID');
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
): number {
  const normal = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  return normal * pricing.normalInputNanoUsdPerToken
    + usage.cachedInputTokens * pricing.cachedInputNanoUsdPerToken
    + usage.cacheWriteTokens * pricing.cacheWriteNanoUsdPerToken
    + (usage.outputTokens + usage.thoughtTokens) * pricing.outputNanoUsdPerToken;
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
  const material = {
    version: SEALED_HOLDOUT_INPUT_TOKEN_BOUND_VERSION_V2R,
    requestHash: input.request.requestHash,
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
  value: Readonly<SealedHoldoutInputTokenBoundV2R>,
  requestHash: string,
): boolean {
  return Number.isSafeInteger(value.inputTokensUpperBound)
    && value.inputTokensUpperBound >= 0 && Boolean(value.method.trim())
    && value.evidenceSha256 === hashCanonicalJsonV1({
      version: SEALED_HOLDOUT_INPUT_TOKEN_BOUND_VERSION_V2R,
      requestHash,
      inputTokensUpperBound: value.inputTokensUpperBound,
      method: value.method,
    });
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
    fail('SEALED_RUNTIME_RESUME_EVENT_ARRAY_INVALID');
  }
  return value;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
