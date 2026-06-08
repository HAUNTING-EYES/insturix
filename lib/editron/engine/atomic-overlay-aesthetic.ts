import type {
  AtomicOverlayFamily,
  AtomicOverlayForm,
  AtomicOverlayReceipt,
  AtomicPlacementRegion,
  AtomicTextForm,
} from './atomic-overlay-core';
import type { AtomicTransitionForm } from '../services/transition-form';
import type { AtomicZoomForm } from '../services/zoom-form';

export type AtomicAestheticDimension =
  | 'placement'
  | 'text'
  | 'motion'
  | 'rhythm'
  | 'variety';

export type AtomicAestheticSeverity = 'info' | 'warn' | 'fail';
export type AtomicAestheticStatus = 'pass' | 'warn' | 'fail';

export interface AtomicOverlayAestheticIssue {
  dimension: AtomicAestheticDimension;
  severity: AtomicAestheticSeverity;
  penalty: number;
  message: string;
  evidence?: string;
}

export interface AtomicOverlayAestheticContext {
  recentFamilies?: AtomicOverlayFamily[];
  recentRegions?: AtomicPlacementRegion[];
  recentIntents?: string[];
  activeOverlayCount?: number;
  window?: number;
}

export interface AtomicOverlayAestheticItem {
  receipt: AtomicOverlayReceipt;
  zoomForm?: AtomicZoomForm;
  transitionForm?: AtomicTransitionForm;
}

export interface AtomicOverlayAestheticResult {
  score: number;
  status: AtomicAestheticStatus;
  issues: AtomicOverlayAestheticIssue[];
  subscores: Record<AtomicAestheticDimension, number>;
}

export interface AtomicOverlayAestheticTimelineResult {
  score: number;
  status: AtomicAestheticStatus;
  items: AtomicOverlayAestheticResult[];
  issues: AtomicOverlayAestheticIssue[];
}

const DIMENSIONS: AtomicAestheticDimension[] = ['placement', 'text', 'motion', 'rhythm', 'variety'];
const VISUAL_OVERLAY_FAMILIES = new Set<AtomicOverlayFamily>([
  'motion-graphic',
  'text',
  'caption',
  'shape',
  'sticker',
  'image',
  'html-sticker',
]);
const HARSH_TRANSITIONS = new Set<string>(['whip-pan', 'zoom-punch', 'flash', 'glitch', 'film-burn']);

export function scoreAtomicOverlayAesthetic(
  item: AtomicOverlayAestheticItem,
  context: AtomicOverlayAestheticContext = {},
): AtomicOverlayAestheticResult {
  const penalties = emptyPenaltyMap();
  const issues: AtomicOverlayAestheticIssue[] = [];
  const addIssue = (
    dimension: AtomicAestheticDimension,
    penalty: number,
    message: string,
    evidence?: string,
    severity: AtomicAestheticSeverity = severityForPenalty(penalty),
  ) => {
    const clamped = clamp01(penalty);
    if (clamped <= 0) return;
    penalties[dimension] += clamped;
    issues.push({ dimension, severity, penalty: clamped, message, evidence });
  };

  scorePlacement(item.receipt, context, addIssue);
  scoreText(item.receipt.form, item.receipt, addIssue);
  scoreMotion(item, addIssue);
  scoreRhythm(item, addIssue);
  scoreVariety(item.receipt, context, addIssue);

  const totalPenalty = DIMENSIONS.reduce((sum, dimension) => sum + penalties[dimension], 0);
  const score = round3(clamp01(1 - totalPenalty));
  const subscores = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, round3(clamp01(1 - penalties[dimension]))]),
  ) as Record<AtomicAestheticDimension, number>;

  return {
    score,
    status: statusFor(score, issues),
    issues,
    subscores,
  };
}

export function scoreAtomicOverlayAestheticTimeline(
  items: AtomicOverlayAestheticItem[],
  context: AtomicOverlayAestheticContext = {},
): AtomicOverlayAestheticTimelineResult {
  const recentFamilies = [...(context.recentFamilies ?? [])];
  const recentRegions = [...(context.recentRegions ?? [])];
  const recentIntents = [...(context.recentIntents ?? [])];
  const results: AtomicOverlayAestheticResult[] = [];

  for (const item of items) {
    const result = scoreAtomicOverlayAesthetic(item, {
      ...context,
      recentFamilies,
      recentRegions,
      recentIntents,
    });
    results.push(result);
    recentFamilies.push(item.receipt.family);
    recentRegions.push(item.receipt.form.placement.region);
    recentIntents.push(item.receipt.intent);
  }

  const score = results.length
    ? round3(results.reduce((sum, result) => sum + result.score, 0) / results.length)
    : 1;
  const issues = results.flatMap((result) => result.issues);

  return {
    score,
    status: statusFor(score, issues),
    items: results,
    issues,
  };
}

