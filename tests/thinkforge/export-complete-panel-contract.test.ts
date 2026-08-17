import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ExportCompletePanel Editron completion contract', () => {
  it('does not present Clickatron as a ready handoff inside the Editron AI-video wrap screen', () => {
    const source = read('components/dashboard/ThinkForge/export/ExportCompletePanel.tsx');

    expect(source).toContain('const isEditronAiVideoExport = Boolean(videosGenerated || storyboardId);');
    expect(source).toContain('const showClickatronHandoff = !projectId && !isEditronAiVideoExport && Boolean(clickatronHandoffState);');
    expect(source).not.toContain('Boolean(videosGenerated || storyboardId || projectId)');
    expect(source).toContain('DRAFT IMPORT');
    expect(source).toContain('scriptImportPreflight');
    expect(source).toContain('Import preflight verified');
    expect(source).toContain('Source-session project matched');
    expect(source).toContain('0 credits');
    expect(source).toContain('{projectId && <button');
    expect(source).toContain('{showClickatronHandoff && (');
    expect(source).toContain('<ClickatronHandoffPanel');
    expect(source).toContain('void handleCreateClickatronSession();');
    expect(source).toContain('Open in Editor');
  });

  it('keeps failed production storyboard paths from silently falling through to draft import', () => {
    const source = read('components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts');

    expect(source).toContain('brandId: sourceBrandId || undefined');
    expect(source).toContain('throw new Error(errorMsg);');
    expect(source).toContain('setStep(sbId ? "reviewing-storyboard" : "configure");');
    expect(source).toContain('importMode: "draft-script-import"');
    expect(source).toContain('dryRun: true');
    expect(source.match(/productionManifest: productionManifest \|\| undefined/g)).toHaveLength(3);
    expect(source).toContain('Cannot preflight Editron import: ThinkForge session id is missing.');
    expect(source).toContain('preflightData.creditsDeducted !== 0');
    expect(source).toContain('preflightData.writeOperationsSkipped !== true');
    expect(source).not.toContain('Storyboard generation timed out. Continuing with what was generated.');
  });
});
