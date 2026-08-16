import { readdirSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LEGACY_WRITER_IMPORT = /script-(?:draft|author|contract|outline|section|refinement)-agent/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('ThinkForge writer path authority', () => {
  it('does not expose the quarantined legacy writer chain from the public agent barrel', () => {
    const source = readFileSync(join(REPOSITORY_ROOT, 'lib/thinkforge/agents/index.ts'), 'utf8');

    expect(source).not.toMatch(LEGACY_WRITER_IMPORT);
    expect(source).toContain("from './post-writer-agent'");
    expect(source).toContain("from './script-writer-agent'");
  });

  it('keeps production ThinkForge and CalOS generation on the canonical writers', () => {
    const productionRoots = [
      'app/api/services/thinkforge',
      'lib/thinkforge/services',
      'lib/calos/generate',
    ];
    const violations = productionRoots.flatMap((relativeRoot) => sourceFiles(join(REPOSITORY_ROOT, relativeRoot)))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return LEGACY_WRITER_IMPORT.test(source) ? [path.slice(REPOSITORY_ROOT.length)] : [];
      });

    expect(violations).toEqual([]);
  });
});
