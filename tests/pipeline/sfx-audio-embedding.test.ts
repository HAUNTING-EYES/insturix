import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeFsd50kSfxEmbeddings,
  cosineSimilarity,
  decodeFloat32Embedding,
  segmentAudioForClap,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_TRANSFORMERS_VERSION,
  type SfxClapEmbeddingRuntime,
} from '../../lib/pipeline/sfx-audio-embedding';
import type { SfxCatalogEventRole } from '../../lib/pipeline/sfx-catalog';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()))) {
      throw new Error(`Refusing to clean unexpected test directory: ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('SFX CLAP screening', () => {
  it('segments long PCM deterministically and duration-weights the complete clip', () => {
    const samples = Float32Array.from({ length: 25 }, (_, index) => index + 1);
    const segments = segmentAudioForClap(samples, 10);

    expect(segments.map(segment => ({
      startSample: segment.startSample,
      length: segment.samples.length,
      weight: segment.weight,
    }))).toEqual([
      { startSample: 0, length: 10, weight: 0.4 },
      { startSample: 10, length: 10, weight: 0.4 },
      { startSample: 20, length: 5, weight: 0.2 },
    ]);
    expect(segments.flatMap(segment => [...segment.samples])).toEqual([...samples]);
  });

  it('screens semantic roles, clusters near duplicates, and picks the strongest representative', async () => {
    const root = await makeSampleRoot([
      { sourceId: '1', assignedRole: 'whoosh', marker: 1 },
      { sourceId: '2', assignedRole: 'whoosh', marker: 2 },
      { sourceId: '3', assignedRole: 'impact', marker: 3 },
    ]);
    const report = await analyzeFsd50kSfxEmbeddings({
      sampleRoot: root.directory,
      sampleReport: root.report,
      duplicateSimilarityThreshold: 0.98,
      generatedAt: new Date('2026-07-28T00:00:00.000Z'),
    }, {
      runtime: fakeRuntime(),
      decodeAudio: async buffer => ({
        sampleRate: 48_000,
        channelData: [Float32Array.from([buffer[0] / 10, buffer[0] / 10])],
      }),
    });

    expect(report.policy).toEqual({
      purpose: 'internal-semantic-and-near-duplicate-screening',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      humanReviewRequired: true,
    });
    expect(report.counts).toMatchObject({
      acceptedInput: 3,
      embedded: 3,
      roleAgreement: 3,
      duplicateCandidateClusters: 1,
      duplicateCandidateEntries: 2,
      representatives: 2,
    });
    const duplicateCluster = report.clusters.find(cluster => cluster.duplicateCandidate);
    expect(duplicateCluster).toMatchObject({
      memberSourceIds: ['1', '2'],
      representativeSourceId: '2',
      representativeRule: 'highest-assigned-role-similarity-then-source-id',
    });
    expect(report.entries.find(entry => entry.sourceId === '2')).toMatchObject({
      topRole: 'whoosh',
      assignedRoleRank: 1,
      roleAgreement: true,
      representative: true,
      nearestNeighbor: {
        sourceId: '1',
      },
    });
    const storedEmbedding = report.entries.find(entry => entry.sourceId === '2')!.embedding;
    const decodedEmbedding = decodeFloat32Embedding(
      storedEmbedding.value,
      storedEmbedding.dimension,
    );
    expect(cosineSimilarity(decodedEmbedding, Float32Array.from([1, 0, 0]))).toBeCloseTo(1, 6);
    expect(report.analysisDigestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a source whose bytes do not match its acoustic receipt before inference', async () => {
    const root = await makeSampleRoot([
      { sourceId: '9', assignedRole: 'impact', marker: 9 },
    ]);
    const runtime = fakeRuntime();
    root.report.entries[0].measurement.sourceHashSha256 = 'a'.repeat(64);

    await expect(analyzeFsd50kSfxEmbeddings({
      sampleRoot: root.directory,
      sampleReport: root.report,
    }, {
      runtime,
      decodeAudio: vi.fn(),
    })).rejects.toMatchObject({
      code: 'SOURCE_HASH_MISMATCH',
    });
    expect(runtime.embedAudio).not.toHaveBeenCalled();
  });

  it('refuses a sample report that could mutate or publish the production catalog', async () => {
    const root = await makeSampleRoot([
      { sourceId: '7', assignedRole: 'foley', marker: 7 },
    ]);
    root.report.policy.publicationAllowed = true;

    await expect(analyzeFsd50kSfxEmbeddings({
      sampleRoot: root.directory,
      sampleReport: root.report,
    }, {
      runtime: fakeRuntime(),
    })).rejects.toMatchObject({
      code: 'INVALID_SAMPLE_REPORT',
    });
  });

  it('rejects traversal outside the verified sample root', async () => {
    const root = await makeSampleRoot([
      { sourceId: '8', assignedRole: 'shimmer', marker: 8 },
    ]);
    root.report.entries[0].audioPath = '../outside.wav';

    await expect(analyzeFsd50kSfxEmbeddings({
      sampleRoot: root.directory,
      sampleReport: root.report,
    }, {
      runtime: fakeRuntime(),
    })).rejects.toMatchObject({
      code: 'UNSAFE_AUDIO_PATH',
    });
  });
});

function fakeRuntime(): SfxClapEmbeddingRuntime {
  const audioVectors: Record<number, Float32Array> = {
    1: Float32Array.from([0.99, 0.1, 0]),
    2: Float32Array.from([1, 0, 0]),
    3: Float32Array.from([0, 1, 0]),
  };
  return {
    descriptor: {
      provider: 'huggingface-transformers-js',
      packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
      modelId: SFX_CLAP_MODEL_ID,
      revision: SFX_CLAP_MODEL_REVISION,
      dtype: 'q8',
      sampleRateHz: 48_000,
      embeddingDimension: 3,
      windowing: 'non-overlapping-10s-duration-weighted-mean',
    },
    embedTexts: async prompts => prompts.map((_, index) => {
      if (index === 0) return Float32Array.from([1, 0, 0]);
      if (index === 1) return Float32Array.from([0, 1, 0]);
      return Float32Array.from([0, 0, 1]);
    }),
    embedAudio: vi.fn(async (samples: Float32Array, _sampleRateHz: number) => {
      const marker = Math.round(samples[0] * 10);
      return audioVectors[marker] ?? Float32Array.from([0, 0, 1]);
    }),
  };
}

async function makeSampleRoot(
  sources: Array<{ sourceId: string; assignedRole: SfxCatalogEventRole; marker: number }>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'editron-sfx-clap-'));
  temporaryDirectories.push(directory);
  await mkdir(path.join(directory, 'audio'), { recursive: true });
  const entries = [];
  for (const source of sources) {
    const bytes = Buffer.from([source.marker]);
    const audioPath = `audio/${source.sourceId}.wav`;
    await writeFile(path.join(directory, audioPath), bytes);
    entries.push({
      sourceId: source.sourceId,
      assignedRole: source.assignedRole,
      status: 'accepted',
      title: `Source ${source.sourceId}`,
      audioPath,
      providerTags: [source.assignedRole],
      measurement: {
        sourceHashSha256: createHash('sha256').update(bytes).digest('hex'),
      },
    });
  }
  return {
    directory,
    report: {
      version: 'editron-fsd50k-audio-sample-v1',
      candidatePoolSha256: 'b'.repeat(64),
      policy: {
        publicationAllowed: false,
        productionCatalogMutationAllowed: false,
      },
      counts: { accepted: sources.length },
      entries,
    },
  };
}
