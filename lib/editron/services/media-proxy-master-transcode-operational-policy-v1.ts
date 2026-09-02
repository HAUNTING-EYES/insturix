import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowQStashDeliveryPolicyV1 }
  from './durable-workflow-qstash-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_MAX_ATTEMPTS_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_MAX_RETENTION_MS_V1,
  assertMediaProxyMasterTranscodeDurableJobV1,
} from './media-proxy-master-transcode-durable-job-v1';
import type {
  MediaProxyMasterTranscodeHeartbeatOwnerV1,
  MediaProxyMasterTranscodeRetryDecisionInputV1,
  MediaProxyMasterTranscodeRetryDecisionV1,
  MediaProxyMasterTranscodeRetryOwnerV1,
} from './media-proxy-master-transcode-durable-worker-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1 =
  'MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1 =
  'editron-media-proxy-master-transcode-retry-policy-v1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1 =
  'MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1 =
  'editron-media-proxy-master-transcode-heartbeat-policy-v1' as const;

const MAX_HEARTBEAT_INTERVAL_MS = Math.floor(
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1 / 3,
);
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const DIAGNOSTIC = /^[A-Z0-9_]{1,240}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_RETRYABLE_DIAGNOSTICS = 256;
const MAX_BACKOFF_MULTIPLIER = 16;
const MAX_JITTER_PERMILLE = 1_000;

export type MediaProxyMasterTranscodeRetryPolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_KIND_V1;
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1;
  ownerVersion:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1;
  durableJob: Readonly<{ maxAttempts: number; retentionMs: number }>;
  qstashDelivery: DurableWorkflowQStashDeliveryPolicyV1;
  workerRetry: Readonly<{
    baseDelayMs: number;
    maximumDelayMs: number;
    backoffMultiplier: number;
    deterministicJitterPermille: number;
    retryableDiagnostics: readonly string[];
  }>;
  policySha256: string;
}>;

export type MediaProxyMasterTranscodeHeartbeatPolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_KIND_V1;
  ownerId: typeof MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1;
  ownerVersion:
    typeof MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1;
  durableLeaseMs: typeof DURABLE_WORKFLOW_JOB_LEASE_MS_V1;
  heartbeatIntervalMs: number;
  policySha256: string;
}>;

