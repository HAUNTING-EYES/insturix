import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { deepFreezeV1, hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildCanonicalDev03MeasuredEvidenceV2 }
  from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  DEV03_STAGE6_ARTIFACT_IDS_V2,
  DEV03_STAGE6_NATIVE_PROXY_V2,
  type Dev03Stage6RenderProofV2,
  type Dev03Stage6RendererV2,
} from '@/lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-contract-v2';
import {
  assertProviderNativeHandoffOrderManifestV3R,
  buildProviderNativeHandoffOrderManifestV3R,
  evaluateProviderNativeHandoffOrderEpisodeV3R,
  PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R,
  type ProviderNativeHandoffOrderManifestV3R,
} from '@/lib/editron/research/open-ended-planner/provider-native-handoff-order-experiment-v3r';
import {
  preflightProviderNativeHandoffOrderV3R,
  runProviderNativeHandoffOrderExperimentV3R,
  type ProviderNativeHandoffOrderTransportV3R,
} from '@/lib/editron/research/open-ended-planner/provider-native-handoff-order-runner-v3r';
import type { ProviderNativeArgumentHandoffModeV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-result-references-v2r';
import type { SerializedProviderNativeTurnV2R }
  from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import { buildV2RBenchmarkTaskRegistryV2 }
  from '@/lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

type JsonRecord = Record<string, unknown>;

const roots: string[] = [];
let manifest: Readonly<ProviderNativeHandoffOrderManifestV3R>;
let evaluatorSourceSha256: string;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes, evaluatorSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
    readFile(PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R),
  ]);
  evaluatorSourceSha256 = createHash('sha256').update(evaluatorSourceBytes).digest('hex');
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes, analyzerSourceBytes,
  });
  manifest = buildProviderNativeHandoffOrderManifestV3R(
    buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured }),
    evaluatorSourceSha256,
  );
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('provider-native DEV-03 handoff/order experiment V3R', () => {
  it('freezes private owner evidence, explicit prerequisites, and three tool permutations', () => {
    const ownerText = JSON.stringify(manifest.sourceCaseEntry.context);
    const modelText = JSON.stringify(manifest.modelContext);
    const measured = measuredFact();
    expect(ownerText).toContain(JSON.stringify(measured.strongPeakFrames));
    expect(modelText).not.toContain(JSON.stringify(measured.strongPeakFrames));
    expect(modelText).toContain('find_audio_moment.result');
    expect(modelText).toContain('sync_cuts_to_beats.receipt.projectRevision');
    expect(manifest.evidenceDeliveryMode).toBe('RESOLVER_HANDOFF_REQUIRED');
    expect(manifest.evaluatorSourcePath)
      .toBe(PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R);
    expect(manifest.evaluatorSourceSha256).toBe(evaluatorSourceSha256);
    expect(manifest.presentationPermutations).toHaveLength(3);
    expect(new Set(manifest.presentationPermutations.map((order) => order.join('|'))).size)
      .toBe(3);
    expect(manifest.routes.map(({ route }) => route.model)).toEqual([
      'gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.7-flash',
    ]);
    expect(manifest.cap2CurrentTruthBinding).toEqual({
      artifactType: 'EditronCapabilityCurrentTruthReissueAuditV3',
      manifestSha256: '180e5699ee939b9514dfc50b41513361c525fb7a0b433bda4226b466553cbf2a',
      normalizedSourceSnapshotSha256:
        'f9d7ed86323aa83605e491bb5d240235f4c228036fc69b9b9ade686e4b9b6655',
      sourceCommit: '67f2eb48b8888550632c79b9f1133b2d85f8630d',
      runtimeAuthorityDenied: true,
    });
    expect(manifest.stateEffects).toEqual([]);
  });

  it('rejects a rehashed model-context leak and keeps first choice separate from recovery', () => {
    const { manifestSha256: _manifestSha256, ...material } = clone(manifest);
    const tamperedMaterial = {
      ...material,
      modelContext: material.sourceCaseEntry.context,
    };
    expect(() => assertProviderNativeHandoffOrderManifestV3R(deepFreezeV1({
      ...tamperedMaterial,
      manifestSha256: hashCanonicalJsonV1(tamperedMaterial),
    }))).toThrow('PROVIDER_NATIVE_HANDOFF_ORDER_V3_MANIFEST_DRIFT');

    const capDrift = clone(manifest) as any;
    capDrift.cap2CurrentTruthBinding.manifestSha256 = '0'.repeat(64);
    const { manifestSha256: _oldCapHash, ...capDriftMaterial } = capDrift;
    capDrift.manifestSha256 = hashCanonicalJsonV1(capDriftMaterial);
    expect(() => assertProviderNativeHandoffOrderManifestV3R(capDrift))
      .toThrow('PROVIDER_NATIVE_HANDOFF_ORDER_V3_MANIFEST_DRIFT');

    const evaluation = evaluateProviderNativeHandoffOrderEpisodeV3R({
      providerEpisode: { turns: [
        turn('sync_cuts_to_beats', 'FAIL'),
        turn('find_audio_moment'),
        turn('sync_cuts_to_beats', 'OK', [{
          targetField: 'beatPlan', sourceOperatorId: 'find_audio_moment',
          sourceOutputField: 'result', resultReferenceId: 'result_t2_2',
        }]),
        turn('apply_camera_shake', 'OK', [
          {
            targetField: 'overlayId', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'result.finalHitOverlayId', resultReferenceId: 'result_t4_1',
          },
          {
            targetField: 'targetFrame', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'result.finalStrongPeakFrame', resultReferenceId: 'result_t4_2',
          },
          {
            targetField: 'expectedProjectRevision', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'receipt.projectRevision', resultReferenceId: 'result_t4_3',
          },
        ]),
      ] },
      productOutcome: 'PASS', stateEffects: [],
    }, 'OPAQUE_RESULT_REFERENCES', manifest.requiredCausalOrder);
    expect(evaluation).toMatchObject({
      assessment: 'PASS',
      firstRelevantChoiceCorrect: false,
      prematureDependentAttempt: true,
      prematureDependentAttemptSafelyRejected: true,
      recoveredAfterPrematureAttempt: true,
      eventualCausalExecutionPass: true,
      writerRevisionHandoffPass: true,
    });

    const copiedLiteralRecovery = evaluateProviderNativeHandoffOrderEpisodeV3R({
      providerEpisode: { turns: [
        turn('find_audio_moment'),
        turn('sync_cuts_to_beats', 'OK', [{
          targetField: 'beatPlan', sourceOperatorId: 'find_audio_moment',
          sourceOutputField: 'result', resultReferenceId: 'result_t1_1',
        }]),
        turn('apply_camera_shake', 'FAIL', [
          {
            targetField: 'overlayId', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'result.finalHitOverlayId', resultReferenceId: 'result_t2_1',
          },
          {
            targetField: 'targetFrame', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'result.finalStrongPeakFrame', resultReferenceId: 'result_t2_2',
          },
        ]),
        turn('apply_camera_shake'),
      ] },
      productOutcome: 'PASS', stateEffects: [],
    }, 'OPAQUE_RESULT_REFERENCES', manifest.requiredCausalOrder);
    expect(copiedLiteralRecovery).toMatchObject({
      assessment: 'FAIL', resultHandoffPass: false,
      reasonCodes: ['RESULT_HANDOFF_FAILED', 'WRITER_REVISION_HANDOFF_FAILED'],
    });
  });

  it('independently rejects missing, stale, forged, and opaque copied revisions', () => {
    const direct = (revision: string | null) => evaluateProviderNativeHandoffOrderEpisodeV3R({
      providerEpisode: { turns: [
        turn('find_audio_moment'),
        turn('sync_cuts_to_beats'),
        turn('apply_camera_shake', 'OK', [], revision),
      ] },
      productOutcome: 'PASS', stateEffects: [],
    }, 'DIRECT_ARGUMENTS', manifest.requiredCausalOrder);

    expect(direct(TEST_WRITER_REVISION)).toMatchObject({
      assessment: 'PASS', writerRevisionHandoffPass: true,
    });
    for (const revision of [null, 'R11', 'OE-DEV03-forged-revision']) {
      expect(direct(revision)).toMatchObject({
        assessment: 'FAIL', writerRevisionHandoffPass: false,
        reasonCodes: expect.arrayContaining(['WRITER_REVISION_HANDOFF_FAILED']),
      });
    }

    const copiedOpaque = evaluateProviderNativeHandoffOrderEpisodeV3R({
      providerEpisode: { turns: [
        turn('find_audio_moment'),
        turn('sync_cuts_to_beats', 'OK', [{
          targetField: 'beatPlan', sourceOperatorId: 'find_audio_moment',
          sourceOutputField: 'result', resultReferenceId: 'result_t1_1',
        }]),
        turn('apply_camera_shake', 'OK', [
          {
            targetField: 'overlayId', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'result.finalHitOverlayId', resultReferenceId: 'result_t2_1',
          },
          {
            targetField: 'targetFrame', sourceOperatorId: 'sync_cuts_to_beats',
            sourceOutputField: 'result.finalStrongPeakFrame', resultReferenceId: 'result_t2_2',
          },
        ], TEST_WRITER_REVISION),
      ] },
      productOutcome: 'PASS', stateEffects: [],
    }, 'OPAQUE_RESULT_REFERENCES', manifest.requiredCausalOrder);
    expect(copiedOpaque).toMatchObject({
      assessment: 'FAIL', resultHandoffPass: false,
      writerRevisionHandoffPass: false,
      reasonCodes: expect.arrayContaining([
        'RESULT_HANDOFF_FAILED', 'WRITER_REVISION_HANDOFF_FAILED',
      ]),
    });
  });

  it('preflights all route/arm/permutation requests without inference', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith(':countTokens')) {
        return new Response(JSON.stringify({ totalTokens: 1_000 }), { status: 200 });
      }
      const model = decodeURIComponent(url.split('/').at(-1) ?? '');
      return new Response(JSON.stringify(model.startsWith('gemini-')
        ? { name: `models/${model}` }
        : { id: model }), { status: 200 });
    }) as unknown as typeof fetch;
    const receipt = await preflightProviderNativeHandoffOrderV3R({
      manifest,
      environment: {
        OPENAI_API_KEY: 'openai-test',
        GOOGLE_GENERATIVE_AI_API_KEY: 'google-paid-test',
        GEMINI_API_KEY: 'google-free-test',
      },
      fetchImpl,
    });
    expect(receipt).toMatchObject({
      assessment: 'PASS_READY',
      googleCredentialSource: 'GOOGLE_GENERATIVE_AI_API_KEY',
      networkCalls: { modelMetadataGets: 3, googleCountTokensPosts: 6, inferenceCalls: 0 },
      secretsPersisted: false,
      stateEffects: [],
    });
    expect(records(receipt.checks)).toHaveLength(18);
    expect(urls.some((url) => url.endsWith('/interactions'))).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('google-paid-test');
  });

  it('executes all three fake providers and both handoff arms through real isolated proof', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'editron-v3-order-'));
    roots.push(parent);
    const initialRequests: SerializedProviderNativeTurnV2R[] = [];
    const receipt = await runProviderNativeHandoffOrderExperimentV3R({
      manifest,
      outputRoot: path.join(parent, 'experiment'),
      repetitions: 1,
      renderer: fakeRenderer(),
      createTransport: ({ route, arm }) => fakeTransport(route, arm, initialRequests),
    });
    expect(receipt).toMatchObject({
      firstChoiceCorrectCount: 6,
      eventualCausalExecutionCount: 6,
      resultHandoffPassCount: 6,
      writerRevisionHandoffPassCount: 6,
      renderedProductPassCount: 6,
      noProjectMutationCount: 6,
      safeOutcomePassCount: 6,
      failCount: 0,
      harnessErrorCount: 0,
      stateEffects: [],
    });
    expect(records(receipt.rows)).toHaveLength(6);
    const exactFrames = JSON.stringify(measuredFact().strongPeakFrames);
    expect(initialRequests).toHaveLength(6);
    expect(initialRequests.every((request) => !JSON.stringify(request.body).includes(exactFrames)))
      .toBe(true);
  });

  it('dispatches only explicit P2/P3 ordinals and binds the selection into the receipt', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'editron-v3-order-selection-'));
    roots.push(parent);
    const initialRequests: SerializedProviderNativeTurnV2R[] = [];
    const selections: JsonRecord[] = [];
    const receipt = await runProviderNativeHandoffOrderExperimentV3R({
      manifest,
      outputRoot: path.join(parent, 'experiment'),
      repetitionOrdinals: [2, 3],
      renderer: fakeRenderer(),
      createTransport: (selection) => {
        selections.push(selection);
        return fakeTransport(selection.route, selection.arm, initialRequests);
      },
    });
    expect(receipt).toMatchObject({
      repetitions: 2,
      repetitionOrdinals: [2, 3],
      firstChoiceCorrectCount: 12,
      safeOutcomePassCount: 12,
      failCount: 0,
      stateEffects: [],
    });
    const rows = records(receipt.rows);
    expect(rows).toHaveLength(12);
    expect([...new Set(rows.map(({ repetition }) => repetition))]).toEqual([2, 3]);
    expect(rows.some(({ rowId }) => String(rowId).endsWith('-p1'))).toBe(false);
    expect([...new Set(rows.map(({ presentationPermutationOrdinal }) => (
      presentationPermutationOrdinal
    )))]).toEqual([1, 2]);
    expect(selections).toHaveLength(12);
    expect(initialRequests).toHaveLength(12);
  });

  it('rejects ambiguous or invalid repetition selection before dispatch', async () => {
    const createTransport = vi.fn(() => {
      throw new Error('TEST_TRANSPORT_MUST_NOT_BE_CREATED');
    });
    await expect(runProviderNativeHandoffOrderExperimentV3R({
      manifest,
      outputRoot: path.join(os.tmpdir(), 'editron-v3-order-invalid-ambiguous'),
      repetitions: 1,
      repetitionOrdinals: [2],
      createTransport,
    })).rejects.toThrow(
      'PROVIDER_NATIVE_HANDOFF_ORDER_V3_REPETITION_SELECTION_AMBIGUOUS',
    );
    for (const repetitionOrdinals of [[], [2, 2], [3, 2], [0], [4]]) {
      await expect(runProviderNativeHandoffOrderExperimentV3R({
        manifest,
        outputRoot: path.join(os.tmpdir(), 'editron-v3-order-invalid-ordinals'),
        repetitionOrdinals,
        createTransport,
      })).rejects.toThrow(
        'PROVIDER_NATIVE_HANDOFF_ORDER_V3_REPETITION_ORDINALS_INVALID',
      );
    }
    expect(createTransport).not.toHaveBeenCalled();
  });
});

