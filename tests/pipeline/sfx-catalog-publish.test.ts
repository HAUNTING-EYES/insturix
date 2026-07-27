import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BUNDLED_SFX_CATALOG } from '../../lib/pipeline/sfx-catalog';
import {
  publishSfxCatalog,
  type SfxCatalogObjectStore,
} from '../../scripts/publish-sfx-catalog';

const GENERATED_AT = '2026-07-27T12:00:00.000Z';
const PUBLISHED_AT = new Date('2026-07-27T12:30:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, {
      recursive: true,
      force: true,
    })),
  );
});

describe('SFX catalog publication', () => {
  it('conditionally uploads new objects and verifies the stored bytes', async () => {
    const fixture = await makeFixture();
    const stored = new Map<string, StoredObject>();
    const objectStore = memoryObjectStore(stored);

    const receipt = await publishSfxCatalog(
      fixture.manifest,
      fixture.uploadPlan,
      {
        sourceRoot: fixture.sourceRoot,
        bucketName: 'editron-cdn',
        now: PUBLISHED_AT,
        objectStore,
      },
    );

    expect(receipt).toMatchObject({
      version: 'sfx-catalog-publication-receipt-v1',
      manifestGeneratedAt: GENERATED_AT,
      publishedAt: PUBLISHED_AT.toISOString(),
      bucketName: 'editron-cdn',
      assets: [{
        assetId: fixture.assetId,
        r2Key: fixture.assetId,
        status: 'uploaded',
        byteLength: fixture.buffer.byteLength,
        contentHashSha256: fixture.hash,
      }],
    });
    expect(stored.get(fixture.assetId)).toMatchObject({
      contentType: 'audio/ogg',
      metadata: {
        contenthashsha256: fixture.hash,
        catalogassetid: fixture.assetId,
      },
    });
    expect(stored.get(fixture.assetId)?.body).toEqual(fixture.buffer);
  });

  it('rejects manifest/upload-plan drift before touching storage', async () => {
    const fixture = await makeFixture();
    fixture.uploadPlan.assets[0].mimeType = 'audio/mpeg';
    const objectStore = memoryObjectStore();
    const putSpy = vi.spyOn(objectStore, 'putIfAbsent');

    await expect(publishSfxCatalog(
      fixture.manifest,
      fixture.uploadPlan,
      {
        sourceRoot: fixture.sourceRoot,
        bucketName: 'editron-cdn',
        now: PUBLISHED_AT,
        objectStore,
      },
    )).rejects.toThrow(/manifest.*upload plan|mime/i);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('rejects source bytes changed after curation before touching storage', async () => {
    const fixture = await makeFixture();
    await writeFile(fixture.sourcePath, Buffer.from('changed-after-curation'));
    const objectStore = memoryObjectStore();
    const putSpy = vi.spyOn(objectStore, 'putIfAbsent');

    await expect(publishSfxCatalog(
      fixture.manifest,
      fixture.uploadPlan,
      {
        sourceRoot: fixture.sourceRoot,
        bucketName: 'editron-cdn',
        now: PUBLISHED_AT,
        objectStore,
      },
    )).rejects.toThrow(/source bytes.*(hash|length)|curation/i);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('never overwrites an existing key and rejects corrupt stored bytes', async () => {
    const fixture = await makeFixture();
    const corrupt = Buffer.from('corrupt-existing-object');
    const stored = new Map<string, StoredObject>([[
      fixture.assetId,
      {
        body: corrupt,
        contentType: 'audio/ogg',
        metadata: {},
      },
    ]]);
    const objectStore = memoryObjectStore(stored);

    await expect(publishSfxCatalog(
      fixture.manifest,
      fixture.uploadPlan,
      {
        sourceRoot: fixture.sourceRoot,
        bucketName: 'editron-cdn',
        now: PUBLISHED_AT,
        objectStore,
      },
    )).rejects.toThrow(/stored object.*(hash|bytes)|corrupt/i);
    expect(stored.get(fixture.assetId)?.body).toEqual(corrupt);
  });

  it('rejects upload-plan paths that escape the curated source root', async () => {
    const fixture = await makeFixture();
    fixture.uploadPlan.assets[0].sourcePath = '../outside.ogg';
    const objectStore = memoryObjectStore();
    const putSpy = vi.spyOn(objectStore, 'putIfAbsent');

    await expect(publishSfxCatalog(
      fixture.manifest,
      fixture.uploadPlan,
      {
        sourceRoot: fixture.sourceRoot,
        bucketName: 'editron-cdn',
        now: PUBLISHED_AT,
        objectStore,
      },
    )).rejects.toThrow(/sourcePath.*source root/i);
    expect(putSpy).not.toHaveBeenCalled();
  });
});

interface StoredObject {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

function memoryObjectStore(
  objects = new Map<string, StoredObject>(),
): SfxCatalogObjectStore {
  return {
    async putIfAbsent(input) {
      if (objects.has(input.key)) return 'exists';
      objects.set(input.key, {
        body: Buffer.from(input.body),
        contentType: input.contentType,
        metadata: { ...input.metadata },
      });
      return 'uploaded';
    },
    async readObject(key) {
      const object = objects.get(key);
      if (!object) throw new Error(`Missing object: ${key}`);
      return {
        body: Buffer.from(object.body),
        contentType: object.contentType,
        metadata: { ...object.metadata },
      };
    },
  };
}

async function makeFixture() {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), 'editron-sfx-publish-'));
  temporaryDirectories.push(sourceRoot);
  const buffer = Buffer.from('curated-ogg-bytes');
  const sourcePath = path.join(sourceRoot, 'clean-tick.ogg');
  await writeFile(sourcePath, buffer);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const assetId = `sfx_catalog_${hash.slice(0, 24)}`;
  const provenance = {
    provider: 'kenney',
    providerAssetId: 'interface-sounds:tick-001',
    licenseId: 'cc0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
  };
  const manifest = {
    ...BUNDLED_SFX_CATALOG,
    generatedAt: GENERATED_AT,
    entries: [{
      assetId,
      title: 'Clean UI tick',
      audioUrl: `https://cdn.example.com/asset/${assetId}`,
      storagePath: assetId,
      durationMs: 80,
      contentHashSha256: hash,
      mimeType: 'audio/ogg',
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
      measurement: {
        version: 'sfx-acoustic-measurement-v1',
        algorithm: 'pcm-rms+ffmpeg-true-peak-v1',
        loudnessMetric: 'rms-dbfs',
        loudnessDb: -20,
        shortWindowRmsDbfs: -20,
        truePeakDbtp: -6,
        sampleRateHz: 48_000,
        channelCount: 1,
        durationMs: 80,
        measuredAt: GENERATED_AT,
        sourceHashSha256: hash,
      },
      provenance,
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: assetId,
          licenseId: provenance.licenseId,
        },
      },
    }],
  };
  const uploadPlan = {
    version: 'sfx-catalog-upload-plan-v1',
    generatedAt: GENERATED_AT,
    manifestVersion: 'sfx-catalog-v1',
    publicAssetBaseUrl: 'https://cdn.example.com/asset',
    assets: [{
      assetId,
      sourcePath: 'clean-tick.ogg',
      r2Key: assetId,
      filename: `${assetId}.ogg`,
      mimeType: 'audio/ogg',
      byteLength: buffer.byteLength,
      contentHashSha256: hash,
      provenance,
      approval: {
        status: 'approved',
        reviewerId: 'audio-lead',
        reviewedAt: '2026-07-27T11:00:00.000Z',
      },
    }],
  };

  return {
    sourceRoot,
    sourcePath,
    buffer,
    hash,
    assetId,
    manifest,
    uploadPlan,
  };
}
