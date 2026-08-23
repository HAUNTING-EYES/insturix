import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { compileStage25LongFormPlanProposalV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-compiler-v1';
import {
  assertStage25LongFormPlanContextV1,
  buildStage25LongFormPlanHoldoutContextV1,
  createStage25LongFormPlanProposalV1,
  type Stage25LongFormPlanProposalNodeV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-holdout-v1';

const context = buildStage25LongFormPlanHoldoutContextV1();

describe('Stage 2.5 long-form Sequence/Range planning holdout', () => {
  it('compiles a bounded 4.5-hour proposal into the existing PlanService contract', () => {
    const result = compileStage25LongFormPlanProposalV1({ context, proposal: proposal() });
    expect(result.plan).toMatchObject({
      projectId: 'project-longform-event-01', planId: 'plan-longform-event-01',
      planRevision: 1, acceptedBy: { actorKind: 'MODEL' },
    });
    expect(result.plan.nodes).toHaveLength(14);
    expect(result.receipt).toMatchObject({
      authority: 'RESEARCH_ONLY_COMPILED_TO_EXISTING_PLANSERVICE_NO_PROJECT_MUTATION',
      nodeCount: 14, sequenceNodeCount: 5, maxDepth: 3,
      assessment: 'PASS_STRUCTURAL_ONLY', stateEffects: [],
      unverifiedJudgments: ['EDITORIAL_TASTE', 'RANGE_SEMANTIC_ACCURACY', 'RENDERED_AUDIOVISUAL_QUALITY'],
    });
    expect(result.plan.nodes.every((node) => node.finalDisposition === null)).toBe(true);
  });

  it('does not let the model invent scope, range, evidence, or budget identities', () => {
    for (const mutate of [
      (nodes: Stage25LongFormPlanProposalNodeV1[]) => nodes[0].semanticScopeIds.push('invented-scope'),
      (nodes: Stage25LongFormPlanProposalNodeV1[]) => nodes[0].rangeCandidateIds.push('invented-range'),
      (nodes: Stage25LongFormPlanProposalNodeV1[]) => nodes[0].evidenceRequirementIds.push('invented-evidence'),
      (nodes: Stage25LongFormPlanProposalNodeV1[]) => { nodes[0].budgetClassId = 'invented-budget'; },
    ]) {
      const nodes = validNodes(); mutate(nodes);
      expect(() => compile(nodes)).toThrow(/UNKNOWN/);
    }
  });

  it('rejects a monolithic plan, cycles, and false readiness', () => {
    const monolith = validNodes().filter(({ workKind }) => workKind !== 'SEQUENCE').concat(validNodes().filter(({ workKind }) => workKind === 'SEQUENCE').slice(0, 1));
    monolith.find(({ nodeId }) => nodeId === 'picture-stable')!.dependsOnNodeIds = ['seq-0'];
    expect(() => compile(monolith)).toThrow('SEQUENCE_DECOMPOSITION_TOO_SHALLOW');

    const cyclic = validNodes(); cyclic.find(({ nodeId }) => nodeId === 'source')!.dependsOnNodeIds = ['story'];
    expect(() => compile(cyclic)).toThrow('PLAN_GRAPH_CYCLE');

    const falseReady = validNodes(); const story = falseReady.find(({ nodeId }) => nodeId === 'story')!; story.status = 'READY';
    expect(() => compile(falseReady)).toThrow('FALSE_READY_WITH_UNRESOLVED_EVIDENCE');
  });

  it('requires picture stability before final audio, captions, QC, and delivery', () => {
    const nodes = validNodes(); nodes.find(({ nodeId }) => nodeId === 'captions')!.dependsOnNodeIds = ['story'];
    expect(() => compile(nodes)).toThrow('WORKFLOW_ORDER_INVALID:captions:PICTURE_STABILITY');

    const missingQc = validNodes(); missingQc.find(({ nodeId }) => nodeId === 'delivery')!.dependsOnNodeIds = ['audio', 'captions'];
    expect(() => compile(missingQc)).toThrow('WORKFLOW_ORDER_INVALID:delivery:QUALITY_CONTROL');
  });

  it('requires every mandatory direction rule and deliverable to remain visible', () => {
    const nodes = validNodes(); for (const node of nodes) node.directionRequirementIds = node.directionRequirementIds.filter((id) => id !== 'req-no-literal-copy');
    expect(() => compile(nodes)).toThrow('DIRECTION_REQUIREMENT_UNCOVERED:req-no-literal-copy');
    const missingSocial = validNodes(); for (const node of missingSocial) node.deliverableIds = node.deliverableIds.filter((id) => id !== 'social-cut');
    expect(() => compile(missingSocial)).toThrow('DELIVERABLE_UNCOVERED:social-cut');

    const missingEvidence = validNodes(); for (const node of missingEvidence) node.evidenceRequirementIds = node.evidenceRequirementIds.filter((id) => id !== 'ev-hero-moment');
    expect(() => compile(missingEvidence)).toThrow('EVIDENCE_REQUIREMENT_UNCOVERED:ev-hero-moment');
    const missingApproval = validNodes(); for (const node of missingApproval) node.approvalRequirementIds = [];
    expect(() => compile(missingApproval)).toThrow('APPROVAL_REQUIREMENT_UNCOVERED:approval-hero-design');
  });

  it('keeps narrative order separate from execution dependencies', () => {
    const nodes = validNodes(); nodes.find(({ nodeId }) => nodeId === 'seq-3')!.narrativeOrder = 7;
    expect(() => compile(nodes)).toThrow('NARRATIVE_ORDER_INVALID');
    const result = compile(validNodes());
    expect(result.plan.nodes.find(({ nodeId }) => nodeId === 'seq-1')?.dependsOnNodeIds).toEqual(['story']);
  });

  it('produces the same accepted PlanService identity for shuffled node presentation', () => {
    const ordered = compile(validNodes());
    const shuffled = compile([...validNodes()].reverse());
    expect(shuffled.plan.revisionSha256).toBe(ordered.plan.revisionSha256);
  });

  it('rejects a forged proposal hash before plan compilation', () => {
    const frozen = proposal();
    expect(() => compileStage25LongFormPlanProposalV1({
      context, proposal: { ...frozen, proposalId: 'forged' },
    })).toThrow('STAGE25_LONG_FORM_PROPOSAL_HASH_INVALID');
  });

  it('rejects duplicate or dangling identities even in a correctly rehashed context', () => {
    const duplicate = structuredClone(context);
    duplicate.semanticScopes.push(structuredClone(duplicate.semanticScopes[0]));
    expect(() => assertStage25LongFormPlanContextV1(rehashContext(duplicate)))
      .toThrow('STAGE25_LONG_FORM_CONTEXT_SEMANTIC_SCOPE_DUPLICATED');

    const dangling = structuredClone(context);
    dangling.rangeCandidates[0].semanticScopeId = 'unknown-scope';
    expect(() => assertStage25LongFormPlanContextV1(rehashContext(dangling)))
      .toThrow('STAGE25_LONG_FORM_CONTEXT_RANGE_SCOPE_UNKNOWN');
  });
});

function compile(nodes: Stage25LongFormPlanProposalNodeV1[]) {
  return compileStage25LongFormPlanProposalV1({
    context,
    proposal: createStage25LongFormPlanProposalV1({
      version: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROPOSAL_V1_1', proposalId: 'proposal-longform-01', nodes,
    }),
  });
}

function proposal() {
  return createStage25LongFormPlanProposalV1({
    version: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROPOSAL_V1_1', proposalId: 'proposal-longform-01', nodes: validNodes(),
  });
}

function validNodes(): Stage25LongFormPlanProposalNodeV1[] {
  const nodes = [
    node('direction', 'DIRECTION', null, [], null, ['all-sources', 'brand'], [], ['req-audience-value', 'req-keynote-proof', 'req-participant-outcomes', 'req-brand', 'req-no-literal-copy'], ['ev-source-identities'], 'READY'),
    node('source', 'SOURCE_ORGANIZATION', 'direction', ['direction'], null, ['all-sources'], [], [], ['ev-source-identities', 'ev-keynote-transcript', 'ev-workshop-shot-map', 'ev-interview-rights'], 'NEEDS_EVIDENCE'),
    node('music', 'MUSIC_STRUCTURE', 'direction', ['direction'], null, ['music'], [], [], ['ev-music-structure'], 'READY'),
    node('story', 'STORY_ASSEMBLY', 'direction', ['source', 'music'], null, ['keynote', 'workshops', 'interviews', 'broll'], [], ['req-audience-value', 'req-keynote-proof', 'req-participant-outcomes'], ['ev-keynote-transcript', 'ev-workshop-shot-map', 'ev-interview-rights', 'ev-hero-moment'], 'NEEDS_EVIDENCE'),
    node('seq-0', 'SEQUENCE', 'story', ['story'], 0, ['broll', 'keynote'], ['event-broll', 'keynote-open'], ['req-audience-value'], ['ev-workshop-shot-map'], 'READY'),
    node('seq-1', 'SEQUENCE', 'story', ['story'], 1, ['keynote'], ['keynote-proof'], ['req-keynote-proof'], ['ev-keynote-transcript'], 'READY'),
    node('seq-2', 'SEQUENCE', 'story', ['story'], 2, ['workshops', 'interviews'], ['workshop-rise', 'interview-outcomes'], ['req-participant-outcomes'], ['ev-workshop-shot-map', 'ev-interview-rights'], 'NEEDS_EVIDENCE'),
    node('seq-3', 'SEQUENCE', 'story', ['story'], 3, ['broll', 'brand'], ['closing-reaction'], ['req-brand', 'req-no-literal-copy'], ['ev-hero-moment'], 'NEEDS_EVIDENCE'),
    node('picture-stable', 'PICTURE_STABILITY', 'direction', ['seq-0', 'seq-1', 'seq-2', 'seq-3', 'seq-4'], null, ['main-deliverable', 'social-deliverable'], [], [], ['ev-source-identities'], 'READY'),
    node('audio', 'FINAL_AUDIO', 'direction', ['picture-stable'], null, ['music', 'main-deliverable', 'social-deliverable'], [], [], ['ev-music-structure'], 'READY'),
    node('captions', 'CAPTIONS', 'direction', ['picture-stable'], null, ['main-deliverable', 'social-deliverable'], [], [], ['ev-keynote-transcript'], 'READY'),
    node('qc', 'QUALITY_CONTROL', 'direction', ['picture-stable', 'audio', 'captions'], null, ['main-deliverable', 'social-deliverable'], [], ['req-brand', 'req-no-literal-copy'], ['ev-source-identities'], 'READY'),
    node('delivery', 'DELIVERY', 'direction', ['audio', 'captions', 'qc'], null, ['main-deliverable', 'social-deliverable'], [], [], ['ev-source-identities'], 'READY'),
    node('seq-4', 'SEQUENCE', 'story', ['story'], 4, ['interviews'], [], ['req-participant-outcomes'], ['ev-interview-rights'], 'NEEDS_EVIDENCE'),
  ];
  nodes.find(({ nodeId }) => nodeId === 'delivery')!.deliverableIds = ['main-film', 'social-cut'];
  nodes.find(({ nodeId }) => nodeId === 'seq-3')!.approvalRequirementIds = ['approval-hero-design'];
  nodes.find(({ nodeId }) => nodeId === 'delivery')!.approvalRequirementIds = ['approval-final-delivery'];
  return nodes;
}

function node(
  nodeId: string, workKind: Stage25LongFormPlanProposalNodeV1['workKind'], parentNodeId: string | null,
  dependsOnNodeIds: string[], narrativeOrder: number | null, semanticScopeIds: string[], rangeCandidateIds: string[],
  directionRequirementIds: string[], evidenceRequirementIds: string[], status: Stage25LongFormPlanProposalNodeV1['status'],
): Stage25LongFormPlanProposalNodeV1 {
  return {
    nodeId, workKind, parentNodeId, dependsOnNodeIds, narrativeOrder,
    targetClaims: [`Produce the observable ${nodeId} result for the intended viewer.`],
    preservationClaims: ['Preserve user-authored requirements and accepted source identity.'],
    successConditions: [`The ${nodeId} result is bounded and ready for its declared next dependency.`],
    stopConditions: ['Stop on missing evidence, rights, revision, approval, or proof.'],
    semanticScopeIds, rangeCandidateIds, deliverableIds: [], directionRequirementIds,
    evidenceRequirementIds, approvalRequirementIds: [], budgetClassId: workKind === 'DELIVERY' ? 'budget-final' : 'budget-planning',
    status, whatHasNotBeenChecked: ['Rendered result and editor judgment have not been checked.'],
  };
}

function rehashContext(value: typeof context) {
  const { contextSha256: _ignored, ...material } = value;
  return { ...material, contextSha256: hashEditronCanonicalJsonV1(material) };
}
