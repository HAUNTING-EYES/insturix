import { describe, expect, it, vi } from 'vitest';

import { createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-attempt-policy-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1,
  type MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1,
  type MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1,
  type MediaSourceAudioEvidenceBackfillRecoveryMongoSessionV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-mongo-selector-v1';
import {
  createMediaSourceAudioEvidenceBackfillRunRecordV1,
  type MediaSourceAudioEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';

const CONTROLLER_ID = 'audio-evidence-backfill-recovery-global-v1';
const STALE_BEFORE = new Date('2026-08-30T22:00:00.000Z');
const ATTEMPT_POLICY =
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
    maxAttempts: 4,
    leaseMs: 60_000,
    retryBaseMs: 1_000,
    retryMaxMs: 8_000,
  });

describe('MediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1', () => {
  it('persists the controller and immutable sweep intent in one snapshot', async () => {
    const memory = mongoMemory([
      run('run-b', '2026-08-30T20:01:00.000Z'),
      run('run-a', '2026-08-30T20:00:00.000Z'),
      run('run-c', '2026-08-30T20:02:00.000Z'),
    ]);
    const selector = selectorFor(memory);

    const result = await selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 2,
      attemptPolicy: ATTEMPT_POLICY,
    });

    expect(result.disposition).toBe('SELECTED');
    if (result.disposition !== 'SELECTED') throw new Error('TEST_SWEEP_MISSING');
    expect(result.intent.entries.map((entry) => entry.migrationRunId))
      .toEqual(['run-a', 'run-b']);
    expect(result.intent.wrapped).toBe(false);
    expect(result.controller).toMatchObject({
      controllerId: CONTROLLER_ID,
      recordVersion: 2,
      cycleCount: 0,
      selectedSweepCount: 1,
      selectedRunCount: 2,
      cursor: {
        migrationRunId: 'run-b',
        runUpdatedAt: '2026-08-30T20:01:00.000Z',
      },
    });
    expect(memory.controllers.size()).toBe(1);
    expect(memory.sweeps.size()).toBe(1);
    expect(memory.sweeps.document(result.intent.sweepIntentSha256))
      .toMatchObject({
        status: 'PENDING',
        attemptCount: 0,
        attemptPolicy: ATTEMPT_POLICY,
        claimToken: null,
        claimedAt: null,
        lastAttemptSha256: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date('2026-08-30T22:01:00.000Z'),
        intent: result.intent,
      });
    expect(memory.runs.createIndex).toHaveBeenCalledTimes(1);
    expect(memory.controllers.createIndex).toHaveBeenCalledTimes(1);
    expect(memory.sweeps.createIndex).toHaveBeenCalledTimes(2);
    expect(memory.transactionOptions).toContainEqual({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
    expect(memory.sessions.every((session) => (
      session.endSession.mock.calls.length === 1
    ))).toBe(true);
  });

  it('rejects a tampered attempt policy before touching Mongo', async () => {
    const memory = mongoMemory([
      run('run-a', '2026-08-30T20:00:00.000Z'),
    ]);
    const selector = selectorFor(memory);

    await expect(selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 1,
      attemptPolicy: { ...ATTEMPT_POLICY, maxAttempts: 5 },
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_POLICY_HASH_INVALID',
    );
    expect(memory.runs.createIndex).not.toHaveBeenCalled();
    expect(memory.sessions).toHaveLength(0);
  });

  it('moves through the ordered set and wraps instead of pinning the oldest run', async () => {
    const memory = mongoMemory([
      run('poison-oldest', '2026-08-30T20:00:00.000Z'),
      run('run-b', '2026-08-30T20:01:00.000Z'),
      run('run-c', '2026-08-30T20:02:00.000Z'),
    ]);
    const selector = selectorFor(memory);
    const selected = [];

    for (const minute of [1, 2, 3, 4]) {
      const result = await selector.selectNext({
        controllerId: CONTROLLER_ID,
        staleBefore: STALE_BEFORE,
        selectedAt: new Date(`2026-08-30T22:0${minute}:00.000Z`),
        limit: 1,
        attemptPolicy: ATTEMPT_POLICY,
      });
      if (result.disposition !== 'SELECTED') {
        throw new Error('TEST_SWEEP_MISSING');
      }
      selected.push({
        migrationRunId: result.intent.entries[0]!.migrationRunId,
        wrapped: result.intent.wrapped,
        cycleCount: result.controller.cycleCount,
      });
    }

    expect(selected).toEqual([
      { migrationRunId: 'poison-oldest', wrapped: false, cycleCount: 0 },
      { migrationRunId: 'run-b', wrapped: false, cycleCount: 0 },
      { migrationRunId: 'run-c', wrapped: false, cycleCount: 0 },
      { migrationRunId: 'poison-oldest', wrapped: true, cycleCount: 1 },
    ]);
    expect(memory.sweeps.size()).toBe(4);
    expect(memory.controllers.document(CONTROLLER_ID)).toMatchObject({
      recordVersion: 5,
      record: {
        cycleCount: 1,
        selectedSweepCount: 4,
        selectedRunCount: 4,
      },
    });
  });

  it('persists an empty controller and can select a run that becomes stale later', async () => {
    const memory = mongoMemory();
    const selector = selectorFor(memory);

    const empty = await selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 2,
      attemptPolicy: ATTEMPT_POLICY,
    });
    expect(empty).toMatchObject({
      disposition: 'NO_CANDIDATES',
      controller: { recordVersion: 1, cursor: null },
    });
    expect(memory.sweeps.size()).toBe(0);

    memory.runs.seed(runDocument(
      run('run-later', '2026-08-30T22:01:30.000Z'),
    ));
    const selected = await selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: new Date('2026-08-30T22:02:00.000Z'),
      selectedAt: new Date('2026-08-30T22:03:00.000Z'),
      limit: 2,
      attemptPolicy: ATTEMPT_POLICY,
    });
    expect(selected.disposition).toBe('SELECTED');
    if (selected.disposition !== 'SELECTED') throw new Error('TEST_SWEEP_MISSING');
    expect(selected.intent.entries[0]!.migrationRunId).toBe('run-later');
    expect(selected.controller.recordVersion).toBe(2);
  });

  it('rolls back each lost controller CAS without leaving an orphan sweep', async () => {
    const memory = mongoMemory([
      run('run-a', '2026-08-30T20:00:00.000Z'),
      run('run-b', '2026-08-30T20:01:00.000Z'),
    ]);
    const selector = selectorFor(memory);
    await selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 1,
      attemptPolicy: ATTEMPT_POLICY,
    });
    memory.controllers.failNextReplaces(3);

    await expect(selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:02:00.000Z'),
      limit: 1,
      attemptPolicy: ATTEMPT_POLICY,
    })).rejects.toMatchObject({
      code: 'CONTROLLER_CAS_LOST',
      retryableRace: true,
    });
    expect(memory.controllers.replaceOne).toHaveBeenCalledTimes(3);
    expect(memory.sweeps.size()).toBe(1);
    expect(memory.controllers.document(CONTROLLER_ID)).toMatchObject({
      recordVersion: 2,
      record: { cursor: { migrationRunId: 'run-a' } },
    });
    expect(memory.sessions).toHaveLength(4);
  });

  it('rejects a corrupt projected run before persisting selection state', async () => {
    const memory = mongoMemory([
      run('run-a', '2026-08-30T20:00:00.000Z'),
    ]);
    memory.runs.transformFindMany((document) => ({
      ...document,
      recordSha256: 'f'.repeat(64),
    }));
    const selector = selectorFor(memory);

    await expect(selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 1,
      attemptPolicy: ATTEMPT_POLICY,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MONGO_CANDIDATE_DOCUMENT_ENVELOPE_INVALID',
    );
    expect(memory.controllers.size()).toBe(0);
    expect(memory.sweeps.size()).toBe(0);
    expect(memory.sessions).toHaveLength(1);
  });

  it('retries index initialization after a transient setup failure', async () => {
    const memory = mongoMemory([
      run('run-a', '2026-08-30T20:00:00.000Z'),
    ]);
    memory.runs.failNextIndex(new Error('INDEX_TEMPORARILY_UNAVAILABLE'));
    const selector = selectorFor(memory);
    const input = {
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 1,
      attemptPolicy: ATTEMPT_POLICY,
    } as const;

    await expect(selector.selectNext(input)).rejects.toThrow(
      'INDEX_TEMPORARILY_UNAVAILABLE',
    );
    expect(memory.sessions).toHaveLength(0);
    expect((await selector.selectNext(input)).disposition).toBe('SELECTED');
    expect(memory.runs.createIndex).toHaveBeenCalledTimes(2);
    expect(memory.controllers.createIndex).toHaveBeenCalledTimes(1);
    expect(memory.sweeps.createIndex).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the transaction callback was not committed', async () => {
    const memory = mongoMemory([
      run('run-a', '2026-08-30T20:00:00.000Z'),
    ]);
    memory.skipNextTransactionCallback();
    const selector = selectorFor(memory);

    await expect(selector.selectNext({
      controllerId: CONTROLLER_ID,
      staleBefore: STALE_BEFORE,
      selectedAt: new Date('2026-08-30T22:01:00.000Z'),
      limit: 1,
      attemptPolicy: ATTEMPT_POLICY,
    })).rejects.toThrow(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_MONGO_TRANSACTION_NOT_COMMITTED',
    );
    expect(memory.controllers.size()).toBe(0);
    expect(memory.sweeps.size()).toBe(0);
    expect(memory.sessions[0]!.endSession).toHaveBeenCalledTimes(1);
  });
});

