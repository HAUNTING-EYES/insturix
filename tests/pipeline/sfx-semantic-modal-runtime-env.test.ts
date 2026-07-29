import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const RECEIPT_ENV = 'SFX_SEMANTIC_BUNDLE_RECEIPT_SHA256';
const VALID_RECEIPT = 'a'.repeat(64);
const PYTHON_EXECUTABLE = process.platform === 'win32' ? 'python' : 'python3';
const MODULE_PATH = path.join(
  process.cwd(),
  'modal/sfx_semantic_worker.py',
);

describe('semantic SFX Modal runtime receipt environment', () => {
  it('injects the deploy receipt into the function environment', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(MODULE_PATH, 'utf8'),
    );

    expect(source).toContain('bundle_receipt_environment = modal.Secret.from_dict(');
    expect(source).toContain('{BUNDLE_RECEIPT_ENV_NAME: BUNDLE_RECEIPT_SHA256}');
    expect(source).toContain(
      'secrets=[worker_secret, bundle_receipt_environment]',
    );
  });

  it.each([
    ['missing', undefined],
    ['malformed', VALID_RECEIPT.toUpperCase()],
  ])('fails loud when the receipt is %s', (_label, receipt) => {
    const env = { ...process.env };
    if (receipt) env[RECEIPT_ENV] = receipt;
    else delete env[RECEIPT_ENV];

    const result = spawnSync(PYTHON_EXECUTABLE, [MODULE_PATH], {
      env,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `${RECEIPT_ENV} must be an exact lowercase SHA-256 digest`,
    );
  });

  it('loads with an exact lowercase receipt', () => {
    const result = spawnSync(PYTHON_EXECUTABLE, [MODULE_PATH], {
      env: { ...process.env, [RECEIPT_ENV]: VALID_RECEIPT },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
