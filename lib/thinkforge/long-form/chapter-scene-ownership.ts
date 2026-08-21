import {
  ScriptChapterPlanSchema,
  type ScriptChapterPlan,
} from '../schemas/script-chapter-plan';

export type LongFormSceneOwner = {
  act: ScriptChapterPlan['acts'][number];
  chapter: ScriptChapterPlan['acts'][number]['chapters'][number];
};

export type LongFormChapterSceneOwnership = {
  plan: ScriptChapterPlan;
  ownerByNarrativeSceneId: Map<string, LongFormSceneOwner>;
};

export type LongFormChapterSceneOwnershipErrorCode =
  | 'long_form_chapter_plan_invalid'
  | 'long_form_scene_unmapped'
  | 'long_form_act_mismatch'
  | 'long_form_scene_missing';

export class LongFormChapterSceneOwnershipError extends Error {
  constructor(
    readonly code: LongFormChapterSceneOwnershipErrorCode,
    message: string,
    readonly sceneId?: string,
  ) {
    super(message);
    this.name = 'LongFormChapterSceneOwnershipError';
  }
}

type NarrativeSceneOwnerInput = {
  id: string;
  title: string;
};

type NarrativeActOwnerInput = {
  id: string;
  narrativeScenes: readonly NarrativeSceneOwnerInput[];
};

/**
 * Resolves the durable long-form chapter hierarchy against a materialized
 * sidecar. It owns scene-to-chapter identity only; it does not plan form.
 */
export function resolveLongFormChapterSceneOwnership(input: {
  chapterPlan: unknown | undefined;
  acts: readonly NarrativeActOwnerInput[];
}): LongFormChapterSceneOwnership | null {
  if (input.chapterPlan === undefined) return null;

  const parsed = ScriptChapterPlanSchema.safeParse(input.chapterPlan);
  if (!parsed.success) {
    throw new LongFormChapterSceneOwnershipError(
      'long_form_chapter_plan_invalid',
      'This long-form script has an invalid chapter plan and cannot safely create a production plan.',
    );
  }

  const ownerByNarrativeSceneId = new Map<string, LongFormSceneOwner>();
  parsed.data.acts.forEach((act) => act.chapters.forEach((chapter) => chapter.sceneBlueprints.forEach((scene) => {
    ownerByNarrativeSceneId.set(scene.id, { act, chapter });
  })));

  const sidecarSceneIds = new Set<string>();
  for (const act of input.acts) {
    for (const scene of act.narrativeScenes) {
      sidecarSceneIds.add(scene.id);
      const owner = ownerByNarrativeSceneId.get(scene.id);
      if (!owner) {
        throw new LongFormChapterSceneOwnershipError(
          'long_form_scene_unmapped',
          `Long-form scene "${scene.title}" is not owned by the saved chapter plan.`,
          scene.id,
        );
      }
      if (owner.act.id !== act.id) {
        throw new LongFormChapterSceneOwnershipError(
          'long_form_act_mismatch',
          `Long-form scene "${scene.title}" no longer belongs to its saved act.`,
          scene.id,
        );
      }
    }
  }

  const missingSceneId = [...ownerByNarrativeSceneId.keys()].find((sceneId) => !sidecarSceneIds.has(sceneId));
  if (missingSceneId) {
    throw new LongFormChapterSceneOwnershipError(
      'long_form_scene_missing',
      `The saved chapter plan expects scene "${missingSceneId}", but it is absent from the production sidecar.`,
      missingSceneId,
    );
  }

  return { plan: parsed.data, ownerByNarrativeSceneId };
}
