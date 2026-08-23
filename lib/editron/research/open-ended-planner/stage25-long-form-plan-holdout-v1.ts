import { z } from 'zod';

import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
} from '../../services/editorial-plan-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';

export const STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_PLAN_HOLDOUT_V1_1' as const;
export const STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V1 =
  'EDITRON_STAGE25_LONG_FORM_PLAN_PROPOSAL_V1_1' as const;

export const STAGE25_LONG_FORM_WORK_KINDS_V1 = [
  'DIRECTION', 'SOURCE_ORGANIZATION', 'MUSIC_STRUCTURE', 'STORY_ASSEMBLY',
  'SEQUENCE', 'PICTURE_STABILITY', 'FINAL_AUDIO', 'CAPTIONS',
  'QUALITY_CONTROL', 'DELIVERY',
] as const;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const Ref = EditorialPlanArtifactRefSchemaV1;
const Range = z.object({
  rangeCandidateId: ID,
  semanticScopeId: ID,
  coordinateDomain: z.enum(['SOURCE_TICKS', 'TIMELINE_TICKS']),
  coordinateOwnerId: ID,
  timebaseRef: Ref,
  authorityRef: Ref,
  startTick: z.number().int().nonnegative(),
  endTick: z.number().int().positive(),
}).strict().superRefine((range, context) => {
  if (range.endTick <= range.startTick) {
    context.addIssue({ code: 'custom', message: 'LONG_FORM_RANGE_INVALID' });
  }
});
const Artifact = z.object({ id: ID, artifactRef: Ref }).strict();
const ContextMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1),
  authority: z.literal('RESEARCH_ONLY_NO_INFERENCE_OR_PROJECT_MUTATION'),
  fixtureId: ID,
  acceptedAt: z.string().datetime({ offset: true }),
  project: z.object({
    tenantId: ID, userId: ID, orgId: ID.nullable(), projectId: ID,
    planId: ID, durationTicks: z.number().int().positive(),
    timebaseRate: z.object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() }).strict(),
    directionRevisionRef: Ref, baseProjectRevisionRef: Ref,
  }).strict(),
  brief: z.object({
    deliverableDescription: z.string().min(1), audience: z.string().min(1),
    requestedViewerResponse: z.string().min(1), referenceFidelity: z.number().int().min(0).max(1000),
  }).strict(),
  semanticScopes: z.array(z.object({ id: ID, description: z.string().min(1), authorityRef: Ref }).strict()).min(1).max(64),
  rangeCandidates: z.array(Range).max(128),
  deliverables: z.array(Artifact).min(1).max(16),
  directionRequirements: z.array(z.object({
    id: ID, kind: z.enum(['MUST', 'MUST_PRESERVE', 'MUST_NOT']),
    description: z.string().min(1), artifactRef: Ref,
  }).strict()).min(1).max(64),
  evidenceRequirements: z.array(z.object({
    id: ID, status: z.enum(['AVAILABLE', 'UNVERIFIED', 'MISSING']), artifactRef: Ref,
  }).strict()).min(1).max(128),
  approvalRequirements: z.array(Artifact).max(32),
  budgetClasses: z.array(Artifact).min(1).max(16),
  workflowPolicy: z.object({
    requiredWorkKinds: z.array(z.enum(STAGE25_LONG_FORM_WORK_KINDS_V1)),
    maxNodes: z.number().int().min(1).max(256),
    maxDepth: z.number().int().min(1).max(16),
    maxFanout: z.number().int().min(1).max(64),
    minSequenceNodes: z.number().int().min(1).max(64),
  }).strict(),
  stateEffects: z.tuple([]),
}).strict();
const Context = ContextMaterial.extend({ contextSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

const ProposalNode = z.object({
  nodeId: ID,
  workKind: z.enum(STAGE25_LONG_FORM_WORK_KINDS_V1),
  parentNodeId: ID.nullable(),
  dependsOnNodeIds: z.array(ID).max(64),
  narrativeOrder: z.number().int().nonnegative().nullable(),
  targetClaims: z.array(z.string().trim().min(1).max(1000)).min(1).max(64),
  preservationClaims: z.array(z.string().trim().min(1).max(1000)).max(64),
  successConditions: z.array(z.string().trim().min(1).max(1000)).min(1).max(64),
  stopConditions: z.array(z.string().trim().min(1).max(1000)).min(1).max(32),
  semanticScopeIds: z.array(ID).min(1).max(64),
  rangeCandidateIds: z.array(ID).max(64),
  deliverableIds: z.array(ID).max(16),
  directionRequirementIds: z.array(ID).max(64),
  evidenceRequirementIds: z.array(ID).max(128),
  approvalRequirementIds: z.array(ID).max(32),
  budgetClassId: ID,
  status: z.enum(['DRAFT', 'NEEDS_EVIDENCE', 'READY']),
  whatHasNotBeenChecked: z.array(z.string().trim().min(1).max(1000)).min(1).max(128),
}).strict();
const ProposalMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V1),
  proposalId: ID,
  nodes: z.array(ProposalNode).min(1).max(256),
}).strict();
const Proposal = ProposalMaterial.extend({ proposalSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export type Stage25LongFormPlanContextV1 = z.infer<typeof Context>;
export type Stage25LongFormPlanProposalNodeV1 = z.infer<typeof ProposalNode>;
export type Stage25LongFormPlanProposalV1 = z.infer<typeof Proposal>;

export function buildStage25LongFormPlanHoldoutContextV1(): Readonly<Stage25LongFormPlanContextV1> {
  const material = {
    version: STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V1,
    authority: 'RESEARCH_ONLY_NO_INFERENCE_OR_PROJECT_MUTATION' as const,
    fixtureId: 'LONGFORM-EVENT-01', acceptedAt: '2026-08-24T00:00:00.000Z',
    project: {
      tenantId: 'tenant-stage25', userId: 'user-stage25', orgId: 'org-stage25',
      projectId: 'project-longform-event-01', planId: 'plan-longform-event-01',
      durationTicks: 486_000, timebaseRate: { numerator: 30, denominator: 1 },
      directionRevisionRef: ref('PLAN_SERVICE', 'direction-longform-r1'),
      baseProjectRevisionRef: ref('PROJECT_SERVICE', 'project-longform-r7'),
    },
    brief: {
      deliverableDescription: 'A 12-minute event film plus a 60-second social cut from 4.5 hours of registered sources.',
      audience: 'Prospective attendees and event sponsors.',
      requestedViewerResponse: 'Understand the event value, trust the proof, and want to attend the next edition.',
      referenceFidelity: 720,
    },
    semanticScopes: [
      scope('all-sources', 'All registered event source media'),
      scope('keynote', 'Keynote and quantitative proof'),
      scope('workshops', 'Workshop participation and activity'),
      scope('interviews', 'Participant and sponsor interviews'),
      scope('broll', 'Arrival, venue, networking and reaction b-roll'),
      scope('brand', 'Approved brand assets and typography'),
      scope('music', 'Licensed music structure and dialogue-safe mix'),
      scope('main-deliverable', 'The 12-minute event film'),
      scope('social-deliverable', 'The 60-second social cut'),
    ],
    rangeCandidates: [
      range('keynote-open', 'keynote', 'source-keynote-a', 1_800, 5_400),
      range('keynote-proof', 'keynote', 'source-keynote-a', 18_000, 22_500),
      range('workshop-rise', 'workshops', 'source-workshop-b', 3_600, 12_600),
      range('interview-outcomes', 'interviews', 'source-interviews-c', 900, 7_200),
      range('event-broll', 'broll', 'source-broll-d', 0, 14_400),
      range('closing-reaction', 'broll', 'source-broll-d', 21_000, 24_000),
    ],
    deliverables: [artifact('main-film', 'PLAN_SERVICE'), artifact('social-cut', 'PLAN_SERVICE')],
    directionRequirements: [
      requirement('req-audience-value', 'MUST', 'Show why the event is useful to a prospective attendee.'),
      requirement('req-keynote-proof', 'MUST_PRESERVE', 'Preserve the approved keynote proof statement.'),
      requirement('req-participant-outcomes', 'MUST_PRESERVE', 'Preserve participant outcomes, not only spectacle.'),
      requirement('req-brand', 'MUST', 'Use approved brand identity and licensed typography.'),
      requirement('req-no-literal-copy', 'MUST_NOT', 'Do not copy reference logos, names, URLs, metrics or testimonial wording.'),
    ],
    evidenceRequirements: [
      evidence('ev-source-identities', 'AVAILABLE'), evidence('ev-keynote-transcript', 'AVAILABLE'),
      evidence('ev-workshop-shot-map', 'AVAILABLE'), evidence('ev-music-structure', 'AVAILABLE'),
      evidence('ev-interview-rights', 'UNVERIFIED'), evidence('ev-hero-moment', 'MISSING'),
    ],
    approvalRequirements: [artifact('approval-hero-design', 'PLAN_SERVICE'), artifact('approval-final-delivery', 'PLAN_SERVICE')],
    budgetClasses: [artifact('budget-planning', 'PLAN_SERVICE'), artifact('budget-proxy-proof', 'PLAN_SERVICE'), artifact('budget-final', 'PLAN_SERVICE')],
    workflowPolicy: {
      requiredWorkKinds: [...STAGE25_LONG_FORM_WORK_KINDS_V1],
      maxNodes: 24, maxDepth: 5, maxFanout: 8, minSequenceNodes: 4,
    },
    stateEffects: [] as const,
  };
  return assertStage25LongFormPlanContextV1({
    ...material, contextSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function createStage25LongFormPlanProposalV1(
  input: Omit<Stage25LongFormPlanProposalV1, 'proposalSha256'>,
): Readonly<Stage25LongFormPlanProposalV1> {
  const material = ProposalMaterial.parse(input);
  return assertStage25LongFormPlanProposalV1({
    ...material, proposalSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertStage25LongFormPlanContextV1(value: unknown): Readonly<Stage25LongFormPlanContextV1> {
  const context = Context.parse(value);
  const { contextSha256, ...material } = context;
  if (hashEditronCanonicalJsonV1(material) !== contextSha256) throw new Error('STAGE25_LONG_FORM_CONTEXT_HASH_INVALID');
  validateContextIdentities(context);
  return deepFreezeEditronJsonV1(context) as Readonly<Stage25LongFormPlanContextV1>;
}

export function assertStage25LongFormPlanProposalV1(value: unknown): Readonly<Stage25LongFormPlanProposalV1> {
  const proposal = Proposal.parse(value);
  const { proposalSha256, ...material } = proposal;
  if (hashEditronCanonicalJsonV1(material) !== proposalSha256) throw new Error('STAGE25_LONG_FORM_PROPOSAL_HASH_INVALID');
  return deepFreezeEditronJsonV1(proposal) as Readonly<Stage25LongFormPlanProposalV1>;
}

function ref(ownerId: string, artifactId: string): EditorialPlanArtifactRefV1 {
  const artifactVersion = 'v1';
  return { ownerId, artifactId, artifactVersion, artifactSha256: hashEditronCanonicalJsonV1({ ownerId, artifactId, artifactVersion }) };
}
function scope(id: string, description: string) { return { id, description, authorityRef: ref('EVIDENCE', `scope-${id}`) }; }
function artifact(id: string, ownerId: string) { return { id, artifactRef: ref(ownerId, id) }; }
function evidence(id: string, status: 'AVAILABLE' | 'UNVERIFIED' | 'MISSING') { return { id, status, artifactRef: ref('EVIDENCE', id) }; }
function requirement(id: string, kind: 'MUST' | 'MUST_PRESERVE' | 'MUST_NOT', description: string) { return { id, kind, description, artifactRef: ref('PLAN_SERVICE', id) }; }
function range(rangeCandidateId: string, semanticScopeId: string, coordinateOwnerId: string, startTick: number, endTick: number) {
  return { rangeCandidateId, semanticScopeId, coordinateDomain: 'SOURCE_TICKS' as const, coordinateOwnerId,
    timebaseRef: ref('PROJECT_SERVICE', `timebase-${coordinateOwnerId}`), authorityRef: ref('EVIDENCE', `range-${rangeCandidateId}`), startTick, endTick };
}
function validateContextIdentities(context: Stage25LongFormPlanContextV1): void {
  const identitySets = [
    ['SEMANTIC_SCOPE', context.semanticScopes.map(({ id }) => id)],
    ['RANGE_CANDIDATE', context.rangeCandidates.map(({ rangeCandidateId }) => rangeCandidateId)],
    ['DELIVERABLE', context.deliverables.map(({ id }) => id)],
    ['DIRECTION_REQUIREMENT', context.directionRequirements.map(({ id }) => id)],
    ['EVIDENCE_REQUIREMENT', context.evidenceRequirements.map(({ id }) => id)],
    ['APPROVAL_REQUIREMENT', context.approvalRequirements.map(({ id }) => id)],
    ['BUDGET_CLASS', context.budgetClasses.map(({ id }) => id)],
    ['REQUIRED_WORK_KIND', context.workflowPolicy.requiredWorkKinds],
  ] as const;
  for (const [label, ids] of identitySets) {
    if (new Set(ids).size !== ids.length) throw new Error(`STAGE25_LONG_FORM_CONTEXT_${label}_DUPLICATED`);
  }
  const scopeIds = new Set(context.semanticScopes.map(({ id }) => id));
  if (context.rangeCandidates.some(({ semanticScopeId }) => !scopeIds.has(semanticScopeId))) {
    throw new Error('STAGE25_LONG_FORM_CONTEXT_RANGE_SCOPE_UNKNOWN');
  }
}
