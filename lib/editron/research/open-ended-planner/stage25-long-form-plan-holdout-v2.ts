import { z } from 'zod';

import {
  EditorialPlanArtifactRefSchemaV1,
} from '../../services/editorial-plan-v1';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import {
  buildStage25LongFormPlanHoldoutContextV1,
  STAGE25_LONG_FORM_WORK_KINDS_V1,
} from './stage25-long-form-plan-holdout-v1';

export const STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PLAN_HOLDOUT_V2_1' as const;
export const STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2 =
  'EDITRON_STAGE25_LONG_FORM_PLAN_PROPOSAL_V2_1' as const;
export const STAGE25_LONG_FORM_WORK_KINDS_V2 = STAGE25_LONG_FORM_WORK_KINDS_V1;

const ID = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/);
const Ref = EditorialPlanArtifactRefSchemaV1;
const RequiredEvidenceIds = z.array(ID).max(128);
const Range = z.object({
  rangeCandidateId: ID,
  semanticScopeId: ID,
  coordinateDomain: z.enum(['SOURCE_TICKS', 'TIMELINE_TICKS']),
  coordinateOwnerId: ID,
  timebaseRef: Ref,
  authorityRef: Ref,
  startTick: z.number().int().nonnegative(),
  endTick: z.number().int().positive(),
  requiredEvidenceRequirementIds: RequiredEvidenceIds,
}).strict().superRefine((range, context) => {
  if (range.endTick <= range.startTick) {
    context.addIssue({ code: 'custom', message: 'LONG_FORM_RANGE_INVALID' });
  }
});
const Artifact = z.object({ id: ID, artifactRef: Ref }).strict();
const ContextMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2),
  authority: z.literal('RESEARCH_ONLY_NO_INFERENCE_OR_PROJECT_MUTATION'),
  fixtureId: ID,
  acceptedAt: z.string().datetime({ offset: true }),
  project: z.object({
    tenantId: ID, userId: ID, orgId: ID.nullable(), projectId: ID,
    planId: ID, durationTicks: z.number().int().positive(),
    timebaseRate: z.object({
      numerator: z.number().int().positive(), denominator: z.number().int().positive(),
    }).strict(),
    directionRevisionRef: Ref, baseProjectRevisionRef: Ref,
  }).strict(),
  brief: z.object({
    deliverableDescription: z.string().min(1), audience: z.string().min(1),
    requestedViewerResponse: z.string().min(1),
    referenceFidelity: z.number().int().min(0).max(1000),
  }).strict(),
  semanticScopes: z.array(z.object({
    id: ID, description: z.string().min(1), authorityRef: Ref,
    requiredEvidenceRequirementIds: RequiredEvidenceIds,
  }).strict()).min(1).max(64),
  rangeCandidates: z.array(Range).max(128),
  deliverables: z.array(Artifact).min(1).max(16),
  directionRequirements: z.array(z.object({
    id: ID, kind: z.enum(['MUST', 'MUST_PRESERVE', 'MUST_NOT']),
    description: z.string().min(1), artifactRef: Ref,
    requiredEvidenceRequirementIds: RequiredEvidenceIds,
  }).strict()).min(1).max(64),
  evidenceRequirements: z.array(z.object({
    id: ID, status: z.enum(['AVAILABLE', 'UNVERIFIED', 'MISSING']), artifactRef: Ref,
  }).strict()).min(1).max(128),
  approvalRequirements: z.array(Artifact).max(32),
  budgetClasses: z.array(Artifact).min(1).max(16),
  workflowPolicy: z.object({
    requiredWorkKinds: z.array(z.enum(STAGE25_LONG_FORM_WORK_KINDS_V2)),
    maxNodes: z.number().int().min(1).max(256),
    maxDepth: z.number().int().min(1).max(16),
    maxFanout: z.number().int().min(1).max(64),
    minSequenceNodes: z.number().int().min(1).max(64),
  }).strict(),
  stateEffects: z.tuple([]),
}).strict();
const Context = ContextMaterial.extend({
  contextSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const ProposalNode = z.object({
  nodeId: ID,
  workKind: z.enum(STAGE25_LONG_FORM_WORK_KINDS_V2),
  parentNodeId: ID.nullable(),
  dependsOnNodeIds: z.array(ID).max(64),
  narrativeOrder: z.number().int().nonnegative().nullable(),
  targetClaims: boundedStrings(1, 64),
  preservationClaims: boundedStrings(0, 64),
  successConditions: boundedStrings(1, 64),
  stopConditions: boundedStrings(1, 32),
  semanticScopeIds: z.array(ID).max(64),
  rangeCandidateIds: z.array(ID).max(64),
  deliverableIds: z.array(ID).max(16),
  directionRequirementIds: z.array(ID).max(64),
  evidenceRequirementIds: z.array(ID).max(128),
  approvalRequirementIds: z.array(ID).max(32),
  budgetClassId: ID,
  status: z.enum(['DRAFT', 'NEEDS_EVIDENCE', 'READY']),
  whatHasNotBeenChecked: boundedStrings(1, 128),
}).strict();
const ProposalMaterial = z.object({
  version: z.literal(STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2),
  proposalId: ID,
  nodes: z.array(ProposalNode).min(1).max(256),
}).strict();
const Proposal = ProposalMaterial.extend({
  proposalSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type Stage25LongFormPlanContextV2 = z.infer<typeof Context>;
export type Stage25LongFormPlanProposalNodeV2 = z.infer<typeof ProposalNode>;
export type Stage25LongFormPlanProposalV2 = z.infer<typeof Proposal>;

const SCOPE_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  'all-sources': ['ev-source-identities'],
  keynote: ['ev-keynote-transcript'],
  workshops: ['ev-workshop-shot-map'],
  interviews: ['ev-interview-rights'],
  broll: ['ev-source-identities'],
  brand: [],
  music: ['ev-music-structure'],
  'main-deliverable': [],
  'social-deliverable': [],
};
const RANGE_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  'keynote-open': ['ev-keynote-transcript'],
  'keynote-proof': ['ev-keynote-transcript'],
  'workshop-rise': ['ev-workshop-shot-map'],
  'interview-outcomes': ['ev-interview-rights'],
  'event-broll': ['ev-source-identities'],
  'closing-reaction': ['ev-hero-moment'],
};
const DIRECTION_EVIDENCE: Readonly<Record<string, readonly string[]>> = {
  'req-audience-value': ['ev-source-identities'],
  'req-keynote-proof': ['ev-keynote-transcript'],
  'req-participant-outcomes': ['ev-workshop-shot-map', 'ev-interview-rights'],
  'req-brand': [],
  'req-no-literal-copy': [],
};

export function buildStage25LongFormPlanHoldoutContextV2():
Readonly<Stage25LongFormPlanContextV2> {
  const source = buildStage25LongFormPlanHoldoutContextV1();
  const { version: _version, contextSha256: _contextSha256, ...shared } = source;
  const material = {
    ...shared,
    version: STAGE25_LONG_FORM_PLAN_HOLDOUT_VERSION_V2,
    semanticScopes: source.semanticScopes.map((item) => ({
      ...item, requiredEvidenceRequirementIds: evidenceFor(SCOPE_EVIDENCE, item.id),
    })),
    rangeCandidates: source.rangeCandidates.map((item) => ({
      ...item,
      requiredEvidenceRequirementIds: evidenceFor(
        RANGE_EVIDENCE, item.rangeCandidateId,
      ),
    })),
    directionRequirements: source.directionRequirements.map((item) => ({
      ...item, requiredEvidenceRequirementIds: evidenceFor(DIRECTION_EVIDENCE, item.id),
    })),
  };
  return assertStage25LongFormPlanContextV2({
    ...material, contextSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function createStage25LongFormPlanProposalV2(
  input: Omit<Stage25LongFormPlanProposalV2, 'proposalSha256'>,
): Readonly<Stage25LongFormPlanProposalV2> {
  const material = ProposalMaterial.parse(input);
  return assertStage25LongFormPlanProposalV2({
    ...material, proposalSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertStage25LongFormPlanContextV2(
  value: unknown,
): Readonly<Stage25LongFormPlanContextV2> {
  const context = Context.parse(value);
  const { contextSha256, ...material } = context;
  if (hashEditronCanonicalJsonV1(material) !== contextSha256) {
    throw new Error('STAGE25_LONG_FORM_CONTEXT_V2_HASH_INVALID');
  }
  validateContextIdentities(context);
  return deepFreezeEditronJsonV1(context) as Readonly<Stage25LongFormPlanContextV2>;
}

export function assertStage25LongFormPlanProposalV2(
  value: unknown,
): Readonly<Stage25LongFormPlanProposalV2> {
  const proposal = Proposal.parse(value);
  const { proposalSha256, ...material } = proposal;
  if (hashEditronCanonicalJsonV1(material) !== proposalSha256) {
    throw new Error('STAGE25_LONG_FORM_PROPOSAL_V2_HASH_INVALID');
  }
  return deepFreezeEditronJsonV1(proposal) as Readonly<Stage25LongFormPlanProposalV2>;
}

function validateContextIdentities(context: Stage25LongFormPlanContextV2): void {
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
    if (new Set(ids).size !== ids.length) fail(`CONTEXT_${label}_DUPLICATED`);
  }
  const scopeIds = new Set(context.semanticScopes.map(({ id }) => id));
  if (context.rangeCandidates.some(({ semanticScopeId }) => !scopeIds.has(semanticScopeId))) {
    fail('CONTEXT_RANGE_SCOPE_UNKNOWN');
  }
  const evidenceIds = new Set(context.evidenceRequirements.map(({ id }) => id));
  const selectors = [
    ...context.semanticScopes.map(({ id, requiredEvidenceRequirementIds }) => ({
      label: `SEMANTIC_SCOPE:${id}`, ids: requiredEvidenceRequirementIds,
    })),
    ...context.rangeCandidates.map(({ rangeCandidateId, requiredEvidenceRequirementIds }) => ({
      label: `RANGE_CANDIDATE:${rangeCandidateId}`, ids: requiredEvidenceRequirementIds,
    })),
    ...context.directionRequirements.map(({ id, requiredEvidenceRequirementIds }) => ({
      label: `DIRECTION_REQUIREMENT:${id}`, ids: requiredEvidenceRequirementIds,
    })),
  ];
  const selectedEvidenceIds = new Set<string>();
  for (const selector of selectors) {
    unique(selector.ids, `CONTEXT_${selector.label}_EVIDENCE_DUPLICATED`);
    for (const id of selector.ids) {
      if (!evidenceIds.has(id)) fail(`CONTEXT_${selector.label}_EVIDENCE_UNKNOWN:${id}`);
      selectedEvidenceIds.add(id);
    }
  }
  for (const id of evidenceIds) {
    if (!selectedEvidenceIds.has(id)) fail(`CONTEXT_EVIDENCE_SELECTOR_DANGLING:${id}`);
  }
}

function evidenceFor(
  bindings: Readonly<Record<string, readonly string[]>>, id: string,
): string[] {
  const values = bindings[id];
  if (!values) fail(`CONTEXT_SELECTOR_BINDING_MISSING:${id}`);
  return [...values];
}
function boundedStrings(min: number, max: number) {
  return z.array(z.string().trim().min(1).max(1_000)).min(min).max(max);
}
function unique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) fail(code);
}
function fail(code: string): never {
  throw new Error(`STAGE25_LONG_FORM_PLAN_${code}`);
}
