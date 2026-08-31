import { describe, expect, it } from 'vitest';

import {
  buildEditronFastQaArtifactPaths,
  buildEditronFastQaFixtureState,
  buildEditronFastQaProjectDiff,
  buildEditronFastQaScenarioManifest,
  EDITRON_FAST_USER_QA_FIXTURE_CASE,
  EDITRON_FAST_USER_QA_SCENARIO_ID,
  safeFastQaSegment,
} from '../../lib/editron/services/editron-fast-user-qa';

function project(overlays: Array<Record<string, unknown>>, projectRevision = 1) {
  return {
    projectId: 'proj_cb_fastqa_contract',
    projectRevision,
    durationInFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
    overlays,
  };
}

function textOverlay(id: number, from: number, content = 'QA title') {
  return {
    id,
    type: 'text',
    from,
    durationInFrames: 60,
    row: 1,
    content,
    styles: { color: '#fff', fontSize: 42 },
  };
}

describe('Editron fast user QA contracts', () => {
  it('keeps run and fixture artifact paths inside the selected output root', () => {
    expect(safeFastQaSegment('../run/with spaces', 'fallback')).toBe('run-with-spaces');
    const paths = buildEditronFastQaArtifactPaths(
      'C:/qa-output',
      '../unsafe-run',
      'proj_cb_fastqa_contract',
    );

    expect(paths.root.replaceAll('\\', '/')).toContain('/qa-output/unsafe-run');
    expect(paths.fixtureManifestPath.replaceAll('\\', '/')).toContain(
      '/fixture/proj_cb_fastqa_contract/fixture.json',
    );
    expect(paths.tracePath.replaceAll('\\', '/')).toContain('/trace.zip');
  });

  it('describes the existing fixture owner and honest Q0/Q1 limits', () => {
    const manifest = buildEditronFastQaScenarioManifest({
      projectId: 'proj_cb_fastqa_contract',
      runId: 'fast-qa-contract',
      baseUrl: 'http://localhost:3000',
    });

    expect(manifest.scenarioId).toBe(EDITRON_FAST_USER_QA_SCENARIO_ID);
    expect(manifest.fixture.owner).toBe('editron-fast-user-qa-fixture-v1');
    expect(manifest.fixture.fixtureCase).toBe(EDITRON_FAST_USER_QA_FIXTURE_CASE);
    expect(manifest.provider.inference).toBe('disabled');
    expect(manifest.cleanup.verifyProjectAbsence).toBe(true);
    expect(manifest.evidence.human).toBe('not-run-in-fast-lane');
    expect(manifest.limits.fastLaneDoesNotCertify).toContain('Q2 render/audio proof');
  });

  it('creates a deterministic scaled fixture for the real editor path', () => {
    const state = buildEditronFastQaFixtureState();

    expect(state).toMatchObject({
      aspectRatio: '16:9',
      fps: 30,
      durationInFrames: 300,
      playerDimensions: { width: 1920, height: 1080 },
    });
    expect(state.overlays).toHaveLength(1);
    expect(state.overlays[0]).toMatchObject({
      id: 1,
      type: 'text',
      content: 'Agency launch — fast QA title',
      from: 30,
      durationInFrames: 180,
    });
  });

  it('reports persisted timing changes, revision movement, and no-op recovery', () => {
    const before = project([textOverlay(7, 10)], 3);
    const after = project([textOverlay(7, 22)], 4);
    const changed = buildEditronFastQaProjectDiff(before, after, '2026-09-01T00:00:00.000Z');

    expect(changed.changed).toBe(true);
    expect(changed.beforeProjectRevision).toBe(3);
    expect(changed.afterProjectRevision).toBe(4);
    expect(changed.changedOverlays).toHaveLength(1);
    expect(changed.changedOverlays[0]?.changedFields).toEqual(
      expect.arrayContaining(['from', 'digest']),
    );

    const noOp = buildEditronFastQaProjectDiff(after, after);
    expect(noOp.changed).toBe(false);
    expect(noOp.changedOverlays).toEqual([]);
    expect(noOp.addedOverlayIds).toEqual([]);
    expect(noOp.removedOverlayIds).toEqual([]);
  });

  it('keeps added and removed overlays explicit instead of hiding them in a digest', () => {
    const before = project([textOverlay(1, 0)], 8);
    const after = project([textOverlay(2, 0, 'new title')], 9);
    const diff = buildEditronFastQaProjectDiff(before, after);

    expect(diff.changed).toBe(true);
    expect(diff.addedOverlayIds).toEqual(['2']);
    expect(diff.removedOverlayIds).toEqual(['1']);
    expect(diff.changedOverlays).toEqual([]);
  });
});
