import { describe, expect, it } from 'vitest';
import {
  assertUsableScriptWriterResult,
  type ScriptWriterResult,
} from '@/lib/thinkforge/agents/script-writer-agent';
import { SCRIPT_SIDECAR_VERSION, type ScriptSidecar } from '@/lib/thinkforge/schemas/script-sidecar';

const canonicalScript = `## Scene 1: The stalled launch
**Narration:** Ops teams do not lose a launch in one dramatic failure. They lose it in tiny approval loops that never get owned.
**Visual:** Split screen of scattered comments, calendar slips, and one owner moving cards into a single approval lane.

## Scene 2: The cleaner lane
**Narration:** Put one person in charge of final feedback, and the team stops rewriting the same decision five times.
**Visual:** Clean production board with one highlighted approval owner and a finished asset moving to publish.`;

function makeSidecar(overrides: Partial<ScriptSidecar> = {}): ScriptSidecar {
  return {
    sidecarVersion: SCRIPT_SIDECAR_VERSION,
    characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
    overallMusicPrompt: 'restrained documentary bed with light pulse',
    characterDescriptions: {},
    colorPalette: ['charcoal', 'warm white', 'muted yellow'],
    environmentNotes: 'Operations workspace with launch board and calendar.',
    suggestedProfileCategory: 'production-mode',
    sourceRefs: [],
    scenes: [
      {
        title: 'The stalled launch',
        narration: 'Ops teams do not lose a launch in one dramatic failure.',
        visualDescription: 'Scattered comments, calendar slips, and an ownerless approval board.',
        videoMotionPrompt: 'slow push across the stalled board',
        audioDescription: '',
        musicDescription: 'subtle tension',
        sfxDescription: '',
        durationSeconds: 21,
        mood: 'serious',
        imageQualityTokens: 'clean product-documentary lighting',
        videoQualityTokens: 'steady camera, readable interface details',
        generationUnitId: 'scene_1',
        primaryVisualForUnit: true,
        sceneType: 'montage',
        assetRecommendation: 'ai-video',
        lines: [
          {
            text: 'Ops teams do not lose a launch in one dramatic failure.',
            speakerId: 'narrator',
            onCamera: false,
            delivery: 'voiceover',
            sourceRefs: [],
          },
        ],
        charactersPresent: ['narrator'],
        relipSafe: false,
        sourceRefs: [],
      },
      {
        title: 'The cleaner lane',
        narration: 'Put one person in charge of final feedback.',
        visualDescription: 'A clean production board with one highlighted approval owner.',
        videoMotionPrompt: 'gentle pan to the highlighted approval owner',
        audioDescription: '',
        musicDescription: 'quiet lift',
        sfxDescription: '',
        durationSeconds: 21,
        mood: 'calm',
        imageQualityTokens: 'polished interface closeup',
        videoQualityTokens: 'smooth motion, crisp UI',
        generationUnitId: 'scene_2',
        primaryVisualForUnit: true,
        sceneType: 'montage',
        assetRecommendation: 'ai-video',
        lines: [
          {
            text: 'Put one person in charge of final feedback.',
            speakerId: 'narrator',
            onCamera: false,
            delivery: 'voiceover',
            sourceRefs: [],
          },
        ],
        charactersPresent: ['narrator'],
        relipSafe: false,
        sourceRefs: [],
      },
    ],
    ...overrides,
  };
}

function makeResult(overrides: Partial<ScriptWriterResult> = {}): ScriptWriterResult {
  return {
    content: canonicalScript,
    contentAnalysis: {
      hooks: ['approval loops cost launches'],
      theme: 'single-owner approvals',
      emphasisPoints: ['hidden cost', 'ownership fix'],
      qualityScore: 92,
    },
    visualMetadata: {
      motionInfo: 'restrained documentary pacing with clean interface closeups',
      scenePrompts: [
        'Scene 1 visual: scattered comments, slipped calendar, stalled launch board, anxious ops team.',
        'Scene 2 visual: one approval owner, clean board, finished asset moving toward publish.',
      ],
    },
    metadata: {
      estimatedTimeSeconds: 42,
      platform: 'instagram',
    },
    sidecar: makeSidecar(),
    ...overrides,
  };
}

describe('assertUsableScriptWriterResult', () => {
  it('accepts canonical markdown scene scripts that can hydrate a script board', () => {
    expect(() => assertUsableScriptWriterResult(makeResult())).not.toThrow();
  });

  it('rejects raw ThinkForge block dumps inside the script content field', () => {
    const rawBlockDump = JSON.stringify({
      blocks: [
        { kind: 'header', content: [{ type: 'text', text: 'Scene 1: The stalled launch' }] },
        { kind: 'paragraph', content: [{ type: 'text', text: 'This is not a usable script board.' }] },
      ],
    });

    expect(() => assertUsableScriptWriterResult(makeResult({ content: rawBlockDump }))).toThrow(
      /schema_artifact_content/,
    );
  });

  it('rejects prose that has no scene contract for downstream boards', () => {
    const blocklessProse = [
      'The launch slipped because every team member thought someone else had the final say.',
      'The stronger move is to assign one approval owner before production begins, then route every objection through that owner.',
      'That makes the creative path visible, reduces duplicate feedback, and gives the publish team a real finish line.',
    ].join(' ');

    expect(() => assertUsableScriptWriterResult(makeResult({ content: blocklessProse }))).toThrow(
      /missing_scene_headers/,
    );
  });

  it('rejects scripts whose scene prompts cannot map one-to-one to scenes', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          visualMetadata: {
            motionInfo: 'restrained documentary pacing',
            scenePrompts: ['Only one prompt for two script scenes.'],
          },
        }),
      ),
    ).toThrow(/scene_prompt_count_mismatch:1\/2/);
  });

  it('rejects scripts without a valid same-pass sidecar', () => {
    expect(() =>
      assertUsableScriptWriterResult({
        ...makeResult(),
        sidecar: undefined as unknown as ScriptWriterResult['sidecar'],
      }),
    ).toThrow(/invalid_sidecar/);
  });

  it('rejects sidecars whose scene count does not match the visible script', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({ scenes: [makeSidecar().scenes[0]!] }),
        }),
      ),
    ).toThrow(/sidecar_scene_count_mismatch:1\/2/);
  });
});