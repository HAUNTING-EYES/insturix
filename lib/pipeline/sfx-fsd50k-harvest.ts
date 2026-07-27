import { createHash } from 'node:crypto';

import type { SfxCatalogEventRole } from '@/lib/pipeline/sfx-catalog';

export const FSD50K_VERSION = '1.0';
export const FSD50K_ZENODO_RECORD_ID = '4060432';
export const FSD50K_CC0_LICENSE_URL = 'http://creativecommons.org/publicdomain/zero/1.0/';
export const FSD50K_EXPECTED_COUNTS = {
  dev: 40_966,
  eval: 10_231,
  total: 51_197,
  cc0: 19_873,
} as const;

const DATASET_LICENSE = {
  id: 'cc-by-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attributionRequired: true,
  citation: 'Fonseca et al., FSD50K: An Open Dataset of Human-Labeled Sound Events',
} as const;

const ALL_EDITORIAL_ROLES: readonly SfxCatalogEventRole[] = [
  'whoosh',
  'impact',
  'tick',
  'pop',
  'riser',
  'logo-sting',
  'ambience',
  'foley',
  'shimmer',
];

const ROLE_LABELS: Readonly<Record<SfxCatalogEventRole, readonly string[]>> = {
  whoosh: ['Whoosh_and_swoosh_and_swish'],
  impact: [
    'Boom',
    'Explosion',
    'Slam',
    'Thump_and_thud',
    'Knock',
    'Shatter',
    'Gunshot_and_gunfire',
    'Crash_cymbal',
  ],
  tick: ['Tick', 'Tick-tock', 'Tap', 'Typing', 'Computer_keyboard', 'Coin_(dropping)', 'Clock'],
  pop: ['Finger_snapping'],
  riser: [],
  'logo-sting': [],
  ambience: [
    'Rain',
    'Raindrop',
    'Wind',
    'Thunderstorm',
    'Traffic_noise_and_roadway_noise',
    'Crowd',
    'Water',
    'Fire',
    'Ocean',
    'Stream',
    'Waves_and_surf',
  ],
  foley: [
    'Walk_and_footsteps',
    'Door',
    'Sliding_door',
    'Zipper_(clothing)',
    'Tearing',
    'Crushing',
    'Glass',
    'Wood',
    'Camera',
    'Packing_tape_and_duct_tape',
  ],
  shimmer: ['Bell', 'Bicycle_bell', 'Chime', 'Church_bell', 'Wind_chime'],
};

const UPLOADER_ROLE_PATTERNS: Readonly<Record<SfxCatalogEventRole, readonly RegExp[]>> = {
  whoosh: [/\bwhoosh\b/i, /\bswoosh\b/i, /\bswish\b/i],
  impact: [
    /\bboom\b/i,
    /\bexplosion\b/i,
    /\bslam\b/i,
    /\bthump\b/i,
    /\bthud\b/i,
    /\bknock\b/i,
    /\bshatter\b/i,
    /\bgunshot\b/i,
    /\bcrash\b/i,
  ],
  tick: [
    /\btick\b/i,
    /\btap\b/i,
    /\btyping\b/i,
    /\bcomputer[_ -]?keyboard\b/i,
    /\bcoin\b/i,
    /\bclock\b/i,
  ],
  pop: [/\bpop\b/i, /\bfinger[_ -]?snapping\b/i, /\bsnap\b/i],
  riser: [/\briser\b/i, /\brising[_ -]?(tone|sweep|fx)\b/i],
  'logo-sting': [/\blogo[_ -]?sting\b/i, /\bbrand[_ -]?sting\b/i],
  ambience: [
    /\brain\b/i,
    /\bwind\b/i,
    /\bthunderstorm\b/i,
    /\btraffic[_ -]?noise\b/i,
    /\bcrowd\b/i,
    /\bwater\b/i,
    /\bfire\b/i,
    /\bsea[_ -]?waves\b/i,
  ],
  foley: [
    /\bfootsteps?\b/i,
    /\bdoor\b/i,
    /\bzipper\b/i,
    /\btearing\b/i,
    /\bcrushing\b/i,
    /\bglass\b/i,
    /\bwood\b/i,
    /\bcamera\b/i,
    /\bpacking[_ -]?tape\b/i,
  ],
  shimmer: [/\bchime\b/i, /\bwind[_ -]?chime\b/i, /\bshimmer\b/i],
};

