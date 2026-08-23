import { describe, expect, it } from 'vitest';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { createOrGetEditorialPlanDurableJobV1 }
  from '@/lib/editron/services/editorial-plan-durable-job-binding-v1';
import { resolveEditorialPlanDurableJobV1 }
  from '@/lib/editron/services/editorial-plan-durable-job-resolver-v1';
import {
  createEditorialPlanExecutionDefinitionV1,
  executionDefinitionRefV1,
} from '@/lib/editron/services/editorial-plan-execution-definition-v1';
import {
  EditorialPlanStoreV1,
  type EditorialPlanExecutionDefinitionRecordV1,
  type EditorialPlanRevisionRecordV1,
} from '@/lib/editron/services/editorial-plan-store-v1';
import {
  createEditorialPlanRevisionV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanNodeV1,
  type EditorialPlanRevisionInputV1,
} from '@/lib/editron/services/editorial-plan-v1';
import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobRecordV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const HASH = 'a'.repeat(64);
const START = new Date('2026-08-23T14:00:00.000Z');
const RECLAIM = new Date(START.getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1 + 1);

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

async function prepared() {
  const plans = new StatefulMongoCollection<EditorialPlanRevisionRecordV1>();
  const definitions = new StatefulMongoCollection<EditorialPlanExecutionDefinitionRecordV1>();
  const jobs = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const planStore = () => new EditorialPlanStoreV1(async () => ({
    plans: plans.asCollection(), definitions: definitions.asCollection(),
  }));
  const jobStoreFactory = () => new DurableWorkflowJobStoreV1(
    async () => jobs.asCollection(),
  );
  const source = createEditorialPlanRevisionV1(planInput());
  await planStore().createInitial(source, START);
  const sourceNode = source.nodes[0];
  const definition = createEditorialPlanExecutionDefinitionV1({
    version: 'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1',
    tenantId: source.tenantId, userId: source.userId, projectId: source.projectId,
    definitionId: 'definition-root-v1', episodeId: 'episode-root-v1',
    sourcePlanBinding: {
      planId: source.planId, planRevision: source.planRevision,
      planRevisionSha256: source.revisionSha256,
      nodeId: sourceNode.nodeId, nodeVersion: sourceNode.nodeVersion,
      nodeSha256: hashEditronCanonicalJsonV1(sourceNode),
    },
    plannerEnvelopeSchemaRef: ref('PLAN_SERVICE', 'planner-envelope-v1'),
    plannerEnvelope: { objective: 'Plan the bounded root sequence.' },
    eligibleOperationSetRef: sourceNode.eligibleOperationSetRef!,
    privacyPolicyRef: ref('POLICY_SERVICE', 'privacy-v1'),
    proofPolicyRef: ref('PROOF_SERVICE', 'proof-v1'),
    budgetReservationRefs: sourceNode.budgetReservationRefs,
    createdBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    createdAt: START.toISOString(),
  });
  await planStore().putExecutionDefinition(definition, START);
  const active = createEditorialPlanRevisionV1(planInput({
    planRevision: 2, previousRevisionSha256: source.revisionSha256,
    nodes: [{
      ...sourceNode, nodeVersion: 2,
      executionDefinitionRef: executionDefinitionRefV1(definition),
    }], changeReason: 'attach exact execution definition',
  }));
  await planStore().appendSuccessor({
    plan: active, expectedCurrentRevisionSha256: source.revisionSha256, now: START,
  });
  const jobStore = jobStoreFactory();
  const { job } = await createOrGetEditorialPlanDurableJobV1({
    planStore: planStore(), jobStore, now: START,
    request: {
      tenantId: active.tenantId, userId: active.userId, projectId: active.projectId,
      planId: active.planId, planRevision: active.planRevision,
      planRevisionSha256: active.revisionSha256,
      nodeId: active.nodes[0].nodeId, nodeVersion: active.nodes[0].nodeVersion,
      parentCommandId: 'command-a', parentReceiptId: 'receipt-a', maxAttempts: 3,
    },
  });
  return { plans, definitions, jobs, planStore, jobStoreFactory, jobStore,
    source, definition, active, jobId: job.jobId };
}

function planInput(
  overrides: Partial<EditorialPlanRevisionInputV1> = {},
): EditorialPlanRevisionInputV1 {
  return {
    version: 'EDITRON_EDITORIAL_PLAN_V1_1', tenantId: 'tenant-a', userId: 'user-a',
    orgId: null, projectId: 'project-a', planId: 'plan-a', planRevision: 1,
    previousRevisionSha256: null,
    directionRevisionRef: ref('PLAN_SERVICE', 'direction-r1'),
    baseProjectRevisionRef: ref('PROJECT_SERVICE', 'project-r7'),
    nodes: [node()], releasedLockRefs: [],
    acceptedBy: { actorId: 'user-a', actorKind: 'USER' },
    acceptedAt: START.toISOString(), changeReason: 'initial', ...overrides,
  };
}

function node(): EditorialPlanNodeV1 {
  const authority = ref('EVIDENCE', 'scope-root');
  return {
    nodeId: 'root', nodeVersion: 1, parentNodeId: null, supersedesNodeId: null,
    objective: {
      authority: 'MODEL', targetClaims: ['Build the root sequence'],
      preservationClaims: ['Preserve approved user work'],
      successConditions: ['Bounded preview passes'],
      stopConditions: ['Stop on missing evidence'],
    },
    scope: {
      semanticScopes: ['sequence'], scopeAuthorityRefs: [authority],
      ranges: [{ coordinateDomain: 'TIMELINE_TICKS', coordinateOwnerId: 'project-a',
        timebaseRef: ref('PROJECT_SERVICE', 'timebase-v1'), authorityRef: authority,
        startTick: 0, endTick: 300 }], deliverableRefs: [],
    },
    dependsOnNodeIds: [], reads: [], writes: [], requires: [], produces: [],
    invalidates: [], status: 'READY', executionDefinitionRef: null,
    eligibleOperationSetRef: ref('CAPABILITY_REGISTRY', 'eligible-ops-v1'),
    evidenceRequirementRefs: [], preservationLockRefs: [], approvalRequirementRefs: [],
    budgetReservationRefs: [ref('BUDGET_SERVICE', 'budget-v1')],
    whatHasNotBeenChecked: ['preview'], previewRefs: [], proofRefs: [], receiptRefs: [],
    finalDisposition: null,
  };
}

function ref(ownerId: string, artifactId: string): EditorialPlanArtifactRefV1 {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256: HASH };
}
