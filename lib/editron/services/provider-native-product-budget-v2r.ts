import type { WalletRef } from '@/lib/editron/services/project-ownership';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import type { ProviderNativeTerminalDispositionV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { DURABLE_WORKFLOW_JOB_VERSION_V1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import type { EditorialPlanArtifactRefV1 } from './editorial-plan-v1';
import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_PRODUCT_BUDGET_AUTHORIZATION_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_AUTHORIZATION_V2R_2' as const;
export const PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_V2R_2' as const;
export const PROVIDER_NATIVE_PRODUCT_BUDGET_SETTLEMENT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_SETTLEMENT_V2R_2' as const;
export const PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R =
  'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_V2R_2' as const;

export interface ProviderNativeProductBudgetScopeV2R {
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
}

export interface ProviderNativeProductTokenPricingV2R {
  normalInputNanoUsdPerToken: number;
  cachedInputNanoUsdPerToken: number;
  cacheWriteNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
}

export interface ProviderNativeProductBudgetAuthorizationV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_AUTHORIZATION_VERSION_V2R;
  authority: 'PRODUCT_BUDGET_AUTHORIZATION_NO_PROJECT_MUTATION';
  scope: Readonly<ProviderNativeProductBudgetScopeV2R>;
  wallet: Readonly<WalletRef>;
  route: Readonly<ProviderNativeRouteV2R>;
  routeSha256: string;
  providerPricing: Readonly<{
    ownerId: string;
    ownerVersion: string;
    currency: 'USD';
    effectiveAt: string;
    expiresAt: string;
    tokenPricing: Readonly<ProviderNativeProductTokenPricingV2R>;
    pricingSha256: string;
  }>;
  customerPricing: Readonly<{
    ownerId: string;
    ownerVersion: string;
    currency: 'EDITRON_CREDIT';
    billingQuantum: 'CENTICREDIT';
    creditPool: 'main';
    pricingSha256: string;
  }>;
  limits: Readonly<{
    maxProviderTurns: number;
    maxSelectedOperations: number;
    maxCandidatesPerOperation: number;
    maxInputTokensPerTurn: number;
    maxCumulativeOutputTokens: number;
    absoluteMaxProviderSpendNanoUsd: number;
    absoluteMaxCustomerChargeCentiCredits: number;
  }>;
  policy: Readonly<{
    reserveBeforeProviderDispatch: true;
    unknownProviderResult: 'SETTLE_CONSERVATIVE_MAX';
    cancellationBeforeDispatch: 'RELEASE_ALL';
    cancellationAfterDispatch: 'REQUIRE_ACCOUNTING_EVIDENCE';
    customerChargeRounding: 'CEIL_TOTAL_EPISODE_TO_CENTICREDIT';
    automaticProviderRetry: 'DENY_WITHOUT_NEW_AUTHORIZATION';
    walletWriterOwnerId: 'CreditsService';
  }>;
  approval: Readonly<{
    approvedBy: string;
    approvedAt: string;
    expiresAt: string;
  }>;
  authorizationSha256: string;
}

export interface ProviderNativeProductBudgetReservationV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R;
  authority: 'CREDITS_SERVICE_OWNED_PRODUCT_BUDGET_RESERVATION';
  authorizationSha256: string;
  scope: Readonly<ProviderNativeProductBudgetScopeV2R>;
  wallet: Readonly<WalletRef>;
  reservationId: string;
  reservationVersion: 1;
  status: 'RESERVED';
  reservedProviderSpendNanoUsd: number;
  reservedCentiCredits: number;
  walletReservationTransactionId: string;
  walletReservationReceiptSha256: string;
  idempotencyKey: string;
  reservedAt: string;
  expiresAt: string;
  reservationSha256: string;
  guardKind: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R;
  guardIdentitySha256: string;
}

export type ProviderNativeProductBudgetSettlementModeV2R =
  | 'ACTUAL_USAGE'
  | 'CONSERVATIVE_MAX'
  | 'CANCELLED_BEFORE_DISPATCH';

