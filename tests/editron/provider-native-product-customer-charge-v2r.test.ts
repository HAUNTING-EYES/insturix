import { describe, expect, it, vi } from 'vitest';

import {
  createProviderNativeProductBudgetAuthorizationV2R,
  createProviderNativeProductBudgetReservationV2R,
} from '@/lib/editron/services/provider-native-product-budget-v2r';
import {
  createProviderNativeProductCustomerChargeOwnerV2R,
  createProviderNativeProductCustomerPricingPolicyV2R,
} from '@/lib/editron/services/provider-native-product-customer-pricing-v2r';
import {
  createProviderNativeProductCustomerPricingMongoLocatorV2R,
} from '@/lib/editron/services/provider-native-product-customer-pricing-mongo-v2r';

const HASH = 'a'.repeat(64);
const ATTEMPT = 'b'.repeat(64);

describe('provider-native product customer charge V2R', () => {
  it('uses the exact Finance policy and ceil-rounds once per episode', async () => {
    const fixture = budgetFixture();
    const resolve = vi.fn(async () => fixture.policy);
    const owner = createProviderNativeProductCustomerChargeOwnerV2R({
      policyLocator: { resolve },
    });

    const receipt = await owner.compute({
      authorization: fixture.authorization,
      reservation: fixture.reservation,
      actualProviderSpendNanoUsd: 1_000_001,
      providerAttemptReceiptSha256s: [ATTEMPT],
    });

    expect(resolve).toHaveBeenCalledWith({
      ownerId: fixture.policy.ownerId,
      ownerVersion: fixture.policy.ownerVersion,
      pricingSha256: fixture.policy.pricingSha256,
    });
    expect(receipt).toMatchObject({
      authority: 'PRODUCT_CUSTOMER_PRICING_NO_WALLET_OR_PROJECT_MUTATION',
      actualProviderSpendNanoUsd: 1_000_001,
      chargedCentiCredits: 4,
      pricingSha256: fixture.policy.pricingSha256,
    });
  });

  it('rejects copied policy identity and authorization-window drift', async () => {
    const fixture = budgetFixture();
    const copied = {
      ...fixture.policy,
      ownerVersion: 'finance-v2',
    };
    const copiedOwner = createProviderNativeProductCustomerChargeOwnerV2R({
      policyLocator: { resolve: vi.fn(async () => copied as never) },
    });
    await expect(copiedOwner.compute(request(fixture))).rejects.toThrow(
      'PRODUCT_CUSTOMER_PRICING_POLICY_INVALID',
    );

    const shortPolicy = createProviderNativeProductCustomerPricingPolicyV2R({
      ownerId: 'FINANCE_SERVICE', ownerVersion: 'finance-v1',
      effectiveAt: '2026-08-23T00:00:00.000Z',
      expiresAt: '2026-08-23T12:30:00.000Z',
      centiCreditsNumerator: 3_000,
      providerSpendNanoUsdDenominator: 1_000_000_000,
    });
    const rebound = budgetFixture(shortPolicy);
    const shortOwner = createProviderNativeProductCustomerChargeOwnerV2R({
      policyLocator: { resolve: vi.fn(async () => shortPolicy) },
    });
    await expect(shortOwner.compute(request(rebound))).rejects.toThrow(
      'PRODUCT_CUSTOMER_PRICING_AUTHORIZATION_WINDOW_MISMATCH',
    );
  });

  it('fails instead of clamping a charge above the reserved authorization', async () => {
    const policy = createProviderNativeProductCustomerPricingPolicyV2R({
      ownerId: 'FINANCE_SERVICE', ownerVersion: 'finance-v1',
      effectiveAt: '2026-08-23T00:00:00.000Z',
      expiresAt: '2026-08-24T00:00:00.000Z',
      centiCreditsNumerator: 1_000_000,
      providerSpendNanoUsdDenominator: 1,
    });
    const fixture = budgetFixture(policy);
    const owner = createProviderNativeProductCustomerChargeOwnerV2R({
      policyLocator: { resolve: vi.fn(async () => policy) },
    });
    await expect(owner.compute(request(fixture))).rejects.toThrow(
      'PRODUCT_CUSTOMER_CHARGE_EXCEEDS_RESERVATION',
    );
  });

  it('rejects provider spend above the exact reservation', async () => {
    const fixture = budgetFixture();
    const owner = createProviderNativeProductCustomerChargeOwnerV2R({
      policyLocator: { resolve: vi.fn(async () => fixture.policy) },
    });
    await expect(owner.compute({
      ...request(fixture),
      actualProviderSpendNanoUsd:
        fixture.reservation.reservedProviderSpendNanoUsd + 1,
    })).rejects.toThrow(
      'PRODUCT_CUSTOMER_CHARGE_PROVIDER_SPEND_EXCEEDS_RESERVATION',
    );
  });

  it('loads one exact immutable policy from the Mongo adapter', async () => {
    const { policy } = budgetFixture();
    const createIndex = vi.fn(async () => 'created');
    const findOne = vi.fn(async () => ({ _id: 'mongo-id', ...policy }));
    const locator = createProviderNativeProductCustomerPricingMongoLocatorV2R({
      loadCollection: vi.fn(async () => ({ createIndex, findOne })),
    });

    await expect(locator.resolve({
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      pricingSha256: policy.pricingSha256,
    })).resolves.toEqual(policy);
    expect(createIndex).toHaveBeenCalledWith(
      { ownerId: 1, ownerVersion: 1, pricingSha256: 1 },
      { name: 'uniq_product_customer_pricing_identity_v2r', unique: true },
    );
    expect(findOne).toHaveBeenCalledWith({
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      pricingSha256: policy.pricingSha256,
    });
  });

  it('fails closed when the exact Finance policy is absent', async () => {
    const { policy } = budgetFixture();
    const locator = createProviderNativeProductCustomerPricingMongoLocatorV2R({
      loadCollection: vi.fn(async () => ({
        createIndex: vi.fn(async () => 'created'),
        findOne: vi.fn(async () => null),
      })),
    });
    await expect(locator.resolve({
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      pricingSha256: policy.pricingSha256,
    })).rejects.toThrow('PRODUCT_CUSTOMER_PRICING_POLICY_NOT_FOUND');
  });
});

