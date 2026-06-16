import type { MotionTokens, BrandInputs } from '../types';
import type {
  Recipe,
  RecipeElement,
  GraphicIntent,
  ContentShape,
  CompositionStrategy,
  HoldPattern,
  TextSplitMode,
  EntrancePattern,
  ContentStructureSignature,
  ContentPartRole,
} from './recipe-types';
import { analyzeContentShape } from './content-shape-analyzer';
import {
  moveAccentLine, moveSideBar, moveBackdropCard,
  moveDivider, moveUnderline, moveKicker,
  moveBadge, moveBrackets, moveCornerMarks, moveAnnotationCallout,
} from './structural-moves';
import { generateBrandPattern } from './brand-pattern-generator';
import { deriveBrandRules } from './brand-composition-rules';
import { getCompositionTemplate } from './composition-templates';
import {
  enumerateNumericEncodingCandidates,
  selectNumericEncodingCandidate,
  type NumericEncodingCandidate,
  type NumericEncodingCandidateLayerScores,
  type NumericEncodingFacts,
} from './encoding-wires';
import { scoreAesthetic } from './eval/aesthetic';
import { combineLayers } from './eval/composite';
import { scoreLegibility } from './eval/legibility';

export type MgOverlayScores = Record<string, { score: number; values: Record<string, number | string | boolean> }>;

