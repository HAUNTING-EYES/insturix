import { createHash } from 'node:crypto';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  curateSfxCatalog,
  parseSfxCatalogCurationSpec,
} from '../../scripts/curate-sfx-catalog';

const temporaryDirectories: string[] = [];
const FIXED_NOW = new Date('2026-07-27T12:00:00.000Z');

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true,
    })),
  );
});

describe('SFX catalog curation', () => {
  it('measures real audio and emits deterministic manifest and R2 upload receipts', async () => {
    const sourceRoot = await makeTemporaryDirectory();
    const wav = createWav(0.08);
    await writeFile(path.join(sourceRoot, 'ui-tick.mp3'), wav);

    const request = validCurationSpec('ui-tick.mp3');
    const options = {
      sourceRoot,
      publicAssetBaseUrl: 'https://cdn.example.com/asset',
      now: FIXED_NOW,
    };
    const first = await curateSfxCatalog(request, options);
    const second = await curateSfxCatalog(request, options);
    const hash = createHash('sha256').update(wav).digest('hex');
    const assetId = `sfx_catalog_${hash.slice(0, 24)}`;

    expect(second).toEqual(first);
    expect(first.manifest.generatedAt).toBe(FIXED_NOW.toISOString());
    expect(first.manifest.entries).toHaveLength(1);
    expect(first.manifest.entries[0]).toMatchObject({
      assetId,
      audioUrl: `https://cdn.example.com/asset/${assetId}`,
      storagePath: assetId,
      durationMs: 80,
      contentHashSha256: hash,
      mimeType: 'audio/wav',
      measurement: {
        version: 'sfx-acoustic-measurement-v1',
        algorithm: 'pcm-rms+ffmpeg-true-peak-v1',
        loudnessMetric: 'rms-dbfs',
        durationMs: 80,
        measuredAt: FIXED_NOW.toISOString(),
        sourceHashSha256: hash,
      },
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: assetId,
          licenseId: 'cc0-1.0',
        },
      },
    });
    expect(first.uploadPlan.assets).toEqual([expect.objectContaining({
      assetId,
      sourcePath: 'ui-tick.mp3',
      r2Key: assetId,
      filename: `${assetId}.wav`,
      mimeType: 'audio/wav',
      byteLength: wav.byteLength,
      contentHashSha256: hash,
      approval: {
        status: 'approved',
        reviewerId: 'audio-lead',
        reviewedAt: '2026-07-27T10:30:00.000Z',
      },
    })]);
  }, 30_000);

  it('rejects source paths that escape the licensed source root', async () => {
    const sourceRoot = await makeTemporaryDirectory();

    await expect(curateSfxCatalog(
      validCurationSpec('../outside.wav'),
      {
        sourceRoot,
        publicAssetBaseUrl: '/sfx/catalog',
        now: FIXED_NOW,
      },
    )).rejects.toThrow(/sourcePath.*source root/i);
  });

  it('rejects a symlink or junction that resolves outside the licensed source root', async () => {
    const sourceRoot = await makeTemporaryDirectory();
    const outsideRoot = await makeTemporaryDirectory();
    await writeFile(path.join(outsideRoot, 'escape.wav'), createWav(0.08));
    await symlink(
      outsideRoot,
      path.join(sourceRoot, 'linked-outside'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(curateSfxCatalog(
      validCurationSpec('linked-outside/escape.wav'),
      {
        sourceRoot,
        publicAssetBaseUrl: '/sfx/catalog',
        now: FIXED_NOW,
      },
    )).rejects.toThrow(/sourcePath.*source root/i);
  });

  it('rejects duplicate audio bytes even when metadata and filenames differ', async () => {
    const sourceRoot = await makeTemporaryDirectory();
    const wav = createWav(0.08);
    await writeFile(path.join(sourceRoot, 'tick-a.wav'), wav);
    await writeFile(path.join(sourceRoot, 'tick-b.wav'), wav);

    const firstAsset = validCurationSpec('tick-a.wav').assets[0];
    const secondAsset = {
      ...validCurationSpec('tick-b.wav').assets[0],
      title: 'Second approved tick',
      provenance: {
        ...firstAsset.provenance,
        providerAssetId: 'cc0-tick-002',
      },
    };

    await expect(curateSfxCatalog(
      {
        version: 'sfx-catalog-curation-spec-v1',
        assets: [firstAsset, secondAsset],
      },
      {
        sourceRoot,
        publicAssetBaseUrl: '/sfx/catalog',
        now: FIXED_NOW,
      },
    )).rejects.toThrow(/duplicate catalog (assetId|audio content)/i);
  }, 30_000);

  it('rejects assets without an explicit human approval receipt before reading audio', () => {
    const unapproved = validCurationSpec('ui-tick.wav') as unknown as {
      assets: Array<{ approval: { status: string } }>;
    };
    unapproved.assets[0].approval.status = 'pending';

    expect(() => parseSfxCatalogCurationSpec(unapproved)).toThrow(/approval|approved/i);
  });
});

function validCurationSpec(sourcePath: string) {
  return {
    version: 'sfx-catalog-curation-spec-v1',
    assets: [{
      sourcePath,
      title: 'Clean UI tick',
      eventRoles: ['tick'],
      surfaces: ['ui', 'motion-graphic'],
      layerRole: 'oneshot',
      tags: ['tick', 'clean', 'interface'],
      negativeTags: [],
      energy: 0.35,
      brightness: 0.72,
      weight: 0.18,
      transientSharpness: 0.9,
      material: 'digital',
      tailMs: 20,
      loopable: false,
      direction: 'neutral',
      motionSpeed: 'fast',
      provenance: {
        provider: 'internal-curation',
        providerAssetId: 'cc0-tick-001',
        licenseId: 'cc0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
      },
      approval: {
        status: 'approved',
        reviewerId: 'audio-lead',
        reviewedAt: '2026-07-27T10:30:00.000Z',
      },
    }],
  };
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'editron-sfx-curation-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createWav(durationSeconds: number): Buffer {
  const sampleRate = 48_000;
  const channels = 1;
  const samplesPerChannel = Math.round(durationSeconds * sampleRate);
  const dataBytes = samplesPerChannel * channels * 2;
  const wav = Buffer.allocUnsafe(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);

  for (let frame = 0; frame < samplesPerChannel; frame += 1) {
    const sample = 0.08 * Math.sin((2 * Math.PI * 1_200 * frame) / sampleRate);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }
  return wav;
}
