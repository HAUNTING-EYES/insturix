import {
  runMediaSourceAudioEvidenceBackfillBatchV1,
  type MediaSourceAudioEvidenceBackfillBatchReceiptV1,
} from './media-source-audio-evidence-backfill-batch-v1';
import { createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1 }
  from './media-source-audio-evidence-backfill-mongo-candidates-v1';
import { createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1 }
  from './media-source-audio-evidence-backfill-mongo-ledger-v1';
import {
  createMediaSourceAudioEvidenceBackfillRunOwnerV1,
  type MediaSourceAudioEvidenceBackfillRunInitializeResultV1,
} from './media-source-audio-evidence-backfill-run-owner-v1';
import type { MediaSourceAudioEvidenceBackfillRunRecordV1 }
  from './media-source-audio-evidence-backfill-run-record-v1';
import { createMediaSourceAudioAvailabilityEvidenceMongoPortsV1 }
  from './media-source-audio-availability-evidence-mongo-v1';
import type { MediaSourceAudioAvailabilityEvidenceStorePortsV1 }
  from './media-source-audio-availability-evidence-v1';
import type { MediaSourceAudioEvidenceBackfillMongoCandidateSourceV1 }
  from './media-source-audio-evidence-backfill-mongo-candidates-v1';
import { createMediaSourceVersionEvidenceMongoStorePortsV1 }
  from './media-source-version-evidence-mongo-store-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from './media-source-version-evidence-owner-v1';

type RunOwnerV1 = ReturnType<
  typeof createMediaSourceAudioEvidenceBackfillRunOwnerV1
>;
type RunBatchV1 = typeof runMediaSourceAudioEvidenceBackfillBatchV1;

export type MediaSourceAudioEvidenceBackfillRuntimeNextResultV1 = Readonly<
  | { disposition: 'RUN_NOT_FOUND' }
  | {
      disposition: 'ALREADY_TERMINAL';
      record: MediaSourceAudioEvidenceBackfillRunRecordV1;
    }
  | {
      disposition: 'RETRY_REQUIRED';
      reason: 'CANDIDATE_LOAD_FAILED';
      record: MediaSourceAudioEvidenceBackfillRunRecordV1;
      receipt: null;
    }
  | {
      disposition: 'RETRY_REQUIRED';
      reason: 'EVIDENCE_WRITE_RETRY_REQUIRED';
      record: MediaSourceAudioEvidenceBackfillRunRecordV1;
      receipt: MediaSourceAudioEvidenceBackfillBatchReceiptV1;
    }
  | {
      disposition: 'RUN_FAILED';
      reason: 'CANDIDATE_PAGE_INVALID';
      failureDisposition: 'APPLIED' | 'UNCHANGED';
      record: MediaSourceAudioEvidenceBackfillRunRecordV1;
    }
  | {
      disposition: 'BATCH_COMMITTED';
      commitDisposition: 'APPLIED' | 'UNCHANGED';
      record: MediaSourceAudioEvidenceBackfillRunRecordV1;
      receipt: MediaSourceAudioEvidenceBackfillBatchReceiptV1;
    }
  | {
      disposition: 'SUPERSEDED';
      record: MediaSourceAudioEvidenceBackfillRunRecordV1;
    }
>;

export type MediaSourceAudioEvidenceBackfillRuntimeV1 = Readonly<{
  initialize(input: Readonly<{
    migrationRunId: string;
    policyVersion: string;
  }>): Promise<MediaSourceAudioEvidenceBackfillRunInitializeResultV1>;
  runNextBatch(input: Readonly<{
    migrationRunId: string;
    limit: number;
  }>): Promise<MediaSourceAudioEvidenceBackfillRuntimeNextResultV1>;
}>;

export function createMediaSourceAudioEvidenceBackfillRuntimeV1(
  input: Readonly<{
    candidateSource?: MediaSourceAudioEvidenceBackfillMongoCandidateSourceV1;
    runOwner?: RunOwnerV1;
    availabilityEvidenceStorePorts?:
      MediaSourceAudioAvailabilityEvidenceStorePortsV1;
    legacyEvidenceStorePorts?: MediaSourceVersionEvidenceStorePortsV1;
    runBatch?: RunBatchV1;
    now?: () => Date;
  }> = {},
): MediaSourceAudioEvidenceBackfillRuntimeV1 {
  const candidateSource = input.candidateSource
    ?? createMediaSourceAudioEvidenceBackfillMongoCandidateSourceV1();
  const runOwner = input.runOwner ?? createMediaSourceAudioEvidenceBackfillRunOwnerV1(
    createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1(),
  );
  const availabilityEvidenceStorePorts = input.availabilityEvidenceStorePorts
    ?? createMediaSourceAudioAvailabilityEvidenceMongoPortsV1();
  const legacyEvidenceStorePorts = input.legacyEvidenceStorePorts
    ?? createMediaSourceVersionEvidenceMongoStorePortsV1();
  const runBatch = input.runBatch ?? runMediaSourceAudioEvidenceBackfillBatchV1;
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
      const current = await runOwner.resolve(value.migrationRunId);
      if (current === null) {
        return Object.freeze({ disposition: 'RUN_NOT_FOUND' as const });
      }
      if (current.status !== 'RUNNING') {
        return Object.freeze({
          disposition: 'ALREADY_TERMINAL' as const,
          record: current,
        });
      }
      const completedAt = clockDate(now, current.updatedAt);
      const batch = await runBatch({
        migrationRunId: current.migrationRunId,
        policyVersion: current.policyVersion,
        afterCursor: current.currentCursor,
        upperBoundCursor: current.upperBoundCursor,
        limit,
        completedAt,
      }, {
        loadCandidates: candidateSource.loadCandidates,
        availabilityEvidenceStorePorts,
        legacyEvidenceStorePorts,
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
            reason: 'EVIDENCE_WRITE_RETRY_REQUIRED' as const,
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
        if (latest !== null && latest.recordSha256 !== current.recordSha256) {
          if (latest.lastBatchReceiptSha256 === batch.receipt.batchReceiptSha256) {
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
  current: MediaSourceAudioEvidenceBackfillRunRecordV1,
  error: unknown,
): Promise<MediaSourceAudioEvidenceBackfillRuntimeNextResultV1> {
  const latest = await runOwner.resolve(current.migrationRunId);
  if (latest !== null && latest.recordSha256 !== current.recordSha256) {
    return Object.freeze({
      disposition: 'SUPERSEDED' as const,
      record: latest,
    });
  }
  throw error;
}

function batchLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 100) {
    fail('LIMIT_INVALID');
  }
  return Number(value);
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
  throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUNTIME_' + code);
}
