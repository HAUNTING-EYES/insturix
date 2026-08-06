import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  AudioConditioningError,
  type EncodedSfxInspection,
} from '../../lib/pipeline/audio-conditioning';
import {
  inspectFsd50kCorpus,
  type Fsd50kInspectionIndex,
} from '../../lib/pipeline/sfx-fsd50k-inspection';
import {
  buildFsd50kCorpusPlan,
  type Fsd50kCorpusPlan,
} from '../../lib/pipeline/sfx-fsd50k-corpus';
import type {
  Fsd50kCandidateExtractionEntry,
  Fsd50kCandidateExtractionReceipt,
} from '../../lib/pipeline/sfx-fsd50k-extract';
import {
  FSD50K_CC0_LICENSE_URL,
  FSD50K_VERSION,
  FSD50K_ZENODO_RECORD_ID,
  type Fsd50kHarvestCandidate,
} from '../../lib/pipeline/sfx-fsd50k-harvest';

const ACCEPTED_INSPECTION: EncodedSfxInspection = {
  durationMs: 800,
  sampleRate: 48_000,
  channels: 1,
  loudness: { metric: 'integrated-lufs', valueDb: -20 },
  truePeakDbtp: -3,
  clippingRisk: false,
};

describe('FSD50K checkpointed acoustic inspection', () => {
  it('inspects one canonical source per exact hash and applies metadata decisions per source', async () => {
    const fixture = await createFixture([
      candidate('1'),
      candidate('2'),
      candidate('3', ['primary-label-speech']),
      candidate('4', ['uploader-metadata-vocal']),
    ], {
      '1': sourceBytes('duplicate'),
      '2': sourceBytes('duplicate'),
      '3': sourceBytes('speech'),
      '4': sourceBytes('ambiguous-vocal'),
    });
    const inspectAudio = vi.fn(async () => ACCEPTED_INSPECTION);

    const result = await inspectFsd50kCorpus({
      ...fixture.options,
      completedAt: new Date('2026-07-28T18:00:00.000Z'),
      concurrency: 2,
    }, { inspectAudio });

    expect(inspectAudio).toHaveBeenCalledTimes(3);
    expect(result.index.counts).toMatchObject({
      selectedCandidates: 4,
      completedCheckpoints: 4,
      uniqueContentHashes: 3,
      exactDuplicateGroups: 1,
      exactDuplicateEntries: 2,
      exactDuplicatesBeyondCanonical: 1,
      acceptedForEmbedding: 2,
      quarantinedMetadata: 1,
      rejectedMetadata: 1,
      rejectedAcoustic: 0,
      embeddingQueueUniqueAudio: 2,
    });
    expect(statusBySource(result.index)).toEqual({
      '1': 'accepted-for-embedding',
      '2': 'accepted-for-embedding',
      '3': 'rejected-metadata',
      '4': 'quarantined-metadata',
    });
    expect(result.index.exactDuplicateGroups[0]).toMatchObject({
      canonicalSourceId: '1',
      memberSourceIds: ['1', '2'],
    });
    expect(result.index.policy).toMatchObject({
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      acoustic: {
        silenceFloorLufs: -60,
        maxTruePeakDbtp: -1,
        minSampleRateHz: 44_100,
      },
    });
  });

  it('resumes from durable source receipts without repeating completed inspections', async () => {
    const fixture = await createFixture([
      candidate('10'),
      candidate('20'),
      candidate('30'),
    ]);
    const inspectAudio = vi.fn(async () => ACCEPTED_INSPECTION);

    await expect(inspectFsd50kCorpus({
      ...fixture.options,
      concurrency: 1,
      onProgress: event => {
        if (event.completedSources === 2) throw new Error('simulated process interruption');
      },
    }, { inspectAudio })).rejects.toThrow(/simulated process interruption/);
    expect(inspectAudio).toHaveBeenCalledTimes(2);

    const resumed = await inspectFsd50kCorpus({
      ...fixture.options,
      concurrency: 1,
      completedAt: new Date('2026-07-28T18:05:00.000Z'),
    }, { inspectAudio });

    expect(inspectAudio).toHaveBeenCalledTimes(3);
    expect(resumed.runCounts).toEqual({
      reusedCheckpoints: 2,
      newCheckpoints: 1,
      reusedAcousticOutcomes: 2,
      newAcousticOutcomes: 1,
    });
    expect(resumed.index.counts.completedCheckpoints).toBe(3);

    const reused = await inspectFsd50kCorpus({
      ...fixture.options,
      concurrency: 1,
    }, { inspectAudio });
    expect(reused.reusedExistingIndex).toBe(true);
    expect(reused.runCounts.newCheckpoints).toBe(0);
    expect(inspectAudio).toHaveBeenCalledTimes(3);
  });

  it('records source-level acoustic rejection but fails loud on inspection infrastructure failure', async () => {
    const rejectedFixture = await createFixture([candidate('100')]);
    const rejected = await inspectFsd50kCorpus(rejectedFixture.options, {
      inspectAudio: async () => {
        throw new AudioConditioningError('AUDIO_SILENT', 'source is silent');
      },
    });
    expect(rejected.index.counts.rejectedAcoustic).toBe(1);
    expect(rejected.index.embeddingQueue).toEqual([]);

    const failedFixture = await createFixture([candidate('101')]);
    await expect(inspectFsd50kCorpus(failedFixture.options, {
      inspectAudio: async () => {
        throw new AudioConditioningError('FFMPEG_FAILED', 'ffmpeg binary unavailable');
      },
    })).rejects.toMatchObject({
      code: 'ACOUSTIC_INSPECTION_INFRASTRUCTURE_FAILED',
    });
  });

  it('fails loud if source bytes change after controlled extraction', async () => {
    const fixture = await createFixture([candidate('200')]);
    await inspectFsd50kCorpus(fixture.options, {
      inspectAudio: async () => ACCEPTED_INSPECTION,
    });
    await writeFile(fixture.sourcePaths.get('200')!, sourceBytes('tampered'));

    await expect(inspectFsd50kCorpus(fixture.options, {
      inspectAudio: async () => ACCEPTED_INSPECTION,
    })).rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH' });
  });

  it('fails loud on a tampered checkpoint instead of silently recomputing it', async () => {
    const fixture = await createFixture([candidate('300')]);
    const result = await inspectFsd50kCorpus(fixture.options, {
      inspectAudio: async () => ACCEPTED_INSPECTION,
    });
    const checkpointRelativePath = result.index.entries[0].checkpointPath;
    const checkpointPath = path.join(fixture.options.outputDirectory, checkpointRelativePath);
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
    checkpoint.source.policySha256 = '0'.repeat(64);
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);

    await expect(inspectFsd50kCorpus(fixture.options, {
      inspectAudio: async () => ACCEPTED_INSPECTION,
    })).rejects.toMatchObject({ code: 'CHECKPOINT_MISMATCH' });
  });

  it('recovers a dead process lock but refuses a live concurrent owner', async () => {
    const staleFixture = await createFixture([candidate('400')]);
    await writeLock(staleFixture.options.outputDirectory, 999_999);
    const recovered = await inspectFsd50kCorpus(staleFixture.options, {
      inspectAudio: async () => ACCEPTED_INSPECTION,
      processIsAlive: () => false,
    });
    expect(recovered.recoveredStaleLock).toBe(true);

    const liveFixture = await createFixture([candidate('401')]);
    await writeLock(liveFixture.options.outputDirectory, 42);
    await expect(inspectFsd50kCorpus(liveFixture.options, {
      inspectAudio: async () => ACCEPTED_INSPECTION,
      processIsAlive: pid => pid === 42,
    })).rejects.toMatchObject({ code: 'INSPECTION_ALREADY_RUNNING' });
  });
});

