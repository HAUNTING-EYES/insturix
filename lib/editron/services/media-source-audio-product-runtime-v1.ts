import {
  createMediaSourceAudioArtifactAssetMongoPortsV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioPrivateArtifactStreamWriterV1 }
  from './media-source-audio-private-artifact-port-v1';
import {
  materializeMediaSourceAudioProductV1,
  type MediaSourceAudioProductMaterializationInputV1,
  type MediaSourceAudioProductMaterializationReceiptV1,
} from './media-source-audio-product-materializer-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import { createMediaSourceVersionEvidenceMongoStorePortsV1 }
  from './media-source-version-evidence-mongo-store-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from './media-source-version-evidence-owner-v1';
import {
  createQualifiedAssetMediaSourceLeasePortV1,
  type VerifiedMediaSourceLeasePortV1,
} from './verified-media-source-local-file-v1';

type PrivateAudioRuntimeV1 = Readonly<{
  audioArtifact: MediaSourceAudioPrivateArtifactStreamWriterV1;
}>;

type MaterializeProductV1 = typeof materializeMediaSourceAudioProductV1;

export type MediaSourceAudioProductRuntimeResultV1 =
  | MediaSourceAudioProductMaterializationReceiptV1
  | Readonly<{
      kind: 'runtime_unavailable';
      reason:
        | 'PRIVATE_STORAGE_NOT_CONFIGURED'
        | 'MEDIA_ASSET_OWNER_UNAVAILABLE'
        | 'SOURCE_VERSION_EVIDENCE_OWNER_UNAVAILABLE';
    }>;

export type MediaSourceAudioProductRuntimeDependenciesV1 = Readonly<{
  environment?: MediaSourcePtsCadenceR2RuntimeEnvironmentV1;
  createPrivateRuntime?: (
    environment: MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
  ) => PrivateAudioRuntimeV1;
  createAssetStorePorts?: () =>
    Promise<MediaSourceAudioArtifactAssetStorePortsV1>;
  createEvidenceStorePorts?: () => MediaSourceVersionEvidenceStorePortsV1;
  createSourceLease?: (
    asset: MediaSourceAudioArtifactAssetStateInputV1,
  ) => VerifiedMediaSourceLeasePortV1;
  materializeProduct?: MaterializeProductV1;
}>;

/** Composes the product materializer over the dedicated server-only owners. */
export async function runMediaSourceAudioProductRuntimeV1(
  input: MediaSourceAudioProductMaterializationInputV1,
  dependencies: MediaSourceAudioProductRuntimeDependenciesV1 = {},
): Promise<MediaSourceAudioProductRuntimeResultV1> {
  const environment = dependencies.environment ?? process.env;
  let privateRuntime: PrivateAudioRuntimeV1;
  try {
    privateRuntime = (dependencies.createPrivateRuntime
      ?? createMediaSourcePtsCadenceR2RuntimePortsV1)(environment);
  } catch {
    return {
      kind: 'runtime_unavailable',
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
    };
  }

  let assetStorePorts: MediaSourceAudioArtifactAssetStorePortsV1;
  try {
    assetStorePorts = await (dependencies.createAssetStorePorts
      ?? createMediaSourceAudioArtifactAssetMongoPortsV1)();
  } catch {
    return {
      kind: 'runtime_unavailable',
      reason: 'MEDIA_ASSET_OWNER_UNAVAILABLE',
    };
  }

  let evidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1;
  try {
    evidenceStorePorts = (dependencies.createEvidenceStorePorts
      ?? createMediaSourceVersionEvidenceMongoStorePortsV1)();
  } catch {
    return {
      kind: 'runtime_unavailable',
      reason: 'SOURCE_VERSION_EVIDENCE_OWNER_UNAVAILABLE',
    };
  }

  return (dependencies.materializeProduct
    ?? materializeMediaSourceAudioProductV1)(input, {
    assetStorePorts,
    evidenceStorePorts,
    artifactWriter: privateRuntime.audioArtifact,
    createSourceLease: dependencies.createSourceLease
      ?? defaultSourceLease,
  });
}

function defaultSourceLease(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
): VerifiedMediaSourceLeasePortV1 {
  return createQualifiedAssetMediaSourceLeasePortV1(asset, {
    bindingStale: 'MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_BINDING_STALE',
    versionStale: 'MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_VERSION_STALE',
    sourceUnavailable: 'MEDIA_SOURCE_AUDIO_PRODUCT_SOURCE_URL_UNAVAILABLE',
  });
}
