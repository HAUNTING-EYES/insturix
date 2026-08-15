import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateStructuredWithWritingContextCacheMock } = vi.hoisted(() => ({
  generateStructuredWithWritingContextCacheMock: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/gemini-writing-context-cache', () => ({
  generateStructuredWithWritingContextCache: generateStructuredWithWritingContextCacheMock,
}));
import {
  assertUsableScriptWriterResult,
  materializeScriptWriterResult,
  ScriptWriterAgent,
  ScriptWriterModelOutputSchema,
  type ScriptWriterModelOutput,
  type ScriptWriterResult,
} from '@/lib/thinkforge/agents/script-writer-agent';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import { SCRIPT_SIDECAR_VERSION, type ScriptSidecar } from '@/lib/thinkforge/schemas/script-sidecar';
import { buildThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger';

type SidecarScene = ScriptSidecar['scenes'][number];

const canonicalScript = `## Scene 1: The stalled launch
**Narration:** Ops teams do not lose a launch in one dramatic failure. They lose it in tiny approval loops that never get owned.
**Visual:** Split screen of scattered comments, calendar slips, and one owner moving cards into a single approval lane.

## Scene 2: The cleaner lane
**Narration:** Put one person in charge of final feedback, and the team stops rewriting the same decision five times.
**Visual:** Clean production board with one highlighted approval owner and a finished asset moving to publish.`;

const hostCharacter = { id: 'host', name: 'Host', role: 'host' as const };

function makeShotIntent(
  overrides: Partial<NonNullable<SidecarScene['shotIntent']>> = {},
): NonNullable<SidecarScene['shotIntent']> {
  return {
    narrativePurpose: 'Make the operational problem immediately visible.',
    emotionalBeat: 'Recognition followed by controlled relief.',
    energy: 0.55,
    visualPriority: 'The single approval owner remains readable.',
    action: 'still',
    desiredFraming: 'medium',
    desiredAngle: 'eye-level',
    desiredMovement: 'static',
    simultaneousPerformers: 0,
    spokenAudio: false,
    performance: [],
    continuity: { wardrobe: [], props: ['approval board'], previousSceneIds: [] },
    ...overrides,
  };
}

function makeOnCameraScene(overrides: Partial<SidecarScene> = {}): SidecarScene {
  return {
    title: 'Host explains the fix',
    narration: 'Put one accountable owner between draft and publish.',
    visualDescription: 'Host speaking to camera, face visible, medium close-up, light occlusion, moderate motion.',
    videoMotionPrompt: 'static tripod framing with one measured hand gesture',
    audioDescription: '',
    musicDescription: 'quiet pulse under the host line',
    sfxDescription: '',
    durationSeconds: 8,
    mood: 'serious',
    imageQualityTokens: 'clean studio lighting, clear face framing',
    videoQualityTokens: 'steady talking-head frame, lip-sync safe',
    generationUnitId: 'scene_1',
    primaryVisualForUnit: true,
    sceneType: 'talking-head',
    assetRecommendation: 'ai-video',
    lines: [
      {
        text: 'Put one accountable owner between draft and publish.',
        speakerId: 'host',
        onCamera: true,
        delivery: 'sync-dialogue',
        sourceRefs: [],
      },
    ],
    charactersPresent: ['host'],
    shotIntent: makeShotIntent({
      narrativePurpose: 'Deliver the corrective action directly to the viewer.',
      emotionalBeat: 'Calm authority.',
      action: 'talking',
      desiredFraming: 'medium-close-up',
      simultaneousPerformers: 1,
      spokenAudio: true,
      performance: [{
        characterId: 'host',
        stance: 'seated',
        emotion: 'confident',
        intensity: 0.45,
        gaze: 'into camera',
        posture: 'upright and open',
        gesture: 'one measured hand gesture',
        movement: 'mostly still',
      }],
    }),
    relipSafe: true,
    relipSafety: { faceVisibility: 'visible', occlusion: 'light', motion: 'moderate' },
    sourceRefs: [],
    ...overrides,
  };
}

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
        shotIntent: makeShotIntent({
          desiredMovement: 'push-in',
          movementMotivation: 'Move closer as the hidden approval cost becomes clear.',
        }),
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
        shotIntent: makeShotIntent({
          narrativePurpose: 'Show the simpler operating model.',
          emotionalBeat: 'Relief and control.',
          desiredMovement: 'pan',
          movementMotivation: 'Reveal the named owner after showing the clean workflow.',
          continuity: {
            wardrobe: [],
            props: ['approval board'],
            previousSceneIds: ['scene_1'],
          },
        }),
        relipSafe: false,
        sourceRefs: [],
      },
    ],
    ...overrides,
  };
}

