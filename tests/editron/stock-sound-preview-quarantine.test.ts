import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOUND_BROWSER_PATHS = [
  'components/editron/editor/version-7.0.0/components/overlays/sounds/sounds-panel.tsx',
  'components/editron/editor/version-7.0.0/v2/shell/v2-sound-browse.tsx',
];

describe('stock sound preview quarantine', () => {
  it.each(SOUND_BROWSER_PATHS)('keeps %s audition-only', (relativePath) => {
    const source = readFileSync(relativePath, 'utf8');

    expect(source).toContain('Preview only');
    expect(source).toContain('new Audio');
    expect(source).toContain('.play()');
    expect(source).not.toContain('/api/services/editron/assets/create-public');
    expect(source).not.toContain('addOverlay(');
  });

  it('does not allow the bundled preview provider through public asset creation', () => {
    const source = readFileSync(
      'app/api/services/editron/assets/create-public/route.ts',
      'utf8',
    );

    expect(source).not.toContain('rwxrdxvxndclnqvznxfj.supabase.co');
    expect(source).not.toContain('/storage/v1/object/public/sounds/');
    expect(source).not.toContain("'audio'");
  });
});
