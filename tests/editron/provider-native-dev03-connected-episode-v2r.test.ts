import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2,
  DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6RenderProofV2,
  type Dev03Stage6RendererV2,
} from '@/lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-contract-v2';
import { getCanonicalDev03Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { runProviderNativeDev03ConnectedEpisodeV2R } from '@/lib/editron/research/open-ended-planner/provider-native-dev03-connected-episode-v2r';
import type { ProviderNativeEpisodeContextV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;
type Condition = 'BASELINE' | 'BEAT_EVIDENCE_WITHHELD';

const roots: string[] = [];
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;
const realIt = process.env.RUN_PROVIDER_NATIVE_DEV03_REAL_RENDER === '1' ? it : it.skip;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('V2R provider-native DEV-03 connected episode', () => {
  it('executes model-selected beat alignment and shake causally before accepting rendered proof', async () => {
    const receipt = await run(baselineInvoke(), context('BASELINE'), fakeRenderer());

    expect(receipt.version).toBe('EDITRON_PROVIDER_NATIVE_DEV03_CONNECTED_EPISODE_V2R_5');
    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.providerEpisode.selectedOperatorIds).toEqual([
      'read_project_file', 'get_timeline_view', 'find_audio_moment',
      'sync_cuts_to_beats', 'apply_camera_shake',
    ]);
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS',
      session: {
        mutationStages: ['ALIGN', 'SHAKE'],
        changedPaths: expect.arrayContaining([
          'overlays.dev03-card-1.durationInFrames',
          'overlays.dev03-card-4.from',
          'overlays.dev03-card-4.keyframeTracks.x',
          'overlays.dev03-card-4.keyframeTracks.y',
        ]),
      },
      proof: {
        state: 'PASS', reloadEquivalent: 'PASS', renderedVisual: 'PASS',
        renderedAudio: 'PASS', projectMutation: 'NONE',
      },
    });
    expect(receipt.stage6Adapter).toMatchObject({
      adapterId: 'DEV03_CAUSAL_NATIVE_PROXY_V2R',
      executionAuthority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    });
    const shakeTurn = receipt.providerEpisode.turns.find((turn) => (
      record(turn.modelCall).name === 'apply_camera_shake'
    ));
    const syncTurn = receipt.providerEpisode.turns.find((turn) => (
      record(turn.modelCall).name === 'sync_cuts_to_beats'
    ));
    const syncRevision = receiptRevisionFromTurn(syncTurn);
    const shakeRevision = receiptRevisionFromTurn(shakeTurn);
    expect(syncRevision).not.toBe('R11');
    expect(shakeRevision).not.toBe(syncRevision);
    expect(record(shakeTurn?.normalizedArguments).expectedProjectRevision)
      .toBe(syncRevision);
    expect(record(record(receipt.execution).session).currentProjectRevision)
      .toBe(shakeRevision);
    const ownerReceipt = ownerReceiptFromTurn(shakeTurn);
    expect(ownerReceipt.requestedEffectPlan).toEqual({
      goal: 'Apply one modest short-lived accent on the final selected impact.',
      formIntent: 'restrained-impact',
    });
    expect(records(record(ownerReceipt.ownerPlan).updates)[0]).toMatchObject({
      intensity: 0.35,
      durationFrames: 8,
      resolvedFormIntent: 'restrained-impact',
    });
    expect(receipt.stateEffects).toEqual([]);
  });

  it('returns withheld beat evidence as UNVERIFIABLE without mutation or render', async () => {
    const renderer = vi.fn(fakeRenderer());
    let turn = 0;
    const receipt = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('audio', 'find_audio_moment', {
            projectId: 'oe-dev-03', query: 'strong music impact',
          })
        : finish('UNVERIFIABLE');
    }, context('BEAT_EVIDENCE_WITHHELD'), renderer);

    expect(receipt.productOutcome).toBe('UNVERIFIABLE');
    expect(receipt.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'UNVERIFIABLE',
      output: { code: 'PROVIDER_NATIVE_DEV03_EVIDENCE_UNAVAILABLE' },
    });
    expect(receipt.execution).toMatchObject({
      disposition: 'NOT_RUN_PROVIDER_TERMINAL',
      session: { mutationStages: [], changedPaths: [] },
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects an invented beat plan and a premature model PASS before rendering', async () => {
    const inventedRenderer = vi.fn(fakeRenderer());
    let turn = 0;
    const invented = await run(async () => {
      turn += 1;
      return turn === 1
        ? response('sync', 'sync_cuts_to_beats', {
            projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
            overlayIds: ['dev03-card-1', 'dev03-card-2', 'dev03-card-3', 'dev03-card-4'],
            beatPlan: {
              schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1', assetId: 'dev03-beats',
              measuredEvidenceReceiptHash: 'a'.repeat(64), strongPeakFrames: [120, 240, 360, 480],
              finalStrongPeakFrame: 480,
            },
            beatSyncConstraints: constraintFact('BASELINE').constraints,
            evidenceIds: ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'],
          })
        : finish('FAIL');
    }, context('BASELINE'), inventedRenderer);
    expect(invented.productOutcome).toBe('FAIL');
    expect(invented.providerEpisode.turns[0].execution).toMatchObject({
      disposition: 'FAIL',
      output: { code: 'PROVIDER_NATIVE_DEV03_CAUSAL_OUTPUT_MISSING' },
    });
    expect(inventedRenderer).not.toHaveBeenCalled();

    const prematureRenderer = vi.fn(fakeRenderer());
    const premature = await run(async () => finish('PASS'), context('BASELINE'), prematureRenderer);
    expect(premature.productOutcome).toBe('FAIL');
    expect(premature.execution).toMatchObject({
      disposition: 'FAIL',
      reasonCodes: ['MODEL_FALSE_SUCCESS_REQUIRED_MUTATIONS_MISSING'],
      missingMutationStages: ['ALIGN', 'SHAKE'],
    });
    expect(prematureRenderer).not.toHaveBeenCalled();
  });

  it('rejects stale pre-sync revision reuse before the dependent shake', async () => {
    const renderer = vi.fn(fakeRenderer());
    let turn = 0;
    const receipt = await run(async (request) => {
      turn += 1;
      if (turn === 1) return response('audio', 'find_audio_moment', {
        projectId: 'oe-dev-03', query: 'strongest measured musical impacts',
      });
      if (turn === 2) return response('sync', 'sync_cuts_to_beats', {
        projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
        overlayIds: ['dev03-card-1', 'dev03-card-2', 'dev03-card-3', 'dev03-card-4'],
        beatPlan: output(request, 'audio').result,
        beatSyncConstraints: constraintFact('BASELINE').constraints,
        evidenceIds: ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'],
      });
      if (turn === 3) return response('stale-shake', 'apply_camera_shake', {
        projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
        overlayId: 'dev03-card-4', targetFrame: 479,
        effectPlan: {
          goal: 'Apply one modest short-lived accent on the final selected impact.',
          formIntent: 'restrained-impact',
        },
      });
      return finish('CONFLICT');
    }, context('BASELINE'), renderer);

    expect(receipt.productOutcome).toBe('CONFLICT');
    expect(receipt.providerEpisode.turns[2].execution).toMatchObject({
      disposition: 'CONFLICT',
      output: { code: 'PROVIDER_NATIVE_DEV03_PROJECT_REVISION_DRIFT' },
    });
    expect(receipt.execution).toMatchObject({
      disposition: 'NOT_RUN_PROVIDER_TERMINAL',
      session: {
        mutationStages: ['ALIGN'],
        currentProjectRevision: expect.not.stringMatching(/^R11$/),
      },
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('turns a failed rendered proof into a real product failure', async () => {
    const invalid = passingProof();
    invalid.visual.shakeActiveMeanAbsDiff = 0;
    const receipt = await run(baselineInvoke(), context('BASELINE'), fakeRenderer(invalid));
    expect(receipt.productOutcome).toBe('FAIL');
    expect(receipt.execution).toMatchObject({
      disposition: 'FAIL', reasonCodes: ['MODEL_PROOF_REPAIR_MUTATION_MISSING'],
      proofAttempts: [{
        ordinal: 0, disposition: 'FAIL',
        reasonCodes: ['VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID'],
      }],
    });
  });

  it('permits one model-selected shake repair after rendered proof and preserves both attempts', async () => {
    const invisible = passingProof();
    invisible.visual.shakeActiveMeanAbsDiff = 0;
    const receipt = await run(
      baselineInvoke('pronounced-impact'), context('BASELINE'),
      fakeRenderer([invisible, passingProof()]),
    );

    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS',
      session: { shakeProofRepairCount: 1 },
      proofAttempts: [
        { ordinal: 0, disposition: 'FAIL', reasonCodes: ['VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID'] },
        { ordinal: 1, disposition: 'PASS', reasonCodes: [] },
      ],
      proofRepairEpisode: {
        selectedOperatorIds: ['apply_camera_shake'],
        terminal: { disposition: 'READY_FOR_PROOF' },
      },
    });
    const execution = record(receipt.execution);
    const repairEpisode = record(execution.proofRepairEpisode);
    const repairTurn = records(repairEpisode.turns).find((turn) => (
      record(turn.modelCall).name === 'apply_camera_shake'
    ));
    const repairedOwnerReceipt = ownerReceiptFromTurn(repairTurn);
    expect(records(record(repairedOwnerReceipt.ownerPlan).updates)[0]).toMatchObject({
      intensity: 0.45,
      durationFrames: 10,
      resolvedFormIntent: 'pronounced-impact',
    });
  });

  realIt('renders the provider-native causal episode through the real A/V path', async () => {
    const receipt = await run(baselineInvoke(), context('BASELINE'));
    expect(receipt.productOutcome).toBe('PASS');
    expect(receipt.execution).toMatchObject({
      disposition: 'PASS',
      renderProofValidation: { assessment: 'PASS', renderedVisual: 'PASS', renderedAudio: 'PASS' },
    });
  }, 300_000);
});

