/**
 * image-scene - make a still image a first-class Scene. Video assets become Scenes via the
 * per-segment analysis (scene-adapter); an IMAGE has no segments, no audio, no time window -
 * so it gets NO analysis today and falls out of the composer. This module closes that gap: a
 * vision pass extracts the same fact SHAPE a video segment carries (visual mode, on-screen
 * text, dominant color, salience), and we synthesize a Scene whose duration is a CHOICE (how
 * long the still holds), not a source window.
 *
 * The renderer already draws stills (ImageLayerContent), so this is analysis-only - once an
 * image is a Scene, the SAME composer/ordering brain sequences it alongside video, no special
 * casing. The vision call is INJECTED (ImageVisionAnalyze) so this file stays testable and
 * provider-neutral; the impure edge passes the app's vision client.
 *
 * Pure except `synthesizeImageScenes` (which awaits the injected vision fn); never throws.
 */

import { makeScene, type Scene } from './scene';

/** Facts a vision model extracts from a still - the image analog of a segment's signals. */
export interface ImageFacts {
  /** Coarse visual mode: 'photo' | 'chart' | 'text-card' | 'product-shot' | 'screenshot' | ... */
  visualMode?: string | null;
  /** On-screen text (OCR). Drives read-time hold when the image is text-heavy. */
  detectedText?: string[] | null;
  /** Low-trust NL caption. */
  description?: string | null;
  dominantColor?: { hex: string; name: string } | null;
  /** Visual importance 0..1 (how strong/eye-catching), the still's analog of salience. */
  salience?: number | null;
  /** Overall importance 0..1, if the vision pass scores it (else derived from salience). */
  importance?: number | null;
}

export interface ImageAssetInput {
  assetId: string;
  /** Resolvable media ref (cachedUrl / gcsPath); preferred Scene `source`, falls back to assetId. */
  source?: string | null;
  /** Epoch ms the image was created - chronological ordering key. */
  createdAt?: number | null;
  /** Explicit hold (seconds). When absent, chosen from the content (read-time for text). */
  holdSec?: number | null;
}

// --- hold-duration policy: how long a still stays on screen. INVENTED-PLACEHOLDER. ---
export const DEFAULT_IMAGE_HOLD_SEC = 4;
export const MIN_IMAGE_HOLD_SEC = 1.5;
export const MAX_IMAGE_HOLD_SEC = 8;
/** Seconds a reader needs per word of on-screen text (~200 wpm reading speed). */
const SEC_PER_ONSCREEN_WORD = 0.3;

function clampHold(sec: number): number {
  if (!Number.isFinite(sec)) return DEFAULT_IMAGE_HOLD_SEC;
  return sec < MIN_IMAGE_HOLD_SEC ? MIN_IMAGE_HOLD_SEC : sec > MAX_IMAGE_HOLD_SEC ? MAX_IMAGE_HOLD_SEC : sec;
}

function num01(n: number | null | undefined): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function cleanText(list: readonly string[] | null | undefined): string[] {
  if (!list) return [];
  return list.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);
}

/**
 * How long a text-heavy still should hold: base default, extended by the reading time of its
 * on-screen text so a viewer can actually read it. Clamped. Pure.
 */
export function readTimeHold(facts: ImageFacts): number {
  const words = cleanText(facts.detectedText).reduce((n, s) => n + s.split(/\s+/).length, 0);
  if (words === 0) return DEFAULT_IMAGE_HOLD_SEC;
  return clampHold(Math.max(DEFAULT_IMAGE_HOLD_SEC, words * SEC_PER_ONSCREEN_WORD));
}

/**
 * Synthesize ONE Scene from an image + its vision facts. A still is a [0, hold] window with no
 * speech; duration is a chosen hold (explicit, or read-time from on-screen text). importance
 * falls back to salience when the vision pass doesn't score it. Pure; never throws.
 */
export function sceneFromImage(asset: ImageAssetInput, facts: ImageFacts): Scene {
  const hold = clampHold(typeof asset.holdSec === 'number' && asset.holdSec > 0 ? asset.holdSec : readTimeHold(facts));
  const source = asset.source && asset.source.length > 0 ? asset.source : asset.assetId;
  const detectedText = cleanText(facts.detectedText);
  const salience = num01(facts.salience);
  return makeScene({
    source,
    startTime: 0,
    endTime: hold,
    objects: [],
    faces: [],
    detectedText,
    transcription: '', // a still carries no speech
    hasSpeech: false,
    dominantColor: facts.dominantColor ?? undefined,
    createdAt: typeof asset.createdAt === 'number' ? asset.createdAt : undefined,
    // --- signals (same shape a video Scene carries) ---
    importance: num01(facts.importance) ?? salience,
    visualMode: facts.visualMode ?? undefined,
    salience,
    description: facts.description ?? undefined,
  });
}

/** Map many image (asset, facts) pairs to Scenes, dropping non-positive holds. Pure. */
export function scenesFromImages(inputs: readonly { asset: ImageAssetInput; facts: ImageFacts }[]): Scene[] {
  const out: Scene[] = [];
  const seen = new Set<string>();
  for (const { asset, facts } of inputs) {
    const scene = sceneFromImage(asset, facts);
    if (!(scene.endTime > scene.startTime)) continue;
    if (seen.has(scene.id)) continue;
    seen.add(scene.id);
    out.push(scene);
  }
  return out;
}

/** Run a vision model over an image asset to get its facts. Injected by the impure edge. */
export type ImageVisionAnalyze = (asset: ImageAssetInput) => Promise<ImageFacts>;

/**
 * The impure edge: analyze each image asset with the injected vision fn and synthesize Scenes.
 * An asset whose vision call throws is skipped (never blocks the others). Never throws.
 */
export async function synthesizeImageScenes(
  assets: readonly ImageAssetInput[],
  vision: ImageVisionAnalyze,
): Promise<Scene[]> {
  const pairs: { asset: ImageAssetInput; facts: ImageFacts }[] = [];
  for (const asset of assets) {
    try {
      pairs.push({ asset, facts: await vision(asset) });
    } catch {
      // skip an image whose vision analysis failed; the rest still compose.
    }
  }
  return scenesFromImages(pairs);
}
