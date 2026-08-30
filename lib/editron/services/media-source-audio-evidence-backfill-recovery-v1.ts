import type { Collection, Document, Filter, FindOptions } from 'mongodb';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
  dispatchMediaSourceAudioEvidenceBackfillMessageV1,
  resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1,
  type MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1,
  type MediaSourceAudioEvidenceBackfillDispatchResultV1,
  type MediaSourceAudioEvidenceBackfillQStashPublisherV1,
} from './media-source-audio-evidence-backfill-dispatch-v1';
import { MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_COLLECTION_V1 }
  from './media-source-audio-evidence-backfill-mongo-ledger-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from './media-source-audio-evidence-backfill-run-record-v1';

const RUN_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_DOCUMENT_V1' as const;
const RECOVERY_RECEIPT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RECEIPT_V1' as const;
const RECOVERY_INDEX_NAME_V1 =
  'audio_evidence_backfill_recovery_v1' as const;
const MAX_RECOVERY_RUN_LIMIT_V1 = 100;
const MIN_RECOVERY_STALE_MS_V1 =
  2 * MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1.timeoutSeconds
    * 1_000;
const MAX_RECOVERY_STALE_MS_V1 = 7 * 24 * 60 * 60 * 1_000;

const RECOVERY_STALE_MS_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS' as const;
const RECOVERY_RUN_LIMIT_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT' as const;
const RECOVERY_BATCH_LIMIT_ENV =
  'EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT' as const;

type MongoRecord = Record<string, unknown>;

export type MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV1 =
  MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1 & Readonly<{
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT?: string;
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT?: string;
  }>;

export type MediaSourceAudioEvidenceBackfillRecoveryConfigurationV1 =
  Readonly<{
    staleMs: number;
    runLimit: number;
    batchLimit: number;
  }>;

export interface MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string }>,
  ): Promise<string>;
  findMany(
    filter: Readonly<MongoRecord>,
    options: Readonly<{
      projection: Readonly<Record<string, 1>>;
      sort: Readonly<Record<string, 1>>;
      limit: number;
      hint: string;
      readConcern: Readonly<{ level: 'majority' }>;
      readPreference: 'primary';
    }>,
  ): Promise<readonly MongoRecord[]>;
}

export type MediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1 =
  Readonly<{
    listStaleRunning(input: Readonly<{
      staleBefore: Date;
      limit: number;
    }>): Promise<readonly MediaSourceAudioEvidenceBackfillRunRecordV1[]>;
  }>;

type DispatchFailureV1 = Readonly<{
  disposition: 'UNCONFIRMED';
  reason: 'DISPATCH_RUNTIME_UNAVAILABLE';
  messageId: null;
  deduplicationId: null;
}>;

export type MediaSourceAudioEvidenceBackfillRecoveryResultV1 = Readonly<{
  migrationRunId: string;
  expectedRecordSha256: string;
  runUpdatedAt: string;
  dispatch: MediaSourceAudioEvidenceBackfillDispatchResultV1
    | DispatchFailureV1;
}>;

type RecoveryReceiptMaterialV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof RECOVERY_RECEIPT_KIND_V1;
  selectedAt: string;
  staleBefore: string;
  staleMs: number;
  runLimit: number;
  batchLimit: number;
  selectedCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
  results: readonly MediaSourceAudioEvidenceBackfillRecoveryResultV1[];
}>;

export type MediaSourceAudioEvidenceBackfillRecoveryReceiptV1 =
  RecoveryReceiptMaterialV1 & Readonly<{
    recoveryReceiptSha256: string;
  }>;

type DispatcherV1 = typeof dispatchMediaSourceAudioEvidenceBackfillMessageV1;

export class MediaSourceAudioEvidenceBackfillRecoveryErrorV1 extends Error {
  constructor(public readonly code: string) {
    super('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_' + code);
    this.name = 'MediaSourceAudioEvidenceBackfillRecoveryErrorV1';
  }
}

export function resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1(
  environment: MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV1,
): MediaSourceAudioEvidenceBackfillRecoveryConfigurationV1 {
  return Object.freeze({
    staleMs: requiredInteger(
      environment[RECOVERY_STALE_MS_ENV],
      'STALE_MS',
      MIN_RECOVERY_STALE_MS_V1,
      MAX_RECOVERY_STALE_MS_V1,
    ),
    runLimit: requiredInteger(
      environment[RECOVERY_RUN_LIMIT_ENV],
      'RUN_LIMIT',
      1,
      MAX_RECOVERY_RUN_LIMIT_V1,
    ),
    batchLimit: requiredInteger(
      environment[RECOVERY_BATCH_LIMIT_ENV],
      'BATCH_LIMIT',
      1,
      100,
    ),
  });
}

