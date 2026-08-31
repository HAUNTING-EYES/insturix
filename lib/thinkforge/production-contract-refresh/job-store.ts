import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection } from 'mongodb';
import { parseVideoTreatment } from '../schemas/video-treatment';
import {
  PRODUCTION_CONTRACT_REFRESH_JOB_COLLECTION,
  PRODUCTION_CONTRACT_REFRESH_JOB_INDEXES,
  PRODUCTION_CONTRACT_REFRESH_JOB_LEASE_MS,
  PRODUCTION_CONTRACT_REFRESH_JOB_MAX_STAGE_FAILURES,
  PRODUCTION_CONTRACT_REFRESH_JOB_TTL_MS,
  PRODUCTION_CONTRACT_REFRESH_JOB_VERSION,
  ProductionContractRefreshJobCheckpointConflictError,
  ProductionContractRefreshJobLeaseLostError,
  ProductionContractRefreshJobTransitionError,
  cloneProductionContractRefreshJobValue,
  createProductionContractRefreshJobDedupeKey,
  hashProductionContractRefreshJobValue,
  normalizeProductionContractRefreshJobError,
  type ClaimProductionContractRefreshJobResult,
  type ProductionContractRefreshCommitReceipt,
  type ProductionContractRefreshJobInput,
  type ProductionContractRefreshJobRecord,
  type ProductionContractRefreshJobSnapshot,
  type ProductionContractRefreshTreatmentCheckpoint,
} from './job-contract';

export * from './job-contract';

let cachedMongoClient: Promise<MongoClient> | null = null;
let indexesEnsured = false;

async function mongoJobCollection(): Promise<Collection<ProductionContractRefreshJobRecord>> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.THINKFORGE_MONGODB_DB_NAME ?? 'thinkforge_db';
  if (!uri) throw new Error('ThinkForge production-contract refresh jobs require MONGODB_URI.');

  cachedMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  }).connect();
  const collection = (await cachedMongoClient)
    .db(dbName)
    .collection<ProductionContractRefreshJobRecord>(PRODUCTION_CONTRACT_REFRESH_JOB_COLLECTION);
  if (!indexesEnsured) {
    await collection.createIndexes(PRODUCTION_CONTRACT_REFRESH_JOB_INDEXES);
    indexesEnsured = true;
  }
  return collection;
}

export class ProductionContractRefreshJobStore {
  constructor(
    private readonly collectionProvider: () => Promise<Collection<ProductionContractRefreshJobRecord>> = mongoJobCollection,
  ) {}

  async createOrGet(
    input: ProductionContractRefreshJobInput,
    now = new Date(),
  ): Promise<{ job: ProductionContractRefreshJobSnapshot; created: boolean }> {
    validateInput(input);
    const collection = await this.collectionProvider();
    const dedupeKey = createProductionContractRefreshJobDedupeKey(input);
    const existing = await collection.findOne({ activeDedupeKey: dedupeKey });
    if (existing) return { job: toSnapshot(existing), created: false };

    const id = `contractrefresh_${randomUUID().replace(/-/g, '')}`;
    const record: ProductionContractRefreshJobRecord = {
      _id: id,
      id,
      version: PRODUCTION_CONTRACT_REFRESH_JOB_VERSION,
      dedupeKey,
      activeDedupeKey: dedupeKey,
      userId: input.userId,
      orgId: input.orgId,
      sessionId: input.sessionId,
      scriptId: input.scriptId,
      baseVersion: input.baseVersion,
      input: cloneProductionContractRefreshJobValue(input),
      status: 'queued',
      stage: 'treatment',
      dispatchCount: 0,
      stageFailureCount: 0,
      maxStageFailures: PRODUCTION_CONTRACT_REFRESH_JOB_MAX_STAGE_FAILURES,
      leaseExpiresAt: null,
      queueMessageId: null,
      treatmentCheckpoint: null,
      treatmentCheckpointHash: null,
      commitReceipt: null,
      billing: { status: 'pending', updatedAt: now, reason: null },
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + PRODUCTION_CONTRACT_REFRESH_JOB_TTL_MS),
    };
    try {
      await collection.insertOne(record);
      return { job: toSnapshot(record), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await collection.findOne({ activeDedupeKey: dedupeKey });
      if (!concurrent) throw error;
      return { job: toSnapshot(concurrent), created: false };
    }
  }

  async getAuthorized(
    jobId: string,
    userId: string,
    orgId: string | null,
  ): Promise<ProductionContractRefreshJobSnapshot | null> {
    const record = await (await this.collectionProvider()).findOne({ _id: jobId, userId, orgId });
    return record ? toSnapshot(record) : null;
  }

