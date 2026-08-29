import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1 } from './media-source-audio-private-artifact-v1';
import { createMediaSourceAudioR2PrivateArtifactStoreV1 } from './media-source-audio-r2-private-artifact-v1';
import { createMediaSourcePtsCadenceR2LifecycleManifestReaderV1 } from './media-source-pts-cadence-r2-lifecycle-manifest-reader-v1';
import {
  createMediaSourcePtsCadenceR2PrivateArtifactPortV2,
  createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3,
  createMediaSourcePtsCadenceR2PrivateSidecarPortV1,
  type MediaSourcePtsCadenceR2CommandClientV1,
  type MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import { createMediaSourcePtsCadenceScanR2ReaderV1 } from './media-source-pts-cadence-scan-r2-reader-v1';
import {
  createNativeMediaFinalRenderR2PrivateArtifactPortsV1,
  type NativeMediaFinalRenderR2PresignGetObjectV1,
  type NativeMediaFinalRenderR2PrivateArtifactPolicyV1,
} from './native-media-final-render-r2-private-artifact-v1';
import {
  createNativeMediaTimestampR2PreviewAudioSurfaceReaderV1,
  createNativeMediaTimestampR2PreviewAudioSurfaceStoreV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewAudioSurfacePolicyV1,
} from './native-media-timestamp-r2-preview-audio-surface-v1';
import {
  createNativeMediaTimestampR2PreviewSurfaceReaderV1,
  createNativeMediaTimestampR2PreviewSurfaceStoreV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
  type NativeMediaTimestampPreviewSurfacePolicyV1,
} from './native-media-timestamp-r2-preview-surface-v1';

export const MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_PRIVATE_R2_V1' as const;

export type MediaSourcePtsCadenceR2RuntimeEnvironmentV1 = Readonly<{
  [key: string]: string | undefined;
  EDITRON_MEDIA_PTS_R2_ACCOUNT_ID?: string;
  EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID?: string;
  EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY?: string;
  EDITRON_MEDIA_PTS_R2_BUCKET_NAME?: string;
}>;

export type MediaSourcePtsCadenceR2RuntimeConfigurationV1 = Readonly<
  | {
      configured: true;
      reason: null;
      endpoint: string;
      privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
    }
  | {
      configured: false;
      reason:
        | 'MISSING_ACCOUNT_ID'
        | 'INVALID_ACCOUNT_ID'
        | 'MISSING_ACCESS_KEY_ID'
        | 'MISSING_SECRET_ACCESS_KEY'
        | 'MISSING_BUCKET_NAME'
        | 'INVALID_OR_PUBLIC_BUCKET';
      endpoint: null;
      privateStorage: null;
    }
>;

type ClientFactoryInputV1 = Readonly<{
  endpoint: string;
  region: 'auto';
  credentials: Readonly<{ accessKeyId: string; secretAccessKey: string }>;
}>;

export function resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1(
  environment: MediaSourcePtsCadenceR2RuntimeEnvironmentV1 = process.env,
): MediaSourcePtsCadenceR2RuntimeConfigurationV1 {
  const accountId = clean(environment.EDITRON_MEDIA_PTS_R2_ACCOUNT_ID);
  const accessKeyId = clean(environment.EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID);
  const secretAccessKey = clean(environment.EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY);
  const bucketName = clean(environment.EDITRON_MEDIA_PTS_R2_BUCKET_NAME);
  if (!accountId) return missing('MISSING_ACCOUNT_ID');
  if (!/^[a-f0-9]{32}$/i.test(accountId)) return missing('INVALID_ACCOUNT_ID');
  if (!accessKeyId) return missing('MISSING_ACCESS_KEY_ID');
  if (!secretAccessKey) return missing('MISSING_SECRET_ACCESS_KEY');
  if (!bucketName) return missing('MISSING_BUCKET_NAME');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName)
    || bucketName === 'editron-cdn') return missing('INVALID_OR_PUBLIC_BUCKET');
  return Object.freeze({
    configured: true,
    reason: null,
    endpoint: `https://${accountId.toLowerCase()}.r2.cloudflarestorage.com`,
    privateStorage: Object.freeze({
      bucketName,
      browserRouteExposure: 'NO_BROWSER_ROUTE' as const,
      storagePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_R2_STORAGE_POLICY_VERSION_V1,
    }),
  });
}

