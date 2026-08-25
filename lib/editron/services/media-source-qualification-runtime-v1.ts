import { Client } from '@upstash/qstash';

import { isInternalQStashDispatchConfigured } from '../security/internal-worker-auth';
import {
  claimMediaSourceQualificationV1,
  completeMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from './media-source-qualification-v1';
import {
  probeMediaSourceV1,
  type MediaSourceProbeResultV1,
  unverifiableMediaSourceProbeResultV1,
} from './media-source-probe-v1';

export const MEDIA_SOURCE_QUALIFICATION_WORKER_ROUTE_ID_V1 =
  'media-source-qualification' as const;
export const MEDIA_SOURCE_QUALIFICATION_WORKER_PATH_V1 =
  '/api/internal/workers/media-source-qualification' as const;

export type MediaSourceQualificationWorkerMessageV1 = {
  assetId: string;
  userId: string;
  sourceBindingSha256: string;
};

export type MediaSourceQualificationDispatchResultV1 = {
  dispatched: boolean;
  messageId?: string;
  error?: 'INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED' | 'MEDIA_SOURCE_PROBE_WORKER_URL_NOT_CONFIGURED' | 'MEDIA_SOURCE_PROBE_DISPATCH_FAILED';
};

export type MediaSourceQualificationWorkerResultV1 =
  | { disposition: 'COMPLETED'; status: 'MEASURED_TECHNICAL' | 'UNVERIFIABLE' }
  | { disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' | 'QUALIFICATION_RECORD_INVALID' | 'SOURCE_BINDING_MISMATCH' | 'ACTIVE_CLAIM' | 'TERMINAL' }
  | { disposition: 'RACE_LOST' };

export type MediaSourceQualificationWorkerPortsV1 = {
  load(assetId: string, userId: string): Promise<{ sourceQualificationV1?: unknown } | null>;
  replace(input: {
    assetId: string;
    userId: string;
    expected: MediaSourceQualificationRecordV1;
    next: MediaSourceQualificationRecordV1;
  }): Promise<boolean>;
  resolveVerifiedSourceUrl(record: MediaSourceQualificationRecordV1): Promise<
    | { disposition: 'AVAILABLE'; sourceUrl: string }
    | { disposition: 'UNVERIFIABLE'; result: MediaSourceProbeResultV1 }
  >;
  probe(sourceUrl: string): Promise<MediaSourceProbeResultV1>;
  now(): Date;
};

export function assertMediaSourceQualificationWorkerMessageV1(
  value: unknown,
): MediaSourceQualificationWorkerMessageV1 {
  const record = asRecord(value);
  const assetId = record && cleanText(record.assetId, 200);
  const userId = record && cleanText(record.userId, 256);
  const sourceBindingSha256 = record && cleanText(record.sourceBindingSha256, 64);
  if (!assetId || !/^[A-Za-z0-9_-]{3,200}$/.test(assetId)) {
    throw new Error('MEDIA_SOURCE_QUALIFICATION_ASSET_ID_INVALID');
  }
  if (!userId || !sourceBindingSha256 || !/^[a-f0-9]{64}$/.test(sourceBindingSha256)) {
    throw new Error('MEDIA_SOURCE_QUALIFICATION_MESSAGE_INVALID');
  }
  return { assetId, userId, sourceBindingSha256 };
}

/**
 * Queues only a signed worker. There is deliberately no direct fetch fallback:
 * an unsigned source observation is not a production substitute for this job.
 */
export async function dispatchMediaSourceQualificationV1(
  message: MediaSourceQualificationWorkerMessageV1,
): Promise<MediaSourceQualificationDispatchResultV1> {
  const url = getMediaSourceQualificationWorkerUrlV1();
  if (!isInternalQStashDispatchConfigured()) {
    return { dispatched: false, error: 'INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED' };
  }
  if (!url) return { dispatched: false, error: 'MEDIA_SOURCE_PROBE_WORKER_URL_NOT_CONFIGURED' };

  try {
    const qstash = new Client({
      token: process.env.QSTASH_TOKEN!.trim(),
      baseUrl: process.env.QSTASH_URL || undefined,
    });
    const published = await qstash.publishJSON({ url, body: message, retries: 2 });
    const messageId = typeof (published as { messageId?: unknown }).messageId === 'string'
      ? (published as { messageId: string }).messageId
      : undefined;
    return { dispatched: true, ...(messageId ? { messageId } : {}) };
  } catch {
    return { dispatched: false, error: 'MEDIA_SOURCE_PROBE_DISPATCH_FAILED' };
  }
}

/** Runs one delivery against the existing MEDIA_ASSETS record, never a second registry. */
export async function runMediaSourceQualificationWorkerV1(
  message: MediaSourceQualificationWorkerMessageV1,
): Promise<MediaSourceQualificationWorkerResultV1> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const db = await getDatabase();
  return executeMediaSourceQualificationWorkerV1(message, {
    load: async (assetId, userId) => {
      const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        { projection: { sourceQualificationV1: 1 } },
      );
      return asset
        ? { sourceQualificationV1: (asset as { sourceQualificationV1?: unknown }).sourceQualificationV1 }
        : null;
    },
    replace: async ({ assetId, userId, expected, next }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        qualificationCompareAndSetFilter(assetId, userId, expected),
        { $set: { sourceQualificationV1: next } },
      );
      return result.matchedCount === 1;
    },
    resolveVerifiedSourceUrl: resolveVerifiedSourceUrlV1,
    probe: probeMediaSourceV1,
    now: () => new Date(),
  });
}

