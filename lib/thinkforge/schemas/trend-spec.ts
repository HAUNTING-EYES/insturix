import { z } from 'zod';

export const TREND_SPEC_VERSION = 1 as const;
export type TrendSpecVersion = typeof TREND_SPEC_VERSION;

export type TrendAlignmentFrame = 'beat-space' | 'slot-space';

export interface TrendSection {
  id: string;
  role: string;
  start: number;
  end: number;
  beats?: number[];
}

export interface TrendBeatGrid {
  bpm?: number;
  beatsMs: number[];
  dropsMs?: number[];
  sections: TrendSection[];
  totalMs: number;
}

export interface TrendCopySlot {
  id: string;
  role: string;
  template: string;
  maxChars?: number;
}

export interface TrendCopyFormula {
  slots: TrendCopySlot[];
  hashtags?: string[];
}

export interface TrendInvariant {
  layer: string;
  feature: string;
  value?: string | number;
  dist?: { mean: number; sd: number };
  support: number;
  anchor?: { beat?: number; sectionId?: string };
}

export interface TrendVariable {
  layer: string;
  feature: string;
  freedomRange?: { min?: number; max?: number } | string[];
}

export interface TrendSpecAudioProducerData {
  trackIdentity?: string | null;
  soundClass?: 'catalog-track' | 'original-sound';
  playOffsetMs?: number;
  [key: string]: unknown;
}

export interface TrendSpec {
  trendId: string;
  version: TrendSpecVersion;
  alignmentFrame: TrendAlignmentFrame;
  beatGrid: TrendBeatGrid;
  invariants: TrendInvariant[];
  variables: TrendVariable[];
  copyFormula: TrendCopyFormula;
  performanceScript: string;
  exemplarRefs?: string[];
  audio?: TrendSpecAudioProducerData;
  rankScore?: number;
  fetchedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const NonNegativeNumberSchema = z.number().finite().min(0);
const OptionalLooseStringArraySchema = z.preprocess(
  (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : undefined,
  z.array(z.string()).optional(),
);

const OptionalLooseNumberSchema = z.preprocess(
  (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined,
  z.number().optional(),
);

const OptionalLooseStringSchema = z.preprocess(
  (value) => typeof value === 'string' ? value : undefined,
  z.string().optional(),
);

const TrendProducerAudioSchema = z.preprocess((value) => {
  if (!isRecord(value)) return undefined;
  const soundClass =
    value.soundClass === 'catalog-track' || value.soundClass === 'original-sound'
      ? value.soundClass
      : undefined;
  return {
    ...value,
    trackIdentity:
      typeof value.trackIdentity === 'string' || value.trackIdentity === null
        ? value.trackIdentity
        : undefined,
    soundClass,
    playOffsetMs:
      typeof value.playOffsetMs === 'number' && Number.isFinite(value.playOffsetMs)
        ? value.playOffsetMs
        : undefined,
  };
}, z.object({
  trackIdentity: z.string().nullable().optional(),
  soundClass: z.enum(['catalog-track', 'original-sound']).optional(),
  playOffsetMs: z.number().optional(),
}).passthrough().optional());

export const TrendAlignmentFrameSchema = z.enum(['beat-space', 'slot-space']);

export const TrendSectionSchema: z.ZodType<TrendSection> = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  start: z.number().finite(),
  end: z.number().finite(),
  beats: z.array(z.number().int().min(0)).optional(),
}).superRefine((section, ctx) => {
  if (section.end <= section.start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end'],
      message: 'section.end must be greater than section.start',
    });
  }
});

export const TrendBeatGridSchema: z.ZodType<TrendBeatGrid> = z.object({
  bpm: z.number().finite().positive().optional(),
  beatsMs: z.array(NonNegativeNumberSchema),
  dropsMs: z.array(NonNegativeNumberSchema).optional(),
  sections: z.array(TrendSectionSchema).min(1),
  totalMs: z.number().finite().positive(),
}).superRefine((beatGrid, ctx) => {
  for (const dropMs of beatGrid.dropsMs ?? []) {
    if (dropMs > beatGrid.totalMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dropsMs'],
        message: 'dropsMs entries must be inside beatGrid.totalMs',
      });
    }
  }
});

export const TrendCopySlotSchema: z.ZodType<TrendCopySlot> = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  template: z.string().min(1),
  maxChars: z.number().int().positive().optional(),
});

export const TrendCopyFormulaSchema: z.ZodType<TrendCopyFormula> = z.object({
  slots: z.array(TrendCopySlotSchema),
  hashtags: z.array(z.string().min(1)).optional(),
});

export const TrendInvariantSchema: z.ZodType<TrendInvariant> = z.object({
  layer: z.string().min(1),
  feature: z.string().min(1),
  value: z.union([z.string(), z.number()]).optional(),
  dist: z.object({
    mean: z.number().finite(),
    sd: z.number().finite().min(0),
  }).optional(),
  support: z.number().finite().min(0).max(1),
  anchor: z.object({
    beat: z.number().int().min(0).optional(),
    sectionId: z.string().min(1).optional(),
  }).optional(),
}).passthrough();

const TrendFreedomRangeSchema = z.union([
  z.object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }).superRefine((range, ctx) => {
    if (
      typeof range.min === 'number'
      && typeof range.max === 'number'
      && range.max < range.min
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max'],
        message: 'freedomRange.max must be greater than or equal to freedomRange.min',
      });
    }
  }),
  z.array(z.string().min(1)),
]);

export const TrendVariableSchema: z.ZodType<TrendVariable> = z.object({
  layer: z.string().min(1),
  feature: z.string().min(1),
  freedomRange: TrendFreedomRangeSchema.optional(),
}).passthrough();

export const TrendSpecSchema: z.ZodType<TrendSpec> = z.object({
  trendId: z.string().min(1),
  version: z.literal(TREND_SPEC_VERSION),
  alignmentFrame: TrendAlignmentFrameSchema,
  beatGrid: TrendBeatGridSchema,
  invariants: z.array(TrendInvariantSchema),
  variables: z.array(TrendVariableSchema),
  copyFormula: TrendCopyFormulaSchema,
  performanceScript: z.string(),
  exemplarRefs: OptionalLooseStringArraySchema,
  audio: TrendProducerAudioSchema,
  rankScore: OptionalLooseNumberSchema,
  fetchedAt: OptionalLooseStringSchema,
}).passthrough().superRefine((spec, ctx) => {
  const sectionIds = new Set(spec.beatGrid.sections.map((section) => section.id));
  spec.invariants.forEach((invariant, index) => {
    const sectionId = invariant.anchor?.sectionId;
    if (sectionId && !sectionIds.has(sectionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invariants', index, 'anchor', 'sectionId'],
        message: `anchor.sectionId "${sectionId}" must resolve to beatGrid.sections[].id`,
      });
    }
  });
}) as z.ZodType<TrendSpec>;

export function parseTrendSpec(input: unknown): TrendSpec {
  return TrendSpecSchema.parse(input);
}
