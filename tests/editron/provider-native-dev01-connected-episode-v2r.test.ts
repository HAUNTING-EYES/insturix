import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import {
  DEV01_STAGE6_ARTIFACT_IDS_V2,
  DEV01_STAGE6_NATIVE_PROXY_V2,
  type Dev01Stage6RenderProofV2,
  type Dev01Stage6RendererV2,
} from '@/lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-contract-v2';
import { runProviderNativeDev01ConnectedEpisodeV2R } from '@/lib/editron/research/open-ended-planner/provider-native-dev01-connected-episode-v2r';
import type { ProviderNativeEpisodeContextV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('V2R provider-native DEV-01 connected episode', () => {
  it('executes model-selected owners causally and accepts only rendered proof', async () => {
    const invoke = baselineInvoke();

    const receipt = await run(invoke, context('BASELINE'), fakeRenderer());

    expect(receipt.version).toBe('EDITRON_PROVIDER_NATIVE_DEV01_CONNECTED_EPISODE_V2R_5');
    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.providerEpisode.selectedOperatorIds).toEqual([
      'resolve_transcript_edit', 'cut_section', 'find_visual_moment',
      'resolve_keyframe_edit', 'set_keyframes', 'apply_audio_ducking',
    ]);
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS',
      session: {
        mutationStages: ['CUT', 'DUCK', 'PUSH'],
        changedPaths: expect.arrayContaining([
          'durationInFrames', 'overlays', 'overlays.104.keyframeTracks.scale',
          'overlays.103.styles.duckingConfig',
        ]),
      },
      proof: {
        state: 'PASS', reloadEquivalent: 'PASS',
        renderedVisual: 'PASS', renderedAudio: 'PASS', projectMutation: 'NONE',
      },
    });
    expect(receipt.executionIdentity).toEqual({
      executionId: 'dev01-connected-execution-1', createdAt: '2026-08-20T00:00:00.000Z',
    });
    expect(receipt.stage6Adapter).toMatchObject({
      adapterId: 'DEV01_CAUSAL_NATIVE_PROXY_V2R',
      executionAuthority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    });
    expect(receipt.stateEffects).toEqual([]);
  });

  it('returns withheld visual evidence as UNVERIFIABLE without rendering', async () => {
    const renderer = vi.fn(fakeRenderer());
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('visual', 'find_visual_moment', {
            projectId: 'oe-dev-01', query: 'product box reveal', evidenceIds: ['EV-DEV01-V1'],
          })
        : finish('UNVERIFIABLE');
    }, context('VISUAL_EVIDENCE_WITHHELD'), renderer);

    expect(receipt.productOutcome).toBe('UNVERIFIABLE');
    expect(receipt.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: { code: 'PROVIDER_NATIVE_DEV01_EVIDENCE_UNAVAILABLE' },
    });
    expect(receipt.execution).toMatchObject({
      disposition: 'NOT_RUN_PROVIDER_TERMINAL',
      session: { beforeStateHash: expect.any(String), afterStateHash: expect.any(String), changedPaths: [] },
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects an invented cut range before mutation and render', async () => {
    const renderer = vi.fn(fakeRenderer());
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('cut', 'cut_section', {
            projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
            targetRange: { startFrame: 151, endFrame: 196 }, evidenceIds: ['EV-DEV01-T1'],
          })
        : finish('FAIL');
    }, context('BASELINE'), renderer);

    expect(receipt.productOutcome).toBe('FAIL');
    expect(receipt.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'FAIL',
      output: { code: 'PROVIDER_NATIVE_DEV01_CAUSAL_OUTPUT_NOT_BOUND' },
    });
    expect(receipt.execution).toMatchObject({
      disposition: 'NOT_RUN_PROVIDER_TERMINAL', session: { changedPaths: [], mutationStages: [] },
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('passes declared transcript gap bounds to the existing resolver owner', async () => {
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('resolve-bounded', 'resolve_transcript_edit', {
            projectId: 'oe-dev-01', expectedProjectRevision: 'R7', query: 'here it is',
            intent: { action: 'cut_after_phrase', minGapFrames: 6, maxCutFrames: 12 },
            evidenceIds: ['EV-DEV01-T1'],
          })
        : finish('FAIL');
    }, context('BASELINE'), fakeRenderer());

    expect(receipt.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'OK',
      output: {
        proposedOperation: {
          targetOperatorId: 'cut_section',
          arguments: { targetRange: { startFrame: 151, endFrame: 163 } },
        },
      },
    });
  });

  it('rejects premature model PASS and a renderer proof failure', async () => {
    const prematureRenderer = vi.fn(fakeRenderer());
    const premature = await run(async () => finish('PASS'), context('BASELINE'), prematureRenderer);
    expect(premature.productOutcome).toBe('FAIL');
    expect(premature.execution).toMatchObject({
      disposition: 'FAIL', reasonCodes: ['MODEL_FALSE_SUCCESS_REQUIRED_MUTATIONS_MISSING'],
      missingMutationStages: ['CUT', 'PUSH', 'DUCK'],
    });
    expect(prematureRenderer).not.toHaveBeenCalled();

    const validProof = passingProof();
    const invalidProof: Dev01Stage6RenderProofV2 = {
      ...validProof,
      video: { ...validProof.video, decodedFrameCount: 434 },
    };
    const invalid = await run(baselineInvoke(), context('BASELINE'), fakeRenderer(invalidProof));
    expect(invalid.productOutcome).toBe('FAIL');
    expect(invalid.execution).toMatchObject({
      disposition: 'FAIL', reasonCodes: ['RENDER_OR_PROOF_FAILURE'],
    });
  });

  it('checks the rendered duck against the selected config without imposing an undeclared taste target', async () => {
    const selectedProof = passingProof();
    selectedProof.audio = {
      ...selectedProof.audio,
      bgmDuckedRms: 0.021126,
      duckReductionDb: 3.052,
      dialogueLiftOverDuckedBgmDb: 11.565,
    };
    const accepted = await run(baselineInvoke(0.25), context('BASELINE'), fakeRenderer(selectedProof));
    expect(accepted.productOutcome).toBe('PASS');
    expect(accepted.execution).toMatchObject({
      disposition: 'PASS',
      audioProofPolicy: {
        minimumEffectiveDuckReductionDb: 1,
      },
    });
    expect((accepted.execution.audioProofPolicy as JsonRecord).expectedDuckReductionDb)
      .toBeCloseTo(20 * Math.log10(0.355 / 0.25), 5);

    const negligibleProof = passingProof();
    negligibleProof.audio = {
      ...negligibleProof.audio,
      bgmDuckedRms: 0.029577,
      duckReductionDb: 0.123,
    };
    const rejected = await run(baselineInvoke(0.35), context('BASELINE'), fakeRenderer(negligibleProof));
    expect(rejected.productOutcome).toBe('FAIL');
    expect(rejected.execution).toMatchObject({
      disposition: 'FAIL', reasonCodes: ['MODEL_PROOF_REPAIR_MUTATION_MISSING'],
    });
  });

  it('permits one model-selected audio repair after rendered proof and preserves both attempts', async () => {
    const negligibleProof = passingProof();
    negligibleProof.audio = {
      ...negligibleProof.audio,
      bgmDuckedRms: 0.029577,
      duckReductionDb: 0.123,
    };
    const receipt = await run(
      baselineInvoke(0.35, 0.089), context('BASELINE'),
      fakeRenderer([negligibleProof, passingProof()]),
    );
    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS',
      session: { audioProofRepairCount: 1 },
      proofAttempts: [
        { ordinal: 0, disposition: 'FAIL', reasonCodes: ['AUDIO_DUCK_ENVELOPE_INVALID'] },
        { ordinal: 1, disposition: 'PASS', reasonCodes: [] },
      ],
      proofRepairEpisode: {
        selectedOperatorIds: ['apply_audio_ducking'],
        terminal: { disposition: 'READY_FOR_PROOF' },
      },
    });
  });
});

