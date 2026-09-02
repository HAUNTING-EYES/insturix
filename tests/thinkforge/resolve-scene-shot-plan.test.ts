import { describe, expect, it } from 'vitest';

import { resolveSceneShotPlan } from '@/lib/thinkforge/production/resolve-scene-shot-plan';

function profile() {
  return {
    version: 1,
    profileId: 'profile_home',
    spaces: [{
      id: 'room_home',
      label: 'Home office',
      dimensionsM: { width: 3, depth: 4, height: 2.7 },
      usableDepthM: 3.4,
      noiseFloor: 'quiet',
      naturalLightSources: [{ id: 'window_left', kind: 'window', direction: 'north' }],
    }],
    equipment: [
      {
        id: 'phone',
        label: 'Existing phone',
        category: 'camera',
        kind: 'phone',
        availability: 'owned',
        preferred: true,
        focalLengthEquivalentMm: { min: 24, max: 28 },
      },
      { id: 'tripod', label: 'Phone tripod', category: 'support', kind: 'tripod', availability: 'owned', maxHeightM: 1.8 },
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
      maxSetupChanges: 1,
      maxLocationChanges: 0,
    },
  };
}

function intent() {
  return {
    sceneId: 'scene_1',
    sidecarSceneIndex: 0,
    generationUnitId: 'host_desk',
    durationSec: 7,
    aspectRatio: '9:16',
    narrativePurpose: 'Reveal the costly mistake',
    emotionalBeat: 'controlled frustration turning into confidence',
    energy: 0.62,
    visualPriority: 'Readable facial emotion and direct eye contact',
    action: 'talking',
    desiredFraming: 'medium-close-up',
    desiredAngle: 'eye-level',
    desiredMovement: 'push-in',
    movementMotivation: 'Narrow the viewer attention as the consequence becomes personal.',
    simultaneousPerformers: 1,
    spokenAudio: true,
    performance: [{
      characterId: 'host',
      stance: 'seated',
      emotion: 'controlled frustration',
      intensity: 0.58,
      gaze: 'directly into the lens',
      posture: 'upright with shoulders relaxed',
      gesture: 'one measured open-hand gesture on the key number',
      movement: 'small natural head movement only',
    }],
  };
}

