import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  applyApprovedSfxSemanticReview,
  ApprovedSfxSemanticReviewApplicationError,
} from '../lib/pipeline/sfx-catalog-semantic-review-application';
import {
  parseSfxCatalogCurationSpec,
} from './curate-sfx-catalog';

interface CliOptions {
  enrichedCurationPath: string;
  migrationReceiptPath: string;
  reviewReportPath: string;
  reviewDecisionsPath: string;
  outputDirectory: string;
}

export async function runApplyApprovedSfxSemanticReview(options: CliOptions): Promise<void> {
  await assertOutputMissing(options.outputDirectory);
  const [enrichedCurationSpec, migrationReceipt, reviewReport, reviewDecisions] =
    await Promise.all([
      readJson(options.enrichedCurationPath),
      readJson(options.migrationReceiptPath),
      readJson(options.reviewReportPath),
      readJson(options.reviewDecisionsPath),
    ]);
  const result = applyApprovedSfxSemanticReview({
    enrichedCurationSpec,
    migrationReceipt,
    reviewReport,
    reviewDecisions,
  });
  parseSfxCatalogCurationSpec(result.resolvedCurationSpec);
  await writeArtifactsAtomically(options.outputDirectory, result);
  console.log(JSON.stringify({
    event: 'approved-sfx-semantic-review-applied',
    outputDirectory: options.outputDirectory,
    counts: result.applicationReceipt.counts,
    reviewResolutionDigestSha256: result.reviewResolution.resolutionDigestSha256,
    applicationReceiptDigestSha256: result.applicationReceipt.receiptDigestSha256,
  }, null, 2));
}

function readCliOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--enriched-curation',
    '--migration-receipt',
    '--review-report',
    '--review-decisions',
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
    enrichedCurationPath: requiredPath(values, '--enriched-curation'),
    migrationReceiptPath: requiredPath(values, '--migration-receipt'),
    reviewReportPath: requiredPath(values, '--review-report'),
    reviewDecisionsPath: requiredPath(values, '--review-decisions'),
    outputDirectory: requiredPath(values, '--out-dir'),
  };
}

async function writeArtifactsAtomically(
  outputDirectory: string,
  result: ReturnType<typeof applyApprovedSfxSemanticReview>,
): Promise<void> {
  const parent = path.dirname(outputDirectory);
  const staging = path.join(parent, `.${path.basename(outputDirectory)}.tmp-${randomUUID()}`);
  await mkdir(parent, { recursive: true });
  await mkdir(staging);
  try {
    await Promise.all([
      writeJson(
        path.join(staging, 'resolved-curation-spec.json'),
        result.resolvedCurationSpec,
      ),
      writeJson(
        path.join(staging, 'semantic-review-resolution.json'),
        result.reviewResolution,
      ),
      writeJson(
        path.join(staging, 'semantic-review-application-receipt.json'),
        result.applicationReceipt,
      ),
    ]);
    await rename(staging, outputDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
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
    'Usage: npx tsx scripts/apply-approved-sfx-semantic-review.ts',
    '  --enriched-curation <enriched-curation-spec.json>',
    '  --migration-receipt <semantic-migration-receipt.json>',
    '  --review-report <review-report.json>',
    '  --review-decisions <approved-decisions.json>',
    '  --out-dir <new-output-directory>',
  ].join('\n');
}

function formatFailure(error: unknown): string {
  if (error instanceof ApprovedSfxSemanticReviewApplicationError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function main(argv: string[]): Promise<void> {
  await runApplyApprovedSfxSemanticReview(readCliOptions(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(formatFailure(error));
    process.exitCode = 1;
  });
}
