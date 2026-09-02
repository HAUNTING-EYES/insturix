import { describe, expect, it } from 'vitest';

import {
  parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-attempt-mongo-document-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-attempt-policy-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-mongo-document-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-mongo-store-v1';
import {
  claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-state-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  createMediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  selectMediaSourceAudioEvidenceBackfillRecoverySweepV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-v1';
import { createMediaSourceAudioEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';

type MongoRecord = Record<string, unknown>;
type FindOptionsV1 = Parameters<
  MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1[
    'findOne'
  ]
>[1];
type TransactionOptionsV1 = Parameters<
  MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1[
    'withTransaction'
  ]
>[1];

const POLICY = createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
  maxAttempts: 3,
  leaseMs: 1_000,
  retryBaseMs: 2_000,
  retryMaxMs: 4_000,
});

describe('MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1', () => {
  it('claims the earliest eligibility across due and expired-lease indexes', async () => {
    const due = pendingState('run-due', '2026-08-30T18:00:03.000Z');
    const expiredPending = pendingState(
      'run-expired',
      '2026-08-30T18:00:00.000Z',
    );
    const expired = claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
      expiredPending,
      { claimToken: 'old-worker', claimedAt: expiredPending.createdAt },
    ).state;
    const fixture = storeFixture(due, expired);

    const claim = await fixture.store.claimNext({
      claimToken: 'new-worker',
      claimedAt: new Date('2026-08-30T18:00:10.000Z'),
    });

    expect(claim).toMatchObject({
      sweepIntentSha256: expired.sweepIntentSha256,
      attemptNumber: 1,
      claimToken: 'new-worker',
      previousAttemptSha256: null,
    });
    expect((await fixture.store.load(expired.sweepIntentSha256))).toMatchObject({
      status: 'RUNNING',
      claimToken: 'new-worker',
      attemptCount: 0,
    });
    expect((await fixture.store.load(due.sweepIntentSha256))?.status)
      .toBe('PENDING');
    expect(fixture.runtime.sweeps.indexes).toEqual([
      {
        keys: {
          status: 1,
          nextAttemptAt: 1,
          createdAt: 1,
          sweepIntentSha256: 1,
        },
        options: { name: 'audio_evidence_backfill_recovery_sweep_due_v1' },
      },
      {
        keys: {
          status: 1,
          leaseExpiresAt: 1,
          createdAt: 1,
          sweepIntentSha256: 1,
        },
        options: {
          name: 'audio_evidence_backfill_recovery_sweep_expired_lease_v1',
        },
      },
    ]);
    expect(fixture.runtime.attempts.indexes).toEqual([{
      keys: { sweepIntentSha256: 1, attemptNumber: 1 },
      options: {
        name: 'uniq_audio_evidence_backfill_recovery_attempt_number_v1',
        unique: true,
      },
    }]);
    expect(fixture.runtime.sweeps.findCalls.slice(0, 2).map(
      (call) => call.options.hint,
    )).toEqual([
      'audio_evidence_backfill_recovery_sweep_due_v1',
      'audio_evidence_backfill_recovery_sweep_expired_lease_v1',
    ]);
    expect(fixture.runtime.transactionOptions[0]).toEqual({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  });

  it('atomically settles immutable attempt evidence and recognizes replay', async () => {
    const initial = pendingState('run-complete', '2026-08-30T18:10:00.000Z');
    const fixture = storeFixture(initial);
    const claim = requiredClaim(await fixture.store.claimNext({
      claimToken: 'complete-worker',
      claimedAt: new Date(initial.createdAt),
    }));
    const attempt = recoveryAttempt(
      claim,
      'COMPLETE',
      '2026-08-30T18:10:00.500Z',
    );

    const settled = await fixture.store.settle({
      sweepIntentSha256: claim.sweepIntentSha256,
      claimedRecordSha256: claim.claimedRecordSha256,
      claimToken: claim.claimToken,
      attempt,
    });
    const replayed = await fixture.store.settle({
      sweepIntentSha256: claim.sweepIntentSha256,
      claimedRecordSha256: claim.claimedRecordSha256,
      claimToken: claim.claimToken,
      attempt,
    });

    expect(settled).toMatchObject({
      disposition: 'SETTLED',
      state: {
        status: 'COMPLETE',
        attemptCount: 1,
        lastAttemptSha256: attempt.attemptSha256,
      },
    });
    expect(replayed).toMatchObject({
      disposition: 'ALREADY_SETTLED',
      state: { recordSha256: settled.state.recordSha256 },
    });
    expect(fixture.runtime.attempts.documents.size).toBe(1);
    expect(parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
      fixture.runtime.attempts.required(attempt.attemptSha256),
      claim.intent,
    )).toEqual(attempt);
  });

  it('holds retry-required work until the exact frozen retry time', async () => {
    const initial = pendingState('run-retry', '2026-08-30T18:20:00.000Z');
    const fixture = storeFixture(initial);
    const firstClaim = requiredClaim(await fixture.store.claimNext({
      claimToken: 'retry-worker-1',
      claimedAt: new Date(initial.createdAt),
    }));
    const firstAttempt = recoveryAttempt(
      firstClaim,
      'RETRY_REQUIRED',
      '2026-08-30T18:20:00.500Z',
    );
    const settled = await fixture.store.settle({
      sweepIntentSha256: firstClaim.sweepIntentSha256,
      claimedRecordSha256: firstClaim.claimedRecordSha256,
      claimToken: firstClaim.claimToken,
      attempt: firstAttempt,
    });

    expect(settled.state).toMatchObject({
      status: 'RETRY_WAIT',
      nextAttemptAt: '2026-08-30T18:20:02.500Z',
    });
    expect(await fixture.store.claimNext({
      claimToken: 'retry-worker-too-early',
      claimedAt: new Date('2026-08-30T18:20:02.499Z'),
    })).toBeNull();
    const secondClaim = requiredClaim(await fixture.store.claimNext({
      claimToken: 'retry-worker-2',
      claimedAt: new Date('2026-08-30T18:20:02.500Z'),
    }));
    expect(secondClaim).toMatchObject({
      attemptNumber: 2,
      previousAttemptSha256: firstAttempt.attemptSha256,
    });
  });

  it('fences a stale worker after lease reclaim', async () => {
    const initial = pendingState('run-fenced', '2026-08-30T18:30:00.000Z');
    const oldTransition =
      claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(initial, {
        claimToken: 'stale-worker',
        claimedAt: initial.createdAt,
      });
    const fixture = storeFixture(oldTransition.state);
    const reclaimed = requiredClaim(await fixture.store.claimNext({
      claimToken: 'replacement-worker',
      claimedAt: new Date('2026-08-30T18:30:02.000Z'),
    }));
    const staleAttempt = recoveryAttempt(
      oldTransition.claim,
      'COMPLETE',
      '2026-08-30T18:30:00.500Z',
    );

    await expect(fixture.store.settle({
      sweepIntentSha256: oldTransition.claim.sweepIntentSha256,
      claimedRecordSha256: oldTransition.claim.claimedRecordSha256,
      claimToken: oldTransition.claim.claimToken,
      attempt: staleAttempt,
    })).rejects.toThrow('SETTLEMENT_CLAIM_STATE_CONFLICT');

    const replacementAttempt = recoveryAttempt(
      reclaimed,
      'COMPLETE',
      '2026-08-30T18:30:02.500Z',
    );
    await expect(fixture.store.settle({
      sweepIntentSha256: reclaimed.sweepIntentSha256,
      claimedRecordSha256: reclaimed.claimedRecordSha256,
      claimToken: reclaimed.claimToken,
      attempt: replacementAttempt,
    })).resolves.toMatchObject({
      disposition: 'SETTLED',
      state: { status: 'COMPLETE' },
    });
  });

  it('rolls back an attempt insert and retries a lost settlement CAS', async () => {
    const initial = pendingState('run-cas-retry', '2026-08-30T18:40:00.000Z');
    const fixture = storeFixture(initial);
    fixture.runtime.sweeps.casMisses = 1;
    const claim = requiredClaim(await fixture.store.claimNext({
      claimToken: 'cas-worker',
      claimedAt: new Date(initial.createdAt),
    }));
    const attempt = recoveryAttempt(
      claim,
      'COMPLETE',
      '2026-08-30T18:40:00.500Z',
    );
    fixture.runtime.sweeps.casMisses = 1;

    await expect(fixture.store.settle({
      sweepIntentSha256: claim.sweepIntentSha256,
      claimedRecordSha256: claim.claimedRecordSha256,
      claimToken: claim.claimToken,
      attempt,
    })).resolves.toMatchObject({ disposition: 'SETTLED' });
    expect(fixture.runtime.attempts.documents.size).toBe(1);
    expect(fixture.runtime.sessionsStarted).toBe(4);
    expect(fixture.runtime.sessionsEnded).toBe(4);
  });

  it('stops after three CAS races without mutating the pending sweep', async () => {
    const initial = pendingState('run-cas-stop', '2026-08-30T18:50:00.000Z');
    const fixture = storeFixture(initial);
    fixture.runtime.sweeps.casMisses = 3;

    await expect(fixture.store.claimNext({
      claimToken: 'losing-worker',
      claimedAt: new Date(initial.createdAt),
    })).rejects.toThrow('CLAIM_CAS_LOST');
    expect(fixture.runtime.sessionsStarted).toBe(3);
    expect((await fixture.store.load(initial.sweepIntentSha256))?.recordSha256)
      .toBe(initial.recordSha256);
  });

  it('rejects malformed persisted sweep envelopes before claiming', async () => {
    const initial = pendingState('run-malformed', '2026-08-30T19:00:00.000Z');
    const fixture = storeFixture();
    fixture.runtime.sweeps.seed({
      ...createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
        initial,
      ),
      hiddenFallback: true,
    });

    await expect(fixture.store.claimNext({
      claimToken: 'strict-worker',
      claimedAt: new Date(initial.createdAt),
    })).rejects.toThrow('SWEEP_MONGO_DOCUMENT_FIELDS_INVALID');
    expect(fixture.runtime.sweeps.replaceCalls).toBe(0);
  });

  it('does not call a response replay idempotent when its attempt chain is missing', async () => {
    const initial = pendingState('run-chain', '2026-08-30T19:10:00.000Z');
    const fixture = storeFixture(initial);
    const claim = requiredClaim(await fixture.store.claimNext({
      claimToken: 'chain-worker',
      claimedAt: new Date(initial.createdAt),
    }));
    const attempt = recoveryAttempt(
      claim,
      'COMPLETE',
      '2026-08-30T19:10:00.500Z',
    );
    await fixture.store.settle({
      sweepIntentSha256: claim.sweepIntentSha256,
      claimedRecordSha256: claim.claimedRecordSha256,
      claimToken: claim.claimToken,
      attempt,
    });
    fixture.runtime.attempts.documents.delete(attempt.attemptSha256);

    await expect(fixture.store.settle({
      sweepIntentSha256: claim.sweepIntentSha256,
      claimedRecordSha256: claim.claimedRecordSha256,
      claimToken: claim.claimToken,
      attempt,
    })).rejects.toThrow('SETTLEMENT_ATTEMPT_CHAIN_INCOMPLETE');
  });
});

