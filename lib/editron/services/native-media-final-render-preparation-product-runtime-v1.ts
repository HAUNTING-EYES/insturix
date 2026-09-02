import path from 'node:path';

import { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  createMediaSourceAudioArtifactAssetMongoPortsV1,
  type MediaSourceAudioArtifactAssetStorePortsV1,
} from './media-source-audio-artifact-asset-owner-v1';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';
import {
  createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1,
  type NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1,
} from './native-media-final-render-execution-budget-ledger-owner-v1';
import { createNativeMediaFinalRenderExecutionBudgetMongoLedgerV1 }
  from './native-media-final-render-execution-budget-mongo-ledger-v1';
import { createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1 }
  from './native-media-final-render-execution-budget-policy-mongo-v1';
import {
  createNativeMediaFinalRenderExecutionBudgetWorkerOwnerV1,
  resolveNativeMediaFinalRenderExecutionBudgetPreclaimV1,
} from './native-media-final-render-execution-budget-worker-owner-v1';
import {
  createNativeMediaFinalRenderFfmpegEncoderV1,
  qualifyNativeMediaFinalRenderFfmpegRuntimeV1,
} from './native-media-final-render-ffmpeg-encoder-v1';
import { createNativeMediaFinalRenderArtifactPreparerV1 }
  from './native-media-final-render-materializer-v1';
import type { NativeMediaFinalRenderPreparationExecutionManifestV1 }
  from './native-media-final-render-preparation-execution-manifest-v1';
import {
  createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1,
  type NativeMediaFinalRenderPreparationExecutionManifestStoreV1,
} from './native-media-final-render-preparation-execution-manifest-mongo-v1';
import {
  assertNativeMediaFinalRenderPreparationDurableJobV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_KIND_V1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_OWNER_V1,
  type NativeMediaFinalRenderPreparationJobInputV1,
} from './native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationOwnerAdapterV1 }
  from './native-media-final-render-preparation-owner-adapter-v1';
import {
  runNativeMediaFinalRenderPreparationWorkerV1,
  type NativeMediaFinalRenderArtifactPreparationOwnerV1,
} from './native-media-final-render-preparation-worker-v1';
import type { ProjectService } from './project-service';

export const NATIVE_MEDIA_FINAL_RENDER_WORKER_IMAGE_DIGEST_ENV_V1 =
  'EDITRON_NATIVE_FINAL_RENDER_WORKER_IMAGE_DIGEST' as const;
export const NATIVE_MEDIA_FINAL_RENDER_FFMPEG_PATH_ENV_V1 =
  'EDITRON_FINAL_RENDER_FFMPEG_PATH' as const;
export const NATIVE_MEDIA_FINAL_RENDER_FFPROBE_PATH_ENV_V1 =
  'EDITRON_FINAL_RENDER_FFPROBE_PATH' as const;

export type NativeMediaFinalRenderPreparationProductEnvironmentV1 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1 & Readonly<{
    EDITRON_NATIVE_FINAL_RENDER_WORKER_IMAGE_DIGEST?: string;
    EDITRON_FINAL_RENDER_FFMPEG_PATH?: string;
    EDITRON_FINAL_RENDER_FFPROBE_PATH?: string;
  }>;

type ProductJobStoreV1 = Parameters<
  typeof runNativeMediaFinalRenderPreparationWorkerV1
>[0]['jobStore'] & Pick<DurableWorkflowJobStoreV1, 'getForWorkerExecution'>;
type PrivateRuntimeV1 = Pick<
  ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1>,
  'audioArtifact' | 'epochArtifactReader' | 'finalRenderArtifact'
>;
type AssetReaderV1 = Pick<MediaSourceAudioArtifactAssetStorePortsV1, 'load'>;
type ProjectPortsV1 = Pick<
  ProjectService,
  'getProjectRevision' | 'loadProjectForMutation'
>;

export type NativeMediaFinalRenderPreparationProductRuntimeDependenciesV1 = Readonly<{
  environment?: NativeMediaFinalRenderPreparationProductEnvironmentV1;
  jobStore?: ProductJobStoreV1;
  manifestStore?: Pick<NativeMediaFinalRenderPreparationExecutionManifestStoreV1, 'resolve'>;
  ledgerOwner?: Readonly<NativeMediaFinalRenderExecutionBudgetLedgerOwnerV1>;
  createPrivateRuntime?: (
    environment: NativeMediaFinalRenderPreparationProductEnvironmentV1,
    manifest: NativeMediaFinalRenderPreparationExecutionManifestV1,
    clock: () => Date,
  ) => PrivateRuntimeV1;
  createAssetReader?: () => Promise<AssetReaderV1>;
  projectPorts?: ProjectPortsV1;
  qualifyRuntime?: typeof qualifyNativeMediaFinalRenderFfmpegRuntimeV1;
  clock?: () => Date;
}>;

