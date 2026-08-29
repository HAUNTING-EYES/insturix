import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { DurableWorkflowJobSnapshotV1 } from './durable-workflow-job-v1';
import type { DurableWorkflowQStashDeliveryPolicyV1 }
  from './durable-workflow-qstash-dispatch-v1';

export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_KIND_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_V1' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY' as const;
export const NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_V1' as const;

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_KIND_V1;
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1;
  ownerVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1;
  durableJob: Readonly<{
    maxAttempts: number;
    retentionMs: number;
  }>;
  qstashDelivery: DurableWorkflowQStashDeliveryPolicyV1;
  workerRetry: Readonly<{ delayMs: number }>;
  policySha256: string;
}>;

export type NativeMediaFinalRenderPreparationRetryDecisionV1 = Readonly<
  | {
      disposition: 'RETRY_AT';
      retryAtIso: string;
      decisionSha256: string;
    }
  | {
      disposition: 'DEAD_LETTER';
      reason: 'ATTEMPTS_EXHAUSTED' | 'RETENTION_EXHAUSTED';
      decisionSha256: string;
    }
>;

export interface NativeMediaFinalRenderPreparationRetryPolicyOwnerV1 {
  ownerId: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1;
  ownerVersion: typeof NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1;
  policySha256: string;
  decideRetry(input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    errorCode: string;
    now: Date;
  }>): NativeMediaFinalRenderPreparationRetryDecisionV1;
}

