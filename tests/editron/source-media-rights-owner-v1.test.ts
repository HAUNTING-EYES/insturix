import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

import { describe, expect, it, vi } from 'vitest';

import { readNativeMediaFinalRenderVideoOverlayV1 } from '@/lib/editron/services/native-media-final-render-admission-v1';
import { createNativeMediaFinalRenderSourceRightsOwnerV1 } from '@/lib/editron/services/native-media-final-render-source-rights-owner-v1';
import {
  createNativeMediaFinalRenderArtifactV1,
  NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_KIND_V1,
  type NativeMediaFinalRenderArtifactAudioV1,
} from '@/lib/editron/services/native-media-final-render-source-preparation-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
} from '@/lib/editron/services/media-source-version-v1';
import {
  assertSourceMediaRightsGrantStateV1,
  issueSourceMediaRightsV1,
  revokeSourceMediaRightsV1,
  type SourceMediaRightsGrantStateV1,
  type SourceMediaRightsLicenseEvidenceV1,
  type SourceMediaRightsPrincipalAuthorityV1,
} from '@/lib/editron/services/source-media-rights-owner-v1';
import { authorizeCurrentSourceMediaRightsV1 }
  from '@/lib/editron/services/source-media-rights-authorization-v1';

const ISSUED_AT = new Date('2026-08-30T10:00:00.000Z');
const ACTIVE_AT = new Date('2026-08-30T12:00:00.000Z');
const REVOCATION_AT = new Date('2026-08-30T13:00:00.000Z');
const REVISION = Object.freeze({
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-30T09:00:00.000Z',
});

