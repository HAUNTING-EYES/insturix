/**
 * Phase 2 (brief §6.5/§5): resolve the video-level VideoTasteContract from evidence by precedence.
 *
 * Precedence: explicit reference / project instruction > brand-approved > user history > video signals > house prior.
 * Rules (brief §5): higher precedence overrides only the properties it addresses; lower fills gaps; conflicts are
 * logged (sourcePrecedenceApplied), never silently averaged; only-house ⇒ tasteSource 'house_prior' +
 * personalTasteConfidence 'unknown'; we never claim the user prefers X without real user evidence.
 */
import type { Brand } from '../kit/brand';
import { houseTastePrior } from './house-prior';
import { brandTasteProfileFromKit } from './brand-profile';
import {
  contractHashOf,
  videoTasteContractSchema,
  type HouseTasteProfile,
  type TasteEvidenceKind,
  type TasteEvidenceRef,
  type VideoTasteContract,
} from './taste-schemas';

export interface TasteContractBuildInput {
  /** The mapped kit Brand (null/undefined when it's the default, non-configured brand). */
  brand?: Brand | null;
  /** Whether the project actually has a configured brand (else default brand ⇒ house only). */
  hasConfiguredBrand?: boolean;
  /** User's stated purpose (weak project_instruction evidence — never 'preference'). */
  intent?: string | null;
  videoSignals?: { energy?: number; mood?: string } | null;
  /** Explicit references (uploaded reference / project instruction) — strongest evidence. */
  references?: TasteEvidenceRef[];
  /** Captured user history (future §15) — when present, personal taste is no longer unknown. */
  userEvidence?: TasteEvidenceRef[];
  house?: HouseTasteProfile;
  now?: string;
}

export interface TasteContractBuildResult {
  contract: VideoTasteContract;
  hash: string;
  sourcePrecedenceApplied: TasteEvidenceKind[];
  conflicts: string[];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function buildVideoTasteContract(input: TasteContractBuildInput): TasteContractBuildResult {
  const house = input.house ?? houseTastePrior();
  // hasConfiguredBrand already encodes "default/unconfigured brand ⇒ house only" (see input docs).
  const brand = input.hasConfiguredBrand && input.brand
    ? brandTasteProfileFromKit(input.brand)
    : null;
  const evidence: TasteEvidenceRef[] = [];
  const precedence: TasteEvidenceKind[] = [];
  const conflicts: string[] = [];

  if (input.references?.length) {
    evidence.push(...input.references);
    precedence.push('project_reference');
  }
  if (input.intent?.trim()) {
    precedence.push('project_instruction');
    evidence.push({
      id: 'project-intent', kind: 'project_instruction',
      summary: input.intent.trim(), confidence: 'low',
    });
  }
  if (brand) {
    precedence.push('brand_guideline');
    evidence.push({
      id: `brand-${brand.brandId}`, kind: 'brand_guideline', sourceEntityId: brand.brandId,
      summary: 'brand kit: palette + type (no approved motion examples)', confidence: 'medium',
    });
  }
  if (input.userEvidence?.length) {
    evidence.push(...input.userEvidence);
    precedence.push('user_pairwise_selection'); // captured selection/approval = strongest user evidence available
  }
  precedence.push('video_signal');
  precedence.push('house_prior');

  const hasUserEvidence = Boolean(input.userEvidence?.length);
  const personalTasteConfidence = hasUserEvidence ? 'low' : 'unknown'; // §5: never invent personal preference
  const tasteSourceSummary = input.references?.length
    ? `explicit reference(s) (${input.references.length}) take precedence over brand/user/house`
    : brand
      ? 'brand guideline + project intent + video signals over house prior'
      : 'house_prior only — no user evidence; personal taste unknown (house acts as art director)';
  const artDirectionConfidence = input.references?.length ? 'high' : brand ? 'medium' : 'medium';

  const energy = clamp01(input.videoSignals?.energy ?? 0.5);
  const rhythm = energy > 0.7 ? 'percussive' : energy < 0.35 ? 'calm' : 'speech_synchronised';

  const typographyBehavior = {
    hierarchyIntent: 'one dominant display word, support set deliberately small',
    scaleBehavior: 'display 72-120px at 1080p; support 0.45x',
    weightBehavior: '800 anchor, 500 support',
    casingBehavior: 'uppercase anchors only',
    densityBehavior: 'one idea per graphic',
    prohibitedTreatments: [...house.prohibitedMotifs],
  };
  const colorBehavior = {
    paletteSource: brand ? `brand kit tokens (${brand.colorTraits.join(', ')})` : 'Insturix house palette',
    accentLogic: 'one gold accent holds the licensed number or keyword',
    contrastIntent: 'text never under WCAG 4.5:1 over footage',
    prohibitedTreatments: ['muddy gradients', 'off-palette colour'],
  };
  const formVocabulary = {
    preferredForms: ['bar', 'rule', 'dot', 'plot'],
    edgeTreatment: 'rounded 3px',
    depthTreatment: 'flat',
    textureTreatment: 'none on type',
    iconographyTreatment: 'vector-only',
    prohibitedForms: ['plate cards'],
  };
  const motionGrammar = {
    entryCharacter: 'snap within 4 frames',
    holdCharacter: 'ambient float 1-2px',
    exitCharacter: 'ease-out 6 frames',
    easingCharacter: 'cubic-bezier(.2,.8,.2,1)',
    staggerCharacter: 'child-first',
    speechSyncPolicy: 'anchor words land on their onset',
    persistencePolicy: 'fade at 4.7s',
    prohibitedMotion: ['sweep-blinks', 'freeze'],
  };
  const densityAndRestraint = {
    principle: 'at most one accent per graphic',
    primaryIdeaPolicy: 'one claim per moment',
    decorativeMotionPolicy: 'decoration only when it encodes meaning',
  };
  const noveltyBudget = {
    principle: 'reuse the accepted motif within a video',
    reusableAnchors: ['gold-rule'],
    permittedDeviation: 'one experimental form per video',
  };

  const withoutHash: Omit<VideoTasteContract, 'contractHash'> = {
    id: 'vtc-pending',
    schemaVersion: 'v1',
    houseTasteVersion: house.version,
    evidence,
    sourcePrecedenceApplied: precedence,
    tasteSourceSummary,
    personalTasteConfidence,
    artDirectionConfidence,
    emotionalTarget: [...house.emotionalDefaults],
    styleAxes: { ...house.styleAxes, rhythm },
    typographyBehavior,
    colorBehavior,
    formVocabulary,
    motionGrammar,
    densityAndRestraint,
    noveltyBudget,
    consistencyAnchors: [...house.consistencyAnchors],
    prohibitedMotifs: [...house.prohibitedMotifs],
    internalExemplarIds: [],
    createdAt: input.now ?? new Date().toISOString(),
  };
  const hash = contractHashOf(withoutHash);
  const contract = videoTasteContractSchema.parse({ ...withoutHash, id: `vtc-${hash.slice(0, 12)}`, contractHash: hash });

  return { contract, hash, sourcePrecedenceApplied: precedence, conflicts };
}
