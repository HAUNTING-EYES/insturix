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

    expect(hookSource).toContain('uploadMediaFiles(selectedFiles, { uploadBatchIntake: options })');
    expect(hookSource).toContain('Batch is ready for multi-source project assembly');
    expect(hookSource).toContain('startMany');
    expect(flowSource).toContain('setPendingFootageFiles(files)');
    expect(flowSource).toContain('AutoEditDialog');
    expect(flowSource).toContain('FootageBatchIntakeDialog');
    expect(flowSource).not.toContain('footage.startMany(files);');
    expect(batchDialogSource).toContain('What should this become?');
    expect(batchDialogSource).toContain('Optional script / outline');
  });
});