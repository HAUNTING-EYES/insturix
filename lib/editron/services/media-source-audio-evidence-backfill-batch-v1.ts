import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaSourceAudioArtifactAssetStateInputV1 }
  from './media-source-audio-artifact-asset-owner-v1';
import {
  backfillMediaSourceAudioEvidenceV1,
  type MediaSourceAudioEvidenceBackfillPortsV1,
  type MediaSourceAudioEvidenceBackfillResultV1,
} from './media-source-audio-evidence-backfill-v1';

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_V1' as const;
export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_MAX_ASSETS_V1 = 100;

export type MediaSourceAudioEvidenceBackfillCursorV1 = Readonly<{
  assetId: string;
  userId: string;
}>;

export type MediaSourceAudioEvidenceBackfillCandidateV1 = Readonly<{
  assetId: string;
  userId: string;
  asset: MediaSourceAudioArtifactAssetStateInputV1;
}>;

export type MediaSourceAudioEvidenceBackfillBatchItemV1 = Readonly<{
  assetId: string;
  userId: string;
  result: MediaSourceAudioEvidenceBackfillResultV1;
}>;

export type MediaSourceAudioEvidenceBackfillBatchReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_KIND_V1;
  migrationRunId: string;
  policyVersion: string;
  inputCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  disposition: 'BATCH_COMPLETE' | 'RUN_COMPLETE' | 'RETRY_REQUIRED';
  requestedLimit: number;
  loadedCandidateCount: number;
  processedItemCount: number;
  backfilledCount: number;
  notApplicableCount: number;
  unverifiableCount: number;
  items: readonly MediaSourceAudioEvidenceBackfillBatchItemV1[];
  nextCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  completedAt: string;
  batchReceiptSha256: string;
}>;

export type MediaSourceAudioEvidenceBackfillBatchResultV1 = Readonly<
  | {
      disposition: 'BATCH_COMPLETE' | 'RUN_COMPLETE' | 'RETRY_REQUIRED';
      receipt: MediaSourceAudioEvidenceBackfillBatchReceiptV1;
    }
  | {
      disposition: 'BATCH_UNAVAILABLE';
      reason: 'CANDIDATE_LOAD_FAILED';
      retryable: true;
    }
  | {
      disposition: 'BATCH_UNVERIFIABLE';
      reason: 'CANDIDATE_PAGE_INVALID';
      retryable: false;
    }
>;

type BackfillCandidateV1 = typeof backfillMediaSourceAudioEvidenceV1;

export type MediaSourceAudioEvidenceBackfillBatchPortsV1 =
  MediaSourceAudioEvidenceBackfillPortsV1 & Readonly<{
    loadCandidates(input: Readonly<{
      afterCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
      upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
      limit: number;
    }>): Promise<readonly MediaSourceAudioEvidenceBackfillCandidateV1[]>;
    backfillCandidate?: BackfillCandidateV1;
  }>;

/** Runs one bounded, keyset-paginated migration batch. */
export async function runMediaSourceAudioEvidenceBackfillBatchV1(
  input: Readonly<{
    migrationRunId: string;
    policyVersion: string;
    afterCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
    upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
    limit: number;
    completedAt: Date;
  }>,
  ports: MediaSourceAudioEvidenceBackfillBatchPortsV1,
): Promise<MediaSourceAudioEvidenceBackfillBatchResultV1> {
  const normalized = normalizeInput(input);
  assertPorts(ports);
  let loaded: readonly MediaSourceAudioEvidenceBackfillCandidateV1[];
  try {
    loaded = await ports.loadCandidates({
      afterCursor: normalized.afterCursor,
      upperBoundCursor: normalized.upperBoundCursor,
      limit: normalized.limit + 1,
    });
  } catch {
    return frozen({
      disposition: 'BATCH_UNAVAILABLE',
      reason: 'CANDIDATE_LOAD_FAILED',
      retryable: true,
    } as const);
  }
  const candidates = validatePage(
    loaded,
    normalized.afterCursor,
    normalized.upperBoundCursor,
    normalized.limit + 1,
  );
  if (candidates === null) {
    return frozen({
      disposition: 'BATCH_UNVERIFIABLE',
      reason: 'CANDIDATE_PAGE_INVALID',
      retryable: false,
    } as const);
  }

  const hasMore = candidates.length > normalized.limit;
  const page = hasMore ? candidates.slice(0, normalized.limit) : candidates;
  const items: MediaSourceAudioEvidenceBackfillBatchItemV1[] = [];
  const backfill = ports.backfillCandidate
    ?? backfillMediaSourceAudioEvidenceV1;
  for (const candidate of page) {
    const result = await backfill(candidate.asset, {
      availabilityEvidenceStorePorts:
        ports.availabilityEvidenceStorePorts,
      legacyEvidenceStorePorts: ports.legacyEvidenceStorePorts,
    });
    items.push(frozen({
      assetId: candidate.assetId,
      userId: candidate.userId,
      result,
    }));
    if (result.disposition === 'UNVERIFIABLE' && result.retryable) {
      const receipt = createReceipt({
        ...normalized,
        disposition: 'RETRY_REQUIRED',
        loadedCandidateCount: candidates.length,
        items,
        nextCursor: normalized.afterCursor,
      });
      return frozen({ disposition: 'RETRY_REQUIRED', receipt });
    }
  }

  const disposition = hasMore ? 'BATCH_COMPLETE' : 'RUN_COMPLETE';
  const last = page.at(-1);
  const nextCursor = last
    ? frozen({ assetId: last.assetId, userId: last.userId })
    : normalized.afterCursor;
  const receipt = createReceipt({
    ...normalized,
    disposition,
    loadedCandidateCount: candidates.length,
    items,
    nextCursor,
  });
  return frozen({ disposition, receipt });
}

