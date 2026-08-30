import path from 'node:path';

import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import { createMediaProxyMasterR2MultipartCoordinatorV1 }
  from './media-proxy-master-r2-multipart-coordinator-v1';
import { createMediaProxyMasterR2MultipartMongoStoreV1 }
  from './media-proxy-master-r2-multipart-mongo-store-v1';
import { classifyMediaProxyMasterTranscodeBudgetMongoFailureV2 }
  from './media-proxy-master-transcode-budget-mongo-failure-classifier-v2';
import { createMediaProxyMasterTranscodeAttemptOwnerV2 }
  from './media-proxy-master-transcode-attempt-owner-v2';
import {
  createMediaProxyMasterTranscodeCurrentAssetOwnerV2,
  type MediaProxyMasterTranscodeCurrentAssetStoreV2,
} from './media-proxy-master-transcode-current-asset-owner-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
  assertMediaProxyMasterTranscodeDurableJobV2,
  type MediaProxyMasterTranscodeDurableJobInputV2,
} from './media-proxy-master-transcode-durable-job-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
  runMediaProxyMasterTranscodeDurableWorkerV2,
  type MediaProxyMasterTranscodeAttemptOwnerV2,
} from './media-proxy-master-transcode-durable-worker-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV2,
  resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV2,
} from './media-proxy-master-transcode-execution-budget-worker-owner-v2';
import {
  resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
  type MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1,
} from './media-proxy-master-transcode-operational-policy-environment-v1';
import type { MediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from './media-proxy-master-transcode-operational-policy-registry-v1';
import {
  createMediaProxyMasterTranscodeHeartbeatOwnerV1,
  createMediaProxyMasterTranscodeRetryOwnerV1,
} from './media-proxy-master-transcode-operational-policy-v1';
import { createMediaProxyMasterTranscodePreparationOwnerV2 }
  from './media-proxy-master-transcode-preparation-owner-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1,
} from './media-proxy-master-transcode-product-runtime-v1';
import { createMediaProxyMasterTranscodePublicationOwnerV2 }
  from './media-proxy-master-transcode-publication-owner-v2';
import {
  createMediaProxyMasterCurrentTimeMapPortV1,
  createMediaProxyMasterPreparedTranscodeExecutorV1,
  type MediaProxyMasterCurrentTimeMapPortV1,
} from './media-proxy-master-trusted-transcode-executor-v1';
import { createMediaSourcePtsCadenceMapAssetMongoPortsV3 }
  from './media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';

export type MediaProxyMasterTranscodeProductEnvironmentV2 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1
  & MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1
  & Readonly<{
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST?: string;
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_SHA256?: string;
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH?: string;
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH?: string;
  }>;

type ProductJobStoreV2 = Parameters<
  typeof runMediaProxyMasterTranscodeDurableWorkerV2
>[0]['jobStore'] & Pick<DurableWorkflowJobStoreV1, 'getForWorkerExecution'>;
type PrivateRuntimeV2 = Pick<
  ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1>,
  'proxyMasterTranscodePublication' | 'proxyMasterPreparedArtifactStore'
  | 'proxyMasterMultipartTransport'
>;

export type MediaProxyMasterTranscodeProductRuntimeDependenciesV2 = Readonly<{
  environment?: MediaProxyMasterTranscodeProductEnvironmentV2;
  jobStore?: ProductJobStoreV2;
  policyRegistry?: Readonly<
    MediaProxyMasterTranscodeOperationalPolicyRegistryV1
  >;
  ledgerOwner?: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2
  >;
  createPrivateRuntime?: (
    environment: MediaProxyMasterTranscodeProductEnvironmentV2,
  ) => PrivateRuntimeV2;
  createAssetStore?: () => Promise<Readonly<
    MediaProxyMasterTranscodeCurrentAssetStoreV2
  >>;
  currentTimeMapPort?: Readonly<MediaProxyMasterCurrentTimeMapPortV1>;
  createPreparedExecutor?:
    typeof createMediaProxyMasterPreparedTranscodeExecutorV1;
  createMultipartStore?: typeof createMediaProxyMasterR2MultipartMongoStoreV1;
  createMultipartCoordinator?:
    typeof createMediaProxyMasterR2MultipartCoordinatorV1;
  runWorker?: typeof runMediaProxyMasterTranscodeDurableWorkerV2;
  runtimePlatform?: string;
  clock?: () => Date;
}>;

export type MediaProxyMasterTranscodeProductRuntimeResultV2 = Awaited<
  ReturnType<typeof runMediaProxyMasterTranscodeDurableWorkerV2>
>;