describe('SourceMediaRightsOwnerV1', () => {
  it('issues one deterministic project/source-version-bound user grant', async () => {
    const sourceVersion = mediaSourceVersion();
    const authority = principalAuthority();

    const first = await issueRights({ sourceVersion, principalAuthority: authority });
    const second = await issueRights({ sourceVersion, principalAuthority: principalAuthority() });

    expect(first.sourceMediaRightsV1.recordSha256)
      .toBe(second.sourceMediaRightsV1.recordSha256);
    expect(first.sourceMediaRightsV1).toMatchObject({
      tenantId: 'tenant-1',
      attestedByUserId: 'user-a',
      orgId: null,
      projectId: 'project-1',
      disposition: 'OWNED_BY_USER',
      permittedUse: 'EDIT_AND_RENDER_PROJECT',
      source: {
        assetId: 'asset-a',
        sourceVersionSha256: sourceVersion.sourceVersionSha256,
      },
    });
    expect(Object.isFrozen(first.sourceMediaRightsV1)).toBe(true);
    expect(assertSourceMediaRightsGrantStateV1(first)).toEqual(first);
    expect(first).toMatchObject({
      previousStateSha256V1: null,
      sourceMediaRightsV1: { supersedesRecordSha256: null },
    });
    expect(authority.authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ISSUE',
      actorUserId: 'user-a',
      projectId: 'project-1',
      currentRecordSha256: null,
    }));
  });

  it('blocks invalid ownership claims before consulting principal authority', async () => {
    const authority = principalAuthority();
    const result = await issueSourceMediaRightsV1({
      ...issueInput(),
      disposition: 'OWNED_BY_ORG',
      orgId: 'org-a',
      principalAuthority: authority,
    });

    expect(result).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_ISSUE_INPUT_INVALID',
    });
    expect(authority.authorize).not.toHaveBeenCalled();
  });

  it('propagates a deterministic principal denial and rejects malformed authority output', async () => {
    const denied = principalAuthority({
      disposition: 'BLOCKED',
      diagnosticCode: 'PROJECT_MEMBERSHIP_REQUIRED',
    });
    await expect(issueSourceMediaRightsV1({
      ...issueInput(),
      principalAuthority: denied,
    })).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'PROJECT_MEMBERSHIP_REQUIRED',
    });

    const malformed = principalAuthority({
      disposition: 'AUTHORIZED',
      receiptSha256: 'not-a-sha',
    });
    await expect(issueSourceMediaRightsV1({
      ...issueInput(),
      principalAuthority: malformed,
    })).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_AUTHORIZATION_RESULT_INVALID',
    });
  });

  it('requires explicit evidence and a valid range for project licenses', async () => {
    const missing = await issueSourceMediaRightsV1({
      ...issueInput(),
      disposition: 'LICENSED_FOR_PROJECT',
      license: null,
      principalAuthority: principalAuthority(),
    });
    expect(missing).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_ISSUE_INPUT_INVALID',
    });

    const state = await issueRights({
      disposition: 'LICENSED_FOR_PROJECT',
      license: activeLicense(),
    });
    expect(state.sourceMediaRightsV1.license).toEqual(activeLicense());

    const invalidRange = await issueSourceMediaRightsV1({
      ...issueInput(),
      disposition: 'LICENSED_FOR_PROJECT',
      license: {
        ...activeLicense(),
        validFrom: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-08-31T00:00:00.000Z',
      },
      principalAuthority: principalAuthority(),
    });
    expect(invalidRange.disposition).toBe('BLOCKED');
  });

  it('issues organization ownership only for the exact organization-owned source', async () => {
    const sourceVersion = mediaSourceVersion({ kind: 'ORG', orgId: 'org-a' });
    const state = await issueRights({
      sourceVersion,
      attestedByUserId: 'org-admin',
      orgId: 'org-a',
      disposition: 'OWNED_BY_ORG',
    });

    expect(assertSourceMediaRightsGrantStateV1(state)).toEqual(state);
    expect(state.sourceMediaRightsV1).toMatchObject({
      orgId: 'org-a',
      disposition: 'OWNED_BY_ORG',
      source: { owner: { kind: 'ORG', orgId: 'org-a' } },
    });
  });

  it('chains a re-attestation to the exact prior record and state', async () => {
    const first = await issueRights();
    const authority = principalAuthority();
    const second = await issueRights({
      currentState: first,
      termsVersion: 'rights-terms-v2',
      termsContentSha256: hex('1'),
      attestedAt: new Date('2026-08-30T11:00:00.000Z'),
      principalAuthority: authority,
    });

    expect(second.sourceMediaRightsV1.supersedesRecordSha256)
      .toBe(first.sourceMediaRightsV1.recordSha256);
    expect(second.previousStateSha256V1)
      .toBe(first.sourceMediaRightsStateSha256V1);
    expect(second.sourceMediaRightsStateSha256V1)
      .not.toBe(first.sourceMediaRightsStateSha256V1);
    expect(authority.authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ISSUE',
      currentRecordSha256: first.sourceMediaRightsV1.recordSha256,
    }));
  });

  it('rejects partial, forged, or cross-source re-attestation state', async () => {
    const sourceVersion = mediaSourceVersion();
    const state = await issueRights({ sourceVersion });

    expect(() => assertSourceMediaRightsGrantStateV1({
      sourceMediaRightsV1: state.sourceMediaRightsV1,
      sourceMediaRightsRevocationV1: state.sourceMediaRightsRevocationV1,
      sourceMediaRightsStateSha256V1: state.sourceMediaRightsStateSha256V1,
    })).toThrow('SOURCE_MEDIA_RIGHTS_STATE_FIELDS_INVALID');
    expect(() => assertSourceMediaRightsGrantStateV1({
      ...state,
      sourceMediaRightsV1: {
        ...state.sourceMediaRightsV1,
        recordSha256: hex('f'),
      },
    })).toThrow('SOURCE_MEDIA_RIGHTS_RECORD_HASH_MISMATCH');

    const replacement = mediaSourceVersion(
      { kind: 'USER', userId: 'user-a' },
      { contentSha256: hex('b'), objectKey: 'asset-a-v2', eTag: 'etag-v2' },
    );
    const authority = principalAuthority();
    await expect(issueSourceMediaRightsV1({
      ...issueInput(),
      sourceVersion: replacement,
      currentState: state,
      attestedAt: new Date('2026-08-30T11:00:00.000Z'),
      principalAuthority: authority,
    })).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_ISSUE_INPUT_INVALID',
    });
    expect(authority.authorize).not.toHaveBeenCalled();
  });

  it('creates an independently authorized immutable revocation and rejects reuse', async () => {
    const state = await issueRights();
    const authority = principalAuthority();
    const result = await revokeSourceMediaRightsV1({
      state,
      revokedByUserId: 'user-a',
      reason: 'RIGHTS_WITHDRAWN',
      revokedAt: REVOCATION_AT,
      principalAuthority: authority,
    });
    expect(result.disposition).toBe('REVOKED');
    if (result.disposition !== 'REVOKED') throw new Error('expected revocation');
    expect(result.state.sourceMediaRightsRevocationV1).toMatchObject({
      recordSha256: state.sourceMediaRightsV1.recordSha256,
      sourceVersionSha256: state.sourceMediaRightsV1.source.sourceVersionSha256,
      revokedByUserId: 'user-a',
      reason: 'RIGHTS_WITHDRAWN',
    });
    expect(result.state.previousStateSha256V1)
      .toBe(state.sourceMediaRightsStateSha256V1);
    expect(authority.authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: 'REVOKE',
      currentRecordSha256: state.sourceMediaRightsV1.recordSha256,
    }));
    await expect(revokeSourceMediaRightsV1({
      state: result.state,
      revokedByUserId: 'user-a',
      reason: 'RIGHTS_WITHDRAWN',
      revokedAt: new Date('2026-08-30T14:00:00.000Z'),
      principalAuthority: principalAuthority(),
    })).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_ALREADY_REVOKED',
    });
  });

  it('blocks a revocation timestamp that predates the issuance record', async () => {
    const state = await issueRights();
    await expect(revokeSourceMediaRightsV1({
      state,
      revokedByUserId: 'user-a',
      reason: 'RIGHTS_WITHDRAWN',
      revokedAt: new Date('2026-08-30T09:59:59.999Z'),
      principalAuthority: principalAuthority(),
    })).resolves.toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_REVOCATION_PRECEDES_ISSUE',
    });
  });
});