function createReceipt(input: Readonly<{
  migrationRunId: string;
  policyVersion: string;
  afterCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  limit: number;
  completedAt: string;
  disposition: 'BATCH_COMPLETE' | 'RUN_COMPLETE' | 'RETRY_REQUIRED';
  loadedCandidateCount: number;
  items: readonly MediaSourceAudioEvidenceBackfillBatchItemV1[];
  nextCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
}>): MediaSourceAudioEvidenceBackfillBatchReceiptV1 {
  const counts = input.items.reduce((current, item) => ({
    backfilledCount: current.backfilledCount
      + Number(item.result.disposition === 'BACKFILLED'),
    notApplicableCount: current.notApplicableCount
      + Number(item.result.disposition === 'NOT_APPLICABLE'),
    unverifiableCount: current.unverifiableCount
      + Number(item.result.disposition === 'UNVERIFIABLE'),
  }), { backfilledCount: 0, notApplicableCount: 0, unverifiableCount: 0 });
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_KIND_V1,
    migrationRunId: input.migrationRunId,
    policyVersion: input.policyVersion,
    inputCursor: input.afterCursor,
    upperBoundCursor: input.upperBoundCursor,
    disposition: input.disposition,
    requestedLimit: input.limit,
    loadedCandidateCount: input.loadedCandidateCount,
    processedItemCount: input.items.length,
    ...counts,
    items: input.items,
    nextCursor: input.nextCursor,
    completedAt: input.completedAt,
  };
  return frozen({
    ...material,
    batchReceiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

function validatePage(
  value: unknown,
  afterCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null,
  upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null,
  maximum: number,
): readonly MediaSourceAudioEvidenceBackfillCandidateV1[] | null {
  if (!Array.isArray(value) || value.length > maximum
    || (upperBoundCursor === null && value.length > 0)) return null;
  let previous = afterCursor;
  const candidates: MediaSourceAudioEvidenceBackfillCandidateV1[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Record<string, unknown>;
    let cursor: MediaSourceAudioEvidenceBackfillCursorV1;
    try {
      cursor = normalizeCursor({
        assetId: record.assetId,
        userId: record.userId,
      });
    } catch {
      return null;
    }
    if (previous !== null && compareCursor(cursor, previous) <= 0) return null;
    if (upperBoundCursor !== null
      && compareCursor(cursor, upperBoundCursor) > 0) return null;
    const asset = record.asset as MediaSourceAudioArtifactAssetStateInputV1;
    if (!asset || typeof asset !== 'object' || asset.assetId !== cursor.assetId) {
      return null;
    }
    candidates.push(frozen({ ...cursor, asset }));
    previous = cursor;
  }
  return Object.freeze(candidates);
}

function normalizeInput(input: Readonly<{
  migrationRunId: string;
  policyVersion: string;
  afterCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
  limit: number;
  completedAt: Date;
}>) {
  if (!(input.completedAt instanceof Date)) {
    throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_INPUT_INVALID');
  }
  const completedAt = new Date(input.completedAt.getTime());
  const afterCursor = input.afterCursor === null
    ? null
    : normalizeCursor(input.afterCursor);
  const upperBoundCursor = input.upperBoundCursor === null
    ? null
    : normalizeCursor(input.upperBoundCursor);
  if (Number.isNaN(completedAt.getTime())
    || !Number.isSafeInteger(input.limit)
    || input.limit < 1
    || input.limit > MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_MAX_ASSETS_V1
    || (upperBoundCursor === null && afterCursor !== null)
    || (upperBoundCursor !== null && afterCursor !== null
      && compareCursor(afterCursor, upperBoundCursor) > 0)) {
    throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_INPUT_INVALID');
  }
  return frozen({
    migrationRunId: identifier(input.migrationRunId),
    policyVersion: identifier(input.policyVersion),
    afterCursor,
    upperBoundCursor,
    limit: input.limit,
    completedAt: completedAt.toISOString(),
  });
}

function normalizeCursor(value: Readonly<{
  assetId: unknown;
  userId: unknown;
}>): MediaSourceAudioEvidenceBackfillCursorV1 {
  return frozen({
    assetId: identifier(value.assetId),
    userId: identifier(value.userId),
  });
}

function compareCursor(
  left: MediaSourceAudioEvidenceBackfillCursorV1,
  right: MediaSourceAudioEvidenceBackfillCursorV1,
): number {
  return left.assetId === right.assetId
    ? compareIdentifier(left.userId, right.userId)
    : compareIdentifier(left.assetId, right.assetId);
}

function compareIdentifier(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function assertPorts(ports: MediaSourceAudioEvidenceBackfillBatchPortsV1): void {
  if (!ports || typeof ports.loadCandidates !== 'function'
    || (ports.backfillCandidate !== undefined
      && typeof ports.backfillCandidate !== 'function')
    || !ports.availabilityEvidenceStorePorts
    || typeof ports.availabilityEvidenceStorePorts.load !== 'function'
    || typeof ports.availabilityEvidenceStorePorts.compareAndSet !== 'function'
    || !ports.legacyEvidenceStorePorts
    || typeof ports.legacyEvidenceStorePorts.load !== 'function'
    || typeof ports.legacyEvidenceStorePorts.compareAndSet !== 'function') {
    throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_BATCH_PORTS_INVALID');
  }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_IDENTIFIER_INVALID');
  }
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
