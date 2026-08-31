import { describe, expect, it, vi } from 'vitest';

import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import {
  buildNativeVideoAudioRights,
  CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
} from '@/lib/editron/services/native-video-audio-rights';
import { ensureProjectSourceMediaRightsFromLegacyAttestationV1 }
  from '@/lib/editron/services/project-source-media-rights-legacy-migration-v1';
import { revokeSourceMediaRightsV1 }
  from '@/lib/editron/services/source-media-rights-owner-v1';
import type {
  SourceMediaRightsGrantStateV1,
} from '@/lib/editron/services/source-media-rights-owner-v1';
import type { SourceMediaRightsLedgerStorePortsV1 }
  from '@/lib/editron/services/source-media-rights-ledger-v1';

const ATTESTED_AT = new Date('2026-08-31T10:00:00.000Z');
const NOW = new Date('2026-08-31T12:00:00.000Z');
const REVISION = Object.freeze({
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-31T09:00:00.000Z',
});

describe('project source-media rights legacy migration V1', () => {
  it('migrates one exact explicitly attested owned source and then reuses it', async () => {
    const fixture = runtime();

    const first = await fixture.ensure();
    const second = await fixture.ensure();

    expect(first).toMatchObject({
      disposition: 'AUTHORIZED',
      authorityDisposition: 'MIGRATED',
      authorization: {
        projectId: 'project-a',
        source: {
          sourceVersionSha256: fixture.source.sourceVersionSha256,
        },
      },
      migrationReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(second).toMatchObject({
      disposition: 'AUTHORIZED',
      authorityDisposition: 'EXISTING',
    });
    expect(fixture.commit).toHaveBeenCalledTimes(1);
  });

  it('blocks missing attestation without persisting a grant', async () => {
    const fixture = runtime({ audioRights: null });

    await expect(fixture.ensure()).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'PROJECT_SOURCE_RIGHTS_MIGRATION_ATTESTATION_REQUIRED',
    });
    expect(fixture.commit).not.toHaveBeenCalled();
  });

  it('blocks a source version that is not one of the stored asset versions', async () => {
    const fixture = runtime();
    const different = sourceVersion('different');

    await expect(fixture.ensure({ sourceVersion: different })).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'PROJECT_SOURCE_RIGHTS_MIGRATION_SOURCE_SCOPE_MISMATCH',
    });
    expect(fixture.commit).not.toHaveBeenCalled();
  });

  it('does not resurrect a revoked durable grant from legacy evidence', async () => {
    const fixture = runtime();
    const migrated = await fixture.ensure();
    if (migrated.disposition !== 'AUTHORIZED' || fixture.state === null) {
      throw new Error('TEST_MIGRATED_STATE_REQUIRED');
    }
    const revocation = await revokeSourceMediaRightsV1({
      state: fixture.state,
      revokedByUserId: 'user-owner',
      reason: 'RIGHTS_WITHDRAWN',
      revokedAt: new Date('2026-08-31T11:00:00.000Z'),
      principalAuthority: {
        ownerId: 'PROJECT_ACCESS_AUTHORITY',
        ownerVersion: '1',
        authorize: vi.fn(async () => ({
          disposition: 'AUTHORIZED' as const,
          receiptSha256: 'f'.repeat(64),
        })),
      },
    });
    if (revocation.disposition !== 'REVOKED') {
      throw new Error('TEST_REVOCATION_REQUIRED');
    }
    fixture.state = revocation.state;

    await expect(fixture.ensure()).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_REVOKED',
    });
    expect(fixture.commit).toHaveBeenCalledTimes(1);
  });
});

function runtime(overrides: Readonly<{
  audioRights?: ReturnType<typeof buildNativeVideoAudioRights> | null;
}> = {}) {
  const source = sourceVersion('selected');
  let state: SourceMediaRightsGrantStateV1 | null = null;
  const commit = vi.fn(async ({ expectedState, nextState }: Parameters<
    SourceMediaRightsLedgerStorePortsV1['commit']
  >[0]) => {
    if ((state?.sourceMediaRightsStateSha256V1 ?? null)
      !== (expectedState?.sourceMediaRightsStateSha256V1 ?? null)) return false;
    state = nextState;
    return true;
  });
  const store: SourceMediaRightsLedgerStorePortsV1 = {
    read: vi.fn(async () => state),
    commit,
  };
  const audioRights = overrides.audioRights === undefined
    ? buildNativeVideoAudioRights({
        sourceAssetId: 'asset-a',
        userId: 'user-owner',
        attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
        attestedAt: ATTESTED_AT,
      })
    : overrides.audioRights;
  const baseInput = {
    tenantId: 'user-owner',
    userId: 'user-owner',
    orgId: null,
    projectId: 'project-a',
    projectOwnerId: 'user-owner',
    projectRevision: REVISION,
    sourceVersion: source,
    asset: {
      assetId: 'asset-a',
      userId: 'user-owner',
      type: 'video',
      source: 'user-upload',
      sourceVersionV1: source,
      proxySourceVersionV1: null,
      ...(audioRights ? { audioRights } : {}),
    },
  };
  return {
    source,
    commit,
    get state() { return state; },
    set state(value: SourceMediaRightsGrantStateV1 | null) { state = value; },
    ensure: (inputOverrides: Partial<typeof baseInput> = {}) =>
      ensureProjectSourceMediaRightsFromLegacyAttestationV1({
        ...baseInput,
        ...inputOverrides,
      }, { rightsStore: store, now: () => NOW }),
  };
}

function sourceVersion(tag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `asset-a-${tag}` },
    byteLength: 2_048,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-owner' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: 2_048,
    contentSha256: tag === 'selected' ? 'a'.repeat(64) : 'b'.repeat(64),
    storageVersion,
  });
}
