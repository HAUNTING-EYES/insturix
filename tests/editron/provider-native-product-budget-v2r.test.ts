import { describe, expect, it, vi } from 'vitest';
import type { ProviderNativeRuntimeGuardV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import {
  assertProviderNativeProductBudgetAuthorizationV2R,
  assertProviderNativeProductBudgetReservationV2R,
  assertProviderNativeProductBudgetSettlementV2R,
  createProviderNativeProductBudgetAuthorizationV2R,
  createProviderNativeProductBudgetReservationV2R,
  createProviderNativeProductBudgetSettlementV2R,
  PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R,
  providerNativeProductBudgetReservationRefV2R,
} from '@/lib/editron/services/provider-native-product-budget-v2r';
import { createProviderNativeProductBudgetRuntimeGuardOwnerV2R }
  from '@/lib/editron/services/provider-native-product-budget-owner-v2r';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);

function executionEvidence(
  kind: 'ACTUAL_USAGE_COMPLETE' | 'UNKNOWN_PROVIDER_RESULT' | 'NO_PROVIDER_DISPATCH',
) {
  return {
    ownerId: 'DURABLE_WORKFLOW_JOB_STORE' as const,
    ownerVersion: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1' as const,
    jobId: 'job-1',
    kind,
    artifactSha256: E,
  };
}

function authorization() {
  return createProviderNativeProductBudgetAuthorizationV2R({
    scope: {
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1', episodeId: 'episode-1',
    },
    wallet: { type: 'org', clerkOrgId: 'org-1', actorUserId: 'user-1' },
    route: {
      routeId: 'OPENAI_TERRA',
      provider: 'openai',
      model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra-2026-08-01',
      reasoningMode: 'medium',
    },
    providerPricing: {
      ownerId: 'ProviderPricingService',
      ownerVersion: 'pricing-2026-08-23',
      effectiveAt: '2026-08-23T00:00:00.000Z',
      expiresAt: '2026-08-24T00:00:00.000Z',
      tokenPricing: {
        normalInputNanoUsdPerToken: 500,
        cachedInputNanoUsdPerToken: 50,
        cacheWriteNanoUsdPerToken: 625,
        outputNanoUsdPerToken: 2000,
      },
    },
    customerPricing: {
      ownerId: 'ProductPricingService',
      ownerVersion: 'editron-agent-v1',
      pricingSha256: A,
    },
    limits: {
      maxProviderTurns: 8,
      maxSelectedOperations: 12,
      maxCandidatesPerOperation: 5,
      maxInputTokensPerTurn: 90_000,
      maxCumulativeOutputTokens: 32_000,
      absoluteMaxProviderSpendNanoUsd: 250_000_000,
      absoluteMaxCustomerChargeCentiCredits: 900,
    },
    approval: {
      approvedBy: 'admin',
      approvedAt: '2026-08-23T01:00:00.000Z',
      expiresAt: '2026-08-23T03:00:00.000Z',
    },
  });
}

function reservation() {
  return createProviderNativeProductBudgetReservationV2R({
    authorization: authorization(),
    reservationId: 'reservation-1',
    walletReservationTransactionId: 'txn-reservation-1',
    walletReservationReceiptSha256: B,
    reservedAt: '2026-08-23T01:01:00.000Z',
  });
}

