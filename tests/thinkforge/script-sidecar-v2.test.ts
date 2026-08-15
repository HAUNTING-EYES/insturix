import { describe, expect, it } from 'vitest';
import {
  adaptScriptSidecarV1,
  readScriptSidecar,
} from '@/lib/thinkforge/schemas/script-sidecar-v1-adapter';
import {
  getCanonicalBeatSpokenText,
  parseScriptSidecarV2,
  SCRIPT_SIDECAR_V2_VERSION,
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
            onCamera: true,
            delivery: 'sync-dialogue',
            sourceRefs: ['ref_1'],
          }],
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

  it('keeps beat lines as the only canonical spoken-text source', () => {
    const parsed = parseScriptSidecarV2({
      ...v2Sidecar(),
      acts: [{
        ...v2Sidecar().acts[0],
        narrativeScenes: [{
          ...v2Sidecar().acts[0]!.narrativeScenes[0],
          beats: [{
            ...v2Sidecar().acts[0]!.narrativeScenes[0]!.beats[0],
            lines: [
              {
                id: 'line_1',
                text: 'First spoken line.',
                speakerId: 'host',
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
