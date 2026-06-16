import type { SignalSnapshot, SignalTimeline } from './signal-registry';
import type { OverlayCategory, OverlayDefinition, ScoringResult } from '../engine/utility-types';
import { scoreAllOverlays } from '../engine/utility-scorer';
import {
  scoreAtomicOverlayAestheticTimeline,
  type AtomicAestheticSeverity,
  type AtomicAestheticStatus,
} from '../engine/atomic-overlay-aesthetic';
import type { AtomicOverlayReceipt } from '../engine/atomic-overlay-core';
import type { AtomicTransitionForm } from './transition-form';
import type { AtomicZoomForm } from './zoom-form';
import {
  MOMENT_PRIMITIVE_SIGNAL_KEYS,
  MOMENT_SIGNAL_KEYS,
  type MomentAtom,
} from './moment-bundle';

export interface MomentOverlayRef {
  id?: string | number;
  type?: string;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
  assetId?: string;
  metadata?: Record<string, unknown>;
  content?: unknown;
}

export interface MomentSystemCandidate {
  overlayId: string;
  category: string;
  score: number;
  outputValues: Record<string, number | string | boolean>;
  placementRegion?: string;
}

export interface MomentPrimitiveInfluence {
  primitiveAtomCount: number;
  candidateDeltaCount: number;
  changedCategories: string[];
  placementRegionChanged: boolean;
  baselineTopByCategory: Record<string, string>;
  primitiveTopByCategory: Record<string, string>;
}

export interface MomentAestheticIssue {
  overlayId?: string | number;
  type?: string;
  dimension: string;
  severity: AtomicAestheticSeverity;
  penalty: number;
  message: string;
  evidence?: string;
}

export interface MomentAestheticReport {
  scoredOverlays: number;
  score: number | null;
  status: AtomicAestheticStatus | 'unscored';
  issues: MomentAestheticIssue[];
}

export interface MomentBundle {
  id: string;
  frame: number;
  timestampMs: number;
  sourceFrame: number | null;
  sourceTimestampMs: number | null;
  sourceGridFrame: number | null;
  atoms: MomentAtom[];
  activeOverlays: Array<{ id?: string | number; type?: string; ageFrames: number; remainingFrames: number }>;
  systemCandidates: MomentSystemCandidate[];
  primitiveInfluence: MomentPrimitiveInfluence;
  aesthetic: MomentAestheticReport;
  qualityLabels: {
    needsHumanLabel: boolean;
    notes: string[];
  };
}

export interface MomentBundleCategoryMatch {
  observedCategory: string;
  matchedCandidate?: MomentSystemCandidate & { rankInCategory: number };
  score: number;
}

export interface MomentBundleEvaluation {
  bundleId: string;
  frame: number;
  timestampMs: number;
  level: 'matched' | 'partial' | 'miss' | 'no-reference';
  score: number;
  observedCategories: string[];
  candidateCategories: string[];
  matches: MomentBundleCategoryMatch[];
  missedCategories: string[];
  notes: string[];
}

export interface MomentBundleEvaluationSummary {
  totalRows: number;
  observedRows: number;
  matchedRows: number;
  partialRows: number;
  missedRows: number;
  noReferenceRows: number;
  averageObservedScore: number;
  categoryRecall: Record<string, { observed: number; matched: number; averageScore: number }>;
  primitiveInfluenceRows: number;
  primitiveChangedRows: number;
  primitivePlacementChangedRows: number;
  primitiveChangedCategories: Record<string, number>;
  aestheticRows: number;
  averageAestheticScore: number;
  aestheticStatusCounts: Record<string, number>;
  aestheticIssueCounts: Record<string, number>;
  noteCounts: Record<string, number>;
}

export interface MomentBundleEvaluationReport {
  rows: MomentBundleEvaluation[];
  summary: MomentBundleEvaluationSummary;
}

export interface BuildMomentBundleOptions {
  timeline: SignalTimeline;
  overlays: MomentOverlayRef[];
  overlayDefinitions?: OverlayDefinition[];
  frameStride?: number;
  includeOverlayFrames?: boolean;
  topCandidatesPerCategory?: number;
  eventWindowMs?: number;
}

