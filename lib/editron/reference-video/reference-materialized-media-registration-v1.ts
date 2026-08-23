import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import {
  assertReferenceMaterializedMediaStoredRowV1,
  normalizeReferenceMaterializedMediaRegistrationV1,
  REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
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
  const store = deps.store ?? defaultStore();
  const stored = await store.createOrRead(normalized.row);
  assertReferenceMaterializedMediaStoredRowV1(
    stored, normalized.row, normalized.mediaOwner, normalized.storage,
  );

  const material = {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    assetId: normalized.assetId,
    mediaOwner: normalized.mediaOwner,
    contentType: normalized.contentType,
    byteLength: input.bytes.byteLength,
    bytesSha256: normalized.bytesSha256,
    storage: normalized.storage,
    provenance: normalized.provenance,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    receiptSha256: hashEditronCanonicalJsonV1(material),
  }) as Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
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
