import { describe, expect, it } from 'vitest';

import { optimizeScriptShotPlans } from '@/lib/thinkforge/production/optimize-script-shot-plan';
import { resolveSceneShotPlan } from '@/lib/thinkforge/production/resolve-scene-shot-plan';
import type { ShotPlan } from '@/lib/thinkforge/production/shot-plan';

function profile() {
  return {
    version: 1,
    profileId: 'profile_studio',
    spaces: [{
      id: 'studio_a',
      label: 'Small studio',
      dimensionsM: { width: 4, depth: 5, height: 3 },
      usableDepthM: 4.2,
      noiseFloor: 'quiet',
    }],
    equipment: [
      {
        id: 'phone',
        label: 'Production phone',
        category: 'camera',
        kind: 'phone',
        availability: 'owned',
        preferred: true,
        focalLengthEquivalentMm: { min: 24, max: 28 },
      },
      { id: 'tripod', label: 'Tripod', category: 'support', kind: 'tripod', availability: 'owned', maxHeightM: 2 },
      { id: 'led', label: 'Bi-color LED', category: 'light', kind: 'led-panel', availability: 'owned', dimmable: true, colorTemperatureK: { min: 3_200, max: 5_600 } },
      { id: 'reflector', label: 'White reflector', category: 'modifier', kind: 'reflector', availability: 'owned' },
      { id: 'lav', label: 'Wired lav', category: 'audio', kind: 'wired-lav', availability: 'owned' },
    ],
    people: {
      performersAvailable: 1,
      cameraOperatorsAvailable: 0,
      assistantsAvailable: 0,
      selfShoot: true,
      subjectCalibration: {
        source: 'user-measured',
        eyeHeightMByStance: { seated: 1.24 },
      },
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
      defaultPlanTier: 'no-spend',
      prioritize: ['image-quality', 'cost', 'setup-time'],
      householdSubstitutionsAllowed: false,
    },
  };
}

function intent(sceneId: string, sidecarSceneIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    sceneId,
    sidecarSceneIndex,
    generationUnitId: `unit_${sceneId}`,
    durationSec: 6,
    aspectRatio: '9:16',
    narrativePurpose: sidecarSceneIndex === 0 ? 'hook' : 'proof',
    emotionalBeat: sidecarSceneIndex === 0 ? 'concern' : 'confidence',
    energy: sidecarSceneIndex === 0 ? 0.45 : 0.65,
    visualPriority: 'Direct eye contact and readable expression',
    action: 'talking',
    desiredFraming: 'medium-close-up',
    desiredAngle: 'eye-level',
    desiredMovement: 'static',
    simultaneousPerformers: 1,
    spokenAudio: true,
    performance: [{
      characterId: 'host',
      stance: 'seated',
      emotion: sidecarSceneIndex === 0 ? 'concern' : 'confidence',
      intensity: sidecarSceneIndex === 0 ? 0.45 : 0.65,
      gaze: 'directly into the lens',
      posture: 'upright with relaxed shoulders',
      gesture: 'one restrained hand gesture',
      movement: 'small natural head movement only',
    }],
    continuity: {
      wardrobe: ['navy shirt'],
      props: ['closed laptop'],
      previousSceneIds: sidecarSceneIndex > 0 ? [`scene_${sidecarSceneIndex}`] : [],
    },
    ...overrides,
  };
}

function resolvedPlan(sceneId: string, sidecarSceneIndex: number, overrides: Record<string, unknown> = {}, tier?: ShotPlan['tier']): ShotPlan {
  const result = resolveSceneShotPlan({
    profile: profile(),
    intent: intent(sceneId, sidecarSceneIndex, overrides),
    ...(tier ? { tier } : {}),
  });
  if (result.status !== 'resolved') throw new Error(result.blockers.map((blocker) => blocker.message).join('; '));
  return result.plan;
}

function cameraPosition(plan: ShotPlan, sceneId: string) {
  const scene = plan.scenes.find((entry) => entry.sceneId === sceneId);
  const setup = plan.setupGroups.find((entry) => entry.id === scene?.setupGroupId);
  return setup?.cameraMarks.find((mark) => mark.id === scene?.camera.markId)?.position;
}

