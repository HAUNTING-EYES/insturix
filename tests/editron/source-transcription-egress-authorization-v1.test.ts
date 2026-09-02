import { describe, expect, it, vi } from 'vitest';

import { createAssetTranscriptionSourceBindingV2 } from '@/lib/editron/services/asset-transcription-source-cache-v2';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import {
  assertSourceTranscriptionProviderApprovedV1,
  authorizeSourceTranscriptionEgressV1,
  createSourceTranscriptionEgressAuthorizationV1,
  createSourceTranscriptionEgressRequestV1,
} from '@/lib/editron/services/source-transcription-egress-authorization-v1';

const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('source transcription egress authorization V1', () => {
  it('authorizes an exact current project/source/provider request', async () => {
    const request = egressRequest();
    const authorization = createSourceTranscriptionEgressAuthorizationV1({
      request,
      approvedProviderIds: ['deepgram'],
      authorizationDecisionRef: artifact('decision'),
      issuedAt: '2026-08-31T11:55:00.000Z',
      expiresAt: '2026-08-31T12:05:00.000Z',
    });
    const owner = { authorize: vi.fn().mockResolvedValue(authorization) };

    const result = await authorizeSourceTranscriptionEgressV1(
      request,
      owner,
      () => NOW,
    );

    expect(result).toMatchObject({ disposition: 'AUTHORIZED' });
    expect(owner.authorize).toHaveBeenCalledWith(request);
    expect(() => assertSourceTranscriptionProviderApprovedV1(
      authorization,
      request,
      'deepgram',
    )).not.toThrow();
    expect(() => assertSourceTranscriptionProviderApprovedV1(
      authorization,
      request,
      'xai',
    )).toThrow('SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_NOT_APPROVED');
  });

  it('blocks a receipt issued for a different exact request', async () => {
    const request = egressRequest();
    const other = egressRequest({ revisionValue: 8 });
    const result = await authorizeSourceTranscriptionEgressV1(request, {
      authorize: vi.fn().mockResolvedValue(
        createSourceTranscriptionEgressAuthorizationV1({
          request: other,
          approvedProviderIds: ['deepgram'],
          authorizationDecisionRef: artifact('decision'),
          issuedAt: '2026-08-31T11:55:00.000Z',
          expiresAt: '2026-08-31T12:05:00.000Z',
        }),
      ),
    }, () => NOW);

    expect(result).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_INVALID',
    });
  });

  it('blocks an expired authorization', async () => {
    const request = egressRequest();
    const result = await authorizeSourceTranscriptionEgressV1(request, {
      authorize: vi.fn().mockResolvedValue(
        createSourceTranscriptionEgressAuthorizationV1({
          request,
          approvedProviderIds: ['deepgram'],
          authorizationDecisionRef: artifact('decision'),
          issuedAt: '2026-08-31T11:00:00.000Z',
          expiresAt: '2026-08-31T12:00:00.000Z',
        }),
      ),
    }, () => NOW);

    expect(result).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_TRANSCRIPTION_EGRESS_AUTHORIZATION_NOT_CURRENT',
    });
  });

  it('rejects duplicate or precision-incompatible provider sets', () => {
    expect(() => egressRequest({ providers: ['deepgram', 'deepgram'] }))
      .toThrow('SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_SET_INVALID');
    expect(() => egressRequest({ providers: ['fal-ai'] }))
      .toThrow('SOURCE_TRANSCRIPTION_EGRESS_PROVIDER_SET_INVALID');
  });

  it('rejects cross-tenant or invented organization scope', () => {
    expect(() => createSourceTranscriptionEgressRequestV1({
      ...egressRequestInput(),
      tenantId: 'user-2',
    })).toThrow('SOURCE_TRANSCRIPTION_EGRESS_SOURCE_TENANT_MISMATCH');
    expect(() => createSourceTranscriptionEgressRequestV1({
      ...egressRequestInput(),
      orgId: 'org-1',
    })).toThrow('SOURCE_TRANSCRIPTION_EGRESS_SOURCE_TENANT_MISMATCH');
  });
});

function egressRequest(overrides: Partial<{
  revisionValue: number;
  providers: readonly ('xai' | 'deepgram' | 'fal-ai' | 'google-gemini')[];
}> = {}) {
  return createSourceTranscriptionEgressRequestV1(egressRequestInput(overrides));
}

function egressRequestInput(overrides: Partial<{
  revisionValue: number;
  providers: readonly ('xai' | 'deepgram' | 'fal-ai' | 'google-gemini')[];
}> = {}) {
  return {
    tenantId: 'user-1',
    userId: 'user-1',
    orgId: null,
    projectId: 'project-1',
    projectRevision: {
      schemaVersion: 1 as const,
      value: overrides.revisionValue ?? 7,
      compatibilityUpdatedAt: '2026-08-31T11:50:00.000Z',
    },
    sourceBindingV2: sourceBinding(),
    eligibleProviderIds: overrides.providers ?? ['xai', 'deepgram'],
    sourceRightsAuthorizationReceiptSha256: 'd'.repeat(64),
    privacyEgressPolicyRef: artifact('privacy-policy'),
  };
}

function sourceBinding() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'private/source.mp4' },
    byteLength: 4_096,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-source' },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId: 'asset-1',
    mediaKind: 'video',
    byteLength: 4_096,
    contentSha256: 'a'.repeat(64),
    storageVersion,
  });
  return createAssetTranscriptionSourceBindingV2({
    userId: 'user-1',
    assetId: 'asset-1',
    sourceRole: 'DIRECT',
    sourceVersion,
    requestedLanguage: null,
    precision: 'MEASURED_WORD_REQUIRED',
  });
}

function artifact(tag: string) {
  return {
    ownerId: 'POLICY_SERVICE',
    artifactId: tag,
    artifactVersion: '1',
    artifactSha256: tag === 'decision' ? 'b'.repeat(64) : 'c'.repeat(64),
  };
}