function scorePlacement(
  receipt: AtomicOverlayReceipt,
  context: AtomicOverlayAestheticContext,
  addIssue: AddIssue,
): void {
  const form = receipt.form;
  const region = form.placement.region;
  const avoidRegions = new Set<AtomicPlacementRegion>([
    ...form.placement.avoidRegions,
    ...receipt.placementHints.avoid.map((box) => box.region),
  ]);
  if (avoidRegions.has(region)) {
    addIssue(
      'placement',
      0.34,
      'overlay lands inside an avoid region',
      `${region}; avoid=${Array.from(avoidRegions).join(',')}`,
      'fail',
    );
  }

  if (form.placement.preferredRegion && form.placement.preferredRegion !== region && form.collisions.risk >= 0.45) {
    addIssue('placement', 0.08, 'overlay ignores a stronger preferred region', `${region} != ${form.placement.preferredRegion}`);
  }

  if (form.collisions.risk >= 0.72) {
    addIssue('placement', 0.16, 'high visual/collision pressure', `risk=${form.collisions.risk.toFixed(2)}`);
  } else if (form.collisions.risk >= 0.5) {
    addIssue('placement', 0.08, 'moderate visual/collision pressure', `risk=${form.collisions.risk.toFixed(2)}`);
  }

  if (region === 'full-frame' && VISUAL_OVERLAY_FAMILIES.has(receipt.family)) {
    addIssue('placement', 0.1, 'visual overlay occupies the full frame without a stronger placement decision');
  }

  if ((context.activeOverlayCount ?? 0) >= 5 && VISUAL_OVERLAY_FAMILIES.has(receipt.family)) {
    addIssue('placement', 0.08, 'too many simultaneous visual overlays', `active=${context.activeOverlayCount}`);
  }
}

function scoreText(
  form: AtomicOverlayForm,
  receipt: AtomicOverlayReceipt,
  addIssue: AddIssue,
): void {
  const text = form.text;
  if (!text) return;

  const wordCount = countWords(text);
  const fontSize = fontSizePx(text.typography.fontSize);
  const rowCapacity = text.composition.rowCapacity ?? text.display?.maxWordsPerLine ?? wordCount;
  const targetRows = text.composition.targetRowCount;
  const isCaption = text.channel === 'caption';

  if (fontSize !== undefined && fontSize < (isCaption ? 34 : 24)) {
    addIssue('text', 0.14, 'text is likely too small to read', `fontSize=${fontSize}`);
  }
  if (fontSize !== undefined && fontSize > 112 && wordCount >= 7) {
    addIssue('text', 0.1, 'large type plus many words risks crowding', `fontSize=${fontSize}; words=${wordCount}`);
  }

  if (text.colorPlan.contrastMode === 'unknown' || !text.colorPlan.roles.primary) {
    addIssue('text', 0.1, 'text lacks a confident primary color/contrast plan');
  }

  if (isCaption && rowCapacity > 4) {
    addIssue('text', rowCapacity > 6 ? 0.2 : 0.12, 'caption row is too wide for punchy social-video reading', `rowCapacity=${rowCapacity}`);
  }
  if (isCaption && wordCount > 8 && targetRows <= 1) {
    addIssue('text', 0.16, 'long caption is compressed into one row', `words=${wordCount}; rows=${targetRows}`);
  }
  if (targetRows > 3) {
    addIssue('text', targetRows > 4 ? 0.2 : 0.12, 'text block has too many rows for a quick overlay', `rows=${targetRows}`);
  }

  if (text.hierarchy.emphasisDensity > 0.58) {
    addIssue('text', 0.12, 'too many words are emphasized at once', `density=${text.hierarchy.emphasisDensity.toFixed(2)}`);
  }

  const accentGlyphs = text.glyphs.filter((glyph) => glyph.visual?.fontRole === 'accent' || glyph.visual?.colorRole === 'accent');
  if (accentGlyphs.length > 0 && !text.colorPlan.roles.accent) {
    addIssue('text', 0.08, 'accent glyphs exist but no accent color role is resolved');
  }
  if (accentGlyphs.length > 0 && !text.fontPlan.roles.accent) {
    addIssue('text', 0.06, 'accent glyphs exist but no accent font role is resolved', undefined, 'info');
  }

  if (receipt.visualContext.legibilityRisk >= 0.72 && isCaption && targetRows > 2) {
    addIssue('text', 0.1, 'busy footage should keep caption blocks compact', `legibilityRisk=${receipt.visualContext.legibilityRisk.toFixed(2)}`);
  }
}

