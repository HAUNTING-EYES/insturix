import type {
  ClientSession,
  Collection,
  Document,
  Filter,
  FindOptions,
  TransactionOptions,
  UpdateFilter,
} from 'mongodb';

import {
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_COLLECTION_V1,
  parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1,
} from './media-source-audio-evidence-backfill-recovery-attempt-mongo-document-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
  parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-mongo-document-v1';
import {
  claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  settleMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-state-v1';
import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-v1';

type MongoRecord = Record<string, unknown>;
type MongoInsert = Readonly<{ $setOnInsert: Readonly<MongoRecord> }>;

const PRIMARY_READ_V1 = 'primary' as const;
const TRANSACTION_OPTIONS_V1 = Object.freeze({
  readConcern: Object.freeze({ level: 'snapshot' as const }),
  writeConcern: Object.freeze({ w: 'majority' as const }),
  readPreference: PRIMARY_READ_V1,
});
const SWEEP_DUE_INDEX_V1 =
  'audio_evidence_backfill_recovery_sweep_due_v1' as const;
const SWEEP_EXPIRED_LEASE_INDEX_V1 =
  'audio_evidence_backfill_recovery_sweep_expired_lease_v1' as const;
const ATTEMPT_NUMBER_INDEX_V1 =
  'uniq_audio_evidence_backfill_recovery_attempt_number_v1' as const;
const MAX_STORE_ATTEMPTS_V1 = 3;

export interface MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1 {
  driverSession: unknown;
  withTransaction<T>(
    operation: () => Promise<T>,
    options: typeof TRANSACTION_OPTIONS_V1,
  ): Promise<T | undefined>;
  endSession(): Promise<void>;
}

export interface MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1 {
  createIndex(
    keys: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ name: string; unique?: boolean }>,
  ): Promise<string>;
  findOne(
    filter: Readonly<MongoRecord>,
    options: Readonly<{
      session?: unknown;
      readPreference: typeof PRIMARY_READ_V1;
      sort?: Readonly<Record<string, 1>>;
      hint?: string;
    }>,
  ): Promise<MongoRecord | null>;
  updateOne(
    filter: Readonly<MongoRecord>,
    update: MongoInsert,
    options: Readonly<{ session: unknown; upsert: true }>,
  ): Promise<Readonly<{ matchedCount: number; upsertedCount: number }>>;
  replaceOne(
    filter: Readonly<MongoRecord>,
    replacement: Readonly<MongoRecord>,
    options: Readonly<{ session: unknown }>,
  ): Promise<Readonly<{ matchedCount: number }>>;
}

export interface MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1 {
  startSession(): Promise<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1
  >;
  sweeps:
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1;
  attempts:
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1;
}

export type MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1 =
  Readonly<{
    disposition: 'SETTLED' | 'ALREADY_SETTLED';
    state: MediaSourceAudioEvidenceBackfillRecoverySweepStateV1;
  }>;

export class MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreErrorV1
  extends Error {
  constructor(
    public readonly code: string,
    public readonly retryableRace = false,
  ) {
    super(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_MONGO_STORE_'
      + code,
    );
    this.name =
      'MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreErrorV1';
  }
}

