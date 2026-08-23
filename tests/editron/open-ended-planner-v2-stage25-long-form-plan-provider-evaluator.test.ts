import { describe, expect, it } from 'vitest';

import {
  evaluateStage25LongFormProviderEpisodeV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-evaluator-v1';
import {
  runStage25LongFormProviderEpisodeV1,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-protocol-v1';
import type { ProviderNativeRouteV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  buildStage25ValidLongFormProposalMaterialV1,
} from './helpers/stage25-long-form-plan-fixture-v1';

type JsonRecord = Record<string, unknown>;

describe('Stage 2.5 long-form provider evaluator', () => {
  it.each([
    route('OPENAI_LUNA', 'openai', 'gpt-5.6-luna'),
    route('GOOGLE_FLASH', 'google', 'gemini-3.7-flash'),
  ])('compiles one valid $provider proposal structurally', async (providerRoute) => {
    const episode = await runStage25LongFormProviderEpisodeV1({
      route: providerRoute,
      presentationOrdinal: 1,
      invoke: async () => response(providerRoute, {
        disposition: 'READY_FOR_PROOF',
        reasonCodes: ['PLAN_SUBMITTED'],
        evidenceIds: ['ev-source-identities'],
        summary: 'Coarse plan ready for structural evaluation.',
        proposal: buildStage25ValidLongFormProposalMaterialV1(),
      }),
    });
    const evaluation = evaluateStage25LongFormProviderEpisodeV1(episode);
    expect(evaluation).toMatchObject({
      structuralDisposition: 'PASS_STRUCTURAL_ONLY',
      providerDisposition: 'READY_FOR_PROOF',
      qualityJudgments: {
        editorialTaste: 'UNVERIFIABLE',
        rangeSemanticAccuracy: 'UNVERIFIABLE',
        renderedAudiovisualQuality: 'UNVERIFIABLE',
        blindEditorReviewRequired: true,
      },
      stateEffects: [],
    });
    expect(evaluation.planRevisionSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records a compiler rejection separately from provider transport', async () => {
    const proposal = buildStage25ValidLongFormProposalMaterialV1();
    proposal.nodes = proposal.nodes.filter(({ workKind }) => workKind !== 'SEQUENCE');
    const episode = await runStage25LongFormProviderEpisodeV1({
      route: route('OPENAI_TERRA', 'openai', 'gpt-5.6-terra'),
      presentationOrdinal: 2,
      invoke: async () => response(
        route('OPENAI_TERRA', 'openai', 'gpt-5.6-terra'),
        ready(proposal),
      ),
    });
    expect(evaluateStage25LongFormProviderEpisodeV1(episode)).toMatchObject({
      structuralDisposition: 'FAIL_STRUCTURAL',
      providerDisposition: 'READY_FOR_PROOF',
      diagnostics: ['STAGE25_LONG_FORM_PLAN_DEPENDENCY_INVALID'],
    });
  });

  it('preserves an honest no-plan disposition without fabricating a plan', async () => {
    const providerRoute = route('OPENAI_LUNA', 'openai', 'gpt-5.6-luna');
    const episode = await runStage25LongFormProviderEpisodeV1({
      route: providerRoute,
      presentationOrdinal: 3,
      invoke: async () => response(providerRoute, {
        disposition: 'UNVERIFIABLE', reasonCodes: ['EVIDENCE_INSUFFICIENT'],
        evidenceIds: ['ev-hero-moment'], summary: 'Hero evidence is missing.',
        proposal: null,
      }),
    });
    expect(evaluateStage25LongFormProviderEpisodeV1(episode)).toMatchObject({
      structuralDisposition: 'UNVERIFIABLE_NO_PROPOSAL',
      proposalSha256: null, compiledPlan: null, stateEffects: [],
    });
  });

  it('rejects a forged provider episode receipt before evaluation', async () => {
    const providerRoute = route('OPENAI_LUNA', 'openai', 'gpt-5.6-luna');
    const episode = await runStage25LongFormProviderEpisodeV1({
      route: providerRoute,
      presentationOrdinal: 1,
      invoke: async () => response(
        providerRoute,
        ready(buildStage25ValidLongFormProposalMaterialV1()),
      ),
    });
    const forged = { ...episode, episodeId: 'forged' };
    expect(() => evaluateStage25LongFormProviderEpisodeV1(forged))
      .toThrow('STAGE25_LONG_FORM_PROVIDER_EPISODE_RECEIPT_INVALID');
  });
});

function ready(proposal: JsonRecord): JsonRecord {
  return {
    disposition: 'READY_FOR_PROOF', reasonCodes: ['PLAN_SUBMITTED'],
    evidenceIds: ['ev-source-identities'], summary: 'Ready.', proposal,
  };
}

function route(
  routeId: ProviderNativeRouteV2R['routeId'],
  provider: ProviderNativeRouteV2R['provider'],
  model: ProviderNativeRouteV2R['model'],
): ProviderNativeRouteV2R {
  return {
    routeId, provider, model, claimedModelIdentity: model,
    reasoningMode: 'medium',
  };
}

function response(routeValue: ProviderNativeRouteV2R, args: JsonRecord) {
  if (routeValue.provider === 'google') {
    return { status: 200, body: {
      id: 'google-response', model: routeValue.model, status: 'completed',
      steps: [{
        type: 'function_call', id: 'finish-google',
        name: 'finish_editron_research_episode', arguments: args,
      }],
    } };
  }
  return { status: 200, body: {
    id: 'openai-response', model: routeValue.model, status: 'completed',
    output: [{
      type: 'function_call', call_id: 'finish-openai',
      name: 'finish_editron_research_episode', arguments: JSON.stringify(args),
    }],
  } };
}
