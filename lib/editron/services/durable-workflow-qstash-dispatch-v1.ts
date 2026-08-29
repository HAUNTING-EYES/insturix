import { Client } from '@upstash/qstash';

import { isInternalQStashWorkerAuthConfigured }
  from '../security/internal-worker-auth';
import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';

const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const WORKER_PATH = /^\/api\/internal\/workers\/[A-Za-z0-9][A-Za-z0-9/_-]{0,255}$/;

export interface DurableWorkflowQStashDispatchEnvironmentV1
  extends Record<string, string | undefined> {
  QSTASH_TOKEN?: string;
  QSTASH_URL?: string;
  QSTASH_CURRENT_SIGNING_KEY?: string;
  QSTASH_NEXT_SIGNING_KEY?: string;
  VERCEL_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export type DurableWorkflowQStashDispatchConfigurationV1 = Readonly<
  | {
      configured: true;
      reason: null;
      workerPath: string;
      workerUrl: string;
    }
  | {
      configured: false;
      reason:
        | 'INVALID_WORKER_PATH'
        | 'MISSING_QSTASH_TOKEN'
        | 'MISSING_QSTASH_SIGNING_KEYS'
        | 'INVALID_QSTASH_URL'
        | 'MISSING_PUBLIC_ORIGIN'
        | 'INVALID_PUBLIC_ORIGIN';
      workerPath: null;
      workerUrl: null;
    }
>;

export type DurableWorkflowQStashDeliveryPolicyV1 = Readonly<{
  retries: number;
  retryDelayMs: number;
  timeoutSeconds: number;
}>;

export interface DurableWorkflowQStashPublisherV1 {
  publishJSON(input: Readonly<{
    url: string;
    body: unknown;
    retries: number;
    retryDelay: string;
    timeout: number;
    deduplicationId: string;
  }>): Promise<Readonly<{ messageId?: string; deduplicated?: boolean }>>;
}

type DurableWorkflowQStashPublishResultV1 = Readonly<
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
      reason:
        | 'QSTASH_PUBLISH_REJECTED'
        | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID';
    }
  | {
      state: 'delivery_unknown';
      jobId: string;
      messageId: string;
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

class DurableWorkflowQStashDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'DurableWorkflowQStashDispatchErrorV1';
  }
}

export function resolveDurableWorkflowQStashDispatchConfigurationV1(
  input: Readonly<{
    workerPath: string;
    environment?: DurableWorkflowQStashDispatchEnvironmentV1;
  }>,
): DurableWorkflowQStashDispatchConfigurationV1 {
  const workerPath = validWorkerPath(input.workerPath);
  if (!workerPath) return unconfigured('INVALID_WORKER_PATH');
  const environment = input.environment ?? processEnvironment();
  if (!clean(environment.QSTASH_TOKEN)) {
    return unconfigured('MISSING_QSTASH_TOKEN');
  }
  if (!isInternalQStashWorkerAuthConfigured(environment)) {
    return unconfigured('MISSING_QSTASH_SIGNING_KEYS');
  }
  if (environment.QSTASH_URL && !exactHttpsOrigin(environment.QSTASH_URL)) {
    return unconfigured('INVALID_QSTASH_URL');
  }
  const vercel = clean(environment.VERCEL_URL);
  const originCandidate = vercel
    ? (vercel.includes('://') ? vercel : `https://${vercel}`)
    : clean(environment.NEXT_PUBLIC_APP_URL);
  if (!originCandidate) return unconfigured('MISSING_PUBLIC_ORIGIN');
  const origin = exactHttpsOrigin(originCandidate);
  if (!origin) return unconfigured('INVALID_PUBLIC_ORIGIN');
  return Object.freeze({
    configured: true as const,
    reason: null,
    workerPath,
    workerUrl: `${origin}${workerPath}`,
  });
}