function withSpokenWords(scene: SidecarScene, count: number): SidecarScene {
  const spokenText = Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');
  const firstLine = scene.lines[0]!;
  return {
    ...scene,
    narration: spokenText,
    lines: [{ ...firstLine, text: spokenText }],
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
      voiceLanguage: 'en',
    },
    sidecar: makeSidecar(),
    ...overrides,
  };
}

function makeModelOutput(overrides: Partial<ScriptWriterModelOutput> = {}): ScriptWriterModelOutput {
  const result = makeResult();
  return {
    contentAnalysis: result.contentAnalysis,
    visualMetadata: { motionInfo: result.visualMetadata.motionInfo },
    metadata: result.metadata,
    sidecar: result.sidecar,
    ...overrides,
  };
}

/** A minimal uncast brief with only a runtime target — isolates the runtime-contract gate. */
function productionBriefWithDuration(targetDurationSec: number): ProductionBrief {
  return {
    entryPoint: 'thinkforge',
    output: {
      format: 'reel',
      platform: 'youtube',
      aspectRatio: '16:9',
      targetDurationSec,
      count: 1,
      voiceLanguages: ['en'],
    },
    resolution: {
      fieldConfidence: {},
      inferred: [],
      confirmed: [],
    },
  };
}

function productionBriefWithCasting(): ProductionBrief {
  return {
    entryPoint: 'thinkforge',
    output: {
      format: 'reel',
      platform: 'instagram-reels',
      aspectRatio: '9:16',
      targetDurationSec: 30,
      count: 1,
      voiceLanguages: ['en'],
    },
    resolution: {
      fieldConfidence: {},
      inferred: [],
      confirmed: [],
    },
    casting: {
      map: {
        host: {
          avatarProfileId: 'avatar_profile_primary',
          voice: { mode: 'cloned', voiceReferenceUrl: 'https://cdn.example.test/avatar/voice.wav' },
        },
      },
    },
  };
}

describe('ScriptWriterAgent prompt contract', () => {
  it('injects resolved avatar casting ids and relip rules into the writer prompt', () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-gemini-key';
    const prompt = new ScriptWriterAgent().buildPrompt({
      context: {
        projectSummary: 'Founder-led launch reel.',
        systemBrief: 'Brand voice: direct, practical, warm.',
      },
      userPrompt: 'Make me the on-camera host for this launch reel.',
      productionBrief: productionBriefWithCasting(),
    });

    expect(prompt).toContain('## Avatar Casting Contract');
    expect(prompt).toContain('characterId "host"');
    expect(prompt).toContain('Avatar Vault profile "avatar_profile_primary"');
    expect(prompt).toContain('delivery: "sync-dialogue"');
    expect(prompt).toContain('face visible');
    expect(prompt).toContain('subShots do not split a lip-sync job');
    expect(prompt).toContain('Never target an arbitrary on-camera ratio');
    expect(prompt).not.toContain('50%');
    expect(prompt).toContain('Production shot intent');
    expect(prompt).toContain('never invent equipment');
  });
});

