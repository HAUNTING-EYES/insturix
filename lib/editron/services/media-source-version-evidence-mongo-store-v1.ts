import type {
  Collection,
  Document,
  Filter,
  UpdateFilter,
} from 'mongodb';

import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceVersionEvidenceRecordV1,
  mediaSourceVersionEvidenceScopeV1,
  type MediaSourceVersionEvidenceRecordV1,
  type MediaSourceVersionEvidenceScopeV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import type { MediaSourceOwnerV1 } from './media-source-version-v1';

type MongoRecord = Record<string, unknown>;
type PrimaryReadV1 = Readonly<{ readPreference: 'primary' }>;
type MajorityUpdateOptionsV1 = Readonly<{
  upsert: boolean;
  writeConcern: Readonly<{ w: 'majority' }>;
}>;
type MongoUpdateV1 = Readonly<{
  $set?: Readonly<MongoRecord>;
  $setOnInsert?: Readonly<MongoRecord>;
}>;

const PRIMARY_READ_V1: PrimaryReadV1 = Object.freeze({
  readPreference: 'primary',
});
const MAJORITY_WRITE_V1 = Object.freeze({ w: 'majority' as const });
const DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_VERSION_EVIDENCE_DOCUMENT_V1' as const;
const SCOPE_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_VERSION_EVIDENCE_SCOPE_V1' as const;

export const MEDIA_SOURCE_VERSION_EVIDENCE_COLLECTION_V1 =
  'editron_media_source_version_evidence_v1' as const;

export interface MediaSourceVersionEvidenceMongoCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options: PrimaryReadV1,
  ): Promise<MongoRecord | null>;
  updateOne(
    filter: Readonly<MongoRecord>,
    update: MongoUpdateV1,
    options: MajorityUpdateOptionsV1,
  ): Promise<Readonly<{ matchedCount: number; upsertedCount: number }>>;
}

/**
 * One document is the current immutable-root set for one exact source version.
 * The active MediaAsset slot is deliberately not part of this storage key.
 */
export function createMediaSourceVersionEvidenceMongoStorePortsV1(
  input: Readonly<{
    loadCollection?: () => Promise<Readonly<
      MediaSourceVersionEvidenceMongoCollectionV1
    >>;
  }> = {},
): Readonly<MediaSourceVersionEvidenceStorePortsV1> {
  const loadCollection = input.loadCollection ?? loadDefaultCollection;
  let collectionPromise: Promise<Readonly<
    MediaSourceVersionEvidenceMongoCollectionV1
  >> | null = null;
  let indexPromise: Promise<void> | null = null;
  const collection = () => {
    collectionPromise ??= loadCollection();
    return collectionPromise;
  };
  const ensureIndex = async () => {
    indexPromise ??= collection().then(async (resolved) => {
      await resolved.createIndex({
        'scope.owner.kind': 1,
        'scope.owner.userId': 1,
        'scope.owner.orgId': 1,
        'scope.assetId': 1,
        'scope.sourceVersionSha256': 1,
      }, {
        name: 'uniq_media_source_version_evidence_scope_v1',
        unique: true,
      });
    });
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  return Object.freeze({
    load: async (scopeValue) => {
      const scope = normalizeScope(scopeValue);
      await ensureIndex();
      return readStoredRecord(await collection(), scope);
    },
    compareAndSet: async (value) => {
      if (!value || typeof value !== 'object') fail('CAS_INPUT_INVALID');
      const scope = normalizeScope(value.scope);
      const expectedEvidenceSha256 = nullableSha256(
        value.expectedEvidenceSha256,
        'EXPECTED_HASH_INVALID',
      );
      const next = assertMediaSourceVersionEvidenceRecordV1(value.next);
      if (!sameScope(scope, mediaSourceVersionEvidenceScopeV1(next))) {
        fail('NEXT_SCOPE_MISMATCH');
      }
      await ensureIndex();
      const resolved = await collection();
      const scopeSha256 = scopeHash(scope);
      let result: Readonly<{ matchedCount: number; upsertedCount: number }>;
      try {
        result = expectedEvidenceSha256 === null
          ? await resolved.updateOne({
            _id: scopeSha256,
            scopeSha256,
            evidenceSha256: { $exists: false },
          }, {
            $setOnInsert: documentMaterial(scope, next, scopeSha256),
          }, {
            upsert: true,
            writeConcern: MAJORITY_WRITE_V1,
          })
          : await resolved.updateOne({
            _id: scopeSha256,
            scopeSha256,
            evidenceSha256: expectedEvidenceSha256,
            'record.evidenceSha256': expectedEvidenceSha256,
          }, {
            $set: {
              evidenceSha256: next.evidenceSha256,
              record: next,
            },
          }, {
            upsert: false,
            writeConcern: MAJORITY_WRITE_V1,
          });
      } catch (error) {
        if (expectedEvidenceSha256 === null && duplicateKey(error)) return false;
        throw error;
      }

      const applied = expectedEvidenceSha256 === null
        ? result.upsertedCount === 1
        : result.matchedCount === 1;
      if (!applied) return false;
      const persisted = await readStoredRecord(resolved, scope);
      if (persisted === null
        || canonicalizeEditronJsonV1(persisted)
          !== canonicalizeEditronJsonV1(next)) {
        fail('WRITE_NOT_DURABLE');
      }
      return true;
    },
  });
}

async function loadDefaultCollection(): Promise<Readonly<
  MediaSourceVersionEvidenceMongoCollectionV1
>> {
  const { getDatabase } = await import('../db/mongodb');
  const database = await getDatabase();
  return wrapCollection(database.collection(
    MEDIA_SOURCE_VERSION_EVIDENCE_COLLECTION_V1,
  ));
}

function wrapCollection(
  collection: Collection<Document>,
): MediaSourceVersionEvidenceMongoCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: async (filter, options) => {
      const stored = await collection.findOne(
        filter as Filter<Document>,
        options,
      );
      return stored as MongoRecord | null;
    },
    updateOne: async (filter, update, options) => {
      const result = await collection.updateOne(
        filter as Filter<Document>,
        update as UpdateFilter<Document>,
        options,
      );
      return {
        matchedCount: result.matchedCount,
        upsertedCount: result.upsertedCount,
      };
    },
  };
}

