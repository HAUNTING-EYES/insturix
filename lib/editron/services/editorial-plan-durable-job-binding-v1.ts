import { z } from 'zod';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  executionDefinitionRefV1,
  type EditorialPlanExecutionDefinitionV1,
} from './editorial-plan-execution-definition-v1';
import { EditorialPlanStoreV1 } from './editorial-plan-store-v1';
import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanNodeV1,
  type EditorialPlanRevisionV1,
} from './editorial-plan-v1';

export const EDITORIAL_PLAN_DURABLE_JOB_INPUT_VERSION_V1 =
  'EDITRON_EDITORIAL_PLAN_DURABLE_JOB_INPUT_V1_1' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const RequestSchema = z.object({
  tenantId: ID,
  userId: ID,
  projectId: ID,
  planId: ID,
  planRevision: z.number().int().positive(),
  planRevisionSha256: SHA256,
  nodeId: ID,
  nodeVersion: z.number().int().positive(),
  parentCommandId: ID.nullable(),
  parentReceiptId: ID.nullable(),
  maxAttempts: z.number().int().positive(),
  expiresAt: z.date().optional(),
}).strict();
const InputSchema = z.object({
  version: z.literal(EDITORIAL_PLAN_DURABLE_JOB_INPUT_VERSION_V1),
  tenantId: ID,
  userId: ID,
  orgId: ID.nullable(),
  projectId: ID,
  planBinding: z.object({
    planId: ID,
    planRevision: z.number().int().positive(),
    planRevisionSha256: SHA256,
    expectedPlanHeadRevisionSha256: SHA256,
  }).strict(),
  nodeBinding: z.object({
    nodeId: ID,
    nodeVersion: z.number().int().positive(),
    nodeSha256: SHA256,
  }).strict(),
  executionDefinitionRef: EditorialPlanArtifactRefSchemaV1,
  eligibleOperationSetRef: EditorialPlanArtifactRefSchemaV1,
  directionRevisionRef: EditorialPlanArtifactRefSchemaV1,
  baseProjectRevisionRef: EditorialPlanArtifactRefSchemaV1,
}).strict();

export type EditorialPlanDurableJobRequestV1 = z.input<typeof RequestSchema>;
export type EditorialPlanDurableJobInputV1 = z.infer<typeof InputSchema>;

export class EditorialPlanDurableJobBindingErrorV1 extends Error {}

export function assertEditorialPlanDurableJobInputV1(
  value: unknown,
): Readonly<EditorialPlanDurableJobInputV1> {
  const result = InputSchema.safeParse(value);
  if (!result.success) fail('PLAN_JOB_INPUT_INVALID');
  return deepFreezeEditronJsonV1(result.data);
}

/**
 * Binds an accepted PlanService node into the sole durable lifecycle store.
 * The expected plan head is binding-time evidence only; an execution adapter
 * must resolve it again before any effect because plan and job writes are not
 * one cross-collection transaction.
 */