export type NativeMediaFinalRenderPreparationProductRuntimeResultV1 = Awaited<
  ReturnType<typeof runNativeMediaFinalRenderPreparationWorkerV1>
>;

/** Composes every existing exact-render owner before a durable attempt is claimed. */
export async function runNativeMediaFinalRenderPreparationProductRuntimeV1(
  request: Readonly<{ jobId: string; workerId: string }>,
  dependencies: NativeMediaFinalRenderPreparationProductRuntimeDependenciesV1 = {},
): Promise<NativeMediaFinalRenderPreparationProductRuntimeResultV1> {
  const environment = dependencies.environment ?? process.env;
  const clock = dependencies.clock ?? (() => new Date());
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const manifestStore = dependencies.manifestStore
    ?? createNativeMediaFinalRenderPreparationExecutionManifestMongoStoreV1();
  const ledgerOwner = dependencies.ledgerOwner ?? createDefaultLedgerOwner(clock);
  const job = await jobStore.getForWorkerExecution({
    jobId: request.jobId,
    operationOwner: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_OWNER_V1,
    operationKind: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_OPERATION_KIND_V1,
    inputSchemaId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
  });
  if (!job) return Object.freeze({ kind: 'skipped' as const, reason: 'not_found' });

  const jobInput = assertNativeMediaFinalRenderPreparationDurableJobV1(job);
  const manifest = await manifestStore.resolve(jobInput);
  let policy: Awaited<ReturnType<
    typeof resolveNativeMediaFinalRenderExecutionBudgetPreclaimV1
  >>;
  let preparationOwner: NativeMediaFinalRenderArtifactPreparationOwnerV1;

  if (terminal(job.status)) {
    policy = (await ledgerOwner.resolve(jobInput.budgetReservation)).policy;
    preparationOwner = terminalSettlementOwner(manifest);
  } else {
    assertDeploymentImage(environment, jobInput, manifest);
    const ffmpegPath = absoluteExecutable(
      environment[NATIVE_MEDIA_FINAL_RENDER_FFMPEG_PATH_ENV_V1],
      'FFMPEG',
    );
    const ffprobePath = absoluteExecutable(
      environment[NATIVE_MEDIA_FINAL_RENDER_FFPROBE_PATH_ENV_V1],
      'FFPROBE',
    );
    await (dependencies.qualifyRuntime
      ?? qualifyNativeMediaFinalRenderFfmpegRuntimeV1)({
      ffmpegPath,
      ffprobePath,
      compatibilityReceipt: manifest.executionProfile.compatibilityReceipt,
      policy: manifest.policies.encoder,
    });
    const privateRuntime = (dependencies.createPrivateRuntime
      ?? createDefaultPrivateRuntime)(environment, manifest, clock);
    policy = await resolveNativeMediaFinalRenderExecutionBudgetPreclaimV1({
      ledgerOwner,
      jobInput,
      clock,
    });
    const projectPorts = dependencies.projectPorts ?? defaultProjectPorts();
    const currentRevision = await projectPorts.getProjectRevision(
      jobInput.userId,
      jobInput.projectId,
    );
    if (!sameRevision(currentRevision, jobInput.projectRevision)) {
      throw new Error('NATIVE_MEDIA_FINAL_RENDER_PRODUCT_PROJECT_REVISION_MISMATCH');
    }
    const assetReader = await (dependencies.createAssetReader
      ?? createMediaSourceAudioArtifactAssetMongoPortsV1)();
    const encoder = createNativeMediaFinalRenderFfmpegEncoderV1({
      ffmpegPath,
      ffprobePath,
      compatibilityReceipt: manifest.executionProfile.compatibilityReceipt,
      artifactStager: privateRuntime.finalRenderArtifact.stager,
      pcmReader: privateRuntime.audioArtifact,
      policy: manifest.policies.encoder,
    });
    const artifactPreparer = createNativeMediaFinalRenderArtifactPreparerV1({
      projectSnapshotReader: projectPorts,
      projectRevisionReader: projectPorts,
      assetReader,
      storedObjectReader: privateRuntime.epochArtifactReader,
      audioArtifactReader: privateRuntime.audioArtifact,
      encoder,
    }, manifest.policies.materializer);
    preparationOwner = createNativeMediaFinalRenderPreparationOwnerAdapterV1({
      artifactPreparer,
      heartbeatPolicy: manifest.policies.heartbeat,
    });
  }

  return runNativeMediaFinalRenderPreparationWorkerV1({
    jobStore,
    jobId: request.jobId,
    workerId: request.workerId,
    runtimeContract: {
      policyBindings: jobInput.policyBindings,
      executionProfile: jobInput.executionProfile,
    },
    budgetOwner: createNativeMediaFinalRenderExecutionBudgetWorkerOwnerV1({
      ledgerOwner,
      policy,
      clock,
    }),
    preparationOwner,
    deliveryRetryPolicy: manifest.policies.retry,
    clock,
  });
}

