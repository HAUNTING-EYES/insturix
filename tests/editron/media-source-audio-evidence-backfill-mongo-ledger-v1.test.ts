import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { MediaSourceAudioArtifactAssetStateInputV1 }
  from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import type { MediaSourceAudioAvailabilityEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import {
  runMediaSourceAudioEvidenceBackfillBatchV1,
  type MediaSourceAudioEvidenceBackfillBatchReceiptV1,
  type MediaSourceAudioEvidenceBackfillCandidateV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-batch-v1';
import type { MediaSourceAudioEvidenceBackfillResultV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-v1';
import {
  createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1,
  type MediaSourceAudioEvidenceBackfillMongoCollectionV1,
  type MediaSourceAudioEvidenceBackfillMongoRuntimeV1,
  type MediaSourceAudioEvidenceBackfillMongoSessionV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-mongo-ledger-v1';
import {
  advanceMediaSourceAudioEvidenceBackfillRunRecordV1,
  createMediaSourceAudioEvidenceBackfillRunRecordV1,
  failMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';
import type { MediaSourceVersionEvidenceStorePortsV1 }
  from '@/lib/editron/services/media-source-version-evidence-owner-v1';

const RUN_ID = 'audio-evidence-backfill-2026-08-30';
const POLICY = 'audio-evidence-backfill-policy-v1';
const UPPER_BOUND = { assetId: 'asset-z', userId: 'user-z' } as const;

describe('MediaSourceAudioEvidenceBackfillMongoLedgerV1', () => {
  it('creates indexed run storage once and reads from the primary', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1({
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
    expect(memory.sessions.every((session) => session.endSession.mock.calls.length === 1))
      .toBe(true);
  });

  it('commits the re-derived run transition and full receipt atomically', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const accepted = await receipt('2026-08-30T22:01:00.000Z');
    const next = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
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
    const receiptDocument = memory.receipts.document(
      accepted.batchReceiptSha256,
    );
    expect(receiptDocument).toMatchObject({
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
    const ports = createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const winnerReceipt = await receipt('2026-08-30T22:01:00.000Z');
    const winner = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
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
    const staleNext = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
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

  it('re-derives and persists a terminal failure without a batch receipt', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const failed = failMediaSourceAudioEvidenceBackfillRunRecordV1(initial, {
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

  it('rolls back the run update when an existing receipt has wrong acceptance context', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    const accepted = await receipt('2026-08-30T22:01:00.000Z');
    const next = advanceMediaSourceAudioEvidenceBackfillRunRecordV1(
      initial,
      accepted,
    );
    memory.receipts.seed({
      _id: accepted.batchReceiptSha256,
      schemaVersion: 1,
      kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECEIPT_DOCUMENT_V1',
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
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_MONGO_LEDGER_RECEIPT_DOCUMENT_ENVELOPE_INVALID',
    );
    expect(await ports.load(RUN_ID)).toEqual(initial);
  });

  it('rejects a corrupted stored run envelope', async () => {
    const memory = mongoMemory();
    const ports = createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1({
      loadRuntime: async () => memory.runtime,
    });
    const initial = runRecord();
    await initialize(ports, initial);
    memory.runs.mutate(RUN_ID, (document) => ({
      ...document,
      status: 'COMPLETE',
    }));

    await expect(ports.load(RUN_ID)).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_MONGO_LEDGER_RUN_DOCUMENT_ENVELOPE_INVALID',
    );
  });
});

type LedgerPorts = ReturnType<
  typeof createMediaSourceAudioEvidenceBackfillMongoLedgerPortsV1
>;

async function initialize(
  ports: LedgerPorts,
  initial: MediaSourceAudioEvidenceBackfillRunRecordV1,
) {
  return ports.compareAndSet({
    migrationRunId: RUN_ID,
    expectedRecordSha256: null,
    next: initial,
    acceptedReceipt: null,
  });
}

function runRecord(): MediaSourceAudioEvidenceBackfillRunRecordV1 {
  return createMediaSourceAudioEvidenceBackfillRunRecordV1({
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
  const runtime: MediaSourceAudioEvidenceBackfillMongoRuntimeV1 = {
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
  const session: MediaSourceAudioEvidenceBackfillMongoSessionV1 & {
    endSession: typeof endSession;
  } = {
    driverSession: { sessionId: 'memory-session' },
    withTransaction: async <T>(
      operation: () => Promise<T>,
      options: Parameters<
        MediaSourceAudioEvidenceBackfillMongoSessionV1['withTransaction']
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
  type MongoRecord = Record<string, unknown>;
  let documents = new Map<string, MongoRecord>();
  const createIndex = vi.fn(async (_keys, options: { name: string }) => (
    options.name
  ));
  const findOne = vi.fn(async (filter: MongoRecord) => (
    documents.get(String(filter._id)) ?? null
  ));
  const updateOne = vi.fn(async (
    filter: MongoRecord,
    update: { $setOnInsert: MongoRecord },
  ) => {
    const key = String(filter._id);
    if (documents.has(key)) return { matchedCount: 1, upsertedCount: 0 };
    documents.set(key, update.$setOnInsert);
    return { matchedCount: 0, upsertedCount: 1 };
  });
  const replaceOne = vi.fn(async (
    filter: MongoRecord,
    replacement: MongoRecord,
  ) => {
    const key = String(filter._id);
    const current = documents.get(key);
    if (!current || current.recordSha256 !== filter.recordSha256) {
      return { matchedCount: 0 };
    }
    documents.set(key, replacement);
    return { matchedCount: 1 };
  });
  const collection: MediaSourceAudioEvidenceBackfillMongoCollectionV1 = {
    createIndex,
    findOne,
    updateOne,
    replaceOne,
  };
  return Object.assign(collection, {
    document: (key: string) => documents.get(key) ?? null,
    size: () => documents.size,
    seed: (document: MongoRecord) => {
      documents.set(String(document._id), document);
    },
    mutate: (
      key: string,
      change: (document: MongoRecord) => MongoRecord,
    ) => {
      const current = documents.get(key);
      if (!current) throw new Error('TEST_DOCUMENT_MISSING');
      documents.set(key, change(current));
    },
    snapshot: () => new Map(documents),
    restore: (snapshot: Map<string, MongoRecord>) => {
      documents = new Map(snapshot);
    },
  });
}

async function receipt(
  completedAt: string,
): Promise<MediaSourceAudioEvidenceBackfillBatchReceiptV1> {
  const result = await runMediaSourceAudioEvidenceBackfillBatchV1({
    migrationRunId: RUN_ID,
    policyVersion: POLICY,
    afterCursor: null,
    upperBoundCursor: UPPER_BOUND,
    limit: 2,
    completedAt: new Date(completedAt),
  }, {
    loadCandidates: vi.fn(async () => [candidate('asset-a')]),
    backfillCandidate: vi.fn(async () => success('asset-a')),
    availabilityEvidenceStorePorts: evidencePorts(),
    legacyEvidenceStorePorts: evidencePorts(),
  });
  if (!('receipt' in result)) throw new Error('TEST_RECEIPT_MISSING');
  return result.receipt;
}

type TestAsset = MediaSourceAudioArtifactAssetStateInputV1 & {
  assetId: string;
};

function candidate(assetId: string): MediaSourceAudioEvidenceBackfillCandidateV1 {
  return {
    assetId,
    userId: 'user-a',
    asset: { assetId } as TestAsset,
  };
}

function success(sourceVersionSeed: string): MediaSourceAudioEvidenceBackfillResultV1 {
  return {
    disposition: 'BACKFILLED',
    sourceVersionSha256: hashEditronCanonicalJsonV1({ sourceVersionSeed }),
    audioDisposition: 'NO_AUDIO_STREAMS_OBSERVED',
    availabilityWriteDisposition: 'APPLIED',
    availabilityEvidenceSha256: '1'.repeat(64),
    legacyWriteDisposition: 'NOT_REQUIRED',
    legacyEvidenceSha256: null,
  };
}

function evidencePorts(): MediaSourceAudioAvailabilityEvidenceStorePortsV1
  & MediaSourceVersionEvidenceStorePortsV1 {
  return {
    load: vi.fn(async () => null),
    compareAndSet: vi.fn(async () => false),
  };
}
