import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  compileStage25LongFormPlanProposalV2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-compiler-v2';
import {
  assertStage25LongFormPlanContextV2,
  buildStage25LongFormPlanHoldoutContextV2,
  createStage25LongFormPlanProposalV2,
  STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
  type Stage25LongFormPlanContextV2,
  type Stage25LongFormPlanProposalV2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-holdout-v2';
import {
  buildStage25LongFormProviderContextV2,
  runStage25LongFormProviderEpisodeV2,
  STAGE25_LONG_FORM_PROVIDER_STRUCTURAL_INVARIANTS_V2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-protocol-v2';
import {
  evaluateStage25LongFormProviderEpisodeV2,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-evaluator-v2';
import {
  buildStage25LongFormProviderContextV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-protocol-v1';
import type { ProviderNativeEpisodeReceiptV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;
type ProposalMaterialV2 = Omit<Stage25LongFormPlanProposalV2, 'proposalSha256'>;

describe('Stage 2.5 long-form V2 evidence and readiness semantics', () => {
  it('publishes range derivation, node evidence, readiness, workflow, and quality limits', () => {
    const providerContext = buildStage25LongFormProviderContextV2(1) as JsonRecord;
    const policy = providerContext.authorityAndPolicy as JsonRecord;
    const rules = policy.coverageRules as string[];
    expect(rules).toEqual(STAGE25_LONG_FORM_PROVIDER_STRUCTURAL_INVARIANTS_V2);
    expect(policy).toMatchObject({
      canonicalPlanOwner: 'PlanService/Editron EditorialPlanV1',
      modelReadinessMeaning: 'READY_IS_LOCAL_READY_ONLY',
      canonicalReadinessMeaning: 'READY_REQUIRES_ALL_DEPENDENCIES_VERIFIED_PASS',
      evaluatorDoesNotJudge: [
        'editorial taste', 'range semantic accuracy', 'rendered audiovisual quality',
      ],
    });
    expect(rules.join('\n')).toMatch(/selected range automatically contributes/);
    expect(rules.join('\n')).toMatch(/another node/);
    expect(rules.join('\n')).toMatch(/VERIFIED with finalDisposition PASS/);
    expect(rules.join('\n')).toMatch(/cannot self-declare canonical VERIFIED/);
    expect(rules.join('\n')).toMatch(/PlanService is the sole owner of later promotion/);
  });

  it('passes the valid gold fixture with structural-only receipts', () => {
    const compiled = compileGold();
    expect(compiled.receipt).toMatchObject({
      assessment: 'PASS_STRUCTURAL_ONLY',
      nodeCount: 13,
      sequenceNodeCount: 4,
      unverifiedJudgments: [
        'EDITORIAL_TASTE', 'RANGE_SEMANTIC_ACCURACY',
        'RENDERED_AUDIOVISUAL_QUALITY',
      ],
      stateEffects: [],
    });
    expect(compiled.plan.nodes).toHaveLength(13);
    const receipt = compiled.receipt as {
      derivedRangeScopeBindings: unknown[];
      nodeDerivations: Array<{ evidenceBindings: unknown[] }>;
    };
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.receipt)).toBe(true);
    expect(Object.isFrozen(receipt.derivedRangeScopeBindings)).toBe(true);
    expect(Object.isFrozen(receipt.nodeDerivations)).toBe(true);
    expect(Object.isFrozen(receipt.nodeDerivations[0])).toBe(true);
    expect(Object.isFrozen(receipt.nodeDerivations[0].evidenceBindings)).toBe(true);
  });

  it('orders evidence bindings without consulting the host locale', () => {
    const localeCompare = vi.spyOn(String.prototype, 'localeCompare')
      .mockImplementation(() => {
        throw new Error('HOST_LOCALE_MUST_NOT_BE_CONSULTED');
      });
    try {
      expect(() => compileGold()).not.toThrow();
    } finally {
      localeCompare.mockRestore();
    }
  });

  it('accepts a selected range without duplicated model scope and records the derivation', () => {
    const compiled = compileGold();
    const keynote = compiled.plan.nodes.find(({ nodeId }) =>
      nodeId === 'seq-keynote-proof')!;
    expect(keynote.scope.semanticScopes).toEqual(['keynote']);
    const receipt = compiled.receipt as {
      derivedRangeScopeBindings: Array<JsonRecord>;
      nodeDerivations: Array<JsonRecord>;
    };
    expect(receipt.derivedRangeScopeBindings).toContainEqual({
      nodeId: 'seq-keynote-proof', rangeCandidateId: 'keynote-proof',
      semanticScopeId: 'keynote', suppliedExplicitly: false,
    });
    expect(receipt.nodeDerivations.find(({ nodeId }) =>
      nodeId === 'seq-keynote-proof')).toMatchObject({
      explicitSemanticScopeIds: [],
      effectiveSemanticScopeIds: ['keynote'],
      requiredEvidenceRequirementIds: ['ev-keynote-transcript'],
      modelReadiness: 'LOCAL_READY',
    });
  });

  it('fails an unknown range instead of inferring a binding', () => {
    const proposal = goldMaterial();
    proposalNode(proposal, 'seq-keynote-open').rangeCandidateIds = ['range-forged'];
    expect(() => compile(proposal)).toThrow(
      'STAGE25_LONG_FORM_PLAN_RANGE_CANDIDATE_UNKNOWN:range-forged',
    );
  });

  it('fails both forged selector evidence and dangling context evidence', () => {
    const forgedSelector = mutableContext();
    forgedSelector.rangeCandidates.find(({ rangeCandidateId }) =>
      rangeCandidateId === 'keynote-proof')!.requiredEvidenceRequirementIds = ['ev-forged'];
    expect(() => assertStage25LongFormPlanContextV2(rehash(forgedSelector)))
      .toThrow(/EVIDENCE_UNKNOWN:ev-forged/);

    const dangling = mutableContext();
    dangling.evidenceRequirements.push({
      ...dangling.evidenceRequirements[0], id: 'ev-forged',
    });
    expect(() => assertStage25LongFormPlanContextV2(rehash(dangling)))
      .toThrow('STAGE25_LONG_FORM_PLAN_CONTEXT_EVIDENCE_SELECTOR_DANGLING:ev-forged');
  });

  it('requires transcript evidence for keynote-proof even without a model evidence echo', () => {
    const context = mutableContext();
    const proposal = goldMaterial();
    proposalNode(proposal, 'seq-keynote-open').status = 'NEEDS_EVIDENCE';
    context.evidenceRequirements.find(({ id }) =>
      id === 'ev-keynote-transcript')!.status = 'MISSING';
    expect(() => compile(proposal, rehash(context))).toThrow(
      'STAGE25_LONG_FORM_PLAN_LOCAL_READY_EVIDENCE_UNRESOLVED:seq-keynote-proof:ev-keynote-transcript',
    );
  });

  it('does not let unrelated-node evidence satisfy keynote proof', () => {
    const proposal = goldMaterial();
    proposalNode(proposal, 'node-music').evidenceRequirementIds = [
      'ev-keynote-transcript',
    ];
    proposalNode(proposal, 'seq-keynote-proof').evidenceRequirementIds = [];
    expect(() => compile(proposal)).toThrow(
      'STAGE25_LONG_FORM_PLAN_EVIDENCE_NOT_RELEVANT_TO_NODE:node-music:ev-keynote-transcript',
    );
  });

  it('rejects LOCAL_READY when interview rights are unverified', () => {
    const proposal = goldMaterial();
    proposalNode(proposal, 'seq-participant').status = 'READY';
    expect(() => compile(proposal)).toThrow(
      'STAGE25_LONG_FORM_PLAN_LOCAL_READY_EVIDENCE_UNRESOLVED:seq-participant:ev-interview-rights',
    );
  });

  it('compiles locally ready descendants as PROPOSED with dependency blockers', () => {
    const compiled = compileGold();
    for (const nodeId of ['node-story', 'node-picture', 'node-audio', 'node-delivery']) {
      expect(compiled.plan.nodes.find((node) => node.nodeId === nodeId)?.status)
        .toBe('PROPOSED');
    }
    const receipt = compiled.receipt as { nodeDerivations: Array<JsonRecord> };
    expect(receipt.nodeDerivations.find(({ nodeId }) =>
      nodeId === 'node-delivery')).toMatchObject({
      modelReadiness: 'LOCAL_READY',
      canonicalStatus: 'PROPOSED',
      dependencyBlockers: [
        { dependencyNodeId: 'node-audio', requiredCanonicalStatus: 'VERIFIED',
          requiredFinalDisposition: 'PASS' },
        { dependencyNodeId: 'node-captions', requiredCanonicalStatus: 'VERIFIED',
          requiredFinalDisposition: 'PASS' },
        { dependencyNodeId: 'node-qc', requiredCanonicalStatus: 'VERIFIED',
          requiredFinalDisposition: 'PASS' },
      ],
    });
  });

  it('keeps the evaluator structural-only using a canned zero-inference episode', async () => {
    const episode = await cannedGoldEpisode();
    expect(evaluateStage25LongFormProviderEpisodeV2(episode)).toMatchObject({
      structuralDisposition: 'PASS_STRUCTURAL_ONLY',
      assessmentScope: 'STRUCTURE_AND_PROVENANCE_ONLY',
      qualityJudgments: {
        editorialTaste: 'UNVERIFIABLE',
        rangeSemanticAccuracy: 'UNVERIFIABLE',
        renderedAudiovisualQuality: 'UNVERIFIABLE',
        blindEditorReviewRequired: true,
      },
      stateEffects: [],
    });
  });

  it('rejects rehashed V1 episode/context and wrong V2 tool-set bindings', async () => {
    const episode = await cannedGoldEpisode();
    const v1ContextSha256 = hashCanonicalJsonV1(
      buildStage25LongFormProviderContextV1(1),
    );
    expect(() => evaluateStage25LongFormProviderEpisodeV2(rehashEpisode(episode, {
      episodeId: 'STAGE25-LONGFORM-PLAN:P1', contextSha256: v1ContextSha256,
    }))).toThrow('STAGE25_LONG_FORM_PROVIDER_V2_EPISODE_ID_INVALID');
    expect(() => evaluateStage25LongFormProviderEpisodeV2(rehashEpisode(episode, {
      contextSha256: v1ContextSha256,
    }))).toThrow('STAGE25_LONG_FORM_PROVIDER_V2_CONTEXT_BINDING_INVALID');
    expect(() => evaluateStage25LongFormProviderEpisodeV2(rehashEpisode(episode, {
      toolSetSha256: '0'.repeat(64),
    }))).toThrow('STAGE25_LONG_FORM_PROVIDER_V2_TOOL_SET_BINDING_INVALID');
  });
});

function compileGold() {
  return compile(goldMaterial());
}

function compile(
  material: ProposalMaterialV2,
  context: Stage25LongFormPlanContextV2 = buildStage25LongFormPlanHoldoutContextV2(),
) {
  return compileStage25LongFormPlanProposalV2({
    context, proposal: createStage25LongFormPlanProposalV2(material),
  });
}

function goldMaterial(): ProposalMaterialV2 {
  const base = (input: Partial<ProposalMaterialV2['nodes'][number]> & {
    nodeId: string;
    workKind: ProposalMaterialV2['nodes'][number]['workKind'];
  }): ProposalMaterialV2['nodes'][number] => ({
    parentNodeId: 'root-direction', dependsOnNodeIds: [], narrativeOrder: null,
    targetClaims: [`Plan ${input.nodeId}`], preservationClaims: [],
    successConditions: [`Complete ${input.nodeId}`],
    stopConditions: [`Stop if ${input.nodeId} evidence is insufficient`],
    semanticScopeIds: ['brand'], rangeCandidateIds: [], deliverableIds: [],
    directionRequirementIds: [], evidenceRequirementIds: [],
    approvalRequirementIds: [], budgetClassId: 'budget-planning',
    status: 'READY', whatHasNotBeenChecked: ['Editorial and render quality'],
    ...input,
  });
  return {
    version: STAGE25_LONG_FORM_PLAN_PROPOSAL_VERSION_V2,
    proposalId: 'gold-v2',
    nodes: [
      base({
        nodeId: 'root-direction', workKind: 'DIRECTION', parentNodeId: null,
        semanticScopeIds: ['brand', 'main-deliverable', 'social-deliverable'],
        deliverableIds: ['main-film', 'social-cut'],
        directionRequirementIds: ['req-brand', 'req-no-literal-copy'],
      }),
      base({
        nodeId: 'node-source', workKind: 'SOURCE_ORGANIZATION',
        semanticScopeIds: ['all-sources'],
        directionRequirementIds: ['req-audience-value'],
      }),
      base({
        nodeId: 'node-music', workKind: 'MUSIC_STRUCTURE',
        semanticScopeIds: ['music'],
      }),
      base({
        nodeId: 'node-story', workKind: 'STORY_ASSEMBLY',
        dependsOnNodeIds: ['node-source', 'node-music'],
        approvalRequirementIds: ['approval-hero-design'],
      }),
      base({
        nodeId: 'seq-keynote-open', workKind: 'SEQUENCE',
        parentNodeId: 'node-story', dependsOnNodeIds: ['node-story'],
        narrativeOrder: 0, semanticScopeIds: [],
        rangeCandidateIds: ['keynote-open'],
      }),
      base({
        nodeId: 'seq-keynote-proof', workKind: 'SEQUENCE',
        parentNodeId: 'node-story', dependsOnNodeIds: ['node-story'],
        narrativeOrder: 1, semanticScopeIds: [],
        rangeCandidateIds: ['keynote-proof'],
        directionRequirementIds: ['req-keynote-proof'],
      }),
      base({
        nodeId: 'seq-participant', workKind: 'SEQUENCE',
        parentNodeId: 'node-story', dependsOnNodeIds: ['node-story'],
        narrativeOrder: 2, semanticScopeIds: [], status: 'NEEDS_EVIDENCE',
        rangeCandidateIds: ['workshop-rise', 'interview-outcomes'],
        directionRequirementIds: ['req-participant-outcomes'],
      }),
      base({
        nodeId: 'seq-closing', workKind: 'SEQUENCE',
        parentNodeId: 'node-story', dependsOnNodeIds: ['node-story'],
        narrativeOrder: 3, semanticScopeIds: [], status: 'NEEDS_EVIDENCE',
        rangeCandidateIds: ['event-broll', 'closing-reaction'],
      }),
      base({
        nodeId: 'node-picture', workKind: 'PICTURE_STABILITY',
        dependsOnNodeIds: [
          'seq-keynote-open', 'seq-keynote-proof', 'seq-participant', 'seq-closing',
        ],
      }),
      base({
        nodeId: 'node-audio', workKind: 'FINAL_AUDIO',
        parentNodeId: 'node-picture', dependsOnNodeIds: ['node-picture'],
        semanticScopeIds: ['music'], budgetClassId: 'budget-final',
      }),
      base({
        nodeId: 'node-captions', workKind: 'CAPTIONS',
        parentNodeId: 'node-picture', dependsOnNodeIds: ['node-picture'],
        semanticScopeIds: ['all-sources'], budgetClassId: 'budget-final',
      }),
      base({
        nodeId: 'node-qc', workKind: 'QUALITY_CONTROL',
        parentNodeId: 'node-picture', dependsOnNodeIds: ['node-picture'],
        semanticScopeIds: ['all-sources'], budgetClassId: 'budget-final',
      }),
      base({
        nodeId: 'node-delivery', workKind: 'DELIVERY',
        parentNodeId: 'node-picture',
        dependsOnNodeIds: ['node-audio', 'node-captions', 'node-qc'],
        semanticScopeIds: ['main-deliverable', 'social-deliverable'],
        approvalRequirementIds: ['approval-final-delivery'],
        budgetClassId: 'budget-final',
      }),
    ],
  };
}

function proposalNode(material: ProposalMaterialV2, nodeId: string) {
  const node = material.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) throw new Error(`TEST_NODE_MISSING:${nodeId}`);
  return node;
}

function mutableContext(): Stage25LongFormPlanContextV2 {
  return JSON.parse(JSON.stringify(
    buildStage25LongFormPlanHoldoutContextV2(),
  )) as Stage25LongFormPlanContextV2;
}

function rehash(context: Stage25LongFormPlanContextV2): Stage25LongFormPlanContextV2 {
  const { contextSha256: _contextSha256, ...material } = context;
  return {
    ...material, contextSha256: hashEditronCanonicalJsonV1(material),
  };
}

async function cannedGoldEpisode(): Promise<Readonly<ProviderNativeEpisodeReceiptV2R>> {
  const providerRoute = route();
  return runStage25LongFormProviderEpisodeV2({
    route: providerRoute,
    presentationOrdinal: 1,
    invoke: async () => ({
      status: 200,
      body: {
        id: 'openai-v2-response', model: providerRoute.model, status: 'completed',
        output: [{
          type: 'function_call', call_id: 'finish-openai-v2',
          name: 'finish_editron_research_episode',
          arguments: JSON.stringify({
            disposition: 'READY_FOR_PROOF', reasonCodes: ['PLAN_SUBMITTED'],
            evidenceIds: [], summary: 'Ready for structural evaluation.',
            proposal: goldMaterial(),
          }),
        }],
      },
    }),
  });
}

function rehashEpisode(
  receipt: Readonly<ProviderNativeEpisodeReceiptV2R>,
  patch: Partial<Pick<ProviderNativeEpisodeReceiptV2R,
  'episodeId' | 'contextSha256' | 'toolSetSha256'>>,
): Readonly<ProviderNativeEpisodeReceiptV2R> {
  const { receiptSha256: _receiptSha256, ...material } = receipt;
  const forgedMaterial = { ...material, ...patch };
  return {
    ...forgedMaterial, receiptSha256: hashCanonicalJsonV1(forgedMaterial),
  };
}

function route(): ProviderNativeRouteV2R {
  return {
    routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
    claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
  };
}
