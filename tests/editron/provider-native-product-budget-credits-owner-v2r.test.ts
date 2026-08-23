import { describe, expect, it } from 'vitest';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createProviderNativeProductBudgetAuthorizationV2R,
  type ProviderNativeProductBudgetSettlementRequestV2R,
} from '@/lib/editron/services/provider-native-product-budget-v2r';
import {
  createProviderNativeProductBudgetCreditsOwnerV2R,
  type ProviderNativeProductBudgetCreditLedgerTransactionV2R,
  type ProviderNativeProductBudgetCreditLedgerV2R,
  type ProviderNativeProductBudgetCreditRecordV2R,
} from '@/lib/editron/services/provider-native-product-budget-credits-owner-v2r';

const A = 'a'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);

function authorization() {
  return createProviderNativeProductBudgetAuthorizationV2R({
    scope: {
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1', episodeId: 'episode-1',
    },
    wallet: { type: 'org', clerkOrgId: 'org-1', actorUserId: 'user-1' },
    route: {
      routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra-2026-08-01', reasoningMode: 'medium',
    },
    providerPricing: {
      ownerId: 'ProviderPricingService', ownerVersion: 'pricing-2026-08-23',
      effectiveAt: '2026-08-23T00:00:00.000Z', expiresAt: '2026-08-24T00:00:00.000Z',
      tokenPricing: {
        normalInputNanoUsdPerToken: 500, cachedInputNanoUsdPerToken: 50,
        cacheWriteNanoUsdPerToken: 625, outputNanoUsdPerToken: 2000,
      },
    },
    customerPricing: {
      ownerId: 'ProductPricingService', ownerVersion: 'editron-agent-v1',
      creditPool: 'main', pricingSha256: A,
    },
    limits: {
      maxProviderTurns: 8, maxSelectedOperations: 12, maxCandidatesPerOperation: 5,
      maxInputTokensPerTurn: 90_000, maxCumulativeOutputTokens: 32_000,
      absoluteMaxProviderSpendNanoUsd: 250_000_000,
      absoluteMaxCustomerChargeCentiCredits: 900,
    },
    approval: {
      approvedBy: 'admin', approvedAt: '2026-08-23T01:00:00.000Z',
      expiresAt: '2026-08-23T03:00:00.000Z',
    },
  });
}

function actualRequest(): ProviderNativeProductBudgetSettlementRequestV2R {
  return {
    mode: 'ACTUAL_USAGE', terminalDisposition: 'PASS',
    actualProviderSpendNanoUsd: 90_000_000,
    chargedCentiCredits: 340, releasedCentiCredits: 560,
    providerAttemptReceiptSha256s: [C, D],
    executionEvidence: {
      ownerId: 'DURABLE_WORKFLOW_JOB_STORE',
      ownerVersion: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
      jobId: 'job-1', kind: 'ACTUAL_USAGE_COMPLETE', artifactSha256: E,
    },
    customerChargeComputationSha256: F,
  };
}

