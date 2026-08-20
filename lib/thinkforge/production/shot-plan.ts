import { z } from 'zod';

import { PRODUCTION_CAPABILITY_PROFILE_VERSION } from './production-capability-profile';

export const SHOT_PLAN_VERSION = 1 as const;
export const SHOT_PLAN_NARRATIVE_STRUCTURE_VERSION = 1 as const;

const Vector3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
}).strict();

const PlanResourceSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['camera', 'support', 'light', 'audio', 'modifier', 'accessory', 'space', 'household']),
  label: z.string().min(1),
  source: z.enum(['owned', 'borrowed', 'natural', 'household', 'rent', 'buy']),
  quantity: z.number().int().min(1).max(100).default(1),
  equipmentId: z.string().min(1).optional(),
  incrementalCost: z.number().finite().min(0).default(0),
  required: z.boolean().default(true),
  notes: z.array(z.string().min(1)).default([]),
}).strict();

const CameraMarkSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  position: Vector3Schema,
  target: Vector3Schema,
  heightM: z.number().finite().positive().optional(),
  orientation: z.enum(['landscape', 'portrait']),
}).strict();

const LightMarkSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  role: z.enum(['key', 'fill', 'rim', 'background', 'practical', 'ambient']),
  position: Vector3Schema,
  target: Vector3Schema.optional(),
  intensityPercent: z.number().min(0).max(100).optional(),
  colorTemperatureK: z.number().int().min(1_000).max(20_000).optional(),
  modifierResourceId: z.string().min(1).optional(),
}).strict();

const PerformerMarkSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  position: Vector3Schema,
  bodyAngleDeg: z.number().finite().min(-180).max(180),
  stance: z.enum(['seated', 'standing', 'walking', 'floor', 'custom']),
}).strict();

const AudioMarkSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  position: Vector3Schema.optional(),
  characterIds: z.array(z.string().min(1)).default([]),
  placementInstruction: z.string().min(1),
}).strict();

const SetupGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  spaceId: z.string().min(1).optional(),
  sceneIds: z.array(z.string().min(1)).min(1),
  setupMinutes: z.number().finite().min(0),
  resetMinutes: z.number().finite().min(0).default(0),
  cameraMarks: z.array(CameraMarkSchema).min(1),
  lightMarks: z.array(LightMarkSchema).default([]),
  performerMarks: z.array(PerformerMarkSchema).default([]),
  audioMarks: z.array(AudioMarkSchema).default([]),
  instructions: z.array(z.string().min(1)).min(1),
}).strict();

const SceneShotSchema = z.object({
  sceneId: z.string().min(1),
  sidecarSceneIndex: z.number().int().min(0),
  generationUnitId: z.string().min(1),
  setupGroupId: z.string().min(1),
  durationSec: z.number().finite().positive(),
  intent: z.object({
    narrativePurpose: z.string().min(1),
    emotionalBeat: z.string().min(1),
    energy: z.number().min(0).max(1),
    visualPriority: z.string().min(1),
  }).strict(),
  camera: z.object({
    markId: z.string().min(1),
    framing: z.enum(['extreme-close-up', 'close-up', 'medium-close-up', 'medium', 'medium-wide', 'wide', 'extreme-wide', 'over-shoulder', 'insert']),
    angle: z.enum(['eye-level', 'high', 'low', 'overhead', 'dutch']),
    movement: z.enum(['static', 'pan', 'tilt', 'push-in', 'pull-out', 'dolly', 'orbit', 'handheld', 'tracking']),
    movementPath: z.array(Vector3Schema).default([]),
    focalLengthEquivalentMm: z.number().finite().positive().optional(),
  }).strict(),
  activeLightMarkIds: z.array(z.string().min(1)).default([]),
  activeAudioMarkIds: z.array(z.string().min(1)).default([]),
  performance: z.array(z.object({
    characterId: z.string().min(1),
    performerMarkId: z.string().min(1),
    emotion: z.string().min(1),
    intensity: z.number().min(0).max(1),
    gaze: z.string().min(1),
    posture: z.string().min(1),
    gesture: z.string().min(1),
    movement: z.string().min(1),
  }).strict()).default([]),
  continuity: z.object({
    wardrobe: z.array(z.string().min(1)).default([]),
    props: z.array(z.string().min(1)).default([]),
    screenDirection: z.string().optional(),
    previousSceneIds: z.array(z.string().min(1)).default([]),
  }).strict().default({
    wardrobe: [],
    props: [],
    previousSceneIds: [],
  }),
  fallback: z.object({
    framing: z.string().min(1),
    instruction: z.string().min(1),
    reason: z.string().min(1),
  }).strict().optional(),
}).strict();

const NarrativeStructureSceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  narrativePurpose: z.string().min(1),
  shootSceneIds: z.array(z.string().min(1)).min(1),
}).strict();

const NarrativeStructureChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  narrativePurpose: z.string().min(1),
  narrativeScenes: z.array(NarrativeStructureSceneSchema).min(1),
}).strict();

const NarrativeStructureSchema = z.object({
  version: z.number().int().default(SHOT_PLAN_NARRATIVE_STRUCTURE_VERSION),
  acts: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    narrativePurpose: z.string().min(1),
    chapters: z.array(NarrativeStructureChapterSchema).min(1),
  }).strict()).min(1),
}).strict();

export const ShotPlanSchema = z.object({
  version: z.number().int().default(SHOT_PLAN_VERSION),
  capabilityProfileVersion: z.number().int().default(PRODUCTION_CAPABILITY_PROFILE_VERSION),
  capabilityProfileId: z.string().min(1).optional(),
  sourceSidecarVersion: z.number().int().min(1),
  tier: z.enum(['no-spend', 'minimum-upgrade', 'enhanced']),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  coordinateSystem: z.object({
    unit: z.enum(['meters', 'normalized']),
    origin: z.enum(['room-center', 'camera-origin']),
    xAxis: z.literal('camera-right'),
    yAxis: z.literal('up'),
    zAxis: z.literal('toward-background'),
  }).strict(),
  resources: z.array(PlanResourceSchema),
  setupGroups: z.array(SetupGroupSchema).min(1),
  scenes: z.array(SceneShotSchema).min(1),
  narrativeStructure: NarrativeStructureSchema.optional(),
  shootOrder: z.array(z.string().min(1)).min(1),
  totalIncrementalCost: z.number().finite().min(0),
  totalSetupMinutes: z.number().finite().min(0),
  knowledgeRefs: z.array(z.string().min(1)).default([]),
  optimization: z.object({
    version: z.number().int().min(1),
    objectives: z.array(z.enum(['feasibility', 'continuity', 'cost', 'setup-time'])).min(1),
    originalSceneOrder: z.array(z.string().min(1)).min(1),
    setupChangeCount: z.number().int().min(0),
    locationChangeCount: z.number().int().min(0),
    resourceChangeCount: z.number().int().min(0),
    baselineSetupMinutes: z.number().finite().min(0),
    optimizedSetupMinutes: z.number().finite().min(0),
    savedSetupMinutes: z.number().finite().min(0),
    reasons: z.array(z.string().min(1)).min(1),
  }).strict().optional(),
  feasibility: z.object({
    status: z.enum(['ready', 'ready-with-assumptions']),
    score: z.number().min(0).max(1),
    assumptions: z.array(z.string().min(1)).default([]),
    warnings: z.array(z.string().min(1)).default([]),
  }).strict(),
  upgradeOptions: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    benefit: z.string().min(1),
    affectedSceneIds: z.array(z.string().min(1)).min(1),
    incrementalCost: z.number().finite().positive(),
    resourceLabels: z.array(z.string().min(1)).min(1),
  }).strict()).default([]),
}).strict().superRefine((plan, ctx) => {
  if (plan.version !== SHOT_PLAN_VERSION) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['version'], message: `unsupported shot plan version: ${plan.version}` });
  }
  if (plan.capabilityProfileVersion !== PRODUCTION_CAPABILITY_PROFILE_VERSION) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capabilityProfileVersion'], message: 'unsupported capability profile version' });
  }

  const resourceIds = new Set<string>();
  plan.resources.forEach((resource, index) => {
    if (resourceIds.has(resource.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resources', index, 'id'], message: `duplicate resource id: ${resource.id}` });
    }
    resourceIds.add(resource.id);
    if (resource.source === 'owned' || resource.source === 'borrowed' || resource.source === 'natural' || resource.source === 'household') {
      if (resource.incrementalCost !== 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['resources', index, 'incrementalCost'], message: 'non-paid resources must have zero incremental cost' });
      }
    }
  });

  const setupById = new Map(plan.setupGroups.map((setup) => [setup.id, setup]));
  const sceneById = new Map(plan.scenes.map((scene) => [scene.sceneId, scene]));
  if (sceneById.size !== plan.scenes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: 'scene ids must be unique' });
  }
  if (plan.narrativeStructure) {
    if (plan.narrativeStructure.version !== SHOT_PLAN_NARRATIVE_STRUCTURE_VERSION) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['narrativeStructure', 'version'], message: 'unsupported narrative structure version' });
    }
    const hierarchicalShootSceneIds = plan.narrativeStructure.acts.flatMap((act) => act.chapters.flatMap(
      (chapter) => chapter.narrativeScenes.flatMap((scene) => scene.shootSceneIds),
    ));
    const hierarchyIds = new Set(hierarchicalShootSceneIds);
    if (
      hierarchyIds.size !== hierarchicalShootSceneIds.length
      || hierarchyIds.size !== sceneById.size
      || [...hierarchyIds].some((sceneId) => !sceneById.has(sceneId))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['narrativeStructure'],
        message: 'narrativeStructure must map every Shoot Kit scene exactly once',
      });
    }
  }
  if (setupById.size !== plan.setupGroups.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['setupGroups'], message: 'setup group ids must be unique' });
  }

  plan.setupGroups.forEach((setup, setupIndex) => {
    const cameraMarkIds = new Set(setup.cameraMarks.map((mark) => mark.id));
    const lightMarkIds = new Set(setup.lightMarks.map((mark) => mark.id));
    const audioMarkIds = new Set(setup.audioMarks.map((mark) => mark.id));
    const performerMarkIds = new Set(setup.performerMarks.map((mark) => mark.id));
    const marks = [...setup.cameraMarks, ...setup.lightMarks, ...setup.audioMarks];
    marks.forEach((mark, markIndex) => {
      if (!resourceIds.has(mark.resourceId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['setupGroups', setupIndex, 'marks', markIndex, 'resourceId'], message: `unknown resource id: ${mark.resourceId}` });
      }
    });
    setup.lightMarks.forEach((mark, markIndex) => {
      if (mark.modifierResourceId && !resourceIds.has(mark.modifierResourceId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['setupGroups', setupIndex, 'lightMarks', markIndex, 'modifierResourceId'], message: `unknown modifier resource id: ${mark.modifierResourceId}` });
      }
    });

    setup.sceneIds.forEach((sceneId, sceneIndex) => {
      const scene = sceneById.get(sceneId);
      if (!scene || scene.setupGroupId !== setup.id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['setupGroups', setupIndex, 'sceneIds', sceneIndex], message: `scene ${sceneId} does not resolve back to setup ${setup.id}` });
      }
    });

    plan.scenes.filter((scene) => scene.setupGroupId === setup.id).forEach((scene) => {
      if (!cameraMarkIds.has(scene.camera.markId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: `scene ${scene.sceneId} references unknown camera mark ${scene.camera.markId}` });
      }
      scene.activeLightMarkIds.forEach((id) => {
        if (!lightMarkIds.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: `scene ${scene.sceneId} references unknown light mark ${id}` });
      });
      scene.activeAudioMarkIds.forEach((id) => {
        if (!audioMarkIds.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: `scene ${scene.sceneId} references unknown audio mark ${id}` });
      });
      scene.performance.forEach((performance) => {
        if (!performerMarkIds.has(performance.performerMarkId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes'], message: `scene ${scene.sceneId} references unknown performer mark ${performance.performerMarkId}` });
      });
    });
  });

  plan.scenes.forEach((scene, index) => {
    const setup = setupById.get(scene.setupGroupId);
    if (!setup || !setup.sceneIds.includes(scene.sceneId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scenes', index, 'setupGroupId'], message: `setup ${scene.setupGroupId} does not include scene ${scene.sceneId}` });
    }
  });

  const shootOrder = new Set(plan.shootOrder);
  if (shootOrder.size !== plan.shootOrder.length || shootOrder.size !== plan.scenes.length || plan.scenes.some((scene) => !shootOrder.has(scene.sceneId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shootOrder'], message: 'shootOrder must contain every scene exactly once' });
  }

  const resourceCost = plan.resources.reduce((sum, resource) => sum + resource.incrementalCost, 0);
  if (Math.abs(resourceCost - plan.totalIncrementalCost) > 0.01) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalIncrementalCost'], message: 'totalIncrementalCost must equal the resource cost total' });
  }
  if (plan.tier === 'no-spend' && (plan.totalIncrementalCost !== 0 || plan.resources.some((resource) => resource.source === 'rent' || resource.source === 'buy'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tier'], message: 'no-spend plans cannot rent, buy, or carry incremental cost' });
  }
});

export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export function parseShotPlan(input: unknown): ShotPlan {
  return ShotPlanSchema.parse(input);
}
