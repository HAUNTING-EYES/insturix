import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ExportCompletePanel Editron completion contract', () => {
  it('does not present Clickatron as a ready handoff inside the Editron AI-video wrap screen', () => {
    const source = read('components/dashboard/ThinkForge/export/ExportCompletePanel.tsx');

    expect(source).toContain('const isEditronAiVideoExport = Boolean(videosGenerated || storyboardId || projectId);');
    expect(source).toContain('const showClickatronHandoff = !isEditronAiVideoExport && Boolean(clickatronHandoffState);');
    expect(source).toContain('{showClickatronHandoff && (');
    expect(source).toContain('<ClickatronHandoffPanel');
    expect(source).toContain('void handleCreateClickatronSession();');
    expect(source).toContain('Open in Editor');
  });
});