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
  assertProviderNativeCanonicalMediaIssuanceSetV2R,
  assertProviderNativeCanonicalMediaSourceVersionV2R,
  PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_COLLECTION_V2R,
  type ProviderNativeCanonicalMediaIssuanceLedgerV2R,
  type ProviderNativeCanonicalMediaSourceVersionV2R,
} from './provider-native-canonical-media-issuance-v2r';
import {
  assertProviderNativeCanonicalMediaArtifactBindingV2R,
  assertProviderNativeCanonicalMediaBindingRecordV2R,
  assertProviderNativeCanonicalMediaPolicyGrantV2R,
  PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_COLLECTION_V2R,
  PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_COLLECTION_V2R,
  PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_COLLECTION_V2R,
  type ProviderNativeCanonicalMediaArtifactBindingV2R,
  type ProviderNativeCanonicalMediaBindingRecordV2R,
  type ProviderNativeCanonicalMediaPolicyGrantV2R,
} from './provider-native-canonical-media-product-records-v2r';

type MongoRecord = Record<string, unknown>;
type MediaOwner = ProviderNativeCanonicalMediaSourceVersionV2R['mediaOwner'];
type IssuanceInput = Parameters<ProviderNativeCanonicalMediaIssuanceLedgerV2R['issueExact']>[0];

export const PROVIDER_NATIVE_CANONICAL_MEDIA_LEDGER_RECEIPT_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_LEDGER_RECEIPT_V2R_1' as const;

export interface ProviderNativeCanonicalMediaMongoSessionV2R {
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

export interface ProviderNativeCanonicalMediaMongoCollectionV2R {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown; projection?: Readonly<MongoRecord> }>,
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
}

export interface ProviderNativeCanonicalMediaMongoRuntimeV2R {
  startSession(): Promise<ProviderNativeCanonicalMediaMongoSessionV2R>;
  sourceVersions: ProviderNativeCanonicalMediaMongoCollectionV2R;
  bindings: ProviderNativeCanonicalMediaMongoCollectionV2R;
  policyGrants: ProviderNativeCanonicalMediaMongoCollectionV2R;
  artifactBindings: ProviderNativeCanonicalMediaMongoCollectionV2R;
  mediaAssets: ProviderNativeCanonicalMediaMongoCollectionV2R;
}

/**
 * Concrete persistence for the issuance ledger port. Canonical bytes remain
 * owned by mediaAssets/R2/GCS; this transaction writes identity metadata only.
 */
export function createProviderNativeCanonicalMediaMongoLedgerV2R(input: Readonly<{
  now?: () => string;
  loadRuntime?: () => Promise<Readonly<ProviderNativeCanonicalMediaMongoRuntimeV2R>>;
}> = {}): Readonly<ProviderNativeCanonicalMediaIssuanceLedgerV2R> {
  const now = input.now ?? (() => new Date().toISOString());
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<ProviderNativeCanonicalMediaMongoRuntimeV2R>> | null = null;
  let indexPromise: Promise<void> | null = null;
  const runtime = () => {
    runtimePromise ??= loadRuntime();
    return runtimePromise;
  };
  const ensureIndexes = async () => {
    indexPromise ??= runtime().then(createIndexes);
    try {
      await indexPromise;
    } catch (error) {
      indexPromise = null;
      throw error;
    }
  };

  return {
    issueExact: async (rawInput) => {
      const request = validatedInput(rawInput);
      assertCurrentAuthorization(request.policyGrant, now());
      await ensureIndexes();
      const resolved = await runtime();
      const session = await resolved.startSession();
      let completed = false;
      try {
        await session.withTransaction(async () => {
          completed = false;
          await assertMediaRows(resolved, session.driverSession, request);
          await createOrCompare(
            resolved.sourceVersions,
            request.sourceVersion.sourceVersionSha256,
            request.sourceVersion,
            session.driverSession,
            assertProviderNativeCanonicalMediaSourceVersionV2R,
            'SOURCE_VERSION',
          );
          await createOrCompare(
            resolved.bindings,
            bindingDocumentId(request.bindingRecord),
            request.bindingRecord,
            session.driverSession,
            assertProviderNativeCanonicalMediaBindingRecordV2R,
            'BINDING_RECORD',
          );
          await createOrCompare(
            resolved.policyGrants,
            request.policyGrant.authorizationSha256,
            request.policyGrant,
            session.driverSession,
            assertProviderNativeCanonicalMediaPolicyGrantV2R,
            'POLICY_GRANT',
          );
          for (const artifact of request.artifactBindings) {
            await createOrCompare(
              resolved.artifactBindings,
              artifactDocumentId(artifact),
              artifact,
              session.driverSession,
              assertProviderNativeCanonicalMediaArtifactBindingV2R,
              'ARTIFACT_BINDING',
            );
          }
          completed = true;
        }, {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        });
        if (!completed) fail('TRANSACTION_NOT_COMMITTED');
        return { ledgerReceiptSha256: ledgerReceipt(request) };
      } finally {
        await session.endSession();
      }
    },
  };
}