describe('resolveSceneShotPlan', () => {
  it('creates a validated zero-spend plan and transparently replaces impossible self-shoot movement', () => {
    const result = resolveSceneShotPlan({ profile: profile(), intent: intent() });

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.plan.totalIncrementalCost).toBe(0);
    expect(result.plan.scenes[0]?.camera.movement).toBe('static');
    expect(result.plan.scenes[0]?.fallback?.reason).toMatch(/movement/);
    expect(result.plan.resources.map((resource) => resource.source)).not.toContain('buy');
    expect(result.plan.knowledgeRefs).toEqual(expect.arrayContaining([
      'signal:visual.shot_scale',
      'signal:visual.motion_type',
      'technique:camera-movement.static',
    ]));
  });

  it('tightens a wide shot deterministically when the available room is shallow', () => {
    const inputProfile = profile();
    inputProfile.spaces[0].dimensionsM.depth = 1.7;
    inputProfile.spaces[0].usableDepthM = 1.7;
    const inputIntent = { ...intent(), desiredMovement: 'static', movementMotivation: undefined, desiredFraming: 'wide' };

    const result = resolveSceneShotPlan({ profile: inputProfile, intent: inputIntent });

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.plan.scenes[0]?.camera.framing).toBe('medium-close-up');
    expect(result.plan.feasibility.warnings.join(' ')).toMatch(/room depth/);
  });

  it('requires calibration instead of inventing normalized marks when measurements are absent', () => {
    const inputProfile = profile();
    const room = inputProfile.spaces[0] as unknown as Record<string, unknown>;
    delete room.dimensionsM;
    delete room.usableDepthM;
    const inputIntent = {
      ...intent(),
      desiredMovement: 'static',
      movementMotivation: undefined,
      desiredFraming: 'wide',
    };

    const result = resolveSceneShotPlan({ profile: inputProfile, intent: inputIntent });

    expect(result).toMatchObject({
      status: 'needs-user-input',
      blockers: [expect.objectContaining({ code: 'room_depth' })],
    });
    expect(JSON.stringify(result)).not.toContain('normalized');
  });

  it('treats an explicitly supplied usable depth as measured evidence', () => {
    const inputProfile = profile();
    const room = inputProfile.spaces[0] as unknown as Record<string, unknown>;
    delete room.dimensionsM;

    const result = resolveSceneShotPlan({
      profile: inputProfile,
      intent: { ...intent(), desiredMovement: 'static', movementMotivation: undefined },
    });

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.plan.coordinateSystem.unit).toBe('meters');
    expect(result.plan.setupGroups[0]?.instructions[0]).toMatch(/m from the lead performer/);
  });

  it('does not treat performance direction as measured subject geometry', () => {
    const inputProfile = profile();
    delete (inputProfile.people as unknown as Record<string, unknown>).subjectCalibration;

    const result = resolveSceneShotPlan({
      profile: inputProfile,
      intent: { ...intent(), desiredMovement: 'static', movementMotivation: undefined },
    });

    expect(result).toMatchObject({
      status: 'needs-user-input',
      blockers: [expect.objectContaining({ code: 'subject_calibration' })],
    });
    expect(JSON.stringify(result)).toContain('Performance direction is not geometry evidence');
  });

  it('requires a measurement for the exact authored stance', () => {
    const result = resolveSceneShotPlan({
      profile: profile(),
      intent: {
        ...intent(),
        desiredMovement: 'static',
        movementMotivation: undefined,
        performance: [{ ...intent().performance[0], stance: 'standing' }],
      },
    });

    expect(result).toMatchObject({
      status: 'needs-user-input',
      blockers: [expect.objectContaining({ code: 'subject_calibration' })],
    });
  });

  it('uses the one explicitly preferred room in a multi-space profile', () => {
    const base = profile();
    const inputProfile = {
      ...base,
      spaces: [
        { ...base.spaces[0], preferred: false },
        { ...base.spaces[0], id: 'room_studio', label: 'Studio', preferred: true },
      ],
    };

    const result = resolveSceneShotPlan({
      profile: inputProfile,
      intent: { ...intent(), desiredMovement: 'static', movementMotivation: undefined },
    });

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.plan.setupGroups[0]?.spaceId).toBe('room_studio');
  });

  it('keeps demonstrations readable instead of honoring an unusably wide creative request', () => {
    const result = resolveSceneShotPlan({
      profile: profile(),
      intent: { ...intent(), action: 'demonstrating', desiredFraming: 'extreme-wide', desiredMovement: 'static', movementMotivation: undefined },
    });

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.plan.scenes[0]?.camera.framing).toBe('medium');
    expect(result.plan.knowledgeRefs).toContain('signal:visual.action_type');
  });

  it('asks for a camera instead of inventing one', () => {
    const inputProfile = profile();
    inputProfile.equipment = inputProfile.equipment.filter((item) => item.category !== 'camera');

    const result = resolveSceneShotPlan({ profile: inputProfile, intent: intent() });

    expect(result).toMatchObject({ status: 'needs-user-input' });
    if (result.status !== 'needs-user-input') return;
    expect(result.blockers[0]?.code).toBe('camera_required');
  });

  it('blocks a self-shoot without stable support when household substitutions are disallowed', () => {
    const inputProfile = {
      ...profile(),
      equipment: profile().equipment.filter((item) => item.category !== 'support'),
      preferences: {
        defaultPlanTier: 'no-spend',
        prioritize: ['cost', 'setup-time'],
        householdSubstitutionsAllowed: false,
      },
    };

    const result = resolveSceneShotPlan({
      profile: inputProfile,
      intent: { ...intent(), desiredMovement: 'static', movementMotivation: undefined },
    });

    expect(result).toMatchObject({ status: 'needs-user-input' });
    if (result.status !== 'needs-user-input') return;
    expect(result.blockers[0]?.code).toBe('stable_support_required');
  });

  it('blocks spoken capture in a noisy room when no microphone exists', () => {
    const inputProfile = profile();
    inputProfile.spaces[0].noiseFloor = 'noisy';
    inputProfile.equipment = inputProfile.equipment.filter((item) => item.category !== 'audio');

    const result = resolveSceneShotPlan({ profile: inputProfile, intent: intent() });

    expect(result).toMatchObject({ status: 'needs-user-input' });
    if (result.status !== 'needs-user-input') return;
    expect(result.blockers[0]?.code).toBe('audio_required');
  });

  it('uses paid gear only when the tier, permission, and budget explicitly allow it', () => {
    const inputProfile = {
      ...profile(),
      equipment: [
        {
          id: 'approved_phone',
          label: 'Approved phone purchase',
          category: 'camera',
          kind: 'phone',
          availability: 'purchase-approved',
          estimatedIncrementalCost: 5_000,
          costBasis: 'one-time',
          focalLengthEquivalentMm: { min: 24, max: 28 },
        },
        ...profile().equipment.filter((item) => item.category !== 'camera'),
      ],
      constraints: {
        ...profile().constraints,
        maxIncrementalSpend: 6_000,
        purchaseAllowed: true,
      },
    };

    const blocked = resolveSceneShotPlan({ profile: inputProfile, intent: intent(), tier: 'no-spend' });
    expect(blocked.status).toBe('needs-user-input');

    const approved = resolveSceneShotPlan({ profile: inputProfile, intent: intent(), tier: 'minimum-upgrade' });
    expect(approved.status).toBe('resolved');
    if (approved.status !== 'resolved') return;
    expect(approved.plan.totalIncrementalCost).toBe(5_000);
    expect(approved.plan.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ equipmentId: 'approved_phone', source: 'buy', incrementalCost: 5_000 }),
    ]));
  });

  it('rejects unmotivated camera movement at the intent boundary', () => {
    expect(() => resolveSceneShotPlan({
      profile: profile(),
      intent: { ...intent(), movementMotivation: undefined },
    })).toThrow(/narrative motivation/);
  });
});
