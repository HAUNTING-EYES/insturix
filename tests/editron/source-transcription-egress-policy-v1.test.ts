import { describe, expect, it, vi } from 'vitest';

import { createAssetTranscriptionSourceBindingV2 }
  from '@/lib/editron/services/asset-transcription-source-binding-v2';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import {
  authorizeSourceTranscriptionEgressV1,
  createSourceTranscriptionEgressRequestV1,
} from '@/lib/editron/services/source-transcription-egress-authorization-v1';
import {
  assertSourceTranscriptionEgressPolicyGrantV1,
  createSourceTranscriptionEgressPolicyGrantV1,
  createSourceTranscriptionEgressPolicyOwnerV1,
} from '@/lib/editron/services/source-transcription-egress-policy-v1';

const NOW = new Date('2026-08-31T15:00:00.000Z');

describe('source transcription egress policy V1', () => {
  it('authorizes only the requested providers allowed by the exact grant', async () => {
    const request = egressRequest();
    const grant = policyGrant({ allowedProviderIds: ['deepgram'] });
    const read = vi.fn(async () => grant);
    const owner = createSourceTranscriptionEgressPolicyOwnerV1({
      reader: { read },
      now: () => NOW,
    });

    const result = await authorizeSourceTranscriptionEgressV1(
      request,
      owner,
      () => NOW,
    );

    expect(result).toMatchObject({
      disposition: 'AUTHORIZED',
      authorization: {
        approvedProviderIds: ['deepgram'],
        issuedAt: NOW.toISOString(),
        expiresAt: '2026-08-31T15:05:00.000Z',
      },
    });
    expect(read).toHaveBeenCalledWith({
      scope: {
        tenantId: 'org-1',
        userId: 'member-1',
        orgId: 'org-1',
        projectId: 'project-1',
      },
      privacyEgressPolicyRef: artifact('policy'),
    });
  });

  it.each([
    ['missing', null, 'SOURCE_TRANSCRIPTION_EGRESS_POLICY_NOT_FOUND'],
    ['revoked', policyGrant({ disposition: 'REVOKED' }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_REVOKED'],
    ['expired', policyGrant({ expiresAt: NOW.toISOString() }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_EXPIRED'],
    ['future', policyGrant({ issuedAt: '2026-08-31T15:01:00.000Z' }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_NOT_YET_CURRENT'],
  ])('blocks a %s policy', async (_label, stored, code) => {
    const owner = createSourceTranscriptionEgressPolicyOwnerV1({
      reader: { read: vi.fn(async () => stored) },
      now: () => NOW,
    });
    expect(await authorizeSourceTranscriptionEgressV1(
      egressRequest(), owner, () => NOW,
    )).toEqual({ disposition: 'BLOCKED', diagnosticCode: code });
  });

  it.each([
    ['provider', policyGrant({ allowedProviderIds: ['xai'] }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_PROVIDER_DENIED'],
    ['media', policyGrant({ allowedMediaKinds: ['audio'] }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_MEDIA_KIND_DENIED'],
    ['role', policyGrant({ allowedSourceRoles: ['PROXY'] }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_SOURCE_ROLE_DENIED'],
    ['precision', policyGrant({ allowedPrecisions: ['TEXT_ALLOWED'] }),
      'SOURCE_TRANSCRIPTION_EGRESS_POLICY_PRECISION_DENIED'],
  ])('blocks a denied %s dimension', async (_label, stored, code) => {
    const owner = createSourceTranscriptionEgressPolicyOwnerV1({
      reader: { read: vi.fn(async () => stored) },
      now: () => NOW,
    });
    expect(await authorizeSourceTranscriptionEgressV1(
      egressRequest({ providers: ['deepgram'] }), owner, () => NOW,
    )).toEqual({ disposition: 'BLOCKED', diagnosticCode: code });
  });

  it('blocks a wrong scope or policy artifact and rejects tampering', async () => {
    const request = egressRequest();
    for (const stored of [
      policyGrant({ scope: { ...policyScope(), projectId: 'project-other' } }),
      policyGrant({ privacyEgressPolicyRef: artifact('other-policy') }),
    ]) {
      const owner = createSourceTranscriptionEgressPolicyOwnerV1({
        reader: { read: vi.fn(async () => stored) },
        now: () => NOW,
      });
      expect(await authorizeSourceTranscriptionEgressV1(
        request, owner, () => NOW,
      )).toEqual({
        disposition: 'BLOCKED',
        diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_POLICY_SCOPE_MISMATCH',
      });
    }
    expect(() => assertSourceTranscriptionEgressPolicyGrantV1({
      ...policyGrant(),
      authorizationTtlSeconds: 301,
    })).toThrow('SOURCE_TRANSCRIPTION_EGRESS_POLICY_GRANT_HASH_MISMATCH');
  });

  it('fails closed when the policy store is unavailable', async () => {
    const owner = createSourceTranscriptionEgressPolicyOwnerV1({
      reader: { read: vi.fn(async () => { throw new Error('database'); }) },
      now: () => NOW,
    });
    expect(await authorizeSourceTranscriptionEgressV1(
      egressRequest(), owner, () => NOW,
    )).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_POLICY_STORE_UNAVAILABLE',
    });
  });
});

function policyGrant(overrides: Partial<Parameters<
  typeof createSourceTranscriptionEgressPolicyGrantV1
>[0]> = {}) {
  return createSourceTranscriptionEgressPolicyGrantV1({
    scope: policyScope(),
    privacyEgressPolicyRef: artifact('policy'),
    allowedProviderIds: ['deepgram', 'xai'],
    allowedMediaKinds: ['video'],
    allowedSourceRoles: ['MASTER'],
    allowedPrecisions: ['MEASURED_WORD_REQUIRED'],
    authorizationTtlSeconds: 300,
    authorizationDecisionRef: artifact('decision'),
    issuedAt: '2026-08-31T14:00:00.000Z',
    expiresAt: '2026-08-31T16:00:00.000Z',
    ...overrides,
  });
}

function egressRequest(overrides: Readonly<{
  providers?: readonly ('deepgram' | 'xai')[];
}> = {}) {
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'ORG', orgId: 'org-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 4_096,
    contentSha256: 'a'.repeat(64),
    storageVersion: createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'private/source.mp4' },
      byteLength: 4_096,
      providerVersion: { kind: 'R2_ETAG', value: 'etag-source' },
    }),
  });
  return createSourceTranscriptionEgressRequestV1({
    ...policyScope(),
    projectRevision: {
      schemaVersion: 1,
      value: 5,
      compatibilityUpdatedAt: '2026-08-31T14:59:00.000Z',
    },
    sourceBindingV2: createAssetTranscriptionSourceBindingV2({
      userId: 'member-1',
      assetId: 'asset-1',
      sourceRole: 'MASTER',
      sourceVersion,
      precision: 'MEASURED_WORD_REQUIRED',
    }),
    eligibleProviderIds: overrides.providers ?? ['deepgram', 'xai'],
    sourceRightsAuthorizationReceiptSha256: 'b'.repeat(64),
    privacyEgressPolicyRef: artifact('policy'),
  });
}

function policyScope() {
  return {
    tenantId: 'org-1',
    userId: 'member-1',
    orgId: 'org-1',
    projectId: 'project-1',
  };
}

function artifact(tag: string) {
  return {
    ownerId: 'POLICY_SERVICE',
    artifactId: tag,
    artifactVersion: '1',
    artifactSha256: tag === 'policy' ? 'c'.repeat(64)
      : tag === 'other-policy' ? 'd'.repeat(64) : 'e'.repeat(64),
  };
}
