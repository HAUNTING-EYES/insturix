import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  UpdateFilter,
} from 'mongodb';

import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from './media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 }
  from './media-source-pts-cadence-version-evidence-backfill-run-ledger-v1';
import {
  advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from './media-source-pts-cadence-version-evidence-backfill-run-record-v1';

type MongoRecord = Record<string, unknown>;
type MongoUpdate = Readonly<{ $setOnInsert: Readonly<MongoRecord> }>;

const RUN_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_DOCUMENT_V1' as const;
const RECEIPT_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECEIPT_DOCUMENT_V1' as const;
const TRANSACTION_OPTIONS_V1 = Object.freeze({
  readConcern: Object.freeze({ level: 'snapshot' as const }),
  writeConcern: Object.freeze({ w: 'majority' as const }),
  readPreference: 'primary' as const,
});

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_COLLECTION_V1 =
  'editron_media_source_pts_cadence_version_evidence_backfill_runs_v1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECEIPT_COLLECTION_V1 =
  'editron_media_source_pts_cadence_version_evidence_backfill_receipts_v1' as const;

export interface MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1 {
  driverSession: unknown;
  withTransaction<T>(
    operation: () => Promise<T>,
    options: typeof TRANSACTION_OPTIONS_V1,
  ): Promise<T | undefined>;
  endSession(): Promise<void>;
}

export interface MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options?: Readonly<{
      session?: unknown;
      readPreference?: 'primary';
    }>,
  ): Promise<MongoRecord | null>;
  updateOne(
    filter: Readonly<MongoRecord>,
    update: MongoUpdate,
    options: Readonly<{ session: unknown; upsert: true }>,
  ): Promise<Readonly<{ matchedCount: number; upsertedCount: number }>>;
  replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ matchedCount: number }>>;
}

export interface MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1 {
  startSession(): Promise<
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1
  >;
  runs: MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1;
  receipts: MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1;
}

export function createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1(
  input: Readonly<{
    loadRuntime?: () => Promise<Readonly<
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1
    >>;
  }> = {},
): Readonly<MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1> {
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1
  >> | null = null;
  let indexesPromise: Promise<void> | null = null;
  const runtime = () => {
    runtimePromise ??= loadRuntime();
    return runtimePromise;
  };
  const ensureIndexes = async () => {
    indexesPromise ??= runtime().then(async ({ runs, receipts }) => {
      await runs.createIndex(
        { migrationRunId: 1 },
        { name: 'uniq_pts_cadence_evidence_backfill_run_v1', unique: true },
      );
      await runs.createIndex(
        { status: 1, updatedAt: 1 },
        { name: 'pts_cadence_evidence_backfill_run_status_v1' },
      );
      await receipts.createIndex(
        { batchReceiptSha256: 1 },
        { name: 'uniq_pts_cadence_evidence_backfill_receipt_v1', unique: true },
      );
      await receipts.createIndex(
        { migrationRunId: 1, acceptedRecordVersion: 1 },
        {
          name: 'pts_cadence_evidence_backfill_receipt_run_version_v1',
          unique: true,
        },
      );
    });
    try {
      await indexesPromise;
    } catch (error) {
      indexesPromise = null;
      throw error;
    }
  };

  return Object.freeze({
    load: async (migrationRunId) => {
      await ensureIndexes();
      const stored = await (await runtime()).runs.findOne(
        { _id: identifier(migrationRunId) },
        { readPreference: 'primary' },
      );
      return stored === null ? null : storedRunRecord(stored);
    },
    compareAndSet: async (value) => {
      const normalized = normalizeCasInput(value);
      await ensureIndexes();
      const resolved = await runtime();
      const session = await resolved.startSession();
      let callbackCompleted = false;
      let applied = false;
      try {
        await session.withTransaction(async () => {
          callbackCompleted = false;
          applied = await applyCompareAndSet(
            resolved,
            session.driverSession,
            normalized,
          );
          callbackCompleted = true;
          return applied;
        }, TRANSACTION_OPTIONS_V1);
        if (!callbackCompleted) fail('TRANSACTION_NOT_COMMITTED');
        return applied;
      } catch (error) {
        if (normalized.expectedRecordSha256 === null && duplicateKey(error)) {
          return false;
        }
        throw error;
      } finally {
        await session.endSession();
      }
    },
  });
}

type NormalizedCasInputV1 = Readonly<{
  migrationRunId: string;
  expectedRecordSha256: string | null;
  next: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
  acceptedReceipt:
    MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 | null;
}>;

