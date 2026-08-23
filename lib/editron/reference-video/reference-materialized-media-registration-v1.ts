import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import {
  assertReferenceMaterializedMediaStoredRowV1,
  normalizeReferenceMaterializedMediaIdentityRegistrationV1,
  normalizeReferenceMaterializedMediaRegistrationV1,
  REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
  ReferenceMaterializedMediaRegistrationErrorV1,
  type ReferenceMaterializationProvenanceV1,
  type ReferenceMaterializedMediaAssetRowV1,
  type ReferenceMaterializedMediaOwnerV1,
  type ReferenceMaterializedMediaRegistrationInputV1,
} from './reference-materialized-media-validation-v1';

export {
  REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
  ReferenceMaterializedMediaRegistrationErrorV1,
} from './reference-materialized-media-validation-v1';
export type {
  ReferenceMaterializedMediaAssetRowV1,
  ReferenceMaterializedMediaKindV1,
  ReferenceMaterializedMediaOwnerV1,
  ReferenceMaterializedMediaRegistrationInputV1,
  ReferenceMaterializedMediaRoleV1,
} from './reference-materialized-media-validation-v1';

export type ReferenceMaterializedMediaFileRegistrationInputV1 = Readonly<
  Omit<ReferenceMaterializedMediaRegistrationInputV1, 'bytes'> & { filePath: string }
>;

export interface ReferenceMaterializedMediaAssetStoreV1 {
  /** Insert once and return the stored row; an existing row must not be mutated. */
  createOrRead(
    row: Readonly<ReferenceMaterializedMediaAssetRowV1>,
  ): Promise<unknown>;
}

export interface ReferenceMaterializedMediaRegistrationReceiptV1 {
  version: typeof REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1;
  assetId: string;
  mediaOwner: Readonly<ReferenceMaterializedMediaOwnerV1>;
  contentType: string;
  byteLength: number;
  bytesSha256: string;
  storage: Readonly<{ backend: 'R2' | 'GCS'; key: string }>;
  provenance: Readonly<ReferenceMaterializationProvenanceV1>;
  receiptSha256: string;
}

export interface ReferenceMaterializedMediaFileRegistrationDepsV1 {
  store?: Readonly<ReferenceMaterializedMediaAssetStoreV1>;
  statFile?: (filePath: string) => Promise<{
    size: number;
    mtimeMs: number;
    isFile(): boolean;
  }>;
  createFileReadStream?: (
    filePath: string,
  ) => AsyncIterable<Uint8Array | string>;
}

/**
 * Registers exact uploaded reference bytes in the existing mediaAssets owner.
 * This is identity plumbing only: it neither uploads bytes nor issues provider
 * policy/binding records, and therefore cannot become a second media registry.
 */
export async function registerReferenceMaterializedMediaAssetV1(
  input: Readonly<ReferenceMaterializedMediaRegistrationInputV1>,
  deps: Readonly<{
    store?: Readonly<ReferenceMaterializedMediaAssetStoreV1>;
  }> = {},
): Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>> {
  const normalized = normalizeReferenceMaterializedMediaRegistrationV1(input);
  return persistRegistration(normalized, input.bytes.byteLength, deps.store ?? defaultStore());
}

/**
 * File-backed registration for long-form materialization. The local file is
 * streamed into SHA-256 and stat-checked before/after the read; persistence is
 * still delegated to the same create-or-compare mediaAssets owner.
 */
export async function registerReferenceMaterializedMediaFileV1(
  input: ReferenceMaterializedMediaFileRegistrationInputV1,
  deps: Readonly<ReferenceMaterializedMediaFileRegistrationDepsV1> = {},
): Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>> {
  const identity = await measureStableReferenceMediaFileV1(input.filePath, deps);
  const { filePath: _filePath, ...registration } = input;
  const normalized = normalizeReferenceMaterializedMediaIdentityRegistrationV1({
    ...registration,
    ...identity,
  });
  return persistRegistration(normalized, identity.byteLength, deps.store ?? defaultStore());
}

async function persistRegistration(
  normalized: ReturnType<typeof normalizeReferenceMaterializedMediaRegistrationV1>,
  byteLength: number,
  store: Readonly<ReferenceMaterializedMediaAssetStoreV1>,
): Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>> {
  const stored = await store.createOrRead(normalized.row);
  assertReferenceMaterializedMediaStoredRowV1(
    stored, normalized.row, normalized.mediaOwner, normalized.storage,
  );

  const material = {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    assetId: normalized.assetId,
    mediaOwner: normalized.mediaOwner,
    contentType: normalized.contentType,
    byteLength,
    bytesSha256: normalized.bytesSha256,
    storage: normalized.storage,
    provenance: normalized.provenance,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  }) as Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
}

/** Stable, streamed local-file identity shared by materialization owners. */
export async function measureStableReferenceMediaFileV1(
  filePath: string,
  deps: Readonly<ReferenceMaterializedMediaFileRegistrationDepsV1>,
): Promise<Readonly<{ byteLength: number; bytesSha256: string }>> {
  if (typeof filePath !== 'string' || !filePath.trim()) fileFail('FILE_PATH_INVALID');
  const statFile = deps.statFile ?? stat;
  const openStream = deps.createFileReadStream ?? createReadStream;
  const before = await statFile(filePath);
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < 1
    || !Number.isFinite(before.mtimeMs)) {
    fileFail('FILE_SOURCE_INVALID');
  }
  const hash = createHash('sha256');
  try {
    for await (const chunk of openStream(filePath)) hash.update(chunk);
  } catch (error) {
    throw new ReferenceMaterializedMediaRegistrationErrorV1(
      `EDITRON_REFERENCE_MATERIALIZED_MEDIA_FILE_READ_FAILED:${
        error instanceof Error ? error.message : String(error)}`,
    );
  }
  const after = await statFile(filePath);
  if (!after.isFile() || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    fileFail('FILE_CHANGED_DURING_READ');
  }
  return { byteLength: before.size, bytesSha256: hash.digest('hex') };
}

function fileFail(code: string): never {
  throw new ReferenceMaterializedMediaRegistrationErrorV1(
    `EDITRON_REFERENCE_MATERIALIZED_MEDIA_${code}`,
  );
}

function defaultStore(): Readonly<ReferenceMaterializedMediaAssetStoreV1> {
  return {
    createOrRead: async (row) => {
      const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
      const db = await getDatabase();
      const collection = db.collection(COLLECTIONS.MEDIA_ASSETS);
      await collection.updateOne(
        { assetId: row.assetId, userId: row.userId },
        { $setOnInsert: row },
        { upsert: true },
      );
      const stored = await collection.findOne({ assetId: row.assetId, userId: row.userId });
      if (!stored) throw new Error('EDITRON_REFERENCE_MATERIALIZED_MEDIA_STORED_ROW_NOT_ACKNOWLEDGED');
      return stored;
    },
  };
}