  async markCharged(jobId: string, now = new Date()): Promise<void> {
    const update = await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'queued', 'billing.status': 'pending' },
      { $set: { 'billing.status': 'charged', 'billing.updatedAt': now, 'billing.reason': null, updatedAt: now } },
    );
    if (update.matchedCount !== 1) {
      throw new ProductionContractRefreshJobTransitionError('Refresh job could not record its charge exactly once.');
    }
  }

  async claim(jobId: string, now = new Date()): Promise<ClaimProductionContractRefreshJobResult> {
    const collection = await this.collectionProvider();
    const leaseToken = randomUUID();
    const record = await collection.findOneAndUpdate(
      {
        _id: jobId,
        'billing.status': 'charged',
        $or: [
          { status: 'queued' },
          { status: 'running', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + PRODUCTION_CONTRACT_REFRESH_JOB_LEASE_MS),
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
    if (current.billing.status === 'pending') return { kind: 'skipped', reason: 'billing_pending' };
    if (isTerminal(current.status)) return { kind: 'skipped', reason: 'terminal' };
    return { kind: 'skipped', reason: 'lease_held' };
  }

  async heartbeat(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const update = await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'running', leaseToken, leaseExpiresAt: { $gt: now } },
      {
        $set: {
          leaseExpiresAt: new Date(now.getTime() + PRODUCTION_CONTRACT_REFRESH_JOB_LEASE_MS),
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount !== 1) throw new ProductionContractRefreshJobLeaseLostError();
  }

  async saveTreatment(
    jobId: string,
    leaseToken: string,
    checkpointInput: ProductionContractRefreshTreatmentCheckpoint,
    now = new Date(),
  ): Promise<void> {
    const checkpoint = validateTreatmentCheckpoint(checkpointInput);
    const checkpointHash = hashProductionContractRefreshJobValue(checkpoint);
    const collection = await this.collectionProvider();
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, treatmentCheckpointHash: null },
      {
        $set: {
          treatmentCheckpoint: checkpoint,
          treatmentCheckpointHash: checkpointHash,
          stage: 'sidecar',
          stageFailureCount: 0,
          error: null,
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (current.treatmentCheckpointHash !== checkpointHash) {
      throw new ProductionContractRefreshJobCheckpointConflictError('treatment');
    }
  }

  async saveCommitReceipt(
    jobId: string,
    leaseToken: string,
    receiptInput: ProductionContractRefreshCommitReceipt,
    now = new Date(),
  ): Promise<void> {
    const receipt = validateCommitReceipt(receiptInput);
    const receiptHash = hashProductionContractRefreshJobValue(receipt);
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (!current.treatmentCheckpoint) {
      throw new ProductionContractRefreshJobTransitionError('Refresh cannot commit before treatment planning.');
    }
    assertProductionContractRefreshCommitMatchesInput(current.input, receipt);
    if (current.commitReceipt) {
      if (hashProductionContractRefreshJobValue(current.commitReceipt) !== receiptHash) {
        throw new ProductionContractRefreshJobCheckpointConflictError('commit');
      }
      return;
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, commitReceipt: null },
      { $set: { commitReceipt: receipt, stage: 'committing', updatedAt: now } },
    );
    if (update.matchedCount !== 1) throw new ProductionContractRefreshJobLeaseLostError();
  }

  async yieldLease(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (current.commitReceipt) {
      throw new ProductionContractRefreshJobTransitionError('A committed refresh must complete instead of yielding.');
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken },
      {
        $set: {
          status: 'queued',
          stage: current.treatmentCheckpoint ? 'sidecar' : 'treatment',
          stageFailureCount: 0,
          leaseExpiresAt: null,
          error: null,
          updatedAt: now,
        },
        $unset: { leaseToken: '' },
      },
    );
    if (update.matchedCount !== 1) throw new ProductionContractRefreshJobLeaseLostError();
  }

  async complete(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(collection, jobId, leaseToken);
    if (!current.commitReceipt) {
      throw new ProductionContractRefreshJobTransitionError('Refresh cannot complete before its commit receipt.');
    }
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, commitReceipt: { $ne: null } },
      {
        $set: {
          status: 'completed',
          'billing.status': 'settled',
          'billing.updatedAt': now,
          'billing.reason': null,
          leaseExpiresAt: null,
          error: null,
          updatedAt: now,
        },
        $unset: { activeDedupeKey: '', leaseToken: '' },
      },
    );
    if (update.matchedCount !== 1) throw new ProductionContractRefreshJobLeaseLostError();
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
    const normalizedError = normalizeProductionContractRefreshJobError(error, current.stage, !terminal);
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, stageFailureCount: current.stageFailureCount },
      terminal
        ? {
          $set: {
            status: 'dead_letter',
            stageFailureCount: failureCount,
            error: normalizedError,
            'billing.status': 'refund_pending',
            'billing.updatedAt': now,
            'billing.reason': normalizedError.message,
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
    if (update.matchedCount !== 1) throw new ProductionContractRefreshJobLeaseLostError();
    return terminal ? 'dead_letter' : 'queued';
  }

  async markRefunded(jobId: string, reason: string, now = new Date()): Promise<void> {
    const update = await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'dead_letter', 'billing.status': 'refund_pending' },
      { $set: { 'billing.status': 'refunded', 'billing.updatedAt': now, 'billing.reason': reason, updatedAt: now } },
    );
    if (update.matchedCount !== 1) {
      throw new ProductionContractRefreshJobTransitionError('Refresh refund could not be recorded exactly once.');
    }
  }

  async setQueueMessage(jobId: string, messageId: string, now = new Date()): Promise<void> {
    await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'queued' },
      { $set: { queueMessageId: messageId, updatedAt: now } },
    );
  }

  async listRecoverable(
    staleBefore: Date,
    limit = 25,
  ): Promise<ProductionContractRefreshJobSnapshot[]> {
    const records = await (await this.collectionProvider()).find({
      'billing.status': 'charged',
      $or: [
        { status: 'queued', updatedAt: { $lte: staleBefore } },
        { status: 'running', leaseExpiresAt: { $lte: new Date() } },
      ],
    }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(limit, 100))).toArray();
    return records.map(toSnapshot);
  }
}

