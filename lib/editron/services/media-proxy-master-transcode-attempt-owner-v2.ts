import type { MediaProxyMasterR2PreparedArtifactStoreV1 }
  from './media-proxy-master-r2-prepared-artifact-store-v1';
import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
  MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2,
  runMediaProxyMasterTranscodeDurableAttemptV2,
  type MediaProxyMasterCurrentAssetOwnerV2,
  type MediaProxyMasterPreparationOwnerV2,
  type MediaProxyMasterPublicationOwnerV2,
} from './media-proxy-master-transcode-durable-attempt-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
  type MediaProxyMasterTranscodeAttemptOwnerV2,
} from './media-proxy-master-transcode-durable-worker-v2';
import { MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2 }
  from './media-proxy-master-r2-private-publication-policy-v2';

export class MediaProxyMasterTranscodeAttemptOwnerErrorV2 extends Error {}

export function createMediaProxyMasterTranscodeAttemptOwnerV2(
  input: Readonly<{
    jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
    currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV2>;
    preparationOwner: Readonly<MediaProxyMasterPreparationOwnerV2>;
    preparedArtifactStore: Pick<
      MediaProxyMasterR2PreparedArtifactStoreV1,
      'stage' | 'reopen'
    >;
    publicationOwner: Readonly<MediaProxyMasterPublicationOwnerV2>;
  }>,
): Readonly<MediaProxyMasterTranscodeAttemptOwnerV2> {
  let jobInput: MediaProxyMasterTranscodeDurableJobInputV2;
  try {
    jobInput = assertMediaProxyMasterTranscodeDurableJobInputV2(
      input.jobInput,
    );
  } catch {
    fail('JOB_INPUT_INVALID');
  }
  assertBindings(input, jobInput);

  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
    ownerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    publicationPolicySha256: jobInput.publicationPolicy.policySha256,
    preparedArtifactPolicySha256:
      jobInput.preparedArtifactPolicy.policySha256,
    run(value: Parameters<MediaProxyMasterTranscodeAttemptOwnerV2['run']>[0]) {
      return runMediaProxyMasterTranscodeDurableAttemptV2({
        ...value,
        currentAssetOwner: input.currentAssetOwner,
        preparationOwner: input.preparationOwner,
        preparedArtifactStore: input.preparedArtifactStore,
        publicationOwner: input.publicationOwner,
      });
    },
  });
}

function assertBindings(
  input: Parameters<typeof createMediaProxyMasterTranscodeAttemptOwnerV2>[0],
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): void {
  if (input.currentAssetOwner?.ownerId
      !== MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2
    || input.currentAssetOwner.ownerVersion
      !== MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2
    || input.currentAssetOwner.runtimePolicyBindingSha256
      !== jobInput.runtimePolicy.bindingSha256
    || typeof input.currentAssetOwner.resolve !== 'function'
    || input.preparationOwner?.ownerId
      !== MEDIA_PROXY_MASTER_PREPARATION_OWNER_ID_V2
    || input.preparationOwner.ownerVersion
      !== jobInput.command.policy.policyVersion
    || input.preparationOwner.runtimePolicyBindingSha256
      !== jobInput.runtimePolicy.bindingSha256
    || typeof input.preparationOwner.prepare !== 'function'
    || typeof input.preparedArtifactStore?.stage !== 'function'
    || typeof input.preparedArtifactStore.reopen !== 'function'
    || input.publicationOwner?.ownerId
      !== MEDIA_PROXY_MASTER_PUBLICATION_OWNER_ID_V2
    || input.publicationOwner.ownerVersion
      !== MEDIA_PROXY_MASTER_R2_PRIVATE_PUBLICATION_POLICY_VERSION_V2
    || input.publicationOwner.publicationPolicySha256
      !== jobInput.publicationPolicy.policySha256
    || input.publicationOwner.preparedArtifactPolicySha256
      !== jobInput.preparedArtifactPolicy.policySha256
    || typeof input.publicationOwner.publish !== 'function') {
    fail('CONSTRUCTION_BINDING_INVALID');
  }
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeAttemptOwnerErrorV2(
    `MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_V2_${code}`,
  );
}
