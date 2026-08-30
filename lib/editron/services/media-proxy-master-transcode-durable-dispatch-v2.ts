import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  createDurableWorkflowQStashRecoveryStateBindingV1,
  publishAndRecordDurableWorkflowQStashJobV1,
  resolveDurableWorkflowQStashDispatchConfigurationV1,
} from './durable-workflow-qstash-dispatch-v1';
import {
  assertMediaProxyMasterTranscodeDurableWorkerMessageV1,
  type MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
  type MediaProxyMasterTranscodeDurableDispatchResultV1,
  type MediaProxyMasterTranscodeDurableRecoveryResultV1,
  type MediaProxyMasterTranscodeQStashPublisherV1,
} from './media-proxy-master-transcode-durable-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
  type MediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from './media-proxy-master-transcode-durable-job-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
  assertMediaProxyMasterTranscodeDurableJobV2,
  createOrGetMediaProxyMasterTranscodeDurableJobV2,
} from './media-proxy-master-transcode-durable-job-v2';
import type { MediaProxyMasterTranscodeOperationalPolicyRegistryV1 }
  from './media-proxy-master-transcode-operational-policy-registry-v1';
import {
  assertMediaProxyMasterTranscodeHeartbeatPolicyV1,
  assertMediaProxyMasterTranscodeRetryPolicyV1,
  type MediaProxyMasterTranscodeHeartbeatPolicyV1,
  type MediaProxyMasterTranscodeRetryPolicyV1,
} from './media-proxy-master-transcode-operational-policy-v1';

const WORKER_PATH_V2 =
  '/api/internal/workers/media-proxy-master-transcode' as const;

type OperationalPoliciesV2 = Readonly<{
  retry: MediaProxyMasterTranscodeRetryPolicyV1;
  heartbeat: MediaProxyMasterTranscodeHeartbeatPolicyV1;
}>;

export type MediaProxyMasterTranscodeDurableDispatchResultV2 =
  MediaProxyMasterTranscodeDurableDispatchResultV1;
export type MediaProxyMasterTranscodeDurableRecoveryResultV2 =
  MediaProxyMasterTranscodeDurableRecoveryResultV1;