export class ProviderNativeCanonicalMediaMongoLedgerErrorV2R extends Error {}

function validatedInput(rawInput: Readonly<IssuanceInput>): Readonly<IssuanceInput> {
  const sourceVersion = assertProviderNativeCanonicalMediaSourceVersionV2R(
    rawInput.sourceVersion,
  );
  const bindingRecord = assertProviderNativeCanonicalMediaBindingRecordV2R(
    rawInput.bindingRecord,
  );
  const policyGrant = assertProviderNativeCanonicalMediaPolicyGrantV2R(
    rawInput.policyGrant,
  );
  const artifactBindings = rawInput.artifactBindings.map(
    (artifact) => assertProviderNativeCanonicalMediaArtifactBindingV2R(artifact),
  );
  assertProviderNativeCanonicalMediaIssuanceSetV2R(
    sourceVersion,
    bindingRecord.binding,
    policyGrant,
    artifactBindings,
  );
  return { sourceVersion, bindingRecord, policyGrant, artifactBindings };
}

function assertCurrentAuthorization(
  grant: Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R>,
  now: string,
): void {
  const current = Date.parse(now);
  if (!Number.isFinite(current)) fail('NOW_INVALID');
  if (grant.disposition !== 'AUTHORIZED') fail('POLICY_NOT_AUTHORIZED');
  if (current < Date.parse(grant.issuedAt)) fail('POLICY_NOT_YET_VALID');
  if (current >= Date.parse(grant.expiresAt)) fail('POLICY_EXPIRED');
}

async function createIndexes(
  runtime: Readonly<ProviderNativeCanonicalMediaMongoRuntimeV2R>,
): Promise<void> {
  await runtime.sourceVersions.createIndex(
    { sourceVersionSha256: 1 },
    { name: 'uniq_provider_media_source_version_v2r', unique: true },
  );
  await runtime.bindings.createIndex({
    'binding.scope.tenantId': 1,
    'binding.scope.userId': 1,
    'binding.scope.projectId': 1,
    'binding.scope.episodeId': 1,
    'binding.materialization.manifestSha256': 1,
    'binding.routeSha256': 1,
  }, { name: 'uniq_provider_media_binding_scope_v2r', unique: true });
  await runtime.policyGrants.createIndex(
    { authorizationSha256: 1 },
    { name: 'uniq_provider_media_policy_authorization_v2r', unique: true },
  );
  await runtime.artifactBindings.createIndex({
    'scope.tenantId': 1,
    'scope.userId': 1,
    'scope.projectId': 1,
    'scope.episodeId': 1,
    artifactId: 1,
    artifactVersionSha256: 1,
  }, { name: 'uniq_provider_media_artifact_scope_v2r', unique: true });
}

async function assertMediaRows(
  runtime: Readonly<ProviderNativeCanonicalMediaMongoRuntimeV2R>,
  session: unknown,
  request: Readonly<IssuanceInput>,
): Promise<void> {
  const source = await runtime.mediaAssets.findOne(
    mediaAssetFilter(request.sourceVersion.assetId, request.sourceVersion.mediaOwner),
    { session },
  );
  if (!source) fail('SOURCE_MEDIA_NOT_FOUND');
  assertMediaOwner(source, request.sourceVersion.mediaOwner, 'SOURCE');
  if (source.type !== request.sourceVersion.mediaKind
    || source.size !== request.sourceVersion.byteLength
    || source.contentHash !== request.sourceVersion.contentSha256
    || !source.referenceEnvelope
    || hashEditronCanonicalJsonV1(source.referenceEnvelope)
      !== request.sourceVersion.referenceEnvelopeSha256) {
    fail('SOURCE_MEDIA_IDENTITY_MISMATCH');
  }

  const expectedKind = request.bindingRecord.binding.materialization.arm === 'NATIVE_VIDEO'
    ? 'video'
    : 'image';
  for (const artifact of request.artifactBindings) {
    const stored = await runtime.mediaAssets.findOne(
      mediaAssetFilter(artifact.artifactId, artifact.mediaOwner),
      { session },
    );
    if (!stored) fail('ARTIFACT_MEDIA_NOT_FOUND');
    assertMediaOwner(stored, artifact.mediaOwner, 'ARTIFACT');
    const storageKey = artifact.storage.backend === 'R2' ? stored.r2Key : stored.gcsPath;
    if (stored.type !== expectedKind
      || stored.size !== artifact.byteLength
      || stored.contentHash !== artifact.bytesSha256
      || storageKey !== artifact.storage.key) {
      fail('ARTIFACT_MEDIA_IDENTITY_MISMATCH');
    }
  }
}

