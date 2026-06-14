import { describe, expect, it } from 'vitest';

import {
  buildPhase0ArtifactPaths,
  makePhase0RunId,
  selectPhase0RunDirsToPrune,
} from '../../lib/editron/services/phase0-artifact-paths';

describe('phase0 artifact paths', () => {
  it('builds stable per-project per-run artifact paths', () => {
    const paths = buildPhase0ArtifactPaths('proj / unsafe:id', {
      rootDir: '.calibration-temp\\phase0-fixtures',
      runId: '2026-06-14Tbad/run',
    });

    expect(paths).toMatchObject({
      projectId: 'proj / unsafe:id',
      safeProjectId: 'proj-unsafe-id',
      runId: '2026-06-14Tbad-run',
      projectDir: '.calibration-temp/phase0-fixtures/proj-unsafe-id',
      runDir: '.calibration-temp/phase0-fixtures/proj-unsafe-id/2026-06-14Tbad-run',
      manifestPath: '.calibration-temp/phase0-fixtures/proj-unsafe-id/2026-06-14Tbad-run/manifest.json',
      renderInputPath: '.calibration-temp/phase0-fixtures/proj-unsafe-id/2026-06-14Tbad-run/render-input.json',
      renderedAestheticDir: '.calibration-temp/phase0-fixtures/proj-unsafe-id/2026-06-14Tbad-run/rendered-aesthetic',
    });
  });

  it('creates sortable run ids from dates', () => {
    expect(makePhase0RunId(new Date('2026-06-14T09:08:07.006Z'))).toBe('20260614T090807006Z');
  });

  it('selects old run dirs for pruning while protecting the active run', () => {
    const pruned = selectPhase0RunDirsToPrune(
      ['notes', '20260614T000000000Z', '20260614T010000000Z', '20260614T020000000Z', '20260614T030000000Z'],
      { keepRuns: 3, protectedRunId: '20260614T010000000Z' },
    );

    expect(pruned).toEqual(['20260614T000000000Z']);
  });
});
