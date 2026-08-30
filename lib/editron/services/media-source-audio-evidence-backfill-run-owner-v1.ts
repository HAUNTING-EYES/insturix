import {
  assertMediaSourceAudioEvidenceBackfillBatchReceiptV1,
  type MediaSourceAudioEvidenceBackfillBatchReceiptV1,
  type MediaSourceAudioEvidenceBackfillCursorV1,
} from './media-source-audio-evidence-backfill-batch-v1';
import {
  advanceMediaSourceAudioEvidenceBackfillRunRecordV1,
  assertMediaSourceAudioEvidenceBackfillRunRecordV1,
  createMediaSourceAudioEvidenceBackfillRunRecordV1,
  failMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunFailureCodeV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from './media-source-audio-evidence-backfill-run-record-v1';

export type MediaSourceAudioEvidenceBackfillRunLedgerPortsV1 = Readonly<{
  load(
    migrationRunId: string,
  ): Promise<MediaSourceAudioEvidenceBackfillRunRecordV1 | null>;
  compareAndSet(input: Readonly<{
    migrationRunId: string;
    expectedRecordSha256: string | null;
    next: MediaSourceAudioEvidenceBackfillRunRecordV1;
    acceptedReceipt: MediaSourceAudioEvidenceBackfillBatchReceiptV1 | null;
  }>): Promise<boolean>;
}>;

export type MediaSourceAudioEvidenceBackfillRunInitializeResultV1 = Readonly<{
  disposition: 'CREATED' | 'EXISTING';
  record: MediaSourceAudioEvidenceBackfillRunRecordV1;
}>;

export type MediaSourceAudioEvidenceBackfillRunCommitResultV1 = Readonly<{
  disposition: 'APPLIED' | 'UNCHANGED' | 'RETRY_REQUIRED';
  record: MediaSourceAudioEvidenceBackfillRunRecordV1;
}>;

export type MediaSourceAudioEvidenceBackfillRunFailureResultV1 = Readonly<{
  disposition: 'APPLIED' | 'UNCHANGED';
  record: MediaSourceAudioEvidenceBackfillRunRecordV1;
}>;

export function createMediaSourceAudioEvidenceBackfillRunOwnerV1(
  ports: MediaSourceAudioEvidenceBackfillRunLedgerPortsV1,
) {
  assertPorts(ports);
  return Object.freeze({
    initialize: async (input: Readonly<{
      migrationRunId: string;
      policyVersion: string;
      upperBoundCursor: MediaSourceAudioEvidenceBackfillCursorV1 | null;
      createdAt: string;
    }>): Promise<MediaSourceAudioEvidenceBackfillRunInitializeResultV1> => {
      const candidate = createMediaSourceAudioEvidenceBackfillRunRecordV1(input);
      if (await ports.compareAndSet({
        migrationRunId: candidate.migrationRunId,
        expectedRecordSha256: null,
        next: candidate,
        acceptedReceipt: null,
      })) {
        return Object.freeze({
          disposition: 'CREATED' as const,
          record: await durableRecord(ports, candidate),
        });
      }
      const existing = await requiredRecord(ports, candidate.migrationRunId);
      if (existing.policyVersion !== candidate.policyVersion
        || !sameCursor(
          existing.upperBoundCursor,
          candidate.upperBoundCursor,
        )) {
        fail('INITIALIZATION_CONFLICT');
      }
      return Object.freeze({
        disposition: 'EXISTING' as const,
        record: existing,
      });
    },

    resolve: async (
      migrationRunId: string,
    ): Promise<MediaSourceAudioEvidenceBackfillRunRecordV1 | null> => {
      const stored = await ports.load(identifier(migrationRunId));
      return stored === null
        ? null
        : assertMediaSourceAudioEvidenceBackfillRunRecordV1(stored);
    },

    commit: async (input: Readonly<{
      expectedRecordSha256: string;
      receipt: MediaSourceAudioEvidenceBackfillBatchReceiptV1;
    }>): Promise<MediaSourceAudioEvidenceBackfillRunCommitResultV1> => {
      const receipt = assertMediaSourceAudioEvidenceBackfillBatchReceiptV1(
        input.receipt,
      );
      const expectedRecordSha256 = sha256(input.expectedRecordSha256);
      const current = await requiredRecord(ports, receipt.migrationRunId);
      if (current.recordSha256 !== expectedRecordSha256) {
        if (current.lastBatchReceiptSha256 === receipt.batchReceiptSha256) {
          return Object.freeze({
            disposition: 'UNCHANGED' as const,
            record: current,
          });
        }
        fail('STALE_RECORD');
      }
      assertReceiptScope(current, receipt);
      if (receipt.disposition === 'RETRY_REQUIRED') {
        return Object.freeze({
          disposition: 'RETRY_REQUIRED' as const,
          record: current,
        });
      }
      const next = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
        current,
        receipt,
      );
      const applied = await ports.compareAndSet({
        migrationRunId: current.migrationRunId,
        expectedRecordSha256: current.recordSha256,
        next,
        acceptedReceipt: receipt,
      });
      if (applied) {
        return Object.freeze({
          disposition: 'APPLIED' as const,
          record: await durableRecord(ports, next),
        });
      }
      const raced = await requiredRecord(ports, current.migrationRunId);
      if (raced.recordSha256 === next.recordSha256
        || raced.lastBatchReceiptSha256 === receipt.batchReceiptSha256) {
        return Object.freeze({
          disposition: 'UNCHANGED' as const,
          record: raced,
        });
      }
      fail('COMPARE_AND_SET_LOST');
    },

    fail: async (input: Readonly<{
      migrationRunId: string;
      expectedRecordSha256: string;
      failureCode: MediaSourceAudioEvidenceBackfillRunFailureCodeV1;
      failedAt: string;
    }>): Promise<MediaSourceAudioEvidenceBackfillRunFailureResultV1> => {
      const migrationRunId = identifier(input.migrationRunId);
      const expectedRecordSha256 = sha256(input.expectedRecordSha256);
      const current = await requiredRecord(ports, migrationRunId);
      if (current.recordSha256 !== expectedRecordSha256) {
        if (current.status === 'FAILED'
          && current.failureCode === input.failureCode) {
          return Object.freeze({
            disposition: 'UNCHANGED' as const,
            record: current,
          });
        }
        fail('STALE_RECORD');
      }
      const next = failMediaSourceAudioEvidenceBackfillRunRecordV1(
        current,
        {
          failureCode: input.failureCode,
          failedAt: input.failedAt,
        },
      );
      const applied = await ports.compareAndSet({
        migrationRunId,
        expectedRecordSha256: current.recordSha256,
        next,
        acceptedReceipt: null,
      });
      if (applied) {
        return Object.freeze({
          disposition: 'APPLIED' as const,
          record: await durableRecord(ports, next),
        });
      }
      const raced = await requiredRecord(ports, migrationRunId);
      if (raced.recordSha256 === next.recordSha256
        || (raced.status === 'FAILED'
          && raced.failureCode === input.failureCode)) {
        return Object.freeze({
          disposition: 'UNCHANGED' as const,
          record: raced,
        });
      }
      fail('COMPARE_AND_SET_LOST');
    },
  });
}

