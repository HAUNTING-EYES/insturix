import { hashDurableWorkflowJobJsonV1 }
  from './durable-workflow-job-v1';
import type { MediaProxyMasterCurrentTimeMapPortV1 }
  from './media-proxy-master-trusted-transcode-executor-v1';
import type { MediaSourcePtsCadenceMapAssetStorePortsV3 }
  from './media-source-pts-cadence-map-asset-owner-v3';
import { assertMediaSourceVersionV1 }
  from './media-source-version-v1';

export type MediaProxyMasterTranscodeCurrentAssetStoreV1 = Pick<
  MediaSourcePtsCadenceMapAssetStorePortsV3,
  'load'
>;

type CurrentAssetV1 = Awaited<ReturnType<
  MediaProxyMasterTranscodeCurrentAssetStoreV1['load']
>>;

/**
 * Shared exact asset/time-map authority used by versioned durable-job wrappers.
 * Job-contract validation remains in those wrappers; this core owns the one
 * source/version/V3-map comparison so the safety rule cannot drift by version.
 */
export async function resolveExactMediaProxyMasterTranscodeCurrentAssetV1(
  input: Readonly<{
    assetStore: Readonly<MediaProxyMasterTranscodeCurrentAssetStoreV1>;
    currentTimeMapPort: Readonly<MediaProxyMasterCurrentTimeMapPortV1>;
    assetId: string;
    userId: string;
    expectedSourceVersionSha256: string;
    expectedTimeMap: unknown;
    createLoadError: () => Error;
    createInvalidError: () => Error;
    isOwnerError: (error: unknown) => boolean;
  }>,
): Promise<CurrentAssetV1> {
  let asset: CurrentAssetV1;
  try {
    asset = await input.assetStore.load(input.assetId, input.userId);
  } catch {
    throw input.createLoadError();
  }
  if (!asset) return null;

  try {
    const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
    if (asset.assetId !== input.assetId
      || asset.type !== 'video'
      || sourceVersion.mediaKind !== 'video'
      || sourceVersion.sourceVersionSha256
        !== input.expectedSourceVersionSha256) {
      throw input.createInvalidError();
    }
    const currentTimeMap = await input.currentTimeMapPort.read(asset);
    if (!currentTimeMap
      || hashDurableWorkflowJobJsonV1(currentTimeMap)
        !== hashDurableWorkflowJobJsonV1(input.expectedTimeMap)) {
      throw input.createInvalidError();
    }
    return asset;
  } catch (error) {
    if (input.isOwnerError(error)) throw error;
    throw input.createInvalidError();
  }
}