export async function executeMediaSourceQualificationWorkerV1(
  message: MediaSourceQualificationWorkerMessageV1,
  ports: MediaSourceQualificationWorkerPortsV1,
): Promise<MediaSourceQualificationWorkerResultV1> {
  const asset = await ports.load(message.assetId, message.userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };

  const record = asQualificationRecord(asset.sourceQualificationV1);
  if (!record) return { disposition: 'SKIPPED', reason: 'QUALIFICATION_RECORD_INVALID' };

  const claim = claimMediaSourceQualificationV1({
    record,
    sourceBindingSha256: message.sourceBindingSha256,
    now: ports.now(),
  });
  if (claim.disposition !== 'CLAIMED') {
    return { disposition: 'SKIPPED', reason: claim.reason };
  }
  if (!await ports.replace({
    assetId: message.assetId,
    userId: message.userId,
    expected: record,
    next: claim.record,
  })) {
    return { disposition: 'RACE_LOST' };
  }

  let probeResult: MediaSourceProbeResultV1;
  try {
    const source = await ports.resolveVerifiedSourceUrl(claim.record);
    probeResult = source.disposition === 'AVAILABLE'
      ? await ports.probe(source.sourceUrl)
      : source.result;
  } catch {
    probeResult = unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_SIGNED_URL_UNAVAILABLE');
  }

  const completion = completeMediaSourceQualificationV1({
    record: claim.record,
    sourceBindingSha256: message.sourceBindingSha256,
    result: probeResult,
    now: ports.now(),
  });
  if (completion.disposition !== 'COMPLETED') return { disposition: 'RACE_LOST' };
  if (!await ports.replace({
    assetId: message.assetId,
    userId: message.userId,
    expected: claim.record,
    next: completion.record,
  })) {
    return { disposition: 'RACE_LOST' };
  }
  if (completion.record.status !== 'MEASURED_TECHNICAL' && completion.record.status !== 'UNVERIFIABLE') {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'COMPLETED', status: completion.record.status };
}

export function getMediaSourceQualificationWorkerUrlV1(): string | null {
  const candidate = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL;
  if (!candidate) return null;
  try {
    const origin = new URL(candidate);
    return origin.protocol === 'https:' ? `${origin.origin}${MEDIA_SOURCE_QUALIFICATION_WORKER_PATH_V1}` : null;
  } catch {
    return null;
  }
}

function qualificationCompareAndSetFilter(
  assetId: string,
  userId: string,
  expected: MediaSourceQualificationRecordV1,
): Record<string, unknown> {
  return {
    assetId,
    userId,
    'sourceQualificationV1.sourceBindingSha256': expected.sourceBindingSha256,
    'sourceQualificationV1.status': expected.status,
    'sourceQualificationV1.attemptCount': expected.attemptCount,
    'sourceQualificationV1.startedAt': expected.startedAt,
    'sourceQualificationV1.completedAt': expected.completedAt,
  };
}

async function resolveVerifiedSourceUrlV1(
  record: MediaSourceQualificationRecordV1,
): Promise<{ disposition: 'AVAILABLE'; sourceUrl: string } | { disposition: 'UNVERIFIABLE'; result: MediaSourceProbeResultV1 }> {
  try {
    if (record.locator.provider === 'R2') {
      const { getR2PresignedReadUrl, r2FileExists } = await import('./r2-service');
      if (!await r2FileExists(record.locator.objectKey)) return unavailableStorage();
      return { disposition: 'AVAILABLE', sourceUrl: await getR2PresignedReadUrl(record.locator.objectKey, 900) };
    }
    const { fileExists, refreshSignedUrl } = await import('./gcs-service');
    if (!await fileExists(record.locator.objectKey)) return unavailableStorage();
    const signed = await refreshSignedUrl(record.locator.objectKey);
    return { disposition: 'AVAILABLE', sourceUrl: signed.url };
  } catch {
    return unavailableStorage();
  }
}

function unavailableStorage(): { disposition: 'UNVERIFIABLE'; result: MediaSourceProbeResultV1 } {
  return {
    disposition: 'UNVERIFIABLE',
    result: unverifiableMediaSourceProbeResultV1('MEDIA_SOURCE_STORAGE_UNAVAILABLE'),
  };
}

function asQualificationRecord(value: unknown): MediaSourceQualificationRecordV1 | null {
  const record = asRecord(value);
  if (!record || typeof record.assetId !== 'string' || typeof record.sourceBindingSha256 !== 'string') return null;
  if (!['PENDING', 'PROBING', 'MEASURED_TECHNICAL', 'UNVERIFIABLE'].includes(String(record.status))) return null;
  if (!Number.isInteger(record.attemptCount) || (record.attemptCount as number) < 0) return null;
  const locator = asRecord(record.locator);
  if (!locator || (locator.provider !== 'R2' && locator.provider !== 'GCS') || typeof locator.objectKey !== 'string') return null;
  return record as unknown as MediaSourceQualificationRecordV1;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() && value.trim().length <= maxLength
    ? value.trim()
    : null;
}
