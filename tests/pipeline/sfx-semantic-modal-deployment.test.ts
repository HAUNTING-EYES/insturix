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
    expect(source).toContain('user=1000');
    expect(source).toContain('group=1000');

    const dockerfile = await readFile(
      path.join(process.cwd(), 'Dockerfile.sfx-semantic-worker'),
      'utf8',
    );
    expect(dockerfile).toContain('--chown=1000:1000');
    expect(dockerfile).toContain('USER 1000:1000');
    expect(dockerfile).not.toContain('--chown=node:node');
  });

  it('provisions credentials transactionally without exposing plaintext', async () => {
    const [script, gitignore] = await Promise.all([
      readFile(
        path.join(process.cwd(), 'scripts/deploy-sfx-semantic-modal.ps1'),
        'utf8',
      ),
      readFile(path.join(process.cwd(), '.gitignore'), 'utf8'),
    ]);

    expect(gitignore).toContain('/.semantic-artifacts/');
    expect(script).toContain(
      "$ExpectedReceipt = '298f8b164afc63a2ca58234a04da7a7d886e9e4289dcffc070989dee8a068981'",
    );
    expect(script).toContain("$env:PYTHONUTF8 = '1'");
    expect(script).toContain("$env:PYTHONIOENCODING = 'utf-8'");
    expect(script).toContain('Assert-ImmutableBundle');
    expect(script).toContain("'proxy-tokens',");
    expect(script).toContain("'create',");
    expect(script).toContain("'Modal-Key',");
    expect(script).toContain("'Modal-Secret',");
    expect(script).toContain("'wk-[A-Za-z0-9_-]+'");
    expect(script).toContain('ConvertFrom-SecureString $securePayload');
    expect(script).toContain(
      "Remove-Item -LiteralPath $dotenvPath -Force",
    );
    expect(script).toContain("'proxy-tokens',\n          'delete',");
    expect(script).toContain("'secret',\n          'delete',");
    expect(script).toContain("'deploy',\n    '--strategy',\n    'rolling',");
    expect(script).not.toContain('Write-Output $retrievalToken');
    expect(script).not.toContain('Write-Output $proxyTokenSecret');
  });
});
