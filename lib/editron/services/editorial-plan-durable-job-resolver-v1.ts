import {
  buildEditorialPlanDurableJobContractV1,
  assertEditorialPlanDurableJobInputV1,
} from './editorial-plan-durable-job-binding-v1';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import { EditorialPlanStoreV1 } from './editorial-plan-store-v1';
import type { EditorialPlanExecutionDefinitionV1 }
  from './editorial-plan-execution-definition-v1';
import type {
  EditorialPlanNodeV1,
  EditorialPlanRevisionV1,
} from './editorial-plan-v1';

export class EditorialPlanDurableJobResolutionErrorV1 extends Error {}

export async function resolveEditorialPlanDurableJobV1(input: Readonly<{
  planStore: Pick<EditorialPlanStoreV1,
    'getRevisionAuthorized' | 'getLatestAuthorized' | 'getExecutionDefinitionAuthorized'>;
  job: Readonly<DurableWorkflowJobSnapshotV1>;
}>): Promise<Readonly<{
  plan: Readonly<EditorialPlanRevisionV1>;
  node: Readonly<EditorialPlanNodeV1>;
  definition: Readonly<EditorialPlanExecutionDefinitionV1>;
}>> {
  const job = input.job;
  if (job.operationOwner !== 'PLAN_SERVICE'
    || job.operationKind !== 'editorial_plan_node_episode') {
    fail('PLAN_JOB_RESOLUTION_OWNER_INVALID');
  }
  if (job.status !== 'running') fail('PLAN_JOB_RESOLUTION_STATUS_INVALID');
  const payload = assertEditorialPlanDurableJobInputV1(job.input.payload);
  if (job.input.schemaId !== payload.version
    || hashDurableWorkflowJobJsonV1(payload) !== job.input.bindingSha256) {
    fail('PLAN_JOB_RESOLUTION_INPUT_BINDING_INVALID');
  }
  if (job.tenantId !== payload.tenantId || job.userId !== payload.userId
    || job.orgId !== payload.orgId || job.projectId !== payload.projectId) {
    fail('PLAN_JOB_RESOLUTION_SCOPE_MISMATCH');
  }
  const scope = {
    tenantId: payload.tenantId, userId: payload.userId,
    projectId: payload.projectId, planId: payload.planBinding.planId,
  };
  const plan = await input.planStore.getRevisionAuthorized({
    ...scope, planRevision: payload.planBinding.planRevision,
  });
  if (!plan || plan.revisionSha256 !== payload.planBinding.planRevisionSha256) {
    fail('PLAN_JOB_RESOLUTION_PLAN_NOT_FOUND');
  }
  const latest = await input.planStore.getLatestAuthorized(scope);
  if (!latest
    || latest.revisionSha256 !== payload.planBinding.expectedPlanHeadRevisionSha256
    || latest.revisionSha256 !== plan.revisionSha256) {
    fail('PLAN_JOB_RESOLUTION_PLAN_STALE');
  }
  const node = plan.nodes.find(({ nodeId }) => nodeId === payload.nodeBinding.nodeId);
  if (!node || node.nodeVersion !== payload.nodeBinding.nodeVersion
    || hashEditronCanonicalJsonV1(node) !== payload.nodeBinding.nodeSha256) {
    fail('PLAN_JOB_RESOLUTION_NODE_MISMATCH');
  }
  const definition = await input.planStore.getExecutionDefinitionAuthorized({
    tenantId: plan.tenantId, userId: plan.userId, projectId: plan.projectId,
    definitionId: payload.executionDefinitionRef.artifactId,
  });
  if (!definition) fail('PLAN_JOB_RESOLUTION_DEFINITION_NOT_FOUND');
  const sourcePlan = await input.planStore.getRevisionAuthorized({
    ...scope, planRevision: definition.sourcePlanBinding.planRevision,
  });
  if (!sourcePlan) fail('PLAN_JOB_RESOLUTION_SOURCE_NOT_FOUND');
  const expected = buildEditorialPlanDurableJobContractV1({
    plan, node, definition, sourcePlan,
    expectedPlanHeadRevisionSha256: latest.revisionSha256,
  });
  if (hashEditronCanonicalJsonV1(expected.payload)
      !== hashEditronCanonicalJsonV1(payload)
    || expected.bindingSha256 !== job.input.bindingSha256
    || expected.operationIdentity !== job.operationId
    || expected.operationIdentity !== job.idempotencyKey
    || hashEditronCanonicalJsonV1(sorted(expected.dependencies))
      !== hashEditronCanonicalJsonV1(sorted(job.dependencies))
    || !job.budgetReservation
    || job.budgetReservation.reservationId !== expected.budget.artifactId
    || job.budgetReservation.bindingSha256 !== expected.budget.artifactSha256) {
    fail('PLAN_JOB_RESOLUTION_CONTRACT_MISMATCH');
  }
  return Object.freeze({ plan, node, definition });
}

function sorted<T extends Readonly<{ dependencyId: string }>>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => (
    left.dependencyId < right.dependencyId ? -1 : left.dependencyId > right.dependencyId ? 1 : 0
  ));
}
function fail(message: string): never {
  throw new EditorialPlanDurableJobResolutionErrorV1(message);
}