function selectorFor(memory: ReturnType<typeof mongoMemory>) {
  return createMediaSourceAudioEvidenceBackfillRecoveryMongoSelectorV1({
    loadRuntime: async () => memory.runtime,
  });
}

function run(
  migrationRunId: string,
  createdAt: string,
): MediaSourceAudioEvidenceBackfillRunRecordV1 {
  return createMediaSourceAudioEvidenceBackfillRunRecordV1({
    migrationRunId,
    policyVersion: 'audio-evidence-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt,
  });
}

function runDocument(record: MediaSourceAudioEvidenceBackfillRunRecordV1) {
  return {
    _id: record.migrationRunId,
    schemaVersion: 1,
    kind: 'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RUN_DOCUMENT_V1',
    migrationRunId: record.migrationRunId,
    record,
    recordSha256: record.recordSha256,
    status: record.status,
    updatedAt: new Date(record.updatedAt),
  };
}

type MongoRecord = Record<string, unknown>;
type MemoryCollection = ReturnType<typeof memoryCollection>;

function mongoMemory(
  records: readonly MediaSourceAudioEvidenceBackfillRunRecordV1[] = [],
) {
  const runs = memoryCollection();
  const controllers = memoryCollection();
  const sweeps = memoryCollection();
  for (const record of records) runs.seed(runDocument(record));
  const sessions: Array<ReturnType<typeof memorySession>> = [];
  const transactionOptions: unknown[] = [];
  let skipTransactionCallback = false;
  const runtime: MediaSourceAudioEvidenceBackfillRecoveryMongoRuntimeV1 = {
    runs,
    controllers,
    sweeps,
    startSession: vi.fn(async () => {
      const session = memorySession(
        [runs, controllers, sweeps],
        transactionOptions,
        () => {
          if (!skipTransactionCallback) return false;
          skipTransactionCallback = false;
          return true;
        },
      );
      sessions.push(session);
      return session;
    }),
  };
  return {
    runtime,
    runs,
    controllers,
    sweeps,
    sessions,
    transactionOptions,
    skipNextTransactionCallback: () => {
      skipTransactionCallback = true;
    },
  };
}

