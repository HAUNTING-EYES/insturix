import { describe, expect, it } from 'vitest';
import {
  buildDataBankAuthorityV1RollbackUpdate,
  createDataBankAuthorityV1Backup,
} from '@/lib/thinkforge/migrations/databank-authority-backup-v1';

describe('DataBank authority migration backup', () => {
  it('restores existing fields and removes fields introduced by migration', () => {
    const updatedAt = new Date('2026-08-01T00:00:00.000Z');
    const backup = createDataBankAuthorityV1Backup({
      ownerType: 'user',
      tags: ['legacy'],
      updatedAt,
    }, new Date('2026-08-16T00:00:00.000Z'));
    const rollback = buildDataBankAuthorityV1RollbackUpdate(backup);

    expect(rollback.$set).toMatchObject({ ownerType: 'user', tags: ['legacy'], updatedAt });
    expect(rollback.$unset).toMatchObject({
      dataBankAuthorityV1Backup: '',
      orgId: '',
      classification: '',
      consentStatus: '',
      dataBankAuthorityMigration: '',
    });
  });

  it('rejects incomplete or unknown backup formats', () => {
    const backup = createDataBankAuthorityV1Backup({}, new Date());
    expect(() => buildDataBankAuthorityV1RollbackUpdate({ ...backup, version: 99 }))
      .toThrow('Unsupported DataBank authority backup version');
    const incomplete = structuredClone(backup);
    delete (incomplete.fields as Record<string, unknown>).ownerType;
    expect(() => buildDataBankAuthorityV1RollbackUpdate(incomplete))
      .toThrow('missing field snapshot: ownerType');
  });
});
