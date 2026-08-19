import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection } from 'mongodb';
import { ScriptWriterResultSchema, type ScriptWriterResult } from '../agents/script-writer-agent';
import { hashScriptDocumentContent } from '../persistence/script-sidecar-binding';
import { ScriptChapterPlanSchema, type ScriptChapterPlan } from '../schemas/script-chapter-plan';
import { assertScriptChapterArtifact } from './script-chapter-assembly';
import {
  LONG_FORM_SCRIPT_JOB_COLLECTION,
  LONG_FORM_SCRIPT_JOB_INDEXES,
  LONG_FORM_SCRIPT_JOB_LEASE_MS,
  LONG_FORM_SCRIPT_JOB_MAX_STAGE_FAILURES,
  LONG_FORM_SCRIPT_JOB_TTL_MS,
  LONG_FORM_SCRIPT_JOB_VERSION,
  LongFormScriptJobCheckpointConflictError,
  LongFormScriptJobLeaseLostError,
  LongFormScriptJobTransitionError,
  cloneLongFormScriptJobValue,
  createLongFormScriptJobDedupeKey,
  hashLongFormScriptJobValue,
  longFormScriptStageForAction,
  normalizeLongFormScriptJobError,
  resolveLongFormScriptJobNextAction,
  type ClaimLongFormScriptJobResult,
  type LongFormScriptCommitReceipt,
  type LongFormScriptGenerationJobInput,
  type LongFormScriptGenerationJobRecord,
  type LongFormScriptGenerationJobSnapshot,
  type ScriptChapterArtifact,
} from './script-generation-job-contract';

export * from './script-generation-job-contract';

let cachedMongoClient: Promise<MongoClient> | null = null;
let indexesEnsured = false;

async function mongoJobCollection(): Promise<Collection<LongFormScriptGenerationJobRecord>> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.THINKFORGE_MONGODB_DB_NAME ?? 'thinkforge_db';
  if (!uri) throw new Error('ThinkForge long-form script jobs require MONGODB_URI.');

  cachedMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  }).connect();
  const collection = (await cachedMongoClient)
    .db(dbName)
    .collection<LongFormScriptGenerationJobRecord>(LONG_FORM_SCRIPT_JOB_COLLECTION);
  if (!indexesEnsured) {
    await collection.createIndexes(LONG_FORM_SCRIPT_JOB_INDEXES);
    indexesEnsured = true;
  }
  return collection;
}

export class LongFormScriptGenerationJobStore {
  constructor(
    private readonly collectionProvider: () => Promise<Collection<LongFormScriptGenerationJobRecord>> = mongoJobCollection,
  ) {}

  async createOrGet(input: LongFormScriptGenerationJobInput, now = new Date()): Promise<{
    job: LongFormScriptGenerationJobSnapshot;
    created: boolean;
  }> {
    validateInputIdentity(input);
    const collection = await this.collectionProvider();
    const dedupeKey = createLongFormScriptJobDedupeKey(input);
    const generationIdentity = {
      userId: input.userId,
      orgId: input.orgId,
      sessionId: input.sessionId,
      generationId: input.generationId,
    };
    const existing = await collection.findOne(generationIdentity);
    if (existing) {
      assertSameGenerationContract(existing, dedupeKey);
      return { job: toSnapshot(existing), created: false };
    }

    const id = `longscript_${randomUUID().replace(/-/g, '')}`;
    const record: LongFormScriptGenerationJobRecord = {
      _id: id,
      id,
      version: LONG_FORM_SCRIPT_JOB_VERSION,
      dedupeKey,
      activeDedupeKey: dedupeKey,
      userId: input.userId,
      orgId: input.orgId,
      sessionId: input.sessionId,
      generationId: input.generationId,
      input: cloneLongFormScriptJobValue(input),
      status: 'queued',
      stage: 'planning',
      dispatchCount: 0,
      stageFailureCount: 0,
      maxStageFailures: LONG_FORM_SCRIPT_JOB_MAX_STAGE_FAILURES,
      leaseExpiresAt: null,
      queueMessageId: null,
      plan: null,
      planHash: null,
      chapterArtifacts: {},
      chapterArtifactHashes: {},
      assembledResult: null,
      assembledResultHash: null,
      commitReceipt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + LONG_FORM_SCRIPT_JOB_TTL_MS),
    };
    try {
      await collection.insertOne(record);
      return { job: toSnapshot(record), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await collection.findOne(generationIdentity);
      if (!concurrent) throw error;
      assertSameGenerationContract(concurrent, dedupeKey);
      return { job: toSnapshot(concurrent), created: false };
    }
  }