const SOURCE_TYPES = new Set(['video']);
const DEFAULT_TARGET_TYPES = new Set(['motion-graphic', 'html-scene', 'sticker', 'text', 'caption', 'sound', 'transition']);
const STANDALONE_CANDIDATE_CATEGORIES = new Set<OverlayCategory>(['zoom', 'transition', 'sfx', 'graphic', 'filter', 'caption', 'cut', 'camera']);
const OVERLAY_TYPE_TO_CATEGORY: Record<string, OverlayCategory> = {
  'motion-graphic': 'graphic',
  'html-scene': 'graphic',
  sticker: 'graphic',
  text: 'graphic',
  caption: 'caption',
  subtitle: 'caption',
  sound: 'sfx',
  sfx: 'sfx',
  transition: 'transition',
  filter: 'filter',
  zoom: 'zoom',
  'camera-move': 'camera',
  'camera-movement': 'camera',
  'frame-movement': 'camera',
  cut: 'cut',
};

export function buildMomentBundles(options: BuildMomentBundleOptions): MomentBundle[] {
  const frameStride = Math.max(1, options.frameStride ?? options.timeline.gridInterval);
  const eventWindowMs = options.eventWindowMs ?? 500;
  const frames = collectCutFrames(options.overlays, frameStride, options.includeOverlayFrames ?? true);
  const sourceClips = options.overlays
    .filter((overlay) => SOURCE_TYPES.has(String(overlay.type ?? '')))
    .sort((a, b) => readFrame(a.from) - readFrame(b.from));

  return frames.map((frame) => {
    const timestampMs = (frame / options.timeline.fps) * 1000;
    const sourceFrame = mapCutFrameToSourceFrame(frame, sourceClips);
    const sourceGridFrame = sourceFrame == null ? null : nearestGridFrame(options.timeline, sourceFrame);
    const snapshot = sourceGridFrame == null ? undefined : options.timeline.gridSignals.get(sourceGridFrame);
    const activeOverlays = activeOverlaysAt(options.overlays, frame);
    const atoms = buildAtoms(snapshot, options.timeline, activeOverlays, sourceFrame, eventWindowMs);
    const systemCandidates = snapshot && options.overlayDefinitions?.length
      ? buildSystemCandidates(options.overlayDefinitions, snapshot, options.topCandidatesPerCategory ?? 2)
      : [];
    const baselineCandidates = snapshot && options.overlayDefinitions?.length
      ? buildSystemCandidates(options.overlayDefinitions, snapshot, options.topCandidatesPerCategory ?? 2, MOMENT_PRIMITIVE_SIGNAL_KEYS)
      : [];
    const primitiveInfluence = buildPrimitiveInfluence(atoms, systemCandidates, baselineCandidates);
    const aesthetic = buildMomentAesthetic(activeOverlays);
    const notes = buildQualityNotes(sourceFrame, snapshot, atoms, systemCandidates, activeOverlays, aesthetic);

    return {
      id: `moment-${frame}`,
      frame,
      timestampMs,
      sourceFrame,
      sourceTimestampMs: sourceFrame == null ? null : (sourceFrame / options.timeline.fps) * 1000,
      sourceGridFrame,
      atoms,
      activeOverlays: activeOverlays.map((overlay) => ({
        id: overlay.id,
        type: overlay.type,
        ageFrames: frame - readFrame(overlay.from),
        remainingFrames: Math.max(0, readFrame(overlay.from) + readFrame(overlay.durationInFrames) - frame),
      })),
      systemCandidates,
      primitiveInfluence,
      aesthetic,
      qualityLabels: {
        needsHumanLabel: true,
        notes,
      },
    };
  });
}