export function createMediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreV1(
  input: Readonly<{
    loadRuntime?: () => Promise<Readonly<
      MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
    >>;
  }> = {},
): Readonly<{
  claimNext(value: Readonly<{
    claimToken: string;
    claimedAt: Date;
  }>): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 | null>;
  settle(value: Readonly<{
    sweepIntentSha256: string;
    claimedRecordSha256: string;
    claimToken: string;
    attempt: unknown;
  }>): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1>;
  load(
    sweepIntentSha256: string,
  ): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepStateV1 | null>;
}> {
  const loadRuntime = input.loadRuntime ?? loadDefaultRuntime;
  let runtimePromise: Promise<Readonly<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
  >> | null = null;
  let indexesPromise: Promise<void> | null = null;
  const runtime = async () => {
    if (runtimePromise === null) runtimePromise = loadRuntime();
    const pending = runtimePromise;
    try {
      return await pending;
    } catch (error) {
      if (runtimePromise === pending) runtimePromise = null;
      throw error;
    }
  };
  const ensureIndexes = async () => {
    indexesPromise ??= runtime().then(async (resolved) => {
      await resolved.sweeps.createIndex(
        { status: 1, nextAttemptAt: 1, createdAt: 1, sweepIntentSha256: 1 },
        { name: SWEEP_DUE_INDEX_V1 },
      );
      await resolved.sweeps.createIndex(
        { status: 1, leaseExpiresAt: 1, createdAt: 1, sweepIntentSha256: 1 },
        { name: SWEEP_EXPIRED_LEASE_INDEX_V1 },
      );
      await resolved.attempts.createIndex(
        { sweepIntentSha256: 1, attemptNumber: 1 },
        { name: ATTEMPT_NUMBER_INDEX_V1, unique: true },
      );
    });
    try {
      await indexesPromise;
    } catch (error) {
      indexesPromise = null;
      throw error;
    }
  };

  return Object.freeze({
    claimNext: async (value) => {
      const normalized = normalizeClaimInput(value);
      await ensureIndexes();
      const resolved = await runtime();
      return retryStoreRace(() => claimInTransaction(resolved, normalized));
    },
    settle: async (value) => {
      const normalized = normalizeSettlementInput(value);
      await ensureIndexes();
      const resolved = await runtime();
      return retryStoreRace(() => settleInTransaction(resolved, normalized));
    },
    load: async (sweepIntentSha256) => {
      const id = sha256(sweepIntentSha256, 'SWEEP_INTENT_SHA256_INVALID');
      await ensureIndexes();
      const document = await (await runtime()).sweeps.findOne(
        { _id: id },
        { readPreference: PRIMARY_READ_V1 },
      );
      return document === null
        ? null
        : parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
          document,
        );
    },
  });
}

type NormalizedClaimInputV1 = Readonly<{
  claimToken: string;
  claimedAt: Date;
}>;

type NormalizedSettlementInputV1 = Readonly<{
  sweepIntentSha256: string;
  claimedRecordSha256: string;
  claimToken: string;
  attempt: unknown;
}>;

type EligibleSweepV1 = Readonly<{
  eligibleAt: string;
  state: MediaSourceAudioEvidenceBackfillRecoverySweepStateV1;
}>;

async function claimInTransaction(
  runtime: Readonly<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
  >,
  input: NormalizedClaimInputV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 | null> {
  const session = await runtime.startSession();
  let callbackCompleted = false;
  let result: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1
    | null
    | undefined;
  try {
    await session.withTransaction(async () => {
      callbackCompleted = false;
      result = await claimInSnapshot(runtime, session.driverSession, input);
      callbackCompleted = true;
      return result;
    }, TRANSACTION_OPTIONS_V1);
    if (!callbackCompleted || result === undefined) {
      fail('CLAIM_TRANSACTION_NOT_COMMITTED');
    }
    return result;
  } finally {
    await session.endSession();
  }
}

async function claimInSnapshot(
  runtime: Readonly<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
  >,
  driverSession: unknown,
  input: NormalizedClaimInputV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1 | null> {
  const dueDocument = await runtime.sweeps.findOne(dueSweepFilter(
    input.claimedAt,
  ), {
    session: driverSession,
    readPreference: PRIMARY_READ_V1,
    sort: { nextAttemptAt: 1, createdAt: 1, sweepIntentSha256: 1 },
    hint: SWEEP_DUE_INDEX_V1,
  });
  const expiredDocument = await runtime.sweeps.findOne(expiredSweepFilter(
    input.claimedAt,
  ), {
    session: driverSession,
    readPreference: PRIMARY_READ_V1,
    sort: { leaseExpiresAt: 1, createdAt: 1, sweepIntentSha256: 1 },
    hint: SWEEP_EXPIRED_LEASE_INDEX_V1,
  });
  const due = dueDocument === null
    ? null
    : dueSweep(dueDocument, input.claimedAt);
  const expired = expiredDocument === null
    ? null
    : expiredSweep(expiredDocument, input.claimedAt);
  const selected = earlierEligibleSweep(due, expired);
  if (selected === null) return null;
  const transition =
    claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
      selected.state,
      {
        claimToken: input.claimToken,
        claimedAt: input.claimedAt.toISOString(),
      },
    );
  const replaced = await runtime.sweeps.replaceOne({
    _id: selected.state.sweepIntentSha256,
    recordSha256: selected.state.recordSha256,
  }, createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
    transition.state,
  ), { session: driverSession });
  if (replaced.matchedCount !== 1) race('CLAIM_CAS_LOST');
  const durable = await runtime.sweeps.findOne(
    { _id: selected.state.sweepIntentSha256 },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  if (durable === null) fail('CLAIM_WRITE_NOT_DURABLE');
  const durableState =
    parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
      durable,
    );
  if (durableState.recordSha256 !== transition.state.recordSha256) {
    fail('CLAIM_WRITE_MISMATCH');
  }
  return transition.claim;
}

