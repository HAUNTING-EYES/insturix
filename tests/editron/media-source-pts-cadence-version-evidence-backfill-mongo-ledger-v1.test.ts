import { describe, expect, it, vi } from 'vitest';

import {
  runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-batch-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillCandidateV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-candidates-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-mongo-ledger-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-ledger-v1';
import {
  advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';
import type { MediaSourcePtsCadenceVersionEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-v1';

const RUN_ID = 'pts-cadence-evidence-backfill-2026-08-30';
const POLICY = 'pts-cadence-evidence-backfill-policy-v1';
const UPPER_BOUND = { assetId: 'asset-z', userId: 'user-z' } as const;

describe('MediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerV1', () => {
  it('creates indexed run storage once and reads from the primary', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();

    expect(await ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: null,
      next: initial,
      acceptedReceipt: null,
    })).toBe(true);
    expect(await ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: null,
      next: initial,
      acceptedReceipt: null,
    })).toBe(false);
    expect(await ports.load(RUN_ID)).toEqual(initial);
    expect(memory.runs.createIndex).toHaveBeenCalledTimes(2);
    expect(memory.receipts.createIndex).toHaveBeenCalledTimes(2);
    expect(memory.runs.findOne).toHaveBeenLastCalledWith(
      { _id: RUN_ID },
      { readPreference: 'primary' },
    );
    expect(memory.sessions.every(
      (session) => session.endSession.mock.calls.length === 1,
    )).toBe(true);
  });

  it('commits a re-derived run transition and full receipt atomically', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const accepted = await receipt('2026-08-30T22:01:00.000Z');
    const next =
      advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
        initial,
        accepted,
      );

    expect(await ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      next,
      acceptedReceipt: accepted,
    })).toBe(true);
    expect(await ports.load(RUN_ID)).toEqual(next);
    expect(memory.receipts.document(accepted.batchReceiptSha256)).toMatchObject({
      migrationRunId: RUN_ID,
      batchReceiptSha256: accepted.batchReceiptSha256,
      acceptedRecordVersion: next.recordVersion,
      acceptedRecordSha256: next.recordSha256,
      receipt: accepted,
    });
    expect(memory.transactionOptions).toContainEqual({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  });

  it('returns false for a stale CAS without retaining its receipt', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const winnerReceipt = await receipt('2026-08-30T22:01:00.000Z');
    const winner =
      advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
        initial,
        winnerReceipt,
      );
    await ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      next: winner,
      acceptedReceipt: winnerReceipt,
    });

    const staleReceipt = await receipt('2026-08-30T22:02:00.000Z');
    const staleNext =
      advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
        initial,
        staleReceipt,
      );
    expect(await ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      next: staleNext,
      acceptedReceipt: staleReceipt,
    })).toBe(false);
    expect(memory.receipts.document(staleReceipt.batchReceiptSha256)).toBeNull();
    expect(await ports.load(RUN_ID)).toEqual(winner);
  });

  it('re-derives a terminal failure without a batch receipt', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const failed =
      failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(initial, {
        failureCode: 'CANDIDATE_PAGE_INVALID',
        failedAt: '2026-08-30T22:01:00.000Z',
      });

    expect(await ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      next: failed,
      acceptedReceipt: null,
    })).toBe(true);
    expect(await ports.load(RUN_ID)).toEqual(failed);
    expect(memory.receipts.size()).toBe(0);
  });

  it('rolls back when an existing receipt has wrong acceptance context', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const accepted = await receipt('2026-08-30T22:01:00.000Z');
    const next =
      advanceMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(
        initial,
        accepted,
      );
    memory.receipts.seed({
      _id: accepted.batchReceiptSha256,
      schemaVersion: 1,
      kind:
        'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECEIPT_DOCUMENT_V1',
      migrationRunId: RUN_ID,
      batchReceiptSha256: accepted.batchReceiptSha256,
      acceptedRecordVersion: next.recordVersion,
      acceptedRecordSha256: 'f'.repeat(64),
      receipt: accepted,
      createdAt: new Date(accepted.completedAt),
    });

    await expect(ports.compareAndSet({
      migrationRunId: RUN_ID,
      expectedRecordSha256: initial.recordSha256,
      next,
      acceptedReceipt: accepted,
    })).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_MONGO_LEDGER_RECEIPT_DOCUMENT_ENVELOPE_INVALID',
    );
    expect(await ports.load(RUN_ID)).toEqual(initial);
  });

  it('rejects a corrupted stored run envelope', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourcePtsCadenceVersionEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    memory.runs.mutate(RUN_ID, (document) => ({
      ...document,
      status: 'COMPLETE',
    }));

    await expect(ports.load(RUN_ID)).rejects.toThrow(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_MONGO_LEDGER_RUN_DOCUMENT_ENVELOPE_INVALID',
    );
  });
});

