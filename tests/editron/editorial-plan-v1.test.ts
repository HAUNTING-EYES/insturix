import { describe, expect, it } from 'vitest';
import {
  assertEditorialPlanRevisionV1,
  createEditorialPlanRevisionV1,
  type EditorialPlanArtifactRefV1,
  type EditorialPlanNodeV1,
  type EditorialPlanRevisionInputV1,
} from '@/lib/editron/services/editorial-plan-v1';
import { assertEditorialPlanSuccessorV1 }
  from '@/lib/editron/services/editorial-plan-successor-v1';
import { hashDurableWorkflowJobJsonV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';

const HASH = 'a'.repeat(64);

describe('editorial plan V1', () => {
  it('creates one immutable, Unicode-normalized, project-scoped plan revision', () => {
    const plan = createEditorialPlanRevisionV1(planInput());
    const decomposed = createEditorialPlanRevisionV1(planInput({
      changeReason: 'Cafe\u0301 plan accepted',
    }));
    const composed = createEditorialPlanRevisionV1(planInput({
      changeReason: 'Café plan accepted',
    }));

    expect(plan.revisionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.nodes[0])).toBe(true);
    expect(decomposed.revisionSha256).toBe(composed.revisionSha256);
    expect(assertEditorialPlanRevisionV1(plan)).toEqual(plan);
    expect(() => hashDurableWorkflowJobJsonV1({ invalid: Number.POSITIVE_INFINITY }))
      .toThrow('DURABLE_JOB_JSON_NUMBER_INVALID');
  });

  it('rejects forged hashes and copied project authority', () => {
    const plan = createEditorialPlanRevisionV1(planInput());
    expect(() => assertEditorialPlanRevisionV1({ ...plan, changeReason: 'forged' }))
      .toThrow('PLAN_REVISION_HASH_MISMATCH');
    expect(() => createEditorialPlanRevisionV1(planInput({
      baseProjectRevisionRef: ref('WRONG_OWNER', 'project-r7'),
    }))).toThrow('PLAN_AUTHORITY_REF_INVALID');
  });

  it('rejects cycles, missing dependencies and duplicate node ids', () => {
    const first = node('a', { dependsOnNodeIds: ['b'] });
    const second = node('b', { dependsOnNodeIds: ['a'] });
    expect(() => createEditorialPlanRevisionV1(planInput({ nodes: [first, second] })))
      .toThrow('PLAN_GRAPH_CYCLE');
    expect(() => createEditorialPlanRevisionV1(planInput({
      nodes: [node('a', { dependsOnNodeIds: ['missing'] })],
    }))).toThrow('PLAN_NODE_DEPENDENCY_MISSING');
    expect(() => createEditorialPlanRevisionV1(planInput({ nodes: [node('a'), node('a')] })))
      .toThrow('PLAN_NODE_ID_DUPLICATE');
  });

  it('requires authorised, non-empty coordinate ranges', () => {
    const invalidAuthority = node('a');
    invalidAuthority.scope.ranges[0].authorityRef = ref('EVIDENCE', 'other');
    expect(() => createEditorialPlanRevisionV1(planInput({ nodes: [invalidAuthority] })))
      .toThrow('PLAN_RANGE_AUTHORITY_UNBOUND');

    const reversed = node('a');
    reversed.scope.ranges[0].endTick = reversed.scope.ranges[0].startTick;
    expect(() => createEditorialPlanRevisionV1(planInput({ nodes: [reversed] })))
      .toThrow('PLAN_RANGE_EMPTY_OR_REVERSED');
  });

  it('does not let a node self-certify without server proof and receipt refs', () => {
    expect(() => createEditorialPlanRevisionV1(planInput({
      nodes: [node('a', { status: 'VERIFIED', finalDisposition: 'PASS' })],
    }))).toThrow('PLAN_NODE_VERIFIED_PROOF_INCOMPLETE');
    expect(() => createEditorialPlanRevisionV1(planInput({
      nodes: [node('a', { status: 'READY', finalDisposition: 'PASS' })],
    }))).toThrow('PLAN_NODE_DISPOSITION_INVALID');
  });

  it('accepts a valid verified node with no unchecked claims', () => {
    const verified = node('a', {
      status: 'VERIFIED', finalDisposition: 'PASS', whatHasNotBeenChecked: [],
      proofRefs: [ref('PROOF_SERVICE', 'proof-a')],
      receiptRefs: [ref('PROJECT_SERVICE', 'receipt-a')],
    });
    expect(createEditorialPlanRevisionV1(planInput({ nodes: [verified] }))
      .nodes[0].status).toBe('VERIFIED');
  });

  it('rejects stale successors, removed nodes and unversioned node changes', () => {
    const previous = createEditorialPlanRevisionV1(planInput());
    const changedNode = node('root', { status: 'READY' });
    const stale = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: 'b'.repeat(64), nodes: [changedNode],
    }));
    expect(() => assertEditorialPlanSuccessorV1(previous, stale))
      .toThrow('PLAN_SUCCESSOR_REVISION_MISMATCH');

    const unversioned = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: previous.revisionSha256,
      nodes: [changedNode],
    }));
    expect(() => assertEditorialPlanSuccessorV1(previous, unversioned))
      .toThrow('PLAN_SUCCESSOR_NODE_VERSION_INVALID');

    const twoNodes = createEditorialPlanRevisionV1(planInput({
      nodes: [node('root'), node('child', { parentNodeId: 'root' })],
    }));
    const removed = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: twoNodes.revisionSha256,
      nodes: [node('root')],
    }));
    expect(() => assertEditorialPlanSuccessorV1(twoNodes, removed))
      .toThrow('PLAN_SUCCESSOR_NODE_REMOVED');
  });

  it('preserves user objectives and locks unless a user explicitly authorizes change', () => {
    const lock = ref('PLAN_SERVICE', 'lock-speaker');
    const previousNode = node('root', { preservationLockRefs: [lock] });
    previousNode.objective.authority = 'USER';
    const previous = createEditorialPlanRevisionV1(planInput({ nodes: [previousNode] }));
    const changed = node('root', { nodeVersion: 2, preservationLockRefs: [] });
    changed.objective.authority = 'USER';
    changed.objective.targetClaims = ['Different objective'];
    const next = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: previous.revisionSha256,
      nodes: [changed], releasedLockRefs: [lock],
      acceptedBy: { actorId: 'planner-model', actorKind: 'MODEL' },
    }));
    expect(() => assertEditorialPlanSuccessorV1(previous, next))
      .toThrow('PLAN_SUCCESSOR_USER_OBJECTIVE_OVERRIDE');
  });

  it('requires an explicit user-authorized lock release and blocks model scope widening', () => {
    const lock = ref('PLAN_SERVICE', 'lock-speaker');
    const previous = createEditorialPlanRevisionV1(planInput({
      nodes: [node('root', { preservationLockRefs: [lock] })],
    }));
    const droppedNode = node('root', { nodeVersion: 2, preservationLockRefs: [] });
    const dropped = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: previous.revisionSha256,
      nodes: [droppedNode],
      acceptedBy: { actorId: 'planner-model', actorKind: 'MODEL' },
    }));
    expect(() => assertEditorialPlanSuccessorV1(previous, dropped))
      .toThrow('PLAN_SUCCESSOR_LOCK_DROPPED');

    const widenedNode = node('root', { nodeVersion: 2, preservationLockRefs: [lock] });
    widenedNode.scope.semanticScopes.push('unapproved second sequence');
    const widened = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: previous.revisionSha256,
      nodes: [widenedNode],
      acceptedBy: { actorId: 'planner-model', actorKind: 'MODEL' },
    }));
    expect(() => assertEditorialPlanSuccessorV1(previous, widened))
      .toThrow('PLAN_SUCCESSOR_SCOPE_WIDENING_UNAUTHORIZED');

    const released = createEditorialPlanRevisionV1(planInput({
      planRevision: 2, previousRevisionSha256: previous.revisionSha256,
      nodes: [droppedNode], releasedLockRefs: [lock],
      acceptedBy: { actorId: 'user-a', actorKind: 'USER' },
    }));
    expect(assertEditorialPlanSuccessorV1(previous, released)).toEqual(released);
  });
});

