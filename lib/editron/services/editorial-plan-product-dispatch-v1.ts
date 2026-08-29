import { z } from 'zod';

import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  publishAndRecordDurableWorkflowQStashJobV1,
  resolveDurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDeliveryPolicyV1,
  type DurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDispatchEnvironmentV1,
  type DurableWorkflowQStashPublisherV1,
} from './durable-workflow-qstash-dispatch-v1';
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

export type EditorialPlanProductDispatchEnvironmentV1 =
  DurableWorkflowQStashDispatchEnvironmentV1;

export type EditorialPlanProductDispatchConfigurationV1 = Readonly<
  | { configured: true; reason: null; workerUrl: string }
  | {
      configured: false;
      reason: Extract<DurableWorkflowQStashDispatchConfigurationV1,
        { configured: false }>['reason'];
      workerUrl: null;
    }
>;

export type EditorialPlanQStashPublisherV1 = DurableWorkflowQStashPublisherV1;

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
      reason: 'QSTASH_PUBLISH_REJECTED' | 'QSTASH_MESSAGE_ID_MISSING'
        | 'QSTASH_MESSAGE_ID_INVALID';
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
  deliveryPolicy: DurableWorkflowQStashDeliveryPolicyV1;
  env?: EditorialPlanProductDispatchEnvironmentV1;
  publisher?: Readonly<EditorialPlanQStashPublisherV1>;
  now?: Date;
}>): Promise<EditorialPlanProductDispatchResultV1> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);

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
  const message = assertEditorialPlanProductWorkerMessageV1({
    version: EDITORIAL_PLAN_PRODUCT_WORKER_MESSAGE_VERSION_V1,
    jobId: bound.job.jobId,
  });
  const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
    job: bound.job,
    jobStore: input.jobStore,
    configuration,
    message,
    deliveryPolicy: input.deliveryPolicy,
    dispatchIntent: {
      kind: 'INITIAL_QUEUED', deduplicationId: bound.job.jobId,
    },
    environment: env,
    ...(input.publisher ? { publisher: input.publisher } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  return Object.freeze({ ...dispatched, created: bound.created });
}

export function resolveEditorialPlanProductDispatchConfigurationV1(
  env: EditorialPlanProductDispatchEnvironmentV1 = processEnvironment(),
): EditorialPlanProductDispatchConfigurationV1 {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: EDITORIAL_PLAN_PRODUCT_WORKER_PATH_V1,
    environment: env,
  });
  return result.configured
    ? Object.freeze({ configured: true, reason: null, workerUrl: result.workerUrl })
    : Object.freeze({ configured: false, reason: result.reason, workerUrl: null });
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

function requireConfiguration(
  env: EditorialPlanProductDispatchEnvironmentV1,
): Extract<DurableWorkflowQStashDispatchConfigurationV1, { configured: true }> {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: EDITORIAL_PLAN_PRODUCT_WORKER_PATH_V1,
    environment: env,
  });
  if (!result.configured) {
    throw new EditorialPlanProductDispatchErrorV1(
      `EDITORIAL_PLAN_PRODUCT_DISPATCH_${result.reason}`,
    );
  }
  return result;
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
