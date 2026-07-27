import { describe, expect, it } from 'vitest';

import { PROJECT_ASSET_ANALYSES_COLLECTION } from '@/lib/editron/services/project-analysis-storage';
import {
  type AnalysisReadDb,
  hasComposableSegments,
  type ProjectAssetAnalysisDoc,
  readComposableAssetAnalyses,
  readProjectAssetAnalyses,
  readProjectAssetAnalysis,
} from '@/lib/editron/storyline/asset-analysis-reader';

function doc(over: Partial<ProjectAssetAnalysisDoc> = {}): ProjectAssetAnalysisDoc {
  return { projectId: 'p1', assetId: 'a1', ...over };
}
function withSegments(n: number): unknown {
  return { segments: Array.from({ length: n }, (_, i) => ({ index: i })) };
}

/** Records which collection name was requested (guards against querying the wrong collection). */
function mockDb(docs: ProjectAssetAnalysisDoc[]): AnalysisReadDb & { names: string[] } {
  const names: string[] = [];
  return {
    names,
    collection(name: string) {
      names.push(name);
      return {
        findOne: async (f: Record<string, unknown>) =>
          docs.find((d) => d.projectId === f.projectId && d.assetId === f.assetId) ?? null,
        find: (f: Record<string, unknown>) => ({
          toArray: async () => docs.filter((d) => d.projectId === f.projectId),
        }),
      };
    },
  };
}

describe('asset-analysis-reader', () => {
  it('reads the editron_asset_analyses collection (matches the write-side constant)', async () => {
    const db = mockDb([doc()]);
    await readProjectAssetAnalysis(db, 'p1', 'a1');
    expect(db.names).toContain(PROJECT_ASSET_ANALYSES_COLLECTION);
    expect(PROJECT_ASSET_ANALYSES_COLLECTION).toBe('editron_asset_analyses');
  });

  it('readProjectAssetAnalysis returns the matching doc, or null when absent', async () => {
    const db = mockDb([doc({ assetId: 'a1' }), doc({ assetId: 'a2' })]);
    expect((await readProjectAssetAnalysis(db, 'p1', 'a2'))?.assetId).toBe('a2');
    expect(await readProjectAssetAnalysis(db, 'p1', 'nope')).toBeNull();
  });

  it('null/blank ids short-circuit to null without hitting the db', async () => {
    const db = mockDb([doc()]);
    expect(await readProjectAssetAnalysis(db, '  ', 'a1')).toBeNull();
    expect(await readProjectAssetAnalysis(db, 'p1', '')).toBeNull();
    expect(db.names).toHaveLength(0);
  });

  it('readProjectAssetAnalyses returns every doc for the project', async () => {
    const db = mockDb([doc({ assetId: 'a1' }), doc({ assetId: 'a2' }), doc({ projectId: 'other', assetId: 'x' })]);
    const got = await readProjectAssetAnalyses(db, 'p1');
    expect(got.map((d) => d.assetId).sort()).toEqual(['a1', 'a2']);
  });

  it('hasComposableSegments is true only when segmentAnalysis has segments', () => {
    expect(hasComposableSegments(doc({ segmentAnalysis: withSegments(3) }))).toBe(true);
    expect(hasComposableSegments(doc({ segmentAnalysis: withSegments(0) }))).toBe(false);
    expect(hasComposableSegments(doc({ segmentAnalysis: null }))).toBe(false);
    expect(hasComposableSegments(doc({ rawFootageAnalysis: {} }))).toBe(false); // Phase-1-only
  });

  it('readComposableAssetAnalyses drops Phase-1-only assets (no segments yet)', async () => {
    const db = mockDb([
      doc({ assetId: 'ready', segmentAnalysis: withSegments(4) }),
      doc({ assetId: 'phase1', rawFootageAnalysis: {} }), // analyzed but no segments
      doc({ assetId: 'empty', segmentAnalysis: withSegments(0) }),
    ]);
    const got = await readComposableAssetAnalyses(db, 'p1');
    expect(got.map((d) => d.assetId)).toEqual(['ready']);
  });
});
