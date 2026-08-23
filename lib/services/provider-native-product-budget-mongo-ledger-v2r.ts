import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  OptionalUnlessRequiredId,
  UpdateFilter,
} from 'mongodb';
import type { WalletRef } from '@/lib/editron/services/project-ownership';
import {
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import type {
  ProviderNativeProductBudgetCreditLedgerTransactionV2R,
  ProviderNativeProductBudgetCreditLedgerV2R,
  ProviderNativeProductBudgetCreditRecordV2R,
  ProviderNativeProductBudgetWalletSnapshotV2R,
} from '@/lib/editron/services/provider-native-product-budget-credits-owner-v2r';

export const PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_COLLECTION_V2R =
  'editron_product_budget_credit_reservations_v2r' as const;

type MongoRecord = Record<string, unknown>;

export interface ProviderNativeProductBudgetMongoSessionV2R {
  driverSession: unknown;
  withTransaction<T>(
    operation: () => Promise<T>,
    options: Readonly<{
      readConcern: Readonly<{ level: 'snapshot' }>;
      writeConcern: Readonly<{ w: 'majority' }>;
      readPreference: 'primary';
    }>,
  ): Promise<T | undefined>;
  endSession(): Promise<void>;
}

export interface ProviderNativeProductBudgetMongoCollectionV2R {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options?: Readonly<{ session?: unknown; projection?: Readonly<MongoRecord> }>,
  ): Promise<MongoRecord | null>;
  findOneAndUpdate(
    filter: Readonly<MongoRecord>,
    update: Readonly<MongoRecord>,
    options: Readonly<{
      session: unknown;
      returnDocument: 'after';
      projection?: Readonly<MongoRecord>;
    }>,
  ): Promise<MongoRecord | null>;
  insertOne(
    document: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ acknowledged: boolean }>>;
  replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ matchedCount: number }>>;
}

export interface ProviderNativeProductBudgetMongoRuntimeV2R {
  startSession(): Promise<ProviderNativeProductBudgetMongoSessionV2R>;
  reservations: ProviderNativeProductBudgetMongoCollectionV2R;
  users: ProviderNativeProductBudgetMongoCollectionV2R;
  organizations: ProviderNativeProductBudgetMongoCollectionV2R;
  orgCreditTransactions: ProviderNativeProductBudgetMongoCollectionV2R;
}

/**
 * CreditsService's persistence implementation. It is deliberately a ledger
 * adapter, not a second billing owner: CreditsService is the sole production
 * composition entry point and supplies the existing embedded-history cap.
 */