function mgVal(scores: MgOverlayScores | undefined, overlayId: string, param: string, fallback: number): number {
  const v = scores?.[overlayId]?.values[param];
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function mgWinner(scores: MgOverlayScores | undefined, prefix: string): string | undefined {
  if (!scores) return undefined;
  let best: { id: string; score: number } | undefined;
  for (const [id, data] of Object.entries(scores)) {
    if (id.startsWith(prefix) && (!best || data.score > best.score)) {
      best = { id, score: data.score };
    }
  }
  return best?.id;
}

// Emphasis = the modular type-scale ratio (gentle -> dramatic) scored from signals via
// mg.emphasis.scale_contrast. Composers derive their subordinate tiers from this ONE ratio
// (secondary = hero / r), so the size hierarchy emerges from the moment instead of a frozen
// per-composer ratio. Floor > 1 keeps the hero the largest element however the dial is calibrated.
function emphasisRatio(scores: MgOverlayScores | undefined): number {
  return Math.max(1.05, mgVal(scores, 'mg.emphasis.scale_contrast', 'scaleContrast', 2.0));
}

function signalNum(signals: PlannerSignals, ...keys: string[]): number {
  for (const key of keys) {
    const value = signals[key];
    if (typeof value === 'number' && isFinite(value)) return value;
  }
  return 0;
}

function visualFormRisk(signals: PlannerSignals): number {
  return clamp01(Math.max(
    signalNum(signals, 'visual_complexity', 'visual.complexity'),
    signalNum(signals, 'text_on_screen', 'visual.text_on_screen') * 0.95,
    signalNum(signals, 'text_coverage', 'visual.text_coverage'),
    signalNum(signals, 'motion_intensity', 'visual.motion_intensity') * 0.9,
    signalNum(signals, 'visual_significance', 'visual.significance') * 0.7,
  ));
}

function clamp01(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function textLoad(text: string | undefined): { charCount: number; wordCount: number } {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  return {
    charCount: normalized.length,
    wordCount: normalized ? normalized.split(/\s+/).length : 0,
  };
}

function isLongReadableCopy(text: string | undefined, charLimit: number, wordLimit: number): boolean {
  // INVENTED / CALIBRATION TARGET:
  // Callers pass provisional char/word thresholds for "copy is too long for hero sizing".
  // Tune these from rendered reference calibration, not from intuition.
  const load = textLoad(text);
  return load.charCount >= charLimit || load.wordCount >= wordLimit;
}

const CRG = {
  STAT_MIN_FONT: 64,              // constant:typography.stat_counter_min_font → 64px
  LOWER_THIRD_MIN_FONT: 48,      // constant:typography.lower_third_name_min_font → 48px
  LOWER_THIRD_TITLE_MIN_FONT: 36, // constant:typography.lower_third_title_min_font → 36px
  KEYWORD_MIN_FONT: 48,           // constant:typography.keyword_highlight_min_font → 48px
  QUOTE_MIN_FONT: 42,             // constant:typography.quote_card_min_font → 42px
  CALLOUT_MIN_FONT: 36,           // constant:typography.callout_label_min_font → 36px
  FORMALITY_HIGH: 0.7,            // mapping:entity.name_or_brand_mentioned.weightResponse.high → "0.7+"
  FORMALITY_MEDIUM: 0.4,          // mapping:entity.name_or_brand_mentioned.weightResponse.medium → "0.4-0.7"
} as const;

export interface PlannerSignals {
  formality: number;
  enthusiasm: number;
  warmth: number;
  emotional_arousal: number;
  pacing_velocity: number;
  humor: number;
  visceral_impact: number;
  visual_dependency: number;
  [key: string]: number | string | undefined;
}

export const DEFAULT_SIGNALS: PlannerSignals = {
  formality: 0,
  enthusiasm: 0.5,
  warmth: 0.5,
  emotional_arousal: 0.4,
  pacing_velocity: 0.5,
  humor: 0.1,
  visceral_impact: 0.3,
  visual_dependency: 0.5,
};

export function planComposition(
  intent: GraphicIntent,
  language: MotionTokens,
  signals?: Partial<PlannerSignals>,
  mgScores?: MgOverlayScores,
): Recipe {
  const s: PlannerSignals = { ...DEFAULT_SIGNALS, ...signals };
  const strategy = analyzeContentShape(intent.content, intent.kind, s);

  if (!signals) {
    console.warn('[MG-Planner] No content signals provided — using defaults.');
  }

  // D1: Signal-driven suppression — skip composition if budget is 0
  if (strategy.complexityBudget <= 0) {
    console.log('[MG-Planner] Budget=0 (montage/overlay suppression) — skipping composition');
    return { id: 'suppressed', elements: [], layout: strategy.suggestedLayout, exitStyle: strategy.suggestedExitStyle };
  }

  const elements = composeElements(strategy, language, s, intent.content, mgScores);

  // D1: emotional_alignment — boost confidence when face+voice agree
  // ⚠️ threshold 0.7 INVENTED — high alignment = face and voice express same emotion
  const alignment = typeof s.emotional_alignment === 'number' ? s.emotional_alignment : 0;
  if (alignment > 0.7 && elements.length > 0) {
    console.log(`[MG-Planner] High emotional alignment (${alignment.toFixed(2)}) — composition confidence boosted`);
  }

  // D1: energy_delta — rising energy suggests building tension, delay would improve timing
  // Negative delta (falling energy) = visual gap, graphics fill naturally
  // ⚠️ threshold 0.3 INVENTED — significant energy rise
  const energyDelta = typeof s.energy_delta === 'number' ? s.energy_delta : 0;
  if (energyDelta > 0.3 && elements.length > 0) {
    console.log(`[MG-Planner] Rising energy (delta=${energyDelta.toFixed(2)}) — consider delayed entrance`);
  }

  // D1: speech_coverage — high coverage means lots of content opportunities
  const speechCoverage = typeof s.speech_coverage === 'number' ? s.speech_coverage : 0;

  // D1: scene_type — talking-head favors lower-thirds, action favors simpler graphics
  const sceneType = typeof s.scene_type === 'string' ? s.scene_type : '';
  const primaryShapeKind = strategy.shapes[0]?.kind;
  if (sceneType === 'action' && elements.length > 3 && primaryShapeKind !== 'process') {
    console.log(`[MG-Planner] Action scene — simplifying (${elements.length} elements → capping at 3)`);
    elements.splice(3);
  }

  // D8: Signal-driven keyframe generation — "crazy edits" motion paths
  const entranceFrames = Math.round((language.animation.entranceDurationMs / 1000) * 30);
  resolveKeyframeTracks(elements, s, entranceFrames, strategy.holdDurationFrames, mgScores);

  // Text split resolution: kinetic per-character or per-word animation when signals are high-energy.
  // The renderer executes the split; the planner only decides WHEN.
  const entranceWinner = mgWinner(mgScores, 'mg.animation.entrance_');
  // Map overlay entrance winner → EntrancePattern value for recipe elements
  const ENTRANCE_WINNER_MAP: Record<string, EntrancePattern> = {
    'mg.animation.entrance_fade': 'fade',
    'mg.animation.entrance_pop': 'pop',
    'mg.animation.entrance_slide': 'slide-up',
    'mg.animation.entrance_blur': 'blur-in',
    'mg.animation.entrance_scale': 'scale-up',
    'mg.animation.entrance_rotate': 'rotate-in',
    'mg.animation.entrance_skew': 'skew-in',
    'mg.animation.entrance_zoom_blur': 'zoom-blur',
  };
  if (entranceWinner && ENTRANCE_WINNER_MAP[entranceWinner]) {
    const overlayEntrance = ENTRANCE_WINNER_MAP[entranceWinner];
    for (const el of elements) {
      if (el.primitive === 'text' && el.layer === 'foreground' && !el.entranceOverride) {
        el.entranceOverride = overlayEntrance;
      }
    }
  }

  const isKineticEntrance = entranceWinner === 'mg.animation.entrance_pop'
    || entranceWinner === 'mg.animation.entrance_slide'
    || entranceWinner === 'mg.animation.entrance_scale'
    || entranceWinner === 'mg.animation.entrance_skew'
    || entranceWinner === 'mg.animation.entrance_zoom_blur';
  if (isKineticEntrance) {
    // ⚠️ threshold 0.7 INVENTED — chars for high energy, words for moderate
    const splitMode: TextSplitMode = visualFormRisk(s) >= 0.72 ? 'words' : s.enthusiasm > 0.7 ? 'chars' : 'words';
    for (const el of elements) {
      // Never split a gradient-filled element — per-char spans would each get their own
      // gradient and break the continuous fill across the word.
      if (el.primitive === 'text' && el.layer === 'foreground' && !el.textSplit && !el.bind.textGradient) {
        el.textSplit = splitMode;
      }
    }
  }

  const kfCount = elements.filter(e => e.keyframeTracks?.length).length;
  console.log(
    `[MG-Planner] Composed: ${elements.length} elements (${kfCount} with keyframes), ` +
    `shapes=[${strategy.shapes.map(sh => sh.kind).join(',')}], ` +
    `layout=${strategy.suggestedLayout.position}, ` +
    `complexity=${strategy.complexityBudget}/5` +
    `${sceneType ? `, scene=${sceneType}` : ''}` +
    `${speechCoverage > 0 ? `, speechCov=${speechCoverage.toFixed(2)}` : ''}`,
  );

  // E1: Spatial intelligence — override layout position based on center_avoidance overlay score.
  // High centerAvoidance (face on camera, high speech) → shift from center to corners.
  // Low centerAvoidance → center is fine (B-roll, no face).
  let layout = strategy.suggestedLayout;
  const centerAvoidance = mgVal(mgScores, 'mg.layout.center_avoidance', 'centerAvoidance', -1);
  const bottomTextProtected = hasBottomTextOccupancy(s);
  if (centerAvoidance >= 0 && layout.position === 'center') {
    // ⚠️ threshold 0.6 INVENTED — above this, face/speech dominates → move to corner
    if (centerAvoidance > 0.6) {
      if (needsWideLayoutForFit(strategy, intent.content)) {
        layout = {
          ...layout,
          position: bottomTextProtected ? 'full-width-top' : 'full-width-bottom',
          maxWidth: '90%',
          captionZoneAware: bottomTextProtected || layout.captionZoneAware,
        };
        console.log(`[MG-Planner] Spatial: center→${layout.position} (centerAvoidance=${centerAvoidance.toFixed(2)}, wide-fit=true)`);
      } else {
        const positions = bottomTextProtected
          ? ['top-right', 'top-left', 'bottom-left', 'bottom-right'] as const
          : ['bottom-left', 'top-right', 'bottom-right', 'top-left'] as const;
        const idx = Math.min(positions.length - 1, Math.floor((centerAvoidance - 0.6) / 0.1));
        layout = { ...layout, position: positions[idx] };
        console.log(`[MG-Planner] Spatial: center→${layout.position} (centerAvoidance=${centerAvoidance.toFixed(2)})`);
      }
    }
  }
  if (bottomTextProtected && isBottomLayout(layout.position) && needsWideLayoutForFit(strategy, intent.content)) {
    layout = {
      ...layout,
      position: 'full-width-top',
      maxWidth: '90%',
      captionZoneAware: true,
    };
    console.log(`[MG-Planner] Spatial: bottom→${layout.position} (bottom text protected, wide-fit=true)`);
  }

  // Arrangement (row vs column) is SCORED — but LICENSED by an affordance first. Horizontal
  // (side-by-side) reads well ONLY when the shape has two PEER elements (comparison's before|after).
  // For hero+caption shapes (stat/identity/quote/callout) the second element is a SUBORDINATE caption
  // that belongs BELOW the hero, not in a column beside it — so they always stack vertical, however
  // the signal scores. The signal still picks the flow, but only among shapes a row can actually
  // serve. Same affordance x fit gate as form-selection ("a caption sits below its hero" is a law,
  // not a taste); without it, horizontal split stat/name/quote into disconnected, over-wrapped columns.
  const PEER_SHAPES = new Set<string>(['comparison']); // co-equal-peer shapes; extend as such shapes are added
  const supportsHorizontal = PEER_SHAPES.has(strategy.shapes[0]?.kind ?? '');
  const arrangement = (supportsHorizontal && mgWinner(mgScores, 'mg.arrangement.') === 'mg.arrangement.horizontal')
    ? 'horizontal-distributed' as const
    : 'vertical-stack' as const;
  layout = { ...layout, arrangement };

  return {
    id: `composed-${strategy.shapes[0]?.kind || 'unknown'}`,
    elements,
    layout,
    exitStyle: strategy.suggestedExitStyle,
  };
}

function hasBottomTextOccupancy(signals: PlannerSignals): boolean {
  return signalNum(signals, 'text_on_screen', 'visual.text_on_screen') > 0.45
    || signalNum(signals, 'text_coverage', 'visual.text_coverage') > 0.04
    || signalNum(signals, 'text_box_count', 'visual.text_box_count') > 0;
}

function isBottomLayout(position: string | undefined): boolean {
  return position === 'bottom-left' || position === 'bottom-right' || position === 'full-width-bottom';
}

function needsWideLayoutForFit(
  strategy: CompositionStrategy,
  content: Record<string, unknown>,
): boolean {
  const primaryKind = strategy.shapes[0]?.kind;
  if (primaryKind === 'numeric') {
    return isLongReadableCopy(scalarContentText(content.label), 15, 3);
  }
  if (primaryKind === 'identity') {
    return isLongReadableCopy(scalarContentText(content.title), 18, 3);
  }
  if (primaryKind === 'free-text') {
    return isLongReadableCopy(
      scalarContentText(content.text ?? content.keyword ?? content.emphasisWord),
      16,
      2,
    ) || isLongReadableCopy(scalarContentText(content.body), 24, 4);
  }
  return false;
}

function scalarContentText(value: unknown): string | undefined {
  if (value == null || Array.isArray(value) || typeof value === 'object') return undefined;
  return String(value);
}

function composeElements(
  strategy: CompositionStrategy,
  language: MotionTokens,
  signals: PlannerSignals,
  content: Record<string, unknown>,
  mgScores?: MgOverlayScores,
): RecipeElement[] {
  const elements: RecipeElement[] = [];
  // Budget is owned entirely by computeComplexityBudget (content-shape-analyzer), which is
  // now importance-driven and already factors in cinematic_moment. Single source of truth —
  // no separate cinematic boost here (that double-counted importance).
  const budget = strategy.complexityBudget;
  const allowDecorativeVisuals = visualFormRisk(signals) < 0.72 && !hasBottomTextOccupancy(signals);

  const primary = strategy.shapes[0];
  if (!primary) {
    elements.push(makeTextElement('primary', 'content:text', language));
    return elements;
  }

  composeFromStructure(elements, strategy, language, signals, mgScores);
  applyStructuralAffordanceMotion(elements, strategy, signals);

  const holdPattern = resolveHoldPattern(signals, mgScores);
  if (holdPattern !== 'static') {
    for (const el of elements) {
      if (el.layer === 'foreground') {
        el.holdAnimation = holdPattern;
      }
    }
  }

  // Tier 3: signal-selected structural-move vocabulary. Runs AFTER the hold loop so
  // structural elements (rules, bars, kicker) stay stable — no ambient bob. Replaces
  // the old inline makeContainer/makeAccentLine with overlay-scored selection.
  runStructuralMoves(elements, language, signals, budget, content, mgScores);

  // Brand pattern: subtle background texture derived from brand tokens
  // Budget >= 4 required — pattern is lowest priority decorative element
  // ⚠️ Budget threshold 4 INVENTED — pattern should only appear on complex compositions
  if (budget >= 4) {
    const brandFromTokens: Partial<BrandInputs> = {
      accentColor: language.color.accent,
      primaryColor: language.color.primary,
      headingFont: language.typography.headingFamily,
      bodyFont: language.typography.bodyFamily,
    };
    const brandRules = deriveBrandRules(brandFromTokens);
    const pattern = generateBrandPattern(brandFromTokens, brandRules);

    if (pattern.type !== 'none' && pattern.css !== 'none') {
      elements.push({
        primitive: 'pattern',
        role: 'brand-pattern',
        layer: 'background',
        bind: {
          backgroundImage: pattern.css,
          patternOpacity: pattern.opacity,
          fill: 'transparent',
        },
      });
    }
  }

  // Particle effects: atmospheric background decorations (math-driven, not @tsparticles)
  // ⚠️ budget >= 4 INVENTED — particles are decorative, same tier as brand patterns
  // ⚠️ score threshold 0.15 INVENTED — prevents low-confidence particle activation
  const particleWinner = mgWinner(mgScores, 'mg.particle.');
  if (particleWinner && budget >= 4 && allowDecorativeVisuals) {
    const pScore = mgVal(mgScores, particleWinner, 'particleScore', 0);
    if (pScore >= 0.15) {
      const preset = particleWinner.split('.').pop() || 'confetti';
      // ⚠️ INVENTED — count maps score linearly: 0.15→10, 1.0→70 particles
      const pCount = Math.round(10 + pScore * 60);
      elements.push({
        primitive: 'particle',
        role: 'ambient-particles',
        layer: 'background',
        bind: {
          particlePreset: preset,
          particleCount: pCount,
          color: language.color.accent,
          secondaryColor: language.color.primary,
          size: 6,
        },
      });
    }
  }

  // Mask reveals: cinematic clip-path decorative shapes — NOT on emphasis (keyword highlights)
  // ⚠️ budget >= 5 INVENTED — masks are visually dominant, only on highest-complexity compositions
  // ⚠️ score threshold 0.5 INVENTED — masks should be rare accents, not on every graphic
  const maskWinner = mgWinner(mgScores, 'mg.mask.');
  if (maskWinner && budget >= 5 && primary.kind !== 'emphasis' && allowDecorativeVisuals) {
    const mScore = mgVal(mgScores, maskWinner, 'maskScore', 0);
    if (mScore >= 0.5) {
      const isCircle = maskWinner.includes('circle');
      elements.push({
        primitive: 'mask',
        role: 'reveal-mask',
        layer: 'background',
        shape: isCircle ? 'circle' : 'rect',
        bind: {
          color: `${language.color.accent}33`,
          direction: isCircle ? 'center' : 'left',
        },
      });
    }
  }

  return elements;
}

function composeFromStructure(
  elements: RecipeElement[],
  strategy: CompositionStrategy,
  language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const shape = <K extends ContentShape['kind']>(kind: K): Extract<ContentShape, { kind: K }> | undefined => (
    strategy.shapes.find((candidate): candidate is Extract<ContentShape, { kind: K }> => candidate.kind === kind)
  );

  if (hasRelation(strategy.structure, 'compares')) {
    const comparison = shape('comparison');
    if (comparison) return composeComparison(elements, comparison, language, mgScores);
  }
  const seriesCardinality = typeof strategy.structure.evidence.seriesCardinality === 'number'
    ? strategy.structure.evidence.seriesCardinality
    : 0;
  if (hasPart(strategy.structure, 'primary-value') && seriesCardinality <= 1) {
    const numeric = shape('numeric');
    if (numeric) return composeNumeric(elements, numeric, strategy.structure, language, signals, mgScores);
  }
  if (hasPart(strategy.structure, 'series-values')) {
    const series = shape('data-series');
    if (series) return composeDataSeries(elements, series, language);
  }
  if (hasPart(strategy.structure, 'primary-value')) {
    const numeric = shape('numeric');
    if (numeric) return composeNumeric(elements, numeric, strategy.structure, language, signals, mgScores);
  }
  if (hasPart(strategy.structure, 'name')) {
    const identity = shape('identity');
    if (identity) return composeIdentity(elements, identity, language, signals, mgScores);
  }
  if (hasPart(strategy.structure, 'quote')) {
    const quotation = shape('quotation');
    if (quotation) return composeQuotation(elements, quotation, language, mgScores);
  }
  if (hasPart(strategy.structure, 'brand-text') || hasPart(strategy.structure, 'logo')) {
    const brand = shape('brand');
    if (brand) return composeBrand(elements, brand, language, signals, mgScores);
  }
  if (hasPart(strategy.structure, 'list-items')) {
    const process = shape('process');
    if (process) return composeProcess(elements, process, language, signals, mgScores);
  }
  if (hasPart(strategy.structure, 'title') && hasPart(strategy.structure, 'body')) {
    const structured = shape('structured');
    if (structured) return composeStructured(elements, structured, language, mgScores);
  }
  if (hasPart(strategy.structure, 'emphasis-text')) {
    const emphasis = shape('emphasis');
    if (emphasis) return composeEmphasis(elements, emphasis, language, signals, mgScores);
  }

  const fallback = shape('free-text') ?? strategy.shapes[0];
  const template = fallback ? getCompositionTemplate(fallback.kind) : undefined;
  if (template && fallback) {
    elements.push(...template.compose(fallback as unknown as Record<string, unknown>, language, signals));
  } else {
    elements.push(makeTextElement('primary', 'content:text', language));
  }
}

function hasPart(structure: ContentStructureSignature, role: ContentPartRole): boolean {
  return structure.parts.some((part) => part.role === role);
}

function hasRelation(structure: ContentStructureSignature, type: ContentStructureSignature['relations'][number]['type']): boolean {
  return structure.relations.some((relation) => relation.type === type);
}

function applyStructuralAffordanceMotion(
  elements: RecipeElement[],
  strategy: CompositionStrategy,
  signals: PlannerSignals,
): void {
  const evidence = strategy.structure.evidence;
  const salience = typeof evidence.salience === 'number' ? evidence.salience : 0;
  const lowVisualRisk = visualFormRisk(signals) < 0.62;

  for (const element of elements) {
    if (element.role === 'proportion-boundary-rule' || element.role === 'truth-negation-strike') {
      element.entranceOverride = 'draw';
      element.exitOverride = 'draw-reverse';
    }

    if (
      salience >= 0.85
      && lowVisualRisk
      && element.layer === 'foreground'
      && (element.role === 'primary' || element.role === 'counter')
      && !element.entranceOverride
    ) {
      element.entranceOverride = evidence.negationAffordance === true ? 'slide-left' : 'pop';
    }
  }
}

function composeNumeric(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'numeric' }>,
  structure: ContentStructureSignature,
  language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const fontSize = Math.max(CRG.STAT_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.STAT_MIN_FONT));
  const primaryLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.1);
  const secondaryLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.3);
  const letterTracking = mgVal(mgScores, 'mg.typography.letter_tracking', 'letterTracking', 0);
  const evidence = structure.evidence;
  const recentEncodingKeys = String(signals.recent_numeric_encoding_key ?? signals.recentNumericEncodingKey ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  const encodingInput = {
    value: shape.value,
    label: shape.label,
    prefix: shape.prefix,
    suffix: shape.suffix,
    evidence,
  };
  const encodingOptions = {
    signalEnergy: Math.max(signals.enthusiasm, signals.emotional_arousal, signals.visceral_impact),
    visualRisk: visualFormRisk(signals),
    formality: signals.formality,
    recentEncodingKeys,
  };
  const candidateSet = enumerateNumericEncodingCandidates(encodingInput, encodingOptions);
  const candidateLayerScores = scoreNumericEncodingCandidateRecipes(
    candidateSet.candidates,
    candidateSet.facts,
    shape,
    language,
    fontSize,
    primaryLineHeight,
    recentEncodingKeys,
  );
  const encoding = selectNumericEncodingCandidate(encodingInput, {
    ...encodingOptions,
    candidateLayerScores,
  });
  const facts = encoding.facts;
  const selectedEncoding = encoding.selected;
  const labelText = String(shape.label ?? '').toLowerCase();
  const isRate = facts.valueKind === 'tiny-decimal'
    || /\b(per|rate|daily|weekly|monthly|yearly|frequency|average)\b/.test(labelText);
  const monoValue = isRate || facts.valueKind === 'fraction' || facts.valueKind === 'ratio';
  const compactStatic = monoValue || facts.valueKind === 'magnitude';
  const valueSize = compactStatic ? Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, fontSize / 1.18) : fontSize;

  if (
    selectedEncoding.renderKind === 'data-viz'
    && selectedEncoding.encodingChannel
    && selectedEncoding.dataValues
  ) {
    elements.push({
      primitive: 'data-viz',
      role: `numeric-${selectedEncoding.encodingChannel}`,
      layer: 'foreground',
      animation: 'grow-up',
      bind: {
        values: selectedEncoding.dataValues,
        labels: shape.label ?? '',
        encodingChannel: selectedEncoding.encodingChannel,
        color: 'token:color.accent',
        textColor: 'token:color.textPrimary',
        font: 'token:typography.bodyFamily',
      },
    });
  }

  elements.push({
    primitive: 'text',
    role: 'counter',
    layer: 'foreground',
    animation: facts.canCountUp ? 'count-up' : 'none',
    bind: {
      text: 'content:value',
      prefix: 'content:prefix',
      suffix: 'content:suffix',
      font: monoValue || signals.formality <= CRG.FORMALITY_HIGH
        ? 'token:typography.monoFamily'
        : 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: selectedEncoding.primaryWire === 'sweep' || facts.valueKind === 'percent'
        ? 'token:color.accent'
        : 'token:color.textPrimary',
      sizeScale: 'token:typography.sizeScale',
      minSize: valueSize,
      lineHeight: primaryLineHeight,
    },
  });

  if (facts.valueKind === 'tiny-decimal' && isRate) {
    elements.push({
      primitive: 'decoration',
      role: 'numeric-sparse-rate-trace',
      layer: 'foreground',
      shape: 'line',
      anchor: { mode: 'flow-span', thickness: 1 },
      bind: {
        color: 'token:color.accent',
        width: 1,
        opacity: 0.22,
      },
    });
  }

  const ruleKind = isRate
    ? 'rate'
    : facts.valueKind === 'fraction' || facts.valueKind === 'ratio' ? facts.valueKind : undefined;
  if (ruleKind) {
    elements.push({
      primitive: 'decoration',
      role: `numeric-${ruleKind}-rule`,
      layer: 'foreground',
      shape: 'line',
      anchor: { mode: 'flow-span', thickness: ruleKind === 'rate' ? 2 : 1 },
      bind: {
        color: 'token:color.accent',
        width: ruleKind === 'rate' ? 2 : 1,
        opacity: ruleKind === 'rate' ? 0.7 : 0.45,
      },
    });
  }

  if (facts.boundedProportion) {
    elements.push({
      primitive: 'decoration',
      role: 'proportion-boundary-rule',
      layer: 'foreground',
      shape: 'line',
      anchor: { mode: 'flow-span', thickness: evidence.boundedRange === true ? 3 : 2 },
      bind: {
        color: 'token:color.accent',
        width: evidence.boundedRange === true ? 3 : 2,
        opacity: evidence.boundedRange === true ? 0.72 : 0.55,
      },
    });
  }

  if (facts.negated) {
    elements.push({
      primitive: 'decoration',
      role: 'truth-negation-strike',
      layer: 'foreground',
      shape: 'line',
      anchor: { mode: 'flow-span', thickness: 3 },
      bind: {
        color: 'token:color.accent',
        width: 3,
        opacity: 0.82,
      },
    });
  }

  if (shape.label) {
    // CRG-floored size: without minSize, buildTextStyle leaves fontSize undefined → ~16px default
    // on a 1080p canvas (illegible). Same pattern as composeIdentity title / composeStructured body.
    const labelSize = Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, fontSize / emphasisRatio(mgScores)); // caption one modular step below the hero (was *0.75)
    elements.push({
      primitive: 'text',
      role: 'label',
      layer: 'foreground',
      bind: {
        text: 'content:label',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        tracking: isRate
          ? '0.08em'
          : letterTracking > 0 ? `${letterTracking.toFixed(3)}em` : 'token:typography.headingTracking',
        minSize: labelSize,
        lineHeight: secondaryLineHeight,
      },
    });
  }
}