export function evaluateMomentBundles(bundles: MomentBundle[]): MomentBundleEvaluationReport {
  const rows = bundles.map(evaluateMomentBundle);
  const observedRows = rows.filter((row) => row.observedCategories.length > 0);
  const primitiveRows = bundles.filter((bundle) => bundle.primitiveInfluence.primitiveAtomCount > 0);
  const primitiveChangedRows = primitiveRows.filter((bundle) => bundle.primitiveInfluence.candidateDeltaCount > 0);
  const categoryStats = new Map<string, { observed: number; matched: number; scoreTotal: number }>();
  const primitiveChangedCategories = new Map<string, number>();
  const aestheticStatusCounts = new Map<string, number>();
  const aestheticIssueCounts = new Map<string, number>();
  const noteCounts = new Map<string, number>();

  for (const row of rows) {
    for (const note of row.notes) noteCounts.set(note, (noteCounts.get(note) ?? 0) + 1);
    for (const match of row.matches) {
      const stats = categoryStats.get(match.observedCategory) ?? { observed: 0, matched: 0, scoreTotal: 0 };
      stats.observed += 1;
      if (match.matchedCandidate) stats.matched += 1;
      stats.scoreTotal += match.score;
      categoryStats.set(match.observedCategory, stats);
    }
  }
  for (const bundle of primitiveChangedRows) {
    for (const category of bundle.primitiveInfluence.changedCategories) {
      primitiveChangedCategories.set(category, (primitiveChangedCategories.get(category) ?? 0) + 1);
    }
  }
  const aestheticRows = bundles.filter((bundle) => bundle.aesthetic.scoredOverlays > 0);
  for (const bundle of bundles) {
    const status = bundle.aesthetic.status;
    aestheticStatusCounts.set(status, (aestheticStatusCounts.get(status) ?? 0) + 1);
    for (const issue of bundle.aesthetic.issues) {
      const key = `${issue.dimension}:${issue.severity}`;
      aestheticIssueCounts.set(key, (aestheticIssueCounts.get(key) ?? 0) + 1);
    }
  }

  const categoryRecall: MomentBundleEvaluationSummary['categoryRecall'] = {};
  for (const [category, stats] of categoryStats) {
    categoryRecall[category] = {
      observed: stats.observed,
      matched: stats.matched,
      averageScore: round3(stats.observed > 0 ? stats.scoreTotal / stats.observed : 0),
    };
  }

  const observedScoreTotal = observedRows.reduce((sum, row) => sum + row.score, 0);
  return {
    rows,
    summary: {
      totalRows: rows.length,
      observedRows: observedRows.length,
      matchedRows: rows.filter((row) => row.level === 'matched').length,
      partialRows: rows.filter((row) => row.level === 'partial').length,
      missedRows: rows.filter((row) => row.level === 'miss').length,
      noReferenceRows: rows.filter((row) => row.level === 'no-reference').length,
      averageObservedScore: round3(observedRows.length > 0 ? observedScoreTotal / observedRows.length : 0),
      categoryRecall,
      primitiveInfluenceRows: primitiveRows.length,
      primitiveChangedRows: primitiveChangedRows.length,
      primitivePlacementChangedRows: primitiveRows.filter((bundle) => bundle.primitiveInfluence.placementRegionChanged).length,
      primitiveChangedCategories: Object.fromEntries([...primitiveChangedCategories].sort(([a], [b]) => a.localeCompare(b))),
      aestheticRows: aestheticRows.length,
      averageAestheticScore: round3(aestheticRows.length > 0
        ? aestheticRows.reduce((sum, bundle) => sum + (bundle.aesthetic.score ?? 0), 0) / aestheticRows.length
        : 0),
      aestheticStatusCounts: Object.fromEntries([...aestheticStatusCounts].sort(([a], [b]) => a.localeCompare(b))),
      aestheticIssueCounts: Object.fromEntries([...aestheticIssueCounts].sort(([a], [b]) => a.localeCompare(b))),
      noteCounts: Object.fromEntries([...noteCounts].sort(([a], [b]) => a.localeCompare(b))),
    },
  };
}

