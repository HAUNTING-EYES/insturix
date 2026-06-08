import type {
  ContentShape,
  ContentShapeKind,
  ContentStructurePart,
  ContentStructureRelation,
  ContentStructureSignature,
  ContentPrimitiveChannel,
  CompositionStrategy,
  RecipeLayout,
  ExitStyle,
  DataSeriesVisualForm,
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
  const structure = deriveContentStructure(content);
  const shapes = detectShapes(content, structure);
  const primary = shapes[0] || { kind: 'free-text' as const, text: '' };

  return {
    shapes,
    structure,
    suggestedLayout: layoutForShape(primary, signals),
    suggestedExitStyle: exitStyleForShape(primary, signals),
    complexityBudget: computeComplexityBudget(signals),
    holdDurationFrames: computeHoldDuration(signals),
  };
}

export function deriveContentStructure(content: Record<string, unknown>): ContentStructureSignature {
  const parts: ContentStructurePart[] = [];
  const relations: ContentStructureRelation[] = [];
  const addPart = (
    role: ContentStructurePart['role'],
    channel: ContentPrimitiveChannel,
    sourceKey: string,
    value: ContentStructurePart['value'],
    confidence = 1,
  ) => {
    parts.push({ role, channel, sourceKey, value, confidence });
  };

  if (hasNumericValue(content)) {
    addPart('primary-value', 'scalar', 'value', String(content.value));
    if (content.label != null) {
      addPart('supporting-label', 'text', 'label', String(content.label), 0.9);
      relations.push({ type: 'label-of', fromRole: 'supporting-label', toRole: 'primary-value' });
    }
  }

  if (typeof content.name === 'string' && content.name.length > 0) {
    addPart('name', 'identity', 'name', content.name);
    if (content.title != null) {
      addPart('title', 'text', 'title', String(content.title), 0.85);
      relations.push({ type: 'title-of', fromRole: 'title', toRole: 'name' });
    }
    if (content.avatar != null) {
      addPart('avatar', 'media', 'avatar', String(content.avatar), 0.75);
      relations.push({ type: 'portrait-of', fromRole: 'avatar', toRole: 'name' });
    }
  }

  if (typeof content.quote === 'string' && content.quote.length > 0) {
    addPart('quote', 'text', 'quote', content.quote);
    if (content.author != null) {
      addPart('author', 'identity', 'author', String(content.author), 0.8);
      relations.push({ type: 'authored-by', fromRole: 'quote', toRole: 'author' });
    }
  }

  if (Array.isArray(content.values) && content.values.length > 0) {
    const nums = content.values.filter((v): v is number => typeof v === 'number' && isFinite(v));
    if (nums.length > 0) {
      addPart('series-values', 'series', 'values', nums);
      if (Array.isArray(content.labels)) {
        addPart('series-labels', 'text', 'labels', content.labels.map(String), 0.8);
        relations.push({ type: 'label-of', fromRole: 'series-labels', toRole: 'series-values' });
      }
    }
  }

  if (typeof content.logo === 'string') {
    addPart('logo', 'media', 'logo', content.logo);
    relations.push({ type: 'brand-mark', fromRole: 'logo', toRole: 'brand-text' });
  }
  if (typeof content.text === 'string' && content.brand) {
    addPart('brand-text', 'brand', 'text', content.text);
  }

  if (typeof content.title === 'string' && typeof content.body === 'string') {
    addPart('title', 'text', 'title', content.title);
    addPart('body', 'text', 'body', content.body, 0.85);
    if (Array.isArray(content.items)) {
      addPart('list-items', 'text', 'items', content.items.map(String), 0.8);
      relations.push({ type: 'contains-list', fromRole: 'body', toRole: 'list-items' });
    }
  }

  if (typeof content.from === 'string' && content.from.length > 0
      && typeof content.to === 'string' && content.to.length > 0) {
    addPart('compare-from', 'relation', 'from', content.from);
    addPart('compare-to', 'relation', 'to', content.to);
    relations.push({ type: 'compares', fromRole: 'compare-from', toRole: 'compare-to' });
    if (content.fromLabel != null) addPart('supporting-label', 'text', 'fromLabel', String(content.fromLabel), 0.7);
    if (content.toLabel != null) addPart('supporting-label', 'text', 'toLabel', String(content.toLabel), 0.7);
  }

  if (typeof content.contextPhrase === 'string' && content.contextPhrase.trim().length > 0) {
    const keyword = typeof content.keyword === 'string' && content.keyword.trim().length > 0
      ? content.keyword
      : typeof content.text === 'string'
        ? content.text
        : '';
    if (keyword) {
      addPart('keyword', 'text', 'keyword', keyword, 0.75);
    }
    addPart('context-phrase', 'text', 'contextPhrase', content.contextPhrase, 0.88);
    if (keyword) relations.push({ type: 'context-for', fromRole: 'context-phrase', toRole: 'keyword' });
  }

  if (parts.length === 0 && typeof content.text === 'string') {
    addPart('emphasis-text', 'text', 'text', content.text, 0.8);
  }

  if (parts.length === 0) {
    const fallbackText = content.text ?? content.keyword ?? content.title ?? '';
    addPart('fallback-text', 'text', 'fallback', String(fallbackText), 0.4);
  }

  const channels: ContentStructureSignature['channels'] = {};
  for (const part of parts) {
    channels[part.channel] = Math.max(channels[part.channel] ?? 0, part.confidence);
  }

  const seriesValues = parts.find((part) => part.role === 'series-values')?.value;
  const seriesNums = Array.isArray(seriesValues)
    ? seriesValues.filter((v): v is number => typeof v === 'number' && isFinite(v))
    : [];
  const seriesLabels = parts.find((part) => part.role === 'series-labels')?.value;
  const seriesAnalysis = analyzeDataSeriesStructure(
    seriesNums,
    Array.isArray(seriesLabels) ? seriesLabels.map(String) : undefined,
  );

  return {
    parts,
    relations,
    channels,
    evidence: {
      hasScalar: !!channels.scalar,
      hasSeries: !!channels.series,
      hasIdentity: !!channels.identity,
      hasMedia: !!channels.media,
      hasRelation: !!channels.relation,
      hasBrand: !!channels.brand || !!relations.find((r) => r.type === 'brand-mark'),
      partCount: parts.length,
      relationCount: relations.length,
      ...(seriesAnalysis.seriesCardinality > 0 ? seriesAnalysis : {}),
    },
    primaryChannel: choosePrimaryChannel(channels),
  };
}