function fakeTransport(
  route: ProviderNativeHandoffOrderManifestV3R['routes'][number]['route'],
  arm: ProviderNativeArgumentHandoffModeV2R,
  initialRequests: SerializedProviderNativeTurnV2R[],
): ProviderNativeHandoffOrderTransportV3R {
  const requests: SerializedProviderNativeTurnV2R[] = [];
  return {
    invoke: async (request) => {
      if (requests.length === 0) initialRequests.push(request);
      requests.push(request);
      const turnNumber = requests.length;
      if (turnNumber === 1) return response(route, 'project', 'read_project_file', {
        projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      });
      if (turnNumber === 2) return response(route, 'timeline', 'get_timeline_view', {
        projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
      });
      if (turnNumber === 3) return response(route, 'audio', 'find_audio_moment', {
        projectId: 'oe-dev-03', query: 'strongest measured musical impacts',
      });
      if (turnNumber === 4) {
        const base = {
          projectId: 'oe-dev-03', expectedProjectRevision: 'R11',
          overlayIds: timelineOverlayIds(request),
          beatSyncConstraints: constraintFact().constraints,
          evidenceIds: ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'],
        };
        return response(route, 'sync', 'sync_cuts_to_beats', arm === 'DIRECT_ARGUMENTS'
          ? { ...base, beatPlan: output(request, 'audio').result }
          : { ...base, argumentReferences: [{
              targetField: 'beatPlan',
              resultReferenceId: outputReferenceId(request, 'audio', 'result'),
            }] });
      }
      if (turnNumber === 5) {
        const syncOutput = output(request, 'sync');
        const base = {
          projectId: 'oe-dev-03',
          effectPlan: {
            goal: 'Apply one modest short-lived accent on the final selected impact.',
            formIntent: 'restrained-impact',
          },
        };
        if (arm === 'DIRECT_ARGUMENTS') {
          const alignment = record(syncOutput.result);
          return response(route, 'shake', 'apply_camera_shake', {
            ...base,
            expectedProjectRevision: record(syncOutput.receipt).projectRevision,
            overlayId: alignment.finalHitOverlayId,
            targetFrame: alignment.finalStrongPeakFrame,
          });
        }
        return response(route, 'shake', 'apply_camera_shake', {
          ...base,
          argumentReferences: [
            {
              targetField: 'expectedProjectRevision',
              resultReferenceId: outputReferenceId(
                request, 'sync', 'receipt.projectRevision',
              ),
            },
            {
              targetField: 'overlayId',
              resultReferenceId: outputReferenceId(
                request, 'sync', 'result.finalHitOverlayId',
              ),
            },
            {
              targetField: 'targetFrame',
              resultReferenceId: outputReferenceId(
                request, 'sync', 'result.finalStrongPeakFrame',
              ),
            },
          ],
        });
      }
      return finish(route, 'READY_FOR_PROOF');
    },
    snapshot: () => deepFreezeV1({ authority: 'TEST_FAKE_PROVIDER', calls: requests.length }),
  };
}

