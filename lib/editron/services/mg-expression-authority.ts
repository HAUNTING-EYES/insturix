import type { MgOverlayScores } from '@/lib/editron/motion-graphics/engine/composition-planner';
import {
  resolveVisualExplanationContract,
  type VisualExplanationContract,
} from '@/lib/editron/motion-graphics/engine/visual-explanation-contract';
import type {
  ContentPartRole,
  ContentStructureSignature,
  Recipe,
  RecipeLayout,
  RecipeVisualIntent,
} from '@/lib/editron/motion-graphics/engine/recipe-types';
import type { AtomicMomentBundle } from '@/lib/editron/services/moment-bundle';

export type MgExpressionTier = 'suppressed' | 'subtle' | 'standard' | 'hero';

export interface MgExpressionAuthorityInput {
  content: Record<string, unknown>;
  structure?: ContentStructureSignature;
  semanticAtoms?: Record<string, unknown>;
  signals?: Record<string, unknown>;
  momentBundle?: AtomicMomentBundle;
  placementRegion?: string;
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  visualExplanationContract?: VisualExplanationContract;
}

export interface MgExpressionAuthority {
  version: 'mg-expression-authority-v1';
  allowMotionGraphic: boolean;
  relevanceScore: number;
  structuralStrength: number;
  momentStrength: number;
  visualStrength: number;
  screenPressure: number;
  captionRedundancy: number;
  visualExplanationContract: VisualExplanationContract;
  qualityTier: MgExpressionTier;
  reasons: string[];
  layout: {
    position: RecipeLayout['position'];
    maxWidth: string;
    captionZoneAware: true;
  };
  typography: {
    fontSizePx: number;
    emphasisScale: number;
  };
  duration: {
    multiplier: number;
    minFrames: number;
    maxFrames: number;
  };
  calibration: {
    status: 'invented-needs-calibration';
    weights: Record<string, number>;
    curves: Record<string, string>;
    thresholds: Record<string, number>;
    note: string;
  };
}

const WEIGHTS = {
  structure: 0.44,
  moment: 0.34,
  visual: 0.12,
  screenPenalty: 0.16,
  redundancyPenalty: 0.1,
} as const;

const THRESHOLDS = {
  minimalDensity: 0.38,
  moderateDensity: 0.45,
  heavyDensity: 0.55,
  keywordOnly: 0.76,
  strongStructureOverride: 0.72,
  supportingMomentOverride: 0.25,
} as const;

const MEANING_ROLES: ContentPartRole[] = [
  'primary-value',
  'series-values',
  'name',
  'title',
  'quote',
  'author',
  'body',
  'list-items',
  'compare-from',
  'compare-to',
  'brand-text',
  'quantity-kind',
  'truth-polarity',
  'truth-negation',
  'warranted-state',
];