function planInput(
  overrides: Partial<EditorialPlanRevisionInputV1> = {},
): EditorialPlanRevisionInputV1 {
  return {
    version: 'EDITRON_EDITORIAL_PLAN_V1_1',
    tenantId: 'tenant-a', userId: 'user-a', orgId: null, projectId: 'project-a',
    planId: 'plan-a', planRevision: 1, previousRevisionSha256: null,
    directionRevisionRef: ref('PLAN_SERVICE', 'direction-r1'),
    baseProjectRevisionRef: ref('PROJECT_SERVICE', 'project-r7'),
    nodes: [node('root')], releasedLockRefs: [],
    acceptedBy: { actorId: 'user-a', actorKind: 'USER' },
    acceptedAt: '2026-08-23T12:00:00.000Z',
    changeReason: 'Initial plan accepted',
    ...overrides,
  };
}

function node(
  id: string,
  overrides: Partial<EditorialPlanNodeV1> = {},
): EditorialPlanNodeV1 {
  const authority = ref('EVIDENCE', `scope-${id}`);
  return {
    nodeId: id, nodeVersion: 1, parentNodeId: null, supersedesNodeId: null,
    objective: {
      authority: 'MODEL',
      targetClaims: ['Build an observable sequence result'],
      preservationClaims: ['Preserve required speech'],
      successConditions: ['Bounded preview satisfies the target'],
      stopConditions: ['Stop on missing evidence'],
    },
    scope: {
      semanticScopes: ['workshop sequence'], scopeAuthorityRefs: [authority],
      ranges: [{
        coordinateDomain: 'TIMELINE_TICKS',
        coordinateOwnerId: 'project-a', timebaseRef: ref('PROJECT_SERVICE', 'timebase-v1'),
        authorityRef: authority, startTick: 0, endTick: 300,
      }],
      deliverableRefs: [ref('PLAN_SERVICE', 'deliverable-main')],
    },
    dependsOnNodeIds: [], reads: [], writes: [], requires: [], produces: [], invalidates: [],
    status: 'NEEDS_EVIDENCE',
    executionDefinitionRef: null, eligibleOperationSetRef: null,
    evidenceRequirementRefs: [], preservationLockRefs: [], approvalRequirementRefs: [],
    budgetReservationRefs: [], whatHasNotBeenChecked: ['rendered result'],
    previewRefs: [], proofRefs: [], receiptRefs: [], finalDisposition: null,
    ...overrides,
  };
}

function ref(ownerId: string, artifactId: string): EditorialPlanArtifactRefV1 {
  return { ownerId, artifactId, artifactVersion: 'v1', artifactSha256: HASH };
}
