import { z } from 'zod';

import { hashJsonArtifact } from '../persistence/script-sidecar-binding';
import { ProductionCapabilityProfileSchema } from '../production/production-capability-profile';
import { estimateSetupMinutes } from '../production/production-knowledge';
import { PhysicalCaptureDesignSchema } from './physical-capture-design';

export const TECHNICAL_CAPTURE_PLAN_VERSION = 2 as const;
export const TECHNICAL_CAPTURE_PLAN_METADATA_KEY = 'technicalCapturePlan' as const;

const IdSchema = z.string().trim().min(1).max(240);
const TextSchema = z.string().trim().min(1).max(1_200);
const TextListSchema = z.array(TextSchema).max(24).default([]);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const AspectRatioSchema = z.enum(['16:9', '9:16', '1:1', '4:5']);
const OrientationSchema = z.enum(['landscape', 'portrait']);
const CameraOperationSchema = z.enum(['fixed-support', 'operator-held', 'supported-movement']);
export const CaptureCalibrationCategorySchema = z.enum([
  'framing',
  'focus',
  'stability',
  'movement-safety',
  'lighting',
  'sound',
  'performance',
  'continuity',
  'safety',
]);

const CalibrationCheckModelSchema = z.object({
  category: CaptureCalibrationCategorySchema,
  instruction: TextSchema,
  passCondition: TextSchema,
}).strict();

const TechnicalCaptureSetupModelFields = {
  coverageIntentIds: z.array(IdSchema).min(1).max(32),
  cameraId: IdSchema,
  spaceId: IdSchema,
  supportIds: z.array(IdSchema).max(8).default([]),
  lightIds: z.array(IdSchema).max(12).default([]),
  naturalLightSourceIds: z.array(IdSchema).max(8).default([]),
  modifierIds: z.array(IdSchema).max(8).default([]),
  audioId: IdSchema.optional(),
  accessoryIds: z.array(IdSchema).max(12).default([]),
  orientation: OrientationSchema,
  cameraOperation: CameraOperationSchema,
  framingInstruction: TextSchema,
  viewpointInstruction: TextSchema,
  cameraBehaviorInstruction: TextSchema,
  focusInstruction: TextSchema,
  lightingInstruction: TextSchema,
  soundInstruction: TextSchema,
  performanceInstruction: TextSchema.optional(),
  safetyInstructions: TextListSchema,
  calibrationChecks: z.array(CalibrationCheckModelSchema).min(1).max(24),
} as const;

const TechnicalCaptureSetupModelSchema = z.object(TechnicalCaptureSetupModelFields).strict();

export const TechnicalCapturePlanModelOutputSchema = z.object({
  overallApproach: TextSchema,
  setups: z.array(TechnicalCaptureSetupModelSchema).min(1).max(32),
  unresolvedQuestions: TextListSchema,
  knowledgeRefs: z.array(IdSchema).max(64).default([]),
}).strict();

const TechnicalCaptureSetupSchema = z.object({
  id: IdSchema,
  ...TechnicalCaptureSetupModelFields,
  estimatedSetupMinutes: z.number().int().nonnegative(),
  calibrationChecks: z.array(CalibrationCheckModelSchema.extend({ id: IdSchema }).strict()).min(1).max(24),
}).strict();

const TechnicalCapturePlanBodySchema = z.object({
  version: z.literal(TECHNICAL_CAPTURE_PLAN_VERSION).default(TECHNICAL_CAPTURE_PLAN_VERSION),
  kind: z.literal('technical-capture-plan'),
  planId: IdSchema,
  sourceDesign: z.object({ designId: IdSchema, designHash: HashSchema }).strict(),
  sourceDocument: z.object({
    version: z.number().int().positive(),
    contentHash: HashSchema,
    sidecarHash: HashSchema,
    sourceLedgerHash: HashSchema,
  }).strict(),
  capabilityProfile: z.object({ profileId: IdSchema.optional(), profileHash: HashSchema }).strict(),
  settings: z.object({ aspectRatio: AspectRatioSchema }).strict(),
  knowledge: z.object({
    adapterVersion: z.number().int().positive(),
    graphVersion: IdSchema,
    evidenceIds: z.array(IdSchema).max(64),
  }).strict(),
  overallApproach: TextSchema,
  setups: z.array(TechnicalCaptureSetupSchema).min(1).max(32),
  totalEstimatedSetupMinutes: z.number().int().nonnegative(),
  setupChangeCount: z.number().int().nonnegative(),
  locationChangeCount: z.number().int().nonnegative(),
  totalIncrementalCost: z.number().finite().min(0),
  unresolvedQuestions: TextListSchema,
  knowledgeRefs: z.array(IdSchema).max(64),
}).strict();