export async function createOrGetEditorialPlanDurableJobV1(input: Readonly<{
  planStore: Pick<EditorialPlanStoreV1,
    'getRevisionAuthorized' | 'getLatestAuthorized' | 'getExecutionDefinitionAuthorized'>;
  jobStore: Pick<DurableWorkflowJobStoreV1, 'createOrGet'>;
  request: EditorialPlanDurableJobRequestV1;
  now?: Date;
}>): Promise<Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  created: boolean;
}>> {
  const request = parseRequest(input.request);
  const scope = {
    tenantId: request.tenantId, userId: request.userId,
    projectId: request.projectId, planId: request.planId,
  };
  const plan = await input.planStore.getRevisionAuthorized({
    ...scope, planRevision: request.planRevision,
  });
  if (!plan || plan.revisionSha256 !== request.planRevisionSha256) {
    fail('PLAN_JOB_PLAN_REVISION_NOT_FOUND');
  }
  const latest = await input.planStore.getLatestAuthorized(scope);
  if (!latest || latest.revisionSha256 !== plan.revisionSha256) {
    fail('PLAN_JOB_PLAN_REVISION_STALE');
  }
  const node = plan.nodes.find(({ nodeId }) => nodeId === request.nodeId);
  if (!node || node.nodeVersion !== request.nodeVersion) fail('PLAN_JOB_NODE_NOT_FOUND');
  if (!node.executionDefinitionRef || !node.eligibleOperationSetRef) {
    fail('PLAN_JOB_NODE_DEFINITION_MISSING');
  }
  const definition = await input.planStore.getExecutionDefinitionAuthorized({
    tenantId: plan.tenantId, userId: plan.userId, projectId: plan.projectId,
    definitionId: node.executionDefinitionRef.artifactId,
  });
  if (!definition) fail('PLAN_JOB_DEFINITION_NOT_FOUND');
  const sourcePlan = await input.planStore.getRevisionAuthorized({
    ...scope, planRevision: definition.sourcePlanBinding.planRevision,
  });
  if (!sourcePlan) fail('PLAN_JOB_DEFINITION_SOURCE_NOT_FOUND');
  const contract = buildEditorialPlanDurableJobContractV1({
    plan, node, definition, sourcePlan,
    expectedPlanHeadRevisionSha256: latest.revisionSha256,
  });
  return input.jobStore.createOrGet({
    tenantId: plan.tenantId, userId: plan.userId, orgId: plan.orgId,
    projectId: plan.projectId, operationOwner: 'PLAN_SERVICE',
    operationKind: 'editorial_plan_node_episode', operationId: contract.operationIdentity,
    parentCommandId: request.parentCommandId,
    parentReceiptId: request.parentReceiptId,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: EDITORIAL_PLAN_DURABLE_JOB_INPUT_VERSION_V1,
      bindingSha256: contract.bindingSha256, payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: {
      reservationId: contract.budget.artifactId,
      bindingSha256: contract.budget.artifactSha256,
    },
    maxAttempts: request.maxAttempts,
    ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
  }, input.now);
}

export function buildEditorialPlanDurableJobContractV1(input: Readonly<{
  plan: Readonly<EditorialPlanRevisionV1>;
  node: Readonly<EditorialPlanNodeV1>;
  definition: Readonly<EditorialPlanExecutionDefinitionV1>;
  sourcePlan: Readonly<EditorialPlanRevisionV1>;
  expectedPlanHeadRevisionSha256: string;
}>) {
  if (input.node.status !== 'READY') fail('PLAN_JOB_NODE_NOT_RUNNABLE');
  // The immutable plan revision is the approval-lineage receipt. Route-level
  // authentication still has to establish that this USER actor is genuine.
  if (input.node.approvalRequirementRefs.length
    && input.plan.acceptedBy.actorKind !== 'USER') {
    fail('PLAN_JOB_USER_APPROVAL_REQUIRED');
  }
  assertDefinitionBinding(input.node, input.definition);
  if (input.sourcePlan.revisionSha256
      !== input.definition.sourcePlanBinding.planRevisionSha256) {
    fail('PLAN_JOB_DEFINITION_SOURCE_NOT_FOUND');
  }
  const sourceNode = input.sourcePlan.nodes.find(
    ({ nodeId }) => nodeId === input.definition.sourcePlanBinding.nodeId,
  );
  if (!sourceNode
    || hashEditronCanonicalJsonV1(sourceNode)
      !== input.definition.sourcePlanBinding.nodeSha256
    || input.node.nodeVersion !== sourceNode.nodeVersion + 1
    || hashEditronCanonicalJsonV1(executableNodeMaterial(input.node))
      !== hashEditronCanonicalJsonV1(executableNodeMaterial(sourceNode))) {
    fail('PLAN_JOB_DEFINITION_NODE_STALE');
  }
  const budget = exactBudget(input.node, input.definition);
  const payload = assertEditorialPlanDurableJobInputV1({
    version: EDITORIAL_PLAN_DURABLE_JOB_INPUT_VERSION_V1,
    tenantId: input.plan.tenantId, userId: input.plan.userId,
    orgId: input.plan.orgId, projectId: input.plan.projectId,
    planBinding: {
      planId: input.plan.planId, planRevision: input.plan.planRevision,
      planRevisionSha256: input.plan.revisionSha256,
      expectedPlanHeadRevisionSha256: input.expectedPlanHeadRevisionSha256,
    },
    nodeBinding: {
      nodeId: input.node.nodeId, nodeVersion: input.node.nodeVersion,
      nodeSha256: hashEditronCanonicalJsonV1(input.node),
    },
    executionDefinitionRef: input.node.executionDefinitionRef,
    eligibleOperationSetRef: input.node.eligibleOperationSetRef,
    directionRevisionRef: input.plan.directionRevisionRef,
    baseProjectRevisionRef: input.plan.baseProjectRevisionRef,
  });
  const bindingSha256 = hashDurableWorkflowJobJsonV1(payload);
  return deepFreezeEditronJsonV1({
    payload, bindingSha256, budget,
    dependencies: dependencies(input.plan, input.node, input.definition),
    operationIdentity: `epn_${bindingSha256}`,
  });
}

