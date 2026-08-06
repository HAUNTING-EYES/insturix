import fs from 'node:fs';
import path from 'node:path';

const TARGET_MIB = 180;
const HARD_CEILING_MIB = 200;
const MIB = 1024 * 1024;
const TRACE_PATH = path.resolve(
  '.next/server/app/api/internal/workers/pipeline/audio/route.js.nft.json',
);
const FORBIDDEN_PATH_PATTERNS = [
  /@huggingface[\\/]transformers/i,
  /onnxruntime/i,
  /clap-htsat/i,
  /sfx-audio-embedding/i,
  /sfx-catalog-semantic-index/i,
  /vectors\.f32$/i,
  /[\\/]model-cache[\\/]/i,
];

function fail(message) {
  console.error(`[audio-function-size] FAIL: ${message}`);
  process.exitCode = 1;
}

function readTrace() {
  if (!fs.existsSync(TRACE_PATH)) {
    throw new Error(`Next trace does not exist: ${TRACE_PATH}`);
  }
  const parsed = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'));
  if (
    !parsed
    || typeof parsed !== 'object'
    || !Array.isArray(parsed.files)
    || parsed.files.some(file => typeof file !== 'string')
  ) {
    throw new Error('Next trace has an invalid files contract');
  }
  return parsed.files;
}

function collectFiles(tracedFiles) {
  const traceDirectory = path.dirname(TRACE_PATH);
  const routePath = TRACE_PATH.replace(/\.nft\.json$/, '');
  const absolutePaths = new Set([
    ...tracedFiles.map(file => path.resolve(traceDirectory, file)),
    routePath,
  ]);
  return [...absolutePaths].map(file => {
    if (!fs.existsSync(file)) {
      throw new Error(`Traced file does not exist: ${file}`);
    }
    const stats = fs.lstatSync(file);
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      throw new Error(`Traced path is neither a file nor a symlink: ${file}`);
    }
    return { file, bytes: stats.size };
  });
}

try {
  const files = collectFiles(readTrace());
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const totalMiB = totalBytes / MIB;
  const forbidden = files.filter(({ file }) => (
    FORBIDDEN_PATH_PATTERNS.some(pattern => pattern.test(file))
  ));
  const largest = files
    .slice()
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 5);

  console.log(
    `[audio-function-size] ${totalMiB.toFixed(2)} MiB across ${files.length} traced files`,
  );
  for (const entry of largest) {
    console.log(
      `[audio-function-size] ${(entry.bytes / MIB).toFixed(2)} MiB ${entry.file}`,
    );
  }

  if (forbidden.length > 0) {
    fail(
      `forbidden model/runtime assets entered the trace:\n${forbidden
        .map(({ file }) => `  ${file}`)
        .join('\n')}`,
    );
  }
  if (totalMiB > HARD_CEILING_MIB) {
    fail(
      `${totalMiB.toFixed(2)} MiB exceeds the ${HARD_CEILING_MIB} MiB hard ceiling`,
    );
  } else if (totalMiB > TARGET_MIB) {
    console.warn(
      `[audio-function-size] WARN: ${totalMiB.toFixed(2)} MiB exceeds the ${TARGET_MIB} MiB target`,
    );
  } else if (forbidden.length === 0) {
    console.log(
      `[audio-function-size] PASS: under the ${TARGET_MIB} MiB target with no forbidden assets`,
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
