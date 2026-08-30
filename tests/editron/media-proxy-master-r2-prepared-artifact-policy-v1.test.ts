import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaProxyMasterR2PreparedArtifactPolicyV1,
  createMediaProxyMasterR2PreparedArtifactPolicyV1,
  MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_KIND_V1,
  MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_VERSION_V1,
  resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import {
  R2_MAX_OBJECT_BYTES,
  R2_MAX_PART_BYTES,
  R2_MAX_PARTS,
  R2_MIN_PART_BYTES,
} from '@/lib/editron/services/r2-upload-limits';

const MiB = 1024 * 1024;

describe('MediaProxyMasterR2PreparedArtifactPolicyV1', () => {
  it('hash-binds explicit chunk, manifest, verification, and release policy', () => {
    const policy = createPolicy();
    const { policySha256, ...material } = policy;

    expect(policy).toMatchObject({
      schemaVersion: 1,
      kind: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_KIND_V1,
      policyVersion: MEDIA_PROXY_MASTER_R2_PREPARED_ARTIFACT_POLICY_VERSION_V1,
      storageNamespace: 'editron-proxy-prepared/v1',
      objectVisibility: 'PRIVATE',
      contentType: 'video/mp4',
      chunkWriteDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR',
      chunkVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
      manifestWriteDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR',
      manifestVerification:
        'CANONICAL_FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
      chunkPlan: {
        targetChunkBytes: 64 * MiB,
        minimumChunkBytes: R2_MIN_PART_BYTES,
        maximumChunkBytes: R2_MAX_PART_BYTES,
        maximumChunks: R2_MAX_PARTS,
        maximumObjectBytes: R2_MAX_OBJECT_BYTES,
        alignmentBytes: MiB,
        finalChunkMayBeSmaller: true,
      },
      maximumManifestBytes: 8 * MiB,
      reopenDisposition:
        'MANIFEST_VERIFIED_CHUNKS_REASSEMBLED_AND_FULL_SHA256_VERIFIED',
      releaseDisposition: 'DURABLE_REACHABILITY_GC_REQUIRED',
    });
    expect(policySha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(assertMediaProxyMasterR2PreparedArtifactPolicyV1(policy))
      .toEqual(policy);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('plans deterministically from explicit target and raises size by count', () => {
    const policy = createPolicy();
    expect(resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
      policy,
      artifactByteLength: 64 * MiB + 1,
    })).toEqual({ chunkSize: 64 * MiB, totalChunks: 2 });

    const maximum = resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
      policy,
      artifactByteLength: R2_MAX_OBJECT_BYTES,
    });
    expect(maximum.totalChunks).toBeLessThanOrEqual(R2_MAX_PARTS);
    expect(maximum.chunkSize).toBeGreaterThan(64 * MiB);
    expect(maximum.chunkSize).toBeLessThanOrEqual(R2_MAX_PART_BYTES);
    expect(resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
      policy,
      artifactByteLength: R2_MAX_OBJECT_BYTES,
    })).toEqual(maximum);
  });

  it('rejects unbound thresholds, invalid artifacts, extensions, and drift', () => {
    const publicationPolicy = publication();
    for (const targetChunkBytes of [
      R2_MIN_PART_BYTES - 1,
      R2_MIN_PART_BYTES + 1,
      R2_MAX_PART_BYTES + 1,
    ]) {
      expect(() => createMediaProxyMasterR2PreparedArtifactPolicyV1({
        publicationPolicy,
        targetChunkBytes,
        maximumManifestBytes: 8 * MiB,
      })).toThrow('TARGET_CHUNK');
    }
    for (const maximumManifestBytes of [0, 1.5, 64 * MiB + 1]) {
      expect(() => createMediaProxyMasterR2PreparedArtifactPolicyV1({
        publicationPolicy,
        targetChunkBytes: 64 * MiB,
        maximumManifestBytes,
      })).toThrow('MANIFEST_BYTES_INVALID');
    }
    const policy = createPolicy();
    for (const artifactByteLength of [0, 1.5, R2_MAX_OBJECT_BYTES + 1]) {
      expect(() => resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
        policy,
        artifactByteLength,
      })).toThrow('ARTIFACT_BYTES_INVALID');
    }
    expect(() => assertMediaProxyMasterR2PreparedArtifactPolicyV1({
      ...policy, unexpected: true,
    })).toThrow('FIELDS_INVALID');
    expect(() => assertMediaProxyMasterR2PreparedArtifactPolicyV1({
      ...policy,
      chunkPlan: { ...policy.chunkPlan, maximumChunks: R2_MAX_PARTS - 1 },
    })).toThrow('CHUNK_PLAN_IDENTITY_INVALID');
    expect(() => assertMediaProxyMasterR2PreparedArtifactPolicyV1({
      ...policy, policySha256: 'x'.repeat(64),
    })).toThrow('SHA256_INVALID');
  });
});

function createPolicy() {
  return createMediaProxyMasterR2PreparedArtifactPolicyV1({
    publicationPolicy: publication(),
    targetChunkBytes: 64 * MiB,
    maximumManifestBytes: 8 * MiB,
  });
}

function publication() {
  return createMediaProxyMasterR2PrivatePublicationPolicyV2({
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE',
  });
}
