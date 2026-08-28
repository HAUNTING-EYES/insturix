import { describe, expect, it } from 'vitest';

import { buildScriptShotPlan } from '@/lib/thinkforge/production/build-script-shot-plan';
import { parseProductionCapabilityProfile } from '@/lib/thinkforge/production/production-capability-profile';
import { resolveSceneShotPlan } from '@/lib/thinkforge/production/resolve-scene-shot-plan';
import { parseShotPlan } from '@/lib/thinkforge/production/shot-plan';
import type { ScriptSidecar } from '@/lib/thinkforge/schemas/script-sidecar';

function profile() {
  return {
    version: 1,
    profileId: 'battle_profile',
    spaces: [{
      id: 'office',
      label: 'Home office',
      dimensionsM: { width: 3.5, depth: 4.5, height: 2.8 },
      usableDepthM: 3.8,
      noiseFloor: 'quiet' as const,
      naturalLightSources: [{
        id: 'window',
        kind: 'window' as const,
        direction: 'north' as const,
        controllable: true,
      }],
    }],
    equipment: [
      {
        id: 'phone',
        label: 'Owned phone',
        category: 'camera' as const,
        kind: 'phone' as const,
        availability: 'owned' as const,
        preferred: true,
        focalLengthEquivalentMm: { min: 24, max: 28 },
        orientations: ['landscape', 'portrait'] as const,
      },
      {
        id: 'tripod',
        label: 'Owned tripod',
        category: 'support' as const,
        kind: 'tripod' as const,
        availability: 'owned' as const,
        maxHeightM: 1.8,
      },
      {
        id: 'lav',
        label: 'Single-person lav',
        category: 'audio' as const,
        kind: 'wired-lav' as const,
        availability: 'owned' as const,
        maxSubjects: 1,
      },
    ],
    people: {
      performersAvailable: 4,
      cameraOperatorsAvailable: 0,
      assistantsAvailable: 0,
      selfShoot: true,
      subjectCalibration: {
        source: 'user-measured' as const,
        eyeHeightMByStance: {
          standing: 1.61,
        },
      },
    },
    constraints: {
      currency: 'INR',
      maxIncrementalSpend: 0,
      rentalAllowed: false,
      purchaseAllowed: false,
      maxSetupMinutes: 20,
      maxSetupChanges: 20,
      maxLocationChanges: 0,
    },
    preferences: {
      defaultPlanTier: 'no-spend' as const,
      prioritize: ['cost', 'setup-time'] as const,
      householdSubstitutionsAllowed: true,
    },
  };
}

function performance(characterId = 'host') {
  return {
    characterId,
    stance: 'standing' as const,
    emotion: 'focused',
    intensity: 0.55,
    gaze: 'into the lens',
    posture: 'upright',
    gesture: 'one measured hand gesture',
    movement: 'small natural movement',
  };
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: 'scene_1',
    sidecarSceneIndex: 0,
    generationUnitId: 'unit_1',
    durationSec: 8,
    aspectRatio: '9:16',
    narrativePurpose: 'State the operational problem clearly.',
    emotionalBeat: 'Concern becoming confidence.',
    energy: 0.55,
    visualPriority: 'Readable expression and direct eye contact.',
    action: 'talking',
    desiredFraming: 'medium-close-up',
    desiredAngle: 'eye-level',
    desiredMovement: 'static',
    simultaneousPerformers: 1,
    spokenAudio: true,
    performance: [performance()],
    continuity: { wardrobe: ['navy shirt'], props: ['laptop'], previousSceneIds: [] },
    ...overrides,
  };
}

function scene(index: number, overrides: Record<string, unknown> = {}) {
  return {
    title: `Scene ${index}`,
    narration: `Evidence point ${index}.`,
    visualDescription: 'Host speaks directly to camera in a home office.',
    videoMotionPrompt: 'Locked camera with restrained subject movement.',
    audioDescription: 'Clean direct speech.',
    musicDescription: 'Restrained pulse.',
    sfxDescription: '',
    durationSeconds: 8,
    mood: 'serious' as const,
    imageQualityTokens: 'clear face, natural skin tone',
    videoQualityTokens: 'stable frame, sync-safe motion',
    primaryVisualForUnit: true,
    sceneType: 'talking-head' as const,
    assetRecommendation: 'ai-video' as const,
    lines: [{
      text: `Evidence point ${index}.`,
      speakerId: 'host',
      onCamera: true,
      delivery: 'sync-dialogue' as const,
      sourceRefs: [],
    }],
    sourceRefs: [],
    charactersPresent: ['host'],
    relipSafe: true,
    relipSafety: {
      faceVisibility: 'visible' as const,
      occlusion: 'none' as const,
      motion: 'still' as const,
    },
    shotIntent: {
      narrativePurpose: `Advance evidence point ${index}.`,
      emotionalBeat: index === 1 ? 'Concern.' : 'Growing confidence.',
      energy: Math.min(0.9, 0.4 + index / 100),
      visualPriority: 'The host expression and direct eye contact.',
      action: 'talking' as const,
      desiredFraming: 'medium-close-up' as const,
      desiredAngle: 'eye-level' as const,
      desiredMovement: 'static' as const,
      simultaneousPerformers: 1,
      spokenAudio: true,
      performance: [performance()],
      continuity: {
        wardrobe: ['navy shirt'],
        props: ['laptop'],
        previousSceneIds: index > 1 ? [`unit_${index - 1}`] : [],
      },
    },
    ...overrides,
    generationUnitId: (overrides.generationUnitId as string | undefined) ?? `unit_${index}`,
  };
}

