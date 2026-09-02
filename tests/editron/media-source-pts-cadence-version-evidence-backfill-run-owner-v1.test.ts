import { describe, expect, it, vi } from 'vitest';

import {
  runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-ledger-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-owner-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-v1';

const RUN_ID = 'pts-cadence-evidence-backfill-2026-08-30';
const POLICY = 'pts-cadence-evidence-backfill-policy-v1';
const CREATED_AT = '2026-08-30T22:00:00.000Z';
const UPPER_BOUND = { assetId: 'asset-z', userId: 'user-z' } as const;

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1', () => {
  it('initializes idempotently and rejects conflicting immutable scope', async () => {
    const ledger = memoryLedger();
    const owner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const created = await owner.initialize(initialization());
    const replay = await owner.initialize({
      ...initialization(),
      createdAt: '2026-08-30T22:01:00.000Z',
    });

    expect(created.disposition).toBe('CREATED');
    expect(replay).toEqual({
      disposition: 'EXISTING',
      record: created.record,
    });
    await expect(owner.initialize({
      ...initialization(),
      upperBoundCursor: { assetId: 'asset-y', userId: 'user-z' },
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_OWNER_INITIALIZATION_CONFLICT',
    );
  });

  it('atomically commits and replays an accepted transition', async () => {
    const ledger = memoryLedger();
    const owner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const initial = (await owner.initialize(initialization())).record;
    const accepted = await receipt({
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:01:00.000Z',
    });

    const applied = await owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: accepted,
    });
    expect(applied).toMatchObject({
      disposition: 'APPLIED',
      record: {
        status: 'COMPLETE',
        committedBatchCount: 1,
        lastBatchReceiptSha256: accepted.batchReceiptSha256,
      },
    });
    expect(ledger.acceptedReceiptHashes()).toEqual([
      accepted.batchReceiptSha256,
    ]);

    const replay = await owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: accepted,
    });
    expect(replay).toEqual({
      disposition: 'UNCHANGED',
      record: applied.record,
    });
    expect(ledger.acceptedReceiptHashes()).toHaveLength(1);
  });

  it('rejects stale writers and leaves retry attempts uncommitted', async () => {
    const ledger = memoryLedger();
    const owner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const initial = (await owner.initialize(initialization())).record;
    const retry = await receipt({
      candidates: [candidate('asset-a')],
      resultFor: () => retryableFailure(),
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    const casCount = ledger.compareAndSet.mock.calls.length;
    const retryResult = await owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: retry,
    });
    expect(retryResult).toEqual({
      disposition: 'RETRY_REQUIRED',
      record: initial,
    });
    expect(ledger.compareAndSet).toHaveBeenCalledTimes(casCount);

    const accepted = await receipt({
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:02:00.000Z',
    });
    await owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: accepted,
    });
    const competing = await receipt({
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:03:00.000Z',
    });
    await expect(owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: competing,
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_OWNER_STALE_RECORD',
    );
  });

  it('recognizes acknowledgement loss after a successful CAS write', async () => {
    const ledger = memoryLedger();
    const owner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const initial = (await owner.initialize(initialization())).record;
    const accepted = await receipt({
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    ledger.returnFalseAfterNextWrite();

    const result = await owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: accepted,
    });
    expect(result).toMatchObject({
      disposition: 'UNCHANGED',
      record: { lastBatchReceiptSha256: accepted.batchReceiptSha256 },
    });
  });

  it('persists deterministic failure and replays the terminal state', async () => {
    const ledger = memoryLedger();
    const owner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const initial = (await owner.initialize(initialization())).record;
    const applied = await owner.fail({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      failureCode: 'CANDIDATE_PAGE_INVALID',
      failedAt: '2026-08-30T22:01:00.000Z',
    });
    expect(applied).toMatchObject({
      disposition: 'APPLIED',
      record: {
        status: 'FAILED',
        failureCode: 'CANDIDATE_PAGE_INVALID',
      },
    });
    expect(ledger.acceptedReceiptHashes()).toEqual([]);

    const replay = await owner.fail({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      failureCode: 'CANDIDATE_PAGE_INVALID',
      failedAt: '2026-08-30T22:02:00.000Z',
    });
    expect(replay).toEqual({
      disposition: 'UNCHANGED',
      record: applied.record,
    });
  });

  it('rejects a storage adapter that falsely acknowledges durability', async () => {
    const ledger = memoryLedger();
    const owner =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRunOwnerV1(
        ledger.ports,
      );
    const initial = (await owner.initialize(initialization())).record;
    const accepted = await receipt({
      candidates: [candidate('asset-a')],
      completedAt: '2026-08-30T22:01:00.000Z',
    });
    ledger.acknowledgeNextWithoutWrite();

    await expect(owner.commit({
      expectedRecordSha256: initial.recordSha256,
      receipt: accepted,
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RUN_OWNER_WRITE_NOT_DURABLE',
    );
  });
});

