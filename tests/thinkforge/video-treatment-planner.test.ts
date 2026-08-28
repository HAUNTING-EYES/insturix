import { describe, expect, it, vi } from 'vitest';

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { GraphIndex } from '@/lib/editron/services/graph-query';
import {
  buildThinkForgeEditorialPlan,
  type ThinkForgeEditorialPlan,
} from '@/lib/thinkforge/agents/editorial-plan';
import type { ThinkForgeResolvedAuthoringContext } from '@/lib/thinkforge/context/resolved-authoring-context';
import type { SourceLedger } from '@/lib/thinkforge/provenance/source-ledger';
import {
  createThinkForgeAuthoringRequest,
  type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';
import { createThinkForgeWriterContract } from '@/lib/thinkforge/schemas/document-contract';
import {
  VideoTreatmentModelOutputSchema,
  type CreativeReferenceSet,
  type VideoTreatment,
  type VideoTreatmentModelOutput,
} from '@/lib/thinkforge/schemas/video-treatment';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals';
import {
  planVideoTreatment,
  VideoTreatmentPlannerError,
  type PlanVideoTreatmentInput,
  type VideoTreatmentPlanningCache,
  type VideoTreatmentPlanningCacheRecord,
  type VideoTreatmentPlannerDependencies,
} from '@/lib/thinkforge/video-treatment/treatment-planner';
import {
  abstractExplainerTreatment,
  referenceLedCreativeReferenceSet,
  referenceLedTreatment,
} from '@/tests/fixtures/thinkforge-video-treatment';

const sourceLedger: SourceLedger = {
  ledgerVersion: 1,
  entries: [{
    referenceId: 'src_brief',
    kind: 'user_brief',
    title: 'Approved brief',
    summary: 'Explain the operational bottleneck through an original, evidence-safe treatment.',
    confidence: 1,
    provenance: { origin: 'test' },
  }],
};

function makeAuthoringRequest(): ThinkForgeAuthoringRequest {
  return createThinkForgeAuthoringRequest({
    contentContract: createThinkForgeWriterContract('video_script'),
    platformSurface: { id: 'youtube' },
    publishingSurface: 'youtube_video',
    targetDurationSec: 90,
  });
}

function makeProductionBrief(): ProductionBrief {
  return {
    output: {
      platform: 'youtube',
      targetDurationSec: 90,
      aspectRatio: '16:9',
      count: 1,
      format: 'auto-edit',
      intent: 'Explain one operational bottleneck clearly.',
    },
    resolution: {
      fieldConfidence: { platform: 1, targetDurationSec: 1, aspectRatio: 1 },
      confirmed: ['platform', 'targetDurationSec', 'aspectRatio'],
      inferred: [],
    },
    entryPoint: 'thinkforge',
    brand: { brandId: 'brand_a' },
  };
}

function makeEditorialPlan(
  authoringRequest: ThinkForgeAuthoringRequest,
  userPrompt: string,
  productionBrief?: ProductionBrief,
): { editorialPlan: ThinkForgeEditorialPlan; contentSignalProfile: ReturnType<typeof resolveContentSignalProfile> } {
  const contentSignalProfile = resolveContentSignalProfile({ userPrompt, authoringRequest });
  return {
    editorialPlan: buildThinkForgeEditorialPlan({
      userPrompt,
      authoringRequest,
      contentSignalProfile,
      productionBrief,
      evidenceNarrativeIntent: 'creative',
      authorizedFactIds: [],
      sourceLedger,
      sourceLedgerEntryIds: ['src_brief'],
    }),
    contentSignalProfile,
  };
}

function makeAuthoringContext(input: {
  profileFingerprint?: string;
  references?: CreativeReferenceSet;
  systemBrief?: string;
} = {}): ThinkForgeResolvedAuthoringContext {
  const profileFingerprint = input.profileFingerprint ?? 'a'.repeat(64);
  const references = input.references ?? { version: 1, referenceSetId: 'refs_empty', references: [] };
  const selectedReferenceIds = references.references.map((reference) => reference.id);
  return {
    projectMeta: { brandId: 'brand_a' },
    retrievedContext: {} as ThinkForgeResolvedAuthoringContext['retrievedContext'],
    creativeReferenceContext: {
      version: 1,
      referenceSet: references,
      scope: { kind: 'personal', ownerUserId: 'user_a', brandId: 'brand_a' },
      sources: [],
      selectedReferenceIds,
      analyzedReferenceIds: references.references
        .filter((reference) => reference.analysisStatus === 'available')
        .map((reference) => reference.id),
      unresolved: [],
      brandRevision: {
        brandId: 'brand_a',
        recordId: 'record_a_1',
        profileUpdatedAt: '2026-08-22T00:00:00.000Z',
      },
    },
    systemBrief: input.systemBrief ?? 'Brand A is precise, calm, and evidence-led.',
    snapshot: {
      version: 3,
      resolvedAt: '2026-08-22T00:00:00.000Z',
      scope: { kind: 'personal', brandId: 'brand_a' },
      brand: {
        brandId: 'brand_a',
        recordId: 'record_a_1',
        profileUpdatedAt: '2026-08-22T00:00:00.000Z',
        profileFingerprint,
      },
      writingKnowledgeVersion: 'writing-test-v1',
      authoringRequest: makeAuthoringRequest(),
      retrieval: {
        projectFactIds: [],
        globalFactIds: [],
        interactionPatternTypes: [],
        diagnostics: {
          version: 1,
          projectFacts: { status: 'empty', itemCount: 0, durationMs: 0 },
          globalVector: { status: 'empty', itemCount: 0, durationMs: 0 },
          globalKeyword: { status: 'empty', itemCount: 0, durationMs: 0 },
          interactionPatterns: { status: 'empty', itemCount: 0, durationMs: 0 },
        },
      },
    },
  };
}

function makeInput(overrides: Partial<PlanVideoTreatmentInput> = {}): PlanVideoTreatmentInput {
  const userPrompt = overrides.userPrompt ?? 'Create a YouTube explainer about a hidden workflow bottleneck.';
  const authoringRequest = overrides.authoringRequest ?? makeAuthoringRequest();
  const productionBrief = overrides.productionBrief ?? makeProductionBrief();
  const plan = makeEditorialPlan(
    authoringRequest,
    userPrompt,
    authoringRequest.contentContract.outputKind === 'video_script' ? productionBrief : undefined,
  );
  return {
    userPrompt,
    authoringRequest,
    editorialPlan: overrides.editorialPlan ?? plan.editorialPlan,
    productionBrief,
    authoringContext: overrides.authoringContext ?? makeAuthoringContext(),
    contentSignalProfile: overrides.contentSignalProfile ?? plan.contentSignalProfile,
    sourceLedger: overrides.sourceLedger ?? sourceLedger,
    userId: 'user_a',
    sessionId: 'session_a',
  };
}

function modelOutputFrom(treatment: VideoTreatment): VideoTreatmentModelOutput {
  const copy = structuredClone(treatment);
  const {
    version: _version,
    treatmentId: _treatmentId,
    audiovisualIntent: _audiovisualIntent,
    decisionTrace,
    ...rest
  } = copy;
  const {
    inputFingerprint: _inputFingerprint,
    brand: _brand,
    contentSignalProfileVersion: _contentSignalProfileVersion,
    writingKnowledgeVersion: _writingKnowledgeVersion,
    editronCreativeGraphVersion: _editronCreativeGraphVersion,
    ...modelTrace
  } = decisionTrace;
  return VideoTreatmentModelOutputSchema.parse({
    ...rest,
    decisionTrace: {
      ...modelTrace,
      appliedConstraintIds: [],
    },
  });
}

function memoryCache(): VideoTreatmentPlanningCache {
  const records = new Map<string, VideoTreatmentPlanningCacheRecord>();
  return {
    read: async (inputFingerprint) => {
      const record = records.get(inputFingerprint);
      return record ? { status: 'hit', record } : { status: 'miss' };
    },
    write: async (record) => {
      records.set(record.inputFingerprint, record);
      return { status: 'stored' };
    },
  };
}

function graphFixture(): GraphIndex {
  return {
    version: '3.0-test',
    constraints: new Map([['constraint:overlay.visual_clutter', {
      id: 'constraint:overlay.visual_clutter',
      type: 'Constraint',
      category: 'overlay',
      name: 'Visual Clutter',
      summary: 'Keep simultaneous graphic information sparse enough to preserve one clear audience job.',
      details: {
        rule: 'not sent to ThinkForge',
        detection: 'not sent to ThinkForge',
        threshold: 'not sent to ThinkForge',
        autoCorrection: 'not sent to ThinkForge',
        severity: 'warning',
        appliesTo: ['overlay'],
        rationale: 'not sent to ThinkForge',
      },
      tags: ['graphics', 'clarity'],
      sourceLines: [1, 2],
    }]]),
  } as unknown as GraphIndex;
}

describe('video treatment planner', () => {
  it('caches only identical video inputs and changes trace identity for a Brand Vault or reference change', async () => {
    const cache = memoryCache();
    const generator = vi.fn()
      .mockResolvedValueOnce({ result: modelOutputFrom(abstractExplainerTreatment), cacheStatus: 'hit', modelName: 'gemini-test' })
      .mockResolvedValueOnce({ result: modelOutputFrom(abstractExplainerTreatment), cacheStatus: 'hit', modelName: 'gemini-test' })
      .mockResolvedValueOnce({ result: modelOutputFrom(referenceLedTreatment), cacheStatus: 'hit', modelName: 'gemini-test' });
    const receipts = vi.fn(async () => undefined);
    const dependencies: VideoTreatmentPlannerDependencies = {
      cache,
      generate: generator,
      recordReceipt: receipts,
      knowledge: { loadEditronGraph: graphFixture },
    };

    const firstInput = makeInput({ authoringContext: makeAuthoringContext({ profileFingerprint: 'a'.repeat(64) }) });
    const first = await planVideoTreatment(firstInput, dependencies);
    const cached = await planVideoTreatment(firstInput, dependencies);
    const brandChanged = await planVideoTreatment(makeInput({
      authoringContext: makeAuthoringContext({
        profileFingerprint: 'b'.repeat(64),
        systemBrief: 'Brand A now requires direct, technical visual language.',
      }),
    }), dependencies);
    const referenceChanged = await planVideoTreatment(makeInput({
      authoringContext: makeAuthoringContext({ references: referenceLedCreativeReferenceSet }),
    }), dependencies);

    expect(generator).toHaveBeenCalledTimes(3);
    expect(cached.source).toBe('cache');
    expect(first.inputFingerprint).not.toBe(brandChanged.inputFingerprint);
    expect(brandChanged.treatment.decisionTrace.brand?.profileFingerprint).toBe('b'.repeat(64));
    expect(brandChanged.inputFingerprint).not.toBe(referenceChanged.inputFingerprint);
    expect(referenceChanged.treatment.decisionTrace.creativeReferenceIds).toEqual(['ref_explainer']);
    expect(receipts).toHaveBeenCalledWith(expect.objectContaining({
      inputFingerprint: first.inputFingerprint,
      modelName: 'gemini-test',
      writingKnowledgeVersion: expect.any(String),
    }));
  });

  it('returns a no-capture explainer without final-form output and keeps selected doctrine trusted', async () => {
    let capturedRequest: Parameters<NonNullable<VideoTreatmentPlannerDependencies['generate']>>[0] | undefined;
    const generator: NonNullable<VideoTreatmentPlannerDependencies['generate']> = async (request) => {
      capturedRequest = request;
      return {
        result: modelOutputFrom(abstractExplainerTreatment),
        cacheStatus: 'inline',
        modelName: 'gemini-test',
      };
    };
    const result = await planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: generator,
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    });

    if (!capturedRequest) throw new Error('Expected video treatment generator to receive a request.');
    const request = capturedRequest;
    expect(result.treatment.captureRequirements).toEqual([]);
    expect(JSON.stringify(result.treatment)).not.toContain('assetRecommendation');
    expect(JSON.stringify(result.treatment)).not.toContain('keyframes');
    expect(request.prompt).toContain('<tf_untrusted_data');
    expect(request.systemInstruction).toContain('<creative_content_knowledge_retrieval>');
    expect(request.systemInstruction).toContain('constraint:overlay.visual_clutter');
    expect(request.systemInstruction).not.toContain(result.treatment.treatmentId);
    for (const label of [
      'talking head',
      'product film',
      'documentary',
      'explainer',
      'cinematic',
    ]) {
      expect(request.cacheSystemInstruction.toLowerCase()).not.toContain(label);
    }
    expect(request.cacheSystemInstruction).not.toMatch(/\b(?:ad|ugc)\b/i);
    expect(request.cacheSystemInstruction).toContain('semantic evidence');
    expect(request.cacheSystemInstruction).toContain('non-authoritative metadata');
    expect(request.thinkingBudgetTokens).toBeGreaterThan(0);
  });

  it.each([
    ['Spanish label', 'Quiero un documental experimental sobre nuestra marca.'],
    ['Hindi label', 'हमारे उत्पाद के लिए एक सिनेमाई विज्ञापन बनाओ।'],
    ['Japanese label', 'これはプロダクトフィルムです。'],
    ['unusual invented form', 'Create a chlorophyll opera for our launch.'],
  ])('keeps a label-only %s request inside untrusted data without local acquisition inference', async (_caseName, userPrompt) => {
    let capturedRequest: Parameters<NonNullable<VideoTreatmentPlannerDependencies['generate']>>[0] | undefined;
    const result = await planVideoTreatment(makeInput({ userPrompt }), {
      cache: memoryCache(),
      generate: async (request) => {
        capturedRequest = request;
        return {
          result: modelOutputFrom(abstractExplainerTreatment),
          cacheStatus: 'inline',
          modelName: 'gemini-test',
        };
      },
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    });

    if (!capturedRequest) throw new Error('Expected video treatment generator to receive a request.');
    expect(capturedRequest.prompt).toContain(userPrompt);
    expect(result.treatment.audiovisualIntent).toEqual({
      version: 1,
      audibleSpeech: 'unspecified',
      onCameraSpeech: 'unspecified',
      visiblePerson: 'unspecified',
      physicalCapture: 'unspecified',
    });
    expect(result.treatment.captureRequirements).toEqual([]);
  });

  it('accepts only server-declared mandatory writing constraint provenance', async () => {
    let capturedRequest: Parameters<NonNullable<VideoTreatmentPlannerDependencies['generate']>>[0] | undefined;
    const accepted = modelOutputFrom(abstractExplainerTreatment);
    accepted.decisionTrace.appliedConstraintIds = [
      'ai_filler_words',
      'unverifiable_claim',
    ];

    const result = await planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: async (request) => {
        capturedRequest = request;
        return { result: accepted, cacheStatus: 'inline', modelName: 'gemini-test' };
      },
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    });

    if (!capturedRequest) throw new Error('Expected video treatment generator to receive a request.');
    expect(result.treatment.decisionTrace.appliedConstraintIds).toEqual([
      'ai_filler_words',
      'unverifiable_claim',
    ]);
    expect(result.knowledge.writingKnowledge.traceConstraintIds).toEqual(expect.arrayContaining([
      'ai_filler_words',
      'unverifiable_claim',
    ]));
    expect(capturedRequest.prompt).toContain('"writingConstraintIds"');
    expect(capturedRequest.prompt).toContain('ai_filler_words');

    const rejected = modelOutputFrom(abstractExplainerTreatment);
    rejected.decisionTrace.appliedConstraintIds = ['ai_filler_words', 'invented_writing_constraint'];

    await expect(planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: async () => ({ result: rejected, cacheStatus: 'inline', modelName: 'gemini-test' }),
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    })).rejects.toMatchObject({
      code: 'provenance_invalid',
      message: expect.stringContaining('trace_constraint:invented_writing_constraint'),
    } satisfies Partial<VideoTreatmentPlannerError>);
  });

  it('canonicalizes the observed server-context evidence labels against one declared decision policy', async () => {
    let capturedRequest: Parameters<NonNullable<VideoTreatmentPlannerDependencies['generate']>>[0] | undefined;
    const accepted = modelOutputFrom(abstractExplainerTreatment);
    accepted.decisionTrace.decisions = [
      {
        id: 'd_02_visual_verbal_relationship',
        decision: 'Use complementary visuals for the causal explanation.',
        rationale: 'The editorial plan establishes the explanatory relationship.',
        evidenceIds: ['editorial_plan'],
        confidence: 0.8,
      },
      {
        id: 'd_03_visual_rhythm',
        decision: 'Vary visual intensity at the strongest signal turns.',
        rationale: 'The content signal profile identifies where emphasis matters.',
        evidenceIds: ['contentSignalProfile'],
        confidence: 0.8,
      },
      {
        id: 'd_04_information_hierarchy',
        decision: 'Present the core claim before supporting proof.',
        rationale: 'The editorial plan defines the order of explanation.',
        evidenceIds: ['editorial_plan'],
        confidence: 0.8,
      },
      {
        id: 'd_05_audio_voice_strategy',
        decision: 'Keep narration measured and let sound support transitions.',
        rationale: 'The brand and editorial plan both require a calm explanation.',
        evidenceIds: ['brandContext', 'editorial_plan'],
        confidence: 0.8,
      },
      {
        id: 'd_06_capture_requirements',
        decision: 'Request capture only where direct evidence is genuinely needed.',
        rationale: 'The production brief and content signals bound the evidence need.',
        evidenceIds: ['productionBrief', 'contentSignalProfile'],
        confidence: 0.8,
      },
    ];

    const result = await planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: async (request) => {
        capturedRequest = request;
        return { result: accepted, cacheStatus: 'inline', modelName: 'gemini-test' };
      },
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    });

    if (!capturedRequest) throw new Error('Expected video treatment generator to receive a request.');
    expect(result.treatment.decisionTrace.decisions.map(({ id, evidenceIds }) => ({ id, evidenceIds }))).toEqual([
      { id: 'd_02_visual_verbal_relationship', evidenceIds: ['context_editorial_plan'] },
      { id: 'd_03_visual_rhythm', evidenceIds: ['context_content_signal_profile'] },
      { id: 'd_04_information_hierarchy', evidenceIds: ['context_editorial_plan'] },
      {
        id: 'd_05_audio_voice_strategy',
        evidenceIds: ['context_brand_context', 'context_editorial_plan'],
      },
      {
        id: 'd_06_capture_requirements',
        evidenceIds: ['context_production_brief', 'context_content_signal_profile'],
      },
    ]);
    expect(capturedRequest.prompt).toContain('"decisionEvidenceIds"');
    expect(capturedRequest.prompt).toContain('context_editorial_plan');
    expect(capturedRequest.prompt).toContain('context_content_signal_profile');
  });

  it('fails closed for an undeclared decision-evidence ID', async () => {
    const invalid = modelOutputFrom(abstractExplainerTreatment);
    invalid.decisionTrace.decisions[0]!.evidenceIds = ['invented_decision_evidence'];

    await expect(planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: async () => ({ result: invalid, cacheStatus: 'inline', modelName: 'gemini-test' }),
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    })).rejects.toMatchObject({
      code: 'provenance_invalid',
      message: expect.stringContaining('decision_evidence:decision_1:invented_decision_evidence'),
    } satisfies Partial<VideoTreatmentPlannerError>);
  });

  it('uses a bounded model contract rather than accepting unbounded treatment prose', () => {
    const output = modelOutputFrom(abstractExplainerTreatment);
    output.narrativeArc = 'x'.repeat(1_801);

    expect(VideoTreatmentModelOutputSchema.safeParse(output).success).toBe(false);
  });

  it('recovers one provider-truncated treatment response with a compact retry', async () => {
    const lengthError = Object.assign(
      new Error('No object generated: could not parse the response.'),
      { name: 'AI_NoObjectGeneratedError', finishReason: 'length' },
    );
    const generator = vi.fn()
      .mockRejectedValueOnce(lengthError)
      .mockResolvedValueOnce({
        result: modelOutputFrom(abstractExplainerTreatment),
        cacheStatus: 'inline',
        modelName: 'gemini-test',
      });
    const receipts = vi.fn(async () => undefined);

    const result = await planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: generator,
      recordReceipt: receipts,
      knowledge: { loadEditronGraph: graphFixture },
    });

    const initialRequest = generator.mock.calls[0]?.[0] as Parameters<NonNullable<VideoTreatmentPlannerDependencies['generate']>>[0];
    const recoveryRequest = generator.mock.calls[1]?.[0] as Parameters<NonNullable<VideoTreatmentPlannerDependencies['generate']>>[0];
    expect(generator).toHaveBeenCalledTimes(2);
    expect(recoveryRequest.maxTokens).toBe(initialRequest.maxTokens);
    expect(recoveryRequest.thinkingBudgetTokens).toBeLessThan(initialRequest.thinkingBudgetTokens);
    expect(recoveryRequest.prompt).toContain('<video_treatment_length_recovery>');
    expect(result.treatment.treatmentId).toMatch(/^treatment_/);
    expect(receipts).toHaveBeenCalledWith(expect.objectContaining({ recoveryAttempted: true }));
  });

  it('returns a stable planner error after a second truncated response', async () => {
    const lengthError = Object.assign(
      new Error('No object generated: could not parse the response.'),
      { name: 'AI_NoObjectGeneratedError', finishReason: 'length' },
    );
    const generator = vi.fn().mockRejectedValue(lengthError);

    await expect(planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: generator,
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    })).rejects.toMatchObject({
      code: 'response_truncated',
      message: 'ThinkForge could not complete the audiovisual plan after a bounded retry. Please try again.',
    } satisfies Partial<VideoTreatmentPlannerError>);
    expect(generator).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a treatment invents source provenance', async () => {
    const invalid = modelOutputFrom(abstractExplainerTreatment);
    invalid.visualEvents[0]!.sourceRefs = ['invented_source'];

    await expect(planVideoTreatment(makeInput(), {
      cache: memoryCache(),
      generate: async () => ({ result: invalid, cacheStatus: 'inline', modelName: 'gemini-test' }),
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    })).rejects.toMatchObject({
      code: 'provenance_invalid',
    } satisfies Partial<VideoTreatmentPlannerError>);
  });

  it('rejects non-video authoring before it reaches the planner', async () => {
    const postRequest = createThinkForgeAuthoringRequest({
      contentContract: createThinkForgeWriterContract('social_post'),
      platformSurface: { id: 'linkedin' },
      publishingSurface: 'linkedin_post',
      postControls: {
        version: 1,
        cta: { preference: 'none' },
        hashtags: { preference: 'none' },
        emoji: { preference: 'none' },
      },
    });
    const postInput = makeInput({ authoringRequest: postRequest });

    await expect(planVideoTreatment(postInput, {
      cache: memoryCache(),
      generate: async () => ({ result: modelOutputFrom(abstractExplainerTreatment), cacheStatus: 'inline', modelName: 'gemini-test' }),
      recordReceipt: async () => undefined,
      knowledge: { loadEditronGraph: graphFixture },
    })).rejects.toMatchObject({
      code: 'unsupported_output',
    } satisfies Partial<VideoTreatmentPlannerError>);
  });
});