async function run(
  invoke: (request: SerializedProviderNativeTurnV2R) => Promise<{ status: number; body: unknown }>,
  episodeContext: ProviderNativeEpisodeContextV2R,
  renderer: Dev01Stage6RendererV2,
) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'editron-provider-dev01-'));
  roots.push(outputDir);
  return runProviderNativeDev01ConnectedEpisodeV2R({
    route: {
      routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
    },
    context: episodeContext, invoke, outputDir,
    executionId: 'dev01-connected-execution-1', createdAt: '2026-08-20T00:00:00.000Z', renderer,
  });
}

function context(conditionId: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD'): ProviderNativeEpisodeContextV2R {
  const evidencePack = getCanonicalDev01Stage123V2().evidencePacks[conditionId];
  return {
    episodeId: `dev01-provider-native-${conditionId.toLowerCase()}`,
    objective: 'Remove only the measured dead air, add a restrained product push-in, and duck BGM under dialogue.',
    activeTarget: { taskId: 'DEV-01', conditionId },
    revisionBinding: { projectId: 'oe-dev-01', expectedProjectRevision: 'R7' },
    projectState: { projectId: 'oe-dev-01', projectRevision: 'R7' },
    evidence: evidencePack.facts as readonly JsonRecord[],
    preservationRules: (evidencePack.preservationRequirements as readonly JsonRecord[])
      .map((requirement) => String(requirement.preservationId)),
    authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY', network: 'PROVIDER_ONLY' },
    budget: { maxTurns: 8, maxOutputTokensPerTurn: 1024, maxIdenticalCalls: 1 },
  };
}

