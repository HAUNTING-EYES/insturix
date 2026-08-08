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
    expect(catalog?.requestedSurface).toBe('transition');
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

  it('evidence is omitted from the report when not supplied (backward compatible)', async () => {
    let report: unknown;
    await searchAndDownloadSFX('impact hit', 'user_1', 3, undefined, (r) => { report = r; }, BUNDLED_SFX_CATALOG, NO_SEMANTICS);
    const catalog = (report as { catalog?: { requestedEvidence?: unknown } })?.catalog;
    expect(catalog?.requestedEvidence).toBeUndefined();
  });
});