async function settleInTransaction(
  runtime: Readonly<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
  >,
  input: NormalizedSettlementInputV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1> {
  const session = await runtime.startSession();
  let callbackCompleted = false;
  let result: MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1
    | undefined;
  try {
    await session.withTransaction(async () => {
      callbackCompleted = false;
      result = await settleInSnapshot(runtime, session.driverSession, input);
      callbackCompleted = true;
      return result;
    }, TRANSACTION_OPTIONS_V1);
    if (!callbackCompleted || result === undefined) {
      fail('SETTLEMENT_TRANSACTION_NOT_COMMITTED');
    }
    return result;
  } finally {
    await session.endSession();
  }
}

async function settleInSnapshot(
  runtime: Readonly<
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
  >,
  driverSession: unknown,
  input: NormalizedSettlementInputV1,
): Promise<MediaSourceAudioEvidenceBackfillRecoverySweepSettlementV1> {
  const currentDocument = await runtime.sweeps.findOne(
    { _id: input.sweepIntentSha256 },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  if (currentDocument === null) fail('SETTLEMENT_SWEEP_NOT_FOUND');
  const current =
    parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
      currentDocument,
    );
  const attempt = assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    input.attempt,
    current.intent,
  );
  if (current.recordSha256 !== input.claimedRecordSha256) {
    const alreadySettled = await attemptBelongsToStateChain(
      runtime.attempts,
      driverSession,
      current,
      attempt,
    );
    if (!alreadySettled) fail('SETTLEMENT_CLAIM_STATE_CONFLICT');
    return Object.freeze({
      disposition: 'ALREADY_SETTLED' as const,
      state: current,
    });
  }
  const next = settleMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
    current,
    { claimToken: input.claimToken, attempt },
  );
  const attemptDocument =
    createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
      attempt,
      current.intent,
    );
  const inserted = await runtime.attempts.updateOne(
    { _id: attempt.attemptSha256 },
    { $setOnInsert: attemptDocument },
    { session: driverSession, upsert: true },
  );
  if (inserted.upsertedCount !== 1) {
    fail('SETTLEMENT_ORPHAN_ATTEMPT_CONFLICT');
  }
  const replaced = await runtime.sweeps.replaceOne({
    _id: current.sweepIntentSha256,
    recordSha256: current.recordSha256,
  }, createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(next), {
    session: driverSession,
  });
  if (replaced.matchedCount !== 1) race('SETTLEMENT_CAS_LOST');
  const durableAttempt = await runtime.attempts.findOne(
    { _id: attempt.attemptSha256 },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  const durableSweep = await runtime.sweeps.findOne(
    { _id: current.sweepIntentSha256 },
    { session: driverSession, readPreference: PRIMARY_READ_V1 },
  );
  if (durableAttempt === null || durableSweep === null) {
    fail('SETTLEMENT_WRITE_NOT_DURABLE');
  }
  const storedAttempt =
    parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
      durableAttempt,
      current.intent,
    );
  const storedState =
    parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
      durableSweep,
    );
  if (storedAttempt.attemptSha256 !== attempt.attemptSha256
    || storedState.recordSha256 !== next.recordSha256
    || storedState.lastAttemptSha256 !== attempt.attemptSha256) {
    fail('SETTLEMENT_WRITE_MISMATCH');
  }
  return Object.freeze({ disposition: 'SETTLED' as const, state: storedState });
}

