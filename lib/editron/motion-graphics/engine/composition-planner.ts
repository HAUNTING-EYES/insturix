import type { MotionTokens, BrandInputs } from '../types';
import type {
  Recipe,
  RecipeElement,
  GraphicIntent,
  ContentShape,
  CompositionStrategy,
  HoldPattern,
  TextSplitMode,
} from './recipe-types';
import { analyzeContentShape } from './content-shape-analyzer';
import { generateBrandPattern } from './brand-pattern-generator';
import { deriveBrandRules } from './brand-composition-rules';
import { getCompositionTemplate } from './composition-templates';

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
  [key: string]: number;
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

  const elements = composeElements(strategy, language, s, mgScores);

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
  if (sceneType === 'action' && elements.length > 3) {
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
    const splitMode: TextSplitMode = s.enthusiasm > 0.7 ? 'chars' : 'words';
    for (const el of elements) {
      if (el.primitive === 'text' && el.layer === 'foreground' && !el.textSplit) {
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
  if (centerAvoidance >= 0 && layout.position === 'center') {
    // ⚠️ threshold 0.6 INVENTED — above this, face/speech dominates → move to corner
    if (centerAvoidance > 0.6) {
      const positions = ['bottom-left', 'top-right', 'bottom-right', 'top-left'] as const;
      // Pick position based on score magnitude — higher avoidance = bottom-left (safest for lower-thirds)
      const idx = Math.min(positions.length - 1, Math.floor((centerAvoidance - 0.6) / 0.1));
      layout = { ...layout, position: positions[idx] };
      console.log(`[MG-Planner] Spatial: center→${layout.position} (centerAvoidance=${centerAvoidance.toFixed(2)})`);
    }
  }

  return {
    id: `composed-${strategy.shapes[0]?.kind || 'unknown'}`,
    elements,
    layout,
    exitStyle: strategy.suggestedExitStyle,
  };
}

function composeElements(
  strategy: CompositionStrategy,
  language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): RecipeElement[] {
  const elements: RecipeElement[] = [];
  const formality = signals.formality;
  // cinematic_moment: composite signal (speech energy + motion + music). High = visually important.
  // Boost budget by 1 tier for cinematic moments → richer composition (more elements, accent lines).
  // ← signal:composite.cinematic_moment → budget. ⚠️ threshold 0.6 INVENTED, needs calibration
  const cinematicBoost = typeof signals.cinematic_moment === 'number' && isFinite(signals.cinematic_moment) && signals.cinematic_moment > 0.6 ? 1 : 0;
  const budget = Math.min(5, strategy.complexityBudget + cinematicBoost);
  const hasAccent = language.color.accent !== language.color.primary;

  const primary = strategy.shapes[0];
  if (!primary) {
    elements.push(makeTextElement('primary', 'content:text', language));
    return elements;
  }

  const overlayOpacity = mgVal(mgScores, 'mg.styling.container_opacity', 'containerOpacity', -1);
  if (overlayOpacity >= 0) {
    if (budget >= 2 && overlayOpacity > 0.4) {
      elements.push(makeContainer(language));
    }
  } else if (budget >= 2 && formality >= CRG.FORMALITY_MEDIUM) {
    elements.push(makeContainer(language));
  }

  switch (primary.kind) {
    case 'numeric':
      composeNumeric(elements, primary, language, signals, mgScores);
      break;
    case 'identity':
      composeIdentity(elements, primary, language, signals, mgScores);
      break;
    case 'quotation':
      composeQuotation(elements, primary, language, mgScores);
      break;
    case 'emphasis':
      composeEmphasis(elements, primary, language, signals, mgScores);
      break;
    case 'brand':
      composeBrand(elements, primary, language, mgScores);
      break;
    case 'structured':
      composeStructured(elements, primary, language, mgScores);
      break;
    case 'data-series':
      composeDataSeries(elements, primary, language);
      break;
    case 'free-text':
    default: {
      const template = getCompositionTemplate(primary.kind);
      if (template) {
        elements.push(...template.compose(strategy.shapes[0] as unknown as Record<string, unknown>, language, signals));
      } else {
        elements.push(makeTextElement('primary', 'content:text', language));
      }
      break;
    }
  }

  if (budget >= 3 && hasAccent) {
    elements.push(makeAccentLine());
  }

  const holdPattern = resolveHoldPattern(signals, mgScores);
  if (holdPattern !== 'static') {
    for (const el of elements) {
      if (el.layer === 'foreground') {
        el.holdAnimation = holdPattern;
      }
    }
  }

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
  if (particleWinner && budget >= 4) {
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
  if (maskWinner && budget >= 5 && primary.kind !== 'emphasis') {
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

function composeNumeric(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'numeric' }>,
  language: MotionTokens,
  signals: PlannerSignals,
  mgScores?: MgOverlayScores,
): void {
  const fontSize = Math.max(CRG.STAT_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.STAT_MIN_FONT));
  const primaryLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.1);
  const secondaryLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.3);
  const letterTracking = mgVal(mgScores, 'mg.typography.letter_tracking', 'letterTracking', 0);

  elements.push({
    primitive: 'text',
    role: 'counter',
    layer: 'foreground',
    animation: 'count-up',
    bind: {
      text: 'content:value',
      prefix: 'content:prefix',
      suffix: 'content:suffix',
      font: signals.formality > CRG.FORMALITY_HIGH
        ? 'token:typography.headingFamily'
        : 'token:typography.monoFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
      sizeScale: 'token:typography.sizeScale',
      minSize: fontSize,
      lineHeight: primaryLineHeight,
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
        tracking: letterTracking > 0 ? `${letterTracking.toFixed(3)}em` : 'token:typography.headingTracking',
        lineHeight: secondaryLineHeight,
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
    const titleSize = Math.max(CRG.LOWER_THIRD_TITLE_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.LOWER_THIRD_TITLE_MIN_FONT) * 0.75);
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
  const quoteSize = Math.max(CRG.QUOTE_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.QUOTE_MIN_FONT));
  const quoteLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.4);

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

    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:author',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
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
    },
  });
}

