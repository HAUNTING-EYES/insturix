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
  MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
  createOrGetMediaSourceAudioDurableJobV1,
} from './media-source-audio-durable-job-v1';
import type { MediaSourceAudioSampleEpochResourcePolicyV1 }
  from './media-source-audio-sample-epoch-map-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import type { MediaSourceVersionV1 }
  from './media-source-version-v1';

const MEDIA_SOURCE_AUDIO_DURABLE_WORKER_PATH_V1 =
  '/api/internal/workers/media-source-audio-materialization' as const;
export const MEDIA_SOURCE_AUDIO_DURABLE_WORKER_ROUTE_ID_V1 =
  'media-source-audio-materialization' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const WorkerMessageSchema = z.object({ jobId: ID }).strict();

export type MediaSourceAudioDurableWorkerMessageV1 = z.infer<
  typeof WorkerMessageSchema
>;

export function assertMediaSourceAudioDurableWorkerMessageV1(
  value: unknown,
): Readonly<MediaSourceAudioDurableWorkerMessageV1> {
  const parsed = WorkerMessageSchema.safeParse(value);
  if (!parsed.success) {
    throw new MediaSourceAudioDurableDispatchErrorV1(
      'MEDIA_SOURCE_AUDIO_WORKER_MESSAGE_INVALID',
    );
  }
  return Object.freeze(parsed.data);
}

export type MediaSourceAudioDurableDispatchEnvironmentV1 =
  DurableWorkflowQStashDispatchEnvironmentV1;
export type MediaSourceAudioQStashPublisherV1 =
  DurableWorkflowQStashPublisherV1;

export type MediaSourceAudioDurableDispatchConfigurationV1 = Readonly<
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

type MediaSourceAudioDurableDispatchResultV1 = Readonly<
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

type MediaSourceAudioDurableRecoveryResultV1 = Readonly<{
  scanned: number;
  eligible: number;
  skipped: number;
  results: readonly Readonly<{ jobId: string } & DispatchStateV1>[];
}>;

export class MediaSourceAudioDurableDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MediaSourceAudioDurableDispatchErrorV1';
  }
}

export async function dispatchMediaSourceAudioDurableJobV1(input: Readonly<{
  actor: Readonly<{ tenantId: string; userId: string; orgId: string | null }>;
  request: Readonly<{
    assetId: string;
    sourceVersion: MediaSourceVersionV1;
    qualification: MediaSourceQualificationRecordV1;
    resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
  }>;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet' | 'recordDispatch'>;
  deliveryPolicy: DurableWorkflowQStashDeliveryPolicyV1;
  env?: MediaSourceAudioDurableDispatchEnvironmentV1;
  publisher?: Readonly<MediaSourceAudioQStashPublisherV1>;
  now?: Date;
}>): Promise<MediaSourceAudioDurableDispatchResultV1> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);
  const bound = await createOrGetMediaSourceAudioDurableJobV1({
    jobStore: input.jobStore,
    request: {
      tenantId: identity(input.actor.tenantId, 'TENANT_ID'),
      userId: identity(input.actor.userId, 'USER_ID'),
      orgId: nullableIdentity(input.actor.orgId, 'ORG_ID'),
      ...input.request,
    },
    ...(input.now ? { now: input.now } : {}),
  });
  const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
    job: bound.job,
    configuration,
    jobStore: input.jobStore,
    message: assertMediaSourceAudioDurableWorkerMessageV1({
      jobId: bound.job.jobId,
    }),
    deliveryPolicy: input.deliveryPolicy,
    dispatchIntent: {
      kind: 'INITIAL_QUEUED',
      deduplicationId: bound.job.jobId,
    },
    environment: env,
    ...(input.publisher ? { publisher: input.publisher } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  return Object.freeze({ ...dispatched, created: bound.created });
}

export async function recoverMediaSourceAudioDurableJobsV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1,
    'listRecoverable' | 'recordDispatch'>;
  staleBefore: Date;
  deliveryPolicy: DurableWorkflowQStashDeliveryPolicyV1;
  now?: Date;
  limit?: number;
  env?: MediaSourceAudioDurableDispatchEnvironmentV1;
  publisher?: Readonly<MediaSourceAudioQStashPublisherV1>;
}>): Promise<MediaSourceAudioDurableRecoveryResultV1> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);
  const now = input.now ?? new Date();
  const staleBefore = validDate(input.staleBefore, 'STALE_BEFORE');
  const candidates = await input.jobStore.listRecoverable({
    staleBefore,
    now,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
  const eligible = candidates.filter((job) => (
    isAudioMaterializationJob(job)
      && Date.parse(job.updatedAt) <= staleBefore.getTime()
  ));
  const results: Array<Readonly<{ jobId: string } & DispatchStateV1>> = [];
  for (const job of eligible) {
    const dispatched = await publishAndRecordDurableWorkflowQStashJobV1({
      job,
      configuration,
      jobStore: input.jobStore,
      message: assertMediaSourceAudioDurableWorkerMessageV1({ jobId: job.jobId }),
      deliveryPolicy: input.deliveryPolicy,
      dispatchIntent: {
        kind: 'RECOVERY_SELECTED',
        stateBindingSha256:
          createDurableWorkflowQStashRecoveryStateBindingV1(job),
      },
      environment: env,
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

export function resolveMediaSourceAudioDurableDispatchConfigurationV1(
  env: MediaSourceAudioDurableDispatchEnvironmentV1 = processEnvironment(),
): MediaSourceAudioDurableDispatchConfigurationV1 {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: MEDIA_SOURCE_AUDIO_DURABLE_WORKER_PATH_V1,
    environment: env,
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

function isAudioMaterializationJob(job: DurableWorkflowJobSnapshotV1): boolean {
  return job.operationOwner === 'MEDIA_ASSETS'
    && job.operationKind === 'media_source_audio_materialization'
    && job.input.schemaId === MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1
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
  throw new MediaSourceAudioDurableDispatchErrorV1(
    'MEDIA_SOURCE_AUDIO_RECOVERY_DISPATCH_STATE_INVALID',
  );
}

function requireConfiguration(
  env: MediaSourceAudioDurableDispatchEnvironmentV1,
): Extract<DurableWorkflowQStashDispatchConfigurationV1, { configured: true }> {
  const result = resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: MEDIA_SOURCE_AUDIO_DURABLE_WORKER_PATH_V1,
    environment: env,
  });
  if (!result.configured) {
    throw new MediaSourceAudioDurableDispatchErrorV1(
      `MEDIA_SOURCE_AUDIO_DISPATCH_${result.reason}`,
    );
  }
  return result;
}

function processEnvironment(): MediaSourceAudioDurableDispatchEnvironmentV1 {
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
    throw new MediaSourceAudioDurableDispatchErrorV1(
      `MEDIA_SOURCE_AUDIO_DISPATCH_${label}_INVALID`,
    );
  }
  return value;
}

function identity(value: string, label: string): string {
  const parsed = ID.safeParse(value);
  if (!parsed.success) {
    throw new MediaSourceAudioDurableDispatchErrorV1(
      `MEDIA_SOURCE_AUDIO_DISPATCH_${label}_INVALID`,
    );
  }
  return parsed.data;
}

function nullableIdentity(value: string | null, label: string): string | null {
  return value === null ? null : identity(value, label);
}
