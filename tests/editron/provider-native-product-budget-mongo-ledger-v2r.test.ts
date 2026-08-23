import { describe, expect, it, vi } from 'vitest';

vi.mock('@/schemas/ConnectToDatabase', () => ({ default: vi.fn() }));

import { CreditsService } from '@/lib/services/creditsService';
import { createProviderNativeProductBudgetAuthorizationV2R } from '@/lib/editron/services/provider-native-product-budget-v2r';
import type { WalletRef } from '@/lib/editron/services/project-ownership';
import type {
  ProviderNativeProductBudgetMongoCollectionV2R,
  ProviderNativeProductBudgetMongoRuntimeV2R,
  ProviderNativeProductBudgetMongoSessionV2R,
} from '@/lib/services/provider-native-product-budget-mongo-ledger-v2r';

const A = 'a'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);

function authorization(wallet: WalletRef) {
  return createProviderNativeProductBudgetAuthorizationV2R({
    scope: {
      tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1', episodeId: 'episode-1',
    },
    wallet,
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

function actualRequest() {
  return {
    mode: 'ACTUAL_USAGE' as const,
    terminalDisposition: 'PASS' as const,
    actualProviderSpendNanoUsd: 90_000_000,
    chargedCentiCredits: 340,
    releasedCentiCredits: 560,
    providerAttemptReceiptSha256s: [C, D],
    executionEvidence: {
      ownerId: 'DURABLE_WORKFLOW_JOB_STORE' as const,
      ownerVersion: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1' as const,
      jobId: 'job-1', kind: 'ACTUAL_USAGE_COMPLETE' as const, artifactSha256: E,
    },
    customerChargeComputationSha256: F,
  };
}

type RecordValue = Record<string, unknown>;

function harness(input: Readonly<{
  userSubscription?: number;
  userTopup?: number;
  failReservationInsert?: boolean;
}> = {}) {
  const state = {
    users: new Map<string, RecordValue>([['user-1', walletDocument(
      'clerkUserId', 'user-1', input.userSubscription ?? 5, input.userTopup ?? 5,
    )]]),
    organizations: new Map<string, RecordValue>([['org-1', walletDocument(
      'clerkOrgId', 'org-1', 5, 5,
    )]]),
    reservations: new Map<string, RecordValue>(),
    orgAudits: [] as RecordValue[],
    indexes: [] as Array<Readonly<{ keys: RecordValue; options: RecordValue }>>,
    sessions: [] as unknown[],
    transactionOptions: [] as RecordValue[],
    failReservationInsert: input.failReservationInsert ?? false,
  };

  const users = walletCollection(state.users, state);
  const organizations = walletCollection(state.organizations, state);
  const reservations = reservationCollection(state);
  const orgCreditTransactions = orgAuditCollection(state);
  const runtime: ProviderNativeProductBudgetMongoRuntimeV2R = {
    users,
    organizations,
    reservations,
    orgCreditTransactions,
    startSession: async () => fakeSession(state),
  };
  let now = '2026-08-23T01:05:00.000Z';
  const owner = CreditsService.createProviderNativeProductBudgetOwnerV2R({
    loadRuntime: async () => runtime,
    now: () => now,
  });
  return { state, owner, setNow: (value: string) => { now = value; } };
}

describe('CreditsService product-budget Mongo ledger V2R', () => {
  it('atomically reserves, replays, settles and indexes a user wallet record', async () => {
    const test = harness();
    const auth = authorization({ type: 'user', clerkUserId: 'user-1' });
    const held = await test.owner.reserve({ authorization: auth });
    expect(balance(test.state.users.get('user-1'))).toMatchObject({
      subscriptionCredits: 0,
      topupCredits: 1,
    });
    expect(history(test.state.users.get('user-1'))).toHaveLength(1);
    expect(test.state.reservations.get(held.reservationId)?.status).toBe('RESERVED');
    expect(test.state.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        keys: { guardIdentitySha256: 1 },
        options: { name: 'uniq_product_budget_guard_v2r', unique: true },
      }),
    ]));
    expect(test.state.transactionOptions[0]).toEqual({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });

    await expect(test.owner.resolve({
      scope: auth.scope,
      guardKind: held.guardKind,
      expectedGuardIdentitySha256: held.guardIdentitySha256,
    })).resolves.toEqual({ authorization: auth, reservation: held });
    await test.owner.reserve({ authorization: auth });
    expect(history(test.state.users.get('user-1'))).toHaveLength(1);

    test.setNow('2026-08-23T01:20:00.000Z');
    const settled = await test.owner.settle({
      authorization: auth,
      reservation: held,
      requested: actualRequest(),
    });
    expect(settled.status).toBe('SETTLED');
    expect(balance(test.state.users.get('user-1'))).toMatchObject({
      subscriptionCredits: 1.6,
      topupCredits: 5,
    });
    expect(history(test.state.users.get('user-1'))).toHaveLength(2);
    expect(test.state.reservations.get(held.reservationId)?.status).toBe('SETTLED');
    expect(test.state.orgAudits).toHaveLength(0);
    expect(test.state.sessions.every((value) => value === 'session-v2r')).toBe(true);
  });

  it('moves the org wallet and its reporting rows inside the same transaction', async () => {
    const test = harness();
    const auth = authorization({ type: 'org', clerkOrgId: 'org-1', actorUserId: 'user-1' });
    const held = await test.owner.reserve({ authorization: auth });
    expect(balance(test.state.organizations.get('org-1'))).toMatchObject({
      subscriptionCredits: 0,
      topupCredits: 1,
    });
    expect(test.state.orgAudits.map(({ type }) => type)).toEqual(['deduct']);

    test.setNow('2026-08-23T01:10:00.000Z');
    await test.owner.settle({
      authorization: auth,
      reservation: held,
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
    expect(balance(test.state.organizations.get('org-1'))).toMatchObject({
      subscriptionCredits: 5,
      topupCredits: 5,
    });
    expect(test.state.orgAudits.map(({ type }) => type)).toEqual(['deduct', 'refund']);
    expect(test.state.orgAudits.every(({ clerkOrgId, actorUserId }) => (
      clerkOrgId === 'org-1' && actorUserId === 'user-1'
    ))).toBe(true);
  });

  it('rolls back the wallet when the permanent reservation insert fails', async () => {
    const test = harness({ failReservationInsert: true });
    const auth = authorization({ type: 'user', clerkUserId: 'user-1' });
    await expect(test.owner.reserve({ authorization: auth }))
      .rejects.toThrow('FAKE_RESERVATION_INSERT_FAILURE');
    expect(balance(test.state.users.get('user-1'))).toMatchObject({
      subscriptionCredits: 5,
      topupCredits: 5,
    });
    expect(history(test.state.users.get('user-1'))).toHaveLength(0);
    expect(test.state.reservations.size).toBe(0);
    test.state.failReservationInsert = false;
    await test.owner.reserve({ authorization: auth });
    expect(balance(test.state.users.get('user-1'))).toMatchObject({
      subscriptionCredits: 0,
      topupCredits: 1,
    });
  });

  it('fails closed on unsupported wallet precision before any write', async () => {
    const test = harness({ userSubscription: 5.005 });
    const auth = authorization({ type: 'user', clerkUserId: 'user-1' });
    await expect(test.owner.reserve({ authorization: auth }))
      .rejects.toThrow('PRODUCT_BUDGET_MONGO_SUBSCRIPTION_BALANCE_PRECISION_UNSUPPORTED');
    expect(balance(test.state.users.get('user-1'))?.subscriptionCredits).toBe(5.005);
    expect(test.state.reservations.size).toBe(0);
  });
});

function walletDocument(
  identityKey: 'clerkUserId' | 'clerkOrgId',
  identity: string,
  subscriptionCredits: number,
  topupCredits: number,
) {
  return {
    [identityKey]: identity,
    creditsBalance: {
      subscriptionCredits,
      topupCredits,
      subscriptionCreditsExpiry: new Date('2026-08-23T04:00:00.000Z'),
      creditHistory: [] as RecordValue[],
    },
  };
}

function fakeSession(state: ReturnType<typeof stateShape>): ProviderNativeProductBudgetMongoSessionV2R {
  const driverSession = 'session-v2r';
  return {
    driverSession,
    withTransaction: async (operation, options) => {
      state.transactionOptions.push(structuredClone(options) as RecordValue);
      const before = snapshotState(state);
      try {
        return await operation();
      } catch (error) {
        restoreState(state, before);
        throw error;
      }
    },
    endSession: async () => undefined,
  };
}

function stateShape() {
  return {
    users: new Map<string, RecordValue>(),
    organizations: new Map<string, RecordValue>(),
    reservations: new Map<string, RecordValue>(),
    orgAudits: [] as RecordValue[],
    indexes: [] as Array<Readonly<{ keys: RecordValue; options: RecordValue }>>,
    sessions: [] as unknown[],
    transactionOptions: [] as RecordValue[],
    failReservationInsert: false,
  };
}

type FakeState = ReturnType<typeof stateShape>;

function reservationCollection(state: FakeState): ProviderNativeProductBudgetMongoCollectionV2R {
  return {
    createIndex: async (keys, options) => {
      state.indexes.push({ keys: structuredClone(keys), options: structuredClone(options) });
      return options.name;
    },
    findOne: async (filter, options) => {
      recordSession(state, options?.session);
      const result = filter._id
        ? state.reservations.get(String(filter._id))
        : [...state.reservations.values()].find((record) => (
            record.guardIdentitySha256 === filter.guardIdentitySha256
          ));
      return result ? structuredClone(result) : null;
    },
    findOneAndUpdate: async () => null,
    insertOne: async (document, options) => {
      recordSession(state, options.session);
      if (state.failReservationInsert) throw new Error('FAKE_RESERVATION_INSERT_FAILURE');
      const id = String(document._id);
      if (state.reservations.has(id)) throw new Error('FAKE_RESERVATION_DUPLICATE');
      state.reservations.set(id, structuredClone(document));
      return { acknowledged: true };
    },
    replaceOne: async (filter, replacement, options) => {
      recordSession(state, options.session);
      const id = String(filter._id);
      const current = state.reservations.get(id);
      if (!current || current.recordSha256 !== filter.recordSha256) return { matchedCount: 0 };
      state.reservations.set(id, structuredClone(replacement));
      return { matchedCount: 1 };
    },
  };
}

function walletCollection(
  documents: Map<string, RecordValue>,
  state: FakeState,
): ProviderNativeProductBudgetMongoCollectionV2R {
  return {
    createIndex: async (_keys, options) => options.name,
    findOne: async (filter, options) => {
      recordSession(state, options?.session);
      const document = documents.get(walletIdentity(filter));
      return document ? structuredClone(document) : null;
    },
    findOneAndUpdate: async (filter, update, options) => {
      recordSession(state, options.session);
      const key = walletIdentity(filter);
      const document = documents.get(key);
      if (!document || !matchesWalletFilter(document, filter)) return null;
      applyWalletUpdate(document, update);
      documents.set(key, document);
      return structuredClone(document);
    },
    insertOne: async () => ({ acknowledged: true }),
    replaceOne: async () => ({ matchedCount: 0 }),
  };
}

function orgAuditCollection(state: FakeState): ProviderNativeProductBudgetMongoCollectionV2R {
  return {
    createIndex: async (_keys, options) => options.name,
    findOne: async () => null,
    findOneAndUpdate: async () => null,
    insertOne: async (document, options) => {
      recordSession(state, options.session);
      state.orgAudits.push(structuredClone(document));
      return { acknowledged: true };
    },
    replaceOne: async () => ({ matchedCount: 0 }),
  };
}

function matchesWalletFilter(document: RecordValue, filter: Readonly<RecordValue>) {
  const credits = balance(document);
  if (!credits) return false;
  for (const path of ['creditsBalance.subscriptionCredits', 'creditsBalance.topupCredits']) {
    const condition = filter[path] as { $gte?: number } | undefined;
    if (condition?.$gte !== undefined && Number(getPath(document, path)) < condition.$gte) return false;
  }
  const expiry = filter['creditsBalance.subscriptionCreditsExpiry'] as {
    $gte?: Date; $gt?: Date;
  } | undefined;
  const currentExpiry = new Date(String(credits.subscriptionCreditsExpiry)).getTime();
  if (expiry?.$gte && currentExpiry < expiry.$gte.getTime()) return false;
  if (expiry?.$gt && currentExpiry <= expiry.$gt.getTime()) return false;
  const historyCondition = filter['creditsBalance.creditHistory'] as {
    $not?: { $elemMatch?: RecordValue };
  } | undefined;
  const duplicate = historyCondition?.$not?.$elemMatch
    ? history(document).some(({ metadata }) => {
        const expected = historyCondition.$not?.$elemMatch as RecordValue;
        const actual = (metadata ?? {}) as RecordValue;
        return actual.productBudgetReservationId === expected['metadata.productBudgetReservationId']
          && actual.productBudgetPhase === expected['metadata.productBudgetPhase'];
      })
    : false;
  return !duplicate;
}

function applyWalletUpdate(document: RecordValue, update: Readonly<RecordValue>) {
  const increments = update.$inc as Record<string, number>;
  for (const [path, amount] of Object.entries(increments)) {
    setPath(document, path, Number(getPath(document, path) ?? 0) + amount);
  }
  const push = update.$push as Record<string, { $each: RecordValue[]; $slice: number }>;
  const historyUpdate = push['creditsBalance.creditHistory'];
  const next = [...history(document), ...structuredClone(historyUpdate.$each)]
    .slice(historyUpdate.$slice);
  setPath(document, 'creditsBalance.creditHistory', next);
}

function snapshotState(state: FakeState) {
  return {
    users: cloneMap(state.users),
    organizations: cloneMap(state.organizations),
    reservations: cloneMap(state.reservations),
    orgAudits: structuredClone(state.orgAudits),
  };
}

function restoreState(state: FakeState, snapshot: ReturnType<typeof snapshotState>) {
  restoreMap(state.users, snapshot.users);
  restoreMap(state.organizations, snapshot.organizations);
  restoreMap(state.reservations, snapshot.reservations);
  state.orgAudits.splice(0, state.orgAudits.length, ...snapshot.orgAudits);
}

function cloneMap(source: Map<string, RecordValue>) {
  return new Map([...source].map(([key, value]) => [key, structuredClone(value)]));
}

function restoreMap(
  target: Map<string, RecordValue>,
  snapshot: Map<string, RecordValue>,
) {
  target.clear();
  for (const [key, value] of snapshot) target.set(key, structuredClone(value));
}

function recordSession(state: FakeState, session: unknown) {
  if (session !== undefined) {
    if (session !== 'session-v2r') throw new Error('FAKE_WRONG_SESSION');
    state.sessions.push(session);
  }
}

function walletIdentity(filter: Readonly<RecordValue>) {
  return String(filter.clerkUserId ?? filter.clerkOrgId);
}

function balance(document: RecordValue | undefined) {
  return document?.creditsBalance as RecordValue | undefined;
}

function history(document: RecordValue | undefined) {
  return (balance(document)?.creditHistory ?? []) as RecordValue[];
}

function getPath(document: RecordValue, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as RecordValue)[key] : undefined
  ), document);
}

function setPath(document: RecordValue, path: string, value: unknown) {
  const parts = path.split('.');
  let target = document;
  for (const part of parts.slice(0, -1)) {
    target = target[part] as RecordValue;
  }
  target[parts.at(-1) as string] = value;
}
