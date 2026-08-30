import { Client } from '@upstash/qstash';
import { z } from 'zod';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  resolveDurableWorkflowQStashDispatchConfigurationV1,
  type DurableWorkflowQStashDeliveryPolicyV1,
  type DurableWorkflowQStashDispatchEnvironmentV1,
  type DurableWorkflowQStashPublisherV1,
} from './durable-workflow-qstash-dispatch-v1';

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_PATH_V1 =
  '/api/internal/workers/media-source-audio-evidence-backfill' as const;
export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_ROUTE_ID_V1 =
  'media-source-audio-evidence-backfill' as const;
export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1 =
  Object.freeze({
    retries: 3,
    retryDelayMs: 30_000,
    timeoutSeconds: 300,
  } satisfies DurableWorkflowQStashDeliveryPolicyV1);

const ID = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const BATCH_LIMIT = z.number().int().min(1).max(100);
const MessageSchema = z.discriminatedUnion('kind', [
  z.object({
    schemaVersion: z.literal(1),
    kind: z.literal('INITIALIZE'),
    migrationRunId: ID,
    policyVersion: ID,
    batchLimit: BATCH_LIMIT,
  }).strict(),
  z.object({
    schemaVersion: z.literal(1),
    kind: z.literal('RUN_NEXT_BATCH'),
    migrationRunId: ID,
    expectedRecordSha256: SHA256,
    batchLimit: BATCH_LIMIT,
  }).strict(),
]);

export type MediaSourceAudioEvidenceBackfillWorkerMessageV1 = z.infer<
  typeof MessageSchema
>;
export type MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1 =
  DurableWorkflowQStashDispatchEnvironmentV1;
export type MediaSourceAudioEvidenceBackfillQStashPublisherV1 =
  DurableWorkflowQStashPublisherV1;

export type MediaSourceAudioEvidenceBackfillDispatchResultV1 = Readonly<
  | {
      disposition: 'DISPATCHED' | 'DEDUPLICATED';
      messageId: string;
      deduplicationId: string;
    }
  | {
      disposition: 'UNCONFIRMED';
      reason: 'QSTASH_PUBLISH_REJECTED' | 'QSTASH_MESSAGE_ID_INVALID';
      messageId: null;
      deduplicationId: string;
    }
>;

export class MediaSourceAudioEvidenceBackfillDispatchErrorV1 extends Error {
  constructor(public readonly code: string) {
    super('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DISPATCH_' + code);
    this.name = 'MediaSourceAudioEvidenceBackfillDispatchErrorV1';
  }
}

export function assertMediaSourceAudioEvidenceBackfillWorkerMessageV1(
  value: unknown,
): Readonly<MediaSourceAudioEvidenceBackfillWorkerMessageV1> {
  const parsed = MessageSchema.safeParse(value);
  if (!parsed.success) fail('MESSAGE_INVALID');
  return Object.freeze(parsed.data);
}

export function resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1(
  environment: MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1
    = processEnvironment(),
) {
  return resolveDurableWorkflowQStashDispatchConfigurationV1({
    workerPath: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_WORKER_PATH_V1,
    environment,
  });
}

export async function dispatchMediaSourceAudioEvidenceBackfillMessageV1(
  input: Readonly<{
    message: unknown;
    deliveryPolicy?: DurableWorkflowQStashDeliveryPolicyV1;
    environment?: MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1;
    publisher?: Readonly<MediaSourceAudioEvidenceBackfillQStashPublisherV1>;
  }>,
): Promise<MediaSourceAudioEvidenceBackfillDispatchResultV1> {
  const message = assertMediaSourceAudioEvidenceBackfillWorkerMessageV1(
    input.message,
  );
  const environment = input.environment ?? processEnvironment();
  const configuration = resolveMediaSourceAudioEvidenceBackfillDispatchConfigurationV1(
    environment,
  );
  if (!configuration.configured) fail(configuration.reason);
  const deliveryPolicy = normalizeDeliveryPolicy(
    input.deliveryPolicy ?? MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DELIVERY_POLICY_V1,
  );
  const deduplicationId = hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_DISPATCH_BINDING_V1',
    message,
  });
  let published: Readonly<{ messageId?: string; deduplicated?: boolean }>;
  try {
    published = await (input.publisher ?? createPublisher(environment)).publishJSON({
      url: configuration.workerUrl,
      body: message,
      retries: deliveryPolicy.retries,
      retryDelay: `${deliveryPolicy.retryDelayMs}ms`,
      timeout: deliveryPolicy.timeoutSeconds,
      deduplicationId,
    });
  } catch {
    return Object.freeze({
      disposition: 'UNCONFIRMED' as const,
      reason: 'QSTASH_PUBLISH_REJECTED' as const,
      messageId: null,
      deduplicationId,
    });
  }
  const messageId = qstashMessageId(published.messageId);
  if (messageId === null) {
    return Object.freeze({
      disposition: 'UNCONFIRMED' as const,
      reason: 'QSTASH_MESSAGE_ID_INVALID' as const,
      messageId: null,
      deduplicationId,
    });
  }
  return Object.freeze({
    disposition: published.deduplicated ? 'DEDUPLICATED' as const : 'DISPATCHED' as const,
    messageId,
    deduplicationId,
  });
}

function normalizeDeliveryPolicy(
  value: DurableWorkflowQStashDeliveryPolicyV1,
): DurableWorkflowQStashDeliveryPolicyV1 {
  if (!value || typeof value !== 'object'
    || Object.keys(value).sort().join(',')
      !== 'retries,retryDelayMs,timeoutSeconds'
    || !Number.isSafeInteger(value.retries) || value.retries < 0
    || !Number.isSafeInteger(value.retryDelayMs) || value.retryDelayMs < 1
    || !Number.isSafeInteger(value.timeoutSeconds) || value.timeoutSeconds < 1) {
    fail('DELIVERY_POLICY_INVALID');
  }
  return Object.freeze({ ...value });
}

function createPublisher(
  environment: MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1,
): MediaSourceAudioEvidenceBackfillQStashPublisherV1 {
  const token = clean(environment.QSTASH_TOKEN);
  if (!token) fail('MISSING_QSTASH_TOKEN');
  return new Client({ token, baseUrl: clean(environment.QSTASH_URL) });
}

function qstashMessageId(value: unknown): string | null {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) return null;
  return value;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function processEnvironment(): MediaSourceAudioEvidenceBackfillDispatchEnvironmentV1 {
  return {
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function fail(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillDispatchErrorV1(code);
}
