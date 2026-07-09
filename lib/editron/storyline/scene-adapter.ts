/**
 * scene-adapter - translate Editron's real per-segment analysis into our neutral Scene.
 *
 * This is the INPUT seam (Seam 1) of the composition lane: Editron analyzes an uploaded
 * asset into `SegmentRecord`s (transcript + V-JEPA `visual` + `vocal` + `semanticVisual`
 * + `weight`); this module maps ONE such segment (+ its asset context + the asset's
 * word-level transcription) into ONE `Scene` the composer reasons over.
 *
 * ISOLATION (deliberate): the input types below are a LOCAL MIRROR of Editron's shapes
 * (lib/editron/types/segment-analysis.ts `SegmentRecord`, media/types `TranscriptionWord`,
 * asset-resolver `MediaAsset`), so this file imports NOTHING from Codex's WIP tree and
 * cannot break on its churn. The shapes were CODE-VERIFIED (Fable-Seam-Questions Q2, three
 * read-only agents). At wiring time, swap `EditronSegment`/`EditronWord`/`EditronAssetContext`
 * for the real imports - the mapping body does not change.
 *
 * Honesty (R2N): `SegmentRecord.visual` carries `objectCount`/`faceCount` (numbers), NOT
 * object/face LABELS - so `objects`/`faces` are left EMPTY here, never fabricated from a
 * count. `detectedText` comes from the `semanticVisual.ocrText` channel (the on-screen-text
 * channel a naive visual+vocal-only mapper would silently drop). Units: Editron is ms, Scene
 * is seconds. Nulls (`visual`/`vocal`/`semanticVisual`) are first-class (V-JEPA coverage is
 * not guaranteed). Thresholds flagged INVENTED-PLACEHOLDER.
 */

import {
  makeScene,
  type Scene,
  type SceneEmotion,
  type ShotType,
  type TranscriptionWord,
} from './scene';

const MS_PER_SEC = 1000;

// --- LOCAL MIRROR of Editron shapes (verified Q2). Swap for real imports at wiring. ---

/** Subset of `SegmentRecord.visual` (V-JEPA) the adapter reads. `mainSubjectHeight` is
 *  assumed NORMALIZED 0..1 (verify at wiring; if px, divide by frame height). */
export interface EditronSegmentVisual {
  significance?: number | null;
  motionIntensity?: number | null;
  /** V-JEPA VjepaActionType (talking | walking | gesturing | demonstrating | ...). */
  actionType?: string | null;
  faceEmotion?: string | null;
  faceCount?: number | null;
  objectCount?: number | null;
  mainSubjectHeight?: number | null;
}

/** Subset of `SegmentRecord.vocal` (wav2vec) the adapter reads. NOTE: `emotionalValence`
 *  is a LABEL (wav2vec `EmotionalValence`), not a scalar - the prior mirror had it as a
 *  number, which never matched the real shape. */
export interface EditronSegmentVocal {
  emotionalValence?: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
  emotionIntensity?: number | null;
  energy?: number | null;
}

/** Subset of `SegmentRecord.semanticVisual` (Gemini/VU) - visual-mode + salience channel. */
export interface EditronSemanticVisual {
  ocrText?: string[] | null;
  primaryVisualMode?: string | null;
  salience?: number | null;
  visuallyExplains?: boolean | null;
}

/** Subset of `SegmentRecord.weight` (moment-weight map) - the fused importance channel
 *  the composer ranks on. `finalWeight` fuses transcript intent + V-JEPA + wav2vec +
 *  learned correction; it is the signal that already drives every downstream technique. */
export interface EditronSegmentWeight {
  finalWeight?: number | null;
  confidence?: 'high' | 'medium' | 'low' | null;
}

/** Mirror of `SegmentRecord` (the fields we consume). Times in ms. */
export interface EditronSegment {
  startMs: number;
  endMs: number;
  transcript?: { text?: string | null; wordCount?: number | null } | null;
  visual?: EditronSegmentVisual | null;
  vocal?: EditronSegmentVocal | null;
  semanticVisual?: EditronSemanticVisual | null;
  weight?: EditronSegmentWeight | null;
}

/** Mirror of `TranscriptionWord` (rawFootageAnalysis.transcription.words[]). Times in ms. */
export interface EditronWord {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
}

/** Asset-level context (MediaAsset + globalContext) denormalized onto every Scene. */
export interface EditronAssetContext {
  /** Stable asset id; also the Scene `source` fallback. */
  assetId: string;
  /** Resolvable media ref (cachedUrl / gcsPath); preferred `source` when present. */
  source?: string | null;
  aspectRatio?: string | null;
  thumbnailUrl?: string | null;
  /** Epoch ms the asset was created/shot - chronological ordering key. */
  createdAt?: number | null;
  dominantColor?: { hex: string; name: string } | null;
}

// --- helpers ---

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** A finite value clamped to 0..1, or `undefined` when absent/invalid. Unlike clamp01 this
 *  NEVER fabricates a 0 for a missing signal - undefined means "no signal", which the
 *  composer reads as "fall back", not as "importance zero". */
function num01(n: number | null | undefined): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** shotType from main-subject size. Bigger subject => tighter shot. Cutoffs are
 *  INVENTED-PLACEHOLDER (calibrate on real footage). Null visual / no subject => unknown. */