function sidecar(sceneCount = 3): ScriptSidecar {
  return {
    sidecarVersion: 1,
    characters: [{ id: 'host', name: 'Host', role: 'host' }],
    scenes: Array.from({ length: sceneCount }, (_, index) => scene(index + 1)),
    overallMusicPrompt: 'Restrained documentary pulse.',
    characterDescriptions: { host: 'Host in a navy shirt.' },
    colorPalette: ['charcoal', 'white'],
    environmentNotes: 'Small home office.',
    suggestedProfileCategory: 'production-mode',
    sourceRefs: [],
  };
}

describe('Shot Guide adversarial battle matrix', () => {
  it('is byte-stable across repeated resolutions and survives JSON round trips', () => {
    const first = resolveSceneShotPlan({ profile: profile(), intent: intent() });
    expect(first.status).toBe('resolved');
    if (first.status !== 'resolved') return;

    const serialized = JSON.stringify(first.plan);
    for (let run = 0; run < 25; run += 1) {
      expect(JSON.stringify(resolveSceneShotPlan({ profile: profile(), intent: intent() }))).toBe(JSON.stringify(first));
    }
    expect(parseShotPlan(JSON.parse(serialized))).toEqual(first.plan);
  });

  it('never invents equipment or spends money in a no-spend plan', () => {
    const result = resolveSceneShotPlan({ profile: profile(), intent: intent() });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;

    const knownEquipment = new Set(profile().equipment.map((item) => item.id));
    const equipmentResources = result.plan.resources.filter((resource) => resource.equipmentId);
    expect(equipmentResources.every((resource) => knownEquipment.has(resource.equipmentId!))).toBe(true);
    expect(result.plan.totalIncrementalCost).toBe(0);
    expect(result.plan.resources.every((resource) => !['buy', 'rent'].includes(resource.source))).toBe(true);
  });

  it('rejects a microphone that cannot cover every simultaneous speaking performer', () => {
    const result = resolveSceneShotPlan({
      profile: profile(),
      intent: intent({
        simultaneousPerformers: 2,
        performance: [performance('host'), performance('guest')],
      }),
    });

    expect(result).toMatchObject({
      status: 'needs-user-input',
      blockers: [expect.objectContaining({ code: 'audio_required' })],
    });
  });

  it('fails closed on duplicate equipment and duplicate generation units', () => {
    const duplicateEquipment = profile();
    duplicateEquipment.equipment.push({ ...duplicateEquipment.equipment[0]! });
    expect(() => parseProductionCapabilityProfile(duplicateEquipment)).toThrow(/duplicate id/);

    const input = sidecar(2);
    input.scenes[1] = { ...input.scenes[1]!, generationUnitId: input.scenes[0]!.generationUnitId };
    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '9:16' });
    expect(result).toMatchObject({
      status: 'needs-user-input',
      issues: [expect.objectContaining({ code: 'duplicate_generation_unit_id' })],
    });
  });

  it('degrades unsafe overhead and unsupported movement with disclosed fallbacks', () => {
    const result = resolveSceneShotPlan({
      profile: profile(),
      intent: intent({
        desiredAngle: 'overhead',
        desiredMovement: 'orbit',
        movementMotivation: 'Reveal the full workspace as the process becomes clear.',
      }),
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;

    expect(result.plan.scenes[0]?.camera).toMatchObject({ angle: 'high', movement: 'static' });
    expect(result.plan.scenes[0]?.fallback?.reason).toMatch(/movement.*Overhead|Overhead.*movement/);
    expect(result.plan.feasibility.warnings.join(' ')).toMatch(/movement.*Overhead|Overhead.*movement/);
  });

  it('builds a schema-valid 60-scene plan without losing continuity or scene identity', () => {
    const result = buildScriptShotPlan({ sidecar: sidecar(60), profile: profile(), aspectRatio: '9:16' });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    expect(result.plan.scenes).toHaveLength(60);
    expect(new Set(result.plan.scenes.map((entry) => entry.sceneId)).size).toBe(60);
    expect(new Set(result.plan.shootOrder).size).toBe(60);
    expect(result.plan.scenes[59]?.continuity.previousSceneIds).toEqual(['scene_59']);
    expect(parseShotPlan(structuredClone(result.plan))).toEqual(result.plan);
  });

  it('blocks legacy performer-free geometry instead of inventing a subject plane', () => {
    const result = resolveSceneShotPlan({
      profile: profile(),
      intent: intent({
        action: 'interacting-with-object',
        desiredFraming: 'insert',
        simultaneousPerformers: 0,
        spokenAudio: false,
        performance: [],
      }),
    });
    expect(result).toMatchObject({
      status: 'needs-user-input',
      blockers: [expect.objectContaining({ code: 'subject_calibration' })],
    });
    expect(JSON.stringify(result)).not.toContain('normalized');
  });

  it('rejects unknown continuity aliases instead of silently dropping them', () => {
    const input = sidecar(2);
    input.scenes[1] = {
      ...input.scenes[1]!,
      shotIntent: {
        ...input.scenes[1]!.shotIntent!,
        continuity: {
          ...input.scenes[1]!.shotIntent!.continuity,
          previousSceneIds: ['missing_scene'],
        },
      },
    };

    expect(buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '9:16' })).toMatchObject({
      status: 'needs-user-input',
      issues: [expect.objectContaining({ code: 'unknown_continuity_scene', sceneId: 'scene_2' })],
    });
  });
});
