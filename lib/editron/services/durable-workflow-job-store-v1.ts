import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';

import {
  ClaimDurableWorkflowJobResultV1,
  DURABLE_WORKFLOW_JOB_COLLECTION_V1,
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DURABLE_WORKFLOW_JOB_TTL_MS_V1,
  DURABLE_WORKFLOW_JOB_VERSION_V1,
  DurableWorkflowJobConflictErrorV1,
  DurableWorkflowJobLeaseLostErrorV1,
  DurableWorkflowJobTransitionErrorV1,
  canonicalizeDurableWorkflowJobJsonV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobCreateInputV1,
  type DurableWorkflowJobErrorV1,
  type DurableWorkflowJobRecordV1,
  type DurableWorkflowJobResumeStateV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const MAX_JSON_PAYLOAD_BYTES = 256 * 1024;
const MAX_ATTEMPTS = 20;
const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type CollectionProvider = () => Promise<Collection<DurableWorkflowJobRecordV1>>;

async function mongoCollection(): Promise<Collection<DurableWorkflowJobRecordV1>> {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<DurableWorkflowJobRecordV1>(
    DURABLE_WORKFLOW_JOB_COLLECTION_V1,
  );
}

export class DurableWorkflowJobStoreV1 {
  constructor(private readonly collectionProvider: CollectionProvider = mongoCollection) {}

  async createOrGet(inputValue: DurableWorkflowJobCreateInputV1, now = new Date()): Promise<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    created: boolean;
  }> {
    const input = normalizeCreateInput(inputValue, now);
    const collection = await this.collectionProvider();
    const identity = { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey };
    const existing = await collection.findOne(identity);
    if (existing) {
      assertSameContract(existing, input);
      return { job: toSnapshot(existing), created: false };
    }

    const jobId = `dwj_${randomUUID().replace(/-/g, '')}`;
    const record: DurableWorkflowJobRecordV1 = {
      _id: jobId,
      jobId,
      version: DURABLE_WORKFLOW_JOB_VERSION_V1,
      ...input,
      status: 'queued',
      attemptCount: 0,
      remainingAttempts: input.maxAttempts,
      retryCursor: null,
      leaseToken: null,
      leaseOwnerId: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      cancelRequestedAt: null,
      cancelRequestedBy: null,
      cancelReason: null,
      resumeState: null,
      terminalReceipt: null,
      error: null,
      dispatchTransport: null,
      dispatchMessageId: null,
      dispatchCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await collection.insertOne(record);
      return { job: toSnapshot(record), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await collection.findOne(identity);
      if (!concurrent) throw error;
      assertSameContract(concurrent, input);
      return { job: toSnapshot(concurrent), created: false };
    }
  }

  async getAuthorized(input: Readonly<{
    jobId: string;
    tenantId: string;
    userId: string;
  }>): Promise<Readonly<DurableWorkflowJobSnapshotV1> | null> {
    const record = await (await this.collectionProvider()).findOne({
      _id: requireIdentity(input.jobId, 'JOB_ID'),
      tenantId: requireIdentity(input.tenantId, 'TENANT_ID'),
      userId: requireIdentity(input.userId, 'USER_ID'),
    });
    return record ? toSnapshot(record) : null;
  }

  async recordDispatch(input: Readonly<{
    jobId: string;
    transport: string;
    messageId: string;
    now?: Date;
  }>): Promise<void> {
    const now = input.now ?? new Date();
    const result = await (await this.collectionProvider()).updateOne(
      {
        _id: requireIdentity(input.jobId, 'JOB_ID'),
        // QStash can deliver and the worker can claim or even finish before the
        // publish acknowledgement reaches this process. Dispatch metadata is
        // audit evidence, not a lifecycle transition, so a valid late receipt
        // must remain recordable without moving the job back to queued.
        expiresAt: { $gt: now },
      },
      {
        $set: {
          dispatchTransport: requireIdentity(input.transport, 'DISPATCH_TRANSPORT'),
          dispatchMessageId: requireIdentity(input.messageId, 'DISPATCH_MESSAGE_ID'),
          updatedAt: now,
        },
        $inc: { dispatchCount: 1 },
      },
    );
    if (result.matchedCount !== 1) {
      throw new DurableWorkflowJobTransitionErrorV1('DURABLE_JOB_DISPATCH_STATE_INVALID');
    }
  }

  async claim(input: Readonly<{
    jobId: string;
    workerId: string;
    now?: Date;
  }>): Promise<ClaimDurableWorkflowJobResultV1> {
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const jobId = requireIdentity(input.jobId, 'JOB_ID');
    const workerId = requireIdentity(input.workerId, 'WORKER_ID');
    const leaseToken = randomUUID();
    const record = await collection.findOneAndUpdate(
      {
        _id: jobId,
        remainingAttempts: { $gt: 0 },
        cancelRequestedAt: null,
        expiresAt: { $gt: now },
        $or: [
          { status: 'queued' },
          { status: 'retry_wait', nextAttemptAt: { $lte: now } },
          { status: 'running', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseToken,
          leaseOwnerId: workerId,
          leaseExpiresAt: new Date(now.getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1),
          nextAttemptAt: null,
          error: null,
          updatedAt: now,
        },
        $inc: { attemptCount: 1, remainingAttempts: -1 },
      },
      { returnDocument: 'after' },
    );
    if (record) return { kind: 'claimed', job: toSnapshot(record), leaseToken };

    let current = await collection.findOne({ _id: jobId });
    if (!current) return { kind: 'skipped', reason: 'not_found' };
    if (current.status === 'running' && current.cancelRequestedAt
      && current.leaseExpiresAt && current.leaseExpiresAt <= now) {
      const cancellationLease = await collection.findOneAndUpdate(
        {
          _id: jobId,
          status: 'running',
          cancelRequestedAt: { $ne: null },
          leaseExpiresAt: { $lte: now },
        },
        {
          $set: {
            leaseToken,
            leaseOwnerId: workerId,
            leaseExpiresAt: new Date(now.getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1),
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
      if (cancellationLease) {
        return { kind: 'cancel_claimed', job: toSnapshot(cancellationLease), leaseToken };
      }
      current = await collection.findOne({ _id: jobId });
      if (!current) return { kind: 'skipped', reason: 'not_found' };
    }
    const expired = await expireJobIfNeeded(collection, jobId, now);
    if (expired) {
      return { kind: 'skipped', reason: 'expired', job: toSnapshot(expired) };
    }
    current = await collection.findOne({ _id: jobId });
    if (!current) return { kind: 'skipped', reason: 'not_found' };
    if (current.status === 'running' && !current.cancelRequestedAt
      && current.remainingAttempts <= 0 && current.leaseExpiresAt
      && current.leaseExpiresAt <= now) {
      await collection.updateOne(
        {
          _id: jobId,
          status: 'running',
          remainingAttempts: 0,
          cancelRequestedAt: null,
          leaseExpiresAt: { $lte: now },
        },
        {
          $set: {
            status: 'dead_letter',
            error: {
              code: 'ATTEMPTS_EXHAUSTED_AFTER_LEASE_EXPIRY',
              message: 'The final worker lease expired before a terminal disposition.',
              retryable: false,
              occurredAt: now,
            },
            leaseToken: null,
            leaseOwnerId: null,
            leaseExpiresAt: null,
            updatedAt: now,
          },
        },
      );
      current = await collection.findOne({ _id: jobId });
      if (!current) return { kind: 'skipped', reason: 'not_found' };
    }
    if (isTerminal(current.status)) {
      return { kind: 'skipped', reason: 'terminal', job: toSnapshot(current) };
    }
    if (current.cancelRequestedAt) return { kind: 'skipped', reason: 'cancel_requested' };
    if (current.remainingAttempts <= 0) {
      return { kind: 'skipped', reason: 'attempts_exhausted' };
    }
    if (current.status === 'retry_wait' && current.nextAttemptAt
      && current.nextAttemptAt > now) {
      return { kind: 'skipped', reason: 'retry_not_due' };
    }
    return { kind: 'skipped', reason: 'lease_held' };
  }

  async heartbeat(input: Readonly<{
    jobId: string;
    leaseToken: string;
    now?: Date;
  }>): Promise<'ACTIVE' | 'CANCEL_REQUESTED'> {
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const identity = activeLeaseFilter(input.jobId, input.leaseToken, now);
    const result = await collection.updateOne(
      { ...identity, cancelRequestedAt: null },
      {
        $set: {
          leaseExpiresAt: new Date(now.getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1),
          updatedAt: now,
        },
      },
    );
    if (result.matchedCount === 1) return 'ACTIVE';
    const current = await collection.findOne({
      _id: requireIdentity(input.jobId, 'JOB_ID'),
      status: 'running',
      leaseToken: requireIdentity(input.leaseToken, 'LEASE_TOKEN'),
    });
    if (current?.cancelRequestedAt) return 'CANCEL_REQUESTED';
    throw new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_LEASE_LOST');
  }

  async saveResumeState(input: Readonly<{
    jobId: string;
    leaseToken: string;
    expectedSequence: number;
    state: Omit<DurableWorkflowJobResumeStateV1, 'sequence' | 'committedAt'>;
    now?: Date;
  }>): Promise<void> {
    const now = input.now ?? new Date();
    const expectedSequence = nonNegativeInteger(input.expectedSequence, 'EXPECTED_SEQUENCE');
    const nextState = normalizeResumeState({
      ...input.state,
      sequence: expectedSequence + 1,
      committedAt: now,
    });
    const collection = await this.collectionProvider();
    const update = await collection.updateOne(
      {
        ...activeLeaseFilter(input.jobId, input.leaseToken, now),
        cancelRequestedAt: null,
        ...(expectedSequence === 0
          ? { resumeState: null }
          : { 'resumeState.sequence': expectedSequence }),
      },
      { $set: { resumeState: nextState, updatedAt: now } },
    );
    if (update.matchedCount === 1) return;
    const current = await requireActiveLease(collection, input.jobId, input.leaseToken, now);
    if (current.cancelRequestedAt) {
      throw new DurableWorkflowJobTransitionErrorV1('DURABLE_JOB_CANCEL_REQUESTED');
    }
    if (sameResumeStateContent(current.resumeState, nextState)) return;
    throw new DurableWorkflowJobConflictErrorV1('DURABLE_JOB_RESUME_STATE_CONFLICT');
  }

  async requestCancellation(input: Readonly<{
    jobId: string;
    tenantId: string;
    userId: string;
    requestedBy: string;
    reason: string;
    now?: Date;
  }>): Promise<Readonly<DurableWorkflowJobSnapshotV1> | null> {
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const identity = {
      _id: requireIdentity(input.jobId, 'JOB_ID'),
      tenantId: requireIdentity(input.tenantId, 'TENANT_ID'),
      userId: requireIdentity(input.userId, 'USER_ID'),
    };
    const request = {
      cancelRequestedAt: now,
      cancelRequestedBy: requireIdentity(input.requestedBy, 'CANCEL_REQUESTED_BY'),
      cancelReason: boundedText(input.reason, 500) || 'cancelled_by_user',
      updatedAt: now,
    };
    const cancellationReceipt = createQueuedCancellationReceipt({
      ...identity,
      requestedBy: request.cancelRequestedBy,
      reason: request.cancelReason,
      completedAt: now,
    });
    const cancelled = await collection.findOneAndUpdate(
      { ...identity, status: { $in: ['queued', 'retry_wait'] } },
      {
        $set: {
          ...request,
          status: 'cancelled',
          nextAttemptAt: null,
          leaseToken: null,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          terminalReceipt: cancellationReceipt,
        },
      },
      { returnDocument: 'after' },
    );
    if (cancelled) return toSnapshot(cancelled);
    const running = await collection.findOneAndUpdate(
      { ...identity, status: 'running' },
      { $set: request },
      { returnDocument: 'after' },
    );
    if (running) return toSnapshot(running);
    const current = await collection.findOne(identity);
    return current ? toSnapshot(current) : null;
  }

  async markCancelled(input: Readonly<{
    jobId: string;
    leaseToken: string;
    receipt: DurableWorkflowJobTerminalReceiptV1;
    now?: Date;
  }>): Promise<void> {
    const receipt = normalizeTerminalReceipt(input.receipt, 'CANCELLED');
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const update = await collection.updateOne(
      {
        ...cancellationLeaseFilter(input.jobId, input.leaseToken, now),
        cancelRequestedAt: { $ne: null },
      },
      {
        $set: {
          status: 'cancelled', terminalReceipt: receipt, updatedAt: now,
          leaseToken: null, leaseOwnerId: null, leaseExpiresAt: null,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const current = await collection.findOne({ _id: input.jobId });
    if (current?.status === 'cancelled' && sameJson(current.terminalReceipt, receipt)) return;
    throw new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_CANCEL_LEASE_LOST');
  }

  async complete(input: Readonly<{
    jobId: string;
    leaseToken: string;
    receipt: DurableWorkflowJobTerminalReceiptV1;
    now?: Date;
  }>): Promise<void> {
    const receipt = normalizeTerminalReceipt(input.receipt);
    if (receipt.disposition === 'CANCELLED') {
      throw new DurableWorkflowJobTransitionErrorV1('DURABLE_JOB_USE_CANCEL_TRANSITION');
    }
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const update = await collection.updateOne(
      { ...activeLeaseFilter(input.jobId, input.leaseToken, now), cancelRequestedAt: null },
      {
        $set: {
          status: 'completed', terminalReceipt: receipt, error: null, updatedAt: now,
          leaseToken: null, leaseOwnerId: null, leaseExpiresAt: null,
        },
      },
    );
    if (update.matchedCount === 1) return;
    const current = await collection.findOne({ _id: input.jobId });
    if (current?.status === 'completed' && sameJson(current.terminalReceipt, receipt)) return;
    throw new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_COMPLETE_LEASE_LOST');
  }

  /**
   * Releases a healthy externally waiting job without spending a failure
   * attempt. The current delivery was claimed, so exactly that decrement is
   * restored; transport or execution failures must use retryOrDeadLetter.
   */
  async deferUntil(input: Readonly<{
    jobId: string;
    leaseToken: string;
    resumeCursor: Readonly<Record<string, unknown>>;
    resumeAt: Date;
    now?: Date;
  }>): Promise<void> {
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(
      collection, input.jobId, input.leaseToken, now,
    );
    if (current.cancelRequestedAt) {
      throw new DurableWorkflowJobTransitionErrorV1('DURABLE_JOB_CANCEL_REQUESTED');
    }
    const update = await collection.updateOne(
      activeLeaseFilter(input.jobId, input.leaseToken, now),
      {
        $set: {
          status: 'retry_wait',
          retryCursor: cloneJsonRecord(input.resumeCursor),
          nextAttemptAt: requireFutureDate(input.resumeAt, now, 'RESUME_AT'),
          error: null,
          leaseToken: null,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          updatedAt: now,
        },
        $inc: { remainingAttempts: 1 },
      },
    );
    if (update.matchedCount !== 1) {
      throw new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_DEFER_LEASE_LOST');
    }
  }

  async retryOrDeadLetter(input: Readonly<{
    jobId: string;
    leaseToken: string;
    error: DurableWorkflowJobErrorV1;
    retryAt: Date;
    retryCursor: Readonly<Record<string, unknown>>;
    now?: Date;
  }>): Promise<'retry_wait' | 'dead_letter'> {
    const now = input.now ?? new Date();
    const collection = await this.collectionProvider();
    const current = await requireActiveLease(
      collection, input.jobId, input.leaseToken, now,
    );
    if (current.cancelRequestedAt) {
      throw new DurableWorkflowJobTransitionErrorV1('DURABLE_JOB_CANCEL_REQUESTED');
    }
    const error = normalizeError(input.error, now);
    const terminal = !error.retryable || current.remainingAttempts <= 0;
    const update = await collection.updateOne(
      activeLeaseFilter(input.jobId, input.leaseToken, now),
      {
        $set: {
          status: terminal ? 'dead_letter' : 'retry_wait',
          error,
          retryCursor: terminal ? null : cloneJsonRecord(input.retryCursor),
          nextAttemptAt: terminal ? null : requireFutureDate(input.retryAt, now, 'RETRY_AT'),
          leaseToken: null,
          leaseOwnerId: null,
          leaseExpiresAt: null,
          updatedAt: now,
        },
      },
    );
    if (update.matchedCount !== 1) {
      throw new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_RETRY_LEASE_LOST');
    }
    return terminal ? 'dead_letter' : 'retry_wait';
  }

  async listRecoverable(input: Readonly<{
    staleBefore: Date;
    now?: Date;
    limit?: number;
  }>): Promise<readonly Readonly<DurableWorkflowJobSnapshotV1>[]> {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
    const records = await (await this.collectionProvider()).find({
      $or: [
        {
          status: { $in: ['queued', 'retry_wait', 'running'] },
          cancelRequestedAt: null, expiresAt: { $lte: now },
        },
        {
          status: 'queued', remainingAttempts: { $gt: 0 }, cancelRequestedAt: null,
          updatedAt: { $lte: input.staleBefore },
        },
        {
          status: 'retry_wait', remainingAttempts: { $gt: 0 }, cancelRequestedAt: null,
          nextAttemptAt: { $lte: now },
        },
        { status: 'running', leaseExpiresAt: { $lte: now } },
      ],
    }).sort({ updatedAt: 1 }).limit(limit).toArray();
    return records.map(toSnapshot);
  }
}

function normalizeCreateInput(input: DurableWorkflowJobCreateInputV1, now: Date) {
  const dependencies = input.dependencies.map((dependency) => ({
    dependencyId: requireIdentity(dependency.dependencyId, 'DEPENDENCY_ID'),
    dependencyVersion: requireIdentity(dependency.dependencyVersion, 'DEPENDENCY_VERSION'),
    bindingSha256: requireSha256(dependency.bindingSha256, 'DEPENDENCY_BINDING'),
  })).sort((left, right) => (
    left.dependencyId < right.dependencyId
      ? -1
      : left.dependencyId > right.dependencyId ? 1 : 0
  ));
  if (new Set(dependencies.map(({ dependencyId }) => dependencyId)).size
    !== dependencies.length) {
    throw new Error('DURABLE_JOB_DUPLICATE_DEPENDENCY_ID');
  }
  const maxAttempts = positiveInteger(input.maxAttempts, 'MAX_ATTEMPTS');
  if (maxAttempts > MAX_ATTEMPTS) throw new Error('DURABLE_JOB_MAX_ATTEMPTS_EXCEEDED');
  const expiresAt = input.expiresAt
    ? requireFutureDate(input.expiresAt, now, 'EXPIRES_AT')
    : new Date(now.getTime() + DURABLE_WORKFLOW_JOB_TTL_MS_V1);
  if (expiresAt.getTime() - now.getTime() > MAX_TTL_MS) {
    throw new Error('DURABLE_JOB_TTL_EXCEEDED');
  }
  return {
    tenantId: requireIdentity(input.tenantId, 'TENANT_ID'),
    userId: requireIdentity(input.userId, 'USER_ID'),
    orgId: optionalIdentity(input.orgId, 'ORG_ID'),
    projectId: optionalIdentity(input.projectId, 'PROJECT_ID'),
    operationOwner: requireIdentity(input.operationOwner, 'OPERATION_OWNER'),
    operationKind: requireIdentity(input.operationKind, 'OPERATION_KIND'),
    operationId: requireIdentity(input.operationId, 'OPERATION_ID'),
    parentCommandId: optionalIdentity(input.parentCommandId, 'PARENT_COMMAND_ID'),
    parentReceiptId: optionalIdentity(input.parentReceiptId, 'PARENT_RECEIPT_ID'),
    idempotencyKey: requireIdentity(input.idempotencyKey, 'IDEMPOTENCY_KEY'),
    input: normalizeInputBinding(input.input),
    dependencies,
    budgetReservation: input.budgetReservation ? {
      reservationId: requireIdentity(
        input.budgetReservation.reservationId, 'BUDGET_RESERVATION_ID',
      ),
      bindingSha256: requireSha256(
        input.budgetReservation.bindingSha256, 'BUDGET_RESERVATION_BINDING',
      ),
    } : null,
    maxAttempts,
    expiresAt,
  };
}

function normalizeResumeState(
  state: DurableWorkflowJobResumeStateV1,
): DurableWorkflowJobResumeStateV1 {
  const payload = cloneJsonRecord(state.payload);
  const stateSha256 = requireSha256(state.stateSha256, 'RESUME_STATE');
  if (hashDurableWorkflowJobJsonV1(payload) !== stateSha256) {
    throw new Error('DURABLE_JOB_RESUME_STATE_HASH_MISMATCH');
  }
  return {
    sequence: positiveInteger(state.sequence, 'RESUME_SEQUENCE'),
    schemaId: requireIdentity(state.schemaId, 'RESUME_SCHEMA_ID'),
    stateSha256,
    payload,
    committedAt: validDate(state.committedAt, 'RESUME_COMMITTED_AT'),
  };
}

function normalizeInputBinding(input: DurableWorkflowJobCreateInputV1['input']) {
  const payload = cloneJsonRecord(input.payload);
  const bindingSha256 = requireSha256(input.bindingSha256, 'INPUT_BINDING');
  if (hashDurableWorkflowJobJsonV1(payload) !== bindingSha256) {
    throw new Error('DURABLE_JOB_INPUT_BINDING_HASH_MISMATCH');
  }
  return {
    schemaId: requireIdentity(input.schemaId, 'INPUT_SCHEMA_ID'),
    bindingSha256,
    payload,
  };
}

function normalizeTerminalReceipt(
  receipt: DurableWorkflowJobTerminalReceiptV1,
  requiredDisposition?: DurableWorkflowJobTerminalReceiptV1['disposition'],
): DurableWorkflowJobTerminalReceiptV1 {
  if (!['PASS', 'FAIL', 'UNVERIFIABLE', 'CANCELLED'].includes(receipt.disposition)
    || (requiredDisposition && receipt.disposition !== requiredDisposition)) {
    throw new Error('DURABLE_JOB_TERMINAL_DISPOSITION_INVALID');
  }
  const proofReferences = receipt.proofReferences.map((proof) => {
    if (!['PASS', 'FAIL', 'UNVERIFIABLE'].includes(proof.disposition)) {
      throw new Error('DURABLE_JOB_PROOF_DISPOSITION_INVALID');
    }
    return {
      proofId: requireIdentity(proof.proofId, 'PROOF_ID'),
      proofSha256: requireSha256(proof.proofSha256, 'PROOF'),
      disposition: proof.disposition,
    };
  });
  if (new Set(proofReferences.map(({ proofId }) => proofId)).size
    !== proofReferences.length) {
    throw new Error('DURABLE_JOB_DUPLICATE_PROOF_ID');
  }
  return {
    disposition: receipt.disposition,
    receiptId: requireIdentity(receipt.receiptId, 'TERMINAL_RECEIPT_ID'),
    receiptSha256: requireSha256(receipt.receiptSha256, 'TERMINAL_RECEIPT'),
    proofReferences,
    completedAt: validDate(receipt.completedAt, 'TERMINAL_COMPLETED_AT'),
  };
}

function normalizeError(error: DurableWorkflowJobErrorV1, now: Date) {
  return {
    code: requireIdentity(error.code, 'ERROR_CODE'),
    message: boundedText(error.message, 1_000) || error.code,
    retryable: error.retryable === true,
    occurredAt: validDate(error.occurredAt ?? now, 'ERROR_OCCURRED_AT'),
  };
}

function createQueuedCancellationReceipt(input: Readonly<{
  _id: string;
  tenantId: string;
  userId: string;
  requestedBy: string;
  reason: string;
  completedAt: Date;
}>): DurableWorkflowJobTerminalReceiptV1 {
  const receiptSha256 = hashDurableWorkflowJobJsonV1({
    version: DURABLE_WORKFLOW_JOB_VERSION_V1,
    jobId: input._id,
    tenantId: input.tenantId,
    userId: input.userId,
    requestedBy: input.requestedBy,
    reason: input.reason,
    completedAt: input.completedAt.toISOString(),
  });
  return {
    disposition: 'CANCELLED',
    receiptId: `dw_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: [],
    completedAt: input.completedAt,
  };
}

function assertSameContract(
  record: DurableWorkflowJobRecordV1,
  input: ReturnType<typeof normalizeCreateInput>,
): void {
  const stored = {
    tenantId: record.tenantId, userId: record.userId, orgId: record.orgId,
    projectId: record.projectId, operationOwner: record.operationOwner,
    operationKind: record.operationKind, operationId: record.operationId,
    parentCommandId: record.parentCommandId, parentReceiptId: record.parentReceiptId,
    idempotencyKey: record.idempotencyKey, input: record.input,
    dependencies: record.dependencies, budgetReservation: record.budgetReservation,
    maxAttempts: record.maxAttempts,
  };
  const proposed = { ...input } as Record<string, unknown>;
  delete proposed.expiresAt;
  if (record.version !== DURABLE_WORKFLOW_JOB_VERSION_V1
    || !sameJson(stored, proposed)) {
    throw new DurableWorkflowJobConflictErrorV1('DURABLE_JOB_IDEMPOTENCY_CONFLICT');
  }
}

function activeLeaseFilter(jobId: string, leaseToken: string, now: Date) {
  return {
    ...cancellationLeaseFilter(jobId, leaseToken, now),
    expiresAt: { $gt: now },
  };
}

function cancellationLeaseFilter(jobId: string, leaseToken: string, now: Date) {
  return {
    _id: requireIdentity(jobId, 'JOB_ID'),
    status: 'running' as const,
    leaseToken: requireIdentity(leaseToken, 'LEASE_TOKEN'),
    leaseExpiresAt: { $gt: now },
  };
}

async function expireJobIfNeeded(
  collection: Collection<DurableWorkflowJobRecordV1>,
  jobId: string,
  now: Date,
): Promise<DurableWorkflowJobRecordV1 | null> {
  const expired = await collection.findOneAndUpdate(
    {
      _id: jobId,
      status: { $in: ['queued', 'retry_wait', 'running'] },
      cancelRequestedAt: null,
      expiresAt: { $lte: now },
    },
    {
      $set: {
        status: 'dead_letter',
        error: {
          code: 'JOB_EXPIRED',
          message: 'The durable job expired before reaching a terminal disposition.',
          retryable: false,
          occurredAt: now,
        },
        retryCursor: null,
        nextAttemptAt: null,
        leaseToken: null,
        leaseOwnerId: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );
  return expired;
}

async function requireActiveLease(
  collection: Collection<DurableWorkflowJobRecordV1>,
  jobId: string,
  leaseToken: string,
  now: Date,
): Promise<DurableWorkflowJobRecordV1> {
  const record = await collection.findOne(activeLeaseFilter(jobId, leaseToken, now));
  if (!record) throw new DurableWorkflowJobLeaseLostErrorV1('DURABLE_JOB_LEASE_LOST');
  return record;
}

function toSnapshot(record: DurableWorkflowJobRecordV1): DurableWorkflowJobSnapshotV1 {
  const { _id: _id, leaseToken: _leaseToken, ...visible } = record;
  return structuredClone({
    ...visible,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
    nextAttemptAt: record.nextAttemptAt?.toISOString() ?? null,
    cancelRequestedAt: record.cancelRequestedAt?.toISOString() ?? null,
    resumeState: record.resumeState ? {
      ...record.resumeState,
      committedAt: record.resumeState.committedAt.toISOString(),
    } : null,
    terminalReceipt: record.terminalReceipt ? {
      ...record.terminalReceipt,
      completedAt: record.terminalReceipt.completedAt.toISOString(),
    } : null,
    error: record.error ? {
      ...record.error,
      occurredAt: record.error.occurredAt.toISOString(),
    } : null,
  });
}

function cloneJsonRecord(value: Readonly<Record<string, unknown>>) {
  if (!isJsonValue(value) || Array.isArray(value)) {
    throw new Error('DURABLE_JOB_PAYLOAD_NOT_JSON_OBJECT');
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_JSON_PAYLOAD_BYTES) {
    throw new Error('DURABLE_JOB_PAYLOAD_TOO_LARGE');
  }
  return JSON.parse(encoded) as Record<string, unknown>;
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function requireIdentity(value: string, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) throw new Error(`DURABLE_JOB_${label}_INVALID`);
  return normalized;
}

function optionalIdentity(value: string | null, label: string): string | null {
  return value === null ? null : requireIdentity(value, label);
}

function requireSha256(value: string, label: string): string {
  if (!SHA256.test(value)) throw new Error(`DURABLE_JOB_${label}_SHA256_INVALID`);
  return value;
}

function validDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`DURABLE_JOB_${label}_INVALID`);
  }
  return new Date(value);
}

function requireFutureDate(value: Date, now: Date, label: string): Date {
  const date = validDate(value, label);
  if (date <= now) throw new Error(`DURABLE_JOB_${label}_NOT_FUTURE`);
  return date;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`DURABLE_JOB_${label}_INVALID`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`DURABLE_JOB_${label}_INVALID`);
  }
  return value;
}

function boundedText(value: string, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isTerminal(status: DurableWorkflowJobRecordV1['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeDurableWorkflowJobJsonV1(toCanonicalValue(left))
    === canonicalizeDurableWorkflowJobJsonV1(toCanonicalValue(right));
}

function sameResumeStateContent(
  current: DurableWorkflowJobResumeStateV1 | null,
  proposed: DurableWorkflowJobResumeStateV1,
): boolean {
  return Boolean(current
    && current.sequence === proposed.sequence
    && current.schemaId === proposed.schemaId
    && current.stateSha256 === proposed.stateSha256
    && sameJson(current.payload, proposed.payload));
}

function toCanonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toCanonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, toCanonicalValue(entry)]));
  }
  return value;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 11000);
}
