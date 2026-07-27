import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { UploadResult } from '@/lib/editron/services/upload-service';
import type { SfxCatalogEventRole } from '@/lib/pipeline/sfx-catalog';
import type { SfxAcousticMeasurement } from '@/lib/pipeline/sfx-acoustic-measurement';

import {
  FSD50K_CC0_LICENSE_URL,
  type Fsd50kHarvestCandidate,
} from './sfx-fsd50k-harvest';

export const FSD50K_SAMPLEABLE_ROLES = [
  'whoosh',
  'impact',
  'tick',
  'pop',
  'ambience',
  'foley',
  'shimmer',
] as const satisfies readonly SfxCatalogEventRole[];

export interface Fsd50kSamplePlanOptions {
  roles?: readonly SfxCatalogEventRole[];
  maxPerRole?: number;
  maxTotal?: number;
  seed?: string;
}

export interface Fsd50kSamplePlanEntry {
  assignedRole: SfxCatalogEventRole;
  evidenceKind: 'ground-truth-label';
  selectionHash: string;
  candidate: Fsd50kHarvestCandidate;
}

export interface Fsd50kSamplePlan {
  version: 'editron-fsd50k-sample-plan-v1';
  seed: string;
  candidatePoolSha256: string;
  policy: {
    clipLicenseAllowlist: ['cc0-1.0'];
    metadataRiskFlagsAllowed: false;
    uploaderMetadataOnlyAllowed: false;
    publicationAllowed: false;
  };
  limits: {
    maxPerRole: number;
    maxTotal: number;
  };
  counts: {
    inputCandidates: number;
    riskRejected: number;
    groundTruthEligible: number;
    selected: number;
  };
  roleCoverage: Array<{
    role: SfxCatalogEventRole;
    eligible: number;
    selected: number;
    gap: boolean;
  }>;
  entries: Fsd50kSamplePlanEntry[];
}

export interface Fsd50kAudioSampleEntry {
  sourceId: string;
  assignedRole: SfxCatalogEventRole;
  status: 'accepted' | 'rejected';
  title: string;
  audioPath?: string;
  contentType?: string;
  byteLength?: number;
  measurement?: SfxAcousticMeasurement;
  audioRights?: AudioRightsContract;
  providerTags?: string[];
  rejectionCode?: string;
  rejectionMessage?: string;
}

export interface Fsd50kAudioSampleReport {
  version: 'editron-fsd50k-audio-sample-v1';
  generatedAt: string;
  candidatePoolSha256: string;
  policy: {
    purpose: 'internal-acoustic-and-embedding-screening';
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    providerLicenseReverified: true;
    acousticGate: 'production-controlled-freesound-ingest';
  };
  counts: {
    requested: number;
    accepted: number;
    rejected: number;
    downloadedBytes: number;
  };
  roleCoverage: Array<{
    role: SfxCatalogEventRole;
    requested: number;
    accepted: number;
    rejected: number;
  }>;
  entries: Fsd50kAudioSampleEntry[];
}

export interface Fsd50kAudioSampleInput {
  plan: Fsd50kSamplePlan;
  outputDirectory: string;
  apiKey: string;
  concurrency?: number;
  generatedAt?: Date;
}

interface LocalPersistedReceipt {
  title: string;
  tags: string[];
  audioRights: AudioRightsContract;
  measurement: SfxAcousticMeasurement;
}

interface ControlledFreesoundPersistedReceipt extends LocalPersistedReceipt {
  userId: string;
  provider: 'freesound';
  providerAssetId: string;
  durationSec: number;
  filename: string;
  bufferSize: number;
  upload: UploadResult;
}

interface ControlledFreesoundIngestDependencies {
  apiKey: string;
  upload: (
    buffer: Buffer,
    userId: string,
    filename: string,
    contentType: string,
    options?: { customAssetId?: string },
  ) => Promise<UploadResult>;
  persist: (record: ControlledFreesoundPersistedReceipt) => Promise<void>;
  cleanupUpload: (upload: UploadResult) => Promise<void>;
}

interface ControlledFreesoundIngestResult {
  audioUrl: string;
  gcsPath: string | null;
  audioAssetId: string;
  durationMs: number;
  audioRights: AudioRightsContract;
  source: 'freesound';
  originalTitle?: string;
  providerAssetId?: string;
  measurement?: SfxAcousticMeasurement;
}

export type Fsd50kControlledFreesoundIngest = (
  providerAssetId: string,
  userId: string,
  dependencies: ControlledFreesoundIngestDependencies,
) => Promise<ControlledFreesoundIngestResult>;

interface Fsd50kAudioSampleDependencies {
  ingest?: Fsd50kControlledFreesoundIngest;
}

export class Fsd50kSamplingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Fsd50kSamplingError';
  }
}

