import { describe, expect, it } from 'vitest';
import {
  buildThinkForgeEditronHandoffContext,
  mapScriptSidecarToEditronExport,
  ThinkForgeSidecarCompilationError,
} from '@/lib/thinkforge/export/script-sidecar-to-editron';
import { parseScriptSidecarV2 } from '@/lib/thinkforge/schemas/script-sidecar-v2';
import {
  materializeScriptSidecarV3,
  ScriptWriterSidecarV3ModelSchema,
} from '@/lib/thinkforge/schemas/script-sidecar-v3';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

function shotIntent() {
  return {
    narrativePurpose: 'Make the evidence direct and credible.',
    emotionalBeat: 'Measured conviction.',
    energy: 0.5,
    visualPriority: 'The host and the physical evidence.',
    action: 'talking',
    desiredFraming: 'medium-close-up',
    desiredAngle: 'eye-level',
    desiredMovement: 'push-in',
    movementMotivation: 'Increase attention as the evidence lands.',
    simultaneousPerformers: 1,
    spokenAudio: true,
    performance: [{
      characterId: 'host',
      stance: 'standing',
      emotion: 'assured',
      intensity: 0.5,
      gaze: 'into camera',
      posture: 'upright',
      gesture: 'open-hand emphasis',
      movement: 'controlled natural movement',
    }],
    continuity: {
      wardrobe: ['charcoal shirt'],
      props: ['printed report'],
      screenDirection: 'host remains frame-left',
      previousSceneIds: [],
    },
  };
}