function assertDefinitionBinding(
  node: Readonly<EditorialPlanNodeV1>,
  definition: Readonly<EditorialPlanExecutionDefinitionV1>,
): void {
  if (!sameRef(node.executionDefinitionRef, executionDefinitionRefV1(definition))) {
    fail('PLAN_JOB_DEFINITION_REF_MISMATCH');
  }
  if (!sameRef(node.eligibleOperationSetRef, definition.eligibleOperationSetRef)) {
    fail('PLAN_JOB_OPERATION_SET_MISMATCH');
  }
}

function exactBudget(
  node: Readonly<EditorialPlanNodeV1>,
  definition: Readonly<EditorialPlanExecutionDefinitionV1>,
): EditorialPlanArtifactRefV1 {
  if (node.budgetReservationRefs.length !== 1
    || definition.budgetReservationRefs.length !== 1
    || !sameRef(node.budgetReservationRefs[0], definition.budgetReservationRefs[0])) {
    fail('PLAN_JOB_BUDGET_BINDING_INVALID');
  }
  return node.budgetReservationRefs[0];
}

function dependencies(
  plan: Readonly<{ planRevision: number; revisionSha256: string;
    directionRevisionRef: EditorialPlanArtifactRefV1;
    baseProjectRevisionRef: EditorialPlanArtifactRefV1 }>,
  node: Readonly<EditorialPlanNodeV1>,
  definition: Readonly<EditorialPlanExecutionDefinitionV1>,
) {
  return [
    dependency('accepted-plan-revision', String(plan.planRevision), plan.revisionSha256),
    dependency('accepted-plan-node', String(node.nodeVersion), hashEditronCanonicalJsonV1(node)),
    dependency('execution-definition', definition.version, definition.definitionSha256),
    refDependency('eligible-operation-set', definition.eligibleOperationSetRef),
    refDependency('direction-revision', plan.directionRevisionRef),
    refDependency('base-project-revision', plan.baseProjectRevisionRef),
    refDependency('planner-envelope-schema', definition.plannerEnvelopeSchemaRef),
    refDependency('privacy-policy', definition.privacyPolicyRef),
    refDependency('proof-policy', definition.proofPolicyRef),
    ...nodeApprovalDependencies(node),
  ];
}

function nodeApprovalDependencies(node: Readonly<EditorialPlanNodeV1>) {
  return node.approvalRequirementRefs.map((ref, index) => refDependency(
    `approval-requirement-${String(index + 1).padStart(3, '0')}`,
    ref,
  ));
}

function executableNodeMaterial(node: Readonly<EditorialPlanNodeV1>) {
  const { nodeVersion: _nodeVersion, executionDefinitionRef: _definition, ...material } = node;
  return material;
}
function refDependency(dependencyId: string, ref: EditorialPlanArtifactRefV1) {
  return dependency(dependencyId, ref.artifactVersion, ref.artifactSha256);
}
function dependency(dependencyId: string, dependencyVersion: string, bindingSha256: string) {
  return { dependencyId, dependencyVersion, bindingSha256 };
}
function sameRef(
  left: EditorialPlanArtifactRefV1 | null,
  right: EditorialPlanArtifactRefV1 | null,
) {
  return left !== null && right !== null
    && hashEditronCanonicalJsonV1(left) === hashEditronCanonicalJsonV1(right);
}
function parseRequest(value: unknown): z.infer<typeof RequestSchema> {
  const result = RequestSchema.safeParse(value);
  if (!result.success) fail('PLAN_JOB_REQUEST_INVALID');
  return result.data;
}
function fail(message: string): never {
  throw new EditorialPlanDurableJobBindingErrorV1(message);
}
