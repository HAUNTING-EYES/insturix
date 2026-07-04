/**
 * compose - the storyline composer. Given normalized Scenes across many assets + a
 * resolved ProductionBrief, produce an ordered Storyline. Pure, deterministic, never
 * throws. This is the value-add Edit Mind has no analog for: it does not just SELECT
 * matching scenes, it SEQUENCES them into a narrative and FITS them to a duration.
 *
 * Pipeline: select (hard filter + soft score) -> fit (duration budget) -> order
 * (narrative per format) -> build. The soft scorer is pluggable (`SceneScorer`); the
 * default is rules-first. An embedding/vector scorer plugs in later (P3) behind the same
 * interface, with ZERO change here.
 *
 * Determinism (R18N): every sort has an explicit tiebreak on source index; no Date/random.
 * Weights + thresholds are INVENTED-PLACEHOLDER (calibrate from real edits).
 */

import type { AspectRatio, OutputFormat, ProductionBrief } from '../production-brief/production-brief';
import type { Scene } from './scene';
import {
  type ClipRole,
  type FitPolicy,
  MIN_CLIP_DURATION_SEC,
  renderTargetForAspect,
  type Storyline,
  type StorylineClip,
} from './storyline';

export interface SceneScore {
  scene: Scene;
  score: number; // 0..1
  /** Original position in the input - stable tiebreak for deterministic ordering. */
  srcIndex: number;
  /** Trimmed end (seconds) when a scene was cut to fit the budget; else undefined. */
  outOverride?: number;
}

export type SceneScorer = (scene: Scene, brief: ProductionBrief) => number;

export interface ComposeOptions {
  scorer?: SceneScorer;
  minClipDurationSec?: number;
  fps?: number;
}

// --- scorer weights: INVENTED-PLACEHOLDER (calibrate) ---
const W_BASE = 0.4;
const W_SPEECH = 0.2;
const W_SHOT = 0.2;
const W_INTENT = 0.2;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'with', 'in', 'on', 'my', 'me',
  'it', 'this', 'that', 'make', 'video', 'clip', 'reel',
]);

