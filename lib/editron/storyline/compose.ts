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

import type { AspectRatio, ProductionBrief } from '../production-brief/production-brief';
import { type OrderingPlan, validateOrderingPlan } from './ordering-plan';
import type { Scene } from './scene';
import {
  type ClipRole,
  type FitPolicy,
  MIN_CLIP_DURATION_SEC,
  renderTargetForAspect,
  type SeamLink,
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
  /** A narrative ordering proposed by the LLM pass. Applied ONLY if it validates against
   *  the hard contracts (known refs, source-order coherence, hook-first, budget); an invalid
   *  plan silently falls back to the deterministic continuum order. Absent = deterministic. */
  orderingPlan?: OrderingPlan;
}

// --- ranking spine (real signal): how much the segment's own fused importance vs the
//     user's specific keyword ask drives the score, when importance is PRESENT. The blend
//     is importance-dominant by design; the ratio is calibratable, not the score itself. ---
export const IMPORTANCE_WEIGHT = 0.8; // fused finalWeight (intrinsic importance)
export const INTENT_WEIGHT = 0.2; // relevance to the user's specific ask (keyword now; embeddings in the embedding scorer)

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
  // Unicode-aware split (letters \p{L}, numbers \p{N}, AND combining marks \p{M} with the u
  // flag) - keeps Devanagari / CJK / Cyrillic word characters instead of the old [a-z0-9]
  // that erased them. \p{M} is essential: Devanagari vowel signs (matras like ा ै) are
  // combining MARKS, not letters, so without it a word like कैमरा shatters at every matra.
  // Both the intent and the transcript pass through THIS function, so overlap stays consistent
  // in any language. Known limits: space-less scripts (CJK) still want a segmenter; STOPWORDS
  // is English (harmless elsewhere). Full language-aware matching is the embedding step.
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** NFC-normalized, lowercased text for substring matching - so composed vs decomposed forms
 *  of the same character (common in Devanagari) compare equal. */
