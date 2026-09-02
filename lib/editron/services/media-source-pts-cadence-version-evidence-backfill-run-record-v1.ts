import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from './media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 }
  from './media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_V1' as const;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunStatusV1 =
  | 'RUNNING'
  | 'COMPLETE'
  | 'COMPLETE_WITH_UNVERIFIABLE'
  | 'FAILED';

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureCodeV1 =
  'CANDIDATE_PAGE_INVALID';

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 =
  Readonly<{
    schemaVersion: 1;
    kind:
      typeof MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_KIND_V1;
    recordVersion: number;
    migrationRunId: string;
    policyVersion: string;
    upperBoundCursor:
      MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    status: MediaSourcePtsCadenceVersionEvidenceBackfillRunStatusV1;
    currentCursor: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    committedBatchCount: number;
    processedItemCount: number;
    backfilledCount: number;
    notApplicableCount: number;
    unverifiableCount: number;
    lastBatchReceiptSha256: string | null;
    failureCode:
      MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureCodeV1 | null;
    createdAt: string;
    updatedAt: string;
    terminalAt: string | null;
    previousRecordSha256: string | null;
    recordSha256: string;
  }>;

type RunMaterialV1 = Omit<
  MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  'recordSha256'
>;

const RUN_MATERIAL_KEYS_V1 = Object.freeze([
  'backfilledCount',
  'committedBatchCount',
  'createdAt',
  'currentCursor',
  'failureCode',
  'kind',
  'lastBatchReceiptSha256',
  'migrationRunId',
  'notApplicableCount',
  'policyVersion',
  'previousRecordSha256',
  'processedItemCount',
  'recordVersion',
  'schemaVersion',
  'status',
  'terminalAt',
  'unverifiableCount',
  'updatedAt',
  'upperBoundCursor',
] as const);

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
  input: Readonly<{
    migrationRunId: string;
    policyVersion: string;
    upperBoundCursor:
      MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
    createdAt: string;
  }>,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  const createdAt = timestamp(input.createdAt);
  return freezeRun({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_KIND_V1,
    recordVersion: 1,
    migrationRunId: identifier(input.migrationRunId),
    policyVersion: identifier(input.policyVersion),
    upperBoundCursor: nullableCursor(input.upperBoundCursor),
    status: 'RUNNING',
    currentCursor: null,
    committedBatchCount: 0,
    processedItemCount: 0,
    backfilledCount: 0,
    notApplicableCount: 0,
    unverifiableCount: 0,
    lastBatchReceiptSha256: null,
    failureCode: null,
    createdAt,
    updatedAt: createdAt,
    terminalAt: null,
    previousRecordSha256: null,
  });
}

export function advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
  currentValue: unknown,
  receiptValue: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  const current = assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
    currentValue,
  );
  const receipt =
    assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1(
      receiptValue,
    );
  if (current.status !== 'RUNNING') fail('RUN_NOT_RUNNING');
  if (receipt.disposition === 'RETRY_REQUIRED') {
    fail('RETRY_RECEIPT_NOT_COMMITTABLE');
  }
  assertReceiptBinding(current, receipt);
  if (Date.parse(receipt.completedAt) < Date.parse(current.updatedAt)) {
    fail('TIMESTAMP_REGRESSION');
  }
  const processedItemCount = safeAdd(
    current.processedItemCount,
    receipt.processedItemCount,
  );
  const backfilledCount = safeAdd(
    current.backfilledCount,
    receipt.backfilledCount,
  );
  const notApplicableCount = safeAdd(
    current.notApplicableCount,
    receipt.notApplicableCount,
  );
  const unverifiableCount = safeAdd(
    current.unverifiableCount,
    receipt.unverifiableCount,
  );
  const terminal = receipt.disposition === 'RUN_COMPLETE';
  const status: MediaSourcePtsCadenceVersionEvidenceBackfillRunStatusV1 =
    terminal
      ? (unverifiableCount === 0 ? 'COMPLETE' : 'COMPLETE_WITH_UNVERIFIABLE')
      : 'RUNNING';
  return freezeRun({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_KIND_V1,
    recordVersion: safeAdd(current.recordVersion, 1),
    migrationRunId: current.migrationRunId,
    policyVersion: current.policyVersion,
    upperBoundCursor: current.upperBoundCursor,
    status,
    currentCursor: receipt.nextCursor,
    committedBatchCount: safeAdd(current.committedBatchCount, 1),
    processedItemCount,
    backfilledCount,
    notApplicableCount,
    unverifiableCount,
    lastBatchReceiptSha256: receipt.batchReceiptSha256,
    failureCode: null,
    createdAt: current.createdAt,
    updatedAt: receipt.completedAt,
    terminalAt: terminal ? receipt.completedAt : null,
    previousRecordSha256: current.recordSha256,
  });
}

