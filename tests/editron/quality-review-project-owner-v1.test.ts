import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/api/services/editron/quality-review/route.ts'),
  'utf8',
).replaceAll('\r\n', '\n');

describe('manual quality-review project owner V1', () => {
  it('reviews and persists one exact ProjectService snapshot', () => {
    const snapshot = source.indexOf('const snapshot = await projectService.loadProjectForMutation(userId, projectId)');
    const review = source.indexOf('const report = runQualityReview(');
    const save = source.indexOf('const receipt = await projectService.saveProjectWithReceipt(');
    const event = source.indexOf('emitBrandEvent({');

    expect(snapshot).toBeGreaterThan(-1);
    expect(review).toBeGreaterThan(snapshot);
    expect(save).toBeGreaterThan(review);
    expect(event).toBeGreaterThan(save);
    expect(source).toContain('expectedRevision: snapshot.revision');
    expect(source).toContain('buildPersistedQualityReview(report, reviewedAt)');
    expect(source).toContain("source: 'manual-quality-review'");
    expect(source).toContain('reviewedProjectRevision: snapshot.revision');
    expect(source).not.toContain('updateProjectMetadata(');
  });

  it('reports stale and foreign project outcomes without a latest-revision fallback', () => {
    expect(source).toContain('error instanceof ProjectMutationConflictError');
    expect(source).toContain('{ status: 409 }');
    expect(source).toContain('error instanceof ProjectNotFoundOrForbiddenError');
    expect(source).not.toContain('loadProject(userId, projectId)');
  });
});
