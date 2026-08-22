import { describe, expect, it, vi } from 'vitest';

import {
  buildOpaqueResultReferenceToolSetV2R,
  buildProviderNativeResultReferenceProjectionPolicyV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import {
  runProviderNativeToolEpisodeV2R,
  type ProviderNativeEpisodeContextV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r';
import { buildProviderNativeToolSetV2R } from '@/lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

const ROUTE: ProviderNativeRouteV2R = {
  routeId: 'OPENAI_TERRA',
  provider: 'openai',
  model: 'gpt-5.6-terra',
  claimedModelIdentity: 'gpt-5.6-terra',
  reasoningMode: 'medium',
};

const CONTEXT: ProviderNativeEpisodeContextV2R = {
  episodeId: 'episode-result-reference-1',
  objective: 'Measure real beat evidence and bind that exact result into cut alignment.',
  activeTarget: { taskId: 'DEV-03', requirement: 'align cuts to measured beats' },
  revisionBinding: { projectId: 'project-1', expectedProjectRevision: 'revision-7' },
  projectState: { projectId: 'project-1', projectRevision: 'revision-7' },
  evidence: [{ evidenceId: 'ev-beats-1', kind: 'MEASURED_BEAT_EVIDENCE' }],
  preservationRules: ['Do not invent or transcribe a measured beat plan.'],
  authorityAndPolicy: {
    mutation: 'ISOLATED_CLONE_ONLY',
    network: 'PROVIDER_ONLY',
    completeCapabilityDossier: {
      plannerRecordSupplements: [
        {
          selectableOperatorId: 'sync_cuts_to_beats',
          inputOrigins: { beatPlan: [{
            origin: 'OPERATOR_OUTPUT', operatorId: 'find_audio_moment', outputField: 'result',
          }] },
        },
        {
          selectableOperatorId: 'apply_camera_shake',
          inputOrigins: {
            overlayId: [{
              origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
              outputField: 'result.finalHitOverlayId',
            }],
            targetFrame: [{
              origin: 'OPERATOR_OUTPUT', operatorId: 'sync_cuts_to_beats',
              outputField: 'result.finalStrongPeakFrame',
            }],
          },
        },
      ],
    },
  },
  budget: { maxTurns: 3, maxOutputTokensPerTurn: 512, maxIdenticalCalls: 1 },
};

const BEAT_PLAN = {
  schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1',
  assetId: 'music-1',
  measuredEvidenceReceiptHash: 'a'.repeat(64),
  strongPeakFrames: [119, 239, 359, 479],
  finalStrongPeakFrame: 479,
};

const BEAT_SYNC_CONSTRAINTS = {
  maxSnapFrames: 8,
  minClipFrames: 20,
  maxConsecutiveBeatCuts: 4,
  protectedAudioRange: { startFrame: 0, endFrame: 90 },
  protectedBoundaryToleranceFrames: 3,
  sourceDurationFramesByAssetId: { 'asset-1': 600 },
  requireSourceHandles: true,
};

describe('V2R provider-native opaque result references', () => {
  it('augments only provider-call schemas while preserving exact operator authority', () => {
    const exact = buildProviderNativeToolSetV2R([
      'find_audio_moment', 'sync_cuts_to_beats',
    ]);
    const referenced = buildOpaqueResultReferenceToolSetV2R(exact);
    const exactSync = exact.operators.find(({ operatorId }) => operatorId === 'sync_cuts_to_beats');
    const referencedSync = referenced.operators.find(
      ({ operatorId }) => operatorId === 'sync_cuts_to_beats',
    );

    expect(referenced.toolSetSha256).not.toBe(exact.toolSetSha256);
    expect(referencedSync?.exactInputSchema).toEqual(exactSync?.exactInputSchema);
    expect(referencedSync?.providerInputSchema).toMatchObject({
      required: [],
      properties: {
        argumentReferences: {
          type: 'array', minItems: 0, maxItems: 16,
        },
      },
      additionalProperties: false,
    });
    expect(referencedSync?.openAiStrict).toBe(false);
    expect(exactSync?.providerInputSchema).not.toHaveProperty(
      'properties.argumentReferences',
    );
  });

  it('normalizes an empty optional reference list to no dependency', async () => {
    let turn = 0;
    const executeIsolated = vi.fn(async () => execution({
      result: BEAT_PLAN,
      evidence: { evidenceId: 'ev-beats-1' },
    }));
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: { ...CONTEXT, episodeId: 'episode-empty-reference-list', budget: {
        ...CONTEXT.budget, maxTurns: 2,
      } },
      eligibleOperatorIds: ['find_audio_moment'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async () => {
        turn += 1;
        return turn === 1
          ? response('audio-empty', 'find_audio_moment', {
              projectId: 'project-1', query: 'measured strong music impacts',
              argumentReferences: [],
            })
          : finish('READY_FOR_PROOF');
      },
      executeIsolated,
    });

    expect(executeIsolated).toHaveBeenCalledTimes(1);
    expect(receipt.turns[0]).toMatchObject({
      normalizedArguments: {
        projectId: 'project-1', query: 'measured strong music impacts',
      },
      argumentReferenceBindings: [],
      execution: { disposition: 'OK' },
    });
    expect(receipt.turns[0].diagnostics ?? []).toEqual([]);
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
  });

  it('rejects unsafe and unbounded declared projection policies', () => {
    const contextWith = (outputFields: readonly string[]) => ({
      authorityAndPolicy: { completeCapabilityDossier: { plannerRecordSupplements: [{
        inputOrigins: { target: outputFields.map((outputField) => ({
          origin: 'OPERATOR_OUTPUT', operatorId: 'source', outputField,
        })) },
      }] } },
    });
    expect(() => buildProviderNativeResultReferenceProjectionPolicyV2R(
      contextWith(['result.__proto__.secret']),
    )).toThrow('PROVIDER_NATIVE_RESULT_REFERENCE_PROJECTION_INVALID');
    expect(() => buildProviderNativeResultReferenceProjectionPolicyV2R(
      contextWith(Array.from({ length: 65 }, (_, index) => `result.field${index}`)),
    )).toThrow('PROVIDER_NATIVE_RESULT_REFERENCE_PROJECTION_LIMIT_EXCEEDED');
  });

  it('resolves a prior exact result before schema validation and isolated execution', async () => {
    const requests: SerializedProviderNativeTurnV2R[] = [];
    const executeIsolated = vi.fn(async (call: Readonly<{
      operatorId: string;
      arguments: Readonly<JsonRecord>;
    }>) => {
      if (call.operatorId === 'find_audio_moment') {
        return execution({ result: BEAT_PLAN, evidence: { evidenceId: 'ev-beats-1' } });
      }
      expect(call.operatorId).toBe('sync_cuts_to_beats');
      expect(call.arguments.beatPlan).toEqual(BEAT_PLAN);
      return execution({
        receipt: { status: 'PASS', projectRevision: 'revision-7' },
        result: { alignedBoundaries: [119, 239, 359, 479] },
      });
    });
    const invoke = async (request: SerializedProviderNativeTurnV2R) => {
      requests.push(request);
      if (requests.length === 1) {
        return response('audio-1', 'find_audio_moment', {
          projectId: 'project-1', query: 'measured strong music impacts',
        });
      }
      if (requests.length === 2) {
        expect(JSON.stringify(request.body)).not.toContain('"assetId":"music-1"');
        const resultReferenceId = outputReferenceId(request, 'audio-1', 'result');
        return response('sync-1', 'sync_cuts_to_beats', {
          projectId: 'project-1',
          expectedProjectRevision: 'revision-7',
          overlayIds: ['overlay-1'],
          beatSyncConstraints: BEAT_SYNC_CONSTRAINTS,
          evidenceIds: ['ev-beats-1'],
          argumentReferences: [{ targetField: 'beatPlan', resultReferenceId }],
        });
      }
      return finish('READY_FOR_PROOF');
    };

    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ['find_audio_moment', 'sync_cuts_to_beats'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke,
      executeIsolated,
    });

    expect(executeIsolated).toHaveBeenCalledTimes(2);
    expect(receipt).toMatchObject({
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      selectedOperatorIds: ['find_audio_moment', 'sync_cuts_to_beats'],
      terminal: { disposition: 'READY_FOR_PROOF' },
      stateEffects: [],
    });
    expect(receipt.turns[0].issuedResultReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resultReferenceId: 'result_t1_1',
        sourceOperatorId: 'find_audio_moment',
        sourceOutputField: 'result',
        sourceOutputPath: ['result'],
        valueSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]));
    expect(receipt.turns[1].argumentReferenceBindings).toEqual([
      expect.objectContaining({
        targetField: 'beatPlan',
        resultReferenceId: 'result_t1_1',
        sourceOutputField: 'result',
        sourceOutputPath: ['result'],
      }),
    ]);
  });

  it('binds declared nested scalars while withholding their raw values', async () => {
    const requests: SerializedProviderNativeTurnV2R[] = [];
    const executeIsolated = vi.fn(async (call: Readonly<{
      operatorId: string;
      arguments: Readonly<JsonRecord>;
    }>) => {
      if (call.operatorId === 'find_audio_moment') {
        return execution({ result: BEAT_PLAN, evidence: { evidenceId: 'ev-beats-1' } });
      }
      if (call.operatorId === 'sync_cuts_to_beats') {
        return execution({
          receipt: { status: 'PASS', projectRevision: 'revision-7' },
          result: { finalHitOverlayId: 'dev03-card-4', finalStrongPeakFrame: 479 },
        });
      }
      expect(call.operatorId).toBe('apply_camera_shake');
      expect(call.arguments).toMatchObject({
        overlayId: 'dev03-card-4', targetFrame: 479,
      });
      return execution({ receipt: { status: 'PASS', projectRevision: 'revision-7' } });
    });
    const invoke = async (request: SerializedProviderNativeTurnV2R) => {
      requests.push(request);
      if (requests.length === 1) return response('audio-1', 'find_audio_moment', {
        projectId: 'project-1', query: 'measured strong music impacts',
      });
      if (requests.length === 2) return response('sync-1', 'sync_cuts_to_beats', {
        projectId: 'project-1', expectedProjectRevision: 'revision-7',
        overlayIds: ['overlay-1'], beatSyncConstraints: BEAT_SYNC_CONSTRAINTS,
        evidenceIds: ['ev-beats-1'], argumentReferences: [{
          targetField: 'beatPlan',
          resultReferenceId: outputReferenceId(request, 'audio-1', 'result'),
        }],
      });
      if (requests.length === 3) {
        const modelInput = JSON.stringify(request.body);
        expect(modelInput).not.toContain('dev03-card-4');
        expect(modelInput).not.toContain('"finalStrongPeakFrame":479');
        return response('shake-1', 'apply_camera_shake', {
          projectId: 'project-1', expectedProjectRevision: 'revision-7',
          effectPlan: { goal: 'Accentuate the final impact.', formIntent: 'restrained-impact' },
          argumentReferences: [
            {
              targetField: 'overlayId',
              resultReferenceId: outputReferenceId(
                request, 'sync-1', 'result.finalHitOverlayId',
              ),
            },
            {
              targetField: 'targetFrame',
              resultReferenceId: outputReferenceId(
                request, 'sync-1', 'result.finalStrongPeakFrame',
              ),
            },
          ],
        });
      }
      return finish('READY_FOR_PROOF');
    };

    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: { ...CONTEXT, episodeId: 'episode-result-reference-nested', budget: {
        ...CONTEXT.budget, maxTurns: 4,
      } },
      eligibleOperatorIds: [
        'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
      ],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke,
      executeIsolated,
    });

    expect(receipt.selectedOperatorIds).toEqual([
      'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake',
    ]);
    expect(receipt.turns[2].argumentReferenceBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetField: 'overlayId', sourceOutputField: 'result.finalHitOverlayId',
      }),
      expect.objectContaining({
        targetField: 'targetFrame', sourceOutputField: 'result.finalStrongPeakFrame',
      }),
    ]));
    expect(receipt.terminal.disposition).toBe('READY_FOR_PROOF');
  });

  it('rejects forged references and direct-value overwrites before execution', async () => {
    let turn = 0;
    const executeIsolated = vi.fn(async () => execution({
      result: BEAT_PLAN,
      evidence: { evidenceId: 'ev-beats-1' },
    }));
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: CONTEXT,
      eligibleOperatorIds: ['find_audio_moment', 'sync_cuts_to_beats'],
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
      invoke: async () => {
        turn += 1;
        if (turn === 1) return response('audio-1', 'find_audio_moment', {
          projectId: 'project-1', query: 'measured strong music impacts',
        });
        if (turn === 2) return response('sync-1', 'sync_cuts_to_beats', {
          projectId: 'project-1', expectedProjectRevision: 'revision-7',
          overlayIds: ['overlay-1'], beatPlan: BEAT_PLAN,
          beatSyncConstraints: BEAT_SYNC_CONSTRAINTS, evidenceIds: ['ev-beats-1'],
          argumentReferences: [
            { targetField: 'beatPlan', resultReferenceId: 'result_t99_1' },
          ],
        });
        return finish('UNVERIFIABLE');
      },
      executeIsolated,
    });

    expect(executeIsolated).toHaveBeenCalledTimes(1);
    expect(receipt.terminal.disposition).toBe('UNVERIFIABLE');
    expect(receipt.turns[1].diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('cannot override a directly supplied argument'),
    ]));
  });

  it('keeps direct mode as the default and rejects the reference-only field', async () => {
    let turn = 0;
    const executeIsolated = vi.fn();
    const receipt = await runProviderNativeToolEpisodeV2R({
      route: ROUTE,
      context: { ...CONTEXT, episodeId: 'episode-direct-mode-1', budget: {
        ...CONTEXT.budget, maxTurns: 2,
      } },
      eligibleOperatorIds: ['find_audio_moment'],
      invoke: async () => {
        turn += 1;
        return turn === 1
          ? response('audio-1', 'find_audio_moment', {
              projectId: 'project-1', query: 'measured strong music impacts',
              argumentReferences: [
                { targetField: 'query', resultReferenceId: 'result_t1_1' },
              ],
            })
          : finish('UNVERIFIABLE');
      },
      executeIsolated,
    });

    expect(receipt.argumentHandoffMode).toBe('DIRECT_ARGUMENTS');
    expect(receipt.turns[0].diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('argumentReferences:ADDITIONAL'),
    ]));
    expect(executeIsolated).not.toHaveBeenCalled();
  });
});

