import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-multipart-coordinator-v1';
import { MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_VERSION_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-multipart-mongo-store-v1';
import { MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-multipart-record-v1';
import { MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-multipart-transport-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV2,
  createMediaProxyMasterR2PrivatePublicationPolicyV2,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V2,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
  selectMediaProxyMasterR2PublicationPathV2,
} from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import { MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publisher-v1';
import {
  R2_MAX_OBJECT_BYTES,
  R2_MAX_PART_BYTES,
  R2_MAX_PARTS,
  R2_MIN_PART_BYTES,
  resolveMultipartPlan,
} from '@/lib/editron/services/r2-upload-limits';

describe('MediaProxyMasterR2PrivatePublicationPolicyV2', () => {
  it('hash-binds both existing publication owners and exact path eligibility', () => {
    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV2(scope());
    const { policySha256, ...material } = policy;

    expect(policy).toMatchObject({
      schemaVersion: 2,
      kind: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V2,
      policyVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2,
      selectionBasis: 'VERIFIED_ACTUAL_ARTIFACT_BYTE_LENGTH',
      singlePut: {
        eligibility: 'ACTUAL_BYTES_AT_OR_BELOW_SINGLE_REQUEST_MAXIMUM',
        policy: {
          bucketName: 'editron-media-proxy-private',
          maximumSingleRequestBytes:
            MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
        },
      },
      multipart: {
        eligibility: 'ACTUAL_BYTES_ABOVE_SINGLE_REQUEST_MAXIMUM',
        stateOwnerVersion:
          MEDIA_PROXY_MASTER_R2_MULTIPART_MONGO_STORE_VERSION_V1,
        recordVersion: MEDIA_PROXY_MASTER_R2_MULTIPART_RECORD_VERSION_V1,
        coordinatorVersion: MEDIA_PROXY_MASTER_R2_MULTIPART_COORDINATOR_VERSION_V1,
        transportVersion:
          MEDIA_PROXY_MASTER_R2_PRIVATE_MULTIPART_TRANSPORT_VERSION_V1,
        writeDisposition:
          'UNIQUE_SESSION_OBJECT_KEYS_NO_CROSS_SESSION_OVERWRITE',
        replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
        partPlan: 'DETERMINISTIC_UNIFORM_EXCEPT_FINAL',
        sourceRequirement:
          'EXACT_DURABLE_REOPENABLE_ARTIFACT_REQUIRED_UNTIL_PUBLISHED',
        minimumPartBytes: R2_MIN_PART_BYTES,
        maximumPartBytes: R2_MAX_PART_BYTES,
        maximumParts: R2_MAX_PARTS,
        maximumObjectBytes: R2_MAX_OBJECT_BYTES,
      },
    });
    expect(policySha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(assertMediaProxyMasterR2PrivatePublicationPolicyV2(policy))
      .toEqual(policy);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('uses exact actual bytes and blocks an ephemeral large artifact', () => {
    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV2(scope());
    expect(selectMediaProxyMasterR2PublicationPathV2({
      policy,
      actualByteLength: MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
      artifactSource: 'EPHEMERAL_LOCAL_FILE',
    })).toEqual({
      disposition: 'ELIGIBLE',
      path: 'SINGLE_PUT',
      actualByteLength: MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
      policySha256: policy.policySha256,
    });

    const firstMultipartByte =
      MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1 + 1;
    expect(selectMediaProxyMasterR2PublicationPathV2({
      policy,
      actualByteLength: firstMultipartByte,
      artifactSource: 'EPHEMERAL_LOCAL_FILE',
    })).toEqual({
      disposition: 'BLOCKED',
      reason: 'DURABLE_REOPENABLE_ARTIFACT_REQUIRED',
      actualByteLength: firstMultipartByte,
      policySha256: policy.policySha256,
    });
    expect(selectMediaProxyMasterR2PublicationPathV2({
      policy,
      actualByteLength: firstMultipartByte,
      artifactSource: 'DURABLE_REOPENABLE_FILE',
    })).toEqual({
      disposition: 'ELIGIBLE',
      path: 'DURABLE_MULTIPART',
      actualByteLength: firstMultipartByte,
      multipartPlan: resolveMultipartPlan(firstMultipartByte),
      policySha256: policy.policySha256,
    });
  });

  it('blocks provider overflow and rejects invalid sizes or source claims', () => {
    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV2(scope());
    expect(selectMediaProxyMasterR2PublicationPathV2({
      policy,
      actualByteLength: R2_MAX_OBJECT_BYTES + 1,
      artifactSource: 'DURABLE_REOPENABLE_FILE',
    })).toEqual({
      disposition: 'BLOCKED',
      reason: 'OBJECT_LIMIT_EXCEEDED',
      actualByteLength: R2_MAX_OBJECT_BYTES + 1,
      policySha256: policy.policySha256,
    });
    for (const actualByteLength of [0, -1, 1.5, Number.NaN]) {
      expect(() => selectMediaProxyMasterR2PublicationPathV2({
        policy,
        actualByteLength,
        artifactSource: 'EPHEMERAL_LOCAL_FILE',
      })).toThrow('ACTUAL_BYTE_LENGTH_INVALID');
    }
    expect(() => selectMediaProxyMasterR2PublicationPathV2({
      policy,
      actualByteLength: 1,
      artifactSource: 'FORGED' as never,
    })).toThrow('ARTIFACT_SOURCE_INVALID');
  });

  it('rejects public scope, extensions, owner substitution, and hash tampering', () => {
    expect(() => createMediaProxyMasterR2PrivatePublicationPolicyV2({
      ...scope(), bucketName: 'editron-cdn',
    })).toThrow('PRIVATE_STORAGE_INVALID');
    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV2(scope());
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV2({
      ...policy, unexpected: true,
    })).toThrow('FIELDS_INVALID');
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV2({
      ...policy,
      multipart: { ...policy.multipart, maximumParts: R2_MAX_PARTS - 1 },
    })).toThrow('MULTIPART_IDENTITY_INVALID');
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV2({
      ...policy,
      singlePut: {
        ...policy.singlePut,
        policy: {
          ...policy.singlePut.policy,
          bucketName: 'other-private-bucket',
        },
      },
    })).toThrow('HASH_MISMATCH');
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV2({
      ...policy, policySha256: 'x'.repeat(64),
    })).toThrow('SHA256_INVALID');
  });
});

function scope() {
  return {
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  };
}
