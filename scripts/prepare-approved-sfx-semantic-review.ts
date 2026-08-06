import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ApprovedSfxSemanticReviewError,
  prepareApprovedSfxSemanticReview,
} from '../lib/pipeline/sfx-catalog-semantic-review';

interface CliOptions {
  sourceRoot: string;
  enrichedCurationPath: string;
  migrationReceiptPath: string;
  outputDirectory: string;
}

export async function runPrepareApprovedSfxSemanticReview(options: CliOptions): Promise<void> {
  const [enrichedCurationSpec, migrationReceipt] = await Promise.all([
    readJson(options.enrichedCurationPath),
    readJson(options.migrationReceiptPath),
  ]);
  const result = await prepareApprovedSfxSemanticReview({
    sourceRoot: options.sourceRoot,
    enrichedCurationSpec,
    migrationReceipt,
    outputDirectory: options.outputDirectory,
  });
  console.log(JSON.stringify({
    event: 'approved-sfx-semantic-review-prepared',
    outputDirectory: result.outputDirectory,
    htmlPath: result.htmlPath,
    reportDigestSha256: result.report.reportDigestSha256,
    counts: result.report.counts,
  }, null, 2));
}

function readCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--source-root',
    '--enriched-curation',
    '--migration-receipt',
    '--out-dir',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const separator = argument.indexOf('=');
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    if (!allowed.has(flag)) throw new Error(`Unknown argument: ${argument}\n${usage()}`);
    const value = separator === -1 ? argv[index + 1] : argument.slice(separator + 1);
    if (!value || (separator === -1 && value.startsWith('--'))) {
      throw new Error(`Missing value for ${flag}\n${usage()}`);
    }
    if (values.has(flag)) throw new Error(`Duplicate argument: ${flag}\n${usage()}`);
    values.set(flag, value);
    if (separator === -1) index += 1;
  }
  return {
    sourceRoot: requiredPath(values, '--source-root'),
    enrichedCurationPath: requiredPath(values, '--enriched-curation'),
    migrationReceiptPath: requiredPath(values, '--migration-receipt'),
    outputDirectory: requiredPath(values, '--out-dir'),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

function requiredPath(values: ReadonlyMap<string, string>, flag: string): string {
  const value = values.get(flag);
  if (!value) throw new Error(`Missing required argument: ${flag}\n${usage()}`);
  return path.resolve(value);
}

function usage(): string {
  return [
    'Usage: npx tsx scripts/prepare-approved-sfx-semantic-review.ts',
    '  --source-root <approved-review-root>',
    '  --enriched-curation <enriched-curation-spec.json>',
    '  --migration-receipt <semantic-migration-receipt.json>',
    '  --out-dir <new-review-directory>',
  ].join('\n');
}

function formatFailure(error: unknown): string {
  if (error instanceof ApprovedSfxSemanticReviewError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function main(argv: string[]): Promise<void> {
  await runPrepareApprovedSfxSemanticReview(readCliOptions(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(formatFailure(error));
    process.exitCode = 1;
  });
}
