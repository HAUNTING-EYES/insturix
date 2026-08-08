import { describe, expect, it } from 'vitest';

import { BUNDLED_SFX_CATALOG } from '@/lib/pipeline/sfx-catalog';
import { searchAndDownloadSFX } from '@/lib/pipeline/sfx-library-service';
import { deriveSfxSelectionEvidence } from '@/lib/pipeline/sfx-selection-evidence';

const NO_SEMANTICS = {
  retrieveCatalogSemantics: async () => undefined,
};

describe('S1 evidence reaches the selector (production path: searchAndDownloadSFX)', () => {
  it('wipe-left evidence flows into the selection report with source keys', async () => {
    const evidence = deriveSfxSelectionEvidence({
      surface: 'transition',
      transitionDirectionLabel: 'left',
      receiptKeys: ['atomic-transition-direction:left'],
    });
    let report: unknown;
    const result = await searchAndDownloadSFX(
      'swoosh whoosh transition air',
      'user_1',
      3,
      undefined,
      (r) => { report = r; },
      BUNDLED_SFX_CATALOG,
      NO_SEMANTICS,
      evidence,
    );

    const catalog = (report as { catalog?: { requestedEvidence?: { surface?: string; direction?: string; evidenceKeys?: string[] }; requestedSurface?: string } })?.catalog;
    expect(catalog?.requestedEvidence?.surface).toBe('transition');
    expect(catalog?.requestedEvidence?.direction).toBe('left');
    expect(catalog?.requestedEvidence?.evidenceKeys).toEqual(
      expect.arrayContaining(['atomic-transition-direction:left', 'surface', 'transition-direction:left']),
    );
    // S1-R SHADOW: evidence is REPORT-ONLY. The scored field stays unpopulated
    // (requestedSurface = request.surface ?? inferSurface(form) = undefined), so
    // live selection is identical to pre-S1. Provenance is visible in the report.
    expect(catalog?.requestedSurface).toBeUndefined();
    expect(result).not.toBeNull();
  });

  it('whip-pan motion yields fast motion speed and direction from the real vector', async () => {
    const evidence = deriveSfxSelectionEvidence({
      surface: 'transition',
      motion: { axis: 'x', x: 1, magnitude: 0.6 },
      durationMs: 120,
      receiptKeys: ['whip-pan'],
    });
    expect(evidence.motionSpeed).toBe('fast');
    expect(evidence.direction).toBe('right');
  });

  it('dissolve evidence reports transition surface with NO direction', async () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'transition', transitionDirectionLabel: 'center' });
    let report: unknown;
    await searchAndDownloadSFX(
      'soft whoosh transition',
      'user_1',
      3,
      undefined,
      (r) => { report = r; },
      BUNDLED_SFX_CATALOG,
      NO_SEMANTICS,
      evidence,
    );
    const catalog = (report as { catalog?: { requestedEvidence?: { direction?: string } } })?.catalog;
    expect(catalog?.requestedEvidence?.direction).toBeUndefined();
  });

  it('non-regression: neutral catalog assets remain eligible under directional evidence', async () => {
    const without = await searchAndDownloadSFX('swosh whoosh transition', 'user_1', 3, undefined, undefined, BUNDLED_SFX_CATALOG, NO_SEMANTICS);
    const withLeft = await searchAndDownloadSFX(
      'swosh whoosh transition',
      'user_1',
      3,
      undefined,
      undefined,
      BUNDLED_SFX_CATALOG,
      NO_SEMANTICS,
      deriveSfxSelectionEvidence({ surface: 'transition', transitionDirectionLabel: 'left' }),
    );
    expect(without).not.toBeNull();
    expect(withLeft).not.toBeNull();
  });

  it('S1-R PARITY: shipped searchAndDownloadSFX is selection-equivalent with/without evidence', async () => {
    const cases = [
      { id: 'wipe-left', query: 'swoosh whoosh transition air sweep', evidence: { surface: 'transition' as const, transitionDirectionLabel: 'left' as const } },
      { id: 'dissolve', query: 'soft whoosh transition gentle', evidence: { surface: 'transition' as const, transitionDirectionLabel: 'center' as const } },
      { id: 'whip-pan', query: 'fast whip pan swoosh quick', evidence: { surface: 'transition' as const, motion: { axis: 'x' as const, x: 1, magnitude: 0.6 }, durationMs: 120 } },
      { id: 'mg-swipe', query: 'subtle directional slide whoosh motion graphic', evidence: { surface: 'motion-graphic' as const, motion: { axis: 'x' as const, x: -0.5, magnitude: 0.5 }, durationMs: 300 } },
      { id: 'tick', query: 'digital glitch tick ui click', evidence: { surface: 'ui' as const, durationMs: 120 } },
      { id: 'ambience', query: 'ambience ocean waves calm scene', evidence: { surface: 'scene' as const, durationMs: 3000, material: 'environmental' } },
    ];
    for (const c of cases) {
      const grab = async (useEvidence: boolean) => {
        let report: { catalog?: { selectedAssetId?: string; acceptedCandidateCount?: number; rejectedCandidateCount?: number; decision?: string } } | undefined;
        await searchAndDownloadSFX(
          c.query, 'user_1', 3, undefined,
          (r) => { report = r; },
          BUNDLED_SFX_CATALOG, NO_SEMANTICS,
          useEvidence ? deriveSfxSelectionEvidence(c.evidence) : undefined,
        );
        const cat = report?.catalog ?? {};
        return {
          selectedAssetId: cat.selectedAssetId,
          acceptedCandidateCount: cat.acceptedCandidateCount,
          rejectedCandidateCount: cat.rejectedCandidateCount,
          decision: cat.decision,
        };
      };
      const beforeSnap = await grab(false);
      const afterSnap = await grab(true);
      expect(afterSnap).toEqual(beforeSnap);
      // Evidence is still visible in the report (provenance kept).
      let afterReport: { catalog?: { requestedEvidence?: { surface?: string; direction?: string } } } | undefined;
      await searchAndDownloadSFX(c.query, 'user_1', 3, undefined, (r) => { afterReport = r; }, BUNDLED_SFX_CATALOG, NO_SEMANTICS, deriveSfxSelectionEvidence(c.evidence));
      expect(afterReport?.catalog?.requestedEvidence?.surface).toBe(c.evidence.surface);
    }
  });

  it('evidence is omitted from the report when not supplied (backward compatible)', async () => {
    let report: unknown;
    await searchAndDownloadSFX('impact hit', 'user_1', 3, undefined, (r) => { report = r; }, BUNDLED_SFX_CATALOG, NO_SEMANTICS);
    const catalog = (report as { catalog?: { requestedEvidence?: unknown } })?.catalog;
    expect(catalog?.requestedEvidence).toBeUndefined();
  });
});