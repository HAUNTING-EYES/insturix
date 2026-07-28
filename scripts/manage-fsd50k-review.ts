import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { prepareFsd50kReviewBatch } from '../lib/pipeline/sfx-fsd50k-review-batches';
import { gateFsd50kPublication } from '../lib/pipeline/sfx-fsd50k-publication-gate';

type CliCommand =
  | {
    command: 'prepare';
    corpusPlanPath: string;
    inspectionIndexPath: string;
    embeddingReportPath: string;
    extractionDirectory: string;
    outputDirectory: string;
    batchNumber: number;
    batchSize?: number;
    concurrency?: number;
  }
  | {
    command: 'gate';
    reviewDirectory: string;
    decisionsPath: string;
    outputDirectory: string;
  };

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  if (cli.command === 'prepare') {
    const [corpusPlan, inspectionIndex, embeddingReport] = await Promise.all([
      readJson(cli.corpusPlanPath),
      readJson(cli.inspectionIndexPath),
      readJson(cli.embeddingReportPath),
    ]);
    const prepared = await prepareFsd50kReviewBatch({
      corpusPlan,
      inspectionIndex,
      embeddingReport,
      extractionDirectory: cli.extractionDirectory,
      outputDirectory: cli.outputDirectory,
      batchNumber: cli.batchNumber,
      ...(cli.batchSize === undefined ? {} : { batchSize: cli.batchSize }),
      ...(cli.concurrency === undefined ? {} : { concurrency: cli.concurrency }),
    });
    console.log(JSON.stringify({
      command: cli.command,
      batch: prepared.report.batch,
      candidates: prepared.report.candidates.length,
      indexPath: prepared.indexPath,
      reportDigestSha256: prepared.report.reportDigestSha256,
      nextGate: 'human-review-and-export-decision-receipt',
    }, null, 2));
    return;
  }

  const decisions = await readJson(cli.decisionsPath);
  const gated = await gateFsd50kPublication({
    reviewDirectory: cli.reviewDirectory,
    decisionReceipt: decisions,
    outputDirectory: cli.outputDirectory,
  });
  console.log(JSON.stringify({
    command: cli.command,
    approved: gated.receipt.counts.approved,
    rejected: gated.receipt.counts.rejected,
    pending: gated.receipt.counts.pending,
    gateReceiptPath: gated.receiptPath,
    curationSpecPath: gated.curationSpecPath,
    nextGate: 'merge-safe-multi-batch-catalog-publication',
  }, null, 2));
}

function parseCli(argv: string[]): CliCommand {
  const [command, ...argumentsList] = argv;
  if (command !== 'prepare' && command !== 'gate') throw usageError();
  const values = new Map<string, string>();
  for (const argument of argumentsList) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || values.has(match[1])) throw usageError();
    values.set(match[1], match[2]);
  }
  if (command === 'prepare') {
    return {
      command,
      corpusPlanPath: requiredPath(values, 'corpus-plan'),
      inspectionIndexPath: requiredPath(values, 'inspection-index'),
      embeddingReportPath: requiredPath(values, 'embedding-report'),
      extractionDirectory: requiredPath(values, 'extraction-dir'),
      outputDirectory: requiredPath(values, 'out-dir'),
      batchNumber: requiredInteger(values, 'batch'),
      ...(optionalInteger(values, 'batch-size') === undefined
        ? {}
        : { batchSize: optionalInteger(values, 'batch-size') }),
      ...(optionalInteger(values, 'concurrency') === undefined
        ? {}
        : { concurrency: optionalInteger(values, 'concurrency') }),
    };
  }
  return {
    command,
    reviewDirectory: requiredPath(values, 'review-dir'),
    decisionsPath: requiredPath(values, 'decisions'),
    outputDirectory: requiredPath(values, 'out-dir'),
  };
}

function requiredPath(values: Map<string, string>, key: string): string {
  return path.resolve(requiredValue(values, key));
}

function requiredValue(values: Map<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw usageError();
  return value;
}

function requiredInteger(values: Map<string, string>, key: string): number {
  const value = optionalInteger(values, key);
  if (value === undefined) throw usageError();
  return value;
}

function optionalInteger(values: Map<string, string>, key: string): number | undefined {
  const raw = values.get(key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw usageError();
  return value;
}

function usageError(): Error {
  return new Error(
    'Usage:\n'
    + '  npx tsx scripts/manage-fsd50k-review.ts prepare '
    + '--corpus-plan=<json> --inspection-index=<json> --embedding-report=<json> '
    + '--extraction-dir=<dir> --out-dir=<new-dir> --batch=<n> '
    + '[--batch-size=<1..250>] [--concurrency=<1..8>]\n'
    + '  npx tsx scripts/manage-fsd50k-review.ts gate '
    + '--review-dir=<dir> --decisions=<json> --out-dir=<new-dir>',
  );
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

const isMain = Boolean(
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url,
);
if (isMain) {
  main().catch(error => {
    console.error(`[FSD50KReview] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