function v2Sidecar() {
  const firstLine = 'Canonical first line.';
  const finalLine = 'The final line remains whole.';
  return {
    sidecarVersion: 2,
    spokenTextSource: 'beat-lines',
    characters: [
      { id: 'host', name: 'Host', role: 'host' },
      { id: 'narrator', name: 'Narrator', role: 'narrator' },
    ],
    acts: [
      {
        id: 'act_open',
        title: 'Open',
        narrativePurpose: 'Establish the claim and its evidence.',
        narrativeScenes: [{
          id: 'scene_claim',
          title: 'The claim',
          narrativePurpose: 'State and substantiate the core argument.',
          durationIntentSeconds: 30,
          mood: 'serious',
          charactersPresent: ['host', 'narrator'],
          sourceRefs: ['source_report'],
          beats: [
            {
              id: 'beat_claim',
              kind: 'dialogue',
              narrativePurpose: 'State the sourced claim.',
              lines: [
                {
                  id: 'line_claim',
                  text: firstLine,
                  speakerId: 'host',
                  onCamera: true,
                  delivery: 'sync-dialogue',
                  sourceRefs: ['source_report'],
                },
                {
                  id: 'line_card',
                  text: 'KEEP THIS EXACT',
                  onCamera: false,
                  delivery: 'on-screen-text',
                  sourceRefs: ['source_report'],
                },
              ],
              visualIntent: {
                description: 'The host holds the printed report beside the highlighted finding.',
                motion: 'A restrained push toward the report.',
                onScreenText: ['Evidence, not inference.'],
                imageQualityTokens: 'natural editorial light',
                videoQualityTokens: 'stable facial detail',
                assetRecommendation: 'ai-video',
              },
              audioIntent: {
                ambience: 'Quiet studio room tone.',
                music: 'Restrained pulse.',
                sfx: ['Paper settles on the desk.'],
              },
              shotIntent: shotIntent(),
              sourceRefs: ['source_report'],
            },
            {
              id: 'beat_context',
              kind: 'voiceover',
              narrativePurpose: 'Explain why the evidence matters.',
              lines: [{
                id: 'line_context',
                text: 'Canonical second line.',
                speakerId: 'narrator',
                onCamera: false,
                delivery: 'voiceover',
                sourceRefs: ['source_interview'],
              }],
              visualIntent: {
                description: 'The report finding is compared with the interview transcript.',
                onScreenText: [],
                assetRecommendation: 'ai-video',
              },
              sourceRefs: ['source_interview'],
            },
          ],
        }],
      },
      {
        id: 'act_resolve',
        title: 'Resolve',
        narrativePurpose: 'Turn the evidence into a conclusion.',
        narrativeScenes: [
          {
            id: 'scene_synthesis',
            title: 'Synthesis',
            narrativePurpose: 'Connect the two sources.',
            charactersPresent: ['narrator'],
            sourceRefs: ['source_report', 'source_interview'],
            beats: [
              {
                id: 'beat_compare',
                kind: 'voiceover',
                narrativePurpose: 'Compare the sources.',
                durationIntentSeconds: 7,
                lines: [{
                  id: 'line_compare',
                  text: 'The report and interview agree.',
                  speakerId: 'narrator',
                  onCamera: false,
                  delivery: 'voiceover',
                  sourceRefs: ['source_report', 'source_interview'],
                }],
                visualIntent: { description: 'Both source excerpts align side by side.', onScreenText: [] },
                sourceRefs: ['source_report', 'source_interview'],
              },
              {
                id: 'beat_implication',
                kind: 'voiceover',
                narrativePurpose: 'State the implication.',
                durationIntentSeconds: 8,
                lines: [{
                  id: 'line_implication',
                  text: 'That agreement changes the decision.',
                  speakerId: 'narrator',
                  onCamera: false,
                  delivery: 'voiceover',
                  sourceRefs: ['source_report'],
                }],
                visualIntent: { description: 'The decision marker moves to the supported option.', onScreenText: [] },
                sourceRefs: ['source_report'],
              },
            ],
          },
          {
            id: 'scene_close',
            title: 'Close',
            narrativePurpose: 'Land the conclusion without changing the wording.',
            charactersPresent: ['narrator'],
            sourceRefs: ['source_report'],
            beats: [{
              id: 'beat_close',
              kind: 'voiceover',
              narrativePurpose: 'Deliver the final line.',
              lines: [{
                id: 'line_close',
                text: finalLine,
                speakerId: 'narrator',
                onCamera: false,
                delivery: 'voiceover',
                sourceRefs: ['source_report'],
              }],
              visualIntent: { description: 'The supported decision remains on screen.', onScreenText: [] },
              sourceRefs: ['source_report'],
            }],
          },
        ],
      },
    ],
    renderPlan: {
      version: 1,
      source: 'technical-planner',
      renderSegments: [
        {
          id: 'render_claim_a',
          kind: 'lip-sync',
          narrativeSceneId: 'scene_claim',
          beatId: 'beat_claim',
          lineSpans: [{ lineId: 'line_claim', startOffsetUtf16: 0, endOffsetUtf16: 8 }],
          durationSeconds: 4,
        },
        {
          id: 'render_claim_b',
          kind: 'lip-sync',
          narrativeSceneId: 'scene_claim',
          beatId: 'beat_claim',
          lineSpans: [{ lineId: 'line_claim', startOffsetUtf16: 8, endOffsetUtf16: firstLine.length }],
          durationSeconds: 4,
        },
        {
          id: 'render_context',
          kind: 'voiceover',
          narrativeSceneId: 'scene_claim',
          beatId: 'beat_context',
          lineSpans: [{ lineId: 'line_context', startOffsetUtf16: 0, endOffsetUtf16: 12 }],
          durationSeconds: 6,
        },
        {
          id: 'render_close',
          kind: 'voiceover',
          narrativeSceneId: 'scene_close',
          beatId: 'beat_close',
          lineSpans: [{ lineId: 'line_close', startOffsetUtf16: 0, endOffsetUtf16: finalLine.length }],
          durationSeconds: 9,
          generationUnitId: 'close_unit',
        },
      ],
    },
    creativeDirection: {
      overallMusicPrompt: 'Restrained documentary score.',
      characterDescriptions: { host: 'Credible presenter holding the source evidence.' },
      colorPalette: ['#111111', '#F4C95D'],
      environmentNotes: 'Controlled studio with practical evidence on screen.',
      globalEditDirections: { pacing: 'measured' },
      suggestedProfileCategory: 'production-mode',
    },
    briefId: 'brief_v2',
    sourceRefs: ['source_report', 'source_interview'],
  };
}

