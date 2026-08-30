import path from 'node:path';

import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import { classifyMediaProxyMasterTranscodeBudgetMongoFailureV1 }
  from './media-proxy-master-transcode-budget-mongo-failure-classifier-v1';
import { createMediaProxyMasterTranscodeCurrentAssetOwnerV1,
  type MediaProxyMasterTranscodeCurrentAssetStoreV1 }
  from './media-proxy-master-transcode-current-asset-owner-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
  assertMediaProxyMasterTranscodeDurableJobV1,
  type MediaProxyMasterTranscodeDurableJobInputV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1,
  MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1,
  runMediaProxyMasterTranscodeDurableWorkerV1,
  type MediaProxyMasterCurrentAssetOwnerV1,
  type MediaProxyMasterTranscodeExecutionOwnerV1,
} from './media-proxy-master-transcode-durable-worker-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1,
  type MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from './media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1 }
  from './media-proxy-master-transcode-execution-budget-mongo-ledger-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1 }
  from './media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV1,
  resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV1,
} from './media-proxy-master-transcode-execution-budget-worker-owner-v1';
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
import {
  createMediaProxyMasterCurrentTimeMapPortV1,
  createMediaProxyMasterTrustedTranscodeExecutorV1,
  type MediaProxyMasterCurrentTimeMapPortV1,
  type MediaProxyMasterTrustedTranscodeExecutorV1,
} from './media-proxy-master-trusted-transcode-executor-v1';
import { createMediaSourcePtsCadenceMapAssetMongoPortsV3 }
  from './media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaSourcePtsCadenceR2RuntimePortsV1,
  type MediaSourcePtsCadenceR2RuntimeEnvironmentV1,
} from './media-source-pts-cadence-r2-runtime-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST_ENV_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_ENV_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_SHA256' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH_ENV_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH_ENV_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH' as const;

export type MediaProxyMasterTranscodeProductEnvironmentV1 =
  MediaSourcePtsCadenceR2RuntimeEnvironmentV1
  & MediaProxyMasterTranscodeOperationalPolicyEnvironmentV1
  & Readonly<{
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_DIGEST?: string;
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_TOOLCHAIN_RECEIPT_SHA256?: string;
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_PATH?: string;
    EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_PATH?: string;
  }>;

type ProductJobStoreV1 = Parameters<
  typeof runMediaProxyMasterTranscodeDurableWorkerV1
>[0]['jobStore'] & Pick<DurableWorkflowJobStoreV1, 'getForWorkerExecution'>;
type PrivateRuntimeV1 = Pick<
  ReturnType<typeof createMediaSourcePtsCadenceR2RuntimePortsV1>,
  'proxyMasterTranscodePublication'
>;

export type MediaProxyMasterTranscodeProductRuntimeDependenciesV1 = Readonly<{
  environment?: MediaProxyMasterTranscodeProductEnvironmentV1;
  jobStore?: ProductJobStoreV1;
  policyRegistry?: Readonly<
    MediaProxyMasterTranscodeOperationalPolicyRegistryV1
  >;
  ledgerOwner?: Readonly<
    MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1
  >;
  createPrivateRuntime?: (
    environment: MediaProxyMasterTranscodeProductEnvironmentV1,
  ) => PrivateRuntimeV1;
  createAssetStore?: () => Promise<Readonly<
    MediaProxyMasterTranscodeCurrentAssetStoreV1
  >>;
  currentTimeMapPort?: Readonly<MediaProxyMasterCurrentTimeMapPortV1>;
  createExecutor?: typeof createMediaProxyMasterTrustedTranscodeExecutorV1;
  runtimePlatform?: string;
  clock?: () => Date;
}>;

export type MediaProxyMasterTranscodeProductRuntimeResultV1 = Awaited<
  ReturnType<typeof runMediaProxyMasterTranscodeDurableWorkerV1>
>;

