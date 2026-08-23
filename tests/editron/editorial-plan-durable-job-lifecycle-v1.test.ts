import { describe, expect, it } from 'vitest';

import { resolveEditorialPlanDurableJobV1 }
  from '@/lib/editron/services/editorial-plan-durable-job-resolver-v1';
import type { EditorialPlanArtifactRefV1 }
  from '@/lib/editron/services/editorial-plan-v1';
import {
  createPreparedEditorialPlanDurableFixtureV1 as prepared,
  EDITORIAL_PLAN_FIXTURE_RECLAIM_V1 as RECLAIM,
  EDITORIAL_PLAN_FIXTURE_START_V1 as START,
} from './helpers/editorial-plan-durable-fixture-v1';

const HASH = 'c'.repeat(64);

describe('editorial plan durable job lifecycle', () => {
  it('keeps approval-required work out of execution without USER lineage', async () => {
    await expect(prepared({
      approvalRequirementRefs: [approval()],
      activeAcceptedBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    })).rejects.toThrow('PLAN_JOB_USER_APPROVAL_REQUIRED');
  });

  it('binds a USER-accepted approval requirement into the immutable job contract', async () => {
    const setup = await prepared({
      approvalRequirementRefs: [approval()],
      activeAcceptedBy: { actorId: 'user-a', actorKind: 'USER' },
    });
    const job = await setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    });
    expect(job?.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({
      dependencyId: 'approval-requirement-001',
      dependencyVersion: 'v1',
      bindingSha256: HASH,
    })]));
  });

  it('enforces tenant-scoped cancellation and rejects cancelled execution', async () => {
    const setup = await prepared();
    await expect(setup.jobStore.requestCancellation({
      jobId: setup.jobId, tenantId: 'tenant-b', userId: 'user-a',
      requestedBy: 'user-a', reason: 'forged tenant', now: at(10),
    })).resolves.toBeNull();
    const cancelled = await setup.jobStore.requestCancellation({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
      requestedBy: 'user-a', reason: 'stop this episode', now: at(20),
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' },
    });
    if (!cancelled) throw new Error('EXPECTED_CANCELLED_JOB');
    await expect(resolveEditorialPlanDurableJobV1({
      planStore: setup.planStore(), job: cancelled,
    })).rejects.toThrow('PLAN_JOB_RESOLUTION_STATUS_INVALID');
    await expect(setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'late-worker', now: at(30),
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'terminal' });
  });

  it('dead-letters queued work at expiry before dispatch or execution', async () => {
    const expiresAt = at(1_000);
    const setup = await prepared({ expiresAt });
    await expect(setup.jobStore.recordDispatch({
      jobId: setup.jobId, transport: 'qstash', messageId: 'late-message',
      now: expiresAt,
    })).rejects.toThrow('DURABLE_JOB_DISPATCH_STATE_INVALID');
    await expect(setup.jobStore.listRecoverable({
      staleBefore: START, now: expiresAt,
    })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: setup.jobId }),
    ]));
    await expect(setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'late-worker', now: expiresAt,
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'expired' });
    await expect(setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    })).resolves.toMatchObject({
      status: 'dead_letter', attemptCount: 0,
      error: { code: 'JOB_EXPIRED', retryable: false },
    });
  });

  it('invalidates an active lease when the job deadline passes', async () => {
    const expiresAt = at(1_000);
    const setup = await prepared({ expiresAt });
    const claim = await setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('EXPECTED_ACTIVE_CLAIM');
    await expect(setup.jobStore.heartbeat({
      jobId: setup.jobId, leaseToken: claim.leaseToken, now: expiresAt,
    })).rejects.toThrow('DURABLE_JOB_LEASE_LOST');
    await expect(setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'cleanup-worker', now: expiresAt,
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'expired' });
  });

  it('preserves an explicit cancellation through deadline and lease expiry', async () => {
    const setup = await prepared({ expiresAt: at(1_000) });
    const claim = await setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('EXPECTED_ACTIVE_CLAIM');
    await setup.jobStore.requestCancellation({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
      requestedBy: 'user-a', reason: 'stop before deadline', now: at(500),
    });
    const cleanup = await setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'cleanup-worker', now: RECLAIM,
    });
    if (cleanup.kind !== 'cancel_claimed') throw new Error('EXPECTED_CANCEL_CLAIM');
    await setup.jobStore.markCancelled({
      jobId: setup.jobId, leaseToken: cleanup.leaseToken,
      receipt: {
        disposition: 'CANCELLED', receiptId: 'cancel-after-expiry',
        receiptSha256: HASH, proofReferences: [],
        completedAt: new Date(RECLAIM.getTime() + 1),
      },
      now: new Date(RECLAIM.getTime() + 1),
    });
    await expect(setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    })).resolves.toMatchObject({
      status: 'cancelled', terminalReceipt: { disposition: 'CANCELLED' },
    });
  });
});

function approval(): EditorialPlanArtifactRefV1 {
  return {
    ownerId: 'PLAN_SERVICE', artifactId: 'approval-policy-v1',
    artifactVersion: 'v1', artifactSha256: HASH,
  };
}
function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs);
}
