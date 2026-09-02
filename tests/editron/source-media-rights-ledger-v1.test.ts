import { describe, expect, it, vi } from 'vitest';

import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import {
  createSourceMediaRightsLedgerScopeV1,
  persistSourceMediaRightsLedgerTransitionV1,
  type SourceMediaRightsLedgerStorePortsV1,
} from '@/lib/editron/services/source-media-rights-ledger-v1';
import {
  issueSourceMediaRightsV1,
  revokeSourceMediaRightsV1,
  type SourceMediaRightsGrantStateV1,
  type SourceMediaRightsPrincipalAuthorityV1,
} from '@/lib/editron/services/source-media-rights-owner-v1';

describe('SourceMediaRightsLedgerV1', () => {
  it('applies one initial grant, returns unchanged on retry, and rejects stale CAS', async () => {
    const ledger = memoryLedger();
    const state = await issueRights();

    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: state,
    }, ledger.ports)).resolves.toMatchObject({ disposition: 'APPLIED', state });
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: state.sourceMediaRightsStateSha256V1,
      nextState: state,
    }, ledger.ports)).resolves.toMatchObject({ disposition: 'UNCHANGED', state });
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: state,
    }, ledger.ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'EXPECTED_STATE_MISMATCH',
    });
    expect(ledger.heads.size).toBe(1);
    expect(ledger.events).toEqual([state.sourceMediaRightsStateSha256V1]);
  });

  it('keeps the same source version independently cleared in two projects', async () => {
    const ledger = memoryLedger();
    const projectOne = await issueRights();
    const projectTwo = await issueRights({ projectId: 'project-2' });

    const first = await persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: projectOne,
    }, ledger.ports);
    const second = await persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: projectTwo,
    }, ledger.ports);

    expect(first.disposition).toBe('APPLIED');
    expect(second.disposition).toBe('APPLIED');
    if (first.disposition !== 'APPLIED' || second.disposition !== 'APPLIED') {
      throw new Error('expected two project-scoped grants');
    }
    expect(first.scope.scopeSha256).not.toBe(second.scope.scopeSha256);
    expect(ledger.heads.size).toBe(2);
  });

  it('persists exact re-attestation and revocation chains', async () => {
    const ledger = memoryLedger();
    const initial = await issueRights();
    await persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: initial,
    }, ledger.ports);
    const reattested = await issueRights({
      currentState: initial,
      termsVersion: 'rights-terms-v2',
      termsContentSha256: hex('b'),
      attestedAt: new Date('2026-08-30T11:00:00.000Z'),
    });
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: initial.sourceMediaRightsStateSha256V1,
      nextState: reattested,
    }, ledger.ports)).resolves.toMatchObject({ disposition: 'APPLIED' });

    const revocation = await revokeSourceMediaRightsV1({
      state: reattested,
      revokedByUserId: 'user-a',
      reason: 'RIGHTS_WITHDRAWN',
      revokedAt: new Date('2026-08-30T12:00:00.000Z'),
      principalAuthority: principalAuthority(),
    });
    if (revocation.disposition !== 'REVOKED') throw new Error('expected revocation');
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: reattested.sourceMediaRightsStateSha256V1,
      nextState: revocation.state,
    }, ledger.ports)).resolves.toMatchObject({ disposition: 'APPLIED' });

    expect(reattested.previousStateSha256V1)
      .toBe(initial.sourceMediaRightsStateSha256V1);
    expect(reattested.sourceMediaRightsV1.supersedesRecordSha256)
      .toBe(initial.sourceMediaRightsV1.recordSha256);
    expect(revocation.state.previousStateSha256V1)
      .toBe(reattested.sourceMediaRightsStateSha256V1);
    expect(ledger.events).toEqual([
      initial.sourceMediaRightsStateSha256V1,
      reattested.sourceMediaRightsStateSha256V1,
      revocation.state.sourceMediaRightsStateSha256V1,
    ]);
  });

  it('rejects malformed expected state, invalid history, and wrong-scope current state', async () => {
    const initial = await issueRights();
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: 'not-a-sha',
      nextState: initial,
    }, memoryLedger().ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'EXPECTED_STATE_INVALID',
    });

    const ledger = memoryLedger();
    await persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: initial,
    }, ledger.ports);
    const independent = await issueRights({
      termsVersion: 'independent-terms',
      termsContentSha256: hex('c'),
      attestedAt: new Date('2026-08-30T11:00:00.000Z'),
    });
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: initial.sourceMediaRightsStateSha256V1,
      nextState: independent,
    }, ledger.ports)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'TRANSITION_INVALID',
    });

    const wrongProject = await issueRights({ projectId: 'project-2' });
    const wrongScopePorts: SourceMediaRightsLedgerStorePortsV1 = {
      read: vi.fn().mockResolvedValue(wrongProject),
      commit: vi.fn(),
    };
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: wrongProject.sourceMediaRightsStateSha256V1,
      nextState: initial,
    }, wrongScopePorts)).resolves.toEqual({
      disposition: 'REJECTED',
      reason: 'CURRENT_STATE_INVALID',
    });
  });

  it('returns RACE_LOST without claiming the transition was applied', async () => {
    const state = await issueRights();
    const ports: SourceMediaRightsLedgerStorePortsV1 = {
      read: vi.fn().mockResolvedValue(null),
      commit: vi.fn().mockResolvedValue(false),
    };
    await expect(persistSourceMediaRightsLedgerTransitionV1({
      expectedStateSha256: null,
      nextState: state,
    }, ports)).resolves.toEqual({ disposition: 'RACE_LOST' });
  });

  it('creates a deterministic exact scope key and rejects forged scope input', () => {
    const sourceVersion = mediaSourceVersion();
    const input = {
      tenantId: 'tenant-1',
      orgId: null,
      projectId: 'project-1',
      assetId: sourceVersion.assetId,
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
    };
    expect(createSourceMediaRightsLedgerScopeV1(input))
      .toEqual(createSourceMediaRightsLedgerScopeV1(input));
    expect(() => createSourceMediaRightsLedgerScopeV1({
      ...input,
      sourceVersionSha256: 'forged',
    })).toThrow('SOURCE_MEDIA_RIGHTS_LEDGER_SOURCE_VERSION_INVALID');
  });
});