describe('NativeMediaFinalRenderSourceRightsOwnerV1', () => {
  it('authorizes an exact visual-only artifact without invoking audio authority', async () => {
    const runtime = await publicationRuntime();
    const result = await runtime.owner.authorize(runtime.input);

    expect(result.disposition).toBe('AUTHORIZED');
    if (result.disposition !== 'AUTHORIZED') throw new Error('expected authorization');
    expect(result.receipt).toMatchObject({
      disposition: 'AUTHORIZED',
      ownerId: 'EDITRON_SOURCE_MEDIA_RIGHTS_OWNER',
      ownerVersion: '1',
      tenantId: 'tenant-1',
      userId: 'user-a',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: 'overlay-1',
      assetId: 'asset-a',
      sourceVersionSha256: runtime.sourceVersion.sourceVersionSha256,
    });
    expect(runtime.verifyAudioRights).not.toHaveBeenCalled();
  });

  it('permits a project collaborator only when the source owner is the project owner', async () => {
    const runtime = await publicationRuntime();
    const result = await runtime.owner.authorize({
      ...runtime.input,
      userId: 'collaborator-a',
      projectOwnerId: 'user-a',
    });
    expect(result.disposition).toBe('AUTHORIZED');

    const denied = await runtime.owner.authorize({
      ...runtime.input,
      userId: 'collaborator-a',
      projectOwnerId: 'different-owner',
    });
    expect(denied).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_PRINCIPAL_SCOPE_MISMATCH',
    });
  });

  it.each([
    ['tenantId', 'tenant-2'],
    ['projectId', 'project-2'],
    ['orgId', 'org-a'],
  ] as const)('blocks a mismatched %s publication scope', async (field, value) => {
    const runtime = await publicationRuntime();
    const result = await runtime.owner.authorize({
      ...runtime.input,
      [field]: value,
    });
    expect(result).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: field === 'projectId'
        ? 'SOURCE_MEDIA_RIGHTS_ARTIFACT_SCOPE_MISMATCH'
        : 'SOURCE_MEDIA_RIGHTS_PROJECT_SCOPE_MISMATCH',
    });
  });

  it('blocks missing ledger evidence despite legacy consent and rejects forged state', async () => {
    const runtime = await publicationRuntime();
    runtime.rightsReader.read.mockResolvedValueOnce(null);
    const missing = await runtime.owner.authorize({
      ...runtime.input,
      asset: { ...runtime.input.asset, audioRights: { licensed: true } } as never,
    });
    expect(missing).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_EVIDENCE_MISSING',
    });

    runtime.rightsReader.read.mockResolvedValueOnce({
      ...runtime.state,
      sourceMediaRightsStateSha256V1: hex('f'),
    });
    const forged = await runtime.owner.authorize(runtime.input);
    expect(forged).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_EVIDENCE_INVALID',
    });
  });

  it('blocks revoked and inactive licensed evidence', async () => {
    const revokedRuntime = await publicationRuntime();
    const revocation = await revokeSourceMediaRightsV1({
      state: revokedRuntime.state,
      revokedByUserId: 'user-a',
      reason: 'RIGHTS_WITHDRAWN',
      revokedAt: REVOCATION_AT,
      principalAuthority: principalAuthority(),
    });
    if (revocation.disposition !== 'REVOKED') throw new Error('expected revocation');
    revokedRuntime.rightsReader.read.mockResolvedValueOnce(revocation.state);
    expect(await revokedRuntime.owner.authorize(revokedRuntime.input)).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_REVOKED',
    });

    const expiredRuntime = await publicationRuntime({
      disposition: 'LICENSED_FOR_PROJECT',
      license: {
        ...activeLicense(),
        expiresAt: '2026-08-30T11:00:00.000Z',
      },
    });
    expect(await expiredRuntime.owner.authorize(expiredRuntime.input)).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_LICENSE_NOT_ACTIVE',
    });
  });

  it('requires the existing audio authority for an embedded exact-PCM artifact', async () => {
    const runtime = await publicationRuntime({ renderNativeAudio: true });
    const result = await runtime.owner.authorize(runtime.input);
    expect(result.disposition).toBe('AUTHORIZED');
    expect(runtime.verifyAudioRights).toHaveBeenCalledWith({
      userId: 'user-a',
      projectId: 'project-1',
      projectOwnerId: 'user-a',
      overlays: [runtime.overlay],
    });

    runtime.verifyAudioRights.mockRejectedValueOnce(new Error('revoked'));
    expect(await runtime.owner.authorize(runtime.input)).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_AUDIO_UNVERIFIED',
    });
  });

  it('rejects forged artifacts and overlay/audio disposition mismatches', async () => {
    const runtime = await publicationRuntime();
    expect(await runtime.owner.authorize({
      ...runtime.input,
      artifact: {
        ...runtime.artifact,
        artifactBindingSha256: hex('f'),
      },
    })).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_ARTIFACT_INVALID',
    });

    const audioOverlay = videoOverlay(true);
    expect(await runtime.owner.authorize({
      ...runtime.input,
      overlay: audioOverlay,
    })).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_OVERLAY_SCOPE_MISMATCH',
    });
  });

  it('authorizes organization-owned sources only inside the exact organization', async () => {
    const sourceVersion = mediaSourceVersion({ kind: 'ORG', orgId: 'org-a' });
    const runtime = await publicationRuntime({
      sourceVersion,
      disposition: 'OWNED_BY_ORG',
      attestedByUserId: 'org-admin',
      orgId: 'org-a',
    });
    expect((await runtime.owner.authorize(runtime.input)).disposition).toBe('AUTHORIZED');

    expect(await runtime.owner.authorize({
      ...runtime.input,
      orgId: 'org-b',
    })).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_PROJECT_SCOPE_MISMATCH',
    });
  });
});

