import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  FSD50K_AUDIO_ARCHIVES,
  buildFsd50kCorpusPlan,
  downloadFsd50kArchive,
  downloadFsd50kArchiveSet,
  probeFsd50kAudioArchives,
  type Fsd50kAudioArchive,
} from '../../lib/pipeline/sfx-fsd50k-corpus';
import {
  FSD50K_CC0_LICENSE_URL,
  FSD50K_VERSION,
  FSD50K_ZENODO_RECORD_ID,
  type Fsd50kHarvestCandidate,
} from '../../lib/pipeline/sfx-fsd50k-harvest';

describe('FSD50K full-corpus materialization', () => {
  it('plans every candidate without granting publication authority', () => {
    const plan = buildFsd50kCorpusPlan(
      [
        candidate('20', 'eval', ['impact']),
        candidate('10', 'dev', []),
      ],
      {
        expectedCandidateCount: 2,
        generatedAt: new Date('2026-07-28T00:00:00.000Z'),
      },
    );

    expect(plan.entries.map(entry => entry.sourceId)).toEqual(['10', '20']);
    expect(plan.counts).toMatchObject({
      candidates: 2,
      devCandidates: 1,
      evalCandidates: 1,
      provisionallyRoleMapped: 1,
      archiveParts: 8,
      archiveDownloadBytes: 24_671_691_926,
    });
    expect(plan.policy).toMatchObject({
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      everyCandidateRequiresAudioInspection: true,
      everyCandidateRequiresEmbeddingClassification: true,
    });
    expect(plan.candidatePoolSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.archiveSetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicated, path-tampered, or non-CC0 candidates', () => {
    const duplicate = candidate('10', 'dev', []);
    expect(() => buildFsd50kCorpusPlan(
      [duplicate, duplicate],
      { expectedCandidateCount: 2 },
    )).toThrow(/duplicated/i);

    const tamperedPath = {
      ...candidate('10', 'dev', []),
      sourceAudioPath: '../10.wav',
    };
    expect(() => buildFsd50kCorpusPlan(
      [tamperedPath],
      { expectedCandidateCount: 1 },
    )).toThrow(/source path/i);

    const nonCc0 = candidate('10', 'dev', []);
    nonCc0.provenance.clipLicenseId = 'cc-by-4.0' as 'cc0-1.0';
    expect(() => buildFsd50kCorpusPlan(
      [nonCc0],
      { expectedCandidateCount: 1 },
    )).toThrow(/rights\/evidence/i);
  });

  it('probes all official archive parts with one-byte range requests', async () => {
    let probeIndex = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('range');
      expect(range).toBe('bytes=0-0');
      const archive = FSD50K_AUDIO_ARCHIVES[probeIndex];
      probeIndex += 1;
      if (!archive) throw new Error('unexpected probe');
      return new Response(new Uint8Array([0]), {
        status: 206,
        headers: {
          'content-range': `bytes 0-0/${archive.sizeBytes}`,
          'content-type': 'application/octet-stream',
        },
      });
    });

    const receipt = await probeFsd50kAudioArchives({
      fetchImpl: fetchImpl as typeof fetch,
      probedAt: new Date('2026-07-28T00:00:00.000Z'),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(receipt.counts).toEqual({
      archives: 8,
      totalBytes: 24_671_691_926,
    });
    expect(receipt.archives.every(archive => archive.rangeSupported)).toBe(true);
  });

  it('resumes a partial archive and verifies its checksum before promotion', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'editron-fsd50k-corpus-'));
    const bytes = Buffer.from('official-audio-archive');
    const archive: Fsd50kAudioArchive = {
      key: 'FSD50K.dev_audio.z01',
      filename: 'FSD50K.dev_audio.z01',
      split: 'dev',
      partOrder: 1,
      sizeBytes: bytes.byteLength,
      md5: createHash('md5').update(bytes).digest('hex'),
      url: `https://zenodo.org/records/${FSD50K_ZENODO_RECORD_ID}/files/FSD50K.dev_audio.z01?download=1`,
    };
    await writeFile(
      path.join(directory, `${archive.filename}.part`),
      bytes.subarray(0, 8),
    );
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('range')).toBe('bytes=8-');
      return new Response(bytes.subarray(8), {
        status: 206,
        headers: {
          'content-range': `bytes 8-${bytes.byteLength - 1}/${bytes.byteLength}`,
        },
      });
    });

    const receipt = await downloadFsd50kArchive(archive, {
      destinationDirectory: directory,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(receipt).toMatchObject({
      resumedFromBytes: 8,
      reusedExisting: false,
      sizeBytes: bytes.byteLength,
    });
    expect(await readFile(path.join(directory, archive.filename))).toEqual(bytes);
  });

  it('promotes a complete verified partial archive without another request', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'editron-fsd50k-complete-'));
    const bytes = Buffer.from('already-complete-archive');
    const archive: Fsd50kAudioArchive = {
      key: 'FSD50K.eval_audio.zip',
      filename: 'FSD50K.eval_audio.zip',
      split: 'eval',
      partOrder: 2,
      sizeBytes: bytes.byteLength,
      md5: createHash('md5').update(bytes).digest('hex'),
      url: `https://zenodo.org/records/${FSD50K_ZENODO_RECORD_ID}/files/FSD50K.eval_audio.zip?download=1`,
    };
    await writeFile(
      path.join(directory, `${archive.filename}.part`),
      bytes,
    );
    const fetchImpl = vi.fn();

    const receipt = await downloadFsd50kArchive(archive, {
      destinationDirectory: directory,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({
      resumedFromBytes: bytes.byteLength,
      reusedExisting: false,
    });
    expect(await readFile(path.join(directory, archive.filename))).toEqual(bytes);
  });

  it('bounds parallel archive work and rejects invalid concurrency before fetching', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'editron-fsd50k-batch-'));
    const archives = FSD50K_AUDIO_ARCHIVES.slice(0, 3);
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    let startedRequests = 0;
    let releaseRequests: () => void = () => undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const archive = archives.find(candidateArchive => candidateArchive.url === String(input));
      if (!archive) throw new Error(`Unexpected archive URL: ${String(input)}`);
      activeRequests += 1;
      startedRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      if (startedRequests === archives.length) releaseRequests();
      await requestGate;
      activeRequests -= 1;
      return new Response(new Uint8Array([0]), {
        status: 206,
        headers: {
          'content-range': `bytes 0-0/${archive.sizeBytes}`,
        },
      });
    });

    await expect(downloadFsd50kArchiveSet({
      destinationDirectory: directory,
      archiveKeys: archives.map(archive => archive.key),
      concurrency: 3,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow(/stopped at 1/i);

    expect(maximumActiveRequests).toBe(3);
    expect(activeRequests).toBe(0);
    await expect(downloadFsd50kArchiveSet({
      destinationDirectory: directory,
      concurrency: 0,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow(/concurrency must be an integer from 1 to 8/i);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

function candidate(
  sourceId: string,
  sourceSplit: 'dev' | 'eval',
  roles: Fsd50kHarvestCandidate['provisionalEditorialRoles'],
): Fsd50kHarvestCandidate {
  return {
    version: 'editron-fsd50k-candidate-v1',
    sourceId,
    sourceSplit,
    sourceTrainingSplit: sourceSplit === 'dev' ? 'train' : 'eval',
    sourceAudioPath: `FSD50K.${sourceSplit}_audio/${sourceId}.wav`,
    title: `Sound ${sourceId}`,
    uploader: 'fixture',
    labels: roles.length > 0 ? ['Impact'] : ['Unknown'],
    mids: ['/m/fixture'],
    uploaderTags: [],
    provisionalEditorialRoles: roles,
    provisionalRoleEvidence: roles.map(role => `${role}:ground-truth-label:Impact`),
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
