import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from './media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 }
  from './media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 }
  from './media-source-pts-cadence-version-evidence-backfill-run-ledger-v1';
import {
  advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureCodeV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from './media-source-pts-cadence-version-evidence-backfill-run-record-v1';

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunInitializeResultV1 =
  Readonly<{
    disposition: 'CREATED' | 'EXISTING';
    record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
  }>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunCommitResultV1 =
  Readonly<{
    disposition: 'APPLIED' | 'UNCHANGED' | 'RETRY_REQUIRED';
    record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
  }>;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureResultV1 =
  Readonly<{
    disposition: 'APPLIED' | 'UNCHANGED';
    record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
  }>;

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1,
) {
  assertPorts(ports);
  return Object.freeze({
    initialize: async (input: Readonly<{
      migrationRunId: string;
      policyVersion: string;
      upperBoundCursor:
        MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null;
      createdAt: string;
    }>): Promise<
      MediaSourcePtsCadenceVersionEvidenceBackfillRunInitializeResultV1
    > => {
      const candidate =
        createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(input);
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
    ): Promise<
      MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 | null
    > => {
      const stored = await ports.load(identifier(migrationRunId));
      return stored === null
        ? null
        : assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
          stored,
        );
    },

    commit: async (input: Readonly<{
      expectedRecordSha256: string;
      receipt: MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1;
    }>): Promise<
      MediaSourcePtsCadenceVersionEvidenceBackfillRunCommitResultV1
    > => {
      const receipt =
        assertMediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1(
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
      const next =
        advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
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
      failureCode:
        MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureCodeV1;
      failedAt: string;
    }>): Promise<
      MediaSourcePtsCadenceVersionEvidenceBackfillRunFailureResultV1
    > => {
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
      const next =
        failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
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
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1,
  migrationRunId: string,
): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1> {
  const stored = await ports.load(identifier(migrationRunId));
  if (stored === null) fail('RUN_NOT_FOUND');
  return assertMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(stored);
}

async function durableRecord(
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1,
  expected: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1> {
  const stored = await requiredRecord(ports, expected.migrationRunId);
  if (stored.recordSha256 !== expected.recordSha256) {
    fail('WRITE_NOT_DURABLE');
  }
  return stored;
}

function assertReceiptScope(
  current: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  receipt: MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
): void {
  if (current.status !== 'RUNNING'
    || receipt.policyVersion !== current.policyVersion
    || !sameCursor(receipt.upperBoundCursor, current.upperBoundCursor)
    || !sameCursor(receipt.inputCursor, current.currentCursor)) {
    fail('RECEIPT_SCOPE_MISMATCH');
  }
}

function sameCursor(
  left: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
  right: MediaSourcePtsCadenceVersionEvidenceBackfillCursorV1 | null,
): boolean {
  return left === null || right === null
    ? left === right
    : left.assetId === right.assetId && left.userId === right.userId;
}

function assertPorts(
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1,
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
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_OWNER_' + code,
  );
}