const PRIMARY_AUDIO_RISK_PATTERNS: ReadonlyArray<{
  flag: Fsd50kMetadataRiskFlag;
  pattern: RegExp;
}> = [
  { flag: 'primary-label-speech', pattern: /\b(speech|speaking|whispering|narration)\b/i },
  { flag: 'primary-label-music', pattern: /\b(music|song|singing|musical[_ -]?instrument)\b/i },
];

const UPLOADER_AUDIO_RISK_PATTERNS: ReadonlyArray<{
  flag: Fsd50kMetadataRiskFlag;
  pattern: RegExp;
}> = [
  { flag: 'uploader-metadata-vocal', pattern: /\b(vocal|voice|speech|spoken|singing|singer)\b/i },
  { flag: 'uploader-metadata-music', pattern: /\b(music|song|instrumental|melody|guitar|piano)\b/i },
  { flag: 'uploader-metadata-noisy', pattern: /\b(noisy|noise-floor|distorted|clipping)\b/i },
];

type Fsd50kSplit = 'dev' | 'eval';
type Fsd50kMetadataRiskFlag =
  | 'primary-label-speech'
  | 'primary-label-music'
  | 'uploader-metadata-vocal'
  | 'uploader-metadata-music'
  | 'uploader-metadata-noisy';

interface Fsd50kClipInfo {
  title: string;
  tags: string[];
  license: string;
  uploader: string;
}

interface Fsd50kGroundTruthRow {
  sourceId: string;
  labels: string[];
  mids: string[];
  sourceSplit: 'train' | 'val' | 'eval';
}

interface Fsd50kExpectedCounts {
  dev: number;
  eval: number;
  total: number;
  cc0: number;
}

export interface Fsd50kHarvestInput {
  devGroundTruthCsv: string;
  evalGroundTruthCsv: string;
  devClipsInfo: unknown;
  evalClipsInfo: unknown;
  generatedAt?: Date;
  expectedCounts?: Fsd50kExpectedCounts;
}

export interface Fsd50kHarvestCandidate {
  version: 'editron-fsd50k-candidate-v1';
  sourceId: string;
  sourceSplit: Fsd50kSplit;
  sourceTrainingSplit: 'train' | 'val' | 'eval';
  sourceAudioPath: string;
  title: string;
  uploader: string;
  labels: string[];
  mids: string[];
  uploaderTags: string[];
  provisionalEditorialRoles: SfxCatalogEventRole[];
  provisionalRoleEvidence: string[];
  metadataRiskFlags: Fsd50kMetadataRiskFlag[];
  requiresAudioInspection: true;
  requiresEmbeddingClassification: true;
  provenance: {
    provider: 'fsd50k';
    upstreamProvider: 'freesound';
    providerAssetId: string;
    datasetVersion: typeof FSD50K_VERSION;
    zenodoRecordId: typeof FSD50K_ZENODO_RECORD_ID;
    clipLicenseId: 'cc0-1.0';
    clipLicenseUrl: typeof FSD50K_CC0_LICENSE_URL;
    clipAttributionRequired: false;
    datasetLicense: typeof DATASET_LICENSE;
  };
}

export interface Fsd50kHarvestReport {
  version: 'editron-fsd50k-metadata-harvest-v1';
  generatedAt: string;
  dataset: {
    name: 'FSD50K';
    version: typeof FSD50K_VERSION;
    zenodoRecordId: typeof FSD50K_ZENODO_RECORD_ID;
    datasetLicense: typeof DATASET_LICENSE;
  };
  policy: {
    clipLicenseAllowlist: ['cc0-1.0'];
    finalLabelsRequireAudioEvidence: true;
    uploaderMetadataIsUntrusted: true;
    noAudioDownloaded: true;
  };
  counts: {
    dev: number;
    eval: number;
    total: number;
    cc0RightsEligible: number;
    excludedByClipLicense: number;
    metadataRiskFlagged: number;
    provisionallyMapped: number;
    embeddingClassificationRequired: number;
  };
  licenseCounts: Array<{ licenseUrl: string; count: number; allowed: boolean }>;
  roleCoverage: Array<{
    role: SfxCatalogEventRole;
    provisionalCandidateCount: number;
    groundTruthCandidateCount: number;
    uploaderMetadataOnlyCount: number;
    status: 'ground-truth-signals-present' | 'designed-source-gap';
  }>;
  topPrimaryLabels: Array<{ label: string; count: number }>;
  candidateIndexSha256: string;
  nextGate: 'download-relevant-audio-for-acoustic-and-embedding-analysis';
}

export interface Fsd50kHarvestResult {
  report: Fsd50kHarvestReport;
  candidates: Fsd50kHarvestCandidate[];
}

