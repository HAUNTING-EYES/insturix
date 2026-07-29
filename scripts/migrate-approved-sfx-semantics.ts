import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPinnedSfxClapRuntime,
  SfxEmbeddingError,
} from '../lib/pipeline/sfx-audio-embedding';
import {
  ApprovedSfxSemanticMigrationError,
  migrateApprovedSfxCatalogSemantics,
} from '../lib/pipeline/sfx-catalog-semantic-migration';

interface CliOptions {
  sourceRoot: string;
  curationSpecPath: string;
  manifestPath: string;
  publicationReceiptPath: string;
  uploadPlanPath: string;
  outputDirectory: string;
  cacheDirectory: string;
}

export async function runApprovedSfxSemanticMigration(options: CliOptions): Promise<void> {
  await assertOutputMissing(options.outputDirectory);
  const [curationSpec, liveManifest, publicationReceipt, uploadPlan] = await Promise.all([
    readJson(options.curationSpecPath),
    readJson(options.manifestPath),
    readJson(options.publicationReceiptPath),
    readJson(options.uploadPlanPath),
  ]);
  const runtime = await createPinnedSfxClapRuntime({
    cacheDirectory: options.cacheDirectory,
    localFilesOnly: true,
  });
  try {
    const result = await migrateApprovedSfxCatalogSemantics({
      sourceRoot: options.sourceRoot,
      curationSpec,
      liveManifest,
      publicationReceipt,
      uploadPlan,
    }, { runtime });
    await writeArtifactsAtomically(options.outputDirectory, result);
    console.log(JSON.stringify({
      event: 'approved-sfx-semantic-migration-complete',
      localFilesOnly: true,
      providerApiCalls: 0,
      outputDirectory: options.outputDirectory,
      promotionEligible: result.receipt.promotionEligible,
      counts: result.receipt.counts,
      disagreements: result.receipt.entries
        .filter(entry => !entry.roleAgreement)
        .map(entry => ({
          assetId: entry.assetId,
          selectedRole: entry.selectedRole,
          selectedRoleRank: entry.selectedRoleRank,
          topRole: entry.topRole,
        })),
      receiptDigestSha256: result.receipt.receiptDigestSha256,
    }, null, 2));
  } finally {
    await runtime.dispose?.();
  }
}

function readCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--source-root',
    '--curation-spec',
    '--manifest',
    '--publication-receipt',
    '--upload-plan',
    '--out-dir',
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
  return {
    sourceRoot: requiredPath(values, '--source-root'),
    curationSpecPath: requiredPath(values, '--curation-spec'),
    manifestPath: requiredPath(values, '--manifest'),
    publicationReceiptPath: requiredPath(values, '--publication-receipt'),
    uploadPlanPath: requiredPath(values, '--upload-plan'),
    outputDirectory: requiredPath(values, '--out-dir'),
    cacheDirectory: path.resolve(
      values.get('--model-cache') ?? 'tmp/model-cache/clap-htsat-unfused-c28f288',
    ),
  };
}

async function writeArtifactsAtomically(
  outputDirectory: string,
  result: Awaited<ReturnType<typeof migrateApprovedSfxCatalogSemantics>>,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  const temporaryDirectory = path.join(
    parent,
    `.${path.basename(outputDirectory)}.tmp-${randomUUID()}`,
  );
  await mkdir(parent, { recursive: true });
  await mkdir(temporaryDirectory);
  try {
    await Promise.all([
      writeJson(
        path.join(temporaryDirectory, 'enriched-curation-spec.json'),
        result.enrichedCurationSpec,
      ),
      writeJson(
        path.join(temporaryDirectory, 'semantic-migration-receipt.json'),
        result.receipt,
      ),
    ]);
    await rename(temporaryDirectory, outputDirectory);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function assertOutputMissing(outputDirectory: string): Promise<void> {
  try {
    await lstat(outputDirectory);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Output directory already exists: ${outputDirectory}`);
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function requiredPath(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value) throw new Error(`Missing required argument: ${flag}\n${usage()}`);
  return path.resolve(value);
}

function usage(): string {
  return [
    'Usage: npx tsx scripts/migrate-approved-sfx-semantics.ts',
    '  --source-root <approved-review-root>',
    '  --curation-spec <approved-curation.json>',
    '  --manifest <live-manifest.json>',
    '  --publication-receipt <publication-receipt.json>',
    '  --upload-plan <upload-plan.json>',
    '  --out-dir <new-output-directory>',
    '  [--model-cache <pinned-local-clap-cache>]',
  ].join('\n');
}

function formatFailure(error: unknown): string {
  if (
    error instanceof ApprovedSfxSemanticMigrationError
    || error instanceof SfxEmbeddingError
  ) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function main(argv: string[]): Promise<void> {
  await runApprovedSfxSemanticMigration(readCliOptions(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(formatFailure(error));
    process.exitCode = 1;
  });
}
