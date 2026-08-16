import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateStructuredWithWritingContextCacheMock } = vi.hoisted(() => ({
  generateStructuredWithWritingContextCacheMock: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/gemini-writing-context-cache', () => ({
  generateStructuredWithWritingContextCache: generateStructuredWithWritingContextCacheMock,
}));

import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  assertUsableScriptWriterResult,
  materializeScriptWriterResult,
  ScriptWriterAgent,
  ScriptWriterModelOutputSchema,
  type ScriptWriterModelOutput,
  type ScriptWriterResult,
} from '@/lib/thinkforge/agents/script-writer-agent';
import { buildThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger';
import { buildContinuedThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger-continuity';
import {
  SCRIPT_SIDECAR_V2_VERSION,
  ScriptSidecarV2Schema,
  type NarrativeBeatV2,
  type NarrativeSceneV2,
  type ScriptWriterSidecarV2,
} from '@/lib/thinkforge/schemas/script-sidecar-v2';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals';

type ShotIntent = NonNullable<NarrativeBeatV2['shotIntent']>;

const narrator = { id: 'narrator', name: 'Narrator', role: 'narrator' as const };
const host = { id: 'host', name: 'Host', role: 'host' as const };

function makeShotIntent(overrides: Partial<ShotIntent> = {}): ShotIntent {
  return {
    narrativePurpose: 'Make the operational change concrete.',
    emotionalBeat: 'Recognition followed by controlled relief.',
    energy: 0.55,
    visualPriority: 'One accountable approval owner remains readable.',
    action: 'still',
    desiredFraming: 'medium',
    desiredAngle: 'eye-level',
    desiredMovement: 'static',
    simultaneousPerformers: 0,
    spokenAudio: false,
    performance: [],
    continuity: { wardrobe: [], props: ['approval board'], previousSceneIds: [] },
    ...overrides,
  };
}

function makeBeat(index: number, overrides: Partial<NarrativeBeatV2> = {}): NarrativeBeatV2 {
  return {
    id: `beat_${index}`,
    kind: 'voiceover',
    narrativePurpose: index === 1
      ? 'Expose the hidden cost of scattered approval loops.'
      : 'Show the simpler operating model.',
    durationIntentSeconds: 21,
    lines: [{
      id: `line_${index}`,
      text: index === 1
        ? 'Launches rarely fail in one dramatic moment; they stall inside approval loops that nobody owns.'
        : 'One accountable owner turns repeated feedback into a decision the team can actually ship.',
      speakerId: 'narrator',
      languageCode: 'en',
      onCamera: false,
      delivery: 'voiceover',
      sourceRefs: [],
    }],
    visualIntent: {
      description: index === 1
        ? 'Scattered comments and slipped calendar cards surround an ownerless approval board.'
        : 'A clean production board highlights one approval owner and a finished asset.',
      motion: index === 1
        ? 'A restrained push toward the unresolved board.'
        : 'A gentle pan reveals the named owner.',
      onScreenText: [],
      imageQualityTokens: 'clean product-documentary lighting',
      videoQualityTokens: 'stable movement with readable workflow detail',
      assetRecommendation: 'ai-video',
    },
    audioIntent: {
      ambience: 'Quiet operations workspace.',
      music: index === 1 ? 'Subtle tension.' : 'Restrained lift.',
      sfx: [],
    },
    shotIntent: makeShotIntent(index === 1
      ? { desiredMovement: 'push-in', movementMotivation: 'Move closer as the hidden cost becomes clear.' }
      : { desiredMovement: 'pan', movementMotivation: 'Reveal the named owner after the clean workflow.' }),
    sourceRefs: [],
    ...overrides,
  };
}

function makeScene(index: number, overrides: Partial<NarrativeSceneV2> = {}): NarrativeSceneV2 {
  return {
    id: `scene_${index}`,
    title: index === 1 ? 'The stalled launch' : 'The cleaner lane',
    narrativePurpose: index === 1
      ? 'Reveal why approval work stalls.'
      : 'Resolve the problem with clear ownership.',
    durationIntentSeconds: 21,
    mood: index === 1 ? 'serious' : 'calm',
    charactersPresent: [],
    sourceRefs: [],
    beats: [makeBeat(index)],
    ...overrides,
  };
}

function makeSidecar(overrides: Partial<ScriptWriterSidecarV2> = {}): ScriptWriterSidecarV2 {
  return {
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines',
    characters: [narrator],
    acts: [{
      id: 'act_1',
      title: 'Approval ownership',
      narrativePurpose: 'Move from hidden friction to a practical operating decision.',
      narrativeScenes: [makeScene(1), makeScene(2)],
    }],
    creativeDirection: {
      overallMusicPrompt: 'Restrained documentary bed with a light pulse.',
      colorPalette: ['charcoal', 'warm white', 'muted yellow'],
      environmentNotes: 'A practical operations workspace.',
    },
    sourceRefs: [],
    ...overrides,
  };
}

function sidecarWithScenes(
  scenes: NarrativeSceneV2[],
  overrides: Partial<ScriptWriterSidecarV2> = {},
): ScriptWriterSidecarV2 {
  return makeSidecar({
    acts: [{
      id: 'act_1',
      title: 'Approval ownership',
      narrativePurpose: 'Move from hidden friction to a practical operating decision.',
      narrativeScenes: scenes,
    }],
    ...overrides,
  });
}

function makeModelOutput(overrides: Partial<ScriptWriterModelOutput> = {}): ScriptWriterModelOutput {
  return {
    contentAnalysis: {
      hooks: ['Approval loops cost launches.'],
      theme: 'Single-owner approvals.',
      emphasisPoints: ['Hidden cost', 'Ownership fix'],
      qualityScore: 92,
    },
    visualMetadata: {
      motionInfo: 'Restrained documentary pacing with clear workflow details.',
    },
    metadata: { platform: 'instagram' },
    sidecar: makeSidecar(),
    ...overrides,
  };
}

function resultFromSidecar(sidecar: ScriptWriterSidecarV2, platform = 'instagram'): ScriptWriterResult {
  return materializeScriptWriterResult(makeModelOutput({ sidecar, metadata: { platform } }));
}

function makeResult(overrides: Partial<ScriptWriterResult> = {}): ScriptWriterResult {
  return { ...resultFromSidecar(makeSidecar()), ...overrides };
}

function withSpokenWordCount(beat: NarrativeBeatV2, count: number): NarrativeBeatV2 {
  const firstLine = beat.lines[0]!;
  return {
    ...beat,
    lines: [{
      ...firstLine,
      text: Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' '),
    }],
  };
}

function brief(options: {
  targetDurationSec?: number;
  voiceLanguages?: string[];
  platform?: ProductionBrief['output']['platform'];
  casting?: ProductionBrief['casting'];
} = {}): ProductionBrief {
  return {
    entryPoint: 'thinkforge',
    output: {
      format: 'reel',
      platform: options.platform ?? 'youtube',
      aspectRatio: '16:9',
      ...(options.targetDurationSec ? { targetDurationSec: options.targetDurationSec } : {}),
      count: 1,
      voiceLanguages: options.voiceLanguages ?? ['en'],
    },
    resolution: {
      fieldConfidence: {},
      inferred: [],
      confirmed: [],
    },
    ...(options.casting ? { casting: options.casting } : {}),
  };
}

function castingBrief(voice: 'cloned' | 'preset' | 'none'): ProductionBrief {
  const voiceBinding = voice === 'cloned'
    ? { mode: 'cloned' as const, voiceReferenceUrl: 'https://cdn.example.test/host.wav' }
    : voice === 'preset'
      ? { mode: 'preset' as const, ttsVoiceId: 'voice_warm_1' }
      : { mode: 'none' as const };
  return brief({
    platform: 'instagram-reels',
    voiceLanguages: ['en'],
    casting: {
      map: {
        host: {
          avatarProfileId: 'avatar_profile_primary',
          voice: voiceBinding,
        },
      },
    },
  });
}

function hostVoiceoverSidecar(): ScriptWriterSidecarV2 {
  const beat = makeBeat(1, {
    lines: [{
      id: 'line_host_1',
      text: 'Put one accountable owner between draft and publish.',
      speakerId: 'host',
      languageCode: 'en',
      onCamera: false,
      delivery: 'voiceover',
      sourceRefs: [],
    }],
    shotIntent: makeShotIntent(),
  });
  return sidecarWithScenes([
    makeScene(1, { durationIntentSeconds: 21, beats: [beat] }),
  ], { characters: [host] });
}

describe('ScriptWriterAgent prompt contract', () => {
  it('describes native narrative authoring and keeps renderer constraints downstream', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const prompt = new ScriptWriterAgent().buildPrompt({
      context: {
        projectSummary: 'Founder-led launch reel.',
        systemBrief: 'Brand voice: direct, practical, warm.',
      },
      userPrompt: 'Make me the host, speaking only when the story needs it.',
      productionBrief: castingBrief('cloned'),
    });

    expect(prompt).toContain('## Avatar Casting Contract');
    expect(prompt).toContain('characterId "host"');
    expect(prompt).toContain('Avatar Vault profile "avatar_profile_primary"');
    expect(prompt).toContain('acts -> narrativeScenes -> beats -> lines');
    expect(prompt).toContain('Runtime never creates, forbids, or counts acts, scenes, or beats');
    expect(prompt).toContain('structure.recommendedTechniques are advisory candidates');
    expect(prompt).toContain('Every spoken line declares its actual languageCode');
    expect(prompt).toContain('Do not author visible markdown, duplicate narration fields, or renderPlan');
    expect(prompt).toContain('Do not split, shorten, translate, or move speech merely to satisfy a renderer');
    expect(prompt).toContain('Never target an arbitrary on-camera ratio');
    expect(prompt).toContain('Do not mention lip-sync job length');
    expect(prompt).toContain('Never invent equipment');
    expect(prompt).not.toContain('on-camera speaking beat >10s');
    expect(prompt).not.toContain('unsupported spoken language');
  });

  it('maps reordered retrieved facts to their immutable ledger references', () => {
    const factA = { id: 'fact_a', title: 'Fact A', summary: 'Earlier approved evidence.', tags: [] };
    const factB = { id: 'fact_b', title: 'Fact B', summary: 'Current approved evidence.', tags: [] };
    const retrieved = (projectFacts: typeof factA[]) => ({
      brandDNA: {},
      projectFacts,
      globalFacts: [],
      semanticFacts: [],
      interactionPatterns: [],
    });
    const original = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Write the original script.',
      retrievedContext: retrieved([factA, factB]),
    });
    const edited = buildContinuedThinkForgeSourceLedger({
      userPrompt: 'Tighten the opening.',
      retrievedContext: retrieved([factB]),
      previousLedger: original,
    });
    const prompt = new ScriptWriterAgent().buildPrompt({
      context: { projectSummary: 'Evidence-led script.' },
      userPrompt: 'Tighten the opening.',
      retrievedContext: retrieved([factB]),
      sourceLedger: edited,
      editContext: {
        existingContent: 'An existing script grounded in approved evidence.',
        instruction: 'Tighten the opening.',
      },
    });

    expect(prompt).toMatch(/"sourceId"\s*:\s*"source_2"[\s\S]{0,160}"title"\s*:\s*"Fact B"/);
    expect(prompt).toContain('brief_edit_1');
  });
});

