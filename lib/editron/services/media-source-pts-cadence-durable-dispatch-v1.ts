import { Client } from '@upstash/qstash';
import { z } from 'zod';

import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
  createOrGetMediaSourcePtsCadenceDurableJobV1,
} from './media-source-pts-cadence-durable-job-binding-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_PATH_V1 =
  '/api/internal/workers/media-source-pts-cadence' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_ROUTE_ID_V1 =
  'media-source-pts-cadence' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const WorkerMessageSchema = z.object({ jobId: ID }).strict();

export type MediaSourcePtsCadenceDurableWorkerMessageV1 = z.infer<
  typeof WorkerMessageSchema
>;

export function assertMediaSourcePtsCadenceDurableWorkerMessageV1(
  value: unknown,
): Readonly<MediaSourcePtsCadenceDurableWorkerMessageV1> {
  const parsed = WorkerMessageSchema.safeParse(value);
  if (!parsed.success) {
    throw new MediaSourcePtsCadenceDurableDispatchErrorV1(
      'MEDIA_SOURCE_PTS_CADENCE_WORKER_MESSAGE_INVALID',
    );
  }
  return Object.freeze(parsed.data);
}

export interface MediaSourcePtsCadenceDurableDispatchEnvironmentV1 {
  QSTASH_TOKEN?: string;
  QSTASH_URL?: string;
  QSTASH_CURRENT_SIGNING_KEY?: string;
  QSTASH_NEXT_SIGNING_KEY?: string;
  VERCEL_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export type MediaSourcePtsCadenceDurableDispatchConfigurationV1 = Readonly<
  | { configured: true; reason: null; workerUrl: string }
  | {
      configured: false;
      reason: 'MISSING_QSTASH_TOKEN' | 'MISSING_QSTASH_SIGNING_KEYS'
        | 'MISSING_PUBLIC_ORIGIN' | 'INVALID_PUBLIC_ORIGIN'
        | 'INVALID_QSTASH_URL';
      workerUrl: null;
    }
>;

export interface MediaSourcePtsCadenceQStashPublisherV1 {
  publishJSON(input: Readonly<{
    url: string;
    body: Readonly<MediaSourcePtsCadenceDurableWorkerMessageV1>;
    retries: number;
    deduplicationId: string;
    headers: Readonly<Record<string, string>>;
  }>): Promise<Readonly<{ messageId?: string }>>;
}

type DispatchStateV1 = Readonly<
  | { state: 'dispatched'; messageId: string }
  | {
      state: 'dispatch_unconfirmed';
      reason: 'QSTASH_PUBLISH_REJECTED' | 'QSTASH_MESSAGE_ID_MISSING';
    }
  | {
      state: 'delivery_unknown';
      messageId: string;
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED';
    }
>;

export type MediaSourcePtsCadenceDurableDispatchResultV1 = Readonly<
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

export type MediaSourcePtsCadenceDurableRecoveryResultV1 = Readonly<{
  scanned: number;
  eligible: number;
  skipped: number;
  results: readonly Readonly<{ jobId: string } & DispatchStateV1>[];
}>;

export class MediaSourcePtsCadenceDurableDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'MediaSourcePtsCadenceDurableDispatchErrorV1';
  }
}