function execution(output: JsonRecord) {
  return {
    authority: 'RESEARCH_ISOLATED_NO_PROJECT_MUTATION' as const,
    disposition: 'OK' as const,
    output,
    evidenceIds: ['ev-beats-1'],
  };
}

function response(callId: string, name: string, args: JsonRecord) {
  return { status: 200, body: {
    id: `response-${callId}`,
    model: 'gpt-5.6-terra',
    status: 'completed',
    output: [{
      type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args),
    }],
  } };
}

function finish(disposition: 'READY_FOR_PROOF' | 'UNVERIFIABLE') {
  return response(`finish-${disposition}`, 'finish_editron_research_episode', {
    disposition,
    reasonCodes: [`MODEL_${disposition}`],
    evidenceIds: [],
    summary: `Finished ${disposition}`,
  });
}

function outputReferenceId(
  request: SerializedProviderNativeTurnV2R,
  callId: string,
  sourceOutputField: string,
): string {
  const history = request.body.input as JsonRecord[];
  const result = [...history].reverse().find((item) => (
    item.type === 'function_call_output' && item.call_id === callId
  ));
  if (!result) throw new Error(`TEST_TOOL_OUTPUT_MISSING:${callId}`);
  const parsed = JSON.parse(String(result.output)) as JsonRecord;
  const references = parsed.resultReferences as JsonRecord[];
  const reference = references.find((candidate) => (
    candidate.sourceOutputField === sourceOutputField
  ));
  if (typeof reference?.resultReferenceId !== 'string') {
    throw new Error(`TEST_RESULT_REFERENCE_MISSING:${sourceOutputField}`);
  }
  return reference.resultReferenceId;
}