function memoryLedger() {
  const heads = new Map<string, SourceMediaRightsGrantStateV1>();
  const events: string[] = [];
  const ports: SourceMediaRightsLedgerStorePortsV1 = {
    read: vi.fn(async (scope) => heads.get(scope.scopeSha256) ?? null),
    commit: vi.fn(async ({ scope, expectedState, nextState }) => {
      const current = heads.get(scope.scopeSha256) ?? null;
      if ((current?.sourceMediaRightsStateSha256V1 ?? null)
        !== (expectedState?.sourceMediaRightsStateSha256V1 ?? null)) return false;
      heads.set(scope.scopeSha256, nextState);
      events.push(nextState.sourceMediaRightsStateSha256V1);
      return true;
    }),
  };
  return { heads, events, ports };
}

async function issueRights(
  overrides: Partial<Parameters<typeof issueSourceMediaRightsV1>[0]> = {},
): Promise<SourceMediaRightsGrantStateV1> {
  const result = await issueSourceMediaRightsV1({
    tenantId: 'tenant-1',
    attestedByUserId: 'user-a',
    orgId: null,
    projectId: 'project-1',
    disposition: 'OWNED_BY_USER',
    sourceVersion: mediaSourceVersion(),
    termsVersion: 'rights-terms-v1',
    termsContentSha256: hex('d'),
    license: null,
    attestedAt: new Date('2026-08-30T10:00:00.000Z'),
    principalAuthority: principalAuthority(),
    ...overrides,
  });
  if (result.disposition !== 'ISSUED') {
    throw new Error(`expected issuance: ${result.diagnosticCode}`);
  }
  return result.state;
}

function mediaSourceVersion() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'asset-a' },
    byteLength: 2_048,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-a' },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: 2_048,
    contentSha256: hex('a'),
    storageVersion,
  });
}

function principalAuthority(): SourceMediaRightsPrincipalAuthorityV1 {
  return {
    ownerId: 'PROJECT_ACCESS_AUTHORITY',
    ownerVersion: '1',
    authorize: vi.fn().mockResolvedValue({
      disposition: 'AUTHORIZED',
      receiptSha256: hex('e'),
    }),
  };
}

function hex(character: string): string {
  return character.repeat(64);
}