export function resolveMgExpressionAuthority(input: MgExpressionAuthorityInput): MgExpressionAuthority {
  const atoms = input.semanticAtoms ?? objectRecord(input.content.semanticAtoms);
  const momentStrength = resolveMomentStrength(input.signals, input.momentBundle);
  const visualStrength = resolveVisualStrength(input.signals, input.momentBundle);
  const screenPressure = resolveScreenPressure(input.signals, input.momentBundle);
  const captionRedundancy = clamp01(
    readNumber(input.content, 'captionRedundancy')
      ?? readNumber(atoms, 'captionRedundancy')
      ?? 0,
  );
  const visualExplanationContract = input.visualExplanationContract ?? resolveVisualExplanationContract({
    content: input.content,
    structure: input.structure,
    semanticAtoms: atoms ?? undefined,
    signals: input.signals,
    activeOverlayContext: {
      captionRedundancy,
      activeOverlayCount: readNumber(input.signals, 'active_overlay_count', 'structural.active_overlays_count'),
    },
  });
  const contractObligationStrength = averageObligationConfidence(visualExplanationContract);
  const hasEvidenceBackedVisualObligation = contractHasEvidenceBackedObligation(visualExplanationContract);
  const structuralStrength = Math.max(
    resolveStructuralStrength(input.content, input.structure, atoms),
    contractObligationStrength * 0.9,
  );
  const keywordOnly = isKeywordOnly(input.content, input.structure);
  const longCopy = readableWordCount(input.content) >= 9 || readableCharCount(input.content) >= 72;
  const densityThreshold = thresholdForDensity(input.graphicsDensity);
  const threshold = keywordOnly ? Math.max(densityThreshold, THRESHOLDS.keywordOnly) : densityThreshold;

  const relevanceScore = round4(clamp01(
    structuralStrength * WEIGHTS.structure
      + momentStrength * WEIGHTS.moment
      + visualStrength * WEIGHTS.visual
      - screenPressure * WEIGHTS.screenPenalty
      - captionRedundancy * WEIGHTS.redundancyPenalty,
  ));
  const strongStructureOverride = structuralStrength >= THRESHOLDS.strongStructureOverride
    && momentStrength >= THRESHOLDS.supportingMomentOverride
    && screenPressure < 0.88;
  const allowMotionGraphic = visualExplanationContract.allow
    && hasEvidenceBackedVisualObligation
    && (relevanceScore >= threshold || strongStructureOverride);
  const qualityTier = resolveTier(allowMotionGraphic, relevanceScore, structuralStrength, screenPressure);
  const layoutPosition = regionToLayoutPosition(input.placementRegion, input.momentBundle);
  const maxWidth = resolveMaxWidth(layoutPosition, qualityTier, longCopy, screenPressure);
  const fontSizePx = resolveFontSize(qualityTier, structuralStrength, momentStrength, screenPressure, longCopy);
  const emphasisScale = round4(clamp(1.08 + relevanceScore * 0.72 - screenPressure * 0.18, 1.08, 1.72));

  return {
    version: 'mg-expression-authority-v1',
    allowMotionGraphic,
    relevanceScore,
    structuralStrength: round4(structuralStrength),
    momentStrength: round4(momentStrength),
    visualStrength: round4(visualStrength),
    screenPressure: round4(screenPressure),
    captionRedundancy: round4(captionRedundancy),
    visualExplanationContract,
    qualityTier,
    reasons: [
      ...buildReasons({
        allowMotionGraphic,
        keywordOnly,
        longCopy,
        structuralStrength,
        momentStrength,
        visualStrength,
        screenPressure,
        captionRedundancy,
        threshold,
        relevanceScore,
        layoutPosition,
      }),
      ...buildVisualContractReasons(visualExplanationContract, hasEvidenceBackedVisualObligation),
    ],
    layout: {
      position: layoutPosition,
      maxWidth,
      captionZoneAware: true,
    },
    typography: {
      fontSizePx,
      emphasisScale,
    },
    duration: resolveDuration(qualityTier, longCopy, screenPressure),
    calibration: {
      status: 'invented-needs-calibration',
      weights: { ...WEIGHTS },
      curves: {
        objectCountPressure: 'clamp(object_count / 8)',
        textBoxPressure: 'clamp(text_box_count / 4)',
        fontSize: 'tier base plus structure/moment minus screen pressure',
        maxWidth: 'layout region plus copy length plus screen pressure',
      },
      thresholds: { ...THRESHOLDS },
      note: 'Tune these weights, thresholds, and curves with rendered reference calibration.',
    },
  };
}

export function applyMgExpressionAuthorityToScores(
  scores: MgOverlayScores | undefined,
  authority: MgExpressionAuthority,
): MgOverlayScores | undefined {
  if (!authority.allowMotionGraphic) return scores;
  const next: MgOverlayScores = { ...(scores ?? {}) };

  next['mg.typography.font_size'] = mergeScore(next['mg.typography.font_size'], {
    score: Math.max(authority.relevanceScore, next['mg.typography.font_size']?.score ?? 0),
    values: { fontSize: authority.typography.fontSizePx },
  });
  next['mg.emphasis.scale_contrast'] = mergeScore(next['mg.emphasis.scale_contrast'], {
    score: Math.max(authority.relevanceScore, next['mg.emphasis.scale_contrast']?.score ?? 0),
    values: { scaleContrast: authority.typography.emphasisScale },
  });
  next['mg.layout.center_avoidance'] = mergeScore(next['mg.layout.center_avoidance'], {
    score: Math.max(authority.screenPressure, next['mg.layout.center_avoidance']?.score ?? 0),
    values: {},
  });

  return next;
}

