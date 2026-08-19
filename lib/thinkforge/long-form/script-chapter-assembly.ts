import {
  materializeScriptWriterResult,
  ScriptWriterModelOutputSchema,
  ScriptWriterResultSchema,
  type ScriptWriterResult,
} from '../agents/script-writer-agent';
import { ThinkForgeWriterInvocationTraceV1Schema } from '../provenance/generation-trace';
import {
  ScriptChapterPlanSchema,
  type ScriptChapterPlan,
} from '../schemas/script-chapter-plan';
import type {
  NarrativeCharacterV2,
  NarrativeSceneV2,
} from '../schemas/script-sidecar-v2';
import {
  hashLongFormScriptJobValue,
  type ScriptChapterArtifact,
} from './script-generation-job-contract';

export class ScriptChapterAssemblyError extends Error {
  constructor(readonly failures: string[]) {
    super(`Long-form script assembly failed: ${failures.join(', ')}`);
    this.name = 'ScriptChapterAssemblyError';
  }
}

export function createScriptChapterArtifact(input: {
  plan: ScriptChapterPlan;
  chapterId: string;
  result: ScriptWriterResult;
  writerTrace: ScriptChapterArtifact['writerTrace'];
}): ScriptChapterArtifact {
  const plan = ScriptChapterPlanSchema.parse(input.plan);
  const owner = findChapterOwner(plan, input.chapterId);
  if (!owner) throw new ScriptChapterAssemblyError([`unknown_chapter:${input.chapterId}`]);
  const artifact: ScriptChapterArtifact = {
    actId: owner.act.id,
    chapterId: owner.chapter.id,
    planHash: hashLongFormScriptJobValue(plan),
    result: ScriptWriterResultSchema.parse(input.result),
    writerTrace: ThinkForgeWriterInvocationTraceV1Schema.parse(input.writerTrace),
  };
  assertScriptChapterArtifact(plan, artifact);
  return artifact;
}

export function assertScriptChapterArtifact(
  planInput: ScriptChapterPlan,
  artifactInput: ScriptChapterArtifact,
): ScriptChapterArtifact {
  const plan = ScriptChapterPlanSchema.parse(planInput);
  const artifact: ScriptChapterArtifact = {
    ...artifactInput,
    result: ScriptWriterResultSchema.parse(artifactInput.result),
    writerTrace: ThinkForgeWriterInvocationTraceV1Schema.parse(artifactInput.writerTrace),
  };
  const failures: string[] = [];
  const owner = findChapterOwner(plan, artifact.chapterId);
  if (!owner) failures.push(`unknown_chapter:${artifact.chapterId}`);
  if (owner && owner.act.id !== artifact.actId) failures.push(`act_mismatch:${artifact.chapterId}`);
  if (artifact.planHash !== hashLongFormScriptJobValue(plan)) failures.push(`plan_hash_mismatch:${artifact.chapterId}`);
  if (artifact.writerTrace.writerType !== 'script') failures.push(`writer_type_mismatch:${artifact.chapterId}`);
  if (artifact.result.sidecar.renderPlan) failures.push(`writer_render_plan_forbidden:${artifact.chapterId}`);

  const sidecarActs = artifact.result.sidecar.acts;
  if (sidecarActs.length !== 1) failures.push(`chapter_act_count:${artifact.chapterId}:${sidecarActs.length}`);
  const sidecarAct = sidecarActs[0];
  if (sidecarAct && owner) {
    if (sidecarAct.id !== owner.act.id) failures.push(`sidecar_act_mismatch:${artifact.chapterId}`);
    const expectedScenes = owner.chapter.sceneBlueprints;
    const actualScenes = sidecarAct.narrativeScenes;
    if (actualScenes.length !== expectedScenes.length) {
      failures.push(`scene_count_mismatch:${artifact.chapterId}:${actualScenes.length}/${expectedScenes.length}`);
    }
    expectedScenes.forEach((blueprint, index) => {
      const scene = actualScenes[index];
      if (!scene) return;
      if (scene.id !== blueprint.id) failures.push(`scene_order_mismatch:${artifact.chapterId}:${index}`);
      const duration = sceneDurationIntent(scene);
      if (Math.abs(duration - blueprint.durationIntentSeconds) > 0.001) {
        failures.push(`scene_duration_mismatch:${scene.id}:${duration}/${blueprint.durationIntentSeconds}`);
      }
      blueprint.requiredCharacterIds.forEach((characterId) => {
        if (!scene.charactersPresent.includes(characterId)) {
          failures.push(`required_character_missing:${scene.id}:${characterId}`);
        }
      });
      const evidenceRefs = sceneEvidenceRefs(scene);
      blueprint.requiredSourceRefs.forEach((sourceRef) => {
        if (!evidenceRefs.has(sourceRef)) failures.push(`required_source_missing:${scene.id}:${sourceRef}`);
      });
    });
  }
  if (failures.length > 0) throw new ScriptChapterAssemblyError(failures);
  return artifact;
}

