import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  FSD50K_CC0_LICENSE_URL,
  harvestFsd50kMetadata,
} from '../../lib/pipeline/sfx-fsd50k-harvest';
import { extractZipEntry } from '../../scripts/harvest-fsd50k-metadata';

const CC_BY = 'http://creativecommons.org/licenses/by/3.0/';
const FIXED_NOW = new Date('2026-07-28T00:00:00.000Z');

describe('FSD50K metadata harvest', () => {
  it('retains the complete CC0 pool while treating text labels as provisional evidence', () => {
    const result = harvestFsd50kMetadata({
      devGroundTruthCsv: [
        'fname,labels,mids,split',
        '1,"Whoosh_and_swoosh_and_swish","/m/whoosh",train',
        '2,"Whoosh_and_swoosh_and_swish","/m/whoosh",val',
        '3,"Speech","/m/speech",train',
      ].join('\n'),
      evalGroundTruthCsv: [
        'fname,labels,mids',
        '4,"Shatter,Glass","/m/shatter,/m/glass"',
      ].join('\n'),
      devClipsInfo: {
        1: clip('Clean air pass', ['whoosh'], FSD50K_CC0_LICENSE_URL),
        2: clip('Licensed sweep', ['whoosh'], CC_BY),
        3: clip('A person speaking', ['voice'], FSD50K_CC0_LICENSE_URL),
      },
      evalClipsInfo: {
        4: clip('Glass break', ['glass', 'impact'], FSD50K_CC0_LICENSE_URL),
      },
      generatedAt: FIXED_NOW,
      expectedCounts: { dev: 3, eval: 1, total: 4, cc0: 3 },
    });

    expect(result.candidates.map(candidate => candidate.sourceId)).toEqual(['1', '3', '4']);
    expect(result.report.counts).toMatchObject({
      total: 4,
      cc0RightsEligible: 3,
      excludedByClipLicense: 1,
      metadataRiskFlagged: 1,
      embeddingClassificationRequired: 3,
    });
    expect(result.candidates[0]).toMatchObject({
      sourceAudioPath: 'FSD50K.dev_audio/1.wav',
      provisionalEditorialRoles: ['whoosh'],
      requiresAudioInspection: true,
      requiresEmbeddingClassification: true,
      provenance: {
        clipLicenseId: 'cc0-1.0',
        clipAttributionRequired: false,
        datasetLicense: { id: 'cc-by-4.0', attributionRequired: true },
      },
    });
    expect(result.candidates[1].metadataRiskFlags).toContain('primary-label-speech');
    expect(result.candidates[2].provisionalEditorialRoles).toEqual(['impact', 'foley']);
    expect(result.report.roleCoverage).toContainEqual({
      role: 'riser',
      provisionalCandidateCount: 0,
      groundTruthCandidateCount: 0,
      uploaderMetadataOnlyCount: 0,
      status: 'designed-source-gap',
    });
    expect(result.report.candidateIndexSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.report.policy.noAudioDownloaded).toBe(true);
  });

  it('fails closed when ground truth and metadata IDs diverge', () => {
    expect(() => harvestFsd50kMetadata({
      devGroundTruthCsv: 'fname,labels,mids,split\n1,Tick,/m/tick,train',
      evalGroundTruthCsv: 'fname,labels,mids',
      devClipsInfo: { 9: clip('Wrong clip', ['tick'], FSD50K_CC0_LICENSE_URL) },
      evalClipsInfo: {},
      expectedCounts: { dev: 1, eval: 0, total: 1, cc0: 1 },
    })).toThrow(/do not describe the same source IDs/i);
  });

  it('parses quoted CSV fields without confusing label commas for columns', () => {
    const result = harvestFsd50kMetadata({
      devGroundTruthCsv: [
        'fname,labels,mids,split',
        '7,"Tick,Clock","/m/tick,/m/clock",train',
      ].join('\n'),
      evalGroundTruthCsv: 'fname,labels,mids',
      devClipsInfo: { 7: clip('Clock tick', ['clock'], FSD50K_CC0_LICENSE_URL) },
      evalClipsInfo: {},
      expectedCounts: { dev: 1, eval: 0, total: 1, cc0: 1 },
    });
    expect(result.candidates[0].labels).toEqual(['Tick', 'Clock']);
    expect(result.candidates[0].mids).toEqual(['/m/tick', '/m/clock']);
  });
});

describe('FSD50K archive extraction', () => {
  it('extracts a deflated pinned entry', () => {
    const archive = createZip('FSD50K.metadata/dev_clips_info_FSD50K.json', '{"1":{}}');
    expect(extractZipEntry(
      archive,
      'FSD50K.metadata/dev_clips_info_FSD50K.json',
    ).toString('utf8')).toBe('{"1":{}}');
  });

  it('rejects traversal paths before extraction', () => {
    const archive = createZip('../escape.json', '{}');
    expect(() => extractZipEntry(archive, '../escape.json')).toThrow(/unsafe entry path/i);
  });
});

function clip(title: string, tags: string[], license: string) {
  return {
    title,
    description: '',
    tags,
    license,
    uploader: 'test-uploader',
  };
}

function createZip(name: string, content: string): Buffer {
  const filename = Buffer.from(name);
  const source = Buffer.from(content);
  const compressed = deflateRawSync(source);
  const local = Buffer.alloc(30 + filename.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22);
  local.writeUInt16LE(filename.length, 26);
  filename.copy(local, 30);

  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt32LE(0, 42);
  filename.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, end]);
}
