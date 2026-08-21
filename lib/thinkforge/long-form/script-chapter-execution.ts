import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { ScriptWriterResult } from '../agents/script-writer-agent';
import type { NarrativeBeatV2 } from '../schemas/script-sidecar-v2';
import type { NarrativeBeatV3 } from '../schemas/script-sidecar-v3';
import type { ScriptChapterArtifact } from './script-generation-job-contract';
import {
  ScriptChapterPlanSchema,
  type ScriptChapterPlan,
} from '../schemas/script-chapter-plan';
import { hashLongFormScriptJobValue } from './script-generation-job-contract';

export const SCRIPT_CHAPTER_EXECUTION_VERSION = 1;

export interface ScriptChapterExecutionRequest {
  plan: ScriptChapterPlan;
  actId: string;
  chapterId: string;
  previousArtifact?: ScriptChapterArtifact | null;
}

export interface ResolvedScriptChapterExecution {
  version: number;
  masterPlan: {
    planHash: string;
    title: string;
    narrativeThesis: string;
    targetDurationSeconds: number;
    audienceJourney: ScriptChapterPlan['audienceJourney'];
    continuityBible: ScriptChapterPlan['continuityBible'];
    characters: ScriptChapterPlan['characters'];
    continuityThreads: ScriptChapterPlan['continuityThreads'];
  };
  assignment: {
    act: Omit<ScriptChapterPlan['acts'][number], 'chapters'>;
    chapter: ScriptChapterPlan['acts'][number]['chapters'][number];
    targetDurationSeconds: number;
  };
  precedingChapter: ChapterNeighbor | null;
  followingChapter: ChapterNeighbor | null;
  previousChapterContinuity: PreviousChapterContinuity | null;
}

interface ChapterNeighbor {
  actId: string;
  chapterId: string;
  title: string;
  narrativePurpose: string;
  audienceStateBefore: string;
  audienceStateAfter: string;
}

interface PreviousChapterContinuity {
  actId: string;
  chapterId: string;
  finalScene: {
    id: string;
    title: string;
    narrativePurpose: string;
    beats: Array<{
      narrativePurpose: string;
      spokenText: string;
      visualDescription: string;
      /** Immutable V3 treatment meaning, never a technical shot or render instruction. */
      visualEventSemantics: Array<{
        treatmentEventId: string;
        visualThesis: string;
        audienceJob: string;
        audioRelationship: string;
        continuityNotes: string[];
        sourceRefs: string[];
      }>;
    }>;
  };
}

export class ScriptChapterExecutionError extends Error {
  readonly code = 'SCRIPT_CHAPTER_EXECUTION_INVALID';

  constructor(readonly failures: string[]) {
    super(`Script chapter execution is invalid: ${failures.join(', ')}`);
    this.name = 'ScriptChapterExecutionError';
  }
}

export function resolveScriptChapterExecution(
  request: ScriptChapterExecutionRequest,
): ResolvedScriptChapterExecution {
  const plan = ScriptChapterPlanSchema.parse(request.plan);
  const chapters = plan.acts.flatMap((act) => act.chapters.map((chapter) => ({ act, chapter })));
  const chapterIndex = chapters.findIndex(({ chapter }) => chapter.id === request.chapterId);
  if (chapterIndex < 0) throw new ScriptChapterExecutionError([`unknown_chapter:${request.chapterId}`]);

  const owner = chapters[chapterIndex]!;
  if (owner.act.id !== request.actId) {
    throw new ScriptChapterExecutionError([
      `act_mismatch:${request.chapterId}:${request.actId}/${owner.act.id}`,
    ]);
  }

  const previous = chapters[chapterIndex - 1] ?? null;
  const following = chapters[chapterIndex + 1] ?? null;
  const previousChapterContinuity = resolvePreviousChapterContinuity({
    plan,
    previous,
    previousArtifact: request.previousArtifact ?? null,
  });
  const targetDurationSeconds = owner.chapter.sceneBlueprints.reduce(
    (total, scene) => total + scene.durationIntentSeconds,
    0,
  );

  return {
    version: SCRIPT_CHAPTER_EXECUTION_VERSION,
    masterPlan: {
      planHash: hashLongFormScriptJobValue(plan),
      title: plan.title,
      narrativeThesis: plan.narrativeThesis,
      targetDurationSeconds: plan.targetDurationSeconds,
      audienceJourney: structuredClone(plan.audienceJourney),
      continuityBible: structuredClone(plan.continuityBible),
      characters: structuredClone(plan.characters),
      continuityThreads: structuredClone(plan.continuityThreads),
    },
    assignment: {
      act: {
        id: owner.act.id,
        title: owner.act.title,
        narrativePurpose: owner.act.narrativePurpose,
      },
      chapter: structuredClone(owner.chapter),
      targetDurationSeconds,
    },
    precedingChapter: previous ? chapterNeighbor(previous.act.id, previous.chapter) : null,
    followingChapter: following ? chapterNeighbor(following.act.id, following.chapter) : null,
    previousChapterContinuity,
  };
}