function normalizeCasInput(
  value: Parameters<
    MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1['compareAndSet']
  >[0],
): NormalizedCasInputV1 {
  const next =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(value.next);
  const migrationRunId = identifier(value.migrationRunId);
  const expectedRecordSha256 = value.expectedRecordSha256 === null
    ? null
    : sha256(value.expectedRecordSha256);
  const acceptedReceipt = value.acceptedReceipt === null
    ? null
    : assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1(
      value.acceptedReceipt,
    );
  if (next.migrationRunId !== migrationRunId) fail('RUN_SCOPE_MISMATCH');
  if (expectedRecordSha256 === null) {
    if (next.recordVersion !== 1
      || next.previousRecordSha256 !== null
      || acceptedReceipt !== null) {
      fail('INITIAL_STATE_INVALID');
    }
  } else if (next.previousRecordSha256 !== expectedRecordSha256
    || (next.status === 'FAILED') !== (acceptedReceipt === null)) {
    fail('TRANSITION_ENVELOPE_INVALID');
  }
  if (acceptedReceipt !== null
    && (acceptedReceipt.disposition === 'RETRY_REQUIRED'
      || acceptedReceipt.migrationRunId !== migrationRunId
      || acceptedReceipt.batchReceiptSha256
        !== next.lastBatchReceiptSha256)) {
    fail('RECEIPT_BINDING_INVALID');
  }
  return Object.freeze({
    migrationRunId,
    expectedRecordSha256,
    next,
    acceptedReceipt,
  });
}

async function applyCompareAndSet(
  runtime: Readonly<
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1
  >,
  driverSession: unknown,
  input: NormalizedCasInputV1,
): Promise<boolean> {
  if (input.expectedRecordSha256 === null) {
    const result = await runtime.runs.updateOne(
      { _id: input.migrationRunId },
      { $setOnInsert: storedRunDocument(input.next) },
      { session: driverSession, upsert: true },
    );
    return result.upsertedCount === 1;
  }
  const currentDocument = await runtime.runs.findOne(
    { _id: input.migrationRunId },
    { session: driverSession, readPreference: 'primary' },
  );
  if (currentDocument === null) return false;
  const current = storedRunRecord(currentDocument);
  if (current.recordSha256 !== input.expectedRecordSha256) return false;
  const derived = input.acceptedReceipt === null
    ? failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(current, {
      failureCode: input.next.failureCode!,
      failedAt: input.next.updatedAt,
    })
    : advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      current,
      input.acceptedReceipt,
    );
  if (derived.recordSha256 !== input.next.recordSha256) {
    fail('DERIVED_TRANSITION_MISMATCH');
  }
  const replaced = await runtime.runs.replaceOne({
    _id: input.migrationRunId,
    recordSha256: input.expectedRecordSha256,
  }, storedRunDocument(input.next), { session: driverSession });
  if (replaced.matchedCount !== 1) return false;
  if (input.acceptedReceipt !== null) {
    await retainReceipt(
      runtime.receipts,
      driverSession,
      input.acceptedReceipt,
      input.next,
    );
  }
  return true;
}

async function retainReceipt(
  collection:
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1,
  driverSession: unknown,
  receipt: MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  acceptedRecord: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
): Promise<void> {
  const document = storedReceiptDocument(receipt, acceptedRecord);
  await collection.updateOne(
    { _id: receipt.batchReceiptSha256 },
    { $setOnInsert: document },
    { session: driverSession, upsert: true },
  );
  const stored = await collection.findOne(
    { _id: receipt.batchReceiptSha256 },
    { session: driverSession, readPreference: 'primary' },
  );
  if (stored === null
    || canonicalizeEditronJsonV1(storedReceipt(stored, acceptedRecord))
      !== canonicalizeEditronJsonV1(receipt)) {
    fail('RECEIPT_WRITE_NOT_DURABLE');
  }
}

function storedRunDocument(
  recordInput: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
): Readonly<MongoRecord> {
  const record =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(recordInput);
  return Object.freeze({
    _id: record.migrationRunId,
    schemaVersion: 1,
    kind: RUN_DOCUMENT_KIND_V1,
    migrationRunId: record.migrationRunId,
    policyVersion: record.policyVersion,
    status: record.status,
    recordVersion: record.recordVersion,
    recordSha256: record.recordSha256,
    upperBoundCursor: record.upperBoundCursor,
    currentCursor: record.currentCursor,
    record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    terminalAt: record.terminalAt === null ? null : new Date(record.terminalAt),
  });
}

