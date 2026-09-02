import { describe, expect, it, vi } from 'vitest';

import {
  type DurableWorkflowJobRecordV1,
  type DurableWorkflowJobSnapshotV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-attempt-v2';
import {
  createMediaProxyMasterTranscodeDurableResultV2,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV2,
  createMediaProxyMasterTranscodePreparedResumeStateV2,
  createMediaProxyMasterTranscodeResultResumeStateV2,
  createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import {
  MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
  MediaProxyMasterTranscodeDurableWorkerPortErrorV2,
  runMediaProxyMasterTranscodeDurableWorkerV2,
  type MediaProxyMasterTranscodeAttemptOwnerV2,
  type MediaProxyMasterTranscodeBudgetOwnerV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-worker-v2';
import {
  buildMediaProxyMasterTranscodeV2Fixture,
  createMediaProxyMasterTranscodePreparedStateV2Fixture,
} from './helpers/media-proxy-master-transcode-v2-fixture';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const START = new Date('2026-08-30T00:12:02.000Z');
type WorkerInputV2 = Parameters<
  typeof runMediaProxyMasterTranscodeDurableWorkerV2
>[0];

describe('MediaProxyMasterTranscodeDurableWorkerV2', () => {
  it('rereads both resume commits before terminal PASS and settles replay',
    async () => {
      const fixture = workerFixture();

      expect(await fixture.run()).toMatchObject({
        kind: 'completed',
        disposition: 'PASS',
      });
      expect(fixture.attemptSequences).toEqual([0, 1, 2]);
      expect(fixture.getAuthorized).toHaveBeenCalledTimes(3);
      expect(await fixture.snapshot()).toMatchObject({
        status: 'completed',
        resumeState: { sequence: 2 },
        terminalReceipt: { disposition: 'PASS' },
      });
      expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(1);

      expect(await fixture.run()).toEqual({ kind: 'skipped', reason: 'terminal' });
      expect(fixture.attemptSequences).toEqual([0, 1, 2]);
      expect(fixture.budgetOwner.authorize).toHaveBeenCalledTimes(1);
      expect(fixture.budgetOwner.settleTerminal).toHaveBeenCalledTimes(2);
    });

  it('retries completion transport loss from sequence two without predecessors',
    async () => {
      const fixture = workerFixture();
      let failCompletion = true;
      const complete: WorkerInputV2['jobStore']['complete'] = async (input) => {
        if (failCompletion) {
          failCompletion = false;
          throw new Error('simulated completion transport loss');
        }
        return fixture.jobStore.complete(input);
      };

      expect(await fixture.run({
        jobStore: storePorts(fixture, { complete }),
      })).toEqual({
        kind: 'retry_wait',
        jobId: fixture.contract.job.jobId,
        errorCode:
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESULT_COMPLETION_FAILED',
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'retry_wait',
        resumeState: { sequence: 2 },
      });
      expect(fixture.attemptSequences).toEqual([0, 1, 2]);

      fixture.advance(2_000);
      expect(await fixture.run()).toMatchObject({
        kind: 'completed', disposition: 'PASS',
      });
      expect(fixture.attemptSequences).toEqual([0, 1, 2, 2]);
    });

  it('recovers a committed sequence after its first reread is unavailable',
    async () => {
      const fixture = workerFixture();
      let firstRead = true;
      const getAuthorized: WorkerInputV2['jobStore']['getAuthorized'] =
        async (input) => {
          if (firstRead) {
            firstRead = false;
            throw new Error('simulated primary read outage');
          }
          return fixture.jobStore.getAuthorized(input);
        };

      expect(await fixture.run({
        jobStore: storePorts(fixture, { getAuthorized }),
      })).toEqual({
        kind: 'retry_wait',
        jobId: fixture.contract.job.jobId,
        errorCode:
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESUME_RELOAD_FAILED',
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'retry_wait', resumeState: { sequence: 1 },
      });
      expect(fixture.attemptSequences).toEqual([0]);

      fixture.advance(2_000);
      expect(await fixture.run()).toMatchObject({
        kind: 'completed', disposition: 'PASS',
      });
      expect(fixture.attemptSequences).toEqual([0, 1, 2]);
    });

  it('dead-letters a substituted post-commit reread without advancing', async () => {
    const fixture = workerFixture();
    let firstRead = true;
    const getAuthorized: WorkerInputV2['jobStore']['getAuthorized'] =
      async (input) => {
        const current = await fixture.jobStore.getAuthorized(input);
        if (!firstRead || !current?.resumeState) return current;
        firstRead = false;
        return {
          ...current,
          resumeState: {
            ...current.resumeState,
            stateSha256: 'f'.repeat(64),
          },
        };
      };

    expect(await fixture.run({
      jobStore: storePorts(fixture, { getAuthorized }),
    })).toEqual({
      kind: 'dead_letter',
      jobId: fixture.contract.job.jobId,
      errorCode:
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_POST_RESUME_STATE_INVALID',
    });
    expect(fixture.attemptSequences).toEqual([0]);
    expect(await fixture.snapshot()).toMatchObject({
      status: 'dead_letter', resumeState: { sequence: 1 },
    });
  });

  it('rejects owner drift before budget or attempt access', async () => {
    const fixture = workerFixture();

    expect(await fixture.run({
      attemptOwner: {
        ...fixture.attemptOwner,
        publicationPolicySha256: 'f'.repeat(64),
      },
    })).toEqual({
      kind: 'dead_letter',
      jobId: fixture.contract.job.jobId,
      errorCode:
        'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_OWNER_BINDING_MISMATCH',
    });
    expect(fixture.authorize).not.toHaveBeenCalled();
    expect(fixture.runAttempt).not.toHaveBeenCalled();
    expect(fixture.settleTerminal).not.toHaveBeenCalled();
  });

  it('observes cancellation through the heartbeat and aborts the attempt',
    async () => {
      const fixture = workerFixture({ heartbeatIntervalMs: 1 });
      fixture.runAttempt.mockImplementationOnce(async ({ abortSignal }) => {
        await fixture.jobStore.requestCancellation({
          jobId: fixture.contract.job.jobId,
          tenantId: fixture.contract.job.tenantId,
          userId: fixture.contract.job.userId,
          requestedBy: fixture.contract.job.userId,
          reason: 'cancel_proxy_v2',
          now: fixture.clock(),
        });
        await new Promise<void>((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => {
            reject(new MediaProxyMasterTranscodeDurableWorkerPortErrorV2(
              'ATTEMPT_ABORTED',
              true,
            ));
          }, { once: true });
        });
        throw new Error('unreachable');
      });

      expect(await fixture.run()).toEqual({
        kind: 'cancelled', jobId: fixture.contract.job.jobId,
      });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'cancelled',
        terminalReceipt: { disposition: 'CANCELLED' },
      });
      expect(fixture.settleTerminal).toHaveBeenCalledTimes(1);
    });

  it('records both bounded unverifiable stop and retry decisions', async () => {
    const stopped = workerFixture();
    stopped.runAttempt.mockResolvedValueOnce({
      kind: 'unverifiable',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE',
    });
    expect(await stopped.run()).toMatchObject({
      kind: 'completed', disposition: 'UNVERIFIABLE',
    });
    expect(await stopped.snapshot()).toMatchObject({
      status: 'completed', resumeState: null,
      terminalReceipt: { disposition: 'UNVERIFIABLE' },
    });

    const retried = workerFixture();
    retried.runAttempt.mockResolvedValueOnce({
      kind: 'unverifiable',
      diagnostic: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE',
    });
    retried.decide.mockImplementationOnce(async ({ now }) => ({
      disposition: 'RETRY_AT',
      retryAt: new Date(now.getTime() + 1_000),
    }));
    expect(await retried.run()).toEqual({
      kind: 'retry_wait',
      jobId: retried.contract.job.jobId,
      errorCode: 'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_TOOL_UNAVAILABLE',
    });
    expect(await retried.snapshot()).toMatchObject({
      status: 'retry_wait', resumeState: null,
      retryCursor: { retryDisposition: 'RETRY_AT' },
    });
    expect(retried.settleTerminal).not.toHaveBeenCalled();
  });

  it('blocks changed budget authorization before resuming sequence one',
    async () => {
      const fixture = workerFixture();
      fixture.runAttempt.mockImplementationOnce(
        fixture.attemptImplementation,
      ).mockRejectedValueOnce(
        new MediaProxyMasterTranscodeDurableWorkerPortErrorV2(
          'PUBLICATION_TEMPORARILY_UNAVAILABLE',
          true,
        ),
      );

      expect(await fixture.run()).toMatchObject({ kind: 'retry_wait' });
      expect(await fixture.snapshot()).toMatchObject({
        status: 'retry_wait', resumeState: { sequence: 1 },
      });
      fixture.advance(2_000);
      fixture.authorize.mockResolvedValueOnce({
        disposition: 'AUTHORIZED',
        reservationId: fixture.contract.job.budgetReservation!.reservationId,
        reservationBindingSha256:
          fixture.contract.job.budgetReservation!.bindingSha256,
        authorizationReceiptSha256: 'f'.repeat(64),
      });

      expect(await fixture.run()).toEqual({
        kind: 'dead_letter',
        jobId: fixture.contract.job.jobId,
        errorCode:
          'MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_WORKER_V2_BUDGET_REAUTHORIZATION_MISMATCH',
      });
      expect(fixture.attemptSequences).toEqual([0]);
    });
});

