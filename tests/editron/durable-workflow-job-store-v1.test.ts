import { describe, expect, it } from 'vitest';

import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobConflictErrorV1,
  DurableWorkflowJobLeaseLostErrorV1,
  DurableWorkflowJobTransitionErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobCreateInputV1,
  type DurableWorkflowJobRecordV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-23T09:00:00.000Z');
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function setup() {
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  return {
    collection,
    store: new DurableWorkflowJobStoreV1(async () => collection.asCollection()),
  };
}

function createInput(
  overrides: Partial<DurableWorkflowJobCreateInputV1> = {},
): DurableWorkflowJobCreateInputV1 {
  const payload = { episodeId: 'DEV-01', stage: 3 };
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    orgId: 'org-1',
    projectId: 'project-1',
    operationOwner: 'OpenEndedPlannerResearchV2R',
    operationKind: 'provider_native_episode',
    operationId: 'episode-1',
    parentCommandId: 'command-1',
    parentReceiptId: 'receipt-1',
    idempotencyKey: 'episode-1-attempts',
    input: {
      schemaId: 'PROVIDER_NATIVE_EPISODE_INPUT_V1',
      bindingSha256: hashDurableWorkflowJobJsonV1(payload),
      payload,
    },
    dependencies: [
      { dependencyId: 'z-policy', dependencyVersion: '1', bindingSha256: SHA_A },
      { dependencyId: 'a-roster', dependencyVersion: '2', bindingSha256: SHA_B },
    ],
    budgetReservation: { reservationId: 'budget-1', bindingSha256: SHA_A },
    maxAttempts: 3,
    ...overrides,
  };
}

function terminalReceipt(
  disposition: DurableWorkflowJobTerminalReceiptV1['disposition'],
  suffix = '1',
): DurableWorkflowJobTerminalReceiptV1 {
  return {
    disposition,
    receiptId: `terminal-${suffix}`,
    receiptSha256: suffix === '1' ? SHA_A : SHA_B,
    proofReferences: disposition === 'CANCELLED' ? [] : [{
      proofId: `proof-${suffix}`,
      proofSha256: suffix === '1' ? SHA_B : SHA_A,
      disposition: disposition === 'PASS' ? 'PASS' : 'UNVERIFIABLE',
    }],
    completedAt: new Date(START.getTime() + 1_000),
  };
}

function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs);
}