function response(
  route: ProviderNativeHandoffOrderManifestV3R['routes'][number]['route'],
  callId: string, name: string, args: JsonRecord,
) {
  return route.provider === 'openai'
    ? { status: 200, body: { id: `response-${callId}`, model: route.model,
        status: 'completed', output: [{ type: 'function_call', call_id: callId,
          name, arguments: JSON.stringify(args) }] } }
    : { status: 200, body: { id: `interaction-${callId}`, model: route.model,
        status: 'completed', steps: [{ type: 'function_call', id: callId,
          name, arguments: args }] } };
}

function finish(
  route: ProviderNativeHandoffOrderManifestV3R['routes'][number]['route'],
  disposition: 'READY_FOR_PROOF',
) {
  return response(route, `finish-${disposition}`, 'finish_editron_research_episode', {
    disposition, reasonCodes: [`MODEL_${disposition}`], evidenceIds: [],
    summary: `Finished ${disposition}`,
  });
}

function output(request: SerializedProviderNativeTurnV2R, callId: string): JsonRecord {
  return record(toolEnvelope(request, callId).output);
}

function toolEnvelope(
  request: SerializedProviderNativeTurnV2R, callId: string,
): JsonRecord {
  const history = request.body.input as JsonRecord[];
  const item = [...history].reverse().find((entry) => entry.call_id === callId);
  if (!item) throw new Error(`TEST_TOOL_OUTPUT_MISSING:${callId}`);
  if (item.type === 'function_call_output') return JSON.parse(String(item.output)) as JsonRecord;
  const text = record((item.result as JsonRecord[])[0]).text;
  return JSON.parse(String(text)) as JsonRecord;
}

