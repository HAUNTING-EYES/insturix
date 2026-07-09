/**
 * Scene - the normalized unit of composition (our "AssetUnderstanding" atom).
 *
 * A Scene is a SEMANTIC SEGMENT of a source asset (a shot / moment), described by the
 * signals a storyline composer reasons over. It is deliberately engine-neutral: the
 * adapter that fills it from Editron's real analysis (5-track / content-type /
 * moment-bundle) is the DEFERRED integration point - this module never imports it.
 *
 * Reference: the field menu is the proven-useful set from the Edit Mind dig
 * (07-Roadmap/Editron-Storyline-Composer-Plan), reimplemented, not copied. Two deltas
 * from Edit Mind on purpose:
 *  - a Scene is a SEMANTIC segment, not a fixed-interval keyframe sample;
 *  - bounding boxes are NORMALIZED 0..1, times are SECONDS (Edit Mind mixes px + ms).
 *
 * Dual representation (also from the dig): flat string[] for cheap filter/scoring, plus
 * optional rich *Data[] for a renderer. The composer only needs the flat + scalar fields.
 */

import { createHash } from 'node:crypto';

export type ShotType = 'close-up' | 'medium' | 'long' | 'wide' | 'unknown';

/** Bounding box in normalized 0..1 coordinates (fraction of frame width/height). */
export interface NormBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectObservation {
  label: string;
  confidence: number; // 0..1
  bbox?: NormBBox;
}

export interface FaceObservation {
  name?: string;
  confidence: number; // 0..1
  bbox?: NormBBox;
  emotion?: { label: string; confidence: number };
}

export interface SceneEmotion {
  name?: string;
  emotion: string;
  confidence: number; // 0..1
}

export interface TranscriptionWord {
  word: string;
  start: number; // seconds, absolute in source
  end: number;
  confidence?: number;
}

export interface Scene {
  /** Content-addressed, stable across re-analysis. See sceneId(). */
  id: string;
  /** Source asset ref (path / id). Scenes from different sources are composable. */
  source: string;
  /** Segment bounds in the SOURCE, in seconds. */
  startTime: number;
  endTime: number;
  /** endTime - startTime, seconds. Derived; use makeScene() to keep it consistent. */
  durationSec: number;

  // --- dual representation: flat (filter/score) ---
  objects: string[];
  faces: string[];
  detectedText: string[];
  // --- rich (render; optional) ---
  objectsData?: ObjectObservation[];
  facesData?: FaceObservation[];

  // --- audio / text ---
  transcription: string;
  transcriptionWords?: TranscriptionWord[];
  /** True when the segment carries speech. Derived; use makeScene(). */
  hasSpeech: boolean;

  // --- visual ---
  shotType?: ShotType;
  emotions?: SceneEmotion[];
  dominantColor?: { hex: string; name: string };
  /** Soft NL caption. Treat as low-trust (captioners are noisy). */
  description?: string;

  // --- asset context (denormalized onto every scene for a flat struct) ---
  aspectRatio?: string;
  thumbnailUrl?: string;
  camera?: string;
  /** When the asset was shot/created (epoch ms) - used for chronological ordering. */
  createdAt?: number;
  location?: string;

  // --- analysis signals: the per-segment "report card" from Editron's own pipeline.
  //     All optional (V-JEPA / wav2vec / moment-weight coverage is not guaranteed);
  //     absent means "no signal", never fabricated. 0..1 unless noted. These are what
  //     the composer ranks on when present, replacing invented proxies. ---
  /**
   * Fused per-segment importance = moment-weight `finalWeight`: transcript intent +
   * V-JEPA visual significance + wav2vec vocal emotion + learned (Thompson) correction.
   * The spine signal the composer ranks on. This is the pipeline's own number that
   * already modulates every downstream technique - using it here is the opposite of
   * inventing a weight.
   */
  importance?: number;
  /** Confidence of `importance`, from the moment-weight map. */
  importanceConfidence?: 'high' | 'medium' | 'low';
  /** Coarse visual mode: talking-head | b-roll | screen-share | product-demo | chart |
   *  text-card | ... (semanticVisual.primaryVisualMode). A real enum, not an NL caption. */
  visualMode?: string;
  /** Visual importance of the segment (semanticVisual.salience). */
  salience?: number;
  /** Whether the segment's visuals explain the narration (semanticVisual.visuallyExplains). */
  visuallyExplains?: boolean;
  /** Semantic action: talking | walking | gesturing | demonstrating | ... (V-JEPA
   *  actionType). Used for diversity - avoid stacking near-identical shots. */
  actionType?: string;
  /** Learned motion magnitude (V-JEPA motionIntensity). */
  motionIntensity?: number;
  /** Vocal energy (wav2vec energy). */
  vocalEnergy?: number;
  /** Vocal arousal / emotion intensity (wav2vec emotionIntensity). */
  vocalArousal?: number;
  /** Vocal valence label, from wav2vec (voice, not text). */
  vocalValence?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

/**
 * Content-addressed scene id: sha256(source + startTime + endTime). Idempotent across
 * re-analysis so a re-run does not duplicate scenes.
 *
 * NOTE: keying on raw times means changing segmentation changes ids (the churn Edit Mind
 * documents). The perception adapter SHOULD prefer a stable segment id when it has one;
 * this helper is the fallback and the shape the tests pin.
 */
export function sceneId(source: string, startTime: number, endTime: number): string {
  return createHash('sha256').update(`${source}_${startTime}_${endTime}`).digest('hex');
}

/** Fields the caller provides; id/durationSec/hasSpeech are derived if absent. */
export type SceneInput = Omit<Scene, 'id' | 'durationSec' | 'hasSpeech'> & {
  id?: string;
  hasSpeech?: boolean;
};

/**
 * Build a Scene with derived fields consistent: durationSec = endTime - startTime,
 * hasSpeech from the transcription (unless explicitly set), id content-addressed if
 * not supplied. Pure; never throws.
 */
export function makeScene(input: SceneInput): Scene {
  const durationSec = input.endTime - input.startTime;
  const hasSpeech =
    input.hasSpeech ?? (typeof input.transcription === 'string' && input.transcription.trim().length > 0);
  return {
    ...input,
    id: input.id ?? sceneId(input.source, input.startTime, input.endTime),
    durationSec,
    hasSpeech,
  };
}
