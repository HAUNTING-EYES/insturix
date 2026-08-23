import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createProviderNativeCanonicalMediaReferenceOwnerV2R,
} from '@/lib/editron/services/provider-native-canonical-media-reference-owner-v2r';
import {
  createProviderNativeCanonicalMediaReferenceBindingV2R,
} from '@/lib/editron/services/provider-native-canonical-media-reference-v2r';
import type { ProviderNativeReferenceMediaInputV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-video-reference-input-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

const H = (value: string) => value.repeat(64);
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
const POLICY = {
  rightsPolicyRef: ref('RIGHTS_POLICY', 'rights-a', H('1')),
  privacyEgressPolicyRef: ref('PRIVACY_POLICY', 'egress-a', H('2')),
  authorizationSha256: H('3'),
} as const;
const MATERIALIZER = {
  ownerId: 'CANONICAL_MEDIA_SERVICE',
  ownerVersion: 'REFERENCE_MATERIALIZER_V1',
  parametersSha256: H('4'),
} as const;

describe('provider-native canonical-media reference owner V2R', () => {
  it('reconstructs one exact route/policy-bound native video without storing bytes in the binding', async () => {
    const fixture = nativeFixture();
    const binding = createProviderNativeCanonicalMediaReferenceBindingV2R(fixture.bindingInput);
    expect(JSON.stringify(binding)).not.toContain(fixture.input.bytesBase64);

    const locator = { resolve: vi.fn(async () => binding) };
    const bytes = { read: vi.fn(async () => fixture.bytes) };
    const policy = {
      assertAuthorized: vi.fn(async () => ({ authorizationSha256: H('3') })),
    };
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      locator,
      bytes,
      policy,
    });

    const result = await owner.resolve(resolveInput(binding.materialization.manifestSha256));

    expect(result).toEqual(fixture.input);
    expect(locator.resolve).toHaveBeenCalledWith(expect.objectContaining({
      scope: SCOPE,
      expectedManifestSha256: binding.materialization.manifestSha256,
    }));
    expect(policy.assertAuthorized).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: 'asset-reference-a',
      sourceContentSha256: fixture.bytesSha256,
    }));
    expect(bytes.read).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'asset-reference-a',
      expectedBytesSha256: fixture.bytesSha256,
      expectedByteLength: fixture.bytes.length,
    }));
  });

  it('reconstructs ordered timestamped frames from separately versioned canonical artifacts', async () => {
    const fixture = imageFixture();
    const binding = createProviderNativeCanonicalMediaReferenceBindingV2R(fixture.bindingInput);
    const frameBytes = new Map([
      ['frame-artifact-a', fixture.frameA],
      ['frame-artifact-b', fixture.frameB],
    ]);
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      locator: { resolve: async () => binding },
      bytes: {
        read: async ({ artifactId }) => {
          const value = frameBytes.get(artifactId);
          if (!value) throw new Error('missing test artifact');
          return value;
        },
      },
      policy: { assertAuthorized: async () => ({ authorizationSha256: H('3') }) },
    });

    const result = await owner.resolve(resolveInput(binding.materialization.manifestSha256));

    expect(result).toEqual(fixture.input);
  });

  it('rejects copied scope and route before policy or bytes are consumed', async () => {
    const fixture = nativeFixture();
    const binding = createProviderNativeCanonicalMediaReferenceBindingV2R(fixture.bindingInput);
    const bytes = { read: vi.fn(async () => fixture.bytes) };
    const policy = {
      assertAuthorized: vi.fn(async () => ({ authorizationSha256: H('3') })),
    };
    const wrongRouteOwner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: { ...ROUTE, routeId: 'OPENAI_TERRA', model: 'gpt-5.6-terra', claimedModelIdentity: 'gpt-5.6-terra' },
      locator: { resolve: async () => binding },
      bytes,
      policy,
    });
    await expect(wrongRouteOwner.resolve(resolveInput(binding.materialization.manifestSha256)))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_ROUTE_MISMATCH');

    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      locator: { resolve: async () => binding },
      bytes,
      policy,
    });
    await expect(owner.resolve({
      ...resolveInput(binding.materialization.manifestSha256),
      userId: 'copied-user',
    })).rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_SCOPE_MISMATCH');
    expect(policy.assertAuthorized).not.toHaveBeenCalled();
    expect(bytes.read).not.toHaveBeenCalled();
  });

  it('rejects stale policy authorization before reading media bytes', async () => {
    const fixture = nativeFixture();
    const binding = createProviderNativeCanonicalMediaReferenceBindingV2R(fixture.bindingInput);
    const bytes = { read: vi.fn(async () => fixture.bytes) };
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      locator: { resolve: async () => binding },
      bytes,
      policy: { assertAuthorized: async () => ({ authorizationSha256: H('9') }) },
    });

    await expect(owner.resolve(resolveInput(binding.materialization.manifestSha256)))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_AUTHORIZATION_MISMATCH');
    expect(bytes.read).not.toHaveBeenCalled();
  });

  it('rejects altered canonical bytes even when a byte owner returns them', async () => {
    const fixture = nativeFixture();
    const binding = createProviderNativeCanonicalMediaReferenceBindingV2R(fixture.bindingInput);
    const altered = Buffer.from(fixture.bytes);
    altered[altered.length - 1] ^= 1;
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      locator: { resolve: async () => binding },
      bytes: { read: async () => altered },
      policy: { assertAuthorized: async () => ({ authorizationSha256: H('3') }) },
    });

    await expect(owner.resolve(resolveInput(binding.materialization.manifestSha256)))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_BYTES_MISMATCH');
  });

  it('rejects a forged locator binding before policy or byte owners run', async () => {
    const fixture = nativeFixture();
    const binding = createProviderNativeCanonicalMediaReferenceBindingV2R(fixture.bindingInput);
    const forged = structuredClone(binding) as unknown as Record<string, unknown>;
    (forged.source as Record<string, unknown>).assetId = 'asset-forged';
    const bytes = { read: vi.fn(async () => fixture.bytes) };
    const policy = {
      assertAuthorized: vi.fn(async () => ({ authorizationSha256: H('3') })),
    };
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      locator: { resolve: async () => forged },
      bytes,
      policy,
    });

    await expect(owner.resolve(resolveInput(binding.materialization.manifestSha256)))
      .rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_BINDING_HASH_MISMATCH');
    expect(policy.assertAuthorized).not.toHaveBeenCalled();
    expect(bytes.read).not.toHaveBeenCalled();
  });
});

