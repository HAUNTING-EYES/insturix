import type {
  Collection,
  Document,
  Filter,
  FindOptions,
  ReplaceOptions,
  UpdateFilter,
} from 'mongodb';

import {
  assertMediaProxyMasterR2MultipartRecordV1,
  beginMediaProxyMasterR2MultipartCompletionV1,
  beginMediaProxyMasterR2MultipartSessionInitiationV1,
  bindMediaProxyMasterR2MultipartUploadIdV1,
  createMediaProxyMasterR2MultipartIntentRecordV1,
  publishMediaProxyMasterR2MultipartRecordV1,
  recordMediaProxyMasterR2MultipartCleanupFailureV1,
  recordMediaProxyMasterR2MultipartPartV1,
  renewMediaProxyMasterR2MultipartLeaseV1,
  requestMediaProxyMasterR2MultipartAbortV1,
  resolveMediaProxyMasterR2MultipartCleanupV1,
  takeOverMediaProxyMasterR2MultipartRecordV1,
  type MediaProxyMasterR2MultipartRecordV1,
} from './media-proxy-master-r2-multipart-record-v1';

type MongoRecord = Record<string, unknown>;
type CreateInput = Parameters<
  typeof createMediaProxyMasterR2MultipartIntentRecordV1
>[0];
type TakeoverInput = Parameters<
  typeof takeOverMediaProxyMasterR2MultipartRecordV1
>[1];
type RenewLeaseInput = Parameters<
  typeof renewMediaProxyMasterR2MultipartLeaseV1
>[1];
type BeginSessionInput = Parameters<
  typeof beginMediaProxyMasterR2MultipartSessionInitiationV1
>[1];
type BindUploadIdInput = Parameters<
  typeof bindMediaProxyMasterR2MultipartUploadIdV1
>[1];
type RecordPartInput = Parameters<
  typeof recordMediaProxyMasterR2MultipartPartV1
>[1];
type BeginCompletionInput = Parameters<
  typeof beginMediaProxyMasterR2MultipartCompletionV1
>[1];
type PublishInput = Parameters<
  typeof publishMediaProxyMasterR2MultipartRecordV1
>[1];
type RequestAbortInput = Parameters<
  typeof requestMediaProxyMasterR2MultipartAbortV1
>[1];
type CleanupFailureInput = Parameters<
  typeof recordMediaProxyMasterR2MultipartCleanupFailureV1
>[1];
type CleanupResolutionInput = Parameters<
  typeof resolveMediaProxyMasterR2MultipartCleanupV1
>[1];

export const MEDIA_PROXY_MASTER_R2_MULTIPART_COLLECTION_V1 =
  'editron_media_proxy_master_r2_multipart_v1' as const;

export interface MediaProxyMasterR2MultipartMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options: Readonly<{ readPreference: 'primary' }>,
  ): Promise<MongoRecord | null>;
  findOneAndUpdate(
    filter: Readonly<MongoRecord>,
    update: Readonly<{ $setOnInsert: Readonly<MongoRecord> }>,
    options: Readonly<{
      upsert: true;
      returnDocument: 'after';
      writeConcern: Readonly<{ w: 'majority' }>;
    }>,
  ): Promise<MongoRecord | null>;
  replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    options: Readonly<{ writeConcern: Readonly<{ w: 'majority' }> }>,
  ): Promise<Readonly<{ matchedCount: number }>>;
}