function pendingState(
  migrationRunId: string,
  selectedAt: string,
): MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 {
  const createdAt = new Date(Date.parse(selectedAt) - 10_000).toISOString();
  const controller = createMediaSourceAudioEvidenceBackfillRecoveryControllerV1({
    controllerId: `controller-${migrationRunId}`,
    createdAt,
  });
  const candidate = createMediaSourceAudioEvidenceBackfillRunRecordV1({
    migrationRunId,
    policyVersion: 'audio-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt,
  });
  const intent = selectMediaSourceAudioEvidenceBackfillRecoverySweepV1(
    controller,
    {
      candidates: [candidate],
      wrapped: false,
      staleBefore: selectedAt,
      selectedAt,
    },
  ).intent;
  return createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
    intent,
    POLICY,
  );
}

function recoveryAttempt(
  claim: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
  disposition: 'COMPLETE' | 'RETRY_REQUIRED',
  attemptedAt: string,
) {
  const entry = claim.intent.entries[0]!;
  const result = disposition === 'COMPLETE'
    ? {
        migrationRunId: entry.migrationRunId,
        expectedRecordSha256: entry.expectedRecordSha256,
        disposition: 'DISPATCHED' as const,
        reason: null,
        messageId: `message-${claim.attemptNumber}`,
        deduplicationId: claim.attemptNumber.toString(16).repeat(64),
      }
    : {
        migrationRunId: entry.migrationRunId,
        expectedRecordSha256: entry.expectedRecordSha256,
        disposition: 'UNCONFIRMED' as const,
        reason: 'DISPATCH_RUNTIME_UNAVAILABLE' as const,
        messageId: null,
        deduplicationId: null,
      };
  return createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    claim.intent,
    {
      attemptNumber: claim.attemptNumber,
      previousAttemptSha256: claim.previousAttemptSha256,
      attemptedAt,
      results: [result],
    },
  );
}