async function createOrCompare<T>(
  collection: Readonly<ProviderNativeCanonicalMediaMongoCollectionV2R>,
  documentId: string,
  expected: Readonly<T>,
  session: unknown,
  assertRecord: (value: unknown) => Readonly<T>,
  label: string,
): Promise<void> {
  const stored = await collection.findOneAndUpdate(
    { _id: documentId },
    { $setOnInsert: expected as Readonly<MongoRecord> },
    { session, upsert: true, returnDocument: 'after' },
  );
  if (!stored) fail(`${label}_WRITE_NOT_ACKNOWLEDGED`);
  let normalized: Readonly<T>;
  try {
    normalized = assertRecord(withoutMongoId(stored));
  } catch {
    fail(`${label}_STORED_RECORD_CORRUPT`);
  }
  if (hashEditronCanonicalJsonV1(normalized) !== hashEditronCanonicalJsonV1(expected)) {
    fail(`${label}_CONFLICT`);
  }
}

function bindingDocumentId(record: Readonly<ProviderNativeCanonicalMediaBindingRecordV2R>) {
  const binding = record.binding;
  return hashEditronCanonicalJsonV1({
    collection: PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_COLLECTION_V2R,
    scope: binding.scope,
    manifestSha256: binding.materialization.manifestSha256,
    routeSha256: binding.routeSha256,
  });
}

function artifactDocumentId(record: Readonly<ProviderNativeCanonicalMediaArtifactBindingV2R>) {
  return hashEditronCanonicalJsonV1({
    collection: PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_COLLECTION_V2R,
    scope: record.scope,
    artifactId: record.artifactId,
    artifactVersionSha256: record.artifactVersionSha256,
  });
}

function ledgerReceipt(request: Readonly<IssuanceInput>): string {
  return hashEditronCanonicalJsonV1({
    version: PROVIDER_NATIVE_CANONICAL_MEDIA_LEDGER_RECEIPT_V2R,
    sourceVersionSha256: request.sourceVersion.sourceVersionSha256,
    bindingRecordSha256: request.bindingRecord.recordSha256,
    policyRecordSha256: request.policyGrant.recordSha256,
    artifactBindingSha256s: request.artifactBindings
      .map(({ bindingSha256 }) => bindingSha256)
      .sort(),
  });
}

function mediaAssetFilter(assetId: string, owner: Readonly<MediaOwner>): Readonly<MongoRecord> {
  return owner.type === 'ORG'
    ? { assetId, orgId: owner.orgId }
    : { assetId, userId: owner.userId };
}

function assertMediaOwner(
  stored: Readonly<MongoRecord>,
  owner: Readonly<MediaOwner>,
  label: string,
): void {
  if (owner.type === 'ORG') {
    if (stored.orgId !== owner.orgId) fail(`${label}_MEDIA_OWNER_MISMATCH`);
    return;
  }
  if (stored.userId !== owner.userId || stored.orgId !== undefined) {
    fail(`${label}_MEDIA_OWNER_MISMATCH`);
  }
}

function withoutMongoId(value: Readonly<MongoRecord>): MongoRecord {
  const { _id: _mongoId, ...canonicalRecord } = value;
  return canonicalRecord;
}

async function loadDefaultRuntime(): Promise<Readonly<ProviderNativeCanonicalMediaMongoRuntimeV2R>> {
  const [{ connectToDatabase, COLLECTIONS }] = await Promise.all([
    import('../db/mongodb'),
  ]);
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    sourceVersions: wrapCollection(
      db.collection(PROVIDER_NATIVE_CANONICAL_MEDIA_SOURCE_VERSION_COLLECTION_V2R),
    ),
    bindings: wrapCollection(
      db.collection(PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_COLLECTION_V2R),
    ),
    policyGrants: wrapCollection(
      db.collection(PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_COLLECTION_V2R),
    ),
    artifactBindings: wrapCollection(
      db.collection(PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_COLLECTION_V2R),
    ),
    mediaAssets: wrapCollection(db.collection(COLLECTIONS.MEDIA_ASSETS)),
  };
}

function wrapSession(session: ClientSession): ProviderNativeCanonicalMediaMongoSessionV2R {
  return {
    driverSession: session,
    withTransaction: (operation, options) => session.withTransaction(operation, options),
    endSession: () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): ProviderNativeCanonicalMediaMongoCollectionV2R {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter, options) => collection.findOne(
      filter as Filter<Document>,
      {
        session: options.session as ClientSession,
        ...(options.projection ? { projection: options.projection } : {}),
      } as FindOptions,
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
  };
}

function fail(code: string): never {
  throw new ProviderNativeCanonicalMediaMongoLedgerErrorV2R(
    `PROVIDER_NATIVE_CANONICAL_MEDIA_MONGO_${code}`,
  );
}
