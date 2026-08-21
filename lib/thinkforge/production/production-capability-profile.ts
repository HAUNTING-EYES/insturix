import { z } from 'zod';

export const PRODUCTION_CAPABILITY_PROFILE_VERSION = 1 as const;

const PositiveCountSchema = z.number().int().min(1).max(100);
const EquipmentBaseShape = {
  id: z.string().min(1),
  label: z.string().min(1),
  quantity: PositiveCountSchema.default(1),
  availability: z.enum(['owned', 'borrowed', 'rental-approved', 'purchase-approved']),
  preferred: z.boolean().default(false),
  estimatedIncrementalCost: z.number().finite().min(0).default(0),
  costBasis: z.enum(['none', 'one-time', 'per-shoot']).default('none'),
  notes: z.array(z.string().min(1)).default([]),
};

export const ProductionSpaceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  dimensionsM: z.object({
    width: z.number().finite().positive().max(100),
    depth: z.number().finite().positive().max(100),
    height: z.number().finite().positive().max(20).optional(),
  }).strict().optional(),
  usableDepthM: z.number().finite().positive().max(100).optional(),
  backgrounds: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    widthM: z.number().finite().positive().optional(),
    movable: z.boolean().default(false),
  }).strict()).default([]),
  naturalLightSources: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(['window', 'doorway', 'skylight']),
    direction: z.enum(['north', 'south', 'east', 'west', 'unknown']).default('unknown'),
    controllable: z.boolean().default(false),
    notes: z.string().optional(),
  }).strict()).default([]),
  powerAvailable: z.boolean().default(true),
  noiseFloor: z.enum(['quiet', 'moderate', 'noisy', 'unknown']).default('unknown'),
  constraints: z.array(z.string().min(1)).default([]),
}).strict();

export const ProductionEquipmentSchema = z.discriminatedUnion('category', [
  z.object({
    ...EquipmentBaseShape,
    category: z.literal('camera'),
    kind: z.enum(['phone', 'webcam', 'mirrorless', 'dslr', 'cinema', 'action-camera']),
    focalLengthEquivalentMm: z.object({
      min: z.number().finite().positive(),
      max: z.number().finite().positive(),
    }).strict().refine((range) => range.max >= range.min, { message: 'max must be at least min' }).optional(),
    orientations: z.array(z.enum(['landscape', 'portrait'])).min(1).default(['landscape', 'portrait']),
    stabilization: z.array(z.enum(['none', 'optical', 'electronic', 'tripod', 'gimbal'])).default(['none']),
  }).strict(),
  z.object({
    ...EquipmentBaseShape,
    category: z.literal('support'),
    kind: z.enum(['tripod', 'light-stand', 'phone-clamp', 'gimbal', 'slider', 'shoulder-rig', 'tabletop-stand']),
    maxHeightM: z.number().finite().positive().optional(),
  }).strict(),
  z.object({
    ...EquipmentBaseShape,
    category: z.literal('light'),
    kind: z.enum(['led-panel', 'ring-light', 'softbox', 'tube', 'bulb', 'practical']),
    dimmable: z.boolean().default(false),
    colorTemperatureK: z.object({
      min: z.number().int().min(1_000).max(20_000),
      max: z.number().int().min(1_000).max(20_000),
    }).strict().refine((range) => range.max >= range.min, {
      message: 'maximum color temperature must be at least the minimum',
    }).optional(),
    batteryPowered: z.boolean().default(false),
  }).strict(),
  z.object({
    ...EquipmentBaseShape,
    category: z.literal('audio'),
    kind: z.enum(['built-in', 'wired-lav', 'wireless-lav', 'shotgun', 'usb', 'field-recorder']),
    wireless: z.boolean().default(false),
    maxSubjects: PositiveCountSchema.default(1),
  }).strict(),
  z.object({
    ...EquipmentBaseShape,
    category: z.literal('modifier'),
    kind: z.enum(['reflector', 'diffusion', 'softbox-grid', 'flag', 'bounce-board', 'blackout-curtain']),
    size: z.enum(['small', 'medium', 'large', 'unknown']).default('unknown'),
  }).strict(),
  z.object({
    ...EquipmentBaseShape,
    category: z.literal('accessory'),
    kind: z.string().min(1),
  }).strict(),
]);

