import {
  isScriptWriterV3Result,
  materializeAssembledScriptWriterV3Result,
  materializeScriptWriterResult,
  ScriptWriterModelOutputSchema,
  ScriptWriterResultSchema,
  type ScriptWriterResult,
  type ScriptWriterV2Result,
  type ScriptWriterV3Result,
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
  assertMaterializedScriptSidecarV3Treatment,
  type NarrativeCharacterV3,
  type NarrativeSceneV3,
  type ScriptSidecarV3,
} from '../schemas/script-sidecar-v3';
import type { VideoTreatment } from '../schemas/video-treatment';
import {
  hashLongFormScriptJobValue,
  type ScriptChapterArtifact,
} from './script-generation-job-contract';
import { assertScriptChapterSemanticValidationReceipt } from './script-chapter-semantic-validation';

type ScriptChapterV2Artifact = Omit<ScriptChapterArtifact, 'result'> & {
  result: ScriptWriterV2Result;
};
type ScriptChapterV3Artifact = Omit<ScriptChapterArtifact, 'result'> & {
  result: ScriptWriterV3Result;
};

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
  semanticValidation: ScriptChapterArtifact['semanticValidation'];
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
    semanticValidation: input.semanticValidation,
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
  if (!artifact.semanticValidation) failures.push(`semantic_validation_missing:${artifact.chapterId}`);

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
  if (failures.length === 0) {
    try {
      artifact.semanticValidation = assertScriptChapterSemanticValidationReceipt({
        plan,
        actId: artifact.actId,
        chapterId: artifact.chapterId,
        result: artifact.result,
        receipt: artifact.semanticValidation,
      });
    } catch (error) {
      if (error instanceof Error && 'failures' in error && Array.isArray(error.failures)) {
        failures.push(...error.failures.filter((failure): failure is string => typeof failure === 'string'));
      } else {
        failures.push(`semantic_validation_invalid:${artifact.chapterId}`);
      }
    }
  }
  if (failures.length > 0) throw new ScriptChapterAssemblyError(failures);
  return artifact;
}