export type ProviderNativeProductBudgetExecutionEvidenceKindV2R =
  | 'ACTUAL_USAGE_COMPLETE'
  | 'UNKNOWN_PROVIDER_RESULT'
  | 'NO_PROVIDER_DISPATCH';

export interface ProviderNativeProductBudgetExecutionEvidenceV2R {
  ownerId: 'DURABLE_WORKFLOW_JOB_STORE';
  ownerVersion: typeof DURABLE_WORKFLOW_JOB_VERSION_V1;
  jobId: string;
  kind: ProviderNativeProductBudgetExecutionEvidenceKindV2R;
  artifactSha256: string;
}

export interface ProviderNativeProductBudgetSettlementV2R {
  version: typeof PROVIDER_NATIVE_PRODUCT_BUDGET_SETTLEMENT_VERSION_V2R;
  authority: 'CREDITS_SERVICE_OWNED_PRODUCT_BUDGET_SETTLEMENT';
  authorizationSha256: string;
  reservationSha256: string;
  reservationId: string;
  expectedReservationVersion: 1;
  settlementVersion: 2;
  status: 'SETTLED' | 'RELEASED';
  mode: ProviderNativeProductBudgetSettlementModeV2R;
  terminalDisposition: ProviderNativeTerminalDispositionV2R;
  actualProviderSpendNanoUsd: number | null;
  chargedCentiCredits: number;
  releasedCentiCredits: number;
  providerAttemptReceiptSha256s: readonly string[];
  executionEvidence: Readonly<ProviderNativeProductBudgetExecutionEvidenceV2R>;
  customerChargeComputationSha256: string | null;
  walletSettlementReceiptSha256: string;
  idempotencyKey: string;
  settledAt: string;
  settlementSha256: string;
}

export type ProviderNativeProductBudgetSettlementRequestV2R = Readonly<Omit<
  ProviderNativeProductBudgetSettlementV2R,
  'version' | 'authority' | 'authorizationSha256' | 'reservationSha256'
  | 'reservationId' | 'expectedReservationVersion' | 'settlementVersion'
  | 'status' | 'walletSettlementReceiptSha256' | 'idempotencyKey'
  | 'settledAt' | 'settlementSha256'
>>;

export interface ProviderNativeProductBudgetWalletPortV2R {
  /**
   * Owner boundary only. A production implementation must delegate both
   * methods to CreditsService's atomic reservation ledger; this contract does
   * not itself move, hold, release or charge credits.
   */
  reserve(input: Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
  }>): Promise<Readonly<ProviderNativeProductBudgetReservationV2R>>;
  settle(input: Readonly<{
    authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
    reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
    requested: ProviderNativeProductBudgetSettlementRequestV2R;
  }>): Promise<Readonly<ProviderNativeProductBudgetSettlementV2R>>;
}

export function providerNativeProductBudgetReservationRefV2R(
  reservationInput: Readonly<ProviderNativeProductBudgetReservationV2R>,
  authorizationInput: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
): Readonly<EditorialPlanArtifactRefV1> {
  const authorization = assertProviderNativeProductBudgetAuthorizationV2R(
    authorizationInput,
  );
  const reservation = assertProviderNativeProductBudgetReservationV2R(
    reservationInput,
    authorization,
  );
  return deepFreezeEditronJsonV1({
    ownerId: 'CREDITS_SERVICE',
    artifactId: reservation.reservationId,
    artifactVersion: reservation.version,
    artifactSha256: reservation.guardIdentitySha256,
  });
}