function tokenize(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** How well a shot type fits a format (0..1). Heuristic, INVENTED-PLACEHOLDER. */
function shotTypeFit(shotType: Scene['shotType'], format: OutputFormat): number {
  if (!shotType || shotType === 'unknown') return 0.5;
  switch (format) {
    case 'talking-head':
    case 'explainer':
      return shotType === 'close-up' || shotType === 'medium' ? 1 : 0.4;
    case 'reel':
    case 'ugc':
    case 'ad':
      return shotType === 'long' || shotType === 'wide' ? 0.6 : 1;
    default:
      return 0.6;
  }
}

/**
 * Rules-first, deterministic scene scorer. Base + speech + shot-fit + intent-keyword
 * overlap, clamped to 0..1. Weights are placeholders to calibrate; the point is a
 * transparent, testable ranking, not a black box.
 */
export function defaultSceneScorer(scene: Scene, brief: ProductionBrief): number {
  const format = brief.output.format;
  let score = W_BASE;
  if (scene.hasSpeech) score += W_SPEECH;
  score += W_SHOT * shotTypeFit(scene.shotType, format);

  const intentTokens = tokenize(brief.output.intent);
  if (intentTokens.length > 0) {
    const haystack = [
      scene.transcription,
      scene.description ?? '',
      ...scene.objects,
      ...scene.faces,
      ...scene.detectedText,
    ]
      .join(' ')
      .toLowerCase();
    const hits = intentTokens.filter((t) => haystack.includes(t)).length;
    score += W_INTENT * (hits / intentTokens.length);
  }
  return Math.max(0, Math.min(1, score));
}

/** Effective end/duration of a scored scene, honoring a fit-trim. */
function effOut(s: SceneScore): number {
  return s.outOverride ?? s.scene.endTime;
}
function effDuration(s: SceneScore): number {
  return effOut(s) - s.scene.startTime;
}

/**
 * 1. SELECT - hard filter (valid window + min duration) then soft score. Returned in
 * SOURCE order (not sorted); fit/order sort as they need. Invalid/micro scenes dropped.
 */
export function selectScenes(
  scenes: Scene[],
  brief: ProductionBrief,
  opts?: ComposeOptions,
): SceneScore[] {
  const minClip = opts?.minClipDurationSec ?? MIN_CLIP_DURATION_SEC;
  const scorer = opts?.scorer ?? defaultSceneScorer;
  const out: SceneScore[] = [];
  scenes.forEach((scene, srcIndex) => {
    if (!(scene.endTime > scene.startTime)) return; // invalid window
    if (scene.endTime - scene.startTime < minClip) return; // micro-clip
    out.push({ scene, score: scorer(scene, brief), srcIndex });
  });
  return out;
}

/**
 * 2. FIT - choose the best-scoring subset whose total duration fits the budget. A null
 * target means "follow the content" (keep all). Greedy by score, packing smaller scenes
 * after larger ones. If no whole scene fits, the single best is trimmed to the budget so
 * the output is never empty when input is not.
 */
export function fitToDuration(
  scored: SceneScore[],
  targetSec: number | null,
  opts?: ComposeOptions,
): SceneScore[] {
  if (targetSec === null) return scored.slice();
  const minClip = opts?.minClipDurationSec ?? MIN_CLIP_DURATION_SEC;
  const byScore = scored
    .slice()
    .sort((a, b) => b.score - a.score || a.srcIndex - b.srcIndex);

  const picked: SceneScore[] = [];
  let used = 0;
  for (const s of byScore) {
    const d = effDuration(s);
    if (used + d <= targetSec + 1e-9) {
      picked.push(s);
      used += d;
    }
  }
  if (picked.length === 0 && byScore.length > 0) {
    const best = byScore[0];
    const trimmedOut = best.scene.startTime + Math.max(minClip, targetSec);
    picked.push({ ...best, outOverride: Math.min(trimmedOut, best.scene.endTime) });
  }
  return picked;
}

type OrderStrategy = 'chronological' | 'score-desc';

function orderStrategyFor(format: OutputFormat): OrderStrategy {
  switch (format) {
    case 'reel':
    case 'ad':
    case 'ugc':
      return 'score-desc'; // highlight / hook-first
    default:
      return 'chronological'; // auto-edit / explainer / talking-head: faithful timeline
  }
}

/**
 * 3. ORDER - sequence the picked scenes into a narrative for the format. Deterministic.
 * Chronological = by asset createdAt, then source, then startTime (the fix for Edit
 * Mind's recency-sort / store-order bug). score-desc = best moment first.
 */
export function orderScenes(picked: SceneScore[], format: OutputFormat): SceneScore[] {
  const arr = picked.slice();
  if (orderStrategyFor(format) === 'score-desc') {
    arr.sort((a, b) => b.score - a.score || a.srcIndex - b.srcIndex);
    return arr;
  }
  arr.sort((a, b) => {
    const ca = a.scene.createdAt ?? 0;
    const cb = b.scene.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    if (a.scene.source !== b.scene.source) return a.scene.source < b.scene.source ? -1 : 1;
    if (a.scene.startTime !== b.scene.startTime) return a.scene.startTime - b.scene.startTime;
    return a.srcIndex - b.srcIndex;
  });
  return arr;
}

/** Assign a clip role: hook-first for highlight formats, a/b-roll by speech otherwise. */
function assignRole(index: number, scene: Scene, format: OutputFormat): ClipRole {
  const highlight = format === 'reel' || format === 'ad' || format === 'ugc';
  if (highlight && index === 0) return 'hook';
  return scene.hasSpeech ? 'a-roll' : 'b-roll';
}

/**
 * Compose an ordered Storyline from scenes + a resolved ProductionBrief.
 * select -> fit -> order -> build. Pure, deterministic, never throws. Empty input yields
 * an empty (but valid) storyline rather than an error.
 */
export function composeStoryline(
  scenes: Scene[],
  brief: ProductionBrief,
  opts?: ComposeOptions,
): Storyline {
  const format = brief.output.format;
  const rawTarget = brief.output.targetDurationSec;
  const target = typeof rawTarget === 'number' && rawTarget > 0 ? rawTarget : null;
  const aspectRatio: AspectRatio = brief.output.aspectRatio ?? '16:9';
  const renderTarget = renderTargetForAspect(aspectRatio, opts?.fps);

  const scored = selectScenes(scenes, brief, opts);
  const picked = fitToDuration(scored, target, opts);
  const ordered = orderScenes(picked, format);

  const defaultFit: FitPolicy = 'contain';
  const clips: StorylineClip[] = ordered.map((s, index) => {
    const inSec = s.scene.startTime;
    const outSec = effOut(s);
    return {
      order: index,
      sourceRef: s.scene.id,
      source: s.scene.source,
      in: inSec,
      out: outSec,
      durationSec: outSec - inSec,
      role: assignRole(index, s.scene, format),
      fit: defaultFit,
    };
  });

  const totalDurationSec = clips.reduce((acc, c) => acc + c.durationSec, 0);
  return { clips, renderTarget, totalDurationSec, format, targetDurationSec: target };
}
