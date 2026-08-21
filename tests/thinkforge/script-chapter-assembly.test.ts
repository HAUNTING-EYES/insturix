import { describe, expect, it } from 'vitest';
import {
  assembleLongFormScriptResult,
  createScriptChapterArtifact,
  ScriptChapterAssemblyError,
} from '@/lib/thinkforge/long-form/script-chapter-assembly';
import {
  isScriptWriterV3Result,
  materializeScriptWriterResult,
  materializeScriptWriterV3Result,
  type ScriptWriterModelOutput,
  type ScriptWriterResult,
  type ScriptWriterV3ModelOutput,
} from '@/lib/thinkforge/agents/script-writer-agent';
import { materializeScriptChapterPlan, type ScriptChapterPlan } from '@/lib/thinkforge/schemas/script-chapter-plan';
import type { ThinkForgeWriterInvocationTraceV1 } from '@/lib/thinkforge/provenance/generation-trace';
import {
  assertScriptChapterSemanticValidationReceipt,
  buildScriptChapterSemanticRequirementsForPlan,
  validateScriptChapterSemanticExecution,
} from '@/lib/thinkforge/long-form/script-chapter-semantic-validation';
import { hashLongFormScriptJobValue } from '@/lib/thinkforge/long-form/script-generation-job-contract';
import { mixedPresenterCutawayTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const SHA = 'a'.repeat(64);

function plan(): ScriptChapterPlan {
  return materializeScriptChapterPlan({
    title: 'The craft survives',
    narrativeThesis: 'A craft survives when knowledge becomes a shared future.',
    targetDurationSeconds: 420,
    audienceJourney: {
      openingState: 'The audience sees only a finished object.',
      closingState: 'The audience understands the people and transfer behind it.',
    },
    continuityBible: {
      pointOfView: 'Close, respectful, and specific.',
      temporalFrame: 'One working day with a final look forward.',
      toneProgression: ['curiosity', 'tension', 'earned hope'],
      recurringMotifs: ['hands', 'unfinished work'],
      terminologyInvariants: ['artisan', 'apprentice'],
    },
    characters: [{
      id: 'narrator',
      name: 'Narrator',
      narrativeRole: 'Connect evidence to the audience journey.',
      voice: 'Measured and observant.',
      openingState: 'Curious observer.',
      closingState: 'Clear witness.',
      invariantTraits: ['specific', 'respectful'],
    }],
    continuityThreads: [{
      id: 'unfinished_piece',
      promise: 'An unfinished piece asks who will complete the work.',
      intendedPayoff: 'The apprentice continues the same piece.',
      introducedInSceneId: 'scene_open',
      resolution: { policy: 'resolved', resolvedInSceneId: 'scene_close' },
    }],
    acts: [{
      id: 'act_one',
      title: 'What the object hides',
      narrativePurpose: 'Reveal the knowledge and risk behind the finished work.',
      chapters: [{
        id: 'chapter_open',
        title: 'The unfinished question',
        narrativePurpose: 'Establish the work, person, and unresolved future.',
        audienceStateBefore: 'The process is invisible.',
        audienceStateAfter: 'The stakes are concrete.',
        sceneBlueprints: [{
          id: 'scene_open',
          title: 'Unfinished work',
          narrativePurpose: 'Open the central question through observed work.',
          openingState: 'The object is incomplete.',
          development: ['Observe the hands', 'Name the knowledge at risk'],
          closingState: 'The audience sees what could be lost.',
          durationIntentSeconds: 180,
          requiredSourceRefs: ['brief_user'],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: ['unfinished_piece'],
        }],
      }],
    }, {
      id: 'act_two',
      title: 'Who carries it forward',
      narrativePurpose: 'Turn the risk into a credible transfer of knowledge.',
      chapters: [{
        id: 'chapter_close',
        title: 'The next pair of hands',
        narrativePurpose: 'Resolve the central question without false certainty.',
        audienceStateBefore: 'The future remains uncertain.',
        audienceStateAfter: 'The audience sees a practical path forward.',
        sceneBlueprints: [{
          id: 'scene_close',
          title: 'The handover',
          narrativePurpose: 'Show the apprentice continuing the same work.',
          openingState: 'The artisan works alone.',
          development: ['Introduce the apprentice', 'Return to the unfinished piece'],
          closingState: 'The work and knowledge both continue.',
          durationIntentSeconds: 240,
          requiredSourceRefs: ['brief_user'],
          requiredCharacterIds: ['narrator'],
          continuityThreadIds: ['unfinished_piece'],
        }],
      }],
    }],
  });
}

function trace(): ThinkForgeWriterInvocationTraceV1 {
  return {
    version: 1,
    writerType: 'script',
    generatedAt: '2026-08-20T10:00:00.000Z',
    editorialPlan: { writerKind: 'script' },
    editorialPlanHash: SHA,
    selectedTechniqueIds: [],
    techniqueEvidence: [],
    writingKnowledge: { version: 'test', source: 'creative-content-knowledge', contentHash: SHA },
    promptTemplateHash: SHA,
    sourceLedgerHash: SHA,
    provider: { provider: 'gemini', model: 'gemini-test', cacheStatus: 'inline' },
    repair: { applied: false, failureCodes: [] },
  };
}

function chapterResult(actId: string, sceneId: string, durationSeconds: number) {
  const output: ScriptWriterModelOutput = {
    contentAnalysis: {
      hooks: [`Hook for ${sceneId}`],
      theme: 'Knowledge transfer.',
      emphasisPoints: [sceneId],
      qualityScore: sceneId === 'scene_open' ? 94 : 91,
    },
    visualMetadata: { motionInfo: 'Patient documentary movement.' },
    metadata: { platform: 'youtube' },
    sidecar: {
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
      acts: [{
        id: actId,
        title: 'Chapter act',
        narrativePurpose: 'Serve the master plan.',
        narrativeScenes: [{
          id: sceneId,
          title: sceneId === 'scene_open' ? 'Unfinished work' : 'The handover',
          narrativePurpose: 'Advance the planned audience journey.',
          durationIntentSeconds: durationSeconds,
          charactersPresent: ['narrator'],
          sourceRefs: ['brief_user'],
          beats: [{
            id: `beat_${sceneId}`,
            kind: 'voiceover',
            narrativePurpose: 'Connect observed detail to the narrative claim.',
            durationIntentSeconds: durationSeconds,
            lines: [{
              id: `line_${sceneId}`,
              text: sceneId === 'scene_open'
                ? 'The unfinished edge reveals how much knowledge lives inside one practiced movement.'
                : 'The apprentice continues the same edge, turning inheritance into visible daily work.',
              speakerId: 'narrator',
              languageCode: 'en',
              onCamera: false,
              delivery: 'voiceover',
              sourceRefs: ['brief_user'],
            }],
            visualIntent: {
              description: 'Hands work on the same unfinished object in natural workshop light.',
              onScreenText: [],
            },
            sourceRefs: ['brief_user'],
          }],
        }],
      }],
      creativeDirection: {
        overallMusicPrompt: 'Restrained acoustic documentary bed.',
        colorPalette: ['warm wood', 'natural white'],
      },
      briefId: 'brief_long_form',
      sourceRefs: ['brief_user'],
    },
  };
  return materializeScriptWriterResult(output);
}

function v3Plan(): ScriptChapterPlan {
  const masterPlan = plan();
  masterPlan.acts[0]!.chapters[0]!.sceneBlueprints[0]!.treatmentEventIds = ['event_host_claim'];
  masterPlan.acts[1]!.chapters[0]!.sceneBlueprints[0]!.treatmentEventIds = ['event_process_cutaway'];
  return masterPlan;
}

function chapterV3Result(
  chapterId: string,
  actId: string,
  sceneId: string,
  durationSeconds: number,
  treatmentEventId: 'event_host_claim' | 'event_process_cutaway',
) {
  const output: ScriptWriterV3ModelOutput = {
    contentAnalysis: {
      hooks: [`Semantic hook for ${sceneId}`],
      theme: 'Knowledge transfer.',
      emphasisPoints: [sceneId],
      qualityScore: sceneId === 'scene_open' ? 94 : 91,
    },
    visualMetadata: { motionInfo: mixedPresenterCutawayTreatment.visualRhythm },
    metadata: { platform: 'youtube' },
    sidecar: {
      sidecarVersion: 3,
      spokenTextSource: 'beat-lines',
      characters: [{ id: 'narrator', name: 'Narrator', role: 'narrator' }],
      acts: [{
        id: actId,
        title: 'Chapter act',
        narrativePurpose: 'Serve the master plan without choosing final media form.',
        narrativeScenes: [{
          id: sceneId,
          title: sceneId === 'scene_open' ? 'Unfinished work' : 'The handover',
          narrativePurpose: 'Advance the planned audience journey.',
          durationIntentSeconds: durationSeconds,
          charactersPresent: ['narrator'],
          sourceRefs: ['brief_user'],
          beats: [{
            id: `beat_${sceneId}`,
            kind: 'voiceover',
            narrativePurpose: 'Connect observed detail to the narrative claim.',
            durationIntentSeconds: durationSeconds,
            lines: [{
              id: `line_${sceneId}`,
              text: sceneId === 'scene_open'
                ? 'The unfinished edge reveals how much knowledge lives inside one practiced movement.'
                : 'The apprentice continues the same edge, turning inheritance into visible daily work.',
              speakerId: 'narrator',
              languageCode: 'en',
              onCamera: false,
              delivery: 'voiceover',
              sourceRefs: ['brief_user'],
            }],
            treatmentVisualEvents: [{ treatmentEventId }],
            sourceRefs: ['brief_user'],
          }],
        }],
      }],
      briefId: 'brief_long_form',
      sourceRefs: ['brief_user'],
    },
  };
  return materializeScriptWriterV3Result(
    output,
    mixedPresenterCutawayTreatment,
    { mode: 'chapter', chapterId },
    undefined,
    [treatmentEventId],
  );
}

function semanticReceipt(
  masterPlan: ScriptChapterPlan,
  actId: string,
  chapterId: string,
  result: ScriptWriterResult,
) {
  const requirements = buildScriptChapterSemanticRequirementsForPlan({
    plan: masterPlan,
    actId,
    chapterId,
  });
  const receipt = {
    version: 1,
    planHash: hashLongFormScriptJobValue(masterPlan),
    actId,
    chapterId,
    resultHash: hashLongFormScriptJobValue(result),
    validator: { provider: 'gemini' as const, model: 'gemini-test', cacheStatus: 'inline' as const },
    outcome: 'passed' as const,
    assessments: requirements.map((requirement) => {
      const scene = result.sidecar.acts
        .flatMap((act) => act.narrativeScenes)
        .find((candidate) => requirement.allowedSceneIds.includes(candidate.id));
      const beat = scene?.beats[0];
      const line = beat?.lines[0];
      if (!scene || !beat || !line) throw new Error(`Missing test evidence for ${requirement.id}.`);
      return {
        requirementId: requirement.id,
        status: 'satisfied' as const,
        evidence: [{
          sceneId: scene.id,
          beatId: beat.id,
          kind: 'spoken_line' as const,
          lineIds: [line.id],
        }],
        rationale: 'The fixture cites a real generated spoken line for this requirement.',
      };
    }),
  };
  return assertScriptChapterSemanticValidationReceipt({
    plan: masterPlan,
    actId,
    chapterId,
    result,
    receipt,
  });
}

function artifacts(masterPlan = plan()) {
  const opening = chapterResult('act_one', 'scene_open', 180);
  const closing = chapterResult('act_two', 'scene_close', 240);
  return {
    chapter_open: createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: opening,
      writerTrace: trace(),
      semanticValidation: semanticReceipt(masterPlan, 'act_one', 'chapter_open', opening),
    }),
    chapter_close: createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_close',
      result: closing,
      writerTrace: trace(),
      semanticValidation: semanticReceipt(masterPlan, 'act_two', 'chapter_close', closing),
    }),
  };
}

