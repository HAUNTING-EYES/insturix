import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
} from 'mongodb';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
} from './media-proxy-master-transcode-execution-budget-ledger-record-v1';
import type {
  MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV1,
  MediaProxyMasterTranscodeExecutionBudgetLedgerV1,
} from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';

type MongoRecord = Record<string, unknown>;

export const MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_COLLECTION_V1 =
  'editron_media_proxy_master_transcode_execution_budget_ledger_v1' as const;

export interface MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1 {
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

export interface MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options?: Readonly<{ session?: unknown }>,
  ): Promise<MongoRecord | null>;
  findOneAndUpdate(
    filter: Readonly<MongoRecord>,
    update: Readonly<{ $setOnInsert: Readonly<MongoRecord> }>,
    options: Readonly<{
      session: unknown;
      upsert: true;
      returnDocument: 'after';
    }>,
  ): Promise<MongoRecord | null>;
  replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ matchedCount: number }>>;
}

export interface MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV1 {
  startSession():
    Promise<MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1>;
  ledger: MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1;
}

export function createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1(
  input: Readonly<{
    loadRuntime?: () => Promise<Readonly<
      MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV1
    >>;
  }> = {},
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerV1> {
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<
    MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV1
  >> | null = null;
  let indexPromise: Promise<void> | null = null;
  const runtime = () => {
    runtimePromise ??= loadRuntime();
    return runtimePromise;
  };
  const ensureIndexes = async () => {
    indexPromise ??= runtime().then(async ({ ledger }) => {
      await ledger.createIndex(
        { reservationId: 1 },
        {
          name: 'uniq_proxy_transcode_execution_budget_reservation_v1',
          unique: true,
        },
      );
      await ledger.createIndex(
        { 'scope.tenantId': 1, 'scope.assetId': 1, status: 1 },
        { name: 'scope_asset_status_proxy_transcode_execution_budget_v1' },
      );
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  return Object.freeze({
    transact: async <T>(operation: (
      transaction: Readonly<
        MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV1
      >,
    ) => Promise<T>) => {
      await ensureIndexes();
      const resolved = await runtime();
      const session = await resolved.startSession();
      let committed = false;
      let result: T | undefined;
      try {
        await session.withTransaction(async () => {
          committed = false;
          result = await operation(createTransaction(resolved.ledger, session));
          committed = true;
          return result;
        }, {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        });
        if (!committed) fail('TRANSACTION_NOT_COMMITTED');
        return result as T;
      } finally {
        await session.endSession();
      }
    },
    get: async (reservationId: string) => {
      await ensureIndexes();
      const stored = await (await runtime()).ledger.findOne({
        _id: identity(reservationId, 'RESERVATION_ID'),
      });
      return stored ? storedRecord(stored) : null;
    },
  });
}

function createTransaction(
  collection:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1>,
  session: Readonly<MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionV1> {
  return {
    get: async (reservationId) => {
      const stored = await collection.findOne(
        { _id: identity(reservationId, 'RESERVATION_ID') },
        { session: session.driverSession },
      );
      return stored ? storedRecord(stored) : null;
    },
    insert: async (recordInput) => {
      const record = recordEnvelope(recordInput);
      const stored = await collection.findOneAndUpdate(
        { _id: record.reservationId },
        { $setOnInsert: storedDocument(record) },
        {
          session: session.driverSession,
          upsert: true,
          returnDocument: 'after',
        },
      );
      if (!stored) fail('INSERT_NOT_ACKNOWLEDGED');
      if (storedRecord(stored!).recordSha256 !== record.recordSha256) {
        fail('INSERT_CONFLICT');
      }
    },
    replace: async ({ expectedRecordSha256, record: recordInput }) => {
      const record = recordEnvelope(recordInput);
      if (record.status !== 'SETTLED' || record.recordVersion !== 2) {
        fail('REPLACEMENT_NOT_SETTLED');
      }
      const replaced = await collection.replaceOne({
        _id: record.reservationId,
        recordSha256: sha256(
          expectedRecordSha256,
          'EXPECTED_RECORD_SHA256',
        ),
        status: 'RESERVED',
        recordVersion: 1,
      }, storedDocument(record), { session: session.driverSession });
      if (replaced.matchedCount !== 1) fail('COMPARE_AND_SET_LOST');
    },
  };
}

function storedDocument(
  recordInput:
    Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1>,
): Readonly<MongoRecord> {
  const record = recordEnvelope(recordInput);
  return {
    _id: record.reservationId,
    version: record.version,
    recordVersion: record.recordVersion,
    reservationId: record.reservationId,
    status: record.status,
    recordSha256: record.recordSha256,
    scope: record.authorization.scope,
    record,
    createdAt: new Date(record.reservation.reservedAt),
    updatedAt: new Date(
      record.settlement?.settledAt ?? record.reservation.reservedAt,
    ),
  };
}

function storedRecord(
  document: Readonly<MongoRecord>,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1> {
  const record = recordEnvelope(document.record);
  if (document._id !== record.reservationId
    || document.version !== record.version
    || document.recordVersion !== record.recordVersion
    || document.reservationId !== record.reservationId
    || document.status !== record.status
    || document.recordSha256 !== record.recordSha256
    || hashEditronCanonicalJsonV1(document.scope)
      !== hashEditronCanonicalJsonV1(record.authorization.scope)
    || dateIso(document.createdAt, 'CREATED_AT')
      !== record.reservation.reservedAt
    || dateIso(document.updatedAt, 'UPDATED_AT')
      !== (record.settlement?.settledAt ?? record.reservation.reservedAt)) {
    fail('STORED_ENVELOPE_INVALID');
  }
  return record;
}

function recordEnvelope(
  value: unknown,
): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1> {
  const candidate = object(value, 'RECORD');
  const recordSha256 = sha256(candidate.recordSha256, 'RECORD_SHA256');
  const { recordSha256: _discarded, ...material } = candidate;
  if (candidate.version
      !== MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_RECORD_VERSION_V1
    || (candidate.recordVersion !== 1 && candidate.recordVersion !== 2)
    || (candidate.status !== 'RESERVED' && candidate.status !== 'SETTLED')
    || identity(candidate.reservationId, 'RESERVATION_ID')
      !== object(candidate.reservation, 'RESERVATION').reservationId
    || (candidate.status === 'RESERVED') !== (candidate.recordVersion === 1)
    || (candidate.status === 'RESERVED') !== (candidate.settlement === null)
    || hashEditronCanonicalJsonV1(material) !== recordSha256) {
    fail('RECORD_INVALID');
  }
  return candidate as unknown as Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1
  >;
}

async function loadDefaultRuntime(): Promise<Readonly<
  MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeV1
>> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    ledger: wrapCollection(
      db.collection(
        MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_LEDGER_COLLECTION_V1,
      ),
    ),
  };
}

function wrapSession(
  session: ClientSession,
): MediaProxyMasterTranscodeExecutionBudgetMongoSessionV1 {
  return {
    driverSession: session,
    withTransaction: (operation, options) => session.withTransaction(
      operation,
      options,
    ),
    endSession: () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): MediaProxyMasterTranscodeExecutionBudgetMongoCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter, options) => collection.findOne(
      filter as Filter<Document>,
      options?.session
        ? { session: options.session as ClientSession } as FindOptions
        : undefined,
    ) as Promise<MongoRecord | null>,
    findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(
      filter as Filter<Document>,
      update as UpdateFilter<Document>,
      {
        session: options.session as ClientSession,
        upsert: options.upsert,
        returnDocument: options.returnDocument,
      },
    ) as Promise<MongoRecord | null>,
    replaceOne: (filter, replacement, options) => collection.replaceOne(
      filter as Filter<Document>,
      replacement,
      { session: options.session as ClientSession },
    ),
  };
}

function object(value: unknown, label: string): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as MongoRecord;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function dateIso(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail(`${label}_INVALID`);
  }
  return value.toISOString();
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1(code);
}

export class MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1
  extends Error {
  constructor(code: string) {
    super(
      `MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_MONGO_LEDGER_${code}`,
    );
    this.name =
      'MediaProxyMasterTranscodeExecutionBudgetMongoLedgerErrorV1';
  }
}
