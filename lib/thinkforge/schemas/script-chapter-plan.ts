import { z } from 'zod';
import type { SourceLedger } from '../provenance/source-ledger';

export const SCRIPT_CHAPTER_PLAN_VERSION = 1 as const;

const IdentifierSchema = z.string().trim().min(1).regex(/^[a-zA-Z0-9_-]+$/);
const NonEmptyTextSchema = z.string().trim().min(1);
const ModelSourceRefsSchema = z.array(z.string()).default([]);
const SourceRefsSchema = z.array(IdentifierSchema).default([]);

const ScriptPlanCharacterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  narrativeRole: z.string(),
  voice: z.string(),
  openingState: z.string(),
  closingState: z.string(),
  invariantTraits: z.array(z.string()).default([]),
}).strict();

const ScriptPlanCharacterSchema = ScriptPlanCharacterModelSchema.extend({
  id: IdentifierSchema,
  name: NonEmptyTextSchema,
  narrativeRole: NonEmptyTextSchema,
  voice: NonEmptyTextSchema,
  openingState: NonEmptyTextSchema,
  closingState: NonEmptyTextSchema,
  invariantTraits: z.array(NonEmptyTextSchema).default([]),
}).strict();

const ScriptSceneBlueprintModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  openingState: z.string(),
  development: z.array(z.string()),
  closingState: z.string(),
  durationIntentSeconds: z.number(),
  requiredSourceRefs: ModelSourceRefsSchema,
  requiredCharacterIds: z.array(z.string()).default([]),
  continuityThreadIds: z.array(z.string()).default([]),
}).strict();

const ScriptSceneBlueprintSchema = ScriptSceneBlueprintModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  openingState: NonEmptyTextSchema,
  development: z.array(NonEmptyTextSchema).min(1),
  closingState: NonEmptyTextSchema,
  durationIntentSeconds: z.number().finite().positive(),
  requiredSourceRefs: SourceRefsSchema,
  requiredCharacterIds: z.array(IdentifierSchema).default([]),
  continuityThreadIds: z.array(IdentifierSchema).default([]),
}).strict();

const ScriptChapterModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  audienceStateBefore: z.string(),
  audienceStateAfter: z.string(),
  sceneBlueprints: z.array(ScriptSceneBlueprintModelSchema),
}).strict();

const ScriptChapterSchema = ScriptChapterModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  audienceStateBefore: NonEmptyTextSchema,
  audienceStateAfter: NonEmptyTextSchema,
  sceneBlueprints: z.array(ScriptSceneBlueprintSchema).min(1),
}).strict();

const ScriptActPlanModelSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrativePurpose: z.string(),
  chapters: z.array(ScriptChapterModelSchema),
}).strict();

const ScriptActPlanSchema = ScriptActPlanModelSchema.extend({
  id: IdentifierSchema,
  title: NonEmptyTextSchema,
  narrativePurpose: NonEmptyTextSchema,
  chapters: z.array(ScriptChapterSchema).min(1),
}).strict();

const ContinuityResolutionModelSchema = z.discriminatedUnion('policy', [
  z.object({
    policy: z.literal('resolved'),
    resolvedInSceneId: z.string(),
  }).strict(),
  z.object({
    policy: z.literal('intentionally_open'),
    rationale: z.string(),
  }).strict(),
]);

const ContinuityResolutionSchema = z.discriminatedUnion('policy', [
  z.object({
    policy: z.literal('resolved'),
    resolvedInSceneId: IdentifierSchema,
  }).strict(),
  z.object({
    policy: z.literal('intentionally_open'),
    rationale: NonEmptyTextSchema,
  }).strict(),
]);

const ScriptContinuityThreadModelSchema = z.object({
  id: z.string(),
  promise: z.string(),
  intendedPayoff: z.string(),
  introducedInSceneId: z.string(),
  resolution: ContinuityResolutionModelSchema,
}).strict();

const ScriptContinuityThreadSchema = ScriptContinuityThreadModelSchema.extend({
  id: IdentifierSchema,
  promise: NonEmptyTextSchema,
  intendedPayoff: NonEmptyTextSchema,
  introducedInSceneId: IdentifierSchema,
  resolution: ContinuityResolutionSchema,
}).strict();

const ScriptContinuityBibleModelSchema = z.object({
  pointOfView: z.string(),
  temporalFrame: z.string(),
  toneProgression: z.array(z.string()),
  recurringMotifs: z.array(z.string()).default([]),
  terminologyInvariants: z.array(z.string()).default([]),
}).strict();