export function parseFsd50kCandidateIndex(ndjson: string): Fsd50kHarvestCandidate[] {
  const candidates: Fsd50kHarvestCandidate[] = [];
  const seen = new Set<string>();
  for (const [index, rawLine] of ndjson.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Fsd50kSamplingError(
        'INVALID_CANDIDATE_INDEX',
        `FSD50K candidate index line ${index + 1} is not valid JSON`,
      );
    }
    const candidate = validateCandidate(value, index + 1);
    if (seen.has(candidate.sourceId)) {
      throw new Fsd50kSamplingError(
        'DUPLICATE_CANDIDATE',
        `FSD50K candidate index repeats source ${candidate.sourceId}`,
      );
    }
    seen.add(candidate.sourceId);
    candidates.push(candidate);
  }
  if (candidates.length === 0) {
    throw new Fsd50kSamplingError(
      'EMPTY_CANDIDATE_INDEX',
      'FSD50K candidate index contains no candidates',
    );
  }
  return candidates;
}

export function planFsd50kAudioSample(
  candidates: readonly Fsd50kHarvestCandidate[],
  options: Fsd50kSamplePlanOptions = {},
): Fsd50kSamplePlan {
  const roles = [...new Set(options.roles ?? FSD50K_SAMPLEABLE_ROLES)];
  const maxPerRole = boundedInteger(options.maxPerRole ?? 5, 1, 100, 'maxPerRole');
  const maxTotal = boundedInteger(
    options.maxTotal ?? maxPerRole * Math.max(1, roles.length),
    1,
    1_000,
    'maxTotal',
  );
  const seed = sanitizeSeed(options.seed ?? 'editron-fsd50k-p7f1-v1');
  const riskFree = candidates.filter(candidate => candidate.metadataRiskFlags.length === 0);
  const selectedIds = new Set<string>();
  const entries: Fsd50kSamplePlanEntry[] = [];
  const eligibleByRole = new Map<SfxCatalogEventRole, Fsd50kHarvestCandidate[]>();

  for (const role of roles) {
    const eligible = riskFree
      .filter(candidate => hasGroundTruthRoleEvidence(candidate, role))
      .sort((left, right) => compareCandidateHash(left, right, seed, role));
    eligibleByRole.set(role, eligible);
  }

  const allocationOrder = [...roles].sort((left, right) => (
    (eligibleByRole.get(left)?.length ?? 0) - (eligibleByRole.get(right)?.length ?? 0)
    || left.localeCompare(right)
  ));
  for (const role of allocationOrder) {
    if (entries.length >= maxTotal) break;
    let roleCount = 0;
    for (const candidate of eligibleByRole.get(role) ?? []) {
      if (roleCount >= maxPerRole || entries.length >= maxTotal) break;
      if (selectedIds.has(candidate.sourceId)) continue;
      selectedIds.add(candidate.sourceId);
      roleCount += 1;
      entries.push({
        assignedRole: role,
        evidenceKind: 'ground-truth-label',
        selectionHash: selectionHash(seed, role, candidate.sourceId),
        candidate,
      });
    }
  }

  const roleOrder = new Map(roles.map((role, index) => [role, index]));
  entries.sort((left, right) => (
    (roleOrder.get(left.assignedRole) ?? Number.MAX_SAFE_INTEGER)
      - (roleOrder.get(right.assignedRole) ?? Number.MAX_SAFE_INTEGER)
    || left.selectionHash.localeCompare(right.selectionHash)
  ));
  const groundTruthEligible = new Set(
    [...eligibleByRole.values()].flat().map(candidate => candidate.sourceId),
  ).size;

  return {
    version: 'editron-fsd50k-sample-plan-v1',
    seed,
    candidatePoolSha256: hashCandidates(candidates),
    policy: {
      clipLicenseAllowlist: ['cc0-1.0'],
      metadataRiskFlagsAllowed: false,
      uploaderMetadataOnlyAllowed: false,
      publicationAllowed: false,
    },
    limits: { maxPerRole, maxTotal },
    counts: {
      inputCandidates: candidates.length,
      riskRejected: candidates.length - riskFree.length,
      groundTruthEligible,
      selected: entries.length,
    },
    roleCoverage: roles.map(role => {
      const eligible = eligibleByRole.get(role)?.length ?? 0;
      const selected = entries.filter(entry => entry.assignedRole === role).length;
      return { role, eligible, selected, gap: eligible === 0 };
    }),
    entries,
  };
}

