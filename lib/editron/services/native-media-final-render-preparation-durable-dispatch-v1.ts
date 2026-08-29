import { z } from 'zod';

import type { DurableWorkflowJobSnapshotV1 } from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  createDurableWorkflowQStashRecoveryStateBindingV1,
  publishAndRecordDurableWorkflowQStashJobV1,
  resolveDurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDispatchEnvironmentV1,
  type DurableWorkflowQStashPublisherV1,
} from './durable-workflow-qstash-dispatch-v1';
import {
  assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  type NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
} from './native-media-final-render-preparation-delivery-retry-policy-v1';
import type {
  NativeMediaFinalRenderPreparationRetryPolicyRegistryV1,
} from './native-media-final-render-preparation-delivery-retry-policy-registry-v1';
import {
  assertNativeMediaFinalRenderPreparationJobInputV1,
  buildNativeMediaFinalRenderPreparationJobContractV1,
  createOrGetNativeMediaFinalRenderPreparationJobV1,
  NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1,
} from './native-media-final-render-preparation-job-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_PATH_V1 =
  '/api/internal/workers/native-media-final-render-preparation' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const WorkerMessageSchema = z.object({
  version: z.literal(NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1),
  jobId: ID,
}).strict();

export type NativeMediaFinalRenderPreparationWorkerMessageV1 = z.infer<
  typeof WorkerMessageSchema
>;

export function assertNativeMediaFinalRenderPreparationWorkerMessageV1(
  value: unknown,
): Readonly<NativeMediaFinalRenderPreparationWorkerMessageV1> {
  const parsed = WorkerMessageSchema.safeParse(value);
  if (!parsed.success) fail('WORKER_MESSAGE_INVALID');
  return Object.freeze(parsed.data);
}

export type NativeMediaFinalRenderPreparationDispatchEnvironmentV1 =
  DurableWorkflowQStashDispatchEnvironmentV1;
export type NativeMediaFinalRenderPreparationQStashPublisherV1 =
  DurableWorkflowQStashPublisherV1;

type JobRequestV1 = Parameters<
  typeof buildNativeMediaFinalRenderPreparationJobContractV1
>[0];
type ProductJobRequestV1 = Omit<JobRequestV1, 'tenantId' | 'userId' | 'orgId'>;
type DispatchStateV1 = Readonly<
  | { state: 'dispatched'; jobId: string; messageId: string }
  | { state: 'already_dispatched'; jobId: string; messageId: string }
  | {
      state: 'not_dispatchable';
      jobId: string;
      jobStatus: DurableWorkflowJobSnapshotV1['status'];
    }
  | {
      state: 'dispatch_unconfirmed';
      jobId: string;
      reason: 'QSTASH_PUBLISH_REJECTED' | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID';
    }
  | {
      state: 'delivery_unknown';
      jobId: string;
      messageId: string;
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;
type RecoveryStateV1 = DispatchStateV1 | Readonly<{
  state: 'policy_unavailable';
  jobId: string;
  reason: 'JOB_CONTRACT_INVALID' | 'RETRY_POLICY_UNAVAILABLE';
}>;

class NativeMediaFinalRenderPreparationDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeMediaFinalRenderPreparationDispatchErrorV1';
  }
}

export async function dispatchNativeMediaFinalRenderPreparationJobV1(input: Readonly<{
  actor: Readonly<{ tenantId: string; userId: string; orgId: string | null }>;
  request: ProductJobRequestV1;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet' | 'recordDispatch'>;
  policyRegistry: Readonly<NativeMediaFinalRenderPreparationRetryPolicyRegistryV1>;
  env?: NativeMediaFinalRenderPreparationDispatchEnvironmentV1;
  publisher?: Readonly<NativeMediaFinalRenderPreparationQStashPublisherV1>;
  now?: Date;
}>): Promise<Readonly<DispatchStateV1 & { created: boolean }>> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);
  const deliveryRetryPolicy = activePolicy(input.policyRegistry);
  const bound = await createOrGetNativeMediaFinalRenderPreparationJobV1({
    jobStore: input.jobStore,
    request: {
      ...input.request,
      tenantId: identity(input.actor.tenantId, 'TENANT_ID'),
      userId: identity(input.actor.userId, 'USER_ID'),
      orgId: nullableIdentity(input.actor.orgId, 'ORG_ID'),
    },
    deliveryRetryPolicy,
    ...(input.now ? { now: input.now } : {}),
  });
  const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
    job: bound.job,
    jobStore: input.jobStore,
    configuration,
    message: workerMessage(bound.job.jobId),
    deliveryPolicy: deliveryRetryPolicy.qstashDelivery,
    dispatchIntent: { kind: 'INITIAL_QUEUED', deduplicationId: bound.job.jobId },
    environment: env,
    ...(input.publisher ? { publisher: input.publisher } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  return Object.freeze({ ...dispatched, created: bound.created });
}