export function createMediaProxyMasterTranscodeRetryPolicyV1(
  input: Readonly<{
    durableJob: Readonly<{ maxAttempts: number; retentionMs: number }>;
    qstashDelivery: DurableWorkflowQStashDeliveryPolicyV1;
    workerRetry: Readonly<{
      baseDelayMs: number;
      maximumDelayMs: number;
      backoffMultiplier: number;
      deterministicJitterPermille: number;
      retryableDiagnostics: readonly string[];
    }>;
  }>,
): MediaProxyMasterTranscodeRetryPolicyV1 {
  const root = object(input, 'RETRY_DECLARATION');
  exactKeys(root, ['durableJob', 'qstashDelivery', 'workerRetry'],
    'RETRY_DECLARATION');
  const durableJob = object(root.durableJob, 'RETRY_DURABLE_JOB');
  exactKeys(durableJob, ['maxAttempts', 'retentionMs'], 'RETRY_DURABLE_JOB');
  const qstashDelivery = object(root.qstashDelivery, 'RETRY_QSTASH_DELIVERY');
  exactKeys(qstashDelivery, ['retries', 'retryDelayMs', 'timeoutSeconds'],
    'RETRY_QSTASH_DELIVERY');
  const workerRetry = object(root.workerRetry, 'RETRY_WORKER');
  exactKeys(workerRetry, [
    'backoffMultiplier', 'baseDelayMs', 'deterministicJitterPermille',
    'maximumDelayMs', 'retryableDiagnostics',
  ], 'RETRY_WORKER');
  const maxAttempts = positiveInteger(
    durableJob.maxAttempts,
    MEDIA_PROXY_MASTER_TRANSCODE_MAX_ATTEMPTS_V1,
    'RETRY_MAX_ATTEMPTS',
  );
  const retentionMs = positiveInteger(
    durableJob.retentionMs,
    MEDIA_PROXY_MASTER_TRANSCODE_MAX_RETENTION_MS_V1,
    'RETRY_RETENTION_MS',
  );
  const baseDelayMs = positiveInteger(
    workerRetry.baseDelayMs,
    retentionMs,
    'RETRY_BASE_DELAY_MS',
  );
  const maximumDelayMs = positiveInteger(
    workerRetry.maximumDelayMs,
    retentionMs,
    'RETRY_MAXIMUM_DELAY_MS',
  );
  if (baseDelayMs > maximumDelayMs) fail('RETRY_DELAY_ORDER_INVALID');
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_KIND_V1,
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1,
    ownerVersion: MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1,
    durableJob: { maxAttempts, retentionMs },
    qstashDelivery: {
      retries: nonNegativeInteger(
        qstashDelivery.retries,
        Number.MAX_SAFE_INTEGER,
        'RETRY_QSTASH_RETRIES',
      ),
      retryDelayMs: positiveInteger(
        qstashDelivery.retryDelayMs,
        retentionMs,
        'RETRY_QSTASH_DELAY_MS',
      ),
      timeoutSeconds: positiveInteger(
        qstashDelivery.timeoutSeconds,
        Number.MAX_SAFE_INTEGER,
        'RETRY_QSTASH_TIMEOUT_SECONDS',
      ),
    },
    workerRetry: {
      baseDelayMs,
      maximumDelayMs,
      backoffMultiplier: positiveInteger(
        workerRetry.backoffMultiplier,
        MAX_BACKOFF_MULTIPLIER,
        'RETRY_BACKOFF_MULTIPLIER',
      ),
      deterministicJitterPermille: nonNegativeInteger(
        workerRetry.deterministicJitterPermille,
        MAX_JITTER_PERMILLE,
        'RETRY_JITTER_PERMILLE',
      ),
      retryableDiagnostics: normalizeDiagnostics(
        workerRetry.retryableDiagnostics,
      ),
    },
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodeRetryPolicyV1(
  value: unknown,
): MediaProxyMasterTranscodeRetryPolicyV1 {
  const record = object(value, 'RETRY_POLICY');
  exactKeys(record, [
    'durableJob', 'kind', 'ownerId', 'ownerVersion', 'policySha256',
    'qstashDelivery', 'schemaVersion', 'workerRetry',
  ], 'RETRY_POLICY');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_KIND_V1
    || record.ownerId !== MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_ID_V1
    || record.ownerVersion
      !== MEDIA_PROXY_MASTER_TRANSCODE_RETRY_POLICY_OWNER_VERSION_V1) {
    fail('RETRY_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterTranscodeRetryPolicyV1({
    durableJob: record.durableJob as never,
    qstashDelivery: record.qstashDelivery as never,
    workerRetry: record.workerRetry as never,
  });
  if (sha256(record.policySha256, 'RETRY_POLICY') !== rebuilt.policySha256) {
    fail('RETRY_POLICY_SHA256_MISMATCH');
  }
  return rebuilt;
}