export function assembleLongFormScriptResult(input: {
  plan: ScriptChapterPlan;
  artifacts: Record<string, ScriptChapterArtifact> | readonly ScriptChapterArtifact[];
}): ScriptWriterResult {
  const plan = ScriptChapterPlanSchema.parse(input.plan);
  const artifacts = Array.isArray(input.artifacts)
    ? [...input.artifacts]
    : Object.values(input.artifacts);
  const byChapter = new Map<string, ScriptChapterArtifact>();
  const failures: string[] = [];

  artifacts.forEach((candidate) => {
    if (byChapter.has(candidate.chapterId)) failures.push(`duplicate_chapter:${candidate.chapterId}`);
    else byChapter.set(candidate.chapterId, assertScriptChapterArtifact(plan, candidate));
  });
  const plannedChapterIds = new Set(plan.acts.flatMap((act) => act.chapters.map((chapter) => chapter.id)));
  artifacts.forEach((artifact) => {
    if (!plannedChapterIds.has(artifact.chapterId)) failures.push(`extra_chapter:${artifact.chapterId}`);
  });
  plannedChapterIds.forEach((chapterId) => {
    if (!byChapter.has(chapterId)) failures.push(`missing_chapter:${chapterId}`);
  });
  if (failures.length > 0) throw new ScriptChapterAssemblyError(failures);

  const orderedArtifacts = plan.acts.flatMap((act) => act.chapters.map((chapter) => byChapter.get(chapter.id)!));
  requireSharedTraceContext(orderedArtifacts);
  const platform = requireSharedValue(orderedArtifacts.map((artifact) => artifact.result.metadata.platform), 'platform');
  const motionInfo = requireSharedValue(
    orderedArtifacts.map((artifact) => artifact.result.visualMetadata.motionInfo),
    'motion_info',
  );
  const briefId = requireSharedOptionalValue(
    orderedArtifacts.map((artifact) => artifact.result.sidecar.briefId),
    'brief_id',
  );
  const creativeDirection = requireSharedOptionalObject(
    orderedArtifacts.map((artifact) => artifact.result.sidecar.creativeDirection),
    'creative_direction',
  );
  const characters = mergeCharacters(orderedArtifacts);
  const sourceRefs = unique(orderedArtifacts.flatMap((artifact) => artifact.result.sidecar.sourceRefs));

  const modelOutput = ScriptWriterModelOutputSchema.parse({
    contentAnalysis: {
      hooks: unique(orderedArtifacts.flatMap((artifact) => artifact.result.contentAnalysis.hooks)),
      theme: plan.narrativeThesis,
      emphasisPoints: plan.acts.flatMap((act) => act.chapters.map((chapter) => chapter.title)),
      qualityScore: Math.min(...orderedArtifacts.map((artifact) => artifact.result.contentAnalysis.qualityScore)),
    },
    visualMetadata: { motionInfo },
    metadata: { platform },
    sidecar: {
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters,
      acts: plan.acts.map((act) => ({
        id: act.id,
        title: act.title,
        narrativePurpose: act.narrativePurpose,
        narrativeScenes: act.chapters.flatMap((chapter) => (
          byChapter.get(chapter.id)!.result.sidecar.acts[0]!.narrativeScenes
        )),
      })),
      ...(creativeDirection ? { creativeDirection } : {}),
      ...(briefId ? { briefId } : {}),
      sourceRefs,
    },
  });
  return materializeScriptWriterResult(modelOutput);
}

function findChapterOwner(plan: ScriptChapterPlan, chapterId: string) {
  for (const act of plan.acts) {
    const chapter = act.chapters.find((candidate) => candidate.id === chapterId);
    if (chapter) return { act, chapter };
  }
  return null;
}

function sceneDurationIntent(scene: NarrativeSceneV2): number {
  return scene.durationIntentSeconds
    ?? scene.beats.reduce((total, beat) => total + (beat.durationIntentSeconds ?? 0), 0);
}

function sceneEvidenceRefs(scene: NarrativeSceneV2): Set<string> {
  return new Set([
    ...scene.sourceRefs,
    ...scene.beats.flatMap((beat) => [
      ...beat.sourceRefs,
      ...beat.lines.flatMap((line) => line.sourceRefs),
    ]),
  ]);
}

function mergeCharacters(artifacts: readonly ScriptChapterArtifact[]): NarrativeCharacterV2[] {
  const byId = new Map<string, NarrativeCharacterV2>();
  artifacts.forEach((artifact) => artifact.result.sidecar.characters.forEach((character) => {
    const existing = byId.get(character.id);
    if (existing && hashLongFormScriptJobValue(existing) !== hashLongFormScriptJobValue(character)) {
      throw new ScriptChapterAssemblyError([`character_conflict:${character.id}`]);
    }
    if (!existing) byId.set(character.id, character);
  }));
  return [...byId.values()];
}

function requireSharedTraceContext(artifacts: readonly ScriptChapterArtifact[]): void {
  requireSharedValue(
    artifacts.map((artifact) => artifact.writerTrace.editorialPlanHash),
    'editorial_plan_trace',
  );
  requireSharedValue(
    artifacts.map((artifact) => hashLongFormScriptJobValue(artifact.writerTrace.writingKnowledge)),
    'writing_knowledge_trace',
  );
  requireSharedValue(
    artifacts.map((artifact) => artifact.writerTrace.sourceLedgerHash ?? 'none'),
    'source_ledger_trace',
  );
}

function requireSharedValue(values: readonly string[], field: string): string {
  const first = values[0];
  if (!first || values.some((value) => value !== first)) {
    throw new ScriptChapterAssemblyError([`${field}_conflict`]);
  }
  return first;
}

function requireSharedOptionalValue(
  values: readonly (string | undefined)[],
  field: string,
): string | undefined {
  const normalized = unique(values.filter((value): value is string => Boolean(value)));
  if (normalized.length > 1) throw new ScriptChapterAssemblyError([`${field}_conflict`]);
  return normalized[0];
}

function requireSharedOptionalObject<T>(
  values: readonly (T | undefined)[],
  field: string,
): T | undefined {
  const present = values.filter((value): value is T => value !== undefined);
  if (present.length === 0) return undefined;
  const firstHash = hashLongFormScriptJobValue(present[0]);
  if (present.some((value) => hashLongFormScriptJobValue(value) !== firstHash)) {
    throw new ScriptChapterAssemblyError([`${field}_conflict`]);
  }
  return present[0];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