async function readStoredRecord(
  collection: MediaSourceVersionEvidenceMongoCollectionV1,
  expectedScope: MediaSourceVersionEvidenceScopeV1,
): Promise<MediaSourceVersionEvidenceRecordV1 | null> {
  const expectedScopeSha256 = scopeHash(expectedScope);
  const stored = await collection.findOne(
    { _id: expectedScopeSha256 },
    PRIMARY_READ_V1,
  );
  if (stored === null) return null;
  const document = objectRecord(stored, 'DOCUMENT_INVALID');
  exactKeys(document, [
    '_id', 'evidenceSha256', 'kind', 'record', 'schemaVersion', 'scope',
    'scopeSha256',
  ], 'DOCUMENT_FIELDS_INVALID');
  if (document.schemaVersion !== 1 || document.kind !== DOCUMENT_KIND_V1
    || document._id !== expectedScopeSha256
    || document.scopeSha256 !== expectedScopeSha256) {
    fail('DOCUMENT_IDENTITY_INVALID');
  }
  const storedScope = normalizeScope(document.scope);
  if (!sameScope(storedScope, expectedScope)
    || scopeHash(storedScope) !== expectedScopeSha256) {
    fail('DOCUMENT_SCOPE_INVALID');
  }
  const record = assertMediaSourceVersionEvidenceRecordV1(document.record);
  if (!sameScope(mediaSourceVersionEvidenceScopeV1(record), expectedScope)
    || record.evidenceSha256 !== sha256(
      document.evidenceSha256,
      'DOCUMENT_EVIDENCE_HASH_INVALID',
    )) {
    fail('DOCUMENT_RECORD_INVALID');
  }
  return record;
}

function documentMaterial(
  scope: MediaSourceVersionEvidenceScopeV1,
  record: MediaSourceVersionEvidenceRecordV1,
  scopeSha256: string,
): Readonly<MongoRecord> {
  return Object.freeze({
    schemaVersion: 1,
    kind: DOCUMENT_KIND_V1,
    scope,
    scopeSha256,
    evidenceSha256: record.evidenceSha256,
    record,
  });
}

function normalizeScope(value: unknown): MediaSourceVersionEvidenceScopeV1 {
  const scope = objectRecord(value, 'SCOPE_INVALID');
  exactKeys(scope, ['assetId', 'owner', 'sourceVersionSha256'], 'SCOPE_FIELDS_INVALID');
  return Object.freeze({
    owner: normalizeOwner(scope.owner),
    assetId: identity(scope.assetId, 'SCOPE_ASSET_ID_INVALID'),
    sourceVersionSha256: sha256(
      scope.sourceVersionSha256,
      'SCOPE_SOURCE_VERSION_HASH_INVALID',
    ),
  });
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const owner = objectRecord(value, 'SCOPE_OWNER_INVALID');
  if (owner.kind === 'USER') {
    exactKeys(owner, ['kind', 'userId'], 'SCOPE_OWNER_FIELDS_INVALID');
    return Object.freeze({
      kind: 'USER',
      userId: identity(owner.userId, 'SCOPE_USER_ID_INVALID'),
    });
  }
  if (owner.kind === 'ORG') {
    exactKeys(owner, ['kind', 'orgId'], 'SCOPE_OWNER_FIELDS_INVALID');
    return Object.freeze({
      kind: 'ORG',
      orgId: identity(owner.orgId, 'SCOPE_ORG_ID_INVALID'),
    });
  }
  fail('SCOPE_OWNER_KIND_INVALID');
}

function scopeHash(scope: MediaSourceVersionEvidenceScopeV1): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: SCOPE_KIND_V1,
    owner: scope.owner,
    assetId: scope.assetId,
    sourceVersionSha256: scope.sourceVersionSha256,
  });
}

function sameScope(
  left: MediaSourceVersionEvidenceScopeV1,
  right: MediaSourceVersionEvidenceScopeV1,
): boolean {
  return canonicalizeEditronJsonV1(left) === canonicalizeEditronJsonV1(right);
}

function objectRecord(value: unknown, code: string): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  return value as MongoRecord;
}

function exactKeys(value: MongoRecord, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function identity(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) fail(code);
  return value;
}

function nullableSha256(value: unknown, code: string): string | null {
  return value === null ? null : sha256(value, code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function duplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 11000);
}

function fail(code: string): never {
  throw new MediaSourceVersionEvidenceMongoStoreErrorV1(code);
}

export class MediaSourceVersionEvidenceMongoStoreErrorV1 extends Error {
  constructor(code: string) {
    super(`MEDIA_SOURCE_VERSION_EVIDENCE_MONGO_${code}`);
    this.name = 'MediaSourceVersionEvidenceMongoStoreErrorV1';
  }
}
