import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createProviderNativeCanonicalMediaIssuanceOwnerV2R,
  createProviderNativeCanonicalMediaSourceVersionV2R,
} from '@/lib/editron/services/provider-native-canonical-media-issuance-v2r';
import {
  createProviderNativeCanonicalMediaArtifactBindingV2R,
  createProviderNativeCanonicalMediaBindingRecordV2R,
  createProviderNativeCanonicalMediaPolicyGrantV2R,
} from '@/lib/editron/services/provider-native-canonical-media-product-records-v2r';
import { createProviderNativeCanonicalMediaReferenceBindingV2R }
  from '@/lib/editron/services/provider-native-canonical-media-reference-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

const H = (value: string) => value.repeat(64);
const NOW = '2026-08-23T10:00:00.000Z';
const SCOPE = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  projectId: 'project-a',
  episodeId: 'episode-a',
} as const;
const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_LUNA',
  provider: 'openai',
  model: 'gpt-5.6-luna',
  claimedModelIdentity: 'gpt-5.6-luna',
  reasoningMode: 'low',
};
const RIGHTS = ref('RIGHTS_POLICY', 'rights-a', H('1'));
const PRIVACY = ref('PRIVACY_POLICY', 'privacy-a', H('2'));
const DECISION = ref('MEDIA_POLICY_OWNER', 'decision-a', H('3'));

