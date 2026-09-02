import { z } from 'zod';

import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  createDurableWorkflowQStashRecoveryStateBindingV1,
  publishAndRecordDurableWorkflowQStashJobV1,
  resolveDurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDispatchEnvironmentV1,
  type DurableWorkflowQStashPublisherV1,
} from './durable-workflow-qstash-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
  assertMediaProxyMasterTranscodeDurableJobV1,
  assertMediaProxyMasterTranscodeDurableRuntimePolicyV1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
  type MediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from './media-proxy-master-transcode-durable-job-v1';
import type {
  MediaProxyMasterTranscodeOperationalPolicyRegistryV1,
} from './media-proxy-master-transcode-operational-policy-registry-v1';
import {
  assertMediaProxyMasterTranscodeHeartbeatPolicyV1,
  assertMediaProxyMasterTranscodeRetryPolicyV1,
  type MediaProxyMasterTranscodeHeartbeatPolicyV1,
  type MediaProxyMasterTranscodeRetryPolicyV1,
} from './media-proxy-master-transcode-operational-policy-v1';

const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_PATH_V1 =
  '/api/internal/workers/media-proxy-master-transcode' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_ROUTE_ID_V1 =
  'media-proxy-master-transcode' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const WorkerMessageSchema = z.object({ jobId: ID }).strict();

export type MediaProxyMasterTranscodeDurableWorkerMessageV1 = z.infer<
  typeof WorkerMessageSchema
>;

export function assertMediaProxyMasterTranscodeDurableWorkerMessageV1(
  value: unknown,
): Readonly<MediaProxyMasterTranscodeDurableWorkerMessageV1> {
  const parsed = WorkerMessageSchema.safeParse(value);
  if (!parsed.success) {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_MESSAGE_INVALID',
    );
  }
  return Object.freeze(parsed.data);
}

export type MediaProxyMasterTranscodeDurableDispatchEnvironmentV1 =
  DurableWorkflowQStashDispatchEnvironmentV1;
export type MediaProxyMasterTranscodeQStashPublisherV1 =
  DurableWorkflowQStashPublisherV1;

export type MediaProxyMasterTranscodeDurableDispatchConfigurationV1 = Readonly<
  | { configured: true; reason: null; workerUrl: string }
  | {
      configured: false;
      reason: Extract<DurableWorkflowQStashDispatchConfigurationV1,
        { configured: false }>['reason'];
      workerUrl: null;
    }
>;

type DispatchStateV1 = Readonly<
  | { state: 'dispatched'; messageId: string }
  | {
      state: 'dispatch_unconfirmed';
      reason: 'QSTASH_PUBLISH_REJECTED' | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID';
    }
  | {
      state: 'delivery_unknown';
      messageId: string;
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

export type MediaProxyMasterTranscodeDurableDispatchResultV1 = Readonly<
  | ({ jobId: string; created: boolean } & DispatchStateV1)
  | {
      state: 'already_dispatched';
      jobId: string;
      created: boolean;
      messageId: string;
    }
  | {
      state: 'not_dispatchable';
      jobId: string;
      created: boolean;
      jobStatus: DurableWorkflowJobSnapshotV1['status'];
    }
>;

export type MediaProxyMasterTranscodeDurableRecoveryResultV1 = Readonly<{
  scanned: number;
  eligible: number;
  skipped: number;
  results: readonly Readonly<
    | ({ jobId: string } & DispatchStateV1)
    | {
        state: 'policy_unavailable';
        jobId: string;
        reason: 'JOB_CONTRACT_INVALID' | 'RETRY_POLICY_UNAVAILABLE'
          | 'HEARTBEAT_POLICY_UNAVAILABLE' | 'LIFECYCLE_POLICY_MISMATCH';
      }
  >[];
}>;

export class MediaProxyMasterTranscodeDurableDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MediaProxyMasterTranscodeDurableDispatchErrorV1';
  }
}

