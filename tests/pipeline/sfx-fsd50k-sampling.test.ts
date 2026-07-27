import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SfxCatalogEventRole } from '../../lib/pipeline/sfx-catalog';
import type { Fsd50kHarvestCandidate } from '../../lib/pipeline/sfx-fsd50k-harvest';
import {
  parseFsd50kCandidateIndex,
  planFsd50kAudioSample,
  sampleFsd50kAudio,
  type Fsd50kControlledFreesoundIngest,
} from '../../lib/pipeline/sfx-fsd50k-sampling';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()))) {
      throw new Error(`Refusing to clean unexpected test directory: ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('FSD50K audio sampling', () => {
  it('builds a deterministic, role-balanced plan from risk-free ground-truth evidence', () => {
    const candidates = [
      candidate('1', ['whoosh'], ['whoosh:ground-truth-label:Whoosh']),
      candidate('2', ['whoosh'], ['whoosh:uploader-metadata:whoosh']),
      candidate('3', ['impact'], ['impact:ground-truth-label:Boom']),
      candidate('4', ['impact', 'foley'], [
        'impact:ground-truth-label:Shatter',
        'foley:ground-truth-label:Glass',
      ]),
      candidate('5', ['tick'], ['tick:ground-truth-label:Tick'], ['uploader-metadata-noisy']),
    ];

    const first = planFsd50kAudioSample(candidates, {
      roles: ['whoosh', 'impact', 'foley', 'tick'],
      maxPerRole: 1,
      maxTotal: 4,
      seed: 'fixed-seed',
    });
    const second = planFsd50kAudioSample([...candidates].reverse(), {
      roles: ['whoosh', 'impact', 'foley', 'tick'],
      maxPerRole: 1,
      maxTotal: 4,
      seed: 'fixed-seed',
    });

    expect(first.entries).toEqual(second.entries);
    expect(first.entries.map(entry => entry.candidate.sourceId)).not.toContain('2');
    expect(first.entries.map(entry => entry.candidate.sourceId)).not.toContain('5');
    expect(new Set(first.entries.map(entry => entry.candidate.sourceId)).size)
      .toBe(first.entries.length);
    expect(first.roleCoverage).toContainEqual({
      role: 'tick',
      eligible: 0,
      selected: 0,
      gap: true,
    });
    expect(first.policy.publicationAllowed).toBe(false);
  });

  it('rejects candidate indexes that do not preserve the CC0 source contract', () => {
    const forged = {
      ...candidate('9', ['impact'], ['impact:ground-truth-label:Boom']),
      provenance: {
        ...candidate('9', [], []).provenance,
        clipLicenseId: 'cc-by-4.0',
      },
    };
    expect(() => parseFsd50kCandidateIndex(JSON.stringify(forged)))
      .toThrow(/rights\/evidence contract/i);
  });

  it('writes real bytes and a non-publishable measurement receipt through controlled ingest', async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'editron-fsd50k-sample-'));
    temporaryDirectories.push(outputDirectory);
    const plan = planFsd50kAudioSample([
      candidate('221', ['shimmer'], ['shimmer:ground-truth-label:Bell']),
    ], {
      roles: ['shimmer'],
      maxPerRole: 1,
      maxTotal: 1,
      seed: 'receipt-test',
    });
    const audioBytes = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
    const measurement = {
      version: 'sfx-acoustic-measurement-v1' as const,
      algorithm: 'ffmpeg-ebur128-v1' as const,
      loudnessMetric: 'integrated-lufs' as const,
      loudnessDb: -18,
      integratedLufs: -18,
      truePeakDbtp: -3,
      sampleRateHz: 48_000,
      channelCount: 2,
      durationMs: 3_000,
      measuredAt: '2026-07-28T00:00:00.000Z',
      sourceHashSha256: 'a'.repeat(64),
    };
    const ingestImplementation: Fsd50kControlledFreesoundIngest = async (
      providerAssetId,
      userId,
      dependencies,
    ) => {
      const upload = await dependencies.upload!(
        audioBytes,
        userId,
        `source-${providerAssetId}.mp3`,
        'audio/mpeg',
        { customAssetId: `sfx_fs_${providerAssetId}_test` },
      );
      const audioRights = {
        mediaRole: 'sfx' as const,
        source: 'library' as const,
        userChoice: 'attested' as const,
        licensed: true,
        evidence: {
          kind: 'library-license' as const,
          sourceAssetId: upload.assetId,
          licenseId: `freesound:${providerAssetId}:creative-commons-0`,
        },
      };
      await dependencies.persist!({
        userId,
        provider: 'freesound',
        providerAssetId,
        title: 'Bell',
        durationSec: 3,
        tags: ['bell', 'shimmer'],
        filename: `source-${providerAssetId}.mp3`,
        bufferSize: audioBytes.length,
        upload,
        audioRights,
        measurement,
      });
      return {
        audioUrl: upload.signedUrl,
        gcsPath: null,
        audioAssetId: upload.assetId,
        durationMs: measurement.durationMs,
        audioRights,
        source: 'freesound',
        originalTitle: 'Bell',
        providerAssetId,
        measurement,
      };
    };
    const ingest = vi.fn(ingestImplementation);

    const report = await sampleFsd50kAudio({
      plan,
      outputDirectory,
      apiKey: 'server-key',
      concurrency: 1,
      generatedAt: new Date('2026-07-28T00:00:00.000Z'),
    }, { ingest });

    expect(report.counts).toEqual({
      requested: 1,
      accepted: 1,
      rejected: 0,
      downloadedBytes: audioBytes.length,
    });
    expect(report.policy).toMatchObject({
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      providerLicenseReverified: true,
    });
    await expect(readFile(path.join(outputDirectory, 'audio', '221.mp3')))
      .resolves.toEqual(audioBytes);
    const storedReport = JSON.parse(
      await readFile(path.join(outputDirectory, 'sample-report.json'), 'utf8'),
    ) as { entries: Array<{ measurement?: { loudnessDb: number } }> };
    expect(storedReport.entries[0].measurement?.loudnessDb).toBe(-18);
    expect(ingest).toHaveBeenCalledWith(
      '221',
      'fsd50k-screening',
      expect.objectContaining({ apiKey: 'server-key' }),
    );
  });
});

function candidate(
  sourceId: string,
  roles: SfxCatalogEventRole[],
  evidence: string[],
  metadataRiskFlags: Fsd50kHarvestCandidate['metadataRiskFlags'] = [],
): Fsd50kHarvestCandidate {
  return {
    version: 'editron-fsd50k-candidate-v1',
    sourceId,
    sourceSplit: 'dev',
    sourceTrainingSplit: 'train',
    sourceAudioPath: `FSD50K.dev_audio/${sourceId}.wav`,
    title: `Sound ${sourceId}`,
    uploader: 'test',
    labels: ['Test'],
    mids: ['/m/test'],
    uploaderTags: [],
    provisionalEditorialRoles: roles,
    provisionalRoleEvidence: evidence,
    metadataRiskFlags,
    requiresAudioInspection: true,
    requiresEmbeddingClassification: true,
    provenance: {
      provider: 'fsd50k',
      upstreamProvider: 'freesound',
      providerAssetId: sourceId,
      datasetVersion: '1.0',
      zenodoRecordId: '4060432',
      clipLicenseId: 'cc0-1.0',
      clipLicenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
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
