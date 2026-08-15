import { describe, expect, it } from 'vitest';
import { planDataBankAuthorityMigration } from '@/lib/thinkforge/migrations/databank-authority-v1';

function plan(record: Record<string, unknown>, session: Record<string, unknown> = {}) {
  return planDataBankAuthorityMigration({
    records: [{
      _id: 'entry_1',
      sessionId: 'session_1',
      userId: 'user_1',
      type: 'atomic_fact',
      scope: 'project',
      title: 'Evidence',
      content: { claim: 'Use a proof-led opening.' },
      ...record,
    }],
    sessions: [{ _id: 'session_1', userId: 'user_1', ...session }],
  });
}

describe('DataBank authority migration', () => {
  it('binds personal memory to the exact session owner and infers project memory only from project scope', () => {
    const result = plan({});
    expect(result.summary).toEqual({ scanned: 1, active: 1, quarantined: 0 });
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      update: {
        $set: {
          ownerType: 'user',
          userId: 'user_1',
          classification: 'business_confidential',
          consentStatus: 'not_required',
          lifecycleStatus: 'active',
          memoryScope: 'project',
          provenanceStatus: 'verified',
          embeddingStatus: 'pending',
        },
      },
    });
  });

  it('binds organization memory to the organization rather than the creating user', () => {
    const result = plan({}, { orgId: 'org_1' });
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      update: { $set: { ownerType: 'organization', orgId: 'org_1', userId: 'user_1' } },
    });
  });

  it('preserves proven brand memory only when the session brand agrees', () => {
    const result = plan({
      scope: 'global',
      memoryScope: 'brand',
      brandId: 'brand_1',
      tags: ['memory:brand', 'brand:brand_1'],
    }, { projectMeta: { brandId: 'brand_1' } });
    expect(result.decisions[0]).toMatchObject({
      status: 'active',
      update: { $set: { memoryScope: 'brand', brandId: 'brand_1' } },
    });
  });

  it.each([
    ['missing session', { sessionId: 'missing' }, {}, 'missing_session_owner_evidence'],
    ['personal owner mismatch', {}, { userId: 'user_2' }, 'personal_session_owner_mismatch'],
    ['scope conflict', { memoryScope: 'brand' }, {}, 'project_memory_scope_conflict'],
    ['brand mismatch', {
      scope: 'global', memoryScope: 'brand', brandId: 'brand_1', tags: ['memory:brand', 'brand:brand_1'],
    }, { projectMeta: { brandId: 'brand_2' } }, 'brand_session_mismatch'],
    ['personal data', { content: { claim: 'Email Alex at alex@example.com.' } }, {}, 'legacy_personal_data_without_consent'],
    ['child data', { content: { claim: 'Use an 11-year-old student record.' } }, {}, 'legacy_child_data_without_consent'],
  ])('quarantines %s instead of guessing', (_name, record, session, reason) => {
    const result = plan(record, session);
    expect(result.decisions[0]).toMatchObject({
      status: 'quarantined',
      reason,
      update: { $set: { provenanceStatus: 'quarantined', lifecycleStatus: 'superseded' } },
    });
  });
});
