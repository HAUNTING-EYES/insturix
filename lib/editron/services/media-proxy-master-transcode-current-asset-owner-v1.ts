import { hashDurableWorkflowJobJsonV1 }
  from './durable-workflow-job-v1';
import {
  assertMediaProxyMasterTranscodeDurableJobInputV1,
  assertMediaProxyMasterTranscodeDurableJobV1,
} from './media-proxy-master-transcode-durable-job-v1';
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
import type {
  MediaSourcePtsCadenceMapAssetStorePortsV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import { assertMediaSourceVersionV1 }
  from './media-source-version-v1';

const SHA256 = /^[a-f0-9]{64}$/;

export type MediaProxyMasterTranscodeCurrentAssetStoreV1 = Pick<
  MediaSourcePtsCadenceMapAssetStorePortsV3,
  'load'
>;

/** Re-resolves the exact current MediaAsset and complete V3 map before FFmpeg. */
export function createMediaProxyMasterTranscodeCurrentAssetOwnerV1(
  input: Readonly<{
    runtimePolicyBindingSha256: string;
    assetStore: Readonly<MediaProxyMasterTranscodeCurrentAssetStoreV1>;
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

      let asset: Awaited<ReturnType<
        MediaProxyMasterTranscodeCurrentAssetStoreV1['load']
      >>;
      try {
        asset = await input.assetStore.load(jobInput.assetId, jobInput.userId);
      } catch {
        throw new MediaProxyMasterTranscodeDurableWorkerPortErrorV1(
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_CURRENT_ASSET_LOAD_FAILED',
          true,
        );
      }
      if (!asset) return null;

      try {
        const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
        if (asset.assetId !== jobInput.assetId
          || asset.type !== 'video'
          || sourceVersion.mediaKind !== 'video'
          || sourceVersion.sourceVersionSha256
            !== jobInput.command.masterSourceVersion.sourceVersionSha256) {
          throw currentAssetInvalid();
        }
        const currentTimeMap = await currentTimeMapPort.read(asset);
        if (!currentTimeMap
          || hashDurableWorkflowJobJsonV1(currentTimeMap)
            !== hashDurableWorkflowJobJsonV1(jobInput.command.masterTimeMap)) {
          throw currentAssetInvalid();
        }
        return asset;
      } catch (error) {
        if (error instanceof MediaProxyMasterTranscodeDurableWorkerPortErrorV1) {
          throw error;
        }
        throw currentAssetInvalid();
      }
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
