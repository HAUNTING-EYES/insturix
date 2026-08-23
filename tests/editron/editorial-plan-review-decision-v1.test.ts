import { describe, expect, it } from 'vitest';

import { recordEditorialPlanReviewDecisionV1 }
  from '@/lib/editron/services/editorial-plan-review-decision-v1';
import { createEditorialPlanRevisionV1 }
  from '@/lib/editron/services/editorial-plan-v1';
import {
  createEditorialPlanDurableFixtureStoresV1,
  EDITORIAL_PLAN_FIXTURE_START_V1 as START,
  editorialPlanFixtureInputV1,
} from './helpers/editorial-plan-durable-fixture-v1';

const HASH = 'd'.repeat(64);

describe('editorial plan review decision', () => {
  it('records owner approval as one immutable READY_TO_APPLY successor', async () => {
    const setup = await waitingPlan();
    const next = await decide(setup, 'APPROVE', 'Preview is approved.');
    expect(next).toMatchObject({
      planRevision: 2,
      previousRevisionSha256: setup.plan.revisionSha256,
      acceptedBy: { actorId: 'user-a', actorKind: 'USER' },
      changeReason: 'review:approve:Preview is approved.',
      nodes: [{
        nodeId: 'root', nodeVersion: 2, status: 'READY_TO_APPLY',
        approvalRequirementRefs: [expect.objectContaining({ artifactSha256: HASH })],
      }],
    });
    expect(setup.stores.plans.snapshot()).toHaveLength(2);
  });

  it('records owner decline as one immutable CANCELLED successor', async () => {
    const setup = await waitingPlan();
    const next = await decide(setup, 'CANCEL', 'Keep the current manual edit.');
    expect(next.nodes[0]).toMatchObject({
      nodeVersion: 2, status: 'CANCELLED', finalDisposition: null,
    });
  });

  it('rejects wrong actor, tenant and stale review without appending', async () => {
    const setup = await waitingPlan();
    await expect(decide(setup, 'APPROVE', 'forged', {
      authenticatedActorId: 'other-user',
    })).rejects.toThrow('PLAN_REVIEW_ACTOR_UNAUTHORIZED');
    await expect(decide(setup, 'APPROVE', 'forged', {
      tenantId: 'tenant-b',
    })).rejects.toThrow('PLAN_REVIEW_PLAN_NOT_FOUND');
    await expect(decide(setup, 'APPROVE', 'stale', {
      expectedCurrentRevisionSha256: 'e'.repeat(64),
    })).rejects.toThrow('PLAN_REVIEW_PLAN_STALE');
    expect(setup.stores.plans.snapshot()).toHaveLength(1);
  });

  it('rejects blank reasons and non-review nodes', async () => {
    const setup = await waitingPlan();
    await expect(decide(setup, 'APPROVE', '   '))
      .rejects.toThrow('PLAN_REVIEW_REASON_REQUIRED');
    const base = editorialPlanFixtureInputV1();
    const ready = createEditorialPlanRevisionV1({
      ...base, planId: 'ready-plan', nodes: [{ ...base.nodes[0], status: 'READY' }],
    });
    await setup.stores.planStore().createInitial(ready, START);
    await expect(recordEditorialPlanReviewDecisionV1({
      planStore: setup.stores.planStore(), tenantId: ready.tenantId,
      userId: ready.userId, projectId: ready.projectId, planId: ready.planId,
      nodeId: 'root', expectedCurrentRevisionSha256: ready.revisionSha256,
      authenticatedActorId: ready.userId, decision: 'APPROVE', reason: 'invalid',
      now: START,
    })).rejects.toThrow('PLAN_REVIEW_NODE_STATUS_INVALID');
  });

  it('rejects a raw SYSTEM bypass from NEEDS_REVIEW to READY_TO_APPLY', async () => {
    const setup = await waitingPlan();
    const { revisionSha256, ...previous } = setup.plan;
    const forged = createEditorialPlanRevisionV1({
      ...previous,
      planRevision: 2,
      previousRevisionSha256: revisionSha256,
      nodes: [{ ...setup.plan.nodes[0], nodeVersion: 2, status: 'READY_TO_APPLY' }],
      acceptedBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
      changeReason: 'forged review transition',
    });
    await expect(setup.stores.planStore().appendSuccessor({
      plan: forged, expectedCurrentRevisionSha256: setup.plan.revisionSha256,
      now: START,
    })).rejects.toThrow('PLAN_SUCCESSOR_REVIEW_APPROVAL_REQUIRED');
  });
});

async function waitingPlan() {
  const stores = createEditorialPlanDurableFixtureStoresV1();
  const base = editorialPlanFixtureInputV1();
  const plan = createEditorialPlanRevisionV1({
    ...base,
    nodes: [{
      ...base.nodes[0], status: 'NEEDS_REVIEW',
      approvalRequirementRefs: [{
        ownerId: 'PLAN_SERVICE', artifactId: 'owner-preview-approval',
        artifactVersion: 'v1', artifactSha256: HASH,
      }],
    }],
  });
  await stores.planStore().createInitial(plan, START);
  return { stores, plan };
}

function decide(
  setup: Awaited<ReturnType<typeof waitingPlan>>,
  decision: 'APPROVE' | 'CANCEL',
  reason: string,
  overrides: Partial<Parameters<typeof recordEditorialPlanReviewDecisionV1>[0]> = {},
) {
  return recordEditorialPlanReviewDecisionV1({
    planStore: setup.stores.planStore(), tenantId: setup.plan.tenantId,
    userId: setup.plan.userId, projectId: setup.plan.projectId,
    planId: setup.plan.planId, nodeId: 'root',
    expectedCurrentRevisionSha256: setup.plan.revisionSha256,
    authenticatedActorId: setup.plan.userId, decision, reason, now: START,
    ...overrides,
  });
}