export async function dispatchMediaSourcePtsCadenceDurableJobV1(input: Readonly<{
  actor: Readonly<{ tenantId: string; userId: string; orgId: string | null }>;
  request: Readonly<{
    assetId: string;
    sourceVersion: MediaSourceVersionV1;
    qualification: MediaSourceQualificationRecordV1;
    videoStreamIndex: number;
  }>;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet' | 'recordDispatch'>;
  env?: MediaSourcePtsCadenceDurableDispatchEnvironmentV1;
  publisher?: Readonly<MediaSourcePtsCadenceQStashPublisherV1>;
  now?: Date;
}>): Promise<MediaSourcePtsCadenceDurableDispatchResultV1> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);
  const bound = await createOrGetMediaSourcePtsCadenceDurableJobV1({
    jobStore: input.jobStore,
    request: {
      tenantId: identity(input.actor.tenantId, 'TENANT_ID'),
      userId: identity(input.actor.userId, 'USER_ID'),
      orgId: nullableIdentity(input.actor.orgId, 'ORG_ID'),
      ...input.request,
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
  const dispatched = await publishAndRecord({
    job: bound.job,
    configuration,
    publisher: input.publisher ?? createPublisher(env),
    jobStore: input.jobStore,
    deduplicationId: bound.job.jobId,
    now: input.now,
  });
  return { jobId: bound.job.jobId, created: bound.created, ...dispatched };
}

/** Republishes only stale exact PTS jobs already selected by the shared store. */
export async function recoverMediaSourcePtsCadenceDurableJobsV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'listRecoverable' | 'recordDispatch'>;
  staleBefore: Date;
  now?: Date;
  limit?: number;
  env?: MediaSourcePtsCadenceDurableDispatchEnvironmentV1;
  publisher?: Readonly<MediaSourcePtsCadenceQStashPublisherV1>;
}>): Promise<MediaSourcePtsCadenceDurableRecoveryResultV1> {
  const env = input.env ?? processEnvironment();
  const configuration = requireConfiguration(env);
  const now = input.now ?? new Date();
  const staleBefore = validDate(input.staleBefore, 'STALE_BEFORE');
  const candidates = await input.jobStore.listRecoverable({
    staleBefore, now, ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
  const eligible = candidates.filter((job) => (
    isPtsCadenceJob(job) && Date.parse(job.updatedAt) <= staleBefore.getTime()
  ));
  const publisher = input.publisher ?? createPublisher(env);
  const results: Array<Readonly<{ jobId: string } & DispatchStateV1>> = [];
  for (const job of eligible) {
    results.push({
      jobId: job.jobId,
      ...await publishAndRecord({
        job,
        configuration,
        publisher,
        jobStore: input.jobStore,
        deduplicationId: recoveryDeduplicationId(job),
        now,
      }),
    });
  }
  return Object.freeze({
    scanned: candidates.length,
    eligible: eligible.length,
    skipped: candidates.length - eligible.length,
    results: Object.freeze(results),
  });
}

export function resolveMediaSourcePtsCadenceDurableDispatchConfigurationV1(
  env: MediaSourcePtsCadenceDurableDispatchEnvironmentV1 = processEnvironment(),
): MediaSourcePtsCadenceDurableDispatchConfigurationV1 {
  if (!clean(env.QSTASH_TOKEN)) return unconfigured('MISSING_QSTASH_TOKEN');
  if (!clean(env.QSTASH_CURRENT_SIGNING_KEY)
    || !clean(env.QSTASH_NEXT_SIGNING_KEY)) {
    return unconfigured('MISSING_QSTASH_SIGNING_KEYS');
  }
  if (env.QSTASH_URL && !exactHttpsOrigin(env.QSTASH_URL)) {
    return unconfigured('INVALID_QSTASH_URL');
  }
  const vercel = clean(env.VERCEL_URL);
  const candidate = vercel
    ? (vercel.includes('://') ? vercel : `https://${vercel}`)
    : clean(env.NEXT_PUBLIC_APP_URL);
  if (!candidate) return unconfigured('MISSING_PUBLIC_ORIGIN');
  const origin = exactHttpsOrigin(candidate);
  if (!origin) return unconfigured('INVALID_PUBLIC_ORIGIN');
  return {
    configured: true,
    reason: null,
    workerUrl: `${origin}${MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_PATH_V1}`,
  };
}

async function publishAndRecord(input: Readonly<{
  job: DurableWorkflowJobSnapshotV1;
  configuration: Extract<MediaSourcePtsCadenceDurableDispatchConfigurationV1,
    { configured: true }>;
  publisher: Readonly<MediaSourcePtsCadenceQStashPublisherV1>;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'recordDispatch'>;
  deduplicationId: string;
  now?: Date;
}>): Promise<DispatchStateV1> {
  let published: Readonly<{ messageId?: string }>;
  try {
    published = await input.publisher.publishJSON({
      url: input.configuration.workerUrl,
      body: assertMediaSourcePtsCadenceDurableWorkerMessageV1({
        jobId: input.job.jobId,
      }),
      retries: 3,
      deduplicationId: input.deduplicationId,
      headers: { 'Upstash-Timeout': '300s' },
    });
  } catch {
    return { state: 'dispatch_unconfirmed', reason: 'QSTASH_PUBLISH_REJECTED' };
  }
  const messageId = optionalIdentity(published.messageId);
  if (!messageId) {
    return { state: 'dispatch_unconfirmed', reason: 'QSTASH_MESSAGE_ID_MISSING' };
  }
  try {
    await input.jobStore.recordDispatch({
      jobId: input.job.jobId,
      transport: 'qstash',
      messageId,
      ...(input.now ? { now: input.now } : {}),
    });
  } catch {
    return {
      state: 'delivery_unknown', messageId,
      reason: 'DISPATCH_RECEIPT_NOT_RECORDED',
    };
  }
  return { state: 'dispatched', messageId };
}

function isPtsCadenceJob(job: DurableWorkflowJobSnapshotV1): boolean {
  return job.operationOwner === 'MEDIA_ASSETS'
    && job.operationKind === 'media_source_pts_cadence_scan'
    && job.input.schemaId === MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1;
}

function recoveryDeduplicationId(job: DurableWorkflowJobSnapshotV1): string {
  return hashDurableWorkflowJobJsonV1({
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_RECOVERY_DISPATCH_V1',
    jobId: job.jobId,
    status: job.status,
    attemptCount: job.attemptCount,
    remainingAttempts: job.remainingAttempts,
    updatedAt: job.updatedAt,
    nextAttemptAt: job.nextAttemptAt,
    resumeSequence: job.resumeState?.sequence ?? null,
    dispatchMessageId: job.dispatchMessageId,
  });
}

function requireConfiguration(
  env: MediaSourcePtsCadenceDurableDispatchEnvironmentV1,
): Extract<MediaSourcePtsCadenceDurableDispatchConfigurationV1, { configured: true }> {
  const result = resolveMediaSourcePtsCadenceDurableDispatchConfigurationV1(env);
  if (!result.configured) {
    throw new MediaSourcePtsCadenceDurableDispatchErrorV1(
      `MEDIA_SOURCE_PTS_CADENCE_DISPATCH_${result.reason}`,
    );
  }
  return result;
}

function createPublisher(
  env: MediaSourcePtsCadenceDurableDispatchEnvironmentV1,
): MediaSourcePtsCadenceQStashPublisherV1 {
  return new Client({ token: clean(env.QSTASH_TOKEN)!, baseUrl: clean(env.QSTASH_URL) });
}

function processEnvironment(): MediaSourcePtsCadenceDurableDispatchEnvironmentV1 {
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
  reason: Exclude<MediaSourcePtsCadenceDurableDispatchConfigurationV1,
    { configured: true }>['reason'],
): MediaSourcePtsCadenceDurableDispatchConfigurationV1 {
  return { configured: false, reason, workerUrl: null };
}

function exactHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new MediaSourcePtsCadenceDurableDispatchErrorV1(
      `MEDIA_SOURCE_PTS_CADENCE_DISPATCH_${label}_INVALID`,
    );
  }
  return value;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function optionalIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return ID.parse(value); } catch { return null; }
}

function identity(value: string, label: string): string {
  const parsed = ID.safeParse(value);
  if (!parsed.success) {
    throw new MediaSourcePtsCadenceDurableDispatchErrorV1(
      `MEDIA_SOURCE_PTS_CADENCE_DISPATCH_${label}_INVALID`,
    );
  }
  return parsed.data;
}

function nullableIdentity(value: string | null, label: string): string | null {
  return value === null ? null : identity(value, label);
}