  async getAuthorized(
    jobId: string,
    userId: string,
    orgId: string | null,
  ): Promise<LongFormScriptGenerationJobSnapshot | null> {
    const record = await (await this.collectionProvider()).findOne({ _id: jobId, userId, orgId });
    return record ? toSnapshot(record) : null;
  }

  async getByGenerationAuthorized(
    sessionId: string,
    generationId: string,
    userId: string,
    orgId: string | null,
  ): Promise<LongFormScriptGenerationJobSnapshot | null> {
    const record = await (await this.collectionProvider()).findOne({
      sessionId,
      generationId,
      userId,
      orgId,
    });
    return record ? toSnapshot(record) : null;
  }

  async claim(jobId: string, now = new Date()): Promise<ClaimLongFormScriptJobResult> {
    const collection = await this.collectionProvider();
    const leaseToken = randomUUID();
    const record = await collection.findOneAndUpdate(
      {
        _id: jobId,
        $or: [
          { status: 'queued' },
          { status: 'running', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + LONG_FORM_SCRIPT_JOB_LEASE_MS),
          updatedAt: now,
          error: null,
        },
        $inc: { dispatchCount: 1 },
      },
      { returnDocument: 'after' },
    );
    if (record) return { kind: 'claimed', job: toSnapshot(record), leaseToken };

    const current = await collection.findOne({ _id: jobId });
    if (!current) return { kind: 'skipped', reason: 'not_found' };
    if (isTerminal(current.status)) return { kind: 'skipped', reason: 'terminal' };
    return { kind: 'skipped', reason: 'lease_held' };
  }