export class Fsd50kHarvestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Fsd50kHarvestError';
  }
}

export function harvestFsd50kMetadata(input: Fsd50kHarvestInput): Fsd50kHarvestResult {
  const generatedAt = input.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Fsd50kHarvestError('INVALID_HARVEST_CLOCK', 'FSD50K harvest timestamp is invalid');
  }

  const devRows = parseGroundTruthCsv(input.devGroundTruthCsv, 'dev');
  const evalRows = parseGroundTruthCsv(input.evalGroundTruthCsv, 'eval');
  const devClips = parseClipInfoMap(input.devClipsInfo, 'dev');
  const evalClips = parseClipInfoMap(input.evalClipsInfo, 'eval');
  assertJoinedSplit(devRows, devClips, 'dev');
  assertJoinedSplit(evalRows, evalClips, 'eval');

  const expected = input.expectedCounts ?? FSD50K_EXPECTED_COUNTS;
  assertExpectedCount('dev', devRows.length, expected.dev);
  assertExpectedCount('eval', evalRows.length, expected.eval);
  assertExpectedCount('total', devRows.length + evalRows.length, expected.total);

  const licenseCounts = new Map<string, number>();
  const primaryLabelCounts = new Map<string, number>();
  const candidates: Fsd50kHarvestCandidate[] = [];

  collectSplit(devRows, devClips, 'dev', licenseCounts, primaryLabelCounts, candidates);
  collectSplit(evalRows, evalClips, 'eval', licenseCounts, primaryLabelCounts, candidates);
  candidates.sort((left, right) => Number(left.sourceId) - Number(right.sourceId));
  assertExpectedCount('cc0', candidates.length, expected.cc0);

  const roleCoverage = ALL_EDITORIAL_ROLES.map(role => {
    const roleCandidates = candidates.filter(candidate => (
      candidate.provisionalEditorialRoles.includes(role)
    ));
    const groundTruthCandidateCount = roleCandidates.filter(candidate => (
      candidate.provisionalRoleEvidence.some(evidence => (
        evidence.startsWith(`${role}:ground-truth-label:`)
      ))
    )).length;
    const provisionalCandidateCount = roleCandidates.length;
    return {
      role,
      provisionalCandidateCount,
      groundTruthCandidateCount,
      uploaderMetadataOnlyCount: provisionalCandidateCount - groundTruthCandidateCount,
      status: groundTruthCandidateCount > 0
        ? 'ground-truth-signals-present' as const
        : 'designed-source-gap' as const,
    };
  });
  const candidateIndexSha256 = createHash('sha256')
    .update(candidates.map(candidate => canonicalCandidate(candidate)).join('\n'))
    .digest('hex');

  return {
    report: {
      version: 'editron-fsd50k-metadata-harvest-v1',
      generatedAt: generatedAt.toISOString(),
      dataset: {
        name: 'FSD50K',
        version: FSD50K_VERSION,
        zenodoRecordId: FSD50K_ZENODO_RECORD_ID,
        datasetLicense: DATASET_LICENSE,
      },
      policy: {
        clipLicenseAllowlist: ['cc0-1.0'],
        finalLabelsRequireAudioEvidence: true,
        uploaderMetadataIsUntrusted: true,
        noAudioDownloaded: true,
      },
      counts: {
        dev: devRows.length,
        eval: evalRows.length,
        total: devRows.length + evalRows.length,
        cc0RightsEligible: candidates.length,
        excludedByClipLicense: devRows.length + evalRows.length - candidates.length,
        metadataRiskFlagged: candidates.filter(candidate => candidate.metadataRiskFlags.length > 0).length,
        provisionallyMapped: candidates.filter(candidate => (
          candidate.provisionalEditorialRoles.length > 0
        )).length,
        embeddingClassificationRequired: candidates.length,
      },
      licenseCounts: [...licenseCounts.entries()]
        .map(([licenseUrl, count]) => ({
          licenseUrl,
          count,
          allowed: licenseUrl === FSD50K_CC0_LICENSE_URL,
        }))
        .sort((left, right) => right.count - left.count || left.licenseUrl.localeCompare(right.licenseUrl)),
      roleCoverage,
      topPrimaryLabels: [...primaryLabelCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
        .slice(0, 30),
      candidateIndexSha256,
      nextGate: 'download-relevant-audio-for-acoustic-and-embedding-analysis',
    },
    candidates,
  };
}

