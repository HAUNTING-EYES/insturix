import { z } from 'zod';
import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const EDITORIAL_PLAN_VERSION_V1 = 'EDITRON_EDITORIAL_PLAN_V1_1' as const;
export const EDITORIAL_PLAN_MAX_NODES_V1 = 256;
export const EDITORIAL_PLAN_REVISION_COLLECTION_V1 =
  'editron_editorial_plan_revisions' as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
export const EditorialPlanArtifactRefSchemaV1 = z.object({
  ownerId: ID,
  artifactId: ID,
  artifactVersion: ID,
  artifactSha256: SHA256,
}).strict();
const RefSchema = EditorialPlanArtifactRefSchemaV1;
const ActorSchema = z.object({
  actorId: ID,
  actorKind: z.enum(['USER', 'MODEL', 'SYSTEM']),
}).strict();
const RangeSchema = z.object({
  coordinateDomain: z.enum(['SOURCE_TICKS', 'TIMELINE_TICKS', 'COMPOSITION_TICKS']),
  coordinateOwnerId: ID,
  timebaseRef: RefSchema,
  authorityRef: RefSchema,
  startTick: z.number().int().nonnegative(),
  endTick: z.number().int().positive(),
}).strict().superRefine((range, context) => {
  if (range.endTick <= range.startTick) {
    context.addIssue({ code: 'custom', message: 'PLAN_RANGE_EMPTY_OR_REVERSED' });
  }
});
const ObjectiveSchema = z.object({
  authority: z.enum(['USER', 'MODEL']),
  targetClaims: boundedStrings(1, 64),
  preservationClaims: boundedStrings(0, 64),
  successConditions: boundedStrings(1, 64),
  stopConditions: boundedStrings(1, 32),
}).strict();
const ScopeSchema = z.object({
  semanticScopes: boundedStrings(0, 64),
  scopeAuthorityRefs: z.array(RefSchema).min(1).max(64),
  ranges: z.array(RangeSchema).max(256),
  deliverableRefs: z.array(RefSchema).max(32),
}).strict().superRefine((scope, context) => {
  if (!scope.semanticScopes.length && !scope.ranges.length) {
    context.addIssue({ code: 'custom', message: 'PLAN_SCOPE_EMPTY' });
  }
  assertUniqueRefs(scope.scopeAuthorityRefs, 'PLAN_SCOPE_AUTHORITY_DUPLICATE', context);
  assertUniqueRefs(scope.deliverableRefs, 'PLAN_DELIVERABLE_REF_DUPLICATE', context);
  const authorities = new Set(scope.scopeAuthorityRefs.map(refKey));
  for (const range of scope.ranges) {
    if (!authorities.has(refKey(range.authorityRef))) {
      context.addIssue({ code: 'custom', message: 'PLAN_RANGE_AUTHORITY_UNBOUND' });
    }
  }
});