function workerFixture(input: Readonly<{
  heartbeatIntervalMs?: number;
}> = {}) {
  const contract = buildMediaProxyMasterTranscodeV2Fixture();
  const collection = new StatefulMongoCollection<DurableWorkflowJobRecordV1>([
    snapshotToRecord(contract.job),
  ]);
  const jobStore = new DurableWorkflowJobStoreV1(
    async () => collection.asCollection(),
  );
  let nowMs = START.getTime();
  const clock = () => new Date(++nowMs);
  const advance = (milliseconds: number) => { nowMs += milliseconds; };
  const getAuthorized = vi.fn(jobStore.getAuthorized.bind(jobStore));
  const attemptSequences: number[] = [];
  const attemptImplementation: MediaProxyMasterTranscodeAttemptOwnerV2['run'] =
    async ({ job, clock: attemptClock }) => {
      const sequence = job.resumeState?.sequence ?? 0;
      attemptSequences.push(sequence);
      if (sequence === 0) {
        const preparedState =
          createMediaProxyMasterTranscodePreparedStateV2Fixture(contract);
        return {
          kind: 'persist_resume',
          disposition: 'PREPARED_ARTIFACT',
          expectedSequence: 0,
          resumeState: createMediaProxyMasterTranscodePreparedResumeStateV2({
            job,
            preparedState,
          }),
        };
      }
      if (sequence === 1) {
        const trustedTranscodeReceipt =
          createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
            job,
            proxySourceVersion: contract.seedReceipt.proxyEncode.sourceVersion,
            completedAt: attemptClock().toISOString(),
          });
        const result = createMediaProxyMasterTranscodeDurableResultV2({
          job,
          trustedTranscodeReceipt,
        });
        return {
          kind: 'persist_resume',
          disposition: 'TRUSTED_RESULT',
          expectedSequence: 1,
          resumeState: createMediaProxyMasterTranscodeResultResumeStateV2({
            job,
            result,
          }),
        };
      }
      return {
        kind: 'complete',
        receipt: createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
          job,
          completedAt: attemptClock(),
        }),
      };
    };
  const runAttempt = vi.fn<
    Parameters<MediaProxyMasterTranscodeAttemptOwnerV2['run']>,
    ReturnType<MediaProxyMasterTranscodeAttemptOwnerV2['run']>
  >(attemptImplementation);
  const attemptOwner = {
    ownerId: MEDIA_PROXY_MASTER_TRANSCODE_ATTEMPT_OWNER_ID_V2,
    ownerVersion: MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_ATTEMPT_VERSION_V2,
    runtimePolicyBindingSha256:
      contract.contract.payload.runtimePolicy.bindingSha256,
    publicationPolicySha256:
      contract.contract.payload.publicationPolicy.policySha256,
    preparedArtifactPolicySha256:
      contract.contract.payload.preparedArtifactPolicy.policySha256,
    run: runAttempt,
  } satisfies MediaProxyMasterTranscodeAttemptOwnerV2;
  const authorize = vi.fn<
    Parameters<MediaProxyMasterTranscodeBudgetOwnerV2['authorize']>,
    ReturnType<MediaProxyMasterTranscodeBudgetOwnerV2['authorize']>
  >(async () => ({
    disposition: 'AUTHORIZED' as const,
    reservationId: contract.job.budgetReservation!.reservationId,
    reservationBindingSha256:
      contract.job.budgetReservation!.bindingSha256,
    authorizationReceiptSha256:
      contract.budgetAuthorization.authorizationSha256,
  }));
  const settleTerminal = vi.fn(async () => undefined);
  const budgetOwner = {
    ...contract.contract.payload.runtimePolicy.executionBudgetPolicy,
    authorize,
    settleTerminal,
  } satisfies MediaProxyMasterTranscodeBudgetOwnerV2;
  const decide = vi.fn<
    Parameters<WorkerInputV2['retryOwner']['decide']>,
    ReturnType<WorkerInputV2['retryOwner']['decide']>
  >(async ({ now, retryableHint }) => (
    retryableHint === true
      ? {
          disposition: 'RETRY_AT' as const,
          retryAt: new Date(now.getTime() + 1_000),
        }
      : {
          disposition: 'STOP_UNVERIFIABLE' as const,
          reason: 'bounded_stop',
        }
  ));
  const retryOwner = {
    ...contract.contract.payload.runtimePolicy.retryPolicy,
    decide,
  };
  const heartbeatOwner = {
    ...contract.contract.payload.runtimePolicy.heartbeatPolicy,
    heartbeatIntervalMs: input.heartbeatIntervalMs ?? 1_000,
  };
  const baseStore = storePorts({ jobStore, getAuthorized });
  const run = (overrides: Partial<WorkerInputV2> = {}) => (
    runMediaProxyMasterTranscodeDurableWorkerV2({
      jobStore: baseStore,
      jobId: contract.job.jobId,
      workerId: 'proxy-v2-worker',
      budgetOwner,
      retryOwner,
      heartbeatOwner,
      attemptOwner,
      clock,
      ...overrides,
    })
  );
  const snapshot = () => jobStore.getAuthorized({
    jobId: contract.job.jobId,
    tenantId: contract.job.tenantId,
    userId: contract.job.userId,
  });
  return {
    contract,
    collection,
    jobStore,
    getAuthorized,
    clock,
    advance,
    attemptImplementation,
    attemptOwner,
    attemptSequences,
    runAttempt,
    budgetOwner,
    authorize,
    settleTerminal,
    retryOwner,
    decide,
    heartbeatOwner,
    run,
    snapshot,
  };
}