  async heartbeat(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const update = await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'running', leaseToken, leaseExpiresAt: { $gt: now } },
      { $set: { leaseExpiresAt: new Date(now.getTime() + LONG_FORM_SCRIPT_JOB_LEASE_MS), updatedAt: now } },
    );
    if (update.matchedCount !== 1) throw new LongFormScriptJobLeaseLostError();
  }

  async savePlan(
    jobId: string,
    leaseToken: string,
    planInput: ScriptChapterPlan,
    now = new Date(),
  ): Promise<void> {
    const plan = ScriptChapterPlanSchema.parse(planInput);
    const planHash = hashLongFormScriptJobValue(plan);
    const collection = await this.collectionProvider();
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, planHash: null },
      {
        $set: {
          plan: cloneLongFormScriptJobValue(plan),
          planHash,
          stage: 'writing',
          stageFailureCount: 0,
          error: null,
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (current.planHash !== planHash) throw new LongFormScriptJobCheckpointConflictError('plan');
  }

  async saveChapterArtifact(
    jobId: string,
    leaseToken: string,
    artifactInput: ScriptChapterArtifact,
    now = new Date(),
  ): Promise<void> {
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (!current.plan) throw new LongFormScriptJobTransitionError('A chapter cannot be saved before its master plan.');
    const artifact = assertScriptChapterArtifact(current.plan, artifactInput);
    if (current.assembledResult) {
      throw new LongFormScriptJobTransitionError('A chapter cannot change after assembly.');
    }
    const artifactHash = hashLongFormScriptJobValue(artifact);
    const existingHash = current.chapterArtifactHashes[artifact.chapterId];
    if (existingHash) {
      if (existingHash !== artifactHash) throw new LongFormScriptJobCheckpointConflictError('chapter');
      return;
    }
    const artifactPath = `chapterArtifacts.${artifact.chapterId}`;
    const hashPath = `chapterArtifactHashes.${artifact.chapterId}`;
    const completedArtifacts = { ...current.chapterArtifacts, [artifact.chapterId]: artifact };
    const nextAction = resolveLongFormScriptJobNextAction({
      ...current,
      chapterArtifacts: completedArtifacts,
    });
    const update = await collection.updateOne(
      {
        _id: jobId,
        status: 'running',
        leaseToken,
        planHash: artifact.planHash,
        [hashPath]: { $exists: false },
      },
      {
        $set: {
          [artifactPath]: cloneLongFormScriptJobValue(artifact),
          [hashPath]: artifactHash,
          stage: longFormScriptStageForAction(nextAction),
          stageFailureCount: 0,
          error: null,
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const replay = await requireActiveLease(collection, jobId, leaseToken);
    if (replay.chapterArtifactHashes[artifact.chapterId] !== artifactHash) {
      throw new LongFormScriptJobCheckpointConflictError('chapter');
    }
  }

  async saveAssembledResult(
    jobId: string,
    leaseToken: string,
    resultInput: ScriptWriterResult,
    now = new Date(),
  ): Promise<void> {
    const result = ScriptWriterResultSchema.parse(resultInput);
    const resultHash = hashLongFormScriptJobValue(result);
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (resolveLongFormScriptJobNextAction(current).kind !== 'assemble') {
      if (current.assembledResultHash === resultHash) return;
      throw new LongFormScriptJobTransitionError('Assembly requires every planned chapter exactly once.');
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, assembledResultHash: null },
      {
        $set: {
          assembledResult: cloneLongFormScriptJobValue(result),
          assembledResultHash: resultHash,
          stage: 'committing',
          stageFailureCount: 0,
          error: null,
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const replay = await requireActiveLease(collection, jobId, leaseToken);
    if (replay.assembledResultHash !== resultHash) {
      throw new LongFormScriptJobCheckpointConflictError('assembly');
    }
  }

  async saveCommitReceipt(
    jobId: string,
    leaseToken: string,
    receiptInput: LongFormScriptCommitReceipt,
    now = new Date(),
  ): Promise<void> {
    const receipt = validateCommitReceipt(receiptInput);
    const receiptHash = hashLongFormScriptJobValue(receipt);
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (!current.assembledResult) {
      throw new LongFormScriptJobTransitionError('A document cannot commit before final assembly.');
    }
    if (receipt.contentHash !== hashScriptDocumentContent(current.assembledResult.content)) {
      throw new LongFormScriptJobTransitionError('Commit receipt contentHash does not match the assembled script.');
    }
    if (current.commitReceipt) {
      if (hashLongFormScriptJobValue(current.commitReceipt) !== receiptHash) {
        throw new LongFormScriptJobCheckpointConflictError('commit');
      }
      return;
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, commitReceipt: null },
      {
        $set: {
          commitReceipt: receipt,
          stage: 'committing',
          stageFailureCount: 0,
          error: null,
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const replay = await requireActiveLease(collection, jobId, leaseToken);
    if (!replay.commitReceipt || hashLongFormScriptJobValue(replay.commitReceipt) !== receiptHash) {
      throw new LongFormScriptJobCheckpointConflictError('commit');
    }
  }

  async yieldLease(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    const action = resolveLongFormScriptJobNextAction(current);
    if (action.kind === 'complete' || action.kind === 'none') {
      throw new LongFormScriptJobTransitionError('A terminal-ready job must complete instead of yielding.');
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken },
      {
        $set: {
          status: 'queued',
          stage: longFormScriptStageForAction(action),
          stageFailureCount: 0,
          leaseExpiresAt: null,
          updatedAt: now,
          error: null,
        },
        $unset: { leaseToken: '' },
      },
    );
    if (update.matchedCount !== 1) throw new LongFormScriptJobLeaseLostError();
  }

  async complete(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (resolveLongFormScriptJobNextAction(current).kind !== 'complete') {
      throw new LongFormScriptJobTransitionError('A long-form script cannot complete before its commit receipt.');
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, commitReceipt: { $ne: null } },
      {
        $set: { status: 'completed', error: null, leaseExpiresAt: null, updatedAt: now },
        $unset: { activeDedupeKey: '', leaseToken: '' },
      },
    );
    if (update.matchedCount !== 1) throw new LongFormScriptJobLeaseLostError();
  }

  async retryOrDeadLetter(
    jobId: string,
    leaseToken: string,
    error: unknown,
    retryable = true,
    now = new Date(),
  ): Promise<'queued' | 'dead_letter'> {
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    const failureCount = current.stageFailureCount + 1;
    const terminal = !retryable || failureCount >= current.maxStageFailures;
    const normalizedError = normalizeLongFormScriptJobError(error, current.stage, !terminal);
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, stageFailureCount: current.stageFailureCount },
      terminal
        ? {
          $set: {
            status: 'dead_letter',
            stageFailureCount: failureCount,
            error: normalizedError,
            leaseExpiresAt: null,
            updatedAt: now,
          },
          $unset: { activeDedupeKey: '', leaseToken: '' },
        }
        : {
          $set: {
            status: 'queued',
            stageFailureCount: failureCount,
            error: normalizedError,
            leaseExpiresAt: null,
            updatedAt: now,
          },
          $unset: { leaseToken: '' },
        },
    );
    if (update.matchedCount !== 1) throw new LongFormScriptJobLeaseLostError();
    return terminal ? 'dead_letter' : 'queued';
  }

  async cancelAuthorized(
    jobId: string,
    userId: string,
    orgId: string | null,
    now = new Date(),
  ): Promise<boolean> {
    const update = await (await this.collectionProvider()).updateOne(
      { _id: jobId, userId, orgId, status: { $in: ['queued', 'running'] } },
      {
        $set: { status: 'cancelled', leaseExpiresAt: null, updatedAt: now },
        $unset: { activeDedupeKey: '', leaseToken: '' },
      },
    );
    return update.matchedCount === 1;
  }

  async cancelByGenerationAuthorized(
    sessionId: string,
    generationId: string,
    userId: string,
    orgId: string | null,
    now = new Date(),
  ): Promise<LongFormScriptGenerationJobSnapshot | null> {
    const collection = await this.collectionProvider();
    const identity = { sessionId, generationId, userId, orgId };
    const cancelled = await collection.findOneAndUpdate(
      { ...identity, status: { $in: ['queued', 'running'] } },
      {
        $set: { status: 'cancelled', leaseExpiresAt: null, updatedAt: now },
        $unset: { activeDedupeKey: '', leaseToken: '' },
      },
      { returnDocument: 'after' },
    );
    if (cancelled) return toSnapshot(cancelled);
    const terminal = await collection.findOne(identity);
    return terminal ? toSnapshot(terminal) : null;
  }

  async setQueueMessage(jobId: string, messageId: string, now = new Date()): Promise<void> {
    await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'queued' },
      { $set: { queueMessageId: messageId, updatedAt: now } },
    );
  }

  async listRecoverable(staleBefore: Date, limit = 25): Promise<LongFormScriptGenerationJobSnapshot[]> {
    const records = await (await this.collectionProvider()).find({
      $or: [
        { status: 'queued', updatedAt: { $lte: staleBefore } },
        { status: 'running', leaseExpiresAt: { $lte: new Date() } },
      ],
    }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(limit, 100))).toArray();
    return records.map(toSnapshot);
  }
}

