import { describe, expect, it, vi } from 'vitest';

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
  resolveScriptRuntimeContract,
  ScriptWriterAgent,
  type ScriptWriterModelOutput,
} from '@/lib/thinkforge/agents/script-writer-agent';
import { buildScriptEditorialPlan } from '@/lib/thinkforge/agents/script-editorial-plan';
import {
  resolveThinkForgeAuthoringPrompt,
  resolveThinkForgeProductionBrief,
} from '@/lib/thinkforge/brief/resolve-production-brief';
import { buildScriptShotPlan } from '@/lib/thinkforge/production/build-script-shot-plan';
import {
  SCRIPT_SIDECAR_V2_VERSION,
  type ScriptWriterSidecarV2,
} from '@/lib/thinkforge/schemas/script-sidecar-v2';
import type { CreativeSignals } from '@/lib/shared/signals/types';
import type { ThinkForgeContentSignalProfile } from '@/lib/thinkforge/signals';

function sevenMinuteBrief(): ProductionBrief {
  return {
    entryPoint: 'thinkforge',
    output: {
      format: 'auto-edit',
      platform: 'youtube',
      targetDurationSec: 420,
      aspectRatio: '16:9',
      count: 1,
      voiceLanguages: ['en'],
      intent: 'Explain the hidden cost of disconnected creative tools.',
    },
    brand: null,
    sourceDurationSec: null,
    resolution: {
      fieldConfidence: { targetDurationSec: 1 },
      confirmed: ['targetDurationSec'],
      inferred: [],
    },
  };
}

function sevenMinuteProfile(
  signals: Partial<CreativeSignals> = {
    visual_dependency: 0.5,
    show_tell_ratio: 0.5,
    multimodal_counterpoint: 0.1,
    education_intent: 0.7,
  },
): ThinkForgeContentSignalProfile {
  return {
    profile: {
      constraints: {
        target_length: { value: 420, unit: 'seconds' },
        output_format: 'video_script',
        language: 'en',
      },
      signals,
    },
    intent: {
      outputFormat: 'video_script',
      platform: 'YouTube',
      goal: 'education',
      angle: 'The hidden cost of disconnected creative tools.',
      proofPoints: [],
      forbiddenTerms: [],
      structuralHints: [],
      visualNeeds: [],
      clickatron: { requested: false, assetIntent: 'none', rationale: [] },
    },
    sources: {
      brandContextPresent: false,
      brandVaultProfilePresent: false,
      projectFactsUsed: 0,
      globalFactsUsed: 0,
      interactionPatternsUsed: 0,
    },
    warnings: [],
  };
}

function shotIntent() {
  return {
    narrativePurpose: 'Show the repeated transfer cost without inventing production facts.',
    emotionalBeat: 'Controlled frustration.',
    energy: 0.45,
    visualPriority: 'The repeated transfer between disconnected tools.',
    action: 'still' as const,
    desiredFraming: 'medium' as const,
    desiredAngle: 'eye-level' as const,
    desiredMovement: 'push-in' as const,
    movementMotivation: 'Increase focus as the hidden cost becomes clear.',
    simultaneousPerformers: 0,
    spokenAudio: false,
    performance: [],
    continuity: { wardrobe: [], props: ['project board'], previousSceneIds: [] },
  };
}

function shortSidecar(): ScriptWriterSidecarV2 {
  return {
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines',
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    acts: [{
      id: 'act_1',
      title: 'The hidden tax',
      narrativePurpose: 'Expose the cost of disconnected creative tools.',
      narrativeScenes: [{
        id: 'scene_1',
        title: 'The hidden tax',
        narrativePurpose: 'Show attention lost before the real creative work begins.',
        durationIntentSeconds: 40,
        mood: 'serious',
        charactersPresent: [],
        sourceRefs: [],
        beats: [{
          id: 'beat_1',
          kind: 'voiceover',
          narrativePurpose: 'State the operational cost.',
          durationIntentSeconds: 40,
          lines: [{
            id: 'line_1',
            text: 'Disconnected creative tools quietly waste attention before the real work can begin.',
            speakerId: 'narrator',
            languageCode: 'en',
            onCamera: false,
            delivery: 'voiceover',
            sourceRefs: [],
          }],
          visualIntent: {
            description: 'A creator moves one project between five disconnected application windows.',
            motion: 'A slow lateral move follows the repeated export and upload actions.',
            onScreenText: [],
            imageQualityTokens: 'documentary realism with readable interface shapes',
            videoQualityTokens: 'stable motion and coherent screen direction',
            assetRecommendation: 'stock',
          },
          audioIntent: {
            ambience: 'Restrained room tone.',
            music: 'A quiet documentary pulse.',
            sfx: ['Soft notification clicks.'],
          },
          shotIntent: shotIntent(),
          sourceRefs: [],
        }],
      }],
    }],
    creativeDirection: {
      overallMusicPrompt: 'Restrained documentary pulse.',
      colorPalette: ['charcoal', 'warm white'],
      environmentNotes: 'A real creative workspace.',
    },
    sourceRefs: [],
  };
}

