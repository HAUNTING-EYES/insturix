/**
 * Phase 1 of the Fix-0 brief §6 — the versioned TASTE DATA MODEL (schemas + validation only; no wiring yet).
 *
 * Deploy-cycle-2 foundation. Pure zod schemas + parsers so the taste authority (VideoTasteContract, house/brand/
 * user profiles, evidence) is versioned, runtime-validated, and never scattered as untyped JSON (brief §6.0).
 *
 * Not wired anywhere yet on purpose — the wiring phases (contract generation shadow → designer/judge context →
 * persistence/telemetry) come next, in cycle-2 order. Zero blast radius on the live lane.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

// ─────────────────────────── §6.1 Taste evidence ───────────────────────────

export const tasteConfidenceSchema = z.enum(['high', 'medium', 'low', 'unknown']);
export type TasteConfidence = z.infer<typeof tasteConfidenceSchema>;

export const tasteEvidenceKindSchema = z.enum([
  'project_instruction',
  'project_reference',
  'brand_guideline',
  'brand_approved_mg',
  'brand_rejected_mg',
  'user_pairwise_selection',
  'user_explicit_approval',
  'user_explicit_rejection',
  'user_edit',
  'user_regeneration',
  'video_signal',
  'house_prior',
]);
export type TasteEvidenceKind = z.infer<typeof tasteEvidenceKindSchema>;

export const tasteEvidenceRefSchema = z.object({
  id: z.string().min(1),
  kind: tasteEvidenceKindSchema,
  sourceEntityId: z.string().min(1).optional(),
  summary: z.string().min(1),
  confidence: tasteConfidenceSchema,
  createdAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type TasteEvidenceRef = z.infer<typeof tasteEvidenceRefSchema>;

// ────────────────────────── §6.2 House taste profile ──────────────────────────

export const tasteAxisValue = z.enum(['restrained', 'balanced', 'spectacular',
  'editorial', 'hybrid', 'cinematic',
  'geometric', 'organic',
  'flat', 'selective_depth', 'dimensional',
  'clean', 'light_texture', 'textured',
  'literal', 'metaphorical',
  'calm', 'speech_synchronised', 'percussive',
  'typographic', 'mixed', 'illustrative',
  'stable', 'dynamic',
  'familiar', 'selective', 'experimental']);

export const houseTasteProfileSchema = z.object({
  version: z.string().min(1),
  name: z.string().min(1),
  principles: z.array(z.string().min(1)).min(1),
  emotionalDefaults: z.array(z.string().min(1)),
  styleAxes: z.object({
    restraint: z.string(),
    editoriality: z.string(),
    geometry: z.string(),
    dimensionality: z.string(),
    texture: z.string(),
    abstraction: z.string(),
    rhythm: z.string(),
    dominantMedium: z.string(),
    composition: z.string(),
    novelty: z.string(),
  }),
  typographyPrinciples: z.array(z.string().min(1)),
  colorPrinciples: z.array(z.string().min(1)),
  formPrinciples: z.array(z.string().min(1)),
  motionPrinciples: z.array(z.string().min(1)),
  densityPrinciples: z.array(z.string().min(1)),
  consistencyAnchors: z.array(z.string().min(1)),
  prohibitedMotifs: z.array(z.string().min(1)),
  exemplarIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
}).strict();
export type HouseTasteProfile = z.infer<typeof houseTasteProfileSchema>;

// ────────────────────────── §6.3 Brand taste profile ──────────────────────────

export const brandTasteProfileSchema = z.object({
  brandId: z.string().min(1),
  version: z.string().min(1),
  evidence: z.array(tasteEvidenceRefSchema),
  typographyTraits: z.array(z.string().min(1)),
  colorTraits: z.array(z.string().min(1)),
  formTraits: z.array(z.string().min(1)),
  motionTraits: z.array(z.string().min(1)),
  preferredPatterns: z.array(z.string().min(1)),
  rejectedPatterns: z.array(z.string().min(1)),
  confidenceByDomain: z.object({
    typography: tasteConfidenceSchema,
    color: tasteConfidenceSchema,
    form: tasteConfidenceSchema,
    motion: tasteConfidenceSchema,
  }),
  updatedAt: z.string().datetime(),
}).strict();
export type BrandTasteProfile = z.infer<typeof brandTasteProfileSchema>;

// ────────────────────────── §6.4 User taste profile ──────────────────────────

export const userTasteProfileSchema = z.object({
  userId: z.string().min(1),
  version: z.string().min(1),
  evidence: z.array(tasteEvidenceRefSchema),
  preferredTraits: z.array(z.string().min(1)),
  rejectedTraits: z.array(z.string().min(1)),
  confidence: tasteConfidenceSchema,
  updatedAt: z.string().datetime(),
}).strict();
export type UserTasteProfile = z.infer<typeof userTasteProfileSchema>;

// ────────────────────────── §6.5 Video taste contract ──────────────────────────

export const videoTasteContractSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.string().min(1),
  houseTasteVersion: z.string().min(1),

  evidence: z.array(tasteEvidenceRefSchema),
  sourcePrecedenceApplied: z.array(tasteEvidenceKindSchema),
  tasteSourceSummary: z.string().min(1),
  personalTasteConfidence: tasteConfidenceSchema,
  artDirectionConfidence: tasteConfidenceSchema,

  emotionalTarget: z.array(z.string().min(1)),

  styleAxes: z.object({
    restraint: z.string(), editoriality: z.string(), geometry: z.string(),
    dimensionality: z.string(), texture: z.string(), abstraction: z.string(),
    rhythm: z.string(), dominantMedium: z.string(), composition: z.string(), novelty: z.string(),
  }),

  typographyBehavior: z.object({
    hierarchyIntent: z.string().min(1), scaleBehavior: z.string().min(1),
    weightBehavior: z.string().min(1), casingBehavior: z.string().min(1),
    densityBehavior: z.string().min(1),
    prohibitedTreatments: z.array(z.string().min(1)),
  }),
  colorBehavior: z.object({
    paletteSource: z.string().min(1), accentLogic: z.string().min(1),
    contrastIntent: z.string().min(1), prohibitedTreatments: z.array(z.string().min(1)),
  }),
  formVocabulary: z.object({
    preferredForms: z.array(z.string().min(1)), edgeTreatment: z.string().min(1),
    depthTreatment: z.string().min(1), textureTreatment: z.string().min(1),
    iconographyTreatment: z.string().min(1), prohibitedForms: z.array(z.string().min(1)),
  }),
  motionGrammar: z.object({
    entryCharacter: z.string().min(1), holdCharacter: z.string().min(1),
    exitCharacter: z.string().min(1), easingCharacter: z.string().min(1),
    staggerCharacter: z.string().min(1), speechSyncPolicy: z.string().min(1),
    persistencePolicy: z.string().min(1), prohibitedMotion: z.array(z.string().min(1)),
  }),
  densityAndRestraint: z.object({
    principle: z.string().min(1), primaryIdeaPolicy: z.string().min(1),
    decorativeMotionPolicy: z.string().min(1),
  }),
  noveltyBudget: z.object({
    principle: z.string().min(1), reusableAnchors: z.array(z.string().min(1)),
    permittedDeviation: z.string().min(1),
  }),

  consistencyAnchors: z.array(z.string().min(1)),
  prohibitedMotifs: z.array(z.string().min(1)),
  internalExemplarIds: z.array(z.string().min(1)),

  createdAt: z.string().datetime(),
  contractHash: z.string().min(1),
}).strict();
export type VideoTasteContract = z.infer<typeof videoTasteContractSchema>;

/** §6.5: reject vacuous adjectives. A contract must describe OBSERVABLE decisions, not empty praise. */
const VACUOUS_TERMS = ['premium', 'modern', 'cinematic'];

