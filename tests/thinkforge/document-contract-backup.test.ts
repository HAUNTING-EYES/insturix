import { describe, expect, it } from 'vitest';
import {
  THINKFORGE_DOCUMENT_BACKUP_FIELD,
  buildThinkForgeDocumentV1RollbackUpdate,
  createThinkForgeDocumentV1Backup,
} from '@/lib/thinkforge/migrations/document-contract-backup-v1';

describe('ThinkForge document contract migration backup', () => {
  it('distinguishes absent fields from fields explicitly stored as null', () => {
    const capturedAt = new Date('2026-08-15T12:00:00.000Z');
    const backup = createThinkForgeDocumentV1Backup({
      scriptId: 'default',
      title: 'Legacy title',
      documentType: null,
    }, capturedAt);

    expect(backup.capturedAt).toEqual(capturedAt);
    expect(backup.fields.scriptId).toEqual({ exists: true, value: 'default' });
    expect(backup.fields.documentType).toEqual({ exists: true, value: null });
    expect(backup.fields.contentContract).toEqual({ exists: false });
  });

  it('builds a rollback that restores values and removes fields that were absent', () => {
    const backup = createThinkForgeDocumentV1Backup({
      scriptId: 'legacy_id',
      title: 'Legacy title',
      documentType: 'screenplay',
      recordStatus: null,
    }, new Date('2026-08-15T12:00:00.000Z'));
    const rollback = buildThinkForgeDocumentV1RollbackUpdate(backup);

    expect(rollback.$set).toMatchObject({
      scriptId: 'legacy_id',
      title: 'Legacy title',
      documentType: 'screenplay',
      recordStatus: null,
    });
    expect(rollback.$unset).toMatchObject({
      contentContract: '',
      documentContractMigration: '',
      [THINKFORGE_DOCUMENT_BACKUP_FIELD]: '',
    });
  });

  it('rejects a backup version it cannot safely restore', () => {
    const backup = createThinkForgeDocumentV1Backup({}, new Date());
    expect(() => buildThinkForgeDocumentV1RollbackUpdate({ ...backup, version: 99 }))
      .toThrow('Unsupported ThinkForge document backup version');
  });
});