function detectShapes(
  content: Record<string, unknown>,
  structure: ContentStructureSignature,
): ContentShape[] {
  const shapes: ContentShape[] = [];

  if (hasPart(structure, 'primary-value')) {
    shapes.push({
      kind: 'numeric',
      value: String(content.value),
      label: content.label != null ? String(content.label) : undefined,
      prefix: content.prefix != null ? String(content.prefix) : undefined,
      suffix: content.suffix != null ? String(content.suffix) : undefined,
    });
  }

  if (hasPart(structure, 'name')) {
    shapes.push({
      kind: 'identity',
      name: String(content.name),
      title: content.title != null ? String(content.title) : undefined,
      avatar: content.avatar != null ? String(content.avatar) : undefined,
    });
  }

  if (hasPart(structure, 'quote')) {
    shapes.push({
      kind: 'quotation',
      quote: String(content.quote),
      author: content.author != null ? String(content.author) : undefined,
    });
  }

  if (hasPart(structure, 'series-values')) {
    const rawValues = Array.isArray(content.values) ? content.values : [];
    const nums = rawValues.filter((v): v is number => typeof v === 'number' && isFinite(v));
    if (nums.length > 0) {
      shapes.push({
        kind: 'data-series',
        values: nums,
        labels: Array.isArray(content.labels) ? content.labels.map(String) : undefined,
        visualForm: inferDataSeriesVisualForm(nums, Array.isArray(content.labels) ? content.labels.map(String) : undefined),
      });
    }
  }

  if (hasPart(structure, 'logo') || hasPart(structure, 'brand-text')) {
    shapes.push({
      kind: 'brand',
      text: String(content.text || content.name || ''),
      logo: content.logo != null ? String(content.logo) : undefined,
    });
  }

  if (hasPart(structure, 'title') && hasPart(structure, 'body')) {
    shapes.push({
      kind: 'structured',
      title: String(content.title),
      body: String(content.body),
      items: Array.isArray(content.items) ? content.items.map(String) : undefined,
    });
  }

  // Comparison: two comparable values present (before/after or versus). The 2-value structure
  // IS the affordance (a fact about the content) — detected here, never an LLM/preset choice.
  if (hasPart(structure, 'compare-from') && hasPart(structure, 'compare-to')) {
    shapes.push({
      kind: 'comparison',
      from: String(content.from),
      to: String(content.to),
      fromLabel: content.fromLabel != null ? String(content.fromLabel) : undefined,
      toLabel: content.toLabel != null ? String(content.toLabel) : undefined,
      relation: content.relation === 'vs' ? 'vs' : 'arrow',
    });
  }

  if (shapes.length === 0 && hasPart(structure, 'context-phrase')) {
    const keyword = content.keyword ?? content.text ?? '';
    const phrase = String(content.contextPhrase ?? '');
    shapes.push({
      kind: 'structured',
      title: String(keyword || phrase).trim(),
      body: keyword ? phrase : undefined,
    });
  }

  if (shapes.length === 0 && hasPart(structure, 'emphasis-text')) {
    shapes.push({ kind: 'emphasis', text: String(content.text), weight: 'medium' });
  }

  if (shapes.length === 0) {
    const fallbackText = content.text ?? content.keyword ?? content.title ?? '';
    shapes.push({ kind: 'free-text', text: String(fallbackText) });
  }

  return shapes;
}