function longFormChapterPlan() {
  return {
    version: 1,
    title: 'Evidence documentary',
    narrativeThesis: 'The decision becomes credible when its evidence is seen in context.',
    targetDurationSeconds: 54,
    audienceJourney: {
      openingState: 'The audience sees an unproven claim.',
      closingState: 'The audience understands the evidence and decision.',
    },
    continuityBible: {
      pointOfView: 'Measured and evidence-led.',
      temporalFrame: 'One continuous evidence review.',
      toneProgression: ['curiosity', 'clarity'],
      recurringMotifs: ['the printed report'],
      terminologyInvariants: ['report', 'evidence'],
    },
    characters: [{
      id: 'host',
      name: 'Host',
      narrativeRole: 'Present the source-backed claim.',
      voice: 'Assured and measured.',
      openingState: 'Introduces the report.',
      closingState: 'Leaves the evidence with the audience.',
      invariantTraits: ['credible'],
    }, {
      id: 'narrator',
      name: 'Narrator',
      narrativeRole: 'Connect the report and interview.',
      voice: 'Clear and precise.',
      openingState: 'Frames the evidence.',
      closingState: 'Lands the conclusion.',
      invariantTraits: ['specific'],
    }],
    continuityThreads: [],
    acts: [{
      id: 'act_open',
      title: 'Open',
      narrativePurpose: 'Establish the claim and its evidence.',
      chapters: [{
        id: 'chapter_claim',
        title: 'The claim',
        narrativePurpose: 'State the sourced claim before the conclusion.',
        audienceStateBefore: 'The claim is unproven.',
        audienceStateAfter: 'The evidence is visible.',
        sceneBlueprints: [{
          id: 'scene_claim',
          title: 'The claim',
          narrativePurpose: 'State and substantiate the core argument.',
          openingState: 'The report enters the frame.',
          development: ['The host identifies the central finding.'],
          closingState: 'The source requires contextual interpretation.',
          durationIntentSeconds: 30,
          requiredSourceRefs: ['source_report'],
          requiredCharacterIds: ['host', 'narrator'],
          continuityThreadIds: [],
        }],
      }],
    }, {
      id: 'act_resolve',
      title: 'Resolve',
      narrativePurpose: 'Turn the evidence into a conclusion.',
      chapters: [{
        id: 'chapter_decision',
        title: 'The decision',
        narrativePurpose: 'Compare the evidence and land the conclusion.',
        audienceStateBefore: 'The evidence is visible.',
        audienceStateAfter: 'The decision is supported.',
        sceneBlueprints: [{
          id: 'scene_synthesis',
          title: 'Synthesis',
          narrativePurpose: 'Connect the two sources.',
          openingState: 'The report and interview are separate.',
          development: ['Compare the two sources.'],
          closingState: 'Their agreement becomes clear.',
          durationIntentSeconds: 15,
          requiredSourceRefs: ['source_report', 'source_interview'],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: [],
        }, {
          id: 'scene_close',
          title: 'Close',
          narrativePurpose: 'Land the conclusion without changing the wording.',
          openingState: 'The supported option is visible.',
          development: ['State the supported decision.'],
          closingState: 'The conclusion remains with the audience.',
          durationIntentSeconds: 9,
          requiredSourceRefs: ['source_report'],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: [],
        }],
      }],
    }],
  };
}

function v1Sidecar() {
  return {
    sidecarVersion: 1,
    characters: [{ id: 'host', name: 'Host', role: 'host' }],
    scenes: [{
      title: 'Legacy scene',
      narration: 'Legacy narration stays byte-for-byte.',
      visualDescription: 'Legacy visual direction.',
      videoMotionPrompt: 'Legacy motion.',
      audioDescription: 'Legacy ambience.',
      musicDescription: 'Legacy music.',
      sfxDescription: 'Legacy SFX.',
      durationSeconds: 12,
      mood: 'calm',
      imageQualityTokens: 'legacy image quality',
      videoQualityTokens: 'legacy video quality',
      editDirections: { onScreenText: ['LEGACY TEXT'] },
      generationUnitId: 'legacy_unit',
      primaryVisualForUnit: true,
      sceneType: 'talking-head',
      assetRecommendation: 'ai-video',
      lines: [{
        text: 'Legacy narration stays byte-for-byte.',
        speakerId: 'host',
        onCamera: true,
        delivery: 'sync-dialogue',
        sourceRefs: ['legacy_ref'],
      }],
      sourceRefs: ['legacy_ref'],
      charactersPresent: ['host'],
      relipSafe: true,
      shotIntent: shotIntent(),
    }],
    overallMusicPrompt: 'Legacy score.',
    characterDescriptions: { host: 'Legacy host.' },
    colorPalette: ['black'],
    environmentNotes: 'Legacy room.',
    globalEditDirections: { pacing: 'slow' },
    suggestedProfileCategory: 'production-mode',
    sourceRefs: ['legacy_ref'],
  };
}

