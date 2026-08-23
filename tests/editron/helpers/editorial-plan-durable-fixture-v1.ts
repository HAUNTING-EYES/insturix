import { hashEditronCanonicalJsonV1 }
  from '../../../lib/editron/services/canonical-json-v1';
import { createOrGetEditorialPlanDurableJobV1 }
  from '../../../lib/editron/services/editorial-plan-durable-job-binding-v1';
import {
  createEditorialPlanExecutionDefinitionV1,
  executionDefinitionRefV1,
} from '../../../lib/editron/services/editorial-plan-execution-definition-v1';
import {
  EditorialPlanStoreV1,
  type EditorialPlanExecutionDefinitionRecordV1,
  type EditorialPlanRevisionRecordV1,
} from '../../../lib/editron/services/editorial-plan-store-v1';
import {
  createEditorialPlanRevisionV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanNodeV1,
  type EditorialPlanRevisionInputV1,
} from '../../../lib/editron/services/editorial-plan-v1';
import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  type DurableWorkflowJobRecordV1,
} from '../../../lib/editron/services/durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from '../../../lib/editron/services/durable-workflow-job-store-v1';
import { StatefulMongoCollection } from './stateful-mongo-collection';

const HASH = 'a'.repeat(64);
export const EDITORIAL_PLAN_FIXTURE_START_V1 =
  new Date('2026-08-23T14:00:00.000Z');
export const EDITORIAL_PLAN_FIXTURE_RECLAIM_V1 = new Date(
  EDITORIAL_PLAN_FIXTURE_START_V1.getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1 + 1,
);

export type EditorialPlanDurableFixtureRecordsV1 = Readonly<{
  plans?: readonly EditorialPlanRevisionRecordV1[];
  definitions?: readonly EditorialPlanExecutionDefinitionRecordV1[];
  jobs?: readonly DurableWorkflowJobRecordV1[];
}>;

export function createEditorialPlanDurableFixtureStoresV1(
  initial: EditorialPlanDurableFixtureRecordsV1 = {},
) {
  const plans = new StatefulMongoCollection<EditorialPlanRevisionRecordV1>(initial.plans);
  const definitions = new StatefulMongoCollection<EditorialPlanExecutionDefinitionRecordV1>(
    initial.definitions,
  );
  const jobs = new StatefulMongoCollection<DurableWorkflowJobRecordV1>(initial.jobs);
  const planStore = () => new EditorialPlanStoreV1(async () => ({
    plans: plans.asCollection(), definitions: definitions.asCollection(),
  }));
  const jobStoreFactory = () => new DurableWorkflowJobStoreV1(
    async () => jobs.asCollection(),
  );
  return { plans, definitions, jobs, planStore, jobStoreFactory };
}

export async function createPreparedEditorialPlanDurableFixtureV1() {
  const stores = createEditorialPlanDurableFixtureStoresV1();
  const source = createEditorialPlanRevisionV1(editorialPlanFixtureInputV1());
  await stores.planStore().createInitial(source, EDITORIAL_PLAN_FIXTURE_START_V1);
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
    createdAt: EDITORIAL_PLAN_FIXTURE_START_V1.toISOString(),
  });
  await stores.planStore().putExecutionDefinition(
    definition, EDITORIAL_PLAN_FIXTURE_START_V1,
  );
  const active = createEditorialPlanRevisionV1(editorialPlanFixtureInputV1({
    planRevision: 2, previousRevisionSha256: source.revisionSha256,
    nodes: [{
      ...sourceNode, nodeVersion: 2,
      executionDefinitionRef: executionDefinitionRefV1(definition),
    }], changeReason: 'attach exact execution definition',
  }));
  await stores.planStore().appendSuccessor({
    plan: active, expectedCurrentRevisionSha256: source.revisionSha256,
    now: EDITORIAL_PLAN_FIXTURE_START_V1,
  });
  const jobStore = stores.jobStoreFactory();
  const { job } = await createOrGetEditorialPlanDurableJobV1({
    planStore: stores.planStore(), jobStore,
    now: EDITORIAL_PLAN_FIXTURE_START_V1,
    request: {
      tenantId: active.tenantId, userId: active.userId, projectId: active.projectId,
      planId: active.planId, planRevision: active.planRevision,
      planRevisionSha256: active.revisionSha256,
      nodeId: active.nodes[0].nodeId, nodeVersion: active.nodes[0].nodeVersion,
      parentCommandId: 'command-a', parentReceiptId: 'receipt-a', maxAttempts: 3,
    },
  });
  return { ...stores, jobStore, source, definition, active, jobId: job.jobId };
}

export function editorialPlanFixtureInputV1(
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
    acceptedAt: EDITORIAL_PLAN_FIXTURE_START_V1.toISOString(),
    changeReason: 'initial', ...overrides,
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
