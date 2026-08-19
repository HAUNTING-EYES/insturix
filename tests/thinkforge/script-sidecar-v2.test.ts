import { describe, expect, it } from 'vitest';
import {
  adaptScriptSidecarV1,
  readScriptSidecar,
} from '@/lib/thinkforge/schemas/script-sidecar-v1-adapter';
import {
  getCanonicalBeatSpokenText,
  parseScriptSidecarV2,
  SCRIPT_SIDECAR_V2_VERSION,
  ScriptWriterSidecarV2ModelSchema,
  ScriptWriterSidecarV2Schema,
} from '@/lib/thinkforge/schemas/script-sidecar-v2';
import {
  parseScriptSidecar,
  SCRIPT_SIDECAR_VERSION,
} from '@/lib/thinkforge/schemas/script-sidecar';

function v1Sidecar() {
  return {
    sidecarVersion: SCRIPT_SIDECAR_VERSION,
    legacyMarker: { retain: true },
    characters: [{ id: 'host', name: 'Host', role: 'host' }],
    scenes: [{
      title: 'One complete argument',
      narration: 'Stale compatibility narration.',
      visualDescription: 'Host explains the complete argument at a desk.',
      videoMotionPrompt: 'Slow push in.',
      audioDescription: 'Clean dialogue.',
      musicDescription: 'Restrained underscore.',
      sfxDescription: '',
      durationSeconds: 25,
      mood: 'serious',
      imageQualityTokens: 'natural light',
      videoQualityTokens: 'stable footage',
      generationUnitId: 'argument_take',
      primaryVisualForUnit: true,
      sceneType: 'talking-head',
      assetRecommendation: 'ai-video',
      lines: [{
        text: 'This remains one narrative scene even when a renderer needs smaller jobs.',
        speakerId: 'host',
        onCamera: true,
        delivery: 'sync-dialogue',
        sourceRefs: ['ref_1'],
      }],
      sourceRefs: ['ref_1'],
      charactersPresent: ['host'],
      relipSafe: true,
      shotIntent: {
        narrativePurpose: 'Make the evidence feel direct and credible.',
        emotionalBeat: 'Measured confidence.',
        energy: 0.45,
        visualPriority: 'The host and their explanation.',
        action: 'talking',
        desiredFraming: 'medium-close-up',
        desiredAngle: 'eye-level',
        desiredMovement: 'push-in',
        movementMotivation: 'Increase attention as the argument lands.',
        simultaneousPerformers: 1,
        spokenAudio: true,
        performance: [{
          characterId: 'host',
          stance: 'seated',
          emotion: 'assured',
          intensity: 0.45,
          gaze: 'into camera',
          posture: 'upright and relaxed',
          gesture: 'small open-hand gestures',
          movement: 'minimal natural movement',
        }],
        continuity: {
          wardrobe: ['charcoal shirt'],
          props: ['desk'],
          previousSceneIds: [],
        },
      },
      legacySceneMarker: 'retain-me',
    }],
    overallMusicPrompt: 'Restrained underscore.',
    characterDescriptions: { host: 'Founder at a desk.' },
    colorPalette: ['charcoal', 'white'],
    environmentNotes: 'Quiet office.',
    globalEditDirections: { pacing: 'measured' },
    suggestedProfileCategory: 'production-mode',
    briefId: 'brief_1',
    sourceRefs: ['ref_1'],
  };
}

