import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  createMediaProxyMasterR2PrivateBoundSinglePutPublisherV1,
  createMediaProxyMasterR2PrivatePublicationPolicyV1,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V1,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V1,
} from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
  MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
} from '@/lib/editron/services/media-proxy-master-r2-private-publisher-v1';

describe('MediaProxyMasterR2PrivatePublicationPolicyV1', () => {
  it('hash-binds the exact private single-PUT namespace and verification behavior', () => {
    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV1(scope());
    const { policySha256, ...material } = policy;

    expect(policy).toEqual({
      schemaVersion: 1,
      kind: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_KIND_V1,
      policyVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V1,
      publisherVersion: MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLISHER_VERSION_V1,
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
      objectVisibility: 'PRIVATE',
      artifactProfile: 'EDITRON_MEDIA_PROXY_MASTER_MP4_V1',
      contentType: 'video/mp4',
      cacheControl: 'private, no-store, max-age=0',
      contentDisposition: 'inline',
      writeDisposition: 'CREATE_ONLY_IF_NONE_MATCH_STAR',
      replayVerification: 'FULL_GET_SHA256_THEN_HEAD_ETAG_FENCE',
      maximumSingleRequestBytes: MEDIA_PROXY_MASTER_R2_MAX_SINGLE_PUT_BYTES_V1,
      largeObjectDisposition: 'REQUIRES_DURABLE_MULTIPART_OWNER',
      policySha256,
    });
    expect(policySha256).toBe(hashEditronCanonicalJsonV1(material));
    expect(assertMediaProxyMasterR2PrivatePublicationPolicyV1(policy))
      .toEqual(policy);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('returns the exact publisher together with the policy it must execute', () => {
    const bound = createMediaProxyMasterR2PrivateBoundSinglePutPublisherV1({
      privateStorage: scope(),
      client: { async send() { return {}; } },
    });

    expect(bound.publicationPolicy)
      .toEqual(createMediaProxyMasterR2PrivatePublicationPolicyV1(scope()));
    expect(typeof bound.publisher.publish).toBe('function');
    expect(Object.isFrozen(bound)).toBe(true);
  });

  it('rejects public, browser-routed, extended, substituted, and tampered policies', () => {
    expect(() => createMediaProxyMasterR2PrivatePublicationPolicyV1({
      ...scope(), bucketName: 'editron-cdn',
    })).toThrow('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_PRIVATE_STORAGE_INVALID');
    expect(() => createMediaProxyMasterR2PrivatePublicationPolicyV1({
      ...scope(), browserRouteExposure: 'PUBLIC_BROWSER_ROUTE' as never,
    })).toThrow('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_PRIVATE_STORAGE_INVALID');

    const policy = createMediaProxyMasterR2PrivatePublicationPolicyV1(scope());
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV1({
      ...policy, unexpected: true,
    })).toThrow('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_FIELDS_INVALID');
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV1({
      ...policy, maximumSingleRequestBytes: policy.maximumSingleRequestBytes - 1,
    })).toThrow('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_IDENTITY_INVALID');
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV1({
      ...policy, bucketName: 'other-private-bucket',
    })).toThrow('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_HASH_MISMATCH');
    expect(() => assertMediaProxyMasterR2PrivatePublicationPolicyV1({
      ...policy, policySha256: 'x'.repeat(64),
    })).toThrow('MEDIA_PROXY_MASTER_R2_PUBLICATION_POLICY_SHA256_INVALID');
  });
});

function scope() {
  return {
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
  };
}