const ScriptContinuityBibleSchema = ScriptContinuityBibleModelSchema.extend({
  pointOfView: NonEmptyTextSchema,
  temporalFrame: NonEmptyTextSchema,
  toneProgression: z.array(NonEmptyTextSchema).min(1),
  recurringMotifs: z.array(NonEmptyTextSchema).default([]),
  terminologyInvariants: z.array(NonEmptyTextSchema).default([]),
}).strict();

export const ScriptChapterPlanModelOutputSchema = z.object({
  title: z.string(),
  narrativeThesis: z.string(),
  targetDurationSeconds: z.number(),
  audienceJourney: z.object({
    openingState: z.string(),
    closingState: z.string(),
  }).strict(),
  continuityBible: ScriptContinuityBibleModelSchema,
  characters: z.array(ScriptPlanCharacterModelSchema).default([]),
  continuityThreads: z.array(ScriptContinuityThreadModelSchema).default([]),
  acts: z.array(ScriptActPlanModelSchema),
}).strict();

const ScriptChapterPlanObjectSchema = ScriptChapterPlanModelOutputSchema.extend({
  // Server-owned constant. A numeric literal would become a Gemini-incompatible numeric enum.
  version: z.number().int().default(SCRIPT_CHAPTER_PLAN_VERSION),
  title: NonEmptyTextSchema,
  narrativeThesis: NonEmptyTextSchema,
  targetDurationSeconds: z.number().finite().positive(),
  audienceJourney: z.object({
    openingState: NonEmptyTextSchema,
    closingState: NonEmptyTextSchema,
  }).strict(),
  continuityBible: ScriptContinuityBibleSchema,
  characters: z.array(ScriptPlanCharacterSchema).default([]),
  continuityThreads: z.array(ScriptContinuityThreadSchema).default([]),
  acts: z.array(ScriptActPlanSchema).min(1),
}).strict();

type ScriptChapterPlanObject = z.infer<typeof ScriptChapterPlanObjectSchema>;

function addIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function validateUniqueId(
  id: string,
  owner: string,
  path: Array<string | number>,
  seen: Set<string>,
  ctx: z.RefinementCtx,
): void {
  if (seen.has(id)) addIssue(ctx, path, `Duplicate ${owner} id "${id}".`);
  seen.add(id);
}

function validateScriptChapterPlan(plan: ScriptChapterPlanObject, ctx: z.RefinementCtx): void {
  if (plan.version !== SCRIPT_CHAPTER_PLAN_VERSION) {
    addIssue(ctx, ['version'], `Expected script chapter plan version ${SCRIPT_CHAPTER_PLAN_VERSION}.`);
  }

  const allIds = new Set<string>();
  const characterIds = new Set<string>();
  const threadIds = new Set<string>();
  const scenePositions = new Map<string, number>();
  const scenesById = new Map<string, ScriptChapterPlanObject['acts'][number]['chapters'][number]['sceneBlueprints'][number]>();
  let durationSeconds = 0;
  let scenePosition = 0;

  plan.characters.forEach((character, index) => {
    validateUniqueId(character.id, 'character', ['characters', index, 'id'], allIds, ctx);
    characterIds.add(character.id);
  });
  plan.continuityThreads.forEach((thread, index) => {
    validateUniqueId(thread.id, 'continuity thread', ['continuityThreads', index, 'id'], allIds, ctx);
    threadIds.add(thread.id);
  });

  plan.acts.forEach((act, actIndex) => {
    validateUniqueId(act.id, 'act', ['acts', actIndex, 'id'], allIds, ctx);
    act.chapters.forEach((chapter, chapterIndex) => {
      const chapterPath = ['acts', actIndex, 'chapters', chapterIndex] as Array<string | number>;
      validateUniqueId(chapter.id, 'chapter', [...chapterPath, 'id'], allIds, ctx);
      chapter.sceneBlueprints.forEach((scene, sceneIndex) => {
        const scenePath = [...chapterPath, 'sceneBlueprints', sceneIndex];
        validateUniqueId(scene.id, 'scene blueprint', [...scenePath, 'id'], allIds, ctx);
        scenePositions.set(scene.id, scenePosition);
        scenesById.set(scene.id, scene);
        scenePosition += 1;
        durationSeconds += scene.durationIntentSeconds;

        scene.requiredCharacterIds.forEach((characterId, characterIndex) => {
          if (!characterIds.has(characterId)) {
            addIssue(
              ctx,
              [...scenePath, 'requiredCharacterIds', characterIndex],
              `Unknown character id "${characterId}".`,
            );
          }
        });
        scene.continuityThreadIds.forEach((threadId, threadIndex) => {
          if (!threadIds.has(threadId)) {
            addIssue(
              ctx,
              [...scenePath, 'continuityThreadIds', threadIndex],
              `Unknown continuity thread id "${threadId}".`,
            );
          }
        });
      });
    });
  });

  if (Math.abs(durationSeconds - plan.targetDurationSeconds) > 0.001) {
    addIssue(
      ctx,
      ['targetDurationSeconds'],
      `Scene blueprint durations total ${durationSeconds}s, expected ${plan.targetDurationSeconds}s.`,
    );
  }

  plan.continuityThreads.forEach((thread, threadIndex) => {
    const path = ['continuityThreads', threadIndex] as Array<string | number>;
    const introducedAt = scenePositions.get(thread.introducedInSceneId);
    if (introducedAt === undefined) {
      addIssue(ctx, [...path, 'introducedInSceneId'], `Unknown scene id "${thread.introducedInSceneId}".`);
      return;
    }
    if (!scenesById.get(thread.introducedInSceneId)?.continuityThreadIds.includes(thread.id)) {
      addIssue(ctx, [...path, 'introducedInSceneId'], 'The introduction scene must reference this continuity thread.');
    }
    if (thread.resolution.policy === 'resolved') {
      const resolvedAt = scenePositions.get(thread.resolution.resolvedInSceneId);
      if (resolvedAt === undefined) {
        addIssue(
          ctx,
          [...path, 'resolution', 'resolvedInSceneId'],
          `Unknown scene id "${thread.resolution.resolvedInSceneId}".`,
        );
      } else {
        if (resolvedAt < introducedAt) {
          addIssue(ctx, [...path, 'resolution'], 'A continuity thread cannot resolve before it is introduced.');
        }
        if (!scenesById.get(thread.resolution.resolvedInSceneId)?.continuityThreadIds.includes(thread.id)) {
          addIssue(ctx, [...path, 'resolution'], 'The resolution scene must reference this continuity thread.');
        }
      }
    }
  });
}