function normalizeForMatch(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/**
 * How condensed the output is: kept output seconds / available source seconds, clamped
 * 0..1. 1 = faithful (nothing cut); ->0 = heavily condensed. This CONTINUUM replaces the
 * old reel/auto-edit binary as the ordering driver - it smoothly blends chronological
 * ordering (faithful) into importance-first ordering (condensed), every value in between
 * behaving proportionally. Nobody picks it; it falls out of target vs source.
 */
function computeCondensationRatio(outputSec: number, sourceSec: number): number {
  if (!(sourceSec > 0) || !(outputSec > 0)) return 1;
  return clamp01(outputSec / sourceSec);
}

/** Mild tightness preference used ONLY by the heuristic fallback scorer (un-analyzed
 *  scenes). Format-free: tighter shots read as more deliberate. INVENTED-PLACEHOLDER. */
function shotTypeFit(shotType: Scene['shotType']): number {
  if (!shotType || shotType === 'unknown') return 0.5;
  return shotType === 'long' || shotType === 'wide' ? 0.7 : 1;
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
  const haystack = normalizeForMatch(
    [scene.transcription, scene.visualMode ?? '', ...scene.detectedText].join(' '),
  );
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
  score += H_SHOT * shotTypeFit(scene.shotType);
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
    // reject non-finite or negative windows before they poison durations/ordering downstream
    if (!Number.isFinite(scene.startTime) || !Number.isFinite(scene.endTime) || scene.startTime < 0) return;
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
 * The scenes that survive select + fit for this brief, in pre-order form - i.e. the clips that
 * will actually be in the cut, which is exactly the set the LLM ordering pass should reason
 * over. Deterministic; composeStoryline re-runs the same select+fit, so a plan built from these
 * scenes' ids applies cleanly. (A fit-trim's shortened `out` lives on the SceneScore, not the
 * Scene, so the digest sees the untrimmed window - fine for ordering; the final cut is exact.)
 */
export function selectAndFitScenes(scenes: Scene[], brief: ProductionBrief, opts?: ComposeOptions): Scene[] {
  const rawTarget = brief.output.targetDurationSec;
  const target = typeof rawTarget === 'number' && rawTarget > 0 ? rawTarget : null;
  return fitToDuration(selectScenes(scenes, brief, opts), target, opts).map((s) => s.scene);
}

/**
 * A coherence block: all picked scenes from ONE source, kept in that source's own
 * chronological order. The hard contract Edit Mind never had - a continuous recording is
 * never reordered against itself, so reshuffling can never chop a sentence or a thought.
 * Ordering happens BETWEEN blocks, never inside one.
 */
interface OrderBlock {
  scenes: SceneScore[];
  createdAt: number; // asset creation time (shared by a source's scenes)
  startTime: number; // earliest source start in the block
  peakImportance: number; // strongest fused importance in the block (0 when no signal)
  srcIndex: number; // smallest input index in the block (stable tiebreak)
}

/** Group picked scenes into per-source blocks, each internally chronological. Pure. */
function buildOrderBlocks(picked: SceneScore[]): OrderBlock[] {
  const bySource = new Map<string, SceneScore[]>();
  picked.forEach((s) => {
    const arr = bySource.get(s.scene.source);
    if (arr) arr.push(s);
    else bySource.set(s.scene.source, [s]);
  });
  const blocks: OrderBlock[] = [];
  for (const group of bySource.values()) {
    group.sort(
      (a, b) =>
        a.scene.startTime - b.scene.startTime ||
        a.scene.endTime - b.scene.endTime ||
        a.srcIndex - b.srcIndex,
    );
    blocks.push({
      scenes: group,
      createdAt: group[0].scene.createdAt ?? 0,
      startTime: group[0].scene.startTime,
      peakImportance: group.reduce((m, s) => Math.max(m, s.scene.importance ?? 0), 0),
      srcIndex: group.reduce((m, s) => Math.min(m, s.srcIndex), Infinity),
    });
  }
  return blocks;
}

/**
 * 3. ORDER - sequence the picked scenes. Deterministic. Intra-source order is ALWAYS
 * preserved (blocks); only the order BETWEEN blocks is decided, by the condensation
 * continuum:
 *   ratio = 1 (faithful)   -> chronological (createdAt, then source start)
 *   ratio -> 0 (condensed) -> importance-first (strongest moment leads = a real hook)
 *   in between             -> a linear blend of the two RANK orders (stable, scale-free)
 * One code path for every degree of condensation - the reel/auto-edit branch is gone.
 * (An LLM narrative plan will later override this default via the same signature.)
 */
export function orderScenes(picked: SceneScore[], condensationRatio: number): SceneScore[] {
  const ratio = clamp01(condensationRatio);
  const blocks = buildOrderBlocks(picked);
  if (blocks.length <= 1) return blocks.flatMap((b) => b.scenes);

  const chronoOrder = blocks
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || a.startTime - b.startTime || a.srcIndex - b.srcIndex);
  const chronoRank = new Map<OrderBlock, number>();
  chronoOrder.forEach((b, i) => chronoRank.set(b, i));

  const importanceOrder = blocks
    .slice()
    .sort((a, b) => b.peakImportance - a.peakImportance || chronoRank.get(a)! - chronoRank.get(b)!);
  const importanceRank = new Map<OrderBlock, number>();
  importanceOrder.forEach((b, i) => importanceRank.set(b, i));

  const blended = blocks.slice().sort((a, b) => {
    const ka = ratio * chronoRank.get(a)! + (1 - ratio) * importanceRank.get(a)!;
    const kb = ratio * chronoRank.get(b)! + (1 - ratio) * importanceRank.get(b)!;
    return ka - kb || chronoRank.get(a)! - chronoRank.get(b)! || a.srcIndex - b.srcIndex;
  });
  return blended.flatMap((b) => b.scenes);
}

// --- hook detection: an opener earns the 'hook' role only if it is a genuinely strong
//     moment (real importance or vocal arousal). When there is NO importance signal, a
//     CONDENSED cut has curated its opener (so the first clip is the hook); a faithful full
//     edit just starts, no hook role. Thresholds INVENTED-PLACEHOLDER. ---
const HOOK_IMPORTANCE = 0.6;
const HOOK_AROUSAL = 0.6;

function isStrongOpener(scene: Scene, condensed: boolean): boolean {
  const imp = scene.importance;
  if (typeof imp === 'number') {
    return (
      imp >= HOOK_IMPORTANCE ||
      (typeof scene.vocalArousal === 'number' && scene.vocalArousal >= HOOK_AROUSAL)
    );
  }
  return condensed;
}

/** Assign a clip role from signals (no format): a strong opener is the hook, else a/b-roll
 *  by speech. */
function assignRole(index: number, scene: Scene, condensed: boolean): ClipRole {
  if (index === 0 && isStrongOpener(scene, condensed)) return 'hook';
  return scene.hasSpeech ? 'a-roll' : 'b-roll';
}