function requiredClaim(
  value: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 | null,
): MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 {
  if (value === null) throw new Error('TEST_EXPECTED_RECOVERY_CLAIM');
  return value;
}

function storeFixture(
  ...states: readonly MediaSourceAudioEvidenceBackfillRecoverySweepStateV1[]
) {
  const runtime = new MemoryRuntime();
  for (const state of states) {
    runtime.sweeps.seed(
      createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
        state,
      ),
    );
  }
  return {
    runtime,
    store: createMediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1({
      loadRuntime: async () => runtime,
    }),
  };
}

class MemoryRuntime implements
  MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1 {
  readonly sweeps = new MemoryCollection();
  readonly attempts = new MemoryCollection(true);
  readonly transactionOptions: unknown[] = [];
  sessionsStarted = 0;
  sessionsEnded = 0;

  async startSession(): Promise<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1
  > {
    this.sessionsStarted += 1;
    const session: MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1 = {
      driverSession: Object.freeze({ session: this.sessionsStarted }),
      withTransaction: async <T>(
        operation: () => Promise<T>,
        options: TransactionOptionsV1,
      ): Promise<T> => {
        this.transactionOptions.push(options);
        const sweeps = this.sweeps.snapshot();
        const attempts = this.attempts.snapshot();
        try {
          return await operation();
        } catch (error) {
          this.sweeps.restore(sweeps);
          this.attempts.restore(attempts);
          throw error;
        }
      },
      endSession: async () => {
        this.sessionsEnded += 1;
      },
    };
    return session;
  }
}