function shortModelOutput(): ScriptWriterModelOutput {
  return {
    contentAnalysis: {
      hooks: ['The invisible tax on creative work.'],
      theme: 'Disconnected tools destroy focus.',
      emphasisPoints: ['Repeated transfers.'],
      qualityScore: 90,
    },
    visualMetadata: { motionInfo: 'Restrained documentary pacing.' },
    metadata: { platform: 'youtube' },
    sidecar: shortSidecar(),
  };
}

function shootKitProfile() {
  return {
    version: 1,
    profileId: 'native_v2_profile',
    spaces: [{
      id: 'room_a',
      label: 'Home office',
      dimensionsM: { width: 3.5, depth: 4.5, height: 2.8 },
      usableDepthM: 3.8,
      noiseFloor: 'quiet' as const,
    }],
    equipment: [{
      id: 'phone',
      label: 'Phone camera',
      category: 'camera' as const,
      kind: 'phone' as const,
      availability: 'owned' as const,
      preferred: true,
    }],
    people: {
      performersAvailable: 1,
      cameraOperatorsAvailable: 0,
      assistantsAvailable: 0,
      selfShoot: true,
    },
    constraints: {
      currency: 'INR',
      maxIncrementalSpend: 0,
      rentalAllowed: false,
      purchaseAllowed: false,
      maxSetupMinutes: 20,
      maxSetupChanges: 4,
      maxLocationChanges: 0,
    },
    preferences: {
      defaultPlanTier: 'no-spend' as const,
      prioritize: ['cost', 'setup-time'] as const,
      householdSubstitutionsAllowed: true,
    },
  };
}