export const longFormScriptGenerationJobStore = new LongFormScriptGenerationJobStore();

async function requireActiveLease(
  collection: Collection<LongFormScriptGenerationJobRecord>,
  jobId: string,
  leaseToken: string,
): Promise<LongFormScriptGenerationJobRecord> {
  const current = await collection.findOne({ _id: jobId, status: 'running', leaseToken });
  if (!current) throw new LongFormScriptJobLeaseLostError();
  return current;
}

function toSnapshot(record: LongFormScriptGenerationJobRecord): LongFormScriptGenerationJobSnapshot {
  const { _id: _id, activeDedupeKey: _dedupe, leaseToken: _lease, ...rest } = record;
  return {
    ...cloneLongFormScriptJobValue(rest),
    leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function validateInputIdentity(input: LongFormScriptGenerationJobInput): void {
  [input.userId, input.sessionId, input.generationId, input.scriptId].forEach((value) => {
    if (!value.trim()) throw new Error('Long-form script job identity fields must be non-empty.');
  });
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 1) {
    throw new Error('Long-form script jobs require a positive integer baseVersion.');
  }
}

function assertSameGenerationContract(
  record: LongFormScriptGenerationJobRecord,
  dedupeKey: string,
): void {
  if (record.dedupeKey !== dedupeKey) {
    throw new LongFormScriptJobTransitionError(
      'A generation identity cannot be reused with a different script or base version.',
    );
  }
}

function validateCommitReceipt(input: LongFormScriptCommitReceipt): LongFormScriptCommitReceipt {
  if (!Number.isInteger(input.documentVersion) || input.documentVersion < 1) {
    throw new Error('Long-form commit receipt requires a positive documentVersion.');
  }
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) {
    throw new Error('Long-form commit receipt requires a SHA-256 contentHash.');
  }
  if (!Number.isFinite(Date.parse(input.committedAt))) {
    throw new Error('Long-form commit receipt requires an ISO timestamp.');
  }
  return cloneLongFormScriptJobValue(input);
}

function isTerminal(status: LongFormScriptGenerationJobRecord['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}