function harness(input: Readonly<{
  subscriptionCentiCredits?: number;
  topupCentiCredits?: number;
  subscriptionExpiresAt?: string | null;
}> = {}) {
  const records = new Map<string, Readonly<ProviderNativeProductBudgetCreditRecordV2R>>();
  const wallet = {
    subscriptionCentiCredits: input.subscriptionCentiCredits ?? 500,
    topupCentiCredits: input.topupCentiCredits ?? 500,
    subscriptionExpiresAt: input.subscriptionExpiresAt === undefined
      ? '2026-08-23T04:00:00.000Z' : input.subscriptionExpiresAt,
  };
  let currentTime = '2026-08-23T01:05:00.000Z';
  let reserveWrites = 0;
  let settlementWrites = 0;
  const transaction: ProviderNativeProductBudgetCreditLedgerTransactionV2R = {
    get: async (reservationId) => records.get(reservationId) ?? null,
    readWallet: async (walletRef) => ({ wallet: walletRef, ...wallet }),
    reserveWallet: async (request) => {
      if (wallet.subscriptionCentiCredits < request.subscriptionCentiCredits
        || wallet.topupCentiCredits < request.topupCentiCredits) {
        throw new Error('FAKE_WALLET_CONCURRENT_BALANCE_CONFLICT');
      }
      wallet.subscriptionCentiCredits -= request.subscriptionCentiCredits;
      wallet.topupCentiCredits -= request.topupCentiCredits;
      reserveWrites += 1;
      return {
        walletReservationTransactionId: `txn-${request.reservationId}`,
        walletReservationReceiptSha256: hashEditronCanonicalJsonV1(request),
      };
    },
    insert: async (record) => {
      if (records.has(record.reservationId)) throw new Error('FAKE_LEDGER_DUPLICATE');
      records.set(record.reservationId, record);
    },
    settleWallet: async (request) => {
      wallet.subscriptionCentiCredits += request.returnSubscriptionCentiCredits;
      wallet.topupCentiCredits += request.returnTopupCentiCredits;
      settlementWrites += 1;
      return { walletSettlementReceiptSha256: hashEditronCanonicalJsonV1(request) };
    },
    replaceSettlement: async ({ expectedRecordSha256, record }) => {
      if (records.get(record.reservationId)?.recordSha256 !== expectedRecordSha256) {
        throw new Error('FAKE_LEDGER_CAS_CONFLICT');
      }
      records.set(record.reservationId, record);
    },
  };
  const ledger: ProviderNativeProductBudgetCreditLedgerV2R = {
    transact: async (operation) => operation(transaction),
    getByGuardIdentity: async (guardIdentitySha256) => (
      [...records.values()].find(({ reservation }) => (
        reservation.guardIdentitySha256 === guardIdentitySha256
      )) ?? null
    ),
  };
  const owner = createProviderNativeProductBudgetCreditsOwnerV2R({
    ledger,
    now: () => currentTime,
  });
  return {
    owner, wallet, records,
    setTime: (value: string) => { currentTime = value; },
    reserveWrites: () => reserveWrites,
    settlementWrites: () => settlementWrites,
  };
}