function v3Artifacts(masterPlan = v3Plan()) {
  const opening = chapterV3Result('chapter_open', 'act_one', 'scene_open', 180, 'event_host_claim');
  const closing = chapterV3Result('chapter_close', 'act_two', 'scene_close', 240, 'event_process_cutaway');
  return {
    chapter_open: createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: opening,
      writerTrace: trace(),
      semanticValidation: semanticReceipt(masterPlan, 'act_one', 'chapter_open', opening),
    }),
    chapter_close: createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_close',
      result: closing,
      writerTrace: trace(),
      semanticValidation: semanticReceipt(masterPlan, 'act_two', 'chapter_close', closing),
    }),
  };
}

describe('long-form script chapter assembly', () => {
  it('assembles semantic chapters in plan order and preserves long scene durations', () => {
    const masterPlan = plan();
    const result = assembleLongFormScriptResult({ plan: masterPlan, artifacts: artifacts(masterPlan) });

    expect(result.metadata.estimatedTimeSeconds).toBe(420);
    expect(result.sidecar.acts.map((act) => act.id)).toEqual(['act_one', 'act_two']);
    expect(result.sidecar.acts.flatMap((act) => act.narrativeScenes.map((scene) => scene.id)))
      .toEqual(['scene_open', 'scene_close']);
    expect(result.sidecar.acts[0]!.narrativeScenes[0]!.durationIntentSeconds).toBe(180);
    expect(result.sidecar.acts[1]!.narrativeScenes[0]!.durationIntentSeconds).toBe(240);
    expect(result.visualMetadata.scenePrompts).toHaveLength(2);
    expect(result.content).toContain('# Act 1: What the object hides');
    expect(result.contentAnalysis.qualityScore).toBe(91);
    expect(result.sidecar).not.toHaveProperty('renderPlan');
  });

  it('assembles V3 chapters without changing their approved treatment semantics', () => {
    const masterPlan = v3Plan();
    const result = assembleLongFormScriptResult({
      plan: masterPlan,
      artifacts: v3Artifacts(masterPlan),
      videoTreatment: mixedPresenterCutawayTreatment,
    });
    if (!isScriptWriterV3Result(result)) throw new Error('Expected a V3 assembled script.');

    expect(result.metadata.estimatedTimeSeconds).toBe(420);
    expect(result.sidecar.treatment.treatmentId).toBe(mixedPresenterCutawayTreatment.treatmentId);
    expect(result.sidecar.acts.flatMap((act) => act.narrativeScenes)
      .flatMap((scene) => scene.beats)
      .flatMap((beat) => beat.visualEvents)
      .map((event) => event.treatmentEventId))
      .toEqual(['event_host_claim', 'event_process_cutaway']);
    expect(JSON.stringify(result.sidecar)).not.toContain('visualIntent');
    expect(JSON.stringify(result.sidecar)).not.toContain('shotIntent');
    expect(JSON.stringify(result.sidecar)).not.toContain('renderPlan');
  });

  it('fails closed for missing treatment, version-mixed chapters, or altered V3 treatment meaning', () => {
    const masterPlan = v3Plan();
    const complete = v3Artifacts(masterPlan);
    expect(() => assembleLongFormScriptResult({
      plan: masterPlan,
      artifacts: complete,
    })).toThrow(/video_treatment_required_for_v3/);

    const mixed = {
      chapter_open: createScriptChapterArtifact({
        plan: masterPlan,
        chapterId: 'chapter_open',
        result: chapterResult('act_one', 'scene_open', 180),
        writerTrace: trace(),
        semanticValidation: semanticReceipt(
          masterPlan,
          'act_one',
          'chapter_open',
          chapterResult('act_one', 'scene_open', 180),
        ),
      }),
      chapter_close: complete.chapter_close,
    };
    expect(() => assembleLongFormScriptResult({
      plan: masterPlan,
      artifacts: mixed,
      videoTreatment: mixedPresenterCutawayTreatment,
    })).toThrow(/sidecar_version_conflict/);

    const altered = structuredClone(complete);
    const alteredClosing = altered.chapter_close.result;
    if (!isScriptWriterV3Result(alteredClosing)) throw new Error('Expected a V3 chapter artifact.');
    alteredClosing.sidecar.acts[0]!.narrativeScenes[0]!.beats[0]!.visualEvents[0]!.visualThesis = 'Changed meaning.';
    altered.chapter_close.semanticValidation = semanticReceipt(
      masterPlan,
      'act_two',
      'chapter_close',
      alteredClosing,
    );
    expect(() => assembleLongFormScriptResult({
      plan: masterPlan,
      artifacts: altered,
      videoTreatment: mixedPresenterCutawayTreatment,
    })).toThrow(/v3_chapter_treatment_invalid:chapter_close:treatment_visual_event_payload_mismatch:event_process_cutaway/);
  });

  it('rejects missing and duplicate chapter artifacts instead of publishing partial work', () => {
    const masterPlan = plan();
    const complete = artifacts(masterPlan);
    expect(() => assembleLongFormScriptResult({
      plan: masterPlan,
      artifacts: { chapter_open: complete.chapter_open },
    })).toThrow(/missing_chapter:chapter_close/);
    expect(() => assembleLongFormScriptResult({
      plan: masterPlan,
      artifacts: [complete.chapter_open, complete.chapter_open, complete.chapter_close],
    })).toThrow(/duplicate_chapter:chapter_open/);
  });

  it('rejects scene identity, duration, and required-evidence drift from the master plan', () => {
    const masterPlan = plan();
    const wrongScene = chapterResult('act_one', 'scene_open', 180);
    wrongScene.sidecar.acts[0]!.narrativeScenes[0]!.id = 'different_scene';
    expect(() => createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: wrongScene,
      writerTrace: trace(),
      semanticValidation: undefined as never,
    })).toThrow(/scene_order_mismatch/);

    const wrongDuration = chapterResult('act_one', 'scene_open', 180);
    wrongDuration.sidecar.acts[0]!.narrativeScenes[0]!.durationIntentSeconds = 60;
    expect(() => createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: wrongDuration,
      writerTrace: trace(),
      semanticValidation: undefined as never,
    })).toThrow(/scene_duration_mismatch/);

    const missingEvidence = chapterResult('act_one', 'scene_open', 180);
    const scene = missingEvidence.sidecar.acts[0]!.narrativeScenes[0]!;
    scene.sourceRefs = [];
    scene.beats[0]!.sourceRefs = [];
    scene.beats[0]!.lines[0]!.sourceRefs = [];
    expect(() => createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: missingEvidence,
      writerTrace: trace(),
      semanticValidation: undefined as never,
    })).toThrow(/required_source_missing/);
  });

  it('rejects a semantic receipt that is not bound to the exact generated chapter', () => {
    const masterPlan = plan();
    const result = chapterResult('act_one', 'scene_open', 180);
    const receipt = semanticReceipt(masterPlan, 'act_one', 'chapter_open', result);

    expect(() => createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result,
      writerTrace: trace(),
      semanticValidation: { ...receipt, resultHash: 'b'.repeat(64) },
    })).toThrow(/semantic_validation_result_hash_mismatch/);
  });

  it('rejects ambiguous findings and invented citations from the semantic validator', async () => {
    const masterPlan = plan();
    const result = chapterResult('act_one', 'scene_open', 180);
    const requirements = buildScriptChapterSemanticRequirementsForPlan({
      plan: masterPlan,
      actId: 'act_one',
      chapterId: 'chapter_open',
    });

    await expect(validateScriptChapterSemanticExecution({
      chapterExecution: { plan: masterPlan, actId: 'act_one', chapterId: 'chapter_open' },
      result,
    }, {
      generate: async () => ({
        modelName: 'gemini-test',
        cacheStatus: 'inline',
        result: {
          assessments: requirements.map((requirement, index) => ({
            requirementId: requirement.id,
            status: index === 0 ? 'ambiguous' as const : 'satisfied' as const,
            evidence: [{
              sceneId: 'scene_open',
              beatId: 'beat_scene_open',
              kind: 'spoken_line' as const,
              lineIds: index === 1 ? ['invented_line'] : ['line_scene_open'],
            }],
            rationale: 'Injected validator output.',
          })),
        },
      }),
    })).rejects.toThrow(/semantic_validation_ambiguous_requirement/);

    await expect(validateScriptChapterSemanticExecution({
      chapterExecution: { plan: masterPlan, actId: 'act_one', chapterId: 'chapter_open' },
      result,
    }, {
      generate: async () => ({
        modelName: 'gemini-test',
        cacheStatus: 'inline',
        result: {
          assessments: requirements.map((requirement, index) => ({
            requirementId: requirement.id,
            status: 'satisfied' as const,
            evidence: [{
              sceneId: 'scene_open',
              beatId: 'beat_scene_open',
              kind: 'spoken_line' as const,
              lineIds: index === 0 ? ['invented_line'] : ['line_scene_open'],
            }],
            rationale: 'Injected validator output.',
          })),
        },
      }),
    })).rejects.toThrow(/semantic_validation_unknown_line_citation/);
  });

  it('rejects cross-chapter platform, character, and global direction conflicts', () => {
    const masterPlan = plan();
    const complete = artifacts(masterPlan);

    const platformConflict = structuredClone(complete);
    platformConflict.chapter_close.result.metadata.platform = 'instagram';
    platformConflict.chapter_close.semanticValidation = semanticReceipt(
      masterPlan,
      'act_two',
      'chapter_close',
      platformConflict.chapter_close.result,
    );
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: platformConflict }))
      .toThrow(/platform_conflict/);

    const characterConflict = structuredClone(complete);
    characterConflict.chapter_close.result.sidecar.characters[0]!.name = 'Different Narrator';
    characterConflict.chapter_close.semanticValidation = semanticReceipt(
      masterPlan,
      'act_two',
      'chapter_close',
      characterConflict.chapter_close.result,
    );
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: characterConflict }))
      .toThrow(/character_conflict:narrator/);

    const directionConflict = structuredClone(complete);
    directionConflict.chapter_close.result.sidecar.creativeDirection!.overallMusicPrompt = 'Unrelated dance track.';
    directionConflict.chapter_close.semanticValidation = semanticReceipt(
      masterPlan,
      'act_two',
      'chapter_close',
      directionConflict.chapter_close.result,
    );
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: directionConflict }))
      .toThrow(/creative_direction_conflict/);

    const provenanceConflict = structuredClone(complete);
    provenanceConflict.chapter_close.writerTrace.sourceLedgerHash = 'c'.repeat(64);
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: provenanceConflict }))
      .toThrow(/source_ledger_trace_conflict/);
  });
});
