import { describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  createProviderNativeProductBudgetAuthorizationV2R,
  createProviderNativeProductBudgetReservationV2R,
} from '@/lib/editron/services/provider-native-product-budget-v2r';
import {
  createProviderNativeProductInputTokenCountReceiptV2R,
  createProviderNativeProductRuntimeGuardFactoryV2R,
} from '@/lib/editron/services/provider-native-product-runtime-guard-v2r';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

describe('provider-native product runtime guard V2R', () => {
  it('constructs the shared guard from the exact reservation and request receipt', async () => {
    const { authorization, reservation } = budget();
    const counter = { count: vi.fn(async ({ routeSha256, request }) => (
      createProviderNativeProductInputTokenCountReceiptV2R({
        ownerId: 'ProviderTokenCountService',
        ownerVersion: 'provider-token-count-v1',
        routeSha256,
        requestHash: request.requestHash,
        inputTokensUpperBound: 1_200,
        method: 'TEST_EXACT_REQUEST_COUNTER',
        counterEvidenceSha256: C,
      })
    )) };
    const factory = createProviderNativeProductRuntimeGuardFactoryV2R({
      tokenCounter: counter,
    });
    const created = await factory.create({ authorization, reservation });
    const request = providerRequest();
    const decision = await created.runtimeGuard.beforeInvoke({
      turn: 1,
      request,
      maxOutputTokens: 512,
    });

    expect(created).toMatchObject({
      guardKind: reservation.guardKind,
      guardIdentitySha256: reservation.guardIdentitySha256,
      authorizationSha256: authorization.authorizationSha256,
      reservationSha256: reservation.reservationSha256,
    });
    expect(decision).toMatchObject({
      status: 'ALLOW',
      audit: {
        phase: 'BEFORE_INVOKE',
        requestHash: request.requestHash,
        inputTokensUpperBound: 1_200,
      },
    });
    expect(counter.count).toHaveBeenCalledWith({
      route: authorization.route,
      routeSha256: authorization.routeSha256,
      request,
    });
  });

  it('turns a token-counter failure into a fail-closed accounting decision', async () => {
    const { authorization, reservation } = budget();
    const factory = createProviderNativeProductRuntimeGuardFactoryV2R({
      tokenCounter: {
        count: vi.fn(async () => { throw new Error('COUNTER_OFFLINE'); }),
      },
    });
    const created = await factory.create({ authorization, reservation });

    await expect(created.runtimeGuard.beforeInvoke({
      turn: 1,
      request: providerRequest(),
      maxOutputTokens: 512,
    })).resolves.toMatchObject({
      status: 'DENY',
      disposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
      reasonCode: 'INPUT_TOKEN_COUNTER_FAILED',
    });
  });

  it('rejects route drift and a copied count receipt before budget reservation', async () => {
    const { authorization, reservation } = budget();
    const copiedReceiptCounter = { count: vi.fn(async ({ request }) => (
      createProviderNativeProductInputTokenCountReceiptV2R({
        ownerId: 'ProviderTokenCountService',
        ownerVersion: 'provider-token-count-v1',
        routeSha256: B,
        requestHash: request.requestHash,
        inputTokensUpperBound: 100,
        method: 'TEST_COPIED_COUNTER',
        counterEvidenceSha256: C,
      })
    )) };
    const copiedFactory = createProviderNativeProductRuntimeGuardFactoryV2R({
      tokenCounter: copiedReceiptCounter,
    });
    const copied = await copiedFactory.create({ authorization, reservation });
    await expect(copied.runtimeGuard.beforeInvoke({
      turn: 1,
      request: providerRequest(),
      maxOutputTokens: 512,
    })).resolves.toMatchObject({
      status: 'DENY',
      reasonCode: 'INPUT_TOKEN_COUNTER_FAILED',
    });

    const driftCounter = { count: vi.fn() };
    const driftFactory = createProviderNativeProductRuntimeGuardFactoryV2R({
      tokenCounter: driftCounter,
    });
    const drifted = await driftFactory.create({ authorization, reservation });
    const request = providerRequest({ model: 'gpt-5.6-luna' });
    await expect(drifted.runtimeGuard.beforeInvoke({
      turn: 1,
      request,
      maxOutputTokens: 512,
    })).resolves.toMatchObject({
      status: 'DENY',
      reasonCode: 'INPUT_TOKEN_COUNTER_FAILED',
    });
    expect(driftCounter.count).not.toHaveBeenCalled();
  });

  it('rejects forged reservation material before constructing a guard', async () => {
    const { authorization, reservation } = budget();
    const forged = structuredClone(reservation) as Record<string, unknown>;
    forged.guardIdentitySha256 = C;
    const factory = createProviderNativeProductRuntimeGuardFactoryV2R({
      tokenCounter: { count: vi.fn() },
    });

    await expect(factory.create({
      authorization,
      reservation: forged as unknown as typeof reservation,
    })).rejects.toThrow('PRODUCT_BUDGET_RESERVATION_INVALID');
  });
});

function budget() {
  const authorization = createProviderNativeProductBudgetAuthorizationV2R({
    scope: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
    },
    wallet: { type: 'user', clerkUserId: 'user-1' },
    route: {
      routeId: 'OPENAI_TERRA',
      provider: 'openai',
      model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra',
      reasoningMode: 'medium',
    },
    providerPricing: {
      ownerId: 'ProviderPricingService',
      ownerVersion: 'pricing-v1',
      effectiveAt: '2026-08-23T00:00:00.000Z',
      expiresAt: '2026-08-24T00:00:00.000Z',
      tokenPricing: {
        normalInputNanoUsdPerToken: 500,
        cachedInputNanoUsdPerToken: 50,
        cacheWriteNanoUsdPerToken: 625,
        outputNanoUsdPerToken: 2_000,
      },
    },
    customerPricing: {
      ownerId: 'ProductPricingService',
      ownerVersion: 'editron-agent-v1',
      creditPool: 'main',
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
  const reservation = createProviderNativeProductBudgetReservationV2R({
    authorization,
    reservationId: 'reservation-1',
    walletReservationTransactionId: 'txn-reservation-1',
    walletReservationReceiptSha256: B,
    reservedAt: '2026-08-23T01:01:00.000Z',
  });
  return { authorization, reservation };
}

function providerRequest(
  override: Readonly<Record<string, unknown>> = {},
): Readonly<SerializedProviderNativeTurnV2R> {
  const endpoint = 'https://api.openai.com/v1/responses';
  const body = {
    model: 'gpt-5.6-terra',
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'Plan edit.' }] }],
    tools: [],
    max_output_tokens: 512,
    ...override,
  };
  return Object.freeze({
    provider: 'openai',
    endpoint,
    authMode: 'BEARER',
    body: Object.freeze(body),
    requestHash: hashCanonicalJsonV1({ endpoint, body }),
  });
}
