import type {
  AtomicOverlayFamily,
  AtomicOverlayReceipt,
  AtomicPlacementBox,
  AtomicTextForm,
} from '../../../engine/atomic-overlay-core';
import type { RenderValidityInput } from './render-validity';
import { classifyRenderValidity } from './render-validity';

export type RenderedAestheticDimension =
  | 'render'
  | 'safe-area'
  | 'visibility'
  | 'occlusion'
  | 'overlap'
  | 'text'
  | 'contrast'
  | 'motion-graphic'
  | 'clutter';

export type RenderedAestheticSeverity = 'info' | 'warn' | 'fail';
export type RenderedAestheticStatus = 'pass' | 'warn' | 'fail';

export interface RenderedOverlayBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Defaults to px unless all values look normalized. */
  coordinateSpace?: 'px' | 'normalized';
  opacity?: number;
  visiblePixelRatio?: number;
  contrastRatio?: number;
  foregroundLuma?: number;
  localBackgroundLuma?: number;
  textPixelHeight?: number;
}

export interface RenderedOverlayEvidence {
  id?: string | number;
  type?: string;
  family?: AtomicOverlayFamily;
  receipt?: AtomicOverlayReceipt;
  box?: RenderedOverlayBox;
  sampleRoles?: string[];
}

export interface RenderedFrameAestheticInput extends RenderValidityInput {
  width: number;
  height: number;
  fps?: number;
  frame?: number;
  overlays: RenderedOverlayEvidence[];
}

export interface RenderedAestheticIssue {
  dimension: RenderedAestheticDimension;
  severity: RenderedAestheticSeverity;
  penalty: number;
  message: string;
  overlayId?: string | number;
  relatedOverlayId?: string | number;
  evidence?: string;
}

export interface RenderedOverlayAestheticReport {
  id?: string | number;
  type?: string;
  family?: AtomicOverlayFamily;
  box?: PixelBox;
  issues: RenderedAestheticIssue[];
}

export interface RenderedFrameAestheticReport {
  score: number;
  status: RenderedAestheticStatus;
  issues: RenderedAestheticIssue[];
  overlayReports: RenderedOverlayAestheticReport[];
  subscores: Record<RenderedAestheticDimension, number>;
  render: ReturnType<typeof classifyRenderValidity>;
}

interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NormalizedOverlay {
  item: RenderedOverlayEvidence;
  family?: AtomicOverlayFamily;
  box?: PixelBox;
}

const DIMENSIONS: RenderedAestheticDimension[] = [
  'render',
  'safe-area',
  'visibility',
  'occlusion',
  'overlap',
  'text',
  'contrast',
  'motion-graphic',
  'clutter',
];

const VISUAL_FAMILIES = new Set<AtomicOverlayFamily>([
  'motion-graphic',
  'text',
  'caption',
  'shape',
  'sticker',
  'image',
  'html-scene',
  'html-sticker',
]);

const TEXT_FAMILIES = new Set<AtomicOverlayFamily>(['motion-graphic', 'text', 'caption', 'html-scene']);