export function assembleLongFormScriptResult(input: {
  plan: ScriptChapterPlan;
  artifacts: Record<string, ScriptChapterArtifact> | readonly ScriptChapterArtifact[];
  /** Required only when every chapter uses the semantic V3 sidecar contract. */
  videoTreatment?: VideoTreatment | null;
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
  const isV3 = orderedArtifacts.map((artifact) => isScriptWriterV3Result(artifact.result));
  if (isV3.some(Boolean) && !isV3.every(Boolean)) {
    throw new ScriptChapterAssemblyError(['sidecar_version_conflict']);
  }
  if (isV3.every(Boolean)) {
    if (!input.videoTreatment) throw new ScriptChapterAssemblyError(['video_treatment_required_for_v3']);
    return assembleLongFormScriptV3({
      plan,
      artifacts: requireV3Artifacts(orderedArtifacts),
      treatment: input.videoTreatment,
    });
  }
  return assembleLongFormScriptV2({ plan, artifacts: requireV2Artifacts(orderedArtifacts) });
}

function assembleLongFormScriptV2(input: {
  plan: ScriptChapterPlan;
  artifacts: readonly ScriptChapterV2Artifact[];
}): ScriptWriterV2Result {
  const artifactsByChapter = new Map(input.artifacts.map((artifact) => [artifact.chapterId, artifact]));
  const platform = requireSharedValue(input.artifacts.map((artifact) => artifact.result.metadata.platform), 'platform');
  const motionInfo = requireSharedValue(
    input.artifacts.map((artifact) => artifact.result.visualMetadata.motionInfo),
    'motion_info',
  );
  const briefId = requireSharedOptionalValue(
    input.artifacts.map((artifact) => artifact.result.sidecar.briefId),
    'brief_id',
  );
  const creativeDirection = requireSharedOptionalObject(
    input.artifacts.map((artifact) => artifact.result.sidecar.creativeDirection),
    'creative_direction',
  );
  const characters = mergeV2Characters(input.artifacts);
  const sourceRefs = unique(input.artifacts.flatMap((artifact) => artifact.result.sidecar.sourceRefs));

  const modelOutput = ScriptWriterModelOutputSchema.parse({
    contentAnalysis: {
      hooks: unique(input.artifacts.flatMap((artifact) => artifact.result.contentAnalysis.hooks)),
      theme: input.plan.narrativeThesis,
      emphasisPoints: input.plan.acts.flatMap((act) => act.chapters.map((chapter) => chapter.title)),
      qualityScore: Math.min(...input.artifacts.map((artifact) => artifact.result.contentAnalysis.qualityScore)),
    },
    visualMetadata: { motionInfo },
    metadata: { platform },
    sidecar: {
      sidecarVersion: 2,
      spokenTextSource: 'beat-lines',
      characters,
      acts: input.plan.acts.map((act) => ({
        id: act.id,
        title: act.title,
        narrativePurpose: act.narrativePurpose,
        narrativeScenes: act.chapters.flatMap((chapter) => (
          artifactsByChapter.get(chapter.id)!.result.sidecar.acts[0]!.narrativeScenes
        )),
      })),
      ...(creativeDirection ? { creativeDirection } : {}),
      ...(briefId ? { briefId } : {}),
      sourceRefs,
    },
  });
  return materializeScriptWriterResult(modelOutput);
}

function assembleLongFormScriptV3(input: {
  plan: ScriptChapterPlan;
  artifacts: readonly ScriptChapterV3Artifact[];
  treatment: VideoTreatment;
}): ScriptWriterV3Result {
  const artifactsByChapter = new Map(input.artifacts.map((artifact) => [artifact.chapterId, artifact]));
  const failures: string[] = [];
  input.artifacts.forEach((artifact) => {
    const owner = findChapterOwner(input.plan, artifact.chapterId);
    if (!owner) {
      failures.push(`unknown_chapter:${artifact.chapterId}`);
      return;
    }
    const treatmentEventIds = owner.chapter.sceneBlueprints.flatMap(
      (scene) => scene.treatmentEventIds ?? [],
    );
    try {
      assertMaterializedScriptSidecarV3Treatment({
        sidecar: artifact.result.sidecar,
        treatment: input.treatment,
        treatmentEventIds,
      });
    } catch (error) {
      if (error instanceof Error && 'issues' in error && Array.isArray(error.issues)) {
        failures.push(...error.issues
          .filter((issue): issue is string => typeof issue === 'string')
          .map((issue) => `v3_chapter_treatment_invalid:${artifact.chapterId}:${issue}`));
      } else {
        failures.push(`v3_chapter_treatment_invalid:${artifact.chapterId}`);
      }
    }
    if (artifact.result.visualMetadata.motionInfo !== input.treatment.visualRhythm) {
      failures.push(`v3_chapter_visual_rhythm_mismatch:${artifact.chapterId}`);
    }
  });
  if (failures.length > 0) throw new ScriptChapterAssemblyError(failures);

  const platform = requireSharedValue(input.artifacts.map((artifact) => artifact.result.metadata.platform), 'platform');
  const briefId = requireSharedOptionalValue(
    input.artifacts.map((artifact) => artifact.result.sidecar.briefId),
    'brief_id',
  );
  const characters = mergeV3Characters(input.artifacts);
  const sourceRefs = unique(input.artifacts.flatMap((artifact) => artifact.result.sidecar.sourceRefs));
  const sidecar: ScriptSidecarV3 = {
    sidecarVersion: 3,
    spokenTextSource: 'beat-lines',
    treatment: {
      treatmentId: input.treatment.treatmentId,
      treatmentVersion: input.treatment.version,
      inputFingerprint: input.treatment.decisionTrace.inputFingerprint,
    },
    characters,
    acts: input.plan.acts.map((act) => ({
      id: act.id,
      title: act.title,
      narrativePurpose: act.narrativePurpose,
      narrativeScenes: act.chapters.flatMap((chapter) => (
        artifactsByChapter.get(chapter.id)!.result.sidecar.acts[0]!.narrativeScenes
      )),
    })),
    ...(briefId ? { briefId } : {}),
    sourceRefs,
  };

  return materializeAssembledScriptWriterV3Result({
    sidecar,
    treatment: input.treatment,
    contentAnalysis: {
      hooks: unique(input.artifacts.flatMap((artifact) => artifact.result.contentAnalysis.hooks)),
      theme: input.plan.narrativeThesis,
      emphasisPoints: input.plan.acts.flatMap((act) => act.chapters.map((chapter) => chapter.title)),
      qualityScore: Math.min(...input.artifacts.map((artifact) => artifact.result.contentAnalysis.qualityScore)),
    },
    platform,
  });
}

function findChapterOwner(plan: ScriptChapterPlan, chapterId: string) {
  for (const act of plan.acts) {
    const chapter = act.chapters.find((candidate) => candidate.id === chapterId);
    if (chapter) return { act, chapter };
  }
  return null;
}

function sceneDurationIntent(scene: NarrativeSceneV2 | NarrativeSceneV3): number {
  return scene.durationIntentSeconds
    ?? scene.beats.reduce((total, beat) => total + (beat.durationIntentSeconds ?? 0), 0);
}

function sceneEvidenceRefs(scene: NarrativeSceneV2 | NarrativeSceneV3): Set<string> {
  return new Set([
    ...scene.sourceRefs,
    ...scene.beats.flatMap((beat) => [
      ...beat.sourceRefs,
      ...beat.lines.flatMap((line) => line.sourceRefs),
      ...('visualEvents' in beat ? beat.visualEvents.flatMap((event) => event.sourceRefs) : []),
    ]),
  ]);
}

function mergeV2Characters(artifacts: readonly ScriptChapterV2Artifact[]): NarrativeCharacterV2[] {
  return mergeCharactersById(artifacts.flatMap((artifact) => artifact.result.sidecar.characters));
}

function mergeV3Characters(artifacts: readonly ScriptChapterV3Artifact[]): NarrativeCharacterV3[] {
  return mergeCharactersById(artifacts.flatMap((artifact) => artifact.result.sidecar.characters));
}

function mergeCharactersById<T extends { id: string }>(characters: readonly T[]): T[] {
  const byId = new Map<string, T>();
  characters.forEach((character) => {
    const existing = byId.get(character.id);
    if (existing && hashLongFormScriptJobValue(existing) !== hashLongFormScriptJobValue(character)) {
      throw new ScriptChapterAssemblyError([`character_conflict:${character.id}`]);
    }
    if (!existing) byId.set(character.id, character);
  });
  return [...byId.values()];
}

function requireV2Artifacts(artifacts: readonly ScriptChapterArtifact[]): ScriptChapterV2Artifact[] {
  if (artifacts.some((artifact) => isScriptWriterV3Result(artifact.result))) {
    throw new ScriptChapterAssemblyError(['sidecar_version_conflict']);
  }
  return artifacts as ScriptChapterV2Artifact[];
}

function requireV3Artifacts(artifacts: readonly ScriptChapterArtifact[]): ScriptChapterV3Artifact[] {
  if (artifacts.some((artifact) => !isScriptWriterV3Result(artifact.result))) {
    throw new ScriptChapterAssemblyError(['sidecar_version_conflict']);
  }
  return artifacts as ScriptChapterV3Artifact[];
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