export function projectProductionBriefForScriptChapter(
  brief: ProductionBrief | null | undefined,
  execution: ResolvedScriptChapterExecution,
): ProductionBrief {
  if (!brief) {
    throw new ScriptChapterExecutionError(['production_brief_required']);
  }
  return {
    ...brief,
    output: {
      ...brief.output,
      targetDurationSec: execution.assignment.targetDurationSeconds,
    },
    resolution: {
      ...brief.resolution,
      fieldConfidence: { ...brief.resolution.fieldConfidence },
      confirmed: [...brief.resolution.confirmed],
      inferred: [...brief.resolution.inferred],
    },
    ...(brief.trend ? { trend: structuredClone(brief.trend) } : {}),
    ...(brief.casting ? { casting: structuredClone(brief.casting) } : {}),
  };
}

export function findScriptChapterExecutionOutputIssues(
  execution: ResolvedScriptChapterExecution,
  result: Pick<ScriptWriterResult, 'sidecar'>,
): string[] {
  const failures: string[] = [];
  const expectedAct = execution.assignment.act;
  const expectedScenes = execution.assignment.chapter.sceneBlueprints;
  const actualActs = result.sidecar.acts;
  if (actualActs.length !== 1) failures.push(`chapter_act_count_mismatch:${actualActs.length}/1`);
  const actualAct = actualActs[0];
  if (!actualAct) return failures;
  if (actualAct.id !== expectedAct.id) {
    failures.push(`chapter_act_id_mismatch:${actualAct.id}/${expectedAct.id}`);
  }
  if (actualAct.narrativeScenes.length !== expectedScenes.length) {
    failures.push(
      `chapter_scene_count_mismatch:${actualAct.narrativeScenes.length}/${expectedScenes.length}`,
    );
  }

  expectedScenes.forEach((blueprint, index) => {
    const scene = actualAct.narrativeScenes[index];
    if (!scene) return;
    if (scene.id !== blueprint.id) {
      failures.push(`chapter_scene_id_mismatch:${index}:${scene.id}/${blueprint.id}`);
    }
    const duration = scene.durationIntentSeconds
      ?? scene.beats.reduce((total, beat) => total + (beat.durationIntentSeconds ?? 0), 0);
    if (Math.abs(duration - blueprint.durationIntentSeconds) > 0.001) {
      failures.push(
        `chapter_scene_duration_mismatch:${blueprint.id}:${duration}/${blueprint.durationIntentSeconds}`,
      );
    }
    blueprint.requiredCharacterIds.forEach((characterId) => {
      if (!scene.charactersPresent.includes(characterId)) {
        failures.push(`chapter_required_character_missing:${blueprint.id}:${characterId}`);
      }
    });
    const sourceRefs = new Set([
      ...scene.sourceRefs,
      ...scene.beats.flatMap((beat) => [
        ...beat.sourceRefs,
        ...beat.lines.flatMap((line) => line.sourceRefs),
        ...('visualEvents' in beat ? beat.visualEvents.flatMap((event) => event.sourceRefs) : []),
      ]),
    ]);
    blueprint.requiredSourceRefs.forEach((sourceRef) => {
      if (!sourceRefs.has(sourceRef)) {
        failures.push(`chapter_required_source_missing:${blueprint.id}:${sourceRef}`);
      }
    });
  });

  return failures;
}

