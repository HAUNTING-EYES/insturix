/**
 * compose - the storyline composer. Given normalized Scenes across many assets + a
 * resolved ProductionBrief, produce an ordered Storyline. Pure, deterministic, never
 * throws. This is the value-add Edit Mind has no analog for: it does not just SELECT
 * matching scenes, it SEQUENCES them into a narrative and FITS them to a duration.
 *
 * Pipeline: select (hard filter + soft score) -> fit (duration budget) -> order
 * (narrative per format) -> build. The soft scorer is pluggable (`SceneScorer`).
 *
 * Ranking spine: the default scorer ranks on the segment's OWN fused importance
 * (`Scene.importance` = moment-weight `finalWeight`: transcript intent + V-JEPA visual
 * significance + wav2vec vocal emotion + learned correction) when it is present - the
 * same number that drives every downstream technique. It blends in a small keyword-overlap
 * relevance term for the user's specific ask (an embedding scorer replaces that overlap
 * later, behind this same interface, with ZERO change here). Only when NO analysis is
 * present (an un-analyzed asset, e.g. a still image before the image lane) does it fall
 * back to a transparent heuristic proxy (base + speech + shot-fit + intent). The heuristic
 * blend ratios are the only INVENTED-PLACEHOLDER numbers left; the spine is real signal.
 *
 * Determinism (R18N): every sort uses the shared byScoreDesc / chronological comparator
 * with an explicit source-index tiebreak; no Date/random.
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

// --- ranking spine (real signal): how much the segment's own fused importance vs the
//     user's specific keyword ask drives the score, when importance is PRESENT. The blend
//     is importance-dominant by design; the ratio is calibratable, not the score itself. ---
const IMPORTANCE_WEIGHT = 0.8; // fused finalWeight (intrinsic importance)
const INTENT_WEIGHT = 0.2; // relevance to the user's specific ask (keyword overlap now)

// --- heuristic fallback weights: INVENTED-PLACEHOLDER. Used ONLY when a scene carries no
//     analysis (no `importance`) - a transparent proxy, never the path for real footage. ---
const H_BASE = 0.4;
const H_SPEECH = 0.2;
const H_SHOT = 0.2;
const H_INTENT = 0.2;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

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

/**
 * A highlight cut (condensed, hook-first) vs a faithful full edit. Single source of truth
 * for the format's traits - used by ordering, role assignment, and shot scoring so they
 * can never disagree.
 */
function isHighlightFormat(format: OutputFormat): boolean {
  return format === 'reel';
}

/** How well a shot type fits a format (0..1). Heuristic, INVENTED-PLACEHOLDER. */
function shotTypeFit(shotType: Scene['shotType'], format: OutputFormat): number {
  if (!shotType || shotType === 'unknown') return 0.5;
  if (isHighlightFormat(format)) {
    // a highlight wants punchy, tighter shots; wide/long read as filler
    return shotType === 'long' || shotType === 'wide' ? 0.6 : 1;
  }
  return 0.6; // faithful edit: neutral, keep the timeline's own shots
}

/**
 * Keyword-overlap relevance of a scene to the brief's intent (0..1), or `null` when the
 * brief carries no intent tokens (then intrinsic importance stands alone). The haystack is
 * the scene's real text content: spoken words, on-screen text (OCR), and the coarse visual
 * mode. Object/face LABELS are not carried by the analysis (the adapter leaves them empty),
 * so they are not part of the haystack. An embedding scorer replaces this overlap later.
 */
function intentRelevance(scene: Scene, brief: ProductionBrief): number | null {
  const intentTokens = tokenize(brief.output.intent);
  if (intentTokens.length === 0) return null;
  const haystack = [scene.transcription, scene.visualMode ?? '', ...scene.detectedText]
    .join(' ')
    .toLowerCase();
  const hits = intentTokens.filter((t) => haystack.includes(t)).length;
  return hits / intentTokens.length;
}

/**
 * Fallback proxy scorer for scenes with NO analysis (`importance` absent): base + speech +
 * shot-fit + intent overlap, clamped. Transparent and testable, but a proxy - real footage
 * ranks on `importance`, not this. Weights are INVENTED-PLACEHOLDER.
 */