async function run(
  invoke: (request: SerializedProviderNativeTurnV2R) => Promise<{ status: number; body: unknown }>,
  episodeContext: ProviderNativeEpisodeContextV2R,
  renderer?: Dev03Stage6RendererV2,
) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'editron-provider-dev03-'));
  roots.push(outputDir);
  return runProviderNativeDev03ConnectedEpisodeV2R({
    route: {
      routeId: 'OPENAI_TERRA', provider: 'openai', model: 'gpt-5.6-terra',
      claimedModelIdentity: 'gpt-5.6-terra', reasoningMode: 'medium',
    },
    context: episodeContext,
    invoke,
    outputDir,
    executionId: 'dev03-connected-execution-1',
    createdAt: '2026-08-20T00:00:00.000Z',
    ...(renderer ? { renderer } : {}),
  });
}

function canonical() {
  return getCanonicalDev03Stage123V2({
    measuredEvidence: measured,
    withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2(),
  });
}

function evidencePack(conditionId: Condition): JsonRecord {
  return canonical().evidencePacks[conditionId] as JsonRecord;
}

function context(conditionId: Condition): ProviderNativeEpisodeContextV2R {
  const pack = evidencePack(conditionId);
  return {
    episodeId: `dev03-provider-native-${conditionId.toLowerCase()}`,
    objective: 'Align existing cut boundaries to measured impacts and add one bounded visible shake at the final hit.',
    activeTarget: { taskId: 'DEV-03', conditionId },
    revisionBinding: { projectId: 'oe-dev-03', expectedProjectRevision: 'R11' },
    projectState: { projectId: 'oe-dev-03', projectRevision: 'R11' },
    evidence: pack.facts as readonly JsonRecord[],
    preservationRules: pack.preservationRequirements as readonly string[],
    authorityAndPolicy: { mutation: 'ISOLATED_CLONE_ONLY', network: 'PROVIDER_ONLY' },
    budget: { maxTurns: 8, maxOutputTokensPerTurn: 1024, maxIdenticalCalls: 1 },
  };
}

