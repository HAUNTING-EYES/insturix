import { describe, expect, it } from 'vitest';
import { resolveEditorialPlanDurableJobV1 }
  from '@/lib/editron/services/editorial-plan-durable-job-resolver-v1';
import { createEditorialPlanRevisionV1 }
  from '@/lib/editron/services/editorial-plan-v1';
import {
  hashDurableWorkflowJobJsonV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import {
  createPreparedEditorialPlanDurableFixtureV1 as prepared,
  EDITORIAL_PLAN_FIXTURE_RECLAIM_V1 as RECLAIM,
  EDITORIAL_PLAN_FIXTURE_START_V1 as START,
  editorialPlanFixtureInputV1 as planInput,
} from './helpers/editorial-plan-durable-fixture-v1';

describe('editorial plan durable job recovery', () => {
  it('reclaims a crashed lease, revalidates owners and ignores duplicate delivery', async () => {
    const setup = await prepared();
    const first = await setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'process-a', now: START,
    });
    expect(first.kind).toBe('claimed');
    if (first.kind !== 'claimed') throw new Error('EXPECTED_INITIAL_CLAIM');

    const restartedPlanStore = setup.planStore();
    const restartedJobStore = setup.jobStoreFactory();
    const reclaimed = await restartedJobStore.claim({
      jobId: setup.jobId, workerId: 'process-b', now: RECLAIM,
    });
    expect(reclaimed.kind).toBe('claimed');
    if (reclaimed.kind !== 'claimed') throw new Error('EXPECTED_RECLAIM');
    expect(reclaimed.job.attemptCount).toBe(2);
    await expect(restartedJobStore.heartbeat({
      jobId: setup.jobId, leaseToken: first.leaseToken, now: RECLAIM,
    })).rejects.toThrow('DURABLE_JOB_LEASE_LOST');
    const resolved = await resolveEditorialPlanDurableJobV1({
      planStore: restartedPlanStore, job: reclaimed.job,
    });
    expect(resolved).toMatchObject({
      plan: { revisionSha256: setup.active.revisionSha256 },
      node: { nodeId: 'root', status: 'READY' },
      definition: { definitionId: setup.definition.definitionId },
    });
    await expect(restartedJobStore.claim({
      jobId: setup.jobId, workerId: 'duplicate-delivery', now: RECLAIM,
    })).resolves.toMatchObject({ kind: 'skipped', reason: 'lease_held' });
  });

  it('rejects execution after the accepted plan head changes', async () => {
    const setup = await prepared();
    const next = createEditorialPlanRevisionV1(planInput({
      planRevision: 3, previousRevisionSha256: setup.active.revisionSha256,
      nodes: setup.active.nodes, changeReason: 'unrelated accepted plan update',
    }));
    await setup.planStore().appendSuccessor({
      plan: next, expectedCurrentRevisionSha256: setup.active.revisionSha256, now: START,
    });
    const claim = await setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('EXPECTED_CLAIM');
    await expect(resolveEditorialPlanDurableJobV1({
      planStore: setup.planStore(), job: claim.job,
    })).rejects.toThrow('PLAN_JOB_RESOLUTION_PLAN_STALE');
  });

  it('independently rejects a forged payload even with its hash recomputed', async () => {
    const setup = await prepared();
    const job = await setup.jobStore.getAuthorized({
      jobId: setup.jobId, tenantId: 'tenant-a', userId: 'user-a',
    });
    if (!job) throw new Error('EXPECTED_JOB');
    await expect(resolveEditorialPlanDurableJobV1({
      planStore: setup.planStore(), job,
    })).rejects.toThrow('PLAN_JOB_RESOLUTION_STATUS_INVALID');
    const claim = await setup.jobStore.claim({
      jobId: setup.jobId, workerId: 'worker-a', now: START,
    });
    if (claim.kind !== 'claimed') throw new Error('EXPECTED_CLAIM');
    const payload = {
      ...claim.job.input.payload,
      projectId: 'project-forged',
    };
    const forged = {
      ...claim.job,
      projectId: 'project-forged',
      input: {
        ...claim.job.input, payload,
        bindingSha256: hashDurableWorkflowJobJsonV1(payload),
      },
    };
    await expect(resolveEditorialPlanDurableJobV1({
      planStore: setup.planStore(), job: forged,
    })).rejects.toThrow('PLAN_JOB_RESOLUTION_PLAN_NOT_FOUND');
  });
});