describe('ThinkForge script production contract', () => {
  it('keeps the original ideation brief as the initial-draft authoring prompt', () => {
    expect(resolveThinkForgeAuthoringPrompt(
      'Create the complete first draft for this idea.',
      { originalPrompt: 'Make a seven minute YouTube video about creative-tool fragmentation.' } as never,
      true,
    )).toBe('Make a seven minute YouTube video about creative-tool fragmentation.');

    expect(resolveThinkForgeAuthoringPrompt(
      'Make this a three minute version.',
      { originalPrompt: 'Make a seven minute version.' } as never,
      false,
    )).toBe('Make this a three minute version.');
  });

  it('lets semantically parsed output knobs override session defaults', () => {
    const productionBrief = resolveThinkForgeProductionBrief({
      userPrompt: 'Make a seven minute YouTube video.',
      project: { platform: 'linkedin', preferences: { targetDurationSec: 60 } },
      requested: { platform: 'youtube', targetDurationSec: 420 },
    });

    expect(productionBrief.output.platform).toBe('youtube');
    expect(productionBrief.output.targetDurationSec).toBe(420);
    expect(productionBrief.resolution.confirmed).toEqual(expect.arrayContaining(['platform', 'targetDurationSec']));
  });

  it('derives a bounded long-form runtime contract for seven minutes', () => {
    expect(resolveScriptRuntimeContract(sevenMinuteBrief(), sevenMinuteProfile())).toEqual({
      targetDurationSeconds: 420,
      minimumDurationSeconds: 420,
      maximumDurationSeconds: 420,
      targetSpokenWords: 840,
      minimumSpokenWords: 700,
      maximumSpokenWords: 980,
    });
  });

  it('keeps unspecified runtime open without leaking zero numeric budgets into prompt data', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
    const plan = buildScriptEditorialPlan({ productionBrief: null });
    const prompt = new ScriptWriterAgent().buildPromptParts({
      context: { projectSummary: 'Write the supported story at its natural length.' },
      userPrompt: 'Explain the workflow clearly.',
      productionBrief: null,
    }).prompt;

    expect(resolveScriptRuntimeContract(null)).toBeNull();
    expect(plan.runtime).toEqual({ policy: 'open' });
    expect(plan.narration.wordBudgetPolicy).toBe('open');
    expect(plan.narration).not.toHaveProperty('targetSpokenWords');
    expect(plan.narration).not.toHaveProperty('minimumSpokenWords');
    expect(plan.narration).not.toHaveProperty('maximumSpokenWords');
    expect(prompt).toContain('"runtime": {');
    expect(prompt).toContain('"policy": "open"');
    expect(prompt).toContain('"wordBudgetPolicy": "open"');
    expect(prompt).not.toContain('"targetDurationSeconds"');
    expect(prompt).not.toContain('"minimumDurationSeconds"');
    expect(prompt).not.toContain('"maximumDurationSeconds"');
    expect(prompt).not.toContain('"targetSpokenWords"');
    expect(prompt).not.toContain('"minimumSpokenWords"');
    expect(prompt).not.toContain('"maximumSpokenWords"');
  });

  it('derives hierarchy and narration density without inventing a scene count', () => {
    const plan = buildScriptEditorialPlan({
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile(),
    });

    expect(plan.runtime).toEqual({
      policy: 'exact',
      targetDurationSeconds: 420,
      minimumDurationSeconds: 420,
      maximumDurationSeconds: 420,
    });
    expect(plan.narration).toMatchObject({
      mode: 'complement',
      targetWordsPerMinute: 120,
      targetSpokenWords: 840,
      minimumSpokenWords: 700,
      maximumSpokenWords: 980,
      selectedTechnique: { id: 'narration_complement' },
    });
    expect(plan.structure.scope).toBe('full_act_scene');
    expect(plan).not.toHaveProperty('targetSceneCount');
    expect(JSON.stringify(plan)).not.toContain('WordsPerScene');
  });

  it('uses the visual-verbal signal mode instead of one universal WPM assumption', () => {
    const plan = buildScriptEditorialPlan({
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile({
        visual_dependency: 0.9,
        show_tell_ratio: 0.9,
        negative_space: 0.8,
      }),
    });

    expect(plan.narration).toMatchObject({
      mode: 'minimal',
      targetWordsPerMinute: 25,
      minimumWordsPerMinute: 0,
      maximumWordsPerMinute: 50,
      targetSpokenWords: 175,
      minimumSpokenWords: 0,
      maximumSpokenWords: 350,
      selectedTechnique: { id: 'narration_minimal' },
    });
  });

  it('sends the seven-minute contract with a duration-aware output budget', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    generateStructuredWithWritingContextCacheMock.mockRejectedValueOnce(new Error('stop after inspection'));

    try {
      await expect(new ScriptWriterAgent().runStructured({
        context: { projectSummary: 'A connected creative production platform.' },
        userPrompt: 'Make a seven minute YouTube video.',
        productionBrief: sevenMinuteBrief(),
        contentSignalProfile: sevenMinuteProfile(),
      })).rejects.toThrow('stop after inspection');

      expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledWith(expect.objectContaining({
        maxTokens: 18_760,
        prompt: expect.stringContaining('"editorialPlan": {'),
      }));
      const prompt = generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0]?.prompt;
      expect(prompt).toContain('"targetDurationSeconds": 420');
      expect(prompt).toContain('"mode": "complement"');
      expect(prompt).not.toContain('targetSceneCount');
      expect(prompt).not.toContain('targetWordsPerScene');
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('rejects sparse native V2 output that claims to satisfy seven minutes', () => {
    const result = materializeScriptWriterResult(shortModelOutput());

    expect(shortModelOutput().metadata).toEqual({ platform: 'youtube' });
    expect(result.metadata).toMatchObject({
      estimatedTimeSeconds: 40,
      platform: 'youtube',
      voiceLanguages: ['en'],
    });
    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile(),
    })).toThrow(/runtime_duration_mismatch:40s\/420s/);
    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile(),
    })).toThrow(/spoken_word_count_mismatch/);
  });

  it('reports missing narrative shot intent to Shoot Kit without inventing one', () => {
    const nativeSidecar = shortSidecar();
    delete nativeSidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent;

    expect(buildScriptShotPlan({
      sidecar: nativeSidecar,
      profile: shootKitProfile(),
      aspectRatio: '16:9',
    })).toMatchObject({
      status: 'needs-user-input',
      plan: null,
      issues: [expect.objectContaining({ code: 'missing_shot_intent' })],
    });
  });
});