export function createCreditsServiceProductBudgetMongoLedgerV2R(input: Readonly<{
  historyCap: number;
  loadRuntime?: () => Promise<Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>>;
}>): Readonly<ProviderNativeProductBudgetCreditLedgerV2R> {
  const historyCap = positiveInteger(input.historyCap, 'HISTORY_CAP');
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>> | null = null;
  let indexPromise: Promise<void> | null = null;

  const runtime = () => {
    runtimePromise ??= loadRuntime();
    return runtimePromise;
  };
  const ensureIndexes = async () => {
    if (!indexPromise) {
      indexPromise = runtime().then(async ({ reservations }) => {
        await reservations.createIndex(
          { guardIdentitySha256: 1 },
          { name: 'uniq_product_budget_guard_v2r', unique: true },
        );
        await reservations.createIndex(
          { 'scope.tenantId': 1, 'scope.projectId': 1, status: 1 },
          { name: 'scope_project_status_v2r' },
        );
      });
    }
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  return {
    transact: async <T>(operation: (
      transaction: Readonly<ProviderNativeProductBudgetCreditLedgerTransactionV2R>,
    ) => Promise<T>) => {
      await ensureIndexes();
      const resolved = await runtime();
      const session = await resolved.startSession();
      let committed = false;
      let result: T | undefined;
      try {
        await session.withTransaction(async () => {
          committed = false;
          const transaction = createTransaction(resolved, session, historyCap);
          result = await operation(transaction);
          committed = true;
          return result;
        }, {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        });
        if (!committed) fail('PRODUCT_BUDGET_MONGO_TRANSACTION_NOT_COMMITTED');
        return result as T;
      } finally {
        await session.endSession();
      }
    },

    getByGuardIdentity: async (guardIdentitySha256) => {
      await ensureIndexes();
      const resolved = await runtime();
      const stored = await resolved.reservations.findOne({ guardIdentitySha256 });
      return stored ? storedRecord(stored) : null;
    },
  };
}

function createTransaction(
  runtime: Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>,
  session: Readonly<ProviderNativeProductBudgetMongoSessionV2R>,
  historyCap: number,
): Readonly<ProviderNativeProductBudgetCreditLedgerTransactionV2R> {
  const snapshots = new Map<string, Readonly<ProviderNativeProductBudgetWalletSnapshotV2R>>();

  const readWallet = async (wallet: Readonly<WalletRef>) => {
    const { collection, filter } = walletCollection(runtime, wallet);
    const document = await collection.findOne(filter, {
      session: session.driverSession,
      projection: { creditsBalance: 1 },
    });
    if (!document) return null;
    const snapshot = walletSnapshot(wallet, document.creditsBalance);
    snapshots.set(walletKey(wallet), snapshot);
    return snapshot;
  };

  return {
    get: async (reservationId) => {
      const document = await runtime.reservations.findOne(
        { _id: reservationId },
        { session: session.driverSession },
      );
      return document ? storedRecord(document) : null;
    },
    readWallet,
    reserveWallet: async (request) => {
      const snapshot = snapshots.get(walletKey(request.authorization.wallet))
        ?? await readWallet(request.authorization.wallet);
      if (!snapshot) fail('PRODUCT_BUDGET_MONGO_WALLET_NOT_FOUND');
      const reservationTransactionId = `${request.reservationId}:reserve`;
      const reserved = request.subscriptionCentiCredits + request.topupCentiCredits;
      const after = snapshot.subscriptionCentiCredits + snapshot.topupCentiCredits - reserved;
      const audit = walletAudit({
        id: reservationTransactionId,
        phase: 'RESERVE',
        wallet: request.authorization.wallet,
        projectId: request.authorization.scope.projectId,
        reservationId: request.reservationId,
        amountCentiCredits: -reserved,
        subscriptionCentiCredits: request.subscriptionCentiCredits,
        topupCentiCredits: request.topupCentiCredits,
        occurredAt: request.reservedAt,
        balanceAfterCentiCredits: after,
      });
      const updated = await updateWallet({
        runtime,
        session,
        wallet: request.authorization.wallet,
        phase: 'RESERVE',
        reservationId: request.reservationId,
        subscriptionDeltaCentiCredits: -request.subscriptionCentiCredits,
        topupDeltaCentiCredits: -request.topupCentiCredits,
        subscriptionMinimumCentiCredits: request.subscriptionCentiCredits,
        topupMinimumCentiCredits: request.topupCentiCredits,
        minimumSubscriptionExpiry: request.subscriptionCentiCredits > 0
          ? request.authorization.approval.expiresAt : null,
        audit,
        historyCap,
      });
      assertBalance(updated, after);
      await writeOrgAudit(runtime, session, request.authorization.wallet, {
        ...audit,
        type: 'deduct',
      });
      return {
        walletReservationTransactionId: reservationTransactionId,
        walletReservationReceiptSha256: hashEditronCanonicalJsonV1({
          kind: 'PRODUCT_BUDGET_WALLET_RESERVATION_V2R',
          reservationTransactionId,
          authorizationSha256: request.authorization.authorizationSha256,
          wallet: request.authorization.wallet,
          subscriptionCentiCredits: request.subscriptionCentiCredits,
          topupCentiCredits: request.topupCentiCredits,
          balanceAfterCentiCredits: after,
          reservedAt: request.reservedAt,
        }),
      };
    },
    insert: async (record) => {
      const result = await runtime.reservations.insertOne(
        storedDocument(record),
        { session: session.driverSession },
      );
      if (!result.acknowledged) fail('PRODUCT_BUDGET_MONGO_INSERT_UNACKNOWLEDGED');
    },
    settleWallet: async (request) => {
      const wallet = request.record.authorization.wallet;
      const snapshot = snapshots.get(walletKey(wallet)) ?? await readWallet(wallet);
      if (!snapshot) fail('PRODUCT_BUDGET_MONGO_WALLET_NOT_FOUND');
      const released = request.returnSubscriptionCentiCredits + request.returnTopupCentiCredits;
      const after = snapshot.subscriptionCentiCredits + snapshot.topupCentiCredits + released;
      const settlementTransactionId = `${request.record.reservationId}:settle`;
      const audit = walletAudit({
        id: settlementTransactionId,
        phase: 'SETTLE',
        wallet,
        projectId: request.record.authorization.scope.projectId,
        reservationId: request.record.reservationId,
        amountCentiCredits: released,
        subscriptionCentiCredits: request.returnSubscriptionCentiCredits,
        topupCentiCredits: request.returnTopupCentiCredits,
        occurredAt: request.settledAt,
        balanceAfterCentiCredits: after,
      });
      const updated = await updateWallet({
        runtime,
        session,
        wallet,
        phase: 'SETTLE',
        reservationId: request.record.reservationId,
        subscriptionDeltaCentiCredits: request.returnSubscriptionCentiCredits,
        topupDeltaCentiCredits: request.returnTopupCentiCredits,
        subscriptionMinimumCentiCredits: 0,
        topupMinimumCentiCredits: 0,
        minimumSubscriptionExpiry: request.returnSubscriptionCentiCredits > 0
          ? request.settledAt : null,
        audit,
        historyCap,
      });
      assertBalance(updated, after);
      await writeOrgAudit(runtime, session, wallet, {
        ...audit,
        type: released > 0 ? 'refund' : 'adjust',
      });
      return {
        walletSettlementReceiptSha256: hashEditronCanonicalJsonV1({
          kind: 'PRODUCT_BUDGET_WALLET_SETTLEMENT_V2R',
          settlementTransactionId,
          reservationId: request.record.reservationId,
          requested: request.requested,
          wallet,
          returnSubscriptionCentiCredits: request.returnSubscriptionCentiCredits,
          returnTopupCentiCredits: request.returnTopupCentiCredits,
          balanceAfterCentiCredits: after,
          settledAt: request.settledAt,
        }),
      };
    },
    replaceSettlement: async ({ expectedRecordSha256, record }) => {
      const result = await runtime.reservations.replaceOne(
        { _id: record.reservationId, recordSha256: expectedRecordSha256 },
        storedDocument(record),
        { session: session.driverSession },
      );
      if (result.matchedCount !== 1) fail('PRODUCT_BUDGET_MONGO_SETTLEMENT_CAS_CONFLICT');
    },
  };
}

async function updateWallet(input: Readonly<{
  runtime: Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>;
  session: Readonly<ProviderNativeProductBudgetMongoSessionV2R>;
  wallet: Readonly<WalletRef>;
  phase: 'RESERVE' | 'SETTLE';
  reservationId: string;
  subscriptionDeltaCentiCredits: number;
  topupDeltaCentiCredits: number;
  subscriptionMinimumCentiCredits: number;
  topupMinimumCentiCredits: number;
  minimumSubscriptionExpiry: string | null;
  audit: Readonly<MongoRecord>;
  historyCap: number;
}>) {
  const { collection, filter: identity } = walletCollection(input.runtime, input.wallet);
  const filter: MongoRecord = {
    ...identity,
    creditsBalance: { $exists: true },
    'creditsBalance.creditHistory': {
      $not: { $elemMatch: {
        'metadata.productBudgetReservationId': input.reservationId,
        'metadata.productBudgetPhase': input.phase,
      } },
    },
  };
  if (input.subscriptionMinimumCentiCredits > 0) {
    filter['creditsBalance.subscriptionCredits'] = {
      $gte: toCredits(input.subscriptionMinimumCentiCredits),
    };
  }
  if (input.topupMinimumCentiCredits > 0) {
    filter['creditsBalance.topupCredits'] = {
      $gte: toCredits(input.topupMinimumCentiCredits),
    };
  }
  if (input.minimumSubscriptionExpiry) {
    filter['creditsBalance.subscriptionCreditsExpiry'] = input.phase === 'RESERVE'
      ? { $gte: new Date(input.minimumSubscriptionExpiry) }
      : { $gt: new Date(input.minimumSubscriptionExpiry) };
  }
  const updated = await collection.findOneAndUpdate(filter, {
    $inc: {
      'creditsBalance.subscriptionCredits': toCredits(input.subscriptionDeltaCentiCredits),
      'creditsBalance.topupCredits': toCredits(input.topupDeltaCentiCredits),
    },
    $push: {
      'creditsBalance.creditHistory': {
        $each: [input.audit],
        $slice: -input.historyCap,
      },
    },
  }, {
    session: input.session.driverSession,
    returnDocument: 'after',
    projection: { creditsBalance: 1 },
  });
  if (!updated) fail(`PRODUCT_BUDGET_MONGO_${input.phase}_WALLET_CONFLICT`);
  return walletSnapshot(input.wallet, updated.creditsBalance);
}

function walletAudit(input: Readonly<{
  id: string;
  phase: 'RESERVE' | 'SETTLE';
  wallet: Readonly<WalletRef>;
  projectId: string;
  reservationId: string;
  amountCentiCredits: number;
  subscriptionCentiCredits: number;
  topupCentiCredits: number;
  occurredAt: string;
  balanceAfterCentiCredits: number;
}>): Readonly<MongoRecord> {
  return {
    id: input.id,
    type: input.phase === 'RESERVE' ? 'usage' : 'refund',
    amount: toCredits(input.amountCentiCredits),
    service: 'editron',
    action: 'provider_native_product_budget',
    timestamp: new Date(input.occurredAt),
    balanceAfter: toCredits(input.balanceAfterCentiCredits),
    metadata: {
      pool: 'main',
      projectId: input.projectId,
      productBudgetReservationId: input.reservationId,
      productBudgetPhase: input.phase,
      fromSubscription: toCredits(input.subscriptionCentiCredits),
      fromTopup: toCredits(input.topupCentiCredits),
      actorUserId: input.wallet.type === 'org' ? input.wallet.actorUserId : undefined,
    },
  };
}

async function writeOrgAudit(
  runtime: Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>,
  session: Readonly<ProviderNativeProductBudgetMongoSessionV2R>,
  wallet: Readonly<WalletRef>,
  audit: Readonly<MongoRecord & { type: 'deduct' | 'refund' | 'adjust' }>,
) {
  if (wallet.type !== 'org') return;
  const metadata = asRecord(audit.metadata, 'ORG_AUDIT_METADATA');
  const result = await runtime.orgCreditTransactions.insertOne({
    clerkOrgId: wallet.clerkOrgId,
    actorUserId: wallet.actorUserId,
    projectId: metadata.projectId,
    pool: 'main',
    type: audit.type,
    amount: audit.amount,
    balanceAfter: audit.balanceAfter,
    operationId: audit.id,
    metadata,
    createdAt: audit.timestamp,
  }, { session: session.driverSession });
  if (!result.acknowledged) fail('PRODUCT_BUDGET_MONGO_ORG_AUDIT_UNACKNOWLEDGED');
}

function walletCollection(
  runtime: Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>,
  wallet: Readonly<WalletRef>,
) {
  return wallet.type === 'org'
    ? { collection: runtime.organizations, filter: { clerkOrgId: wallet.clerkOrgId } }
    : { collection: runtime.users, filter: { clerkUserId: wallet.clerkUserId } };
}

function walletSnapshot(
  wallet: Readonly<WalletRef>,
  value: unknown,
): Readonly<ProviderNativeProductBudgetWalletSnapshotV2R> {
  const balance = value === undefined ? {} : asRecord(value, 'WALLET_BALANCE');
  return {
    wallet,
    subscriptionCentiCredits: toCentiCredits(
      balance.subscriptionCredits ?? 0,
      'SUBSCRIPTION_BALANCE',
    ),
    topupCentiCredits: toCentiCredits(balance.topupCredits ?? 0, 'TOPUP_BALANCE'),
    subscriptionExpiresAt: nullableTimestamp(
      balance.subscriptionCreditsExpiry ?? null,
      'SUBSCRIPTION_EXPIRY',
    ),
  };
}

function assertBalance(
  snapshot: Readonly<ProviderNativeProductBudgetWalletSnapshotV2R>,
  expectedTotalCentiCredits: number,
) {
  if (snapshot.subscriptionCentiCredits + snapshot.topupCentiCredits
    !== expectedTotalCentiCredits) {
    fail('PRODUCT_BUDGET_MONGO_BALANCE_AFTER_INVALID');
  }
}

function storedDocument(
  record: Readonly<ProviderNativeProductBudgetCreditRecordV2R>,
): Readonly<MongoRecord> {
  return {
    _id: record.reservationId,
    version: record.version,
    recordVersion: record.recordVersion,
    guardIdentitySha256: record.reservation.guardIdentitySha256,
    scope: record.authorization.scope,
    wallet: record.authorization.wallet,
    status: record.status,
    recordSha256: record.recordSha256,
    record,
    createdAt: new Date(record.reservation.reservedAt),
    updatedAt: new Date(record.settlement?.settledAt ?? record.reservation.reservedAt),
  };
}

function storedRecord(document: Readonly<MongoRecord>) {
  const record = document.record;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    fail('PRODUCT_BUDGET_MONGO_RECORD_INVALID');
  }
  return record as Readonly<ProviderNativeProductBudgetCreditRecordV2R>;
}

