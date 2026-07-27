import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  FSD50K_SAMPLEABLE_ROLES,
  parseFsd50kCandidateIndex,
  planFsd50kAudioSample,
  sampleFsd50kAudio,
} from '../lib/pipeline/sfx-fsd50k-sampling';

interface CliOptions {
  inputPath: string;
  outputDirectory: string;
  maxPerRole: number;
  maxTotal: number;
  concurrency: number;
  seed: string;
}

export async function runFsd50kAudioSample(options: CliOptions): Promise<void> {
  const apiKey = process.env.FREESOUND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('FREESOUND_API_KEY is required; load the server-side branch environment');
  }
  const index = await readFile(path.resolve(options.inputPath), 'utf8');
  const candidates = parseFsd50kCandidateIndex(index);
  const plan = planFsd50kAudioSample(candidates, {
    roles: FSD50K_SAMPLEABLE_ROLES,
    maxPerRole: options.maxPerRole,
    maxTotal: options.maxTotal,
    seed: options.seed,
  });
  const report = await sampleFsd50kAudio({
    plan,
    outputDirectory: options.outputDirectory,
    apiKey,
    concurrency: options.concurrency,
  });
  if (report.counts.accepted === 0) {
    throw new Error('FSD50K audio sampling produced zero acoustically accepted files');
  }

  console.log(JSON.stringify({
    outputDirectory: path.resolve(options.outputDirectory),
    candidatePool: plan.counts.inputCandidates,
    groundTruthEligible: plan.counts.groundTruthEligible,
    requested: report.counts.requested,
    accepted: report.counts.accepted,
    rejected: report.counts.rejected,
    downloadedBytes: report.counts.downloadedBytes,
    roleCoverage: report.roleCoverage,
    nextGate: 'audio-embedding-classification-and-near-duplicate-clustering',
  }, null, 2));
}

function readCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: path.resolve('tmp/sfx-harvest/fsd50k-v1/cc0-candidates.ndjson'),
    outputDirectory: path.resolve('tmp/sfx-harvest/fsd50k-v1/p7f1-audio-sample'),
    maxPerRole: 5,
    maxTotal: 35,
    concurrency: 2,
    seed: 'editron-fsd50k-p7f1-v1',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--input' && next) {
      options.inputPath = path.resolve(next);
      index += 1;
    } else if (argument === '--out' && next) {
      options.outputDirectory = path.resolve(next);
      index += 1;
    } else if (argument === '--max-per-role' && next) {
      options.maxPerRole = parseInteger(next, argument);
      index += 1;
    } else if (argument === '--max-total' && next) {
      options.maxTotal = parseInteger(next, argument);
      index += 1;
    } else if (argument === '--concurrency' && next) {
      options.concurrency = parseInteger(next, argument);
      index += 1;
    } else if (argument === '--seed' && next) {
      options.seed = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

function parseInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${option} requires an integer`);
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFsd50kAudioSample(readCliOptions(process.argv.slice(2))).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