function resolvePreviousChapterContinuity(input: {
  plan: ScriptChapterPlan;
  previous: { act: ScriptChapterPlan['acts'][number]; chapter: ScriptChapterPlan['acts'][number]['chapters'][number] } | null;
  previousArtifact: ScriptChapterArtifact | null;
}): PreviousChapterContinuity | null {
  if (!input.previous) {
    if (input.previousArtifact) {
      throw new ScriptChapterExecutionError(['unexpected_previous_chapter_artifact']);
    }
    return null;
  }
  if (!input.previousArtifact) {
    throw new ScriptChapterExecutionError([
      `previous_chapter_artifact_required:${input.previous.chapter.id}`,
    ]);
  }

  const expectedPlanHash = hashLongFormScriptJobValue(input.plan);
  const artifact = input.previousArtifact;
  const failures: string[] = [];
  if (artifact.planHash !== expectedPlanHash) failures.push('previous_chapter_plan_hash_mismatch');
  if (artifact.actId !== input.previous.act.id) failures.push('previous_chapter_act_mismatch');
  if (artifact.chapterId !== input.previous.chapter.id) failures.push('previous_chapter_id_mismatch');
  const finalAct = artifact.result.sidecar.acts.at(-1);
  const finalScene = finalAct?.narrativeScenes.at(-1);
  if (!finalScene) failures.push('previous_chapter_final_scene_missing');
  if (failures.length > 0 || !finalScene) throw new ScriptChapterExecutionError(failures);

  return {
    actId: artifact.actId,
    chapterId: artifact.chapterId,
    finalScene: {
      id: finalScene.id,
      title: finalScene.title,
      narrativePurpose: finalScene.narrativePurpose,
      beats: finalScene.beats.map((beat) => ({
        narrativePurpose: beat.narrativePurpose,
        spokenText: beat.lines
          .filter((line) => line.delivery !== 'on-screen-text')
          .map((line) => line.text)
          .join(' '),
        ...previousBeatVisualContinuity(beat),
      })),
    },
  };
}

function previousBeatVisualContinuity(beat: NarrativeBeatV2 | NarrativeBeatV3): {
  visualDescription: string;
  visualEventSemantics: PreviousChapterContinuity['finalScene']['beats'][number]['visualEventSemantics'];
} {
  const visualEventSemantics = 'visualEvents' in beat
    ? beat.visualEvents.map((event) => ({
      treatmentEventId: event.treatmentEventId,
      visualThesis: event.visualThesis,
      audienceJob: event.audienceJob,
      audioRelationship: event.audioRelationship,
      continuityNotes: [...event.continuityNotes],
      sourceRefs: [...event.sourceRefs],
    }))
    : [];
  const visualDescription = visualEventSemantics.length > 0
    ? visualEventSemantics.map((event) => `${event.visualThesis} Audience job: ${event.audienceJob}`).join(' | ')
    : ('visualIntent' in beat && beat.visualIntent ? beat.visualIntent.description : '');
  return { visualDescription, visualEventSemantics };
}

function chapterNeighbor(
  actId: string,
  chapter: ScriptChapterPlan['acts'][number]['chapters'][number],
): ChapterNeighbor {
  return {
    actId,
    chapterId: chapter.id,
    title: chapter.title,
    narrativePurpose: chapter.narrativePurpose,
    audienceStateBefore: chapter.audienceStateBefore,
    audienceStateAfter: chapter.audienceStateAfter,
  };
}
