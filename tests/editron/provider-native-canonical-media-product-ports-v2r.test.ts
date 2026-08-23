import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createProviderNativeCanonicalMediaProductPortsV2R,
  type ProviderNativeCanonicalMediaProductCollectionV2R,
} from '@/lib/editron/services/provider-native-canonical-media-product-ports-v2r';
import {
  assertProviderNativeCanonicalMediaArtifactBindingV2R,
  assertProviderNativeCanonicalMediaBindingRecordV2R,
  assertProviderNativeCanonicalMediaPolicyGrantV2R,
  createProviderNativeCanonicalMediaArtifactBindingV2R,
  createProviderNativeCanonicalMediaBindingRecordV2R,
  createProviderNativeCanonicalMediaPolicyGrantV2R,
} from '@/lib/editron/services/provider-native-canonical-media-product-records-v2r';
import {
  createProviderNativeCanonicalMediaReferenceOwnerV2R,
} from '@/lib/editron/services/provider-native-canonical-media-reference-owner-v2r';
import {
  createProviderNativeCanonicalMediaReferenceBindingV2R,
} from '@/lib/editron/services/provider-native-canonical-media-reference-v2r';
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

describe('provider-native canonical-media product ports V2R', () => {
  it('resolves an exact authorized native video from the existing mediaAssets store', async () => {
    const fixture = fixtureFor(nativeVideo());
    const readStorage = vi.fn(async () => fixture.bytesByArtifact.get('artifact-video')!);
    const ports = createPorts(fixture, readStorage);
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      ...ports,
    });

    const result = await owner.resolve({
      ...SCOPE,
      expectedManifestSha256: fixture.binding.materialization.manifestSha256,
    });

    expect(result).toEqual(fixture.referenceInput);
    expect(readStorage).toHaveBeenCalledWith({
      backend: 'R2',
      key: 'r2/reference-video.mp4',
      expectedByteLength: 16,
      timeoutMs: 45_000,
    });
    expect(fixture.bindings.indexes).toContain('uniq_provider_media_binding_scope_v2r');
    expect(fixture.policies.indexes).toContain('uniq_provider_media_policy_authorization_v2r');
  });

  it('reconstructs ordered timestamped images through separate canonical media rows', async () => {
    const fixture = fixtureFor(orderedImages());
    const ports = createPorts(fixture, async ({ key }) => {
      const artifactId = key.includes('frame-a') ? 'artifact-frame-a' : 'artifact-frame-b';
      return fixture.bytesByArtifact.get(artifactId)!;
    });
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      ...ports,
    });

    const result = await owner.resolve({
      ...SCOPE,
      expectedManifestSha256: fixture.binding.materialization.manifestSha256,
    });

    expect(result).toEqual(fixture.referenceInput);
  });

  it('rejects copied scope before policy or storage reads', async () => {
    const fixture = fixtureFor(nativeVideo());
    const readStorage = vi.fn(async () => fixture.bytesByArtifact.get('artifact-video')!);
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      ...createPorts(fixture, readStorage),
    });

    await expect(owner.resolve({
      ...SCOPE,
      userId: 'copied-user',
      expectedManifestSha256: fixture.binding.materialization.manifestSha256,
    })).rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_PRODUCT_BINDING_NOT_FOUND');
    expect(readStorage).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked', { disposition: 'REVOKED' as const, expiresAt: '2026-08-24T10:00:00.000Z' }, 'POLICY_GRANT_REVOKED'],
    ['expired', { disposition: 'AUTHORIZED' as const, expiresAt: '2026-08-23T09:59:59.000Z' }, 'POLICY_GRANT_EXPIRED'],
  ])('rejects a %s policy grant before storage reads', async (_label, policy, code) => {
    const fixture = fixtureFor(nativeVideo(), policy);
    const readStorage = vi.fn(async () => fixture.bytesByArtifact.get('artifact-video')!);
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      ...createPorts(fixture, readStorage),
    });

    await expect(owner.resolve({
      ...SCOPE,
      expectedManifestSha256: fixture.binding.materialization.manifestSha256,
    })).rejects.toThrow(`PROVIDER_NATIVE_CANONICAL_MEDIA_PRODUCT_${code}`);
    expect(readStorage).not.toHaveBeenCalled();
  });

  it('rejects a media row whose declared canonical storage key drifted', async () => {
    const fixture = fixtureFor(nativeVideo());
    fixture.media.rows[0].r2Key = 'r2/other-object.mp4';
    const readStorage = vi.fn(async () => fixture.bytesByArtifact.get('artifact-video')!);
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      ...createPorts(fixture, readStorage),
    });

    await expect(owner.resolve({
      ...SCOPE,
      expectedManifestSha256: fixture.binding.materialization.manifestSha256,
    })).rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_PRODUCT_ARTIFACT_STORAGE_ROW_MISMATCH');
    expect(readStorage).not.toHaveBeenCalled();
  });

  it('rejects changed bytes after all storage and policy identities match', async () => {
    const fixture = fixtureFor(nativeVideo());
    const altered = Buffer.from(fixture.bytesByArtifact.get('artifact-video')!);
    altered[altered.length - 1] ^= 1;
    const owner = createProviderNativeCanonicalMediaReferenceOwnerV2R({
      route: ROUTE,
      ...createPorts(fixture, async () => altered),
    });

    await expect(owner.resolve({
      ...SCOPE,
      expectedManifestSha256: fixture.binding.materialization.manifestSha256,
    })).rejects.toThrow('PROVIDER_NATIVE_CANONICAL_MEDIA_BYTES_MISMATCH');
  });

  it('rejects forged binding, policy and artifact metadata records', () => {
    const fixture = fixtureFor(nativeVideo());
    const forgedBinding = structuredClone(fixture.bindingRecord) as unknown as MongoRow;
    (((forgedBinding.binding as MongoRow).source) as MongoRow).assetId = 'asset-forged';
    expect(() => assertProviderNativeCanonicalMediaBindingRecordV2R(forgedBinding))
      .toThrow('BINDING_HASH_MISMATCH');

    const forgedPolicy = structuredClone(fixture.policyGrant) as unknown as MongoRow;
    (forgedPolicy.scope as MongoRow).userId = 'user-forged';
    expect(() => assertProviderNativeCanonicalMediaPolicyGrantV2R(forgedPolicy))
      .toThrow('POLICY_GRANT_HASH_MISMATCH');

    const forgedArtifact = structuredClone(
      fixture.media.rows[0].providerNativeCanonicalMediaArtifactV2R,
    ) as unknown as MongoRow;
    forgedArtifact.byteLength = Number(forgedArtifact.byteLength) + 1;
    expect(() => assertProviderNativeCanonicalMediaArtifactBindingV2R(forgedArtifact))
      .toThrow('ARTIFACT_BINDING_HASH_MISMATCH');
  });
});