describe('optimizeScriptShotPlans', () => {
  it('groups A/B/A scripts by physical setup while preserving narrative scene order', () => {
    const scene1 = resolvedPlan('scene_1', 0);
    const scene2 = resolvedPlan('scene_2', 1, { desiredAngle: 'high' });
    const scene3 = resolvedPlan('scene_3', 2);

    const optimized = optimizeScriptShotPlans([scene1, scene2, scene3]);

    expect(optimized.scenes.map((scene) => scene.sceneId)).toEqual(['scene_1', 'scene_2', 'scene_3']);
    expect(optimized.shootOrder).toEqual(['scene_1', 'scene_3', 'scene_2']);
    expect(optimized.setupGroups).toHaveLength(2);
    expect(optimized.setupGroups[0]?.sceneIds).toEqual(['scene_1', 'scene_3']);
    expect(optimized.optimization).toMatchObject({
      originalSceneOrder: ['scene_1', 'scene_2', 'scene_3'],
      setupChangeCount: 1,
    });
    expect(optimized.optimization?.savedSetupMinutes).toBeGreaterThan(0);
  });

  it('preserves resolver-authored geometry while remapping only equivalent mark ids', () => {
    const scene1 = resolvedPlan('scene_1', 0);
    const scene2 = resolvedPlan('scene_2', 1);
    const scene1Position = cameraPosition(scene1, 'scene_1');
    const scene2Position = cameraPosition(scene2, 'scene_2');

    const optimized = optimizeScriptShotPlans([scene1, scene2]);

    expect(cameraPosition(optimized, 'scene_1')).toEqual(scene1Position);
    expect(cameraPosition(optimized, 'scene_2')).toEqual(scene2Position);
    expect(optimized.setupGroups).toHaveLength(1);
  });

  it('does not merge a real physical coordinate difference', () => {
    const scene1 = resolvedPlan('scene_1', 0);
    const scene2 = structuredClone(resolvedPlan('scene_2', 1));
    scene2.setupGroups[0]!.cameraMarks[0]!.position.x += 0.005;

    const optimized = optimizeScriptShotPlans([scene1, scene2]);

    expect(optimized.setupGroups).toHaveLength(2);
    expect(cameraPosition(optimized, 'scene_2')?.x).toBeCloseTo(0.005, 6);
  });

  it('counts one approved purchase once when every scene reuses it', () => {
    const paidProfile = {
      ...profile(),
      equipment: [
        {
          id: 'purchased_phone',
          label: 'Approved phone',
          category: 'camera',
          kind: 'phone',
          availability: 'purchase-approved',
          estimatedIncrementalCost: 5_000,
          costBasis: 'one-time',
          preferred: true,
          focalLengthEquivalentMm: { min: 24, max: 28 },
        },
        ...profile().equipment.filter((item) => item.category !== 'camera'),
      ],
      constraints: { ...profile().constraints, maxIncrementalSpend: 6_000, purchaseAllowed: true },
      preferences: { ...profile().preferences, defaultPlanTier: 'minimum-upgrade' },
    };
    const resolvePaid = (sceneId: string, index: number) => {
      const result = resolveSceneShotPlan({ profile: paidProfile, intent: intent(sceneId, index), tier: 'minimum-upgrade' });
      if (result.status !== 'resolved') throw new Error('Expected paid scene plan to resolve');
      return result.plan;
    };

    const optimized = optimizeScriptShotPlans([resolvePaid('scene_1', 0), resolvePaid('scene_2', 1)]);

    expect(optimized.totalIncrementalCost).toBe(5_000);
    expect(optimized.resources.filter((resource) => resource.equipmentId === 'purchased_phone')).toHaveLength(1);
  });

  it('rejects mixed tiers instead of silently changing the production budget', () => {
    const noSpend = resolvedPlan('scene_1', 0, {}, 'no-spend');
    const upgraded = resolvedPlan('scene_2', 1, {}, 'minimum-upgrade');

    expect(() => optimizeScriptShotPlans([noSpend, upgraded])).toThrow(/share profile, version, tier, currency/);
  });

  it('rejects conflicting definitions for the same resource id', () => {
    const scene1 = resolvedPlan('scene_1', 0);
    const scene2 = structuredClone(resolvedPlan('scene_2', 1));
    scene2.resources[0]!.label = 'Conflicting camera label';

    expect(() => optimizeScriptShotPlans([scene1, scene2])).toThrow(/Conflicting resource definition/);
  });
});