describe('provider-native canonical-media issuance V2R', () => {
  it.each(['NATIVE_VIDEO', 'ORDERED_TIMESTAMPED_IMAGES'] as const)(
    'issues a deterministic %s receipt only after the independent policy decision',
    async (arm) => {
      const fixture = buildFixture(arm);
      const calls: string[] = [];
      const policyDecision = vi.fn(async () => { calls.push('policy'); });
      const ledger = vi.fn(async () => {
        calls.push('ledger');
        return { ledgerReceiptSha256: H('f') };
      });
      const owner = createProviderNativeCanonicalMediaIssuanceOwnerV2R({
        now: () => NOW,
        policyDecision: { assertIssuable: policyDecision },
        ledger: { issueExact: ledger },
      });

      const first = await owner.issue(fixture);
      const second = await owner.issue(fixture);

      expect(second).toEqual(first);
      expect(first.scope).toEqual(SCOPE);
      expect(first.sourceVersionSha256).toBe(fixture.sourceVersion.sourceVersionSha256);
      expect(first.artifactBindingSha256s).toEqual(
        fixture.artifactBindings.map(({ bindingSha256 }) => bindingSha256).sort(),
      );
      expect(first.issuanceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(calls).toEqual(['policy', 'ledger', 'policy', 'ledger']);
    },
  );

  it.each([
    ['revoked', { disposition: 'REVOKED' as const }, 'POLICY_NOT_AUTHORIZED'],
    ['expired', { expiresAt: NOW }, 'POLICY_EXPIRED'],
    ['not-yet-valid', {
      issuedAt: '2026-08-23T11:00:00.000Z',
      expiresAt: '2026-08-24T11:00:00.000Z',
    }, 'POLICY_NOT_YET_VALID'],
  ])('rejects a %s policy before policy-owner or ledger calls', async (_label, policy, code) => {
    const fixture = buildFixture('NATIVE_VIDEO', policy);
    const { owner, policyDecision, ledger } = harness();

    await expect(owner.issue(fixture)).rejects.toThrow(
      `PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_${code}`,
    );
    expect(policyDecision).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it('rejects duplicate artifacts that conceal a missing manifest artifact', async () => {
    const fixture = buildFixture('ORDERED_TIMESTAMPED_IMAGES');
    const { owner, policyDecision, ledger } = harness();

    await expect(owner.issue({
      ...fixture,
      artifactBindings: [fixture.artifactBindings[0], fixture.artifactBindings[0]],
    })).rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_ARTIFACT_SET_MISMATCH');
    expect(policyDecision).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it('rejects a derived artifact assigned to a different media owner', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const original = fixture.artifactBindings[0];
    const artifact = createProviderNativeCanonicalMediaArtifactBindingV2R({
      ...withoutHash(original),
      mediaOwner: { type: 'ORG', orgId: 'org-other' },
    });
    const { owner, policyDecision, ledger } = harness();

    await expect(owner.issue({ ...fixture, artifactBindings: [artifact] }))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_ARTIFACT_BINDING_MISMATCH');
    expect(policyDecision).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it('rejects a copied-scope policy before either delegated owner runs', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const policyGrant = createProviderNativeCanonicalMediaPolicyGrantV2R({
      ...policyInput(fixture, { userId: 'copied-user' }),
    });
    const { owner, policyDecision, ledger } = harness();

    await expect(owner.issue({ ...fixture, policyGrant }))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_POLICY_BINDING_MISMATCH');
    expect(policyDecision).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it('rejects a forged source-version record before either delegated owner runs', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const sourceVersion = structuredClone(fixture.sourceVersion) as {
      byteLength: number;
    } & typeof fixture.sourceVersion;
    sourceVersion.byteLength += 1;
    const { owner, policyDecision, ledger } = harness();

    await expect(owner.issue({ ...fixture, sourceVersion }))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_ISSUANCE_SOURCE_VERSION_HASH_MISMATCH');
    expect(policyDecision).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
  });

  it('does not persist when the independent policy owner refuses issuance', async () => {
    const fixture = buildFixture('NATIVE_VIDEO');
    const ledger = vi.fn(async () => ({ ledgerReceiptSha256: H('f') }));
    const owner = createProviderNativeCanonicalMediaIssuanceOwnerV2R({
      now: () => NOW,
      policyDecision: {
        assertIssuable: vi.fn(async () => { throw new Error('POLICY_OWNER_REFUSED'); }),
      },
      ledger: { issueExact: ledger },
    });

    await expect(owner.issue(fixture)).rejects.toThrow('POLICY_OWNER_REFUSED');
    expect(ledger).not.toHaveBeenCalled();
  });
});

function harness() {
  const policyDecision = vi.fn(async () => undefined);
  const ledger = vi.fn(async () => ({ ledgerReceiptSha256: H('f') }));
  return {
    policyDecision,
    ledger,
    owner: createProviderNativeCanonicalMediaIssuanceOwnerV2R({
      now: () => NOW,
      policyDecision: { assertIssuable: policyDecision },
      ledger: { issueExact: ledger },
    }),
  };
}

function buildFixture(
  arm: 'NATIVE_VIDEO' | 'ORDERED_TIMESTAMPED_IMAGES',
  policyOverrides: Readonly<{
    disposition?: 'AUTHORIZED' | 'REVOKED';
    issuedAt?: string;
    expiresAt?: string;
  }> = {},
) {
  const media = arm === 'NATIVE_VIDEO' ? nativeVideo() : orderedImages();
  const sourceVersion = createProviderNativeCanonicalMediaSourceVersionV2R({
    mediaOwner: { type: 'USER', userId: SCOPE.userId },
    assetId: 'asset-source-a',
    mediaKind: 'video',
    byteLength: media.sourceByteLength,
    contentSha256: media.sourceContentSha256,
    referenceEnvelopeSha256: H('5'),
  });
  const policyGrant = createProviderNativeCanonicalMediaPolicyGrantV2R({
    scope: SCOPE,
    routeSha256: hashEditronCanonicalJsonV1(ROUTE),
    sourceAssetId: sourceVersion.assetId,
    sourceContentSha256: sourceVersion.contentSha256,
    rightsPolicyRef: RIGHTS,
    privacyEgressPolicyRef: PRIVACY,
    authorizationDecisionRef: DECISION,
    issuedAt: policyOverrides.issuedAt ?? '2026-08-23T08:00:00.000Z',
    expiresAt: policyOverrides.expiresAt ?? '2026-08-24T10:00:00.000Z',
    disposition: policyOverrides.disposition,
  });
  const binding = createProviderNativeCanonicalMediaReferenceBindingV2R({
    scope: SCOPE,
    route: ROUTE,
    source: {
      assetId: sourceVersion.assetId,
      assetVersionSha256: sourceVersion.sourceVersionSha256,
      contentSha256: sourceVersion.contentSha256,
      referenceEnvelopeSha256: sourceVersion.referenceEnvelopeSha256,
    },
    materializer: {
      ownerId: 'CANONICAL_MEDIA_SERVICE',
      ownerVersion: 'REFERENCE_MATERIALIZER_V1',
      parametersSha256: H('6'),
    },
    policy: {
      rightsPolicyRef: RIGHTS,
      privacyEgressPolicyRef: PRIVACY,
      authorizationSha256: policyGrant.authorizationSha256,
    },
    referenceInput: media.referenceInput,
    artifactMap: media.artifactMap,
  });
  const bindingRecord = createProviderNativeCanonicalMediaBindingRecordV2R({
    binding,
    createdAt: NOW,
  });
  const artifactBindings = binding.materialization.artifacts.map((artifact, index) =>
    createProviderNativeCanonicalMediaArtifactBindingV2R({
      scope: SCOPE,
      sourceAssetId: sourceVersion.assetId,
      sourceAssetVersionSha256: sourceVersion.sourceVersionSha256,
      referenceEnvelopeSha256: sourceVersion.referenceEnvelopeSha256,
      artifactId: artifact.artifactId,
      artifactVersionSha256: artifact.artifactVersionSha256,
      bytesSha256: artifact.bytesSha256,
      byteLength: artifact.byteLength,
      mediaOwner: sourceVersion.mediaOwner,
      storage: { backend: 'R2', key: media.storageKeys[index] },
      createdAt: NOW,
    }));
  return { sourceVersion, bindingRecord, policyGrant, artifactBindings };
}

function policyInput(
  fixture: ReturnType<typeof buildFixture>,
  scopeOverride: Readonly<Partial<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
  }>>,
) {
  return {
    scope: { ...SCOPE, ...scopeOverride },
    routeSha256: fixture.bindingRecord.binding.routeSha256,
    sourceAssetId: fixture.sourceVersion.assetId,
    sourceContentSha256: fixture.sourceVersion.contentSha256,
    rightsPolicyRef: RIGHTS,
    privacyEgressPolicyRef: PRIVACY,
    authorizationDecisionRef: DECISION,
    issuedAt: '2026-08-23T08:00:00.000Z',
    expiresAt: '2026-08-24T10:00:00.000Z',
  } as const;
}

function withoutHash<T extends Readonly<{ bindingSha256: string }>>(value: T) {
  const { bindingSha256: _bindingSha256, ...input } = value;
  return input;
}

function nativeVideo() {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(16, 0);
  bytes.write('ftyp', 4, 'ascii');
  const digest = sha(bytes);
  return {
    sourceContentSha256: digest,
    sourceByteLength: bytes.length,
    referenceInput: {
      version: 'EDITRON_PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_V2R_1',
      arm: 'NATIVE_VIDEO',
      referenceId: 'ref_native_a',
      referenceAssetSha256: digest,
      mimeType: 'video/mp4',
      bytesBase64: bytes.toString('base64'),
      bytesSha256: digest,
      byteLength: bytes.length,
      durationUs: '1000000',
      sourceRate: { numerator: '30', denominator: '1' },
      resolution: 'high',
    } as const,
    artifactMap: {
      arm: 'NATIVE_VIDEO',
      artifactId: 'artifact-video',
      artifactVersionSha256: H('7'),
    } as const,
    storageKeys: ['r2/reference-video.mp4'],
  };
}

function orderedImages() {
  const frameA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const frameB = Buffer.from([...frameA, 0x01]);
  return {
    sourceContentSha256: H('8'),
    sourceByteLength: 1_024,
    referenceInput: {
      version: 'EDITRON_PROVIDER_NATIVE_REFERENCE_INPUT_V2R_1',
      arm: 'ORDERED_TIMESTAMPED_IMAGES',
      referenceId: 'ref_frames_a',
      referenceAssetSha256: H('8'),
      resolution: 'high',
      frames: [
        { frameId: 'frame_a', timestampUs: '0', mimeType: 'image/png', bytesBase64: frameA.toString('base64'), bytesSha256: sha(frameA) },
        { frameId: 'frame_b', timestampUs: '500000', mimeType: 'image/png', bytesBase64: frameB.toString('base64'), bytesSha256: sha(frameB) },
      ],
    } as const,
    artifactMap: {
      arm: 'ORDERED_TIMESTAMPED_IMAGES',
      frames: [
        { frameId: 'frame_a', artifactId: 'artifact-frame-a', artifactVersionSha256: H('9') },
        { frameId: 'frame_b', artifactId: 'artifact-frame-b', artifactVersionSha256: H('a') },
      ],
    } as const,
    storageKeys: ['r2/frame-a.png', 'r2/frame-b.png'],
  };
}

function ref(ownerId: string, artifactId: string, artifactSha256: string) {
  return { ownerId, artifactId, artifactVersion: 'V1', artifactSha256 };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