export async function recoverNativeMediaFinalRenderPreparationJobsV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'listRecoverable' | 'recordDispatch'>;
  policyRegistry: Readonly<NativeMediaFinalRenderPreparationRetryPolicyRegistryV1>;
  staleBefore: Date;
  now?: Date;
  limit?: number;
  env?: NativeMediaFinalRenderPreparationDispatchEnvironmentV1;
  publisher?: Readonly<NativeMediaFinalRenderPreparationQStashPublisherV1>;
}>): Promise<Readonly<{
  scanned: number;
  eligible: number;
  skipped: number;
  results: readonly RecoveryStateV1[];
}>> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);
  const now = validDate(input.now ?? new Date(), 'NOW');
  const staleBefore = validDate(input.staleBefore, 'STALE_BEFORE');
  const candidates = await input.jobStore.listRecoverable({
    staleBefore, now, ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
  const eligible = candidates.filter((job) => isExactRenderPreparationJob(job, staleBefore));
  const results: RecoveryStateV1[] = [];
  for (const job of eligible) {
    let jobInput: ReturnType<typeof assertNativeMediaFinalRenderPreparationJobInputV1>;
    try {
      jobInput = assertNativeMediaFinalRenderPreparationJobInputV1(job.input.payload);
    } catch {
      results.push(Object.freeze({
        state: 'policy_unavailable', jobId: job.jobId, reason: 'JOB_CONTRACT_INVALID',
      }));
      continue;
    }
    let policy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1;
    try {
      policy = resolveBoundPolicy(
        input.policyRegistry,
        jobInput.policyBindings.runtimePolicy.retryPolicy,
      );
    } catch {
      results.push(Object.freeze({
        state: 'policy_unavailable', jobId: job.jobId, reason: 'RETRY_POLICY_UNAVAILABLE',
      }));
      continue;
    }
    const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
      job,
      jobStore: input.jobStore,
      configuration,
      message: workerMessage(job.jobId),
      deliveryPolicy: policy.qstashDelivery,
      dispatchIntent: {
        kind: 'RECOVERY_SELECTED',
        stateBindingSha256: createDurableWorkflowQStashRecoveryStateBindingV1(job),
      },
      environment: env,
      ...(input.publisher ? { publisher: input.publisher } : {}),
      now,
    });
    results.push(Object.freeze(dispatched));
  }
  return Object.freeze({
    scanned: candidates.length,
    eligible: eligible.length,
    skipped: candidates.length - eligible.length,
    results: Object.freeze(results),
  });
}

export function resolveNativeMediaFinalRenderPreparationDispatchConfigurationV1(
  env: NativeMediaFinalRenderPreparationDispatchEnvironmentV1 = processEnvironment(),
) {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_PATH_V1,
    environment: env,
  });
  return result.configured
    ? Object.freeze({ configured: true as const, reason: null, workerUrl: result.workerUrl })
    : Object.freeze({ configured: false as const, reason: result.reason, workerUrl: null });
}

function activePolicy(
  registry: Readonly<NativeMediaFinalRenderPreparationRetryPolicyRegistryV1>,
) {
  const advertised = assertPolicy(registry?.activePolicy, 'REGISTRY_ACTIVE_POLICY_INVALID');
  const resolved = resolveBoundPolicy(registry, registry?.activePolicyBinding);
  if (resolved.policySha256 !== advertised.policySha256) {
    fail('REGISTRY_ACTIVE_POLICY_MISMATCH');
  }
  return resolved;
}

function resolveBoundPolicy(
  registry: Readonly<NativeMediaFinalRenderPreparationRetryPolicyRegistryV1>,
  binding: Readonly<{ ownerId: string; ownerVersion: string; policySha256: string }>,
) {
  if (!registry || typeof registry.resolve !== 'function') fail('REGISTRY_INVALID');
  let resolved: unknown;
  try {
    resolved = registry.resolve(binding as never);
  } catch {
    fail('REGISTRY_POLICY_UNAVAILABLE');
  }
  const policy = assertPolicy(resolved, 'REGISTRY_POLICY_INVALID');
  if (policy.ownerId !== binding?.ownerId || policy.ownerVersion !== binding?.ownerVersion
    || policy.policySha256 !== binding?.policySha256) {
    fail('REGISTRY_POLICY_BINDING_MISMATCH');
  }
  return policy;
}

function assertPolicy(value: unknown, code: string) {
  try {
    return assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(value);
  } catch {
    fail(code);
  }
}

function workerMessage(jobId: string) {
  return assertNativeMediaFinalRenderPreparationWorkerMessageV1({
    version: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_MESSAGE_VERSION_V1,
    jobId,
  });
}

function isExactRenderPreparationJob(
  job: DurableWorkflowJobSnapshotV1,
  staleBefore: Date,
): boolean {
  return job.operationOwner === 'NATIVE_MEDIA_FINAL_RENDER'
    && job.operationKind === 'native_media_final_render_prepare_source'
    && job.input.schemaId === NATIVE_MEDIA_FINAL_RENDER_PREPARATION_JOB_INPUT_VERSION_V1
    && (job.status === 'queued' || job.status === 'retry_wait' || job.status === 'running')
    && Number.isFinite(Date.parse(job.updatedAt))
    && Date.parse(job.updatedAt) <= staleBefore.getTime();
}

function requireConfiguration(
  env: NativeMediaFinalRenderPreparationDispatchEnvironmentV1,
): Extract<DurableWorkflowQStashDispatchConfigurationV1, { configured: true }> {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_WORKER_PATH_V1,
    environment: env,
  });
  if (!result.configured) fail(result.reason);
  return result;
}

function processEnvironment(): NativeMediaFinalRenderPreparationDispatchEnvironmentV1 {
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
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(`${label}_INVALID`);
  return value;
}

function identity(value: string, label: string): string {
  const parsed = ID.safeParse(value);
  if (!parsed.success) fail(`${label}_INVALID`);
  return parsed.data;
}

function nullableIdentity(value: string | null, label: string): string | null {
  return value === null ? null : identity(value, label);
}

function fail(label: string): never {
  throw new NativeMediaFinalRenderPreparationDispatchErrorV1(
    `NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DISPATCH_${label}`,
  );
}