export function createProviderNativeProductBudgetAuthorizationV2R(input: Readonly<{
  scope: Readonly<ProviderNativeProductBudgetScopeV2R>;
  wallet: Readonly<WalletRef>;
  route: Readonly<ProviderNativeRouteV2R>;
  providerPricing: Readonly<{
    ownerId: string;
    ownerVersion: string;
    effectiveAt: string;
    expiresAt: string;
    tokenPricing: Readonly<ProviderNativeProductTokenPricingV2R>;
  }>;
  customerPricing: Readonly<{
    ownerId: string;
    ownerVersion: string;
    creditPool: 'main';
    pricingSha256: string;
  }>;
  limits: ProviderNativeProductBudgetAuthorizationV2R['limits'];
  approval: ProviderNativeProductBudgetAuthorizationV2R['approval'];
}>): Readonly<ProviderNativeProductBudgetAuthorizationV2R> {
  const scope = normalizeScope(input.scope);
  const wallet = normalizeWallet(input.wallet);
  const route = cloneCanonicalEditronJsonV1(input.route);
  assertRoute(route);
  const routeSha256 = hashEditronCanonicalJsonV1(route);
  const tokenPricing = normalizeTokenPricing(input.providerPricing.tokenPricing);
  const pricingMaterial = {
    ownerId: identity(input.providerPricing.ownerId, 'PROVIDER_PRICING_OWNER'),
    ownerVersion: identity(input.providerPricing.ownerVersion, 'PROVIDER_PRICING_VERSION'),
    currency: 'USD' as const,
    effectiveAt: timestamp(input.providerPricing.effectiveAt, 'PROVIDER_PRICING_EFFECTIVE'),
    expiresAt: timestamp(input.providerPricing.expiresAt, 'PROVIDER_PRICING_EXPIRY'),
    tokenPricing,
  };
  requireOrderedTimes(pricingMaterial.effectiveAt, pricingMaterial.expiresAt, 'PROVIDER_PRICING');
  const providerPricing = {
    ...pricingMaterial,
    pricingSha256: hashEditronCanonicalJsonV1(pricingMaterial),
  };
  const customerPricing = {
    ownerId: identity(input.customerPricing.ownerId, 'CUSTOMER_PRICING_OWNER'),
    ownerVersion: identity(input.customerPricing.ownerVersion, 'CUSTOMER_PRICING_VERSION'),
    currency: 'EDITRON_CREDIT' as const,
    billingQuantum: 'CENTICREDIT' as const,
    creditPool: input.customerPricing.creditPool,
    pricingSha256: sha256(input.customerPricing.pricingSha256, 'CUSTOMER_PRICING'),
  };
  if (customerPricing.creditPool !== 'main') {
    fail('PRODUCT_BUDGET_CREDIT_POOL_INVALID');
  }
  const limits = normalizeLimits(input.limits);
  const approval = {
    approvedBy: identity(input.approval.approvedBy, 'APPROVER'),
    approvedAt: timestamp(input.approval.approvedAt, 'APPROVED_AT'),
    expiresAt: timestamp(input.approval.expiresAt, 'AUTHORIZATION_EXPIRY'),
  };
  requireOrderedTimes(approval.approvedAt, approval.expiresAt, 'AUTHORIZATION');
  if (Date.parse(approval.approvedAt) < Date.parse(providerPricing.effectiveAt)
    || Date.parse(approval.expiresAt) > Date.parse(providerPricing.expiresAt)) {
    fail('PRODUCT_BUDGET_AUTHORIZATION_OUTLIVES_PRICING');
  }
  const material = {
    version: PROVIDER_NATIVE_PRODUCT_BUDGET_AUTHORIZATION_VERSION_V2R,
    authority: 'PRODUCT_BUDGET_AUTHORIZATION_NO_PROJECT_MUTATION' as const,
    scope,
    wallet,
    route,
    routeSha256,
    providerPricing,
    customerPricing,
    limits,
    policy: {
      reserveBeforeProviderDispatch: true as const,
      unknownProviderResult: 'SETTLE_CONSERVATIVE_MAX' as const,
      cancellationBeforeDispatch: 'RELEASE_ALL' as const,
      cancellationAfterDispatch: 'REQUIRE_ACCOUNTING_EVIDENCE' as const,
      customerChargeRounding: 'CEIL_TOTAL_EPISODE_TO_CENTICREDIT' as const,
      automaticProviderRetry: 'DENY_WITHOUT_NEW_AUTHORIZATION' as const,
      walletWriterOwnerId: 'CreditsService' as const,
    },
    approval,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    authorizationSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProviderNativeProductBudgetAuthorizationV2R(
  value: unknown,
): Readonly<ProviderNativeProductBudgetAuthorizationV2R> {
  const candidate = record(value, 'AUTHORIZATION');
  const providerPricing = record(candidate.providerPricing, 'PROVIDER_PRICING');
  const customerPricing = record(candidate.customerPricing, 'CUSTOMER_PRICING');
  const rebound = createProviderNativeProductBudgetAuthorizationV2R({
    scope: record(candidate.scope, 'SCOPE') as unknown as ProviderNativeProductBudgetScopeV2R,
    wallet: record(candidate.wallet, 'WALLET') as unknown as WalletRef,
    route: record(candidate.route, 'ROUTE') as unknown as ProviderNativeRouteV2R,
    providerPricing: {
      ownerId: text(providerPricing.ownerId, 'PROVIDER_PRICING_OWNER'),
      ownerVersion: text(providerPricing.ownerVersion, 'PROVIDER_PRICING_VERSION'),
      effectiveAt: text(providerPricing.effectiveAt, 'PROVIDER_PRICING_EFFECTIVE'),
      expiresAt: text(providerPricing.expiresAt, 'PROVIDER_PRICING_EXPIRY'),
      tokenPricing: record(providerPricing.tokenPricing, 'TOKEN_PRICING') as unknown as ProviderNativeProductTokenPricingV2R,
    },
    customerPricing: {
      ownerId: text(customerPricing.ownerId, 'CUSTOMER_PRICING_OWNER'),
      ownerVersion: text(customerPricing.ownerVersion, 'CUSTOMER_PRICING_VERSION'),
      creditPool: text(customerPricing.creditPool, 'CUSTOMER_PRICING_POOL') as 'main',
      pricingSha256: text(customerPricing.pricingSha256, 'CUSTOMER_PRICING'),
    },
    limits: record(candidate.limits, 'LIMITS') as unknown as ProviderNativeProductBudgetAuthorizationV2R['limits'],
    approval: record(candidate.approval, 'APPROVAL') as unknown as ProviderNativeProductBudgetAuthorizationV2R['approval'],
  });
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('PRODUCT_BUDGET_AUTHORIZATION_INVALID');
  }
  return rebound;
}

export function createProviderNativeProductBudgetReservationV2R(input: Readonly<{
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
  reservationId: string;
  walletReservationTransactionId: string;
  walletReservationReceiptSha256: string;
  reservedAt: string;
}>): Readonly<ProviderNativeProductBudgetReservationV2R> {
  const authorization = assertProviderNativeProductBudgetAuthorizationV2R(input.authorization);
  const reservationId = identity(input.reservationId, 'RESERVATION_ID');
  const reservedAt = timestamp(input.reservedAt, 'RESERVED_AT');
  if (Date.parse(reservedAt) < Date.parse(authorization.approval.approvedAt)
    || Date.parse(reservedAt) >= Date.parse(authorization.approval.expiresAt)) {
    fail('PRODUCT_BUDGET_RESERVATION_TIME_INVALID');
  }
  const core = {
    version: PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_VERSION_V2R,
    authority: 'CREDITS_SERVICE_OWNED_PRODUCT_BUDGET_RESERVATION' as const,
    authorizationSha256: authorization.authorizationSha256,
    scope: authorization.scope,
    wallet: authorization.wallet,
    reservationId,
    reservationVersion: 1 as const,
    status: 'RESERVED' as const,
    reservedProviderSpendNanoUsd: authorization.limits.absoluteMaxProviderSpendNanoUsd,
    reservedCentiCredits: authorization.limits.absoluteMaxCustomerChargeCentiCredits,
    walletReservationTransactionId: identity(
      input.walletReservationTransactionId,
      'WALLET_RESERVATION_TRANSACTION',
    ),
    walletReservationReceiptSha256: sha256(
      input.walletReservationReceiptSha256,
      'WALLET_RESERVATION_RECEIPT',
    ),
    idempotencyKey: `provider-native-budget:reserve:${reservationId}:v1`,
    reservedAt,
    expiresAt: authorization.approval.expiresAt,
  };
  const reservationSha256 = hashEditronCanonicalJsonV1(core);
  const guardKind = PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R;
  const guardIdentitySha256 = hashEditronCanonicalJsonV1({
    guardKind,
    authorizationSha256: authorization.authorizationSha256,
    reservationSha256,
  });
  return deepFreezeEditronJsonV1({
    ...core,
    reservationSha256,
    guardKind,
    guardIdentitySha256,
  });
}

export function assertProviderNativeProductBudgetReservationV2R(
  value: unknown,
  authorizationInput: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
): Readonly<ProviderNativeProductBudgetReservationV2R> {
  const candidate = record(value, 'RESERVATION');
  const rebound = createProviderNativeProductBudgetReservationV2R({
    authorization: authorizationInput,
    reservationId: text(candidate.reservationId, 'RESERVATION_ID'),
    walletReservationTransactionId: text(
      candidate.walletReservationTransactionId,
      'WALLET_RESERVATION_TRANSACTION',
    ),
    walletReservationReceiptSha256: text(
      candidate.walletReservationReceiptSha256,
      'WALLET_RESERVATION_RECEIPT',
    ),
    reservedAt: text(candidate.reservedAt, 'RESERVED_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('PRODUCT_BUDGET_RESERVATION_INVALID');
  }
  return rebound;
}

export function createProviderNativeProductBudgetSettlementV2R(input: Readonly<{
  authorization: Readonly<ProviderNativeProductBudgetAuthorizationV2R>;
  reservation: Readonly<ProviderNativeProductBudgetReservationV2R>;
  mode: ProviderNativeProductBudgetSettlementModeV2R;
  terminalDisposition: ProviderNativeTerminalDispositionV2R;
  actualProviderSpendNanoUsd: number | null;
  chargedCentiCredits: number;
  releasedCentiCredits: number;
  providerAttemptReceiptSha256s: readonly string[];
  executionEvidence: Readonly<ProviderNativeProductBudgetExecutionEvidenceV2R>;
  customerChargeComputationSha256: string | null;
  walletSettlementReceiptSha256: string;
  settledAt: string;
}>): Readonly<ProviderNativeProductBudgetSettlementV2R> {
  const authorization = assertProviderNativeProductBudgetAuthorizationV2R(input.authorization);
  const reservation = assertProviderNativeProductBudgetReservationV2R(
    input.reservation,
    authorization,
  );
  const charged = nonNegativeInteger(input.chargedCentiCredits, 'CHARGED_CENTICREDITS');
  const released = nonNegativeInteger(input.releasedCentiCredits, 'RELEASED_CENTICREDITS');
  if (charged + released !== reservation.reservedCentiCredits) {
    fail('PRODUCT_BUDGET_SETTLEMENT_BALANCE_INVALID');
  }
  const attemptReceipts = input.providerAttemptReceiptSha256s.map((value) => (
    sha256(value, 'PROVIDER_ATTEMPT_RECEIPT')
  ));
  if (new Set(attemptReceipts).size !== attemptReceipts.length) {
    fail('PRODUCT_BUDGET_SETTLEMENT_ATTEMPT_DUPLICATE');
  }
  const executionEvidence = normalizeExecutionEvidence(input.executionEvidence);
  let status: ProviderNativeProductBudgetSettlementV2R['status'];
  let actualProviderSpendNanoUsd: number | null;
  let computationSha256: string | null;
  if (input.mode === 'ACTUAL_USAGE') {
    status = 'SETTLED';
    actualProviderSpendNanoUsd = nonNegativeInteger(
      input.actualProviderSpendNanoUsd,
      'ACTUAL_PROVIDER_SPEND',
    );
    if (actualProviderSpendNanoUsd > reservation.reservedProviderSpendNanoUsd
      || input.customerChargeComputationSha256 === null
      || executionEvidence.kind !== 'ACTUAL_USAGE_COMPLETE') {
      fail('PRODUCT_BUDGET_ACTUAL_SETTLEMENT_INVALID');
    }
    computationSha256 = sha256(
      input.customerChargeComputationSha256,
      'CUSTOMER_CHARGE_COMPUTATION',
    );
  } else if (input.mode === 'CONSERVATIVE_MAX') {
    status = 'SETTLED';
    actualProviderSpendNanoUsd = null;
    computationSha256 = null;
    if (charged !== reservation.reservedCentiCredits || released !== 0
      || input.customerChargeComputationSha256 !== null
      || executionEvidence.kind !== 'UNKNOWN_PROVIDER_RESULT') {
      fail('PRODUCT_BUDGET_CONSERVATIVE_SETTLEMENT_INVALID');
    }
  } else if (input.mode === 'CANCELLED_BEFORE_DISPATCH') {
    status = 'RELEASED';
    actualProviderSpendNanoUsd = 0;
    computationSha256 = null;
    if (charged !== 0 || released !== reservation.reservedCentiCredits
      || attemptReceipts.length !== 0 || input.customerChargeComputationSha256 !== null) {
      fail('PRODUCT_BUDGET_CANCELLED_SETTLEMENT_INVALID');
    }
    if (executionEvidence.kind !== 'NO_PROVIDER_DISPATCH') {
      fail('PRODUCT_BUDGET_CANCELLED_SETTLEMENT_EVIDENCE_INVALID');
    }
  } else {
    fail('PRODUCT_BUDGET_SETTLEMENT_MODE_INVALID');
  }
  const settledAt = timestamp(input.settledAt, 'SETTLED_AT');
  if (Date.parse(settledAt) < Date.parse(reservation.reservedAt)) {
    fail('PRODUCT_BUDGET_SETTLEMENT_TIME_INVALID');
  }
  const material = {
    version: PROVIDER_NATIVE_PRODUCT_BUDGET_SETTLEMENT_VERSION_V2R,
    authority: 'CREDITS_SERVICE_OWNED_PRODUCT_BUDGET_SETTLEMENT' as const,
    authorizationSha256: authorization.authorizationSha256,
    reservationSha256: reservation.reservationSha256,
    reservationId: reservation.reservationId,
    expectedReservationVersion: 1 as const,
    settlementVersion: 2 as const,
    status,
    mode: input.mode,
    terminalDisposition: terminalDisposition(input.terminalDisposition),
    actualProviderSpendNanoUsd,
    chargedCentiCredits: charged,
    releasedCentiCredits: released,
    providerAttemptReceiptSha256s: attemptReceipts,
    executionEvidence,
    customerChargeComputationSha256: computationSha256,
    walletSettlementReceiptSha256: sha256(
      input.walletSettlementReceiptSha256,
      'WALLET_SETTLEMENT_RECEIPT',
    ),
    idempotencyKey: `provider-native-budget:settle:${reservation.reservationId}:v1`,
    settledAt,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    settlementSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProviderNativeProductBudgetSettlementV2R(
  value: unknown,
  authorizationInput: Readonly<ProviderNativeProductBudgetAuthorizationV2R>,
  reservationInput: Readonly<ProviderNativeProductBudgetReservationV2R>,
): Readonly<ProviderNativeProductBudgetSettlementV2R> {
  const candidate = record(value, 'SETTLEMENT');
  const rebound = createProviderNativeProductBudgetSettlementV2R({
    authorization: authorizationInput,
    reservation: reservationInput,
    mode: text(candidate.mode, 'SETTLEMENT_MODE') as ProviderNativeProductBudgetSettlementModeV2R,
    terminalDisposition: text(
      candidate.terminalDisposition,
      'TERMINAL_DISPOSITION',
    ) as ProviderNativeTerminalDispositionV2R,
    actualProviderSpendNanoUsd: candidate.actualProviderSpendNanoUsd === null
      ? null : nonNegativeInteger(candidate.actualProviderSpendNanoUsd, 'ACTUAL_PROVIDER_SPEND'),
    chargedCentiCredits: nonNegativeInteger(candidate.chargedCentiCredits, 'CHARGED_CENTICREDITS'),
    releasedCentiCredits: nonNegativeInteger(candidate.releasedCentiCredits, 'RELEASED_CENTICREDITS'),
    providerAttemptReceiptSha256s: stringArray(
      candidate.providerAttemptReceiptSha256s,
      'PROVIDER_ATTEMPT_RECEIPTS',
    ),
    executionEvidence: record(
      candidate.executionEvidence,
      'EXECUTION_EVIDENCE',
    ) as unknown as ProviderNativeProductBudgetExecutionEvidenceV2R,
    customerChargeComputationSha256:
      candidate.customerChargeComputationSha256 === null
        ? null : text(candidate.customerChargeComputationSha256, 'CUSTOMER_CHARGE_COMPUTATION'),
    walletSettlementReceiptSha256: text(
      candidate.walletSettlementReceiptSha256,
      'WALLET_SETTLEMENT_RECEIPT',
    ),
    settledAt: text(candidate.settledAt, 'SETTLED_AT'),
  });
  if (canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('PRODUCT_BUDGET_SETTLEMENT_INVALID');
  }
  return rebound;
}

function normalizeScope(
  value: Readonly<ProviderNativeProductBudgetScopeV2R>,
): Readonly<ProviderNativeProductBudgetScopeV2R> {
  return {
    tenantId: identity(value.tenantId, 'TENANT_ID'),
    userId: identity(value.userId, 'USER_ID'),
    projectId: identity(value.projectId, 'PROJECT_ID'),
    episodeId: identity(value.episodeId, 'EPISODE_ID'),
  };
}

function normalizeWallet(value: Readonly<WalletRef>): Readonly<WalletRef> {
  if (value.type === 'user') {
    return { type: 'user', clerkUserId: identity(value.clerkUserId, 'WALLET_USER_ID') };
  }
  if (value.type === 'org') {
    return {
      type: 'org',
      clerkOrgId: identity(value.clerkOrgId, 'WALLET_ORG_ID'),
      actorUserId: identity(value.actorUserId, 'WALLET_ACTOR_ID'),
    };
  }
  fail('PRODUCT_BUDGET_WALLET_INVALID');
}

function normalizeTokenPricing(
  value: Readonly<ProviderNativeProductTokenPricingV2R>,
): Readonly<ProviderNativeProductTokenPricingV2R> {
  const result = {
    normalInputNanoUsdPerToken: nonNegativeInteger(value.normalInputNanoUsdPerToken, 'NORMAL_INPUT_PRICE'),
    cachedInputNanoUsdPerToken: nonNegativeInteger(value.cachedInputNanoUsdPerToken, 'CACHED_INPUT_PRICE'),
    cacheWriteNanoUsdPerToken: nonNegativeInteger(value.cacheWriteNanoUsdPerToken, 'CACHE_WRITE_PRICE'),
    outputNanoUsdPerToken: nonNegativeInteger(value.outputNanoUsdPerToken, 'OUTPUT_PRICE'),
  };
  if (!result.normalInputNanoUsdPerToken || !result.outputNanoUsdPerToken) {
    fail('PRODUCT_BUDGET_PRICE_ZERO');
  }
  return result;
}

function normalizeLimits(
  value: ProviderNativeProductBudgetAuthorizationV2R['limits'],
): ProviderNativeProductBudgetAuthorizationV2R['limits'] {
  return {
    maxProviderTurns: positiveInteger(value.maxProviderTurns, 'MAX_PROVIDER_TURNS'),
    maxSelectedOperations: positiveInteger(value.maxSelectedOperations, 'MAX_SELECTED_OPERATIONS'),
    maxCandidatesPerOperation: positiveInteger(value.maxCandidatesPerOperation, 'MAX_CANDIDATES'),
    maxInputTokensPerTurn: positiveInteger(value.maxInputTokensPerTurn, 'MAX_INPUT_TOKENS'),
    maxCumulativeOutputTokens: positiveInteger(value.maxCumulativeOutputTokens, 'MAX_OUTPUT_TOKENS'),
    absoluteMaxProviderSpendNanoUsd: positiveInteger(value.absoluteMaxProviderSpendNanoUsd, 'MAX_PROVIDER_SPEND'),
    absoluteMaxCustomerChargeCentiCredits: positiveInteger(value.absoluteMaxCustomerChargeCentiCredits, 'MAX_CUSTOMER_CHARGE'),
  };
}

function normalizeExecutionEvidence(
  value: Readonly<ProviderNativeProductBudgetExecutionEvidenceV2R>,
): Readonly<ProviderNativeProductBudgetExecutionEvidenceV2R> {
  if (value.ownerId !== 'DURABLE_WORKFLOW_JOB_STORE'
    || value.ownerVersion !== DURABLE_WORKFLOW_JOB_VERSION_V1
    || !['ACTUAL_USAGE_COMPLETE', 'UNKNOWN_PROVIDER_RESULT', 'NO_PROVIDER_DISPATCH']
      .includes(value.kind)) {
    fail('PRODUCT_BUDGET_EXECUTION_EVIDENCE_OWNER_INVALID');
  }
  return {
    ownerId: 'DURABLE_WORKFLOW_JOB_STORE',
    ownerVersion: DURABLE_WORKFLOW_JOB_VERSION_V1,
    jobId: identity(value.jobId, 'EXECUTION_EVIDENCE_JOB_ID'),
    kind: value.kind,
    artifactSha256: sha256(value.artifactSha256, 'EXECUTION_EVIDENCE'),
  };
}

const TERMINAL_DISPOSITIONS = new Set<ProviderNativeTerminalDispositionV2R>([
  'READY_FOR_PROOF', 'PASS', 'FAIL', 'UNVERIFIABLE', 'CAPABILITY_GAP',
  'CLARIFICATION_REQUIRED', 'POLICY_BLOCKED', 'CONFLICT', 'PROVIDER_RATE_LIMIT',
  'PROVIDER_TIMEOUT', 'PROVIDER_REFUSAL', 'PROVIDER_ERROR',
  'TOOL_PROTOCOL_FAILURE', 'TOOL_EXECUTION_FAILURE', 'STEP_BUDGET_EXHAUSTED',
  'RESOURCE_BUDGET_EXHAUSTED', 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
]);

function terminalDisposition(value: unknown): ProviderNativeTerminalDispositionV2R {
  const result = identity(value, 'TERMINAL_DISPOSITION') as ProviderNativeTerminalDispositionV2R;
  if (!TERMINAL_DISPOSITIONS.has(result)) {
    fail('PRODUCT_BUDGET_TERMINAL_DISPOSITION_INVALID');
  }
  return result;
}

function assertRoute(route: Readonly<ProviderNativeRouteV2R>): void {
  identity(route.routeId, 'ROUTE_ID');
  identity(route.provider, 'ROUTE_PROVIDER');
  identity(route.model, 'ROUTE_MODEL');
  identity(route.claimedModelIdentity, 'ROUTE_CLAIMED_MODEL');
}

function requireOrderedTimes(start: string, end: string, label: string): void {
  if (Date.parse(end) <= Date.parse(start)) fail(`PRODUCT_BUDGET_${label}_WINDOW_INVALID`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`PRODUCT_BUDGET_${label}_INVALID`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`PRODUCT_BUDGET_${label}_INVALID`);
  return value;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(result)) {
    fail(`PRODUCT_BUDGET_${label}_INVALID`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) fail(`PRODUCT_BUDGET_${label}_HASH_INVALID`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) fail(`PRODUCT_BUDGET_${label}_INVALID`);
  return result;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail(`PRODUCT_BUDGET_${label}_INVALID`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`PRODUCT_BUDGET_${label}_INVALID`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  const result = nonNegativeInteger(value, label);
  if (!result) fail(`PRODUCT_BUDGET_${label}_INVALID`);
  return result;
}

function fail(code: string): never {
  throw new Error(code);
}
