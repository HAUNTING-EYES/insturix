import { describe, expect, it } from 'vitest';
import {
  PostWriterResultSchema,
  type PostWriterResult,
} from '../../lib/thinkforge/agents/post-writer-agent';
import {
  ScriptWriterResultSchema,
  type ScriptWriterResult,
} from '../../lib/thinkforge/agents/script-writer-agent';
import {
  ThinkForgeAuthoringRequestSchema,
  type ThinkForgeAuthoringRequest,
} from '../../lib/thinkforge/schemas/authoring-request';
import {
  scoreThinkForgeWriterEval,
  scoreWriterEvalGrounding,
  type WriterEvalCase,
} from '../../scripts/prompt-optimization/thinkforge-writer-eval-scoring';

function postRequest(): ThinkForgeAuthoringRequest {
  return ThinkForgeAuthoringRequestSchema.parse({
    contentContract: {
      documentKind: 'post',
      outputKind: 'social_post',
      artifactType: 'social_post',
    },
    platformSurface: { id: 'linkedin' },
    postControls: {
      cta: { preference: 'none' },
      hashtags: { preference: 'none' },
      emoji: { preference: 'none' },
    },
  });
}

function scriptRequest(targetDurationSec = 420): ThinkForgeAuthoringRequest {
  return ThinkForgeAuthoringRequestSchema.parse({
    contentContract: {
      documentKind: 'script',
      outputKind: 'video_script',
      artifactType: 'screenplay',
    },
    platformSurface: { id: 'youtube' },
    targetDurationSec,
  });
}

function postCase(overrides: Partial<WriterEvalCase> = {}): WriterEvalCase {
  return {
    id: 1,
    name: 'Held-out post',
    documentType: 'post',
    projectSummary: 'FlowLedger supports finance operations teams.',
    userPrompt: 'Write a measured LinkedIn post.',
    expectedPath: 'post',
    criteria: {},
    ...overrides,
  };
}

function scriptCase(overrides: Partial<WriterEvalCase> = {}): WriterEvalCase {
  return {
    id: 2,
    name: 'Held-out long-form script',
    documentType: 'video_script',
    projectSummary: 'A seven-minute evidence-led documentary.',
    userPrompt: 'Write a seven-minute YouTube script.',
    expectedPath: 'script',
    criteria: {
      requiredCharacterNames: ['Maya', 'Jon'],
      requiredLanguageCodes: ['hi'],
      maximumSpokenWords: 12,
    },
    ...overrides,
  };
}

function validPost(): PostWriterResult {
  const content = 'FlowLedger keeps audit evidence organized for finance teams. The beta result stays in context.';
  return PostWriterResultSchema.parse({
    content,
    hashtags: [],
    contentAnalysis: {
      tone: 'Measured',
      vibe: 'Operator-led',
      theme: 'Audit readiness',
      qualityScore: 96,
      violations: [],
    },
    clickatron: {
      singleImagePrompt: 'Organized evidence folders on a finance desk, editorial lighting, clear negative space.',
    },
    metadata: { platform: 'linkedin', charCount: content.length },
  });
}

function validScript(): ScriptWriterResult {
  return ScriptWriterResultSchema.parse({
    content: [
      '# Act 1: Evidence',
      '## Scene 1: The archive',
      '**Maya (voiceover):** नमस्ते, आज हम प्रमाणों की कहानी समझेंगे।',
      '**Visual:** Maya opens a dated archive while Jon checks the supporting notes.',
    ].join('\n\n'),
    contentAnalysis: {
      hooks: ['One archive changed the investigation.'],
      theme: 'Evidence before conclusions',
      emphasisPoints: ['Show the dated record.'],
      qualityScore: 96,
    },
    visualMetadata: {
      motionInfo: 'Measured documentary camera movement.',
      scenePrompts: ['A dated archive opens on a research table while two investigators compare evidence.'],
    },
    metadata: {
      estimatedTimeSeconds: 420,
      platform: 'youtube',
      voiceLanguages: ['hi-IN'],
    },
    sidecar: {
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters: [
        { id: 'maya', name: 'Maya', role: 'host' },
        { id: 'jon', name: 'Jon', role: 'expert' },
      ],
      acts: [{
        id: 'act-1',
        title: 'Evidence',
        narrativePurpose: 'Establish the source before interpreting it.',
        narrativeScenes: [{
          id: 'scene-1',
          title: 'The archive',
          narrativePurpose: 'Open on a concrete primary source.',
          durationIntentSeconds: 420,
          charactersPresent: [],
          sourceRefs: [],
          beats: [{
            id: 'beat-1',
            kind: 'voiceover',
            narrativePurpose: 'Frame the investigation.',
            durationIntentSeconds: 420,
            lines: [{
              id: 'line-1',
              text: 'नमस्ते, आज हम प्रमाणों की कहानी समझेंगे।',
              speakerId: 'maya',
              languageCode: 'hi-IN',
              onCamera: false,
              delivery: 'voiceover',
              sourceRefs: [],
            }],
            visualIntent: {
              description: 'Maya opens a dated archive while Jon compares the evidence.',
              onScreenText: [],
            },
            shotIntent: {
              narrativePurpose: 'Reveal the primary source.',
              emotionalBeat: 'Focused curiosity',
              energy: 0.35,
              visualPriority: 'The dated archive',
              action: 'demonstrating',
              desiredFraming: 'wide',
              desiredAngle: 'eye-level',
              desiredMovement: 'static',
              simultaneousPerformers: 0,
              spokenAudio: false,
              performance: [],
              continuity: { wardrobe: [], props: ['archive'], previousSceneIds: [] },
            },
            sourceRefs: [],
          }],
        }],
      }],
      sourceRefs: [],
    },
  });
}

