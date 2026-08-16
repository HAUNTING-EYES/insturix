export const THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD = 'authoringRequestV1Backup';
export const THINKFORGE_AUTHORING_REQUEST_BACKUP_VERSION = 1;

const MIGRATED_FIELDS = [
  'authoringRequest',
  'contentContract',
  'format',
  'platform',
  'durationSec',
  'authoringRequestMigration',
] as const;

type MigratedField = typeof MIGRATED_FIELDS[number];

export interface ThinkForgeAuthoringRequestV1Backup {
  version: number;
  capturedAt: Date;
  fields: Record<MigratedField, { exists: boolean; value?: unknown }>;
}

export function createThinkForgeAuthoringRequestV1Backup(
  projectMeta: Record<string, unknown>,
  capturedAt: Date,
): ThinkForgeAuthoringRequestV1Backup {
  return {
    version: THINKFORGE_AUTHORING_REQUEST_BACKUP_VERSION,
    capturedAt,
    fields: Object.fromEntries(MIGRATED_FIELDS.map((field) => [
      field,
      Object.prototype.hasOwnProperty.call(projectMeta, field)
        ? { exists: true, value: projectMeta[field] }
        : { exists: false },
    ])) as ThinkForgeAuthoringRequestV1Backup['fields'],
  };
}

export function buildThinkForgeAuthoringRequestV1RollbackUpdate(
  backup: ThinkForgeAuthoringRequestV1Backup,
): { $set: Record<string, unknown>; $unset: Record<string, ''> } {
  if (backup.version !== THINKFORGE_AUTHORING_REQUEST_BACKUP_VERSION) {
    throw new Error(`Unsupported ThinkForge authoring request backup version: ${backup.version}`);
  }
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = { [THINKFORGE_AUTHORING_REQUEST_BACKUP_FIELD]: '' };
  for (const field of MIGRATED_FIELDS) {
    const snapshot = backup.fields[field];
    if (!snapshot || typeof snapshot.exists !== 'boolean') {
      throw new Error(`ThinkForge authoring request backup is missing field snapshot: ${field}`);
    }
    const path = `projectMeta.${field}`;
    if (snapshot.exists) $set[path] = snapshot.value;
    else $unset[path] = '';
  }
  return { $set, $unset };
}