function collectSplit(
  rows: Fsd50kGroundTruthRow[],
  clips: Map<string, Fsd50kClipInfo>,
  split: Fsd50kSplit,
  licenseCounts: Map<string, number>,
  primaryLabelCounts: Map<string, number>,
  candidates: Fsd50kHarvestCandidate[],
): void {
  for (const row of rows) {
    const clip = clips.get(row.sourceId)!;
    licenseCounts.set(clip.license, (licenseCounts.get(clip.license) ?? 0) + 1);
    if (clip.license !== FSD50K_CC0_LICENSE_URL) continue;

    const primaryLabel = row.labels[0] ?? 'unlabeled';
    primaryLabelCounts.set(primaryLabel, (primaryLabelCounts.get(primaryLabel) ?? 0) + 1);
    const roleSignals = inferProvisionalRoles(row.labels, clip.title, clip.tags);
    candidates.push({
      version: 'editron-fsd50k-candidate-v1',
      sourceId: row.sourceId,
      sourceSplit: split,
      sourceTrainingSplit: row.sourceSplit,
      sourceAudioPath: `${split === 'dev' ? 'FSD50K.dev_audio' : 'FSD50K.eval_audio'}/${row.sourceId}.wav`,
      title: sanitizeText(clip.title, 300) || `Freesound ${row.sourceId}`,
      uploader: sanitizeText(clip.uploader, 200) || 'unknown',
      labels: row.labels,
      mids: row.mids,
      uploaderTags: clip.tags.map(tag => sanitizeText(tag, 100)).filter(Boolean).slice(0, 100),
      provisionalEditorialRoles: roleSignals.roles,
      provisionalRoleEvidence: roleSignals.evidence,
      metadataRiskFlags: inferMetadataRiskFlags(row.labels, clip.title, clip.tags),
      requiresAudioInspection: true,
      requiresEmbeddingClassification: true,
      provenance: {
        provider: 'fsd50k',
        upstreamProvider: 'freesound',
        providerAssetId: row.sourceId,
        datasetVersion: FSD50K_VERSION,
        zenodoRecordId: FSD50K_ZENODO_RECORD_ID,
        clipLicenseId: 'cc0-1.0',
        clipLicenseUrl: FSD50K_CC0_LICENSE_URL,
        clipAttributionRequired: false,
        datasetLicense: DATASET_LICENSE,
      },
    });
  }
}

function parseGroundTruthCsv(csv: string, split: Fsd50kSplit): Fsd50kGroundTruthRow[] {
  const records = parseCsv(csv);
  const expectedHeader = split === 'dev'
    ? ['fname', 'labels', 'mids', 'split']
    : ['fname', 'labels', 'mids'];
  const header = records.shift();
  if (!header || header.join('\u0000') !== expectedHeader.join('\u0000')) {
    throw new Fsd50kHarvestError(
      'INVALID_GROUND_TRUTH_HEADER',
      `FSD50K ${split} ground truth header does not match version ${FSD50K_VERSION}`,
    );
  }

  const seen = new Set<string>();
  return records.map((record, index) => {
    if (record.length === 1 && record[0] === '') return null;
    if (record.length !== expectedHeader.length) {
      throw new Fsd50kHarvestError(
        'INVALID_GROUND_TRUTH_ROW',
        `FSD50K ${split} row ${index + 2} has ${record.length} columns`,
      );
    }
    const [sourceId, labelsValue, midsValue, sourceSplitValue] = record;
    if (!/^\d+$/.test(sourceId) || seen.has(sourceId)) {
      throw new Fsd50kHarvestError(
        'INVALID_GROUND_TRUTH_ID',
        `FSD50K ${split} row ${index + 2} has an invalid or duplicate source ID`,
      );
    }
    seen.add(sourceId);
    const labels = commaList(labelsValue);
    const mids = commaList(midsValue);
    if (labels.length === 0 || labels.length !== mids.length) {
      throw new Fsd50kHarvestError(
        'INVALID_GROUND_TRUTH_LABELS',
        `FSD50K ${split} source ${sourceId} has inconsistent labels and ontology IDs`,
      );
    }
    const sourceSplit = split === 'eval' ? 'eval' : sourceSplitValue;
    if (sourceSplit !== 'train' && sourceSplit !== 'val' && sourceSplit !== 'eval') {
      throw new Fsd50kHarvestError(
        'INVALID_GROUND_TRUTH_SPLIT',
        `FSD50K ${split} source ${sourceId} has invalid split ${sourceSplit}`,
      );
    }
    return { sourceId, labels, mids, sourceSplit };
  }).filter((row): row is Fsd50kGroundTruthRow => row !== null);
}