function deriveShotType(v: EditronSegmentVisual | null | undefined): ShotType {
  const h = v?.mainSubjectHeight;
  if (typeof h !== 'number' || !(h > 0)) return 'unknown';
  if (h >= 0.6) return 'close-up';
  if (h >= 0.35) return 'medium';
  if (h >= 0.18) return 'long';
  return 'wide';
}

/** Words overlapping [startMs, endMs), remapped to seconds. Empty when no words given. */
function sliceWords(
  words: readonly EditronWord[] | undefined,
  startMs: number,
  endMs: number,
): TranscriptionWord[] {
  if (!words || words.length === 0) return [];
  const out: TranscriptionWord[] = [];
  for (const w of words) {
    if (typeof w.startMs !== 'number' || typeof w.endMs !== 'number') continue;
    if (w.endMs > startMs && w.startMs < endMs) {
      out.push({
        word: w.word,
        start: w.startMs / MS_PER_SEC,
        end: w.endMs / MS_PER_SEC,
        confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
      });
    }
  }
  return out;
}

/** Face-driven emotion (the only labelled emotion SegmentRecord carries). Vocal valence
 *  is a scalar, not a label, so it is not turned into a fake emotion name here. */
function emotionsFrom(v: EditronSegmentVisual | null | undefined): SceneEmotion[] {
  if (v?.faceEmotion) {
    return [{ emotion: v.faceEmotion, confidence: clamp01(v.significance ?? 0.5) }];
  }
  return [];
}

function cleanText(list: readonly string[] | null | undefined): string[] {
  if (!list) return [];
  return list.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);
}

/**
 * Map one Editron segment (+ asset context + the asset's words) to one Scene.
 * Pure; never throws. Callers should pre-filter invalid windows, but a non-positive
 * window still yields a Scene (the composer's validity contract drops it).
 */
export function sceneFromSegment(
  segment: EditronSegment,
  asset: EditronAssetContext,
  words?: readonly EditronWord[],
): Scene {
  const startTime = segment.startMs / MS_PER_SEC;
  const endTime = segment.endMs / MS_PER_SEC;
  const transcription = (segment.transcript?.text ?? '').trim();
  const source = asset.source && asset.source.length > 0 ? asset.source : asset.assetId;

  return makeScene({
    source,
    startTime,
    endTime,
    // objectCount/faceCount are counts, not labels -> honest empty (R2N), never faked.
    objects: [],
    faces: [],
    detectedText: cleanText(segment.semanticVisual?.ocrText),
    transcription,
    transcriptionWords: sliceWords(words, segment.startMs, segment.endMs),
    hasSpeech: (segment.transcript?.wordCount ?? 0) > 0 || transcription.length > 0,
    shotType: deriveShotType(segment.visual),
    emotions: emotionsFrom(segment.visual),
    dominantColor: asset.dominantColor ?? undefined,
    aspectRatio: asset.aspectRatio ?? undefined,
    thumbnailUrl: asset.thumbnailUrl ?? undefined,
    createdAt: typeof asset.createdAt === 'number' ? asset.createdAt : undefined,
    // --- analysis signals (the report card). No SegmentRecord NL caption exists, so
    //     `description` is honestly left unset; primaryVisualMode is a real enum -> visualMode.
    importance: num01(segment.weight?.finalWeight),
    importanceConfidence: segment.weight?.confidence ?? undefined,
    visualMode: segment.semanticVisual?.primaryVisualMode ?? undefined,
    salience: num01(segment.semanticVisual?.salience),
    visuallyExplains:
      typeof segment.semanticVisual?.visuallyExplains === 'boolean'
        ? segment.semanticVisual.visuallyExplains
        : undefined,
    actionType: segment.visual?.actionType ?? undefined,
    motionIntensity: num01(segment.visual?.motionIntensity),
    vocalEnergy: num01(segment.vocal?.energy),
    vocalArousal: num01(segment.vocal?.emotionIntensity),
    vocalValence: segment.vocal?.emotionalValence ?? undefined,
  });
}

/**
 * Map a whole asset's segments to Scenes. Drops non-positive windows (endMs <= startMs)
 * so the composer never sees a degenerate scene from a bad segment boundary.
 */
export function scenesFromSegments(
  segments: readonly EditronSegment[],
  asset: EditronAssetContext,
  words?: readonly EditronWord[],
): Scene[] {
  const out: Scene[] = [];
  for (const seg of segments) {
    if (!(seg.endMs > seg.startMs)) continue;
    out.push(sceneFromSegment(seg, asset, words));
  }
  return out;
}

/** One asset's analysis, ready for the adapter - the multi-media upload entry shape. */
export interface AssetAnalysisInput {
  segments: readonly EditronSegment[];
  asset: EditronAssetContext;
  words?: readonly EditronWord[];
}

/**
 * Map MANY assets' analyses into one combined Scene[] - the multi-media -> one-project input
 * the composer orders into a single Storyline. Scenes from different assets are composable
 * (each carries its own `source`), so this is a flat concat with per-asset window filtering,
 * deduped by scene id (defensive against the same asset's analysis appearing twice). Pure.
 */
export function scenesFromAssets(inputs: readonly AssetAnalysisInput[]): Scene[] {
  const out: Scene[] = [];
  const seen = new Set<string>();
  for (const { segments, asset, words } of inputs) {
    for (const scene of scenesFromSegments(segments, asset, words)) {
      if (seen.has(scene.id)) continue;
      seen.add(scene.id);
      out.push(scene);
    }
  }
  return out;
}