describe('ScriptWriterAgent structured generation', () => {
  beforeEach(() => {
    generateStructuredWithWritingContextCacheMock.mockReset();
  });

  it('uses one schema-constrained cached completion and derives result metadata', async () => {
    const modelOutput = makeModelOutput();
    generateStructuredWithWritingContextCacheMock.mockResolvedValue({
      result: modelOutput,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write a short Instagram video script for the launch.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledWith(expect.objectContaining({
      schema: ScriptWriterModelOutputSchema,
      prompt: expect.stringContaining('Write a short Instagram video script for the launch.'),
    }));
    expect(modelOutput.metadata).toEqual({ platform: 'instagram' });
    expect(output.result.metadata).toEqual({
      estimatedTimeSeconds: 42,
      platform: 'instagram',
      voiceLanguages: ['en'],
    });
    expect(output.metadata?.notes).toBe('writing_context_cache:hit');
    expect(output.result).toEqual(materializeScriptWriterResult(modelOutput));
  });

  it.each([
    {
      name: 'spoken-line language',
      failure: 'missing_spoken_line_language',
      mutate: (output: ScriptWriterModelOutput) => {
        delete output.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!.languageCode;
      },
    },
    {
      name: 'scene and beat duration intent',
      failure: 'missing_scene_duration',
      mutate: (output: ScriptWriterModelOutput) => {
        const scene = output.sidecar.acts[0]!.narrativeScenes[0]!;
        delete scene.durationIntentSeconds;
        delete scene.beats[0]!.durationIntentSeconds;
      },
    },
    {
      name: 'shot intent',
      failure: 'missing_shot_intent',
      mutate: (output: ScriptWriterModelOutput) => {
        delete output.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent;
      },
    },
    {
      name: 'visual intent',
      failure: 'missing_visual_intent',
      mutate: (output: ScriptWriterModelOutput) => {
        delete output.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.visualIntent;
      },
    },
  ])('performs one bounded repair for missing $name', async ({ failure, mutate }) => {
    const invalid = makeModelOutput();
    mutate(invalid);
    const repaired = makeModelOutput();
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write the complete video script.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0]).toMatchObject({
      schema: ScriptWriterModelOutputSchema,
      temperature: 0.25,
      prompt: expect.stringContaining('<writer_contract_repair>'),
      systemInstruction: expect.stringContaining(failure),
    });
    expect(output.metadata?.notes).toContain('script_contract_repair:applied');
    expect(() => assertUsableScriptWriterResult(output.result)).not.toThrow();
  });

  it('repairs sparse seven-minute prose once using the runtime contract', async () => {
    const sparseBeat = makeBeat(1, { durationIntentSeconds: 420 });
    const invalid = makeModelOutput({
      metadata: { platform: 'youtube' },
      sidecar: sidecarWithScenes([
        makeScene(1, { durationIntentSeconds: 420, beats: [sparseBeat] }),
      ]),
    });
    const completeBeat = withSpokenWordCount(makeBeat(1, { durationIntentSeconds: 420 }), 840);
    const repaired = makeModelOutput({
      metadata: { platform: 'youtube' },
      sidecar: sidecarWithScenes([
        makeScene(1, { durationIntentSeconds: 420, beats: [completeBeat] }),
      ]),
    });
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Long-form creative production explainer.' },
      userPrompt: 'Write a seven-minute YouTube explainer.',
      productionBrief: brief({ targetDurationSec: 420 }),
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0]?.systemInstruction)
      .toContain('spoken_word_count_mismatch');
    expect(output.result.metadata.estimatedTimeSeconds).toBe(420);
    expect(output.result.sidecar.renderPlan).toBeUndefined();
    expect(() => assertUsableScriptWriterResult(output.result, {
      productionBrief: brief({ targetDurationSec: 420 }),
    })).not.toThrow();
  });

  it('repairs a critical Brand Vault violation once before returning a script', async () => {
    const invalid = makeModelOutput();
    invalid.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!.text =
      'This game-changing approval workflow fixes every launch.';
    const repaired = makeModelOutput();
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: 'Write a short video script about approval workflow ownership.',
      project: { platform: 'Instagram', format: 'script' },
      retrievedContext: {
        brandDNA: { killList: ['game-changing'] },
        projectFacts: [],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
    });
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write a short video script about approval workflow ownership.',
      contentSignalProfile,
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0]?.systemInstruction)
      .toContain('profile_forbidden_term');
    expect(output.result.content).not.toContain('game-changing');
  });

  it('keeps a second critical Brand Vault violation out of persistence', () => {
    const service = readFileSync(
      new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url),
      'utf8',
    );
    const profileGate = service.indexOf('assertNoCriticalContentProfileViolations(compliance.violations)');
    const persistence = service.indexOf("type: 'ReplaceDocument'", profileGate);

    expect(profileGate).toBeGreaterThan(-1);
    expect(persistence).toBeGreaterThan(profileGate);
  });

  it('materializes deterministic markdown and one visual prompt per narrative scene', () => {
    const firstScene = makeScene(1, {
      beats: [
        makeBeat(1, {
          durationIntentSeconds: 10,
          lines: [{
            ...makeBeat(1).lines[0]!,
            text: 'The approved line stays canonical.\n## Scene 99: not a real scene',
          }],
        }),
        makeBeat(3, { durationIntentSeconds: 11 }),
      ],
    });
    const modelOutput = makeModelOutput({
      sidecar: sidecarWithScenes([firstScene, makeScene(2)]),
    });

    const first = materializeScriptWriterResult(modelOutput);
    const second = materializeScriptWriterResult(modelOutput);

    expect(first).toEqual(second);
    expect(first.content.match(/^## Scene \d+/gm)).toHaveLength(2);
    expect(first.content.match(/^### Beat \d+/gm)).toHaveLength(2);
    expect(first.content).toContain('The approved line stays canonical. ## Scene 99: not a real scene');
    expect(first.visualMetadata.scenePrompts).toHaveLength(2);
    expect(first.visualMetadata.scenePrompts[0]).toContain('Beat 1:');
    expect(first.visualMetadata.scenePrompts[0]).toContain('Beat 2:');
  });

  it('surfaces an unrepairable provider failure without starting another call', async () => {
    generateStructuredWithWritingContextCacheMock.mockRejectedValue(new Error('invalid sidecar enum'));

    await expect(new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write a short Instagram video script for the launch.',
    })).rejects.toThrow('invalid sidecar enum');

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe('native Script Sidecar V2 production semantics', () => {
  it('accepts a 420-second coherent narrative beat without a render plan', () => {
    const longBeat = withSpokenWordCount(makeBeat(1, { durationIntentSeconds: 420 }), 840);
    const sidecar = sidecarWithScenes([
      makeScene(1, { durationIntentSeconds: 420, beats: [longBeat] }),
    ]);
    const result = resultFromSidecar(sidecar, 'youtube');
    const authoredScene = result.sidecar.acts[0]!.narrativeScenes[0]!;
    const authoredBeat = authoredScene.beats[0]!;

    expect(sidecar).not.toHaveProperty('renderPlan');
    expect(result.sidecar.acts[0]?.narrativeScenes).toHaveLength(1);
    expect(authoredScene.narrativePurpose).toBe('Reveal why approval work stalls.');
    expect(authoredScene.durationIntentSeconds).toBe(420);
    expect(authoredScene.beats).toHaveLength(1);
    expect(authoredBeat.narrativePurpose).toBe('Expose the hidden cost of scattered approval loops.');
    expect(authoredBeat.durationIntentSeconds).toBe(420);
    expect(authoredScene.beats.some((beat) => beat.durationIntentSeconds === 60)).toBe(false);
    expect(result.metadata.estimatedTimeSeconds).toBe(420);
    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: brief({ targetDurationSec: 420 }),
    })).not.toThrow();
  });

  it('preserves requested Hindi and multilingual lines instead of forcing English', () => {
    const beat = makeBeat(1, {
      lines: [
        {
          id: 'line_hi',
          text: 'Yeh kahani seedhe asli samasya se shuru hoti hai.',
          speakerId: 'narrator',
          languageCode: 'hi',
          onCamera: false,
          delivery: 'voiceover',
          sourceRefs: [],
        },
        {
          id: 'line_en',
          text: 'Then the evidence moves the argument forward.',
          speakerId: 'narrator',
          languageCode: 'en',
          onCamera: false,
          delivery: 'voiceover',
          sourceRefs: [],
        },
      ],
    });
    const result = resultFromSidecar(sidecarWithScenes([
      makeScene(1, { beats: [beat] }),
    ]), 'youtube');

    expect(result.metadata.voiceLanguages).toEqual(['hi', 'en']);
    expect(result.content).toContain('Yeh kahani seedhe asli samasya se shuru hoti hai.');
    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: brief({ voiceLanguages: ['hi', 'en'] }),
    })).not.toThrow();
  });

  it('rejects a technical render plan at the model-facing writer boundary', () => {
    const canonicalLine = makeSidecar().acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!;
    const candidate = {
      ...makeModelOutput(),
      sidecar: {
        ...makeSidecar(),
        renderPlan: {
          version: 1,
          source: 'technical-planner',
          renderSegments: [{
            id: 'render_segment_1',
            kind: 'voiceover',
            narrativeSceneId: 'scene_1',
            beatId: 'beat_1',
            lineSpans: [{
              lineId: canonicalLine.id,
              startOffsetUtf16: 0,
              endOffsetUtf16: 10,
            }],
            durationSeconds: 21,
          }],
        },
      },
    };

    const writerOutput = ScriptWriterModelOutputSchema.safeParse(candidate);
    const persistedSidecar = ScriptSidecarV2Schema.safeParse(candidate.sidecar);

    expect(writerOutput.success).toBe(false);
    if (!writerOutput.success) {
      expect(writerOutput.error.issues.some((issue) => issue.path.join('.') === 'sidecar')).toBe(true);
    }
    expect(persistedSidecar.success).toBe(true);
  });

  it('rejects any tampering with server-materialized content, prompts, duration, or languages', () => {
    const result = makeResult();

    expect(() => assertUsableScriptWriterResult({ ...result, content: 'tampered prose' }))
      .toThrow(/materialized_content_mismatch/);
    expect(() => assertUsableScriptWriterResult({
      ...result,
      visualMetadata: { ...result.visualMetadata, scenePrompts: ['tampered prompt'] },
    })).toThrow(/materialized_scene_prompts_mismatch/);
    expect(() => assertUsableScriptWriterResult({
      ...result,
      metadata: { ...result.metadata, estimatedTimeSeconds: 60 },
    })).toThrow(/materialized_duration_mismatch/);
    expect(() => assertUsableScriptWriterResult({
      ...result,
      metadata: { ...result.metadata, voiceLanguages: ['hi'] },
    })).toThrow(/materialized_voice_languages_mismatch/);
  });

  it('rejects an invalid same-pass sidecar', () => {
    expect(() => assertUsableScriptWriterResult({
      ...makeResult(),
      sidecar: undefined as unknown as ScriptWriterResult['sidecar'],
    })).toThrow(/invalid_sidecar/);
  });

  it('accepts factual claims when scene, beat, and line provenance resolve', () => {
    const ledger = buildThinkForgeSourceLedger({ userPrompt: 'Adobe raised prices by 12 percent.' });
    const factBeat = makeBeat(1, {
      narrativePurpose: 'Explain why Adobe raised prices by 12 percent.',
      visualIntent: {
        ...makeBeat(1).visualIntent!,
        description: 'A 12 percent price change is shown as a sourced abstract comparison.',
      },
      sourceRefs: ['brief_user'],
      lines: [{
        ...makeBeat(1).lines[0]!,
        text: 'Adobe raised prices by 12 percent.',
        sourceRefs: ['brief_user'],
      }],
    });
    const sidecar = sidecarWithScenes([
      makeScene(1, {
        title: 'The 12 percent change',
        narrativePurpose: 'Explain the sourced 12 percent change.',
        sourceRefs: ['brief_user'],
        beats: [factBeat],
      }),
    ], { sourceRefs: ['brief_user'] });

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar), {
      sourceLedger: ledger,
    })).not.toThrow();
  });

  it('reports missing factual provenance independently at scene, beat, and line level', () => {
    const ledger = buildThinkForgeSourceLedger({ userPrompt: 'Adobe raised prices by 12 percent.' });
    const factBeat = makeBeat(1, {
      narrativePurpose: 'Explain the 12 percent price change.',
      visualIntent: {
        ...makeBeat(1).visualIntent!,
        description: 'A 12 percent price change appears in the comparison.',
      },
      sourceRefs: [],
      lines: [{
        ...makeBeat(1).lines[0]!,
        text: 'Adobe raised prices by 12 percent.',
        sourceRefs: [],
      }],
    });
    const sidecar = sidecarWithScenes([
      makeScene(1, {
        title: 'The 12 percent change',
        narrativePurpose: 'Explain the sourced 12 percent change.',
        sourceRefs: [],
        beats: [factBeat],
      }),
    ], { sourceRefs: ['brief_user'] });

    let message = '';
    try {
      assertUsableScriptWriterResult(resultFromSidecar(sidecar), { sourceLedger: ledger });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('missing_source_ref:act_1.scene_1');
    expect(message).toContain('missing_source_ref:act_1.scene_1.beat_1');
    expect(message).toContain('missing_source_ref:act_1.scene_1.beat_1.line_1');
  });

  it('rejects source references that do not exist in the authorised ledger', () => {
    const ledger = buildThinkForgeSourceLedger({ userPrompt: 'Adobe raised prices by 12 percent.' });
    const sidecar = makeSidecar({ sourceRefs: ['missing_ref'] });

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar), {
      sourceLedger: ledger,
    })).toThrow(/invalid_source_ref:sidecar:missing_ref/);
  });

  it('rejects spoken lines for a cast character whose voice mode is none', () => {
    const result = resultFromSidecar(hostVoiceoverSidecar(), 'instagram-reels');

    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: castingBrief('none'),
    })).toThrow(/cast_character_has_no_voice:host/);
  });

  it.each(['cloned', 'preset'] as const)(
    'allows %s avatar voice binding to deliver an off-camera voiceover',
    (voice) => {
      const result = resultFromSidecar(hostVoiceoverSidecar(), 'instagram-reels');

      expect(() => assertUsableScriptWriterResult(result, {
        productionBrief: castingBrief(voice),
      })).not.toThrow();
    },
  );

  it('rejects a script that omits a resolved avatar-cast character', () => {
    expect(() => assertUsableScriptWriterResult(makeResult(), {
      productionBrief: castingBrief('cloned'),
    })).toThrow(/missing_cast_character:host/);
  });

  it('rejects both runtime and prose density when a seven-minute request gets a short script', () => {
    let message = '';
    try {
      assertUsableScriptWriterResult(resultFromSidecar(makeSidecar(), 'youtube'), {
        productionBrief: brief({ targetDurationSec: 420 }),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('runtime_duration_mismatch:42s/420s');
    expect(message).toContain('spoken_word_count_mismatch');
    expect(message).not.toContain('scene_count');
  });

  it('rejects seven-minute duration metadata backed by sparse audible prose', () => {
    const sparseBeat = makeBeat(1, { durationIntentSeconds: 420 });
    const sidecar = sidecarWithScenes([
      makeScene(1, { durationIntentSeconds: 420, beats: [sparseBeat] }),
    ]);

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar, 'youtube'), {
      productionBrief: brief({ targetDurationSec: 420 }),
    })).toThrow(/spoken_word_count_mismatch/);
  });

  it('accepts a script that satisfies a 60-second runtime and spoken-word contract', () => {
    const completeBeat = withSpokenWordCount(makeBeat(1, { durationIntentSeconds: 60 }), 120);
    const sidecar = sidecarWithScenes([
      makeScene(1, { durationIntentSeconds: 60, beats: [completeBeat] }),
    ]);

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar, 'youtube'), {
      productionBrief: brief({ targetDurationSec: 60 }),
    })).not.toThrow();
  });
});
