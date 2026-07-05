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
  faceEmotion?: string | null;
  faceCount?: number | null;
  objectCount?: number | null;
  mainSubjectHeight?: number | null;
}

/** Subset of `SegmentRecord.vocal` (wav2vec) the adapter reads. */
export interface EditronSegmentVocal {
  emotionalValence?: number | null;
  emotionIntensity?: number | null;
}

/** Subset of `SegmentRecord.semanticVisual` (Gemini/VU) - the on-screen-text channel. */
export interface EditronSemanticVisual {
  ocrText?: string[] | null;
  primaryVisualMode?: string | null;
}

/** Mirror of `SegmentRecord` (the fields we consume). Times in ms. */
export interface EditronSegment {
  startMs: number;
  endMs: number;
  transcript?: { text?: string | null; wordCount?: number | null } | null;
  visual?: EditronSegmentVisual | null;
  vocal?: EditronSegmentVocal | null;
  semanticVisual?: EditronSemanticVisual | null;
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
    // primaryVisualMode is a coarse NL hint; description is treated low-trust by the composer.
    description: segment.semanticVisual?.primaryVisualMode ?? undefined,
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
