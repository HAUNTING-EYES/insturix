import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
} from './media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
  backfillMediaSourcePtsCadenceVersionEvidenceV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillPortsV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillResultV1,
} from './media-source-pts-cadence-version-evidence-backfill-v1';

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_MAX_V1 = 100;

export type MediaSourcePtsCadenceVersionEvidenceBackfillBatchItemV1 = Readonly<{
  assetId: string;
  userId: string;
  result: MediaSourcePtsCadenceVersionEvidenceBackfillResultV1;
}>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 =
  Readonly<{
    schemaVersion: 1;
    kind:
      typeof MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_KIND_V1;
    migrationRunId: string;
    policyVersion: string;
    inputCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    upperBoundCursor:
      MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    disposition: 'BATCH_COMPLETE' | 'RUN_COMPLETE' | 'RETRY_REQUIRED';
    requestedLimit: number;
    loadedCandidateCount: number;
    processedItemCount: number;
    backfilledCount: number;
    notApplicableCount: number;
    unverifiableCount: number;
    items: readonly MediaSourcePtsCadenceVersionEvidenceBackfillBatchItemV1[];
    nextCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    completedAt: string;
    batchReceiptSha256: string;
  }>;

type BatchReceiptMaterialV1 = Omit<
  MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  'batchReceiptSha256'
