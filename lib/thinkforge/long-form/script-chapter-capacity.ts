import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import {
  resolveScriptGenerationFeasibility,
  type ScriptGenerationFeasibility,
} from '../agents/script-writer-agent';
import type { ThinkForgeContentSignalProfile } from '../signals';
import type { ScriptChapterPlan } from '../schemas/script-chapter-plan';

export const SCRIPT_CHAPTER_WRITE_CAPACITY_VERSION = 1 as const;

export interface ScriptChapterWriteCapacityConflict {
  actId: string;
  chapterId: string;
  chapterTitle: string;
  targetDurationSeconds: number;
  feasibility: Extract<ScriptGenerationFeasibility, { mode: 'chaptered_required' }>;
}

/**
 * Provider-envelope assessment for an already-approved narrative chapter.
 * It deliberately reads the chapter plan instead of shaping it: the master
 * planner remains the sole owner of acts, chapters, scenes, and pacing.
 */
export function findScriptChapterWriteCapacityConflicts(input: {
  plan: ScriptChapterPlan;
  productionBrief: ProductionBrief;
  contentSignalProfile?: ThinkForgeContentSignalProfile | null;
}): ScriptChapterWriteCapacityConflict[] {
  const conflicts: ScriptChapterWriteCapacityConflict[] = [];

  for (const act of input.plan.acts) {
    for (const chapter of act.chapters) {
      const targetDurationSeconds = chapter.sceneBlueprints.reduce(
        (total, scene) => total + scene.durationIntentSeconds,
        0,
      );
      const feasibility = resolveScriptGenerationFeasibility({
        productionBrief: {
          ...input.productionBrief,
          output: {
            ...input.productionBrief.output,
            targetDurationSec: targetDurationSeconds,
          },
        },
        contentSignalProfile: input.contentSignalProfile,
      });

      if (feasibility.mode === 'chaptered_required') {
        conflicts.push({
          actId: act.id,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          targetDurationSeconds,
          feasibility,
        });
      }
    }
  }

  return conflicts;
}
