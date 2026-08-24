import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Stage 1.5 range and concurrency current truth', () => {
  it('keeps the range-cut transform pure and explicitly half-open', () => {
    const timelineRangeCut = source('lib/editron/services/timeline-range-cut.ts');

    expect(timelineRangeCut).toContain(
      "schemaVersion: 'EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1'",
    );
    expect(timelineRangeCut).toContain(
      "mapRule: 'HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1'",
    );
  });

  it('records the one durable ripple-cut owner without overstating range collaboration', () => {
    const projectService = source('lib/editron/services/project-service.ts');

    expect(projectService).toContain('private async persistEditorState(input:');
    expect(projectService).toContain('overlays: mergedOverlays');
    expect(projectService).toContain('async cutTimelineRangeV1(');
    expect(projectService).toContain('timelineRangeChangeReceipts');
    expect(projectService).toContain('writeFrameRangesBefore');
    expect(projectService).toContain('UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN');
    expect(projectService).toContain('$inc: { projectRevision: 1 }');
    expect(projectService).toContain('...projectRevisionPredicate(expectedRevision)');
    expect(projectService).toContain('directorLock');

    for (const absentRangeConcurrencyCapability of [
      'timelineRangeLocks',
      'reconcileTimelineRangeChange',
      'safeRebaseTimeline',
    ]) {
      expect(projectService, absentRangeConcurrencyCapability).not.toContain(
        absentRangeConcurrencyCapability,
      );
    }
  });

  it('keeps a revision conflict as a full-state reload in the current client', () => {
    const autosave = source(
      'components/editron/editor/version-7.0.0/hooks/use-autosave.ts',
    );
    const conflictReloads = [
      ...autosave.matchAll(
        /response\.status === 409\) \{\s+await loadStateRef\.current\(\);/g,
      ),
    ];

    expect(conflictReloads).toHaveLength(2);
  });
});
