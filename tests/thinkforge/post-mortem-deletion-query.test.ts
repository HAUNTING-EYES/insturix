import { describe, expect, it } from 'vitest';
import {
  assertDataBankIdempotentWriteCompatible,
  buildDataBankIdempotentRecordId,
  buildInteractionEventPrincipalQuery,
  buildInteractionEventDeletionQuery,
  buildProjectScopedDeletionQuery,
  buildRecentInteractionEventQuery,
  type DataBankEntry,
} from '@/lib/thinkforge/services/db';

describe('post-mortem source cleanup authority', () => {
  it('builds exact personal and organization interaction ownership predicates', () => {
    expect(buildInteractionEventPrincipalQuery({ userId: ' user_1 ', orgId: null })).toEqual({
      ownerType: 'user',
      userId: 'user_1',
    });
    expect(buildInteractionEventPrincipalQuery({ userId: ' user_1 ', orgId: ' org_1 ' })).toEqual({
      ownerType: 'organization',
      orgId: 'org_1',
    });
  });

  it('scopes recent interaction reads before applying project, type, and time filters', () => {
    const since = new Date('2026-08-01T00:00:00.000Z');
    expect(buildRecentInteractionEventQuery({
      principal: { userId: 'user_1', orgId: 'org_1' },
      projectId: ' session_1 ',
      types: ['feedback_given', 'feedback_given', 'style_corrected'],
      since,
    })).toEqual({
      ownerType: 'organization',
      orgId: 'org_1',
      projectId: 'session_1',
      type: { $in: ['feedback_given', 'style_corrected'] },
      createdAt: { $gte: since },
    });
  });

  it('targets only normalized source records from the authorized session', () => {
    expect(buildProjectScopedDeletionQuery({
      sessionId: ' session_1 ',
      principal: { userId: ' user_1 ', orgId: null },
      entryIds: [' source_1 ', 'source_2', 'source_1', '', '   '],
    })).toEqual({
      _id: { $in: ['source_1', 'source_2'] },
      sessionId: 'session_1',
      ownerType: 'user',
      userId: 'user_1',
      scope: 'project',
      memoryScope: 'project',
      provenanceStatus: 'verified',
      lifecycleStatus: 'active',
    });
  });

  it('cannot create a broad deletion query when no source records were read', () => {
    expect(buildProjectScopedDeletionQuery({
      sessionId: 'session_1',
      principal: { userId: 'user_1', orgId: null },
      entryIds: [],
    })).toBeNull();
  });

  it('targets only snapshotted interaction events from the exact project', () => {
    expect(buildInteractionEventDeletionQuery({
      projectId: ' session_1 ',
      principal: { userId: ' user_1 ', orgId: ' org_1 ' },
      eventIds: [' event_1 ', 'event_2', 'event_1', ''],
    })).toEqual({
      _id: { $in: ['event_1', 'event_2'] },
      projectId: 'session_1',
      ownerType: 'organization',
      orgId: 'org_1',
    });
    expect(buildInteractionEventDeletionQuery({
      projectId: 'session_1',
      principal: { userId: 'user_1', orgId: null },
      eventIds: [],
    })).toBeNull();
  });

  it('fails closed without an exact session and actor', () => {
    expect(() => buildProjectScopedDeletionQuery({
      sessionId: '',
      principal: { userId: 'user_1', orgId: null },
      entryIds: ['source_1'],
    })).toThrow('Project memory cleanup requires an exact session and principal.');
    expect(() => buildProjectScopedDeletionQuery({
      sessionId: 'session_1',
      principal: { userId: ' ', orgId: null },
      entryIds: ['source_1'],
    })).toThrow('DataBank authority requires a user actor.');
  });

  it('derives stable operation IDs and rejects payload drift in the same slot', () => {
    const operationKey = 'thinkforge:post-mortem:v1:session_1:summary';
    expect(buildDataBankIdempotentRecordId(` ${operationKey} `)).toBe(
      buildDataBankIdempotentRecordId(operationKey),
    );
    expect(buildDataBankIdempotentRecordId(`${operationKey}:other`)).not.toBe(
      buildDataBankIdempotentRecordId(operationKey),
    );

    const base = {
      _id: buildDataBankIdempotentRecordId(operationKey),
      sessionId: 'session_1',
      projectId: 'session_1',
      userId: 'user_1',
      ownerType: 'user',
      classification: 'business_confidential',
      consentStatus: 'not_required',
      lifecycleStatus: 'active',
      type: 'research',
      scope: 'project',
      memoryScope: 'project',
      provenanceStatus: 'verified',
      title: 'Project Summary',
      content: { summary: 'Evidence-backed summary.' },
      createdAt: new Date('2026-08-15T00:00:00.000Z'),
      updatedAt: new Date('2026-08-15T00:00:00.000Z'),
    } satisfies DataBankEntry;
    expect(() => assertDataBankIdempotentWriteCompatible(base, { ...base }, operationKey)).not.toThrow();
    expect(() => assertDataBankIdempotentWriteCompatible(
      base,
      { ...base, content: { summary: 'Different model output.' } },
      operationKey,
    )).toThrow(`DataBank idempotency conflict for operation ${operationKey}.`);
  });
});