/** Composes the exact V2 durable transcode graph before the worker claims it. */
export async function runMediaProxyMasterTranscodeProductRuntimeV2(
  request: Readonly<{ jobId: string; workerId: string }>,
  dependencies: MediaProxyMasterTranscodeProductRuntimeDependenciesV2 = {},
): Promise<MediaProxyMasterTranscodeProductRuntimeResultV2> {
  const environment = dependencies.environment ?? process.env;
  const clock = dependencies.clock ?? (() => new Date());
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const job = await jobStore.getForWorkerExecution({
    jobId: request.jobId,
    operationOwner: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
    operationKind: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
    inputSchemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
  });
  if (!job) return Object.freeze({ kind: 'skipped' as const, reason: 'not_found' });

  const jobInput = assertedJob(job);
  const policyRegistry = dependencies.policyRegistry
    ?? deploymentPolicyRegistry(environment);
  const operationalPolicies = resolveOperationalPolicies(
    policyRegistry,
    jobInput,
  );
  const retryOwner = createMediaProxyMasterTranscodeRetryOwnerV1(
    operationalPolicies.retry,
  );
  const heartbeatOwner = createMediaProxyMasterTranscodeHeartbeatOwnerV1(
    operationalPolicies.heartbeat,
  );
  const ledgerOwner = dependencies.ledgerOwner ?? defaultLedgerOwner(clock);

  let budgetPolicy: Awaited<ReturnType<
    typeof resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV2
  >>;
  let attemptOwner: Readonly<MediaProxyMasterTranscodeAttemptOwnerV2>;
  if (settlementOnly(job, checkedNow(clock))) {
    budgetPolicy = (await ledgerOwner.resolve(
      jobInput.budgetReservation,
    )).policy;
    assertBudgetPolicyBinding(jobInput, budgetPolicy);
    attemptOwner = settlementAttemptOwner(jobInput);
  } else {
    const ffmpegPath = absoluteExecutable(
      environment[MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1],
      'FFMPEG',
    );
    const ffprobePath = absoluteExecutable(
      environment[MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1],
      'FFPROBE',
    );
    assertDeployment(environment, jobInput, dependencies.runtimePlatform);
    const privateRuntime = (dependencies.createPrivateRuntime
      ?? createMediaSourcePtsCadenceR2RuntimePortsV1)(environment);
    assertPrivateRuntime(jobInput, privateRuntime);
    budgetPolicy =
      await resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV2({
        ledgerOwner,
        jobInput,
        clock,
      });
    const assetStore = await (dependencies.createAssetStore
      ?? createMediaSourcePtsCadenceMapAssetMongoPortsV3)();
    const currentTimeMapPort = dependencies.currentTimeMapPort
      ?? createMediaProxyMasterCurrentTimeMapPortV1();
    const currentAssetOwner =
      createMediaProxyMasterTranscodeCurrentAssetOwnerV2({
        runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
        assetStore,
        currentTimeMapPort,
      });
    const preparationOwner =
      createMediaProxyMasterTranscodePreparationOwnerV2({
        jobInput,
        ffmpegPath,
        ffprobePath,
        currentTimeMapPort,
        now: clock,
        ...(dependencies.createPreparedExecutor
          ? { createExecutor: dependencies.createPreparedExecutor } : {}),
      });
    const multipartStore = (dependencies.createMultipartStore
      ?? createMediaProxyMasterR2MultipartMongoStoreV1)();
    const multipartCoordinator = (dependencies.createMultipartCoordinator
      ?? createMediaProxyMasterR2MultipartCoordinatorV1)({
        store: multipartStore,
        transport: privateRuntime.proxyMasterMultipartTransport,
        heartbeatPolicy: operationalPolicies.heartbeat,
        clock,
      });
    const publicationOwner =
      createMediaProxyMasterTranscodePublicationOwnerV2({
        publicationPolicy: jobInput.publicationPolicy,
        preparedArtifactPolicy: jobInput.preparedArtifactPolicy,
        singlePut: privateRuntime.proxyMasterTranscodePublication,
        multipartCoordinator,
      });
    attemptOwner = createMediaProxyMasterTranscodeAttemptOwnerV2({
      jobInput,
      currentAssetOwner,
      preparationOwner,
      preparedArtifactStore:
        privateRuntime.proxyMasterPreparedArtifactStore,
      publicationOwner,
    });
  }

  return (dependencies.runWorker
    ?? runMediaProxyMasterTranscodeDurableWorkerV2)({
      jobStore,
      jobId: request.jobId,
      workerId: request.workerId,
      budgetOwner:
        createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV2({
          ledgerOwner,
          policy: budgetPolicy,
          classifyInfrastructureFailure:
            classifyMediaProxyMasterTranscodeBudgetMongoFailureV2,
          clock,
        }),
      retryOwner,
      heartbeatOwner,
      attemptOwner,
      clock,
    });
}

function deploymentPolicyRegistry(
  environment: MediaProxyMasterTranscodeProductEnvironmentV2,
) {
  const resolved =
    resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
      environment,
    );
  if (!resolved.configured) fail(`OPERATIONAL_POLICY_${resolved.reason}`);
  return resolved.registry;
}