function composeBrand(
  elements: RecipeElement[],
  _shape: Extract<ContentShape, { kind: 'brand' }>,
  language: MotionTokens,
  mgScores?: MgOverlayScores,
): void {
  const letterTracking = mgVal(mgScores, 'mg.typography.letter_tracking', 'letterTracking', 0.08);
  const textTransform = mgVal(mgScores, 'mg.typography.text_transform_tendency', 'textTransformScore', 1);

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

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:title',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
      lineHeight: primaryLineHeight,
    },
  });

  if (shape.body) {
    const bodySize = Math.max(CRG.CALLOUT_MIN_FONT, mgVal(mgScores, 'mg.typography.font_size', 'fontSize', CRG.CALLOUT_MIN_FONT) * 0.75);
    const bodyLineHeight = mgVal(mgScores, 'mg.typography.line_height', 'lineHeight', 1.4);

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

function composeDataSeries(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'data-series' }>,
  language: MotionTokens,
): void {
  // Compute chart type from data shape — not a preset, a function of the data.
  // 1 value (0-100 range) → percentage ring
  // 2+ values with 5+ entries → sparkline (time series pattern)
  // else → bar chart (comparison)
  // ⚠️ INVENTED heuristic for sparkline detection (>= 5 values = time series). Needs calibration.
  const values = shape.values || [];
  let chartRole = 'bar-chart';
  if (values.length === 1 && values[0] >= 0 && values[0] <= 100) {
    chartRole = 'percentage-ring';
  } else if (values.length >= 5) {
    chartRole = 'sparkline';
  }

  elements.push({
    primitive: 'data-viz',
    role: chartRole,
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
  // ⚠️ thresholds INVENTED — lowered from 0.6/0.6/0.4 to prevent "static always" with default signals
  if (signals.enthusiasm > 0.45 && signals.pacing_velocity < 0.6) return 'pulse';
  if (signals.warmth > 0.45) return 'breathe';
  if (signals.enthusiasm > 0.25) return 'gentle-float';
  return 'static';
}

function makeContainer(language: MotionTokens): RecipeElement {
  return {
    primitive: 'container',
    role: 'container',
    layer: 'background',
    shape: language.surface.style === 'glass' ? 'rect' : language.surface.cornerRadius > 12 ? 'pill' : 'rect',
    bind: {
      fill: 'token:color.surfaceBase',
      opacity: 'token:surface.surfaceOpacity',
      blur: 'token:surface.backdropBlur',
      radius: 'token:surface.cornerRadius',
      borderWeight: 'token:surface.borderWeight',
      borderOpacity: 'token:surface.borderOpacity',
      shadow: 'token:surface.shadow',
    },
  };
}

function makeAccentLine(): RecipeElement {
  return {
    primitive: 'decoration',
    role: 'accent',
    layer: 'midground',
    shape: 'line',
    bind: {
      color: 'token:color.accent',
      width: 3,
      anchorX: 0,
      anchorY: 0.5,
    },
  };
}

function makeTextElement(
  role: string,
  textBinding: string,
  language: MotionTokens,
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