function scoreMotion(item: AtomicOverlayAestheticItem, addIssue: AddIssue): void {
  const { receipt, zoomForm, transitionForm } = item;
  const risk = receipt.form.collisions.visualRisk;
  if (receipt.form.motion.intensity >= 0.78 && risk >= 0.7) {
    addIssue('motion', 0.12, 'high-motion overlay on a high-pressure frame', `intensity=${receipt.form.motion.intensity.toFixed(2)}; risk=${risk.toFixed(2)}`);
  }

  if (zoomForm) {
    if (zoomForm.visualPressure >= 0.72 && Math.abs(zoomForm.scaleDelta) > 0.08) {
      addIssue('motion', 0.22, 'zoom amplitude is too strong for a busy frame', `scaleDelta=${zoomForm.scaleDelta.toFixed(3)}; pressure=${zoomForm.visualPressure.toFixed(2)}`, 'fail');
    }
    if (zoomForm.intent === 'emphasis-push' && zoomForm.focal.strength < 0.25) {
      addIssue('motion', 0.08, 'emphasis zoom has a weak focal anchor', `focal=${zoomForm.focal.transformOrigin}`);
    }
  }

  if (transitionForm) {
    if (transitionForm.visualPressure >= 0.72 && HARSH_TRANSITIONS.has(transitionForm.compatibilityType)) {
      addIssue('motion', 0.25, 'harsh transition chosen on a visually busy frame', `${transitionForm.compatibilityType}; pressure=${transitionForm.visualPressure.toFixed(2)}`, 'fail');
    }
    if (transitionForm.visualPressure >= 0.68 && transitionForm.sfxRole !== 'none') {
      addIssue('motion', 0.1, 'busy-frame transition should not demand extra SFX attention', transitionForm.sfxRole);
    }
    if (transitionForm.exposure > 0.45 && transitionForm.visualPressure > 0.55) {
      addIssue('motion', 0.12, 'exposure flash risks washing out already busy footage', `exposure=${transitionForm.exposure.toFixed(2)}`);
    }
  }
}

function scoreRhythm(item: AtomicOverlayAestheticItem, addIssue: AddIssue): void {
  const duration = item.receipt.durationFrames ?? item.receipt.form.timing.durationFrames;
  if (duration !== undefined && duration < 4) {
    addIssue('rhythm', 0.16, 'overlay duration is too short to register', `duration=${duration}`);
  }

  if (item.receipt.family === 'caption' && duration !== undefined && duration > 150) {
    addIssue('rhythm', 0.1, 'caption stays on screen too long for spoken rhythm', `duration=${duration}`);
  }

  if (item.zoomForm && item.zoomForm.durationFrames < 8 && item.zoomForm.visualPressure > 0.6) {
    addIssue('rhythm', 0.1, 'zoom attack is too fast for a busy frame', `duration=${item.zoomForm.durationFrames}`);
  }

  if (item.transitionForm && item.transitionForm.durationFrames < 5 && item.transitionForm.softness > 0.5) {
    addIssue('rhythm', 0.1, 'soft transition duration is too short for its softness', `duration=${item.transitionForm.durationFrames}`);
  }
}

function scoreVariety(
  receipt: AtomicOverlayReceipt,
  context: AtomicOverlayAestheticContext,
  addIssue: AddIssue,
): void {
  const window = context.window ?? 4;
  const recentFamilies = (context.recentFamilies ?? []).slice(-window);
  const recentRegions = (context.recentRegions ?? []).slice(-window);
  const recentIntents = (context.recentIntents ?? []).slice(-window);
  const sameFamily = recentFamilies.filter((family) => family === receipt.family).length;
  const sameRegion = recentRegions.filter((region) => region === receipt.form.placement.region).length;
  const sameIntent = recentIntents.filter((intent) => intent === receipt.intent).length;

  if (sameFamily >= 3) {
    addIssue('variety', 0.14, 'same overlay family is repeating too often', `${receipt.family} x${sameFamily}`);
  }
  if (sameIntent >= 2) {
    addIssue('variety', 0.1, 'same overlay intent is repeating', `${receipt.intent} x${sameIntent}`);
  }
  if (sameRegion >= 3) {
    addIssue('variety', 0.1, 'same screen region is repeating too often', `${receipt.form.placement.region} x${sameRegion}`);
  }
}

type AddIssue = (
  dimension: AtomicAestheticDimension,
  penalty: number,
  message: string,
  evidence?: string,
  severity?: AtomicAestheticSeverity,
) => void;

function emptyPenaltyMap(): Record<AtomicAestheticDimension, number> {
  return {
    placement: 0,
    text: 0,
    motion: 0,
    rhythm: 0,
    variety: 0,
  };
}

function countWords(text: AtomicTextForm): number {
  const glyphWords = text.glyphs.filter((glyph) => glyph.role !== 'punctuation').length;
  if (glyphWords > 0) return glyphWords;
  return text.rawText.trim().split(/\s+/).filter(Boolean).length;
}

function fontSizePx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  return Number.parseFloat(match[1]);
}

function severityForPenalty(penalty: number): AtomicAestheticSeverity {
  if (penalty >= 0.2) return 'fail';
  if (penalty >= 0.08) return 'warn';
  return 'info';
}

function statusFor(score: number, issues: AtomicOverlayAestheticIssue[]): AtomicAestheticStatus {
  if (score < 0.6 || issues.some((issue) => issue.severity === 'fail')) return 'fail';
  if (score < 0.82 || issues.some((issue) => issue.severity === 'warn')) return 'warn';
  return 'pass';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