function resolveOperationalPolicies(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
) {
  try {
    const retry = registry.resolveRetry(
      jobInput.runtimePolicy.retryPolicy as never,
    );
    const heartbeat = registry.resolveHeartbeat(
      jobInput.runtimePolicy.heartbeatPolicy as never,
    );
    if (retry.durableJob.maxAttempts
        !== jobInput.runtimePolicy.lifecycle.maxAttempts
      || retry.durableJob.retentionMs
        !== jobInput.runtimePolicy.lifecycle.retentionMs) {
      fail('OPERATIONAL_POLICY_LIFECYCLE_MISMATCH');
    }
    return Object.freeze({ retry, heartbeat });
  } catch (error) {
    if (error instanceof MediaProxyMasterTranscodeProductRuntimeErrorV2) {
      throw error;
    }
    fail('OPERATIONAL_POLICY_BINDING_UNAVAILABLE');
  }
}

function defaultLedgerOwner(clock: () => Date) {
  return createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2({
    ledger: createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV2(),
    policyLocator:
      createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1(),
    now: () => checkedNow(clock).toISOString(),
  });
}

function assertedJob(job: Readonly<DurableWorkflowJobSnapshotV1>) {
  try {
    return assertMediaProxyMasterTranscodeDurableJobV2(job);
  } catch {
    fail('JOB_CONTRACT_INVALID');
  }
}

function assertDeployment(
  environment: MediaProxyMasterTranscodeProductEnvironmentV2,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
  runtimePlatformValue?: string,
): void {
  const profile = jobInput.runtimePolicy.executionProfile;
  const workerImageDigest = sha256(
    environment[MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1],
    'WORKER_IMAGE_DIGEST',
  );
  const compatibilityReceiptSha256 = sha256(
    environment[MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1],
    'TOOLCHAIN_RECEIPT',
  );
  const runtimePlatform = identity(
    runtimePlatformValue ?? `${process.platform}-${process.arch}`,
    'RUNTIME_PLATFORM',
  );
  if (workerImageDigest !== profile.workerImageDigest) {
    fail('WORKER_IMAGE_MISMATCH');
  }
  if (compatibilityReceiptSha256 !== profile.compatibilityReceiptSha256) {
    fail('TOOLCHAIN_RECEIPT_MISMATCH');
  }
  if (runtimePlatform !== profile.platform) fail('RUNTIME_PLATFORM_MISMATCH');
}

function assertPrivateRuntime(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
  runtime: PrivateRuntimeV2,
): void {
  const singlePut = runtime?.proxyMasterTranscodePublication;
  const prepared = runtime?.proxyMasterPreparedArtifactStore;
  const multipart = runtime?.proxyMasterMultipartTransport;
  if (canonicalizeEditronJsonV1(singlePut?.publicationPolicy)
      !== canonicalizeEditronJsonV1(
        jobInput.publicationPolicy.singlePut.policy,
      )
    || typeof singlePut?.publisher?.publish !== 'function'
    || typeof prepared?.stage !== 'function'
    || typeof prepared.recover !== 'function'
    || typeof prepared.reopen !== 'function'
    || typeof multipart?.inspectLocalArtifact !== 'function'
    || typeof multipart.discoverUploads !== 'function'
    || typeof multipart.createUpload !== 'function'
    || typeof multipart.listParts !== 'function'
    || typeof multipart.inspectLocalPart !== 'function'
    || typeof multipart.uploadPart !== 'function'
    || typeof multipart.complete !== 'function'
    || typeof multipart.verifyPublishedObject !== 'function'
    || typeof multipart.abort !== 'function') {
    fail('PRIVATE_PUBLICATION_RUNTIME_MISMATCH');
  }
}

function assertBudgetPolicyBinding(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
  policy: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): void {
  const binding = jobInput.runtimePolicy.executionBudgetPolicy;
  if (policy.ownerId !== binding.ownerId
    || policy.ownerVersion !== binding.ownerVersion
    || policy.policySha256 !== binding.policySha256) {
    fail('EXECUTION_BUDGET_POLICY_MISMATCH');
  }
}

function settlementAttemptOwner(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV2,
): MediaProxyMasterTranscodeAttemptOwnerV2 {
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
    ownerVersion: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_V2',
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    publicationPolicySha256: jobInput.publicationPolicy.policySha256,
    preparedArtifactPolicySha256:
      jobInput.preparedArtifactPolicy.policySha256,
    async run() {
      fail('SETTLEMENT_ONLY_ATTEMPT_FORBIDDEN');
    },
  });
}

function settlementOnly(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  now: Date,
): boolean {
  return terminal(job.status) || job.cancelRequestedAt !== null
    || job.remainingAttempts === 0
    || Date.parse(job.expiresAt) <= now.getTime();
}

function terminal(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed' || status === 'cancelled'
    || status === 'dead_letter';
}

function absoluteExecutable(
  value: unknown,
  label: 'FFMPEG' | 'FFPROBE',
): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || /[\u0000-\u001F\u007F]/.test(normalized)
    || !path.isAbsolute(normalized)) {
    fail(`${label}_PATH_INVALID`);
  }
  return normalized;
}

function checkedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('CLOCK_INVALID');
  }
  return value;
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(normalized)) {
    fail(`${label}_INVALID`);
  }
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeProductRuntimeErrorV2(code);
}

export class MediaProxyMasterTranscodeProductRuntimeErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_PRODUCT_RUNTIME_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeProductRuntimeErrorV2';
  }
}