function nativeFixture() {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(16, 0);
  bytes.write('ftyp', 4, 'ascii');
  const bytesSha256 = sha(bytes);
  const input = {
    version: 'EDITRON_PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_V2R_1',
    arm: 'NATIVE_VIDEO',
    referenceId: 'ref_native_a',
    referenceAssetSha256: bytesSha256,
    mimeType: 'video/mp4',
    bytesBase64: bytes.toString('base64'),
    bytesSha256,
    byteLength: bytes.length,
    durationUs: '1000000',
    sourceRate: { numerator: '30', denominator: '1' },
    resolution: 'high',
  } as const;
  return {
    bytes,
    bytesSha256,
    input,
    bindingInput: baseBindingInput(input, bytesSha256, {
      arm: 'NATIVE_VIDEO' as const,
      artifactId: 'asset-reference-a',
      artifactVersionSha256: H('6'),
    }),
  };
}

function imageFixture() {
  const frameA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const frameB = Buffer.from([...frameA, 0x01]);
  const sourceSha256 = H('7');
  const input = {
    version: 'EDITRON_PROVIDER_NATIVE_REFERENCE_INPUT_V2R_1',
    arm: 'ORDERED_TIMESTAMPED_IMAGES',
    referenceId: 'ref_frames_a',
    referenceAssetSha256: sourceSha256,
    resolution: 'high',
    frames: [
      { frameId: 'frame_a', timestampUs: '0', mimeType: 'image/png', bytesBase64: frameA.toString('base64'), bytesSha256: sha(frameA) },
      { frameId: 'frame_b', timestampUs: '500000', mimeType: 'image/png', bytesBase64: frameB.toString('base64'), bytesSha256: sha(frameB) },
    ],
  } as const;
  return {
    frameA,
    frameB,
    input,
    bindingInput: baseBindingInput(input, sourceSha256, {
      arm: 'ORDERED_TIMESTAMPED_IMAGES' as const,
      frames: [
        { frameId: 'frame_a', artifactId: 'frame-artifact-a', artifactVersionSha256: H('8') },
        { frameId: 'frame_b', artifactId: 'frame-artifact-b', artifactVersionSha256: H('9') },
      ],
    }),
  };
}

function baseBindingInput(
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>,
  contentSha256: string,
  artifactMap: Parameters<typeof createProviderNativeCanonicalMediaReferenceBindingV2R>[0]['artifactMap'],
) {
  return {
    scope: SCOPE,
    route: ROUTE,
    source: {
      assetId: 'asset-reference-a',
      assetVersionSha256: H('5'),
      contentSha256,
      referenceEnvelopeSha256: H('6'),
    },
    materializer: MATERIALIZER,
    policy: POLICY,
    referenceInput,
    artifactMap,
  } as const;
}

function resolveInput(expectedManifestSha256: string) {
  return { ...SCOPE, expectedManifestSha256 };
}

function ref(ownerId: string, artifactId: string, artifactSha256: string) {
  return { ownerId, artifactId, artifactVersion: 'V1', artifactSha256 };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