export async function publishAndRecordDurableWorkflowQStashJobV1(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'recordDispatch'>;
  configuration: Extract<DurableWorkflowQStashDispatchConfigurationV1,
    { configured: true }>;
  message: unknown;
  deliveryPolicy: DurableWorkflowQStashDeliveryPolicyV1;
  deduplicationId: string;
  environment?: DurableWorkflowQStashDispatchEnvironmentV1;
  publisher?: Readonly<DurableWorkflowQStashPublisherV1>;
  now?: Date;
}>): Promise<DurableWorkflowQStashPublishResultV1> {
  const environment = input.environment ?? processEnvironment();
  const configuration = assertConfiguration(input.configuration, environment);
  const jobId = identity(input.job?.jobId, 'JOB_ID');
  const existingMessageId = input.job.dispatchMessageId;
  if (existingMessageId !== null) {
    return Object.freeze({
      state: 'already_dispatched' as const,
      jobId,
      messageId: identity(existingMessageId, 'PERSISTED_MESSAGE_ID'),
    });
  }
  if (input.job.status !== 'queued') {
    return Object.freeze({
      state: 'not_dispatchable' as const,
      jobId,
      jobStatus: input.job.status,
    });
  }
  const deliveryPolicy = normalizeDeliveryPolicy(input.deliveryPolicy);
  const deduplicationId = identity(input.deduplicationId, 'DEDUPLICATION_ID');
  const publisher = input.publisher ?? createPublisher(environment);
  let published: Readonly<{ messageId?: string; deduplicated?: boolean }>;
  try {
    published = await publisher.publishJSON({
      url: configuration.workerUrl,
      body: input.message,
      retries: deliveryPolicy.retries,
      retryDelay: String(deliveryPolicy.retryDelayMs),
      timeout: deliveryPolicy.timeoutSeconds,
      deduplicationId,
    });
  } catch {
    return Object.freeze({
      state: 'dispatch_unconfirmed' as const,
      jobId,
      reason: 'QSTASH_PUBLISH_REJECTED' as const,
    });
  }
  if (!published || typeof published.messageId !== 'string'
    || !published.messageId.trim()) {
    return Object.freeze({
      state: 'dispatch_unconfirmed' as const,
      jobId,
      reason: 'QSTASH_MESSAGE_ID_MISSING' as const,
    });
  }
  let messageId: string;
  try {
    messageId = identity(published.messageId, 'MESSAGE_ID');
  } catch {
    return Object.freeze({
      state: 'dispatch_unconfirmed' as const,
      jobId,
      reason: 'QSTASH_MESSAGE_ID_INVALID' as const,
    });
  }
  try {
    await input.jobStore.recordDispatch({
      jobId,
      transport: 'qstash',
      messageId,
      ...(input.now ? { now: validDate(input.now, 'NOW') } : {}),
    });
  } catch {
    return Object.freeze({
      state: 'delivery_unknown' as const,
      jobId,
      messageId,
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED' as const,
    });
  }
  return Object.freeze({ state: 'dispatched' as const, jobId, messageId });
}

function assertConfiguration(
  value: Extract<DurableWorkflowQStashDispatchConfigurationV1, { configured: true }>,
  environment: DurableWorkflowQStashDispatchEnvironmentV1,
) {
  const workerPath = validWorkerPath(value?.workerPath);
  const workerUrl = typeof value?.workerUrl === 'string' ? value.workerUrl : '';
  const expected = workerPath
    ? resolveDurableWorkflowQStashDispatchConfigurationV1({ workerPath, environment })
    : null;
  if (!workerPath || !expected?.configured || workerUrl !== expected.workerUrl
    || value.configured !== true || value.reason !== null) {
    fail('CONFIGURATION_INVALID');
  }
  return Object.freeze({ configured: true as const, reason: null, workerPath, workerUrl });
}

function normalizeDeliveryPolicy(
  value: DurableWorkflowQStashDeliveryPolicyV1,
): DurableWorkflowQStashDeliveryPolicyV1 {
  const record = object(value, 'DELIVERY_POLICY');
  exactKeys(record, ['retries', 'retryDelayMs', 'timeoutSeconds'], 'DELIVERY_POLICY');
  return Object.freeze({
    retries: nonNegativeInteger(record.retries, 'DELIVERY_RETRIES'),
    retryDelayMs: positiveInteger(record.retryDelayMs, 'DELIVERY_RETRY_DELAY_MS'),
    timeoutSeconds: positiveInteger(record.timeoutSeconds, 'DELIVERY_TIMEOUT_SECONDS'),
  });
}

function createPublisher(
  environment: DurableWorkflowQStashDispatchEnvironmentV1,
): DurableWorkflowQStashPublisherV1 {
  const token = clean(environment.QSTASH_TOKEN);
  if (!token) fail('MISSING_QSTASH_TOKEN');
  return new Client({ token, baseUrl: clean(environment.QSTASH_URL) });
}

function processEnvironment(): DurableWorkflowQStashDispatchEnvironmentV1 {
  return {
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function unconfigured(
  reason: Extract<DurableWorkflowQStashDispatchConfigurationV1,
    { configured: false }>['reason'],
): DurableWorkflowQStashDispatchConfigurationV1 {
  return Object.freeze({ configured: false, reason, workerPath: null, workerUrl: null });
}

function validWorkerPath(value: unknown): string | null {
  if (typeof value !== 'string' || !WORKER_PATH.test(value)
    || value.includes('//') || value.includes('..')) return null;
  return value;
}

function exactHttpsOrigin(value: string): string | null {
  const parsed = exactHttpsUrl(value);
  return parsed && parsed.pathname === '/' ? parsed.origin : null;
}

function exactHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password
      || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length
    || actual.some((key, index) => key !== sorted[index])) fail(`${label}_FIELDS_INVALID`);
}

function identity(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(`${label}_INVALID`);
  return normalized;
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

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(`${label}_INVALID`);
  return value;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function fail(label: string): never {
  throw new DurableWorkflowQStashDispatchErrorV1(
    `DURABLE_WORKFLOW_QSTASH_DISPATCH_${label}`,
  );
}