describe('provider-native product-budget CreditsService owner V2R', () => {
  it('reserves subscription first and replays without a second wallet write', async () => {
    const state = harness();
    const held = await state.owner.reserve({ authorization: authorization() });
    expect(state.wallet).toMatchObject({
      subscriptionCentiCredits: 0,
      topupCentiCredits: 100,
    });
    const replay = await state.owner.reserve({ authorization: authorization() });
    expect(replay).toEqual(held);
    expect(state.reserveWrites()).toBe(1);
    expect([...state.records.values()][0]?.reservedSplit).toMatchObject({
      subscriptionCentiCredits: 500,
      topupCentiCredits: 400,
    });
  });

  it('fails before writing when funds or subscription lifetime are insufficient', async () => {
    const insufficient = harness({ subscriptionCentiCredits: 100, topupCentiCredits: 100 });
    await expect(insufficient.owner.reserve({ authorization: authorization() }))
      .rejects.toThrow('CREDIT_RESERVATION_INSUFFICIENT_BALANCE');
    expect(insufficient.reserveWrites()).toBe(0);

    const expiry = harness({ subscriptionExpiresAt: '2026-08-23T02:00:00.000Z' });
    await expect(expiry.owner.reserve({ authorization: authorization() }))
      .rejects.toThrow('CREDIT_RESERVATION_SUBSCRIPTION_EXPIRY_CONFLICT');
    expect(expiry.reserveWrites()).toBe(0);
  });

  it('settles actual usage and releases unused top-up before subscription', async () => {
    const state = harness();
    const held = await state.owner.reserve({ authorization: authorization() });
    state.setTime('2026-08-23T01:20:00.000Z');
    const settled = await state.owner.settle({
      authorization: authorization(), reservation: held, requested: actualRequest(),
    });
    expect(settled.status).toBe('SETTLED');
    expect(state.wallet).toMatchObject({
      subscriptionCentiCredits: 160,
      topupCentiCredits: 500,
    });
    const replay = await state.owner.settle({
      authorization: authorization(), reservation: held, requested: actualRequest(),
    });
    expect(replay).toEqual(settled);
    expect(state.settlementWrites()).toBe(1);
  });

  it('releases all only for proven pre-dispatch cancellation', async () => {
    const state = harness();
    const held = await state.owner.reserve({ authorization: authorization() });
    const released = await state.owner.settle({
      authorization: authorization(), reservation: held,
      requested: {
        mode: 'CANCELLED_BEFORE_DISPATCH', terminalDisposition: 'FAIL',
        actualProviderSpendNanoUsd: 0, chargedCentiCredits: 0, releasedCentiCredits: 900,
        providerAttemptReceiptSha256s: [],
        executionEvidence: {
          ownerId: 'DURABLE_WORKFLOW_JOB_STORE',
          ownerVersion: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
          jobId: 'job-1', kind: 'NO_PROVIDER_DISPATCH', artifactSha256: E,
        },
        customerChargeComputationSha256: null,
      },
    });
    expect(released.status).toBe('RELEASED');
    expect(state.wallet).toMatchObject({
      subscriptionCentiCredits: 500,
      topupCentiCredits: 500,
    });
  });

  it('keeps the full hold for an unknown provider result', async () => {
    const state = harness();
    const held = await state.owner.reserve({ authorization: authorization() });
    await state.owner.settle({
      authorization: authorization(), reservation: held,
      requested: {
        mode: 'CONSERVATIVE_MAX',
        terminalDisposition: 'RESOURCE_ACCOUNTING_UNVERIFIABLE',
        actualProviderSpendNanoUsd: null, chargedCentiCredits: 900, releasedCentiCredits: 0,
        providerAttemptReceiptSha256s: [],
        executionEvidence: {
          ownerId: 'DURABLE_WORKFLOW_JOB_STORE',
          ownerVersion: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
          jobId: 'job-1', kind: 'UNKNOWN_PROVIDER_RESULT', artifactSha256: E,
        },
        customerChargeComputationSha256: null,
      },
    });
    expect(state.wallet).toMatchObject({
      subscriptionCentiCredits: 0,
      topupCentiCredits: 100,
    });
  });

  it('rejects expired subscription release and conflicting settlement replay', async () => {
    const state = harness();
    const held = await state.owner.reserve({ authorization: authorization() });
    state.setTime('2026-08-23T04:00:00.000Z');
    await expect(state.owner.settle({
      authorization: authorization(), reservation: held, requested: actualRequest(),
    })).rejects.toThrow('CREDIT_RESERVATION_SUBSCRIPTION_RELEASE_EXPIRED');
    expect(state.settlementWrites()).toBe(0);

    state.setTime('2026-08-23T01:20:00.000Z');
    await state.owner.settle({
      authorization: authorization(), reservation: held, requested: actualRequest(),
    });
    await expect(state.owner.settle({
      authorization: authorization(), reservation: held,
      requested: { ...actualRequest(), terminalDisposition: 'FAIL' },
    })).rejects.toThrow('CREDIT_RESERVATION_SETTLEMENT_CONFLICT');
  });

  it('locates only the exact still-reserved guard identity', async () => {
    const state = harness();
    const held = await state.owner.reserve({ authorization: authorization() });
    await expect(state.owner.resolve({
      scope: authorization().scope,
      guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).resolves.toEqual({ authorization: authorization(), reservation: held });
    await expect(state.owner.resolve({
      scope: { ...authorization().scope, projectId: 'project-forged' },
      guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).rejects.toThrow('CREDIT_RESERVATION_GUARD_MISMATCH');
  });
});