function heuristicSceneScorer(scene: Scene, brief: ProductionBrief): number {
  let score = H_BASE;
  if (scene.hasSpeech) score += H_SPEECH;
  score += H_SHOT * shotTypeFit(scene.shotType, brief.output.format);
  const rel = intentRelevance(scene, brief);
  if (rel !== null) score += H_INTENT * rel;
  return clamp01(score);
}

/**
 * Default scene scorer. When the scene carries the pipeline's fused `importance`
 * (moment-weight finalWeight), THAT is the ranking spine - it already fuses transcript
 * intent, visual significance, and vocal emotion, so we do NOT re-add speech/shot bonuses
 * (that would double-count). We blend in a small keyword relevance term for the user's
 * specific ask. When importance is absent (un-analyzed asset), fall back to the heuristic
 * proxy. Deterministic; clamped to 0..1.
 */
export function defaultSceneScorer(scene: Scene, brief: ProductionBrief): number {
  const importance = scene.importance;
  if (typeof importance === 'number' && Number.isFinite(importance)) {
    const imp = clamp01(importance);
    const rel = intentRelevance(scene, brief);
    if (rel === null) return imp;
    return clamp01(IMPORTANCE_WEIGHT * imp + INTENT_WEIGHT * rel);
  }
  return heuristicSceneScorer(scene, brief);
}

/** Effective end/duration of a scored scene, honoring a fit-trim. */
function effOut(s: SceneScore): number {
  return s.outOverride ?? s.scene.endTime;
}
function effDuration(s: SceneScore): number {
  return effOut(s) - s.scene.startTime;
}

/** Highest score first, ties broken by original input index (stable, deterministic). */
function byScoreDesc(a: SceneScore, b: SceneScore): number {
  return b.score - a.score || a.srcIndex - b.srcIndex;
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
 * 2. FIT - choose the best-scoring subset whose total duration fits the budget. A null or
 * non-finite target means "follow the content" (keep all). Greedy by score, packing
 * smaller scenes after larger ones. If no whole scene fits AND the budget can still hold a
 * valid (>= minClip) clip, the single best is trimmed to the budget; if the budget is
 * smaller than minClip there is no viable clip, so the result is empty.
 */
export function fitToDuration(
  scored: SceneScore[],
  targetSec: number | null,
  opts?: ComposeOptions,
): SceneScore[] {
  if (targetSec === null || !Number.isFinite(targetSec)) return scored.slice();
  const minClip = opts?.minClipDurationSec ?? MIN_CLIP_DURATION_SEC;
  const byScore = scored.slice().sort(byScoreDesc);

  const picked: SceneScore[] = [];
  let used = 0;
  for (const s of byScore) {
    const d = effDuration(s);
    if (used + d <= targetSec + 1e-9) {
      picked.push(s);
      used += d;
    }
  }
  if (picked.length === 0 && byScore.length > 0 && targetSec >= minClip) {
    const best = byScore[0];
    const trimmedOut = best.scene.startTime + targetSec; // targetSec >= minClip => a valid clip
    picked.push({ ...best, outOverride: Math.min(trimmedOut, best.scene.endTime) });
  }
  return picked;
}

/**
 * 3. ORDER - sequence the picked scenes into a narrative for the format. Deterministic.
 * Highlight = best moment first (score-desc). Faithful = by asset createdAt, then source,
 * then startTime, then endTime (the fix for Edit Mind's recency-sort / store-order bug).
 */
export function orderScenes(picked: SceneScore[], format: OutputFormat): SceneScore[] {
  const arr = picked.slice();
  if (isHighlightFormat(format)) {
    arr.sort(byScoreDesc);
    return arr;
  }
  arr.sort((a, b) => {
    const ca = a.scene.createdAt ?? 0;
    const cb = b.scene.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    if (a.scene.source !== b.scene.source) return a.scene.source < b.scene.source ? -1 : 1;
    if (a.scene.startTime !== b.scene.startTime) return a.scene.startTime - b.scene.startTime;
    if (a.scene.endTime !== b.scene.endTime) return a.scene.endTime - b.scene.endTime;
    return a.srcIndex - b.srcIndex;
  });
  return arr;
}

/** Assign a clip role: hook-first for highlight formats, a/b-roll by speech otherwise. */
function assignRole(index: number, scene: Scene, format: OutputFormat): ClipRole {
  if (isHighlightFormat(format) && index === 0) return 'hook';
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
