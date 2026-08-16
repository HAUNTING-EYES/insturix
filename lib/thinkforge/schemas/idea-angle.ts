import { z } from 'zod';

export const THINKFORGE_IDEA_ANGLE_VERSION = 1;

/**
 * Creative intent selected during ideation. Deliverable, platform, production,
 * brand, and evidence authority remain owned by their existing contracts.
 */
export const ThinkForgeIdeaAngleSchema = z.object({
  version: z.number().int().min(1).max(THINKFORGE_IDEA_ANGLE_VERSION)
    .default(THINKFORGE_IDEA_ANGLE_VERSION),
  ideaId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  strategicPurpose: z.string().trim().min(1).max(2_000),
  creativeTreatment: z.string().trim().min(1).max(1_000),
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