function v2Sidecar() {
  const text = '123456789012345678901234';
  return {
    sidecarVersion: SCRIPT_SIDECAR_V2_VERSION,
    spokenTextSource: 'beat-lines',
    characters: [{ id: 'host', name: 'Host', role: 'host' }],
    acts: [{
      id: 'act_1',
      title: 'Act one',
      narrativePurpose: 'Establish the central argument.',
      narrativeScenes: [{
        id: 'scene_1',
        title: 'The argument',
        narrativePurpose: 'Deliver one coherent thought.',
        durationIntentSeconds: 24,
        charactersPresent: ['host'],
        sourceRefs: ['ref_1'],
        beats: [{
          id: 'beat_1',
          kind: 'dialogue',
          narrativePurpose: 'State the evidence.',
          durationIntentSeconds: 24,
          lines: [{
            id: 'line_1',
            text,
            speakerId: 'host',
            languageCode: 'en',
            onCamera: true,
            delivery: 'sync-dialogue',
            sourceRefs: ['ref_1'],
          }],
          shotIntent: {
            narrativePurpose: 'Deliver one coherent thought directly.',
            emotionalBeat: 'Calm conviction.',
            energy: 0.4,
            visualPriority: 'The host speaking.',
            action: 'talking',
            desiredFraming: 'medium-close-up',
            desiredAngle: 'eye-level',
            desiredMovement: 'static',
            movementMotivation: '',
            simultaneousPerformers: 1,
            spokenAudio: true,
            performance: [{
              characterId: 'host',
              stance: 'seated',
              emotion: 'focused',
              intensity: 0.4,
              gaze: 'into camera',
              posture: 'upright',
              gesture: 'controlled hand gestures',
              movement: 'natural micro-movements',
            }],
            continuity: { wardrobe: [], props: [], previousSceneIds: [] },
          },
          sourceRefs: ['ref_1'],
        }],
      }],
    }],
    renderPlan: {
      version: 1,
      source: 'technical-planner',
      renderSegments: [
        {
          id: 'segment_1',
          kind: 'lip-sync',
          narrativeSceneId: 'scene_1',
          beatId: 'beat_1',
          lineSpans: [{ lineId: 'line_1', startOffsetUtf16: 0, endOffsetUtf16: 8 }],
          durationSeconds: 8,
        },
        {
          id: 'segment_2',
          kind: 'lip-sync',
          narrativeSceneId: 'scene_1',
          beatId: 'beat_1',
          lineSpans: [{ lineId: 'line_1', startOffsetUtf16: 8, endOffsetUtf16: 16 }],
          durationSeconds: 8,
        },
        {
          id: 'segment_3',
          kind: 'lip-sync',
          narrativeSceneId: 'scene_1',
          beatId: 'beat_1',
          lineSpans: [{ lineId: 'line_1', startOffsetUtf16: 16, endOffsetUtf16: 24 }],
          durationSeconds: 8,
        },
      ],
    },
    sourceRefs: ['ref_1'],
  };
}

