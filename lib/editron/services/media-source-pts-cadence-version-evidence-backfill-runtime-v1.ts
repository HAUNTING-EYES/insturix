import {
  runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from './media-source-pts-cadence-version-evidence-backfill-batch-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1,
} from './media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1 }
  from './media-source-pts-cadence-version-evidence-backfill-mongo-ledger-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunInitializeResultV1,
} from './media-source-pts-cadence-version-evidence-backfill-run-owner-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 }
  from './media-source-pts-cadence-version-evidence-backfill-run-record-v1';
import type { MediaSourcePtsCadenceBoundarySemanticVerifierV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 }
  from './media-source-pts-cadence-r2-runtime-v1';
import { createMediaSourceVersionEvidenceMongoStorePortsV1 }
  from './media-source-version-evidence-mongo-store-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from './media-source-version-evidence-owner-v1';

type RunOwnerV1 = ReturnType<
  typeof createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1
>;
type RunBatchV1 = typeof runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeNextResultV1 =
  Readonly<
    | { disposition: 'RUN_NOT_FOUND' }
    | {
        disposition: 'ALREADY_TERMINAL';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
      }
    | {
        disposition: 'RUNTIME_UNAVAILABLE';
        reason: 'PRIVATE_STORAGE_NOT_CONFIGURED';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
      }
    | {
        disposition: 'RETRY_REQUIRED';
        reason: 'CANDIDATE_LOAD_FAILED';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
        receipt: null;
      }
    | {
        disposition: 'RETRY_REQUIRED';
        reason: 'BACKFILL_RETRY_REQUIRED';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
        receipt:
          MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1;
      }
    | {
        disposition: 'RUN_FAILED';
        reason: 'CANDIDATE_PAGE_INVALID';
        failureDisposition: 'APPLIED' | 'UNCHANGED';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
      }
    | {
        disposition: 'BATCH_COMMITTED';
        commitDisposition: 'APPLIED' | 'UNCHANGED';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
        receipt:
          MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1;
      }
    | {
        disposition: 'SUPERSEDED';
        record: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1;
      }
  >;