function v3Sidecar() {
  return materializeScriptSidecarV3({
    treatment: mixedPresenterCutawayTreatment,
    identityPolicy: { mode: 'ordinary' },
    modelSidecar: ScriptWriterSidecarV3ModelSchema.parse({
      sidecarVersion: 3,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'host', name: 'Host', role: 'host' }],
      acts: [{
        id: 'draft_act',
        title: 'The claim and its counterpoint',
        narrativePurpose: 'Let the host establish stakes while the process becomes visible.',
        narrativeScenes: [{
          id: 'draft_scene',
          title: 'The hidden process',
          narrativePurpose: 'Keep the human claim and the explanatory counterpoint active together.',
          durationIntentSeconds: 12,
          charactersPresent: ['host'],
          sourceRefs: ['src_brief'],
          beats: [{
            id: 'draft_beat',
            kind: 'mixed',
            narrativePurpose: 'Make the cost clear without repeating the narration as an overlay.',
            durationIntentSeconds: 12,
            lines: [{
              id: 'draft_line',
              text: 'The cost is visible long before the handoff that caused it.',
              speakerId: 'host',
              languageCode: 'en',
              onCamera: true,
              delivery: 'sync-dialogue',
              sourceRefs: ['src_brief'],
            }],
            treatmentVisualEvents: [
              { treatmentEventId: 'event_host_claim' },
              { treatmentEventId: 'event_process_cutaway' },
            ],
            sourceRefs: ['src_brief'],
          }],
        }],
      }],
      sourceRefs: ['src_brief'],
    }),
  });
}