export function createMediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1(
  input: Readonly<{
    loadCollection?: () => Promise<
      MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1
    >;
  }> = {},
): MediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1 {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<
    MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1
  > | null = null;
  let indexPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndex = async () => {
    indexPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex(
        { status: 1, updatedAt: 1, migrationRunId: 1 },
        { name: RECOVERY_INDEX_NAME_V1 },
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
    listStaleRunning: async (inputValue) => {
      const staleBefore = validDate(inputValue.staleBefore, 'STALE_BEFORE');
      const limit = boundedInteger(
        inputValue.limit,
        'RUN_LIMIT',
        1,
        MAX_RECOVERY_RUN_LIMIT_V1,
      );
      await ensureIndex();
      const documents = await (await collection()).findMany({
        schemaVersion: 1,
        kind: RUN_DOCUMENT_KIND_V1,
        status: 'RUNNING',
        updatedAt: { $lte: staleBefore },
      }, {
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
        hint: RECOVERY_INDEX_NAME_V1,
        readConcern: { level: 'majority' },
        readPreference: 'primary',
      });
      if (!Array.isArray(documents) || documents.length > limit) {
        fail('CANDIDATE_PAGE_INVALID');
      }
      const records = documents.map((document) => recoveryCandidate(
        document,
        staleBefore,
      ));
      assertCandidateOrder(records);
      return Object.freeze(records);
    },
  });
}

export async function recoverMediaSourceAudioEvidenceBackfillRunsV1(
  dependencies: Readonly<{
    environment?: MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV1;
    candidateSource?: MediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1;
    dispatch?: DispatcherV1;
    publisher?: Readonly<MediaSourceAudioEvidenceBackfillQStashPublisherV1>;
    now?: Date;
  }> = {},
): Promise<MediaSourceAudioEvidenceBackfillRecoveryReceiptV1> {
  const environment = dependencies.environment ?? processEnvironment();
  const configuration =
    resolveMediaSourceAudioEvidenceBackfillRecoveryConfigurationV1(environment);
  const dispatchConfiguration =
    resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1(environment);
  if (!dispatchConfiguration.configured) {
    fail('DISPATCH_' + dispatchConfiguration.reason);
  }
  const now = validDate(dependencies.now ?? new Date(), 'NOW');
  const staleBefore = new Date(now.getTime() - configuration.staleMs);
  const candidates = await (
    dependencies.candidateSource
      ?? createMediaSourceAudioEvidenceBackfillRecoveryCandidateSourceV1()
  ).listStaleRunning({
    staleBefore,
    limit: configuration.runLimit,
  });
  if (candidates.length > configuration.runLimit) fail('CANDIDATE_PAGE_INVALID');

  const dispatch = dependencies.dispatch
    ?? dispatchMediaSourceAudioEvidenceBackfillMessageV1;
  const results: MediaSourceAudioEvidenceBackfillRecoveryResultV1[] = [];
  for (const candidate of candidates) {
    const record = assertMediaSourceAudioEvidenceBackfillRunRecordV1(candidate);
    if (record.status !== 'RUNNING'
      || Date.parse(record.updatedAt) > staleBefore.getTime()) {
      fail('CANDIDATE_NOT_STALE_RUNNING');
    }
    let delivery: MediaSourceAudioEvidenceBackfillDispatchResultV1
      | DispatchFailureV1;
    try {
      delivery = dispatchResult(await dispatch({
        message: {
          schemaVersion: 1,
          kind: 'RUN_NEXT_BATCH',
          migrationRunId: record.migrationRunId,
          expectedRecordSha256: record.recordSha256,
          batchLimit: configuration.batchLimit,
        },
        deliveryPolicy:
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
        environment,
        ...(dependencies.publisher
          ? { publisher: dependencies.publisher }
          : {}),
      }));
    } catch {
      delivery = Object.freeze({
        disposition: 'UNCONFIRMED' as const,
        reason: 'DISPATCH_RUNTIME_UNAVAILABLE' as const,
        messageId: null,
        deduplicationId: null,
      });
    }
    results.push(Object.freeze({
      migrationRunId: record.migrationRunId,
      expectedRecordSha256: record.recordSha256,
      runUpdatedAt: record.updatedAt,
      dispatch: delivery,
    }));
  }
  const frozenResults = Object.freeze(results);
  const unconfirmedCount = frozenResults.filter(
    (result) => result.dispatch.disposition === 'UNCONFIRMED',
  ).length;
  const material: RecoveryReceiptMaterialV1 = Object.freeze({
    schemaVersion: 1,
    kind: RECOVERY_RECEIPT_KIND_V1,
    selectedAt: now.toISOString(),
    staleBefore: staleBefore.toISOString(),
    staleMs: configuration.staleMs,
    runLimit: configuration.runLimit,
    batchLimit: configuration.batchLimit,
    selectedCount: frozenResults.length,
    confirmedCount: frozenResults.length - unconfirmedCount,
    unconfirmedCount,
    results: frozenResults,
  });
  return Object.freeze({
    ...material,
    recoveryReceiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

async function loadDefaultCollection(): Promise<
  MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1
> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { db } = await connectToDatabase();
  return wrapCollection(
    db.collection(MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_COLLECTION_V1),
  );
}

function wrapCollection(
  collection: Collection<Document>,
): MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findMany: async (filter, options) => collection.find(
      filter as Filter<Document>,
      options as FindOptions,
    ).toArray() as Promise<MongoRecord[]>,
  };
}