/** Creates all private media-evidence adapters over one dedicated server client. */
export function createMediaSourcePtsCadenceR2RuntimePortsV1(
  environment: MediaSourcePtsCadenceR2RuntimeEnvironmentV1 = process.env,
  dependencies: Readonly<{
    clientFactory?: (input: ClientFactoryInputV1) => MediaSourcePtsCadenceR2CommandClientV1;
    finalRenderPresignGetObject?: NativeMediaFinalRenderR2PresignGetObjectV1;
    finalRenderArtifactPolicy?: NativeMediaFinalRenderR2PrivateArtifactPolicyV1;
    finalRenderNow?: () => number;
    finalRenderRandomIdentifier?: () => string;
  }> = {},
) {
  const configuration = resolveMediaSourcePtsCadenceR2RuntimeConfigurationV1(environment);
  if (!configuration.configured) {
    throw new Error(`MEDIA_SOURCE_PTS_R2_RUNTIME_NOT_CONFIGURED:${configuration.reason}`);
  }
  const accessKeyId = clean(environment.EDITRON_MEDIA_PTS_R2_ACCESS_KEY_ID)!;
  const secretAccessKey = clean(environment.EDITRON_MEDIA_PTS_R2_SECRET_ACCESS_KEY)!;
  const client = (dependencies.clientFactory ?? defaultClientFactory)({
    endpoint: configuration.endpoint,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
  });
  const scope = { privateStorage: configuration.privateStorage, client };
  const finalRenderArtifact = createNativeMediaFinalRenderR2PrivateArtifactPortsV1({
    ...scope,
    endpoint: configuration.endpoint,
    presignGetObject: dependencies.finalRenderPresignGetObject
      ?? (async ({ bucketName, objectKey, expiresInSeconds }) => getSignedUrl(
        client as S3Client,
        new GetObjectCommand({ Bucket: bucketName, Key: objectKey }),
        { expiresIn: expiresInSeconds },
      )),
    policy: dependencies.finalRenderArtifactPolicy,
    now: dependencies.finalRenderNow,
    randomIdentifier: dependencies.finalRenderRandomIdentifier,
  });
  return Object.freeze({
    configuration,
    stagingReader: createMediaSourcePtsCadenceScanR2ReaderV1(scope),
    descriptorPort: createMediaSourcePtsCadenceR2PrivateSidecarPortV1(scope),
    artifactPort: createMediaSourcePtsCadenceR2PrivateArtifactPortV2(scope),
    epochArtifactReader: createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3(scope),
    lifecycleManifestReader: createMediaSourcePtsCadenceR2LifecycleManifestReaderV1(scope),
    audioArtifact: createMediaSourceAudioR2PrivateArtifactStoreV1({
      ...scope,
      policy: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_DEFAULT_POLICY_V1,
    }),
    finalRenderArtifact,
    audioPreviewSurface: Object.freeze({
      createStore(
        leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
        options: Readonly<{
          policy?: NativeMediaTimestampPreviewAudioSurfacePolicyV1;
          now?: () => number;
          randomIdentifier?: () => string;
        }> = {},
      ) {
        return createNativeMediaTimestampR2PreviewAudioSurfaceStoreV1({
          ...scope,
          leaseScope,
          policy: options.policy
            ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
          now: options.now,
          randomIdentifier: options.randomIdentifier,
        });
      },
      createReader(
        options: Readonly<{
          policy?: NativeMediaTimestampPreviewAudioSurfacePolicyV1;
          now?: () => number;
        }> = {},
      ) {
        return createNativeMediaTimestampR2PreviewAudioSurfaceReaderV1({
          ...scope,
          policy: options.policy
            ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1,
          now: options.now,
        });
      },
    }),
    previewSurface: Object.freeze({
      createStore(
        leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
        options: Readonly<{
          policy?: NativeMediaTimestampPreviewSurfacePolicyV1;
          now?: () => number;
          randomIdentifier?: () => string;
        }> = {},
      ) {
        return createNativeMediaTimestampR2PreviewSurfaceStoreV1({
          ...scope,
          leaseScope,
          policy: options.policy ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1,
          now: options.now,
          randomIdentifier: options.randomIdentifier,
        });
      },
      createReader(
        options: Readonly<{
          policy?: NativeMediaTimestampPreviewSurfacePolicyV1;
          now?: () => number;
        }> = {},
      ) {
        return createNativeMediaTimestampR2PreviewSurfaceReaderV1({
          ...scope,
          policy: options.policy ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_SURFACE_DEFAULT_POLICY_V1,
          now: options.now,
        });
      },
    }),
  });
}

function defaultClientFactory(input: ClientFactoryInputV1): MediaSourcePtsCadenceR2CommandClientV1 {
  return new S3Client(input);
}

function missing(
  reason: Extract<MediaSourcePtsCadenceR2RuntimeConfigurationV1, { configured: false }>['reason'],
): MediaSourcePtsCadenceR2RuntimeConfigurationV1 {
  return Object.freeze({ configured: false, reason, endpoint: null, privateStorage: null });
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && !/[\u0000-\u001F\u007F]/.test(normalized) ? normalized : null;
}