describe('ThinkForge Script Sidecar to Editron compiler', () => {
  it('preserves V1 scene projection while carrying the normalized hierarchy', () => {
    const result = mapScriptSidecarToEditronExport(v1Sidecar());

    expect(result.sidecarVersion).toBe(1);
    expect(result.scenes[0]).toMatchObject({
      narration: 'Legacy narration stays byte-for-byte.',
      videoMotionPrompt: 'Legacy motion.',
      generationUnitId: 'legacy_unit',
      sceneType: 'talking-head',
      assetRecommendation: 'ai-video',
    });
    expect(result.sidecarCompilation).toMatchObject({
      sourceSidecarVersion: 1,
      canonicalSidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      sceneBindings: [{ durationSource: 'legacy-v1' }],
    });
    expect(result.sidecarCompilation.narrativeSidecar.acts[0]?.narrativeScenes[0]?.beats[0]?.shotIntent)
      .toEqual(shotIntent());
  });

  it('compiles V2 narrative scenes, never render segments, from canonical beat-line text', () => {
    const input = v2Sidecar();
    const result = mapScriptSidecarToEditronExport(input);

    expect(result.sidecarVersion).toBe(2);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes.map((scene) => scene.narration)).toEqual([
      'Canonical first line.\n\nCanonical second line.',
      'The report and interview agree.\n\nThat agreement changes the decision.',
      'The final line remains whole.',
    ]);
    expect(result.scenes.map((scene) => scene.durationSeconds)).toEqual([30, 15, 9]);
    expect(result.scenes[0]?.editDirections?.onScreenText).toEqual([
      'Evidence, not inference.',
      'KEEP THIS EXACT',
    ]);
    expect(result.sidecarCompilation.sceneBindings).toEqual([
      expect.objectContaining({
        actId: 'act_open',
        narrativeSceneId: 'scene_claim',
        beatIds: ['beat_claim', 'beat_context'],
        renderSegmentIds: ['render_claim_a', 'render_claim_b', 'render_context'],
        durationSource: 'narrative-scene',
      }),
      expect.objectContaining({
        actId: 'act_resolve',
        narrativeSceneId: 'scene_synthesis',
        durationSource: 'narrative-beats',
      }),
      expect.objectContaining({
        actId: 'act_resolve',
        narrativeSceneId: 'scene_close',
        renderSegmentIds: ['render_close'],
        durationSource: 'render-segments',
      }),
    ]);
    expect(result.sidecarCompilation.narrativeSidecar).toMatchObject({
      acts: input.acts,
      renderPlan: input.renderPlan,
      sourceRefs: ['source_report', 'source_interview'],
    });
    expect(result.sidecarCompilation.narrativeSidecar.acts[0]?.narrativeScenes[0]?.beats[0]?.shotIntent)
      .toEqual(shotIntent());
  });

  it('compiles V3 treatment semantics without fabricating V2 render form', () => {
    const result = mapScriptSidecarToEditronExport(v3Sidecar());
    const context = buildThinkForgeEditronHandoffContext({
      sidecar: v3Sidecar(),
      briefSnapshot: {
        casting: { map: { host: { avatarProfileId: 'avatar_host', voice: { mode: 'cloned' } } } },
      },
    });

    expect(result.sidecarVersion).toBe(3);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]).toMatchObject({
      narration: 'The cost is visible long before the handoff that caused it.',
      durationSeconds: 12,
    });
    expect(result.scenes[0]?.visualDescription).toContain(
      'Make the abstract operational cost visible while the host continues speaking.',
    );
    expect(result.scenes[0]).not.toHaveProperty('cameraDirection');
    expect(result.scenes[0]).not.toHaveProperty('videoMotionPrompt');
    expect(result.scenes[0]).not.toHaveProperty('assetRecommendation');

    expect(result.sidecarCompilation).toMatchObject({
      sourceSidecarVersion: 3,
      canonicalSidecarVersion: 3,
      treatment: {
        treatmentId: mixedPresenterCutawayTreatment.treatmentId,
        treatmentVersion: mixedPresenterCutawayTreatment.version,
      },
      sceneBindings: [expect.objectContaining({
        narrativeSceneId: 'scene_1',
        sourceRefs: ['src_brief'],
        renderSegmentIds: [],
        semanticVisualEventIds: ['event_host_claim', 'event_process_cutaway'],
      })],
    });
    if (result.sidecarCompilation.sourceSidecarVersion !== 3) {
      throw new Error('Expected V3 semantic compilation.');
    }
    expect(result.sidecarCompilation.semanticVisualEvents.map(({ actId, narrativeSceneId, beatId, event }) => ({
      actId,
      narrativeSceneId,
      beatId,
      eventId: event.treatmentEventId,
      relationship: event.audioRelationship,
      sourceRefs: event.sourceRefs,
    }))).toEqual([
      {
        actId: 'act_1',
        narrativeSceneId: 'scene_1',
        beatId: 'beat_1',
        eventId: 'event_host_claim',
        relationship: 'anchor',
        sourceRefs: [],
      },
      {
        actId: 'act_1',
        narrativeSceneId: 'scene_1',
        beatId: 'beat_1',
        eventId: 'event_process_cutaway',
        relationship: 'counterpoint',
        sourceRefs: ['src_brief'],
      },
    ]);
    expect(context.avatarDirectives).toEqual([{
      sceneIndex: 0,
      durationSeconds: 12,
      speakers: [{
        characterId: 'host',
        avatarProfileId: 'avatar_host',
        voiceMode: 'cloned',
        lineText: 'The cost is visible long before the handoff that caused it.',
        sourceRefs: ['src_brief'],
      }],
    }]);
    expect(JSON.stringify(result)).not.toContain('"shotIntent"');
    expect(JSON.stringify(result)).not.toContain('"renderPlan"');
    expect(JSON.stringify(result)).not.toContain('"assetRecommendation"');
  });

  it('binds every long-form V2 scene to its persisted chapter for Editron', () => {
    const input = v2Sidecar();
    const chapterPlan = longFormChapterPlan();
    const result = mapScriptSidecarToEditronExport(input, { chapterPlan });
    const context = buildThinkForgeEditronHandoffContext({ sidecar: input, chapterPlan });

    expect(result.sidecarCompilation.sceneBindings.map((binding) => ({
      actId: binding.actId,
      chapterId: binding.chapterId,
      narrativeSceneId: binding.narrativeSceneId,
    }))).toEqual([
      { actId: 'act_open', chapterId: 'chapter_claim', narrativeSceneId: 'scene_claim' },
      { actId: 'act_resolve', chapterId: 'chapter_decision', narrativeSceneId: 'scene_synthesis' },
      { actId: 'act_resolve', chapterId: 'chapter_decision', narrativeSceneId: 'scene_close' },
    ]);
    expect(context.sidecarCompilation?.sceneBindings.map((binding) => binding.chapterId))
      .toEqual(['chapter_claim', 'chapter_decision', 'chapter_decision']);
  });

  it('rejects a claimed long-form plan that no longer owns every V2 scene', () => {
    const chapterPlan = longFormChapterPlan();
    chapterPlan.acts[1]!.chapters[0]!.sceneBlueprints[1]!.id = 'scene_replaced_after_save';

    expect(() => mapScriptSidecarToEditronExport(v2Sidecar(), { chapterPlan }))
      .toThrow(ThinkForgeSidecarCompilationError);
    try {
      mapScriptSidecarToEditronExport(v2Sidecar(), { chapterPlan });
    } catch (error) {
      expect(error).toMatchObject({ code: 'long-form-scene-unmapped', claimedVersion: 2 });
    }
  });

  it('adds a technical render plan for a fully timed native V2 sidecar without splitting narrative scenes', () => {
    const fixture = v2Sidecar();
    const synthesisAct = fixture.acts[1]!;
    const synthesisScene = synthesisAct.narrativeScenes[0]!;
    const input = parseScriptSidecarV2({
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters: fixture.characters,
      acts: [{
        ...synthesisAct,
        narrativeScenes: [{ ...synthesisScene, durationIntentSeconds: 15 }],
      }],
      sourceRefs: fixture.sourceRefs,
    });

    const result = mapScriptSidecarToEditronExport(input);

    expect(result.scenes).toHaveLength(1);
    expect(result.sidecarCompilation.narrativeSidecar.acts).toEqual(input.acts);
    expect(result.sidecarCompilation.narrativeSidecar.renderPlan).toMatchObject({
      source: 'technical-planner',
    });
    expect(result.sidecarCompilation.sceneBindings.every(
      (binding) => binding.renderSegmentIds.length > 0,
    )).toBe(true);
  });

  it('preserves sanitized casting bindings and line-level source references in V2 handoff context', () => {
    const context = buildThinkForgeEditronHandoffContext({
      sidecar: v2Sidecar(),
      briefSnapshot: {
        casting: {
          map: {
            host: {
              avatarProfileId: 'avatar_host',
              voice: { mode: 'cloned', voiceReferenceUrl: 'https://private.example/voice.wav' },
            },
          },
        },
      },
    });

    expect(context.sidecarSourceRefs).toEqual(['source_report', 'source_interview']);
    expect(context.avatarDirectives).toEqual([{
      sceneIndex: 0,
      durationSeconds: 30,
      speakers: [{
        characterId: 'host',
        avatarProfileId: 'avatar_host',
        voiceMode: 'cloned',
        lineText: 'Canonical first line.',
        sourceRefs: ['source_report'],
      }],
    }]);
    expect(context.briefSnapshot?.casting).toEqual({
      map: { host: { avatarProfileId: 'avatar_host', voice: { mode: 'cloned' } } },
    });
    expect(JSON.stringify(context)).not.toContain('private.example');
  });

  it('rejects invalid claimed V2 and incomplete technical evidence without text fallback', () => {
    const invalid = v2Sidecar();
    invalid.acts = [];

    expect(() => mapScriptSidecarToEditronExport(invalid)).toThrow(ThinkForgeSidecarCompilationError);
    try {
      mapScriptSidecarToEditronExport(invalid);
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid-sidecar', claimedVersion: 2 });
    }

    const incomplete = v2Sidecar();
    incomplete.renderPlan.renderSegments = incomplete.renderPlan.renderSegments.filter(
      (segment) => segment.narrativeSceneId !== 'scene_close',
    );
    expect(() => mapScriptSidecarToEditronExport(incomplete)).toThrowError(
      /has no complete duration evidence/,
    );

    const partial = v2Sidecar();
    partial.renderPlan.renderSegments.find((segment) => segment.id === 'render_close')!
      .lineSpans[0]!.endOffsetUtf16 = 8;
    expect(() => mapScriptSidecarToEditronExport(partial)).toThrowError(
      /has no complete duration evidence/,
    );
  });
});