export const TechnicalCapturePlanSchema = TechnicalCapturePlanBodySchema.safeExtend({
  planHash: HashSchema,
}).strict();

export type TechnicalCapturePlanModelOutput = z.infer<typeof TechnicalCapturePlanModelOutputSchema>;
export type TechnicalCapturePlan = z.infer<typeof TechnicalCapturePlanSchema>;

export class TechnicalCapturePlanError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Technical capture plan failed validation: ${issues.join(', ')}`);
    this.name = 'TechnicalCapturePlanError';
  }
}

export function verifyTechnicalCapturePlanIntegrity(
  input: unknown,
): { valid: true; plan: TechnicalCapturePlan } | { valid: false; reason: 'plan_invalid' | 'plan_hash_mismatch' } {
  const parsed = TechnicalCapturePlanSchema.safeParse(input);
  if (!parsed.success) return { valid: false, reason: 'plan_invalid' };
  const { planHash, ...body } = parsed.data;
  if (hashJsonArtifact(body) !== planHash) return { valid: false, reason: 'plan_hash_mismatch' };
  return { valid: true, plan: parsed.data };
}

export function verifyCurrentTechnicalCapturePlan(input: {
  plan: unknown;
  design: unknown;
  profile: unknown;
  aspectRatio: unknown;
}): { current: true; plan: TechnicalCapturePlan } | { current: false; reason: string } {
  const integrity = verifyTechnicalCapturePlanIntegrity(input.plan);
  if (!integrity.valid) return { current: false, reason: integrity.reason };
  const design = PhysicalCaptureDesignSchema.safeParse(input.design);
  if (!design.success) return { current: false, reason: 'source_design_invalid' };
  const profile = ProductionCapabilityProfileSchema.safeParse(input.profile);
  if (!profile.success) return { current: false, reason: 'capability_profile_invalid' };
  const aspectRatio = AspectRatioSchema.safeParse(input.aspectRatio);
  if (!aspectRatio.success) return { current: false, reason: 'aspect_ratio_invalid' };
  if (
    integrity.plan.sourceDesign.designId !== design.data.designId
    || integrity.plan.sourceDesign.designHash !== design.data.designHash
  ) {
    return { current: false, reason: 'source_design_mismatch' };
  }
  if (integrity.plan.capabilityProfile.profileHash !== hashJsonArtifact(profile.data)) {
    return { current: false, reason: 'capability_profile_mismatch' };
  }
  if (integrity.plan.settings.aspectRatio !== aspectRatio.data) {
    return { current: false, reason: 'aspect_ratio_mismatch' };
  }
  return { current: true, plan: integrity.plan };
}

export function materializeTechnicalCapturePlan(input: {
  design: unknown;
  profile: unknown;
  aspectRatio: z.input<typeof AspectRatioSchema>;
  knowledge: { adapterVersion: number; graphVersion: string; evidenceIds: string[] };
  modelOutput: unknown;
}): TechnicalCapturePlan {
  const design = PhysicalCaptureDesignSchema.parse(input.design);
  const profile = ProductionCapabilityProfileSchema.parse(input.profile);
  const aspectRatio = AspectRatioSchema.parse(input.aspectRatio);
  const knowledge = TechnicalCapturePlanBodySchema.shape.knowledge.parse(input.knowledge);
  const modelOutput = TechnicalCapturePlanModelOutputSchema.parse(input.modelOutput);
  const intentById = new Map(design.coverageIntents.map((intent) => [intent.id, intent]));
  const equipmentById = new Map(profile.equipment.map((item) => [item.id, item]));
  const spaceById = new Map(profile.spaces.map((space) => [space.id, space]));
  const coveredIntentIds = new Set<string>();
  const selectedEquipmentIds = new Set<string>();
  const estimatedSetupMinutes: number[] = [];
  const issues: string[] = [];

  modelOutput.setups.forEach((setup, index) => {
    const prefix = `setup:${index}`;
    const intents = setup.coverageIntentIds.flatMap((intentId) => {
      const intent = intentById.get(intentId);
      if (!intent) issues.push(`${prefix}:unknown_coverage_intent:${intentId}`);
      if (coveredIntentIds.has(intentId)) issues.push(`${prefix}:duplicate_coverage_intent:${intentId}`);
      coveredIntentIds.add(intentId);
      return intent ? [intent] : [];
    });
    const required = new Set(intents.flatMap((intent) => intent.requiredCapabilities));
    validateEquipment(setup.cameraId, 'camera', equipmentById, selectedEquipmentIds, issues, prefix);
    const camera = equipmentById.get(setup.cameraId);
    if (camera?.category === 'camera' && !camera.orientations.includes(setup.orientation)) {
      issues.push(`${prefix}:unsupported_orientation:${setup.cameraId}:${setup.orientation}`);
    }
    const space = spaceById.get(setup.spaceId);
    if (!space) issues.push(`${prefix}:unknown_space:${setup.spaceId}`);
    setup.supportIds.forEach((id) => validateEquipment(id, 'support', equipmentById, selectedEquipmentIds, issues, prefix));
    setup.lightIds.forEach((id) => validateEquipment(id, 'light', equipmentById, selectedEquipmentIds, issues, prefix));
    setup.modifierIds.forEach((id) => validateEquipment(id, 'modifier', equipmentById, selectedEquipmentIds, issues, prefix));
    setup.accessoryIds.forEach((id) => validateEquipment(id, 'accessory', equipmentById, selectedEquipmentIds, issues, prefix));
    if (setup.audioId) validateEquipment(setup.audioId, 'audio', equipmentById, selectedEquipmentIds, issues, prefix);
    const naturalLightIds = new Set(space?.naturalLightSources.map((light) => light.id) ?? []);
    setup.naturalLightSourceIds.forEach((id) => {
      if (!naturalLightIds.has(id)) issues.push(`${prefix}:unknown_natural_light:${id}`);
    });
    validateOperation(setup, profile, equipmentById, issues, prefix);
    if (required.has('performer') && profile.people.performersAvailable < 1) issues.push(`${prefix}:performer_unavailable`);
    if (required.has('audio') && !setup.audioId) issues.push(`${prefix}:audio_required`);
    if (required.has('lighting') && setup.lightIds.length + setup.naturalLightSourceIds.length === 0) {
      issues.push(`${prefix}:lighting_required`);
    }
    if (required.has('performer') && !setup.performanceInstruction) issues.push(`${prefix}:performance_instruction_required`);
    const categories = new Set(setup.calibrationChecks.map((check) => check.category));
    requiredCalibrationCategories(required, setup.cameraOperation).forEach((category) => {
      if (!categories.has(category)) issues.push(`${prefix}:calibration_check_missing:${category}`);
    });
    if (categories.size !== setup.calibrationChecks.length) issues.push(`${prefix}:duplicate_calibration_category`);
    const setupMinutes = estimateSetupMinutes({
      lightCount: setup.lightIds.length + setup.naturalLightSourceIds.length,
      audioCount: setup.audioId ? 1 : 0,
      movingCamera: setup.cameraOperation !== 'fixed-support',
      householdSubstitutionCount: 0,
    });
    estimatedSetupMinutes.push(setupMinutes);
    if (profile.constraints.maxSetupMinutes !== undefined
      && setupMinutes > profile.constraints.maxSetupMinutes) {
      issues.push(`${prefix}:setup_time_limit_exceeded`);
    }
  });
  design.coverageIntents.forEach((intent) => {
    if (!coveredIntentIds.has(intent.id)) issues.push(`unplanned_coverage_intent:${intent.id}`);
  });
  modelOutput.knowledgeRefs.forEach((id) => {
    if (!knowledge.evidenceIds.includes(id)) issues.push(`undeclared_knowledge_ref:${id}`);
  });
  const totalIncrementalCost = [...selectedEquipmentIds].reduce(
    (sum, id) => sum + (equipmentById.get(id)?.estimatedIncrementalCost ?? 0),
    0,
  );
  if (totalIncrementalCost > profile.constraints.maxIncrementalSpend) issues.push('incremental_spend_exceeded');
  const setupChangeCount = Math.max(0, modelOutput.setups.length - 1);
  const locationChangeCount = modelOutput.setups.slice(1).reduce(
    (count, setup, index) => count + Number(setup.spaceId !== modelOutput.setups[index]?.spaceId),
    0,
  );
  if (profile.constraints.maxSetupChanges !== undefined
    && setupChangeCount > profile.constraints.maxSetupChanges) {
    issues.push('setup_change_limit_exceeded');
  }
  if (locationChangeCount > profile.constraints.maxLocationChanges) {
    issues.push('location_change_limit_exceeded');
  }
  validateAspectOrientation(aspectRatio, modelOutput, issues);
  if (issues.length > 0) throw new TechnicalCapturePlanError([...new Set(issues)]);

  const identity = hashJsonArtifact({ design, profile, aspectRatio, knowledge, modelOutput });
  const body = TechnicalCapturePlanBodySchema.parse({
    version: TECHNICAL_CAPTURE_PLAN_VERSION,
    kind: 'technical-capture-plan',
    planId: `technical_capture_${identity.slice(0, 20)}`,
    sourceDesign: { designId: design.designId, designHash: design.designHash },
    sourceDocument: design.sourceDocument,
    capabilityProfile: { profileId: profile.profileId, profileHash: hashJsonArtifact(profile) },
    settings: { aspectRatio },
    knowledge,
    overallApproach: modelOutput.overallApproach,
    setups: modelOutput.setups.map((setup, setupIndex) => ({
      id: `setup_${setupIndex + 1}`,
      ...setup,
      estimatedSetupMinutes: estimatedSetupMinutes[setupIndex],
      calibrationChecks: setup.calibrationChecks.map((check) => ({
        id: `setup_${setupIndex + 1}_check_${check.category}`,
        ...check,
      })),
    })),
    totalEstimatedSetupMinutes: estimatedSetupMinutes.reduce((sum, minutes) => sum + minutes, 0),
    setupChangeCount,
    locationChangeCount,
    totalIncrementalCost,
    unresolvedQuestions: [...new Set([
      ...design.unresolvedQuestions,
      ...modelOutput.unresolvedQuestions,
    ])],
    knowledgeRefs: [...new Set(modelOutput.knowledgeRefs)],
  });
  return TechnicalCapturePlanSchema.parse({ ...body, planHash: hashJsonArtifact(body) });
}

function validateEquipment(
  id: string,
  category: string,
  equipment: Map<string, z.infer<typeof ProductionCapabilityProfileSchema>['equipment'][number]>,
  selected: Set<string>,
  issues: string[],
  prefix: string,
) {
  const item = equipment.get(id);
  if (!item || item.category !== category) issues.push(`${prefix}:invalid_${category}:${id}`);
  else selected.add(id);
}

function validateOperation(
  setup: z.infer<typeof TechnicalCaptureSetupModelSchema>,
  profile: z.infer<typeof ProductionCapabilityProfileSchema>,
  equipment: Map<string, z.infer<typeof ProductionCapabilityProfileSchema>['equipment'][number]>,
  issues: string[],
  prefix: string,
) {
  if (setup.cameraOperation === 'fixed-support' && setup.supportIds.length === 0) issues.push(`${prefix}:stable_support_required`);
  if (setup.cameraOperation === 'supported-movement') {
    const supportsMovement = setup.supportIds.some((id) => {
      const item = equipment.get(id);
      return item?.category === 'support' && ['gimbal', 'slider', 'shoulder-rig'].includes(item.kind);
    });
    if (!supportsMovement) issues.push(`${prefix}:movement_support_required`);
  }
  if (setup.cameraOperation !== 'fixed-support'
    && profile.people.cameraOperatorsAvailable < 1
    && !profile.people.selfShoot) issues.push(`${prefix}:camera_operator_required`);
}

function requiredCalibrationCategories(required: Set<string>, operation: string) {
  const categories = new Set<z.infer<typeof CaptureCalibrationCategorySchema>>([
    'framing', 'focus', 'stability', 'continuity', 'safety',
  ]);
  if (operation !== 'fixed-support') categories.add('movement-safety');
  if (required.has('lighting')) categories.add('lighting');
  if (required.has('audio')) categories.add('sound');
  if (required.has('performer')) categories.add('performance');
  return categories;
}

function validateAspectOrientation(
  aspectRatio: z.infer<typeof AspectRatioSchema>,
  output: TechnicalCapturePlanModelOutput,
  issues: string[],
) {
  const expected = aspectRatio === '16:9' ? 'landscape' : aspectRatio === '1:1' ? null : 'portrait';
  if (expected) output.setups.forEach((setup, index) => {
    if (setup.orientation !== expected) issues.push(`setup:${index}:aspect_orientation_mismatch`);
  });
}
