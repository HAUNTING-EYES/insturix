import { describe, expect, it, vi } from 'vitest';

import {
  runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-batch-v1';
import {
  MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import type {
  MediaSourcePtsCadenceBoundarySemanticVerifierV3,
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-ledger-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-owner-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-runtime-v1';
import {
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';

const T0 = new Date('2026-08-30T00:00:00.000Z');
const T1 = new Date('2026-08-30T00:01:00.000Z');
const BOUND = Object.freeze({ assetId: 'asset-z', userId: 'user-z' });

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1', () => {
  it('seals one upper bound and resumes without rescanning', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({ ledger, candidateSource, now: dates(T0) });

    const created = await runtime.initialize({
      migrationRunId: 'pts-run-a',
      policyVersion: 'pts-policy-v1',
    });
    const existing = await runtime.initialize({
      migrationRunId: 'pts-run-a',
      policyVersion: 'pts-policy-v1',
    });

    expect(created.disposition).toBe('CREATED');
    expect(created.record.upperBoundCursor).toEqual(BOUND);
    expect(existing).toEqual({ disposition: 'EXISTING', record: created.record });
    expect(candidateSource.resolveUpperBound).toHaveBeenCalledOnce();
  });

  it('commits an empty run and reports terminal replay without work', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: null, candidates: [] });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'pts-run-empty',
      policyVersion: 'pts-policy-v1',
    });

    const completed = await runtime.runNextBatch({
      migrationRunId: 'pts-run-empty',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });
    expect(completed.disposition).toBe('BATCH_COMMITTED');
    if (completed.disposition !== 'BATCH_COMMITTED') {
      throw new Error('TEST_INVALID');
    }
    const duplicate = await runtime.runNextBatch({
      migrationRunId: 'pts-run-empty',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });
    const replay = await runtime.runNextBatch({
      migrationRunId: 'pts-run-empty',
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

  it('never fabricates boundary verification when no verifier is configured', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runBatch: typeof runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1 =
      async (_input, ports) => {
        await expect(ports.boundarySemanticVerifier.verify({} as never))
          .resolves.toEqual({
            disposition: 'UNVERIFIABLE',
            reason: 'EXTERNAL_BOUNDARY_SEMANTIC_VERIFIER_NOT_CONFIGURED',
          });
        return Object.freeze({
          disposition: 'BATCH_UNAVAILABLE' as const,
          reason: 'CANDIDATE_LOAD_FAILED' as const,
          retryable: true as const,
        });
      };
    const runtime =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1({
        candidateSource,
        runOwner:
          createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
            ledger.ports,
          ),
        evidenceStorePorts: evidencePorts(),
        loadStoredObjectReader: async () => artifactReader(),
        runBatch,
        now: dates(T0, T1),
      });
    const initialized = await runtime.initialize({
      migrationRunId: 'pts-run-no-boundary-verifier',
      policyVersion: 'pts-policy-v1',
    });

    await expect(runtime.runNextBatch({
      migrationRunId: 'pts-run-no-boundary-verifier',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    })).resolves.toMatchObject({
      disposition: 'RETRY_REQUIRED',
      reason: 'CANDIDATE_LOAD_FAILED',
      record: initialized.record,
    });
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('reports missing dedicated private storage without advancing', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
      loadStoredObjectReader: async () => {
        throw new Error(
          'MEDIA_SOURCE_PTS_R2_RUNTIME_NOT_CONFIGURED:MISSING_BUCKET_NAME',
        );
      },
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'pts-run-no-private-storage',
      policyVersion: 'pts-policy-v1',
    });

    await expect(runtime.runNextBatch({
      migrationRunId: 'pts-run-no-private-storage',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    })).resolves.toEqual({
      disposition: 'RUNTIME_UNAVAILABLE',
      reason: 'PRIVATE_STORAGE_NOT_CONFIGURED',
      record: initialized.record,
    });
    expect(candidateSource.loadCandidates).not.toHaveBeenCalled();
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('retains the cursor when candidate loading is unavailable', async () => {
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
      migrationRunId: 'pts-run-retry-load',
      policyVersion: 'pts-policy-v1',
    });

    const result = await runtime.runNextBatch({
      migrationRunId: 'pts-run-retry-load',
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
      loadError:
        new MediaSourcePtsCadenceVersionEvidenceBackfillCandidatePageErrorV1(
          'OWNER_SCOPE_MISMATCH',
        ),
    });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'pts-run-invalid-page',
      policyVersion: 'pts-policy-v1',
    });

    const result = await runtime.runNextBatch({
      migrationRunId: 'pts-run-invalid-page',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });
    expect(result.disposition).toBe('RUN_FAILED');
    if (result.disposition !== 'RUN_FAILED') throw new Error('TEST_INVALID');
    expect(result.record.status).toBe('FAILED');
    expect(result.record.failureCode).toBe('CANDIDATE_PAGE_INVALID');
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('does not checkpoint a partial retryable backfill batch', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T0, T1),
      runBatch: retryingBatch,
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'pts-run-retry-evidence',
      policyVersion: 'pts-policy-v1',
    });

    const result = await runtime.runNextBatch({
      migrationRunId: 'pts-run-retry-evidence',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    });
    expect(result.disposition).toBe('RETRY_REQUIRED');
    if (result.disposition !== 'RETRY_REQUIRED') throw new Error('TEST_INVALID');
    expect(result.reason).toBe('BACKFILL_RETRY_REQUIRED');
    expect(result.record).toEqual(initialized.record);
    expect(result.receipt?.nextCursor).toBeNull();
    expect(ledger.acceptedReceipts).toHaveLength(0);
  });

  it('blocks clock regression before storage or candidate work', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const loadStoredObjectReader = vi.fn(async () => artifactReader());
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T1, T0),
      loadStoredObjectReader,
    });
    const initialized = await runtime.initialize({
      migrationRunId: 'pts-run-clock',
      policyVersion: 'pts-policy-v1',
    });
    await expect(runtime.runNextBatch({
      migrationRunId: 'pts-run-clock',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUNTIME_CLOCK_REGRESSION',
    );
    expect(loadStoredObjectReader).not.toHaveBeenCalled();
    expect(candidateSource.loadCandidates).not.toHaveBeenCalled();
  });

  it('reports a concurrent winner instead of claiming its batch', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: null, candidates: [] });
    const realOwner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const initialized = await realOwner.initialize({
      migrationRunId: 'pts-run-race',
      policyVersion: 'pts-policy-v1',
      upperBoundCursor: null,
      createdAt: T0.toISOString(),
    });
    const winner =
      failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
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
        throw new Error(
          'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_OWNER_STALE_RECORD',
        );
      }),
    } as typeof realOwner;
    const runtime = runtimeFixture({
      ledger,
      candidateSource,
      now: dates(T1),
      runOwner,
    });

    await expect(runtime.runNextBatch({
      migrationRunId: 'pts-run-race',
      expectedRecordSha256: initialized.record.recordSha256,
      limit: 10,
    })).resolves.toEqual({ disposition: 'SUPERSEDED', record: winner });
  });

  it('rejects invalid bounded operator inputs', async () => {
    const ledger = memoryLedger();
    const candidateSource = candidateFixture({ upperBound: BOUND });
    const runtime = runtimeFixture({ ledger, candidateSource, now: dates(T0) });
    await expect(runtime.runNextBatch({
      migrationRunId: 'pts-run-limit',
      expectedRecordSha256: 'a'.repeat(64),
      limit: 101,
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUNTIME_LIMIT_INVALID',
    );
    await expect(runtime.runNextBatch({
      migrationRunId: 'pts-run-limit',
      expectedRecordSha256: 'not-a-sha256',
      limit: 10,
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUNTIME_EXPECTED_RECORD_SHA256_INVALID',
    );
  });
});

async function retryingBatch(
  input: Parameters<
    typeof runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1
  >[0],
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillBatchPortsV1,
) {
  return runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1(input, {
    ...ports,
    loadCandidates: async () => [{
      assetId: 'asset-a',
      userId: 'user-a',
      asset: { assetId: 'asset-a' } as never,
    }],
    backfillCandidate: async () => ({
      disposition: 'UNVERIFIABLE',
      reason: 'EVIDENCE_STORE_LOAD_FAILED',
      retryable: true,
      artifactReason: null,
    }),
  });
}

function runtimeFixture(input: Readonly<{
  ledger: ReturnType<typeof memoryLedger>;
  candidateSource: ReturnType<typeof candidateFixture>;
  now: () => Date;
  runBatch?: typeof runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1;
  runOwner?: ReturnType<
    typeof createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1
  >;
  loadStoredObjectReader?: () => Promise<
    MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3
  >;
}>) {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRuntimeV1({
    candidateSource: input.candidateSource,
    runOwner: input.runOwner
      ?? createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        input.ledger.ports,
      ),
    evidenceStorePorts: evidencePorts(),
    boundarySemanticVerifier: semanticVerifier(),
    loadStoredObjectReader: input.loadStoredObjectReader
      ?? (async () => artifactReader()),
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
  } as unknown as
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoCandidateSourceV1 & {
      resolveUpperBound: ReturnType<typeof vi.fn>;
      loadCandidates: ReturnType<typeof vi.fn>;
    };
}

function artifactReader(): MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3 {
  return { read: vi.fn(async () => {
    throw new Error('TEST_ARTIFACT_READER_SHOULD_NOT_RUN');
  }) };
}

function semanticVerifier(): MediaSourcePtsCadenceBoundarySemanticVerifierV3 {
  return { verify: vi.fn(async () => ({
    disposition: 'UNVERIFIABLE' as const,
    reason: 'TEST_BOUNDARY_VERIFIER_SHOULD_NOT_RUN',
  })) };
}

function evidencePorts() {
  return {
    load: vi.fn(async () => null),
    compareAndSet: vi.fn(async () => true),
  };
}

function memoryLedger() {
  let record:
    MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 | null = null;
  const acceptedReceipts: unknown[] = [];
  const ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 = {
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
