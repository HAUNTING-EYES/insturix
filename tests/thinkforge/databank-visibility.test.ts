import { describe, expect, it } from 'vitest';
import {
  assertDataBankSessionPrincipal,
  buildAuthorizedDataBankReadQuery,
  buildDataBankPrincipalQuery,
  buildVerifiedDataBankOwnershipQuery,
  resolveDataBankEntryAuthority,
  type DataBankEntry,
} from '@/lib/thinkforge/services/db';
import {
  buildDataBankVectorFilter,
  buildDataBankVectorMetadata,
  DataBankEmbeddingAuthorityError,
} from '@/lib/thinkforge/services/embedding-service';

function dataBankEntry(overrides: Partial<DataBankEntry> = {}): DataBankEntry {
  return {
    _id: 'entry_1',
    sessionId: 'session_1',
    projectId: 'session_1',
    userId: 'user_1',
    ownerType: 'user',
    classification: 'business_confidential',
    consentStatus: 'not_required',
    lifecycleStatus: 'active',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'verified',
    title: 'Verified fact',
    content: { claim: 'Use verified evidence.' },
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DataBank visibility authority', () => {
  describe('entry governance', () => {
    const now = new Date('2026-08-16T00:00:00.000Z');

    it('binds personal records to the user principal', () => {
      expect(resolveDataBankEntryAuthority({
        userId: ' user_1 ',
        classification: 'personal',
        consentStatus: 'granted',
        now,
      })).toEqual({
        ownerType: 'user',
        userId: 'user_1',
        classification: 'personal',
        consentStatus: 'granted',
        lifecycleStatus: 'active',
      });
    });

    it('binds organization records to the exact organization principal', () => {
      expect(resolveDataBankEntryAuthority({
        userId: 'user_1',
        orgId: ' org_1 ',
        classification: 'business_confidential',
        consentStatus: 'not_required',
        now,
      })).toMatchObject({
        ownerType: 'organization',
        userId: 'user_1',
        orgId: 'org_1',
        classification: 'business_confidential',
        consentStatus: 'not_required',
        lifecycleStatus: 'active',
      });
    });

    it('builds principal queries that never mix personal and organization memory', () => {
      expect(buildDataBankPrincipalQuery({ userId: 'user_1' })).toEqual({
        ownerType: 'user',
        userId: 'user_1',
      });
      expect(buildDataBankPrincipalQuery({ userId: 'user_1', orgId: 'org_1' })).toEqual({
        ownerType: 'organization',
        orgId: 'org_1',
      });
    });

    it('rejects cross-owner and cross-organization session writes', () => {
      expect(() => assertDataBankSessionPrincipal(
        { userId: 'user_2' },
        { _id: 'session_1', userId: 'user_1' },
      )).toThrow('Personal DataBank memory requires the session owner.');
      expect(() => assertDataBankSessionPrincipal(
        { userId: 'user_1' },
        { _id: 'session_1', userId: 'user_1', orgId: 'org_1' },
      )).toThrow('DataBank principal does not match the session owner.');
      expect(() => assertDataBankSessionPrincipal(
        { userId: 'user_2', orgId: 'org_2' },
        { _id: 'session_1', userId: 'user_1', orgId: 'org_1' },
      )).toThrow('DataBank principal does not match the session owner.');
    });

    it('allows an authorized collaborator to write organization memory', () => {
      expect(assertDataBankSessionPrincipal(
        { userId: 'user_2', orgId: 'org_1' },
        { _id: 'session_1', userId: 'user_1', orgId: 'org_1' },
      )).toEqual({
        ownerType: 'organization',
        userId: 'user_2',
        orgId: 'org_1',
      });
    });

    it('fails closed for missing actors, child data, withdrawn consent, and unconsented personal data', () => {
      expect(() => resolveDataBankEntryAuthority({
        userId: ' ',
        classification: 'public',
        consentStatus: 'not_required',
        now,
      })).toThrow('DataBank authority requires a user actor.');
      expect(() => resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'child_data',
        consentStatus: 'granted',
        now,
      })).toThrow('Child data cannot be stored in ThinkForge memory.');
      expect(() => resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'business_confidential',
        consentStatus: 'withdrawn',
        now,
      })).toThrow('Withdrawn data consent cannot create ThinkForge memory.');
      expect(() => resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'personal',
        consentStatus: 'not_required',
        now,
      })).toThrow('Personal memory requires explicit consent.');
    });

    it('rejects invalid retention windows and already-expired memory', () => {
      expect(() => resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'public',
        consentStatus: 'not_required',
        freshUntil: new Date('invalid'),
        now,
      })).toThrow('DataBank freshUntil must be a valid date.');
      expect(() => resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'public',
        consentStatus: 'not_required',
        expiresAt: new Date('2026-08-15T23:59:59.999Z'),
        now,
      })).toThrow('DataBank memory cannot be expired when it is created.');
      expect(() => resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'public',
        consentStatus: 'not_required',
        freshUntil: new Date('2026-09-01T00:00:00.000Z'),
        expiresAt: new Date('2026-08-31T00:00:00.000Z'),
        now,
      })).toThrow('DataBank freshness cannot extend beyond expiry.');
    });

    it('copies retention dates so callers cannot mutate persisted authority', () => {
      const freshUntil = new Date('2026-08-20T00:00:00.000Z');
      const expiresAt = new Date('2026-09-01T00:00:00.000Z');
      const authority = resolveDataBankEntryAuthority({
        userId: 'user_1',
        classification: 'public',
        consentStatus: 'not_required',
        freshUntil,
        expiresAt,
        now,
      });

      expect(authority.freshUntil).not.toBe(freshUntil);
      expect(authority.expiresAt).not.toBe(expiresAt);
      expect(authority.freshUntil).toEqual(freshUntil);
      expect(authority.expiresAt).toEqual(expiresAt);
    });
  });

  it('never treats a missing legacy scope as project ownership', () => {
    expect(buildVerifiedDataBankOwnershipQuery('project')).toEqual({
      provenanceStatus: 'verified',
      scope: 'project',
      memoryScope: 'project',
    });
  });

  it('allows only structurally valid brand or universal records into global reads', () => {
    expect(buildVerifiedDataBankOwnershipQuery('global')).toEqual({
      provenanceStatus: 'verified',
      $or: [
        {
          scope: 'global',
          memoryScope: 'brand',
          brandId: { $type: 'string', $ne: '' },
        },
        {
          scope: 'global',
          memoryScope: 'universal',
          $or: [
            { brandId: { $exists: false } },
            { brandId: null },
            { brandId: '' },
          ],
        },
      ],
    });
  });

  it('builds an exact authoring read predicate with lifecycle and retention gates', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');

    expect(buildAuthorizedDataBankReadQuery(
      { userId: 'user_1', orgId: 'org_1' },
      'global',
      now,
    )).toEqual({
      $and: [
        { ownerType: 'organization', orgId: 'org_1' },
        buildVerifiedDataBankOwnershipQuery('global'),
        { lifecycleStatus: 'active' },
        { classification: { $in: ['public', 'business_confidential', 'personal'] } },
        { consentStatus: { $in: ['not_required', 'granted'] } },
        {
          $or: [
            { classification: { $ne: 'personal' } },
            { classification: 'personal', consentStatus: 'granted' },
          ],
        },
        {
          $or: [
            { freshUntil: { $exists: false } },
            { freshUntil: null },
            { freshUntil: { $gt: now } },
          ],
        },
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: now } },
          ],
        },
      ],
    });
  });

  it('builds exact vector metadata without project or brand defaults', () => {
    expect(buildDataBankVectorMetadata(dataBankEntry())).toEqual({
      entryId: 'entry_1',
      userId: 'user_1',
      ownerType: 'user',
      type: 'atomic_fact',
      scope: 'project',
      memoryScope: 'project',
      provenanceStatus: 'verified',
      classification: 'business_confidential',
      consentStatus: 'not_required',
      lifecycleStatus: 'active',
      metadataVersion: 3,
      sessionId: 'session_1',
      projectId: 'session_1',
    });
  });

  it('binds organization vector metadata to the organization owner', () => {
    expect(buildDataBankVectorMetadata(dataBankEntry({
      ownerType: 'organization',
      orgId: 'org_1',
    }))).toMatchObject({
      userId: 'user_1',
      ownerType: 'organization',
      orgId: 'org_1',
      metadataVersion: 3,
    });
  });

  it('rejects quarantined or structurally ambiguous entries before vector upsert', () => {
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      provenanceStatus: 'quarantined',
    }))).toThrow(DataBankEmbeddingAuthorityError);
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      scope: 'global',
      memoryScope: undefined,
      sessionId: undefined,
      projectId: undefined,
    }))).toThrow(DataBankEmbeddingAuthorityError);
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      lifecycleStatus: 'superseded',
    }))).toThrow('DataBank embedding requires active lifecycle state.');
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      consentStatus: 'withdrawn',
    }))).toThrow('DataBank embedding consent is not valid.');
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      expiresAt: new Date('2026-08-15T23:59:59.999Z'),
    }), new Date('2026-08-16T00:00:00.000Z'))).toThrow(
      'DataBank embedding retention window is not current.',
    );
  });

  it('requires exact brand authority for brand vector metadata', () => {
    expect(() => buildDataBankVectorMetadata(dataBankEntry({
      scope: 'global',
      memoryScope: 'brand',
      brandId: undefined,
    }))).toThrow('Brand memory requires a brandId.');
  });

  it('builds a provenance-bound brand vector filter', () => {
    expect(buildDataBankVectorFilter({
      userId: 'user_1',
      scope: 'global',
      memoryScope: 'brand',
      brandId: 'brand_1',
    })).toBe(
      "ownerType = 'user' AND userId = 'user_1' AND provenanceStatus = 'verified' AND lifecycleStatus = 'active' AND metadataVersion = 3 AND scope = 'global' AND memoryScope = 'brand' AND brandId = 'brand_1'",
    );
  });

  it('builds an organization-bound universal vector filter', () => {
    expect(buildDataBankVectorFilter({
      userId: 'user_1',
      orgId: 'org_1',
      scope: 'global',
      memoryScope: 'universal',
    })).toBe(
      "ownerType = 'organization' AND orgId = 'org_1' AND provenanceStatus = 'verified' AND lifecycleStatus = 'active' AND metadataVersion = 3 AND scope = 'global' AND memoryScope = 'universal'",
    );
  });

  it('rejects global vector retrieval without a valid memory authority', () => {
    expect(() => buildDataBankVectorFilter({
      userId: 'user_1',
      scope: 'global',
    })).toThrow('Global vector retrieval requires brand or universal memory scope.');
    expect(() => buildDataBankVectorFilter({
      userId: 'user_1',
      scope: 'global',
      memoryScope: 'project',
    })).toThrow('Global vector retrieval requires brand or universal memory scope.');
  });
});
