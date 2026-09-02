import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
} from 'mongodb';

import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type {
  MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1,
  MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1,
} from './media-proxy-master-transcode-execution-budget-ledger-owner-core-v1';

type MongoRecord = Record<string, unknown>;
type Fail = (code: string) => never;

export interface MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1 {
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

export interface MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1 {
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

export interface MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1 {
  startSession(): Promise<
    MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1
  >;
  ledger: MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1;
}

export interface MediaProxyMasterTranscodeExecutionBudgetMongoRecordCoreV1 {
  readonly version: string;
  readonly recordVersion: 1 | 2;
  readonly reservationId: string;
  readonly status: 'RESERVED' | 'SETTLED';
  readonly authorization: Readonly<{ scope: unknown }>;
  readonly reservation: Readonly<{
    reservationId: string;
    reservedAt: string;
  }>;
  readonly settlement: Readonly<{ settledAt: string }> | null;
  readonly recordSha256: string;
}

export function createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerCoreV1<
  Record extends
    MediaProxyMasterTranscodeExecutionBudgetMongoRecordCoreV1,
>(input: Readonly<{
  collectionName: string;
  recordSchemaVersion: string;
  uniqueReservationIndexName: string;
  scopeStatusIndexName: string;
  loadRuntime?: () => Promise<Readonly<
    MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1
  >>;
  fail: Fail;
}>): Readonly<MediaProxyMasterTranscodeExecutionBudgetLedgerCoreV1<Record>> {
  const loadRuntime = input.loadRuntime
    ?? (() => loadDefaultRuntime(input.collectionName));
  let runtimePromise: Promise<Readonly<
    MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1
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
        { name: input.uniqueReservationIndexName, unique: true },
      );
      await ledger.createIndex(
        { 'scope.tenantId': 1, 'scope.assetId': 1, status: 1 },
        { name: input.scopeStatusIndexName },
      );
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };
  const schema = Object.freeze({
    version: input.recordSchemaVersion,
    fail: input.fail,
  });

  return Object.freeze({
    transact: async <T>(operation: (
      transaction: Readonly<
        MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1<
          Record
        >
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
          result = await operation(createTransaction(
            resolved.ledger,
            session,
            schema,
          ));
          committed = true;
          return result;
        }, {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        });
        if (!committed) input.fail('TRANSACTION_NOT_COMMITTED');
        return result as T;
      } finally {
        await session.endSession();
      }
    },
    get: async (reservationId: string) => {
      await ensureIndexes();
      const stored = await (await runtime()).ledger.findOne({
        _id: identity(reservationId, 'RESERVATION_ID', input.fail),
      });
      return stored ? storedRecord<Record>(stored, schema) : null;
    },
  });
}

function createTransaction<
  Record extends MediaProxyMasterTranscodeExecutionBudgetMongoRecordCoreV1,
>(
  collection: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1
  >,
  session: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1
  >,
  schema: Readonly<{ version: string; fail: Fail }>,
): Readonly<
  MediaProxyMasterTranscodeExecutionBudgetLedgerTransactionCoreV1<Record>
> {
  return {
    get: async (reservationId) => {
      const stored = await collection.findOne(
        { _id: identity(reservationId, 'RESERVATION_ID', schema.fail) },
        { session: session.driverSession },
      );
      return stored ? storedRecord<Record>(stored, schema) : null;
    },
    insert: async (recordInput) => {
      const record = recordEnvelope<Record>(recordInput, schema);
      const stored = await collection.findOneAndUpdate(
        { _id: record.reservationId },
        { $setOnInsert: storedDocument(record, schema) },
        {
          session: session.driverSession,
          upsert: true,
          returnDocument: 'after',
        },
      );
      if (!stored) schema.fail('INSERT_NOT_ACKNOWLEDGED');
      if (storedRecord<Record>(stored, schema).recordSha256
        !== record.recordSha256) {
        schema.fail('INSERT_CONFLICT');
      }
    },
    replace: async ({ expectedRecordSha256, record: recordInput }) => {
      const record = recordEnvelope<Record>(recordInput, schema);
      if (record.status !== 'SETTLED' || record.recordVersion !== 2) {
        schema.fail('REPLACEMENT_NOT_SETTLED');
      }
      const replaced = await collection.replaceOne({
        _id: record.reservationId,
        recordSha256: sha256(
          expectedRecordSha256,
          'EXPECTED_RECORD_SHA256',
          schema.fail,
        ),
        status: 'RESERVED',
        recordVersion: 1,
      }, storedDocument(record, schema), {
        session: session.driverSession,
      });
      if (replaced.matchedCount !== 1) schema.fail('COMPARE_AND_SET_LOST');
    },
  };
}