function evaluateMomentBundle(bundle: MomentBundle): MomentBundleEvaluation {
  const observedCategories = uniqueStrings(bundle.activeOverlays
    .map((overlay) => overlayCategoryForType(overlay.type))
    .filter((category): category is string => Boolean(category)));
  const rankedCandidates = rankedStandaloneCandidates(bundle.systemCandidates);
  const candidateCategories = uniqueStrings(rankedCandidates.map((candidate) => candidate.category));
  const matches = observedCategories.map((category) => {
    const matchedCandidate = rankedCandidates.find((candidate) => candidate.category === category);
    return {
      observedCategory: category,
      matchedCandidate,
      score: matchedCandidate ? categoryMatchScore(matchedCandidate.rankInCategory) : 0,
    };
  });
  const missedCategories = matches
    .filter((match) => !match.matchedCandidate)
    .map((match) => match.observedCategory);
  const notes = [...bundle.qualityLabels.notes];

  if (observedCategories.length === 0) {
    if (candidateCategories.length > 0) notes.push('candidate-only-row');
    return {
      bundleId: bundle.id,
      frame: bundle.frame,
      timestampMs: bundle.timestampMs,
      level: 'no-reference',
      score: 0,
      observedCategories,
      candidateCategories,
      matches,
      missedCategories,
      notes,
    };
  }

  const score = round3(matches.reduce((sum, match) => sum + match.score, 0) / observedCategories.length);
  const matchedCount = matches.length - missedCategories.length;
  const level = matchedCount === observedCategories.length ? 'matched' : matchedCount > 0 ? 'partial' : 'miss';
  if (missedCategories.length > 0) notes.push(`missed:${missedCategories.join(',')}`);

  return {
    bundleId: bundle.id,
    frame: bundle.frame,
    timestampMs: bundle.timestampMs,
    level,
    score,
    observedCategories,
    candidateCategories,
    matches,
    missedCategories,
    notes,
  };
}

function collectCutFrames(overlays: MomentOverlayRef[], frameStride: number, includeOverlayFrames: boolean): number[] {
  const maxFrame = Math.max(0, ...overlays.map((overlay) => readFrame(overlay.from) + readFrame(overlay.durationInFrames)));
  const frames = new Set<number>();
  for (let frame = 0; frame <= maxFrame; frame += frameStride) frames.add(frame);
  if (includeOverlayFrames) {
    for (const overlay of overlays) {
      if (DEFAULT_TARGET_TYPES.has(String(overlay.type ?? ''))) frames.add(readFrame(overlay.from));
    }
  }
  return [...frames].sort((a, b) => a - b);
}

function mapCutFrameToSourceFrame(frame: number, sourceClips: MomentOverlayRef[]): number | null {
  const clip = sourceClips.find((candidate) => {
    const start = readFrame(candidate.from);
    const end = start + readFrame(candidate.durationInFrames);
    return frame >= start && frame < end;
  });
  if (!clip) return null;
  return readSourceStartFrame(clip) + Math.max(0, frame - readFrame(clip.from));
}

function nearestGridFrame(timeline: SignalTimeline, sourceFrame: number): number | null {
  const frames = [...timeline.gridSignals.keys()];
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestDistance = Math.abs(sourceFrame - best);
  for (const frame of frames) {
    const distance = Math.abs(sourceFrame - frame);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

function buildAtoms(
  snapshot: SignalSnapshot | undefined,
  timeline: SignalTimeline,
  activeOverlays: MomentOverlayRef[],
  sourceFrame: number | null,
  eventWindowMs: number,
): MomentAtom[] {
  const atoms: MomentAtom[] = [];
  if (snapshot) {
    for (const signal of MOMENT_SIGNAL_KEYS) {
      const value = snapshot[signal.key];
      if (isAtomValue(value)) {
        atoms.push({
          channel: signal.channel,
          key: signal.key,
          value,
          strength: atomStrength(value),
          source: signal.source ?? 'signal',
        });
      }
    }
  }

  if (sourceFrame != null) {
    const sourceTimestampMs = (sourceFrame / timeline.fps) * 1000;
    for (const event of timeline.eventSignals) {
      if (Math.abs(event.timestampMs - sourceTimestampMs) <= eventWindowMs && isAtomValue(event.value)) {
        atoms.push({
          channel: 'speech',
          key: event.signal,
          value: event.context ?? event.value,
          strength: atomStrength(event.value),
          source: 'event',
        });
      }
    }
  }

  for (const overlay of activeOverlays) {
    atoms.push({
      channel: 'overlay',
      key: `active.${overlay.type ?? 'unknown'}`,
      value: String(overlay.id ?? overlay.type ?? 'overlay'),
      strength: 1,
      source: 'overlay',
    });
  }

  return atoms.sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key));
}

