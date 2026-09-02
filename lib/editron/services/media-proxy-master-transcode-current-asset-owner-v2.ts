import { hashDurableWorkflowJobJsonV1 }
  from './durable-workflow-job-v1';
import {
  resolveExactMediaProxyMasterTranscodeCurrentAssetV1,
  type MediaProxyMasterTranscodeCurrentAssetStoreV1,
} from './media-proxy-master-transcode-current-asset-core-v1';
import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
  MediaProxyMasterTranscodeDurableAttemptPortErrorV2,
  type MediaProxyMasterCurrentAssetOwnerV2,
} from './media-proxy-master-transcode-durable-attempt-v2';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV2,
  assertMediaProxyMasterTranscodeDurableJobV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  createMediaProxyMasterCurrentTimeMapPortV1,
  type MediaProxyMasterCurrentTimeMapPortV1,
} from './media-proxy-master-trusted-transcode-executor-v1';

const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeCurrentAssetStoreV2 =
  MediaProxyMasterTranscodeCurrentAssetStoreV1;

/** Re-resolves the exact current source and complete V3 map for a V2 job. */
export function createMediaProxyMasterTranscodeCurrentAssetOwnerV2(
  input: Readonly<{
    runtimePolicyBindingSha256: string;
    assetStore: Readonly<MediaProxyMasterTranscodeCurrentAssetStoreV2>;
    currentTimeMapPort?: Readonly<MediaProxyMasterCurrentTimeMapPortV1>;
  }>,
): Readonly<MediaProxyMasterCurrentAssetOwnerV2> {
  const runtimePolicyBindingSha256 = sha256(
    input.runtimePolicyBindingSha256,
    'RUNTIME_POLICY_BINDING',
  );
  const currentTimeMapPort = input.currentTimeMapPort
    ?? createMediaProxyMasterCurrentTimeMapPortV1();
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V2,
    ownerVersion: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V2,
    runtimePolicyBindingSha256,
    async resolve(
      { job, jobInput: jobInputValue }:
      Parameters<MediaProxyMasterCurrentAssetOwnerV2['resolve']>[0],
    ) {
      let jobInput: ReturnType<
        typeof assertMediaProxyMasterTranscodeDurableJobInputV2
      >;
      try {
        const boundJobInput = assertMediaProxyMasterTranscodeDurableJobV2(job);
        jobInput = assertMediaProxyMasterTranscodeDurableJobInputV2(
          jobInputValue,
        );
        if (job.status !== 'running'
          || job.attemptCount < 1
          || hashDurableWorkflowJobJsonV1(boundJobInput)
            !== hashDurableWorkflowJobJsonV1(jobInput)
          || jobInput.runtimePolicy.bindingSha256
            !== runtimePolicyBindingSha256) {
          throw currentAssetInvalid();
        }
      } catch (error) {
        if (error instanceof MediaProxyMasterTranscodeDurableAttemptPortErrorV2) {
          throw error;
        }
        throw currentAssetInvalid();
      }

      return resolveExactMediaProxyMasterTranscodeCurrentAssetV1({
        assetStore: input.assetStore,
        currentTimeMapPort,
        assetId: jobInput.assetId,
        userId: jobInput.userId,
        expectedSourceVersionSha256:
          jobInput.command.masterSourceVersion.sourceVersionSha256,
        expectedTimeMap: jobInput.command.masterTimeMap,
        createLoadError: () =>
          new MediaProxyMasterTranscodeDurableAttemptPortErrorV2(
            'CURRENT_ASSET_LOAD_FAILED',
            true,
          ),
        createInvalidError: currentAssetInvalid,
        isOwnerError: (error) =>
          error instanceof MediaProxyMasterTranscodeDurableAttemptPortErrorV2,
      });
    },
  });
}

function currentAssetInvalid():
MediaProxyMasterTranscodeDurableAttemptPortErrorV2 {
  return new MediaProxyMasterTranscodeDurableAttemptPortErrorV2(
    'CURRENT_ASSET_INVALID',
    false,
  );
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(
      `MEDIA_PROXY_MASTER_TRANSCODE_CURRENT_ASSET_OWNER_V2_${label}_INVALID`,
    );
  }
  return value;
}