function storedDocument<
  Record extends MediaProxyMasterTranscodeExecutionBudgetMongoRecordCoreV1,
>(
  recordInput: Readonly<Record>,
  schema: Readonly<{ version: string; fail: Fail }>,
): Readonly<MongoRecord> {
  const record = recordEnvelope<Record>(recordInput, schema);
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

function storedRecord<
  Record extends MediaProxyMasterTranscodeExecutionBudgetMongoRecordCoreV1,
>(
  document: Readonly<MongoRecord>,
  schema: Readonly<{ version: string; fail: Fail }>,
): Readonly<Record> {
  const record = recordEnvelope<Record>(document.record, schema);
  const expectedKeys = [
    '_id',
    'createdAt',
    'record',
    'recordSha256',
    'recordVersion',
    'reservationId',
    'scope',
    'status',
    'updatedAt',
    'version',
  ];
  if (Object.keys(document).sort().join('\n') !== expectedKeys.join('\n')
    || document._id !== record.reservationId
    || document.version !== record.version
    || document.recordVersion !== record.recordVersion
    || document.reservationId !== record.reservationId
    || document.status !== record.status
    || document.recordSha256 !== record.recordSha256
    || hashEditronCanonicalJsonV1(document.scope)
      !== hashEditronCanonicalJsonV1(record.authorization.scope)
    || dateIso(document.createdAt, 'CREATED_AT', schema.fail)
      !== record.reservation.reservedAt
    || dateIso(document.updatedAt, 'UPDATED_AT', schema.fail)
      !== (record.settlement?.settledAt ?? record.reservation.reservedAt)) {
    schema.fail('STORED_ENVELOPE_INVALID');
  }
  return record;
}

function recordEnvelope<
  Record extends MediaProxyMasterTranscodeExecutionBudgetMongoRecordCoreV1,
>(
  value: unknown,
  schema: Readonly<{ version: string; fail: Fail }>,
): Readonly<Record> {
  const candidate = object(value, 'RECORD', schema.fail);
  const recordSha256 = sha256(
    candidate.recordSha256,
    'RECORD_SHA256',
    schema.fail,
  );
  const reservation = object(
    candidate.reservation,
    'RESERVATION',
    schema.fail,
  );
  const settlement = candidate.settlement === null
    ? null
    : object(candidate.settlement, 'SETTLEMENT', schema.fail);
  const material = {
    version: candidate.version,
    recordVersion: candidate.recordVersion,
    reservationId: candidate.reservationId,
    status: candidate.status,
    authorization: candidate.authorization,
    reservation: candidate.reservation,
    settlement: candidate.settlement,
  };
  const rebound = { ...material, recordSha256 };
  if (candidate.version !== schema.version
    || (candidate.recordVersion !== 1 && candidate.recordVersion !== 2)
    || (candidate.status !== 'RESERVED' && candidate.status !== 'SETTLED')
    || identity(candidate.reservationId, 'RESERVATION_ID', schema.fail)
      !== reservation.reservationId
    || isoTimestamp(reservation.reservedAt, 'RESERVED_AT', schema.fail)
      !== reservation.reservedAt
    || (settlement !== null
      && isoTimestamp(settlement.settledAt, 'SETTLED_AT', schema.fail)
        !== settlement.settledAt)
    || (candidate.status === 'RESERVED') !== (candidate.recordVersion === 1)
    || (candidate.status === 'RESERVED') !== (candidate.settlement === null)
    || hashEditronCanonicalJsonV1(material) !== recordSha256
    || canonicalizeEditronJsonV1(candidate)
      !== canonicalizeEditronJsonV1(rebound)) {
    schema.fail('RECORD_INVALID');
  }
  return rebound as unknown as Readonly<Record>;
}

async function loadDefaultRuntime(
  collectionName: string,
): Promise<Readonly<
  MediaProxyMasterTranscodeExecutionBudgetMongoRuntimeCoreV1
>> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    ledger: wrapCollection(db.collection(collectionName)),
  };
}

function wrapSession(
  session: ClientSession,
): MediaProxyMasterTranscodeExecutionBudgetMongoSessionCoreV1 {
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
): MediaProxyMasterTranscodeExecutionBudgetMongoCollectionCoreV1 {
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

function object(value: unknown, label: string, fail: Fail): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${label}_INVALID`);
  }
  return value as MongoRecord;
}

function identity(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    return fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    return fail(`${label}_INVALID`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string, fail: Fail): string {
  if (typeof value !== 'string') return fail(`${label}_INVALID`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString() !== value) {
    return fail(`${label}_INVALID`);
  }
  return value;
}

function dateIso(value: unknown, label: string, fail: Fail): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return fail(`${label}_INVALID`);
  }
  return value.toISOString();
}