export function scoreRenderedFrameAesthetic(input: RenderedFrameAestheticInput): RenderedFrameAestheticReport {
  const penalties = emptyPenaltyMap();
  const issues: RenderedAestheticIssue[] = [];
  const overlayReports = new Map<RenderedOverlayEvidence, RenderedOverlayAestheticReport>();
  const render = classifyRenderValidity(input);

  const addIssue = (
    dimension: RenderedAestheticDimension,
    penalty: number,
    message: string,
    options: {
      overlay?: RenderedOverlayEvidence;
      relatedOverlay?: RenderedOverlayEvidence;
      evidence?: string;
      severity?: RenderedAestheticSeverity;
    } = {},
  ) => {
    const clamped = clamp01(penalty);
    if (clamped <= 0) return;
    penalties[dimension] += clamped;
    const issue: RenderedAestheticIssue = {
      dimension,
      severity: options.severity ?? severityForPenalty(clamped),
      penalty: clamped,
      message,
      ...(options.overlay?.id !== undefined ? { overlayId: options.overlay.id } : {}),
      ...(options.relatedOverlay?.id !== undefined ? { relatedOverlayId: options.relatedOverlay.id } : {}),
      ...(options.evidence ? { evidence: options.evidence } : {}),
    };
    issues.push(issue);

    if (options.overlay) {
      const report = ensureOverlayReport(overlayReports, options.overlay, input);
      report.issues.push(issue);
    }
  };

  if (!render.status.ok) {
    addIssue('render', 1, `render is not valid: ${render.status.reason}`, {
      evidence: render.status.detail,
      severity: 'fail',
    });
  }

  const normalized = input.overlays.map((item) => normalizeOverlay(item, input));
  for (const overlay of normalized) {
    ensureOverlayReport(overlayReports, overlay.item, input);
    scoreVisibility(overlay, addIssue);
    scoreSafeArea(overlay, input, addIssue);
    scoreAvoidRegions(overlay, input, addIssue);
    scoreText(overlay, input, addIssue);
    scoreContrast(overlay, addIssue);
    scoreMotionGraphicTaste(overlay, input, addIssue);
  }

  scoreOverlayOverlap(normalized, addIssue);
  scoreClutter(normalized, addIssue);

  const totalPenalty = DIMENSIONS.reduce((sum, dimension) => sum + penalties[dimension], 0);
  const score = round3(clamp01(1 - totalPenalty));
  const subscores = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, round3(clamp01(1 - penalties[dimension]))]),
  ) as Record<RenderedAestheticDimension, number>;

  return {
    score,
    status: statusFor(score, issues),
    issues,
    overlayReports: [...overlayReports.values()],
    subscores,
    render,
  };
}

function scoreVisibility(overlay: NormalizedOverlay, addIssue: AddIssue): void {
  const opacity = overlay.item.box?.opacity ?? numberValue(overlay.item.receipt?.form.style.opacity);
  if (opacity !== undefined && opacity <= 0.03) {
    addIssue('visibility', 0.35, 'overlay is effectively invisible', {
      overlay: overlay.item,
      evidence: `opacity=${opacity.toFixed(3)}`,
      severity: 'fail',
    });
  }

  const visibleRatio = overlay.item.box?.visiblePixelRatio;
  if (visibleRatio !== undefined && visibleRatio <= 0.005) {
    addIssue('visibility', 0.35, 'overlay painted almost no visible pixels', {
      overlay: overlay.item,
      evidence: `visiblePixelRatio=${visibleRatio.toFixed(4)}`,
      severity: 'fail',
    });
  }
}

function scoreSafeArea(overlay: NormalizedOverlay, input: RenderedFrameAestheticInput, addIssue: AddIssue): void {
  if (!overlay.box || !isVisualFamily(overlay.family)) return;

  const outsideFrame = overflowAmount(overlay.box, { x: 0, y: 0, width: input.width, height: input.height });
  if (outsideFrame > 0) {
    addIssue('safe-area', 0.34, 'overlay is clipped by the frame', {
      overlay: overlay.item,
      evidence: `overflowPx=${outsideFrame.toFixed(1)}`,
      severity: 'fail',
    });
  }

  const margin = isTextFamily(overlay.family) ? 0.1 : 0.05;
  const safe = safeBox(input.width, input.height, margin);
  const safeOverflow = overflowAmount(overlay.box, safe);
  if (safeOverflow > 24) {
    addIssue('safe-area', 0.18, isTextFamily(overlay.family) ? 'text overlay leaves title-safe area' : 'visual overlay leaves action-safe area', {
      overlay: overlay.item,
      evidence: `overflowPx=${safeOverflow.toFixed(1)}; margin=${margin}`,
    });
  } else if (safeOverflow > 4) {
    addIssue('safe-area', 0.08, 'overlay is close to safe-area edge', {
      overlay: overlay.item,
      evidence: `overflowPx=${safeOverflow.toFixed(1)}; margin=${margin}`,
    });
  }
}

