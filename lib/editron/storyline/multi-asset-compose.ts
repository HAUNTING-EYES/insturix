/**
 * multi-asset-compose - the orchestrator that turns MANY assets' persisted analyses into
 * ONE ordered Storyline. This is the payoff of the composition lane: it closes the loop
 * `read per-asset analysis -> Scene adapter -> composer`, consuming Codex's real
 * `editron_asset_analyses` storage (which was write-only / orphaned from the render path).
 *
 * PURE: it takes the analysis docs (from the reader) + a per-asset context map + the brief,
 * and returns a Storyline. The impure edge (a route) does the DB work: read the docs
 * (`asset-analysis-reader`) and resolve each asset's context from `mediaAssets`, then call
 * here. `MediaAssetLike` is a local structural mirror of Codex's MediaAsset - no import of
 * his types, no edit to his files.
 *
 * Shapes are code-verified (Fable-Seam Q1/Q2/Q4): `segmentAnalysis.segments` = SegmentRecord[]
 * (-> EditronSegment[]); `rawFootageAnalysis.transcription.words` = TranscriptionWord[]
 * (-> EditronWord[]). Assets not yet at Phase 2 (no segments) are skipped, not faked.
 */

import type { ProductionBrief } from '../production-brief/production-brief';
import { hasComposableSegments, type ProjectAssetAnalysisDoc } from './asset-analysis-reader';
import { composeStoryline, type ComposeOptions } from './compose';
import type { Scene } from './scene';
import {
  type AssetAnalysisInput,
  type EditronAssetContext,
  type EditronSegment,
  type EditronWord,
  scenesFromAssets,
} from './scene-adapter';
import type { Storyline } from './storyline';

/** The subset of Codex's `MediaAsset` (asset-resolver) we map into a Scene's asset context. */
export interface MediaAssetLike {
  assetId: string;
  cachedUrl?: string | null;
  gcsPath?: string | null;
  thumbnailUrl?: string | null;
  /** epoch ms or Date. */
  createdAt?: number | Date | null;
  dominantColors?: string[] | null;
}

/** Segments a doc carries for the composer (Phase-2 `segmentAnalysis.segments`). Empty if absent. */
function extractSegments(doc: ProjectAssetAnalysisDoc): EditronSegment[] {
  const seg = doc.segmentAnalysis as { segments?: EditronSegment[] } | null | undefined;
  return Array.isArray(seg?.segments) ? seg.segments : [];
}

/** Word timings (Phase-1 `rawFootageAnalysis.transcription.words`). Empty if absent. */
function extractWords(doc: ProjectAssetAnalysisDoc): EditronWord[] {
  const raw = doc.rawFootageAnalysis as { transcription?: { words?: EditronWord[] } } | null | undefined;
  const words = raw?.transcription?.words;
  return Array.isArray(words) ? words : [];
}

/** Map one Codex `MediaAsset` to a Scene's `EditronAssetContext`. Pure. Fields absent -> undefined. */
export function assetContextFromMediaAsset(m: MediaAssetLike): EditronAssetContext {
  const source = m.cachedUrl && m.cachedUrl.length > 0 ? m.cachedUrl : m.gcsPath ?? undefined;
  const createdAt =
    typeof m.createdAt === 'number'
      ? m.createdAt
      : m.createdAt instanceof Date
        ? m.createdAt.getTime()
        : undefined;
  const firstColor = m.dominantColors?.find((c) => typeof c === 'string' && c.length > 0);
  return {
    assetId: m.assetId,
    source: source ?? undefined,
    thumbnailUrl: m.thumbnailUrl ?? undefined,
    createdAt,
    dominantColor: firstColor ? { hex: firstColor, name: firstColor } : undefined,
  };
}

/** Build the assetId -> context map the orchestrator wants, from the project's media assets. */
export function buildAssetContextMap(assets: readonly MediaAssetLike[]): Map<string, EditronAssetContext> {
  const map = new Map<string, EditronAssetContext>();
  for (const a of assets) map.set(a.assetId, assetContextFromMediaAsset(a));
  return map;
}

export interface ComposeFromAnalysesOptions {
  /** Per-asset context by assetId (source/thumbnail/createdAt/dominantColor), from mediaAssets.
   *  A missing entry falls back to a minimal `{assetId}` (the adapter uses assetId as source). */
  assetContexts?: ReadonlyMap<string, EditronAssetContext>;
  /** Passed through to the composer (scorer, fps, minClip). */
  compose?: ComposeOptions;
}

/**
 * Compose ONE ordered Storyline from many assets' analysis docs + the brief. Pure; never
 * throws. Docs without composable segments (Phase-1-only) are skipped; empty input yields an
 * empty (valid) storyline. Scenes from different assets are composed into one timeline by the
 * existing composer - this is the multi-media -> one-project step.
 */
export function composeStorylineFromAssetAnalyses(
  docs: readonly ProjectAssetAnalysisDoc[],
  brief: ProductionBrief,
  opts?: ComposeFromAnalysesOptions,
): Storyline {
  const inputs: AssetAnalysisInput[] = [];
  for (const doc of docs) {
    if (!hasComposableSegments(doc)) continue;
    const asset = opts?.assetContexts?.get(doc.assetId) ?? { assetId: doc.assetId };
    inputs.push({ segments: extractSegments(doc), asset, words: extractWords(doc) });
  }
  const scenes: Scene[] = scenesFromAssets(inputs);
  return composeStoryline(scenes, brief, opts?.compose);
}
