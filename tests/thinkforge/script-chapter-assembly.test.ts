import { describe, expect, it } from 'vitest';
import {
  assembleLongFormScriptResult,
  createScriptChapterArtifact,
  ScriptChapterAssemblyError,
} from '@/lib/thinkforge/long-form/script-chapter-assembly';
import { materializeScriptWriterResult, type ScriptWriterModelOutput } from '@/lib/thinkforge/agents/script-writer-agent';
import { materializeScriptChapterPlan, type ScriptChapterPlan } from '@/lib/thinkforge/schemas/script-chapter-plan';
import type { ThinkForgeWriterInvocationTraceV1 } from '@/lib/thinkforge/provenance/generation-trace';

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

function artifacts(masterPlan = plan()) {
  return {
    chapter_open: createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: chapterResult('act_one', 'scene_open', 180),
      writerTrace: trace(),
    }),
    chapter_close: createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_close',
      result: chapterResult('act_two', 'scene_close', 240),
      writerTrace: trace(),
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
    })).toThrow(/scene_order_mismatch/);

    const wrongDuration = chapterResult('act_one', 'scene_open', 180);
    wrongDuration.sidecar.acts[0]!.narrativeScenes[0]!.durationIntentSeconds = 60;
    expect(() => createScriptChapterArtifact({
      plan: masterPlan,
      chapterId: 'chapter_open',
      result: wrongDuration,
      writerTrace: trace(),
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
    })).toThrow(/required_source_missing/);
  });

  it('rejects cross-chapter platform, character, and global direction conflicts', () => {
    const masterPlan = plan();
    const complete = artifacts(masterPlan);

    const platformConflict = structuredClone(complete);
    platformConflict.chapter_close.result.metadata.platform = 'instagram';
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: platformConflict }))
      .toThrow(/platform_conflict/);

    const characterConflict = structuredClone(complete);
    characterConflict.chapter_close.result.sidecar.characters[0]!.name = 'Different Narrator';
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: characterConflict }))
      .toThrow(/character_conflict:narrator/);

    const directionConflict = structuredClone(complete);
    directionConflict.chapter_close.result.sidecar.creativeDirection!.overallMusicPrompt = 'Unrelated dance track.';
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: directionConflict }))
      .toThrow(/creative_direction_conflict/);

    const provenanceConflict = structuredClone(complete);
    provenanceConflict.chapter_close.writerTrace.sourceLedgerHash = 'c'.repeat(64);
    expect(() => assembleLongFormScriptResult({ plan: masterPlan, artifacts: provenanceConflict }))
      .toThrow(/source_ledger_trace_conflict/);
  });
});
