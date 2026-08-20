import { describe, expect, it } from 'vitest';

import { buildScriptShotPlan } from '@/lib/thinkforge/production/build-script-shot-plan';
import {
  SCRIPT_RENDER_PLAN_VERSION,
  SCRIPT_SIDECAR_V2_VERSION,
  type ScriptSidecarV2,
} from '@/lib/thinkforge/schemas/script-sidecar-v2';

function profile() {
  return {
    version: 1,
    profileId: 'profile_v2_shoot_kit',
    spaces: [{
      id: 'room_a',
      label: 'Quiet office',
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
      prioritize: ['cost', 'setup-time'],
      householdSubstitutionsAllowed: true,
    },
  };
}

function longNarrativeSidecar(): ScriptSidecarV2 {
  return {
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines',
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    acts: [{
      id: 'act_context',
      title: 'Context',
      narrativePurpose: 'Explain the complete argument before the conclusion.',
      narrativeScenes: [{
        id: 'scene_long_argument',
        title: 'The complete argument',
        narrativePurpose: 'Keep the evidence in one coherent narrative scene.',
        durationIntentSeconds: 420,
        mood: 'measured',
        charactersPresent: ['narrator'],
        sourceRefs: [],
        beats: [{
          id: 'beat_long_argument',
          kind: 'voiceover',
          narrativePurpose: 'Walk through the evidence without artificial provider cuts.',
          durationIntentSeconds: 420,
          lines: [{
            id: 'line_long_argument',
            text: 'The narrator develops one complete, source-backed argument in its authored order.',
            speakerId: 'narrator',
            onCamera: false,
            delivery: 'voiceover',
            sourceRefs: [],
          }],
          visualIntent: {
            description: 'A restrained evidence board remains readable while the argument develops.',
            motion: 'Use only the movement motivated by the authored evidence progression.',
            onScreenText: [],
          },
          shotIntent: {
            narrativePurpose: 'Keep the evidence board legible throughout the explanation.',
            emotionalBeat: 'Measured clarity.',
            energy: 0.35,
            visualPriority: 'The evidence board and its changing proof points.',
            action: 'still',
            desiredFraming: 'medium',
            desiredAngle: 'eye-level',
            desiredMovement: 'static',
            simultaneousPerformers: 0,
            spokenAudio: false,
            performance: [],
            continuity: { wardrobe: [], props: ['evidence board'], previousSceneIds: [] },
          },
          sourceRefs: [],
        }],
      }],
    }],
    sourceRefs: [],
  };
}

function addTechnicalRenderPlan(sidecar: ScriptSidecarV2): void {
  sidecar.renderPlan = {
    version: SCRIPT_RENDER_PLAN_VERSION,
    source: 'technical-planner',
    renderSegments: [
      {
        id: 'render_segment_1',
        kind: 'voiceover',
        narrativeSceneId: 'scene_long_argument',
        beatId: 'beat_long_argument',
        lineSpans: [{ lineId: 'line_long_argument', startOffsetUtf16: 0, endOffsetUtf16: 10 }],
        durationSeconds: 8,
      },
      {
        id: 'render_segment_2',
        kind: 'voiceover',
        narrativeSceneId: 'scene_long_argument',
        beatId: 'beat_long_argument',
        lineSpans: [{ lineId: 'line_long_argument', startOffsetUtf16: 10, endOffsetUtf16: 20 }],
        durationSeconds: 8,
      },
    ],
  };
}

function longFormChapterPlan() {
  return {
    version: 1,
    title: 'Evidence documentary',
    narrativeThesis: 'Evidence becomes useful when the audience can follow its full context.',
    targetDurationSeconds: 420,
    audienceJourney: {
      openingState: 'Uncertain about the evidence.',
      closingState: 'Ready to act on the evidence.',
    },
    continuityBible: {
      pointOfView: 'Measured narrator.',
      temporalFrame: 'One continuous explanation.',
      toneProgression: ['Measured clarity.'],
      recurringMotifs: [],
      terminologyInvariants: [],
    },
    characters: [{
      id: 'narrator',
      name: 'Narrator',
      narrativeRole: 'Guide',
      voice: 'Measured and exact.',
      openingState: 'Introducing the evidence.',
      closingState: 'Connecting evidence to action.',
      invariantTraits: [],
    }],
    continuityThreads: [],
    acts: [{
      id: 'act_context',
      title: 'Context',
      narrativePurpose: 'Explain the complete argument before the conclusion.',
      chapters: [{
        id: 'chapter_evidence',
        title: 'The evidence',
        narrativePurpose: 'Develop the evidence as one coherent section.',
        audienceStateBefore: 'The evidence is unstructured.',
        audienceStateAfter: 'The evidence has clear meaning.',
        sceneBlueprints: [{
          id: 'scene_long_argument',
          title: 'The complete argument',
          narrativePurpose: 'Keep the evidence in one coherent narrative scene.',
          openingState: 'The evidence board is introduced.',
          development: ['The narrator connects each proof point.'],
          closingState: 'The evidence supports the conclusion.',
          durationIntentSeconds: 420,
          requiredSourceRefs: [],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: [],
        }],
      }],
    }],
  };
}

describe('buildScriptShotPlan V2 narrative reads', () => {
  it('plans one long narrative beat without requiring a render plan or imposing a duration cap', () => {
    const input = longNarrativeSidecar();
    expect(input.renderPlan).toBeUndefined();

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '16:9' });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready V2 shot plan');
    expect(result.plan.sourceSidecarVersion).toBe(SCRIPT_SIDECAR_V2_VERSION);
    expect(result.plan.scenes).toHaveLength(1);
    expect(result.plan.scenes[0]).toMatchObject({
      sceneId: 'beat_long_argument',
      generationUnitId: 'beat_long_argument',
      durationSec: 420,
      intent: {
        narrativePurpose: 'Keep the evidence board legible throughout the explanation.',
        emotionalBeat: 'Measured clarity.',
      },
    });
  });

  it('does not turn provider render segments into story or Shoot Kit units', () => {
    const input = longNarrativeSidecar();
    addTechnicalRenderPlan(input);

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '16:9' });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready V2 shot plan');
    expect(input.renderPlan?.renderSegments).toHaveLength(2);
    expect(result.plan.scenes).toHaveLength(1);
    expect(result.plan.scenes[0]?.durationSec).toBe(420);
  });

  it('keeps the approved long-form chapter hierarchy with the real Shoot Kit beats', () => {
    const result = buildScriptShotPlan({
      sidecar: longNarrativeSidecar(),
      chapterPlan: longFormChapterPlan(),
      profile: profile(),
      aspectRatio: '16:9',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready long-form Shoot Kit');
    expect(result.plan.narrativeStructure).toEqual({
      version: 1,
      acts: [{
        id: 'act_context',
        title: 'Context',
        narrativePurpose: 'Explain the complete argument before the conclusion.',
        chapters: [{
          id: 'chapter_evidence',
          title: 'The evidence',
          narrativePurpose: 'Develop the evidence as one coherent section.',
          narrativeScenes: [{
            id: 'scene_long_argument',
            title: 'The complete argument',
            narrativePurpose: 'Keep the evidence in one coherent narrative scene.',
            shootSceneIds: ['beat_long_argument'],
          }],
        }],
      }],
    });
  });

  it('fails closed when the saved chapter plan no longer owns the production sidecar scene', () => {
    const chapterPlan = longFormChapterPlan();
    chapterPlan.acts[0]!.chapters[0]!.sceneBlueprints[0]!.id = 'scene_stale';

    expect(buildScriptShotPlan({
      sidecar: longNarrativeSidecar(),
      chapterPlan,
      profile: profile(),
      aspectRatio: '16:9',
    })).toMatchObject({
      status: 'needs-user-input',
      plan: null,
      issues: [expect.objectContaining({ code: 'long_form_scene_unmapped' })],
    });
  });

  it('uses an authored single-beat narrative-scene duration when the beat omits its own', () => {
    const input = longNarrativeSidecar();
    delete input.acts[0]!.narrativeScenes[0]!.beats[0]!.durationIntentSeconds;

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '16:9' });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready V2 shot plan');
    expect(result.plan.scenes[0]?.durationSec).toBe(420);
  });

  it('preserves act, scene, and beat order while resolving narrative-scene continuity', () => {
    const input = longNarrativeSidecar();
    const firstScene = input.acts[0]!.narrativeScenes[0]!;
    const firstBeat = firstScene.beats[0]!;
    if (!firstBeat.shotIntent) throw new Error('Fixture requires shot intent');
    input.acts.push({
      id: 'act_conclusion',
      title: 'Conclusion',
      narrativePurpose: 'Close the argument after the evidence.',
      narrativeScenes: [{
        ...firstScene,
        id: 'scene_conclusion',
        title: 'The conclusion',
        narrativePurpose: 'State the conclusion after the full argument.',
        durationIntentSeconds: 30,
        beats: [{
          ...firstBeat,
          id: 'beat_conclusion',
          narrativePurpose: 'Land the conclusion.',
          durationIntentSeconds: 30,
          lines: [{ ...firstBeat.lines[0]!, id: 'line_conclusion' }],
          shotIntent: {
            ...firstBeat.shotIntent,
            narrativePurpose: 'Land the conclusion without changing the setup.',
            continuity: {
              ...firstBeat.shotIntent.continuity,
              previousSceneIds: ['scene_long_argument'],
            },
          },
        }],
      }],
    });

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '16:9' });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready V2 shot plan');
    expect(result.plan.scenes.map((scene) => scene.sceneId))
      .toEqual(['beat_long_argument', 'beat_conclusion']);
    expect(result.plan.scenes[1]?.continuity.previousSceneIds).toEqual(['beat_long_argument']);
  });

  it('rejects missing narrative timing even when a technical render duration exists', () => {
    const input = longNarrativeSidecar();
    delete input.acts[0]!.narrativeScenes[0]!.durationIntentSeconds;
    delete input.acts[0]!.narrativeScenes[0]!.beats[0]!.durationIntentSeconds;
    addTechnicalRenderPlan(input);

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '16:9' });

    expect(result).toMatchObject({
      status: 'needs-user-input',
      plan: null,
      issues: [expect.objectContaining({
        code: 'missing_narrative_duration',
        sceneId: 'beat_long_argument',
      })],
    });
  });

  it('rejects a V2 visual beat without authored shot intent instead of guessing a setup', () => {
    const input = longNarrativeSidecar();
    delete input.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent;

    const result = buildScriptShotPlan({ sidecar: input, profile: profile(), aspectRatio: '16:9' });

    expect(result).toMatchObject({
      status: 'needs-user-input',
      plan: null,
      issues: [expect.objectContaining({
        code: 'missing_shot_intent',
        sceneId: 'beat_long_argument',
      })],
    });
  });
});
