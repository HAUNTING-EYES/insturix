import { describe, expect, it } from 'vitest';

import { getCanonicalDev04ConnectedChainV2 } from '@/lib/editron/research/open-ended-planner/dev04-capability-gap-chain-v2';
import { runProviderNativeDev04ConnectedEpisodeV2R } from '@/lib/editron/research/open-ended-planner/provider-native-dev04-connected-episode-v2r';
import type { ProviderNativeEpisodeContextV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

describe('V2R provider-native DEV-04 connected episode', () => {
  it('accepts only an evidence-bound capability gap with unchanged state', async () => {
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      if (turn === 1) return response('project', 'read_project_file', identity());
      if (turn === 2) return response('timeline', 'get_timeline_view', identity());
      if (turn === 3) return response('visual', 'find_visual_moment', {
        projectId: 'oe-dev-04', query: 'changing foreground contour across title',
        evidenceIds: ['EV-DEV04-V1'],
      });
      if (turn === 4) return response('resolve', 'resolve_visual_edit', {
        ...identity(), intent: {
          query: 'Keep the moving person in front of only intersecting title pixels.',
          action: 'inspect',
        },
        evidenceIds: ['EV-DEV04-V1'], constraints: { preserveTitleOutsideOverlap: true },
      });
      return finish('CAPABILITY_GAP', ['MOVING_MATTE_CAPABILITY_MISSING']);
    });

    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.providerEpisode.selectedOperatorIds).toEqual([
      'read_project_file', 'get_timeline_view', 'find_visual_moment', 'resolve_visual_edit',
    ]);
    expect(receipt.capabilityGapEvaluation).toEqual({
      disposition: 'CAPABILITY_BLOCKED', diagnostics: [],
    });
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS_EXPECTED_CAPABILITY_GAP', stateUnchanged: true,
      session: { attemptedUnsafeSubstitutes: [], stateEffects: [] },
    });
    expect(receipt.stateEffects).toEqual([]);
  });

  it('accepts supplied capability-gap fact references but rejects unrelated supplied facts', async () => {
    const providerStyle = await run(async () => finish(
      'CAPABILITY_GAP',
      ['MISSING_MOVING_MATTE_OR_SEGMENTATION_TRACK'],
      ['fact-support-moving-matte', 'fact-visual-selective-occlusion'],
    ));
    expect(providerStyle.productOutcome).toBe('PASS');

    const unrelated = await run(async () => finish(
      'CAPABILITY_GAP',
      ['MISSING_MOVING_MATTE_OR_SEGMENTATION_TRACK'],
      ['fact-project-revision'],
    ));
    expect(unrelated.productOutcome).toBe('FAIL');
    expect(unrelated.execution).toMatchObject({
      disposition: 'FAIL', reasonCodes: ['EXPECTED_CAPABILITY_GAP_NOT_PROVEN'],
    });
  });

  it('rejects a static-keyframe substitute even when the model later admits a gap', async () => {
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('keyframes', 'set_keyframes', {
            ...identity(), overlayId: 99,
            keyframes: [{ frame: 0, property: 'opacity', value: 0 }],
            evidenceIds: ['EV-DEV04-V1'],
          })
        : finish('CAPABILITY_GAP', ['MOVING_MATTE_CAPABILITY_MISSING']);
    });
    expect(receipt.productOutcome).toBe('FAIL');
    expect(receipt.execution).toMatchObject({
      disposition: 'FAIL', reasonCodes: ['UNSAFE_SUBSTITUTE_ATTEMPTED'],
      stateUnchanged: true,
      session: { attemptedUnsafeSubstitutes: ['set_keyframes'] },
    });
  });

  it('rejects false PASS and revision drift without changing state', async () => {
    const falsePass = await run(async () => finish('PASS', ['MODEL_PASS']));
    expect(falsePass.productOutcome).toBe('FAIL');
    expect(falsePass.execution).toMatchObject({ stateUnchanged: true });

    let turn = 0;
    const conflict = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('stale', 'read_project_file', {
            projectId: 'oe-dev-04', expectedProjectRevision: 'R1',
          })
        : finish('CONFLICT', ['REVISION_CONFLICT']);
    });
    expect(conflict.productOutcome).toBe('CONFLICT');
    expect(conflict.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'CONFLICT', output: { code: 'PROVIDER_NATIVE_DEV04_REVISION_DRIFT' },
    });
  });
});

async function run(
  invoke: (request: SerializedProviderNativeTurnV2R) => Promise<{ status: number; body: unknown }>,
) {
  return runProviderNativeDev04ConnectedEpisodeV2R({
    route: {
      routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
    },
    context: context(), invoke,
  });
}

function context(): ProviderNativeEpisodeContextV2R {
  const pack = getCanonicalDev04ConnectedChainV2().evidencePacks.BASELINE;
  return {
    episodeId: 'dev04-provider-native-baseline',
    objective: 'Put the title behind the moving person for the whole shot without hiding non-overlapping title pixels.',
    activeTarget: { taskId: 'DEV-04', conditionId: 'BASELINE' },
    revisionBinding: identity(),
    projectState: { ...identity(), overlays: ['dev04-crossing', 'dev04-title'] },
    evidence: pack.facts as readonly JsonRecord[],
    preservationRules: ['preserve-source-pixels', 'preserve-title-outside-overlap', 'preserve-shot-timing'],
    authorityAndPolicy: { mutation: 'DENY', expectedDisposition: 'CAPABILITY_GAP' },
    budget: { maxTurns: 8, maxOutputTokensPerTurn: 1024, maxIdenticalCalls: 1 },
  };
}

function identity(): JsonRecord {
  return { projectId: 'oe-dev-04', expectedProjectRevision: 'R2' };
}

function response(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: 'gpt-5.6-terra', status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) }],
  } };
}

function finish(
  disposition: 'PASS' | 'CAPABILITY_GAP' | 'CONFLICT', reasonCodes: string[],
  evidenceIds: string[] = ['EV-DEV04-V1'],
) {
  return response(`finish-${disposition}`, 'finish_editron_research_episode', {
    disposition, reasonCodes, evidenceIds,
    summary: disposition === 'CAPABILITY_GAP'
      ? 'No certified moving matte or segmentation capability exists.' : disposition,
  });
}