export async function dispatchMediaProxyMasterTranscodeDurableJobV1(
  input: Readonly<{
    request: Parameters<
      typeof createOrGetMediaProxyMasterTranscodeDurableJobV1
    >[0]['request'];
    jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet' | 'recordDispatch'>;
    policyRegistry: Readonly<
      MediaProxyMasterTranscodeOperationalPolicyRegistryV1
    >;
    env?: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1;
    publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
    now?: Date;
  }>,
): Promise<MediaProxyMasterTranscodeDurableDispatchResultV1> {
  const environment = input.env ?? processEnvironment();
  const configuration = requireConfiguration(environment);
  const policies = activeOperationalPolicies(input.policyRegistry);
  assertRuntimePolicies(input.request.runtimePolicy, policies);
  const bound = await createOrGetMediaProxyMasterTranscodeDurableJobV1({
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

export async function recoverMediaProxyMasterTranscodeDurableJobsV1(
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
): Promise<MediaProxyMasterTranscodeDurableRecoveryResultV1> {
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
    isProxyTranscodeJob(job)
      && Date.parse(job.updatedAt) <= staleBefore.getTime()
  ));
  const results: Array<MediaProxyMasterTranscodeDurableRecoveryResultV1[
    'results'
  ][number]> = [];
  for (const job of eligible) {
    let jobInput: ReturnType<typeof assertMediaProxyMasterTranscodeDurableJobV1>;
    try {
      jobInput = assertMediaProxyMasterTranscodeDurableJobV1(job);
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

type OperationalPoliciesV1 = Readonly<{
  retry: MediaProxyMasterTranscodeRetryPolicyV1;
  heartbeat: MediaProxyMasterTranscodeHeartbeatPolicyV1;
}>;

function activeOperationalPolicies(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
): OperationalPoliciesV1 {
  const retry = assertRetryPolicy(
    registry?.activeRetryPolicy,
    'ACTIVE_RETRY_POLICY_INVALID',
  );
  const heartbeat = assertHeartbeatPolicy(
    registry?.activeHeartbeatPolicy,
    'ACTIVE_HEARTBEAT_POLICY_INVALID',
  );
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
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_ACTIVE_POLICY_MISMATCH',
    );
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
  let resolved: unknown;
  try {
    resolved = registry.resolveRetry(binding as never);
  } catch {
    throw new Error('RETRY_POLICY_UNAVAILABLE');
  }
  const policy = assertRetryPolicy(resolved, 'RETRY_POLICY_INVALID');
  if (!sameBinding(binding, policy)) throw new Error('RETRY_POLICY_BINDING_MISMATCH');
  return policy;
}

function resolveHeartbeatPolicy(
  registry: Readonly<MediaProxyMasterTranscodeOperationalPolicyRegistryV1>,
  binding: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): MediaProxyMasterTranscodeHeartbeatPolicyV1 {
  if (!registry || typeof registry.resolveHeartbeat !== 'function') {
    throw new Error('OPERATIONAL_POLICY_REGISTRY_INVALID');
  }
  let resolved: unknown;
  try {
    resolved = registry.resolveHeartbeat(binding as never);
  } catch {
    throw new Error('HEARTBEAT_POLICY_UNAVAILABLE');
  }
  const policy = assertHeartbeatPolicy(resolved, 'HEARTBEAT_POLICY_INVALID');
  if (!sameBinding(binding, policy)) {
    throw new Error('HEARTBEAT_POLICY_BINDING_MISMATCH');
  }
  return policy;
}

function assertRetryPolicy(value: unknown, code: string) {
  try {
    return assertMediaProxyMasterTranscodeRetryPolicyV1(value);
  } catch {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      `MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_${code}`,
    );
  }
}

function assertHeartbeatPolicy(value: unknown, code: string) {
  try {
    return assertMediaProxyMasterTranscodeHeartbeatPolicyV1(value);
  } catch {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      `MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_${code}`,
    );
  }
}

function assertRuntimePolicies(
  value: MediaProxyMasterTranscodeDurableRuntimePolicyV1,
  policies: OperationalPoliciesV1,
): void {
  let runtime: MediaProxyMasterTranscodeDurableRuntimePolicyV1;
  try {
    runtime = assertMediaProxyMasterTranscodeDurableRuntimePolicyV1(value);
  } catch {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_RUNTIME_POLICY_INVALID',
    );
  }
  if (!runtimePoliciesMatch(runtime, policies)) {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      'MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_OPERATIONAL_POLICY_BINDING_MISMATCH',
    );
  }
}

function runtimePoliciesMatch(
  runtime: MediaProxyMasterTranscodeDurableRuntimePolicyV1,
  policies: OperationalPoliciesV1,
): boolean {
  return sameBinding(runtime.retryPolicy, policies.retry)
    && sameBinding(runtime.heartbeatPolicy, policies.heartbeat)
    && runtime.lifecycle.maxAttempts === policies.retry.durableJob.maxAttempts
    && runtime.lifecycle.retentionMs === policies.retry.durableJob.retentionMs;
}

function sameBinding(
  binding: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
  policy: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
): boolean {
  return binding?.ownerId === policy.ownerId
    && binding?.ownerVersion === policy.ownerVersion
    && binding?.policySha256 === policy.policySha256;
}

function policyUnavailable(
  jobId: string,
  reason: 'JOB_CONTRACT_INVALID' | 'RETRY_POLICY_UNAVAILABLE'
    | 'HEARTBEAT_POLICY_UNAVAILABLE' | 'LIFECYCLE_POLICY_MISMATCH',
) {
  return Object.freeze({ state: 'policy_unavailable' as const, jobId, reason });
}

export function resolveMediaProxyMasterTranscodeDurableDispatchConfigurationV1(
  environment: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1 =
    processEnvironment(),
): MediaProxyMasterTranscodeDurableDispatchConfigurationV1 {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_PATH_V1,
    environment,
  });
  return result.configured
    ? Object.freeze({
        configured: true,
        reason: null,
        workerUrl: result.workerUrl,
      })
    : Object.freeze({
        configured: false,
        reason: result.reason,
        workerUrl: null,
      });
}

function isProxyTranscodeJob(job: DurableWorkflowJobSnapshotV1): boolean {
  return job.operationOwner === MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1
    && job.operationKind === MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1
    && job.input.schemaId
      === MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1
    && (job.status === 'queued'
      || job.status === 'retry_wait'
      || job.status === 'running');
}

function recoveryDispatchResult(
  result: Awaited<ReturnType<
    typeof publishAndRecordDurableWorkflowQStashJobV1
  >>,
): Readonly<{ jobId: string } & DispatchStateV1> {
  if (result.state === 'dispatched') return Object.freeze(result);
  if (result.state === 'dispatch_unconfirmed') return Object.freeze(result);
  if (result.state === 'delivery_unknown') return Object.freeze(result);
  throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
    'MEDIA_PROXY_MASTER_TRANSCODE_RECOVERY_DISPATCH_STATE_INVALID',
  );
}

function requireConfiguration(
  environment: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1,
): Extract<DurableWorkflowQStashDispatchConfigurationV1, { configured: true }> {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_PATH_V1,
    environment,
  });
  if (!result.configured) {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      `MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_${result.reason}`,
    );
  }
  return result;
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

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new MediaProxyMasterTranscodeDurableDispatchErrorV1(
      `MEDIA_PROXY_MASTER_TRANSCODE_DISPATCH_${label}_INVALID`,
    );
  }
  return value;
}
