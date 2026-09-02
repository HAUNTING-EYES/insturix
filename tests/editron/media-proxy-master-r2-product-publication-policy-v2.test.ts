import { describe, expect, it } from 'vitest';

import {
  MEDIA_PROXY_MASTER_R2_PREPARED_MAXIMUM_MANIFEST_BYTES_V2,
  MEDIA_PROXY_MASTER_R2_PREPARED_TARGET_CHUNK_BYTES_V2,
  createMediaProxyMasterR2ProductPublicationPoliciesV2,
} from '@/lib/editron/services/media-proxy-master-r2-product-publication-policy-v2';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';

describe('MediaProxyMasterR2ProductPublicationPoliciesV2', () => {
  it('derives deterministic private V2 publication and staging policies', () => {
    const singlePut = createMediaProxyMasterR2PrivatePublicationPolicyV1({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    });
    const first = createMediaProxyMasterR2ProductPublicationPoliciesV2(
      singlePut,
    );
    const second = createMediaProxyMasterR2ProductPublicationPoliciesV2(
      singlePut,
    );

    expect(first).toEqual(second);
    expect(first.publicationPolicy.singlePut.policy).toEqual(singlePut);
    expect(first.publicationPolicy).toMatchObject({
      selectionBasis: 'VERIFIED_ACTUAL_ARTIFACT_BYTE_LENGTH',
      multipart: {
        sourceRequirement:
          'EXACT_DURABLE_REOPENABLE_ARTIFACT_REQUIRED_UNTIL_PUBLISHED',
      },
    });
    expect(first.preparedArtifactPolicy).toMatchObject({
      publicationPolicy: first.publicationPolicy,
      chunkPlan: {
        targetChunkBytes:
          MEDIA_PROXY_MASTER_R2_PREPARED_TARGET_CHUNK_BYTES_V2,
      },
      maximumManifestBytes:
        MEDIA_PROXY_MASTER_R2_PREPARED_MAXIMUM_MANIFEST_BYTES_V2,
      releaseDisposition: 'DURABLE_REACHABILITY_GC_REQUIRED',
    });
  });

  it('rejects a malformed or substituted single-PUT declaration', () => {
    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV1({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    });
    expect(() => createMediaProxyMasterR2ProductPublicationPoliciesV2({
      ...policy,
      bucketName: 'public-or-foreign-bucket',
    })).toThrow('PRODUCT_PUBLICATION_POLICY_V2_SINGLE_PUT_POLICY_INVALID');
  });
});