describe('authorizeCurrentSourceMediaRightsV1', () => {
  it('binds the current actor, project, complete source reference and ledger head', async () => {
    const sourceVersion = mediaSourceVersion();
    const state = await issueRights({ sourceVersion });
    const result = await authorizeCurrentSourceMediaRightsV1({
      tenantId: 'tenant-1',
      userId: 'collaborator-a',
      orgId: null,
      projectId: 'project-1',
      projectOwnerId: 'user-a',
      sourceVersion,
    }, {
      rightsReader: { read: vi.fn().mockResolvedValue(state) },
      now: () => ACTIVE_AT,
    });

    expect(result.disposition).toBe('AUTHORIZED');
    if (result.disposition !== 'AUTHORIZED') throw new Error('expected authorization');
    expect(result.receipt).toMatchObject({
      tenantId: 'tenant-1',
      userId: 'collaborator-a',
      projectId: 'project-1',
      projectOwnerId: 'user-a',
      source: {
        assetId: sourceVersion.assetId,
        contentSha256: sourceVersion.contentSha256,
        storageVersionSha256:
          sourceVersion.storageVersion.storageVersionSha256,
        sourceVersionSha256: sourceVersion.sourceVersionSha256,
      },
      sourceMediaRightsStateSha256V1:
        state.sourceMediaRightsStateSha256V1,
      sourceMediaRightsRecordSha256: state.sourceMediaRightsV1.recordSha256,
      evaluatedAt: ACTIVE_AT.toISOString(),
    });
    expect(result.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a ledger state for a different immutable source reference', async () => {
    const authorizedSource = mediaSourceVersion();
    const selectedSource = mediaSourceVersion(
      { kind: 'USER', userId: 'user-a' },
      { contentSha256: hex('b'), objectKey: 'asset-a-v2', eTag: 'etag-v2' },
    );
    const state = await issueRights({ sourceVersion: authorizedSource });
    const result = await authorizeCurrentSourceMediaRightsV1({
      tenantId: 'tenant-1',
      userId: 'user-a',
      orgId: null,
      projectId: 'project-1',
      projectOwnerId: 'user-a',
      sourceVersion: selectedSource,
    }, {
      rightsReader: { read: vi.fn().mockResolvedValue(state) },
      now: () => ACTIVE_AT,
    });

    expect(result).toEqual({
      disposition: 'BLOCKED',
      diagnosticCode: 'SOURCE_MEDIA_RIGHTS_SOURCE_SCOPE_MISMATCH',
    });
  });
});

async function issueRights(
  overrides: Partial<Parameters<typeof issueSourceMediaRightsV1>[0]> = {},
): Promise<SourceMediaRightsGrantStateV1> {
  const result = await issueSourceMediaRightsV1({
    ...issueInput(),
    ...overrides,
    principalAuthority: overrides.principalAuthority ?? principalAuthority(),
  });
  if (result.disposition !== 'ISSUED') {
    throw new Error(`expected rights issuance: ${result.diagnosticCode}`);
  }
  return result.state;
}

function issueInput(): Parameters<typeof issueSourceMediaRightsV1>[0] {
  return {
    tenantId: 'tenant-1',
    attestedByUserId: 'user-a',
    orgId: null,
    projectId: 'project-1',
    disposition: 'OWNED_BY_USER',
    sourceVersion: mediaSourceVersion(),
    termsVersion: 'rights-terms-v1',
    termsContentSha256: hex('d'),
    license: null,
    attestedAt: ISSUED_AT,
    principalAuthority: principalAuthority(),
  };
}

function principalAuthority(
  result: Awaited<ReturnType<SourceMediaRightsPrincipalAuthorityV1['authorize']>> = {
    disposition: 'AUTHORIZED',
    receiptSha256: hex('e'),
  },
) {
  return {
    ownerId: 'PROJECT_ACCESS_AUTHORITY',
    ownerVersion: '1',
    authorize: vi.fn().mockResolvedValue(result),
  } satisfies SourceMediaRightsPrincipalAuthorityV1;
}

function mediaSourceVersion(
  owner: MediaSourceOwnerV1 = { kind: 'USER', userId: 'user-a' },
  overrides: Readonly<{
    contentSha256?: string;
    objectKey?: string;
    eTag?: string;
  }> = {},
) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: overrides.objectKey ?? 'asset-a' },
    byteLength: 2_048,
    providerVersion: { kind: 'R2_ETAG', value: overrides.eTag ?? 'etag-a' },
  });
  return createMediaSourceVersionV1({
    owner,
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: 2_048,
    contentSha256: overrides.contentSha256 ?? hex('a'),
    storageVersion,
  });
}