function scoreNumericEncodingCandidateRecipes(
  candidates: NumericEncodingCandidate[],
  facts: NumericEncodingFacts,
  shape: Extract<ContentShape, { kind: 'numeric' }>,
  language: MotionTokens,
  fontSize: number,
  lineHeight: number,
  recentEncodingKeys: string[],
): Record<string, NumericEncodingCandidateLayerScores> {
  const scores: Record<string, NumericEncodingCandidateLayerScores> = {};
  for (const candidate of candidates) {
    const recipe: Recipe = {
      id: `composed-${candidate.encodingKey}`,
      layout: { position: 'center', arrangement: 'vertical-stack' },
      exitStyle: 'simultaneous-fade',
      elements: buildNumericEncodingCandidateElements(candidate, facts, shape, fontSize, lineHeight),
    };
    const legibility = scoreLegibility(recipe, language);
    const aesthetic = scoreAesthetic(recipe, { recentForms: recentEncodingKeys, window: 4 });
    const composite = combineLayers([legibility, aesthetic], { ok: true });
    scores[candidate.encodingKey] = {
      legibility: legibility.score,
      aesthetic: aesthetic.score,
      composite: composite.composite,
      failsLegibilityFloor: composite.failsLegibilityFloor,
    };
  }
  return scores;
}