function recoveryCandidate(
  value: unknown,
  staleBefore: Date,
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
  if (document._id !== record.migrationRunId
    || document.kind !== RUN_DOCUMENT_KIND_V1
    || document.migrationRunId !== record.migrationRunId
    || document.recordSha256 !== record.recordSha256
    || document.schemaVersion !== 1
    || document.status !== record.status
    || dateIso(document.updatedAt, 'CANDIDATE_UPDATED_AT') !== record.updatedAt
    || record.status !== 'RUNNING'
    || Date.parse(record.updatedAt) > staleBefore.getTime()) {
    fail('CANDIDATE_DOCUMENT_ENVELOPE_INVALID');
  }
  return record;
}

function assertCandidateOrder(
  records: readonly MediaSourceAudioEvidenceBackfillRunRecordV1[],
): void {
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1]!;
    const current = records[index]!;
    if (previous.updatedAt > current.updatedAt
      || (previous.updatedAt === current.updatedAt
        && previous.migrationRunId >= current.migrationRunId)) {
      fail('CANDIDATE_ORDER_INVALID');
    }
  }
}

function processEnvironment():
  MediaSourceAudioEvidenceBackfillRecoveryEnvironmentV1 {
  return {
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_STALE_MS,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_RUN_LIMIT,
    EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT:
      process.env.EDITRON_MEDIA_AUDIO_EVIDENCE_BACKFILL_RECOVERY_BATCH_LIMIT,
  };
}

function requiredInteger(
  raw: string | undefined,
  code: string,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) {
    fail(code + '_CONFIG_INVALID');
  }
  return boundedInteger(Number(raw), code, minimum, maximum);
}

function boundedInteger(
  value: unknown,
  code: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < minimum
    || Number(value) > maximum) {
    fail(code + '_INVALID');
  }
  return Number(value);
}

function validDate(value: unknown, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return new Date(value.getTime());
}

function dateIso(value: unknown, code: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return value.toISOString();
}

function dispatchResult(
  value: unknown,
): MediaSourceAudioEvidenceBackfillDispatchResultV1 {
  const result = objectRecord(value, 'DISPATCH_RESULT_INVALID');
  if (result.disposition === 'DISPATCHED'
    || result.disposition === 'DEDUPLICATED') {
    exactKeys(result, [
      'deduplicationId',
      'disposition',
      'messageId',
    ], 'DISPATCH_RESULT_FIELDS_INVALID');
    return Object.freeze({
      disposition: result.disposition,
      messageId: transportIdentifier(result.messageId),
      deduplicationId: sha256(result.deduplicationId),
    });
  }
  if (result.disposition === 'UNCONFIRMED') {
    exactKeys(result, [
      'deduplicationId',
      'disposition',
      'messageId',
      'reason',
    ], 'DISPATCH_RESULT_FIELDS_INVALID');
    if (result.messageId !== null
      || (result.reason !== 'QSTASH_PUBLISH_REJECTED'
        && result.reason !== 'QSTASH_MESSAGE_ID_INVALID')) {
      fail('DISPATCH_RESULT_INVALID');
    }
    return Object.freeze({
      disposition: 'UNCONFIRMED' as const,
      reason: result.reason,
      messageId: null,
      deduplicationId: sha256(result.deduplicationId),
    });
  }
  fail('DISPATCH_RESULT_INVALID');
}

function transportIdentifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail('DISPATCH_MESSAGE_ID_INVALID');
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('DISPATCH_DEDUPLICATION_ID_INVALID');
  }
  return value;
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

function fail(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillRecoveryErrorV1(code);
}