function asset(
  sourceVersion: ReturnType<typeof mediaSourceVersion>,
) {
  return {
    assetId: sourceVersion.assetId,
    type: sourceVersion.mediaKind,
    userId: sourceVersion.owner.kind === 'USER' ? sourceVersion.owner.userId : 'org-admin',
    orgId: sourceVersion.owner.kind === 'ORG' ? sourceVersion.owner.orgId : undefined,
    sourceVersionV1: sourceVersion,
  };
}

function activeLicense(): SourceMediaRightsLicenseEvidenceV1 {
  return Object.freeze({
    licenseId: 'license-1',
    issuerId: 'licensor-1',
    validFrom: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-08-31T00:00:00.000Z',
    evidenceSha256: hex('c'),
  });
}

async function publicationRuntime(overrides: Readonly<{
  sourceVersion?: ReturnType<typeof mediaSourceVersion>;
  disposition?: 'OWNED_BY_USER' | 'OWNED_BY_ORG' | 'LICENSED_FOR_PROJECT';
  attestedByUserId?: string;
  orgId?: string | null;
  license?: SourceMediaRightsLicenseEvidenceV1 | null;
  renderNativeAudio?: boolean;
}> = {}) {
  const sourceVersion = overrides.sourceVersion ?? mediaSourceVersion();
  const disposition = overrides.disposition ?? 'OWNED_BY_USER';
  const attestedByUserId = overrides.attestedByUserId ?? 'user-a';
  const orgId = overrides.orgId ?? null;
  const license = overrides.license
    ?? (disposition === 'LICENSED_FOR_PROJECT' ? activeLicense() : null);
  const state = await issueRights({
    sourceVersion,
    disposition,
    attestedByUserId,
    orgId,
    license,
  });
  const overlay = videoOverlay(overrides.renderNativeAudio ?? false);
  const artifact = renderArtifact(sourceVersion, overlay);
  const verifyAudioRights = vi.fn().mockResolvedValue(undefined);
  const rightsReader = {
    read: vi.fn().mockResolvedValue(state),
  };
  const owner = createNativeMediaFinalRenderSourceRightsOwnerV1({
    rightsReader,
    now: () => ACTIVE_AT,
    verifyAudioRights,
  });
  const input = {
    tenantId: 'tenant-1',
    userId: disposition === 'OWNED_BY_ORG' ? 'org-admin' : 'user-a',
    orgId,
    projectId: 'project-1',
    projectOwnerId: disposition === 'OWNED_BY_ORG' ? null : 'user-a',
    sequenceId: 'main',
    projectRevision: REVISION,
    currentScopeSha256: hex('9'),
    overlay,
    asset: asset(sourceVersion),
    artifact,
  };
  return {
    sourceVersion,
    state,
    overlay,
    artifact,
    verifyAudioRights,
    rightsReader,
    owner,
    input,
  };
}

