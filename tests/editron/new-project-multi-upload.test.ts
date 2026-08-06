import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { collectFootageFiles } from '@/components/editron/project/footage-selection';

function fakeFile(name: string, type: string): File {
  return { name, type } as File;
}

describe('new project multi-upload intake', () => {
  it('keeps all selected video and image files instead of collapsing to the first file', () => {
    const selection = collectFootageFiles([
      fakeFile('a.mp4', 'video/mp4'),
      fakeFile('b.mov', 'video/quicktime'),
      fakeFile('ref.png', 'image/png'),
      fakeFile('notes.txt', 'text/plain'),
    ]);

    expect(selection.files.map((file) => file.name)).toEqual(['a.mp4', 'b.mov', 'ref.png']);
    expect(selection.rejected).toEqual([{ name: 'notes.txt', type: 'text/plain' }]);
  });

  it('wires the new UI file input and drop path to a multi-file handler', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/editron/project/new-project-flow.tsx'),
      'utf8',
    );

    expect(source).toContain('multiple');
    expect(source).toContain('accept="video/*,image/*"');
    expect(source).toContain('onFootageFiles(e.target.files)');
    expect(source).toContain('onFootageFiles(e.dataTransfer.files)');
    expect(source).not.toContain('e.target.files?.[0]');
    expect(source).not.toContain('e.dataTransfer.files?.[0]');
  });

  it('does not silently auto-edit the first file when multiple files are selected', () => {
    const hookSource = readFileSync(
      join(process.cwd(), 'hooks/editron/use-footage-auto-edit.ts'),
      'utf8',
    );
    const flowSource = readFileSync(
      join(process.cwd(), 'components/editron/project/new-project-flow.tsx'),
      'utf8',
    );
    const batchDialogSource = readFileSync(
      join(process.cwd(), 'components/editron/project/footage-batch-intake-dialog.tsx'),
      'utf8',
    );

    expect(hookSource).toContain('sourceMediaRightsAttestation,');
    expect(hookSource).toContain('uploadBatchIntake: editOptions');
    expect(hookSource).toContain('sourceMediaRightsAttestation,');
    expect(hookSource).toContain('createProjectFromMediaUploadBatch(result.uploadBatchId');
    expect(hookSource).toContain('Starting durable multi-source analysis');
    expect(hookSource).not.toContain('getMediaUploadBatchStatus');
    expect(hookSource).not.toContain('setTimeout');
    expect(hookSource).toContain('/dashboard/editron/auto-edit/');
    expect(hookSource).toContain('startMany');
    expect(flowSource).toContain('setPendingFootageFiles(files)');
    expect(flowSource).toContain('AutoEditDialog');
    expect(flowSource).toContain('FootageBatchIntakeDialog');
    expect(flowSource).not.toContain('footage.startMany(files);');
    expect(batchDialogSource).toContain('What should this become?');
    expect(batchDialogSource).toContain('Optional script / outline');
    expect(batchDialogSource).toContain('EditorialPreferenceControls');
    expect(batchDialogSource).toContain('normalizeEditorialPreferences');
    expect(batchDialogSource).not.toContain('musicPreference');
  });

  it('requires the same explicit source-media rights confirmation in both intake paths', () => {
    const singleDialogSource = readFileSync(
      join(process.cwd(), 'components/editron/project/auto-edit-dialog.tsx'),
      'utf8',
    );
    const batchDialogSource = readFileSync(
      join(process.cwd(), 'components/editron/project/footage-batch-intake-dialog.tsx'),
      'utf8',
    );
    const rightsControlSource = readFileSync(
      join(process.cwd(), 'components/editron/project/source-media-rights-control.tsx'),
      'utf8',
    );

    expect(singleDialogSource).toContain('<SourceMediaRightsControl');
    expect(singleDialogSource).toContain('disabled={!rightsAttested}');
    expect(singleDialogSource).toContain('sourceMediaRightsAttestation');
    expect(batchDialogSource).toContain('<SourceMediaRightsControl');
    expect(batchDialogSource).toContain('disabled={files.length === 0 || !rightsAttested}');
    expect(batchDialogSource).toContain('sourceMediaRightsAttestation');
    expect(rightsControlSource).toContain('I own this media or have permission to use it');
    expect(rightsControlSource).toContain('including any embedded audio');
  });

  it('carries rights consent to media registration without leaking it into creative intake', () => {
    const hookSource = readFileSync(
      join(process.cwd(), 'hooks/editron/use-footage-auto-edit.ts'),
      'utf8',
    );
    const uploadSource = readFileSync(
      join(process.cwd(), 'components/editron/editor/version-7.0.0/utils/media-upload.ts'),
      'utf8',
    );
    const fallbackSource = readFileSync(
      join(process.cwd(), 'components/editron/project/project-dashboard.tsx'),
      'utf8',
    );
    const requestBuilderSource = readFileSync(
      join(process.cwd(), 'components/editron/project/auto-edit-request.ts'),
      'utf8',
    );

    expect(hookSource).toContain('sourceMediaRightsAttestation,');
    expect(uploadSource).toContain('sourceMediaRightsAttestation: options.sourceMediaRightsAttestation');
    expect(fallbackSource).toContain('sourceMediaRightsAttestation: options.sourceMediaRightsAttestation');
    expect(requestBuilderSource).not.toContain("'sourceMediaRightsAttestation'");
  });
});
