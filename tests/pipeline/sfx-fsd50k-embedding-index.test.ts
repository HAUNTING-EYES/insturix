import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Index, MetricKind, ScalarKind } from 'usearch';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapEmbeddingRuntime,
} from '../../lib/pipeline/sfx-audio-embedding';
import {
  embedFsd50kCorpus,
  FSD50K_ANN_CONFIG,
  FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES,
  type Fsd50kEmbeddingIndexReport,
} from '../../lib/pipeline/sfx-fsd50k-embedding-index';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()))) {
      throw new Error(`Refusing to clean unexpected test directory: ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('checkpointed FSD50K CLAP and ANN indexing', () => {
  it('persists a searchable ANN, verifies near-duplicate candidates, and keeps publication gated', async () => {
    const corpus = await makeCorpus([1, 2, 3, 4]);
    const runtime = fakeRuntime();
    const outputDirectory = path.join(corpus.directory, 'output');
    await writeStaleLock(outputDirectory);

    const result = await embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
      candidateNeighbours: 3,
      recordedNeighbours: 2,
      duplicateSimilarityThreshold: 0.985,
      completedAt: new Date('2026-07-28T00:00:00.000Z'),
    }, {
      runtime,
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
      processIsAlive: () => false,
    });

    expect(result.recoveredStaleLock).toBe(true);
    expect(result.runCounts).toEqual({ reusedCheckpoints: 0, newCheckpoints: 4 });
    expect(result.report.policy).toEqual({
      purpose: 'offline-semantic-screening-and-near-duplicate-candidate-discovery',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      humanReviewRequired: true,
      representativeApprovalPropagatesToClusterMembers: false,
    });
    expect(result.report.counts).toMatchObject({
      queuedUniqueAudio: 4,
      embeddedUniqueAudio: 4,
      sourceIdsRepresented: 4,
      clusters: 3,
      duplicateCandidateClusters: 1,
      duplicateCandidateCanonicalEntries: 2,
      representatives: 3,
    });
    const duplicateCluster = result.report.clusters.find(cluster => cluster.duplicateCandidate);
    expect(duplicateCluster).toMatchObject({
      canonicalSourceIds: ['1', '2'],
      representativeRule: 'accepted-metadata-then-highest-role-score-then-source-id',
      verifiedEdgeCount: 1,
    });
    expect(result.report.entries.find(entry => entry.canonicalSourceId === '1')?.annNeighbours[0])
      .toMatchObject({
        canonicalSourceId: '2',
        cosineSimilarity: expect.any(Number),
      });
    expect(result.report.analysisDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.report.ann.artifactSha256).toMatch(/^[a-f0-9]{64}$/);

    const restored = new Index({
      dimensions: SFX_CLAP_EMBEDDING_DIMENSION,
      metric: MetricKind.Cos,
      quantization: ScalarKind.F32,
      connectivity: FSD50K_ANN_CONFIG.connectivity,
      expansion_add: FSD50K_ANN_CONFIG.expansionAdd,
      expansion_search: FSD50K_ANN_CONFIG.expansionSearch,
      multi: false,
    });
    restored.load(result.annPath);
    expect(restored.size()).toBe(4);
    const query = sourceVector(1);
    expect([...restored.search(query, 2, 1).keys].map(String)).toContain('1');
  });

  it('reuses durable checkpoints after interruption and when a canary expands to the full queue', async () => {
    const corpus = await makeCorpus([1, 2, 3, 4]);
    const outputDirectory = path.join(corpus.directory, 'output');
    const controller = new AbortController();
    const interruptedRuntime = fakeRuntime();

    await expect(embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
      limit: 2,
      signal: controller.signal,
      onProgress: event => {
        if (event.completedUniqueAudio === 2) controller.abort();
      },
    }, {
      runtime: interruptedRuntime,
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    })).rejects.toMatchObject({
      code: 'EMBEDDING_ABORTED',
    });
    expect(interruptedRuntime.embedAudio).toHaveBeenCalledTimes(2);

    const resumedRuntime = fakeRuntime();
    const resumed = await embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
    }, {
      runtime: resumedRuntime,
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    });

    expect(resumed.runCounts).toEqual({ reusedCheckpoints: 2, newCheckpoints: 2 });
    expect(resumedRuntime.embedAudio).toHaveBeenCalledTimes(2);
    expect(resumed.report.selection).toMatchObject({
      mode: 'full-embedding-queue',
      requestedLimit: null,
      selectedUniqueAudio: 4,
    });
  });

  it('flushes long chunked resampling and crops to the exact CLAP frame count', async () => {
    const corpus = await makeCorpus([1]);
    const inputSamples = 1_049_869;
    const sourcePath = path.join(
      corpus.extractionDirectory,
      'FSD50K.dev_audio',
      '1.wav',
    );
    const encoded = pcm16MonoWav(inputSamples, 44_100);
    const sourceHashSha256 = createHash('sha256').update(encoded).digest('hex');
    await writeFile(sourcePath, encoded);
    corpus.inspectionIndex.entries[0].sourceHashSha256 = sourceHashSha256;
    corpus.inspectionIndex.embeddingQueue[0].sourceHashSha256 = sourceHashSha256;
    corpus.inspectionIndex.embeddingQueue[0].measurement.sourceHashSha256 =
      sourceHashSha256;
    corpus.inspectionIndex.analysisDigestSha256 = inspectionDigest(
      corpus.inspectionIndex,
    );

    const result = await embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory: path.join(corpus.directory, 'output'),
    }, {
      runtime: fakeRuntime(),
    });
    const expectedOutputSamples = Math.round(inputSamples * 48_000 / 44_100);
    const checkpoint = JSON.parse(await readFile(
      path.join(
        corpus.directory,
        'output',
        result.report.entries[0].checkpointPath,
      ),
      'utf8',
    )) as {
      preprocessing: {
        outputSamples: number;
        flushOutputSamples: number;
        lengthPolicy: string;
      };
      segmentCount: number;
    };

    expect(checkpoint.preprocessing).toMatchObject({
      outputSamples: expectedOutputSamples,
      flushOutputSamples: FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES,
      lengthPolicy: 'zero-pad-flush-then-crop-exact',
    });
    expect(checkpoint.segmentCount).toBe(3);
  });

  it('fails loud when a durable checkpoint is tampered', async () => {
    const corpus = await makeCorpus([1]);
    const outputDirectory = path.join(corpus.directory, 'output');
    const first = await embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
    }, {
      runtime: fakeRuntime(),
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    });
    const checkpointPath = path.join(
      outputDirectory,
      first.report.entries[0].checkpointPath,
    );
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) as {
      topRoleScore: number;
    };
    checkpoint.topRoleScore = 99;
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    const retryRuntime = fakeRuntime();

    await expect(embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
    }, {
      runtime: retryRuntime,
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    })).rejects.toMatchObject({
      code: 'CHECKPOINT_DIGEST_MISMATCH',
    });
    expect(retryRuntime.embedAudio).not.toHaveBeenCalled();
  });

  it('rehashes source bytes before reusing a checkpoint', async () => {
    const corpus = await makeCorpus([1]);
    const outputDirectory = path.join(corpus.directory, 'output');
    await embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
    }, {
      runtime: fakeRuntime(),
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    });
    await writeFile(path.join(corpus.extractionDirectory, 'FSD50K.dev_audio', '1.wav'), Buffer.from([9]));
    const retryRuntime = fakeRuntime();

    await expect(embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
    }, {
      runtime: retryRuntime,
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    })).rejects.toMatchObject({
      code: 'SOURCE_HASH_MISMATCH',
    });
    expect(retryRuntime.embedAudio).not.toHaveBeenCalled();
  });

  it('refuses a live process lock before inference', async () => {
    const corpus = await makeCorpus([1]);
    const outputDirectory = path.join(corpus.directory, 'output');
    await mkdir(path.join(outputDirectory, '.embedding-index.lock'), { recursive: true });
    await writeFile(
      path.join(outputDirectory, '.embedding-index.lock', 'owner.json'),
      JSON.stringify({ pid: process.pid, token: 'live' }),
    );
    const runtime = fakeRuntime();

    await expect(embedFsd50kCorpus({
      inspectionIndex: corpus.inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory,
    }, {
      runtime,
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
      processIsAlive: pid => pid === process.pid,
    })).rejects.toMatchObject({
      code: 'EMBEDDING_ALREADY_RUNNING',
    });
    expect(runtime.embedTexts).not.toHaveBeenCalled();
    expect(runtime.embedAudio).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical source path from an otherwise re-signed inspection receipt', async () => {
    const corpus = await makeCorpus([1]);
    const inspectionIndex = structuredClone(corpus.inspectionIndex);
    inspectionIndex.embeddingQueue[0].sourceAudioPath = '../outside.wav';
    inspectionIndex.analysisDigestSha256 = inspectionDigest(inspectionIndex);

    await expect(embedFsd50kCorpus({
      inspectionIndex,
      extractionDirectory: corpus.extractionDirectory,
      outputDirectory: path.join(corpus.directory, 'output'),
    }, {
      runtime: fakeRuntime(),
      decodeAudio: fakeDecodeAudio,
      resampleMono: exactLengthResampler,
    })).rejects.toMatchObject({
      code: 'UNSAFE_SOURCE_PATH',
    });
  });
});

function fakeRuntime(): SfxClapEmbeddingRuntime {
  return {
    descriptor: {
      provider: 'huggingface-transformers-js',
      packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
      modelId: SFX_CLAP_MODEL_ID,
      revision: SFX_CLAP_MODEL_REVISION,
      dtype: 'q8',
      sampleRateHz: 48_000,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
      windowing: 'non-overlapping-10s-duration-weighted-mean',
    },
    embedTexts: vi.fn(async (prompts: readonly string[]) => (
      prompts.map((_, index) => unitVector(index))
    )),
    embedAudio: vi.fn(async (samples: Float32Array, _sampleRateHz: number) => (
      sourceVector(Math.round(samples[0] * 10))
    )),
  };
}

function sourceVector(marker: number): Float32Array {
  const vector = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
  if (marker === 1) {
    vector[0] = 1;
  } else if (marker === 2) {
    vector[0] = 0.999;
    vector[1] = 0.01;
  } else if (marker === 3) {
    vector[1] = 1;
  } else {
    vector[2] = 1;
  }
  return vector;
}

function unitVector(index: number): Float32Array {
  const vector = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
  vector[index % vector.length] = 1;
  return vector;
}

function pcm16MonoWav(sampleCount: number, sampleRateHz: number): Buffer {
  const bytesPerSample = 2;
  const dataBytes = sampleCount * bytesPerSample;
  const encoded = Buffer.alloc(44 + dataBytes);
  encoded.write('RIFF', 0, 'ascii');
  encoded.writeUInt32LE(36 + dataBytes, 4);
  encoded.write('WAVE', 8, 'ascii');
  encoded.write('fmt ', 12, 'ascii');
  encoded.writeUInt32LE(16, 16);
  encoded.writeUInt16LE(1, 20);
  encoded.writeUInt16LE(1, 22);
  encoded.writeUInt32LE(sampleRateHz, 24);
  encoded.writeUInt32LE(sampleRateHz * bytesPerSample, 28);
  encoded.writeUInt16LE(bytesPerSample, 32);
  encoded.writeUInt16LE(16, 34);
  encoded.write('data', 36, 'ascii');
  encoded.writeUInt32LE(dataBytes, 40);
  return encoded;
}

async function fakeDecodeAudio(buffer: Buffer) {
  const marker = buffer[0] / 10;
  return {
    sampleRate: 44_100,
    channelData: [Float32Array.from([marker, marker])],
  };
}

async function exactLengthResampler(
  samples: Float32Array,
  inputSampleRateHz: number,
  outputSampleRateHz: number,
): Promise<Float32Array> {
  const outputLength = Math.round(samples.length * outputSampleRateHz / inputSampleRateHz);
  return Float32Array.from({ length: outputLength }, (_, index) => (
    samples[Math.min(samples.length - 1, Math.floor(index * inputSampleRateHz / outputSampleRateHz))]
  ));
}

async function makeCorpus(markers: number[]): Promise<{
  directory: string;
  extractionDirectory: string;
  inspectionIndex: ReturnType<typeof makeInspectionIndex>;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'editron-fsd50k-embedding-'));
  temporaryDirectories.push(directory);
  const extractionDirectory = path.join(directory, 'extracted-candidates');
  await mkdir(path.join(extractionDirectory, 'FSD50K.dev_audio'), { recursive: true });
  const sources = [];
  for (const marker of markers) {
    const sourceId = String(marker);
    const bytes = Buffer.from([marker]);
    await writeFile(
      path.join(extractionDirectory, 'FSD50K.dev_audio', `${sourceId}.wav`),
      bytes,
    );
    sources.push({
      sourceId,
      sourceHashSha256: createHash('sha256').update(bytes).digest('hex'),
      role: marker < 3 ? 'whoosh' : 'impact',
    });
  }
  return {
    directory,
    extractionDirectory,
    inspectionIndex: makeInspectionIndex(sources),
  };
}

function makeInspectionIndex(
  sources: Array<{ sourceId: string; sourceHashSha256: string; role: string }>,
) {
  const withoutDigest = {
    version: 'editron-fsd50k-inspection-index-v1',
    completedAt: '2026-07-28T00:00:00.000Z',
    source: {
      candidatePoolSha256: 'a'.repeat(64),
      archiveSetSha256: 'b'.repeat(64),
      extractionDigestSha256: 'c'.repeat(64),
    },
    selection: {
      mode: 'full-corpus',
      requestedLimit: null,
      selectionSha256: 'd'.repeat(64),
    },
    policy: {
      version: 'editron-fsd50k-inspection-policy-v1',
      purpose: 'offline-acoustic-screening-and-exact-dedup',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      acoustic: {},
      metadata: {},
      policySha256: 'e'.repeat(64),
    },
    counts: {
      plannedCandidates: sources.length,
      selectedCandidates: sources.length,
      completedCheckpoints: sources.length,
      uniqueContentHashes: sources.length,
      exactDuplicateGroups: 0,
      exactDuplicateEntries: 0,
      exactDuplicatesBeyondCanonical: 0,
      acceptedForEmbedding: sources.length,
      quarantinedMetadata: 0,
      rejectedMetadata: 0,
      rejectedAcoustic: 0,
      embeddingQueueUniqueAudio: sources.length,
    },
    entries: sources.map(source => ({
      sourceId: source.sourceId,
      sourceAudioPath: `FSD50K.dev_audio/${source.sourceId}.wav`,
      sourceHashSha256: source.sourceHashSha256,
      canonicalSourceId: source.sourceId,
      exactDuplicate: false,
      status: 'accepted-for-embedding',
      embeddingDisposition: 'classify',
      checkpointPath: `checkpoints/${source.sourceId}.json`,
      labels: [source.role],
      provisionalEditorialRoles: [source.role],
      provisionalRoleEvidence: [`label:${source.role}`],
      metadataRiskFlags: [],
    })),
    exactDuplicateGroups: [],
    embeddingQueue: sources.map(source => ({
      canonicalSourceId: source.sourceId,
      sourceAudioPath: `FSD50K.dev_audio/${source.sourceId}.wav`,
      sourceHashSha256: source.sourceHashSha256,
      memberSourceIds: [source.sourceId],
      measurement: {
        version: 'sfx-acoustic-measurement-v1',
        loudnessDb: -18,
        truePeakDbtp: -3,
        sampleRateHz: 44_100,
        channelCount: 1,
        durationMs: 1_000,
        measuredAt: '2026-07-28T00:00:00.000Z',
        sourceHashSha256: source.sourceHashSha256,
        algorithm: 'ffmpeg-ebur128-v1',
        loudnessMetric: 'integrated-lufs',
        integratedLufs: -18,
      },
    })),
  };
  return {
    ...withoutDigest,
    analysisDigestSha256: inspectionDigest(withoutDigest),
  };
}

function inspectionDigest(value: {
  completedAt: string;
  analysisDigestSha256?: string;
  [key: string]: unknown;
}): string {
  const {
    completedAt: _completedAt,
    analysisDigestSha256: _analysisDigestSha256,
    ...payload
  } = value;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function writeStaleLock(outputDirectory: string): Promise<void> {
  const lockDirectory = path.join(outputDirectory, '.embedding-index.lock');
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(
    path.join(lockDirectory, 'owner.json'),
    JSON.stringify({ pid: 999_999, token: 'stale' }),
  );
}