function fixtureFor(
  source: ReturnType<typeof nativeVideo> | ReturnType<typeof orderedImages>,
  policyInput: Readonly<{
    disposition: 'AUTHORIZED' | 'REVOKED';
    expiresAt: string;
  }> = { disposition: 'AUTHORIZED', expiresAt: '2026-08-24T10:00:00.000Z' },
) {
  const policyGrant = createProviderNativeCanonicalMediaPolicyGrantV2R({
    scope: SCOPE,
    routeSha256: hashJson(ROUTE),
    sourceAssetId: 'asset-source-a',
    sourceContentSha256: source.sourceContentSha256,
    rightsPolicyRef: RIGHTS,
    privacyEgressPolicyRef: PRIVACY,
    authorizationDecisionRef: DECISION,
    issuedAt: '2026-08-23T08:00:00.000Z',
    expiresAt: policyInput.expiresAt,
    disposition: policyInput.disposition,
  });
  const binding = createProviderNativeCanonicalMediaReferenceBindingV2R({
    scope: SCOPE,
    route: ROUTE,
    source: {
      assetId: 'asset-source-a',
      assetVersionSha256: H('4'),
      contentSha256: source.sourceContentSha256,
      referenceEnvelopeSha256: H('5'),
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
    referenceInput: source.referenceInput,
    artifactMap: source.artifactMap,
  });
  const bindingRecord = createProviderNativeCanonicalMediaBindingRecordV2R({
    binding,
    createdAt: NOW,
  });
  const mediaRows = binding.materialization.artifacts.map((artifact, index) => {
    const key = source.storageKeys[index];
    const artifactBinding = createProviderNativeCanonicalMediaArtifactBindingV2R({
      scope: SCOPE,
      sourceAssetId: binding.source.assetId,
      sourceAssetVersionSha256: binding.source.assetVersionSha256,
      referenceEnvelopeSha256: binding.source.referenceEnvelopeSha256,
      artifactId: artifact.artifactId,
      artifactVersionSha256: artifact.artifactVersionSha256,
      bytesSha256: artifact.bytesSha256,
      byteLength: artifact.byteLength,
      storage: { backend: 'R2', key },
      createdAt: NOW,
    });
    return {
      assetId: artifact.artifactId,
      userId: SCOPE.userId,
      projectId: SCOPE.projectId,
      r2Key: key,
      providerNativeCanonicalMediaArtifactV2R: artifactBinding,
    };
  });
  return {
    referenceInput: source.referenceInput,
    bytesByArtifact: source.bytesByArtifact,
    binding,
    bindingRecord,
    policyGrant,
    bindings: new MemoryCollection([bindingRecord]),
    policies: new MemoryCollection([policyGrant]),
    media: new MemoryCollection(mediaRows),
  };
}

function createPorts(
  fixture: ReturnType<typeof fixtureFor>,
  readStorage: (input: Readonly<{
    backend: 'R2' | 'GCS'; key: string; expectedByteLength: number; timeoutMs: number;
  }>) => Promise<Uint8Array>,
) {
  return createProviderNativeCanonicalMediaProductPortsV2R({
    storageReadTimeoutMs: 45_000,
    now: () => NOW,
    loadRuntime: async () => ({
      bindings: fixture.bindings,
      policyGrants: fixture.policies,
      mediaAssets: fixture.media,
      readStorage,
    }),
  });
}

function nativeVideo() {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(16, 0);
  bytes.write('ftyp', 4, 'ascii');
  const digest = sha(bytes);
  return {
    sourceContentSha256: digest,
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
    bytesByArtifact: new Map([['artifact-video', bytes]]),
  };
}

function orderedImages() {
  const frameA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const frameB = Buffer.from([...frameA, 0x01]);
  return {
    sourceContentSha256: H('8'),
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
    bytesByArtifact: new Map([
      ['artifact-frame-a', frameA],
      ['artifact-frame-b', frameB],
    ]),
  };
}

class MemoryCollection implements ProviderNativeCanonicalMediaProductCollectionV2R {
  readonly indexes: string[] = [];

  constructor(readonly rows: MongoRow[]) {}

  async createIndex(_keys: Readonly<Record<string, 1 | -1>>, options: Readonly<{ name: string }>) {
    this.indexes.push(options.name);
    return options.name;
  }

  async findOne(filter: Readonly<Record<string, unknown>>) {
    return this.rows.find((row) => Object.entries(filter).every(([path, expected]) =>
      getPath(row, path) === expected)) ?? null;
  }
}

type MongoRow = Record<string, unknown>;

function getPath(value: MongoRow, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) =>
    current && typeof current === 'object' ? (current as MongoRow)[key] : undefined, value);
}

function ref(ownerId: string, artifactId: string, artifactSha256: string) {
  return { ownerId, artifactId, artifactVersion: 'V1', artifactSha256 };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashJson(value: unknown): string {
  return hashEditronCanonicalJsonV1(value);
}