export const ScriptChapterPlanSchema = ScriptChapterPlanObjectSchema.superRefine(
  validateScriptChapterPlan,
);

export type ScriptChapterPlanModelOutput = z.infer<typeof ScriptChapterPlanModelOutputSchema>;
export type ScriptChapterPlan = z.infer<typeof ScriptChapterPlanSchema>;

export class ScriptChapterPlanValidationError extends Error {
  readonly code = 'SCRIPT_CHAPTER_PLAN_INVALID';

  constructor(readonly issues: string[]) {
    super(`Script chapter plan failed validation: ${issues.join(', ')}`);
    this.name = 'ScriptChapterPlanValidationError';
  }
}

export function materializeScriptChapterPlan(
  output: ScriptChapterPlanModelOutput,
): ScriptChapterPlan {
  return ScriptChapterPlanSchema.parse({
    version: SCRIPT_CHAPTER_PLAN_VERSION,
    ...output,
  });
}

export function findScriptChapterPlanExternalIssues(
  plan: ScriptChapterPlan,
  options: {
    expectedTargetDurationSeconds: number;
    sourceLedger: SourceLedger;
  },
): string[] {
  const issues: string[] = [];
  if (Math.abs(plan.targetDurationSeconds - options.expectedTargetDurationSeconds) > 0.001) {
    issues.push(
      `target_duration_mismatch:${plan.targetDurationSeconds}/${options.expectedTargetDurationSeconds}`,
    );
  }

  const allowedSourceRefs = new Set(options.sourceLedger.entries.map((entry) => entry.referenceId));
  plan.acts.forEach((act) => {
    act.chapters.forEach((chapter) => {
      chapter.sceneBlueprints.forEach((scene) => {
        scene.requiredSourceRefs.forEach((sourceRef) => {
          if (!allowedSourceRefs.has(sourceRef)) {
            issues.push(`invalid_source_ref:${scene.id}:${sourceRef}`);
          }
        });
      });
    });
  });
  return issues;
}

export function assertUsableScriptChapterPlan(
  plan: ScriptChapterPlan,
  options: {
    expectedTargetDurationSeconds: number;
    sourceLedger: SourceLedger;
  },
): ScriptChapterPlan {
  const parsed = ScriptChapterPlanSchema.safeParse(plan);
  if (!parsed.success) {
    throw new ScriptChapterPlanValidationError(
      parsed.error.issues.map((issue) => `schema:${issue.path.join('.')}:${issue.message}`),
    );
  }
  const issues = findScriptChapterPlanExternalIssues(parsed.data, options);
  if (issues.length > 0) throw new ScriptChapterPlanValidationError(issues);
  return parsed.data;
}
