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
import type { ScriptSidecar } from '@/lib/thinkforge/schemas/script-sidecar';
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

function shortSidecar(): ScriptSidecar {
  return {
    sidecarVersion: 1,
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    scenes: [{
      title: 'The hidden tax',
      narration: 'Disconnected creative tools quietly waste attention before the real work can begin.',
      visualDescription: 'A creator repeatedly moves the same project between five disconnected application windows.',
      videoMotionPrompt: 'Slow lateral move across the repeated export and upload actions.',
      audioDescription: 'Clear narrator voice with restrained room tone.',
      musicDescription: 'A restrained documentary pulse.',
      sfxDescription: 'Soft notification clicks.',
      durationSeconds: 40,
      mood: 'serious',
      imageQualityTokens: 'documentary realism, readable interface shapes',
      videoQualityTokens: 'stable motion, coherent screen direction',
      generationUnitId: 'scene_1',
      primaryVisualForUnit: true,
      sceneType: 'montage',
      assetRecommendation: 'stock',
      lines: [{
        text: 'Disconnected creative tools quietly waste attention before the real work can begin.',
        speakerId: 'narrator',
        onCamera: false,
        delivery: 'voiceover',
        sourceRefs: [],
      }],
      sourceRefs: [],
      charactersPresent: ['narrator'],
      relipSafe: false,
    }],
    overallMusicPrompt: 'Restrained documentary pulse.',
    characterDescriptions: {},
    colorPalette: ['charcoal', 'warm white'],
    environmentNotes: 'A real creative workspace.',
    suggestedProfileCategory: 'production-mode',
    sourceRefs: [],
  };
}

function shortModelOutput(): ScriptWriterModelOutput {
  return {
    contentAnalysis: {
      hooks: ['The invisible tax on creative work'],
      theme: 'Disconnected tools destroy focus.',
      emphasisPoints: ['Repeated transfers'],
      qualityScore: 90,
    },
    visualMetadata: { motionInfo: 'Restrained documentary pacing.' },
    metadata: { platform: 'youtube', voiceLanguage: 'en', estimatedTimeSeconds: 40 },
    sidecar: shortSidecar(),
  };
}

function shootKitProfile() {
  return {
    version: 1,
    profileId: 'legacy_sidecar_profile',
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
    const brief = resolveThinkForgeProductionBrief({
      userPrompt: 'Make a seven minute YouTube video.',
      project: { platform: 'linkedin', preferences: { targetDurationSec: 60 } },
      requested: { platform: 'youtube', targetDurationSec: 420 },
    });

    expect(brief.output.platform).toBe('youtube');
    expect(brief.output.targetDurationSec).toBe(420);
    expect(brief.resolution.confirmed).toEqual(expect.arrayContaining(['platform', 'targetDurationSec']));
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

  it('derives hierarchy and narration density without inventing a scene count', () => {
    const plan = buildScriptEditorialPlan({
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile(),
    });

    expect(plan.runtime).toEqual({
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

      expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 18_760,
          prompt: expect.stringContaining('"editorialPlan": {'),
        }),
      );
      expect(generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0]?.prompt).toContain('"targetDurationSeconds": 420');
      expect(generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0]?.prompt).toContain('"mode": "complement"');
      expect(generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0]?.prompt).not.toContain('targetSceneCount');
      expect(generateStructuredWithWritingContextCacheMock.mock.calls[0]?.[0]?.prompt).not.toContain('targetWordsPerScene');
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('rejects a short script that claims to satisfy a seven-minute brief', () => {
    const result = materializeScriptWriterResult(shortModelOutput());

    expect(result.metadata.estimatedTimeSeconds).toBe(40);
    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile(),
    })).toThrow(/runtime_duration_mismatch:40s\/420s/);
    expect(() => assertUsableScriptWriterResult(result, {
      productionBrief: sevenMinuteBrief(),
      contentSignalProfile: sevenMinuteProfile(),
    })).toThrow(/spoken_word_count_mismatch/);
  });

  it('upgrades legacy render metadata before reporting the next real Shoot Kit requirement', () => {
    const legacyStoredSidecar = { ...shortSidecar() } as Record<string, unknown>;
    delete legacyStoredSidecar.characterDescriptions;

    expect(buildScriptShotPlan({
      sidecar: legacyStoredSidecar,
      profile: shootKitProfile(),
      aspectRatio: '16:9',
    })).toMatchObject({
      status: 'needs-user-input',
      plan: null,
      issues: [expect.objectContaining({ code: 'missing_shot_intent' })],
    });
  });
});