async function loadDefaultRuntime(): Promise<Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>> {
  const [{ default: connectToDatabase }, userModule, organizationModule, orgLedgerModule] =
    await Promise.all([
      import('@/schemas/ConnectToDatabase'),
      import('@/schemas/user'),
      import('@/schemas/Organization'),
      import('@/schemas/OrgCreditTransaction'),
    ]);
  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) fail('PRODUCT_BUDGET_MONGO_DATABASE_UNAVAILABLE');
  return {
    startSession: async () => wrapSession(await mongoose.connection.startSession()),
    reservations: wrapCollection(db.collection(PROVIDER_NATIVE_PRODUCT_BUDGET_CREDIT_COLLECTION_V2R)),
    users: wrapCollection(db.collection(userModule.User.collection.name)),
    organizations: wrapCollection(db.collection(organizationModule.Organization.collection.name)),
    orgCreditTransactions: wrapCollection(
      db.collection(orgLedgerModule.OrgCreditTransaction.collection.name),
    ),
  };
}

function wrapSession(session: ClientSession): ProviderNativeProductBudgetMongoSessionV2R {
  return {
    driverSession: session,
    withTransaction: (operation, options) => session.withTransaction(operation, options),
    endSession: () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): ProviderNativeProductBudgetMongoCollectionV2R {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter, options) => collection.findOne(
      filter as Filter<Document>,
      {
        ...(options?.projection ? { projection: options.projection } : {}),
        ...(options?.session ? { session: options.session as ClientSession } : {}),
      } as FindOptions,
    ) as Promise<MongoRecord | null>,
    findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(
      filter as Filter<Document>,
      update as UpdateFilter<Document>,
      {
        session: options.session as ClientSession,
        returnDocument: options.returnDocument,
        ...(options.projection ? { projection: options.projection } : {}),
      },
    ) as Promise<MongoRecord | null>,
    insertOne: (document, options) => collection.insertOne(
      document as OptionalUnlessRequiredId<Document>,
      { session: options.session as ClientSession },
    ),
    replaceOne: (filter, replacement, options) => collection.replaceOne(
      filter as Filter<Document>,
      replacement,
      { session: options.session as ClientSession },
    ),
  };
}