function baselineInvoke(repairFormIntent?: ShakeFormIntent) {
  const requests: SerializedProviderNativeTurnV2R[] = [];
  let currentRevision = 'R11';
  return vi.fn(async (request: SerializedProviderNativeTurnV2R) => {
    requests.push(request);
    const turn = requests.length;
    if (turn === 1) return response('project', 'read_project_file', {
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
    });
    if (turn === 2) return response('timeline', 'get_timeline_view', {
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
    });
    if (turn === 3) return response('audio', 'find_audio_moment', {
      projectId: 'oe-dev-03', query: 'strongest measured musical impacts',
    });
    if (turn === 4) return response('sync', 'sync_cuts_to_beats', {
      projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      overlayIds: timelineOverlayIds(request),
      beatPlan: output(request, 'audio').result,
      beatSyncConstraints: constraintFact('BASELINE').constraints,
      evidenceIds: ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'],
    });
    if (turn === 5) {
      const syncOutput = output(request, 'sync');
      const alignment = syncOutput.result as JsonRecord;
      currentRevision = String(record(syncOutput.receipt).projectRevision);
      return response('shake', 'apply_camera_shake', {
        projectId: 'oe-dev-03', expectedProjectRevision: currentRevision,
        overlayId: alignment.finalHitOverlayId,
        targetFrame: alignment.finalStrongPeakFrame,
        effectPlan: {
          goal: 'Apply one modest short-lived accent on the final selected impact.',
          formIntent: 'restrained-impact',
        },
      });
    }
    if (turn === 6) {
      currentRevision = String(record(output(request, 'shake').receipt).projectRevision);
      return finish('READY_FOR_PROOF');
    }
    if (turn === 7 && repairFormIntent !== undefined) {
      return response('repair-shake', 'apply_camera_shake', {
        projectId: 'oe-dev-03', expectedProjectRevision: currentRevision,
        overlayId: 'dev03-card-4', targetFrame: 479,
        effectPlan: {
          goal: 'Increase only the bounded final-hit shake enough to become visibly measurable.',
          formIntent: repairFormIntent,
        },
      });
    }
    return finish('READY_FOR_PROOF');
  });
}