function budgetFixture(
  policy = createProviderNativeProductCustomerPricingPolicyV2R({
    ownerId: 'FINANCE_SERVICE', ownerVersion: 'finance-v1',
    effectiveAt: '2026-08-23T00:00:00.000Z',
    expiresAt: '2026-08-24T00:00:00.000Z',
    centiCreditsNumerator: 3_000,
    providerSpendNanoUsdDenominator: 1_000_000_000,
  }),
) {
  const authorization = createProviderNativeProductBudgetAuthorizationV2R({
    scope: {
      tenantId: 'tenant-a', userId: 'user-a',
      projectId: 'project-a', episodeId: 'episode-a',
    },
    wallet: { type: 'user', clerkUserId: 'user-a' },
    route: {
      routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
    },
    providerPricing: {
      ownerId: 'PROVIDER_PRICING', ownerVersion: 'pricing-v1',
      effectiveAt: '2026-08-23T00:00:00.000Z',
      expiresAt: '2026-08-24T00:00:00.000Z',
      tokenPricing: {
        normalInputNanoUsdPerToken: 1,
        cachedInputNanoUsdPerToken: 1,
        cacheWriteNanoUsdPerToken: 1,
        outputNanoUsdPerToken: 1,
      },
    },
    customerPricing: {
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      creditPool: 'main',
      pricingSha256: policy.pricingSha256,
    },
    limits: {
      maxProviderTurns: 4, maxSelectedOperations: 2,
      maxCandidatesPerOperation: 2, maxInputTokensPerTurn: 4_000,
      maxCumulativeOutputTokens: 4_000,
      absoluteMaxProviderSpendNanoUsd: 10_000_000,
      absoluteMaxCustomerChargeCentiCredits: 100,
    },
    approval: {
      approvedBy: 'finance-admin',
      approvedAt: '2026-08-23T12:00:00.000Z',
      expiresAt: '2026-08-23T13:00:00.000Z',
    },
  });
  const reservation = createProviderNativeProductBudgetReservationV2R({
    authorization, reservationId: 'reservation-a',
    walletReservationTransactionId: 'wallet-tx-a',
    walletReservationReceiptSha256: HASH,
    reservedAt: '2026-08-23T12:05:00.000Z',
  });
  return { policy, authorization, reservation };
}

function request(fixture: ReturnType<typeof budgetFixture>) {
  return {
    authorization: fixture.authorization,
    reservation: fixture.reservation,
    actualProviderSpendNanoUsd: 1_000_001,
    providerAttemptReceiptSha256s: [ATTEMPT],
  };
}