async function createFixture(
  candidates: Fsd50kHarvestCandidate[],
  bytesBySource: Record<string, Buffer> = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editron-fsd50k-inspection-'));
  const extractionDirectory = path.join(root, 'extracted');
  const outputDirectory = path.join(root, 'inspection');
  const plan = buildFsd50kCorpusPlan(candidates, {
    expectedCandidateCount: candidates.length,
    generatedAt: new Date('2026-07-28T17:00:00.000Z'),
  });
  const extractionEntries: Fsd50kCandidateExtractionEntry[] = [];
  const sourcePaths = new Map<string, string>();
  for (const entry of plan.entries) {
    const buffer = bytesBySource[entry.sourceId] ?? sourceBytes(entry.sourceId);
    const filePath = path.join(extractionDirectory, ...entry.sourceAudioPath.split('/'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    sourcePaths.set(entry.sourceId, filePath);
    extractionEntries.push({
      sourceId: entry.sourceId,
      sourceSplit: entry.sourceSplit,
      sourceTrainingSplit: entry.sourceTrainingSplit,
      sourceAudioPath: entry.sourceAudioPath,
      sizeBytes: buffer.byteLength,
      sha256: sha256(buffer),
    });
  }
  const selectionSha256 = hashCanonical(extractionEntries.map(entry => ({
    sourceId: entry.sourceId,
    sourceSplit: entry.sourceSplit,
    sourceAudioPath: entry.sourceAudioPath,
  })));
  const extractionReceipt: Fsd50kCandidateExtractionReceipt = {
    version: 'editron-fsd50k-candidate-extraction-v1',
    completedAt: '2026-07-28T17:30:00.000Z',
    source: {
      candidatePoolSha256: plan.candidatePoolSha256,
      archiveSetSha256: plan.archiveSetSha256,
      archiveDownloadReceiptSha256: 'a'.repeat(64),
      archives: plan.archives.map(archive => ({
        key: archive.key,
        sizeBytes: archive.sizeBytes,
        md5: archive.md5,
      })),
    },
    selection: {
      mode: 'full-corpus',
      requestedLimit: null,
      selectionSha256,
    },
    policy: {
      purpose: 'offline-acoustic-inspection-input',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      everyEntryRequiresAudioInspection: true,
      everyEntryRequiresEmbeddingClassification: true,
    },
    counts: {
      plannedCandidates: plan.entries.length,
      selectedCandidates: plan.entries.length,
      extractedCandidates: plan.entries.length,
      devCandidates: extractionEntries.filter(entry => entry.sourceSplit === 'dev').length,
      evalCandidates: extractionEntries.filter(entry => entry.sourceSplit === 'eval').length,
      totalBytes: extractionEntries.reduce((total, entry) => total + entry.sizeBytes, 0),
      missingCandidates: 0,
      unexpectedFiles: 0,
      unsafePaths: 0,
    },
    entries: extractionEntries,
    extractionDigestSha256: hashCanonical({
      candidatePoolSha256: plan.candidatePoolSha256,
      archiveSetSha256: plan.archiveSetSha256,
      selectionSha256,
      entries: extractionEntries,
    }),
  };
  return {
    options: {
      corpusPlan: plan as Fsd50kCorpusPlan,
      extractionReceipt,
      extractionDirectory,
      outputDirectory,
      expectedCandidateCount: candidates.length,
    },
    sourcePaths,
  };
}

function candidate(
  sourceId: string,
  metadataRiskFlags: Fsd50kHarvestCandidate['metadataRiskFlags'] = [],
): Fsd50kHarvestCandidate {
  return {
    version: 'editron-fsd50k-candidate-v1',
    sourceId,
    sourceSplit: 'dev',
    sourceTrainingSplit: 'train',
    sourceAudioPath: `FSD50K.dev_audio/${sourceId}.wav`,
    title: `Sound ${sourceId}`,
    uploader: 'fixture',
    labels: metadataRiskFlags.includes('primary-label-speech') ? ['Speech'] : ['Sound'],
    mids: ['/m/fixture'],
    uploaderTags: [],
    provisionalEditorialRoles: ['foley'],
    provisionalRoleEvidence: ['foley:ground-truth-label:Sound'],
    metadataRiskFlags,
    requiresAudioInspection: true,
    requiresEmbeddingClassification: true,
    provenance: {
      provider: 'fsd50k',
      upstreamProvider: 'freesound',
      providerAssetId: sourceId,
      datasetVersion: FSD50K_VERSION,
      zenodoRecordId: FSD50K_ZENODO_RECORD_ID,
      clipLicenseId: 'cc0-1.0',
      clipLicenseUrl: FSD50K_CC0_LICENSE_URL,
      clipAttributionRequired: false,
      datasetLicense: {
        id: 'cc-by-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        attributionRequired: true,
        citation: 'Fonseca et al., FSD50K: An Open Dataset of Human-Labeled Sound Events',
      },
    },
  };
}

function sourceBytes(seed: string): Buffer {
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.alloc(4),
    Buffer.from('WAVE', 'ascii'),
    createHash('sha256').update(seed).digest(),
  ]);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function statusBySource(index: Fsd50kInspectionIndex): Record<string, string> {
  return Object.fromEntries(index.entries.map(entry => [entry.sourceId, entry.status]));
}

async function writeLock(outputDirectory: string, pid: number): Promise<void> {
  const lockDirectory = path.join(outputDirectory, '.inspection.lock');
  await mkdir(lockDirectory, { recursive: true });
  await writeFile(
    path.join(lockDirectory, 'owner.json'),
    `${JSON.stringify({
      version: 'editron-fsd50k-inspection-lock-v1',
      pid,
      token: `fixture-${pid}`,
      startedAt: '2026-07-28T18:00:00.000Z',
    }, null, 2)}\n`,
  );
}