function scoreAvoidRegions(overlay: NormalizedOverlay, input: RenderedFrameAestheticInput, addIssue: AddIssue): void {
  if (!overlay.box || !isVisualFamily(overlay.family)) return;
  const avoid = overlay.item.receipt?.placementHints.avoid ?? [];
  for (const box of avoid) {
    if (box.strength < 0.2) continue;
    const avoidBox = placementBoxToPixels(box, input);
    const ratio = intersectionRatio(overlay.box, avoidBox);
    if (ratio >= 0.18 && box.strength >= 0.45) {
      addIssue('occlusion', 0.28, `overlay covers protected ${box.reason.replace('-', ' ')} region`, {
        overlay: overlay.item,
        evidence: `ratio=${ratio.toFixed(2)}; strength=${box.strength.toFixed(2)}`,
        severity: 'fail',
      });
    } else if (ratio >= 0.08 && box.strength >= 0.3) {
      addIssue('occlusion', 0.12, `overlay touches protected ${box.reason.replace('-', ' ')} region`, {
        overlay: overlay.item,
        evidence: `ratio=${ratio.toFixed(2)}; strength=${box.strength.toFixed(2)}`,
      });
    }
  }
}

function scoreOverlayOverlap(normalized: NormalizedOverlay[], addIssue: AddIssue): void {
  const visual = normalized.filter((overlay) => overlay.box && isVisualFamily(overlay.family));
  for (let i = 0; i < visual.length; i += 1) {
    for (let j = i + 1; j < visual.length; j += 1) {
      const a = visual[i];
      const b = visual[j];
      if (!a?.box || !b?.box) continue;
      const ratio = intersectionRatio(a.box, b.box);
      if (ratio >= 0.24) {
        addIssue('overlap', 0.2, 'visual overlays substantially overlap', {
          overlay: a.item,
          relatedOverlay: b.item,
          evidence: `ratio=${ratio.toFixed(2)}`,
          severity: 'fail',
        });
      } else if (ratio >= 0.1) {
        addIssue('overlap', 0.1, 'visual overlays partially overlap', {
          overlay: a.item,
          relatedOverlay: b.item,
          evidence: `ratio=${ratio.toFixed(2)}`,
        });
      }
    }
  }
}

function scoreText(overlay: NormalizedOverlay, input: RenderedFrameAestheticInput, addIssue: AddIssue): void {
  const text = overlay.item.receipt?.form.text;
  if (!text) return;

  const wordCount = countWords(text);
  const fontSize = overlay.item.box?.textPixelHeight ?? fontSizePx(text.typography.fontSize);
  const isCaption = text.channel === 'caption';
  const rowCapacity = text.composition.rowCapacity ?? text.display?.maxWordsPerLine ?? wordCount;
  const targetRows = text.composition.targetRowCount;

  if (fontSize !== undefined && fontSize < (isCaption ? 34 : 24)) {
    addIssue('text', 0.16, 'rendered text is too small to read', {
      overlay: overlay.item,
      evidence: `fontPx=${fontSize.toFixed(1)}`,
    });
  }

  if (isCaption && rowCapacity > 6) {
    addIssue('text', 0.2, 'caption row is too wide for social-video reading', {
      overlay: overlay.item,
      evidence: `rowCapacity=${rowCapacity}`,
      severity: 'fail',
    });
  } else if (isCaption && rowCapacity > 4) {
    addIssue('text', 0.12, 'caption row is crowded', {
      overlay: overlay.item,
      evidence: `rowCapacity=${rowCapacity}`,
    });
  }

  if (isCaption && wordCount > 8 && targetRows <= 1) {
    addIssue('text', 0.2, 'long caption is compressed into one row', {
      overlay: overlay.item,
      evidence: `words=${wordCount}; rows=${targetRows}`,
      severity: 'fail',
    });
  }

  const durationFrames = overlay.item.receipt?.durationFrames ?? overlay.item.receipt?.form.timing.durationFrames;
  if (durationFrames !== undefined && input.fps && wordCount > 0) {
    const seconds = durationFrames / input.fps;
    const needed = readSeconds(wordCount);
    if (seconds + 0.05 < needed) {
      addIssue('text', 0.16, 'text does not stay long enough to read', {
        overlay: overlay.item,
        evidence: `duration=${seconds.toFixed(2)}s; needed=${needed.toFixed(2)}s`,
      });
    }
  }
}

