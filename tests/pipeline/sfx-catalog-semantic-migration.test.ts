import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  SFX_SEMANTIC_ROLE_PROMPTS,
  type DecodedAudio,
  type SfxClapEmbeddingRuntime,
} from '../../lib/pipeline/sfx-audio-embedding';
import {
  migrateApprovedSfxCatalogSemantics,
} from '../../lib/pipeline/sfx-catalog-semantic-migration';
import {
  parseSfxCatalogManifest,
  type SfxCatalogEntry,
  type SfxCatalogManifest,
} from '../../lib/pipeline/sfx-catalog';
import { FSD50K_SEMANTIC_RISK_PROMPTS } from '../../lib/pipeline/sfx-fsd50k-embedding-index';

const NOW = new Date('2026-07-29T18:00:00.000Z');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('approved starter SFX semantic migration', () => {
  it('binds pinned CLAP evidence to the exact approved published bytes', async () => {
    const fixture = await makeFixture();
    const { runtime, embedAudio } = makeRuntime('impact');
    const result = await migrateApprovedSfxCatalogSemantics({
      ...fixture.input,
      generatedAt: NOW,
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    });

    expect(embedAudio).toHaveBeenCalledOnce();
    expect(result.enrichedCurationSpec.assets[0].semanticEvidence).toMatchObject({
      embeddingSourceHashSha256: fixture.audioHash,
      catalogContentHashSha256: fixture.audioHash,
      selectedRole: 'impact',
      selectedRoleRank: 1,
      topRole: 'impact',
      roleAgreement: true,
    });
    expect(result.receipt).toMatchObject({
      policy: {
        existingHumanApprovalRetained: true,
        providerApiCallsPerformed: false,
        productionCatalogMutationPerformed: false,
      },
      counts: {
        approvedAssets: 1,
        embeddedAssets: 1,
        roleAgreement: 1,
        semanticDisagreements: 0,
      },
      promotionEligible: true,
    });
    expect(result.receipt.receiptDigestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('retains human role selection but blocks promotion when CLAP disagrees', async () => {
    const fixture = await makeFixture();
    const result = await migrateApprovedSfxCatalogSemantics({
      ...fixture.input,
      generatedAt: NOW,
    }, {
      runtime: makeRuntime('whoosh').runtime,
      decodeAudio: decodeFixtureAudio,
    });

    expect(result.enrichedCurationSpec.assets[0].semanticEvidence).toMatchObject({
      selectedRole: 'impact',
      topRole: 'whoosh',
      roleAgreement: false,
    });
    expect(result.receipt.entries[0].selectedRoleRank).toBeGreaterThan(1);
    expect(result.receipt.counts.semanticDisagreements).toBe(1);
    expect(result.receipt.promotionEligible).toBe(false);
  });

  it('fails when approved source bytes no longer match the published asset', async () => {
    const fixture = await makeFixture();
    await writeFile(fixture.audioPath, Buffer.from('tampered approved audio'));

    await expect(migrateApprovedSfxCatalogSemantics(fixture.input, {
      runtime: makeRuntime('impact').runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH' });
  });

  it('fails before model work when publication receipts omit an approved asset', async () => {
    const fixture = await makeFixture();
    const publicationReceipt = {
      ...fixture.input.publicationReceipt,
      assets: [],
    };
    const { runtime, embedAudio } = makeRuntime('impact');

    await expect(migrateApprovedSfxCatalogSemantics({
      ...fixture.input,
      publicationReceipt,
    }, {
      runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(embedAudio).not.toHaveBeenCalled();
  });

  it('rejects traversal outside the approved review root', async () => {
    const fixture = await makeFixture();
    const curationSpec = structuredClone(fixture.input.curationSpec);
    curationSpec.assets[0].sourcePath = '../outside.wav';

    await expect(migrateApprovedSfxCatalogSemantics({
      ...fixture.input,
      curationSpec,
    }, {
      runtime: makeRuntime('impact').runtime,
      decodeAudio: decodeFixtureAudio,
    })).rejects.toMatchObject({ code: 'UNSAFE_SOURCE_PATH' });
  });
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'editron-approved-sfx-migration-'));
  temporaryDirectories.push(root);
  const audio = Buffer.from('approved published audio');
  const audioHash = hashBuffer(audio);
  const sourcePath = 'audio/approved.wav';
  const audioPath = path.join(root, sourcePath);
  await mkdir(path.dirname(audioPath), { recursive: true });
  await writeFile(audioPath, audio);
  const entry = makeEntry(audioHash);
  const liveManifest = makeManifest(entry);
  const approval = {
    status: 'approved' as const,
    reviewerId: 'audio-lead',
    reviewedAt: NOW.toISOString(),
  };
  const curationAsset = {
    sourcePath,
    title: entry.title,
    eventRoles: entry.eventRoles,
    surfaces: entry.surfaces,
    layerRole: entry.layerRole,
    tags: entry.tags,
    negativeTags: entry.negativeTags,
    energy: entry.energy,
    brightness: entry.brightness,
    weight: entry.weight,
    transientSharpness: entry.transientSharpness,
    material: entry.material,
    tailMs: entry.tailMs,
    loopable: entry.loopable,
    direction: entry.direction,
    motionSpeed: entry.motionSpeed,
    provenance: entry.provenance,
    approval,
  };
  return {
    audioHash,
    audioPath,
    input: {
      sourceRoot: root,
      curationSpec: {
        version: 'sfx-catalog-curation-spec-v1',
        assets: [curationAsset],
      },
      liveManifest,
      publicationReceipt: {
        version: 'sfx-catalog-publication-receipt-v1',
        manifestVersion: 'sfx-catalog-v1',
        manifestHashSha256: hashJson(liveManifest),
        assets: [{
          assetId: entry.assetId,
          contentHashSha256: audioHash,
          status: 'uploaded',
        }],
      },
      uploadPlan: {
        version: 'sfx-catalog-upload-plan-v1',
        manifestVersion: 'sfx-catalog-v1',
        assets: [{
          assetId: entry.assetId,
          contentHashSha256: audioHash,
          byteLength: audio.byteLength,
          provenance: entry.provenance,
          approval,
        }],
      },
    },
  };
}

function makeRuntime(topRole: 'impact' | 'whoosh') {
  const roleIndex = SFX_SEMANTIC_ROLE_PROMPTS.findIndex(item => item.role === topRole);
  const embedAudio = vi.fn(async () => unitVector(roleIndex));
  const runtime: SfxClapEmbeddingRuntime = {
    descriptor: {
      provider: 'huggingface-transformers-js',
      packageVersion: SFX_CLAP_TRANSFORMERS_VERSION,
      modelId: SFX_CLAP_MODEL_ID,
      revision: SFX_CLAP_MODEL_REVISION,
      dtype: 'q8',
      sampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
      embeddingDimension: SFX_CLAP_EMBEDDING_DIMENSION,
      windowing: 'non-overlapping-10s-duration-weighted-mean',
    },
    embedTexts: vi.fn(async () => [
      ...SFX_SEMANTIC_ROLE_PROMPTS.map((_, index) => unitVector(index)),
      ...FSD50K_SEMANTIC_RISK_PROMPTS.map((_, index) => unitVector(32 + index)),
    ]),
    embedAudio,
  };
  return {
    runtime,
    embedAudio,
  };
}

function makeEntry(audioHash: string): SfxCatalogEntry {
  return {
    assetId: `sfx_catalog_${audioHash.slice(0, 24)}`,
    title: 'Approved impact',
    audioUrl: '/sfx/approved.wav',
    durationMs: 1_000,
    contentHashSha256: audioHash,
    mimeType: 'audio/wav',
    eventRoles: ['impact'],
    surfaces: ['transition', 'motion-graphic'],
    layerRole: 'impact',
    tags: ['impact'],
    negativeTags: [],
    energy: 0.8,
    brightness: 0.4,
    weight: 0.8,
    transientSharpness: 0.9,
    material: 'designed',
    tailMs: 100,
    loopable: false,
    direction: 'neutral',
    motionSpeed: 'fast',
    measurement: {
      version: 'sfx-acoustic-measurement-v1',
      loudnessDb: -18,
      truePeakDbtp: -3,
      sampleRateHz: 48_000,
      channelCount: 1,
      durationMs: 1_000,
      measuredAt: NOW.toISOString(),
      sourceHashSha256: audioHash,
      algorithm: 'ffmpeg-ebur128-v1',
      loudnessMetric: 'integrated-lufs',
      integratedLufs: -18,
    },
    provenance: {
      provider: 'freesound',
      providerAssetId: 'fixture-1',
      licenseId: 'cc0-1.0',
      licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
    },
    audioRights: {
      mediaRole: 'sfx',
      source: 'library',
      userChoice: 'attested',
      licensed: true,
      evidence: {
        kind: 'library-license',
        sourceAssetId: `sfx_catalog_${audioHash.slice(0, 24)}`,
        licenseId: 'cc0-1.0',
      },
    },
  };
}

function makeManifest(entry: SfxCatalogEntry): SfxCatalogManifest {
  return parseSfxCatalogManifest({
    version: 'sfx-catalog-v1',
    generatedAt: NOW.toISOString(),
    knowledgeGraphRefs: [
      'transition-sfx-pairing',
      'true-peak-limiting',
      'platform-loudness-target',
    ],
    qualityPolicy: {
      minimumSelectionScore: 0.6,
      silenceFloorLufs: -60,
      maxTruePeakDbtp: -1,
      minSampleRateHz: 44_100,
      allowedChannelCounts: [1, 2],
      blockedTags: [
        'vocal',
        'speech',
        'music',
        'meme',
        'noisy',
        'comedic',
        'distorted',
        'clipping',
      ],
    },
    entries: [entry],
  });
}

async function decodeFixtureAudio(_buffer: Buffer): Promise<DecodedAudio> {
  return {
    sampleRate: SFX_CLAP_SAMPLE_RATE_HZ,
    channelData: [new Float32Array([0.2, -0.2, 0.1, -0.1])],
  };
}

function unitVector(index: number): Float32Array {
  const vector = new Float32Array(SFX_CLAP_EMBEDDING_DIMENSION);
  vector[index] = 1;
  return vector;
}

function hashBuffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
