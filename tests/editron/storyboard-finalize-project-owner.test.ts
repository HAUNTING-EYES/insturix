import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/api/services/pipeline/storyboard/[id]/finalize/route.ts'),
  'utf8',
).replaceAll('\r\n', '\n');

describe('storyboard finalize project ownership', () => {
  it('publishes timeline and finalize metadata through one revision-fenced ProjectService save', () => {
    expect(source).toContain('const finalizeSnapshot = await projectService.loadProjectForMutation(userId, project.projectId)');
    expect(source).toContain('await projectService.saveProjectWithReceipt(userId, project.projectId, {');
    expect(source).toContain('expectedRevision: finalizeSnapshot.revision');
    expect(source).toContain('sourceStoryboardId: id');
    expect(source).toContain('musicGenerationPolicy,');
    expect(source).toContain("'intelligence.audio.musicCoveragePlan': musicCoveragePlan");
    expect(source).toContain("projectUnsets: editDirectionsFailed");
    expect(source).not.toContain('projectService.saveProject(userId, project.projectId');
    expect(source).not.toContain('collection(COLLECTIONS.PROJECTS).updateOne');
  });

  it('keeps the storyboard link as a separate storyboard-owned write', () => {
    expect(source).toContain("await db.collection('storyboards').updateOne(");
    expect(source).toContain('{ $set: { projectId: project.projectId, updatedAt: new Date() } }');
  });
});