function initialization() {
  return {
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    upperBoundCursor: UPPER_BOUND,
    createdAt: CREATED_AT,
  };
}

function memoryLedger() {
  let stored: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 | null =
    null;
  const receipts = new Map<
    string,
    MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1
  >();
  let falseAfterWrite = false;
  let acknowledgeWithoutWrite = false;
  type CompareAndSetInput = Parameters<
    MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1[
      'compareAndSet'
    ]
  >[0];
  const compareAndSet = vi.fn(async (input: CompareAndSetInput) => {
    const matches = input.expectedRecordSha256 === null
      ? stored === null
      : stored?.recordSha256 === input.expectedRecordSha256;
    if (!matches) return false;
    if (acknowledgeWithoutWrite) {
      acknowledgeWithoutWrite = false;
      return true;
    }
    stored = input.next;
    if (input.acceptedReceipt) {
      receipts.set(
        input.acceptedReceipt.batchReceiptSha256,
        input.acceptedReceipt,
      );
    }
    if (falseAfterWrite) {
      falseAfterWrite = false;
      return false;
    }
    return true;
  });
  const ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 = {
    load: vi.fn(async () => stored),
    compareAndSet,
  };
  return {
    ports,
    compareAndSet,
    acceptedReceiptHashes: () => [...receipts.keys()],
    returnFalseAfterNextWrite: () => {
      falseAfterWrite = true;
    },
    acknowledgeNextWithoutWrite: () => {
      acknowledgeWithoutWrite = true;
    },
  };
}

async function receipt(input: Readonly<{
  candidates:
    readonly MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1[];
  resultFor?: (
    assetId: string,
  ) => MediaSourcePtsCadenceVersionEvidenceBackfillResultV1;
  completedAt: string;
}>): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1> {
  const resultFor = input.resultFor ?? success;
  const result = await runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1({
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    afterCursor: null,
    upperBoundCursor: UPPER_BOUND,
    limit: 2,
    completedAt: new Date(input.completedAt),
  }, {
    loadCandidates: vi.fn(async () => input.candidates),
    backfillCandidate: vi.fn(async (asset) => {
      if (typeof asset.assetId !== 'string') {
        throw new Error('TEST_ASSET_ID_INVALID');
      }
      return resultFor(asset.assetId);
    }),
    storedObjectReader: { read: vi.fn(async () => {
      throw new Error('TEST_ARTIFACT_READER_SHOULD_NOT_RUN');
    }) },
    boundarySemanticVerifier: { verify: vi.fn(async () => ({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'TEST_BOUNDARY_VERIFIER_SHOULD_NOT_RUN',
    })) },
    evidenceStorePorts: {
      load: vi.fn(async () => null),
      compareAndSet: vi.fn(async () => true),
    },
  });
  if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');
  return result.receipt;
}

function candidate(
  assetId: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1 {
  return {
    assetId,
    userId: 'user-a',
    asset: { assetId },
  } as MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1;
}

function success(
  assetId: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return {
    disposition: 'BACKFILLED',
    assetId,
    sourceVersionSha256: 'a'.repeat(64),
    terminalReceiptSha256: 'b'.repeat(64),
    verificationSha256: 'c'.repeat(64),
    evidenceWriteDisposition: 'APPLIED',
    evidenceSha256: 'd'.repeat(64),
  };
}

function retryableFailure(): MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 {
  return {
    disposition: 'UNVERIFIABLE',
    reason: 'EVIDENCE_STORE_LOAD_FAILED',
    retryable: true,
    artifactReason: null,
  };
}
