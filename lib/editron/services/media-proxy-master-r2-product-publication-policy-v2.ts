import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import {
  createMediaProxyMasterR2PreparedArtifactPolicyV1,
  type MediaProxyMasterR2PreparedArtifactPolicyV1,
} from './media-proxy-master-r2-prepared-artifact-policy-v1';
import {
  assertMediaProxyMasterR2PrivatePublicationPolicyV1,
  type MediaProxyMasterR2PrivatePublicationPolicyV1,
} from './media-proxy-master-r2-private-publication-policy-v1';
import {
  createMediaProxyMasterR2PrivatePublicationPolicyV2,
  type MediaProxyMasterR2PrivatePublicationPolicyV2,
} from './media-proxy-master-r2-private-publication-policy-v2';

const MEBIBYTE = 1_024 * 1_024;
export const MEDIA_PROXY_MASTER_R2_PREPARED_TARGET_CHUNK_BYTES_V2 =
  64 * MEBIBYTE;
export const MEDIA_PROXY_MASTER_R2_PREPARED_MAXIMUM_MANIFEST_BYTES_V2 =
  8 * MEBIBYTE;

export type MediaProxyMasterR2ProductPublicationPoliciesV2 = Readonly<{
  publicationPolicy: MediaProxyMasterR2PrivatePublicationPolicyV2;
  preparedArtifactPolicy: MediaProxyMasterR2PreparedArtifactPolicyV1;
}>;

/** Derives the V2 publication graph from the actual private single-PUT scope. */
export function createMediaProxyMasterR2ProductPublicationPoliciesV2(
  singlePutPolicyInput: MediaProxyMasterR2PrivatePublicationPolicyV1,
): MediaProxyMasterR2ProductPublicationPoliciesV2 {
  let singlePutPolicy: MediaProxyMasterR2PrivatePublicationPolicyV1;
  try {
    singlePutPolicy = assertMediaProxyMasterR2PrivatePublicationPolicyV1(
      singlePutPolicyInput,
    );
  } catch {
    fail('SINGLE_PUT_POLICY_INVALID');
  }
  const publicationPolicy =
    createMediaProxyMasterR2PrivatePublicationPolicyV2({
      bucketName: singlePutPolicy.bucketName,
      storagePolicyVersion: singlePutPolicy.storagePolicyVersion,
      browserRouteExposure: singlePutPolicy.browserRouteExposure,
    });
  if (canonicalizeEditronJsonV1(publicationPolicy.singlePut.policy)
      !== canonicalizeEditronJsonV1(singlePutPolicy)) {
    fail('SINGLE_PUT_POLICY_SUBSTITUTED');
  }
  const preparedArtifactPolicy =
    createMediaProxyMasterR2PreparedArtifactPolicyV1({
      publicationPolicy,
      targetChunkBytes:
        MEDIA_PROXY_MASTER_R2_PREPARED_TARGET_CHUNK_BYTES_V2,
      maximumManifestBytes:
        MEDIA_PROXY_MASTER_R2_PREPARED_MAXIMUM_MANIFEST_BYTES_V2,
    });
  return Object.freeze({ publicationPolicy, preparedArtifactPolicy });
}

function fail(code: string): never {
  throw new MediaProxyMasterR2ProductPublicationPolicyErrorV2(code);
}

export class MediaProxyMasterR2ProductPublicationPolicyErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_R2_PRODUCT_PUBLICATION_POLICY_V2_${code}`);
    this.name = 'MediaProxyMasterR2ProductPublicationPolicyErrorV2';
  }
}
