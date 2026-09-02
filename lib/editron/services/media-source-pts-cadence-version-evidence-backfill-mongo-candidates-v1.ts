import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  TransactionOptions,
} from 'mongodb';

import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 }
  from './media-source-pts-cadence-map-asset-owner-v3';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

type MongoRecord = Record<string, unknown>;

const SIMPLE_COLLATION_V1 = Object.freeze({ locale: 'simple' as const });
const PRIMARY_READ_V1 = 'primary' as const;
const MAJORITY_READ_CONCERN_V1 = Object.freeze({ level: 'majority' as const });
const SNAPSHOT_TRANSACTION_V1 = Object.freeze({
  readConcern: Object.freeze({ level: 'snapshot' as const }),
  writeConcern: Object.freeze({ w: 'majority' as const }),
  readPreference: PRIMARY_READ_V1,
});
const MEDIA_ASSET_IDENTITY_INDEX_V1 = 'assetId_userId';
const IDENTIFIER_PATTERN_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SHA256_PATTERN_V1 = /^[a-f0-9]{64}$/;
const IDENTITY_PROJECTION_V1 = Object.freeze({
  _id: 0,
  assetId: 1,
  userId: 1,
});
const CANDIDATE_PROJECTION_V1 = Object.freeze({
  _id: 0,
  assetId: 1,
  userId: 1,
  orgId: 1,
  type: 1,
  sourceVersionV1: 1,
  sourceQualificationV1: 1,
  sourcePtsCadenceMapV3: 1,
  sourcePtsCadenceMapStateSha256V3: 1,
});

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_PAGE_MAX_V1 = 101;