function memorySession(
  collections: readonly MemoryCollection[],
  optionsSeen: unknown[],
  shouldSkipCallback: () => boolean,
) {
  const endSession = vi.fn(async () => undefined);
  const session: MediaSourceAudioEvidenceBackfillRecoveryMongoSessionV1 & {
    endSession: typeof endSession;
  } = {
    driverSession: { sessionId: 'memory-session' },
    withTransaction: async <T>(
      operation: () => Promise<T>,
      options: Parameters<
        MediaSourceAudioEvidenceBackfillRecoveryMongoSessionV1['withTransaction']
      >[1],
    ) => {
      optionsSeen.push(options);
      if (shouldSkipCallback()) return undefined;
      const snapshots = collections.map((collection) => collection.snapshot());
      try {
        return await operation();
      } catch (error) {
        collections.forEach((collection, index) => {
          collection.restore(snapshots[index]!);
        });
        throw error;
      }
    },
    endSession,
  };
  return session;
}

function memoryCollection() {
  let documents = new Map<string, MongoRecord>();
  let nextIndexError: Error | null = null;
  let replaceFailuresRemaining = 0;
  let findManyTransform: (document: MongoRecord) => MongoRecord = (
    document,
  ) => document;
  const createIndex = vi.fn(async (_keys, options: { name: string }) => {
    if (nextIndexError !== null) {
      const error = nextIndexError;
      nextIndexError = null;
      throw error;
    }
    return options.name;
  });
  const findOne = vi.fn(async (filter: MongoRecord) => (
    documents.get(String(filter._id)) ?? null
  ));
  const findMany = vi.fn(async (
    filter: MongoRecord,
    options: Readonly<{
      projection: Readonly<Record<string, 1>>;
      limit: number;
    }>,
  ) => {
    const matches = [...documents.values()]
      .filter((document) => matchesCandidateFilter(document, filter))
      .sort(compareRunDocuments)
      .slice(0, options.limit)
      .map((document) => project(document, options.projection))
      .map(findManyTransform);
    return matches;
  });
  const updateOne = vi.fn(async (
    filter: MongoRecord,
    update: { $setOnInsert: MongoRecord },
  ) => {
    const key = String(filter._id);
    if (documents.has(key)) return { upsertedCount: 0 };
    documents.set(key, update.$setOnInsert);
    return { upsertedCount: 1 };
  });
  const replaceOne = vi.fn(async (
    filter: MongoRecord,
    replacement: MongoRecord,
  ) => {
    if (replaceFailuresRemaining > 0) {
      replaceFailuresRemaining -= 1;
      return { matchedCount: 0 };
    }
    const key = String(filter._id);
    const current = documents.get(key);
    if (!current || current.recordSha256 !== filter.recordSha256) {
      return { matchedCount: 0 };
    }
    documents.set(key, replacement);
    return { matchedCount: 1 };
  });
  const collection: MediaSourceAudioEvidenceBackfillRecoveryMongoCollectionV1 = {
    createIndex,
    findOne,
    findMany,
    updateOne,
    replaceOne,
  };
  return Object.assign(collection, {
    document: (key: string) => documents.get(key) ?? null,
    size: () => documents.size,
    seed: (document: MongoRecord) => {
      documents.set(String(document._id), document);
    },
    transformFindMany: (
      transform: (document: MongoRecord) => MongoRecord,
    ) => {
      findManyTransform = transform;
    },
    failNextIndex: (error: Error) => {
      nextIndexError = error;
    },
    failNextReplaces: (count: number) => {
      replaceFailuresRemaining = count;
    },
    snapshot: () => new Map(documents),
    restore: (snapshot: Map<string, MongoRecord>) => {
      documents = new Map(snapshot);
    },
  });
}

