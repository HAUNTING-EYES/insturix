import { describe, expect, it } from 'vitest';

import { parseShotPlan, SHOT_PLAN_VERSION } from '@/lib/thinkforge/production/shot-plan';

function plan() {
  return {
    version: SHOT_PLAN_VERSION,
    capabilityProfileVersion: 1,
    capabilityProfileId: 'profile_home',
    sourceSidecarVersion: 1,
    tier: 'no-spend',
    currency: 'inr',
    coordinateSystem: {
      unit: 'meters',
      origin: 'room-center',
      xAxis: 'camera-right',
      yAxis: 'up',
      zAxis: 'toward-background',
    },
    resources: [
      { id: 'camera_phone', category: 'camera', label: 'Existing phone', source: 'owned', equipmentId: 'phone_1', incrementalCost: 0 },
      { id: 'support_tripod', category: 'support', label: 'Existing tripod', source: 'owned', equipmentId: 'tripod_1', incrementalCost: 0 },
      { id: 'light_window', category: 'light', label: 'North-facing window', source: 'natural', incrementalCost: 0 },
      { id: 'fill_sheet', category: 'household', label: 'White bedsheet bounce', source: 'household', incrementalCost: 0 },
      { id: 'audio_lav', category: 'audio', label: 'Existing wired lav', source: 'owned', equipmentId: 'mic_1', incrementalCost: 0 },
    ],
    setupGroups: [{
      id: 'setup_desk',
      label: 'Window-side desk setup',
      sceneIds: ['scene_1', 'scene_2'],
      setupMinutes: 8,
      resetMinutes: 1,
      cameraMarks: [{
        id: 'cam_a',
        resourceId: 'camera_phone',
        position: { x: 0, y: 1.5, z: -1.4 },
        target: { x: 0, y: 1.45, z: 0 },
        heightM: 1.5,
        orientation: 'portrait',
      }],
      lightMarks: [{
        id: 'key_window',
        resourceId: 'light_window',
        role: 'key',
        position: { x: -1.2, y: 1.7, z: -0.2 },
        target: { x: 0, y: 1.4, z: 0 },
      }, {
        id: 'fill_bounce',
        resourceId: 'fill_sheet',
        role: 'fill',
        position: { x: 1, y: 1.3, z: -0.1 },
        target: { x: 0, y: 1.4, z: 0 },
      }],
      performerMarks: [{
        id: 'host_mark',
        characterId: 'host',
        position: { x: 0, y: 0, z: 0 },
        bodyAngleDeg: 0,
        stance: 'seated',
      }],
      audioMarks: [{
        id: 'lav_host',
        resourceId: 'audio_lav',
        characterIds: ['host'],
        placementInstruction: 'Clip the lav one hand-span below the mouth and hide the cable.',
      }],
      instructions: ['Place the desk one metre from the background.', 'Use the window as the key and the bedsheet as fill.'],
    }],
    scenes: [
      scene('scene_1', 0, 'vulnerable admission', 0.35),
      scene('scene_2', 1, 'confident proof', 0.7),
    ],
    shootOrder: ['scene_1', 'scene_2'],
    totalIncrementalCost: 0,
    totalSetupMinutes: 8,
    feasibility: { status: 'ready', score: 0.94, assumptions: [], warnings: [] },
    upgradeOptions: [{
      id: 'upgrade_soft_key',
      label: 'Add a small soft LED',
      benefit: 'Keeps exposure consistent after sunset.',
      affectedSceneIds: ['scene_1', 'scene_2'],
      incrementalCost: 1800,
      resourceLabels: ['Small bi-color LED panel'],
    }],
  };
}

function scene(sceneId: string, sidecarSceneIndex: number, emotionalBeat: string, energy: number) {
  return {
    sceneId,
    sidecarSceneIndex,
    generationUnitId: 'host_desk',
    setupGroupId: 'setup_desk',
    durationSec: 6,
    intent: {
      narrativePurpose: sidecarSceneIndex === 0 ? 'hook' : 'proof',
      emotionalBeat,
      energy,
      visualPriority: 'Direct eye contact and readable expression',
    },
    camera: {
      markId: 'cam_a',
      framing: sidecarSceneIndex === 0 ? 'close-up' : 'medium-close-up',
      angle: 'eye-level',
      movement: 'static',
      movementPath: [],
      focalLengthEquivalentMm: 35,
    },
    activeLightMarkIds: ['key_window', 'fill_bounce'],
    activeAudioMarkIds: ['lav_host'],
    performance: [{
      characterId: 'host',
      performerMarkId: 'host_mark',
      emotion: emotionalBeat,
      intensity: energy,
      gaze: 'directly into the lens',
      posture: 'upright with relaxed shoulders',
      gesture: 'hands still until the proof line',
      movement: 'small natural head movement only',
    }],
    continuity: { wardrobe: ['charcoal shirt'], props: ['closed laptop'], previousSceneIds: sidecarSceneIndex ? ['scene_1'] : [] },
    fallback: {
      framing: 'medium close-up on the same phone',
      instruction: 'Move the phone closer instead of using digital zoom.',
      reason: 'Preserves facial detail when the room is too shallow.',
    },
  };
}

describe('ShotPlan contract', () => {
  it('supports a scene-aware, reusable, zero-spend setup with machine-readable geometry', () => {
    const parsed = parseShotPlan(plan());

    expect(parsed.currency).toBe('INR');
    expect(parsed.setupGroups).toHaveLength(1);
    expect(parsed.setupGroups[0]?.sceneIds).toEqual(['scene_1', 'scene_2']);
    expect(parsed.scenes[0]?.intent.emotionalBeat).toBe('vulnerable admission');
    expect(parsed.scenes[1]?.intent.emotionalBeat).toBe('confident proof');
    expect(parsed.totalIncrementalCost).toBe(0);
  });

  it('rejects invented resource references', () => {
    const input = plan();
    input.setupGroups[0].cameraMarks[0].resourceId = 'camera_not_owned';

    expect(() => parseShotPlan(input)).toThrow(/unknown resource id: camera_not_owned/);
  });

  it('rejects setup groups and scenes that disagree about ownership', () => {
    const input = plan();
    input.setupGroups[0].sceneIds = ['scene_1'];

    expect(() => parseShotPlan(input)).toThrow(/does not include scene scene_2/);
  });

  it('rejects paid resources hidden inside a no-spend plan', () => {
    const input = plan();
    input.resources.push({
      id: 'rented_light',
      category: 'light',
      label: 'Rented cinema light',
      source: 'rent',
      incrementalCost: 1200,
    });
    input.totalIncrementalCost = 1200;

    expect(() => parseShotPlan(input)).toThrow(/no-spend plans cannot rent, buy, or carry incremental cost/);
  });

  it('rejects incomplete or duplicated shoot order', () => {
    const input = plan();
    input.shootOrder = ['scene_1', 'scene_1'];

    expect(() => parseShotPlan(input)).toThrow(/shootOrder must contain every scene exactly once/);
  });
});
