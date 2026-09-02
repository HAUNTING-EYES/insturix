import {
  createStage25LongFormPlanProposalV1,
  type Stage25LongFormPlanProposalNodeV1,
  type Stage25LongFormPlanProposalV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-holdout-v1';

export function buildStage25ValidLongFormProposalV1():
Readonly<Stage25LongFormPlanProposalV1> {
  return createStage25LongFormPlanProposalV1(
    buildStage25ValidLongFormProposalMaterialV1(),
  );
}

export function buildStage25ValidLongFormProposalMaterialV1():
Omit<Stage25LongFormPlanProposalV1, 'proposalSha256'> {
  return {
    version: 'EDITRON_STAGE25_LONG_FORM_PLAN_PROPOSAL_V1_1',
    proposalId: 'proposal-longform-01',
    nodes: buildStage25ValidLongFormProposalNodesV1(),
  };
}

export function buildStage25ValidLongFormProposalNodesV1():
Stage25LongFormPlanProposalNodeV1[] {
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
  nodes.find(({ nodeId }) => nodeId === 'delivery')!.deliverableIds = [
    'main-film', 'social-cut',
  ];
  nodes.find(({ nodeId }) => nodeId === 'seq-3')!.approvalRequirementIds = [
    'approval-hero-design',
  ];
  nodes.find(({ nodeId }) => nodeId === 'delivery')!.approvalRequirementIds = [
    'approval-final-delivery',
  ];
  return nodes;
}

function node(
  nodeId: string,
  workKind: Stage25LongFormPlanProposalNodeV1['workKind'],
  parentNodeId: string | null,
  dependsOnNodeIds: string[],
  narrativeOrder: number | null,
  semanticScopeIds: string[],
  rangeCandidateIds: string[],
  directionRequirementIds: string[],
  evidenceRequirementIds: string[],
  status: Stage25LongFormPlanProposalNodeV1['status'],
): Stage25LongFormPlanProposalNodeV1 {
  return {
    nodeId, workKind, parentNodeId, dependsOnNodeIds, narrativeOrder,
    targetClaims: [`Produce the observable ${nodeId} result for the intended viewer.`],
    preservationClaims: [
      'Preserve user-authored requirements and accepted source identity.',
    ],
    successConditions: [
      `The ${nodeId} result is bounded and ready for its declared next dependency.`,
    ],
    stopConditions: [
      'Stop on missing evidence, rights, revision, approval, or proof.',
    ],
    semanticScopeIds, rangeCandidateIds, deliverableIds: [],
    directionRequirementIds, evidenceRequirementIds,
    approvalRequirementIds: [],
    budgetClassId: workKind === 'DELIVERY' ? 'budget-final' : 'budget-planning',
    status,
    whatHasNotBeenChecked: [
      'Rendered result and editor judgment have not been checked.',
    ],
  };
}