function matchesCandidateFilter(
  document: MongoRecord,
  filter: MongoRecord,
): boolean {
  const clauses = Array.isArray(filter.$and)
    ? filter.$and as readonly MongoRecord[]
    : null;
  const base = clauses?.[0] ?? filter;
  if (document.schemaVersion !== base.schemaVersion
    || document.kind !== base.kind
    || document.status !== base.status) return false;
  const staleBefore = (base.updatedAt as { $lte: Date }).$lte;
  const updatedAt = document.updatedAt as Date;
  if (updatedAt.getTime() > staleBefore.getTime()) return false;
  if (clauses === null) return true;
  const afterClause = clauses[1]!.$or as readonly MongoRecord[];
  const runUpdatedAt = (afterClause[0]!.updatedAt as { $gt: Date }).$gt;
  const migrationRunId = (afterClause[1]!.migrationRunId as { $gt: string }).$gt;
  return updatedAt.getTime() > runUpdatedAt.getTime()
    || (updatedAt.getTime() === runUpdatedAt.getTime()
      && String(document.migrationRunId) > migrationRunId);
}

function compareRunDocuments(left: MongoRecord, right: MongoRecord): number {
  const leftTime = (left.updatedAt as Date).getTime();
  const rightTime = (right.updatedAt as Date).getTime();
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left.migrationRunId).localeCompare(String(right.migrationRunId));
}

function project(
  document: MongoRecord,
  projection: Readonly<Record<string, 1>>,
): MongoRecord {
  return Object.fromEntries(
    Object.keys(projection).map((key) => [key, document[key]]),
  );
}
