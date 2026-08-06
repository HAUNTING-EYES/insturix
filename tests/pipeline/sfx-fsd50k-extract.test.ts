import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  extractFsd50kCandidates,
  type Fsd50kArchiveExtractionRequest,
} from '../../lib/pipeline/sfx-fsd50k-extract';
import {
  FSD50K_AUDIO_ARCHIVES,
  buildFsd50kCorpusPlan,
  type Fsd50kCorpusPlan,
} from '../../lib/pipeline/sfx-fsd50k-corpus';
import {
  FSD50K_CC0_LICENSE_URL,
  FSD50K_VERSION,
  FSD50K_ZENODO_RECORD_ID,
  type Fsd50kHarvestCandidate,
} from '../../lib/pipeline/sfx-fsd50k-harvest';

describe('FSD50K controlled candidate extraction', () => {
  it('extracts, hashes, reconciles, and reuses an exact candidate set', async () => {
    const fixture = await createFixture();
    const extractor = vi.fn(writeRequestedWavs);

    const first = await extractFsd50kCandidates({
      ...fixture.options,
      completedAt: new Date('2026-07-28T12:00:00.000Z'),
    }, {
      runArchiveExtractor: extractor,
      getArchiveSize: fixture.getArchiveSize,
    });

    expect(first.reusedExisting).toBe(false);
    expect(first.receipt.counts).toMatchObject({
      plannedCandidates: 2,
      selectedCandidates: 2,
      extractedCandidates: 2,
      devCandidates: 1,
      evalCandidates: 1,
      missingCandidates: 0,
      unexpectedFiles: 0,
      unsafePaths: 0,
    });
    expect(first.receipt.policy).toMatchObject({
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      everyEntryRequiresAudioInspection: true,
      everyEntryRequiresEmbeddingClassification: true,
    });
    expect(first.receipt.entries.every(entry => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true);
    expect(extractor).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(first.receiptPath, 'utf8'))).toEqual(first.receipt);

    const second = await extractFsd50kCandidates(fixture.options, {
      runArchiveExtractor: extractor,
      getArchiveSize: fixture.getArchiveSize,
    });
    expect(second.reusedExisting).toBe(true);
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it('rejects path traversal before invoking the extractor', async () => {
    const fixture = await createFixture();
    const tampered = structuredClone(fixture.options.corpusPlan) as Fsd50kCorpusPlan;
    tampered.entries[0].sourceAudioPath = '../outside.wav';
    const extractor = vi.fn(writeRequestedWavs);

    await expect(extractFsd50kCandidates({
      ...fixture.options,
      corpusPlan: tampered,
    }, {
      runArchiveExtractor: extractor,
      getArchiveSize: fixture.getArchiveSize,
    })).rejects.toThrow(/unsafe path/i);
    expect(extractor).not.toHaveBeenCalled();
  });

  it('rejects missing or unexpected extraction output', async () => {
    const missingFixture = await createFixture('missing');
    await expect(extractFsd50kCandidates(missingFixture.options, {
      runArchiveExtractor: async () => undefined,
      getArchiveSize: missingFixture.getArchiveSize,
    })).rejects.toThrow(/did not produce/i);

    const unexpectedFixture = await createFixture('unexpected');
    await expect(extractFsd50kCandidates(unexpectedFixture.options, {
      runArchiveExtractor: async request => {
        await writeRequestedWavs(request);
        const roguePath = path.join(request.outputDirectory, 'FSD50K.dev_audio', 'rogue.wav');
        await mkdir(path.dirname(roguePath), { recursive: true });
        await writeFile(roguePath, wavBytes('rogue'));
      },
      getArchiveSize: unexpectedFixture.getArchiveSize,
    })).rejects.toThrow(/unexpected file/i);
  });

  it('rejects invalid WAV output', async () => {
    const fixture = await createFixture('invalid-wav');
    await expect(extractFsd50kCandidates(fixture.options, {
      runArchiveExtractor: async request => {
        for (const sourceAudioPath of request.sourceAudioPaths) {
          const outputPath = path.join(
            request.outputDirectory,
            ...sourceAudioPath.split('/'),
          );
          await mkdir(path.dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.from('not-a-wave-file'));
        }
      },
      getArchiveSize: fixture.getArchiveSize,
    })).rejects.toThrow(/RIFF\/WAVE/i);
  });

  it('rejects archive receipt mismatches before extraction', async () => {
    const fixture = await createFixture();
    const receipt = structuredClone(fixture.options.archiveDownloadReceipt) as {
      archives: Array<{ md5: string }>;
    };
    receipt.archives[0].md5 = '0'.repeat(32);
    const extractor = vi.fn(writeRequestedWavs);

    await expect(extractFsd50kCandidates({
      ...fixture.options,
      archiveDownloadReceipt: receipt,
    }, {
      runArchiveExtractor: extractor,
      getArchiveSize: fixture.getArchiveSize,
    })).rejects.toThrow(/receipt mismatch/i);
    expect(extractor).not.toHaveBeenCalled();
  });
});

async function createFixture(suffix = 'success') {
  const root = await mkdtemp(path.join(os.tmpdir(), `editron-fsd50k-extract-${suffix}-`));
  const archiveDirectory = path.join(root, 'archives');
  await mkdir(archiveDirectory, { recursive: true });
  const corpusPlan = buildFsd50kCorpusPlan([
    candidate('20', 'dev'),
    candidate('10', 'eval'),
  ], {
    expectedCandidateCount: 2,
    generatedAt: new Date('2026-07-28T00:00:00.000Z'),
  });
  const archiveDownloadReceipt = {
    version: 'editron-fsd50k-archive-download-receipt-v1',
    completedAt: '2026-07-28T01:00:00.000Z',
    archiveSetSha256: corpusPlan.archiveSetSha256,
    archives: FSD50K_AUDIO_ARCHIVES.map(archive => ({
      key: archive.key,
      path: path.join(archiveDirectory, archive.filename),
      sizeBytes: archive.sizeBytes,
      md5: archive.md5,
      resumedFromBytes: 0,
      reusedExisting: false,
    })),
  };
  const sizes = new Map(
    FSD50K_AUDIO_ARCHIVES.map(archive => [
      path.resolve(archiveDirectory, archive.filename),
      archive.sizeBytes,
    ]),
  );
  return {
    options: {
      corpusPlan,
      archiveDownloadReceipt,
      archiveDirectory,
      destinationDirectory: path.join(root, 'extracted'),
      expectedPlanCandidateCount: 2,
    },
    getArchiveSize: async (filePath: string) => sizes.get(path.resolve(filePath)) ?? 0,
  };
}

async function writeRequestedWavs(request: Fsd50kArchiveExtractionRequest): Promise<void> {
  for (const sourceAudioPath of request.sourceAudioPaths) {
    const outputPath = path.join(
      request.outputDirectory,
      ...sourceAudioPath.split('/'),
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, wavBytes(sourceAudioPath));
  }
}

function wavBytes(seed: string): Buffer {
  const payload = createHash('sha256').update(seed).digest();
  return Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([36, 0, 0, 0]),
    Buffer.from('WAVE', 'ascii'),
    payload,
  ]);
}

function candidate(
  sourceId: string,
  sourceSplit: 'dev' | 'eval',
): Fsd50kHarvestCandidate {
  return {
    version: 'editron-fsd50k-candidate-v1',
    sourceId,
    sourceSplit,
    sourceTrainingSplit: sourceSplit === 'dev' ? 'train' : 'eval',
    sourceAudioPath: `FSD50K.${sourceSplit}_audio/${sourceId}.wav`,
    title: `Sound ${sourceId}`,
    uploader: 'fixture',
    labels: ['Sound'],
    mids: ['/m/fixture'],
    uploaderTags: [],
    provisionalEditorialRoles: [],
    provisionalRoleEvidence: [],
    metadataRiskFlags: [],
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