function scoreContrast(overlay: NormalizedOverlay, addIssue: AddIssue): void {
  const text = overlay.item.receipt?.form.text;
  if (!text) return;

  const contrastRatio = overlay.item.box?.contrastRatio ?? contrastFromLuma(
    overlay.item.box?.foregroundLuma,
    overlay.item.box?.localBackgroundLuma,
  );
  if (contrastRatio === undefined) return;

  const fontSize = overlay.item.box?.textPixelHeight ?? fontSizePx(text.typography.fontSize) ?? 16;
  const required = fontSize >= 42 ? 3 : 4.5;
  if (contrastRatio < required) {
    const exitPrep = overlay.item.sampleRoles?.includes('exit-prep') ?? false;
    const penalty = exitPrep ? 0.04 : contrastRatio < 2 ? 0.24 : 0.18;
    const severity: RenderedAestheticSeverity = exitPrep ? 'info' : contrastRatio < 2.4 ? 'fail' : 'warn';
    const message = exitPrep
      ? 'rendered text contrast drops during planned exit fade'
      : 'rendered text contrast is below accessibility floor';
    const phaseEvidence = overlay.item.sampleRoles?.length
      ? `; sampleRoles=${overlay.item.sampleRoles.join('+')}`
      : '';

    addIssue('contrast', penalty, message, {
      overlay: overlay.item,
      evidence: `contrast=${contrastRatio.toFixed(2)}; required=${required}${phaseEvidence}`,
      severity,
    });
  }
}

function scoreMotionGraphicTaste(overlay: NormalizedOverlay, input: RenderedFrameAestheticInput, addIssue: AddIssue): void {
  if (overlay.family !== 'motion-graphic') return;
  const receipt = overlay.item.receipt;
  if (!receipt) return;

  const text = receipt.form.text;
  const rawText = text?.rawText ?? stringAtomValue(receipt, 'text-content') ?? '';
  const atomValues = receipt.atoms.map((atom) => String(atom.value).toLowerCase());
  const atomKeys = receipt.atoms.map((atom) => atom.key.toLowerCase());
  const hasLicensedSparseTrace = atomValues.includes('numeric-sparse-rate-trace') || atomKeys.some((key) => key.includes('numeric-sparse-rate-trace'));
  const hasShellAtom = atomValues.some((value) => (
    value.includes('sm-backdrop')
    || value.includes('semantic-stat-field')
    || value.includes('semantic-stat-axis')
    || value.includes('stat-shell')
  )) || atomKeys.some((key) => (
    key.includes('sm-backdrop')
    || key.includes('semantic-stat-field')
    || key.includes('semantic-stat-axis')
    || key.includes('stat-shell')
  ));
  const sparseRate = looksLikeSparseRate(rawText);

  if (sparseRate && hasShellAtom && !hasLicensedSparseTrace) {
    addIssue('motion-graphic', 0.28, 'sparse rate MG rendered with a generic stat shell/card', {
      overlay: overlay.item,
      evidence: `text="${rawText}"; atoms=${matchedAtomEvidence(atomKeys, atomValues)}`,
      severity: 'fail',
    });
  }

  const visibleRatio = overlay.item.box?.visiblePixelRatio;
  if (overlay.box && rawText.trim()) {
    const minConceptHeight = input.height * 0.035;
    const boxHeightRatio = overlay.box.height / Math.max(1, input.height);
    if (overlay.box.height < minConceptHeight && !hasLicensedSparseTrace) {
      addIssue('motion-graphic', 0.24, 'motion graphic renders as a tiny dead concept mark instead of a readable composition', {
        overlay: overlay.item,
        evidence: `boxHeight=${overlay.box.height.toFixed(1)}; frameHeight=${input.height}; heightRatio=${boxHeightRatio.toFixed(3)}`,
        severity: 'fail',
      });
    }
  }

  if (overlay.box && visibleRatio !== undefined) {
    const frameArea = Math.max(1, input.width * input.height);
    const boxAreaRatio = (overlay.box.width * overlay.box.height) / frameArea;
    if (boxAreaRatio >= 0.28 && visibleRatio <= 0.025 && text && !hasLicensedSparseTrace) {
      addIssue('motion-graphic', 0.22, 'motion graphic reserves a large frame area but renders mostly empty/text-only pixels', {
        overlay: overlay.item,
        evidence: `boxArea=${boxAreaRatio.toFixed(3)}; visiblePixelRatio=${visibleRatio.toFixed(4)}`,
        severity: 'fail',
      });
    }
  }
}