export type MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 = Readonly<{
  assetId: string;
  userId: string;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1 = Readonly<{
  assetId: string;
  userId: string;
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
}>;

type CandidateFindOptionsV1 = Readonly<{
  projection: Readonly<MongoRecord>;
  sort?: Readonly<MongoRecord>;
  limit?: number;
  collation: typeof SIMPLE_COLLATION_V1;
  hint: typeof MEDIA_ASSET_IDENTITY_INDEX_V1;
  readPreference: typeof PRIMARY_READ_V1;
  readConcern?: typeof MAJORITY_READ_CONCERN_V1;
  session?: unknown;
}>;

export interface MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1 {
  findOne(
    filter: Readonly<MongoRecord>,
    options: CandidateFindOptionsV1,
  ): Promise<MongoRecord | null>;
  findMany(
    filter: Readonly<MongoRecord>,
    options: CandidateFindOptionsV1,
  ): Promise<readonly MongoRecord[]>;
}

export interface MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1 {
  driverSession: unknown;
  withTransaction<T>(
    operation: () => Promise<T>,
    options: Readonly<typeof SNAPSHOT_TRANSACTION_V1>,
  ): Promise<T>;
  endSession(): Promise<void>;
}

export interface MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1 {
  startSession(): Promise<
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1
  >;
  mediaAssets: MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1;
}

export type MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1 =
  Readonly<{
    resolveUpperBound(): Promise<
      MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null
    >;
    loadCandidates(input: Readonly<{
      afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
      upperBoundCursor:
        MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
      limit: number;
    }>): Promise<
      readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[]
    >;
  }>;

/**
 * Freezes one historical MEDIA_ASSETS keyspace and pages only COMPLETE V3
 * roots. It reads no private PTS object and makes no claim that evidence has
 * already been retained or that a proxy/master relation is qualified.
 */
export function createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1(
  loadRuntime: () => Promise<
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1
  > = loadDefaultRuntime,
): MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1 {
  return Object.freeze({
    resolveUpperBound: async () => {
      const runtime = await loadRuntime();
      assertRuntime(runtime);
      const session = await runtime.startSession();
      let upperBound:
        MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null = null;
      try {
        await session.withTransaction(async () => {
          const invalidIdentity = await runtime.mediaAssets.findOne(
            invalidIdentityFilter(),
            findOptions({
              projection: IDENTITY_PROJECTION_V1,
              session: session.driverSession,
            }),
          );
          if (invalidIdentity !== null) pageFail('IDENTITY_INVALID');
          const last = await runtime.mediaAssets.findOne(
            validIdentityFilter(),
            findOptions({
              projection: IDENTITY_PROJECTION_V1,
              sort: { assetId: -1, userId: -1 },
              session: session.driverSession,
            }),
          );
          upperBound = last === null ? null : cursorFromDocument(last);
        }, SNAPSHOT_TRANSACTION_V1);
      } finally {
        await session.endSession();
      }
      return upperBound === null ? null : frozen(upperBound);
    },
    loadCandidates: async (input) => {
      const normalized = normalizePageInput(input);
      if (normalized.upperBoundCursor === null) return Object.freeze([]);
      const runtime = await loadRuntime();
      assertRuntime(runtime);
      const documents = await runtime.mediaAssets.findMany(
        candidateFilter(
          normalized.afterCursor,
          normalized.upperBoundCursor,
        ),
        findOptions({
          projection: CANDIDATE_PROJECTION_V1,
          sort: { assetId: 1, userId: 1 },
          limit: normalized.limit,
          readConcern: MAJORITY_READ_CONCERN_V1,
        }),
      );
      return candidatePage(
        documents,
        normalized.afterCursor,
        normalized.upperBoundCursor,
        normalized.limit,
      );
    },
  });
}

async function loadDefaultRuntime(): Promise<
  MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1
> {
  const { COLLECTIONS, connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    mediaAssets: wrapCollection(db.collection(COLLECTIONS.MEDIA_ASSETS)),
  };
}

function wrapSession(
  session: ClientSession,
): MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1 {
  return {
    driverSession: session,
    withTransaction: (operation, options) => session.withTransaction(
      async () => operation(),
      options as TransactionOptions,
    ),
    endSession: async () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1 {
  return {
    findOne: async (filter, options) => {
      const stored = await collection.findOne(
        filter as Filter<Document>,
        options as unknown as FindOptions,
      );
      return stored as MongoRecord | null;
    },
    findMany: async (filter, options) => {
      const stored = await collection.find(
        filter as Filter<Document>,
        options as unknown as FindOptions,
      ).toArray();
      return stored as MongoRecord[];
    },
  };
}

function invalidIdentityFilter(): Readonly<MongoRecord> {
  return {
    $or: [
      { assetId: { $not: IDENTIFIER_PATTERN_V1 } },
      { userId: { $not: IDENTIFIER_PATTERN_V1 } },
    ],
  };
}

function validIdentityFilter(): Readonly<MongoRecord> {
  return {
    assetId: IDENTIFIER_PATTERN_V1,
    userId: IDENTIFIER_PATTERN_V1,
  };
}

function candidateFilter(
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  upperBoundCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
): Readonly<MongoRecord> {
  const clauses: MongoRecord[] = [
    validIdentityFilter(),
    {
      'sourcePtsCadenceMapV3.status': 'COMPLETE',
      'sourcePtsCadenceMapV3.terminalReceipt.disposition': 'PUBLISHED',
      'sourcePtsCadenceMapV3.verificationReceipt.disposition':
        'EPOCH_ARTIFACT_SET_VERIFIED',
      sourcePtsCadenceMapStateSha256V3: SHA256_PATTERN_V1,
    },
    {
      $or: [
        { assetId: { $lt: upperBoundCursor.assetId } },
        {
          assetId: upperBoundCursor.assetId,
          userId: { $lte: upperBoundCursor.userId },
        },
      ],
    },
  ];
  if (afterCursor !== null) {
    clauses.push({
      $or: [
        { assetId: { $gt: afterCursor.assetId } },
        {
          assetId: afterCursor.assetId,
          userId: { $gt: afterCursor.userId },
        },
      ],
    });
  }
  return { $and: clauses };
}

function candidatePage(
  documents: readonly MongoRecord[],
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  upperBoundCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
  limit: number,
): readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[] {
  if (!Array.isArray(documents) || documents.length > limit) {
    pageFail('RESULT_COUNT_INVALID');
  }
  const candidates: MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[] = [];
  let previous = afterCursor;
  for (const document of documents) {
    if (!plainRecord(document)) pageFail('DOCUMENT_INVALID');
    const cursor = cursorFromDocument(document);
    if ((previous !== null && compareCursor(cursor, previous) <= 0)
      || compareCursor(cursor, upperBoundCursor) > 0) {
      pageFail('ORDER_INVALID');
    }
    assertCanonicalSourceScope(document, cursor);
    candidates.push(frozen({
      ...cursor,
      asset: projectedAsset(document, cursor.assetId),
    }));
    previous = cursor;
  }
  return Object.freeze(candidates);
}

function projectedAsset(
  document: MongoRecord,
  assetId: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1['asset'] {
  const asset: MongoRecord = { assetId };
  for (const field of [
    'type',
    'sourceVersionV1',
    'sourceQualificationV1',
    'sourcePtsCadenceMapV3',
    'sourcePtsCadenceMapStateSha256V3',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(document, field)) {
      asset[field] = document[field];
    }
  }
  return frozen(asset) as MediaSourcePtsCadenceMapAssetStateInputV3;
}

function assertCanonicalSourceScope(
  document: MongoRecord,
  cursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
): void {
  let sourceVersion: ReturnType<typeof assertMediaSourceVersionV1>;
  try {
    sourceVersion = assertMediaSourceVersionV1(document.sourceVersionV1);
  } catch {
    return;
  }
  if (sourceVersion.assetId !== cursor.assetId
    || sourceVersion.mediaKind !== document.type) {
    pageFail('SOURCE_SCOPE_MISMATCH');
  }
  if (sourceVersion.owner.kind === 'USER') {
    if (sourceVersion.owner.userId !== cursor.userId) {
      pageFail('OWNER_SCOPE_MISMATCH');
    }
    return;
  }
  if (!IDENTIFIER_PATTERN_V1.test(String(document.orgId ?? ''))
    || sourceVersion.owner.orgId !== document.orgId) {
    pageFail('OWNER_SCOPE_MISMATCH');
  }
}

function normalizePageInput(input: Readonly<{
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  upperBoundCursor:
    MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  limit: number;
}>): Readonly<{
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  upperBoundCursor:
    MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  limit: number;
}> {
  if (!input || !Number.isSafeInteger(input.limit)
    || input.limit < 1
    || input.limit
      > MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_PAGE_MAX_V1) {
    pageFail('INPUT_INVALID');
  }
  const afterCursor = input.afterCursor === null
    ? null
    : normalizeCursor(input.afterCursor);
  const upperBoundCursor = input.upperBoundCursor === null
    ? null
    : normalizeCursor(input.upperBoundCursor);
  if ((upperBoundCursor === null && afterCursor !== null)
    || (upperBoundCursor !== null && afterCursor !== null
      && compareCursor(afterCursor, upperBoundCursor) > 0)) {
    pageFail('INPUT_INVALID');
  }
  return frozen({ afterCursor, upperBoundCursor, limit: input.limit });
}

function findOptions(input: Readonly<{
  projection: Readonly<MongoRecord>;
  sort?: Readonly<MongoRecord>;
  limit?: number;
  readConcern?: typeof MAJORITY_READ_CONCERN_V1;
  session?: unknown;
}>): CandidateFindOptionsV1 {
  return Object.freeze({
    projection: input.projection,
    ...(input.sort ? { sort: input.sort } : {}),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    collation: SIMPLE_COLLATION_V1,
    hint: MEDIA_ASSET_IDENTITY_INDEX_V1,
    readPreference: PRIMARY_READ_V1,
    ...(input.readConcern ? { readConcern: input.readConcern } : {}),
    ...(input.session === undefined ? {} : { session: input.session }),
  });
}

function cursorFromDocument(
  document: MongoRecord,
): MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 {
  return normalizeCursor({ assetId: document.assetId, userId: document.userId });
}

function normalizeCursor(value: Readonly<{
  assetId: unknown;
  userId: unknown;
}>): MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 {
  return frozen({
    assetId: identifier(value.assetId),
    userId: identifier(value.userId),
  });
}

function compareCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
): number {
  return left.assetId === right.assetId
    ? compareIdentifier(left.userId, right.userId)
    : compareIdentifier(left.assetId, right.assetId);
}

function compareIdentifier(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN_V1.test(value)) {
    pageFail('IDENTITY_INVALID');
  }
  return value;
}

function plainRecord(value: unknown): value is MongoRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function assertRuntime(
  runtime: MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1,
): void {
  if (!runtime || typeof runtime.startSession !== 'function'
    || !runtime.mediaAssets
    || typeof runtime.mediaAssets.findOne !== 'function'
    || typeof runtime.mediaAssets.findMany !== 'function') {
    throw new Error(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_MONGO_RUNTIME_INVALID',
    );
  }
}

function pageFail(code: string): never {
  throw new MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1(
    code,
  );
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(
    cloneCanonicalEditronJsonV1(value),
  ) as Readonly<T>;
}

export class MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_CANDIDATE_PAGE_'
      + code,
    );
    this.name =
      'MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1';
  }
}