export const productionContractRefreshJobStore = new ProductionContractRefreshJobStore();

async function requireActiveLease(
  collection: Collection<ProductionContractRefreshJobRecord>,
  jobId: string,
  leaseToken: string,
): Promise<ProductionContractRefreshJobRecord> {
  const current = await collection.findOne({ _id: jobId, status: 'running', leaseToken });
  if (!current) throw new ProductionContractRefreshJobLeaseLostError();
  return current;
}

function toSnapshot(record: ProductionContractRefreshJobRecord): ProductionContractRefreshJobSnapshot {
  const { _id: _id, activeDedupeKey: _dedupe, leaseToken: _lease, ...rest } = record;
  return {
    ...cloneProductionContractRefreshJobValue(rest),
    leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
    billing: { ...record.billing, updatedAt: record.billing.updatedAt.toISOString() },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function validateInput(input: ProductionContractRefreshJobInput): void {
  [input.userId, input.sessionId, input.scriptId].forEach((value) => {
    if (!value.trim()) throw new Error('Production-contract refresh identity fields must be non-empty.');
  });
  if (!Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
    throw new Error('Production-contract refresh requires a non-negative integer baseVersion.');
  }
  if (!/^[a-f0-9]{64}$/.test(input.documentHash)) {
    throw new Error('Production-contract refresh requires a SHA-256 documentHash.');
  }
}

function validateTreatmentCheckpoint(
  input: ProductionContractRefreshTreatmentCheckpoint,
): ProductionContractRefreshTreatmentCheckpoint {
  const treatment = parseVideoTreatment(input.treatment);
  if (!/^[a-f0-9]{64}$/.test(input.inputFingerprint)) {
    throw new Error('Treatment checkpoint requires a SHA-256 input fingerprint.');
  }
  if (!Number.isFinite(input.latencyMs) || input.latencyMs < 0) {
    throw new Error('Treatment checkpoint latency must be non-negative.');
  }
  return cloneProductionContractRefreshJobValue({ ...input, treatment });
}

function validateCommitReceipt(
  input: ProductionContractRefreshCommitReceipt,
): ProductionContractRefreshCommitReceipt {
  if (!Number.isInteger(input.documentVersion) || input.documentVersion < 1) {
    throw new Error('Refresh commit receipt requires a positive documentVersion.');
  }
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) {
    throw new Error('Refresh commit receipt requires a SHA-256 contentHash.');
  }
  if (!Number.isFinite(Date.parse(input.committedAt))) {
    throw new Error('Refresh commit receipt requires an ISO timestamp.');
  }
  return cloneProductionContractRefreshJobValue(input);
}

function isTerminal(status: ProductionContractRefreshJobRecord['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

export function assertProductionContractRefreshCommitMatchesInput(
  input: ProductionContractRefreshJobInput,
  receipt: ProductionContractRefreshCommitReceipt,
): void {
  if (receipt.contentHash !== input.documentHash) {
    throw new ProductionContractRefreshJobTransitionError(
      'Production-contract refresh changed the canonical visible document.',
    );
  }
  if (receipt.documentVersion !== input.baseVersion + 1) {
    throw new ProductionContractRefreshJobTransitionError(
      'Production-contract refresh committed an unexpected document version.',
    );
  }
}
