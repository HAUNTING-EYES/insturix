import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const VERIFIER_PATH = path.resolve('workers/sfx-semantic/verify-bundle.mjs');
const MODEL_REVISION = 'c28f2883575e590e04d3146ff0713c2448d691ba';
const MODEL_ROOT = `model-cache/Xenova/clap-htsat-unfused/${MODEL_REVISION}`;
const REVIEWED_BUNDLE_RECEIPT =
  '3a95cb2bd8af3b5239f433dd50186012662025f345f1b1e6920c584e18f2232c';
const LEGACY_BUNDLE_RECEIPT =
  '298f8b164afc63a2ca58234a04da7a7d886e9e4289dcffc070989dee8a068981';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('semantic SFX Modal deployment contract', () => {
  it('keeps the canary private, bounded, scale-to-zero, and receipt-bound', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'modal/sfx_semantic_worker.py'),
      'utf8',
    );

    expect(source).toContain('APP_NAME = "editron-sfx-semantic-canary"');
    expect(source).toContain(
      'BUNDLE_RECEIPT_ENV_NAME = "SFX_SEMANTIC_BUNDLE_RECEIPT_SHA256"',
    );
    expect(source).toContain(
      'os.environ.get(BUNDLE_RECEIPT_ENV_NAME, "")',
    );
    expect(source).toContain('re.fullmatch(r"[0-9a-f]{64}"');
    expect(source).not.toContain(REVIEWED_BUNDLE_RECEIPT);
    expect(source).not.toContain(LEGACY_BUNDLE_RECEIPT);
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

  it('provisions credentials transactionally and pins the reviewed bundle', async () => {
    const [script, gitignore] = await Promise.all([
      readFile(
        path.join(process.cwd(), 'scripts/deploy-sfx-semantic-modal.ps1'),
        'utf8',
      ),
      readFile(path.join(process.cwd(), '.gitignore'), 'utf8'),
    ]);

    expect(gitignore).toContain('/.semantic-artifacts/');
    expect(script).toContain(`$ExpectedReceipt = '${REVIEWED_BUNDLE_RECEIPT}'`);
    expect(script).not.toContain(LEGACY_BUNDLE_RECEIPT);
    expect(script).toContain(
      "$BundleReceiptEnvName = 'SFX_SEMANTIC_BUNDLE_RECEIPT_SHA256'",
    );
    expect(script).toContain('[switch]$VerifyBundle');
    expect(script).toContain("$env:PYTHONUTF8 = '1'");
    expect(script).toContain("$env:PYTHONIOENCODING = 'utf-8'");
    expect(script).toContain('Assert-ImmutableBundle');
    expect(script).toContain('[Environment]::SetEnvironmentVariable(');
    expect(script).toContain('$previousBundleReceipt');
    expect(script).toContain("'proxy-tokens',");
    expect(script).toContain("'Modal-Key',");
    expect(script).toContain("'Modal-Secret',");
    expect(script).toContain("'wk-[A-Za-z0-9_-]+'");
    expect(script).toContain('ConvertFrom-SecureString $securePayload');
    expect(script).toContain(
      'Remove-Item -LiteralPath $dotenvPath -Force',
    );
    expect(script).toContain("'proxy-tokens',\n          'delete',");
    expect(script).toContain("'secret',\n          'delete',");
    expect(script).toContain("'deploy',");
    expect(script).toContain("'--strategy',");
    expect(script).toContain("'rolling',");
    expect(script).not.toContain('Write-Output $retrievalToken');
    expect(script).not.toContain('Write-Output $proxyTokenSecret');
  });
});