async function requiredRecord(
  ports: MediaSourceAudioEvidenceBackfillRunLedgerPortsV1,
  migrationRunId: string,
): Promise<MediaSourceAudioEvidenceBackfillRunRecordV1> {
  const stored = await ports.load(identifier(migrationRunId));
  if (stored === null) fail('RUN_NOT_FOUND');
  return assertMediaSourceAudioEvidenceBackfillRunRecordV1(stored);
}

async function durableRecord(
  ports: MediaSourceAudioEvidenceBackfillRunLedgerPortsV1,
  expected: MediaSourceAudioEvidenceBackfillRunRecordV1,
): Promise<MediaSourceAudioEvidenceBackfillRunRecordV1> {
  const stored = await requiredRecord(ports, expected.migrationRunId);
  if (stored.recordSha256 !== expected.recordSha256) {
    fail('WRITE_NOT_DURABLE');
  }
  return stored;
}

function assertReceiptScope(
  current: MediaSourceAudioEvidenceBackfillRunRecordV1,
  receipt: MediaSourceAudioEvidenceBackfillBatchReceiptV1,
): void {
  if (current.status !== 'RUNNING'
    || receipt.policyVersion !== current.policyVersion
    || !sameCursor(receipt.upperBoundCursor, current.upperBoundCursor)
    || !sameCursor(receipt.inputCursor, current.currentCursor)) {
    fail('RECEIPT_SCOPE_MISMATCH');
  }
}

function sameCursor(
  left: MediaSourceAudioEvidenceBackfillCursorV1 | null,
  right: MediaSourceAudioEvidenceBackfillCursorV1 | null,
): boolean {
  return left === null || right === null
    ? left === right
    : left.assetId === right.assetId && left.userId === right.userId;
}

function assertPorts(
  ports: MediaSourceAudioEvidenceBackfillRunLedgerPortsV1,
): void {
  if (!ports || typeof ports.load !== 'function'
    || typeof ports.compareAndSet !== 'function') {
    fail('PORTS_INVALID');
  }
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

function fail(code: string): never {
  throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_OWNER_' + code);
}