type ShakeFormIntent = 'subtle-impact' | 'restrained-impact' | 'pronounced-impact';

function ownerReceiptFromTurn(turn: Readonly<JsonRecord> | undefined): JsonRecord {
  if (!turn) throw new Error('TEST_SHAKE_TURN_MISSING');
  const execution = record(turn.execution);
  const output = record(execution.output);
  return record(record(output.receipt).proof);
}

function receiptRevisionFromTurn(turn: Readonly<JsonRecord> | undefined): string {
  if (!turn) throw new Error('TEST_MUTATION_TURN_MISSING');
  const revision = record(record(turn.execution).output);
  const value = record(revision.receipt).projectRevision;
  if (typeof value !== 'string' || !value) throw new Error('TEST_MUTATION_REVISION_MISSING');
  return value;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}

function constraintFact(conditionId: Condition): JsonRecord {
  const found = (evidencePack(conditionId).facts as JsonRecord[])
    .find(({ kind }) => kind === 'BEAT_SYNC_CONSTRAINTS');
  if (!found) throw new Error('TEST_DEV03_CONSTRAINT_FACT_MISSING');
  return found;
}

function response(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: 'gpt-5.6-terra', status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) }],
  } };
}

function finish(
  disposition: 'READY_FOR_PROOF' | 'PASS' | 'FAIL' | 'UNVERIFIABLE' | 'CONFLICT',
) {
  return response(`finish-${disposition}`, 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds: [], summary: `Finished ${disposition}`,
  });
}

