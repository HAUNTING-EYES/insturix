import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPinnedSfxClapRuntime,
  DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
} from '../lib/pipeline/sfx-audio-embedding';
import {
  DEFAULT_FSD50K_ANN_NEIGHBOURS,
  DEFAULT_FSD50K_RECORDED_NEIGHBOURS,
  embedFsd50kCorpus,
  Fsd50kEmbeddingIndexError,
} from '../lib/pipeline/sfx-fsd50k-embedding-index';

interface CliOptions {
  extractionDirectory: string;
  inspectionIndexPath: string;
  outputDirectory: string;
  cacheDirectory: string;
  limit?: number;
  candidateNeighbours: number;
  recordedNeighbours: number;
  duplicateThreshold: number;
  localFilesOnly: boolean;
}

export async function runFsd50kEmbeddingIndex(options: CliOptions): Promise<void> {
  const inspectionIndex = JSON.parse(
    await readFile(options.inspectionIndexPath, 'utf8'),
  ) as unknown;
  const runtime = await createPinnedSfxClapRuntime({
    cacheDirectory: options.cacheDirectory,
    localFilesOnly: options.localFilesOnly,
  });
  try {
    const result = await embedFsd50kCorpus({
      inspectionIndex,
      extractionDirectory: options.extractionDirectory,
      outputDirectory: options.outputDirectory,
      limit: options.limit,
      candidateNeighbours: options.candidateNeighbours,
      recordedNeighbours: options.recordedNeighbours,
      duplicateSimilarityThreshold: options.duplicateThreshold,
      onProgress: event => {
        if (
          event.completedUniqueAudio === 1
          || event.completedUniqueAudio === event.totalUniqueAudio
          || event.completedUniqueAudio % 25 === 0
        ) {
          console.log(JSON.stringify({
            event: 'fsd50k-embedding-progress',
            ...event,
          }));
        }
      },
    }, { runtime });
    console.log(JSON.stringify({
      reportPath: result.reportPath,
      annPath: result.annPath,
      model: `${result.report.model.modelId}@${result.report.model.revision}`,
      localFilesOnly: options.localFilesOnly,
      queuedUniqueAudio: result.report.counts.queuedUniqueAudio,
      embeddedUniqueAudio: result.report.counts.embeddedUniqueAudio,
      sourceIdsRepresented: result.report.counts.sourceIdsRepresented,
      clusters: result.report.counts.clusters,
      duplicateCandidateClusters: result.report.counts.duplicateCandidateClusters,
      representatives: result.report.counts.representatives,
      annArtifactSha256: result.report.ann.artifactSha256,
      analysisDigestSha256: result.report.analysisDigestSha256,
      recoveredStaleLock: result.recoveredStaleLock,
      runCounts: result.runCounts,
      nextGate: 'human-review-representatives-without-propagating-approval',
    }, null, 2));
  } finally {
    await runtime.dispose?.();
  }
}

function readCliOptions(argv: string[]): CliOptions {
  const corpusRoot = path.resolve('tmp/sfx-harvest/fsd50k-v1/p8-full-corpus');
  const options: CliOptions = {
    extractionDirectory: path.join(corpusRoot, 'extracted-candidates'),
    inspectionIndexPath: path.join(corpusRoot, 'p9-inspection', 'inspection-index.json'),
    outputDirectory: path.join(corpusRoot, 'p10-clap-ann'),
    cacheDirectory: path.resolve('tmp/model-cache/clap-htsat-unfused-c28f288'),
    candidateNeighbours: DEFAULT_FSD50K_ANN_NEIGHBOURS,
    recordedNeighbours: DEFAULT_FSD50K_RECORDED_NEIGHBOURS,
    duplicateThreshold: DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
    localFilesOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === '--extraction-dir' && next) {
      options.extractionDirectory = path.resolve(next);
      index += 1;
    } else if (argument === '--inspection-index' && next) {
      options.inspectionIndexPath = path.resolve(next);
      index += 1;
    } else if (argument === '--out-dir' && next) {
      options.outputDirectory = path.resolve(next);
      index += 1;
    } else if (argument === '--cache-dir' && next) {
      options.cacheDirectory = path.resolve(next);
      index += 1;
    } else if (argument === '--limit' && next) {
      options.limit = parsePositiveInteger(next, '--limit');
      index += 1;
    } else if (argument === '--candidate-neighbours' && next) {
      options.candidateNeighbours = parsePositiveInteger(next, '--candidate-neighbours');
      index += 1;
    } else if (argument === '--recorded-neighbours' && next) {
      options.recordedNeighbours = parsePositiveInteger(next, '--recorded-neighbours');
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

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseThreshold(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error('--duplicate-threshold must be greater than 0 and at most 1');
  }
  return parsed;
}

function formatFailure(error: unknown): string {
  if (error instanceof Fsd50kEmbeddingIndexError) {
    return `${error.code}: ${error.message}`;
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return `${String(error.code)}: ${String(error.message)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFsd50kEmbeddingIndex(readCliOptions(process.argv.slice(2))).catch(error => {
    console.error(formatFailure(error));
    process.exitCode = 1;
  });
}
