import type { MotionTokens } from '../types';
import type {
  Recipe,
  RecipeElement,
  GraphicIntent,
  ContentShape,
  CompositionStrategy,
} from './recipe-types';
import { analyzeContentShape } from './content-shape-analyzer';

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
  const budget = strategy.complexityBudget;
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
    default:
      elements.push(makeTextElement('primary', 'content:text', language));
      break;
  }

  if (budget >= 3 && hasAccent) {
    elements.push(makeAccentLine());
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
      },
    });
  }
}

function composeDataSeries(
  elements: RecipeElement[],
  _shape: Extract<ContentShape, { kind: 'data-series' }>,
  language: MotionTokens,
): void {
  elements.push({
    primitive: 'data-viz',
    role: 'chart',
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