function parseClipInfoMap(value: unknown, split: Fsd50kSplit): Map<string, Fsd50kClipInfo> {
  if (!isRecord(value)) {
    throw new Fsd50kHarvestError('INVALID_CLIP_METADATA', `FSD50K ${split} metadata is not an object`);
  }
  const result = new Map<string, Fsd50kClipInfo>();
  for (const [sourceId, rawClip] of Object.entries(value)) {
    if (!/^\d+$/.test(sourceId) || !isRecord(rawClip)) {
      throw new Fsd50kHarvestError(
        'INVALID_CLIP_METADATA',
        `FSD50K ${split} metadata contains an invalid clip entry`,
      );
    }
    const tags = rawClip.tags;
    if (
      typeof rawClip.title !== 'string'
      || typeof rawClip.license !== 'string'
      || typeof rawClip.uploader !== 'string'
      || !Array.isArray(tags)
      || tags.some(tag => typeof tag !== 'string')
    ) {
      throw new Fsd50kHarvestError(
        'INVALID_CLIP_METADATA',
        `FSD50K ${split} source ${sourceId} has malformed metadata`,
      );
    }
    result.set(sourceId, {
      title: rawClip.title,
      tags: tags as string[],
      license: rawClip.license.trim(),
      uploader: rawClip.uploader,
    });
  }
  return result;
}

function assertJoinedSplit(
  rows: Fsd50kGroundTruthRow[],
  clips: Map<string, Fsd50kClipInfo>,
  split: Fsd50kSplit,
): void {
  if (rows.length !== clips.size || rows.some(row => !clips.has(row.sourceId))) {
    throw new Fsd50kHarvestError(
      'FSD50K_JOIN_MISMATCH',
      `FSD50K ${split} ground truth and clip metadata do not describe the same source IDs`,
    );
  }
}

function assertExpectedCount(label: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Fsd50kHarvestError(
      'FSD50K_COUNT_MISMATCH',
      `FSD50K ${label} count ${actual} does not match pinned version ${FSD50K_VERSION} count ${expected}`,
    );
  }
}

function inferProvisionalRoles(
  labels: string[],
  title: string,
  tags: string[],
): { roles: SfxCatalogEventRole[]; evidence: string[] } {
  const uploaderText = [title, ...tags].join(' ');
  const roles: SfxCatalogEventRole[] = [];
  const evidence: string[] = [];
  for (const role of ALL_EDITORIAL_ROLES) {
    const matchedLabel = labels.find(label => ROLE_LABELS[role].includes(label));
    const patterns = UPLOADER_ROLE_PATTERNS[role];
    const matchedUploaderMetadata = patterns.some(pattern => pattern.test(uploaderText));
    if (!matchedLabel && !matchedUploaderMetadata) continue;
    roles.push(role);
    if (matchedLabel) evidence.push(`${role}:ground-truth-label:${matchedLabel}`);
    if (matchedUploaderMetadata) evidence.push(`${role}:untrusted-uploader-metadata`);
  }
  return { roles, evidence };
}

function inferMetadataRiskFlags(
  labels: string[],
  title: string,
  tags: string[],
): Fsd50kMetadataRiskFlag[] {
  const primaryLabel = (labels[0] ?? '').replaceAll('_', ' ');
  const uploaderText = [title, ...tags].join(' ');
  const flags = new Set<Fsd50kMetadataRiskFlag>();
  for (const rule of PRIMARY_AUDIO_RISK_PATTERNS) {
    if (rule.pattern.test(primaryLabel)) flags.add(rule.flag);
  }
  for (const rule of UPLOADER_AUDIO_RISK_PATTERNS) {
    if (rule.pattern.test(uploaderText)) flags.add(rule.flag);
  }
  return [...flags].sort();
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length > 0) {
        throw new Fsd50kHarvestError('INVALID_CSV', 'FSD50K CSV has a quote inside an unquoted field');
      }
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Fsd50kHarvestError('INVALID_CSV', 'FSD50K CSV has an unterminated quote');
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

function commaList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function canonicalCandidate(candidate: Fsd50kHarvestCandidate): string {
  return JSON.stringify({
    sourceId: candidate.sourceId,
    sourceSplit: candidate.sourceSplit,
    sourceTrainingSplit: candidate.sourceTrainingSplit,
    labels: candidate.labels,
    mids: candidate.mids,
    provisionalEditorialRoles: candidate.provisionalEditorialRoles,
    metadataRiskFlags: candidate.metadataRiskFlags,
    clipLicenseId: candidate.provenance.clipLicenseId,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
