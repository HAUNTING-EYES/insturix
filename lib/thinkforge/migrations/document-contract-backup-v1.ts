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

export interface ThinkForgeDocumentV1BackupResolution {
  backup: ThinkForgeDocumentV1Backup;
  reused: boolean;
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

function assertThinkForgeDocumentV1Backup(value: unknown): asserts value is ThinkForgeDocumentV1Backup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ThinkForge document backup must be an object');
  }
  const backup = value as Partial<ThinkForgeDocumentV1Backup>;
  if (backup.version !== THINKFORGE_DOCUMENT_BACKUP_VERSION) {
    throw new Error(`Unsupported ThinkForge document backup version: ${String(backup.version)}`);
  }
  if (!(backup.capturedAt instanceof Date) || Number.isNaN(backup.capturedAt.getTime())) {
    throw new Error('ThinkForge document backup capturedAt must be a valid Date');
  }
  if (!backup.fields || typeof backup.fields !== 'object' || Array.isArray(backup.fields)) {
    throw new Error('ThinkForge document backup fields must be an object');
  }
  for (const field of MIGRATED_FIELDS) {
    const snapshot = backup.fields[field];
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.exists !== 'boolean') {
      throw new Error(`ThinkForge document backup is missing field snapshot: ${field}`);
    }
  }
}

export function resolveThinkForgeDocumentV1Backup(
  record: Record<string, unknown>,
  capturedAt: Date,
): ThinkForgeDocumentV1BackupResolution {
  if (!hasOwn(record, THINKFORGE_DOCUMENT_BACKUP_FIELD)) {
    return { backup: createThinkForgeDocumentV1Backup(record, capturedAt), reused: false };
  }
  const backup = record[THINKFORGE_DOCUMENT_BACKUP_FIELD];
  assertThinkForgeDocumentV1Backup(backup);
  return { backup, reused: true };
}

export function buildThinkForgeDocumentV1RollbackUpdate(backup: ThinkForgeDocumentV1Backup): {
  $set: Record<string, unknown>;
  $unset: Record<string, ''>;
} {
  assertThinkForgeDocumentV1Backup(backup);

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = { [THINKFORGE_DOCUMENT_BACKUP_FIELD]: '' };
  for (const field of MIGRATED_FIELDS) {
    const snapshot = backup.fields[field];
    if (snapshot.exists) {
      $set[field] = snapshot.value;
    } else {
      $unset[field] = '';
    }
  }
  return { $set, $unset };
}