/**
 * Reorder picked scenes by an LLM OrderingPlan: place the scenes it names in its order, then
 * append any picked scenes it left out in deterministic order (ordering is not cutting - we
 * never drop footage the fit step kept). Refs not in the picked set are ignored.
 */
function applyOrderingPlan(picked: SceneScore[], plan: OrderingPlan, ratio: number): SceneScore[] {
  const byId = new Map(picked.map((s) => [s.scene.id, s] as const));
  const placed: SceneScore[] = [];
  const used = new Set<string>();
  for (const item of plan.order) {
    const s = byId.get(item.sourceRef);
    if (s && !used.has(item.sourceRef)) {
      placed.push(s);
      used.add(item.sourceRef);
    }
  }
  const remaining = picked.filter((s) => !used.has(s.scene.id));
  if (remaining.length > 0) placed.push(...orderScenes(remaining, ratio));
  return placed;
}

/**
 * Order the picked scenes: honor a VALID LLM ordering plan (narrative), else the deterministic
 * continuum order. A malformed/contract-breaking plan never crashes the composer - it falls
 * back. This is the "code disposes" gate around the LLM's "propose".
 */
function resolveOrder(
  picked: SceneScore[],
  ratio: number,
  brief: ProductionBrief,
  opts?: ComposeOptions,
): { ordered: SceneScore[]; linkByRef: Map<string, SeamLink> } {
  const linkByRef = new Map<string, SeamLink>();
  const plan = opts?.orderingPlan;
  if (plan) {
    const validation = validateOrderingPlan(
      plan,
      picked.map((s) => s.scene),
      { targetDurationSec: brief.output.targetDurationSec, minClipDurationSec: opts?.minClipDurationSec },
    );
    if (validation.valid) {
      for (const item of plan.order) if (item.linkFromPrev) linkByRef.set(item.sourceRef, item.linkFromPrev);
      return { ordered: applyOrderingPlan(picked, plan, ratio), linkByRef };
    }
  }
  return { ordered: orderScenes(picked, ratio), linkByRef };
}

/**
 * Compose an ordered Storyline from scenes + a resolved ProductionBrief.
 * select -> fit -> order -> build. Pure, deterministic, never throws. Empty input yields
 * an empty (but valid) storyline rather than an error. The reel/auto-edit binary is gone:
 * ordering is driven by the condensation ratio (kept output / available source), and an LLM
 * narrative plan (opts.orderingPlan) overrides the default order when it passes the contract.
 */
export function composeStoryline(
  scenes: Scene[],
  brief: ProductionBrief,
  opts?: ComposeOptions,
): Storyline {
  const rawTarget = brief.output.targetDurationSec;
  const target = typeof rawTarget === 'number' && rawTarget > 0 ? rawTarget : null;
  const aspectRatio: AspectRatio = brief.output.aspectRatio ?? '16:9';
  const renderTarget = renderTargetForAspect(aspectRatio, opts?.fps);

  const scored = selectScenes(scenes, brief, opts);
  const sourceSec = scored.reduce((acc, s) => acc + (s.scene.endTime - s.scene.startTime), 0);
  const picked = fitToDuration(scored, target, opts);
  const outputSec = picked.reduce((acc, s) => acc + effDuration(s), 0);
  const ratio = computeCondensationRatio(outputSec, sourceSec);
  const condensed = ratio < 1 - 1e-6;
  const { ordered, linkByRef } = resolveOrder(picked, ratio, brief, opts);

  const defaultFit: FitPolicy = 'contain';
  const clips: StorylineClip[] = ordered.map((s, index) => {
    const inSec = s.scene.startTime;
    const outSec = effOut(s);
    const clip: StorylineClip = {
      order: index,
      sourceRef: s.scene.id,
      source: s.scene.source,
      in: inSec,
      out: outSec,
      durationSec: outSec - inSec,
      role: assignRole(index, s.scene, condensed),
      fit: defaultFit,
    };
    // the rhetorical relation into this clip (from a valid LLM plan); absent on the first clip.
    const link = index > 0 ? linkByRef.get(s.scene.id) : undefined;
    if (link) clip.linkFromPrev = link;
    return clip;
  });

  const totalDurationSec = clips.reduce((acc, c) => acc + c.durationSec, 0);
  return { clips, renderTarget, totalDurationSec, condensationRatio: ratio, targetDurationSec: target };
}
