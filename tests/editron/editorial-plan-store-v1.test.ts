import { describe, expect, it } from 'vitest';
import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import {
  createEditorialPlanExecutionDefinitionV1,
  type EditorialPlanExecutionDefinitionInputV1,
} from '@/lib/editron/services/editorial-plan-execution-definition-v1';
import {
  EditorialPlanStoreConflictErrorV1,
  EditorialPlanStoreNotFoundErrorV1,
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
import { StatefulMongoCollection } from './helpers/stateful-mongo-collection';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-08-23T12:00:00.000Z');

function setup() {
  const plans = new StatefulMongoCollection<EditorialPlanRevisionRecordV1>();
  const definitions = new StatefulMongoCollection<EditorialPlanExecutionDefinitionRecordV1>();
  const store = new EditorialPlanStoreV1(async () => ({
    plans: plans.asCollection(), definitions: definitions.asCollection(),
  }));
  return { plans, definitions, store };
}

describe('EditorialPlanStoreV1', () => {
  it('persists one immutable initial plan and enforces tenant/project authorization', async () => {
    const { store } = setup();
    const plan = createEditorialPlanRevisionV1(planInput());
    await expect(store.createInitial(plan, NOW)).resolves.toMatchObject({ created: true });
    await expect(store.createInitial(plan, NOW)).resolves.toMatchObject({ created: false });
    await expect(store.getLatestAuthorized(scope())).resolves.toEqual(plan);
    await expect(store.getLatestAuthorized({ ...scope(), tenantId: 'tenant-b' }))
      .resolves.toBeNull();
    const conflicting = createEditorialPlanRevisionV1(planInput({ changeReason: 'different' }));
    await expect(store.createInitial(conflicting, NOW))
      .rejects.toBeInstanceOf(EditorialPlanStoreConflictErrorV1);
  });

  it('appends one exact successor and rejects stale or concurrent branches', async () => {
    const { store } = setup();
    const first = createEditorialPlanRevisionV1(planInput());
    await store.createInitial(first, NOW);
    const second = successor(first, 'READY', 'accepted next');
    await expect(store.appendSuccessor({
      plan: second, expectedCurrentRevisionSha256: first.revisionSha256, now: NOW,
    })).resolves.toMatchObject({ created: true });
    await expect(store.appendSuccessor({
      plan: second, expectedCurrentRevisionSha256: first.revisionSha256, now: NOW,
    })).resolves.toMatchObject({ created: false });

    const stale = successor(first, 'PLANNING', 'stale branch');
    await expect(store.appendSuccessor({
      plan: stale, expectedCurrentRevisionSha256: first.revisionSha256, now: NOW,
    })).rejects.toThrow('PLAN_STALE_CURRENT_REVISION');
  });

  it('allows only one of two simultaneous different successors to win', async () => {
    const { store } = setup();
    const first = createEditorialPlanRevisionV1(planInput());
    await store.createInitial(first, NOW);
    const attempts = await Promise.allSettled([
      store.appendSuccessor({
        plan: successor(first, 'READY', 'branch-a'),
        expectedCurrentRevisionSha256: first.revisionSha256, now: NOW,
      }),
      store.appendSuccessor({
        plan: successor(first, 'PLANNING', 'branch-b'),
        expectedCurrentRevisionSha256: first.revisionSha256, now: NOW,
      }),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('stores only a definition bound to an existing exact plan node', async () => {
    const { store } = setup();
    const plan = createEditorialPlanRevisionV1(planInput());
    await store.createInitial(plan, NOW);
    const definition = createEditorialPlanExecutionDefinitionV1(definitionInput(plan));
    await expect(store.putExecutionDefinition(definition, NOW))
      .resolves.toMatchObject({ created: true });
    await expect(store.putExecutionDefinition(definition, NOW))
      .resolves.toMatchObject({ created: false });
    await expect(store.getExecutionDefinitionAuthorized({
      tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a',
      definitionId: definition.definitionId,
    })).resolves.toEqual(definition);
    await expect(store.getExecutionDefinitionAuthorized({
      tenantId: 'tenant-b', userId: 'user-a', projectId: 'project-a',
      definitionId: definition.definitionId,
    })).resolves.toBeNull();

    const forged = createEditorialPlanExecutionDefinitionV1(definitionInput(plan, {
      sourcePlanBinding: {
        ...definitionInput(plan).sourcePlanBinding,
        nodeSha256: 'b'.repeat(64),
      },
      definitionId: 'definition-forged',
    }));
    await expect(store.putExecutionDefinition(forged, NOW))
      .rejects.toBeInstanceOf(EditorialPlanStoreNotFoundErrorV1);

    await expect(store.putExecutionDefinition({
      ...definition,
      plannerEnvelope: { objective: 'forged after signing' },
    }, NOW)).rejects.toThrow('PLAN_DEFINITION_ENVELOPE_HASH_MISMATCH');
  });

  it('rejects execution definitions owned outside PlanService', () => {
    expect(() => createEditorialPlanRevisionV1(planInput({
      nodes: [node({
        executionDefinitionRef: ref('MODEL_RUNTIME', 'definition-root-v1'),
        eligibleOperationSetRef: ref('CAPABILITY_REGISTRY', 'eligible-ops-v1'),
      })],
    }))).toThrow('PLAN_NODE_DEFINITION_OWNER_INVALID');
  });
});

function successor(
  previous: ReturnType<typeof createEditorialPlanRevisionV1>,
  status: EditorialPlanNodeV1['status'],
  changeReason: string,
) {
  return createEditorialPlanRevisionV1(planInput({
    planRevision: previous.planRevision + 1,
    previousRevisionSha256: previous.revisionSha256,
    nodes: [node({ nodeVersion: 2, status })], changeReason,
  }));
}

function definitionInput(
  plan: ReturnType<typeof createEditorialPlanRevisionV1>,
  overrides: Partial<EditorialPlanExecutionDefinitionInputV1> = {},
): EditorialPlanExecutionDefinitionInputV1 {
  const sourceNode = plan.nodes[0];
  return {
    version: 'EDITRON_PLAN_EXECUTION_DEFINITION_V1_1',
    tenantId: plan.tenantId, userId: plan.userId, projectId: plan.projectId,
    definitionId: 'definition-root-v1', episodeId: 'episode-root-v1',
    sourcePlanBinding: {
      planId: plan.planId, planRevision: plan.planRevision,
      planRevisionSha256: plan.revisionSha256,
      nodeId: sourceNode.nodeId, nodeVersion: sourceNode.nodeVersion,
      nodeSha256: hashEditronCanonicalJsonV1(sourceNode),
    },
    plannerEnvelopeSchemaRef: ref('PLAN_SERVICE', 'planner-envelope-v1'),
    plannerEnvelope: { objective: sourceNode.objective, projectId: plan.projectId },
    eligibleOperationSetRef: ref('CAPABILITY_REGISTRY', 'eligible-ops-v1'),
    privacyPolicyRef: ref('POLICY_SERVICE', 'privacy-v1'),
    proofPolicyRef: ref('PROOF_SERVICE', 'proof-policy-v1'),
    budgetReservationRefs: [ref('BUDGET_SERVICE', 'budget-v1')],
    createdBy: { actorId: 'system-planner', actorKind: 'SYSTEM' },
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function scope() {
  return { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', planId: 'plan-a' };
}
function planInput(overrides: Partial<EditorialPlanRevisionInputV1> = {}): EditorialPlanRevisionInputV1 {
  return {
    version: 'EDITRON_EDITORIAL_PLAN_V1_1', ...scope(), orgId: null,
    planRevision: 1, previousRevisionSha256: null,
    directionRevisionRef: ref('PLAN_SERVICE', 'direction-r1'),
    baseProjectRevisionRef: ref('PROJECT_SERVICE', 'project-r7'),
    nodes: [node()], releasedLockRefs: [],
    acceptedBy: { actorId: 'user-a', actorKind: 'USER' }, acceptedAt: NOW.toISOString(),
    changeReason: 'initial', ...overrides,
  };
}
function node(overrides: Partial<EditorialPlanNodeV1> = {}): EditorialPlanNodeV1 {
  const authority = ref('EVIDENCE', 'scope-root');
  return {
    nodeId: 'root', nodeVersion: 1, parentNodeId: null, supersedesNodeId: null,
    objective: { authority: 'MODEL', targetClaims: ['Build sequence'], preservationClaims: [], successConditions: ['Preview passes'], stopConditions: ['Stop on missing evidence'] },
    scope: { semanticScopes: ['sequence'], scopeAuthorityRefs: [authority], ranges: [{ coordinateDomain: 'TIMELINE_TICKS', coordinateOwnerId: 'project-a', timebaseRef: ref('PROJECT_SERVICE', 'timebase-v1'), authorityRef: authority, startTick: 0, endTick: 300 }], deliverableRefs: [] },
    dependsOnNodeIds: [], reads: [], writes: [], requires: [], produces: [], invalidates: [],
    status: 'NEEDS_EVIDENCE', executionDefinitionRef: null, eligibleOperationSetRef: null,
    evidenceRequirementRefs: [], preservationLockRefs: [], approvalRequirementRefs: [], budgetReservationRefs: [], whatHasNotBeenChecked: ['preview'], previewRefs: [], proofRefs: [], receiptRefs: [], finalDisposition: null,
    ...overrides,
  };
}
function ref(ownerId: string, artifactId: string): EditorialPlanArtifactRefV1 {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256: HASH };
}
