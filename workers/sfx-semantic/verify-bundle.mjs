import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const LEGACY_BUNDLE_RECEIPT_VERSION = 'editron-sfx-semantic-container-bundle-v1';
const REVIEWED_BUNDLE_RECEIPT_VERSION = 'editron-sfx-semantic-container-bundle-v2';
const LEGACY_RELEASE_RECEIPT_VERSION =
  'editron-sfx-catalog-semantic-release-receipt-v1';
const REVIEWED_RELEASE_RECEIPT_VERSION =
  'editron-sfx-catalog-reviewed-semantic-release-receipt-v2';
const RECEIPT_FILENAME = 'bundle-receipt.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_RECEIPT_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
const MODEL_ID = 'Xenova/clap-htsat-unfused';
const MODEL_REVISION = 'c28f2883575e590e04d3146ff0713c2448d691ba';
const MODEL_ROOT = `model-cache/Xenova/clap-htsat-unfused/${MODEL_REVISION}`;
const REQUIRED_FILES = [
  'manifest.json',
  'semantic-release/metadata.json',
  'semantic-release/semantic-release-receipt.json',
  'semantic-release/vectors.f32',
  `${MODEL_ROOT}/config.json`,
  `${MODEL_ROOT}/onnx/audio_model_quantized.onnx`,
  `${MODEL_ROOT}/onnx/text_model_quantized.onnx`,
  `${MODEL_ROOT}/preprocessor_config.json`,
  `${MODEL_ROOT}/tokenizer.json`,
  `${MODEL_ROOT}/tokenizer_config.json`,
].sort();

async function main() {
  const [command, bundleDirectory, expectedReceiptDigest] = process.argv.slice(2);
  if (!['create', 'verify'].includes(command) || !bundleDirectory) {
    throw new Error(
      'Usage: verify-bundle.mjs <create|verify> <bundle-directory> [expected-receipt-sha256]',
    );
  }

  const root = await resolveDirectory(bundleDirectory);
  const receiptPath = path.join(root, RECEIPT_FILENAME);
  if (command === 'create') {
    const receipt = await buildReceipt(root);
    const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeFile(receiptPath, encoded, { encoding: 'utf8', flag: 'wx' });
    process.stdout.write(`${hashBuffer(Buffer.from(encoded))}\n`);
    return;
  }

  if (!SHA256_PATTERN.test(expectedReceiptDigest ?? '')) {
    throw new Error('Expected bundle receipt SHA-256 is required');
  }
  const receiptBytes = await readBoundedFile(receiptPath, MAX_RECEIPT_BYTES);
  if (hashBuffer(receiptBytes) !== expectedReceiptDigest) {
    throw new Error('Bundle receipt SHA-256 does not match the trusted build input');
  }
  const suppliedReceipt = parseJson(receiptBytes, RECEIPT_FILENAME);
  const expectedReceipt = await buildReceipt(root);
  if (JSON.stringify(suppliedReceipt) !== JSON.stringify(expectedReceipt)) {
    throw new Error('Bundle receipt does not match the staged artifact set');
  }
  process.stdout.write(`${expectedReceiptDigest}\n`);
}

