import { z } from 'zod';

import type { DurableWorkflowJobSnapshotV1 }
  from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  createDurableWorkflowQStashRecoveryStateBindingV1,
  publishAndRecordDurableWorkflowQStashJobV1,
  resolveDurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDeliveryPolicyV1,
  type DurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDispatchEnvironmentV1,
  type DurableWorkflowQStashPublisherV1,
} from './durable-workflow-qstash-dispatch-v1';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_KIND_V1,
  MEDIA_PROXY_MASTER_TRANSCODE_OPERATION_OWNER_V1,
  createOrGetMediaProxyMasterTranscodeDurableJobV1,
} from './media-proxy-master-transcode-durable-job-v1';

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
  results: readonly Readonly<{ jobId: string } & DispatchStateV1>[];
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
    deliveryPolicy: DurableWorkflowQStashDeliveryPolicyV1;
    env?: MediaProxyMasterTranscodeDurableDispatchEnvironmentV1;
    publisher?: Readonly<MediaProxyMasterTranscodeQStashPublisherV1>;
    now?: Date;
  }>,
): Promise<MediaProxyMasterTranscodeDurableDispatchResultV1> {
  const environment = input.env ?? processEnvironment();
  const configuration = requireConfiguration(environment);
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
    deliveryPolicy: input.deliveryPolicy,
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
    deliveryPolicy: DurableWorkflowQStashDeliveryPolicyV1;
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
  const results: Array<Readonly<{ jobId: string } & DispatchStateV1>> = [];
  for (const job of eligible) {
    const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
      job,
      configuration,
      jobStore: input.jobStore,
      message: assertMediaProxyMasterTranscodeDurableWorkerMessageV1({
        jobId: job.jobId,
      }),
      deliveryPolicy: input.deliveryPolicy,
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
