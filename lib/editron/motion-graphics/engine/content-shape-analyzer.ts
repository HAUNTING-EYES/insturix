import type {
  ContentShape,
  ContentShapeKind,
  CompositionStrategy,
  RecipeLayout,
  ExitStyle,
} from './recipe-types';
import type { PlannerSignals } from './composition-planner';

const DEFAULT_HOLD_FRAMES = 90;
let emphasisLayoutCounter = 0;
const DEFAULT_COMPLEXITY = 3;

export function analyzeContentShape(
  content: Record<string, unknown>,
  _kind?: ContentShapeKind,
  signals?: Partial<PlannerSignals>,
): CompositionStrategy {
  const shapes = detectShapes(content);
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
): ContentShape[] {
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


// Stat values arrive in several display forms. count-up animation only makes sense for a plain
// incrementable magnitude — a fraction ("1/3"), ratio ("2:1"), or magnitude-suffixed value
// ("100M", "10x") must render STATICALLY, because count-up does parseFloat(value) and
// parseFloat("1/3") === 1 would display "1" (and the old detector rejected these entirely →
// empty free-text → blank graphic). CRG technique:graphic.stat_counter allows count-up | pop |
// fade and lists "count (10x)" as a valid format, so these ARE stats — just not count-up-able.
const COUNTABLE_VALUE_RE = /^[$€£¥₹]?\d[\d,]*\.?\d*%?$/;          // 42, 42%, $1,200, 0.02
const FRACTION_VALUE_RE = /^\d[\d.]*\/\d[\d.]*$/;                 // 1/3, 3.5/5
const RATIO_VALUE_RE = /^\d[\d.]*:\d[\d.]*$/;                     // 2:1
// ⚠️ suffix set K/M/B/T/x/× INVENTED — common magnitude/multiplier suffixes; extend as needed.
const MAGNITUDE_VALUE_RE = /^[$€£¥₹]?\d[\d,]*\.?\d*[KMBTkmbtx×]$/; // 100M, $1.2B, 10x

function numericValueForm(value: unknown): 'countable' | 'static' | null {
  if (value == null) return null;
  const str = String(value).replace(/\s/g, '');
  if (!/\d/.test(str)) return null; // must contain a digit (anchored REs reject prose)
  if (COUNTABLE_VALUE_RE.test(str)) return 'countable';
  if (FRACTION_VALUE_RE.test(str) || RATIO_VALUE_RE.test(str) || MAGNITUDE_VALUE_RE.test(str)) return 'static';
  return null;
}

function hasNumericValue(content: Record<string, unknown>): boolean {
  return numericValueForm(content.value) !== null;
}

/** Whether a numeric stat value should count-up (plain magnitude) vs render statically
 *  (fraction/ratio/suffixed — parseFloat would mangle it). Consumed by composeNumeric. */
export function isCountUpValue(value: unknown): boolean {
  return numericValueForm(value) === 'countable';
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
    case 'emphasis': {
      const emphasisPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
      const idx = emphasisLayoutCounter++ % emphasisPositions.length;
      return { position: emphasisPositions[idx], captionZoneAware: captionAware };
    }
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
  const s = signals as Record<string, unknown>;
  const num = (k: string): number => (typeof s[k] === 'number' && isFinite(s[k] as number) ? (s[k] as number) : 0);

  // Hard suppressors (unchanged).
  // Montage mode: music-driven section, no speech → suppress graphics entirely.
  // CRG signal:composite.montage_mode — "music is dominant, not speech".
  if (num('montage_mode') > 0.5) return 0;
  // Too many overlays already visible → suppress. CRG constraint:overlay.simultaneous_overlay_max.
  if (num('active_overlay_count') >= 3) return 0;

  // Importance-driven base budget — REPLACES the old position-in-video ramp.
  // A moment's visual richness should come from how much it MATTERS, not where it sits
  // in the timeline (a stat at 0:10 deserves the same treatment as one at 5:00).
  // `max` of importance signals (not average) so a single strong peak justifies richness,
  // and it stays robust when some composites (e.g. cinematic_moment) aren't computed —
  // formality is almost always available from the transcript.
  // ⚠️ secondary weights (0.8/0.7) + the 2..5 mapping INVENTED — bounds for the bandit
  // to calibrate, not fixed magic values.
  const importance = Math.max(
    num('cinematic_moment'),
    num('visceral_impact'),
    num('emotional_arousal') * 0.8,
    num('formality') * 0.7,
  );
  let budget = 2 + Math.round(Math.min(1, importance) * 3); // 2..5

  // Pacing penalty: fast pacing → less time to read → simpler composition.
  // ⚠️ threshold 0.7 INVENTED
  if (num('pacing_velocity') > 0.7) budget = Math.max(2, budget - 1);

  // Visual significance: frame is already visually rich → graphics shouldn't compete.
  // ⚠️ threshold 0.7 INVENTED
  if (num('visual_significance') > 0.7) budget = Math.max(1, budget - 2);

  return Math.min(5, Math.max(1, budget));
}

function computeHoldDuration(signals?: Partial<PlannerSignals>): number {
  if (!signals) return DEFAULT_HOLD_FRAMES;
  const wpm = (signals as Record<string, unknown>).speaking_rate_wpm;
  if (typeof wpm !== 'number' || wpm <= 0) return DEFAULT_HOLD_FRAMES;
  const clamped = Math.max(80, Math.min(220, wpm));
  return Math.round(180 - (clamped - 80) * (120 / 140));
}