describe('ScriptWriterAgent structured generation', () => {
  beforeEach(() => {
    generateStructuredWithWritingContextCacheMock.mockReset();
  });

  it('uses one schema-constrained cached completion without a fallback generation', async () => {
    generateStructuredWithWritingContextCacheMock.mockResolvedValue({
      result: makeModelOutput(),
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write a short Instagram video script for the launch.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledWith(expect.objectContaining({
      schema: ScriptWriterModelOutputSchema,
      prompt: expect.stringContaining('Write a short Instagram video script for the launch.'),
    }));
    expect(output.metadata?.notes).toBe('writing_context_cache:hit');
    expect(output.result).toEqual(materializeScriptWriterResult(makeModelOutput()));
  });

  it('repairs an overlong on-camera scene into valid canonical relip scenes', async () => {
    const invalid = makeModelOutput({
      sidecar: makeSidecar({
        characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
        scenes: [makeOnCameraScene({ durationSeconds: 15 }), makeSidecar().scenes[1]!],
      }),
    });
    const repaired = makeModelOutput({
      sidecar: makeSidecar({
        characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
        scenes: [makeOnCameraScene({ durationSeconds: 8 }), makeSidecar().scenes[1]!],
      }),
    });
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Founder-led launch reel.' },
      userPrompt: 'Write a short Instagram reel with the founder speaking to camera.',
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0]).toMatchObject({
      schema: ScriptWriterModelOutputSchema,
      temperature: 0.25,
      prompt: expect.stringContaining('<writer_contract_repair>'),
    });
    expect(output.metadata?.notes).toContain('script_contract_repair:applied');
    expect(() => assertUsableScriptWriterResult(output.result)).not.toThrow();
  });

  it('repairs a declared long runtime when the audible lines are too short', async () => {
    const invalid = makeModelOutput({
      sidecar: makeSidecar({
        scenes: makeSidecar().scenes.map((scene, index) => ({
          ...scene,
          durationSeconds: 210,
          generationUnitId: `scene_${index + 1}`,
        })),
      }),
    });
    const repaired = makeModelOutput({
      sidecar: makeSidecar({
        scenes: makeSidecar().scenes.map((scene, index) => ({
          ...withSpokenWords(scene, 425),
          durationSeconds: 210,
          generationUnitId: `scene_${index + 1}`,
        })),
      }),
    });
    generateStructuredWithWritingContextCacheMock
      .mockResolvedValueOnce({ result: invalid, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' })
      .mockResolvedValueOnce({ result: repaired, cacheStatus: 'hit', modelName: 'models/gemini-2.5-flash' });

    const output = await new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Long-form creative production explainer.' },
      userPrompt: 'Write a seven-minute YouTube explainer.',
      productionBrief: productionBriefWithDuration(420),
    });

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredWithWritingContextCacheMock.mock.calls[1]?.[0]).toMatchObject({
      temperature: 0.25,
      systemInstruction: expect.stringContaining('spoken_word_count_mismatch'),
    });
    expect(output.metadata?.notes).toContain('script_contract_repair:applied');
    expect(() => assertUsableScriptWriterResult(output.result, {
      productionBrief: productionBriefWithDuration(420),
    })).not.toThrow();
  });

  it('derives every editor scene and visual prompt from the canonical sidecar', () => {
    const baseScenes = makeSidecar().scenes;
    const sixSceneSidecar = makeSidecar({
      scenes: Array.from({ length: 6 }, (_, index) => ({
        ...baseScenes[index % baseScenes.length]!,
        title: `Beat ${index + 1}`,
        generationUnitId: `scene_${index + 1}`,
      })),
    });

    const result = materializeScriptWriterResult(makeModelOutput({ sidecar: sixSceneSidecar }));

    expect(result.content.match(/^## Scene \d+/gm)).toHaveLength(6);
    expect(result.visualMetadata.scenePrompts).toHaveLength(6);
    expect(() => assertUsableScriptWriterResult(result)).not.toThrow();
  });

  it('projects line-level speech into markdown without creating extra scene headers', () => {
    const sidecar = makeSidecar({
      scenes: [
        {
          ...makeSidecar().scenes[0]!,
          narration: 'This stale narration must not ship.',
          lines: [{
            ...makeSidecar().scenes[0]!.lines[0]!,
            text: 'The approved spoken line stays with its narrator.\n## Scene 99: not a real scene',
          }],
        },
        makeSidecar().scenes[1]!,
      ],
    });

    const result = materializeScriptWriterResult(makeModelOutput({ sidecar }));

    expect(result.sidecar.scenes[0]?.narration).toBe(
      'The approved spoken line stays with its narrator. ## Scene 99: not a real scene',
    );
    expect(result.content).toContain('The approved spoken line stays with its narrator. ## Scene 99: not a real scene');
    expect(result.content.match(/^## Scene \d+/gm)).toHaveLength(2);
  });

  it('surfaces a structured-generation failure instead of starting a second model call', async () => {
    generateStructuredWithWritingContextCacheMock.mockRejectedValue(new Error('invalid sidecar enum'));

    await expect(new ScriptWriterAgent().runStructured({
      context: { projectSummary: 'Approval workflow launch.' },
      userPrompt: 'Write a short Instagram video script for the launch.',
    })).rejects.toThrow('invalid sidecar enum');

    expect(generateStructuredWithWritingContextCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe('assertUsableScriptWriterResult', () => {
  it('accepts canonical markdown scene scripts that can hydrate a script board', () => {
    expect(() => assertUsableScriptWriterResult(makeResult())).not.toThrow();
  });

  it('does not discard a structurally valid script because a soft editorial heuristic matches', () => {
    const result = makeResult({
      content: canonicalScript.replace('Put one person in charge', 'Foster one accountable owner'),
    });

    expect(() => assertUsableScriptWriterResult(result)).not.toThrow();
  });

  it('uses structural relip evidence instead of requiring a particular face-visibility phrase', () => {
    const result = makeResult({
      sidecar: makeSidecar({
        characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
        scenes: [
          makeOnCameraScene({
            visualDescription: 'A founder seated at a clean desk, addressing the viewer with an open posture.',
          }),
          makeSidecar().scenes[1]!,
        ],
      }),
    });

    expect(() => assertUsableScriptWriterResult(result)).not.toThrow();
  });

  it('rejects on-camera dialogue that omits structural relip evidence', () => {
    const unsafeScene = { ...makeOnCameraScene(), relipSafety: undefined };

    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({
            characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
            scenes: [unsafeScene, makeSidecar().scenes[1]!],
          }),
        }),
      ),
    ).toThrow(/relip_face_visibility_undeclared/);
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

  it('rejects new writer output when any canonical scene omits shot intent', () => {
    const sceneWithoutIntent = { ...makeSidecar().scenes[0]!, shotIntent: undefined };

    expect(() => assertUsableScriptWriterResult(makeResult({
      sidecar: makeSidecar({ scenes: [sceneWithoutIntent, makeSidecar().scenes[1]!] }),
    }))).toThrow(/missing_shot_intent:scene_1/);
  });

  it('rejects shot intent that invents a visible character outside the sidecar cast', () => {
    const scene = {
      ...makeSidecar().scenes[0]!,
      charactersPresent: ['narrator', 'invented_host'],
      shotIntent: makeShotIntent({
        simultaneousPerformers: 1,
        performance: [{
          characterId: 'invented_host',
          stance: 'standing',
          emotion: 'confident',
          intensity: 0.6,
          gaze: 'into camera',
          posture: 'upright',
          gesture: 'open hands',
          movement: 'still',
        }],
      }),
    };

    expect(() => assertUsableScriptWriterResult(makeResult({
      sidecar: makeSidecar({ scenes: [scene, makeSidecar().scenes[1]!] }),
    }))).toThrow(/shot_intent_character_unknown:invented_host/);
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

  it('rejects sidecar source refs that are not in the source ledger', () => {
    const scene = {
      ...makeSidecar().scenes[0]!,
      sourceRefs: ['missing_ref'],
      lines: [
        {
          ...makeSidecar().scenes[0]!.lines[0]!,
          sourceRefs: ['missing_ref'],
        },
      ],
    };

    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({ sourceRefs: ['missing_ref'], scenes: [scene, makeSidecar().scenes[1]!] }),
        }),
        { sourceLedger: buildThinkForgeSourceLedger({ userPrompt: 'Adobe raised prices by 12 percent.' }) },
      ),
    ).toThrow(/invalid_source_ref:sidecar:missing_ref/);
  });

  it('rejects numeric factual claims without source refs when a ledger is present', () => {
    const scene = {
      ...makeSidecar().scenes[0]!,
      title: 'The price jump',
      narration: 'Adobe raised prices by 12 percent.',
      lines: [
        {
          ...makeSidecar().scenes[0]!.lines[0]!,
          text: 'Adobe raised prices by 12 percent.',
          sourceRefs: [],
        },
      ],
      sourceRefs: [],
    };

    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({ scenes: [scene, makeSidecar().scenes[1]!] }),
        }),
        { sourceLedger: buildThinkForgeSourceLedger({ userPrompt: 'Adobe raised prices by 12 percent.' }) },
      ),
    ).toThrow(/missing_source_ref:scene_1/);
  });

  it('rejects spoken languages unsupported by the writer capability surface', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          metadata: {
            estimatedTimeSeconds: 42,
            platform: 'instagram',
            voiceLanguage: 'hi',
          },
        }),
      ),
    ).toThrow(/unsupported_voice_language:hi/);
  });

  it('rejects on-camera sync dialogue when the visual is not relip-safe', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({
            characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
            scenes: [
              makeOnCameraScene({
                visualDescription: 'A masked host in silhouette with the face covered and turned away.',
              }),
              makeSidecar().scenes[1]!,
            ],
          }),
        }),
      ),
    ).toThrow(/relip_face_not_visible|relip_unsafe_occlusion/);
  });

  it('rejects overlong on-camera scenes because sub-shots do not split an Editron relip job', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({
            characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
            scenes: [makeOnCameraScene({ durationSeconds: 12 }), makeSidecar().scenes[1]!],
          }),
        }),
      ),
    ).toThrow(/on_camera_scene_exceeds_relip_limit:scene_1:12s/);
  });

  it('does not impose an invented on-camera speaking ratio', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({
            characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
            scenes: [
              makeOnCameraScene({ generationUnitId: 'scene_1' }),
              makeOnCameraScene({ title: 'Host closes the loop', generationUnitId: 'scene_2' }),
            ],
          }),
        }),
      ),
    ).not.toThrow();
  });

  it('rejects scripts that omit a resolved avatar-cast character', () => {
    expect(() =>
      assertUsableScriptWriterResult(makeResult(), {
        productionBrief: productionBriefWithCasting(),
      }),
    ).toThrow(/missing_cast_character:host/);
  });

  it('rejects avatar-cast character speech authored as voiceover', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({
            characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
            scenes: [
              makeOnCameraScene({
                relipSafe: false,
                shotIntent: makeShotIntent({
                  action: 'talking',
                  desiredFraming: 'medium-close-up',
                  simultaneousPerformers: 1,
                  performance: [{
                    characterId: 'host',
                    stance: 'seated',
                    emotion: 'confident',
                    intensity: 0.45,
                    gaze: 'into camera',
                    posture: 'upright and open',
                    gesture: 'one measured hand gesture',
                    movement: 'mostly still',
                  }],
                  spokenAudio: false,
                }),
                lines: [
                  {
                    text: 'Put one accountable owner between draft and publish.',
                    speakerId: 'host',
                    onCamera: false,
                    delivery: 'voiceover',
                    sourceRefs: [],
                  },
                ],
              }),
              makeSidecar().scenes[1]!,
            ],
          }),
        }),
        { productionBrief: productionBriefWithCasting() },
      ),
    ).toThrow(/cast_character_speech_not_sync_dialogue:host:scene_1/);
  });

  it('accepts a resolved avatar-cast character with relip-safe sync dialogue', () => {
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({
          sidecar: makeSidecar({
            characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }, hostCharacter],
            scenes: [
              withSpokenWords(makeOnCameraScene(), 30),
              withSpokenWords({ ...makeSidecar().scenes[1]!, durationSeconds: 22 }, 30),
            ],
          }),
        }),
        { productionBrief: productionBriefWithCasting() },
      ),
    ).not.toThrow();
  });

  // Regression guard for the live incident: a 7-minute (420s) request silently produced a
  // ~60s script because the runtime contract never gated output. Runtime and spoken material
  // are hard requirements; scene count is an editorial decision, not a duration formula.
  it('rejects a short sidecar against a 7-minute runtime contract (420s ask, 42s script)', () => {
    let message = '';
    try {
      assertUsableScriptWriterResult(
        makeResult(), // default fixture: 2 scenes summing 42s
        { productionBrief: productionBriefWithDuration(420) },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('runtime_duration_mismatch:42s/420s');
    expect(message).toContain('spoken_word_count_mismatch');
    expect(message).not.toContain('scene_count_under_runtime_floor');
  });

  it('accepts long editorial scenes without imposing a seconds-per-scene floor', () => {
    const scenes = makeSidecar().scenes.map((scene, i) => ({
      ...withSpokenWords(scene, 425),
      durationSeconds: 210,
      generationUnitId: `scene_${i + 1}`,
    }));
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({ sidecar: makeSidecar({ scenes }) }),
        { productionBrief: productionBriefWithDuration(420) },
      ),
    ).not.toThrow();
  });

  it('accepts a script that exactly satisfies its runtime and spoken-word contract', () => {
    const scenes = makeSidecar().scenes.map((scene) => ({
      ...withSpokenWords(scene, 60),
      durationSeconds: 30,
    }));
    expect(() =>
      assertUsableScriptWriterResult(
        makeResult({ sidecar: makeSidecar({ scenes }) }), // 60s total for a 60s ask
        { productionBrief: productionBriefWithDuration(60) },
      ),
    ).not.toThrow();
  });

  it('rejects a script that claims a seven-minute runtime with sparse audible narration', () => {
    const scenes = makeSidecar().scenes.map((scene, index) => ({
      ...scene,
      durationSeconds: 210,
      generationUnitId: `scene_${index + 1}`,
    }));

    expect(() => assertUsableScriptWriterResult(
      makeResult({ sidecar: makeSidecar({ scenes }) }),
      { productionBrief: productionBriefWithDuration(420) },
    )).toThrow(/spoken_word_count_mismatch/);
  });
});