function storePorts(
  fixture: Readonly<{
    jobStore: DurableWorkflowJobStoreV1;
    getAuthorized?: WorkerInputV2['jobStore']['getAuthorized'];
  }>,
  overrides: Partial<WorkerInputV2['jobStore']> = {},
): WorkerInputV2['jobStore'] {
  const store = fixture.jobStore;
  return {
    claim: store.claim.bind(store),
    heartbeat: store.heartbeat.bind(store),
    saveResumeState: store.saveResumeState.bind(store),
    complete: store.complete.bind(store),
    retryOrDeadLetter: store.retryOrDeadLetter.bind(store),
    markCancelled: store.markCancelled.bind(store),
    getAuthorized: fixture.getAuthorized ?? store.getAuthorized.bind(store),
    ...overrides,
  };
}

function snapshotToRecord(
  snapshot: Readonly<DurableWorkflowJobSnapshotV1>,
): DurableWorkflowJobRecordV1 {
  return {
    ...snapshot,
    _id: snapshot.jobId,
    leaseToken: null,
    status: 'queued',
    attemptCount: 0,
    remainingAttempts: snapshot.maxAttempts,
    retryCursor: null,
    leaseOwnerId: null,
    createdAt: new Date(snapshot.createdAt),
    updatedAt: new Date(snapshot.createdAt),
    expiresAt: new Date(snapshot.expiresAt),
    leaseExpiresAt: null,
    nextAttemptAt: null,
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    cancelReason: null,
    resumeState: null,
    terminalReceipt: null,
    error: null,
  };
}
