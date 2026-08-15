export const THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD = 'dataBankAuthorityV1Backup';
export const THINKFORGE_DATABANK_AUTHORITY_BACKUP_VERSION = 1;

const MIGRATED_FIELDS = [
  'ownerType',
  'orgId',
  'classification',
  'consentStatus',
  'lifecycleStatus',
  'freshUntil',
  'expiresAt',
  'provenanceStatus',
  'provenanceReason',
  'scope',
  'memoryScope',
  'brandId',
  'tags',
  'embeddingStatus',
  'embeddingMetadataVersion',
  'embeddingNextRetryAt',
  'embeddingLeaseExpiresAt',
  'vectorId',
  'dataBankAuthorityMigration',
  'updatedAt',
] as const;

type MigratedField = typeof MIGRATED_FIELDS[number];

export interface DataBankAuthorityFieldSnapshot {
  exists: boolean;
  value?: unknown;
}

export interface DataBankAuthorityV1Backup {
  version: number;
  capturedAt: Date;
  fields: Record<MigratedField, DataBankAuthorityFieldSnapshot>;
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

export function createDataBankAuthorityV1Backup(
  record: Record<string, unknown>,
  capturedAt: Date,
): DataBankAuthorityV1Backup {
  return {
    version: THINKFORGE_DATABANK_AUTHORITY_BACKUP_VERSION,
    capturedAt,
    fields: Object.fromEntries(MIGRATED_FIELDS.map((field) => [
      field,
      hasOwn(record, field)
        ? { exists: true, value: record[field] }
        : { exists: false },
    ])) as Record<MigratedField, DataBankAuthorityFieldSnapshot>,
  };
}

export function buildDataBankAuthorityV1RollbackUpdate(backup: DataBankAuthorityV1Backup): {
  $set: Record<string, unknown>;
  $unset: Record<string, ''>;
} {
  if (backup.version !== THINKFORGE_DATABANK_AUTHORITY_BACKUP_VERSION) {
    throw new Error(`Unsupported DataBank authority backup version: ${backup.version}`);
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = { [THINKFORGE_DATABANK_AUTHORITY_BACKUP_FIELD]: '' };
  for (const field of MIGRATED_FIELDS) {
    const snapshot = backup.fields[field];
    if (!snapshot || typeof snapshot.exists !== 'boolean') {
      throw new Error(`DataBank authority backup is missing field snapshot: ${field}`);
    }
    if (snapshot.exists) $set[field] = snapshot.value;
    else $unset[field] = '';
  }
  return { $set, $unset };
}
