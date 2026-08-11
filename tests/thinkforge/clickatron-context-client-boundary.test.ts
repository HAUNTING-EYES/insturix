import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Clickatron context client boundary', () => {
  it('does not import Brand Vault authority into browser handoff code', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/thinkforge/clickatron-context.ts'),
      'utf8',
    );

    expect(source).toContain('context/authoring-provenance');
    expect(source).not.toContain('context/brand-authoring-context');
  });
});
