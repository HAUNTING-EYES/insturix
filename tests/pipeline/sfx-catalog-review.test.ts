import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectEncodedSfxAudio } from '../../lib/pipeline/audio-conditioning';
import {
  prepareSfxCatalogReview,
  type SfxCatalogReviewReport,
} from '../../scripts/prepare-sfx-catalog-review';
import type {
  SfxCatalogReviewMetadata,
  SfxCatalogReviewSeed,
} from '../../scripts/sfx-catalog-review-seed';

const temporaryDirectories: string[] = [];
const FIXED_NOW = new Date('2026-07-27T18:00:00.000Z');

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('SFX catalog review pack', () => {
  it('builds final-byte auditions with pending decisions and license evidence', async () => {
    const root = await makeTemporaryDirectory();
    const sourceRoot = path.join(root, 'source');
    const outDir = path.join(root, 'review');
    await mkdir(path.join(sourceRoot, 'audio'), { recursive: true });
    await writeFile(path.join(sourceRoot, 'LICENSE.txt'), 'CC0 test evidence');
    await writeFile(path.join(sourceRoot, 'audio', 'hot.wav'), createWav(0.95));
    await writeFile(path.join(sourceRoot, 'audio', 'safe.wav'), createWav(0.08));

    const prepared = await prepareSfxCatalogReview({
      sourceRoot,
      outDir,
      seed: makeSeed(),
      now: FIXED_NOW,
    });
    const storedReport = JSON.parse(
      await readFile(prepared.reportPath, 'utf8'),
    ) as SfxCatalogReviewReport;
    const html = await readFile(prepared.indexPath, 'utf8');
    const hot = storedReport.candidates.find(candidate => (
      candidate.originalSourcePath === 'audio/hot.wav'
    ));

    expect(storedReport.generatedAt).toBe(FIXED_NOW.toISOString());
    expect(storedReport.candidates).toHaveLength(2);
    expect(storedReport.candidates.every(candidate => candidate.status === 'pending')).toBe(true);
    expect(JSON.stringify(storedReport)).not.toContain('"approval"');
    expect(storedReport.coverage).toEqual([
      { role: 'tick', candidateCount: 2, status: 'covered' },
      { role: 'whoosh', candidateCount: 0, status: 'gap' },
    ]);
    expect(storedReport.licenses[0]).toMatchObject({
      collectionId: 'test-collection',
      evidencePath: 'licenses/test-collection.txt',
      evidenceHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(hot?.gainDb).toBeLessThan(0);
    expect(hot?.outputInspection.truePeakDbtp).toBeLessThanOrEqual(-1);
    expect(html).toContain('SFX Catalog Review');
    expect(html).toContain('sfx-catalog-curation-spec-v1');
    expect(html).not.toContain('__SFX_REVIEW_DATA__');

    const conditionedBytes = await readFile(path.join(outDir, hot!.audioPath));
    const conditionedInspection = await inspectEncodedSfxAudio(conditionedBytes);
    expect(conditionedInspection.sampleRate).toBe(48_000);
    expect(conditionedInspection.truePeakDbtp).toBeLessThanOrEqual(-1);
    expect(await readFile(
      path.join(outDir, storedReport.licenses[0].evidencePath),
      'utf8',
    )).toBe('CC0 test evidence');
  }, 30_000);

  it('rejects a source path escape before creating an output pack', async () => {
    const root = await makeTemporaryDirectory();
    const sourceRoot = path.join(root, 'source');
    const outDir = path.join(root, 'review');
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, 'LICENSE.txt'), 'CC0 test evidence');
    await writeFile(path.join(root, 'escape.wav'), createWav(0.08));
    const seed = makeSeed();
    seed.candidates[0].sourcePath = '../escape.wav';

    await expect(prepareSfxCatalogReview({
      sourceRoot,
      outDir,
      seed,
      now: FIXED_NOW,
    })).rejects.toThrow(/sourcePath.*source root/i);
    await expect(access(outDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to overwrite an existing review directory', async () => {
    const root = await makeTemporaryDirectory();
    const sourceRoot = path.join(root, 'source');
    const outDir = path.join(root, 'review');
    await mkdir(sourceRoot);
    await mkdir(outDir);
    await writeFile(path.join(outDir, 'sentinel.txt'), 'keep');

    await expect(prepareSfxCatalogReview({
      sourceRoot,
      outDir,
      seed: makeSeed(),
      now: FIXED_NOW,
    })).rejects.toMatchObject({ code: 'SFX_REVIEW_OUTPUT_EXISTS' });
    expect(await readFile(path.join(outDir, 'sentinel.txt'), 'utf8')).toBe('keep');
  });
});

function makeSeed(): SfxCatalogReviewSeed {
  const metadata: SfxCatalogReviewMetadata = {
    title: 'Review tick',
    eventRoles: ['tick'],
    surfaces: ['ui'],
    layerRole: 'oneshot',
    tags: ['tick', 'clean'],
    negativeTags: [],
    energy: 0.3,
    brightness: 0.7,
    weight: 0.2,
    transientSharpness: 0.9,
    material: 'digital',
    tailMs: 10,
    loopable: false,
    direction: 'neutral',
    motionSpeed: 'fast',
  };
  return {
    version: 'sfx-catalog-review-seed-v1',
    requiredRoles: ['tick', 'whoosh'],
    collections: [{
      id: 'test-collection',
      provider: 'test-provider',
      licenseId: 'cc0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
      licenseEvidencePath: 'LICENSE.txt',
    }],
    candidates: [
      {
        collectionId: 'test-collection',
        sourcePath: 'audio/hot.wav',
        providerAssetId: 'test-hot',
        metadata: { ...metadata, title: 'Hot review tick' },
      },
      {
        collectionId: 'test-collection',
        sourcePath: 'audio/safe.wav',
        providerAssetId: 'test-safe',
        metadata: { ...metadata, title: 'Safe review tick' },
      },
    ],
  };
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-sfx-review-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createWav(amplitude: number): Buffer {
  const sampleRate = 48_000;
  const durationSeconds = 0.08;
  const samples = Math.round(durationSeconds * sampleRate);
  const wav = Buffer.allocUnsafe(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let frame = 0; frame < samples; frame += 1) {
    const sample = amplitude * Math.sin((2 * Math.PI * 1_200 * frame) / sampleRate);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }
  return wav;
}
