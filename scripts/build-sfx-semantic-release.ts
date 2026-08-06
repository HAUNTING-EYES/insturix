import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPinnedSfxClapRuntime,
  SfxEmbeddingError,
} from '../lib/pipeline/sfx-audio-embedding';
import {
  buildSfxCatalogSemanticRelease,
  SfxCatalogSemanticReleaseError,
} from '../lib/pipeline/sfx-catalog-semantic-release';

interface CliOptions {
  aggregateDirectory: string;
  promotionDirectory: string;
  outputDirectory: string;
  cacheDirectory: string;
  workingDirectory?: string;
}

export async function runSfxSemanticRelease(options: CliOptions): Promise<void> {
  const runtime = await createPinnedSfxClapRuntime({
    cacheDirectory: options.cacheDirectory,
    localFilesOnly: true,
  });
  try {
    const result = await buildSfxCatalogSemanticRelease({
      aggregateDirectory: options.aggregateDirectory,
      promotionDirectory: options.promotionDirectory,
      outputDirectory: options.outputDirectory,
      ...(options.workingDirectory
        ? { workingDirectory: options.workingDirectory }
        : {}),
      onProgress: progress => {
        console.log(JSON.stringify({
          event: 'sfx-semantic-release-progress',
          ...progress,
        }));
      },
    }, { runtime });
    console.log(JSON.stringify({
      event: 'sfx-semantic-release-complete',
      localFilesOnly: true,
      outputDirectory: result.outputDirectory,
      workingDirectory: result.workingDirectory,
      metadataPath: result.metadataPath,
      vectorsPath: result.vectorsPath,
      receiptPath: result.receiptPath,
      model: `${result.metadata.model.modelId}@${result.metadata.model.revision}`,
      counts: result.receipt.counts,
      vectorsSha256: result.receipt.artifacts.vectors.sha256,
      receiptDigestSha256: result.receipt.receiptDigestSha256,
    }, null, 2));
  } finally {
    await runtime.dispose?.();
  }
}

function readCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--aggregate-dir',
    '--promotion-dir',
    '--out-dir',
    '--work-dir',
    '--model-cache',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const separator = argument.indexOf('=');
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    if (!allowed.has(flag)) {
      throw new Error(`Unknown argument: ${argument}\n${usage()}`);
    }
    const value = separator === -1 ? argv[index + 1] : argument.slice(separator + 1);
    if (!value || (separator === -1 && value.startsWith('--'))) {
      throw new Error(`Missing value for ${flag}\n${usage()}`);
    }
    if (values.has(flag)) {
      throw new Error(`Duplicate argument: ${flag}\n${usage()}`);
    }
    values.set(flag, value);
    if (separator === -1) index += 1;
  }
  const aggregateDirectory = requiredPath(values, '--aggregate-dir');
  const promotionDirectory = requiredPath(values, '--promotion-dir');
  const outputDirectory = requiredPath(values, '--out-dir');
  const workingValue = values.get('--work-dir');
  return {
    aggregateDirectory,
    promotionDirectory,
    outputDirectory,
    cacheDirectory: path.resolve(
      values.get('--model-cache') ?? 'tmp/model-cache/clap-htsat-unfused-c28f288',
    ),
    ...(workingValue ? { workingDirectory: path.resolve(workingValue) } : {}),
  };
}

function requiredPath(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value) throw new Error(`Missing required argument: ${flag}\n${usage()}`);
  return path.resolve(value);
}

function usage(): string {
  return [
    'Usage: npx tsx scripts/build-sfx-semantic-release.ts',
    '  --aggregate-dir <approved-aggregate>',
    '  --promotion-dir <verified-promotion>',
    '  --out-dir <new-release-directory>',
    '  [--work-dir <resumable-checkpoints>]',
    '  [--model-cache <pinned-local-clap-cache>]',
  ].join('\n');
}

function formatFailure(error: unknown): string {
  if (
    error instanceof SfxCatalogSemanticReleaseError
    || error instanceof SfxEmbeddingError
  ) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function main(argv: string[]): Promise<void> {
  await runSfxSemanticRelease(readCliOptions(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(formatFailure(error));
    process.exitCode = 1;
  });
}
