import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('semantic SFX Modal deployment contract', () => {
  it('keeps the canary immutable, private, bounded, and scale-to-zero', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'modal/sfx_semantic_worker.py'),
      'utf8',
    );

    expect(source).toContain('APP_NAME = "editron-sfx-semantic-canary"');
    expect(source).toContain(
      '"298f8b164afc63a2ca58234a04da7a7d886e9e4289dcffc070989dee8a068981"',
    );
    expect(source).toContain('modal.Image.from_dockerfile(');
    expect(source).toContain('modal.FilePatternMatcher.from_file(DOCKERIGNORE)');
    expect(source).toContain(
      'required_keys=["SFX_SEMANTIC_RETRIEVAL_TOKEN"]',
    );
    expect(source).toContain('requires_proxy_auth=True');
    expect(source).toContain('min_containers=0');
    expect(source).toContain('max_containers=3');
    expect(source).toContain('memory=2048');
    expect(source).toContain('cpu=2.0');
    expect(source).toContain(
      '@modal.concurrent(max_inputs=WORKER_CONCURRENCY, target_inputs=2)',
    );
    expect(source).not.toContain('unauthenticated=True');
    expect(source).not.toContain('min_containers=1');
  });
});
