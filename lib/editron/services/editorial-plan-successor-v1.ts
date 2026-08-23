import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  assertEditorialPlanRevisionV1,
  EditorialPlanContractErrorV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanRevisionV1,
} from './editorial-plan-v1';

/**
 * Validates append/supersede policy between two already signed plan revisions.
 * Persistence CAS remains the PlanService store's responsibility.
 */
export function assertEditorialPlanSuccessorV1(
  previousValue: unknown,
  nextValue: unknown,
): Readonly<EditorialPlanRevisionV1> {
  const previous = assertEditorialPlanRevisionV1(previousValue);
  const next = assertEditorialPlanRevisionV1(nextValue);
  for (const key of ['tenantId', 'userId', 'orgId', 'projectId', 'planId'] as const) {
    if (previous[key] !== next[key]) fail('PLAN_SUCCESSOR_SCOPE_MISMATCH');
  }
  if (next.planRevision !== previous.planRevision + 1
    || next.previousRevisionSha256 !== previous.revisionSha256) {
    fail('PLAN_SUCCESSOR_REVISION_MISMATCH');
  }
  const previousNodes = new Map(previous.nodes.map((node) => [node.nodeId, node]));
  const nextNodes = new Map(next.nodes.map((node) => [node.nodeId, node]));
  for (const previousNode of previous.nodes) {
    const nextNode = nextNodes.get(previousNode.nodeId);
    if (!nextNode) fail('PLAN_SUCCESSOR_NODE_REMOVED');
    const changed = hashEditronCanonicalJsonV1(previousNode)
      !== hashEditronCanonicalJsonV1(nextNode);
    if (nextNode.nodeVersion !== previousNode.nodeVersion + (changed ? 1 : 0)) {
      fail('PLAN_SUCCESSOR_NODE_VERSION_INVALID');
    }
    if (previousNode.objective.authority === 'USER'
      && hashEditronCanonicalJsonV1(previousNode.objective)
        !== hashEditronCanonicalJsonV1(nextNode.objective)
      && next.acceptedBy.actorKind !== 'USER') {
      fail('PLAN_SUCCESSOR_USER_OBJECTIVE_OVERRIDE');
    }
    const previousScopes = new Set(previousNode.scope.semanticScopes);
    if (next.acceptedBy.actorKind !== 'USER'
      && nextNode.scope.semanticScopes.some((scope) => !previousScopes.has(scope))) {
      fail('PLAN_SUCCESSOR_SCOPE_WIDENING_UNAUTHORIZED');
    }
  }
  validateLockTransition(previous, next);
  for (const node of next.nodes) {
    if (!previousNodes.has(node.nodeId) && node.nodeVersion !== 1) {
      fail('PLAN_SUCCESSOR_NEW_NODE_VERSION_INVALID');
    }
  }
  return next;
}

function validateLockTransition(
  previous: Readonly<EditorialPlanRevisionV1>,
  next: Readonly<EditorialPlanRevisionV1>,
): void {
  const activeNext = new Set(next.nodes.flatMap((node) => node.preservationLockRefs).map(refKey));
  const released = new Set(next.releasedLockRefs.map(refKey));
  const previousLocks = new Set(
    previous.nodes.flatMap((node) => node.preservationLockRefs).map(refKey),
  );
  for (const lock of previousLocks) {
    if (!activeNext.has(lock) && !released.has(lock)) fail('PLAN_SUCCESSOR_LOCK_DROPPED');
  }
  if ([...released].some((lock) => !previousLocks.has(lock) || activeNext.has(lock))) {
    fail('PLAN_SUCCESSOR_LOCK_RELEASE_INVALID');
  }
  if (released.size && next.acceptedBy.actorKind !== 'USER') {
    fail('PLAN_SUCCESSOR_LOCK_RELEASE_UNAUTHORIZED');
  }
}

function refKey(ref: EditorialPlanArtifactRefV1): string {
  return `${ref.ownerId}:${ref.artifactId}:${ref.artifactVersion}:${ref.artifactSha256}`;
}

function fail(message: string): never {
  throw new EditorialPlanContractErrorV1(message);
}
