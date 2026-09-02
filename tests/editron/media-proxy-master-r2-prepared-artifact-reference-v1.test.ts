import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterR2PreparedArtifactManifestV1,
  expectedMediaProxyMasterR2PreparedArtifactHandleV1,
  expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1,
  serializeMediaProxyMasterR2PreparedArtifactManifestV1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-manifest-v1';
import { createMediaProxyMasterR2PreparedArtifactPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactReferenceForManifestV1,
  assertMediaProxyMasterR2PreparedArtifactReferenceV1,
  createMediaProxyMasterR2PreparedArtifactReferenceV1,
  MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1,
  MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-reference-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';

const MiB = 1024 * 1024;

describe('MediaProxyMasterR2PreparedArtifactReferenceV1', () => {
  it('issues a compact policy-bound reference after exact manifest fencing', () => {
    const fixture = createFixture();
    const reference = createMediaProxyMasterR2PreparedArtifactReferenceV1({
      policy: fixture.policy,
      serialization: fixture.serialization,
      manifestFullGetETag: 'manifest-etag',
      manifestHeadETag: 'manifest-etag',
    });

    expect(reference).toMatchObject({
      storeOwnerId: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_OWNER_ID_V1,
      storeOwnerVersion:
        MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_STORE_VERSION_V1,
      storePolicySha256: fixture.policy.policySha256,
      artifactHandle: fixture.manifest.artifactHandle,
      manifestObjectKey: fixture.serialization.objectKey,
      manifestContentSha256: fixture.serialization.contentSha256,
      verificationDisposition:
        'CANONICAL_MANIFEST_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
      releaseDisposition: 'DURABLE_REACHABILITY_GC_REQUIRED',
    });
    expect(assertMediaProxyMasterR2PreparedArtifactReferenceV1(
      reference,
      fixture.policy,
    )).toEqual(reference);
    expect(assertMediaProxyMasterR2PreparedArtifactReferenceForManifestV1({
      reference,
      serialization: fixture.serialization,
      policy: fixture.policy,
    })).toEqual(reference);
    expect(Object.keys(reference)).not.toContain('chunks');
  });

  it('rejects ETag drift, field extension, policy drift, and manifest substitution', () => {
    const fixture = createFixture();
    expect(() => createMediaProxyMasterR2PreparedArtifactReferenceV1({
      policy: fixture.policy,
      serialization: fixture.serialization,
      manifestFullGetETag: 'before',
      manifestHeadETag: 'after',
    })).toThrow('MANIFEST_ETAG_CHANGED');
    const reference = createMediaProxyMasterR2PreparedArtifactReferenceV1({
      policy: fixture.policy,
      serialization: fixture.serialization,
      manifestFullGetETag: 'manifest-etag',
      manifestHeadETag: 'manifest-etag',
    });
    expect(() => assertMediaProxyMasterR2PreparedArtifactReferenceV1({
      ...reference, unexpected: true,
    }, fixture.policy)).toThrow('FIELDS_INVALID');
    expect(() => assertMediaProxyMasterR2PreparedArtifactReferenceV1({
      ...reference, manifestContentSha256: sha('forged'),
    }, fixture.policy)).toThrow('REFERENCE_BINDING_INVALID');
    const otherPolicy = createPolicy(6 * MiB);
    expect(() => assertMediaProxyMasterR2PreparedArtifactReferenceV1(
      reference,
      otherPolicy,
    )).toThrow('REFERENCE_IDENTITY_INVALID');
    const substituted = {
      ...fixture.serialization,
      manifest: {
        ...fixture.manifest,
        assetId: 'asset_2',
      },
    };
    expect(() => assertMediaProxyMasterR2PreparedArtifactReferenceForManifestV1({
      reference,
      serialization: substituted as never,
      policy: fixture.policy,
    })).toThrow();
  });
});

function createFixture() {
  const policy = createPolicy(5 * MiB);
  const base = {
    jobId: 'job_1', tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    owner: { kind: 'USER' as const, userId: 'user_1' }, assetId: 'asset_1',
    commandSha256: sha('command'), outputProbeSha256: sha('probe'),
    artifactByteLength: 5 * MiB, artifactContentSha256: sha('artifact'),
  };
  const artifactHandle = expectedMediaProxyMasterR2PreparedArtifactHandleV1({
    policy,
    ...base,
  });
  const chunkContentSha256 = sha('chunk');
  const manifest = createMediaProxyMasterR2PreparedArtifactManifestV1({
    policy,
    jobId: base.jobId,
    tenantId: base.tenantId,
    userId: base.userId,
    orgId: base.orgId,
    owner: base.owner,
    assetId: base.assetId,
    commandSha256: base.commandSha256,
    outputProbeSha256: base.outputProbeSha256,
    artifactByteLength: base.artifactByteLength,
    artifactContentSha256: base.artifactContentSha256,
    chunks: [{
      sequence: 1,
      startByte: 0,
      endExclusiveByte: 5 * MiB,
      byteLength: 5 * MiB,
      contentSha256: chunkContentSha256,
      objectKey: expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
        artifactHandle,
        1,
        chunkContentSha256,
      ),
      fullGetETag: 'chunk-etag',
      headETag: 'chunk-etag',
      verifiedAt: '2026-08-30T09:59:00.000Z',
    }],
    stagedAt: '2026-08-30T10:00:00.000Z',
    retainUntil: '2026-11-28T10:00:00.000Z',
  });
  const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
    manifest,
    policy,
  });
  return { policy, manifest, serialization };
}

function createPolicy(targetChunkBytes: number) {
  return createMediaProxyMasterR2PreparedArtifactPolicyV1({
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV2({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    }),
    targetChunkBytes,
    maximumManifestBytes: 8 * MiB,
  });
}

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
