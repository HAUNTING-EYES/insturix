import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createMediaProxyMasterR2PreparedArtifactManifestV1,
  expectedMediaProxyMasterR2PreparedArtifactHandleV1,
  expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1,
  expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1,
  parseMediaProxyMasterR2PreparedArtifactManifestV1,
  serializeMediaProxyMasterR2PreparedArtifactManifestV1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-manifest-v1';
import { createMediaProxyMasterR2PreparedArtifactPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';

const MiB = 1024 * 1024;
const STAGED_AT = '2026-08-30T10:00:00.000Z';
const RETAIN_UNTIL = '2026-11-28T10:00:00.000Z';

describe('MediaProxyMasterR2PreparedArtifactManifestV1', () => {
  it('binds exact contiguous chunks and round-trips canonical manifest bytes', () => {
    const policy = createPolicy();
    const manifest = createManifest(policy);
    const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
      manifest,
      policy,
    });

    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.chunks.map((chunk) => [
      chunk.sequence, chunk.startByte, chunk.endExclusiveByte,
    ])).toEqual([
      [1, 0, 5 * MiB],
      [2, 5 * MiB, 5 * MiB + 17],
    ]);
    expect(serialization.objectKey).toBe(
      expectedMediaProxyMasterR2PreparedArtifactManifestObjectKeyV1(
        manifest.artifactHandle,
      ),
    );
    expect(serialization.contentSha256).toBe(
      createHash('sha256').update(serialization.canonicalJson).digest('hex'),
    );
    expect(parseMediaProxyMasterR2PreparedArtifactManifestV1({
      canonicalJson: serialization.canonicalJson,
      policy,
    })).toEqual(manifest);
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it('rejects owner drift, chunk gaps/substitution, ETag drift, and time inversion', () => {
    const policy = createPolicy();
    const valid = manifestInput(policy);
    expect(() => createMediaProxyMasterR2PreparedArtifactManifestV1({
      ...valid,
      owner: { kind: 'USER', userId: 'other_user' },
    })).toThrow('OWNER_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterR2PreparedArtifactManifestV1({
      ...valid,
      chunks: valid.chunks.map((chunk, index) => index === 1
        ? { ...chunk, startByte: chunk.startByte + 1 }
        : chunk),
    })).toThrow('CHUNK_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterR2PreparedArtifactManifestV1({
      ...valid,
      chunks: valid.chunks.map((chunk, index) => index === 0
        ? { ...chunk, objectKey: `${chunk.objectKey}.forged` }
        : chunk),
    })).toThrow('CHUNK_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterR2PreparedArtifactManifestV1({
      ...valid,
      chunks: valid.chunks.map((chunk, index) => index === 0
        ? { ...chunk, headETag: 'different' }
        : chunk),
    })).toThrow('CHUNK_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterR2PreparedArtifactManifestV1({
      ...valid,
      retainUntil: STAGED_AT,
    })).toThrow('RETENTION_OR_VERIFICATION_TIME_INVALID');
  });

  it('rejects extensions, noncanonical bytes, and manifest byte overflow', () => {
    const policy = createPolicy();
    const manifest = createManifest(policy);
    const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
      manifest,
      policy,
    });
    expect(() => parseMediaProxyMasterR2PreparedArtifactManifestV1({
      canonicalJson: JSON.stringify({ ...manifest, unexpected: true }),
      policy,
    })).toThrow('FIELDS_INVALID');
    expect(() => parseMediaProxyMasterR2PreparedArtifactManifestV1({
      canonicalJson: `${serialization.canonicalJson}\n`,
      policy,
    })).toThrow('MANIFEST_JSON_NON_CANONICAL');
    const tinyManifestPolicy = createPolicy(1_024);
    expect(() => serializeMediaProxyMasterR2PreparedArtifactManifestV1({
      manifest: createManifest(tinyManifestPolicy),
      policy: tinyManifestPolicy,
    })).toThrow('MANIFEST_BYTE_LIMIT');
  });
});

function createManifest(policy: ReturnType<typeof createPolicy>) {
  return createMediaProxyMasterR2PreparedArtifactManifestV1(
    manifestInput(policy),
  );
}

function manifestInput(policy: ReturnType<typeof createPolicy>) {
  const artifactByteLength = 5 * MiB + 17;
  const scope = {
    jobId: 'job_1',
    tenantId: 'tenant_1',
    userId: 'user_1',
    orgId: null,
    owner: { kind: 'USER' as const, userId: 'user_1' },
    assetId: 'asset_1',
    commandSha256: sha('command'),
    outputProbeSha256: sha('probe'),
    artifactByteLength,
    artifactContentSha256: sha('artifact'),
  };
  const artifactHandle = expectedMediaProxyMasterR2PreparedArtifactHandleV1({
    policy,
    ...scope,
  });
  const chunks = [
    chunk(artifactHandle, 1, 0, 5 * MiB, 'chunk-1'),
    chunk(artifactHandle, 2, 5 * MiB, artifactByteLength, 'chunk-2'),
  ];
  return {
    policy,
    jobId: scope.jobId,
    tenantId: scope.tenantId,
    userId: scope.userId,
    orgId: scope.orgId,
    owner: scope.owner,
    assetId: scope.assetId,
    commandSha256: scope.commandSha256,
    outputProbeSha256: scope.outputProbeSha256,
    artifactByteLength,
    artifactContentSha256: scope.artifactContentSha256,
    chunks,
    stagedAt: STAGED_AT,
    retainUntil: RETAIN_UNTIL,
  };
}

function chunk(
  artifactHandle: string,
  sequence: number,
  startByte: number,
  endExclusiveByte: number,
  seed: string,
) {
  const contentSha256 = sha(seed);
  return {
    sequence,
    startByte,
    endExclusiveByte,
    byteLength: endExclusiveByte - startByte,
    contentSha256,
    objectKey: expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
      artifactHandle,
      sequence,
      contentSha256,
    ),
    fullGetETag: `etag-${sequence}`,
    headETag: `etag-${sequence}`,
    verifiedAt: '2026-08-30T09:59:00.000Z',
  };
}

function createPolicy(maximumManifestBytes = 8 * MiB) {
  return createMediaProxyMasterR2PreparedArtifactPolicyV1({
    publicationPolicy: createMediaProxyMasterR2PrivatePublicationPolicyV2({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    }),
    targetChunkBytes: 5 * MiB,
    maximumManifestBytes,
  });
}

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
