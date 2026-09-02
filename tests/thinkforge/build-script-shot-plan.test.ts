import { describe, expect, it } from 'vitest';

import { buildScriptShotPlan } from '@/lib/thinkforge/production/build-script-shot-plan';
import type { ScriptSidecar } from '@/lib/thinkforge/schemas/script-sidecar';

function profile(maxSetupChanges = 4) {
  return {
    version: 1,
    profileId: 'profile_shoot_kit',
    spaces: [{
      id: 'room_a',
      label: 'Home office',
      dimensionsM: { width: 3.5, depth: 4.5, height: 2.8 },
      usableDepthM: 3.8,
      noiseFloor: 'quiet',
    }],
    equipment: [
      {
        id: 'phone',
        label: 'Phone camera',
        category: 'camera',
        kind: 'phone',
        availability: 'owned',
        preferred: true,
        focalLengthEquivalentMm: { min: 24, max: 28 },
      },
      {
        id: 'tripod',
        label: 'Phone tripod',
        category: 'support',
        kind: 'tripod',
        availability: 'owned',
        maxHeightM: 1.8,
      },
    ],
    people: {
      performersAvailable: 1,
      cameraOperatorsAvailable: 0,
      assistantsAvailable: 0,
      selfShoot: true,
      subjectCalibration: {
        source: 'user-measured',
        eyeHeightMByStance: {
          seated: 1.24,
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
      maxSetupChanges,
      maxLocationChanges: 0,
    },
    preferences: {
      defaultPlanTier: 'no-spend',
      prioritize: ['cost', 'setup-time'],
      householdSubstitutionsAllowed: true,
    },
  };
}

function baseScene() {
  return {
    title: 'Founder names the problem',
    narration: 'Approvals disappear when nobody owns the final call.',
    visualDescription: 'Founder seated at a desk and speaking directly to camera.',
    videoMotionPrompt: 'locked camera with restrained hand movement',
    audioDescription: 'Clean direct speech.',
    musicDescription: 'Low restrained pulse.',
    sfxDescription: '',
    durationSeconds: 8,
    mood: 'serious' as const,
    imageQualityTokens: 'clear face, natural skin tone',
    videoQualityTokens: 'stable frame, sync-safe motion',
    generationUnitId: 'unit_host',
    primaryVisualForUnit: true,
    sceneType: 'talking-head' as const,
    assetRecommendation: 'ai-video' as const,
    lines: [{
      text: 'Approvals disappear when nobody owns the final call.',
      speakerId: 'host',
      onCamera: true,
      delivery: 'sync-dialogue' as const,
      sourceRefs: [],
    }],
    sourceRefs: [],
    charactersPresent: ['host'],
    relipSafe: true,
    relipSafety: { faceVisibility: 'visible' as const, occlusion: 'none' as const, motion: 'still' as const },
    shotIntent: {
      narrativePurpose: 'State the operational problem with authority.',
      emotionalBeat: 'Controlled frustration.',
      energy: 0.5,
      visualPriority: 'The founder expression and direct eye contact.',
      action: 'talking' as const,
      desiredFraming: 'medium-close-up' as const,
      desiredAngle: 'eye-level' as const,
      desiredMovement: 'static' as const,
      simultaneousPerformers: 1,
      spokenAudio: true,
      performance: [{
        characterId: 'host',
        stance: 'seated' as const,
        emotion: 'controlled frustration',
        intensity: 0.5,
        gaze: 'into the lens',
        posture: 'upright with relaxed shoulders',
        gesture: 'one restrained hand gesture',
        movement: 'small natural head movement',
      }],
      continuity: { wardrobe: ['navy shirt'], props: ['closed laptop'], previousSceneIds: [] },
    },
  };
}

function sidecar(): ScriptSidecar {
  const bRoll = {
    ...baseScene(),
    title: 'The ownerless board',
    narration: 'The same decision moves between three review columns.',
    visualDescription: 'Close view of an approval board with no person in frame.',
    videoMotionPrompt: 'slow push toward the empty owner column',
    generationUnitId: 'unit_board',
    sceneType: 'montage' as const,
    lines: [{
      text: 'The same decision moves between three review columns.',
      speakerId: 'narrator',
      onCamera: false,
      delivery: 'voiceover' as const,
      sourceRefs: [],
    }],
    charactersPresent: ['narrator'],
    relipSafe: false,
    relipSafety: undefined,
    shotIntent: {
      ...baseScene().shotIntent,
      narrativePurpose: 'Make the workflow failure visible without a performer.',
      emotionalBeat: 'Recognition.',
      action: 'interacting-with-object' as const,
      desiredFraming: 'insert' as const,
      desiredMovement: 'push-in' as const,
      movementMotivation: 'Move closer to reveal the empty owner column.',
      simultaneousPerformers: 0,
      spokenAudio: false,
      performance: [],
      continuity: {
        wardrobe: [],
        props: ['approval board'],
        previousSceneIds: ['unit_host'],
      },
    },
  };

  return {
    sidecarVersion: 1,
    characters: [
      { id: 'narrator', name: 'Narrator', role: 'narrator' },
      { id: 'host', name: 'Founder', role: 'host' },
    ],
    scenes: [baseScene(), bRoll],
    overallMusicPrompt: 'Restrained documentary pulse.',
    characterDescriptions: { host: 'Founder in a navy shirt.' },
    colorPalette: ['charcoal', 'white'],
    environmentNotes: 'Small home office.',
    suggestedProfileCategory: 'production-mode',
    sourceRefs: [],
  };
}

function sidecarWithExplicitPhysicalSubjects(): ScriptSidecar {
  const input = sidecar();
  const secondScene = input.scenes[1]!;
  const hostPerformance = baseScene().shotIntent.performance[0]!;
  secondScene.visualDescription = 'Founder stands beside the approval board and indicates the empty owner column.';
  secondScene.charactersPresent = ['host'];
  secondScene.shotIntent = {
    ...secondScene.shotIntent!,
    narrativePurpose: 'Make the workflow failure visible with a confirmed physical subject.',
    action: 'demonstrating',
    simultaneousPerformers: 1,
    performance: [{
      ...hostPerformance,
      stance: 'standing',
      emotion: 'focused recognition',
      gaze: 'toward the approval board',
      posture: 'upright beside the board',
      gesture: 'indicate the empty owner column',
      movement: 'remain on the confirmed subject mark',
    }],
  };
  return input;
}

describe('buildScriptShotPlan', () => {
  it('builds one optimized plan when every legacy physical scene has explicit subject evidence', () => {
    const result = buildScriptShotPlan({
      sidecar: sidecarWithExplicitPhysicalSubjects(),
      profile: profile(),
      aspectRatio: '9:16',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready shot plan');
    expect(result.plan.scenes).toHaveLength(2);
    expect(result.plan.scenes[1]?.performance).toEqual([
      expect.objectContaining({ characterId: 'host', performerMarkId: 'performer_scene_2_host' }),
    ]);
    expect(result.plan.scenes[1]?.continuity.previousSceneIds).toEqual(['scene_1']);
  });

  it('blocks performer-free legacy object capture without measured subject evidence', () => {
    const result = buildScriptShotPlan({ sidecar: sidecar(), profile: profile(), aspectRatio: '9:16' });

    expect(result.status).toBe('needs-user-input');
    if (result.status !== 'needs-user-input') throw new Error('Expected a subject calibration blocker');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'subject_calibration', sceneId: 'scene_2' }),
    ]));
  });

  it('blocks legacy scenes that have no same-pass shot intent', () => {
    const legacy = sidecarWithExplicitPhysicalSubjects();
    legacy.scenes[0] = { ...legacy.scenes[0]!, shotIntent: undefined };

    const result = buildScriptShotPlan({ sidecar: legacy, profile: profile(), aspectRatio: '9:16' });

    expect(result.status).toBe('needs-user-input');
    if (result.status !== 'needs-user-input') throw new Error('Expected a missing shot-intent blocker');
    expect(result.plan).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_shot_intent', sceneId: 'scene_1' }),
    ]));
  });

  it('enforces the approved setup-change limit after whole-script optimization', () => {
    const input = sidecarWithExplicitPhysicalSubjects();
    input.scenes[1] = {
      ...input.scenes[1]!,
      shotIntent: {
        ...input.scenes[1]!.shotIntent!,
        desiredAngle: 'high',
      },
    };

    const result = buildScriptShotPlan({
      sidecar: input,
      profile: profile(0),
      aspectRatio: '9:16',
    });

    expect(result.status).toBe('needs-user-input');
    if (result.status !== 'needs-user-input') throw new Error('Expected a setup-change blocker');
    expect(result.plan).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'setup_change_limit' }),
    ]));
  });

  it('rejects forward continuity references instead of silently rewiring them', () => {
    const input = sidecarWithExplicitPhysicalSubjects();
    input.scenes[0] = {
      ...input.scenes[0]!,
      shotIntent: {
        ...input.scenes[0]!.shotIntent!,
        continuity: {
          ...input.scenes[0]!.shotIntent!.continuity,
          previousSceneIds: ['unit_board'],
        },
      },
    };

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '9:16' });

    expect(result.status).toBe('needs-user-input');
    if (result.status !== 'needs-user-input') throw new Error('Expected a continuity blocker');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'forward_continuity_scene', sceneId: 'scene_1' }),
    ]));
  });
});