function outputReferenceId(
  request: SerializedProviderNativeTurnV2R, callId: string, outputField: string,
): string {
  const reference = records(toolEnvelope(request, callId).resultReferences)
    .find(({ sourceOutputField }) => sourceOutputField === outputField);
  if (typeof reference?.resultReferenceId !== 'string') {
    throw new Error(`TEST_RESULT_REFERENCE_MISSING:${outputField}`);
  }
  return reference.resultReferenceId;
}

function timelineOverlayIds(request: SerializedProviderNativeTurnV2R): string[] {
  return records(record(output(request, 'timeline').result).overlays)
    .filter(({ type }) => type === 'video' || type === 'image')
    .map(({ id }) => String(id));
}

function measuredFact(): JsonRecord {
  const fact = manifest.sourceCaseEntry.context.evidence.find(({ kind }) => (
    kind === 'HASH_BOUND_MEASURED_AUDIO'
  ));
  if (!fact) throw new Error('TEST_MEASURED_FACT_MISSING');
  return fact;
}

function constraintFact(): JsonRecord {
  const fact = manifest.modelContext.evidence.find(({ kind }) => kind === 'BEAT_SYNC_CONSTRAINTS');
  if (!fact) throw new Error('TEST_CONSTRAINT_FACT_MISSING');
  return fact;
}