export function applyMgExpressionAuthorityToRecipe(
  recipe: Recipe,
  authority: MgExpressionAuthority,
): Recipe {
  if (!authority.allowMotionGraphic || recipe.id === 'suppressed') return recipe;
  const visualIntent = recipeVisualIntentFromContract(authority.visualExplanationContract);
  const authorityLayout: RecipeLayout = {
    ...recipe.layout,
    position: authority.layout.position,
    maxWidth: authority.layout.maxWidth,
    captionZoneAware: authority.layout.captionZoneAware,
  };
  return {
    ...recipe,
    layout: applyVisualIntentToLayout(authorityLayout, visualIntent),
    visualIntent,
  };
}

function mergeScore(
  existing: MgOverlayScores[string] | undefined,
  patch: MgOverlayScores[string],
): MgOverlayScores[string] {
  return {
    score: patch.score,
    values: {
      ...(existing?.values ?? {}),
      ...patch.values,
    },
  };
}

function resolveStructuralStrength(
  content: Record<string, unknown>,
  structure: ContentStructureSignature | undefined,
  atoms: Record<string, unknown> | null,
): number {
  let strength = 0;
  if (hasRole(structure, 'primary-value') || hasNumericValue(content)) strength = Math.max(strength, 0.9);
  if (hasRole(structure, 'series-values')) strength = Math.max(strength, 0.88);
  if (hasRole(structure, 'compare-from') && hasRole(structure, 'compare-to')) strength = Math.max(strength, 0.84);
  if (hasRelation(structure, 'compares') || hasRelation(structure, 'part-of-whole') || hasRelation(structure, 'refutes')) strength = Math.max(strength, 0.82);
  if (hasRole(structure, 'quote')) strength = Math.max(strength, 0.78);
  if (hasRole(structure, 'name') || hasRole(structure, 'brand-text')) strength = Math.max(strength, 0.72);
  if (hasRole(structure, 'body') || hasRole(structure, 'list-items')) strength = Math.max(strength, 0.66);
  if (hasMeaningfulSemanticAtom(atoms)) strength = Math.max(strength, 0.72);
  if (typeof content.title === 'string' && (content.body != null || content.items != null)) strength = Math.max(strength, 0.66);
  if (typeof content.salience === 'number') strength = Math.max(strength, clamp01(content.salience) * 0.92);
  if (isKeywordOnly(content, structure)) strength = Math.min(Math.max(strength, 0.2), 0.32);
  return clamp01(strength);
}

