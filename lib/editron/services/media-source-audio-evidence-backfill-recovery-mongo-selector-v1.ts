import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  TransactionOptions,
  UpdateFilter,
} from 'mongodb';

import { MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_COLLECTION_V1 }
  from './media-source-audio-evidence-backfill-mongo-ledger-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
} from './media-source-audio-evidence-backfill-recovery-attempt-policy-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from './media-source-audio-evidence-backfill-run-record-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  createMediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  selectMediaSourceAudioEvidenceBackfillRecoverySweepV1,
  type MediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  type MediaSourceAudioEvidenceBackfillRecoveryOrderCursorV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1,
  parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-mongo-document-v1';
import { createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1 }
  from './media-source-audio-evidence-backfill-recovery-sweep-state-v1';

type MongoRecord = Record<string, unknown>;
type MongoInsert = Readonly<{ $setOnInsert: Readonly<MongoRecord> }>;

const RUN_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_DOCUMENT_V1' as const;
const CONTROLLER_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_DOCUMENT_V1' as const;
const RUN_RECOVERY_INDEX_V1 = 'audio_evidence_backfill_recovery_v1' as const;
const CONTROLLER_INDEX_V1 =
  'uniq_audio_evidence_backfill_recovery_controller_v1' as const;
const SWEEP_CONTROLLER_VERSION_INDEX_V1 =
  'uniq_audio_evidence_backfill_recovery_sweep_controller_version_v1' as const;
const SWEEP_RETRY_INDEX_V1 =
  'audio_evidence_backfill_recovery_sweep_retry_v1' as const;
const MAX_SELECTION_ATTEMPTS_V1 = 3;
const PRIMARY_READ_V1 = 'primary' as const;
const TRANSACTION_OPTIONS_V1 = Object.freeze({
  readConcern: Object.freeze({ level: 'snapshot' as const }),
  writeConcern: Object.freeze({ w: 'majority' as const }),
  readPreference: PRIMARY_READ_V1,
});

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_COLLECTION_V1 =
  'editron_media_source_audio_evidence_backfill_recovery_controllers_v1' as const;
export interface MediaSourceAudioEvidenceBackfillRecoveryMongoSessionV1 {
  driverSession: unknown;
  withTransaction<T>(
    operation: () => Promise<T>,
    options: typeof TRANSACTION_OPTIONS_V1,
  ): Promise<T | undefined>;
  endSession(): Promise<void>;
}

export interface MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options?: Readonly<{
      session?: unknown;
      readPreference?: typeof PRIMARY_READ_V1;
    }>,
  ): Promise<MongoRecord | null>;
  findMany(
    filter: Readonly<MongoRecord>,
    options: Readonly<{
      projection: Readonly<Record<string, 1>>;
      sort: Readonly<Record<string, 1>>;
      limit: number;
      hint: string;
      session: unknown;
      readPreference: typeof PRIMARY_READ_V1;
    }>,
  ): Promise<readonly MongoRecord[]>;
  updateOne(
    filter: Readonly<MongoRecord>,
    update: MongoInsert,
    options: Readonly<{ session: unknown; upsert: true }>,
  ): Promise<Readonly<{ upsertedCount: number }>>;
  replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ matchedCount: number }>>;
}

export interface MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1 {
  startSession(): Promise<MediaSourceAudioEvidenceBackfillRecoveryMongoSessionV1>;
  runs: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1;
  controllers: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1;
  sweeps: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1;
}

export type MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1 =
  Readonly<
    | {
        disposition: 'NO_CANDIDATES';
        controller: MediaSourceAudioEvidenceBackfillRecoveryControllerV1;
      }
    | {
        disposition: 'SELECTED';
        controller: MediaSourceAudioEvidenceBackfillRecoveryControllerV1;
        intent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1;
      }
  >;

export class MediaSourceAudioEvidenceBackfillRecoveryMongoSelectorErrorV1
  extends Error {
  constructor(
    public readonly code: string,
    public readonly retryableRace = false,
  ) {
    super('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MONGO_' + code);
    this.name = 'MediaSourceAudioEvidenceBackfillRecoveryMongoSelectorErrorV1';
  }
}