const NodeSchema = z.object({
  nodeId: ID,
  nodeVersion: z.number().int().positive(),
  parentNodeId: ID.nullable(),
  supersedesNodeId: ID.nullable(),
  objective: ObjectiveSchema,
  scope: ScopeSchema,
  dependsOnNodeIds: z.array(ID).max(64),
  reads: boundedStrings(0, 128),
  writes: boundedStrings(0, 128),
  requires: boundedStrings(0, 128),
  produces: boundedStrings(0, 128),
  invalidates: boundedStrings(0, 128),
  status: z.enum([
    'DRAFT', 'NEEDS_EVIDENCE', 'READY', 'PLANNING', 'PROPOSED', 'PREVIEWING',
    'NEEDS_REVIEW', 'READY_TO_APPLY', 'APPLIED_PENDING_PROOF', 'VERIFIED',
    'STALE', 'NEEDS_REBASE', 'CONFLICT', 'UNVERIFIABLE', 'FAILED', 'CANCELLED',
  ]),
  executionDefinitionRef: RefSchema.nullable(),
  eligibleOperationSetRef: RefSchema.nullable(),
  evidenceRequirementRefs: z.array(RefSchema).max(128),
  preservationLockRefs: z.array(RefSchema).max(128),
  approvalRequirementRefs: z.array(RefSchema).max(64),
  budgetReservationRefs: z.array(RefSchema).max(32),
  whatHasNotBeenChecked: boundedStrings(0, 128),
  previewRefs: z.array(RefSchema).max(64),
  proofRefs: z.array(RefSchema).max(128),
  receiptRefs: z.array(RefSchema).max(128),
  finalDisposition: z.enum(['PASS', 'FAIL', 'UNVERIFIABLE']).nullable(),
}).strict().superRefine((node, context) => {
  for (const [label, values] of Object.entries({
    depends: node.dependsOnNodeIds, reads: node.reads, writes: node.writes,
    requires: node.requires, produces: node.produces, invalidates: node.invalidates,
    unchecked: node.whatHasNotBeenChecked,
  })) assertUniqueStrings(values, `PLAN_NODE_${label.toUpperCase()}_DUPLICATE`, context);
  for (const [label, refs] of Object.entries({
    evidence: node.evidenceRequirementRefs, locks: node.preservationLockRefs,
    approvals: node.approvalRequirementRefs, budgets: node.budgetReservationRefs,
    previews: node.previewRefs, proofs: node.proofRefs, receipts: node.receiptRefs,
  })) assertUniqueRefs(refs, `PLAN_NODE_${label.toUpperCase()}_REF_DUPLICATE`, context);
  if (node.executionDefinitionRef && !node.eligibleOperationSetRef) {
    context.addIssue({ code: 'custom', message: 'PLAN_NODE_OPERATION_SET_MISSING' });
  }
  if (node.executionDefinitionRef?.ownerId !== undefined
    && node.executionDefinitionRef.ownerId !== 'PLAN_SERVICE') {
    context.addIssue({ code: 'custom', message: 'PLAN_NODE_DEFINITION_OWNER_INVALID' });
  }
  const expected = node.status === 'VERIFIED' ? 'PASS'
    : node.status === 'FAILED' ? 'FAIL'
      : node.status === 'UNVERIFIABLE' ? 'UNVERIFIABLE' : null;
  if (node.finalDisposition !== expected) {
    context.addIssue({ code: 'custom', message: 'PLAN_NODE_DISPOSITION_INVALID' });
  }
  if (node.status === 'VERIFIED'
    && (!node.proofRefs.length || !node.receiptRefs.length
      || node.whatHasNotBeenChecked.length)) {
    context.addIssue({ code: 'custom', message: 'PLAN_NODE_VERIFIED_PROOF_INCOMPLETE' });
  }
});

const planShape = {
  version: z.literal(EDITORIAL_PLAN_VERSION_V1),
  tenantId: ID,
  userId: ID,
  orgId: ID.nullable(),
  projectId: ID,
  planId: ID,
  planRevision: z.number().int().positive(),
  previousRevisionSha256: SHA256.nullable(),
  directionRevisionRef: RefSchema,
  baseProjectRevisionRef: RefSchema,
  nodes: z.array(NodeSchema).min(1).max(EDITORIAL_PLAN_MAX_NODES_V1),
  releasedLockRefs: z.array(RefSchema).max(128),
  acceptedBy: ActorSchema,
  acceptedAt: z.string().datetime({ offset: true }),
  changeReason: z.string().trim().min(1).max(1_000),
};
const BasePlanSchema = z.object(planShape).strict();
type UnsignedPlanV1 = z.infer<typeof BasePlanSchema>;
const UnsignedPlanSchema = BasePlanSchema.superRefine(validatePlanGraph);
const SignedPlanSchema = z.object({ ...planShape, revisionSha256: SHA256 })
  .strict().superRefine(validatePlanGraph);