function output(request: SerializedProviderNativeTurnV2R, callId: string): JsonRecord {
  const history = request.body.input as JsonRecord[];
  const result = [...history].reverse().find((item) => (
    item.type === 'function_call_output' && item.call_id === callId
  ));
  if (!result) throw new Error(`TEST_TOOL_OUTPUT_MISSING:${callId}`);
  return (JSON.parse(String(result.output)) as JsonRecord).output as JsonRecord;
}

function timelineOverlayIds(request: SerializedProviderNativeTurnV2R): string[] {
  const timeline = output(request, 'timeline').result as JsonRecord;
  return (timeline.overlays as JsonRecord[])
    .filter(({ type }) => type === 'video' || type === 'image')
    .map(({ id }) => String(id));
}

function fakeRenderer(
  proofOrSequence: Dev03Stage6RenderProofV2 | readonly Dev03Stage6RenderProofV2[] = passingProof(),
): Dev03Stage6RendererV2 {
  let call = 0;
  return async ({ outputDir }) => {
    await mkdir(outputDir, { recursive: true });
    const artifactPaths = Object.fromEntries(await Promise.all(
      DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
        const artifactPath = path.join(outputDir, `${artifactId.toLowerCase()}.fixture`);
        await writeFile(artifactPath, `fixture-${artifactId}`);
        return [artifactId, artifactPath];
      }),
    )) as Record<typeof DEV03_STAGE6_ARTIFACT_IDS_V2[number], string>;
    const sequence = Array.isArray(proofOrSequence) ? proofOrSequence : [proofOrSequence];
    const proof = sequence[Math.min(call, sequence.length - 1)] as Dev03Stage6RenderProofV2;
    call += 1;
    return { artifactPaths, proof };
  };
}

function passingProof(): Dev03Stage6RenderProofV2 {
  return {
    schemaVersion: DEV03_STAGE6_NATIVE_PROXY_V2,
    renderer: {
      root: 'components/editron/editor/version-7.0.0/remotion/index.ts',
      assembler: 'lib/editron/shared/render-request-payload.ts#buildLambdaRenderInputProps',
      visualConsumer: 'components/editron/editor/version-7.0.0/components/core/layer.tsx',
      audioConsumer: 'components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx',
    },
    composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1, durationInFrames: 600 },
    sourceBindings: { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' },
    video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1', decodedFrameCount: 600, durationSeconds: 20, audioStreamCount: 1 },
    visual: {
      boundarySamples: [
        { frame: 118, rgb: [33, 82, 145] }, { frame: 119, rgb: [111, 54, 124] },
        { frame: 238, rgb: [111, 54, 124] }, { frame: 239, rgb: [33, 82, 145] },
        { frame: 478, rgb: [111, 54, 124] }, { frame: 479, rgb: [151, 72, 48] },
      ],
      boundaryMeanAbsDiffs: [45, 45, 45], shakeActiveFrame: 480, shakeNeutralFrame: 490,
      shakeActiveMeanAbsDiff: 2, shakeNeutralMeanAbsDiff: 0,
    },
    audio: {
      sampleRateHz: 48_000, sourceChannels: 1, baselineChannels: 2, renderedChannels: 2,
      sourceSampleFrames: 960_000, baselineSampleFrames: 960_000, renderedSampleFrames: 960_000,
      protectedStartFrame: 250, protectedEndFrame: 350,
      sourceProtectedRms: 0.1, baselineProtectedRms: 0.07071, renderedProtectedRms: 0.07071,
      sourceToRenderedGainRatio: 0.7071, sourceToRenderedCorrelation: 1,
      baselineToRenderedGainRatio: 1, baselineToRenderedCorrelation: 1, renderedPeak: 0.7,
    },
    browserErrors: [],
    externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0, projectServiceCalls: 0, databaseCalls: 0 },
  };
}