function scoreClutter(normalized: NormalizedOverlay[], addIssue: AddIssue): void {
  const visual = normalized.filter((overlay) => isVisualFamily(overlay.family));
  if (visual.length >= 5) {
    addIssue('clutter', 0.24, 'too many visual overlays are active on the same frame', {
      evidence: `activeVisual=${visual.length}`,
      severity: 'fail',
    });
  } else if (visual.length >= 4) {
    addIssue('clutter', 0.14, 'frame is visually crowded with overlays', {
      evidence: `activeVisual=${visual.length}`,
    });
  }

  const busyReceipts = visual.filter((overlay) => (overlay.item.receipt?.visualContext.screenBusyness ?? 0) >= 0.72);
  if (visual.length >= 3 && busyReceipts.length > 0) {
    addIssue('clutter', 0.12, 'busy footage has too many simultaneous overlay demands', {
      evidence: `activeVisual=${visual.length}; busyReceipts=${busyReceipts.length}`,
    });
  }
}

function normalizeOverlay(item: RenderedOverlayEvidence, input: RenderedFrameAestheticInput): NormalizedOverlay {
  const family = item.family ?? item.receipt?.family;
  return {
    item,
    family,
    box: normalizeBox(item.box ?? boxFromReceipt(item.receipt), input),
  };
}

function boxFromReceipt(receipt: AtomicOverlayReceipt | undefined): RenderedOverlayBox | undefined {
  if (!receipt) return undefined;
  const target = receipt.target;
  const targetBox = recordBox(target);
  if (targetBox) return targetBox;

  const placement = receipt.form.placement;
  if (
    placement.x !== undefined &&
    placement.y !== undefined &&
    placement.width !== undefined &&
    placement.height !== undefined
  ) {
    return {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };
  }

  return undefined;
}