describe('ThinkForge writer eval scoring', () => {
  it('passes a schema-valid post that obeys explicit post controls', () => {
    const scores = scoreThinkForgeWriterEval({
      result: validPost(),
      testCase: postCase(),
      authoringRequest: postRequest(),
      routedCorrectly: true,
    });

    expect(scores.structural.ratio).toBe(1);
    expect(scores.structured.ratio).toBe(1);
    expect(scores.quality.ratio).toBe(1);
    expect(scores.combinedRatio).toBe(1);
  });

  it('rejects script-shaped post copy, hidden internals, hashtags, and an unwanted CTA', () => {
    const result = {
      ...validPost(),
      content: '# Scene 1\n\n**Visual:** Open tf_untrusted_data.\n\nWhat do you think? #Audit',
      hashtags: ['#Audit'],
    };
    const scores = scoreThinkForgeWriterEval({
      result,
      testCase: postCase(),
      authoringRequest: postRequest(),
      routedCorrectly: true,
    });

    expect(scores.structural.checks).toMatchObject({
      no_scene_headings: false,
      no_visual_labels: false,
      hashtags_not_in_body: false,
      hashtag_control: false,
      cta_control: false,
      no_internal_leakage: false,
    });
  });

  it('matches grounding aliases and diacritics without awarding an unrequested floor point', () => {
    const testCase = postCase({
      grounding: ['sábado', ['11am', '11:00']],
      criteria: {},
    });
    const grounding = scoreWriterEvalGrounding('El taller es sabado a las 11:00.', testCase);
    const scores = scoreThinkForgeWriterEval({
      result: validPost(),
      testCase,
      authoringRequest: postRequest(),
      routedCorrectly: true,
    });

    expect(grounding).toMatchObject({ coverage: 1, total: 2, missing: [] });
    expect(scores.combinedRatio).toBe(1);
  });

  it('passes long-form runtime, sidecar parity, cast, language, and speech-budget contracts', () => {
    const scores = scoreThinkForgeWriterEval({
      result: validScript(),
      testCase: scriptCase(),
      authoringRequest: scriptRequest(),
      routedCorrectly: true,
    });

    expect(scores.structural.ratio).toBe(1);
    expect(scores.structured.ratio).toBe(1);
    expect(scores.quality.ratio).toBe(1);
    expect(scores.combinedRatio).toBe(1);
  });

  it('fails wrong runtime, prompt parity, cast, language, speech budget, and routing independently', () => {
    const valid = validScript();
    const scene = valid.sidecar.acts[0]!.narrativeScenes[0]!;
    const beat = scene.beats[0]!;
    const result: ScriptWriterResult = {
      ...valid,
      visualMetadata: { ...valid.visualMetadata, scenePrompts: [] },
      metadata: { ...valid.metadata, estimatedTimeSeconds: 419, voiceLanguages: ['en-US'] },
      sidecar: {
        ...valid.sidecar,
        characters: valid.sidecar.characters.filter((character) => character.name !== 'Jon'),
        acts: [{
          ...valid.sidecar.acts[0]!,
          narrativeScenes: [{
            ...scene,
            beats: [{
              ...beat,
              lines: [{
                ...beat.lines[0]!,
                text: 'one two three four five six seven eight nine ten eleven twelve thirteen',
                languageCode: 'en-US',
              }],
            }],
          }],
        }],
      },
    };
    const scores = scoreThinkForgeWriterEval({
      result,
      testCase: scriptCase(),
      authoringRequest: scriptRequest(),
      routedCorrectly: false,
    });

    expect(scores.structured.checks).toMatchObject({
      scene_prompts_match_scenes: false,
      'character_present:Jon': false,
      'language_present:hi': false,
      'spoken_words_max:12': false,
    });
    expect(scores.quality.checks.exact_runtime).toBe(false);
    expect(scores.combinedRatio).toBeLessThan(1);
  });
});