export function failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
  currentValue: unknown,
  input: Readonly<{
    failureCode:
      MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureCodeV1;
    failedAt: string;
  }>,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  const current = assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
    currentValue,
  );
  if (current.status !== 'RUNNING') fail('RUN_NOT_RUNNING');
  const failedAt = timestamp(input.failedAt);
  if (Date.parse(failedAt) < Date.parse(current.updatedAt)
    || input.failureCode !== 'CANDIDATE_PAGE_INVALID') {
    fail('FAILURE_INVALID');
  }
  return freezeRun({
    ...runMaterial(current),
    recordVersion: safeAdd(current.recordVersion, 1),
    status: 'FAILED',
    failureCode: input.failureCode,
    updatedAt: failedAt,
    terminalAt: failedAt,
    previousRecordSha256: current.recordSha256,
  });
}

export function assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  const record = objectRecord(value);
  exactKeys(record, [...RUN_MATERIAL_KEYS_V1, 'recordSha256']);
  const { recordSha256: hashValue, ...materialValue } = record;
  const material = normalizeRunMaterial(materialValue);
  const recordSha256 = sha256(hashValue);
  if (hashEditronCanonicalJsonV1(material) !== recordSha256) {
    fail('RECORD_HASH_MISMATCH');
  }
  return frozen({ ...material, recordSha256 });
}

function normalizeRunMaterial(value: unknown): RunMaterialV1 {
  const record = objectRecord(value);
  exactKeys(record, RUN_MATERIAL_KEYS_V1);
  if (record.schemaVersion !== 1
    || record.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_KIND_V1
    || (record.status !== 'RUNNING'
      && record.status !== 'COMPLETE'
      && record.status !== 'COMPLETE_WITH_UNVERIFIABLE'
      && record.status !== 'FAILED')) {
    fail('RECORD_IDENTITY_INVALID');
  }
  const status = record.status as
    MediaSourcePtsCadenceVersionEvidenceBackfillRunStatusV1;
  const material = frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_KIND_V1,
    recordVersion: positiveInteger(record.recordVersion),
    migrationRunId: identifier(record.migrationRunId),
    policyVersion: identifier(record.policyVersion),
    upperBoundCursor: nullableCursor(record.upperBoundCursor),
    status,
    currentCursor: nullableCursor(record.currentCursor),
    committedBatchCount: integer(record.committedBatchCount),
    processedItemCount: integer(record.processedItemCount),
    backfilledCount: integer(record.backfilledCount),
    notApplicableCount: integer(record.notApplicableCount),
    unverifiableCount: integer(record.unverifiableCount),
    lastBatchReceiptSha256: nullableSha256(record.lastBatchReceiptSha256),
    failureCode: nullableFailureCode(record.failureCode),
    createdAt: timestamp(record.createdAt),
    updatedAt: timestamp(record.updatedAt),
    terminalAt: nullableTimestamp(record.terminalAt),
    previousRecordSha256: nullableSha256(record.previousRecordSha256),
  });
  assertRunSemantics(material);
  return material;
}