function buildNumericEncodingCandidateElements(
  candidate: NumericEncodingCandidate,
  facts: NumericEncodingFacts,
  shape: Extract<ContentShape, { kind: 'numeric' }>,
  fontSize: number,
  lineHeight: number,
): RecipeElement[] {
  const elements: RecipeElement[] = [];
  if (candidate.renderKind === 'data-viz' && candidate.encodingChannel && candidate.dataValues) {
    elements.push({
      primitive: 'data-viz',
      role: `numeric-${candidate.encodingChannel}`,
      layer: 'foreground',
      animation: 'grow-up',
      bind: {
        values: candidate.dataValues,
        labels: shape.label ?? '',
        encodingChannel: candidate.encodingChannel,
        color: 'token:color.accent',
        textColor: 'token:color.textPrimary',
        font: 'token:typography.bodyFamily',
      },
    });
  }
  elements.push({
    primitive: 'text',
    role: 'counter',
    layer: 'foreground',
    animation: facts.canCountUp ? 'count-up' : 'none',
    bind: {
      text: 'content:value',
      prefix: 'content:prefix',
      suffix: 'content:suffix',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: candidate.primaryWire === 'sweep' ? 'token:color.accent' : 'token:color.textPrimary',
      minSize: fontSize,
      lineHeight,
    },
  });
  if (shape.label) {
    elements.push({
      primitive: 'text',
      role: 'label',
      layer: 'foreground',
      bind: {
        text: 'content:label',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, fontSize / 2),
        lineHeight: 1.2,
      },
    });
  }
  return elements;
}