export interface MediaProxyMasterR2MultipartStoreV1 {
  createOrGet(input: CreateInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  get(recordId: string): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  > | null>;
  getBySessionObjectKey(objectKey: string): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  > | null>;
  takeOver(recordId: string, input: TakeoverInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  renewLease(recordId: string, input: RenewLeaseInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  beginSession(recordId: string, input: BeginSessionInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  bindUploadId(recordId: string, input: BindUploadIdInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  recordPart(recordId: string, input: RecordPartInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  beginCompletion(
    recordId: string,
    input: BeginCompletionInput,
  ): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>>;
  publish(recordId: string, input: PublishInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  requestAbort(recordId: string, input: RequestAbortInput): Promise<Readonly<
    MediaProxyMasterR2MultipartRecordV1
  >>;
  recordCleanupFailure(
    recordId: string,
    input: CleanupFailureInput,
  ): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>>;
  resolveCleanup(
    recordId: string,
    input: CleanupResolutionInput,
  ): Promise<Readonly<MediaProxyMasterR2MultipartRecordV1>>;
}

export function createMediaProxyMasterR2MultipartMongoStoreV1(
  input: Readonly<{
    loadCollection?: () => Promise<Readonly<
      MediaProxyMasterR2MultipartMongoCollectionV1
    >>;
  }> = {},
): Readonly<MediaProxyMasterR2MultipartStoreV1> {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<Readonly<
    MediaProxyMasterR2MultipartMongoCollectionV1
  >> | null = null;
  let indexPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndexes = async () => {
    indexPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex(
        { recordId: 1 },
        { name: 'uniq_proxy_master_r2_multipart_record_v1', unique: true },
      );
      await resolved.createIndex(
        { sessionObjectKeys: 1 },
        { name: 'lookup_proxy_master_r2_multipart_session_key_v1' },
      );
      await resolved.createIndex(
        { status: 1, leaseExpiresAt: 1, updatedAt: 1 },
        { name: 'recovery_proxy_master_r2_multipart_v1' },
      );
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  const read = async (recordIdInput: string) => {
    await ensureIndexes();
    const stored = await (await collection()).findOne(
      { _id: recordId(recordIdInput) },
      { readPreference: 'primary' },
    );
    return stored ? storedRecord(stored) : null;
  };
  const mutate = async (
    recordIdInput: string,
    transition: (record: Readonly<MediaProxyMasterR2MultipartRecordV1>) =>
      Readonly<MediaProxyMasterR2MultipartRecordV1>,
  ) => {
    const current = await read(recordIdInput);
    if (!current) fail('RECORD_NOT_FOUND');
    const next = transition(current!);
    if (next.recordSha256 === current!.recordSha256) return current!;
    const result = await (await collection()).replaceOne({
      _id: current!.recordId,
      recordSha256: current!.recordSha256,
      sequence: current!.sequence,
      leaseFence: current!.lease.fence,
      leaseTokenSha256: current!.lease.tokenSha256,
    }, storedDocument(next), { writeConcern: { w: 'majority' } });
    if (result.matchedCount !== 1) fail('COMPARE_AND_SET_LOST');
    return next;
  };

  const store: MediaProxyMasterR2MultipartStoreV1 = {
    createOrGet: async (createInput) => {
      await ensureIndexes();
      const candidate = createMediaProxyMasterR2MultipartIntentRecordV1(
        createInput,
      );
      const stored = await (await collection()).findOneAndUpdate(
        { _id: candidate.recordId },
        { $setOnInsert: storedDocument(candidate) },
        {
          upsert: true,
          returnDocument: 'after',
          writeConcern: { w: 'majority' },
        },
      );
      if (!stored) fail('CREATE_NOT_ACKNOWLEDGED');
      const record = storedRecord(stored!);
      if (record.recordId !== candidate.recordId
        || record.artifactBindingSha256 !== candidate.artifactBindingSha256) {
        fail('CREATE_IDENTITY_CONFLICT');
      }
      return record;
    },
    get: read,
    getBySessionObjectKey: async (objectKeyInput) => {
      await ensureIndexes();
      const stored = await (await collection()).findOne(
        { sessionObjectKeys: sessionObjectKey(objectKeyInput) },
        { readPreference: 'primary' },
      );
      return stored ? storedRecord(stored) : null;
    },
    takeOver: (id, request) => mutate(
      id,
      (record) => takeOverMediaProxyMasterR2MultipartRecordV1(record, request),
    ),
    renewLease: (id, request) => mutate(
      id,
      (record) => renewMediaProxyMasterR2MultipartLeaseV1(record, request),
    ),
    beginSession: (id, request) => mutate(
      id,
      (record) => beginMediaProxyMasterR2MultipartSessionInitiationV1(
        record,
        request,
      ),
    ),
    bindUploadId: (id, request) => mutate(
      id,
      (record) => bindMediaProxyMasterR2MultipartUploadIdV1(record, request),
    ),
    recordPart: (id, request) => mutate(
      id,
      (record) => recordMediaProxyMasterR2MultipartPartV1(record, request),
    ),
    beginCompletion: (id, request) => mutate(
      id,
      (record) => beginMediaProxyMasterR2MultipartCompletionV1(record, request),
    ),
    publish: (id, request) => mutate(
      id,
      (record) => publishMediaProxyMasterR2MultipartRecordV1(record, request),
    ),
    requestAbort: (id, request) => mutate(
      id,
      (record) => requestMediaProxyMasterR2MultipartAbortV1(record, request),
    ),
    recordCleanupFailure: (id, request) => mutate(
      id,
      (record) => recordMediaProxyMasterR2MultipartCleanupFailureV1(
        record,
        request,
      ),
    ),
    resolveCleanup: (id, request) => mutate(
      id,
      (record) => resolveMediaProxyMasterR2MultipartCleanupV1(record, request),
    ),
  };
  return Object.freeze(store);
}

function storedDocument(
  value: Readonly<MediaProxyMasterR2MultipartRecordV1>,
): Readonly<MongoRecord> {
  const record = assertMediaProxyMasterR2MultipartRecordV1(value);
  const current = record.sessions.at(-1) ?? null;
  return Object.freeze({
    _id: record.recordId,
    version: record.version,
    recordId: record.recordId,
    artifactBindingSha256: record.artifactBindingSha256,
    jobId: record.artifact.jobId,
    status: record.status,
    sequence: record.sequence,
    recordSha256: record.recordSha256,
    leaseFence: record.lease.fence,
    leaseTokenSha256: record.lease.tokenSha256,
    leaseExpiresAt: new Date(record.lease.expiresAt),
    sessionObjectKeys: record.sessions.map((session) => session.objectKey),
    currentSessionObjectKey: current?.objectKey ?? null,
    currentUploadId: current?.uploadId ?? null,
    record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  });
}

function storedRecord(
  value: Readonly<MongoRecord>,
): Readonly<MediaProxyMasterR2MultipartRecordV1> {
  exactKeys(value, [
    '_id', 'artifactBindingSha256', 'createdAt', 'currentSessionObjectKey',
    'currentUploadId', 'jobId', 'leaseExpiresAt', 'leaseFence',
    'leaseTokenSha256', 'record', 'recordId', 'recordSha256', 'sequence',
    'sessionObjectKeys', 'status', 'updatedAt', 'version',
  ], 'STORED_ENVELOPE_FIELDS_INVALID');
  const record = assertMediaProxyMasterR2MultipartRecordV1(value.record);
  const expected = storedDocument(record);
  for (const key of Object.keys(expected)) {
    if (key === 'record') continue;
    if (key === 'createdAt' || key === 'updatedAt' || key === 'leaseExpiresAt') {
      if (dateIso(value[key], key) !== dateIso(expected[key], key)) {
        fail('STORED_ENVELOPE_INVALID');
      }
      continue;
    }
    if (key === 'sessionObjectKeys') {
      if (!sameStringArray(value[key], expected[key])) fail('STORED_ENVELOPE_INVALID');
      continue;
    }
    if (value[key] !== expected[key]) fail('STORED_ENVELOPE_INVALID');
  }
  return record;
}

async function loadDefaultCollection(): Promise<Readonly<
  MediaProxyMasterR2MultipartMongoCollectionV1
>> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { db } = await connectToDatabase();
  return wrapCollection(db.collection(MEDIA_PROXY_MASTER_R2_MULTIPART_COLLECTION_V1));
}

function wrapCollection(
  collection: Collection<Document>,
): MediaProxyMasterR2MultipartMongoCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter, options) => collection.findOne(
      filter as Filter<Document>,
      { readPreference: options.readPreference } as FindOptions,
    ) as Promise<MongoRecord | null>,
    findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(
      filter as Filter<Document>,
      update as UpdateFilter<Document>,
      {
        upsert: options.upsert,
        returnDocument: options.returnDocument,
        writeConcern: options.writeConcern,
      },
    ) as Promise<MongoRecord | null>,
    replaceOne: (filter, replacement, options) => collection.replaceOne(
      filter as Filter<Document>,
      replacement,
      { writeConcern: options.writeConcern } as ReplaceOptions,
    ),
  };
}

function recordId(value: unknown): string {
  if (typeof value !== 'string' || !/^mpmr2mpu_[a-f0-9]{64}$/.test(value)) {
    fail('RECORD_ID_INVALID');
  }
  return value;
}

function sessionObjectKey(value: unknown): string {
  if (typeof value !== 'string'
    || !/^editron-proxy-multipart\/v1\/[a-f0-9]{64}\/session-(?:[1-9]|1[0-9]|20)\.mp4$/.test(value)) {
    fail('SESSION_OBJECT_KEY_INVALID');
  }
  return value;
}

function exactKeys(
  value: Readonly<MongoRecord>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(code);
}

function dateIso(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail(`${label.toUpperCase()}_INVALID`);
  }
  return value.toISOString();
}

function sameStringArray(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => typeof value === 'string' && value === right[index]);
}

function fail(code: string): never {
  throw new MediaProxyMasterR2MultipartMongoStoreErrorV1(code);
}

export class MediaProxyMasterR2MultipartMongoStoreErrorV1 extends Error {
  constructor(code: string) {
    super(`MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_${code}`);
    this.name = 'MediaProxyMasterR2MultipartMongoStoreErrorV1';
  }
}