export function createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(
  input: Readonly<{
    durableJob: Readonly<{ maxAttempts: number; retentionMs: number }>;
    qstashDelivery: DurableWorkflowQStashDeliveryPolicyV1;
    workerRetry: Readonly<{ delayMs: number }>;
  }>,
): NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 {
  const root = object(input, 'DECLARATION');
  exactKeys(root, ['durableJob', 'qstashDelivery', 'workerRetry'], 'DECLARATION');
  const durableJob = object(root.durableJob, 'DURABLE_JOB');
  exactKeys(durableJob, ['maxAttempts', 'retentionMs'], 'DURABLE_JOB');
  const qstashDelivery = object(root.qstashDelivery, 'QSTASH_DELIVERY');
  exactKeys(qstashDelivery, [
    'retries', 'retryDelayMs', 'timeoutSeconds',
  ], 'QSTASH_DELIVERY');
  const workerRetry = object(root.workerRetry, 'WORKER_RETRY');
  exactKeys(workerRetry, ['delayMs'], 'WORKER_RETRY');
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_KIND_V1,
    ownerId: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1,
    ownerVersion: NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1,
    durableJob: {
      maxAttempts: positiveInteger(durableJob.maxAttempts, 'MAX_ATTEMPTS'),
      retentionMs: positiveInteger(durableJob.retentionMs, 'RETENTION_MS'),
    },
    qstashDelivery: {
      retries: nonNegativeInteger(qstashDelivery.retries, 'QSTASH_RETRIES'),
      retryDelayMs: positiveInteger(
        qstashDelivery.retryDelayMs,
        'QSTASH_RETRY_DELAY_MS',
      ),
      timeoutSeconds: positiveInteger(
        qstashDelivery.timeoutSeconds,
        'QSTASH_TIMEOUT_SECONDS',
      ),
    },
    workerRetry: {
      delayMs: positiveInteger(workerRetry.delayMs, 'WORKER_RETRY_DELAY_MS'),
    },
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(
  value: unknown,
): NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 {
  const record = object(value, 'POLICY');
  exactKeys(record, [
    'durableJob', 'kind', 'ownerId', 'ownerVersion', 'policySha256',
    'qstashDelivery', 'schemaVersion', 'workerRetry',
  ], 'POLICY');
  if (record.schemaVersion !== 1
    || record.kind
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_KIND_V1
    || record.ownerId
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_OWNER_ID_V1
    || record.ownerVersion
      !== NATIVE_MEDIA_FINAL_RENDER_PREPARATION_RETRY_POLICY_VERSION_V1) {
    fail('POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: record.durableJob as never,
    qstashDelivery: record.qstashDelivery as never,
    workerRetry: record.workerRetry as never,
  });
  if (sha256(record.policySha256, 'POLICY_SHA256') !== rebuilt.policySha256) {
    fail('POLICY_SHA256_MISMATCH');
  }
  return rebuilt;
}

export function createNativeMediaFinalRenderPreparationRetryPolicyOwnerV1(
  policyValue: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
): Readonly<NativeMediaFinalRenderPreparationRetryPolicyOwnerV1> {
  const policy = assertNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1(
    policyValue,
  );
  return Object.freeze({
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    decideRetry(input: Readonly<{
      job: Readonly<DurableWorkflowJobSnapshotV1>;
      errorCode: string;
      now: Date;
    }>) {
      return decideRetry(policy, input);
    },
  });
}

function decideRetry(
  policy: NativeMediaFinalRenderPreparationDeliveryRetryPolicyV1,
  input: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    errorCode: string;
    now: Date;
  }>,
): NativeMediaFinalRenderPreparationRetryDecisionV1 {
  const job = input?.job;
  const now = validDate(input?.now, 'NOW');
  const errorCode = identity(input?.errorCode, 'ERROR_CODE');
  const jobId = identity(job?.jobId, 'JOB_ID');
  const createdAt = isoInstant(job?.createdAt, 'JOB_CREATED_AT');
  const expiresAt = isoInstant(job?.expiresAt, 'JOB_EXPIRES_AT');
  const attemptCount = positiveInteger(job?.attemptCount, 'JOB_ATTEMPT_COUNT');
  const remainingAttempts = nonNegativeInteger(
    job?.remainingAttempts,
    'JOB_REMAINING_ATTEMPTS',
  );
  if (job?.status !== 'running'
    || job.maxAttempts !== policy.durableJob.maxAttempts
    || attemptCount > job.maxAttempts
    || remainingAttempts !== job.maxAttempts - attemptCount
    || expiresAt.getTime() - createdAt.getTime() !== policy.durableJob.retentionMs
    || now < createdAt || now >= expiresAt) {
    fail('JOB_LIFECYCLE_BINDING_INVALID');
  }
  if (remainingAttempts === 0) {
    return decision({
      policySha256: policy.policySha256,
      jobId,
      attemptCount,
      remainingAttempts,
      errorCode,
      nowIso: now.toISOString(),
      disposition: 'DEAD_LETTER' as const,
      reason: 'ATTEMPTS_EXHAUSTED' as const,
    });
  }
  const retryAtMs = now.getTime() + policy.workerRetry.delayMs;
  if (!Number.isSafeInteger(retryAtMs)) fail('RETRY_AT_INVALID');
  if (retryAtMs >= expiresAt.getTime()) {
    return decision({
      policySha256: policy.policySha256,
      jobId,
      attemptCount,
      remainingAttempts,
      errorCode,
      nowIso: now.toISOString(),
      disposition: 'DEAD_LETTER' as const,
      reason: 'RETENTION_EXHAUSTED' as const,
    });
  }
  return decision({
    policySha256: policy.policySha256,
    jobId,
    attemptCount,
    remainingAttempts,
    errorCode,
    nowIso: now.toISOString(),
    disposition: 'RETRY_AT' as const,
    retryAtIso: new Date(retryAtMs).toISOString(),
  });
}

function decision<T extends Readonly<Record<string, unknown>>>(material: T) {
  return Object.freeze({
    ...material,
    decisionSha256: hashEditronCanonicalJsonV1(material),
  }) as T & Readonly<{ decisionSha256: string }>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label}_INVALID`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) {
    fail(`${label}_FIELDS_INVALID`);
  }
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(`${label}_INVALID`);
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed === 0) fail(`${label}_INVALID`);
  return parsed;
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(`${label}_INVALID`);
  return normalized;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label}_INVALID`);
  return value;
}

function isoInstant(value: unknown, label: string): Date {
  if (typeof value !== 'string') fail(`${label}_INVALID`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return parsed;
}

function validDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function fail(label: string): never {
  throw new Error(
    `NATIVE_MEDIA_FINAL_RENDER_PREPARATION_DELIVERY_RETRY_POLICY_${label}`,
  );
}