export type EditorialPlanArtifactRefV1 = z.infer<typeof RefSchema>;
export type EditorialPlanNodeV1 = z.infer<typeof NodeSchema>;
export type EditorialPlanRevisionInputV1 = z.input<typeof UnsignedPlanSchema>;
export type EditorialPlanRevisionV1 = z.infer<typeof SignedPlanSchema>;

export class EditorialPlanContractErrorV1 extends Error {}

export function createEditorialPlanRevisionV1(
  input: EditorialPlanRevisionInputV1,
): Readonly<EditorialPlanRevisionV1> {
  const material = parse(UnsignedPlanSchema, input);
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1({
    ...material,
    revisionSha256: hashEditronCanonicalJsonV1(material),
  })) as Readonly<EditorialPlanRevisionV1>;
}

export function assertEditorialPlanRevisionV1(
  value: unknown,
): Readonly<EditorialPlanRevisionV1> {
  const plan = parse(SignedPlanSchema, value);
  const { revisionSha256, ...material } = plan;
  if (hashEditronCanonicalJsonV1(material) !== revisionSha256) {
    throw new EditorialPlanContractErrorV1('PLAN_REVISION_HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(plan));
}

function validatePlanGraph(
  plan: UnsignedPlanV1,
  context: z.RefinementCtx,
): void {
  if ((plan.planRevision === 1) !== (plan.previousRevisionSha256 === null)) {
    context.addIssue({ code: 'custom', message: 'PLAN_PREVIOUS_REVISION_INVALID' });
  }
  if (plan.directionRevisionRef.ownerId !== 'PLAN_SERVICE'
    || plan.baseProjectRevisionRef.ownerId !== 'PROJECT_SERVICE') {
    context.addIssue({ code: 'custom', message: 'PLAN_AUTHORITY_REF_INVALID' });
  }
  assertUniqueRefs(plan.releasedLockRefs, 'PLAN_RELEASED_LOCK_DUPLICATE', context);
  const nodes = new Map<string, z.infer<typeof NodeSchema>>();
  for (const node of plan.nodes) {
    if (nodes.has(node.nodeId)) {
      context.addIssue({ code: 'custom', message: 'PLAN_NODE_ID_DUPLICATE' });
    }
    nodes.set(node.nodeId, node);
  }
  for (const node of plan.nodes) {
    for (const dependencyId of [node.parentNodeId, ...node.dependsOnNodeIds]) {
      if (dependencyId && !nodes.has(dependencyId)) {
        context.addIssue({ code: 'custom', message: 'PLAN_NODE_DEPENDENCY_MISSING' });
      }
    }
    if (node.supersedesNodeId && (!nodes.has(node.supersedesNodeId)
      || node.supersedesNodeId === node.nodeId)) {
      context.addIssue({ code: 'custom', message: 'PLAN_NODE_SUPERSEDES_INVALID' });
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      context.addIssue({ code: 'custom', message: 'PLAN_GRAPH_CYCLE' });
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = nodes.get(nodeId);
    for (const dependencyId of [node?.parentNodeId, ...(node?.dependsOnNodeIds ?? [])]) {
      if (dependencyId && nodes.has(dependencyId)) visit(dependencyId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of nodes.keys()) visit(nodeId);
}

function boundedStrings(min: number, max: number) {
  return z.array(z.string().trim().min(1).max(1_000)).min(min).max(max);
}

function refKey(ref: EditorialPlanArtifactRefV1): string {
  return `${ref.ownerId}:${ref.artifactId}:${ref.artifactVersion}:${ref.artifactSha256}`;
}

function assertUniqueStrings(values: readonly string[], message: string, context: z.RefinementCtx) {
  if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', message });
}

function assertUniqueRefs(
  refs: readonly EditorialPlanArtifactRefV1[],
  message: string,
  context: z.RefinementCtx,
) {
  assertUniqueStrings(refs.map(refKey), message, context);
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new EditorialPlanContractErrorV1(
      result.error.issues.map(({ message }) => message).join('|'),
    );
  }
  return result.data;
}