function baselineInvoke(duckLevel?: number, repairDuckLevel?: number) {
  const requests: SerializedProviderNativeTurnV2R[] = [];
  return vi.fn(async (request: SerializedProviderNativeTurnV2R) => {
    requests.push(request);
    const turn = requests.length;
    if (turn === 1) return response('resolve', 'resolve_transcript_edit', {
      projectId: 'oe-dev-01', expectedProjectRevision: 'R7', query: 'here it is',
      intent: { action: 'cut_after_phrase' }, evidenceIds: ['EV-DEV01-T1'],
    });
    if (turn === 2) return response('cut', 'cut_section', {
      projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
      targetRange: (output(request, 'resolve').proposedOperationArgs as JsonRecord).targetRange,
      evidenceIds: ['EV-DEV01-T1'],
    });
    if (turn === 3) {
      const cut = output(request, 'cut');
      return response('visual', 'find_visual_moment', {
        projectId: 'oe-dev-01', query: 'product box reveal',
        timelineCoordinateTransform: cut.timelineCoordinateTransform,
        splitChildren: cut.splitChildren, evidenceIds: ['EV-DEV01-V1'],
      });
    }
    if (turn === 4) {
      const visual = output(request, 'visual');
      return response('keyframe-form', 'resolve_keyframe_edit', {
        projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
        overlayId: visual.overlayId, targetFrame: visual.targetFrame,
        focalPoint: visual.focalPoint, evidenceStrength: visual.evidenceStrength,
        intent: { direction: 'in', scaleDelta: 0.12, replaceExistingScaleKeyframes: false },
        evidenceIds: ['EV-DEV01-V1'],
      });
    }
    if (turn === 5) {
      const form = output(request, 'keyframe-form').proposedOperationArgs as JsonRecord;
      return response('keyframes', 'set_keyframes', {
        projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
        overlayId: form.overlayId, keyframes: form.keyframes,
        focalPoint: form.focalPoint, evidenceIds: ['EV-DEV01-V1'],
      });
    }
    if (turn === 6) return response('duck', 'apply_audio_ducking', {
      projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
      audioPlan: { enabled: true, ...(duckLevel === undefined ? {} : { duckLevel }) },
      evidenceIds: ['EV-DEV01-A1'],
    });
    if (turn === 7) return finish('READY_FOR_PROOF');
    if (turn === 8 && repairDuckLevel !== undefined) return response('repair-duck', 'apply_audio_ducking', {
      projectId: 'oe-dev-01', expectedProjectRevision: 'R7',
      audioPlan: { enabled: true, duckLevel: repairDuckLevel }, evidenceIds: ['EV-DEV01-A1'],
    });
    return finish('READY_FOR_PROOF');
  });
}

