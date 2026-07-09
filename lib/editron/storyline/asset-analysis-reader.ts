/**
 * asset-analysis-reader - the READ half of the per-asset analysis store.
 *
 * Codex's `project-analysis-storage.ts` writes each asset's analysis to the
 * `editron_asset_analyses` collection (one doc per `{projectId, assetId}`) but nothing
 * reads it back - the persisted multi-upload analyses are orphaned from the render path
 * (`executeEDL` consumes an in-memory map, not this collection). This module is that
 * missing read half; the multi-asset orchestrator consumes it (reader -> scenesFromAssets
 * -> composeStoryline).
 *
 * It imports ONLY the collection CONSTANT from the write side (single source of truth for
 * the name) and never touches that file. `db` is an injected narrow interface (mirrors the
 * write side's `ProjectAssetAnalysisDb`) so this is pure + mockable.
 *
 * Shape is code-verified against `buildProjectAssetAnalysisDocumentUpdate`: flat top-level
 * fields, keyed by `{projectId, assetId}`. Analysis payloads are left `unknown` here - the
 * orchestrator (which owns the Scene mapping) narrows them.
 */

import { PROJECT_ASSET_ANALYSES_COLLECTION } from '../services/project-analysis-storage';

/** One `editron_asset_analyses` document (read shape). Payloads are `unknown`; the
 *  orchestrator narrows `segmentAnalysis`/`rawFootageAnalysis` when mapping to Scenes. */
export interface ProjectAssetAnalysisDoc {
  projectId: string;
  assetId: string;
  createdAt?: Date;
  updatedAt?: Date;
  rawFootageAnalysis?: unknown;
  segmentAnalysis?: unknown;
  vjepaAnalysis?: unknown;
  wav2vecAnalysis?: unknown;
  momentWeightMap?: unknown;
  musicAnalysis?: unknown;
}

/** Narrow read interface - matches the write side's structural `db`, kept mockable. */
export interface AnalysisReadCollection {
  findOne(filter: Record<string, unknown>): Promise<ProjectAssetAnalysisDoc | null>;
  find(filter: Record<string, unknown>): { toArray(): Promise<ProjectAssetAnalysisDoc[]> };
}
export interface AnalysisReadDb {
  collection(name: string): AnalysisReadCollection;
}

/** One asset's persisted analysis, or null if it was never analyzed. */
export async function readProjectAssetAnalysis(
  db: AnalysisReadDb,
  projectId: string,
  assetId: string,
): Promise<ProjectAssetAnalysisDoc | null> {
  const pid = projectId.trim();
  const aid = assetId.trim();
  if (!pid || !aid) return null;
  return db.collection(PROJECT_ASSET_ANALYSES_COLLECTION).findOne({ projectId: pid, assetId: aid });
}

/** Every persisted per-asset analysis for a project (any readiness stage). */
export async function readProjectAssetAnalyses(
  db: AnalysisReadDb,
  projectId: string,
): Promise<ProjectAssetAnalysisDoc[]> {
  const pid = projectId.trim();
  if (!pid) return [];
  return db.collection(PROJECT_ASSET_ANALYSES_COLLECTION).find({ projectId: pid }).toArray();
}

/**
 * True when a doc carries segments the composer can use. Per the Q4 verification, Phase 1
 * persists only `rawFootageAnalysis` + `vjepaAnalysis`; `segmentAnalysis.segments` arrives in
 * Phase 2. An asset stuck at Phase 1 yields no Scenes, so gate on this before composing.
 */
export function hasComposableSegments(doc: ProjectAssetAnalysisDoc): boolean {
  const seg = doc.segmentAnalysis as { segments?: unknown } | null | undefined;
  return Array.isArray(seg?.segments) && seg.segments.length > 0;
}

/** The per-asset analyses that are actually ready to compose (Phase-2 complete). */
export async function readComposableAssetAnalyses(
  db: AnalysisReadDb,
  projectId: string,
): Promise<ProjectAssetAnalysisDoc[]> {
  const all = await readProjectAssetAnalyses(db, projectId);
  return all.filter(hasComposableSegments);
}