// Comparison (before/after or versus). The "to" is the visual PAYOFF (accent colour, full size,
// hero role); the "from" is de-emphasized (secondary colour, smaller); a connector glyph drives
// the eye to the resolution. Sizes come from the signal dial; colours from brand/semantic tokens —
// the LOOK is never baked into the form (Rule 11). Flow text in the centered column (reliable);
// a horizontal group layout is a later refinement.
function composeComparison(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'comparison' }>,
  _language: MotionTokens,
  mgScores?: MgOverlayScores,
): void {
  // Emphasis is SCORED, not a frozen ratio: mg.emphasis.scale_contrast outputs a modular type-scale
  // ratio (gentle -> dramatic) from THIS moment's signals (energetic = punchy hierarchy, formal =
  // measured). Every tier is one scale-step down from the hero: from = value/r, label = value/r^2,
  // connector = value/r^1.5 (a relational glyph sitting between the subordinate value and its caption).
  // Deriving all tiers from ONE ratio GUARANTEES the hierarchy law (value > from > connector > label
  // for any r > 1) — independent per-tier ratios could invert it (the old connector*1.3 did, at the
  // floor). Bounds 1.4-2.2 are standard modular-scale steps (root2 aug-4th .. 2.0 octave); the curve
  // is INVENTED, calibration-pending (reference-video tuning) — the MECHANISM is the law, params are not.
  const scaleContrast = emphasisRatio(mgScores);
  const valueSize = Math.max(CRG.STAT_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.STAT_MIN_FONT));
  const fromSize = Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, valueSize / scaleContrast);
  const labelSize = Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, valueSize / (scaleContrast * scaleContrast));
  const lineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.1);
  // Connector follows the SCORED arrangement: → drives a horizontal row, ↓ a vertical stack.
  const horizontal = mgWinner(mgScores, 'mg.arrangement.') === 'mg.arrangement.horizontal';
  const connector = shape.relation === 'vs' ? 'vs' : (horizontal ? '→' : '↓');

  // FROM — the "before", de-emphasized
  elements.push({
    primitive: 'text', role: 'secondary', layer: 'foreground',
    bind: {
      text: 'content:from', font: 'token:typography.headingFamily', weight: 'token:typography.bodyWeight',
      color: 'token:color.textSecondary', minSize: fromSize, lineHeight,
    },
  });
  if (shape.fromLabel) {
    elements.push({
      primitive: 'text', role: 'label', layer: 'foreground',
      bind: {
        text: 'content:fromLabel', font: 'token:typography.bodyFamily', weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary', transform: 'uppercase', tracking: '0.08em', minSize: labelSize, lineHeight: 1.2,
      },
    });
  }

  // CONNECTOR — accent glyph driving to the payoff (↓ transformation, vs comparison)
  elements.push({
    primitive: 'text', role: 'label', layer: 'foreground',
    bind: {
      text: connector, font: 'token:typography.headingFamily', weight: 700,
      color: 'token:color.accent', minSize: Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, Math.round(valueSize / Math.pow(scaleContrast, 1.5))), lineHeight: 1,
    },
  });

  // TO — the PAYOFF: accent colour, full size, hero role (one focal point → passes the gate)
  elements.push({
    primitive: 'text', role: 'primary', layer: 'foreground',
    bind: {
      text: 'content:to', font: 'token:typography.headingFamily', weight: 'token:typography.headingWeight',
      color: 'token:color.accent', minSize: valueSize, lineHeight,
    },
  });
  if (shape.toLabel) {
    elements.push({
      primitive: 'text', role: 'label', layer: 'foreground',
      bind: {
        text: 'content:toLabel', font: 'token:typography.bodyFamily', weight: 'token:typography.bodyWeight',
        color: 'token:color.textPrimary', transform: 'uppercase', tracking: '0.08em', minSize: labelSize, lineHeight: 1.2,
      },
    });
  }
}