export function createMediaProxyMasterTranscodeHeartbeatPolicyV1(
  input: Readonly<{ heartbeatIntervalMs: number }>,
): MediaProxyMasterTranscodeHeartbeatPolicyV1 {
  const root = object(input, 'HEARTBEAT_DECLARATION');
  exactKeys(root, ['heartbeatIntervalMs'], 'HEARTBEAT_DECLARATION');
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_KIND_V1,
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1,
    ownerVersion: MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1,
    durableLeaseMs: DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
    heartbeatIntervalMs: positiveInteger(
      root.heartbeatIntervalMs,
      MAX_HEARTBEAT_INTERVAL_MS,
      'HEARTBEAT_INTERVAL_MS',
    ),
  };
  return deepFreezeEditronJsonV1({
    ...material,
    policySha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaProxyMasterTranscodeHeartbeatPolicyV1(
  value: unknown,
): MediaProxyMasterTranscodeHeartbeatPolicyV1 {
  const record = object(value, 'HEARTBEAT_POLICY');
  exactKeys(record, [
    'durableLeaseMs', 'heartbeatIntervalMs', 'kind', 'ownerId',
    'ownerVersion', 'policySha256', 'schemaVersion',
  ], 'HEARTBEAT_POLICY');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_KIND_V1
    || record.ownerId
      !== MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_ID_V1
    || record.ownerVersion
      !== MEDIA_PROXY_MASTER_TRANSCODE_HEARTBEAT_POLICY_OWNER_VERSION_V1
    || record.durableLeaseMs !== DURABLE_WORKFLOW_JOB_LEASE_MS_V1) {
    fail('HEARTBEAT_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterTranscodeHeartbeatPolicyV1({
    heartbeatIntervalMs: record.heartbeatIntervalMs as number,
  });
  if (sha256(record.policySha256, 'HEARTBEAT_POLICY')
    !== rebuilt.policySha256) {
    fail('HEARTBEAT_POLICY_SHA256_MISMATCH');
  }
  return rebuilt;
}

export function createMediaProxyMasterTranscodeRetryOwnerV1(
  policyValue: MediaProxyMasterTranscodeRetryPolicyV1,
): Readonly<MediaProxyMasterTranscodeRetryOwnerV1> {
  const policy = assertMediaProxyMasterTranscodeRetryPolicyV1(policyValue);
  return Object.freeze({
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    async decide(input: MediaProxyMasterTranscodeRetryDecisionInputV1) {
      return decideRetry(policy, input);
    },
  });
}

export function createMediaProxyMasterTranscodeHeartbeatOwnerV1(
  policyValue: MediaProxyMasterTranscodeHeartbeatPolicyV1,
): Readonly<MediaProxyMasterTranscodeHeartbeatOwnerV1> {
  const policy = assertMediaProxyMasterTranscodeHeartbeatPolicyV1(policyValue);
  return Object.freeze({
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
    heartbeatIntervalMs: policy.heartbeatIntervalMs,
  });
}

function decideRetry(
  policy: MediaProxyMasterTranscodeRetryPolicyV1,
  input: MediaProxyMasterTranscodeRetryDecisionInputV1,
): MediaProxyMasterTranscodeRetryDecisionV1 {
  const job = input?.job;
  const now = validDate(input?.now, 'RETRY_NOW');
  const diagnosticCode = diagnostic(input?.diagnosticCode);
  if (input?.retryableHint !== true && input?.retryableHint !== false
    && input?.retryableHint !== null) {
    fail('RETRY_HINT_INVALID');
  }
  let jobInput;
  try {
    jobInput = assertMediaProxyMasterTranscodeDurableJobV1(job);
  } catch {
    fail('RETRY_JOB_CONTRACT_INVALID');
  }
  const createdAt = isoInstant(job.createdAt, 'RETRY_JOB_CREATED_AT');
  const expiresAt = isoInstant(job.expiresAt, 'RETRY_JOB_EXPIRES_AT');
  if (job.status !== 'running'
    || jobInput.runtimePolicy.retryPolicy.ownerId !== policy.ownerId
    || jobInput.runtimePolicy.retryPolicy.ownerVersion !== policy.ownerVersion
    || jobInput.runtimePolicy.retryPolicy.policySha256 !== policy.policySha256
    || job.maxAttempts !== policy.durableJob.maxAttempts
    || job.attemptCount < 1 || job.attemptCount > job.maxAttempts
    || job.remainingAttempts !== job.maxAttempts - job.attemptCount
    || expiresAt.getTime() - createdAt.getTime()
      !== policy.durableJob.retentionMs
    || now < createdAt || now >= expiresAt) {
    fail('RETRY_JOB_LIFECYCLE_BINDING_INVALID');
  }
  if (input.retryableHint === false) return stop('DECLARED_PERMANENT');
  if (input.retryableHint === null
    && !policy.workerRetry.retryableDiagnostics.includes(diagnosticCode)) {
    return stop('DIAGNOSTIC_NOT_RETRYABLE');
  }
  if (job.remainingAttempts === 0) return stop('ATTEMPTS_EXHAUSTED');

  const delayMs = retryDelayMs(policy, job, diagnosticCode);
  const retryAtMs = now.getTime() + delayMs;
  if (!Number.isSafeInteger(retryAtMs) || retryAtMs >= expiresAt.getTime()) {
    return stop('RETENTION_EXHAUSTED');
  }
  return Object.freeze({
    disposition: 'RETRY_AT',
    retryAt: new Date(retryAtMs),
  });
}

function retryDelayMs(
  policy: MediaProxyMasterTranscodeRetryPolicyV1,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  diagnosticCode: string,
): number {
  const retry = policy.workerRetry;
  let delayMs = retry.baseDelayMs;
  for (let attempt = 1; attempt < job.attemptCount; attempt += 1) {
    if (delayMs > Math.floor(retry.maximumDelayMs / retry.backoffMultiplier)) {
      delayMs = retry.maximumDelayMs;
      break;
    }
    delayMs *= retry.backoffMultiplier;
  }
  delayMs = Math.min(delayMs, retry.maximumDelayMs);
  const jitterCeiling = Number(
    BigInt(delayMs) * BigInt(retry.deterministicJitterPermille) / BigInt(1_000),
  );
  const availableJitter = Math.min(
    jitterCeiling,
    retry.maximumDelayMs - delayMs,
  );
  if (availableJitter === 0) return delayMs;
  const seed = hashEditronCanonicalJsonV1({
    kind: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_RETRY_JITTER_V1',
    policySha256: policy.policySha256,
    jobId: job.jobId,
    attemptCount: job.attemptCount,
    diagnosticCode,
  });
  const jitterMs = Number.parseInt(seed.slice(0, 12), 16)
    % (availableJitter + 1);
  return delayMs + jitterMs;
}

function stop(reason: string): MediaProxyMasterTranscodeRetryDecisionV1 {
  return Object.freeze({
    disposition: 'STOP_UNVERIFIABLE',
    reason: identity(reason, 'RETRY_STOP_REASON'),
  });
}

function normalizeDiagnostics(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1
    || value.length > MAX_RETRYABLE_DIAGNOSTICS) {
    fail('RETRY_DIAGNOSTICS_INVALID');
  }
  const diagnostics = value.map((item) => diagnostic(item)).sort();
  if (diagnostics.some((item, index) => index > 0
    && item === diagnostics[index - 1])) {
    fail('RETRY_DIAGNOSTICS_DUPLICATE');
  }
  return Object.freeze(diagnostics);
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

function nonNegativeInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0
    || Number(value) > maximum) fail(`${label}_INVALID`);
  return Number(value);
}

function positiveInteger(
  value: unknown,
  maximum: number,
  label: string,
): number {
  const parsed = nonNegativeInteger(value, maximum, label);
  if (parsed === 0) fail(`${label}_INVALID`);
  return parsed;
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(`${label}_INVALID`);
  return normalized;
}

function diagnostic(value: unknown): string {
  if (typeof value !== 'string' || !DIAGNOSTIC.test(value)) {
    fail('RETRY_DIAGNOSTIC_INVALID');
  }
  return value;
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
  throw new Error(`MEDIA_PROXY_MASTER_TRANSCODE_OPERATIONAL_POLICY_${label}`);
}
