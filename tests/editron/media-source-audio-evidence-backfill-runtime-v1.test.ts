import { describe, expect, it, vi } from 'vitest';
import {
  runMediaSourceAudioEvidenceBackfillBatchV1,
  MediaSourceAudioEvidenceBackfillCandidatePageErrorV1,
  type MediaSourceAudioEvidenceBackfillBatchPortsV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-batch-v1';
import {
  createMediaSourceAudioEvidenceBackfillRuntimeV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-runtime-v1';
import {
  createMediaSourceAudioEvidenceBackfillRunOwnerV1,
  type MediaSourceAudioEvidenceBackfillRunLedgerPortsV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-owner-v1';
import {
  failMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';
import type { MediaSourceAudioAvailabilityEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import type { MediaSourceAudioEvidenceBackfillMongoCandidateSourceV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-mongo-candidates-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';

const T0 = new Date('2026-08-30T00:00:00.000Z');
const T1 = new Date('2026-08-30T00:01:00.000Z');
const BOUND = Object.freeze({ assetId: 'asset-z', userId: 'user-z' });

describe('MediaSourceAudioEvidenceBackfillRuntimeV1', () => {
  it('seals one upper bound and resumes the existing run without rescanning', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({ ledger, candidateSource, now: dates(T0) });

    const created = await runtime.initialize({
      migrationRunId: 'audio-run-a',
      policyVersion: 'audio-policy-v1',
    });
    const existing = await runtime.initialize({
      migrationRunId: 'audio-run-a',
      policyVersion: 'audio-policy-v1',
    });

    expect(created.disposition).toBe('CREATED');
    expect(created.record.upperBoundCursor).toEqual(BOUND);
    expect(existing).toEqual({ disposition: 'EXISTING', record: created.record });
    expect(candidateSource.resolveUpperBound).toHaveBeenCalledOnce();
  });

  it('commits an empty run once and reports terminal replay without work', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: null, candidates: [] });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'audio-run-empty',
      policyVersion: 'audio-policy-v1',
    });

    const completed = await runtime.runNextBatch({
      migrationRunId: 'audio-run-empty',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });

    expect(completed.disposition).toBe('BATCH_COMMITTED');
    if (completed.disposition !== 'BATCH_COMMITTED') throw new Error('TEST_INVALID');
    const duplicate = await runtime.runNextBatch({
      migrationRunId: 'audio-run-empty',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });
    const replay = await runtime.runNextBatch({
      migrationRunId: 'audio-run-empty',
      expectedRecordSha256: completed.record.recordSha256,
      limit: 10,
    });
    expect(completed.record.status).toBe('COMPLETE');
    expect(completed.record.committedBatchCount).toBe(1);
    expect(ledger.acceptedReceipts).toHaveLength(1);
    expect(duplicate).toEqual({
      disposition: 'SUPERSEDED',
      record: completed.record,
    });
    expect(replay).toEqual({
      disposition: 'ALREADY_TERMINAL',
      record: completed.record,
    });
    expect(candidateSource.loadCandidates).toHaveBeenCalledOnce();
  });

  it('returns RUN_NOT_FOUND without creating state', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({ ledger, candidateSource, now: dates(T0) });
    await expect(runtime.runNextBatch({
      migrationRunId: 'missing-run',
      expectedRecordSha256: 'a'.repeat(64),
      limit: 10,
    })).resolves.toEqual({ disposition: 'RUN_NOT_FOUND' });
    expect(candidateSource.loadCandidates).not.toHaveBeenCalled();
  });

  it('retains the cursor when candidate loading is transiently unavailable', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({
      upperBound: BOUND,
      loadError: new Error('MONGO_UNAVAILABLE'),
    });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'audio-run-retry-load',
      policyVersion: 'audio-policy-v1',
    });

    const result = await runtime.runNextBatch({
      migrationRunId: 'audio-run-retry-load',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });

    expect(result).toEqual({
      disposition: 'RETRY_REQUIRED',
      reason: 'CANDIDATE_LOAD_FAILED',
      record: initialized.record,
      receipt: null,
    });
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('terminally records a deterministic candidate-page fault', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({
      upperBound: BOUND,
      loadError: new MediaSourceAudioEvidenceBackfillCandidatePageErrorV1(
        'OWNER_SCOPE_MISMATCH',
      ),
    });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'audio-run-invalid-page',
      policyVersion: 'audio-policy-v1',
    });

    const result = await runtime.runNextBatch({
      migrationRunId: 'audio-run-invalid-page',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });

    expect(result.disposition).toBe('RUN_FAILED');
    if (result.disposition !== 'RUN_FAILED') throw new Error('TEST_INVALID');
    expect(result.record.status).toBe('FAILED');
    expect(result.record.failureCode).toBe('CANDIDATE_PAGE_INVALID');
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('does not checkpoint a partial batch with a retryable evidence fault', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
      runBatch: retryingBatch,
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'audio-run-retry-evidence',
      policyVersion: 'audio-policy-v1',
    });

    const result = await runtime.runNextBatch({
      migrationRunId: 'audio-run-retry-evidence',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });

    expect(result.disposition).toBe('RETRY_REQUIRED');
    if (result.disposition !== 'RETRY_REQUIRED') throw new Error('TEST_INVALID');
    expect(result.reason).toBe('EVIDENCE_WRITE_RETRY_REQUIRED');
    expect(result.record).toEqual(initialized.record);
    expect(result.receipt?.nextCursor).toBeNull();
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('blocks a clock regression before candidate or evidence work', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T1, T0),
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'audio-run-clock',
      policyVersion: 'audio-policy-v1',
    });
    await expect(runtime.runNextBatch({
      migrationRunId: 'audio-run-clock',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUNTIME_CLOCK_REGRESSION',
    );
    expect(candidateSource.loadCandidates).not.toHaveBeenCalled();
  });

  it('reports a concurrent winner instead of claiming its own batch committed', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: null, candidates: [] });
    const realOwner = createMediaSourceAudioEvidenceBackfillRunOwnerV1(ledger.ports);
    const initialized = await realOwner.initialize({
      migrationRunId: 'audio-run-race',
      policyVersion: 'audio-policy-v1',
      upperBoundCursor: null,
      createdAt: T0.toISOString(),
    });
    const winner = failMediaSourceAudioEvidenceBackfillRunRecordV1(
      initialized.record,
      { failureCode: 'CANDIDATE_PAGE_INVALID', failedAt: T1.toISOString() },
    );
    const resolve = vi.fn()
      .mockResolvedValueOnce(initialized.record)
      .mockResolvedValueOnce(winner);
    const runOwner = {
      ...realOwner,
      resolve,
      commit: vi.fn(async () => {
        throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_OWNER_STALE_RECORD');
      }),
    } as typeof realOwner;
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T1),
      runOwner,
    });

    await expect(runtime.runNextBatch({
      migrationRunId: 'audio-run-race',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    })).resolves.toEqual({ disposition: 'SUPERSEDED', record: winner });
  });

  it('rejects an operator limit larger than the bounded batch contract', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({ ledger, candidateSource, now: dates(T0) });
    await expect(runtime.runNextBatch({
      migrationRunId: 'audio-run-limit',
      expectedRecordSha256: 'a'.repeat(64),
      limit: 101,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUNTIME_LIMIT_INVALID',
    );
    await expect(runtime.runNextBatch({
      migrationRunId: 'audio-run-limit',
      expectedRecordSha256: 'not-a-sha256',
      limit: 10,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUNTIME_EXPECTED_RECORD_SHA256_INVALID',
    );
  });
});

async function retryingBatch(
  input: Parameters<typeof runMediaSourceAudioEvidenceBackfillBatchV1>[0],
  ports: MediaSourceAudioEvidenceBackfillBatchPortsV1,
) {
  return runMediaSourceAudioEvidenceBackfillBatchV1(input, {
    ...ports,
    loadCandidates: async () => [{
      assetId: 'asset-a',
      userId: 'user-a',
      asset: { assetId: 'asset-a' } as never,
    }],
    backfillCandidate: async () => ({
      disposition: 'UNVERIFIABLE',
      reason: 'CANONICAL_STORE_LOAD_FAILED',
      retryable: true,
    }),
  });
}

function runtimeFixture(input: Readonly<{
  ledger: ReturnType<typeof memoryLedger>;
  candidateSource: ReturnType<typeof candidateFixture>;
  now: () => Date;
  runBatch?: typeof runMediaSourceAudioEvidenceBackfillBatchV1;
  runOwner?: ReturnType<typeof createMediaSourceAudioEvidenceBackfillRunOwnerV1>;
}>) {
  return createMediaSourceAudioEvidenceBackfillRuntimeV1({
    candidateSource: input.candidateSource,
    runOwner: input.runOwner
      ?? createMediaSourceAudioEvidenceBackfillRunOwnerV1(input.ledger.ports),
    availabilityEvidenceStorePorts: evidencePorts() as
      MediaSourceAudioAvailabilityEvidenceStorePortsV1,
    legacyEvidenceStorePorts: evidencePorts() as
      MediaSourceVersionEvidenceStorePortsV1,
    runBatch: input.runBatch,
    now: input.now,
  });
}

function candidateFixture(input: Readonly<{
  upperBound: Readonly<{ assetId: string; userId: string }> | null;
  candidates?: readonly never[];
  loadError?: Error;
}>) {
  return {
    resolveUpperBound: vi.fn(async () => input.upperBound),
    loadCandidates: vi.fn(async () => {
      if (input.loadError) throw input.loadError;
      return input.candidates ?? [];
    }),
  } as unknown as MediaSourceAudioEvidenceBackfillMongoCandidateSourceV1 & {
    resolveUpperBound: ReturnType<typeof vi.fn>;
    loadCandidates: ReturnType<typeof vi.fn>;
  };
}

function evidencePorts() {
  return {
    load: vi.fn(async () => null),
    compareAndSet: vi.fn(async () => true),
  };
}

function memoryLedger() {
  let record: MediaSourceAudioEvidenceBackfillRunRecordV1 | null = null;
  const acceptedReceipts: unknown[] = [];
  const ports: MediaSourceAudioEvidenceBackfillRunLedgerPortsV1 = {
    load: vi.fn(async () => record),
    compareAndSet: vi.fn(async (input) => {
      if (input.expectedRecordSha256 === null) {
        if (record !== null) return false;
      } else if (record?.recordSha256 !== input.expectedRecordSha256) {
        return false;
      }
      record = input.next;
      if (input.acceptedReceipt !== null) {
        acceptedReceipts.push(input.acceptedReceipt);
      }
      return true;
    }),
  };
  return { ports, acceptedReceipts };
}

function dates(...values: readonly Date[]) {
  const remaining = values.map((value) => new Date(value.getTime()));
  return vi.fn(() => {
    const value = remaining.shift();
    if (!value) throw new Error('TEST_CLOCK_EXHAUSTED');
    return value;
  });
}
