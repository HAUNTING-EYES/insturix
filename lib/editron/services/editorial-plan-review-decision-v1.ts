import { EditorialPlanStoreV1 }
  from './editorial-plan-store-v1';
import {
  createEditorialPlanRevisionV1,
  type EditorialPlanRevisionV1,
} from './editorial-plan-v1';

export type EditorialPlanReviewDecisionV1 = 'APPROVE' | 'CANCEL';

export class EditorialPlanReviewDecisionErrorV1 extends Error {}

/**
 * Records one owner-authenticated human decision as an immutable PlanService
 * successor. NEEDS_REVIEW is the durable wait; no worker lease is held.
 */
export async function recordEditorialPlanReviewDecisionV1(input: Readonly<{
  planStore: Pick<EditorialPlanStoreV1, 'getLatestAuthorized' | 'appendSuccessor'>;
  tenantId: string;
  userId: string;
  projectId: string;
  planId: string;
  nodeId: string;
  expectedCurrentRevisionSha256: string;
  authenticatedActorId: string;
  decision: EditorialPlanReviewDecisionV1;
  reason: string;
  now?: Date;
}>): Promise<Readonly<EditorialPlanRevisionV1>> {
  if (input.authenticatedActorId !== input.userId) fail('PLAN_REVIEW_ACTOR_UNAUTHORIZED');
  const current = await input.planStore.getLatestAuthorized({
    tenantId: input.tenantId, userId: input.userId,
    projectId: input.projectId, planId: input.planId,
  });
  if (!current) fail('PLAN_REVIEW_PLAN_NOT_FOUND');
  if (current.revisionSha256 !== input.expectedCurrentRevisionSha256) {
    fail('PLAN_REVIEW_PLAN_STALE');
  }
  const node = current.nodes.find(({ nodeId }) => nodeId === input.nodeId);
  if (!node) fail('PLAN_REVIEW_NODE_NOT_FOUND');
  if (node.status !== 'NEEDS_REVIEW') fail('PLAN_REVIEW_NODE_STATUS_INVALID');
  const reason = boundedReason(input.reason);
  const now = validDate(input.now ?? new Date());
  const nextStatus = input.decision === 'APPROVE' ? 'READY_TO_APPLY' : 'CANCELLED';
  const next = createEditorialPlanRevisionV1({
    version: current.version,
    tenantId: current.tenantId,
    userId: current.userId,
    orgId: current.orgId,
    projectId: current.projectId,
    planId: current.planId,
    planRevision: current.planRevision + 1,
    previousRevisionSha256: current.revisionSha256,
    directionRevisionRef: current.directionRevisionRef,
    baseProjectRevisionRef: current.baseProjectRevisionRef,
    nodes: current.nodes.map((candidate) => candidate.nodeId === node.nodeId
      ? { ...candidate, nodeVersion: candidate.nodeVersion + 1, status: nextStatus }
      : candidate),
    releasedLockRefs: [],
    acceptedBy: { actorId: input.authenticatedActorId, actorKind: 'USER' },
    acceptedAt: now.toISOString(),
    changeReason: `review:${input.decision.toLowerCase()}:${reason}`,
  });
  const stored = await input.planStore.appendSuccessor({
    plan: next,
    expectedCurrentRevisionSha256: input.expectedCurrentRevisionSha256,
    now,
  });
  return stored.plan;
}

function boundedReason(value: string): string {
  const reason = typeof value === 'string' ? value.trim().slice(0, 900) : '';
  if (!reason) fail('PLAN_REVIEW_REASON_REQUIRED');
  return reason;
}
function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail('PLAN_REVIEW_TIME_INVALID');
  }
  return new Date(value);
}
function fail(message: string): never {
  throw new EditorialPlanReviewDecisionErrorV1(message);
}