function response(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: 'gpt-5.6-terra', status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) }],
  } };
}

function finish(disposition: 'READY_FOR_PROOF' | 'PASS' | 'FAIL' | 'UNVERIFIABLE') {
  return response(`finish-${disposition}`, 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds: [], summary: `Finished ${disposition}`,
  });
}

function output(request: SerializedProviderNativeTurnV2R, callId: string): JsonRecord {
  const history = request.body.input as JsonRecord[];
  const result = [...history].reverse().find((item) =>
    item.type === 'function_call_output' && item.call_id === callId);
  if (!result) throw new Error(`TEST_TOOL_OUTPUT_MISSING:${callId}`);
  const envelope = JSON.parse(String(result.output)) as JsonRecord;
  const value = envelope.output as JsonRecord;
  const proposed = value.proposedOperation as JsonRecord | undefined;
  return proposed
    ? { ...value, proposedOperationArgs: (proposed.arguments as JsonRecord) ?? {} }
    : value;
}

function fakeRenderer(
  proofOrSequence: Dev01Stage6RenderProofV2 | readonly Dev01Stage6RenderProofV2[] = passingProof(),
): Dev01Stage6RendererV2 {
  let call = 0;
  return async ({ outputDir }) => {
    await mkdir(outputDir, { recursive: true });
    const artifactPaths = Object.fromEntries(await Promise.all(DEV01_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
      const artifactPath = path.join(outputDir, `${artifactId.toLowerCase()}.fixture`);
      await writeFile(artifactPath, `fixture-${artifactId}`);
      return [artifactId, artifactPath];
    }))) as Record<typeof DEV01_STAGE6_ARTIFACT_IDS_V2[number], string>;
    const sequence = Array.isArray(proofOrSequence) ? proofOrSequence : [proofOrSequence];
    const proof = sequence[Math.min(call, sequence.length - 1)] as Dev01Stage6RenderProofV2;
    call += 1;
    return { artifactPaths, proof };
  };
}

function passingProof(): Dev01Stage6RenderProofV2 {
  return {
    schemaVersion: DEV01_STAGE6_NATIVE_PROXY_V2,
    renderer: { root: 'components/editron/editor/version-7.0.0/remotion/index.ts', assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps', visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx', audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx' },
    composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 435 },
    sourceBindings: { hostVideoAssetId: 'dev01-host-truth-v2', dialogueAssetId: 'dev01-dialogue-truth-v2', bgmAssetId: 'dev01-bgm-truth-v2' },
    video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1', decodedFrameCount: 435, durationSeconds: 14.5, audioStreamCount: 1 },
    visual: { preRevealFrame: 159, revealFrame: 160, zoomedFrame: 171, preRevealYellowPixels: 0, revealYellowPixels: 4_000, revealBounds: { left: 198, top: 43, width: 80, height: 94, centerX: 238, centerY: 90 }, zoomedBounds: { left: 193, top: 38, width: 90, height: 105, centerX: 238, centerY: 90 }, widthScale: 1.125, heightScale: 1.117, centerDriftPixels: 0 },
    audio: { sampleRateHz: 48_000, bgmProofSampleFrames: 696_000, fullMixSampleFrames: 697_344, bgmSoloBeforeRms: 0.03, bgmDuckedRms: 0.0075, bgmSoloAfterRms: 0.03, duckReductionDb: 12.041, soloRecoveryRatio: 1, fullSpeechRms: 0.08, dialogueLiftOverDuckedBgmDb: 20.56, fullMixPeak: 0.22 },
    browserErrors: [], externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
  };
}