function fakeRenderer(): Dev03Stage6RendererV2 {
  return async ({ outputDir }) => {
    await mkdir(outputDir, { recursive: true });
    const artifactPaths = Object.fromEntries(await Promise.all(
      DEV03_STAGE6_ARTIFACT_IDS_V2.map(async (artifactId) => {
        const artifactPath = path.join(outputDir, `${artifactId.toLowerCase()}.fixture`);
        await writeFile(artifactPath, `fixture-${artifactId}`);
        return [artifactId, artifactPath];
      }),
    )) as Record<typeof DEV03_STAGE6_ARTIFACT_IDS_V2[number], string>;
    return { artifactPaths, proof: passingProof() };
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
    composition: { width: 320, height: 180, fpsNumerator: 30, fpsDenominator: 1,
      durationInFrames: 600 },
    sourceBindings: { videoAssetId: 'dev03-cards', audioAssetId: 'dev03-beats' },
    video: { codec: 'h264', width: 320, height: 180, averageFrameRate: '30/1',
      decodedFrameCount: 600, durationSeconds: 20, audioStreamCount: 1 },
    visual: {
      boundarySamples: [
        { frame: 118, rgb: [33, 82, 145] }, { frame: 119, rgb: [111, 54, 124] },
        { frame: 238, rgb: [111, 54, 124] }, { frame: 239, rgb: [33, 82, 145] },
        { frame: 478, rgb: [111, 54, 124] }, { frame: 479, rgb: [151, 72, 48] },
      ],
      boundaryMeanAbsDiffs: [45, 45, 45], shakeActiveFrame: 480,
      shakeNeutralFrame: 490, shakeActiveMeanAbsDiff: 2, shakeNeutralMeanAbsDiff: 0,
    },
    audio: {
      sampleRateHz: 48_000, sourceChannels: 1, baselineChannels: 2, renderedChannels: 2,
      sourceSampleFrames: 960_000, baselineSampleFrames: 960_000,
      renderedSampleFrames: 960_000, protectedStartFrame: 250, protectedEndFrame: 350,
      sourceProtectedRms: 0.1, baselineProtectedRms: 0.07071, renderedProtectedRms: 0.07071,
      sourceToRenderedGainRatio: 0.7071, sourceToRenderedCorrelation: 1,
      baselineToRenderedGainRatio: 1, baselineToRenderedCorrelation: 1, renderedPeak: 0.7,
    },
    browserErrors: [],
    externalCalls: { providerApiCalls: 0, cloudRenderCalls: 0,
      projectServiceCalls: 0, databaseCalls: 0 },
  };
}

function turn(
  operatorId: string, disposition: 'OK' | 'FAIL' = 'OK',
  bindings: readonly JsonRecord[] = [],
  expectedProjectRevision: string | null = TEST_WRITER_REVISION,
): JsonRecord {
  const normalizedArguments = operatorId === 'sync_cuts_to_beats'
    ? { expectedProjectRevision: 'R11' }
    : operatorId === 'apply_camera_shake' && expectedProjectRevision !== null
      ? { expectedProjectRevision }
      : {};
  const output = operatorId === 'sync_cuts_to_beats' && disposition === 'OK'
    ? { receipt: { projectRevision: TEST_WRITER_REVISION } }
    : {};
  return { modelCall: { name: operatorId }, normalizedArguments,
    execution: { disposition, output }, argumentReferenceBindings: bindings };
}

const TEST_WRITER_REVISION = `OE-DEV03-${'a'.repeat(64)}`;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