/** Composes every exact proxy owner before the durable attempt is claimed. */
export async function runMediaProxyMasterTranscodeProductRuntimeV1(
  request: Readonly<{ jobId: string; workerId: string }>,
  dependencies: MediaProxyMasterTranscodeProductRuntimeDependenciesV1 = {},
): Promise<MediaProxyMasterTranscodeProductRuntimeResultV1> {
  const environment = dependencies.environment ?? process.env;
  const clock = dependencies.clock ?? (() => new Date());
  const jobStore = dependencies.jobStore ?? new DurableWorkflowJobStoreV1();
  const job = await jobStore.getForWorkerExecution({
    jobId: request.jobId,
    operationOwner: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
    operationKind: MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
    inputSchemaId: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
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
    typeof resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV1
  >>;
  let currentAssetOwner: Readonly<MediaProxyMasterCurrentAssetOwnerV1>;
  let transcodeOwner: Readonly<MediaProxyMasterTranscodeExecutionOwnerV1>;
  if (settlementOnly(job, checkedNow(clock))) {
    budgetPolicy = (await ledgerOwner.resolve(
      jobInput.budgetReservation,
    )).policy;
    assertBudgetPolicyBinding(jobInput, budgetPolicy);
    currentAssetOwner = settlementCurrentAssetOwner(jobInput);
    transcodeOwner = settlementTranscodeOwner(jobInput);
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
    assertPublicationPolicy(jobInput, privateRuntime);
    budgetPolicy =
      await resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV1({
        ledgerOwner,
        jobInput,
        clock,
      });
    const assetStore = await (dependencies.createAssetStore
      ?? createMediaSourcePtsCadenceMapAssetMongoPortsV3)();
    const currentTimeMapPort = dependencies.currentTimeMapPort
      ?? createMediaProxyMasterCurrentTimeMapPortV1();
    currentAssetOwner = createMediaProxyMasterTranscodeCurrentAssetOwnerV1({
      runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
      assetStore,
      currentTimeMapPort,
    });
    const executor = (dependencies.createExecutor
      ?? createMediaProxyMasterTrustedTranscodeExecutorV1)({
      ffmpegPath,
      ffprobePath,
      runtime: {
        workerImageDigest:
          jobInput.runtimePolicy.executionProfile.workerImageDigest,
        platform: jobInput.runtimePolicy.executionProfile.platform,
        ffmpegVersion: jobInput.runtimePolicy.executionProfile.ffmpegVersion,
        ffprobeVersion: jobInput.runtimePolicy.executionProfile.ffprobeVersion,
      },
      publisher: privateRuntime.proxyMasterTranscodePublication.publisher,
      currentTimeMapPort,
      now: clock,
    });
    transcodeOwner = executionOwner(jobInput, executor);
  }

  return runMediaProxyMasterTranscodeDurableWorkerV1({
    jobStore,
    jobId: request.jobId,
    workerId: request.workerId,
    budgetOwner:
      createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV1({
        ledgerOwner,
        policy: budgetPolicy,
        classifyInfrastructureFailure:
          classifyMediaProxyMasterTranscodeBudgetMongoFailureV1,
        clock,
      }),
    retryOwner,
    heartbeatOwner,
    currentAssetOwner,
    transcodeOwner,
    clock,
  });
}

function deploymentPolicyRegistry(
  environment: MediaProxyMasterTranscodeProductEnvironmentV1,
) {
  const resolved =
    resolveMediaProxyMasterTranscodeOperationalPolicyEnvironmentV1(
      environment,
    );
  if (!resolved.configured) {
    fail(`OPERATIONAL_POLICY_${resolved.reason}`);
  }
  return resolved.registry;
}

function resolveOperationalPolicies(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
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
    if (error instanceof MediaProxyMasterTranscodeProductRuntimeErrorV1) {
      throw error;
    }
    fail('OPERATIONAL_POLICY_BINDING_UNAVAILABLE');
  }
}

function defaultLedgerOwner(clock: () => Date) {
  return createMediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1({
    ledger: createMediaProxyMasterTranscodeExecutionBudgetMongoLedgerV1(),
    policyLocator:
      createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1(),
    now: () => checkedNow(clock).toISOString(),
  });
}

function assertedJob(job: Readonly<DurableWorkflowJobSnapshotV1>) {
  try {
    return assertMediaProxyMasterTranscodeDurableJobV1(job);
  } catch {
    fail('JOB_CONTRACT_INVALID');
  }
}

function assertDeployment(
  environment: MediaProxyMasterTranscodeProductEnvironmentV1,
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
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

function assertPublicationPolicy(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
  privateRuntime: PrivateRuntimeV1,
): void {
  if (canonicalizeEditronJsonV1(
    privateRuntime.proxyMasterTranscodePublication.publicationPolicy,
  ) !== canonicalizeEditronJsonV1(jobInput.publicationPolicy)) {
    fail('PRIVATE_PUBLICATION_POLICY_MISMATCH');
  }
}

function assertBudgetPolicyBinding(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
  policy: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): void {
  const binding = jobInput.runtimePolicy.executionBudgetPolicy;
  if (policy.ownerId !== binding.ownerId
    || policy.ownerVersion !== binding.ownerVersion
    || policy.policySha256 !== binding.policySha256) {
    fail('EXECUTION_BUDGET_POLICY_MISMATCH');
  }
}

function executionOwner(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
  executor: MediaProxyMasterTrustedTranscodeExecutorV1,
): MediaProxyMasterTranscodeExecutionOwnerV1 {
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1,
    ownerVersion: jobInput.command.policy.policyVersion,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    publicationPolicySha256: jobInput.publicationPolicy.policySha256,
    execute: executor.execute,
  });
}

function settlementCurrentAssetOwner(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
): MediaProxyMasterCurrentAssetOwnerV1 {
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_ID_V1,
    ownerVersion: MEDIA_PROXY_MASTER_CURRENT_ASSET_OWNER_VERSION_V1,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    async resolve() {
      fail('SETTLEMENT_ONLY_CURRENT_ASSET_ACCESS_FORBIDDEN');
    },
  });
}

function settlementTranscodeOwner(
  jobInput: MediaProxyMasterTranscodeDurableJobInputV1,
): MediaProxyMasterTranscodeExecutionOwnerV1 {
  return Object.freeze({
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_OWNER_ID_V1,
    ownerVersion: jobInput.command.policy.policyVersion,
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    publicationPolicySha256: jobInput.publicationPolicy.policySha256,
    async execute() {
      fail('SETTLEMENT_ONLY_TRANSCODE_FORBIDDEN');
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
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeProductRuntimeErrorV1(code);
}

export class MediaProxyMasterTranscodeProductRuntimeErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_PRODUCT_${code}`);
    this.name = 'MediaProxyMasterTranscodeProductRuntimeErrorV1';
  }
}