async function buildReceipt(root) {
  const filePaths = await listRegularFiles(root);
  const artifactPaths = filePaths
    .filter(filePath => filePath !== RECEIPT_FILENAME)
    .sort();
  if (JSON.stringify(artifactPaths) !== JSON.stringify(REQUIRED_FILES)) {
    throw new Error('Bundle must contain exactly the pinned manifest, release, and CLAP files');
  }

  let totalBytes = 0;
  const files = [];
  for (const relativePath of artifactPaths) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stats = await lstat(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Bundle artifact is not a regular file: ${relativePath}`);
    }
    totalBytes += stats.size;
    if (totalBytes > MAX_BUNDLE_BYTES) {
      throw new Error('Bundle exceeds the 512 MiB deployment artifact limit');
    }
    files.push({
      path: relativePath,
      byteLength: stats.size,
      sha256: await hashFile(absolutePath),
    });
  }

  const manifestBytes = await readBoundedFile(
    path.join(root, 'manifest.json'),
    MAX_MANIFEST_BYTES,
  );
  const metadataBytes = await readBoundedFile(
    path.join(root, 'semantic-release', 'metadata.json'),
    MAX_MANIFEST_BYTES,
  );
  const vectorsBytes = await readBoundedFile(
    path.join(root, 'semantic-release', 'vectors.f32'),
    MAX_BUNDLE_BYTES,
  );
  const semanticReleaseReceiptBytes = await readBoundedFile(
    path.join(root, 'semantic-release', 'semantic-release-receipt.json'),
    MAX_RECEIPT_BYTES,
  );
  const manifest = parseJson(manifestBytes, 'manifest.json');
  const semanticReleaseReceipt = parseJson(
    semanticReleaseReceiptBytes,
    'semantic-release/semantic-release-receipt.json',
  );
  const catalogManifestDigestSha256 = hashJson(manifest);
  const semanticReleaseReceiptDigestSha256 =
    semanticReleaseReceipt.receiptDigestSha256;
  if (
    !SHA256_PATTERN.test(semanticReleaseReceiptDigestSha256 ?? '')
    || hashJson(withoutKey(semanticReleaseReceipt, 'receiptDigestSha256'))
      !== semanticReleaseReceiptDigestSha256
  ) {
    throw new Error('Semantic release receipt digest is invalid');
  }
  assertReleaseArtifact(
    semanticReleaseReceipt?.artifacts?.metadata,
    metadataBytes,
    semanticReleaseReceipt.version === REVIEWED_RELEASE_RECEIPT_VERSION
      ? 'semantic-release/metadata.json'
      : 'metadata.json',
    'metadata',
  );
  assertReleaseArtifact(
    semanticReleaseReceipt?.artifacts?.vectors,
    vectorsBytes,
    'vectors.f32',
    'vectors',
  );

  const commonReceipt = {
    model: {
      modelId: MODEL_ID,
      revision: MODEL_REVISION,
      cachePath: MODEL_ROOT,
    },
    totalBytes,
    files,
  };
  if (semanticReleaseReceipt.version === LEGACY_RELEASE_RECEIPT_VERSION) {
    if (
      semanticReleaseReceipt?.source?.promotedManifestDigestSha256
      !== catalogManifestDigestSha256
    ) {
      throw new Error('Legacy semantic release is not bound to the promoted manifest');
    }
    return {
      version: LEGACY_BUNDLE_RECEIPT_VERSION,
      model: commonReceipt.model,
      source: {
        promotedManifestDigestSha256: catalogManifestDigestSha256,
        semanticReleaseReceiptDigestSha256,
      },
      totalBytes: commonReceipt.totalBytes,
      files: commonReceipt.files,
    };
  }
  if (semanticReleaseReceipt.version === REVIEWED_RELEASE_RECEIPT_VERSION) {
    if (
      semanticReleaseReceipt?.source?.runtimeManifestDigestSha256
        !== catalogManifestDigestSha256
      || semanticReleaseReceipt?.artifacts?.manifest?.filename !== 'manifest.json'
      || semanticReleaseReceipt.artifacts.manifest.byteLength !== manifestBytes.byteLength
      || semanticReleaseReceipt.artifacts.manifest.sha256 !== hashBuffer(manifestBytes)
    ) {
      throw new Error('Reviewed semantic release is not bound to the runtime manifest');
    }
    return {
      version: REVIEWED_BUNDLE_RECEIPT_VERSION,
      model: commonReceipt.model,
      source: {
        catalogManifestDigestSha256,
        catalogManifestFileSha256: hashBuffer(manifestBytes),
        semanticReleaseReceiptVersion: REVIEWED_RELEASE_RECEIPT_VERSION,
        semanticReleaseReceiptDigestSha256,
      },
      totalBytes: commonReceipt.totalBytes,
      files: commonReceipt.files,
    };
  }
  throw new Error(`Unsupported semantic release receipt version: ${
    semanticReleaseReceipt.version ?? 'missing'
  }`);
}

async function resolveDirectory(value) {
  const resolved = path.resolve(value);
  const stats = await lstat(resolved);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('Bundle path must be a real directory');
  }
  return realpath(resolved);
}

async function listRegularFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Bundle contains a symbolic link: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await listRegularFiles(root, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Bundle contains a non-regular entry: ${absolutePath}`);
    }
    files.push(path.relative(root, absolutePath).split(path.sep).join('/'));
  }
  return files;
}

async function readBoundedFile(filePath, maxBytes) {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maxBytes) {
    throw new Error(`Invalid bounded JSON artifact: ${filePath}`);
  }
  return readFile(filePath);
}

function assertReleaseArtifact(artifact, bytes, expectedFilename, label) {
  if (
    artifact?.filename !== expectedFilename
    || artifact?.byteLength !== bytes.byteLength
    || artifact?.sha256 !== hashBuffer(bytes)
  ) {
    throw new Error(`Semantic release ${label} artifact is invalid`);
  }
}

function parseJson(bytes, label) {
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected an object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}`, { cause: error });
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function hashBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value) {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

function withoutKey(value, key) {
  const output = { ...value };
  delete output[key];
  return output;
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
