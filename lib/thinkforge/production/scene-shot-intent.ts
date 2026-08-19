import { z } from 'zod';

export const PERFORMANCE_STANCES = [
  'seated',
  'standing',
  'walking',
  'floor',
  'custom',
] as const;

export const SHOT_ACTIONS = [
  'talking',
  'walking',
  'gesturing',
  'demonstrating',
  'still',
  'interacting-with-object',
  'other',
] as const;

export const SHOT_FRAMINGS = [
  'extreme-close-up',
  'close-up',
  'medium-close-up',
  'medium',
  'medium-wide',
  'wide',
  'extreme-wide',
  'over-shoulder',
  'insert',
] as const;

export const SHOT_ANGLES = ['eye-level', 'high', 'low', 'overhead', 'dutch'] as const;

export const SHOT_MOVEMENTS = [
  'static',
  'pan',
  'tilt',
  'push-in',
  'pull-out',
  'dolly',
  'orbit',
  'handheld',
  'tracking',
] as const;

const PerformanceIntentModelSchema = z.object({
  characterId: z.string(),
  stance: z.enum(PERFORMANCE_STANCES),
  emotion: z.string(),
  intensity: z.number(),
  gaze: z.string(),
  posture: z.string(),
  gesture: z.string(),
  movement: z.string(),
}).strict();

export const PerformanceIntentSchema = PerformanceIntentModelSchema.extend({
  characterId: z.string().min(1),
  emotion: z.string().min(1),
  intensity: z.number().min(0).max(1),
  gaze: z.string().min(1),
  posture: z.string().min(1),
  gesture: z.string().min(1),
  movement: z.string().min(1),
}).strict();

const SceneShotContinuityModelSchema = z.object({
  wardrobe: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
  screenDirection: z.string().optional(),
  previousSceneIds: z.array(z.string()).default([]),
}).strict();

const SceneShotContinuitySchema = SceneShotContinuityModelSchema.extend({
  wardrobe: z.array(z.string().min(1)).default([]),
  props: z.array(z.string().min(1)).default([]),
  previousSceneIds: z.array(z.string().min(1)).default([]),
}).strict();

export const SceneShotIntentModelObjectSchema = z.object({
  narrativePurpose: z.string(),
  emotionalBeat: z.string(),
  energy: z.number(),
  visualPriority: z.string(),
  action: z.enum(SHOT_ACTIONS),
  desiredFraming: z.enum(SHOT_FRAMINGS),
  desiredAngle: z.enum(SHOT_ANGLES),
  desiredMovement: z.enum(SHOT_MOVEMENTS),
  movementMotivation: z.string().optional(),
  simultaneousPerformers: z.number().int(),
  spokenAudio: z.boolean(),
  performance: z.array(PerformanceIntentModelSchema),
  continuity: SceneShotContinuityModelSchema.default({ wardrobe: [], props: [], previousSceneIds: [] }),
}).strict();

export const SceneShotIntentObjectSchema = SceneShotIntentModelObjectSchema.extend({
  narrativePurpose: z.string().min(1),
  emotionalBeat: z.string().min(1),
  energy: z.number().min(0).max(1),
  visualPriority: z.string().min(1),
  // A static shot has no camera movement to motivate. The canonical contract
  // requires a meaningful value only when the authored camera moves.
  simultaneousPerformers: z.number().int().min(0).max(20),
  performance: z.array(PerformanceIntentSchema).max(20),
  continuity: SceneShotContinuitySchema.default({ wardrobe: [], props: [], previousSceneIds: [] }),
}).strict();

export type SceneShotIntent = z.infer<typeof SceneShotIntentObjectSchema>;

export function addSceneShotIntentIssues(
  intent: SceneShotIntent,
  ctx: z.RefinementCtx,
): void {
  if (intent.desiredMovement !== 'static' && !intent.movementMotivation?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['movementMotivation'],
      message: 'moving-camera intent requires an explicit narrative motivation',
    });
  }

  const performerIds = intent.performance.map((entry) => entry.characterId);
  const uniquePerformerCount = new Set(performerIds).size;
  if (uniquePerformerCount !== performerIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['performance'],
      message: 'performance characterId values must be unique within a scene',
    });
  }
  if (uniquePerformerCount !== intent.simultaneousPerformers) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['simultaneousPerformers'],
      message: 'simultaneousPerformers must equal the number of unique visible performers',
    });
  }
}

export const SceneShotIntentSchema = SceneShotIntentObjectSchema.superRefine(
  addSceneShotIntentIssues,
);

export function parseSceneShotIntent(input: unknown): SceneShotIntent {
  return SceneShotIntentSchema.parse(input);
}