function resolveMomentStrength(
  signals: Record<string, unknown> | undefined,
  bundle: AtomicMomentBundle | undefined,
): number {
  return clamp01(Math.max(
    bundle?.familyIntents.motionGraphic ?? 0,
    bundle?.rhythm.speechPeak ?? 0,
    (bundle?.rhythm.beatStrength ?? 0) * 0.8,
    readNumber(signals, 'word_importance') ?? 0,
    readNumber(signals, 'speech_energy', 'speech.energy') ?? 0,
    (readNumber(signals, 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity') ?? 0) * 0.9,
    readNumber(signals, 'cinematic_moment', 'composite.cinematic_moment') ?? 0,
    readNumber(signals, 'narrative_pressure', 'topic_shift', 'composite.narrative_pressure') ?? 0,
  ));
}

function resolveVisualStrength(
  signals: Record<string, unknown> | undefined,
  bundle: AtomicMomentBundle | undefined,
): number {
  return clamp01(Math.max(
    bundle?.screen.visualSalience ?? 0,
    readNumber(signals, 'visual_significance', 'visual.significance') ?? 0,
    (readNumber(signals, 'motion_intensity', 'visual.motion_intensity') ?? 0) * 0.55,
    (readNumber(signals, 'music_beat', 'audio.music_beat') ?? 0) * 0.65,
  ));
}

function resolveScreenPressure(
  signals: Record<string, unknown> | undefined,
  bundle: AtomicMomentBundle | undefined,
): number {
  const textBoxes = clamp01((readNumber(signals, 'text_box_count', 'visual.text_box_count') ?? 0) / 4);
  const objects = clamp01((readNumber(signals, 'object_count', 'visual.object_count') ?? 0) / 8);
  const faces = clamp01((readNumber(signals, 'face_count', 'visual.face_count') ?? 0) / 3);
  return clamp01(Math.max(
    bundle?.screen.busyness ?? 0,
    bundle?.screen.legibilityRisk ?? 0,
    readNumber(signals, 'text_on_screen', 'visual.text_on_screen') ?? 0,
    readNumber(signals, 'text_coverage', 'visual.text_coverage') ?? 0,
    readNumber(signals, 'visual_complexity', 'visual.complexity') ?? 0,
    textBoxes,
    objects * 0.82,
    faces * 0.48,
  ));
}

function resolveTier(
  allowMotionGraphic: boolean,
  relevance: number,
  structure: number,
  screenPressure: number,
): MgExpressionTier {
  if (!allowMotionGraphic) return 'suppressed';
  if (relevance >= 0.78 && structure >= 0.68 && screenPressure < 0.58) return 'hero';
  if (relevance >= 0.56 || structure >= 0.72) return 'standard';
  return 'subtle';
}

function resolveFontSize(
  tier: MgExpressionTier,
  structure: number,
  moment: number,
  screenPressure: number,
  longCopy: boolean,
): number {
  const base = tier === 'hero' ? 96 : tier === 'standard' ? 82 : tier === 'subtle' ? 72 : 0;
  if (base === 0) return 0;
  const adjusted = base
    + structure * 10
    + moment * 8
    - screenPressure * 12
    - (longCopy ? 10 : 0);
  return Math.round(clamp(adjusted, 72, 112));
}

function resolveMaxWidth(
  position: RecipeLayout['position'],
  tier: MgExpressionTier,
  longCopy: boolean,
  screenPressure: number,
): string {
  const corner = position === 'top-left' || position === 'top-right' || position === 'bottom-left' || position === 'bottom-right';
  let width = corner ? 48 : 64;
  if (tier === 'hero') width += 10;
  if (longCopy) width += 16;
  if (screenPressure > 0.62) width -= corner ? 8 : 12;
  return `${Math.round(clamp(width, corner ? 40 : 52, longCopy ? 78 : 68))}%`;
}

function resolveDuration(
  tier: MgExpressionTier,
  longCopy: boolean,
  screenPressure: number,
): MgExpressionAuthority['duration'] {
  const multiplier = tier === 'hero' ? 1.12 : tier === 'standard' ? 1 : tier === 'subtle' ? 0.88 : 1;
  return {
    multiplier: round4(longCopy ? multiplier + 0.12 : screenPressure > 0.7 ? multiplier - 0.08 : multiplier),
    minFrames: longCopy ? 72 : 48,
    maxFrames: longCopy ? 150 : 120,
  };
}

function regionToLayoutPosition(
  placementRegion: string | undefined,
  bundle: AtomicMomentBundle | undefined,
): RecipeLayout['position'] {
  const region = placementRegion ?? regionFromBundle(bundle);
  switch (region) {
    case 'top-left':
    case 'top':
    case 'middle-left':
    case 'center-left':
      return 'top-left';
    case 'top-right':
    case 'right':
    case 'middle-right':
    case 'center-right':
      return 'top-right';
    case 'bottom-left':
    case 'left':
      return 'bottom-left';
    case 'bottom-right':
      return 'bottom-right';
    case 'top-center':
      return 'full-width-top';
    case 'bottom-center':
      return 'full-width-bottom';
    default:
      return 'center';
  }
}

function regionFromBundle(bundle: AtomicMomentBundle | undefined): string | undefined {
  const region = bundle?.screen.negativeSpace.region;
  return region && region !== 'none' ? region : undefined;
}

function thresholdForDensity(density: MgExpressionAuthorityInput['graphicsDensity']): number {
  if (density === 'minimal') return THRESHOLDS.minimalDensity;
  if (density === 'heavy') return THRESHOLDS.heavyDensity;
  return THRESHOLDS.moderateDensity;
}

function buildReasons(input: {
  allowMotionGraphic: boolean;
  keywordOnly: boolean;
  longCopy: boolean;
  structuralStrength: number;
  momentStrength: number;
  visualStrength: number;
  screenPressure: number;
  captionRedundancy: number;
  threshold: number;
  relevanceScore: number;
  layoutPosition: RecipeLayout['position'];
}): string[] {
  const reasons: string[] = [];
  reasons.push(input.allowMotionGraphic ? 'allowed:relevance-earned' : 'suppressed:relevance-below-threshold');
  if (input.keywordOnly) reasons.push('keyword-only:requires-high-moment-strength');
  if (input.longCopy) reasons.push('long-copy:wider-readable-layout');
  if (input.structuralStrength >= 0.72) reasons.push('structure:strong-atomic-evidence');
  if (input.momentStrength >= 0.65) reasons.push('moment:high-signal');
  if (input.visualStrength >= 0.65) reasons.push('visual:salient-frame');
  if (input.screenPressure >= 0.55) reasons.push('screen-pressure:restrain-size-and-density');
  if (input.captionRedundancy >= 0.45) reasons.push('caption-redundancy:prefer-caption-layer');
  reasons.push(`threshold:${round4(input.threshold)}`);
  reasons.push(`score:${round4(input.relevanceScore)}`);
  reasons.push(`layout:${input.layoutPosition}`);
  return reasons;
}

function averageObligationConfidence(contract: VisualExplanationContract): number {
  if (contract.obligations.length === 0) return 0;
  const total = contract.obligations.reduce((sum, obligation) => sum + obligation.confidence, 0);
  return clamp01(total / contract.obligations.length);
}

function contractHasEvidenceBackedObligation(contract: VisualExplanationContract): boolean {
  return contract.obligations.some((obligation) => obligation.evidenceAtomKeys.length > 0);
}

function buildVisualContractReasons(
  contract: VisualExplanationContract,
  hasEvidenceBackedVisualObligation: boolean,
): string[] {
  const reasons: string[] = [];
  if (!hasEvidenceBackedVisualObligation) reasons.push('visual-contract:no-evidence-backed-obligation');
  if (!contract.allow) reasons.push('visual-contract:observe-only-risk-or-low-gain');
  if (contract.stageMode !== 'overlay-on-footage') reasons.push(`visual-contract:stage:${contract.stageMode}`);
  for (const missing of contract.missingEvidence.slice(0, 4)) reasons.push(`visual-contract:missing:${missing}`);
  return reasons;
}

function recipeVisualIntentFromContract(contract: VisualExplanationContract): RecipeVisualIntent {
  const obligationKinds = uniqueValues(contract.obligations.map((obligation) => obligation.kind));
  const constraintKinds = uniqueValues(contract.constraints.map((constraint) => constraint.kind));
  const preferFullFrame = contract.stageMode === 'full-frame-graphic-scene'
    || contract.stageMode === 'interstitial-graphic-scene';
  const preferSplitLayout = contract.stageMode === 'split-footage-graphic';
  const preferDeviceFrame = contract.stageMode === 'device-or-screen-scene';
  const transitionLed = contract.stageMode === 'mg-led-transition';
  const captionZoneAware = preferFullFrame
    || preferSplitLayout
    || preferDeviceFrame
    || transitionLed
    || constraintKinds.includes('caption-zone-aware')
    || contract.choreography.shouldCoordinateWithCaptions;
  const preferDataViz = obligationKinds.some((kind) => [
    'show-cardinality',
    'show-magnitude',
    'show-proportion',
    'compare-peers',
    'preserve-order',
    'show-sequence',
  ].includes(kind));

  return {
    source: contract.version,
    stageMode: contract.stageMode,
    obligationKinds,
    constraintKinds,
    evidenceAtomKeys: [...contract.evidenceAtomKeys],
    missingEvidence: [...contract.missingEvidence],
    renderDirectives: {
      preferFullFrame,
      preferSplitLayout,
      preferDeviceFrame,
      transitionLed,
      captionZoneAware,
      suppressDecorativeAccents: preferFullFrame || preferDeviceFrame || constraintKinds.includes('safe-zone') || contract.renderRisk >= 0.58,
      preferDataViz,
    },
    choreography: {
      coordinateWithCaptions: contract.choreography.shouldCoordinateWithCaptions,
      coordinateWithZoom: contract.choreography.shouldCoordinateWithZoom,
      coordinateWithTransition: contract.choreography.shouldCoordinateWithTransition,
      coordinateWithSfx: contract.choreography.shouldCoordinateWithSfx,
      rhythmEvidenceKeys: [...contract.choreography.rhythmEvidenceKeys],
    },
  };
}

function applyVisualIntentToLayout(
  layout: RecipeLayout,
  visualIntent: RecipeVisualIntent,
): RecipeLayout {
  if (visualIntent.renderDirectives.preferSplitLayout) {
    return {
      ...layout,
      position: 'center',
      maxWidth: '92%',
      arrangement: 'horizontal-distributed',
      captionZoneAware: true,
    };
  }
  if (visualIntent.renderDirectives.preferFullFrame) {
    return {
      ...layout,
      position: 'center',
      maxWidth: '88%',
      arrangement: 'vertical-stack',
      captionZoneAware: true,
    };
  }
  if (visualIntent.renderDirectives.preferDeviceFrame) {
    return {
      ...layout,
      position: 'center',
      maxWidth: '78%',
      captionZoneAware: true,
    };
  }
  if (visualIntent.renderDirectives.transitionLed) {
    return {
      ...layout,
      position: 'full-width-top',
      maxWidth: '100%',
      captionZoneAware: true,
    };
  }
  if (visualIntent.renderDirectives.captionZoneAware) {
    return {
      ...layout,
      captionZoneAware: true,
    };
  }
  return layout;
}

function isKeywordOnly(content: Record<string, unknown>, structure: ContentStructureSignature | undefined): boolean {
  const roles = new Set((structure?.parts ?? []).map((part) => part.role));
  const hasMeaningRole = MEANING_ROLES.some((role) => roles.has(role));
  const keywordish = roles.has('keyword')
    || (typeof content.keyword === 'string' && content.keyword.trim().length > 0)
    || (typeof content.text === 'string' && Object.keys(content).every((key) => ['text', 'keyword', 'contentStructure', 'semanticAtoms'].includes(key)));
  return keywordish && !hasMeaningRole && !hasNumericValue(content);
}

function hasMeaningfulSemanticAtom(atoms: Record<string, unknown> | null): boolean {
  if (!atoms) return false;
  return [
    'claim',
    'evidencePhrase',
    'quantity',
    'scalar',
    'series',
    'dataSeries',
    'relation',
    'comparison',
    'contrast',
    'quote',
    'quotation',
    'identity',
    'entity',
    'person',
    'media',
  ].some((key) => atoms[key] != null);
}

function hasRole(structure: ContentStructureSignature | undefined, role: ContentPartRole): boolean {
  return (structure?.parts ?? []).some((part) => part.role === role && part.confidence > 0);
}

function hasRelation(structure: ContentStructureSignature | undefined, type: string): boolean {
  return (structure?.relations ?? []).some((relation) => relation.type === type);
}

function hasNumericValue(content: Record<string, unknown>): boolean {
  const value = content.value ?? content.endValue ?? content.number;
  if (typeof value === 'number' && isFinite(value)) return true;
  return typeof value === 'string' && /\d/.test(value);
}

function readableWordCount(content: Record<string, unknown>): number {
  const text = readableText(content);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function readableCharCount(content: Record<string, unknown>): number {
  return readableText(content).length;
}

function readableText(content: Record<string, unknown>): string {
  return [
    content.title,
    content.body,
    content.quote,
    content.text,
    content.keyword,
    content.label,
    content.value,
    content.name,
  ]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNumber(source: Record<string, unknown> | null | undefined, ...keys: string[]): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return undefined;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