function composeIdentity(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'identity' }>,
  _language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const primarySize = Math.max(CRG.LOWER_THIRD_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.LOWER_THIRD_MIN_FONT));
  const primaryLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.1);
  const letterTracking = mgVal(mgScores, 'mg.typography.letter_tracking', 'letterTracking', 0);

  // Avatar/headshot (when content provides one — e.g. from the brief or a future brand layer).
  // Consumer-ready: renders a circular headshot leading the lower-third. No producer wires
  // content.avatar yet, so this is dormant until one does (then it activates automatically).
  // ⚠️ 64px INVENTED — standard lower-third headshot size.
  if (shape.avatar) {
    elements.push({
      primitive: 'image',
      role: 'avatar',
      layer: 'foreground',
      bind: { src: 'content:avatar', width: 64, height: 64, radius: 999 },
    });
  }

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:name',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
      tracking: letterTracking > 0 ? `${letterTracking.toFixed(3)}em` : 'token:typography.headingTracking',
      transform: 'token:typography.headingTransform',
      minSize: primarySize,
      lineHeight: primaryLineHeight,
    },
  });

  if (shape.title) {
    const titleSize = Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, primarySize / emphasisRatio(mgScores)); // subtitle one modular step below the name (was *0.75)
    const titleLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.3);

    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:title',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: titleSize,
        lineHeight: titleLineHeight,
      },
    });
  }
}

function composeQuotation(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'quotation' }>,
  language: MotionTokens,
  mgScores?: MgOverlayScores,
): void {
  const scoredQuoteSize = Math.max(CRG.QUOTE_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.QUOTE_MIN_FONT));
  // INVENTED / CALIBRATION TARGET: quote length gate, 64px cap, and 1.16-1.28 line-height clamp.
  const longQuote = isLongReadableCopy(shape.quote, 44, 8);
  const quoteSize = longQuote ? Math.min(scoredQuoteSize, 64) : scoredQuoteSize;
  const scoredLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.4);
  const quoteLineHeight = longQuote ? Math.max(1.16, Math.min(1.28, scoredLineHeight)) : scoredLineHeight;

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:quote',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.bodyWeight',
      color: 'token:color.textPrimary',
      minSize: quoteSize,
      lineHeight: quoteLineHeight,
    },
  });

  if (shape.author) {
    const authorLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.2);
    // CRG-floored size so the author line is legible (without minSize, fontSize is undefined → ~16px).
    const authorSize = Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, quoteSize / emphasisRatio(mgScores)); // attribution one modular step below the quote (was *0.75)

    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:author',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: authorSize,
        lineHeight: authorLineHeight,
      },
    });
  }
}

function composeEmphasis(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'emphasis' }>,
  language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const accentUsage = mgVal(mgScores, 'mg.color.accent_usage', 'accentUsage', -1);
  const informal = accentUsage >= 0 ? accentUsage > 0.4 : signals.formality < CRG.FORMALITY_MEDIUM;
  const rawOpacity = mgVal(mgScores, 'mg.styling.container_opacity', 'containerOpacity', -1);
  const pillOpacity = rawOpacity >= 0 ? rawOpacity * 0.25 : 0.15;
  const cornerRadius = mgVal(mgScores, 'mg.styling.corner_radius', 'cornerRadius', 999);

  if (informal) {
    elements.push({
      primitive: 'container',
      role: 'container',
      layer: 'midground',
      shape: 'pill',
      bind: {
        fill: 'token:color.accent',
        opacity: pillOpacity,
        radius: cornerRadius > 12 ? 999 : cornerRadius,
      },
    });
  }

  const keywordSize = Math.max(CRG.KEYWORD_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.KEYWORD_MIN_FONT));

  // Energy-responsive caps: a high-energy delivery "shouts" the keyword in uppercase.
  // Driven by enthusiasm/emotional_arousal (reliable personality signals) — NOT the Wav2Vec
  // speech-energy baseline, which is often 0 when the model fails. ⚠️ 0.7 threshold INVENTED.
  const deliveryEnergy = Math.max(
    typeof signals.enthusiasm === 'number' ? signals.enthusiasm : 0,
    typeof signals.emotional_arousal === 'number' ? signals.emotional_arousal : 0,
  );
  const emphaticCaps = deliveryEnergy > 0.7;

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:text',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: informal ? 'token:color.accent' : 'token:color.textPrimary',
      minSize: keywordSize,
      transform: emphaticCaps ? 'uppercase' : 'token:typography.headingTransform',
    },
  });
}

function composeBrand(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'brand' }>,
  language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const letterTracking = mgVal(mgScores, 'mg.typography.letter_tracking', 'letterTracking', 0.08);
  const textTransform = mgVal(mgScores, 'mg.typography.text_transform_tendency', 'textTransformScore', 1);

  // Brand logo (when content provides one — future brand/Graphiti layer). Consumer-ready:
  // renders the logo above the brand name. Dormant until a producer wires content.logo.
  // ⚠️ 96x40 INVENTED — wide logo lockup; objectFit contain preserves aspect ratio.
  if (shape.logo) {
    elements.push({
      primitive: 'image',
      role: 'logo',
      layer: 'foreground',
      bind: { src: 'content:logo', height: 40 },
    });
  }

  // Gradient wordmark: a rare premium accent for energetic brand moments. Derived from the
  // brand's own primary→accent tokens (not invented colours), gated on a real colour contrast
  // existing AND high-energy delivery. ⚠️ 0.6 energy threshold INVENTED.
  const deliveryEnergy = Math.max(
    typeof signals.enthusiasm === 'number' ? signals.enthusiasm : 0,
    typeof signals.emotional_arousal === 'number' ? signals.emotional_arousal : 0,
  );
  const useGradient = language.color.accent !== language.color.primary && deliveryEnergy > 0.6;

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:text',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.primary',
      tracking: `${letterTracking.toFixed(3)}em`,
      transform: textTransform > 0.35 ? 'uppercase' : 'none',
      ...(useGradient ? { textGradient: `linear-gradient(135deg, ${language.color.primary}, ${language.color.accent})` } : {}),
    },
  });
}

function composeStructured(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'structured' }>,
  language: MotionTokens,
  mgScores?: MgOverlayScores,
): void {
  const primaryLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.1);
  // Title is the HERO — it MUST carry an explicit size, else the renderer leaves fontSize undefined
  // (~16px) and the body reads larger than the title (inverted hierarchy). Body sits one step below.
  // INVENTED / CALIBRATION TARGET: body length gates, 96px title cap, 54px body cap,
  // and 1.18-1.34 body line-height clamp for long structured copy.
  const longBody = isLongReadableCopy(shape.body, 40, 6);
  const longStructuredCopy = isLongReadableCopy([shape.title, shape.body].filter(Boolean).join(' '), 48, 7);
  const scoredTitleSize = Math.max(CRG.KEYWORD_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.KEYWORD_MIN_FONT));
  const titleSize = longStructuredCopy ? Math.min(scoredTitleSize, 96) : scoredTitleSize;

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:title',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
      minSize: titleSize,
      lineHeight: primaryLineHeight,
    },
  });

  if (shape.body) {
    const scoredBodySize = Math.max(CRG.CALLOUT_MIN_FONT, titleSize / emphasisRatio(mgScores)); // body one modular step below the title hero
    const bodySize = longBody ? Math.min(scoredBodySize, 54) : scoredBodySize;
    const scoredBodyLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.4);
    const bodyLineHeight = longBody ? Math.max(1.18, Math.min(1.34, scoredBodyLineHeight)) : scoredBodyLineHeight;

    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:body',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: bodySize,
        lineHeight: bodyLineHeight,
      },
    });
  }
}

