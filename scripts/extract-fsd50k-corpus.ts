import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { extractFsd50kCandidates } from '../lib/pipeline/sfx-fsd50k-extract';

interface CliOptions {
  corpusPlanPath: string;
  archiveReceiptPath: string;
  archiveDirectory: string;
  destinationDirectory: string;
  limit?: number;
  sevenZipBinary?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const corpusPlan = JSON.parse(await readFile(options.corpusPlanPath, 'utf8'));
  const archiveDownloadReceipt = JSON.parse(
    await readFile(options.archiveReceiptPath, 'utf8'),
  );
  let lastHashMilestone = -1;
  const result = await extractFsd50kCandidates({
    corpusPlan,
    archiveDownloadReceipt,
    archiveDirectory: options.archiveDirectory,
    destinationDirectory: options.destinationDirectory,
    limit: options.limit,
    sevenZipBinary: options.sevenZipBinary,
    onProgress: (event) => {
      if (event.phase === 'extract') {
        process.stderr.write(
          `Extracted archive split ${event.completed}/${event.total}\n`,
        );
        return;
      }
      const milestone = Math.floor(event.completed / 500) * 500;
      if (
        event.completed === event.total
        || (milestone > 0 && milestone !== lastHashMilestone)
      ) {
        lastHashMilestone = milestone;
        process.stderr.write(
          `Hashed ${event.completed}/${event.total} candidate WAVs\n`,
        );
      }
    },
  });

  console.log(JSON.stringify({
    receiptPath: result.receiptPath,
    reusedExisting: result.reusedExisting,
    selection: result.receipt.selection,
    counts: result.receipt.counts,
    extractionDigestSha256: result.receipt.extractionDigestSha256,
  }, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const root = path.resolve('tmp/sfx-harvest/fsd50k-v1/p8-full-corpus');
  const options: CliOptions = {
    corpusPlanPath: path.join(root, 'corpus-plan.json'),
    archiveReceiptPath: path.join(root, 'archive-download-receipt.json'),
    archiveDirectory: path.join(root, 'archives'),
    destinationDirectory: path.join(root, 'extracted-candidates'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--plan') {
      options.corpusPlanPath = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--archive-receipt') {
      options.archiveReceiptPath = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--archives') {
      options.archiveDirectory = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--out') {
      options.destinationDirectory = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--limit') {
      options.limit = parsePositiveInteger(requireValue(args, ++index, argument), argument);
    } else if (argument === '--seven-zip') {
      options.sevenZipBinary = requireValue(args, ++index, argument);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function requireValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index]?.trim();
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
