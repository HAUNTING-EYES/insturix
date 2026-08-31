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
import {
  buildThinkForgeSourceLedger,
  findDirectlySupportingSourceReferenceIds,
} from '@/lib/thinkforge/provenance/source-ledger';
import { buildContinuedThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger-continuity';
import { ScriptEvidenceSufficiencyError } from '@/lib/thinkforge/provenance/script-evidence-sufficiency';
import {
  SCRIPT_SIDECAR_V2_VERSION,
  canonicalizeScriptWriterModelSidecarIds,
  parseScriptSidecarV2,
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
    movementMotivation: '',
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
    expect(prompt).toContain('creative narration keeps an empty sourceRefs array');
    expect(prompt).toContain('do not carry a citation mechanically across the sidecar');
    expect(prompt).toContain('Do not author visible markdown, duplicate narration fields, or renderPlan');
    expect(prompt).toContain('Do not split, shorten, translate, or move speech merely to satisfy a renderer');
    expect(prompt).toContain('Never target an arbitrary on-camera ratio');
    expect(prompt).toContain('Do not mention lip-sync job length');
    expect(prompt).toContain('Never invent equipment');
    expect(prompt).toContain('## Writing Knowledge: Anti-AI Constraints');
    expect(prompt).toContain('banned_phrase_list');
    expect(prompt).toContain('leave onScreenText empty by default');
    expect(prompt).toContain('never populate every narrated beat automatically');
    expect(prompt).not.toContain('on-camera speaking beat >10s');
    expect(prompt).not.toContain('unsupported spoken language');
  });

  it('sends the exact resolved proof contract that script validation enforces', () => {
    const userPrompt = 'Include that idling fuel use fell 31% during the measured period.';
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt,
      project: { platform: 'YouTube', format: 'script' },
    });
    const prompt = new ScriptWriterAgent().buildPrompt({
      context: { projectSummary: 'Evidence-led port pilot.' },
      userPrompt,
      contentSignalProfile,
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    });

    expect(contentSignalProfile.intent.proofPoints)
      .toContain('Required brief claim: idling fuel use fell 31% during the measured period');
    expect(prompt).toContain('"contentSignalProfile"');
    expect(prompt).toContain('Required brief claim: idling fuel use fell 31% during the measured period');
    expect(prompt).toContain('include that value exactly in natural script copy');
    expect(prompt).toContain('"evidencePolicy"');
    expect(prompt).toContain('"boundary": "source_only"');
    expect(prompt).toContain('A declared reference is not permission to broaden the source');
    expect(prompt).toContain('"mode": "source_bounded_inquiry"');
    expect(prompt).toContain('build a record-led inquiry');
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

  it('uses the canonical brief platform instead of repairing a model display label', async () => {
    const modelOutput = makeModelOutput({ metadata: { platform: 'General video' } });
    generateStructuredWithWritingContextCacheMock.mockResolvedValue({
      result: modelOutput,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'A platform-neutral product explainer.' },
      userPrompt: 'Create a general video script.',
      productionBrief: brief({ platform: 'unspecified' }),
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(output.result.metadata.platform).toBe('unspecified');
    expect(output.metadata?.notes).toBe('writing_context_cache:hit');
  });

  it('derives aggregate provenance from directly supported user-facing claims', async () => {
    const userPrompt = 'Adobe raised prices by 12 percent.';
    const sourceLedger = buildThinkForgeSourceLedger({
      userPrompt,
      retrievedContext: {
        brandDNA: {},
        projectFacts: [{
          id: 'pricing_review',
          title: 'Pricing review',
          summary: 'An internal pricing review is in progress.',
          tags: [],
        }],
        globalFacts: [],
        semanticFacts: [],
        interactionPatterns: [],
      },
    });
    const modelOutput = makeModelOutput();
    const scene = modelOutput.sidecar.acts[0]!.narrativeScenes[0]!;
    const beat = scene.beats[0]!;
    modelOutput.sidecar.sourceRefs = ['source_1'];
    scene.title = userPrompt;
    scene.narrativePurpose = userPrompt;
    scene.sourceRefs = ['source_1'];
    beat.narrativePurpose = userPrompt;
    beat.sourceRefs = ['source_1'];
    beat.visualIntent = {
      ...beat.visualIntent!,
      description: userPrompt,
      onScreenText: [userPrompt],
    };
    beat.lines = [{
      ...beat.lines[0]!,
      text: userPrompt,
      sourceRefs: ['source_1'],
    }];
    generateStructuredWithWritingContextCacheMock.mockResolvedValue({
      result: modelOutput,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Evidence-led pricing update.' },
      userPrompt,
      sourceLedger,
    });
    const normalizedScene = output.result.sidecar.acts[0]!.narrativeScenes[0]!;
    const normalizedBeat = normalizedScene.beats[0]!;

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0]?.prompt)
      .toContain('"boundary": "source_only"');
    expect(output.metadata?.notes).not.toContain('script_contract_repair:applied');
    expect(output.result.sidecar.sourceRefs).toEqual(['brief_user']);
    expect(normalizedScene.sourceRefs).toEqual(['brief_user']);
    expect(normalizedBeat.sourceRefs).toEqual(['brief_user']);
    expect(normalizedBeat.lines[0]?.sourceRefs).toEqual(['brief_user']);
    expect(normalizedBeat.visualIntent?.onScreenText).toEqual([]);
  });

  it('normalizes written and digit evidence markers without approving padded source claims', () => {
    const userPrompt = [
      'HarborGrid was a synthetic six-month port-electrification pilot across two cargo terminals.',
      '18 diesel yard tractors were replaced and idling fuel use fell 31% during the measured period.',
    ].join(' ');
    const sourceLedger = buildThinkForgeSourceLedger({ userPrompt });

    expect(findDirectlySupportingSourceReferenceIds(
      'Enter HarborGrid: a synthetic six-month port-electrification pilot.',
      sourceLedger,
    )).toEqual(['brief_user']);
    expect(findDirectlySupportingSourceReferenceIds(
      'HarborGrid Pilot: 6 Months',
      sourceLedger,
    )).toEqual(['brief_user']);
    expect(findDirectlySupportingSourceReferenceIds(
      'Idling fuel use was 31 percent lower during the measured period.',
      sourceLedger,
    )).toEqual(['brief_user']);
    expect(findDirectlySupportingSourceReferenceIds(
      'This was a hands-on, six-month pilot across two active cargo terminals.',
      sourceLedger,
    )).toEqual([]);

    const modelOutput = makeModelOutput();
    const beat = modelOutput.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!;
    beat.lines = [{
      ...beat.lines[0]!,
      text: 'Enter HarborGrid: a synthetic six-month port-electrification pilot.',
      sourceRefs: ['source_1'],
    }];
    beat.visualIntent = {
      ...beat.visualIntent!,
      onScreenText: ['HarborGrid Pilot: 6 Months'],
    };
    const result = materializeScriptWriterResult(modelOutput, sourceLedger);
    const normalizedBeat = result.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!;

    expect(normalizedBeat.lines[0]?.sourceRefs).toEqual(['brief_user']);
    expect(normalizedBeat.sourceRefs).toEqual(['brief_user']);
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

  it('records graph-defined AI filler as editorial guidance without a second full generation', async () => {
    const authored = makeModelOutput();
    authored.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!.text =
      'This nuanced approach transforms the approval workflow.';
    generateStructuredWithWritingContextCacheMock.mockResolvedValueOnce({
      result: authored,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write the complete video script.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(output.result.content).toContain('nuanced approach');
    expect(output.result.metadata.editorialWarnings).toContain('ai_filler_words:nuanced [approach]');
    expect(output.metadata?.notes).toContain('editorial_warnings:1');
  });

  it('repairs a plausible claim that is not supported by its valid source reference', async () => {
    const userPrompt = 'HarborGrid replaced 18 yard tractors and idling fuel use fell 31%.';
    const sourceLedger = buildThinkForgeSourceLedger({ userPrompt });
    const invalid = makeModelOutput();
    invalid.sidecar.sourceRefs = ['brief_user'];
    invalid.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0] = {
      ...invalid.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!,
      text: 'The pilot improved air quality and reduced queue congestion.',
      sourceRefs: ['brief_user'],
    };
    const repaired = makeModelOutput();
    repaired.sidecar.sourceRefs = ['brief_user'];
    repaired.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0] = {
      ...repaired.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!,
      text: 'HarborGrid replaced 18 yard tractors and idling fuel use fell 31%.',
      sourceRefs: ['brief_user'],
    };
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Evidence-led port pilot.' },
      userPrompt,
      sourceLedger,
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    const initialCall = generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0];
    const repairCall = generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0];
    expect(initialCall?.prompt).toContain('"boundary": "source_only"');
    expect(initialCall?.cacheSystemInstruction).toContain('Source-bounded narrative');
    expect(repairCall?.cacheSystemInstruction).toBe(initialCall?.cacheSystemInstruction);
    expect(repairCall?.systemInstruction).toContain('source_ref_low_support');
    expect(repairCall?.systemInstruction).toContain('A valid reference ID is not proof');
    expect(repairCall?.prompt).toContain('"evidencePolicy"');
    expect(repairCall?.prompt).toContain('"source_ref_low_support:act_1.scene_1.beat_1.line_1"');
    expect(output.result.content).toContain('idling fuel use fell 31%');
    expect(output.metadata?.notes).toContain('script_contract_repair:applied');
  });

  it('repairs structurally valid cross-field sidecar violations before persistence', async () => {
    const omitted = makeModelOutput();
    const omittedShot = omitted.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent! as {
      movementMotivation?: string;
    };
    delete omittedShot.movementMotivation;
    const invalid = makeModelOutput();
    const invalidShot = invalid.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!;
    invalidShot.energy = 4;
    invalidShot.movementMotivation = '';
    invalidShot.spokenAudio = true;
    const repaired = makeModelOutput();

    expect(ScriptWriterModelOutputSchema.safeParse(omitted).success).toBe(false);
    expect(ScriptWriterModelOutputSchema.safeParse(invalid).success).toBe(true);
    expect(ScriptSidecarV2Schema.safeParse(invalid.sidecar).success).toBe(false);

    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write the complete video script.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0]?.systemInstruction)
      .toMatch(/movementMotivation[\s\S]*spokenAudio/);
    expect(ScriptSidecarV2Schema.safeParse(output.result.sidecar).success).toBe(true);
    expect(output.metadata?.notes).toContain('script_contract_repair:applied');
  });

  it('repairs model scalars that violate the strict public result contract', async () => {
    const invalid = makeModelOutput();
    invalid.contentAnalysis.qualityScore = 140;
    const repaired = makeModelOutput();

    expect(ScriptWriterModelOutputSchema.safeParse(invalid).success).toBe(true);
    expect(() => materializeScriptWriterResult(invalid))
      .toThrow(/invalid_writer_result[\s\S]*qualityScore/);
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write the complete video script.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(output.result.contentAnalysis.qualityScore).toBe(92);
    expect(output.metadata?.notes).toContain('script_contract_repair:applied');
  });

  it('fails closed after one repair when the replacement still violates the sidecar contract', async () => {
    const invalid = makeModelOutput();
    invalid.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.movementMotivation = '';
    generateStructuredWithWritingContextCacheMock.mockResolvedValue({
      result: invalid,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    await expect(new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write the complete video script.',
    })).rejects.toThrow(/invalid_sidecar[\s\S]*movementMotivation/);
    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
  });

  it('exposes final rejected script output only during explicit eval diagnostics', async () => {
    const invalid = makeModelOutput();
    invalid.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.movementMotivation = '';
    generateStructuredWithWritingContextCacheMock.mockResolvedValue({
      result: invalid,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });
    const previousCapture = process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT;

    try {
      delete process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT;
      let productionError: unknown;
      try {
        await new ScriptWriterAgent().runStructured({
          context: { projectSummary: 'Approval workflow launch.' },
          userPrompt: 'Write the complete video script.',
        });
      } catch (error) {
        productionError = error;
      }
      expect((productionError as Error & { rejectedOutput?: unknown }).rejectedOutput).toBeUndefined();

      process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT = '1';
      let evalError: unknown;
      try {
        await new ScriptWriterAgent().runStructured({
          context: { projectSummary: 'Approval workflow launch.' },
          userPrompt: 'Write the complete video script.',
        });
      } catch (error) {
        evalError = error;
      }
      expect((evalError as Error & { rejectedOutput?: ScriptWriterModelOutput }).rejectedOutput)
        .toEqual(invalid);
      expect(Object.keys(evalError as Error)).not.toContain('rejectedOutput');
    } finally {
      if (previousCapture === undefined) delete process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT;
      else process.env.THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT = previousCapture;
    }
  });

  it('keeps mode-density and anti-AI wording as editorial guidance without a second full generation', async () => {
    const lowDensityBeat = withSpokenWordCount(
      makeBeat(1, { durationIntentSeconds: 420 }),
      745,
    );
    lowDensityBeat.lines[0] = {
      ...lowDensityBeat.lines[0]!,
      text: `This innovative solution ${lowDensityBeat.lines[0]!.text}`,
    };
    const authored = makeModelOutput({
      metadata: { platform: 'youtube' },
      sidecar: sidecarWithScenes([
        makeScene(1, { durationIntentSeconds: 420, beats: [lowDensityBeat] }),
      ]),
    });
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: authored, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Long-form creative production explainer.' },
      userPrompt: 'Write a seven-minute YouTube explainer.',
      productionBrief: brief({ targetDurationSec: 420 }),
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(output.result.metadata.estimatedTimeSeconds).toBe(420);
    expect(output.result.metadata.editorialWarnings).toEqual([
      'wpm_below_mode_guidance:106.9/120:standard_voiceover',
      'ai_filler_words:innovative [solution]',
    ]);
    expect(output.result.sidecar.renderPlan).toBeUndefined();
    expect(output.metadata?.notes).toContain('editorial_warnings:2');
    expect(() => assertUsableScriptWriterResult(output.result, {
      productionBrief: brief({ targetDurationSec: 420 }),
    })).not.toThrow();
  });

  it('returns excessive narration density as a server-owned warning without repair', async () => {
    const denseBeat = withSpokenWordCount(makeBeat(1, { durationIntentSeconds: 60 }), 180);
    const authored = makeModelOutput({
      metadata: { platform: 'youtube' },
      sidecar: sidecarWithScenes([
        makeScene(1, { durationIntentSeconds: 60, beats: [denseBeat] }),
      ]),
    });
    generateStructuredWithWritingContextCacheMock.mockResolvedValueOnce({
      result: authored,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'A one-minute production explainer.' },
      userPrompt: 'Write a one-minute YouTube explainer.',
      productionBrief: brief({ targetDurationSec: 60 }),
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(output.result.metadata.editorialWarnings).toEqual([
      'wpm_exceeds_format:180.0/170:standard_voiceover',
    ]);
    expect(output.metadata?.notes).toContain('editorial_warnings:1');
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

  it('repairs an omitted required proof claim using exact validator diagnostics', async () => {
    const userPrompt = 'Include that idling fuel use fell 31% during the measured period.';
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt,
      project: { platform: 'YouTube', format: 'script' },
    });
    const invalid = makeModelOutput();
    const repaired = makeModelOutput();
    repaired.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!.text =
      'Idling fuel use fell 31% during the measured period.';
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Evidence-led port pilot.' },
      userPrompt,
      contentSignalProfile,
    });

    const repairCall = generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0];
    expect(repairCall?.systemInstruction).toContain('profile_missing_required_brief_claim');
    expect(repairCall?.prompt).toContain('validatorDiagnostics');
    expect(repairCall?.prompt).toContain('Explicit brief claim is missing or altered');
    expect(repairCall?.prompt).toContain('idling fuel use fell 31% during the measured period');
    expect(output.result.content).toContain('Idling fuel use fell 31% during the measured period.');
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

  it('reissues duplicate model-owned sidecar IDs while retaining continuity and casting IDs', async () => {
    const firstScene = makeScene(1);
    const secondBeat = makeBeat(1, {
      shotIntent: makeShotIntent({
        continuity: {
          wardrobe: [],
          props: ['approval board'],
          previousSceneIds: ['scene_1'],
        },
      }),
    });
    const secondScene = makeScene(1, { beats: [secondBeat] });
    const duplicateIds = makeSidecar({
      acts: [
        {
          id: 'act_1',
          title: 'The original act',
          narrativePurpose: 'Establish the initial operating problem.',
          narrativeScenes: [firstScene],
        },
        {
          id: 'act_1',
          title: 'The repeated act id',
          narrativePurpose: 'Resolve the operating problem.',
          narrativeScenes: [secondScene],
        },
      ],
    });

    const modelSidecar = duplicateIds as unknown as ScriptWriterModelOutput['sidecar'];
    const continuity = modelSidecar.acts[1]!.narrativeScenes[0]!.beats[0]!.shotIntent!.continuity;
    continuity.previousSceneIds = [];
    continuity.previousBeatIndexes = [1];
    expect(ScriptWriterModelOutputSchema.safeParse(makeModelOutput({ sidecar: modelSidecar })).success).toBe(true);
    generateStructuredWithWritingContextCacheMock.mockResolvedValueOnce({
      result: makeModelOutput({ sidecar: modelSidecar }),
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write a short Instagram video script for the launch.',
    });
    const scenes = output.result.sidecar.acts.flatMap((act) => act.narrativeScenes);
    const beats = scenes.flatMap((scene) => scene.beats);
    const lines = beats.flatMap((beat) => beat.lines);

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(output.result.sidecar.acts.map((act) => act.id)).toEqual(['act_1', 'act_2']);
    expect(scenes.map((scene) => scene.id)).toEqual(['scene_1', 'scene_2']);
    expect(beats.map((beat) => beat.id)).toEqual(['beat_1', 'beat_2']);
    expect(lines.map((line) => line.id)).toEqual(['line_1', 'line_2']);
    expect(beats[1]?.shotIntent?.continuity.previousSceneIds).toEqual(['beat_1']);
    expect(output.result.sidecar.characters).toEqual([narrator]);
  });

  it('preserves master-plan act and scene IDs while issuing chapter beat and line IDs', () => {
    const chapterSidecar = makeSidecar({
      acts: [{
        id: 'act_observe',
        title: 'Observe the work',
        narrativePurpose: 'Establish the chapter evidence.',
        narrativeScenes: [makeScene(1, {
          id: 'scene_open',
          beats: [makeBeat(1), makeBeat(1)],
        })],
      }],
    });

    const normalized = parseScriptSidecarV2(canonicalizeScriptWriterModelSidecarIds(
      chapterSidecar as unknown as ScriptWriterModelOutput['sidecar'],
      { mode: 'chapter', chapterId: 'chapter_open' },
    ));
    const scene = normalized.acts[0]!.narrativeScenes[0]!;

    expect(normalized.acts[0]?.id).toBe('act_observe');
    expect(scene.id).toBe('scene_open');
    expect(scene.beats.map((beat) => beat.id)).toEqual([
      'beat_chapter_open_scene_open_1',
      'beat_chapter_open_scene_open_2',
    ]);
    expect(scene.beats.flatMap((beat) => beat.lines.map((line) => line.id))).toEqual([
      'line_chapter_open_scene_open_1_1',
      'line_chapter_open_scene_open_2_1',
    ]);
  });

  it('rejects an ambiguous legacy continuity alias instead of guessing a preceding beat', () => {
    const thirdBeat = makeBeat(1, {
      shotIntent: makeShotIntent({
        continuity: {
          wardrobe: [],
          props: ['approval board'],
          previousSceneIds: ['scene_1'],
        },
      }),
    });
    const ambiguous = makeSidecar({
      acts: [{
        id: 'act_1',
        title: 'Three repeated legacy scenes',
        narrativePurpose: 'Exercise legacy continuity safety.',
        narrativeScenes: [
          makeScene(1),
          makeScene(1),
          makeScene(1, { beats: [thirdBeat] }),
        ],
      }],
    });

    expect(() => canonicalizeScriptWriterModelSidecarIds(
      ambiguous as unknown as ScriptWriterModelOutput['sidecar'],
      { mode: 'ordinary' },
    )).toThrow(/ambiguous_legacy_continuity_alias:beat_3:scene_1/);
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

  it('rejects on-screen text that repeats the narration', () => {
    const firstBeat = makeBeat(1);
    const sidecar = sidecarWithScenes([
      makeScene(1, {
        beats: [{
          ...firstBeat,
          visualIntent: {
            ...firstBeat.visualIntent!,
            onScreenText: [firstBeat.lines[0]!.text],
          },
        }],
      }),
      makeScene(2),
    ]);

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar)))
      .toThrow(/on_screen_text_duplicates_speech:act_1\.scene_1\.beat_1:visual_1/);
  });

  it('rejects blanket on-screen text in a narration-led plan', () => {
    const firstBeat = makeBeat(1);
    const secondBeat = makeBeat(2);
    const sidecar = sidecarWithScenes([
      makeScene(1, {
        beats: [{
          ...firstBeat,
          visualIntent: { ...firstBeat.visualIntent!, onScreenText: ['Approval bottleneck'] },
        }],
      }),
      makeScene(2, {
        beats: [{
          ...secondBeat,
          visualIntent: { ...secondBeat.visualIntent!, onScreenText: ['Decision ownership'] },
        }],
      }),
    ]);

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar)))
      .toThrow(/on_screen_text_not_selective:2\/2/);
  });

  it('preserves an exact required claim and an approved brand phrase from the filler gate', () => {
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt: 'Include this exact claim: Our nuanced approach reduced handoff time by 31%.',
      project: { platform: 'YouTube', format: 'script' },
    });
    const firstBeat = makeBeat(1, {
      lines: [{
        ...makeBeat(1).lines[0]!,
        text: 'Our nuanced approach reduced handoff time by 31%.',
      }],
    });
    const sidecar = sidecarWithScenes([
      makeScene(1, { beats: [firstBeat] }),
    ]);

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar), {
      contentSignalProfile,
      brandLanguagePolicy: { approvedRecurringPhrases: ['nuanced approach'] },
    })).not.toThrow(/banned_phrase/);
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

  it('requires provenance on user-facing factual copy, not internal metadata', () => {
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

    expect(message).toContain('missing_source_ref:act_1.scene_1.beat_1.line_1');
    expect(message).not.toMatch(/missing_source_ref:act_1\.scene_1(?:,|$)/);
    expect(message).not.toMatch(/missing_source_ref:act_1\.scene_1\.beat_1(?:,|$)/);
  });

  it('does not demand a citation for a question that mentions sourced timing', () => {
    const ledger = buildThinkForgeSourceLedger({
      userPrompt: 'HarborGrid documented a six-month pilot.',
    });
    const questionBeat = makeBeat(1, {
      lines: [{
        ...makeBeat(1).lines[0]!,
        text: 'What changed across the six-month pilot?',
        sourceRefs: [],
      }],
    });
    const sidecar = sidecarWithScenes([makeScene(1, { beats: [questionBeat] })]);

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar), {
      sourceLedger: ledger,
    })).not.toThrow();
  });

  it('rejects source references that do not exist in the authorised ledger', () => {
    const ledger = buildThinkForgeSourceLedger({ userPrompt: 'Adobe raised prices by 12 percent.' });
    const sidecar = makeSidecar({ sourceRefs: ['missing_ref'] });

    expect(() => assertUsableScriptWriterResult(resultFromSidecar(sidecar), {
      sourceLedger: ledger,
    })).toThrow(/invalid_source_ref:sidecar:missing_ref/);
  });

  it('drops untrusted model references instead of preserving Brand Vault storage IDs', () => {
    const ledger = buildThinkForgeSourceLedger({
      userPrompt: 'HarborGrid replaced 18 yard tractors and idling fuel use fell 31%.',
    });
    const invalidRef = 'brand_bcd205d7-72bd-413a-a2d5-617fae11fa8b';
    const beat = makeBeat(1, {
      lines: [{
        ...makeBeat(1).lines[0]!,
        text: 'Let the visual tension resolve without making a factual claim.',
        sourceRefs: [invalidRef],
      }],
      sourceRefs: [invalidRef],
    });
    const result = materializeScriptWriterResult(makeModelOutput({
      sidecar: sidecarWithScenes([
        makeScene(1, { beats: [beat], sourceRefs: [invalidRef] }),
      ], { sourceRefs: [invalidRef] }),
    }), ledger);

    expect(result.sidecar.sourceRefs).toEqual([]);
    expect(result.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.lines[0]!.sourceRefs).toEqual([]);
    expect(() => assertUsableScriptWriterResult(result, { sourceLedger: ledger })).not.toThrow();
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

  it('rejects runtime without inventing an active-speech floor when a seven-minute request gets a short script', () => {
    let message = '';
    try {
      assertUsableScriptWriterResult(resultFromSidecar(makeSidecar(), 'youtube'), {
        productionBrief: brief({ targetDurationSec: 420 }),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('runtime_duration_mismatch:42s/420s');
    expect(message).not.toContain('spoken_density_mismatch');
    expect(message).not.toContain('scene_count');
  });

  it('returns sparse long-form speaking density as guidance without inventing scene rules', () => {
    const sparseBeat = makeBeat(1, { durationIntentSeconds: 420 });
    const sidecar = sidecarWithScenes([
      makeScene(1, { durationIntentSeconds: 420, beats: [sparseBeat] }),
    ]);

    const report = assertUsableScriptWriterResult(resultFromSidecar(sidecar, 'youtube'), {
      productionBrief: brief({ targetDurationSec: 420 }),
    });

    expect(report.editorialWarnings.some((warning) => (
      warning.startsWith('wpm_below_mode_guidance:')
    ))).toBe(true);
    expect(report.editorialWarnings.join(';')).not.toMatch(/scene_count|60s|per_scene/);
  });

  it('accepts a script that satisfies a 60-second runtime and spoken-word contract', () => {
    const completeBeat = withSpokenWordCount(makeBeat(1, { durationIntentSeconds: 60 }), 120);
    const sidecar = sidecarWithScenes([
      makeScene(1, { durationIntentSeconds: 60, beats: [completeBeat] }),
    ]);

    const report = assertUsableScriptWriterResult(resultFromSidecar(sidecar, 'youtube'), {
      productionBrief: brief({ targetDurationSec: 60 }),
    });
    expect(report.editorialWarnings).toEqual([]);
  });
});

describe('ScriptWriterAgent evidence readiness', () => {
  beforeEach(() => {
    generateStructuredWithWritingContextCacheMock.mockReset();
  });

  it('rejects a thin long-form factual record before a writer call', async () => {
    const userPrompt = [
      'Write a seven-minute documentary about HarborGrid, a six-month pilot at two cargo terminals.',
      'The supplied pilot record says 18 diesel yard tractors were replaced and idling fuel use fell 31% during the measured period.',
      'Make clear that this is a bounded pilot result, not a forecast for total port emissions.',
      'Use an investigative structure with concrete visual evidence, a skeptical middle, and a measured conclusion.',
    ].join(' ');

    await expect(new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Evidence-led port pilot.' },
      userPrompt,
      productionBrief: brief({ targetDurationSec: 420 }),
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    })).rejects.toMatchObject({
      code: 'SCRIPT_REQUIRES_ADDITIONAL_EVIDENCE',
      assessment: expect.objectContaining({
        status: 'requires_additional_evidence',
        targetDurationSeconds: 420,
      }),
    });

    expect(generateStructuredWithWritingContextCacheMock).not.toHaveBeenCalled();
  });

  it('allows a source-bounded long-form record with enough distinct material to reach the writer', async () => {
    const userPrompt = Array.from({ length: 10 }, (_, index) => (
      `Pilot log ${index + 1}: Terminal ${index + 1} recorded a dated operational observation, a measured equipment state, `
      + `a named shift decision, and a documented limitation for the HarborGrid pilot during week ${index + 1}.`
    )).join(' ');
    generateStructuredWithWritingContextCacheMock.mockRejectedValueOnce(new Error('provider reached'));

    await expect(new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Evidence-led port pilot.' },
      userPrompt,
      productionBrief: brief({ targetDurationSec: 420 }),
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    })).rejects.toThrow('provider reached');

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
  });

  it('checks evidence readiness before long-form dispatch and ordinary writer execution', () => {
    const source = readFileSync(
      new URL('../../lib/thinkforge/services/chat-service.ts', import.meta.url),
      'utf8',
    );
    const readiness = source.indexOf('assertScriptEvidenceSufficiency({');
    const longFormDispatch = source.indexOf('handoffChapteredScriptGenerationIfRequired({');
    const writerDispatch = source.indexOf('writer.runStructured(scriptInput, undefined, abortSignal)');

    expect(readiness).toBeGreaterThan(-1);
    expect(readiness).toBeLessThan(longFormDispatch);
    expect(readiness).toBeLessThan(writerDispatch);
  });

  it('keeps the evidence requirement as an explicit typed error', async () => {
    const error = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Evidence-led port pilot.' },
      userPrompt: 'Write a seven-minute documentary. The pilot reduced idling by 31%.',
      productionBrief: brief({ targetDurationSec: 420 }),
      sourceLedger: buildThinkForgeSourceLedger({
        userPrompt: 'Write a seven-minute documentary. The pilot reduced idling by 31%.',
      }),
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ScriptEvidenceSufficiencyError);
    expect(error.message).toContain('ThinkForge will not pad the runtime with unsupported claims.');
  });
});