function recordBox(record: Record<string, number | string | boolean | undefined> | undefined): RenderedOverlayBox | undefined {
  const x = numberValue(record?.x);
  const y = numberValue(record?.y);
  const width = numberValue(record?.width);
  const height = numberValue(record?.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return { x, y, width, height };
}

function normalizeBox(box: RenderedOverlayBox | undefined, input: RenderedFrameAestheticInput): PixelBox | undefined {
  if (!box) return undefined;
  const normalized = box.coordinateSpace === 'normalized' || (
    box.coordinateSpace !== 'px' &&
    Math.max(Math.abs(box.x), Math.abs(box.y), Math.abs(box.width), Math.abs(box.height)) <= 1.5
  );

  return {
    x: normalized ? box.x * input.width : box.x,
    y: normalized ? box.y * input.height : box.y,
    width: normalized ? box.width * input.width : box.width,
    height: normalized ? box.height * input.height : box.height,
  };
}

function placementBoxToPixels(box: AtomicPlacementBox, input: RenderedFrameAestheticInput): PixelBox {
  return {
    x: box.x * input.width,
    y: box.y * input.height,
    width: box.width * input.width,
    height: box.height * input.height,
  };
}

function safeBox(width: number, height: number, margin: number): PixelBox {
  return {
    x: width * margin,
    y: height * margin,
    width: width * (1 - margin * 2),
    height: height * (1 - margin * 2),
  };
}

function overflowAmount(box: PixelBox, bounds: PixelBox): number {
  const left = Math.max(0, bounds.x - box.x);
  const top = Math.max(0, bounds.y - box.y);
  const right = Math.max(0, box.x + box.width - (bounds.x + bounds.width));
  const bottom = Math.max(0, box.y + box.height - (bounds.y + bounds.height));
  return Math.max(left, top, right, bottom);
}

function intersectionRatio(a: PixelBox, b: PixelBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? intersection / smaller : 0;
}

function ensureOverlayReport(
  reports: Map<RenderedOverlayEvidence, RenderedOverlayAestheticReport>,
  item: RenderedOverlayEvidence,
  input: RenderedFrameAestheticInput,
): RenderedOverlayAestheticReport {
  const existing = reports.get(item);
  if (existing) return existing;
  const box = normalizeBox(item.box ?? boxFromReceipt(item.receipt), input);
  const family = item.family ?? item.receipt?.family;
  const report: RenderedOverlayAestheticReport = {
    ...(item.id !== undefined ? { id: item.id } : {}),
    ...(item.type !== undefined ? { type: item.type } : {}),
    ...(family ? { family } : {}),
    ...(box ? { box } : {}),
    issues: [],
  };
  reports.set(item, report);
  return report;
}

function countWords(text: AtomicTextForm): number {
  const glyphWords = text.glyphs.filter((glyph) => glyph.role !== 'punctuation').length;
  if (glyphWords > 0) return glyphWords;
  return text.rawText.trim().split(/\s+/).filter(Boolean).length;
}

function fontSizePx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^\s*(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : undefined;
}

function readSeconds(wordCount: number): number {
  return 0.35 + wordCount / 3.2;
}

function contrastFromLuma(foreground: number | undefined, background: number | undefined): number | undefined {
  if (foreground === undefined || background === undefined) return undefined;
  const lighter = Math.max(foreground, background) + 0.05;
  const darker = Math.min(foreground, background) + 0.05;
  return darker > 0 ? lighter / darker : undefined;
}

function isVisualFamily(family: AtomicOverlayFamily | undefined): boolean {
  return family !== undefined && VISUAL_FAMILIES.has(family);
}

function isTextFamily(family: AtomicOverlayFamily | undefined): boolean {
  return family !== undefined && TEXT_FAMILIES.has(family);
}

function severityForPenalty(penalty: number): RenderedAestheticSeverity {
  if (penalty >= 0.2) return 'fail';
  if (penalty >= 0.08) return 'warn';
  return 'info';
}

function statusFor(score: number, issues: RenderedAestheticIssue[]): RenderedAestheticStatus {
  if (score < 0.6 || issues.some((issue) => issue.severity === 'fail')) return 'fail';
  if (score < 0.82 || issues.some((issue) => issue.severity === 'warn')) return 'warn';
  return 'pass';
}

function emptyPenaltyMap(): Record<RenderedAestheticDimension, number> {
  return {
    render: 0,
    'safe-area': 0,
    visibility: 0,
    occlusion: 0,
    overlap: 0,
    text: 0,
    contrast: 0,
    'motion-graphic': 0,
    clutter: 0,
  };
}

function stringAtomValue(receipt: AtomicOverlayReceipt, kind: string): string | undefined {
  const atom = receipt.atoms.find((candidate) => candidate.kind === kind);
  return typeof atom?.value === 'string' ? atom.value : undefined;
}

function looksLikeSparseRate(text: string): boolean {
  const normalized = text.toLowerCase();
  const match = normalized.match(/(?:^|\s)(0?\.\d+)(?:\s|$)/);
  if (!match) return false;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value)
    && value > 0
    && value < 1
    && /\b(per|rate|daily|weekly|monthly|yearly|frequency|average)\b/.test(normalized);
}

function matchedAtomEvidence(keys: string[], values: string[]): string {
  return [...keys, ...values]
    .filter((item) => (
      item.includes('sm-backdrop')
      || item.includes('semantic-stat-field')
      || item.includes('semantic-stat-axis')
      || item.includes('stat-shell')
      || item.includes('numeric-sparse-rate-trace')
    ))
    .slice(0, 6)
    .join(',');
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type AddIssue = (
  dimension: RenderedAestheticDimension,
  penalty: number,
  message: string,
  options?: {
    overlay?: RenderedOverlayEvidence;
    relatedOverlay?: RenderedOverlayEvidence;
    evidence?: string;
    severity?: RenderedAestheticSeverity;
  },
) => void;