export async function dispatchMediaProxyMasterTranscodeDurableJobV2(
  input: Readonly<{
    request: Parameters<
      typeof createOrGetMediaProxyMasterTranscodeDurableJobV2
    >[0]['request'];
    jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet' | 'recordDispatch'>;
    policyRegistry: Readonly<
      MediaProxyMasterTranscodeOperationalPolicyRegistryV1
    >;
    env?: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1;
    publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
    now?: Date;
  }>,
): Promise<MediaProxyMasterTranscodeDurableDispatchResultV2> {
  const environment = input.env ?? processEnvironment();
  const configuration = requireConfiguration(environment);
  const policies = activeOperationalPolicies(input.policyRegistry);
  assertRuntimePolicies(input.request.runtimePolicy, policies);
  const bound = await createOrGetMediaProxyMasterTranscodeDurableJobV2({
    jobStore: input.jobStore,
    request: input.request,
    ...(input.now ? { now: input.now } : {}),
  });
  const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
    job: bound.job,
    configuration,
    jobStore: input.jobStore,
    message: assertMediaProxyMasterTranscodeDurableWorkerMessageV1({
      jobId: bound.job.jobId,
    }),
    deliveryPolicy: policies.retry.qstashDelivery,
    dispatchIntent: {
      kind: 'INITIAL_QUEUED',
      deduplicationId: bound.job.jobId,
    },
    environment,
    ...(input.publisher ? { publisher: input.publisher } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  return Object.freeze({ ...dispatched, created: bound.created });
}

export async function recoverMediaProxyMasterTranscodeDurableJobsV2(
  input: Readonly<{
    jobStore: Pick<DurableWorkflowJobStoreV1,
      'listRecoverable' | 'recordDispatch'>;
    staleBefore: Date;
    policyRegistry: Readonly<
      MediaProxyMasterTranscodeOperationalPolicyRegistryV1
    >;
    now?: Date;
    limit?: number;
    env?: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1;
    publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
  }>,
): Promise<MediaProxyMasterTranscodeDurableRecoveryResultV2> {
  const environment = input.env ?? processEnvironment();
  const configuration = requireConfiguration(environment);
  const now = input.now ?? new Date();
  const staleBefore = validDate(input.staleBefore, 'STALE_BEFORE');
  const candidates = await input.jobStore.listRecoverable({
    staleBefore,
    now,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
  const eligible = candidates.filter((job) => (
    isV2ProxyTranscodeJob(job)
      && Date.parse(job.updatedAt) <= staleBefore.getTime()
  ));
  const results: Array<MediaProxyMasterTranscodeDurableRecoveryResultV2[
    'results'
  ][number]> = [];
  for (const job of eligible) {
    let jobInput: ReturnType<typeof assertMediaProxyMasterTranscodeDurableJobV2>;
    try {
      jobInput = assertMediaProxyMasterTranscodeDurableJobV2(job);
    } catch {
      results.push(policyUnavailable(job.jobId, 'JOB_CONTRACT_INVALID'));
      continue;
    }
    let retry: MediaProxyMasterTranscodeRetryPolicyV1;
    try {
      retry = resolveRetryPolicy(
        input.policyRegistry,
        jobInput.runtimePolicy.retryPolicy,
      );
    } catch {
      results.push(policyUnavailable(job.jobId, 'RETRY_POLICY_UNAVAILABLE'));
      continue;
    }
    let heartbeat: MediaProxyMasterTranscodeHeartbeatPolicyV1;
    try {
      heartbeat = resolveHeartbeatPolicy(
        input.policyRegistry,
        jobInput.runtimePolicy.heartbeatPolicy,
      );
    } catch {
      results.push(policyUnavailable(job.jobId, 'HEARTBEAT_POLICY_UNAVAILABLE'));
      continue;
    }
    if (!runtimePoliciesMatch(jobInput.runtimePolicy, { retry, heartbeat })) {
      results.push(policyUnavailable(job.jobId, 'LIFECYCLE_POLICY_MISMATCH'));
      continue;
    }
    const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
      job,
      configuration,
      jobStore: input.jobStore,
      message: assertMediaProxyMasterTranscodeDurableWorkerMessageV1({
        jobId: job.jobId,
      }),
      deliveryPolicy: retry.qstashDelivery,
      dispatchIntent: {
        kind: 'RECOVERY_SELECTED',
        stateBindingSha256:
          createDurableWorkflowQStashRecoveryStateBindingV1(job),
      },
      environment,
      ...(input.publisher ? { publisher: input.publisher } : {}),
      now,
    });
    results.push(recoveryDispatchResult(dispatched));
  }
  return Object.freeze({
    scanned: candidates.length,
    eligible: eligible.length,
    skipped: candidates.length - eligible.length,
    results: Object.freeze(results),
  });
}

function activeOperationalPolicies(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
): OperationalPoliciesV2 {
  const retry = assertRetryPolicy(registry?.activeRetryPolicy);
  const heartbeat = assertHeartbeatPolicy(registry?.activeHeartbeatPolicy);
  const resolvedRetry = resolveRetryPolicy(
    registry,
    registry?.activeRetryPolicyBinding,
  );
  const resolvedHeartbeat = resolveHeartbeatPolicy(
    registry,
    registry?.activeHeartbeatPolicyBinding,
  );
  if (resolvedRetry.policySha256 !== retry.policySha256
    || resolvedHeartbeat.policySha256 !== heartbeat.policySha256) {
    fail('ACTIVE_POLICY_MISMATCH');
  }
  return Object.freeze({ retry: resolvedRetry, heartbeat: resolvedHeartbeat });
}

function resolveRetryPolicy(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
  binding: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): MediaProxyMasterTranscodeRetryPolicyV1 {
  if (!registry || typeof registry.resolveRetry !== 'function') {
    throw new Error('OPERATIONAL_POLICY_REGISTRY_INVALID');
  }
  const policy = assertRetryPolicy(registry.resolveRetry(binding as never));
  if (!sameBinding(binding, policy)) throw new Error('RETRY_POLICY_MISMATCH');
  return policy;
}

function resolveHeartbeatPolicy(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
  binding: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): MediaProxyMasterTranscodeHeartbeatPolicyV1 {
  if (!registry || typeof registry.resolveHeartbeat !== 'function') {
    throw new Error('OPERATIONAL_POLICY_REGISTRY_INVALID');
  }
  const policy = assertHeartbeatPolicy(
    registry.resolveHeartbeat(binding as never),
  );
  if (!sameBinding(binding, policy)) throw new Error('HEARTBEAT_POLICY_MISMATCH');
  return policy;
}

function assertRetryPolicy(value: unknown) {
  try {
    return assertMediaProxyMasterTranscodeRetryPolicyV1(value);
  } catch {
    fail('RETRY_POLICY_INVALID');
  }
}

function assertHeartbeatPolicy(value: unknown) {
  try {
    return assertMediaProxyMasterTranscodeHeartbeatPolicyV1(value);
  } catch {
    fail('HEARTBEAT_POLICY_INVALID');
  }
}

function assertRuntimePolicies(
  runtime: MediaProxyMasterTranscodeDurableRuntimePolicyV1,
  policies: OperationalPoliciesV2,
): void {
  if (!runtimePoliciesMatch(runtime, policies)) {
    fail('OPERATIONAL_POLICY_BINDING_MISMATCH');
  }
}

function runtimePoliciesMatch(
  runtime: MediaProxyMasterTranscodeDurableRuntimePolicyV1,
  policies: OperationalPoliciesV2,
): boolean {
  return sameBinding(runtime.retryPolicy, policies.retry)
    && sameBinding(runtime.heartbeatPolicy, policies.heartbeat)
    && runtime.lifecycle.maxAttempts === policies.retry.durableJob.maxAttempts
    && runtime.lifecycle.retentionMs === policies.retry.durableJob.retentionMs;
}

function sameBinding(
  left: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
  right: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): boolean {
  return left?.ownerId === right?.ownerId
    && left?.ownerVersion === right?.ownerVersion
    && left?.policySha256 === right?.policySha256;
}

function isV2ProxyTranscodeJob(job: DurableWorkflowJobSnapshotV1): boolean {
  return job.operationOwner === MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1
    && job.operationKind === MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1
    && job.input.schemaId
      === MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2
    && (job.status === 'queued'
      || job.status === 'retry_wait'
      || job.status === 'running');
}

function policyUnavailable(
  jobId: string,
  reason: 'JOB_CONTRACT_INVALID' | 'RETRY_POLICY_UNAVAILABLE'
    | 'HEARTBEAT_POLICY_UNAVAILABLE' | 'LIFECYCLE_POLICY_MISMATCH',
) {
  return Object.freeze({ state: 'policy_unavailable' as const, jobId, reason });
}

function recoveryDispatchResult(
  result: Awaited<ReturnType<
    typeof publishAndRecordDurableWorkflowQStashJobV1
  >>,
) {
  if (result.state === 'dispatched'
    || result.state === 'dispatch_unconfirmed'
    || result.state === 'delivery_unknown') {
    return Object.freeze(result);
  }
  fail('RECOVERY_DISPATCH_STATE_INVALID');
}

function requireConfiguration(
  environment: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
) {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: WORKER_PATH_V2,
    environment,
  });
  if (!result.configured) fail(result.reason);
  return result;
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function processEnvironment():
MediaProxyMasterTranscodeDurableDispatchEnvironmentV1 {
  return {
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function fail(code: string): never {
  throw new MediaProxyMasterTranscodeDurableDispatchErrorV2(code);
}

export class MediaProxyMasterTranscodeDurableDispatchErrorV2 extends Error {
  constructor(public readonly code: string) {
    super(`MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_V2_${code}`);
    this.name = 'MediaProxyMasterTranscodeDurableDispatchErrorV2';
  }
}
