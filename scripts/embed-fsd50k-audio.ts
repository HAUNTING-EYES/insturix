import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  analyzeFsd50kSfxEmbeddings,
  createPinnedSfxClapRuntime,
  DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
} from '../lib/pipeline/sfx-audio-embedding';

interface CliOptions {
  sampleRoot: string;
  inputPath: string;
  outputPath: string;
  cacheDirectory: string;
  duplicateThreshold: number;
  localFilesOnly: boolean;
}

export async function runFsd50kEmbeddingScreen(options: CliOptions): Promise<void> {
  const sampleReport = JSON.parse(await readFile(options.inputPath, 'utf8')) as unknown;
  const runtime = await createPinnedSfxClapRuntime({
    cacheDirectory: options.cacheDirectory,
    localFilesOnly: options.localFilesOnly,
  });
  try {
    const report = await analyzeFsd50kSfxEmbeddings({
      sampleRoot: options.sampleRoot,
      sampleReport,
      duplicateSimilarityThreshold: options.duplicateThreshold,
    }, { runtime });
    await atomicWrite(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
      outputPath: path.resolve(options.outputPath),
      model: `${report.model.modelId}@${report.model.revision}`,
      localFilesOnly: options.localFilesOnly,
      embedded: report.counts.embedded,
      roleAgreement: report.counts.roleAgreement,
      clusters: report.counts.clusters,
      duplicateCandidateClusters: report.counts.duplicateCandidateClusters,
      duplicateCandidateEntries: report.counts.duplicateCandidateEntries,
      representatives: report.counts.representatives,
      analysisDigestSha256: report.analysisDigestSha256,
      nextGate: 'listen-to-ranked-representatives-before-catalog-publication',
    }, null, 2));
  } finally {
    await runtime.dispose?.();
  }
}

function readCliOptions(argv: string[]): CliOptions {
  const sampleRoot = path.resolve(
    'tmp/sfx-harvest/fsd50k-v1/p7f2-conditioned-sample-v2',
  );
  const options: CliOptions = {
    sampleRoot,
    inputPath: path.join(sampleRoot, 'sample-report.json'),
    outputPath: path.join(sampleRoot, 'clap-screening-report.json'),
    cacheDirectory: path.resolve('tmp/model-cache/clap-htsat-unfused-c28f288'),
    duplicateThreshold: DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
    localFilesOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--sample-root' && next) {
      options.sampleRoot = path.resolve(next);
      options.inputPath = path.join(options.sampleRoot, 'sample-report.json');
      options.outputPath = path.join(options.sampleRoot, 'clap-screening-report.json');
      index += 1;
    } else if (argument === '--input' && next) {
      options.inputPath = path.resolve(next);
      index += 1;
    } else if (argument === '--out' && next) {
      options.outputPath = path.resolve(next);
      index += 1;
    } else if (argument === '--cache-dir' && next) {
      options.cacheDirectory = path.resolve(next);
      index += 1;
    } else if (argument === '--duplicate-threshold' && next) {
      options.duplicateThreshold = parseThreshold(next);
      index += 1;
    } else if (argument === '--local-only') {
      options.localFilesOnly = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

function parseThreshold(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error('--duplicate-threshold must be greater than 0 and at most 1');
  }
  return parsed;
}

async function atomicWrite(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, value);
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFsd50kEmbeddingScreen(readCliOptions(process.argv.slice(2))).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