describe('provider-native product budget V2R', () => {
  it('binds scope, wallet, route and pricing to an exact reservation receipt', () => {
    const auth = authorization();
    const held = reservation();
    expect(auth.policy.walletWriterOwnerId).toBe('CreditsService');
    expect(auth.routeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(held.reservedCentiCredits).toBe(900);
    expect(held.guardKind).toBe(PROVIDER_NATIVE_PRODUCT_BUDGET_GUARD_KIND_V2R);
    expect(held.guardIdentitySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(providerNativeProductBudgetReservationRefV2R(held, auth)).toEqual({
      ownerId: 'CREDITS_SERVICE',
      artifactId: 'reservation-1',
      artifactVersion: 'EDITRON_PROVIDER_NATIVE_PRODUCT_BUDGET_RESERVATION_V2R_1',
      artifactSha256: held.guardIdentitySha256,
    });
    expect(Object.isFrozen(auth)).toBe(true);
    expect(Object.isFrozen(held)).toBe(true);
  });

  it('rejects copied scope, price, wallet receipt and reservation material', () => {
    const auth = authorization();
    const held = reservation();
    const forgedAuth = structuredClone(auth) as Record<string, unknown>;
    (forgedAuth.scope as Record<string, unknown>).projectId = 'project-copied';
    expect(() => assertProviderNativeProductBudgetAuthorizationV2R(forgedAuth))
      .toThrow('PRODUCT_BUDGET_AUTHORIZATION_INVALID');

    const forgedPrice = structuredClone(auth) as Record<string, unknown>;
    ((forgedPrice.providerPricing as Record<string, unknown>).tokenPricing as Record<string, unknown>)
      .outputNanoUsdPerToken = 1;
    expect(() => assertProviderNativeProductBudgetAuthorizationV2R(forgedPrice))
      .toThrow('PRODUCT_BUDGET_AUTHORIZATION_INVALID');

    const forgedHold = structuredClone(held) as Record<string, unknown>;
    forgedHold.walletReservationReceiptSha256 = C;
    expect(() => assertProviderNativeProductBudgetReservationV2R(forgedHold, auth))
      .toThrow('PRODUCT_BUDGET_RESERVATION_INVALID');
  });

  it('settles measured usage and releases only the unused wallet hold', () => {
    const settled = createProviderNativeProductBudgetSettlementV2R({
      authorization: authorization(),
      reservation: reservation(),
      mode: 'ACTUAL_USAGE',
      terminalDisposition: 'PASS',
      actualProviderSpendNanoUsd: 90_000_000,
      chargedCentiCredits: 340,
      releasedCentiCredits: 560,
      providerAttemptReceiptSha256s: [C, D],
      executionEvidence: executionEvidence('ACTUAL_USAGE_COMPLETE'),
      customerChargeComputationSha256: F,
      walletSettlementReceiptSha256: A,
      settledAt: '2026-08-23T01:20:00.000Z',
    });
    expect(settled.status).toBe('SETTLED');
    expect(settled.chargedCentiCredits + settled.releasedCentiCredits).toBe(900);
    expect(assertProviderNativeProductBudgetSettlementV2R(
      settled,
      authorization(),
      reservation(),
    )).toEqual(settled);
  });

  it('charges the reserved maximum when provider outcome accounting is unknown', () => {
    const settled = createProviderNativeProductBudgetSettlementV2R({
      authorization: authorization(),
      reservation: reservation(),
      mode: 'CONSERVATIVE_MAX',
      terminalDisposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
      actualProviderSpendNanoUsd: null,
      chargedCentiCredits: 900,
      releasedCentiCredits: 0,
      providerAttemptReceiptSha256s: [],
      executionEvidence: executionEvidence('UNKNOWN_PROVIDER_RESULT'),
      customerChargeComputationSha256: null,
      walletSettlementReceiptSha256: A,
      settledAt: '2026-08-23T01:20:00.000Z',
    });
    expect(settled.mode).toBe('CONSERVATIVE_MAX');
    expect(settled.actualProviderSpendNanoUsd).toBeNull();
  });

  it('releases all only when cancellation is proven before dispatch', () => {
    const released = createProviderNativeProductBudgetSettlementV2R({
      authorization: authorization(),
      reservation: reservation(),
      mode: 'CANCELLED_BEFORE_DISPATCH',
      terminalDisposition: 'FAIL',
      actualProviderSpendNanoUsd: 0,
      chargedCentiCredits: 0,
      releasedCentiCredits: 900,
      providerAttemptReceiptSha256s: [],
      executionEvidence: executionEvidence('NO_PROVIDER_DISPATCH'),
      customerChargeComputationSha256: null,
      walletSettlementReceiptSha256: A,
      settledAt: '2026-08-23T01:02:00.000Z',
    });
    expect(released.status).toBe('RELEASED');

    expect(() => createProviderNativeProductBudgetSettlementV2R({
      authorization: authorization(), reservation: reservation(),
      mode: 'CANCELLED_BEFORE_DISPATCH', terminalDisposition: 'FAIL',
      actualProviderSpendNanoUsd: 0, chargedCentiCredits: 0, releasedCentiCredits: 900,
      providerAttemptReceiptSha256s: [C],
      executionEvidence: executionEvidence('NO_PROVIDER_DISPATCH'),
      customerChargeComputationSha256: null, walletSettlementReceiptSha256: A,
      settledAt: '2026-08-23T01:02:00.000Z',
    })).toThrow('PRODUCT_BUDGET_CANCELLED_SETTLEMENT_INVALID');
  });

  it('rejects over-cap, imbalanced and unpriced actual settlements', () => {
    const base = {
      authorization: authorization(), reservation: reservation(),
      mode: 'ACTUAL_USAGE' as const, terminalDisposition: 'PASS' as const,
      chargedCentiCredits: 340, releasedCentiCredits: 560,
      providerAttemptReceiptSha256s: [C],
      executionEvidence: executionEvidence('ACTUAL_USAGE_COMPLETE'),
      customerChargeComputationSha256: F, walletSettlementReceiptSha256: A,
      settledAt: '2026-08-23T01:20:00.000Z',
    };
    expect(() => createProviderNativeProductBudgetSettlementV2R({
      ...base, actualProviderSpendNanoUsd: 250_000_001,
    })).toThrow('PRODUCT_BUDGET_ACTUAL_SETTLEMENT_INVALID');
    expect(() => createProviderNativeProductBudgetSettlementV2R({
      ...base, actualProviderSpendNanoUsd: 1, releasedCentiCredits: 559,
    })).toThrow('PRODUCT_BUDGET_SETTLEMENT_BALANCE_INVALID');
    expect(() => createProviderNativeProductBudgetSettlementV2R({
      ...base, actualProviderSpendNanoUsd: 1, customerChargeComputationSha256: null,
    })).toThrow('PRODUCT_BUDGET_ACTUAL_SETTLEMENT_INVALID');
    expect(() => createProviderNativeProductBudgetSettlementV2R({
      ...base,
      actualProviderSpendNanoUsd: 1,
      executionEvidence: executionEvidence('NO_PROVIDER_DISPATCH'),
    })).toThrow('PRODUCT_BUDGET_ACTUAL_SETTLEMENT_INVALID');
  });

  it('resolves the existing runtime-guard port only for the exact unexpired hold', async () => {
    const auth = authorization();
    const held = reservation();
    const runtimeGuard = {} as ProviderNativeRuntimeGuardV2R;
    const locator = { resolve: vi.fn(async () => ({ authorization: auth, reservation: held })) };
    const factory = { create: vi.fn(async () => ({
      guardKind: held.guardKind,
      guardIdentitySha256: held.guardIdentitySha256,
      authorizationSha256: auth.authorizationSha256,
      reservationSha256: held.reservationSha256,
      runtimeGuard,
    })) };
    const owner = createProviderNativeProductBudgetRuntimeGuardOwnerV2R({
      locator, factory, now: () => '2026-08-23T01:05:00.000Z',
    });
    await expect(owner.resolve({
      ...auth.scope,
      guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).resolves.toBe(runtimeGuard);
    expect(locator.resolve).toHaveBeenCalledOnce();
    expect(factory.create).toHaveBeenCalledOnce();

    await expect(owner.resolve({
      ...auth.scope,
      projectId: 'project-copied',
      guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).rejects.toThrow('PRODUCT_BUDGET_GUARD_SCOPE_MISMATCH');
  });

  it('rejects expired reservations and a factory that swaps the guard binding', async () => {
    const auth = authorization();
    const held = reservation();
    const runtimeGuard = {} as ProviderNativeRuntimeGuardV2R;
    const locator = { resolve: vi.fn(async () => ({ authorization: auth, reservation: held })) };
    const expired = createProviderNativeProductBudgetRuntimeGuardOwnerV2R({
      locator,
      factory: { create: vi.fn() },
      now: () => '2026-08-23T03:00:00.000Z',
    });
    await expect(expired.resolve({
      ...auth.scope, guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).rejects.toThrow('PRODUCT_BUDGET_RESERVATION_EXPIRED');

    const swapped = createProviderNativeProductBudgetRuntimeGuardOwnerV2R({
      locator,
      factory: { create: vi.fn(async () => ({
        guardKind: held.guardKind,
        guardIdentitySha256: C,
        authorizationSha256: auth.authorizationSha256,
        reservationSha256: held.reservationSha256,
        runtimeGuard,
      })) },
      now: () => '2026-08-23T01:05:00.000Z',
    });
    await expect(swapped.resolve({
      ...auth.scope, guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).rejects.toThrow('PRODUCT_BUDGET_RUNTIME_GUARD_FACTORY_MISMATCH');
  });
});