async function attemptBelongsToStateChain(
  attempts:
    MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1,
  driverSession: unknown,
  state: MediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  target: MediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
): Promise<boolean> {
  if (state.attemptCount < target.attemptNumber
    || state.lastAttemptSha256 === null) return false;
  let expectedSha256 = state.lastAttemptSha256;
  for (let attemptNumber = state.attemptCount;
    attemptNumber >= target.attemptNumber;
    attemptNumber -= 1) {
    const document = await attempts.findOne(
      { _id: expectedSha256 },
      { session: driverSession, readPreference: PRIMARY_READ_V1 },
    );
    if (document === null) fail('SETTLEMENT_ATTEMPT_CHAIN_INCOMPLETE');
    const stored =
      parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        document,
        state.intent,
      );
    if (stored.attemptSha256 !== expectedSha256
      || stored.attemptNumber !== attemptNumber) {
      fail('SETTLEMENT_ATTEMPT_CHAIN_INVALID');
    }
    if (attemptNumber === target.attemptNumber) {
      return stored.attemptSha256 === target.attemptSha256;
    }
    if (stored.previousAttemptSha256 === null) {
      fail('SETTLEMENT_ATTEMPT_CHAIN_INVALID');
    }
    expectedSha256 = stored.previousAttemptSha256;
  }
  return false;
}

function dueSweepFilter(claimedAt: Date): Readonly<MongoRecord> {
  return Object.freeze({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
    status: { $in: ['PENDING', 'RETRY_WAIT'] },
    nextAttemptAt: { $lte: claimedAt },
  });
}

function expiredSweepFilter(claimedAt: Date): Readonly<MongoRecord> {
  return Object.freeze({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
    status: 'RUNNING',
    leaseExpiresAt: { $lte: claimedAt },
  });
}

function dueSweep(
  value: unknown,
  claimedAt: Date,
): EligibleSweepV1 {
  const state =
    parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(value);
  if ((state.status !== 'PENDING' && state.status !== 'RETRY_WAIT')
    || state.nextAttemptAt === null
    || Date.parse(state.nextAttemptAt) > claimedAt.getTime()) {
    fail('DUE_SWEEP_QUERY_MISMATCH');
  }
  return Object.freeze({ eligibleAt: state.nextAttemptAt, state });
}

function expiredSweep(
  value: unknown,
  claimedAt: Date,
): EligibleSweepV1 {
  const state =
    parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(value);
  if (state.status !== 'RUNNING'
    || state.leaseExpiresAt === null
    || Date.parse(state.leaseExpiresAt) > claimedAt.getTime()) {
    fail('EXPIRED_SWEEP_QUERY_MISMATCH');
  }
  return Object.freeze({ eligibleAt: state.leaseExpiresAt, state });
}

function earlierEligibleSweep(
  left: EligibleSweepV1 | null,
  right: EligibleSweepV1 | null,
): EligibleSweepV1 | null {
  if (left === null) return right;
  if (right === null) return left;
  return compareEligibleSweep(left, right) <= 0 ? left : right;
}

function compareEligibleSweep(
  left: EligibleSweepV1,
  right: EligibleSweepV1,
): number {
  if (left.eligibleAt !== right.eligibleAt) {
    return left.eligibleAt < right.eligibleAt ? -1 : 1;
  }
  if (left.state.createdAt !== right.state.createdAt) {
    return left.state.createdAt < right.state.createdAt ? -1 : 1;
  }
  if (left.state.sweepIntentSha256 === right.state.sweepIntentSha256) return 0;
  return left.state.sweepIntentSha256 < right.state.sweepIntentSha256 ? -1 : 1;
}