export function createMediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1(
  input: Readonly<{
    loadRuntime?: () => Promise<
      Readonly<MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1>
    >;
  }> = {},
): Readonly<{
  selectNext(value: Readonly<{
    controllerId: string;
    staleBefore: Date;
    selectedAt: Date;
    limit: number;
    attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1;
  }>): Promise<MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1>;
}> {
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<
    MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1
  >> | null = null;
  let indexesPromise: Promise<void> | null = null;
  const runtime = () => {
    runtimePromise ??= loadRuntime();
    return runtimePromise;
  };
  const ensureIndexes = async () => {
    indexesPromise ??= runtime().then(async (resolved) => {
      await resolved.runs.createIndex(
        { status: 1, updatedAt: 1, migrationRunId: 1 },
        { name: RUN_RECOVERY_INDEX_V1 },
      );
      await resolved.controllers.createIndex(
        { controllerId: 1 },
        { name: CONTROLLER_INDEX_V1, unique: true },
      );
      await resolved.sweeps.createIndex(
        { controllerId: 1, controllerRecordVersion: 1 },
        { name: SWEEP_CONTROLLER_VERSION_INDEX_V1, unique: true },
      );
      await resolved.sweeps.createIndex(
        { status: 1, nextAttemptAt: 1, updatedAt: 1 },
        { name: SWEEP_RETRY_INDEX_V1 },
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
    selectNext: async (value) => {
      const normalized = normalizeSelectionInput(value);
      await ensureIndexes();
      const resolved = await runtime();
      for (let attempt = 1; attempt <= MAX_SELECTION_ATTEMPTS_V1; attempt += 1) {
        try {
          return await selectInTransaction(resolved, normalized);
        } catch (error) {
          if (attempt === MAX_SELECTION_ATTEMPTS_V1
            || !retryableSelectionRace(error)) {
            throw error;
          }
        }
      }
      return fail('SELECTION_RETRY_EXHAUSTED');
    },
  });
}

type NormalizedSelectionInputV1 = Readonly<{
  controllerId: string;
  staleBefore: Date;
  selectedAt: Date;
  limit: number;
  attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1;
}>;

async function selectInTransaction(
  runtime: Readonly<MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1>,
  input: NormalizedSelectionInputV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1> {
  const session = await runtime.startSession();
  let callbackCompleted = false;
  let result: MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1
    | null = null;
  try {
    await session.withTransaction(async () => {
      callbackCompleted = false;
      result = await selectInSnapshot(runtime, session.driverSession, input);
      callbackCompleted = true;
      return result;
    }, TRANSACTION_OPTIONS_V1);
    if (!callbackCompleted || result === null) fail('TRANSACTION_NOT_COMMITTED');
    return result;
  } finally {
    await session.endSession();
  }
}

async function selectInSnapshot(
  runtime: Readonly<MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1>,
  driverSession: unknown,
  input: NormalizedSelectionInputV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoverySelectionResultV1> {
  const storedCurrent = await runtime.controllers.findOne(
    { _id: input.controllerId },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  const current = storedCurrent === null
    ? createMediaSourceAudioEvidenceBackfillRecoveryControllerV1({
      controllerId: input.controllerId,
      createdAt: input.selectedAt.toISOString(),
    })
    : storedControllerRecord(storedCurrent);
  const forward = await loadCandidatePage(
    runtime.runs,
    driverSession,
    input.staleBefore,
    current.cursor,
    input.limit,
  );
  const wrapped = forward.length === 0 && current.cursor !== null;
  const candidates = wrapped
    ? await loadCandidatePage(
      runtime.runs,
      driverSession,
      input.staleBefore,
      null,
      input.limit,
    )
    : forward;
  if (candidates.length === 0) {
    const persisted = storedCurrent === null
      ? await insertController(runtime.controllers, driverSession, current)
      : current;
    return Object.freeze({
      disposition: 'NO_CANDIDATES' as const,
      controller: persisted,
    });
  }
  const selected = selectMediaSourceAudioEvidenceBackfillRecoverySweepV1(
    current,
    {
      candidates,
      wrapped,
      staleBefore: input.staleBefore.toISOString(),
      selectedAt: input.selectedAt.toISOString(),
    },
  );
  await insertSweepIntent(
    runtime.sweeps,
    driverSession,
    selected.intent,
    input.attemptPolicy,
  );
  if (storedCurrent === null) {
    await insertController(
      runtime.controllers,
      driverSession,
      selected.nextController,
    );
  } else {
    const replaced = await runtime.controllers.replaceOne({
      _id: current.controllerId,
      recordSha256: current.recordSha256,
    }, storedControllerDocument(selected.nextController), {
      session: driverSession,
    });
    if (replaced.matchedCount !== 1) race('CONTROLLER_CAS_LOST');
  }
  const durableController = await runtime.controllers.findOne(
    { _id: current.controllerId },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  const durableSweep = await runtime.sweeps.findOne(
    { _id: selected.intent.sweepIntentSha256 },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  if (durableController === null || durableSweep === null) {
    fail('SELECTION_WRITE_NOT_DURABLE');
  }
  const controller = storedControllerRecord(durableController);
  const sweep =
    parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
      durableSweep,
    );
  if (controller.recordSha256 !== selected.nextController.recordSha256
    || sweep.status !== 'PENDING'
    || sweep.intent.sweepIntentSha256 !== selected.intent.sweepIntentSha256
    || sweep.attemptPolicy.policySha256
      !== input.attemptPolicy.policySha256) {
    fail('SELECTION_WRITE_MISMATCH');
  }
  return Object.freeze({
    disposition: 'SELECTED' as const,
    controller,
    intent: sweep.intent,
  });
}

async function loadCandidatePage(
  collection: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1,
  driverSession: unknown,
  staleBefore: Date,
  after: MediaSourceAudioEvidenceBackfillRecoveryOrderCursorV1 | null,
  limit: number,
): Promise<readonly MediaSourceAudioEvidenceBackfillRunRecordV1[]> {
  const documents = await collection.findMany(
    candidateFilter(staleBefore, after),
    {
      projection: {
        _id: 1,
        kind: 1,
        migrationRunId: 1,
        record: 1,
        recordSha256: 1,
        schemaVersion: 1,
        status: 1,
        updatedAt: 1,
      },
      sort: { updatedAt: 1, migrationRunId: 1 },
      limit,
      hint: RUN_RECOVERY_INDEX_V1,
      session: driverSession,
      readPreference: PRIMARY_READ_V1,
    },
  );
  if (!Array.isArray(documents) || documents.length > limit) {
    fail('CANDIDATE_PAGE_INVALID');
  }
  const records = documents.map((document) => candidateRecord(
    document,
    staleBefore,
    after,
  ));
  assertCandidateOrder(records);
  return Object.freeze(records);
}

function candidateFilter(
  staleBefore: Date,
  after: MediaSourceAudioEvidenceBackfillRecoveryOrderCursorV1 | null,
): Readonly<MongoRecord> {
  const base: MongoRecord = {
    schemaVersion: 1,
    kind: RUN_DOCUMENT_KIND_V1,
    status: 'RUNNING',
    updatedAt: { $lte: staleBefore },
  };
  if (after === null) return base;
  return {
    $and: [
      base,
      {
        $or: [
          { updatedAt: { $gt: new Date(after.runUpdatedAt) } },
          {
            updatedAt: new Date(after.runUpdatedAt),
            migrationRunId: { $gt: after.migrationRunId },
          },
        ],
      },
    ],
  };
}

function candidateRecord(
  value: unknown,
  staleBefore: Date,
  after: MediaSourceAudioEvidenceBackfillRecoveryOrderCursorV1 | null,
): MediaSourceAudioEvidenceBackfillRunRecordV1 {
  const document = objectRecord(value, 'CANDIDATE_DOCUMENT_INVALID');
  exactKeys(document, [
    '_id',
    'kind',
    'migrationRunId',
    'record',
    'recordSha256',
    'schemaVersion',
    'status',
    'updatedAt',
  ], 'CANDIDATE_DOCUMENT_FIELDS_INVALID');
  const record = assertMediaSourceAudioEvidenceBackfillRunRecordV1(
    document.record,
  );
  const updatedAt = dateIso(document.updatedAt, 'CANDIDATE_UPDATED_AT_INVALID');
  if (document._id !== record.migrationRunId
    || document.kind !== RUN_DOCUMENT_KIND_V1
    || document.migrationRunId !== record.migrationRunId
    || document.recordSha256 !== record.recordSha256
    || document.schemaVersion !== 1
    || document.status !== record.status
    || updatedAt !== record.updatedAt
    || record.status !== 'RUNNING'
    || Date.parse(updatedAt) > staleBefore.getTime()
    || (after !== null && compareOrder({
      runUpdatedAt: updatedAt,
      migrationRunId: record.migrationRunId,
    }, after) <= 0)) {
    fail('CANDIDATE_DOCUMENT_ENVELOPE_INVALID');
  }
  return record;
}

async function insertController(
  collection: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1,
  driverSession: unknown,
  controller: MediaSourceAudioEvidenceBackfillRecoveryControllerV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoveryControllerV1> {
  const result = await collection.updateOne(
    { _id: controller.controllerId },
    { $setOnInsert: storedControllerDocument(controller) },
    { session: driverSession, upsert: true },
  );
  if (result.upsertedCount !== 1) race('CONTROLLER_CREATE_RACED');
  const stored = await collection.findOne(
    { _id: controller.controllerId },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  if (stored === null) fail('CONTROLLER_WRITE_NOT_DURABLE');
  const durable = storedControllerRecord(stored);
  if (durable.recordSha256 !== controller.recordSha256) {
    fail('CONTROLLER_WRITE_MISMATCH');
  }
  return durable;
}

async function insertSweepIntent(
  collection: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1,
  driverSession: unknown,
  intent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
  attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
): Promise<void> {
  const result = await collection.updateOne(
    { _id: intent.sweepIntentSha256 },
    {
      $setOnInsert:
        createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
          createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
            intent,
            attemptPolicy,
          ),
        ),
    },
    { session: driverSession, upsert: true },
  );
  if (result.upsertedCount !== 1) race('SWEEP_CREATE_RACED');
}

function storedControllerDocument(
  input: MediaSourceAudioEvidenceBackfillRecoveryControllerV1,
): Readonly<MongoRecord> {
  const record = assertMediaSourceAudioEvidenceBackfillRecoveryControllerV1(
    input,
  );
  return Object.freeze({
    _id: record.controllerId,
    schemaVersion: 1,
    kind: CONTROLLER_DOCUMENT_KIND_V1,
    controllerId: record.controllerId,
    recordVersion: record.recordVersion,
    recordSha256: record.recordSha256,
    record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  });
}

function storedControllerRecord(
  value: unknown,
): MediaSourceAudioEvidenceBackfillRecoveryControllerV1 {
  const document = objectRecord(value, 'CONTROLLER_DOCUMENT_INVALID');
  exactKeys(document, [
    '_id',
    'controllerId',
    'createdAt',
    'kind',
    'record',
    'recordSha256',
    'recordVersion',
    'schemaVersion',
    'updatedAt',
  ], 'CONTROLLER_DOCUMENT_FIELDS_INVALID');
  const record = assertMediaSourceAudioEvidenceBackfillRecoveryControllerV1(
    document.record,
  );
  if (document._id !== record.controllerId
    || document.schemaVersion !== 1
    || document.kind !== CONTROLLER_DOCUMENT_KIND_V1
    || document.controllerId !== record.controllerId
    || document.recordVersion !== record.recordVersion
    || document.recordSha256 !== record.recordSha256
    || dateIso(document.createdAt, 'CONTROLLER_CREATED_AT_INVALID')
      !== record.createdAt
    || dateIso(document.updatedAt, 'CONTROLLER_UPDATED_AT_INVALID')
      !== record.updatedAt) {
    fail('CONTROLLER_DOCUMENT_ENVELOPE_INVALID');
  }
  return record;
}

function assertCandidateOrder(
  records: readonly MediaSourceAudioEvidenceBackfillRunRecordV1[],
): void {
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1]!;
    const current = records[index]!;
    if (compareOrder({
      runUpdatedAt: previous.updatedAt,
      migrationRunId: previous.migrationRunId,
    }, {
      runUpdatedAt: current.updatedAt,
      migrationRunId: current.migrationRunId,
    }) >= 0) {
      fail('CANDIDATE_ORDER_INVALID');
    }
  }
}

function compareOrder(
  left: MediaSourceAudioEvidenceBackfillRecoveryOrderCursorV1,
  right: MediaSourceAudioEvidenceBackfillRecoveryOrderCursorV1,
): number {
  if (left.runUpdatedAt !== right.runUpdatedAt) {
    return left.runUpdatedAt < right.runUpdatedAt ? -1 : 1;
  }
  return left.migrationRunId === right.migrationRunId
    ? 0
    : left.migrationRunId < right.migrationRunId ? -1 : 1;
}

function normalizeSelectionInput(value: Readonly<{
  controllerId: string;
  staleBefore: Date;
  selectedAt: Date;
  limit: number;
  attemptPolicy: MediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1;
}>): NormalizedSelectionInputV1 {
  const staleBefore = date(value.staleBefore, 'STALE_BEFORE_INVALID');
  const selectedAt = date(value.selectedAt, 'SELECTED_AT_INVALID');
  if (staleBefore.getTime() > selectedAt.getTime()) {
    fail('SELECTION_TIME_INVALID');
  }
  if (!Number.isSafeInteger(value.limit)
    || value.limit < 1
    || value.limit > 100) {
    fail('SELECTION_LIMIT_INVALID');
  }
  return Object.freeze({
    controllerId: identifier(value.controllerId),
    staleBefore,
    selectedAt,
    limit: value.limit,
    attemptPolicy:
      assertMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1(
        value.attemptPolicy,
      ),
  });
}

async function loadDefaultRuntime(): Promise<Readonly<
  MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1
>> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    runs: wrapCollection(
      db.collection(MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_COLLECTION_V1),
    ),
    controllers: wrapCollection(db.collection(
      MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_CONTROLLER_COLLECTION_V1,
    )),
    sweeps: wrapCollection(db.collection(
      MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1,
    )),
  };
}

function wrapSession(
  session: ClientSession,
): MediaSourceAudioEvidenceBackfillRecoveryMongoSessionV1 {
  return {
    driverSession: session,
    withTransaction: (operation, options) => session.withTransaction(
      operation,
      options as TransactionOptions,
    ),
    endSession: () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1 {
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
    findMany: async (filter, options) => collection.find(
      filter as Filter<Document>,
      options as unknown as FindOptions,
    ).toArray() as Promise<MongoRecord[]>,
    updateOne: async (filter, update, options) => {
      const result = await collection.updateOne(
        filter as Filter<Document>,
        update as UpdateFilter<Document>,
        { session: options.session as ClientSession, upsert: true },
      );
      return {
        upsertedCount: result.upsertedCount,
      };
    },
    replaceOne: async (filter, replacement, options) => {
      const result = await collection.replaceOne(
        filter as Filter<Document>,
        replacement,
        { session: options.session as ClientSession },
      );
      return { matchedCount: result.matchedCount };
    },
  };
}

function retryableSelectionRace(error: unknown): boolean {
  return Boolean(error && typeof error === 'object'
    && ((error as { code?: unknown }).code === 11000
      || (error instanceof
        MediaSourceAudioEvidenceBackfillRecoveryMongoSelectorErrorV1
        && error.retryableRace)));
}

function race(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillRecoveryMongoSelectorErrorV1(
    code,
    true,
  );
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

function date(value: unknown, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return new Date(value.getTime());
}

function dateIso(value: unknown, code: string): string {
  return date(value, code).toISOString();
}

function fail(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillRecoveryMongoSelectorErrorV1(code);
}
