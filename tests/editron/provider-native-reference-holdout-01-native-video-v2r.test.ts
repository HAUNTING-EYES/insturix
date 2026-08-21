import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { canonicalizeJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R,
  validateReferenceNativeObserverSubmissionV2R,
  type ReferenceNativeObserverSubmissionV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-observation-contract-v2r';
import {
  runProviderNativeReferenceObserverEpisodeV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-observer-episode-v2r';
import {
  REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
  REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH,
  REFERENCE_HOLDOUT_01_SOURCE_SHA256,
  assertReferenceHoldout01NativeManifestV2R,
  buildReferenceHoldout01NativeManifestV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-v2r';
import {
  assertReferenceHoldout01NativeAuthorizationV2R,
  buildReferenceHoldout01NativeAuthorizationV2R,
  materializeReferenceHoldout01NativeVideoInputV2R,
  runReferenceHoldout01NativeVideoNoSpendPreflightV2R,
  type ReferenceHoldout01NativeMaterializationV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-preflight-v2r';
import {
  runReferenceHoldout01NativeObservationV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-runner-v2r';
import {
  REFERENCE_NATIVE_OBSERVER_SEMANTIC_RULES_V2R,
  bindReferenceNativeObserverDiagnosticV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-reference-semantics-v2r';
import type {
  ProviderNativeRouteV2R,
} from '@/lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

describe('V2R held-out native video/audio reference task 01', () => {
  let materialized: Readonly<ReferenceHoldout01NativeMaterializationV2R>;

  beforeAll(async () => {
    materialized = await materializeReferenceHoldout01NativeVideoInputV2R({
      sourcePath: sourcePath(),
    });
  });

  it('freezes a distinct native-video task while keeping evaluator-only material hidden', () => {
    const manifest = assertReferenceHoldout01NativeManifestV2R(
      buildReferenceHoldout01NativeManifestV2R(),
    );
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(manifest).toMatchObject({
      taskId: 'HREF-01-NATIVE',
      sourceBinding: {
        referenceId: 'ref_heldout_01',
        bytesSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
        byteLength: REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH,
        durationUs: '64750000',
        sourceRate: { numerator: '60', denominator: '1' },
        embeddedStreams: 'PRESERVED_IN_SOURCE_BYTES',
      },
      providerVisibleTask: {
        taskKind: 'REFERENCE_OBSERVATION_ONLY',
        inputArm: 'NATIVE_VIDEO_WITH_EMBEDDED_AUDIO',
      },
    });
    expect(materialized.referenceInputManifestSha256)
      .toBe(REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256);
    const providerVisible = canonicalizeJsonV1(manifest.providerVisibleTask);
    expect(providerVisible).not.toContain('frame_000001');
    for (const sentinel of manifest.evaluatorOnly.leakageSentinels) {
      expect(providerVisible).not.toContain(sentinel);
    }
    expect(manifest.evaluatorOnly.reviewProtocol).toMatchObject({
      currentHumanReviewStatus:
        'PROTOCOL_APPROVED_OUTPUT_NOT_YET_REVIEWED',
    });
  });

  it('exposes every validator-only native semantic constraint without rubric leakage', () => {
    const manifest = buildReferenceHoldout01NativeManifestV2R();
    const semanticContract = manifest.providerVisibleTask.semanticContract as
      | Readonly<Record<string, unknown>>
      | undefined;
    expect(semanticContract).toEqual({
      version: 'EDITRON_REFERENCE_NATIVE_OBSERVER_SEMANTIC_CONTRACT_V2R_1',
      rules: REFERENCE_NATIVE_OBSERVER_SEMANTIC_RULES_V2R.map(({
        ruleId,
        requirement,
      }) => ({ ruleId, requirement })),
    });
    expect(() => bindReferenceNativeObserverDiagnosticV2R(
      'NATIVE_OBSERVER_DENSE_WINDOW_RATE',
      'TERMINAL_EVIDENCE_SET_MISMATCH',
    )).toThrow(
      'REFERENCE_NATIVE_SEMANTIC_DIAGNOSTIC_RULE_MISMATCH:'
      + 'NATIVE_OBSERVER_DENSE_WINDOW_RATE:TERMINAL_EVIDENCE_SET_MISMATCH',
    );
    const providerVisible = canonicalizeJsonV1(manifest.providerVisibleTask);
    expect(providerVisible).toContain(
      'requestedRate must be null unless requiredModality is CUSTOM_FPS_VIDEO',
    );
    expect(providerVisible).toContain(
      'exact union of every observationId, uncertaintyId and windowId',
    );
    expect(providerVisible).toContain(
      'audioBehaviour evidence must include AUDIO or VIDEO_AND_AUDIO',
    );
    expect(providerVisible).not.toContain('HREF01N-EVAL-');
  });

  it('captures one exact Gemini native-video request without metadata, token or inference calls', async () => {
    const receipt = await runReferenceHoldout01NativeVideoNoSpendPreflightV2R({
      sourcePath: sourcePath(),
    });
    expect(receipt).toMatchObject({
      authority: 'RESEARCH_NATIVE_VIDEO_PREFLIGHT_NO_MODEL_INFERENCE_NO_PROJECT_MUTATION',
      sourceSha256: REFERENCE_HOLDOUT_01_SOURCE_SHA256,
      sourceByteLength: REFERENCE_HOLDOUT_01_SOURCE_BYTE_LENGTH,
      referenceInputManifestSha256: REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
      requestCheck: {
        routeId: 'GOOGLE_FLASH',
        model: 'gemini-3.7-flash',
        initialContentItems: 3,
        videoItems: 1,
        editingOperatorCount: 0,
        controlToolCount: 1,
        evaluatorLeakageAssessment: 'PASS',
      },
      networkCalls: { metadata: 0, tokenCounts: 0, inference: 0 },
      dispatchAssessment:
        'BLOCKED_PENDING_HASH_BOUND_OPERATOR_EGRESS_AUTHORIZATION',
      stateEffects: [],
    });
    expect(receipt.requestCheck.requestBytes).toBeGreaterThan(20_000_000);
    expect(receipt.requestCheck.requestBytes).toBeLessThan(30_000_000);
    expect(receipt.requestCheck.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it('binds one-call operator authorization to the task, evaluator and source', async () => {
    const authorization = buildReferenceHoldout01NativeAuthorizationV2R({
      operatorId: 'admin',
      approvedAt: '2026-08-20T10:00:00.000Z',
    });
    expect(authorization.providerModel).toBe('gemini-3.7-flash');
    expect(assertReferenceHoldout01NativeAuthorizationV2R(authorization))
      .toEqual(authorization);
    const defaultReceipt = await runReferenceHoldout01NativeVideoNoSpendPreflightV2R({
      sourcePath: sourcePath(),
      authorization,
    });
    expect(defaultReceipt).toMatchObject({
      dispatchAssessment: 'READY_FOR_ONE_GEMINI_NATIVE_OBSERVATION',
      operatorAuthorization: {
        operatorId: 'admin',
        providerModel: 'gemini-3.7-flash',
        authorizationSha256: authorization.authorizationSha256,
        maxInferenceCalls: 1,
        maxOutputTokens: 8192,
      },
      stateEffects: [],
    });

    const fallbackAuthorization = buildReferenceHoldout01NativeAuthorizationV2R({
      operatorId: 'admin',
      approvedAt: '2026-08-20T10:00:00.000Z',
      providerModel: 'gemini-3.6-flash',
    });
    const fallbackReceipt = await runReferenceHoldout01NativeVideoNoSpendPreflightV2R({
      sourcePath: sourcePath(),
      authorization: fallbackAuthorization,
    });
    expect(fallbackReceipt).toMatchObject({
      requestCheck: { model: 'gemini-3.6-flash' },
      operatorAuthorization: {
        providerModel: 'gemini-3.6-flash',
        authorizationSha256: fallbackAuthorization.authorizationSha256,
      },
      dispatchAssessment: 'READY_FOR_ONE_GEMINI_NATIVE_OBSERVATION',
    });
    expect(fallbackReceipt.requestCheck.requestSha256)
      .not.toBe(defaultReceipt.requestCheck.requestSha256);

    const tampered = { ...authorization, sourceSha256: '0'.repeat(64) };
    expect(() => assertReferenceHoldout01NativeAuthorizationV2R(tampered))
      .toThrow('REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_DRIFT');
    const modelTampered = { ...authorization, providerModel: 'gemini-3.6-flash' as const };
    expect(() => assertReferenceHoldout01NativeAuthorizationV2R(modelTampered))
      .toThrow('REFERENCE_HOLDOUT_01_NATIVE_AUTHORIZATION_DRIFT');
  }, 30_000);

  it('fails on non-frozen source bytes before request construction', async () => {
    await expect(materializeReferenceHoldout01NativeVideoInputV2R({
      sourcePath: path.resolve(process.cwd(), 'package.json'),
    })).rejects.toThrow('REFERENCE_HOLDOUT_01_NATIVE_SOURCE_SHA256_MISMATCH');
  });

  it('accepts bounded timestamp/modal evidence and rejects semantic shortcuts', () => {
    expect(validateReferenceNativeObserverSubmissionV2R(validNativeSubmission()))
      .toEqual({ disposition: 'PASS', diagnostics: [] });

    const badRange = validNativeSubmission();
    firstEvidenceRange(badRange).endTimestampUsExclusive = '999999999';
    expect(validateReferenceNativeObserverSubmissionV2R(badRange).diagnostics)
      .toContain('RANGE_BOUNDS_INVALID:global-language:evidence:0');

    const falseRecurrence = validNativeSubmission();
    const recurring = mutableRecord(falseRecurrence.observation!.recurringDesignGrammar[0]);
    const occurrences = recurring.occurrenceRanges as Record<string, unknown>[];
    occurrences[1] = structuredClone(occurrences[0]);
    expect(validateReferenceNativeObserverSubmissionV2R(falseRecurrence).diagnostics)
      .toContain('RECURRENCE_REQUIRES_TWO_DISTINCT_RANGES:recurring-cards');

    const silentAudioClaim = validNativeSubmission();
    firstEvidenceRange(silentAudioClaim, 'audio').modality = 'VIDEO';
    expect(validateReferenceNativeObserverSubmissionV2R(silentAudioClaim).diagnostics)
      .toContain('AUDIO_OBSERVATION_REQUIRES_AUDIO_EVIDENCE:audio-build');

    const excessiveDenseRate = validNativeSubmission();
    mutableRecord(excessiveDenseRate.observation!.requestedDenseReinspectionWindows[0])
      .requestedRate = { numerator: '120', denominator: '1' };
    expect(validateReferenceNativeObserverSubmissionV2R(excessiveDenseRate).diagnostics)
      .toContain('CUSTOM_FPS_RATE_EXCEEDS_SOURCE:dense-hub');

    const rateOnSourceFrames = validNativeSubmission();
    const denseWindow = mutableRecord(
      rateOnSourceFrames.observation!.requestedDenseReinspectionWindows[0],
    );
    denseWindow.requiredModality = 'SOURCE_FRAME_WINDOW';
    denseWindow.requestedRate = { numerator: '60', denominator: '1' };
    expect(validateReferenceNativeObserverSubmissionV2R(rateOnSourceFrames).diagnostics)
      .toContain('DENSE_RATE_ONLY_FOR_CUSTOM_FPS:dense-hub');

    const routingLeak = validNativeSubmission();
    routingLeak.summary = 'Choose hybrid execution for this reference.';
    expect(validateReferenceNativeObserverSubmissionV2R(routingLeak).diagnostics)
      .toContain('EXECUTION_DECISION_NOT_ALLOWED');

    const incompleteTerminal = validNativeSubmission();
    incompleteTerminal.evidenceIds = incompleteTerminal.evidenceIds.slice(1);
    expect(validateReferenceNativeObserverSubmissionV2R(incompleteTerminal).diagnostics)
      .toContain('TERMINAL_EVIDENCE_SET_MISMATCH');
  });

  it('runs one control-only Gemini observer receipt and rejects native video on OpenAI', async () => {
    let requestBody: Readonly<Record<string, unknown>> | undefined;
    const receipt = await runProviderNativeReferenceObserverEpisodeV2R({
      route: googleRoute(),
      referenceInput: materialized.referenceInput,
      maxOutputTokens: 8192,
      invoke: async (request) => {
        requestBody = request.body;
        return {
          status: 200,
          body: {
            id: 'href-native-google-response',
            model_version: 'gemini-3.7-flash',
            status: 'completed',
            steps: [{
              type: 'function_call',
              id: 'href-native-call',
              name: 'finish_editron_research_episode',
              arguments: validNativeSubmission(),
            }],
          },
        };
      },
    });
    const tools = requestBody && Array.isArray(requestBody.tools) ? requestBody.tools : [];
    const input = requestBody && Array.isArray(requestBody.input) ? requestBody.input : [];
    const content = input.length
      ? (input[0] as { content?: unknown }).content
      : undefined;
    expect(tools).toHaveLength(1);
    expect(JSON.stringify(tools)).not.toContain('cut_section');
    expect(Array.isArray(content) ? content.map((entry) => (
      (entry as Record<string, unknown>).type
    )) : []).toEqual(['video', 'text', 'text']);
    expect(requestBody?.generation_config).toMatchObject({ tool_choice: 'validated' });
    expect(canonicalizeJsonV1(requestBody)).toContain(
      'requestedRate must be null unless requiredModality is CUSTOM_FPS_VIDEO',
    );
    expect(receipt).toMatchObject({
      terminal: { disposition: 'READY_FOR_EVALUATION' },
      observation: { artifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_2' },
      exposedEditingOperatorIds: [],
      selectedEditingOperatorIds: [],
      validationDiagnostics: [],
      stateEffects: [],
    });

    let invoked = false;
    await expect(runProviderNativeReferenceObserverEpisodeV2R({
      route: openAiRoute(),
      referenceInput: materialized.referenceInput,
      maxOutputTokens: 8192,
      invoke: async () => {
        invoked = true;
        return { status: 500, body: {} };
      },
    })).rejects.toThrow('REFERENCE_NATIVE_OBSERVER_ROUTE_UNSUPPORTED:openai');
    expect(invoked).toBe(false);
  }, 30_000);

  it('persists a hash-bound one-call runner receipt without project state effects', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'editron-href-native-'));
    const outputRoot = path.join(tempRoot, 'run');
    let inferenceCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      inferenceCalls += 1;
      return new Response(JSON.stringify({
        id: 'href-native-live-response',
        model_version: 'gemini-3.6-flash',
        status: 'completed',
        steps: [{
          type: 'function_call',
          id: 'href-native-live-call',
          name: 'finish_editron_research_episode',
          arguments: validNativeSubmission(),
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    try {
      const authorization = buildReferenceHoldout01NativeAuthorizationV2R({
        operatorId: 'admin',
        approvedAt: '2026-08-20T10:00:00.000Z',
        providerModel: 'gemini-3.6-flash',
      });
      const receipt = await runReferenceHoldout01NativeObservationV2R({
        sourcePath: sourcePath(),
        outputRoot,
        executionId: 'href01-native-test',
        authorization,
        environment: {
          OPENAI_API_KEY: 'test-openai-key',
          GEMINI_API_KEY: 'test-google-key',
        },
        fetchImpl,
      });
      expect(inferenceCalls).toBe(1);
      expect(receipt).toMatchObject({
        authority: 'RESEARCH_NATIVE_REFERENCE_OBSERVATION_NO_PROJECT_MUTATION',
        inferenceCalls: 1,
        terminalDisposition: 'READY_FOR_EVALUATION',
        assessment: 'VALIDATED_OBSERVATION_READY_FOR_BLIND_HUMAN_REVIEW',
        observationArtifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_2',
        route: { model: 'gemini-3.6-flash' },
        stateEffects: [],
      });
      const [runArtifact, episodeArtifact, transportArtifact] = await Promise.all([
        readFile(receipt.artifacts.runReceipt, 'utf8'),
        readFile(receipt.artifacts.episodeReceipt, 'utf8'),
        readFile(receipt.artifacts.transportReceipt, 'utf8'),
      ]);
      expect(JSON.parse(runArtifact)).toMatchObject({
        receiptSha256: receipt.receiptSha256,
        stateEffects: [],
      });
      expect(JSON.parse(episodeArtifact)).toMatchObject({
        terminal: { disposition: 'READY_FOR_EVALUATION' },
        stateEffects: [],
      });
      expect(JSON.parse(transportArtifact)).toMatchObject({
        calls: [{ responseStatus: 200, returnedModelIdentity: 'gemini-3.6-flash' }],
        secretsPersisted: false,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

function validNativeSubmission(): ReferenceNativeObserverSubmissionV2R {
  const manifest = buildReferenceHoldout01NativeManifestV2R();
  return structuredClone({
    submissionVersion: REFERENCE_NATIVE_OBSERVER_SUBMISSION_VERSION_V2R,
    taskManifestSha256: manifest.manifestSha256,
    referenceInputManifestSha256: REFERENCE_HOLDOUT_01_NATIVE_EXPECTED_INPUT_SHA256,
    disposition: 'READY_FOR_EVALUATION',
    reasonCodes: ['OBSERVATION_SUBMITTED'],
    evidenceIds: [
      'global-language', 'recurring-cards', 'hero-hub', 'literal-brand',
      'phase-intro', 'audio-build', 'limit-sampling', 'limit-easing', 'dense-hub',
    ],
    summary: 'Native video and embedded-audio observations are timestamp-bound and ready for evaluation.',
    observation: {
      artifactVersion: 'REFERENCE_OBSERVATION_MAP_V2R_2',
      taskId: 'HREF-01-NATIVE',
      inputArm: 'NATIVE_VIDEO_WITH_EMBEDDED_AUDIO',
      globalEditorialLanguage: [{
        observationId: 'global-language',
        statement: 'Near-black visual fields use restrained warm accents around primary claims.',
        certainty: 'OBSERVED',
        evidenceRanges: [range('0', '10000000', 'VIDEO')],
        dimension: 'COLOUR_LIGHT',
        transferability: 'STYLE_ONLY',
      }],
      recurringDesignGrammar: [{
        observationId: 'recurring-cards',
        statement: 'Dark evidence-bearing interface cards recur, with a sparse opening counterexample.',
        certainty: 'OBSERVED',
        evidenceRanges: [
          range('10000000', '20000000', 'VIDEO'),
          range('30000000', '40000000', 'VIDEO'),
        ],
        patternKind: 'RECURRING',
        occurrenceRanges: [
          range('10000000', '20000000', 'VIDEO'),
          range('30000000', '40000000', 'VIDEO'),
        ],
        counterexampleRanges: [range('0', '5000000', 'VIDEO')],
      }],
      boundedHeroMoments: [{
        observationId: 'hero-hub',
        statement: 'A bounded hub construction places labelled functions around a central object.',
        certainty: 'OBSERVED',
        evidenceRanges: [range('14000000', '16000000', 'VIDEO')],
        momentRange: range('14000000', '16000000', 'VIDEO'),
        states: ['central object and surrounding labels are simultaneously visible'],
      }],
      contentLiterals: [{
        observationId: 'literal-brand',
        statement: 'The exact product brand is literal reference content.',
        certainty: 'OBSERVED',
        evidenceRanges: [range('5000000', '6000000', 'VIDEO')],
        kind: 'BRAND',
        rightsDisposition: 'DO_NOT_COPY',
      }],
      temporalStructure: [{
        observationId: 'phase-intro',
        statement: 'The opening establishes the premise before product proof begins.',
        certainty: 'OBSERVED',
        evidenceRanges: [range('0', '8000000', 'VIDEO_AND_AUDIO')],
        phaseRange: range('0', '8000000', 'VIDEO_AND_AUDIO'),
        phaseRole: 'INTRODUCTION',
      }],
      audioBehaviour: [{
        observationId: 'audio-build',
        statement: 'Audible energy supports the opening build without proving exact frame-level synchronization.',
        certainty: 'OBSERVED',
        evidenceRanges: [range('0', '10000000', 'VIDEO_AND_AUDIO')],
        behaviourKind: 'DYNAMICS',
      }],
      uncertainties: [
        {
          uncertaintyId: 'limit-sampling',
          statement: 'Provider sampling is not source-frame-complete evidence.',
          disposition: 'UNVERIFIABLE_FROM_NATIVE_PASS',
          affectedLayers: ['source-frame completeness'],
        },
        {
          uncertaintyId: 'limit-easing',
          statement: 'Exact easing and transition microtiming require dense reinspection.',
          disposition: 'REQUIRES_DENSE_REINSPECTION',
          affectedLayers: ['exact easing', 'transition microtiming'],
        },
      ],
      requestedDenseReinspectionWindows: [{
        windowId: 'dense-hub',
        startTimestampUs: '14000000',
        endTimestampUsExclusive: '16000000',
        reason: 'Resolve fast motion and transition microtiming around the hub reveal.',
        requiredModality: 'CUSTOM_FPS_VIDEO',
        requestedRate: { numerator: '8', denominator: '1' },
      }],
    },
  }) as ReferenceNativeObserverSubmissionV2R;
}

function firstEvidenceRange(
  submission: ReferenceNativeObserverSubmissionV2R,
  layer: 'global' | 'audio' = 'global',
): Record<string, unknown> {
  const record = layer === 'audio'
    ? submission.observation!.audioBehaviour[0]
    : submission.observation!.globalEditorialLanguage[0];
  return (mutableRecord(record).evidenceRanges as Record<string, unknown>[])[0];
}

function range(
  startTimestampUs: string,
  endTimestampUsExclusive: string,
  modality: 'VIDEO' | 'AUDIO' | 'VIDEO_AND_AUDIO',
): Record<string, unknown> {
  return { startTimestampUs, endTimestampUsExclusive, modality };
}

function mutableRecord(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function sourcePath(): string {
  return path.resolve(
    process.cwd(),
    'public/product_demos/showcase/insturix-final-intro.mp4',
  );
}

function googleRoute(): Readonly<ProviderNativeRouteV2R> {
  return {
    routeId: 'GOOGLE_FLASH', provider: 'google', model: 'gemini-3.7-flash',
    claimedModelIdentity: 'gemini-3.7-flash', reasoningMode: 'medium',
  };
}

function openAiRoute(): Readonly<ProviderNativeRouteV2R> {
  return {
    routeId: 'OPENAI_LUNA', provider: 'openai', model: 'gpt-5.6-luna',
    claimedModelIdentity: 'gpt-5.6-luna', reasoningMode: 'medium',
  };
}