function videoOverlay(renderNativeAudio: boolean): Overlay {
  return {
    id: 'overlay-1',
    type: 'video',
    assetId: 'asset-a',
    from: 0,
    durationInFrames: 30,
    sourceStartFrame: 0,
    sourceEndFrame: 30,
    hasNativeAudio: renderNativeAudio,
    ...(renderNativeAudio && {
      audioRights: {
        mediaRole: 'native-video',
        source: 'user-upload',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'user-attestation',
          sourceAssetId: 'asset-a',
          attestationVersion: 'audio-rights-attestation-v1',
          attestedAt: '2026-08-30T10:00:00.000Z',
          attestedBy: 'user-a',
        },
      },
    }),
  } as unknown as Overlay;
}

function renderArtifact(
  sourceVersion: ReturnType<typeof mediaSourceVersion>,
  overlay: Overlay,
) {
  const normalizedOverlay = readNativeMediaFinalRenderVideoOverlayV1(overlay);
  const audio: NativeMediaFinalRenderArtifactAudioV1 = normalizedOverlay.renderNativeAudio
    ? {
        disposition: 'EMBEDDED_EXACT_NATIVE_PCM',
        audioCodec: 'aac',
        audioMappingSha256: hex('1'),
        sourceDecodedPcmSha256: hex('2'),
        artifactDecodedPcmSha256: hex('2'),
        decodedPcmEquivalenceReceiptSha256: hex('3'),
        sampleRate: '48000',
        channelCount: 2,
        decodedSampleFrameCount: '48000',
      }
    : {
        disposition: 'NO_AUDIO_MAPPING_REQUESTED',
        audioCodec: null,
        audioMappingSha256: null,
        sourceDecodedPcmSha256: null,
        artifactDecodedPcmSha256: null,
        decodedPcmEquivalenceReceiptSha256: null,
        sampleRate: null,
        channelCount: null,
        decodedSampleFrameCount: null,
      };
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1,
    kind: NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_KIND_V1,
    artifactHandle: 'private-artifact-1',
    projectId: 'project-1',
    sequenceId: 'main',
    projectRevision: REVISION,
    overlayId: normalizedOverlay.overlayId,
    assetId: normalizedOverlay.assetId,
    overlayTimingSha256: normalizedOverlay.overlayTimingSha256,
    assetTimingStateSha256: hex('4'),
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: hex('5'),
    sourcePtsCadenceMapStateSha256V3: hex('6'),
    transformSha256: hex('7'),
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '0',
    timelineFrameCount: '30',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'mp4',
    videoCodec: 'h264',
    pixelFormat: 'yuv420p',
    videoFrameCount: '30',
    decodedFrameSequenceSha256: hex('8'),
    remotionCompatibilityReceiptSha256: hex('a'),
    audio,
    contentType: 'video/mp4',
    artifactContentSha256: hex('b'),
    artifactByteLength: '4096',
  });
}

function hex(character: string): string {
  return character.repeat(64);
}
