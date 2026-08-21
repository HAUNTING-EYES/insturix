import { createHash } from 'node:crypto';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalizeJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  assertReferenceHoldout01EvaluatorV2R,
  buildReferenceHoldout01EvaluatorV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-evaluator-v2r';
import {
  REFERENCE_OBSERVER_SUBMISSION_VERSION_V2R,
  validateReferenceObserverSubmissionV2R,
  type ReferenceObserverSubmissionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-observation-contract-v2r';
import {
  runProviderNativeReferenceObserverEpisodeV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-observer-episode-v2r';
import {
  REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256,
  REFERENCE_HOLDOUT_01_SOURCE_SHA256,
  assertReferenceHoldout01ManifestV2R,
  buildReferenceHoldout01ManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-v2r';
import {
  materializeReferenceHoldout01InputV2R,
  runReferenceHoldout01NoSpendPreflightV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-preflight-v2r';
import type {
  ProviderNativeRouteV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  buildProviderNativeInitialHistoryV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';
import {
  PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
  PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
  bindProviderNativeVideoReferenceInputV2R,
  type ProviderNativeVideoReferenceInputV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-video-reference-input-v2r';

describe('V2R held-out raw-reference task 01', () => {
  it('freezes provider-visible task truth separately from the evaluator-only rubric', () => {
    const manifest = assertReferenceHoldout01ManifestV2R(buildReferenceHoldout01ManifestV2R());
    const evaluator = assertReferenceHoldout01EvaluatorV2R(buildReferenceHoldout01EvaluatorV2R());
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(manifest.heldoutBasis).toMatchObject({
      sourceIntroducedBeforeBenchmark: true,
      priorBenchmarkSemanticLabelsFound: 0,
      priorProviderExposureUnderThisTaskId: 0,
    });
    expect(manifest.sourceMaterialization.samples).toHaveLength(14);
    expect(manifest.sourceMaterialization.expectedReferenceInputManifestSha256)
      .toBe(REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256);
    expect(manifest.providerVisibleTask).toMatchObject({
      taskKind: 'REFERENCE_OBSERVATION_ONLY',
      inputArm: 'ORDERED_TIMESTAMPED_IMAGES_WITHOUT_AUDIO',
    });
    const outputContract = manifest.providerVisibleTask.outputContract as Record<string, unknown>;
    expect(outputContract).toMatchObject({ type: 'object', additionalProperties: false });
    const providerVisible = canonicalizeJsonV1(manifest.providerVisibleTask);
    for (const sentinel of evaluator.leakageSentinels) expect(providerVisible).not.toContain(sentinel);
    expect(evaluator.reviewProtocol).toMatchObject({
      currentHumanReviewStatus: 'NOT_PERFORMED',
      interpretation: 'DIAGNOSTIC_SINGLE_REFERENCE_ONLY_NO_MODEL_PROMOTION',
    });
  });

  it('materializes exact ordered frames and captures all three provider requests without network calls', async () => {
    const manifest = buildReferenceHoldout01ManifestV2R();
    const sourcePath = path.resolve(process.cwd(), String(manifest.sourceMaterialization.sourcePath));
    const receipt = await runReferenceHoldout01NoSpendPreflightV2R({ sourcePath });
    expect(receipt).toMatchObject({
      authority: 'RESEARCH_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION',
      sourceSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
      referenceInputManifestSha256: REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256,
      frameCount: 14,
      networkCalls: { metadata: 0, tokenCounts: 0, inference: 0 },
      dispatchAssessment: 'BLOCKED_PENDING_HUMAN_EVALUATOR_APPROVAL',
      stateEffects: [],
    });
    expect(receipt.requestChecks.map(({ routeId }) => routeId)).toEqual([
      'OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH',
    ]);
    expect(receipt.requestChecks.every((check) => (
      check.initialContentItems === 30
      && check.imageItems === 14
      && check.editingOperatorCount === 0
      && check.controlToolCount === 1
      && check.evaluatorLeakageAssessment === 'PASS'
      && check.requestBytes < 2_000_000
    ))).toBe(true);
    expect(new Set(receipt.requestChecks.map(({ requestSha256 }) => requestSha256)).size).toBe(3);
    expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it('fails before frame extraction when the source bytes do not match the freeze', async () => {
    await expect(runReferenceHoldout01NoSpendPreflightV2R({
      sourcePath: path.resolve(process.cwd(), 'package.json'),
    })).rejects.toThrow('REFERENCE_HOLDOUT_01_SOURCE_SHA256_MISMATCH');
  });

  it('serializes one hash-bound native MP4 only through the Gemini video modality', () => {
    const video = nativeVideoInput();
    const history = buildProviderNativeInitialHistoryV2R(
      'google',
      'Observe this native reference video and its embedded audio.',
      video,
    );
    const content = (history[0] as { content: Array<Record<string, unknown>> }).content;
    expect(content).toHaveLength(3);
    expect(content[0]).toEqual({
      type: 'video', data: video.bytesBase64, mime_type: 'video/mp4', resolution: 'high',
    });
    expect(String(content[1].text)).toContain('EDITRON_NATIVE_VIDEO_REFERENCE_INPUT_MANIFEST_V2R');
    expect(String(content[1].text)).toContain(video.bytesSha256);
    expect(String(content[1].text)).not.toContain(video.bytesBase64);
    expect(content[2]).toEqual({
      type: 'text', text: 'Observe this native reference video and its embedded audio.',
    });
    expect(() => buildProviderNativeInitialHistoryV2R(
      'openai', 'Observe the video.', video,
    )).toThrow('PROVIDER_NATIVE_VIDEO_REFERENCE_UNSUPPORTED:openai');
  });

  it('rejects drifted native-video identity and non-canonical source rates before dispatch', () => {
    const valid = nativeVideoInput();
    expect(bindProviderNativeVideoReferenceInputV2R(valid).manifest).toMatchObject({
      arm: 'NATIVE_VIDEO',
      bytesSha256: valid.bytesSha256,
      sourceRate: { numerator: '60', denominator: '1' },
      embeddedStreams: 'PRESERVED_IN_SOURCE_BYTES',
    });
    expect(() => bindProviderNativeVideoReferenceInputV2R({
      ...valid, bytesSha256: 'b'.repeat(64),
    })).toThrow('VIDEO_REFERENCE_BYTES_SHA256_MISMATCH');
    expect(() => bindProviderNativeVideoReferenceInputV2R({
      ...valid, sourceRate: { numerator: '120', denominator: '2' },
    })).toThrow('VIDEO_REFERENCE_SOURCE_RATE_NOT_REDUCED');
    expect(() => bindProviderNativeVideoReferenceInputV2R({
      ...valid, byteLength: valid.byteLength + 1,
    })).toThrow('VIDEO_REFERENCE_BYTE_LENGTH_MISMATCH');
  });

  it('accepts only a closed, evidence-complete observation or an honest null disposition', () => {
    const accepted = validateReferenceObserverSubmissionV2R(validSubmission());
    expect(accepted).toEqual({ disposition: 'PASS', diagnostics: [] });

    const unavailable = validSubmission();
    unavailable.disposition = 'UNVERIFIABLE';
    unavailable.reasonCodes = ['AUDIO_AND_MOTION_UNAVAILABLE'];
    unavailable.evidenceIds = [];
    unavailable.observation = null;
    expect(validateReferenceObserverSubmissionV2R(unavailable))
      .toEqual({ disposition: 'PASS', diagnostics: [] });

    const unknownEvidence = validSubmission();
    mutableRecord(unknownEvidence.observation!.globalEditorialLanguage[0]).evidenceFrameIds = ['frame_999999'];
    expect(validateReferenceObserverSubmissionV2R(unknownEvidence).diagnostics)
      .toContain('EVIDENCE_ID_UNKNOWN:global-colour:frame_999999');

    const falseRecurrence = validSubmission();
    mutableRecord(falseRecurrence.observation!.recurringDesignGrammar[0]).occurrenceFrameIds = ['frame_000003'];
    expect(validateReferenceObserverSubmissionV2R(falseRecurrence).diagnostics)
      .toContain('RECURRENCE_REQUIRES_TWO_OCCURRENCES:recurring-cards');

    const routingLeak = validSubmission();
    routingLeak.summary = 'Choose hybrid execution for this reference.';
    expect(validateReferenceObserverSubmissionV2R(routingLeak).diagnostics)
      .toContain('EXECUTION_DECISION_NOT_ALLOWED');
  });

  it.each([openAiRoute(), googleRoute()])(
    'serializes one control-only observer tool and accepts a valid $routeId submission',
    async (route) => {
      const manifest = buildReferenceHoldout01ManifestV2R();
      const sourcePath = path.resolve(process.cwd(), String(manifest.sourceMaterialization.sourcePath));
      const materialized = await materializeReferenceHoldout01InputV2R({ sourcePath });
      let requestBody: Readonly<Record<string, unknown>> | undefined;
      const receipt = await runProviderNativeReferenceObserverEpisodeV2R({
        route,
        referenceInput: materialized.referenceInput,
        maxOutputTokens: 4096,
        invoke: async (request) => {
          requestBody = request.body;
          return { status: 200, body: providerResponse(route, validSubmission()) };
        },
      });
      const tools = requestBody && Array.isArray(requestBody.tools) ? requestBody.tools : [];
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({ name: 'finish_editron_research_episode' });
      if (route.provider === 'google') {
        expect(requestBody?.generation_config).toMatchObject({ tool_choice: 'validated' });
      }
      expect(JSON.stringify(tools)).not.toContain('inspect_user_asset');
      expect(JSON.stringify(tools)).not.toContain('cut_section');
      expect(receipt).toMatchObject({
        authority: 'RESEARCH_REFERENCE_OBSERVATION_ONLY_NO_PROJECT_MUTATION',
        terminal: { disposition: 'READY_FOR_EVALUATION' },
        exposedEditingOperatorIds: [],
        selectedEditingOperatorIds: [],
        validationDiagnostics: [],
        productOutcome: 'NOT_EVALUATED_OBSERVATION_ONLY',
        stateEffects: [],
      });
      expect(receipt.observation?.artifactVersion).toBe('REFERENCE_OBSERVATION_MAP_V2R_1');
      expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    },
    30_000,
  );

  it('fails the observer protocol instead of accepting a semantically invalid map', async () => {
    const manifest = buildReferenceHoldout01ManifestV2R();
    const sourcePath = path.resolve(process.cwd(), String(manifest.sourceMaterialization.sourcePath));
    const materialized = await materializeReferenceHoldout01InputV2R({ sourcePath });
    const invalid = validSubmission();
    mutableRecord(invalid.observation!.recurringDesignGrammar[0]).occurrenceFrameIds = ['frame_000003'];
    const receipt = await runProviderNativeReferenceObserverEpisodeV2R({
      route: openAiRoute(),
      referenceInput: materialized.referenceInput,
      maxOutputTokens: 4096,
      invoke: async () => ({ status: 200, body: providerResponse(openAiRoute(), invalid) }),
    });
    expect(receipt.terminal).toMatchObject({
      disposition: 'TOOL_PROTOCOL_FAILURE',
      reasonCodes: ['REFERENCE_OBSERVER_SUBMISSION_INVALID'],
    });
    expect(receipt.validationDiagnostics)
      .toContain('RECURRENCE_REQUIRES_TWO_OCCURRENCES:recurring-cards');
    expect(receipt.observation).toBeNull();
  }, 30_000);
});

function validSubmission(): ReferenceObserverSubmissionV2R {
  const manifest = buildReferenceHoldout01ManifestV2R();
  return structuredClone({
    submissionVersion: REFERENCE_OBSERVER_SUBMISSION_VERSION_V2R,
    taskManifestSha256: manifest.manifestSha256,
    referenceInputManifestSha256: REFERENCE_HOLDOUT_01_EXPECTED_INPUT_SHA256,
    disposition: 'READY_FOR_EVALUATION',
    reasonCodes: ['OBSERVATION_SUBMITTED'],
    evidenceIds: [
      'frame_000001', 'frame_000002', 'frame_000003',
      'frame_000004', 'frame_000005', 'frame_000008',
    ],
    summary: 'Sparse-frame observations are evidence-bound and ready for evaluator review.',
    observation: {
      artifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_1',
      taskId: 'HREF-01',
      inputArm: 'ORDERED_TIMESTAMPED_IMAGES_WITHOUT_AUDIO',
      globalEditorialLanguage: [{
        observationId: 'global-colour',
        statement: 'Near-black frames use restrained warm accent colour.',
        certainty: 'OBSERVED',
        evidenceFrameIds: ['frame_000001', 'frame_000003', 'frame_000008'],
        dimension: 'COLOUR_LIGHT',
        transferability: 'STYLE_ONLY',
      }],
      recurringDesignGrammar: [{
        observationId: 'recurring-cards',
        statement: 'Dark interface cards recur, while the opening provides a sparse counterexample.',
        certainty: 'OBSERVED',
        evidenceFrameIds: ['frame_000001', 'frame_000003', 'frame_000005'],
        patternKind: 'RECURRING',
        occurrenceFrameIds: ['frame_000003', 'frame_000005'],
        counterexampleFrameIds: ['frame_000001'],
      }],
      boundedHeroMoments: [{
        observationId: 'hero-hub',
        statement: 'A bounded state presents a central hub with surrounding labelled functions.',
        certainty: 'OBSERVED',
        evidenceFrameIds: ['frame_000004'],
        startTimestampUs: '14000000',
        endTimestampUsExclusive: '16000000',
        states: ['central hub and surrounding functions are simultaneously visible'],
      }],
      contentLiterals: [{
        observationId: 'literal-brand',
        statement: 'The exact brand identity is reference-specific literal content.',
        certainty: 'OBSERVED',
        evidenceFrameIds: ['frame_000002'],
        kind: 'BRAND',
        rightsDisposition: 'DO_NOT_COPY',
      }],
      temporalStructure: [{
        observationId: 'phase-intro',
        statement: 'The opening sample establishes a concise premise.',
        certainty: 'OBSERVED',
        evidenceFrameIds: ['frame_000001'],
        startTimestampUs: '0',
        endTimestampUsExclusive: '6000000',
        phaseRole: 'INTRODUCTION',
      }],
      uncertainties: [
        { uncertaintyId: 'missing-audio', statement: 'Audio is unavailable in this arm.', disposition: 'REQUIRES_AUDIO', affectedLayers: ['audio relationship'] },
        { uncertaintyId: 'missing-easing', statement: 'Exact easing needs dense reinspection.', disposition: 'REQUIRES_DENSE_REINSPECTION', affectedLayers: ['exact easing'] },
        { uncertaintyId: 'missing-motion', statement: 'Continuous motion needs dense reinspection.', disposition: 'REQUIRES_DENSE_REINSPECTION', affectedLayers: ['continuous motion'] },
        { uncertaintyId: 'missing-intervals', statement: 'Unsampled intervals remain unverifiable.', disposition: 'UNVERIFIABLE_FROM_CURRENT_EVIDENCE', affectedLayers: ['unsampled intervals'] },
      ],
      requestedDenseReinspectionWindows: [{
        startTimestampUs: '14000000',
        endTimestampUsExclusive: '16000000',
        reason: 'Resolve exact motion state changes around the bounded hub moment.',
        requiredModality: 'ORDERED_DENSE_FRAMES',
      }],
    },
  }) as ReferenceObserverSubmissionV2R;
}

function openAiRoute(): Readonly<ProviderNativeRouteV2R> {
  return {
    routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
    claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
  };
}

function googleRoute(): Readonly<ProviderNativeRouteV2R> {
  return {
    routeId: 'GOOGLE_FLASH', provider: 'google', model: 'gemini-3.7-flash',
    claimedModelIdentity: 'gemini-3.7-flash', reasoningMode: 'medium',
  };
}

function providerResponse(
  route: Readonly<ProviderNativeRouteV2R>,
  submission: ReferenceObserverSubmissionV2R,
): Record<string, unknown> {
  return route.provider === 'openai'
    ? {
        id: 'href-openai-response', model: route.model, status: 'completed',
        output: [{
          type: 'function_call', call_id: 'href-call',
          name: 'finish_editron_research_episode', arguments: JSON.stringify(submission),
        }],
      }
    : {
        id: 'href-google-response', model_version: route.model, status: 'completed',
        steps: [{
          type: 'function_call', id: 'href-call',
          name: 'finish_editron_research_episode', arguments: submission,
        }],
      };
}

function mutableRecord(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function nativeVideoInput(): ProviderNativeVideoReferenceInputV2R {
  const bytes = Buffer.from(
    '000000186674797069736f6d0000020069736f6d69736f32',
    'hex',
  );
  const bytesSha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    version: PROVIDER_NATIVE_VIDEO_REFERENCE_INPUT_VERSION_V2R,
    arm: PROVIDER_NATIVE_VIDEO_REFERENCE_ARM_V2R,
    referenceId: 'ref_native_video_01',
    referenceAssetSha256: bytesSha256,
    mimeType: 'video/mp4',
    bytesBase64: bytes.toString('base64'),
    bytesSha256,
    byteLength: bytes.length,
    durationUs: '64750000',
    sourceRate: { numerator: '60', denominator: '1' },
    resolution: 'high',
  };
}