export const ProductionCapabilityProfileSchema = z.object({
  version: z.number().int().default(PRODUCTION_CAPABILITY_PROFILE_VERSION),
  profileId: z.string().min(1).optional(),
  spaces: z.array(ProductionSpaceSchema).default([]),
  equipment: z.array(ProductionEquipmentSchema).default([]),
  people: z.object({
    performersAvailable: z.number().int().min(0).max(100).default(0),
    cameraOperatorsAvailable: z.number().int().min(0).max(100).default(0),
    assistantsAvailable: z.number().int().min(0).max(100).default(0),
    selfShoot: z.boolean().default(false),
  }).strict().default({
    performersAvailable: 0,
    cameraOperatorsAvailable: 0,
    assistantsAvailable: 0,
    selfShoot: false,
  }),
  constraints: z.object({
    currency: z.string().length(3).transform((value) => value.toUpperCase()),
    maxIncrementalSpend: z.number().finite().min(0).default(0),
    rentalAllowed: z.boolean().default(false),
    purchaseAllowed: z.boolean().default(false),
    maxSetupMinutes: z.number().finite().positive().max(1_440).optional(),
    maxSetupChanges: z.number().int().min(0).max(100).optional(),
    maxLocationChanges: z.number().int().min(0).max(100).default(0),
    transportMode: z.enum(['none', 'walk', 'car', 'van', 'unknown']).default('unknown'),
    accessibility: z.array(z.string().min(1)).default([]),
    safety: z.array(z.string().min(1)).default([]),
  }).strict(),
  preferences: z.object({
    defaultPlanTier: z.enum(['no-spend', 'minimum-upgrade', 'enhanced']).default('no-spend'),
    prioritize: z.array(z.enum(['cost', 'setup-time', 'image-quality', 'audio-quality', 'mobility'])).min(1).default(['cost', 'setup-time']),
    householdSubstitutionsAllowed: z.boolean().default(false),
  }).strict().default({
    defaultPlanTier: 'no-spend',
    prioritize: ['cost', 'setup-time'],
    householdSubstitutionsAllowed: false,
  }),
  provenance: z.record(z.string(), z.object({
    source: z.enum(['user', 'saved-profile', 'brand-vault', 'session', 'inferred', 'default']),
    confidence: z.number().min(0).max(1),
    observedAt: z.string().datetime().optional(),
  }).strict()).default({}),
}).strict().superRefine((profile, ctx) => {
  if (profile.version !== PRODUCTION_CAPABILITY_PROFILE_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: `unsupported production capability profile version: ${profile.version}`,
    });
  }

  for (const [path, values] of [
    ['spaces', profile.spaces],
    ['equipment', profile.equipment],
  ] as const) {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path, index, 'id'], message: `duplicate id: ${value.id}` });
      }
      seen.add(value.id);
    });
  }

  if (profile.constraints.maxIncrementalSpend === 0
    && (profile.constraints.rentalAllowed || profile.constraints.purchaseAllowed)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['constraints', 'maxIncrementalSpend'],
      message: 'rental or purchase approval requires a positive incremental spend limit',
    });
  }

  profile.equipment.forEach((item, index) => {
    const paid = item.availability === 'rental-approved' || item.availability === 'purchase-approved';
    if (!paid && (item.estimatedIncrementalCost !== 0 || item.costBasis !== 'none')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['equipment', index, 'estimatedIncrementalCost'],
        message: 'owned or borrowed equipment must have zero incremental cost and costBasis none',
      });
    }
    if (paid && (item.estimatedIncrementalCost <= 0 || item.costBasis === 'none')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['equipment', index, 'estimatedIncrementalCost'],
        message: 'approved rental or purchase equipment requires a positive cost and cost basis',
      });
    }
    if (item.availability === 'rental-approved' && !profile.constraints.rentalAllowed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['equipment', index, 'availability'], message: 'rental item requires rentalAllowed' });
    }
    if (item.availability === 'purchase-approved' && !profile.constraints.purchaseAllowed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['equipment', index, 'availability'], message: 'purchase item requires purchaseAllowed' });
    }
  });
});

export type ProductionCapabilityProfile = z.infer<typeof ProductionCapabilityProfileSchema>;
export type ProductionEquipment = z.infer<typeof ProductionEquipmentSchema>;

export function parseProductionCapabilityProfile(input: unknown): ProductionCapabilityProfile {
  return ProductionCapabilityProfileSchema.parse(input);
}