function buildSystemCandidates(
  definitions: OverlayDefinition[],
  snapshot: SignalSnapshot,
  topPerCategory: number,
  omittedSignals?: Set<string>,
): MomentSystemCandidate[] {
  const numericSignals: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (omittedSignals?.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) numericSignals[key] = value;
  }

  const byCategory = new Map<string, ScoringResult[]>();
  for (const result of scoreAllOverlays(definitions, numericSignals)) {
    const category = String(result.category);
    const bucket = byCategory.get(category) ?? [];
    if (bucket.length < topPerCategory) {
      bucket.push(result);
      byCategory.set(category, bucket);
    }
  }

  return [...byCategory.values()].flat().map((result) => ({
    overlayId: result.overlayId,
    category: result.category,
    score: result.totalScore,
    outputValues: result.outputValues,
    placementRegion: result.placementAdjustment?.candidateRegion,
  }));
}

function buildPrimitiveInfluence(
  atoms: MomentAtom[],
  primitiveCandidates: MomentSystemCandidate[],
  baselineCandidates: MomentSystemCandidate[],
): MomentPrimitiveInfluence {
  const primitiveAtomCount = atoms.filter((atom) => MOMENT_PRIMITIVE_SIGNAL_KEYS.has(atom.key)).length;
  const primitiveTopByCategory = topCandidateByCategory(primitiveCandidates);
  const baselineTopByCategory = topCandidateByCategory(baselineCandidates);
  const categories = uniqueStrings([
    ...Object.keys(primitiveTopByCategory),
    ...Object.keys(baselineTopByCategory),
  ]);
  const changedCategories = categories.filter((category) => {
    const primitive = primitiveTopByCategory[category];
    const baseline = baselineTopByCategory[category];
    return primitive !== baseline;
  });
  const placementRegionChanged = categories.some((category) => {
    const primitive = firstCandidateForCategory(primitiveCandidates, category);
    const baseline = firstCandidateForCategory(baselineCandidates, category);
    return primitive?.placementRegion !== baseline?.placementRegion;
  });

  return {
    primitiveAtomCount,
    candidateDeltaCount: changedCategories.length,
    changedCategories,
    placementRegionChanged,
    baselineTopByCategory,
    primitiveTopByCategory,
  };
}

function topCandidateByCategory(candidates: MomentSystemCandidate[]): Record<string, string> {
  const top: Record<string, string> = {};
  for (const candidate of candidates) {
    if (top[candidate.category]) continue;
    top[candidate.category] = candidate.overlayId;
  }
  return top;
}

function firstCandidateForCategory(candidates: MomentSystemCandidate[], category: string): MomentSystemCandidate | undefined {
  return candidates.find((candidate) => candidate.category === category);
}

function activeOverlaysAt(overlays: MomentOverlayRef[], frame: number): MomentOverlayRef[] {
  return overlays.filter((overlay) => {
    if (SOURCE_TYPES.has(String(overlay.type ?? ''))) return false;
    const start = readFrame(overlay.from);
    const end = start + readFrame(overlay.durationInFrames);
    return frame >= start && frame < end;
  });
}

function buildQualityNotes(
  sourceFrame: number | null,
  snapshot: SignalSnapshot | undefined,
  atoms: MomentAtom[],
  systemCandidates: MomentSystemCandidate[],
  activeOverlays: MomentOverlayRef[],
  aesthetic: MomentAestheticReport,
): string[] {
  const notes: string[] = [];
  if (sourceFrame == null) notes.push('no-source-clip');
  if (!snapshot) notes.push('no-source-signal-snapshot');
  if (!atoms.some((atom) => atom.channel === 'visual')) notes.push('missing-visual-atoms');
  if (systemCandidates.length === 0) notes.push('no-system-candidates');
  if (activeOverlays.length > 0 && aesthetic.scoredOverlays === 0) notes.push('missing-atomic-aesthetic-receipts');
  if (aesthetic.status === 'warn') notes.push('aesthetic-warn');
  if (aesthetic.status === 'fail') notes.push('aesthetic-fail');
  return notes;
}