describe('DurableWorkflowJobStoreV1', () => {
  it('creates one tenant-scoped immutable job contract and rejects forged bindings', async () => {
    const { store } = setup();
    const first = await store.createOrGet(createInput(), START);
    expect(first.created).toBe(true);
    expect(first.job.dependencies.map(({ dependencyId }) => dependencyId))
      .toEqual(['a-roster', 'z-policy']);
    expect('leaseToken' in first.job).toBe(false);

    const replay = await store.createOrGet(createInput(), at(100));
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    await expect(store.createOrGet(createInput({ operationId: 'changed' }), at(200)))
      .rejects.toBeInstanceOf(DurableWorkflowJobConflictErrorV1);

    const forged = createInput({
      idempotencyKey: 'forged-input',
      input: { schemaId: 'INPUT_V1', bindingSha256: SHA_A, payload: { changed: true } },
    });
    await expect(store.createOrGet(forged, START))
      .rejects.toThrow('DURABLE_JOB_INPUT_BINDING_HASH_MISMATCH');
    await expect(store.getAuthorized({
      jobId: first.job.jobId, tenantId: 'tenant-2', userId: 'user-1',
    })).resolves.toBeNull();
  });

  it('atomically leases, checkpoints, reclaims expiry and rejects stale workers', async () => {
    const { store } = setup();
    const { job } = await store.createOrGet(createInput(), START);
    const first = await store.claim({ jobId: job.jobId, workerId: 'worker-a', now: START });
    expect(first.kind).toBe('claimed');
    if (first.kind !== 'claimed') throw new Error('expected first claim');
    expect(first.job.attemptCount).toBe(1);
    await expect(store.claim({ jobId: job.jobId, workerId: 'worker-b', now: at(1) }))
      .resolves.toMatchObject({ kind: 'skipped', reason: 'lease_held' });

    const statePayload = { turn: 1, providerRequestId: 'request-1' };
    const state = {
      schemaId: 'EPISODE_RESUME_V4',
      stateSha256: hashDurableWorkflowJobJsonV1(statePayload),
      payload: statePayload,
    };
    await store.saveResumeState({
      jobId: job.jobId, leaseToken: first.leaseToken, expectedSequence: 0,
      state, now: at(10),
    });
    await expect(store.saveResumeState({
      jobId: job.jobId, leaseToken: first.leaseToken, expectedSequence: 0,
      state, now: at(20),
    })).resolves.toBeUndefined();
    const alteredPayload = { ...statePayload, providerRequestId: 'forged' };
    await expect(store.saveResumeState({
      jobId: job.jobId, leaseToken: first.leaseToken, expectedSequence: 0,
      state: {
        ...state,
        payload: alteredPayload,
        stateSha256: hashDurableWorkflowJobJsonV1(alteredPayload),
      },
      now: at(30),
    })).rejects.toBeInstanceOf(DurableWorkflowJobConflictErrorV1);
    await expect(store.saveResumeState({
      jobId: job.jobId, leaseToken: first.leaseToken, expectedSequence: 1,
      state: { schemaId: 'EPISODE_RESUME_V4', stateSha256: SHA_A, payload: { turn: 2 } },
      now: at(40),
    })).rejects.toThrow('DURABLE_JOB_RESUME_STATE_HASH_MISMATCH');

    const reclaimedAt = at(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 + 1);
    const reclaimed = await store.claim({
      jobId: job.jobId, workerId: 'worker-b', now: reclaimedAt,
    });
    expect(reclaimed.kind).toBe('claimed');
    if (reclaimed.kind !== 'claimed') throw new Error('expected reclaimed lease');
    expect(reclaimed.job.attemptCount).toBe(2);
    await expect(store.heartbeat({
      jobId: job.jobId, leaseToken: first.leaseToken, now: reclaimedAt,
    })).rejects.toBeInstanceOf(DurableWorkflowJobLeaseLostErrorV1);
  });

  it('cancels queued and running work without stranding expired cancellation requests', async () => {
    const { store } = setup();
    const queued = await store.createOrGet(createInput({ idempotencyKey: 'queued-cancel' }), START);
    const cancelled = await store.requestCancellation({
      jobId: queued.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      requestedBy: 'user-1', reason: 'No longer needed', now: at(100),
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' },
    });
    await expect(store.claim({
      jobId: queued.job.jobId, workerId: 'worker-a', now: at(200),
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'terminal' });

    const running = await store.createOrGet(createInput({ idempotencyKey: 'running-cancel' }), START);
    const claim = await store.claim({
      jobId: running.job.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('expected running claim');
    await store.requestCancellation({
      jobId: running.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
      requestedBy: 'user-1', reason: 'Stop', now: at(100),
    });
    await expect(store.heartbeat({
      jobId: running.job.jobId, leaseToken: claim.leaseToken, now: at(200),
    })).resolves.toBe('CANCEL_REQUESTED');
    await expect(store.saveResumeState({
      jobId: running.job.jobId, leaseToken: claim.leaseToken, expectedSequence: 0,
      state: {
        schemaId: 'STATE_V1',
        stateSha256: hashDurableWorkflowJobJsonV1({}),
        payload: {},
      },
      now: at(300),
    })).rejects.toBeInstanceOf(DurableWorkflowJobTransitionErrorV1);

    const cleanup = await store.claim({
      jobId: running.job.jobId,
      workerId: 'cleanup-worker',
      now: at(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 + 1),
    });
    expect(cleanup.kind).toBe('cancel_claimed');
    if (cleanup.kind !== 'cancel_claimed') throw new Error('expected cancellation lease');
    const receipt = terminalReceipt('CANCELLED');
    await store.markCancelled({
      jobId: running.job.jobId,
      leaseToken: cleanup.leaseToken,
      receipt,
      now: at(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 + 2),
    });
    await expect(store.markCancelled({
      jobId: running.job.jobId,
      leaseToken: cleanup.leaseToken,
      receipt,
      now: at(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 + 3),
    })).resolves.toBeUndefined();
  });

  it('persists retry cursors, enforces due time and dead-letters exhausted work', async () => {
    const { store } = setup();
    const created = await store.createOrGet(createInput({
      idempotencyKey: 'retry-job', maxAttempts: 2,
    }), START);
    const first = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-a', now: START,
    });
    if (first.kind !== 'claimed') throw new Error('expected retry claim');
    await expect(store.retryOrDeadLetter({
      jobId: created.job.jobId,
      leaseToken: first.leaseToken,
      error: { code: 'PROVIDER_TIMEOUT', message: 'timeout', retryable: true, occurredAt: at(1) },
      retryAt: at(1_000),
      retryCursor: { turn: 2 },
      now: at(10),
    })).resolves.toBe('retry_wait');
    await expect(store.claim({
      jobId: created.job.jobId, workerId: 'worker-b', now: at(999),
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'retry_not_due' });
    const second = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-b', now: at(1_000),
    });
    if (second.kind !== 'claimed') throw new Error('expected second attempt');
    await expect(store.retryOrDeadLetter({
      jobId: created.job.jobId,
      leaseToken: second.leaseToken,
      error: { code: 'STILL_BAD', message: 'failed', retryable: true, occurredAt: at(1_001) },
      retryAt: at(2_000),
      retryCursor: { turn: 3 },
      now: at(1_001),
    })).resolves.toBe('dead_letter');
  });

  it('defers healthy external waiting without consuming a failure attempt', async () => {
    const { store } = setup();
    const created = await store.createOrGet(createInput({
      idempotencyKey: 'healthy-wait-job', maxAttempts: 2,
    }), START);
    const first = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-a', now: START,
    });
    if (first.kind !== 'claimed') throw new Error('expected healthy wait claim');
    await store.saveResumeState({
      jobId: created.job.jobId,
      leaseToken: first.leaseToken,
      expectedSequence: 0,
      state: {
        schemaId: 'EXTERNAL_WAIT_V1',
        stateSha256: hashDurableWorkflowJobJsonV1({ callId: 'call-a' }),
        payload: { callId: 'call-a' },
      },
      now: at(10),
    });
    await store.deferUntil({
      jobId: created.job.jobId,
      leaseToken: first.leaseToken,
      resumeCursor: { externalState: 'PENDING' },
      resumeAt: at(1_000),
      now: at(20),
    });

    await expect(store.getAuthorized({
      jobId: created.job.jobId, tenantId: 'tenant-1', userId: 'user-1',
    })).resolves.toMatchObject({
      status: 'retry_wait',
      attemptCount: 1,
      remainingAttempts: 2,
      error: null,
      retryCursor: { externalState: 'PENDING' },
      resumeState: { sequence: 1, payload: { callId: 'call-a' } },
    });
    await expect(store.claim({
      jobId: created.job.jobId, workerId: 'worker-b', now: at(999),
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'retry_not_due' });
    const resumed = await store.claim({
      jobId: created.job.jobId, workerId: 'worker-b', now: at(1_000),
    });
    expect(resumed).toMatchObject({
      kind: 'claimed',
      job: { attemptCount: 2, remainingAttempts: 1 },
    });
  });

  it('settles once, preserves proof disposition and lists only recoverable work', async () => {
    const { store } = setup();
    const active = await store.createOrGet(createInput({ idempotencyKey: 'complete-job' }), START);
    const queued = await store.createOrGet(createInput({ idempotencyKey: 'recoverable-job' }), START);
    await store.recordDispatch({
      jobId: queued.job.jobId, transport: 'qstash', messageId: 'message-1', now: at(1),
    });
    const claim = await store.claim({
      jobId: active.job.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('expected completion claim');
    const receipt = terminalReceipt('PASS');
    await store.complete({
      jobId: active.job.jobId, leaseToken: claim.leaseToken, receipt, now: at(1_000),
    });
    await expect(store.complete({
      jobId: active.job.jobId, leaseToken: claim.leaseToken, receipt, now: at(2_000),
    })).resolves.toBeUndefined();
    await expect(store.complete({
      jobId: active.job.jobId,
      leaseToken: claim.leaseToken,
      receipt: terminalReceipt('FAIL', '2'),
      now: at(2_000),
    })).rejects.toBeInstanceOf(DurableWorkflowJobLeaseLostErrorV1);

    const recoverable = await store.listRecoverable({
      staleBefore: at(10), now: at(10), limit: 10,
    });
    expect(recoverable.map(({ jobId }) => jobId)).toEqual([queued.job.jobId]);
    expect(recoverable[0]).toMatchObject({
      dispatchTransport: 'qstash', dispatchMessageId: 'message-1', dispatchCount: 1,
    });
  });
});