function composeProcess(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'process' }>,
  _language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const scaleContrast = emphasisRatio(mgScores);
  const scoredTitleSize = Math.max(CRG.KEYWORD_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.KEYWORD_MIN_FONT));
  const titleSize = Math.min(scoredTitleSize, 88);
  const bodySize = Math.max(CRG.CALLOUT_MIN_FONT, titleSize / scaleContrast);
  const stepSize = Math.max(30, Math.min(54, bodySize));
  const connectorSize = Math.max(24, Math.round(stepSize / 1.35));
  const lineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.18);
  const risk = visualFormRisk(signals);
  const fastSpeech = signalNum(signals, 'speaking_rate_wpm') > 185;
  // INVENTED / CALIBRATION TARGET: readable process stacks should land 3-4 steps
  // on a 1080p frame. Tune max visible steps from rendered reference calibration.
  const maxVisibleSteps = risk > 0.62 || fastSpeech ? 3 : 4;
  const visibleSteps = shape.steps.slice(0, maxVisibleSteps);
  const hiddenCount = Math.max(0, shape.steps.length - visibleSteps.length);

  if (shape.title) {
    elements.push({
      primitive: 'text',
      role: 'primary',
      layer: 'foreground',
      bind: {
        text: 'content:title',
        font: 'token:typography.headingFamily',
        weight: 'token:typography.headingWeight',
        color: 'token:color.textPrimary',
        minSize: titleSize,
        lineHeight: Math.max(1.04, Math.min(1.18, lineHeight)),
      },
    });
  }

  if (shape.body) {
    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      textSplit: 'none',
      bind: {
        text: 'content:body',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: Math.min(bodySize, 46),
        lineHeight: Math.max(1.16, Math.min(1.32, lineHeight)),
      },
    });
  }

  if ((shape.title || shape.body) && visibleSteps.length > 0) {
    elements.push({
      primitive: 'decoration',
      role: 'process-progress-rule',
      layer: 'foreground',
      shape: 'line',
      entranceOverride: 'draw',
      exitOverride: 'draw-reverse',
      anchor: { mode: 'flow-span', thickness: 2 },
      bind: {
        color: 'token:color.accent',
        width: 2,
        opacity: 0.76,
      },
    });
  }

  visibleSteps.forEach((step, index) => {
    if (index > 0) {
      elements.push({
        primitive: 'text',
        role: `process-connector-${index}`,
        layer: 'foreground',
        textSplit: 'none',
        bind: {
          text: '↓',
          font: 'token:typography.headingFamily',
          weight: 'token:typography.headingWeight',
          color: 'token:color.accent',
          minSize: connectorSize,
          lineHeight: 0.9,
        },
      });
    }

    const stepLabel = shape.ordered
      ? `${String(index + 1).padStart(2, '0')}  ${step}`
      : `•  ${step}`;
    elements.push({
      primitive: 'text',
      role: (!shape.title && !shape.body && index === 0) ? 'primary' : `process-step-${index + 1}`,
      layer: 'foreground',
      textSplit: 'none',
      bind: {
        text: stepLabel,
        font: 'token:typography.bodyFamily',
        weight: index === 0 ? 'token:typography.headingWeight' : 'token:typography.bodyWeight',
        color: index === visibleSteps.length - 1 ? 'token:color.accent' : 'token:color.textPrimary',
        minSize: stepSize,
        lineHeight: Math.max(1.12, Math.min(1.28, lineHeight)),
      },
    });
  });

  if (hiddenCount > 0) {
    elements.push({
      primitive: 'text',
      role: 'process-overflow-count',
      layer: 'foreground',
      textSplit: 'none',
      bind: {
        text: `+${hiddenCount} more`,
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: Math.max(28, stepSize / scaleContrast),
        lineHeight: 1.1,
      },
    });
  }
}

function composeDataSeries(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'data-series' }>,
  _language: MotionTokens,
): void {
  const values = shape.values || [];
  if (values.length === 0) return;

  // Chart TYPE is inferred from the data shape — NOT a preset:
  //   1 value in 0-100 → percentage ring (part-of-whole)
  //   5+ values        → sparkline (time-series trend)
  //   else             → bar chart (comparison)
  // ⚠️ sparkline threshold (>= 5 values) INVENTED — needs calibration.
  // Rendered by DataVizElement as animated SVG (the data-viz primitive); colors/font
  // bind to brand tokens; the structural-move vocabulary wraps it (backdrop, kicker…).
  const role = shape.visualForm;

  elements.push({
    primitive: 'data-viz',
    role,
    layer: 'foreground',
    animation: 'grow-up',
    bind: {
      values: 'content:values',
      labels: 'content:labels',
      color: 'token:color.accent',
      textColor: 'token:color.textPrimary',
      font: 'token:typography.bodyFamily',
    },
  });
}

function resolveKeyframeTracks(
  elements: RecipeElement[],
  signals: PlannerSignals,
  entranceFrames: number,
  holdDurationFrames: number,
  mgScores?: MgOverlayScores,
): void {
  const holdStart = entranceFrames;
  const holdEnd = entranceFrames + holdDurationFrames;
  const fontSizeScore = mgScores?.['mg.typography.font_size']?.score ?? -1;

  for (const el of elements) {
    if (el.layer !== 'foreground') continue;

    // ⚠️ drift threshold INVENTED — only dramatic content triggers drift
    // ⚠️ 15px drift INVENTED — AE practice: 10-20px for subtle hold drift
    const driftTrigger = fontSizeScore >= 0 ? fontSizeScore > 0.6 : signals.visceral_impact > 0.7;
    if (driftTrigger && el.role === 'primary') {
      el.keyframeTracks = [{
        property: 'translateY',
        keyframes: [
          { frame: holdStart, value: 0, easing: 'ease-out' },
          { frame: holdEnd, value: -15, easing: 'ease-in-out' },
        ],
      }];
    }

    // ⚠️ pulse thresholds INVENTED — fast energetic content
    // ⚠️ 1.05 scale pulse INVENTED — CRG overshoot 102-105% range
    const pulseScore = mgScores?.['mg.animation.hold_pulse']?.score ?? -1;
    const pulseTrigger = pulseScore >= 0 ? pulseScore > 0.3 : (signals.enthusiasm > 0.8 && signals.pacing_velocity > 0.6);
    if (pulseTrigger && el.animation === 'count-up') {
      const mid = Math.floor((holdStart + holdEnd) / 2);
      el.keyframeTracks = [{
        property: 'scaleX',
        keyframes: [
          { frame: holdStart, value: 1, easing: 'ease-out' },
          { frame: mid, value: 1.05, easing: 'ease-in-out' },
          { frame: holdEnd, value: 1, easing: 'ease-in' },
        ],
      }, {
        property: 'scaleY',
        keyframes: [
          { frame: holdStart, value: 1, easing: 'ease-out' },
          { frame: mid, value: 1.05, easing: 'ease-in-out' },
          { frame: holdEnd, value: 1, easing: 'ease-in' },
        ],
      }];
    }
  }
}