class MemoryCollection implements
  MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1 {
  documents = new Map<string, MongoRecord>();
  readonly indexes: Array<Readonly<{
    keys: Readonly<Record<string, 1 | -1>>;
    options: Readonly<{ name: string; unique?: boolean }>;
  }>> = [];
  readonly findCalls: Array<Readonly<{
    filter: Readonly<MongoRecord>;
    options: FindOptionsV1;
  }>> = [];
  replaceCalls = 0;
  casMisses = 0;

  constructor(private readonly uniqueAttemptNumber = false) {}

  async createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string> {
    this.indexes.push({ keys, options });
    return options.name;
  }

  async findOne(
    filter: Readonly<MongoRecord>,
    options: FindOptionsV1,
  ): Promise<MongoRecord | null> {
    this.findCalls.push({ filter, options });
    const matching = [...this.documents.values()].filter(
      (document) => matches(document, filter),
    );
    if (options.sort) matching.sort((left, right) => compareBySort(
      left,
      right,
      options.sort!,
    ));
    return matching[0] ?? null;
  }

  async updateOne(
    filter: Readonly<MongoRecord>,
    update: Readonly<{ $setOnInsert: Readonly<MongoRecord> }>,
    _options: Readonly<{ session: unknown; upsert: true }>,
  ): Promise<Readonly<{ matchedCount: number; upsertedCount: number }>> {
    const id = stringField(filter, '_id');
    if (this.documents.has(id)) {
      return { matchedCount: 1, upsertedCount: 0 };
    }
    const document = record(update.$setOnInsert);
    if (this.uniqueAttemptNumber && [...this.documents.values()].some(
      (stored) => stored.sweepIntentSha256 === document.sweepIntentSha256
        && stored.attemptNumber === document.attemptNumber,
    )) {
      throw Object.assign(new Error('TEST_DUPLICATE_KEY'), { code: 11000 });
    }
    this.documents.set(id, document);
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    _options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ matchedCount: number }>> {
    this.replaceCalls += 1;
    if (this.casMisses > 0) {
      this.casMisses -= 1;
      return { matchedCount: 0 };
    }
    const id = stringField(filter, '_id');
    const current = this.documents.get(id);
    if (!current || !matches(current, filter)) return { matchedCount: 0 };
    this.documents.set(id, record(replacement));
    return { matchedCount: 1 };
  }

  seed(value: Readonly<MongoRecord>): void {
    const document = record(value);
    this.documents.set(stringField(document, '_id'), document);
  }

  required(id: string): MongoRecord {
    const value = this.documents.get(id);
    if (!value) throw new Error('TEST_DOCUMENT_NOT_FOUND_' + id);
    return value;
  }

  snapshot(): Map<string, MongoRecord> {
    return new Map(this.documents);
  }

  restore(snapshot: Map<string, MongoRecord>): void {
    this.documents = new Map(snapshot);
  }
}

function matches(
  document: MongoRecord,
  filter: Readonly<MongoRecord>,
): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (!expected || typeof expected !== 'object' || expected instanceof Date) {
      return actual === expected;
    }
    const operators = expected as Record<string, unknown>;
    if (Array.isArray(operators.$in)
      && !operators.$in.includes(actual)) return false;
    if (operators.$lte !== undefined
      && comparable(actual) > comparable(operators.$lte)) return false;
    return true;
  });
}

function compareBySort(
  left: MongoRecord,
  right: MongoRecord,
  sort: Readonly<Record<string, 1>>,
): number {
  for (const key of Object.keys(sort)) {
    const leftValue = comparable(left[key]);
    const rightValue = comparable(right[key]);
    if (leftValue === rightValue) continue;
    return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

function comparable(value: unknown): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') return value;
  throw new Error('TEST_VALUE_NOT_COMPARABLE');
}

function record(value: unknown): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TEST_MONGO_RECORD_INVALID');
  }
  return value as MongoRecord;
}

function stringField(value: Readonly<MongoRecord>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw new Error('TEST_STRING_FIELD_INVALID');
  return field;
}
