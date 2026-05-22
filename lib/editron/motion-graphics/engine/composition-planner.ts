import type { MotionTokens, BrandInputs } from '../types';
import type {
  Recipe,
  RecipeElement,
  GraphicIntent,
  ContentShape,
  CompositionStrategy,
  HoldPattern,
} from './recipe-types';
import { analyzeContentShape } from './content-shape-analyzer';
import { generateBrandPattern } from './brand-pattern-generator';
import { deriveBrandRules } from './brand-composition-rules';
import { getCompositionTemplate } from './composition-templates';

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

const DEFAULT_SIGNALS: PlannerSignals = {
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
): Recipe {
  const s: PlannerSignals = { ...DEFAULT_SIGNALS, ...signals };
  const strategy = analyzeContentShape(intent.content, intent.kind, s);

  if (!signals) {
    console.warn('[MG-Planner] No content signals provided — using defaults.');
  }

  const elements = composeElements(strategy, language, s);

  console.log(
    `[MG-Planner] Composed: ${elements.length} elements, ` +
    `shapes=[${strategy.shapes.map(sh => sh.kind).join(',')}], ` +
    `layout=${strategy.suggestedLayout.position}, ` +
    `complexity=${strategy.complexityBudget}/5`,
  );

  return {
    id: `composed-${strategy.shapes[0]?.kind || 'unknown'}`,
    elements,
    layout: strategy.suggestedLayout,
    exitStyle: strategy.suggestedExitStyle,
  };
}

function composeElements(
  strategy: CompositionStrategy,
  language: MotionTokens,
  signals: PlannerSignals,
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

  if (budget >= 2 && formality > CRG.FORMALITY_MEDIUM) {
    elements.push(makeContainer(language));
  }

  switch (primary.kind) {
    case 'numeric':
      composeNumeric(elements, primary, language, signals);
      break;
    case 'identity':
      composeIdentity(elements, primary, language, signals);
      break;
    case 'quotation':
      composeQuotation(elements, primary, language);
      break;
    case 'emphasis':
      composeEmphasis(elements, primary, language, signals);
      break;
    case 'brand':
      composeBrand(elements, primary, language);
      break;
    case 'structured':
      composeStructured(elements, primary, language);
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

  // Hold animation: assign ambient motion to foreground elements based on signals.
  // Background/midground (containers, patterns, decorations) stay static — only foreground animates.
  const holdPattern = resolveHoldPattern(signals);
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

  return elements;
}

function composeNumeric(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'numeric' }>,
  language: MotionTokens,
  signals: PlannerSignals,
): void {
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
      minSize: CRG.STAT_MIN_FONT,
      lineHeight: 1.1,
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
        tracking: 'token:typography.headingTracking',
        lineHeight: 1.3,
      },
    });
  }
}

function composeIdentity(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'identity' }>,
  _language: MotionTokens,
  signals: PlannerSignals,
): void {
  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:name',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
      tracking: 'token:typography.headingTracking',
      transform: 'token:typography.headingTransform',
      minSize: CRG.LOWER_THIRD_MIN_FONT,
      lineHeight: 1.1,
    },
  });

  if (shape.title) {
    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:title',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: CRG.LOWER_THIRD_TITLE_MIN_FONT,
        lineHeight: 1.3,
      },
    });
  }
}

function composeQuotation(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'quotation' }>,
  language: MotionTokens,
): void {
  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:quote',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.bodyWeight',
      color: 'token:color.textPrimary',
      minSize: CRG.QUOTE_MIN_FONT,
      lineHeight: 1.4,
    },
  });

  if (shape.author) {
    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:author',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        lineHeight: 1.2,
      },
    });
  }
}

function composeEmphasis(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'emphasis' }>,
  language: MotionTokens,
  signals: PlannerSignals,
): void {
  const informal = signals.formality < CRG.FORMALITY_MEDIUM;

  if (informal) {
    elements.push({
      primitive: 'container',
      role: 'container',
      layer: 'midground',
      shape: 'pill',
      bind: {
        fill: 'token:color.accent',
        opacity: 0.15,
        radius: 999,
      },
    });
  }

  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    entranceOverride: 'pop',
    bind: {
      text: 'content:text',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: informal ? 'token:color.accent' : 'token:color.textPrimary',
      minSize: CRG.KEYWORD_MIN_FONT,
    },
  });
}

function composeBrand(
  elements: RecipeElement[],
  _shape: Extract<ContentShape, { kind: 'brand' }>,
  language: MotionTokens,
): void {
  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:text',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.primary',
      tracking: '0.08em',
      transform: 'uppercase',
    },
  });
}

function composeStructured(
  elements: RecipeElement[],
  shape: Extract<ContentShape, { kind: 'structured' }>,
  language: MotionTokens,
): void {
  elements.push({
    primitive: 'text',
    role: 'primary',
    layer: 'foreground',
    bind: {
      text: 'content:title',
      font: 'token:typography.headingFamily',
      weight: 'token:typography.headingWeight',
      color: 'token:color.textPrimary',
      lineHeight: 1.1,
    },
  });

  if (shape.body) {
    elements.push({
      primitive: 'text',
      role: 'secondary',
      layer: 'foreground',
      bind: {
        text: 'content:body',
        font: 'token:typography.bodyFamily',
        weight: 'token:typography.bodyWeight',
        color: 'token:color.textSecondary',
        minSize: CRG.CALLOUT_MIN_FONT,
        lineHeight: 1.4,
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

// Signal-driven hold animation selection.
// ⚠️ ALL thresholds INVENTED — need calibration against reference videos
function resolveHoldPattern(signals: PlannerSignals): HoldPattern {
  // High enthusiasm + slow pacing → visible pulse (energetic but held long enough to see it)
  if (signals.enthusiasm > 0.6 && signals.pacing_velocity < 0.5) return 'pulse';
  // Warm tone → organic breathing (warm = alive, breathing = organic)
  if (signals.warmth > 0.6) return 'breathe';
  // Moderate enthusiasm → subtle float (gentle motion adds life without distraction)
  if (signals.enthusiasm > 0.4) return 'gentle-float';
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