export async function sampleFsd50kAudio(
  input: Fsd50kAudioSampleInput,
  dependencies: Fsd50kAudioSampleDependencies = {},
): Promise<Fsd50kAudioSampleReport> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Fsd50kSamplingError(
      'FREESOUND_NOT_CONFIGURED',
      'FREESOUND_API_KEY is required to sample FSD50K audio',
    );
  }
  const generatedAt = input.generatedAt ?? new Date();
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Fsd50kSamplingError('INVALID_SAMPLE_CLOCK', 'Sample timestamp is invalid');
  }
  const concurrency = boundedInteger(input.concurrency ?? 2, 1, 4, 'concurrency');
  const outputDirectory = path.resolve(input.outputDirectory);
  const audioDirectory = path.join(outputDirectory, 'audio');
  await mkdir(audioDirectory, { recursive: true });
  await atomicWrite(
    path.join(outputDirectory, 'sample-plan.json'),
    `${JSON.stringify(input.plan, null, 2)}\n`,
  );

  const ingest = dependencies.ingest ?? controlledFreesoundIngest;
  const entries = await mapWithConcurrency(
    input.plan.entries,
    concurrency,
    entry => sampleOneEntry(entry, audioDirectory, apiKey, ingest),
  );
  const report: Fsd50kAudioSampleReport = {
    version: 'editron-fsd50k-audio-sample-v1',
    generatedAt: generatedAt.toISOString(),
    candidatePoolSha256: input.plan.candidatePoolSha256,
    policy: {
      purpose: 'internal-acoustic-and-embedding-screening',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      providerLicenseReverified: true,
      acousticGate: 'production-controlled-freesound-ingest',
    },
    counts: {
      requested: entries.length,
      accepted: entries.filter(entry => entry.status === 'accepted').length,
      rejected: entries.filter(entry => entry.status === 'rejected').length,
      downloadedBytes: entries.reduce((total, entry) => total + (entry.byteLength ?? 0), 0),
    },
    roleCoverage: input.plan.roleCoverage.map(({ role }) => {
      const roleEntries = entries.filter(entry => entry.assignedRole === role);
      return {
        role,
        requested: roleEntries.length,
        accepted: roleEntries.filter(entry => entry.status === 'accepted').length,
        rejected: roleEntries.filter(entry => entry.status === 'rejected').length,
      };
    }),
    entries,
  };
  await atomicWrite(
    path.join(outputDirectory, 'sample-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function sampleOneEntry(
  entry: Fsd50kSamplePlanEntry,
  audioDirectory: string,
  apiKey: string,
  ingest: Fsd50kControlledFreesoundIngest,
): Promise<Fsd50kAudioSampleEntry> {
  const capture: { receipt?: LocalPersistedReceipt; upload?: UploadResult } = {};
  let writtenPath: string | undefined;
  try {
    const result = await ingest(entry.candidate.sourceId, 'fsd50k-screening', {
      apiKey,
      upload: async (buffer, _userId, _filename, contentType, options) => {
        const extension = extensionForAudioContentType(contentType);
        const audioPath = path.join(audioDirectory, `${entry.candidate.sourceId}.${extension}`);
        await atomicWrite(audioPath, buffer);
        writtenPath = audioPath;
        const upload: UploadResult = {
          assetId: options?.customAssetId ?? `fsd50k_${entry.candidate.sourceId}`,
          signedUrl: pathToFileURL(audioPath).href,
          gcsPath: null,
          r2Key: null,
          urlExpiresAt: null,
          size: buffer.byteLength,
          contentType,
        };
        capture.upload = upload;
        return upload;
      },
      persist: async record => {
        capture.receipt = {
          title: record.title,
          tags: record.tags,
          audioRights: record.audioRights,
          measurement: record.measurement,
        };
      },
      cleanupUpload: async () => {
        if (writtenPath) await rm(writtenPath, { force: true });
      },
    });
    if (!writtenPath || !capture.upload || !capture.receipt || !result.measurement) {
      throw new Fsd50kSamplingError(
        'INCOMPLETE_SAMPLE_RECEIPT',
        `Freesound source ${entry.candidate.sourceId} produced an incomplete screening receipt`,
      );
    }
    return {
      sourceId: entry.candidate.sourceId,
      assignedRole: entry.assignedRole,
      status: 'accepted',
      title: capture.receipt.title,
      audioPath: path.relative(path.dirname(audioDirectory), writtenPath).replaceAll('\\', '/'),
      contentType: capture.upload.contentType,
      byteLength: capture.upload.size,
      measurement: capture.receipt.measurement,
      audioRights: capture.receipt.audioRights,
      providerTags: capture.receipt.tags,
    };
  } catch (error) {
    if (writtenPath) await rm(writtenPath, { force: true });
    return {
      sourceId: entry.candidate.sourceId,
      assignedRole: entry.assignedRole,
      status: 'rejected',
      title: entry.candidate.title,
      rejectionCode: error instanceof Fsd50kSamplingError
        ? error.code
        : isRecord(error) && typeof error.code === 'string'
          ? error.code
        : 'UNEXPECTED_SAMPLE_FAILURE',
      rejectionMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function controlledFreesoundIngest(
  providerAssetId: string,
  userId: string,
  dependencies: ControlledFreesoundIngestDependencies,
): Promise<ControlledFreesoundIngestResult> {
  const { ingestFreesoundSfxById } = await import('@/lib/pipeline/sfx-library-service');
  const result = await ingestFreesoundSfxById(providerAssetId, userId, dependencies);
  if (result.source !== 'freesound') {
    throw new Fsd50kSamplingError(
      'PROVIDER_IDENTITY_MISMATCH',
      `FSD50K source ${providerAssetId} resolved through an unexpected provider`,
    );
  }
  return {
    audioUrl: result.audioUrl,
    gcsPath: result.gcsPath,
    audioAssetId: result.audioAssetId,
    durationMs: result.durationMs,
    audioRights: result.audioRights,
    source: result.source,
    originalTitle: result.originalTitle,
    providerAssetId: result.providerAssetId,
    measurement: result.measurement,
  };
}

function validateCandidate(value: unknown, lineNumber: number): Fsd50kHarvestCandidate {
  if (!isRecord(value)) {
    throw invalidCandidate(lineNumber);
  }
  const provenance = value.provenance;
  if (
    value.version !== 'editron-fsd50k-candidate-v1'
    || typeof value.sourceId !== 'string'
    || !/^[1-9]\d{0,14}$/.test(value.sourceId)
    || !Array.isArray(value.provisionalEditorialRoles)
    || !value.provisionalEditorialRoles.every(role => typeof role === 'string')
    || !Array.isArray(value.provisionalRoleEvidence)
    || !value.provisionalRoleEvidence.every(evidence => typeof evidence === 'string')
    || !Array.isArray(value.metadataRiskFlags)
    || !value.metadataRiskFlags.every(flag => typeof flag === 'string')
    || !isRecord(provenance)
    || provenance.provider !== 'fsd50k'
    || provenance.upstreamProvider !== 'freesound'
    || provenance.providerAssetId !== value.sourceId
    || provenance.clipLicenseId !== 'cc0-1.0'
    || provenance.clipLicenseUrl !== FSD50K_CC0_LICENSE_URL
  ) {
    throw invalidCandidate(lineNumber);
  }
  return value as unknown as Fsd50kHarvestCandidate;
}

function invalidCandidate(lineNumber: number): Fsd50kSamplingError {
  return new Fsd50kSamplingError(
    'INVALID_CANDIDATE',
    `FSD50K candidate index line ${lineNumber} violates the v1 rights/evidence contract`,
  );
}

function hasGroundTruthRoleEvidence(
  candidate: Fsd50kHarvestCandidate,
  role: SfxCatalogEventRole,
): boolean {
  return candidate.provisionalEditorialRoles.includes(role)
    && candidate.provisionalRoleEvidence.some(evidence => (
      evidence.startsWith(`${role}:ground-truth-label:`)
    ));
}

function compareCandidateHash(
  left: Fsd50kHarvestCandidate,
  right: Fsd50kHarvestCandidate,
  seed: string,
  role: SfxCatalogEventRole,
): number {
  return selectionHash(seed, role, left.sourceId)
    .localeCompare(selectionHash(seed, role, right.sourceId));
}

function selectionHash(seed: string, role: SfxCatalogEventRole, sourceId: string): string {
  return createHash('sha256').update(`${seed}:${role}:${sourceId}`).digest('hex');
}

function hashCandidates(candidates: readonly Fsd50kHarvestCandidate[]): string {
  const canonical = [...candidates]
    .sort((left, right) => Number(left.sourceId) - Number(right.sourceId))
    .map(candidate => JSON.stringify(candidate))
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

function sanitizeSeed(value: string): string {
  const seed = value.trim();
  if (!seed || seed.length > 100 || !/^[A-Za-z0-9._-]+$/.test(seed)) {
    throw new Fsd50kSamplingError(
      'INVALID_SAMPLE_SEED',
      'Sample seed must contain 1-100 letters, numbers, dots, underscores or hyphens',
    );
  }
  return seed;
}

function boundedInteger(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Fsd50kSamplingError(
      'INVALID_SAMPLE_LIMIT',
      `${name} must be an integer between ${min} and ${max}`,
    );
  }
  return value;
}

function extensionForAudioContentType(contentType: string): 'mp3' | 'ogg' {
  if (contentType === 'audio/mpeg') return 'mp3';
  if (contentType === 'audio/ogg' || contentType === 'application/ogg') return 'ogg';
  throw new Fsd50kSamplingError(
    'UNSUPPORTED_SAMPLE_CONTENT_TYPE',
    `Unsupported Freesound screening content type: ${contentType}`,
  );
}

async function atomicWrite(filePath: string, value: string | Buffer): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, value);
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

async function mapWithConcurrency<T, TResult>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()),
  );
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