export function findVacuousLanguage(text: string): string[] {
  const lowered = text.toLowerCase();
  return VACUOUS_TERMS.filter((t) => lowered.includes(t));
}

/** §6.5: contract must not lean on vacuous adjectives to stand in for real behavior. */
export function assertContractConcrete(contract: VideoTasteContract): { ok: true } | { ok: false; reasons: string[] } {
  const joined = [
    contract.tasteSourceSummary,
    contract.typographyBehavior.hierarchyIntent,
    contract.typographyBehavior.scaleBehavior,
    contract.typographyBehavior.weightBehavior,
    contract.colorBehavior.accentLogic,
    contract.colorBehavior.contrastIntent,
    contract.motionGrammar.entryCharacter,
    contract.motionGrammar.holdCharacter,
    contract.densityAndRestraint.principle,
  ].join(' ');
  const hits = findVacuousLanguage(joined);
  return hits.length === 0 ? { ok: true } : {
    ok: false,
    reasons: hits.map((t) => `contract uses the vacuous term "${t}" without observable behavior — §6.5 requires concrete typography/form/color/motion/density decisions`),
  };
}

/** Deterministic contract hash for reproducibility (brief §6.5/§21). */
export function contractHashOf(contract: Omit<VideoTasteContract, 'contractHash'>): string {
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

export function parseVideoTasteContract(json: string): VideoTasteContract {
  const parsed = videoTasteContractSchema.parse(JSON.parse(json));
  const concrete = assertContractConcrete(parsed);
  if (!concrete.ok) throw new Error(concrete.reasons.join('; '));
  return parsed;
}
