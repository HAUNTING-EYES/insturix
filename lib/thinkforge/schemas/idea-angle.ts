import { z } from 'zod';

export const THINKFORGE_IDEA_ANGLE_VERSION = 1;
export const THINKFORGE_IDEA_ANGLE_ID_MAX_CHARS = 120;
export const THINKFORGE_IDEA_ANGLE_TITLE_MAX_CHARS = 120;
export const THINKFORGE_IDEA_ANGLE_PURPOSE_MAX_CHARS = 2_000;
export const THINKFORGE_IDEA_ANGLE_TREATMENT_MAX_CHARS = 1_000;

/**
 * Creative intent selected during ideation. Deliverable, platform, production,
 * brand, and evidence authority remain owned by their existing contracts.
 */
export const ThinkForgeIdeaAngleSchema = z.object({
  version: z.number().int().min(1).max(THINKFORGE_IDEA_ANGLE_VERSION)
    .default(THINKFORGE_IDEA_ANGLE_VERSION),
  ideaId: z.string().trim().min(1).max(THINKFORGE_IDEA_ANGLE_ID_MAX_CHARS),
  title: z.string().trim().min(1).max(THINKFORGE_IDEA_ANGLE_TITLE_MAX_CHARS),
  strategicPurpose: z.string().trim().min(1).max(THINKFORGE_IDEA_ANGLE_PURPOSE_MAX_CHARS),
  creativeTreatment: z.string().trim().min(1).max(THINKFORGE_IDEA_ANGLE_TREATMENT_MAX_CHARS),
}).strict();

export type ThinkForgeIdeaAngle = z.infer<typeof ThinkForgeIdeaAngleSchema>;

export function buildThinkForgeIdeaAngle(
  input: Omit<ThinkForgeIdeaAngle, 'version'>,
): ThinkForgeIdeaAngle {
  return ThinkForgeIdeaAngleSchema.parse({
    version: THINKFORGE_IDEA_ANGLE_VERSION,
    ...input,
  });
}
