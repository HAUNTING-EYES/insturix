import { hashDurableWorkflowJobJsonV1 }
  from './durable-workflow-job-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  assertMediaProxyMasterTranscodeDurableJobV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  resolveExactMediaProxyMasterTranscodeCurrentAssetV1,
  type MediaProxyMasterTranscodeCurrentAssetStoreV1 as CurrentAssetStoreV1,
} from './media-proxy-master-transcode-current-asset-core-v1';
import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1,
  MediaProxyMasterTranscodeDurableWorkerPortErrorV1,
  type MediaProxyMasterCurrentAssetOwnerV1,
} from './media-proxy-master-transcode-durable-worker-v1';
import {
  createMediaProxyMasterCurrentTimeMapPortV1,
  type MediaProxyMasterCurrentTimeMapPortV1,
} from './media-proxy-master-trusted-transcode-executor-v1';

export type { MediaProxyMasterTranscodeCurrentAssetStoreV1 }
  from './media-proxy-master-transcode-current-asset-core-v1';

const SHA256 = /^[a-f0-9]{64}$/;

/** Re-resolves the exact current MediaAsset and complete V3 map before FFmpeg. */
export function createMediaProxyMasterTranscodeCurrentAssetOwnerV1(
  input: Readonly<{
    runtimePolicyBindingSha256: string;
    assetStore: Readonly<CurrentAssetStoreV1>;
    currentTimeMapPort?: Readonly<MediaProxyMasterCurrentTimeMapPortV1>;
  }>,
): Readonly<MediaProxyMasterCurrentAssetOwnerV1> {
  const runtimePolicyBindingSha256 = sha256(
    input.runtimePolicyBindingSha256,
    'RUNTIME_POLICY_BINDING',
  );
  const currentTimeMapPort = input.currentTimeMapPort
    ?? createMediaProxyMasterCurrentTimeMapPortV1();
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1,
    ownerVersion: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1,
    runtimePolicyBindingSha256,
    async resolve(
      { job, jobInput: jobInputValue }:
      Parameters<MediaProxyMasterCurrentAssetOwnerV1['resolve']>[0],
    ) {
      let jobInput: ReturnType<
        typeof assertMediaProxyMasterTranscodeDurableJobInputV1
      >;
      try {
        const boundJobInput = assertMediaProxyMasterTranscodeDurableJobV1(job);
        jobInput = assertMediaProxyMasterTranscodeDurableJobInputV1(
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
        if (error instanceof MediaProxyMasterTranscodeDurableWorkerPortErrorV1) {
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
          new MediaProxyMasterTranscodeDurableWorkerPortErrorV1(
            'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_LOAD_FAILED',
            true,
          ),
        createInvalidError: currentAssetInvalid,
        isOwnerError: (error) =>
          error instanceof MediaProxyMasterTranscodeDurableWorkerPortErrorV1,
      });
    },
  });
}

function currentAssetInvalid():
MediaProxyMasterTranscodeDurableWorkerPortErrorV1 {
  return new MediaProxyMasterTranscodeDurableWorkerPortErrorV1(
    'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_INVALID',
    false,
  );
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(
      `MEDIA_PROXY_MASTER_TRANSCODE_CURRENT_ASSET_OWNER_${label}_INVALID`,
    );
  }
  return value;
}