function hasPart(structure: ContentStructureSignature, role: ContentStructurePart['role']): boolean {
  return structure.parts.some((part) => part.role === role);
}

function choosePrimaryChannel(
  channels: ContentStructureSignature['channels'],
): ContentPrimitiveChannel {
  for (const channel of ['series', 'scalar', 'relation', 'identity', 'brand', 'media', 'text'] as const) {
    if ((channels[channel] ?? 0) > 0) return channel;
  }
  return 'text';
}

interface DataSeriesStructureAnalysis {
  dataSeriesVisualForm?: DataSeriesVisualForm;
  seriesCardinality: number;
  seriesTrend: 'single' | 'rising' | 'falling' | 'mixed' | 'flat';
  seriesVariance: number;
  seriesComparison: boolean;
  seriesRanked: boolean;
}

function analyzeDataSeriesStructure(values: number[], labels?: string[]): DataSeriesStructureAnalysis {
  if (values.length === 0) {
    return {
      seriesCardinality: 0,
      seriesTrend: 'flat',
      seriesVariance: 0,
      seriesComparison: false,
      seriesRanked: false,
    };
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const normalizedVariance = Math.min(1, Math.sqrt(variance) / Math.max(1, Math.abs(mean)));
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const rising = deltas.length > 0 && deltas.every((delta) => delta >= 0);
  const falling = deltas.length > 0 && deltas.every((delta) => delta <= 0);
  const flat = deltas.every((delta) => Math.abs(delta) < 0.0001);
  const ranked = values.length > 1 && falling && !!labels?.length;
  const comparison = values.length <= 4 || ranked || (!!labels?.length && normalizedVariance > 0.35);

  return {
    dataSeriesVisualForm: inferDataSeriesVisualForm(values, labels),
    seriesCardinality: values.length,
    seriesTrend: values.length === 1 ? 'single' : flat ? 'flat' : rising ? 'rising' : falling ? 'falling' : 'mixed',
    seriesVariance: Number(normalizedVariance.toFixed(3)),
    seriesComparison: comparison,
    seriesRanked: ranked,
  };
}

export function inferDataSeriesVisualForm(values: number[], labels?: string[]): DataSeriesVisualForm {
  const analysis = values.length === 0 ? undefined : {
    cardinality: values.length,
    hasLabels: !!labels?.length,
    ranked: values.length > 1 && values.slice(1).every((value, index) => value <= values[index]) && !!labels?.length,
  };

  if (values.length === 1 && values[0] >= 0 && values[0] <= 100) return 'percentage-ring';
  if (analysis?.ranked || values.length <= 4) return 'bar-chart';
  if (values.length >= 5) return 'sparkline';
  return 'bar-chart';
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
// Any remaining number-like value (negative -15, EU 1.234,56, accounting (15), range 10-20, currency)
// is still a STAT — rendered STATICALLY as the exact string. Value-glyphs only, never prose. Without
// this these fell through to free-text → a BLANK graphic; a stat with no number is the worst outcome.
const STATIC_NUMERIC_RE = /^[\d.,:/%×xX()$€£¥₹+\- ]+$/;

function numericValueForm(value: unknown): 'countable' | 'static' | null {
  if (value == null) return null;
  const str = String(value).replace(/\s/g, '');
  if (!/\d/.test(str)) return null; // must contain a digit (anchored REs reject prose)
  if (COUNTABLE_VALUE_RE.test(str)) return 'countable';
  if (FRACTION_VALUE_RE.test(str) || RATIO_VALUE_RE.test(str) || MAGNITUDE_VALUE_RE.test(str)) return 'static';
  if (STATIC_NUMERIC_RE.test(str)) return 'static'; // negative / EU / accounting / range / signed → exact static stat
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
    case 'comparison':
      return { position: 'center', maxWidth: '85%' };
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
    case 'comparison':
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
