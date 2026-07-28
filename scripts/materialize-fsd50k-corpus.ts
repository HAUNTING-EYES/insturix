import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildFsd50kCorpusPlan,
  downloadFsd50kArchiveSet,
  probeFsd50kAudioArchives,
} from '../lib/pipeline/sfx-fsd50k-corpus';
import { parseFsd50kCandidateIndex } from '../lib/pipeline/sfx-fsd50k-sampling';

interface CliOptions {
  inputPath: string;
  outputDirectory: string;
  probe: boolean;
  download: boolean;
  archiveKeys: string[];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const candidates = parseFsd50kCandidateIndex(
    await readFile(options.inputPath, 'utf8'),
  );
  const plan = buildFsd50kCorpusPlan(candidates);
  await mkdir(options.outputDirectory, { recursive: true });
  await atomicWriteJson(
    path.join(options.outputDirectory, 'corpus-plan.json'),
    plan,
  );

  const summary: Record<string, unknown> = {
    plan: {
      candidates: plan.counts.candidates,
      metadataRiskFlagged: plan.counts.metadataRiskFlagged,
      provisionallyRoleMapped: plan.counts.provisionallyRoleMapped,
      archives: plan.counts.archiveParts,
      archiveDownloadBytes: plan.counts.archiveDownloadBytes,
      candidatePoolSha256: plan.candidatePoolSha256,
      archiveSetSha256: plan.archiveSetSha256,
    },
  };

  if (options.probe) {
    const receipt = await probeFsd50kAudioArchives();
    await atomicWriteJson(
      path.join(options.outputDirectory, 'archive-probe-receipt.json'),
      receipt,
    );
    summary.probe = receipt.counts;
  }

  if (options.download) {
    const receipt = await downloadFsd50kArchiveSet({
      destinationDirectory: path.join(options.outputDirectory, 'archives'),
      archiveKeys: options.archiveKeys,
      onProgress: ({ key, downloadedBytes, totalBytes }) => {
        const percentage = (downloadedBytes / totalBytes * 100).toFixed(2);
        process.stderr.write(`\r${key}: ${percentage}%`);
      },
    });
    process.stderr.write('\n');
    await atomicWriteJson(
      path.join(options.outputDirectory, 'archive-download-receipt.json'),
      {
        version: 'editron-fsd50k-archive-download-receipt-v1',
        completedAt: new Date().toISOString(),
        archiveSetSha256: plan.archiveSetSha256,
        archives: receipt,
      },
    );
    summary.download = {
      archives: receipt.length,
      bytes: receipt.reduce((total, archive) => total + archive.sizeBytes, 0),
      reusedExisting: receipt.filter(archive => archive.reusedExisting).length,
    };
  }

  console.log(JSON.stringify(summary, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    inputPath: path.resolve('tmp/sfx-harvest/fsd50k-v1/cc0-candidates.ndjson'),
    outputDirectory: path.resolve('tmp/sfx-harvest/fsd50k-v1/p8-full-corpus'),
    probe: false,
    download: false,
    archiveKeys: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--probe') {
      options.probe = true;
    } else if (arg === '--download') {
      options.download = true;
    } else if (arg === '--input') {
      options.inputPath = path.resolve(requireValue(args, ++index, '--input'));
    } else if (arg === '--out') {
      options.outputDirectory = path.resolve(requireValue(args, ++index, '--out'));
    } else if (arg === '--archive') {
      options.archiveKeys.push(requireValue(args, ++index, '--archive'));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.archiveKeys.length > 0 && !options.download) {
    throw new Error('--archive requires --download');
  }
  return options;
}

function requireValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index]?.trim();
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