function resolveHoldPattern(signals: PlannerSignals, mgScores?: MgOverlayScores): HoldPattern {
  const winner = mgWinner(mgScores, 'mg.animation.hold_');
  // ⚠️ threshold 0.15 INVENTED — hold winner must score above this to override static default.
  // Without this gate, even barely-scoring hold overlays (0.02) would trigger ambient motion
  // on calm content where static is correct.
  const winnerScore = winner ? (mgScores?.[winner]?.score ?? 0) : 0;
  if (winner && winnerScore > 0.15) {
    if (winner === 'mg.animation.hold_pulse') return 'pulse';
    if (winner === 'mg.animation.hold_breathe') return 'breathe';
    if (winner === 'mg.animation.hold_float') return 'gentle-float';
    if (winner === 'mg.animation.hold_glow') return 'glow';
  }
  // D-016: No hardcoded if-statement fallbacks. Overlay scoring is the decision system.
  // gentle-float is the universal minimum — static (zero motion) looks dead.
  return 'gentle-float';
}

// ─── Structural-move vocabulary runner ──────────────────────────────────────
// Signal-selected structural register. Scores every mg.structure.* move, resolves
// mutually-exclusive conflict groups, and composes only the TOP-K by score — where K
// scales with budget. A director uses 1-3 structural treatments, never 6, so the cap
// (not just a per-move gate) is the primary anti-clutter control. The independent
// per-move gating this replaced over-decorated content (verified against real scorer
// output: casual vlogs picked up editorial brackets + side-bars). Structure emerges
// from signals, not preset skeletons — but a director's restraint is part of the craft.
function runStructuralMoves(
  elements: RecipeElement[],
  language: MotionTokens,
  signals: PlannerSignals,
  budget: number,
  content: Record<string, unknown>,
  mgScores?: MgOverlayScores,
): void {
  const hasAccent = language.color.accent !== language.color.primary;
  const score = (id: string): number => mgScores?.[id]?.score ?? 0;
  // ⚠️ GATE 0.45 INVENTED — recalibrated from 0.3. Real additive scores floor near ~0.4 even
  // for weak signals (verified against content scenarios), so 0.3 fired on casual content.
  // 0.45 clears that baseline; the top-K cap below is the primary anti-clutter control.
  const GATE = 0.45;

  const hasSecondary = elements.some(e => e.role === 'secondary');
  const kickerText = typeof content.kicker === 'string' ? content.kicker
    : typeof content.category === 'string' ? content.category : '';
  const badgeVal = typeof content.badge === 'string' ? content.badge
    : typeof content.rank === 'string' ? content.rank
    : typeof content.rank === 'number' ? String(content.rank) : '';
  const annotText = typeof content.annotation === 'string' ? content.annotation : '';
  const sparseScalarRate = isSparseScalarRateContent(content);

  const insertBeforePrimary = (moves: RecipeElement[]): void => {
    const i = elements.findIndex(e => e.role === 'primary' || e.role === 'counter');
    if (i >= 0) elements.splice(i, 0, ...moves); else elements.unshift(...moves);
  };
  const insertAfterPrimary = (moves: RecipeElement[]): void => {
    const i = elements.findIndex(e => e.role === 'primary' || e.role === 'counter');
    if (i >= 0) elements.splice(i + 1, 0, ...moves); else elements.push(...moves);
  };
  const insertBeforeSecondary = (moves: RecipeElement[]): void => {
    const i = elements.findIndex(e => e.role === 'secondary');
    if (i >= 0) elements.splice(i, 0, ...moves);
  };

  // Candidate moves. `available` gates on content/structure prerequisites; `group` marks
  // mutually-exclusive families (only the top scorer in a group survives).
  interface Candidate { id: string; minBudget: number; available: boolean; group?: string; emit: () => void }
  const candidates: Candidate[] = [
    { id: 'mg.structure.backdrop_card', minBudget: 2, available: !sparseScalarRate, emit: () => elements.push(...moveBackdropCard(language)) },
    { id: 'mg.structure.side_bar', minBudget: 2, available: true, emit: () => elements.push(...moveSideBar()) },
    { id: 'mg.structure.accent_line', minBudget: 3, available: hasAccent, group: 'h-rule', emit: () => elements.push(...moveAccentLine()) },
    { id: 'mg.structure.underline', minBudget: 3, available: hasAccent, group: 'h-rule', emit: () => insertAfterPrimary(moveUnderline()) },
    { id: 'mg.structure.divider', minBudget: 3, available: hasSecondary, emit: () => insertBeforeSecondary(moveDivider()) },
    { id: 'mg.structure.kicker', minBudget: 2, available: !!kickerText, emit: () => insertBeforePrimary(moveKicker(kickerText)) },
    { id: 'mg.structure.badge', minBudget: 3, available: !!badgeVal, emit: () => elements.push(...moveBadge(badgeVal)) },
    { id: 'mg.structure.brackets', minBudget: 4, available: true, group: 'frame', emit: () => elements.push(...moveBrackets()) },
    { id: 'mg.structure.corner_marks', minBudget: 5, available: true, group: 'frame', emit: () => elements.push(...moveCornerMarks()) },
    { id: 'mg.structure.annotation', minBudget: 4, available: !!annotText, emit: () => elements.push(...moveAnnotationCallout(annotText)) },
  ];

  // Eligible = budget tier + availability + gate, ranked by score (highest first).
  const ranked = candidates
    .filter(c => budget >= c.minBudget && c.available && score(c.id) >= GATE)
    .map(c => ({ c, s: score(c.id) }))
    .sort((a, b) => b.s - a.s);

  // Conflict resolution: within a mutually-exclusive group, only the top scorer survives.
  const usedGroups = new Set<string>();
  const deconflicted = ranked.filter(({ c }) => {
    if (!c.group) return true;
    if (usedGroups.has(c.group)) return false;
    usedGroups.add(c.group);
    return true;
  });

  // Top-K cap — a director uses few structural treatments, even when many would "fit".
  // ⚠️ cap mapping INVENTED — budget 2-3 → 1, budget 4 → 2, budget 5 → 3.
  const cap = budget >= 5 ? 3 : budget >= 4 ? 2 : 1;
  for (const { c } of deconflicted.slice(0, cap)) c.emit();
}

function isSparseScalarRateContent(content: Record<string, unknown>): boolean {
  const rawValue = typeof content.value === 'string' || typeof content.value === 'number'
    ? String(content.value).trim()
    : '';
  if (!rawValue || rawValue.includes('%')) return false;
  const numeric = Number.parseFloat(rawValue.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) return false;
  const quantityKind = String(content.quantityKind ?? '').toLowerCase();
  if (['percent', 'percentage', 'fraction', 'ratio'].includes(quantityKind)) return false;
  if (content.bounded === true || content.boundedRange === true || content.hasBoundedRange === true) return false;
  const label = String(content.label ?? '').toLowerCase();
  return /\b(per|rate|daily|weekly|monthly|yearly|frequency|average|per day)\b/.test(label);
}

function makeTextElement(
  role: string,
  textBinding: string,
  _language: MotionTokens,
): RecipeElement {
  return {
    primitive: 'text',
    role,
    layer: 'foreground',
    bind: {
      text: textBinding,
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
    },
  };
}