function assertRunSemantics(record: RunMaterialV1): void {
  const expectedRecordVersion = safeAdd(
    record.committedBatchCount,
    record.status === 'FAILED' ? 2 : 1,
  );
  if (record.processedItemCount !== safeAdd(
    safeAdd(record.backfilledCount, record.notApplicableCount),
    record.unverifiableCount,
  )
    || record.recordVersion !== expectedRecordVersion
    || (record.recordVersion === 1
      && (record.previousRecordSha256 !== null
        || record.committedBatchCount !== 0))
    || (record.recordVersion > 1 && record.previousRecordSha256 === null)
    || (record.committedBatchCount === 0
      && record.lastBatchReceiptSha256 !== null)
    || (record.committedBatchCount > 0
      && record.lastBatchReceiptSha256 === null)
    || (record.committedBatchCount === 0
      && (record.currentCursor !== null
        || record.processedItemCount !== 0))
    || (record.status === 'RUNNING'
      && record.committedBatchCount > 0
      && record.currentCursor === null)
    || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
    || (record.currentCursor !== null
      && (record.upperBoundCursor === null
        || compareCursor(record.currentCursor, record.upperBoundCursor) > 0))) {
    fail('RECORD_INVARIANT_INVALID');
  }
  const terminal = record.status !== 'RUNNING';
  if ((terminal && record.terminalAt === null)
    || (!terminal && record.terminalAt !== null)
    || (record.terminalAt !== null && record.terminalAt !== record.updatedAt)
    || (record.status === 'FAILED') !== (record.failureCode !== null)
    || ((record.status === 'COMPLETE'
      || record.status === 'COMPLETE_WITH_UNVERIFIABLE')
      && record.committedBatchCount === 0)
    || (record.status === 'COMPLETE' && record.unverifiableCount !== 0)
    || (record.status === 'COMPLETE_WITH_UNVERIFIABLE'
      && record.unverifiableCount === 0)) {
    fail('RECORD_STATUS_INVALID');
  }
}

function assertReceiptBinding(
  current: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  receipt: MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
): void {
  if (receipt.migrationRunId !== current.migrationRunId
    || receipt.policyVersion !== current.policyVersion
    || !sameCursor(receipt.upperBoundCursor, current.upperBoundCursor)
    || !sameCursor(receipt.inputCursor, current.currentCursor)) {
    fail('RECEIPT_BINDING_MISMATCH');
  }
}

function runMaterial(
  record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
): RunMaterialV1 {
  const { recordSha256: _recordSha256, ...material } = record;
  return material;
}

function freezeRun(
  material: RunMaterialV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  assertRunSemantics(material);
  return frozen({
    ...material,
    recordSha256: hashEditronCanonicalJsonV1(material),
  });
}

function nullableCursor(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null {
  if (value === null) return null;
  const record = objectRecord(value);
  exactKeys(record, ['assetId', 'userId']);
  return frozen({
    assetId: identifier(record.assetId),
    userId: identifier(record.userId),
  });
}

function compareCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1,
): number {
  if (left.assetId !== right.assetId) {
    return left.assetId < right.assetId ? -1 : 1;
  }
  return left.userId === right.userId ? 0 : left.userId < right.userId ? -1 : 1;
}

function sameCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
): boolean {
  return left === null || right === null
    ? left === right
    : compareCursor(left, right) === 0;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) fail('COUNT_OVERFLOW');
  return result;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('COUNT_INVALID');
  return Number(value);
}

function positiveInteger(value: unknown): number {
  const normalized = integer(value);
  if (normalized < 1) fail('COUNT_INVALID');
  return normalized;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    fail('IDENTIFIER_INVALID');
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('SHA256_INVALID');
  }
  return value;
}

function nullableSha256(value: unknown): string | null {
  return value === null ? null : sha256(value);
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') fail('TIMESTAMP_INVALID');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('TIMESTAMP_INVALID');
  }
  return value;
}

function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}

function nullableFailureCode(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureCodeV1 | null {
  if (value === null) return null;
  if (value !== 'CANDIDATE_PAGE_INVALID') fail('FAILURE_INVALID');
  return value;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('RECORD_INVALID');
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
    fail('RECORD_FIELDS_INVALID');
  }
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}

function fail(code: string): never {
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_' + code,
  );
}
