import type {
  ContentShape,
  ContentShapeKind,
  CompositionStrategy,
  RecipeLayout,
  ExitStyle,
} from './recipe-types';
import type { PlannerSignals } from './composition-planner';

const DEFAULT_HOLD_FRAMES = 90;
const DEFAULT_COMPLEXITY = 3;

export function analyzeContentShape(
  content: Record<string, unknown>,
  kind?: ContentShapeKind,
  signals?: Partial<PlannerSignals>,
): CompositionStrategy {
  const shapes = detectShapes(content, kind);
  const primary = shapes[0] || { kind: 'free-text' as const, text: '' };

  return {
    shapes,
    suggestedLayout: layoutForShape(primary, signals),
    suggestedExitStyle: exitStyleForShape(primary, signals),
    complexityBudget: computeComplexityBudget(signals),
    holdDurationFrames: computeHoldDuration(signals),
  };
}

function detectShapes(
  content: Record<string, unknown>,
  kind?: ContentShapeKind,
): ContentShape[] {
  if (kind) {
    const shaped = buildShapeFromKind(kind, content);
    if (shaped) return [shaped];
  }

  const shapes: ContentShape[] = [];

  if (hasNumericValue(content)) {
    shapes.push({
      kind: 'numeric',
      value: String(content.value),
      label: content.label != null ? String(content.label) : undefined,
      prefix: content.prefix != null ? String(content.prefix) : undefined,
      suffix: content.suffix != null ? String(content.suffix) : undefined,
    });
  }

  if (typeof content.name === 'string' && content.name.length > 0) {
    shapes.push({
      kind: 'identity',
      name: content.name,
      title: content.title != null ? String(content.title) : undefined,
      avatar: content.avatar != null ? String(content.avatar) : undefined,
    });
  }

  if (typeof content.quote === 'string' && content.quote.length > 0) {
    shapes.push({
      kind: 'quotation',
      quote: content.quote,
      author: content.author != null ? String(content.author) : undefined,
    });
  }

  if (Array.isArray(content.values) && content.values.length > 0) {
    const nums = content.values.filter((v): v is number => typeof v === 'number' && isFinite(v));
    if (nums.length > 0) {
      shapes.push({
        kind: 'data-series',
        values: nums,
        labels: Array.isArray(content.labels) ? content.labels.map(String) : undefined,
      });
    }
  }

  if (typeof content.logo === 'string' || (typeof content.text === 'string' && content.brand)) {
    shapes.push({
      kind: 'brand',
      text: String(content.text || content.name || ''),
      logo: content.logo != null ? String(content.logo) : undefined,
    });
  }

  if (typeof content.title === 'string' && typeof content.body === 'string') {
    shapes.push({
      kind: 'structured',
      title: content.title,
      body: content.body,
      items: Array.isArray(content.items) ? content.items.map(String) : undefined,
    });
  }

  if (shapes.length === 0 && typeof content.text === 'string') {
    shapes.push({ kind: 'emphasis', text: content.text, weight: 'medium' });
  }

  if (shapes.length === 0) {
    const fallbackText = content.text ?? content.keyword ?? content.title ?? '';
    shapes.push({ kind: 'free-text', text: String(fallbackText) });
  }

  return shapes;
}

function buildShapeFromKind(
  kind: ContentShapeKind,
  content: Record<string, unknown>,
): ContentShape | null {
  switch (kind) {
    case 'numeric':
      return {
        kind: 'numeric',
        value: String(content.value ?? '0'),
        label: content.label != null ? String(content.label) : undefined,
        prefix: content.prefix != null ? String(content.prefix) : undefined,
        suffix: content.suffix != null ? String(content.suffix) : undefined,
      };
    case 'identity':
      return {
        kind: 'identity',
        name: String(content.name ?? ''),
        title: content.title != null ? String(content.title) : undefined,
      };
    case 'quotation':
      return {
        kind: 'quotation',
        quote: String(content.quote ?? content.text ?? ''),
        author: content.author != null ? String(content.author) : undefined,
      };
    case 'emphasis':
      return {
        kind: 'emphasis',
        text: String(content.text ?? content.keyword ?? ''),
        weight: 'medium',
      };
    case 'data-series': {
      const vals = Array.isArray(content.values)
        ? content.values.filter((v): v is number => typeof v === 'number' && isFinite(v))
        : [];
      return { kind: 'data-series', values: vals, labels: Array.isArray(content.labels) ? content.labels.map(String) : undefined };
    }
    case 'brand':
      return {
        kind: 'brand',
        text: String(content.text ?? content.name ?? ''),
        logo: content.logo != null ? String(content.logo) : undefined,
      };
    case 'structured':
      return {
        kind: 'structured',
        title: String(content.title ?? ''),
        body: content.body != null ? String(content.body) : undefined,
        items: Array.isArray(content.items) ? content.items.map(String) : undefined,
      };
    case 'free-text':
      return { kind: 'free-text', text: String(content.text ?? '') };
    default:
      return null;
  }
}

function hasNumericValue(content: Record<string, unknown>): boolean {
  if (content.value == null) return false;
  const str = String(content.value);
  return /^[\d,.$%+\-]+$/.test(str.replace(/\s/g, ''));
}

function layoutForShape(
  shape: ContentShape,
  signals?: Partial<PlannerSignals>,
): RecipeLayout {
  const facePresent = (signals as Record<string, unknown>)?.face_present;
  const captionAware = !!facePresent;

  switch (shape.kind) {
    case 'numeric':
    case 'quotation':
    case 'brand':
      return { position: 'center' };
    case 'identity':
      return { position: 'bottom-left', captionZoneAware: true };
    case 'emphasis':
      return { position: 'top-left', captionZoneAware: captionAware };
    case 'data-series':
      return { position: 'center', maxWidth: '80%' };
    case 'structured':
      return { position: 'top-right' };
    case 'free-text':
    default:
      return { position: 'center' };
  }
}

function exitStyleForShape(
  shape: ContentShape,
  _signals?: Partial<PlannerSignals>,
): ExitStyle {
  switch (shape.kind) {
    case 'numeric':
    case 'identity':
      return 'reverse-stagger';
    case 'brand':
      return 'hold-then-fade';
    default:
      return 'simultaneous-fade';
  }
}

function computeComplexityBudget(signals?: Partial<PlannerSignals>): number {
  if (!signals) return DEFAULT_COMPLEXITY;
  const position = (signals as Record<string, unknown>).position_in_video;
  if (typeof position !== 'number') return DEFAULT_COMPLEXITY;
  if (position < 0.2) return 1;
  if (position < 0.6) return 3;
  if (position < 0.8) return 4;
  return 5;
}

function computeHoldDuration(signals?: Partial<PlannerSignals>): number {
  if (!signals) return DEFAULT_HOLD_FRAMES;
  const wpm = (signals as Record<string, unknown>).speaking_rate_wpm;
  if (typeof wpm !== 'number' || wpm <= 0) return DEFAULT_HOLD_FRAMES;
  const clamped = Math.max(80, Math.min(220, wpm));
  return Math.round(180 - (clamped - 80) * (120 / 140));
}
