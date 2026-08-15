export const THINKFORGE_DOCUMENT_BACKUP_FIELD = 'documentContractV1Backup';
export const THINKFORGE_DOCUMENT_BACKUP_VERSION = 1;

const MIGRATED_FIELDS = [
  'scriptId',
  'title',
  'documentType',
  'contentContract',
  'recordStatus',
  'documentContractMigration',
] as const;

type MigratedField = typeof MIGRATED_FIELDS[number];

export interface ThinkForgeDocumentFieldSnapshot {
  exists: boolean;
  value?: unknown;
}

export interface ThinkForgeDocumentV1Backup {
  version: number;
  capturedAt: Date;
  fields: Record<MigratedField, ThinkForgeDocumentFieldSnapshot>;
}

function hasOwn(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

export function createThinkForgeDocumentV1Backup(
  record: Record<string, unknown>,
  capturedAt: Date,
): ThinkForgeDocumentV1Backup {
  return {
    version: THINKFORGE_DOCUMENT_BACKUP_VERSION,
    capturedAt,
    fields: Object.fromEntries(MIGRATED_FIELDS.map((field) => [
      field,
      hasOwn(record, field)
        ? { exists: true, value: record[field] }
        : { exists: false },
    ])) as Record<MigratedField, ThinkForgeDocumentFieldSnapshot>,
  };
}

export function buildThinkForgeDocumentV1RollbackUpdate(backup: ThinkForgeDocumentV1Backup): {
  $set: Record<string, unknown>;
  $unset: Record<string, ''>;
} {
  if (backup.version !== THINKFORGE_DOCUMENT_BACKUP_VERSION) {
    throw new Error(`Unsupported ThinkForge document backup version: ${backup.version}`);
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = { [THINKFORGE_DOCUMENT_BACKUP_FIELD]: '' };
  for (const field of MIGRATED_FIELDS) {
    const snapshot = backup.fields[field];
    if (!snapshot || typeof snapshot.exists !== 'boolean') {
      throw new Error(`ThinkForge document backup is missing field snapshot: ${field}`);
    }
    if (snapshot.exists) {
      $set[field] = snapshot.value;
    } else {
      $unset[field] = '';
    }
  }
  return { $set, $unset };
}