>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillBatchResultV1 =
  Readonly<
    | {
        disposition: 'BATCH_COMPLETE' | 'RUN_COMPLETE' | 'RETRY_REQUIRED';
        receipt: MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1;
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

type BackfillCandidateV1 = typeof backfillMediaSourcePtsCadenceVersionEvidenceV1;

export type MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1 =
  MediaSourcePtsCadenceVersionEvidenceBackfillPortsV1 & Readonly<{
    loadCandidates(input: Readonly<{
      afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
      upperBoundCursor:
        MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
      limit: number;
    }>): Promise<
      readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[]
    >;
    backfillCandidate?: BackfillCandidateV1;
  }>;

/** Runs one ordered, bounded and replay-safe V3 evidence migration batch. */
export async function runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1(
  input: Readonly<{
    migrationRunId: string;
    policyVersion: string;
    afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    upperBoundCursor:
      MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    limit: number;
    completedAt: Date;
  }>,
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1,
): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillBatchResultV1> {
  const normalized = normalizeInput(input);
  assertPorts(ports);
  let loaded: readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[];
  try {
    loaded = await ports.loadCandidates({
      afterCursor: normalized.afterCursor,
      upperBoundCursor: normalized.upperBoundCursor,
      limit: normalized.limit + 1,
    });
  } catch (error) {
    if (error instanceof
      MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1) {
      return frozen({
        disposition: 'BATCH_UNVERIFIABLE',
        reason: 'CANDIDATE_PAGE_INVALID',
        retryable: false,
      } as const);
    }
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
  const items: MediaSourcePtsCadenceVersionEvidenceBackfillBatchItemV1[] = [];
  const backfill = ports.backfillCandidate
    ?? backfillMediaSourcePtsCadenceVersionEvidenceV1;
  for (const candidate of page) {
    const result = assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1(
      await backfill(candidate.asset, {
        storedObjectReader: ports.storedObjectReader,
        boundarySemanticVerifier: ports.boundarySemanticVerifier,
        evidenceStorePorts: ports.evidenceStorePorts,
      }),
    );
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

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 {
  const receipt = objectRecord(value, 'RECEIPT_INVALID');
  exactKeys(receipt, [...BATCH_RECEIPT_MATERIAL_KEYS_V1, 'batchReceiptSha256']);
  const { batchReceiptSha256: hashValue, ...materialValue } = receipt;
  const material = normalizeReceiptMaterial(materialValue);
  const batchReceiptSha256 = sha256(hashValue, 'RECEIPT_HASH_INVALID');
  if (hashEditronCanonicalJsonV1(material) !== batchReceiptSha256) {
    failReceipt('RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, batchReceiptSha256 });
}

const BATCH_RECEIPT_MATERIAL_KEYS_V1 = Object.freeze([
  'backfilledCount',
  'completedAt',
  'disposition',
  'inputCursor',
  'items',
  'kind',
  'loadedCandidateCount',
  'migrationRunId',
  'nextCursor',
  'notApplicableCount',
  'policyVersion',
  'processedItemCount',
  'requestedLimit',
  'schemaVersion',
  'upperBoundCursor',
  'unverifiableCount',
] as const);

function createReceipt(input: Readonly<{
  migrationRunId: string;
  policyVersion: string;
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  upperBoundCursor:
    MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  limit: number;
  completedAt: string;
  disposition: 'BATCH_COMPLETE' | 'RUN_COMPLETE' | 'RETRY_REQUIRED';
  loadedCandidateCount: number;
  items: readonly MediaSourcePtsCadenceVersionEvidenceBackfillBatchItemV1[];
  nextCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
}>): MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1 {
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
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_KIND_V1,
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
  return assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1({
    ...material,
    batchReceiptSha256: hashEditronCanonicalJsonV1(material),
  });
}

function normalizeReceiptMaterial(value: unknown): BatchReceiptMaterialV1 {
  const record = objectRecord(value, 'RECEIPT_MATERIAL_INVALID');
  exactKeys(record, BATCH_RECEIPT_MATERIAL_KEYS_V1);
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_KIND_V1
    || (record.disposition !== 'BATCH_COMPLETE'
      && record.disposition !== 'RUN_COMPLETE'
      && record.disposition !== 'RETRY_REQUIRED')) {
    failReceipt('RECEIPT_IDENTITY_INVALID');
  }
  const disposition = record.disposition as
    MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1['disposition'];
  const inputCursor = nullableCursor(record.inputCursor);
  const upperBoundCursor = nullableCursor(record.upperBoundCursor);
  const nextCursor = nullableCursor(record.nextCursor);
  const requestedLimit = integer(record.requestedLimit);
  const loadedCandidateCount = integer(record.loadedCandidateCount);
  const processedItemCount = integer(record.processedItemCount);
  const backfilledCount = integer(record.backfilledCount);
  const notApplicableCount = integer(record.notApplicableCount);
  const unverifiableCount = integer(record.unverifiableCount);
  if (!Array.isArray(record.items)) failReceipt('RECEIPT_ITEMS_INVALID');
  const items = Object.freeze(record.items.map(normalizeReceiptItem));
  const material = frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_KIND_V1,
    migrationRunId: identifier(record.migrationRunId),
    policyVersion: identifier(record.policyVersion),
    inputCursor,
    upperBoundCursor,
    disposition,
    requestedLimit,
    loadedCandidateCount,
    processedItemCount,
    backfilledCount,
    notApplicableCount,
    unverifiableCount,
    items,
    nextCursor,
    completedAt: timestamp(record.completedAt),
  });
  assertReceiptSemantics(material);
  return material;
}

function normalizeReceiptItem(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillBatchItemV1 {
  const record = objectRecord(value, 'RECEIPT_ITEM_INVALID');
  exactKeys(record, ['assetId', 'result', 'userId']);
  return frozen({
    assetId: identifier(record.assetId),
    userId: identifier(record.userId),
    result: assertMediaSourcePtsCadenceVersionEvidenceBackfillResultV1(
      record.result,
    ),
  });
}

function assertReceiptSemantics(receipt: BatchReceiptMaterialV1): void {
  if (receipt.requestedLimit < 1
    || receipt.requestedLimit
      > MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_MAX_V1
    || receipt.loadedCandidateCount > receipt.requestedLimit + 1
    || receipt.processedItemCount !== receipt.items.length
    || receipt.loadedCandidateCount < receipt.processedItemCount
    || (receipt.upperBoundCursor === null
      && (receipt.inputCursor !== null || receipt.items.length > 0))) {
    failReceipt('RECEIPT_COUNTS_INVALID');
  }
  let previous = receipt.inputCursor;
  for (const item of receipt.items) {
    const cursor = frozen({ assetId: item.assetId, userId: item.userId });
    if ((previous !== null && compareCursor(cursor, previous) <= 0)
      || (receipt.upperBoundCursor !== null
        && compareCursor(cursor, receipt.upperBoundCursor) > 0)) {
      failReceipt('RECEIPT_CURSOR_INVALID');
    }
    previous = cursor;
  }
  const counts = receipt.items.reduce((current, item) => ({
    backfilled: current.backfilled
      + Number(item.result.disposition === 'BACKFILLED'),
    notApplicable: current.notApplicable
      + Number(item.result.disposition === 'NOT_APPLICABLE'),
    unverifiable: current.unverifiable
      + Number(item.result.disposition === 'UNVERIFIABLE'),
  }), { backfilled: 0, notApplicable: 0, unverifiable: 0 });
  if (receipt.backfilledCount !== counts.backfilled
    || receipt.notApplicableCount !== counts.notApplicable
    || receipt.unverifiableCount !== counts.unverifiable) {
    failReceipt('RECEIPT_COUNTS_INVALID');
  }
  const lastItem = receipt.items.at(-1);
  const lastCursor = lastItem
    ? frozen({ assetId: lastItem.assetId, userId: lastItem.userId })
    : receipt.inputCursor;
  const retryableIndexes = receipt.items.flatMap((item, index) => (
    item.result.disposition === 'UNVERIFIABLE' && item.result.retryable
      ? [index]
      : []
  ));
  if (receipt.disposition === 'BATCH_COMPLETE') {
    if (receipt.loadedCandidateCount !== receipt.requestedLimit + 1
      || receipt.items.length !== receipt.requestedLimit
      || retryableIndexes.length > 0
      || !sameCursor(receipt.nextCursor, lastCursor)) {
      failReceipt('RECEIPT_DISPOSITION_INVALID');
    }
    return;
  }
  if (receipt.disposition === 'RUN_COMPLETE') {
    if (receipt.loadedCandidateCount > receipt.requestedLimit
      || receipt.items.length !== receipt.loadedCandidateCount
      || retryableIndexes.length > 0
      || !sameCursor(receipt.nextCursor, lastCursor)) {
      failReceipt('RECEIPT_DISPOSITION_INVALID');
    }
    return;
  }
  if (receipt.items.length === 0
    || retryableIndexes.length !== 1
    || retryableIndexes[0] !== receipt.items.length - 1
    || !sameCursor(receipt.nextCursor, receipt.inputCursor)) {
    failReceipt('RECEIPT_DISPOSITION_INVALID');
  }
}

function validatePage(
  value: unknown,
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  upperBoundCursor:
    MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  maximum: number,
): readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[] | null {
  if (!Array.isArray(value) || value.length > maximum
    || (upperBoundCursor === null && value.length > 0)) return null;
  let previous = afterCursor;
  const candidates: MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Record<string, unknown>;
    let cursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1;
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
    const asset = record.asset as Record<string, unknown>;
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)
      || asset.assetId !== cursor.assetId) return null;
    candidates.push(frozen({
      ...cursor,
      asset: asset as MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1['asset'],
    }));
    previous = cursor;
  }
  return Object.freeze(candidates);
}

function normalizeInput(input: Readonly<{
  migrationRunId: string;
  policyVersion: string;
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  upperBoundCursor:
    MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  limit: number;
  completedAt: Date;
}>): Readonly<{
  migrationRunId: string;
  policyVersion: string;
  afterCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  upperBoundCursor:
    MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
  limit: number;
  completedAt: string;
}> {
  if (!(input.completedAt instanceof Date)) fail('INPUT_INVALID');
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
    || input.limit
      > MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_MAX_V1
    || (upperBoundCursor === null && afterCursor !== null)
    || (upperBoundCursor !== null && afterCursor !== null
      && compareCursor(afterCursor, upperBoundCursor) > 0)) {
    fail('INPUT_INVALID');
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

function assertPorts(
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1,
): void {
  if (!ports || typeof ports.loadCandidates !== 'function'
    || (ports.backfillCandidate !== undefined
      && typeof ports.backfillCandidate !== 'function')
    || !ports.storedObjectReader
    || typeof ports.storedObjectReader.read !== 'function'
    || !ports.boundarySemanticVerifier
    || typeof ports.boundarySemanticVerifier.verify !== 'function'
    || !ports.evidenceStorePorts
    || typeof ports.evidenceStorePorts.load !== 'function'
    || typeof ports.evidenceStorePorts.compareAndSet !== 'function') {
    fail('PORTS_INVALID');
  }
}

function nullableCursor(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null {
  if (value === null) return null;
  const record = objectRecord(value, 'RECEIPT_CURSOR_INVALID');
  exactKeys(record, ['assetId', 'userId']);
  return normalizeCursor({ assetId: record.assetId, userId: record.userId });
}

function normalizeCursor(value: Readonly<{
  assetId: unknown;
  userId: unknown;
}>): MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 {
  return frozen({
    assetId: identifier(value.assetId),
    userId: identifier(value.userId),
  });
}

function compareCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
): number {
  return left.assetId === right.assetId
    ? compareIdentifier(left.userId, right.userId)
    : compareIdentifier(left.assetId, right.assetId);
}

function compareIdentifier(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sameCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
): boolean {
  return left === null || right === null
    ? left === right
    : compareCursor(left, right) === 0;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    failReceipt('RECEIPT_COUNT_INVALID');
  }
  return Number(value);
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') failReceipt('RECEIPT_TIMESTAMP_INVALID');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    failReceipt('RECEIPT_TIMESTAMP_INVALID');
  }
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    failReceipt(code);
  }
  return value;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failReceipt(code);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    failReceipt('RECEIPT_FIELDS_INVALID');
  }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    fail('IDENTIFIER_INVALID');
  }
  return value;
}

function failReceipt(code: string): never {
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_' + code,
  );
}

function fail(code: string): never {
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_BATCH_' + code,
  );
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