function normalizeClaimInput(value: Readonly<{
  claimToken: string;
  claimedAt: Date;
}>): NormalizedClaimInputV1 {
  return Object.freeze({
    claimToken: identifier(value.claimToken, 'CLAIM_TOKEN_INVALID'),
    claimedAt: date(value.claimedAt, 'CLAIMED_AT_INVALID'),
  });
}

function normalizeSettlementInput(value: Readonly<{
  sweepIntentSha256: string;
  claimedRecordSha256: string;
  claimToken: string;
  attempt: unknown;
}>): NormalizedSettlementInputV1 {
  return Object.freeze({
    sweepIntentSha256: sha256(
      value.sweepIntentSha256,
      'SWEEP_INTENT_SHA256_INVALID',
    ),
    claimedRecordSha256: sha256(
      value.claimedRecordSha256,
      'CLAIMED_RECORD_SHA256_INVALID',
    ),
    claimToken: identifier(value.claimToken, 'CLAIM_TOKEN_INVALID'),
    attempt: value.attempt,
  });
}

async function retryStoreRace<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_STORE_ATTEMPTS_V1; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === MAX_STORE_ATTEMPTS_V1 || !retryableStoreRace(error)) {
        throw error;
      }
    }
  }
  return fail('STORE_RETRY_EXHAUSTED');
}

async function loadDefaultRuntime(): Promise<Readonly<
  MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreRuntimeV1
>> {
  const { connectToDatabase } = await import('../db/mongodb');
  const { client, db } = await connectToDatabase();
  return {
    startSession: async () => wrapSession(client.startSession()),
    sweeps: wrapCollection(db.collection(
      MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1,
    )),
    attempts: wrapCollection(db.collection(
      MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_COLLECTION_V1,
    )),
  };
}

function wrapSession(
  session: ClientSession,
): MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreSessionV1 {
  return {
    driverSession: session,
    withTransaction: (operation, options) => session.withTransaction(
      operation,
      options as TransactionOptions,
    ),
    endSession: () => session.endSession(),
  };
}

function wrapCollection(
  collection: Collection<Document>,
): MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreCollectionV1 {
  return {
    createIndex: (keys, options) => collection.createIndex(keys, options),
    findOne: (filter, options) => collection.findOne(
      filter as Filter<Document>,
      {
        ...(options.session
          ? { session: options.session as ClientSession }
          : {}),
        readPreference: options.readPreference,
        ...(options.sort ? { sort: options.sort } : {}),
        ...(options.hint ? { hint: options.hint } : {}),
      } as FindOptions,
    ) as Promise<MongoRecord | null>,
    updateOne: async (filter, update, options) => {
      const result = await collection.updateOne(
        filter as Filter<Document>,
        update as UpdateFilter<Document>,
        { session: options.session as ClientSession, upsert: true },
      );
      return {
        matchedCount: result.matchedCount,
        upsertedCount: result.upsertedCount,
      };
    },
    replaceOne: async (filter, replacement, options) => {
      const result = await collection.replaceOne(
        filter as Filter<Document>,
        replacement,
        { session: options.session as ClientSession },
      );
      return { matchedCount: result.matchedCount };
    },
  };
}

function retryableStoreRace(error: unknown): boolean {
  return Boolean(error && typeof error === 'object'
    && ((error as { code?: unknown }).code === 11000
      || (error instanceof
        MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreErrorV1
        && error.retryableRace)));
}

function race(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreErrorV1(
    code,
    true,
  );
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) fail(code);
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(code);
  return value;
}

function date(value: unknown, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return new Date(value.getTime());
}

function fail(code: string): never {
  throw new MediaSourceAudioEvidenceBackfillRecoverySweepMongoStoreErrorV1(
    code,
  );
}