export type MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1 = Readonly<{
  initialize(input: Readonly<{
    migrationRunId: string;
    policyVersion: string;
  }>): Promise<
    MediaSourcePtsCadenceVersionEvidenceBackfillRunInitializeResultV1
  >;
  runNextBatch(input: Readonly<{
    migrationRunId: string;
    expectedRecordSha256: string;
    limit: number;
  }>): Promise<
    MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeNextResultV1
  >;
}>;

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1(
  input: Readonly<{
    candidateSource?:
      MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1;
    runOwner?: RunOwnerV1;
    evidenceStorePorts?: MediaSourceVersionEvidenceStorePortsV1;
    boundarySemanticVerifier?:
      MediaSourcePtsCadenceBoundarySemanticVerifierV3;
    loadStoredObjectReader?: () => Promise<
      MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3
    >;
    runBatch?: RunBatchV1;
    now?: () => Date;
  }> = {},
): MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1 {
  const candidateSource = input.candidateSource
    ?? createMediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1();
  const runOwner = input.runOwner
    ?? createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
      createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1(),
    );
  const evidenceStorePorts = input.evidenceStorePorts
    ?? createMediaSourceVersionEvidenceMongoStorePortsV1();
  const boundarySemanticVerifier = input.boundarySemanticVerifier
    ?? noExternalBoundarySemanticVerifierV3();
  const loadStoredObjectReader = input.loadStoredObjectReader
    ?? defaultStoredObjectReader;
  const runBatch = input.runBatch
    ?? runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1;
  const now = input.now ?? (() => new Date());

  return Object.freeze({
    initialize: async (value) => {
      const existing = await runOwner.resolve(value.migrationRunId);
      if (existing !== null) {
        return runOwner.initialize({
          migrationRunId: value.migrationRunId,
          policyVersion: value.policyVersion,
          upperBoundCursor: existing.upperBoundCursor,
          createdAt: existing.createdAt,
        });
      }
      const upperBoundCursor = await candidateSource.resolveUpperBound();
      const createdAt = clockDate(now).toISOString();
      try {
        return await runOwner.initialize({
          migrationRunId: value.migrationRunId,
          policyVersion: value.policyVersion,
          upperBoundCursor,
          createdAt,
        });
      } catch (error) {
        const raced = await runOwner.resolve(value.migrationRunId);
        if (raced !== null && raced.policyVersion === value.policyVersion) {
          return Object.freeze({
            disposition: 'EXISTING' as const,
            record: raced,
          });
        }
        throw error;
      }
    },

    runNextBatch: async (value) => {
      const limit = batchLimit(value.limit);
      const expectedRecordSha256 = sha256(value.expectedRecordSha256);
      const current = await runOwner.resolve(value.migrationRunId);
      if (current === null) {
        return Object.freeze({ disposition: 'RUN_NOT_FOUND' as const });
      }
      if (current.recordSha256 !== expectedRecordSha256) {
        return Object.freeze({
          disposition: 'SUPERSEDED' as const,
          record: current,
        });
      }
      if (current.status !== 'RUNNING') {
        return Object.freeze({
          disposition: 'ALREADY_TERMINAL' as const,
          record: current,
        });
      }
      const completedAt = clockDate(now, current.updatedAt);
      let storedObjectReader:
        MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
      try {
        storedObjectReader = await loadStoredObjectReader();
        assertStoredObjectReader(storedObjectReader);
      } catch (error) {
        if (!privateStorageNotConfigured(error)) throw error;
        return Object.freeze({
          disposition: 'RUNTIME_UNAVAILABLE' as const,
          reason: 'PRIVATE_STORAGE_NOT_CONFIGURED' as const,
          record: current,
        });
      }
      const batch = await runBatch({
        migrationRunId: current.migrationRunId,
        policyVersion: current.policyVersion,
        afterCursor: current.currentCursor,
        upperBoundCursor: current.upperBoundCursor,
        limit,
        completedAt,
      }, {
        loadCandidates: candidateSource.loadCandidates,
        storedObjectReader,
        boundarySemanticVerifier,
        evidenceStorePorts,
      });

      if (batch.disposition === 'BATCH_UNAVAILABLE') {
        return Object.freeze({
          disposition: 'RETRY_REQUIRED' as const,
          reason: 'CANDIDATE_LOAD_FAILED' as const,
          record: current,
          receipt: null,
        });
      }
      if (batch.disposition === 'BATCH_UNVERIFIABLE') {
        try {
          const failed = await runOwner.fail({
            migrationRunId: current.migrationRunId,
            expectedRecordSha256: current.recordSha256,
            failureCode: 'CANDIDATE_PAGE_INVALID',
            failedAt: completedAt.toISOString(),
          });
          return Object.freeze({
            disposition: 'RUN_FAILED' as const,
            reason: 'CANDIDATE_PAGE_INVALID' as const,
            failureDisposition: failed.disposition,
            record: failed.record,
          });
        } catch (error) {
          return supersededOrThrow(runOwner, current, error);
        }
      }

      try {
        const committed = await runOwner.commit({
          expectedRecordSha256: current.recordSha256,
          receipt: batch.receipt,
        });
        if (batch.disposition === 'RETRY_REQUIRED') {
          if (committed.disposition !== 'RETRY_REQUIRED') {
            fail('RETRY_COMMIT_DISPOSITION_INVALID');
          }
          return Object.freeze({
            disposition: 'RETRY_REQUIRED' as const,
            reason: 'BACKFILL_RETRY_REQUIRED' as const,
            record: committed.record,
            receipt: batch.receipt,
          });
        }
        if (committed.disposition === 'RETRY_REQUIRED') {
          fail('SUCCESS_COMMIT_DISPOSITION_INVALID');
        }
        return Object.freeze({
          disposition: 'BATCH_COMMITTED' as const,
          commitDisposition: committed.disposition,
          record: committed.record,
          receipt: batch.receipt,
        });
      } catch (error) {
        const latest = await runOwner.resolve(current.migrationRunId);
        if (latest !== null
          && latest.recordSha256 !== current.recordSha256) {
          if (latest.lastBatchReceiptSha256
            === batch.receipt.batchReceiptSha256) {
            return Object.freeze({
              disposition: 'BATCH_COMMITTED' as const,
              commitDisposition: 'UNCHANGED' as const,
              record: latest,
              receipt: batch.receipt,
            });
          }
          return Object.freeze({
            disposition: 'SUPERSEDED' as const,
            record: latest,
          });
        }
        throw error;
      }
    },
  });
}

async function supersededOrThrow(
  runOwner: RunOwnerV1,
  current: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  error: unknown,
): Promise<
  MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeNextResultV1
> {
  const latest = await runOwner.resolve(current.migrationRunId);
  if (latest !== null && latest.recordSha256 !== current.recordSha256) {
    return Object.freeze({
      disposition: 'SUPERSEDED' as const,
      record: latest,
    });
  }
  throw error;
}

async function defaultStoredObjectReader(): Promise<
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3
> {
  return createMediaSourcePtsCadenceR2RuntimePortsV1().epochArtifactReader;
}

function noExternalBoundarySemanticVerifierV3(
): MediaSourcePtsCadenceBoundarySemanticVerifierV3 {
  return Object.freeze({
    verify: async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'EXTERNAL_BOUNDARY_SEMANTIC_VERIFIER_NOT_CONFIGURED',
    }),
  });
}

function assertStoredObjectReader(
  value: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
): void {
  if (!value || typeof value.read !== 'function') {
    fail('STORED_OBJECT_READER_INVALID');
  }
}

function privateStorageNotConfigured(error: unknown): boolean {
  return error instanceof Error
    && error.message.startsWith('MEDIA_SOURCE_PTS_R2_RUNTIME_NOT_CONFIGURED:');
}

function batchLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1
    || Number(value) > 100) {
    fail('LIMIT_INVALID');
  }
  return Number(value);
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('EXPECTED_RECORD_SHA256_INVALID');
  }
  return value;
}

function clockDate(now: () => Date, floor?: string): Date {
  if (typeof now !== 'function') fail('CLOCK_INVALID');
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('CLOCK_INVALID');
  }
  const copy = new Date(value.getTime());
  if (floor !== undefined && copy.getTime() < Date.parse(floor)) {
    fail('CLOCK_REGRESSION');
  }
  return copy;
}

function fail(code: string): never {
  throw new Error(
    'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUNTIME_' + code,
  );
}