async function initialize(
  ports: MediaSourcePtsCadenceVersionEvidenceBackfillRunLedgerPortsV1,
  initial: MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
) {
  return ports.compareAndSet({
    migrationRunId: RUN_ID,
    expectedRecordSha256: null,
    next: initial,
    acceptedReceipt: null,
  });
}

function runRecord(): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    upperBoundCursor: UPPER_BOUND,
    createdAt: '2026-08-30T22:00:00.000Z',
  });
}

function mongoMemory() {
  const runs = memoryCollection();
  const receipts = memoryCollection();
  const sessions: Array<ReturnType<typeof memorySession>> = [];
  const transactionOptions: unknown[] = [];
  const runtime: MediaSourcePtsCadenceVersionEvidenceBackfillMongoRuntimeV1 = {
    runs,
    receipts,
    startSession: vi.fn(async () => {
      const session = memorySession(runs, receipts, transactionOptions);
      sessions.push(session);
      return session;
    }),
  };
  return { runtime, runs, receipts, sessions, transactionOptions };
}

function memorySession(
  runs: ReturnType<typeof memoryCollection>,
  receipts: ReturnType<typeof memoryCollection>,
  optionsSeen: unknown[],
) {
  const endSession = vi.fn(async () => undefined);
  const session: MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1 & {
    endSession: typeof endSession;
  } = {
    driverSession: { sessionId: 'memory-session' },
    withTransaction: async <T>(
      operation: () => Promise<T>,
      options: Parameters<
        MediaSourcePtsCadenceVersionEvidenceBackfillMongoSessionV1[
          'withTransaction'
        ]
      >[1],
    ) => {
      optionsSeen.push(options);
      const runSnapshot = runs.snapshot();
      const receiptSnapshot = receipts.snapshot();
      try {
        return await operation();
      } catch (error) {
        runs.restore(runSnapshot);
        receipts.restore(receiptSnapshot);
        throw error;
      }
    },
    endSession,
  };
  return session;
}

function memoryCollection() {
  type MongoDocument = Record<string, unknown>;
  let documents = new Map<string, MongoDocument>();
  const createIndex = vi.fn(async (_keys, options: { name: string }) => (
    options.name
  ));
  const findOne = vi.fn(async (filter: MongoDocument) => (
    documents.get(String(filter._id)) ?? null
  ));
  const updateOne = vi.fn(async (
    filter: MongoDocument,
    update: { $setOnInsert: MongoDocument },
  ) => {
    const key = String(filter._id);
    if (documents.has(key)) return { matchedCount: 1, upsertedCount: 0 };
    documents.set(key, update.$setOnInsert);
    return { matchedCount: 0, upsertedCount: 1 };
  });
  const replaceOne = vi.fn(async (
    filter: MongoDocument,
    replacement: MongoDocument,
  ) => {
    const key = String(filter._id);
    const current = documents.get(key);
    if (!current || current.recordSha256 !== filter.recordSha256) {
      return { matchedCount: 0 };
    }
    documents.set(key, replacement);
    return { matchedCount: 1 };
  });
  const collection:
    MediaSourcePtsCadenceVersionEvidenceBackfillMongoCollectionV1 = {
      createIndex,
      findOne,
      updateOne,
      replaceOne,
    };
  return Object.assign(collection, {
    document: (key: string) => documents.get(key) ?? null,
    size: () => documents.size,
    seed: (document: MongoDocument) => {
      documents.set(String(document._id), document);
    },
    mutate: (
      key: string,
      change: (document: MongoDocument) => MongoDocument,
    ) => {
      const current = documents.get(key);
      if (!current) throw new Error('TEST_DOCUMENT_MISSING');
      documents.set(key, change(current));
    },
    snapshot: () => new Map(documents),
    restore: (snapshot: Map<string, MongoDocument>) => {
      documents = new Map(snapshot);
    },
  });
}

async function receipt(
  completedAt: string,
): Promise<MediaSourcePtsCadenceVersionEvidenceBackfillBatchReceiptV1> {
  const result = await runMediaSourcePtsCadenceVersionEvidenceBackfillBatchV1({
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    afterCursor: null,
    upperBoundCursor: UPPER_BOUND,
    limit: 2,
    completedAt: new Date(completedAt),
  }, {
    loadCandidates: vi.fn(async () => [candidate('asset-a')]),
    backfillCandidate: vi.fn(async (asset) => {
      if (typeof asset.assetId !== 'string') {
        throw new Error('TEST_ASSET_ID_INVALID');
      }
      return success(asset.assetId);
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
