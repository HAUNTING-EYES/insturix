import { describe, expect, it } from 'vitest';
import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createOrGetEditorialPlanDurableJobV1,
  type EditorialPlanDurableJobRequestV1,
} from '@/lib/editron/services/editorial-plan-durable-job-binding-v1';
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
  type EditorialPlanRevisionV1,
} from '@/lib/editron/services/editorial-plan-v1';
import type { DurableWorkflowJobRecordV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '@/lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-08-23T13:00:00.000Z');

describe('editorial plan durable job binding', () => {
  it('binds one exact accepted node and definition idempotently', async () => {
    const setup = await prepared();
    const first = await bind(setup);
    const replay = await bind(setup);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.job.jobId).toBe(first.job.jobId);
    expect(first.job).toMatchObject({
      operationOwner: 'PLAN_SERVICE', operationKind: 'editorial_plan_node_episode',
      projectId: 'project-a', budgetReservation: { reservationId: 'budget-v1' },
      input: {
        schemaId: 'EDITRON_EDITORIAL_PLAN_DURABLE_JOB_INPUT_V1_1',
        payload: {
          planBinding: {
            planId: 'plan-a', planRevision: 2,
            planRevisionSha256: setup.active.revisionSha256,
            expectedPlanHeadRevisionSha256: setup.active.revisionSha256,
          },
          nodeBinding: { nodeId: 'root', nodeVersion: 2 },
          executionDefinitionRef: executionDefinitionRefV1(setup.definition),
        },
      },
    });
    expect(first.job.dependencies.map(({ dependencyId }) => dependencyId)).toEqual([
      'accepted-plan-node', 'accepted-plan-revision', 'base-project-revision',
      'direction-revision', 'eligible-operation-set', 'execution-definition',
      'planner-envelope-schema', 'privacy-policy', 'proof-policy',
    ]);
    expect(setup.jobs.snapshot()).toHaveLength(1);
  });

  it('rejects an accepted revision after the plan head advances', async () => {
    const setup = await prepared();
    await append(setup, setup.active, setup.active.nodes[0]);
    await expect(bind(setup)).rejects.toThrow('PLAN_JOB_PLAN_REVISION_STALE');
    expect(setup.jobs.snapshot()).toHaveLength(0);
  });

  it('rejects executable material changed after the definition was issued', async () => {
    const setup = await prepared();
    const changedNode = {
      ...setup.active.nodes[0], nodeVersion: 3,
      objective: {
        ...setup.active.nodes[0].objective,
        targetClaims: ['A different target after definition issuance'],
      },
    };
    const changed = await append(setup, setup.active, changedNode);
    await expect(bind({ ...setup, active: changed }))
      .rejects.toThrow('PLAN_JOB_DEFINITION_NODE_STALE');
    expect(setup.jobs.snapshot()).toHaveLength(0);
  });

  it('rejects copied scope and forged definition references before job creation', async () => {
    const setup = await prepared();
    await expect(bind(setup, { tenantId: 'tenant-b' }))
      .rejects.toThrow('PLAN_JOB_PLAN_REVISION_NOT_FOUND');

    const forgedNode = {
      ...setup.active.nodes[0], nodeVersion: 3,
      executionDefinitionRef: {
        ...setup.active.nodes[0].executionDefinitionRef!,
        artifactSha256: 'b'.repeat(64),
      },
    };
    const forged = await append(setup, setup.active, forgedNode);
    await expect(bind({ ...setup, active: forged }))
      .rejects.toThrow('PLAN_JOB_DEFINITION_REF_MISMATCH');
    expect(setup.jobs.snapshot()).toHaveLength(0);
  });

  it('does not create work for a terminal plan node', async () => {
    const setup = await prepared();
    const failedNode = {
      ...setup.active.nodes[0], nodeVersion: 3, status: 'FAILED' as const,
      finalDisposition: 'FAIL' as const,
    };
    const failed = await append(setup, setup.active, failedNode);
    await expect(bind({ ...setup, active: failed }))
      .rejects.toThrow('PLAN_JOB_NODE_NOT_RUNNABLE');
    expect(setup.jobs.snapshot()).toHaveLength(0);
  });
});

async function prepared() {
  const plans = new StatefulMongoCollection<EditorialPlanRevisionRecordV1>();
  const definitions = new StatefulMongoCollection<EditorialPlanExecutionDefinitionRecordV1>();
  const jobs = new StatefulMongoCollection<DurableWorkflowJobRecordV1>();
  const planStore = new EditorialPlanStoreV1(async () => ({
    plans: plans.asCollection(), definitions: definitions.asCollection(),
  }));
  const jobStore = new DurableWorkflowJobStoreV1(async () => jobs.asCollection());
  const source = createEditorialPlanRevisionV1(planInput());
  await planStore.createInitial(source, NOW);
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
    createdAt: NOW.toISOString(),
  });
  await planStore.putExecutionDefinition(definition, NOW);
  const activeNode = {
    ...sourceNode, nodeVersion: 2,
    executionDefinitionRef: executionDefinitionRefV1(definition),
  };
  const active = await append({ planStore }, source, activeNode);
  return { plans, definitions, jobs, planStore, jobStore, source, definition, active };
}

async function append(
  setup: Pick<Awaited<ReturnType<typeof prepared>>, 'planStore'>,
  previous: Readonly<EditorialPlanRevisionV1>,
  nextNode: Readonly<EditorialPlanNodeV1>,
) {
  const next = createEditorialPlanRevisionV1(planInput({
    planRevision: previous.planRevision + 1,
    previousRevisionSha256: previous.revisionSha256,
    nodes: [nextNode], changeReason: `append revision ${previous.planRevision + 1}`,
  }));
  await setup.planStore.appendSuccessor({
    plan: next, expectedCurrentRevisionSha256: previous.revisionSha256, now: NOW,
  });
  return next;
}

function bind(
  setup: Awaited<ReturnType<typeof prepared>>,
  overrides: Partial<EditorialPlanDurableJobRequestV1> = {},
) {
  return createOrGetEditorialPlanDurableJobV1({
    planStore: setup.planStore, jobStore: setup.jobStore, now: NOW,
    request: {
      tenantId: setup.active.tenantId, userId: setup.active.userId,
      projectId: setup.active.projectId, planId: setup.active.planId,
      planRevision: setup.active.planRevision,
      planRevisionSha256: setup.active.revisionSha256,
      nodeId: setup.active.nodes[0].nodeId,
      nodeVersion: setup.active.nodes[0].nodeVersion,
      parentCommandId: 'command-a', parentReceiptId: 'receipt-a',
      maxAttempts: 3, ...overrides,
    },
  });
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
    acceptedAt: NOW.toISOString(), changeReason: 'initial', ...overrides,
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
      ranges: [{
        coordinateDomain: 'TIMELINE_TICKS', coordinateOwnerId: 'project-a',
        timebaseRef: ref('PROJECT_SERVICE', 'timebase-v1'), authorityRef: authority,
        startTick: 0, endTick: 300,
      }], deliverableRefs: [],
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
