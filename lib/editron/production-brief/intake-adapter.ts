/**
 * intake-adapter - map a project's REAL analysis + assets into the normalized IntakeSignals
 * the ProductionBrief resolver reasons over. Until now the resolver only ran on synthetic
 * signals (scripts/tests); this is the deferred adapter that lets it run on live project data.
 *
 * PURE. It reads the per-asset analysis docs (from the reader) + a light per-asset duration
 * list, extracts contentType + speechCoverage from each `rawFootageAnalysis`, aggregates them
 * (dominant contentType, mean speech coverage), sums duration, and merges the user's intake
 * (brand, connected platforms, prompt, explicit requests). Missing signals are `null` - the
 * resolver already treats those as "follow the content", never a guess.
 *
 * Shapes are code-verified: `rawFootageAnalysis.contentTypeDetection.contentType` +
 * `rawFootageAnalysis.speechCoverage`. Local structural mirror for asset duration - no import
 * of Codex's types, no edit to his files.
 */

import type { ProjectAssetAnalysisDoc } from '../storyline/asset-analysis-reader';
import type { BrandDefaults, IntakeSignals } from './intake-resolver';
import type { Platform } from './production-brief';

/** Minimal per-asset facts the adapter needs beyond the analysis doc (from mediaAssets). */
export interface IntakeAssetDuration {
  assetId: string;
  durationSec?: number | null;
}

/** The user-supplied half of intake (everything the analysis can't tell us). */
export interface IntakeUserContext {
  hasBrand?: boolean;
  brand?: BrandDefaults | null;
  connectedPlatforms?: Platform[];
  prompt?: string | null;
  requested?: IntakeSignals['requested'];
}

function contentTypeOf(doc: ProjectAssetAnalysisDoc): string | null {
  const raw = doc.rawFootageAnalysis as { contentTypeDetection?: { contentType?: string | null } } | null | undefined;
  const ct = raw?.contentTypeDetection?.contentType;
  return typeof ct === 'string' && ct.trim().length > 0 ? ct.trim() : null;
}

function speechCoverageOf(doc: ProjectAssetAnalysisDoc): number | null {
  const raw = doc.rawFootageAnalysis as { speechCoverage?: number | null } | null | undefined;
  const sc = raw?.speechCoverage;
  return typeof sc === 'number' && Number.isFinite(sc) ? sc : null;
}

/** Most-frequent non-null content type across assets; ties broken by first seen. Null if none. */
function dominantContentType(docs: readonly ProjectAssetAnalysisDoc[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestN = 0;
  for (const d of docs) {
    const ct = contentTypeOf(d);
    if (!ct) continue;
    const n = (counts.get(ct) ?? 0) + 1;
    counts.set(ct, n);
    if (n > bestN) {
      bestN = n;
      best = ct;
    }
  }
  return best;
}

/** Mean of the known per-asset speech-coverage values; null when none is known. */
function meanSpeechCoverage(docs: readonly ProjectAssetAnalysisDoc[]): number | null {
  const vals = docs.map(speechCoverageOf).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Sum of known asset durations; null when none is known (so the resolver leaves duration unbounded). */
function totalDuration(assets: readonly IntakeAssetDuration[]): number | null {
  const vals = assets.map((a) => a.durationSec).filter((v): v is number => typeof v === 'number' && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0);
}

/**
 * Build IntakeSignals from the project's analyses + assets + the user's intake. Pure; never
 * throws. `assetCount` counts the assets (the upload set), not just the analyzed ones.
 */
export function intakeSignalsFromProject(
  analyses: readonly ProjectAssetAnalysisDoc[],
  assets: readonly IntakeAssetDuration[],
  user: IntakeUserContext = {},
): IntakeSignals {
  return {
    entryPoint: 'upload',
    assetCount: assets.length,
    totalDurationSec: totalDuration(assets),
    contentType: dominantContentType(analyses),
    speechCoverage: meanSpeechCoverage(analyses),
    hasBrand: user.hasBrand ?? user.brand != null,
    connectedPlatforms: user.connectedPlatforms,
    brand: user.brand ?? null,
    prompt: user.prompt ?? null,
    requested: user.requested,
  };
}
