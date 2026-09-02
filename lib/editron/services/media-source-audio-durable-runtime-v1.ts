import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  createMediaSourceAudioArtifactAssetMongoPortsV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import { createMediaSourceAudioAvailabilityEvidenceMongoPortsV1 }
  from './media-source-audio-availability-evidence-mongo-v1';
import type { MediaSourceAudioAvailabilityEvidenceStorePortsV1 }
  from './media-source-audio-availability-evidence-v1';
import {
  runMediaSourceAudioDurableWorkerV1,
  MediaSourceAudioDurableWorkerPortErrorV1,
  type MediaSourceAudioDurableWorkerResultV1,
} from './media-source-audio-durable-worker-v1';
import {
  runMediaSourceAudioProductRuntimeV1,
  type MediaSourceAudioProductRuntimeDependenciesV1,
} from './media-source-audio-product-runtime-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import { createMediaSourceVersionEvidenceMongoStorePortsV1 }
  from './media-source-version-evidence-mongo-store-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from './media-source-version-evidence-owner-v1';
import { assertMediaSourceVersionV1 }
  from './media-source-version-v1';

type CreatePrivateRuntimeV1 = NonNullable<
  MediaSourceAudioProductRuntimeDependenciesV1['createPrivateRuntime']
>;
type PrivateRuntimeV1 = ReturnType<CreatePrivateRuntimeV1>;
type RunProductRuntimeV1 = typeof runMediaSourceAudioProductRuntimeV1;

export type MediaSourceAudioDurableRuntimeResultV1 =
  | MediaSourceAudioDurableWorkerResultV1
  | Readonly<{
      kind: 'runtime_unavailable';
      reason:
        | 'PRIVATE_STORAGE_NOT_CONFIGURED'
        | 'MEDIA_ASSET_OWNER_UNAVAILABLE'
        | 'SOURCE_AUDIO_AVAILABILITY_OWNER_UNAVAILABLE'
        | 'SOURCE_VERSION_EVIDENCE_OWNER_UNAVAILABLE';
    }>;

export type MediaSourceAudioDurableRuntimeDependenciesV1 = Readonly<{
  environment?: MediaSourcePtsCadenceR2RuntimeEnvironmentV1;
  jobStore?: Parameters<typeof runMediaSourceAudioDurableWorkerV1>[0]['jobStore'];
  createPrivateRuntime?: CreatePrivateRuntimeV1;
  createAssetStorePorts?: () =>
    Promise<MediaSourceAudioArtifactAssetStorePortsV1>;
  createAvailabilityEvidenceStorePorts?: () =>
    MediaSourceAudioAvailabilityEvidenceStorePortsV1;
  createEvidenceStorePorts?: () => MediaSourceVersionEvidenceStorePortsV1;
  createSourceLease?:
    MediaSourceAudioProductRuntimeDependenciesV1['createSourceLease'];
  runProductRuntime?: RunProductRuntimeV1;
  clock?: () => Date;
  retryDelayMs?: number;
  heartbeatIntervalMs?: number;
}>;

/** Composes all server-only audio owners before the durable job is claimed. */
export async function runMediaSourceAudioDurableRuntimeV1(
  input: Readonly<{ jobId: string; workerId: string }>,
  dependencies: MediaSourceAudioDurableRuntimeDependenciesV1 = {},
): Promise<MediaSourceAudioDurableRuntimeResultV1> {
  const environment = dependencies.environment ?? process.env;
  let privateRuntime: PrivateRuntimeV1;
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

  let availabilityEvidenceStorePorts:
    MediaSourceAudioAvailabilityEvidenceStorePortsV1;
  try {
    availabilityEvidenceStorePorts =
      (dependencies.createAvailabilityEvidenceStorePorts
        ?? createMediaSourceAudioAvailabilityEvidenceMongoPortsV1)();
  } catch {
    return {
      kind: 'runtime_unavailable',
      reason: 'SOURCE_AUDIO_AVAILABILITY_OWNER_UNAVAILABLE',
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

  const runProductRuntime = dependencies.runProductRuntime
    ?? runMediaSourceAudioProductRuntimeV1;
  return runMediaSourceAudioDurableWorkerV1({
    jobStore: dependencies.jobStore ?? new DurableWorkflowJobStoreV1(),
    jobId: input.jobId,
    workerId: input.workerId,
    ports: {
      loadCurrentSource: async ({ assetId, userId }) => {
        let asset;
        try {
          asset = await assetStorePorts.load(assetId, userId);
        } catch {
          throw new MediaSourceAudioDurableWorkerPortErrorV1(
            'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_LOAD_FAILED',
            true,
          );
        }
        if (!asset) return null;
        try {
          return {
            sourceVersion: assertMediaSourceVersionV1(asset.sourceVersionV1),
            qualification: qualificationRecord(asset.sourceQualificationV1),
          };
        } catch {
          throw new MediaSourceAudioDurableWorkerPortErrorV1(
            'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_INVALID',
            false,
          );
        }
      },
      materializeProduct: (productInput) => runProductRuntime(productInput, {
        environment,
        createPrivateRuntime: () => privateRuntime,
        createAssetStorePorts: async () => assetStorePorts,
        createAvailabilityEvidenceStorePorts: () =>
          availabilityEvidenceStorePorts,
        createEvidenceStorePorts: () => evidenceStorePorts,
        ...(dependencies.createSourceLease
          ? { createSourceLease: dependencies.createSourceLease }
          : {}),
      }),
    },
    ...(dependencies.clock ? { clock: dependencies.clock } : {}),
    ...(dependencies.retryDelayMs === undefined
      ? {}
      : { retryDelayMs: dependencies.retryDelayMs }),
    ...(dependencies.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: dependencies.heartbeatIntervalMs }),
  });
}

function qualificationRecord(value: unknown): MediaSourceQualificationRecordV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MEDIA_SOURCE_AUDIO_RUNTIME_QUALIFICATION_INVALID');
  }
  return value as MediaSourceQualificationRecordV1;
}