function storedRunRecord(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  const document = objectRecord(value, 'RUN_DOCUMENT_INVALID');
  exactKeys(document, [
    '_id',
    'createdAt',
    'currentCursor',
    'kind',
    'migrationRunId',
    'policyVersion',
    'record',
    'recordSha256',
    'recordVersion',
    'schemaVersion',
    'status',
    'terminalAt',
    'updatedAt',
    'upperBoundCursor',
  ], 'RUN_DOCUMENT_FIELDS_INVALID');
  const record =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
      document.record,
    );
  if (document._id !== record.migrationRunId
    || document.schemaVersion !== 1
    || document.kind !== RUN_DOCUMENT_KIND_V1
    || document.migrationRunId !== record.migrationRunId
    || document.policyVersion !== record.policyVersion
    || document.status !== record.status
    || document.recordVersion !== record.recordVersion
    || document.recordSha256 !== record.recordSha256
    || canonicalizeEditronJsonV1(document.upperBoundCursor)
      !== canonicalizeEditronJsonV1(record.upperBoundCursor)
    || canonicalizeEditronJsonV1(document.currentCursor)
      !== canonicalizeEditronJsonV1(record.currentCursor)
    || dateIso(document.createdAt, 'RUN_CREATED_AT') !== record.createdAt
    || dateIso(document.updatedAt, 'RUN_UPDATED_AT') !== record.updatedAt
    || nullableDateIso(document.terminalAt, 'RUN_TERMINAL_AT')
      !== record.terminalAt) {
    fail('RUN_DOCUMENT_ENVELOPE_INVALID');
  }
  return record;
}

function storedReceiptDocument(
  receipt: MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  acceptedRecord: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
): Readonly<MongoRecord> {
  return Object.freeze({
    _id: receipt.batchReceiptSha256,
    schemaVersion: 1,
    kind: RECEIPT_DOCUMENT_KIND_V1,
    migrationRunId: receipt.migrationRunId,
    batchReceiptSha256: receipt.batchReceiptSha256,
    acceptedRecordVersion: acceptedRecord.recordVersion,
    acceptedRecordSha256: acceptedRecord.recordSha256,
    receipt,
    createdAt: new Date(receipt.completedAt),
  });
}

function storedReceipt(
  value: unknown,
  acceptedRecord: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 {
  const document = objectRecord(value, 'RECEIPT_DOCUMENT_INVALID');
  exactKeys(document, [
    '_id',
    'acceptedRecordSha256',
    'acceptedRecordVersion',
    'batchReceiptSha256',
    'createdAt',
    'kind',
    'migrationRunId',
    'receipt',
    'schemaVersion',
  ], 'RECEIPT_DOCUMENT_FIELDS_INVALID');
  const receipt =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1(
      document.receipt,
    );
  if (document._id !== receipt.batchReceiptSha256
    || document.schemaVersion !== 1
    || document.kind !== RECEIPT_DOCUMENT_KIND_V1
    || document.migrationRunId !== receipt.migrationRunId
    || document.batchReceiptSha256 !== receipt.batchReceiptSha256
    || document.acceptedRecordVersion !== acceptedRecord.recordVersion
    || document.acceptedRecordSha256 !== acceptedRecord.recordSha256
    || dateIso(document.createdAt, 'RECEIPT_CREATED_AT')
      !== receipt.completedAt) {
    fail('RECEIPT_DOCUMENT_ENVELOPE_INVALID');
  }
  return receipt;
}

async function loadDefaultRuntime(): Promise<Readonly<
  MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1
>> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    runs: wrapCollection(
      db.collection(
        MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_COLLECTION_V1,
      ),
    ),
    receipts: wrapCollection(
      db.collection(
        MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECEIPT_COLLECTION_V1,
      ),
    ),
  };
}

function wrapSession(
  session: ClientSession,
): MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1 {
  return {
    driverSession: session,
    withTransaction: (operation, options) => (
      session.withTransaction(operation, options)
    ),
    endSession: () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter, options) => collection.findOne(
      filter as Filter<Document>,
      {
        ...(options?.session
          ? { session: options.session as ClientSession }
          : {}),
        ...(options?.readPreference
          ? { readPreference: options.readPreference }
          : {}),
      } as FindOptions,
    ) as Promise<MongoRecord | null>,
    updateOne: async (filter, update, options) => {
      const result = await collection.updateOne(
        filter as Filter<Document>,
        update as UpdateFilter<Document>,
        { session: options.session as ClientSession, upsert: options.upsert },
      );
      return {
        matchedCount: result.matchedCount,
        upsertedCount: result.upsertedCount,
      };
    },
    replaceOne: (filter, replacement, options) => collection.replaceOne(
      filter as Filter<Document>,
      replacement,
      { session: options.session as ClientSession },
    ),
  };
}

function objectRecord(value: unknown, code: string): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as MongoRecord;
}

function exactKeys(
  record: MongoRecord,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    fail(code);
  }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    fail('IDENTIFIER_INVALID');
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('SHA256_INVALID');
  }
  return value;
}

function dateIso(value: unknown, code: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return value.toISOString();
}

function nullableDateIso(value: unknown, code: string): string | null {
  return value === null ? null : dateIso(value, code);
}

function duplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object'
    && (error as { code?: unknown }).code === 11000);
}

function fail(code: string): never {
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_MONGO_LEDGER_' + code,
  );
}