describe('Script Sidecar V2 narrative contract', () => {
  it('preserves the complete normalized V1 read while projecting one unsplit narrative scene', () => {
    const input = v1Sidecar();
    const result = adaptScriptSidecarV1(input);

    expect(result.legacyV1).toEqual(parseScriptSidecar(input));
    expect(result.legacyV1).toMatchObject({
      legacyMarker: { retain: true },
      scenes: [{ legacySceneMarker: 'retain-me' }],
    });
    expect(result.sidecar.acts[0]?.narrativeScenes).toHaveLength(1);
    expect(result.sidecar.acts[0]?.narrativeScenes[0]?.durationIntentSeconds).toBe(25);
    expect(result.sidecar.renderPlan?.renderSegments).toHaveLength(1);
    expect(result.sidecar.renderPlan?.renderSegments[0]?.durationSeconds).toBe(25);
    expect(result.sidecar.acts[0]?.narrativeScenes[0]?.beats[0]).toMatchObject({
      visualIntent: {
        imageQualityTokens: 'natural light',
        videoQualityTokens: 'stable footage',
        assetRecommendation: 'ai-video',
      },
      audioIntent: {
        ambience: 'Clean dialogue.',
        music: 'Restrained underscore.',
        sfx: [],
      },
      shotIntent: input.scenes[0]!.shotIntent,
    });
  });

  it('treats a missing version as a historical V1 document', () => {
    const input = v1Sidecar() as Record<string, unknown>;
    delete input.sidecarVersion;

    const result = readScriptSidecar(input);

    expect(result.sourceVersion).toBe(SCRIPT_SIDECAR_VERSION);
    expect(result.sidecar.sidecarVersion).toBe(SCRIPT_SIDECAR_V2_VERSION);
  });

  it('keeps every currently readable V1 document readable through the adapter', () => {
    const input = v1Sidecar();
    input.characters.push({ ...input.characters[0]! });
    input.scenes[0]!.lines[0]!.text = '';

    const result = adaptScriptSidecarV1(input);

    expect(result.legacyV1).toEqual(parseScriptSidecar(input));
    expect(result.sidecar.characters).toHaveLength(1);
    expect(result.sidecar.acts[0]?.narrativeScenes[0]?.beats[0]?.lines[0]?.text).toBe('');
  });

  it('allows several provider render segments to reference one narrative scene and beat', () => {
    const parsed = parseScriptSidecarV2(v2Sidecar());

    expect(parsed.acts).toHaveLength(1);
    expect(parsed.acts[0]?.narrativeScenes).toHaveLength(1);
    expect(parsed.acts[0]?.narrativeScenes[0]?.beats).toHaveLength(1);
    expect(parsed.renderPlan?.renderSegments).toHaveLength(3);
  });

  it('allows a long narrative beat while keeping provider segmentation optional', () => {
    const input = v2Sidecar();
    input.acts[0]!.narrativeScenes[0]!.durationIntentSeconds = 180;
    input.acts[0]!.narrativeScenes[0]!.beats[0]!.durationIntentSeconds = 180;
    input.renderPlan = undefined as never;

    const parsed = parseScriptSidecarV2(input);

    expect(parsed.acts[0]?.narrativeScenes[0]?.durationIntentSeconds).toBe(180);
    expect(parsed.renderPlan).toBeUndefined();
  });

  it('rejects inconsistent shot performers and spoken-audio declarations', () => {
    const unknownPerformer = v2Sidecar();
    unknownPerformer.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.performance[0]!.characterId = 'ghost';
    expect(() => parseScriptSidecarV2(unknownPerformer)).toThrow(/must resolve to characters/);

    const offScenePerformer = v2Sidecar();
    offScenePerformer.characters.push({ id: 'guest', name: 'Guest', role: 'interviewee' });
    offScenePerformer.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.performance[0]!.characterId = 'guest';
    expect(() => parseScriptSidecarV2(offScenePerformer)).toThrow(/must be present/);

    const missingSpeaker = v2Sidecar();
    missingSpeaker.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.performance = [];
    missingSpeaker.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.simultaneousPerformers = 0;
    expect(() => parseScriptSidecarV2(missingSpeaker)).toThrow(/must have performance intent/);

    const wrongSpokenAudio = v2Sidecar();
    wrongSpokenAudio.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!.spokenAudio = false;
    expect(() => parseScriptSidecarV2(wrongSpokenAudio)).toThrow(/must match/);
  });

  it('keeps provider decoding structural while the narrative contract remains strict', () => {
    const { renderPlan: _renderPlan, ...narrativeOnly } = v2Sidecar();
    const draft = ScriptWriterSidecarV2ModelSchema.parse(narrativeOnly);
    const shotIntent = draft.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent!;
    const omitted = structuredClone(draft);
    const omittedShot = omitted.acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent! as {
      movementMotivation?: string;
    };
    delete omittedShot.movementMotivation;
    shotIntent.energy = 4;
    shotIntent.desiredMovement = 'push-in';
    shotIntent.movementMotivation = '';
    shotIntent.spokenAudio = false;

    expect(ScriptWriterSidecarV2ModelSchema.safeParse(omitted).success).toBe(false);
    expect(ScriptWriterSidecarV2ModelSchema.safeParse(draft).success).toBe(true);
    expect(ScriptWriterSidecarV2Schema.safeParse(draft).success).toBe(false);
    expect(() => parseScriptSidecarV2(draft)).toThrow(/energy|movementMotivation|spokenAudio/);
  });

  it('keeps beat lines as the only canonical spoken-text source', () => {
    const parsed = parseScriptSidecarV2({
      ...v2Sidecar(),
      acts: [{
        ...v2Sidecar().acts[0],
        narrativeScenes: [{
          ...v2Sidecar().acts[0]!.narrativeScenes[0],
          beats: [{
            ...v2Sidecar().acts[0]!.narrativeScenes[0]!.beats[0],
            shotIntent: {
              ...v2Sidecar().acts[0]!.narrativeScenes[0]!.beats[0]!.shotIntent,
              spokenAudio: false,
            },
            lines: [
              {
                id: 'line_1',
                text: 'First spoken line.',
                speakerId: 'host',
                languageCode: 'en',
                onCamera: false,
                delivery: 'voiceover',
                sourceRefs: ['ref_1'],
              },
              {
                id: 'line_2',
                text: 'TITLE CARD',
                onCamera: false,
                delivery: 'on-screen-text',
                sourceRefs: [],
              },
              {
                id: 'line_3',
                text: 'Second spoken line.',
                speakerId: 'host',
                languageCode: 'en',
                onCamera: false,
                delivery: 'voiceover',
                sourceRefs: [],
              },
            ],
          }],
        }],
      }],
      renderPlan: undefined,
    });

    expect(getCanonicalBeatSpokenText(parsed.acts[0]!.narrativeScenes[0]!.beats[0]!))
      .toBe('First spoken line. Second spoken line.');
  });

  it('preserves per-line language identity without forcing one global voice language', () => {
    const input = v2Sidecar();
    const beat = input.acts[0]!.narrativeScenes[0]!.beats[0]!;
    beat.lines.push({
      id: 'line_2',
      text: 'Ahora seguimos en espanol.',
      speakerId: 'host',
      languageCode: 'es-MX',
      onCamera: true,
      delivery: 'sync-dialogue',
      sourceRefs: [],
    });

    const parsed = parseScriptSidecarV2(input);

    expect(parsed.acts[0]?.narrativeScenes[0]?.beats[0]?.lines.map((line) => line.languageCode))
      .toEqual(['en', 'es-MX']);

    beat.lines[1]!.languageCode = 'English';
    expect(() => parseScriptSidecarV2(input)).toThrow(/languageCode/);
  });

  it('keeps technical render plans outside the model-facing writer schema', () => {
    const { renderPlan: _renderPlan, ...narrativeOnly } = v2Sidecar();

    expect(ScriptWriterSidecarV2Schema.safeParse(narrativeOnly).success).toBe(true);
    expect(ScriptWriterSidecarV2Schema.safeParse(v2Sidecar()).success).toBe(false);
    expect(parseScriptSidecarV2(v2Sidecar()).renderPlan?.renderSegments).toHaveLength(3);
  });

  it('rejects broken scene, beat, line, and offset references in render segments', () => {
    const badScene = v2Sidecar();
    badScene.renderPlan.renderSegments[0]!.narrativeSceneId = 'missing_scene';
    expect(() => parseScriptSidecarV2(badScene)).toThrow(/does not exist/);

    const badBeat = v2Sidecar();
    badBeat.renderPlan.renderSegments[0]!.beatId = 'missing_beat';
    expect(() => parseScriptSidecarV2(badBeat)).toThrow(/does not exist/);

    const badLine = v2Sidecar();
    badLine.renderPlan.renderSegments[0]!.lineSpans[0]!.lineId = 'missing_line';
    expect(() => parseScriptSidecarV2(badLine)).toThrow(/does not exist/);

    const badOffset = v2Sidecar();
    badOffset.renderPlan.renderSegments[0]!.lineSpans[0]!.endOffsetUtf16 = 100;
    expect(() => parseScriptSidecarV2(badOffset)).toThrow(/exceeds the canonical line text length/);
  });

  it('rejects duplicated spoken text on a technical render segment', () => {
    const input = v2Sidecar();
    Object.assign(input.renderPlan.renderSegments[0]!, { spokenText: 'duplicated copy' });

    expect(() => parseScriptSidecarV2(input)).toThrow();
  });

  it('discriminates versions before invoking either parser', () => {
    expect(() => readScriptSidecar({ ...v1Sidecar(), sidecarVersion: 3 }))
      .toThrow(/Unsupported script sidecar version: 3/);
    expect(() => parseScriptSidecarV2({ ...v2Sidecar(), sidecarVersion: 1 }))
      .toThrow(/Expected Script Sidecar version 2/);
  });
});