describe('semantic SFX container bundle verifier', () => {
  it('preserves byte-compatible v1 bundle receipts for rollback', async () => {
    const fixture = await makeBundleFixture('legacy');
    const receiptDigest = await createReceipt(fixture.root);
    const receipt = JSON.parse(
      await readFile(path.join(fixture.root, 'bundle-receipt.json'), 'utf8'),
    );

    expect(receipt).toEqual(expect.objectContaining({
      version: 'editron-sfx-semantic-container-bundle-v1',
      source: {
        promotedManifestDigestSha256: fixture.manifestDigestSha256,
        semanticReleaseReceiptDigestSha256:
          fixture.semanticReleaseReceiptDigestSha256,
      },
    }));
    expect(await verifyReceipt(fixture.root, receiptDigest)).toBe(receiptDigest);
  });

  it('creates and verifies a manifest-bound reviewed v2 receipt', async () => {
    const fixture = await makeBundleFixture('reviewed');
    const receiptDigest = await createReceipt(fixture.root);
    const receipt = JSON.parse(
      await readFile(path.join(fixture.root, 'bundle-receipt.json'), 'utf8'),
    );

    expect(receipt).toEqual(expect.objectContaining({
      version: 'editron-sfx-semantic-container-bundle-v2',
      source: {
        catalogManifestDigestSha256: fixture.manifestDigestSha256,
        catalogManifestFileSha256: fixture.manifestFileSha256,
        semanticReleaseReceiptVersion:
          'editron-sfx-catalog-reviewed-semantic-release-receipt-v2',
        semanticReleaseReceiptDigestSha256:
          fixture.semanticReleaseReceiptDigestSha256,
      },
    }));
    expect(await verifyReceipt(fixture.root, receiptDigest)).toBe(receiptDigest);
  });

  it('rejects nested artifact tampering after a receipt is pinned', async () => {
    const fixture = await makeBundleFixture('reviewed');
    const receiptDigest = await createReceipt(fixture.root);
    await writeFile(
      path.join(fixture.root, 'semantic-release', 'vectors.f32'),
      Buffer.from('tampered-vectors'),
    );

    await expect(verifyReceipt(fixture.root, receiptDigest)).rejects.toThrow();
  });

  it('rejects a reviewed release whose manifest binding is stale', async () => {
    const fixture = await makeBundleFixture('reviewed');
    const manifestPath = path.join(fixture.root, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.generatedAt = '2026-07-29T19:00:00.000Z';
    await writeJson(manifestPath, manifest);

    await expect(createReceipt(fixture.root)).rejects.toThrow();
  });
});

async function makeBundleFixture(
  version: 'legacy' | 'reviewed',
): Promise<{
  root: string;
  manifestDigestSha256: string;
  manifestFileSha256: string;
  semanticReleaseReceiptDigestSha256: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-sfx-bundle-'));
  temporaryDirectories.push(root);
  const manifest = {
    version: 'sfx-catalog-v1',
    generatedAt: '2026-07-29T18:00:00.000Z',
    entries: [],
  };
  const manifestBytes = stableJson(manifest);
  const metadataBytes = stableJson({
    version: version === 'legacy'
      ? 'editron-sfx-catalog-semantic-release-v1'
      : 'editron-sfx-catalog-reviewed-semantic-release-v2',
  });
  const vectorsBytes = Buffer.from('fixture-vectors');
  const manifestDigestSha256 = hashJson(manifest);
  const semanticReleaseReceiptBody = {
    version: version === 'legacy'
      ? 'editron-sfx-catalog-semantic-release-receipt-v1'
      : 'editron-sfx-catalog-reviewed-semantic-release-receipt-v2',
    source: version === 'legacy'
      ? { promotedManifestDigestSha256: manifestDigestSha256 }
      : { runtimeManifestDigestSha256: manifestDigestSha256 },
    artifacts: {
      ...(version === 'reviewed'
        ? {
          manifest: {
            filename: 'manifest.json',
            byteLength: manifestBytes.byteLength,
            sha256: hashBuffer(manifestBytes),
          },
        }
        : {}),
      metadata: {
        filename: version === 'legacy'
          ? 'metadata.json'
          : 'semantic-release/metadata.json',
        byteLength: metadataBytes.byteLength,
        sha256: hashBuffer(metadataBytes),
      },
      vectors: {
        filename: 'vectors.f32',
        byteLength: vectorsBytes.byteLength,
        sha256: hashBuffer(vectorsBytes),
      },
    },
  };
  const semanticReleaseReceiptDigestSha256 = hashJson(
    semanticReleaseReceiptBody,
  );
  const semanticReleaseReceipt = {
    ...semanticReleaseReceiptBody,
    receiptDigestSha256: semanticReleaseReceiptDigestSha256,
  };

  await Promise.all([
    writeFile(path.join(root, 'manifest.json'), manifestBytes),
    writeFixtureFile(root, `${MODEL_ROOT}/config.json`),
    writeFixtureFile(root, `${MODEL_ROOT}/onnx/audio_model_quantized.onnx`),
    writeFixtureFile(root, `${MODEL_ROOT}/onnx/text_model_quantized.onnx`),
    writeFixtureFile(root, `${MODEL_ROOT}/preprocessor_config.json`),
    writeFixtureFile(root, `${MODEL_ROOT}/tokenizer.json`),
    writeFixtureFile(root, `${MODEL_ROOT}/tokenizer_config.json`),
    writeFileEnsured(
      path.join(root, 'semantic-release', 'metadata.json'),
      metadataBytes,
    ),
    writeFileEnsured(
      path.join(root, 'semantic-release', 'vectors.f32'),
      vectorsBytes,
    ),
    writeFileEnsured(
      path.join(root, 'semantic-release', 'semantic-release-receipt.json'),
      stableJson(semanticReleaseReceipt),
    ),
  ]);
  return {
    root,
    manifestDigestSha256,
    manifestFileSha256: hashBuffer(manifestBytes),
    semanticReleaseReceiptDigestSha256,
  };
}

async function createReceipt(root: string): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [VERIFIER_PATH, 'create', root],
    { encoding: 'utf8' },
  );
  return stdout.trim();
}

async function verifyReceipt(root: string, digest: string): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [VERIFIER_PATH, 'verify', root, digest],
    { encoding: 'utf8' },
  );
  return stdout.trim();
}

async function writeFixtureFile(
  root: string,
  relativePath: string,
): Promise<void> {
  await writeFileEnsured(
    path.join(root, ...relativePath.split('/')),
    Buffer.from(`fixture:${relativePath}`),
  );
}

async function writeFileEnsured(filePath: string, value: Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, stableJson(value));
}

function stableJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function hashJson(value: unknown): string {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