function walletKey(wallet: Readonly<WalletRef>) {
  return wallet.type === 'org' ? `org:${wallet.clerkOrgId}` : `user:${wallet.clerkUserId}`;
}

function toCredits(centiCredits: number) {
  if (!Number.isSafeInteger(centiCredits)) fail('PRODUCT_BUDGET_CENTICREDITS_INVALID');
  return centiCredits / 100;
}

function toCentiCredits(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`PRODUCT_BUDGET_MONGO_${label}_INVALID`);
  }
  const centiCredits = Math.round(value * 100);
  if (!Number.isSafeInteger(centiCredits) || Math.abs(value - centiCredits / 100) > 1e-9) {
    fail(`PRODUCT_BUDGET_MONGO_${label}_PRECISION_UNSUPPORTED`);
  }
  return centiCredits;
}

function nullableTimestamp(value: unknown, label: string) {
  if (value === null) return null;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(milliseconds)) fail(`PRODUCT_BUDGET_MONGO_${label}_INVALID`);
  return new Date(milliseconds).toISOString();
}

function asRecord(value: unknown, label: string): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`PRODUCT_BUDGET_MONGO_${label}_INVALID`);
  }
  return value as MongoRecord;
}

function positiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    fail(`PRODUCT_BUDGET_MONGO_${label}_INVALID`);
  }
  return Number(value);
}

function fail(message: string): never {
  throw new Error(message);
}