function createDefaultLedgerOwner(clock: () => Date) {
  return createNativeMediaFinalRenderExecutionBudgetLedgerOwnerV1({
    ledger: createNativeMediaFinalRenderExecutionBudgetMongoLedgerV1(),
    policyLocator: createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1(),
    now: () => checkedNow(clock).toISOString(),
  });
}

function createDefaultPrivateRuntime(
  environment: NativeMediaFinalRenderPreparationProductEnvironmentV1,
  manifest: NativeMediaFinalRenderPreparationExecutionManifestV1,
  clock: () => Date,
): PrivateRuntimeV1 {
  return createMediaSourcePtsCadenceR2RuntimePortsV1(environment, {
    finalRenderArtifactPolicy: manifest.policies.privateArtifact,
    finalRenderNow: () => checkedNow(clock).getTime(),
  });
}

function defaultProjectPorts(): ProjectPortsV1 {
  return {
    getProjectRevision: async (userId, projectId) => (
      (await import('./project-service')).projectService
        .getProjectRevision(userId, projectId)
    ),
    loadProjectForMutation: async (userId, projectId) => (
      (await import('./project-service')).projectService
        .loadProjectForMutation(userId, projectId)
    ),
  };
}

function terminalSettlementOwner(
  manifest: NativeMediaFinalRenderPreparationExecutionManifestV1,
): NativeMediaFinalRenderArtifactPreparationOwnerV1 {
  return createNativeMediaFinalRenderPreparationOwnerAdapterV1({
    artifactPreparer: {
      async prepare() {
        throw new Error('NATIVE_MEDIA_FINAL_RENDER_TERMINAL_REPLAY_PREPARATION_FORBIDDEN');
      },
    },
    heartbeatPolicy: manifest.policies.heartbeat,
  });
}

function assertDeploymentImage(
  environment: NativeMediaFinalRenderPreparationProductEnvironmentV1,
  job: NativeMediaFinalRenderPreparationJobInputV1,
  manifest: NativeMediaFinalRenderPreparationExecutionManifestV1,
): void {
  const digest = environment[NATIVE_MEDIA_FINAL_RENDER_WORKER_IMAGE_DIGEST_ENV_V1]?.trim();
  if (!digest || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PRODUCT_WORKER_IMAGE_NOT_CONFIGURED');
  }
  if (digest !== job.executionProfile.workerImageDigest
    || digest !== manifest.executionProfile.workerImageDigest) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PRODUCT_WORKER_IMAGE_MISMATCH');
  }
}

function absoluteExecutable(value: unknown, label: 'FFMPEG' | 'FFPROBE'): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || /[\u0000-\u001F\u007F]/.test(normalized)
    || !path.isAbsolute(normalized)) {
    throw new Error(`NATIVE_MEDIA_FINAL_RENDER_PRODUCT_${label}_PATH_INVALID`);
  }
  return normalized;
}

function sameRevision(
  left: NativeMediaFinalRenderPreparationJobInputV1['projectRevision'],
  right: NativeMediaFinalRenderPreparationJobInputV1['projectRevision'],
): boolean {
  return left.schemaVersion === right.schemaVersion && left.value === right.value
    && left.compatibilityUpdatedAt === right.compatibilityUpdatedAt;
}

function terminal(status: string): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function checkedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('NATIVE_MEDIA_FINAL_RENDER_PRODUCT_CLOCK_INVALID');
  }
  return value;
}
