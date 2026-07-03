import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('ThinkForge Export to Editron dialog close contract', () => {
  it('keeps the dialog close button above the film wrapper and only resets on close', () => {
    const source = read('components/dashboard/ThinkForge/export/ExportToEditronDialog.tsx');

    expect(source).toContain('const handleDialogOpenChange = React.useCallback((nextOpen: boolean) => {');
    expect(source).toContain('if (!nextOpen)');
    expect(source).toContain('<Dialog open={open} onOpenChange={handleDialogOpenChange}>');
    expect(source).not.toContain('<Dialog open={open} onOpenChange={handleClose}>');
    expect(source).toContain('[&>button:last-child]:z-30');
    expect(source).toContain('zIndex: 10');
  });
});