function buildMomentAesthetic(activeOverlays: MomentOverlayRef[]): MomentAestheticReport {
  const scored: Array<{
    overlay: MomentOverlayRef;
    receipt: AtomicOverlayReceipt;
    zoomForm?: AtomicZoomForm;
    transitionForm?: AtomicTransitionForm;
  }> = [];

  for (const overlay of activeOverlays) {
    const receipt = atomicReceiptFromOverlay(overlay);
    if (!receipt) continue;
    const zoomForm = atomicZoomFormFromOverlay(overlay);
    const transitionForm = atomicTransitionFormFromOverlay(overlay);
    scored.push({
      overlay,
      receipt,
      ...(zoomForm ? { zoomForm } : {}),
      ...(transitionForm ? { transitionForm } : {}),
    });
  }

  if (scored.length === 0) {
    return {
      scoredOverlays: 0,
      score: null,
      status: 'unscored',
      issues: [],
    };
  }

  const result = scoreAtomicOverlayAestheticTimeline(scored.map((item) => ({
    receipt: item.receipt,
    ...(item.zoomForm ? { zoomForm: item.zoomForm } : {}),
    ...(item.transitionForm ? { transitionForm: item.transitionForm } : {}),
  })));
  const issues = result.items.flatMap((itemResult, index) => {
    const scoredItem = scored[index];
    if (!scoredItem) return [];
    return itemResult.issues.map((issue) => ({
      overlayId: scoredItem.overlay.id,
      type: scoredItem.overlay.type,
      dimension: issue.dimension,
      severity: issue.severity,
      penalty: issue.penalty,
      message: issue.message,
      evidence: issue.evidence,
    }));
  });

  return {
    scoredOverlays: scored.length,
    score: result.score,
    status: result.status,
    issues,
  };
}

function atomicReceiptFromOverlay(overlay: MomentOverlayRef): AtomicOverlayReceipt | undefined {
  const receipt = overlay.metadata?.atomicOverlayReceipt;
  return isAtomicOverlayReceipt(receipt) ? receipt : undefined;
}

function atomicZoomFormFromOverlay(overlay: MomentOverlayRef): AtomicZoomForm | undefined {
  const form = overlay.metadata?.atomicZoomForm;
  return isRecord(form) && form.version === 'atomic-zoom-form-v1' ? form as unknown as AtomicZoomForm : undefined;
}

function atomicTransitionFormFromOverlay(overlay: MomentOverlayRef): AtomicTransitionForm | undefined {
  const form = overlay.metadata?.atomicTransitionForm;
  return isRecord(form) && form.version === 'atomic-transition-form-v1' ? form as unknown as AtomicTransitionForm : undefined;
}

function isAtomicOverlayReceipt(value: unknown): value is AtomicOverlayReceipt {
  return isRecord(value)
    && value.version === 'overlay-atoms-v1'
    && isRecord(value.form)
    && value.form.version === 'overlay-atomic-form-v1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAtomValue(value: unknown): value is number | string | boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof value === 'boolean';
}

function atomStrength(value: number | string | boolean): number {
  if (typeof value === 'number') return clamp01(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 1;
}

function readFrame(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readSourceStartFrame(clip: MomentOverlayRef): number {
  if (typeof clip.sourceStartFrame === 'number' && Number.isFinite(clip.sourceStartFrame)) return clip.sourceStartFrame;
  if (typeof clip.videoStartTime === 'number' && Number.isFinite(clip.videoStartTime)) return clip.videoStartTime;
  return 0;
}

function rankedStandaloneCandidates(systemCandidates: MomentSystemCandidate[]): Array<MomentSystemCandidate & { rankInCategory: number }> {
  const categoryCounts = new Map<string, number>();
  const ranked: Array<MomentSystemCandidate & { rankInCategory: number }> = [];
  for (const candidate of systemCandidates) {
    if (!STANDALONE_CANDIDATE_CATEGORIES.has(candidate.category as OverlayCategory)) continue;
    const rankInCategory = (categoryCounts.get(candidate.category) ?? 0) + 1;
    categoryCounts.set(candidate.category, rankInCategory);
    ranked.push({ ...candidate, rankInCategory });
  }
  return ranked;
}

function overlayCategoryForType(type: string | undefined): string | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  return OVERLAY_TYPE_TO_CATEGORY[normalized] ?? normalized;
}

function categoryMatchScore(rankInCategory: number): number {
  return rankInCategory <= 1 ? 1 : 0.75;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
