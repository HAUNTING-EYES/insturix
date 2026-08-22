import { describe, expect, it } from 'vitest';

import {
  runProviderNativeToolEpisodeV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  buildStage25ProviderDependencyContextV1,
  buildStage25ProviderDependencyToolSetV1,
  buildStage25ProviderDependencyTraceV1,
  evaluateStage25ProviderDependencyHoldoutV1,
  STAGE25_PROVIDER_DEPENDENCY_ELIGIBLE_OPERATOR_IDS_V1,
  STAGE25_PROVIDER_DEPENDENCY_PRESENTATION_ORDER_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-holdout-v1';
import {
  Stage25ProviderDependencyOwnerV1,
  STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-provider-dependency-owner-v1';
import { projectProviderTraceForStage25ScheduleV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-provider-trace-schedule-binding-v1';

type JsonRecord = Record<string, unknown>;

const ROUTE = {
  routeId: 'OPENAI_TERRA', provider: 'openai',
  model: 'gpt-5.6-terra', claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium',
} as const;

describe('Stage 2.5 non-leading provider dependency holdout', () => {
  it('exposes all 40 directory records but withholds exact owner evidence', () => {
    const context = buildStage25ProviderDependencyContextV1();
    const dossier = record(context.authorityAndPolicy.completeCapabilityDossier);
    const directory = records(dossier.completeDirectory);
    const serialized = JSON.stringify(context);
    expect(directory).toHaveLength(40);
    expect(new Set(directory.map(({ operatorId }) => operatorId)).size).toBe(40);
    expect(dossier.exactEligibleOperatorIds).toEqual(
      STAGE25_PROVIDER_DEPENDENCY_ELIGIBLE_OPERATOR_IDS_V1,
    );
    expect(serialized).not.toContain('"strongPeakFrames"');
    expect(serialized).not.toContain('"targetFrame":660');
    expect(serialized).not.toContain('"overlayId":42');
  });

  it('accepts only exact deterministic presentation permutations', () => {
    expect(buildStage25ProviderDependencyToolSetV1([
      'sync_cuts_to_beats', 'set_keyframes', 'resolve_keyframe_edit',
      'find_visual_moment', 'find_audio_moment', 'apply_filter',
    ]).operatorIds).toEqual([
      'sync_cuts_to_beats', 'set_keyframes', 'resolve_keyframe_edit',
      'find_visual_moment', 'find_audio_moment', 'apply_filter',
    ]);
    expect(() => buildStage25ProviderDependencyToolSetV1([
      'apply_filter', 'apply_filter', 'find_visual_moment',
      'find_audio_moment', 'resolve_keyframe_edit', 'sync_cuts_to_beats',
    ])).toThrow('PRESENTATION_ORDER_NOT_EXACT_OPERATOR_PERMUTATION');
  });

  it('runs the real opaque-reference loop and preserves the fork/join graph', async () => {
    const context = buildStage25ProviderDependencyContextV1();
    const toolSet = buildStage25ProviderDependencyToolSetV1();
    const owner = new Stage25ProviderDependencyOwnerV1();
    const requests: SerializedProviderNativeTurnV2R[] = [];
    const episode = await runProviderNativeToolEpisodeV2R({
      route: ROUTE, context,
      eligibleOperatorIds: STAGE25_PROVIDER_DEPENDENCY_PRESENTATION_ORDER_V1,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: scriptedInvoke(requests),
      executeIsolated: (call) => owner.execute(call),
    });
    const trace = buildStage25ProviderDependencyTraceV1({
      providerEpisode: episode, context,
    });
    const evaluation = evaluateStage25ProviderDependencyHoldoutV1({
      providerEpisode: episode, context, trace, ownerSnapshot: owner.snapshot(),
    });
    const projection = projectProviderTraceForStage25ScheduleV1({
      taskId: 'HOLD-FORK-JOIN-01', providerEpisode: episode,
      selectedOperationTrace: trace, episodeContext: context, toolSet,
    });

    expect(episode).toMatchObject({
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      selectedOperatorIds: [
        'find_visual_moment', 'find_audio_moment', 'sync_cuts_to_beats',
        'resolve_keyframe_edit', 'set_keyframes', 'apply_filter',
      ],
      terminal: { disposition: 'READY_FOR_PROOF' }, stateEffects: [],
    });
    expect(trace).toMatchObject({ assessment: 'PASS', diagnostics: [], stateEffects: [] });
    expect(evaluation).toMatchObject({ assessment: 'PASS', diagnostics: [], stateEffects: [] });
    expect(projection.receipt).toMatchObject({ zeroAdd: true, zeroDrop: true });
    expect(requires(projection.compiledGraph, 'compile-turn-3')).toEqual([
      'compile-turn-2',
    ]);
    expect(requires(projection.compiledGraph, 'compile-turn-4')).toEqual([
      'compile-turn-3', 'compile-turn-1',
    ]);
    expect(requires(projection.compiledGraph, 'compile-turn-5')).toEqual([
      'compile-turn-3', 'compile-turn-4',
    ]);
    expect(requires(projection.compiledGraph, 'compile-turn-6')).toEqual([
      'compile-turn-5', 'compile-turn-4',
    ]);
  });

  it('fails closed on stale revisions and fabricated owner inputs', async () => {
    const stale = new Stage25ProviderDependencyOwnerV1();
    const staleResult = await stale.execute({
      turn: 1, operatorId: 'sync_cuts_to_beats', arguments: {
        projectId: 'project-42', expectedProjectRevision: 'R41',
        overlayIds: [1, 2, 3], beatPlan: {},
        beatSyncConstraints: STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
        evidenceIds: ['EV-A'],
      },
    });
    expect(staleResult).toMatchObject({
      disposition: 'CONFLICT', output: { code: 'REVISION_CONFLICT' },
    });

    const forged = new Stage25ProviderDependencyOwnerV1();
    const forgedResult = await forged.execute({
      turn: 1, operatorId: 'sync_cuts_to_beats', arguments: {
        projectId: 'project-42', expectedProjectRevision: 'R42',
        overlayIds: [1, 2, 3], beatPlan: {
          schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1', assetId: 'forged',
          measuredEvidenceReceiptHash: 'f'.repeat(64),
          strongPeakFrames: [120, 240], finalStrongPeakFrame: 240,
        }, beatSyncConstraints: STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
        evidenceIds: ['EV-A'],
      },
    });
    expect(forgedResult).toMatchObject({
      disposition: 'FAIL', output: { code: 'SYNC_CAUSAL_INPUT_INVALID' },
    });
    expect(stale.snapshot().beforeStateHash).toBe(stale.snapshot().afterStateHash);
    expect(forged.snapshot().beforeStateHash).toBe(forged.snapshot().afterStateHash);
  });
});

function scriptedInvoke(requests: SerializedProviderNativeTurnV2R[]) {
  return async (request: SerializedProviderNativeTurnV2R) => {
    requests.push(request);
    const turn = requests.length;
    if (turn === 1) return response('visual', 'find_visual_moment', {
      projectId: 'project-42', query: 'verified product reveal moment',
    });
    if (turn === 2) return response('audio', 'find_audio_moment', {
      projectId: 'project-42', query: 'measured strong music impacts',
      assetIds: ['music-1'], targetRange: { startFrame: 0, endFrame: 360 },
    });
    if (turn === 3) return response('sync', 'sync_cuts_to_beats', {
      projectId: 'project-42', expectedProjectRevision: 'R42',
      overlayIds: [1, 2, 3],
      beatSyncConstraints: STAGE25_DEPENDENCY_BEAT_CONSTRAINTS_V1,
      evidenceIds: ['EV-A'], argumentReferences: [{
        targetField: 'beatPlan',
        resultReferenceId: outputReferenceId(request, 'audio', 'result'),
      }],
    });
    if (turn === 4) return response('resolve', 'resolve_keyframe_edit', {
      projectId: 'project-42', intent: {
        direction: 'in', durationFrames: 24, scaleDelta: 0.1,
        replaceExistingScaleKeyframes: false,
      }, evidenceIds: ['EV-V'], argumentReferences: [
        ref(request, 'sync', 'receipt.projectRevision', 'expectedProjectRevision'),
        ref(request, 'visual', 'overlayId', 'overlayId'),
        ref(request, 'visual', 'targetFrame', 'targetFrame'),
        ref(request, 'visual', 'focalPoint', 'focalPoint'),
        ref(request, 'visual', 'evidenceStrength', 'evidenceStrength'),
      ],
    });
    if (turn === 5) return response('keyframes', 'set_keyframes', {
      projectId: 'project-42', evidenceIds: ['EV-V'], argumentReferences: [
        ref(request, 'sync', 'receipt.projectRevision', 'expectedProjectRevision'),
        ref(request, 'resolve', 'proposedOperation.arguments.overlayId', 'overlayId'),
        ref(request, 'resolve', 'proposedOperation.arguments.keyframes', 'keyframes'),
        ref(request, 'resolve', 'proposedOperation.arguments.focalPoint', 'focalPoint'),
      ],
    });
    if (turn === 6) return response('filter', 'apply_filter', {
      projectId: 'project-42', targetRange: { startFrame: 600, endFrame: 720 },
      effectPlan: { filterIntent: 'warmer', strength: 'restrained' },
      argumentReferences: [
        ref(request, 'keyframes', 'receipt.projectRevision', 'expectedProjectRevision'),
        ref(request, 'resolve', 'proposedOperation.arguments.overlayId', 'overlayId'),
      ],
    });
    return response('finish', 'finish_editron_research_episode', {
      disposition: 'READY_FOR_PROOF', reasonCodes: ['ISOLATED_EDITS_COMPLETE'],
      evidenceIds: ['EV-A', 'EV-V'], summary: 'Ready for bounded render proof.',
    });
  };
}

function response(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`, model: 'gpt-5.6-terra', status: 'completed',
    output: [{ type: 'function_call', call_id: callId, name,
      arguments: JSON.stringify(args) }],
  } };
}
function ref(request: SerializedProviderNativeTurnV2R, callId: string, source: string, targetField: string) {
  return { targetField, resultReferenceId: outputReferenceId(request, callId, source) };
}
function outputReferenceId(request: SerializedProviderNativeTurnV2R, callId: string, source: string): string {
  const history = request.body.input as JsonRecord[];
  const item = [...history].reverse().find((candidate) => (
    candidate.type === 'function_call_output' && candidate.call_id === callId
  ));
  if (!item) throw new Error(`TEST_OUTPUT_MISSING:${callId}`);
  const envelope = JSON.parse(String(item.output)) as JsonRecord;
  const reference = records(envelope.resultReferences)
    .find(({ sourceOutputField }) => sourceOutputField === source);
  if (typeof reference?.resultReferenceId !== 'string') {
    throw new Error(`TEST_REFERENCE_MISSING:${callId}:${source}`);
  }
  return reference.resultReferenceId;
}
function requires(graph: JsonRecord, nodeId: string): unknown {
  return records(graph.nodes).find((node) => node.nodeId === nodeId)?.requires;
}
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
