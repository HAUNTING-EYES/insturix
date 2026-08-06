import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { inspectFsd50kCorpus } from '../lib/pipeline/sfx-fsd50k-inspection';

interface CliOptions {
  corpusPlanPath: string;
  extractionDirectory: string;
  outputDirectory: string;
  limit?: number;
  concurrency: number;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const corpusPlan = JSON.parse(await readFile(options.corpusPlanPath, 'utf8'));
  const extractionReceipt = JSON.parse(
    await readFile(
      path.join(options.extractionDirectory, 'candidate-extraction-receipt.json'),
      'utf8',
    ),
  );
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  let lastMilestone = -1;
  try {
    const result = await inspectFsd50kCorpus({
      corpusPlan,
      extractionReceipt,
      extractionDirectory: options.extractionDirectory,
      outputDirectory: options.outputDirectory,
      limit: options.limit,
      concurrency: options.concurrency,
      signal: controller.signal,
      onProgress: event => {
        const milestone = Math.floor(event.completedSources / 100) * 100;
        if (
          event.completedSources === event.totalSources
          || (milestone > 0 && milestone !== lastMilestone)
        ) {
          lastMilestone = milestone;
          process.stderr.write(
            `Checkpointed ${event.completedSources}/${event.totalSources} sources `
            + `(${event.completedUniqueAudio}/${event.totalUniqueAudio} unique audio)\n`,
          );
        }
      },
    });
    console.log(JSON.stringify({
      indexPath: result.indexPath,
      reusedExistingIndex: result.reusedExistingIndex,
      recoveredStaleLock: result.recoveredStaleLock,
      selection: result.index.selection,
      counts: result.index.counts,
      runCounts: result.runCounts,
      analysisDigestSha256: result.index.analysisDigestSha256,
    }, null, 2));
  } finally {
    process.removeListener('SIGINT', interrupt);
  }
}

function parseArgs(args: readonly string[]): CliOptions {
  const root = path.resolve('tmp/sfx-harvest/fsd50k-v1/p8-full-corpus');
  const options: CliOptions = {
    corpusPlanPath: path.join(root, 'corpus-plan.json'),
    extractionDirectory: path.join(root, 'extracted-candidates'),
    outputDirectory: path.join(root, 'p9-inspection'),
    concurrency: 2,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--plan') {
      options.corpusPlanPath = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--extraction') {
      options.extractionDirectory = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--out') {
      options.outputDirectory = path.resolve(requireValue(args, ++index, argument));
    } else if (argument === '--limit') {
      options.limit = parsePositiveInteger(requireValue(args, ++index, argument), argument);
    } else if (argument === '--concurrency') {
      options.concurrency = parsePositiveInteger(
        requireValue(args, ++index, argument),
        argument,
      );
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

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
