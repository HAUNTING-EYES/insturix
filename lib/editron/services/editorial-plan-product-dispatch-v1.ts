import { Client } from '@upstash/qstash';
import { z } from 'zod';

import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  createOrGetEditorialPlanDurableJobV1,
  type EditorialPlanDurableJobRequestV1,
} from './editorial-plan-durable-job-binding-v1';
import type { EditorialPlanStoreV1 } from './editorial-plan-store-v1';

export const EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_VERSION_V1 =
  'EDITRON_EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_V1_1' as const;
export const EDITORIAL_PLAN_PRODUCT_WORKER_PATH_V1 =
  '/api/internal/workers/editorial-plan' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const WorkerMessageSchema = z.object({
  version: z.literal(EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_VERSION_V1),
  jobId: ID,
}).strict();

export type EditorialPlanProductWorkerMessageV1 = z.infer<typeof WorkerMessageSchema>;

export function assertEditorialPlanProductWorkerMessageV1(
  value: unknown,
): Readonly<EditorialPlanProductWorkerMessageV1> {
  const result = WorkerMessageSchema.safeParse(value);
  if (!result.success) {
    throw new EditorialPlanProductDispatchErrorV1(
      'EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_INVALID',
    );
  }
  return Object.freeze(result.data);
}

export interface EditorialPlanProductDispatchEnvironmentV1 {
  QSTASH_TOKEN?: string;
  QSTASH_URL?: string;
  QSTASH_CURRENT_SIGNING_KEY?: string;
  QSTASH_NEXT_SIGNING_KEY?: string;
  VERCEL_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export type EditorialPlanProductDispatchConfigurationV1 = Readonly<
  | { configured: true; reason: null; workerUrl: string }
  | {
      configured: false;
      reason: 'MISSING_QSTASH_TOKEN' | 'MISSING_QSTASH_SIGNING_KEYS'
        | 'MISSING_PUBLIC_ORIGIN' | 'INVALID_PUBLIC_ORIGIN' | 'INVALID_QSTASH_URL';
      workerUrl: null;
    }
>;

export interface EditorialPlanQStashPublisherV1 {
  publishJSON(input: Readonly<{
    url: string;
    body: Readonly<EditorialPlanProductWorkerMessageV1>;
    retries: number;
    deduplicationId: string;
    headers: Readonly<Record<string, string>>;
  }>): Promise<Readonly<{ messageId?: string }>>;
}

export type EditorialPlanProductDispatchResultV1 = Readonly<
  | {
      state: 'dispatched' | 'already_dispatched';
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
  | {
      state: 'dispatch_unconfirmed';
      jobId: string;
      created: boolean;
      reason: 'QSTASH_PUBLISH_REJECTED' | 'QSTASH_MESSAGE_ID_MISSING';
    }
  | {
      state: 'delivery_unknown';
      jobId: string;
      created: boolean;
      messageId: string;
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

export class EditorialPlanProductDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'EditorialPlanProductDispatchErrorV1';
  }
}

type ProductDispatchRequest = Omit<
  EditorialPlanDurableJobRequestV1,
  'tenantId' | 'userId'
>;

/**
 * Product ingress for an already accepted PlanService node. Authentication is
 * supplied by the caller; the queue receives only the durable job identity and
 * the signed worker re-resolves every authority binding from canonical stores.
 */
export async function dispatchEditorialPlanProductJobV1(input: Readonly<{
  actor: Readonly<{ tenantId: string; userId: string }>;
  request: ProductDispatchRequest;
  planStore: Pick<EditorialPlanStoreV1,
    'getRevisionAuthorized' | 'getLatestAuthorized' | 'getExecutionDefinitionAuthorized'>;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet' | 'recordDispatch'>;
  env?: EditorialPlanProductDispatchEnvironmentV1;
  publisher?: Readonly<EditorialPlanQStashPublisherV1>;
  now?: Date;
}>): Promise<EditorialPlanProductDispatchResultV1> {
  const env = input.env ?? processEnvironment();
  const config = resolveEditorialPlanProductDispatchConfigurationV1(env);
  if (!config.configured) {
    throw new EditorialPlanProductDispatchErrorV1(
      `EDITORIAL_PLAN_PRODUCT_DISPATCH_${config.reason}`,
    );
  }

  const bound = await createOrGetEditorialPlanDurableJobV1({
    planStore: input.planStore,
    jobStore: input.jobStore,
    request: {
      ...input.request,
      tenantId: requireIdentity(input.actor.tenantId, 'TENANT_ID'),
      userId: requireIdentity(input.actor.userId, 'USER_ID'),
    },
    ...(input.now ? { now: input.now } : {}),
  });
  const existingMessageId = optionalIdentity(bound.job.dispatchMessageId);
  if (existingMessageId) {
    return {
      state: 'already_dispatched', jobId: bound.job.jobId,
      created: bound.created, messageId: existingMessageId,
    };
  }
  if (bound.job.status !== 'queued') {
    return {
      state: 'not_dispatchable', jobId: bound.job.jobId,
      created: bound.created, jobStatus: bound.job.status,
    };
  }

  const publisher = input.publisher ?? createPublisher(env);
  const message = assertEditorialPlanProductWorkerMessageV1({
    version: EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_VERSION_V1,
    jobId: bound.job.jobId,
  });
  let published: Readonly<{ messageId?: string }>;
  try {
    published = await publisher.publishJSON({
      url: config.workerUrl,
      body: message,
      retries: 3,
      deduplicationId: bound.job.jobId,
      headers: { 'Upstash-Timeout': '300s' },
    });
  } catch {
    return {
      state: 'dispatch_unconfirmed', jobId: bound.job.jobId,
      created: bound.created, reason: 'QSTASH_PUBLISH_REJECTED',
    };
  }
  const messageId = optionalIdentity(published.messageId);
  if (!messageId) {
    return {
      state: 'dispatch_unconfirmed', jobId: bound.job.jobId,
      created: bound.created, reason: 'QSTASH_MESSAGE_ID_MISSING',
    };
  }
  try {
    await input.jobStore.recordDispatch({
      jobId: bound.job.jobId,
      transport: 'qstash',
      messageId,
      ...(input.now ? { now: input.now } : {}),
    });
  } catch {
    // Delivery may already be in progress; never misreport this as a failed send.
    return {
      state: 'delivery_unknown', jobId: bound.job.jobId,
      created: bound.created, messageId,
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
    };
  }
  return {
    state: 'dispatched', jobId: bound.job.jobId,
    created: bound.created, messageId,
  };
}

export function resolveEditorialPlanProductDispatchConfigurationV1(
  env: EditorialPlanProductDispatchEnvironmentV1 = processEnvironment(),
): EditorialPlanProductDispatchConfigurationV1 {
  if (!clean(env.QSTASH_TOKEN)) return unconfigured('MISSING_QSTASH_TOKEN');
  if (!clean(env.QSTASH_CURRENT_SIGNING_KEY)
    || !clean(env.QSTASH_NEXT_SIGNING_KEY)) {
    return unconfigured('MISSING_QSTASH_SIGNING_KEYS');
  }
  if (env.QSTASH_URL && !httpsOrigin(env.QSTASH_URL)) {
    return unconfigured('INVALID_QSTASH_URL');
  }
  const candidate = clean(env.VERCEL_URL)
    ? `https://${clean(env.VERCEL_URL)!.replace(/^https?:\/\//, '')}`
    : clean(env.NEXT_PUBLIC_APP_URL);
  if (!candidate) return unconfigured('MISSING_PUBLIC_ORIGIN');
  const origin = httpsOrigin(candidate);
  if (!origin) return unconfigured('INVALID_PUBLIC_ORIGIN');
  return {
    configured: true, reason: null,
    workerUrl: `${origin}${EDITORIAL_PLAN_PRODUCT_WORKER_PATH_V1}`,
  };
}

function createPublisher(
  env: EditorialPlanProductDispatchEnvironmentV1,
): EditorialPlanQStashPublisherV1 {
  return new Client({
    token: clean(env.QSTASH_TOKEN)!,
    baseUrl: clean(env.QSTASH_URL),
  });
}

function processEnvironment(): EditorialPlanProductDispatchEnvironmentV1 {
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
  reason: Exclude<EditorialPlanProductDispatchConfigurationV1,
    { configured: true }>['reason'],
): EditorialPlanProductDispatchConfigurationV1 {
  return { configured: false, reason, workerUrl: null };
}

function httpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password
      || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function optionalIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return requireIdentity(value, 'MESSAGE_ID');
  } catch {
    return null;
  }
}

function requireIdentity(value: string, label: string): string {
  const result = ID.safeParse(value);
  if (!result.success) {
    throw new EditorialPlanProductDispatchErrorV1(
      `EDITORIAL_PLAN_PRODUCT_DISPATCH_${label}_INVALID`,
    );
  }
  return result.data;
}
