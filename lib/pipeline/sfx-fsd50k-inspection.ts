import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  AudioConditioningError,
  inspectEncodedSfxAudio,
  MAX_AUDIO_CONDITIONING_INPUT_BYTES,
  type EncodedSfxInspection,
} from '@/lib/pipeline/audio-conditioning';
import {
  buildSfxAcousticMeasurement,
  MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS,
  sfxAcousticMeasurementSchema,
  type SfxAcousticMeasurement,
} from '@/lib/pipeline/sfx-acoustic-measurement';
import { BUNDLED_SFX_CATALOG } from '@/lib/pipeline/sfx-catalog';

import type {
  Fsd50kCorpusPlan,
  Fsd50kCorpusPlanEntry,
} from './sfx-fsd50k-corpus';
import type {
  Fsd50kCandidateExtractionEntry,
  Fsd50kCandidateExtractionReceipt,
} from './sfx-fsd50k-extract';
import { FSD50K_EXPECTED_COUNTS } from './sfx-fsd50k-harvest';

const INSPECTION_INDEX_FILENAME = 'inspection-index.json';
const LOCK_DIRECTORY_NAME = '.inspection.lock';
const LOCK_OWNER_FILENAME = 'owner.json';
const MAX_INSPECTION_CONCURRENCY = 8;
const INVALID_LOCK_GRACE_MS = 60_000;

const DEFINITIVE_METADATA_REJECT_FLAGS = [
  'primary-label-speech',
  'primary-label-music',
] as const;

const METADATA_QUARANTINE_FLAGS = [
  'uploader-metadata-vocal',
  'uploader-metadata-music',
  'uploader-metadata-noisy',
] as const;

const SOURCE_REJECTION_ERROR_CODES = new Set([
  'INPUT_TOO_LARGE',
  'DECODE_FAILED',
  'INVALID_PCM',
  'UNSUPPORTED_CHANNELS',
  'AUDIO_SILENT',
]);

export type Fsd50kInspectionStatus =
  | 'accepted-for-embedding'
  | 'quarantined-metadata'
  | 'rejected-metadata'
  | 'rejected-acoustic';

export interface Fsd50kInspectionPolicy {
  version: 'editron-fsd50k-inspection-policy-v1';
  purpose: 'offline-acoustic-screening-and-exact-dedup';
  publicationAllowed: false;
  productionCatalogMutationAllowed: false;
  acoustic: {
    silenceFloorLufs: number;
    maxTruePeakDbtp: number;
    minSampleRateHz: number;
    allowedChannelCounts: number[];
    maxDurationMs: number;
  };
  metadata: {
    definitiveRejectFlags: string[];
    quarantineFlags: string[];
  };
}

export type Fsd50kCheckpointAcousticOutcome =
  | {
    outcome: 'accepted';
    measurement: SfxAcousticMeasurement;
  }
  | {
    outcome: 'rejected';
    code: string;
    message: string;
  };

export interface Fsd50kInspectionCheckpoint {
  version: 'editron-fsd50k-acoustic-checkpoint-v1';
  completedAt: string;
  source: {
    candidatePoolSha256: string;
    extractionDigestSha256: string;
    policySha256: string;
    sourceId: string;
    sourceAudioPath: string;
    sourceHashSha256: string;
    sizeBytes: number;
  };
  exactDuplicate: {
    canonicalSourceId: string;
    memberSourceIds: string[];
    isCanonical: boolean;
  };
  metadata: {
    labels: string[];
    riskFlags: string[];
    definitiveRejectFlags: string[];
    quarantineFlags: string[];
  };
  acoustic: Fsd50kCheckpointAcousticOutcome;
  decision: {
    status: Fsd50kInspectionStatus;
    embeddingDisposition: 'classify' | 'skip';
    reasons: string[];
  };
  checkpointDigestSha256: string;
}

export interface Fsd50kInspectionIndexEntry {
  sourceId: string;
  sourceAudioPath: string;
  sourceHashSha256: string;
  canonicalSourceId: string;
  exactDuplicate: boolean;
  status: Fsd50kInspectionStatus;
  embeddingDisposition: 'classify' | 'skip';
  checkpointPath: string;
  labels: string[];
  provisionalEditorialRoles: Fsd50kCorpusPlanEntry['provisionalEditorialRoles'];
  provisionalRoleEvidence: string[];
  metadataRiskFlags: string[];
}

export interface Fsd50kExactDuplicateGroup {
  sourceHashSha256: string;
  canonicalSourceId: string;
  memberSourceIds: string[];
}

export interface Fsd50kEmbeddingQueueEntry {
  canonicalSourceId: string;
  sourceAudioPath: string;
  sourceHashSha256: string;
  memberSourceIds: string[];
  measurement: SfxAcousticMeasurement;
}

export interface Fsd50kInspectionIndex {
  version: 'editron-fsd50k-inspection-index-v1';
  completedAt: string;
  source: {
    candidatePoolSha256: string;
    archiveSetSha256: string;
    extractionDigestSha256: string;
  };
  selection: {
    mode: 'full-corpus' | 'deterministic-prefix-canary';
    requestedLimit: number | null;
    selectionSha256: string;
  };
  policy: Fsd50kInspectionPolicy & { policySha256: string };
  counts: {
    plannedCandidates: number;
    selectedCandidates: number;
    completedCheckpoints: number;
    uniqueContentHashes: number;
    exactDuplicateGroups: number;
    exactDuplicateEntries: number;
    exactDuplicatesBeyondCanonical: number;
    acceptedForEmbedding: number;
    quarantinedMetadata: number;
    rejectedMetadata: number;
    rejectedAcoustic: number;
    embeddingQueueUniqueAudio: number;
  };
  entries: Fsd50kInspectionIndexEntry[];
  exactDuplicateGroups: Fsd50kExactDuplicateGroup[];
  embeddingQueue: Fsd50kEmbeddingQueueEntry[];
  analysisDigestSha256: string;
}

export interface InspectFsd50kCorpusOptions {
  corpusPlan: unknown;
  extractionReceipt: unknown;
  extractionDirectory: string;
  outputDirectory: string;
  limit?: number;
  concurrency?: number;
  completedAt?: Date;
  expectedCandidateCount?: number;
  signal?: AbortSignal;
  onProgress?: (event: {
    completedSources: number;
    totalSources: number;
    completedUniqueAudio: number;
    totalUniqueAudio: number;
    sourceId: string;
    reusedCheckpoints: number;
    newCheckpoints: number;
  }) => void | Promise<void>;
}

export interface InspectFsd50kCorpusDependencies {
  inspectAudio?: (buffer: Buffer) => Promise<EncodedSfxInspection>;
  processIsAlive?: (pid: number) => boolean;
}

export interface InspectFsd50kCorpusResult {
  index: Fsd50kInspectionIndex;
  indexPath: string;
  reusedExistingIndex: boolean;
  recoveredStaleLock: boolean;
  runCounts: {
    reusedCheckpoints: number;
    newCheckpoints: number;
    reusedAcousticOutcomes: number;
    newAcousticOutcomes: number;
  };
}

interface ValidatedInspectionInput {
  plan: Fsd50kCorpusPlan;
  extractionReceipt: Fsd50kCandidateExtractionReceipt;
  selectedPlanEntries: Fsd50kCorpusPlanEntry[];
  selectedExtractionEntries: Fsd50kCandidateExtractionEntry[];
  selectionSha256: string;
}

interface SourceGroup {
  sourceHashSha256: string;
  canonicalSourceId: string;
  members: Array<{
    plan: Fsd50kCorpusPlanEntry;
    extraction: Fsd50kCandidateExtractionEntry;
  }>;
}

interface VerifiedSource {
  buffer?: Buffer;
  oversized: boolean;
}

interface ProcessedGroup {
  checkpoints: Fsd50kInspectionCheckpoint[];
  reusedCheckpoints: number;
  newCheckpoints: number;
  reusedAcousticOutcome: boolean;
}

interface InspectionLock {
  recoveredStaleLock: boolean;
  release(): Promise<void>;
}

export class Fsd50kInspectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kInspectionError';
  }
}

export async function inspectFsd50kCorpus(
  options: InspectFsd50kCorpusOptions,
  dependencies: InspectFsd50kCorpusDependencies = {},
): Promise<InspectFsd50kCorpusResult> {
  const completedAt = options.completedAt ?? new Date();
  if (Number.isNaN(completedAt.getTime())) {
    throw new Fsd50kInspectionError(
      'INVALID_INSPECTION_CLOCK',
      'FSD50K inspection timestamp is invalid',
    );
  }
  const expectedCandidateCount =
    options.expectedCandidateCount ?? FSD50K_EXPECTED_COUNTS.cc0;
  const validated = validateInspectionInput(
    options.corpusPlan,
    options.extractionReceipt,
    expectedCandidateCount,
    options.limit,
  );
  const concurrency = boundedInteger(
    options.concurrency ?? 2,
    1,
    MAX_INSPECTION_CONCURRENCY,
    'concurrency',
  );
  const extractionDirectory = path.resolve(options.extractionDirectory);
  const outputDirectory = path.resolve(options.outputDirectory);
  assertSafeDirectory(extractionDirectory, 'extraction');
  assertSafeDirectory(outputDirectory, 'inspection output');
  const policy = buildFsd50kInspectionPolicy();
  const policySha256 = hashCanonical(policy);
  const groups = groupExactDuplicates(
    validated.selectedPlanEntries,
    validated.selectedExtractionEntries,
  );
  const lock = await acquireInspectionLock(
    outputDirectory,
    dependencies.processIsAlive ?? isProcessAlive,
  );
  const inspectAudio = dependencies.inspectAudio ?? inspectEncodedSfxAudio;
  let completedSources = 0;
  let completedUniqueAudio = 0;
  let reusedCheckpoints = 0;
  let newCheckpoints = 0;
  let reusedAcousticOutcomes = 0;
  let newAcousticOutcomes = 0;

  try {
    throwIfAborted(options.signal);
    const processed = await mapWithConcurrency(groups, concurrency, async group => {
      throwIfAborted(options.signal);
      const result = await processSourceGroup({
        group,
        validated,
        extractionDirectory,
        outputDirectory,
        policy,
        policySha256,
        completedAt,
        inspectAudio,
      });
      reusedCheckpoints += result.reusedCheckpoints;
      newCheckpoints += result.newCheckpoints;
      if (result.reusedAcousticOutcome) reusedAcousticOutcomes += 1;
      else newAcousticOutcomes += 1;
      completedSources += group.members.length;
      completedUniqueAudio += 1;
      await options.onProgress?.({
        completedSources,
        totalSources: validated.selectedPlanEntries.length,
        completedUniqueAudio,
        totalUniqueAudio: groups.length,
        sourceId: group.canonicalSourceId,
        reusedCheckpoints,
        newCheckpoints,
      });
      throwIfAborted(options.signal);
      return result;
    });

    const checkpoints = processed
      .flatMap(item => item.checkpoints)
      .sort((left, right) => compareSourceIds(left.source.sourceId, right.source.sourceId));
    const index = buildInspectionIndex({
      completedAt,
      validated,
      policy,
      policySha256,
      groups,
      checkpoints,
      outputDirectory,
    });
    const indexPath = path.join(outputDirectory, INSPECTION_INDEX_FILENAME);
    const existingIndex = await readExistingIndex(indexPath);
    if (existingIndex) {
      if (existingIndex.analysisDigestSha256 !== index.analysisDigestSha256) {
        throw new Fsd50kInspectionError(
          'INSPECTION_INDEX_MISMATCH',
          'Existing FSD50K inspection index does not match the completed checkpoints',
        );
      }
      return {
        index: existingIndex,
        indexPath,
        reusedExistingIndex: true,
        recoveredStaleLock: lock.recoveredStaleLock,
        runCounts: {
          reusedCheckpoints,
          newCheckpoints,
          reusedAcousticOutcomes,
          newAcousticOutcomes,
        },
      };
    }
    await atomicWriteJson(indexPath, index);
    return {
      index,
      indexPath,
      reusedExistingIndex: false,
      recoveredStaleLock: lock.recoveredStaleLock,
      runCounts: {
        reusedCheckpoints,
        newCheckpoints,
        reusedAcousticOutcomes,
        newAcousticOutcomes,
      },
    };
  } finally {
    await lock.release();
  }
}

export function buildFsd50kInspectionPolicy(): Fsd50kInspectionPolicy {
  const quality = BUNDLED_SFX_CATALOG.qualityPolicy;
  return {
    version: 'editron-fsd50k-inspection-policy-v1',
    purpose: 'offline-acoustic-screening-and-exact-dedup',
    publicationAllowed: false,
    productionCatalogMutationAllowed: false,
    acoustic: {
      silenceFloorLufs: quality.silenceFloorLufs,
      maxTruePeakDbtp: quality.maxTruePeakDbtp,
      minSampleRateHz: quality.minSampleRateHz,
      allowedChannelCounts: [...quality.allowedChannelCounts],
      maxDurationMs: MAX_SFX_ACOUSTIC_MEASUREMENT_DURATION_MS,
    },
    metadata: {
      definitiveRejectFlags: [...DEFINITIVE_METADATA_REJECT_FLAGS],
      quarantineFlags: [...METADATA_QUARANTINE_FLAGS],
    },
  };
}

async function processSourceGroup(input: {
  group: SourceGroup;
  validated: ValidatedInspectionInput;
  extractionDirectory: string;
  outputDirectory: string;
  policy: Fsd50kInspectionPolicy;
  policySha256: string;
  completedAt: Date;
  inspectAudio: (buffer: Buffer) => Promise<EncodedSfxInspection>;
}): Promise<ProcessedGroup> {
  const verifiedSources = new Map<string, VerifiedSource>();
  const existingCheckpoints = new Map<string, Fsd50kInspectionCheckpoint>();
  for (const member of input.group.members) {
    verifiedSources.set(
      member.plan.sourceId,
      await readAndVerifySource(input.extractionDirectory, member.extraction),
    );
    const checkpoint = await readCheckpoint(
      checkpointPath(input.outputDirectory, member.extraction),
      member,
      input.group,
      input.validated,
      input.policy,
      input.policySha256,
    );
    if (checkpoint) existingCheckpoints.set(member.plan.sourceId, checkpoint);
  }

  const existingOutcomes = [...existingCheckpoints.values()]
    .map(checkpoint => checkpoint.acoustic);
  let acoustic = existingOutcomes[0];
  if (
    acoustic
    && existingOutcomes.some(outcome => hashCanonical(outcome) !== hashCanonical(acoustic))
  ) {
    throw new Fsd50kInspectionError(
      'CHECKPOINT_GROUP_CONFLICT',
      `Exact-duplicate group ${input.group.canonicalSourceId} has conflicting acoustic checkpoints`,
    );
  }
  const reusedAcousticOutcome = Boolean(acoustic);
  if (!acoustic) {
    const canonical = verifiedSources.get(input.group.canonicalSourceId);
    if (!canonical) {
      throw new Fsd50kInspectionError(
        'MISSING_CANONICAL_SOURCE',
        `No verified source exists for canonical ID ${input.group.canonicalSourceId}`,
      );
    }
    acoustic = canonical.oversized
      ? rejectedAcousticOutcome(
        'INPUT_TOO_LARGE',
        `Encoded SFX exceeds ${MAX_AUDIO_CONDITIONING_INPUT_BYTES} bytes`,
      )
      : await inspectUniqueAudio(
        canonical.buffer ?? failMissingBuffer(input.group.canonicalSourceId),
        input.policy,
        input.completedAt,
        input.inspectAudio,
      );
  }

  const checkpoints: Fsd50kInspectionCheckpoint[] = [];
  let newCheckpoints = 0;
  for (const member of input.group.members) {
    const existing = existingCheckpoints.get(member.plan.sourceId);
    if (existing) {
      checkpoints.push(existing);
      continue;
    }
    const checkpoint = buildCheckpoint({
      completedAt: input.completedAt,
      candidate: member.plan,
      extraction: member.extraction,
      group: input.group,
      candidatePoolSha256: input.validated.plan.candidatePoolSha256,
      extractionDigestSha256: input.validated.extractionReceipt.extractionDigestSha256,
      policy: input.policy,
      policySha256: input.policySha256,
      acoustic,
    });
    await atomicWriteJson(
      checkpointPath(input.outputDirectory, member.extraction),
      checkpoint,
    );
    checkpoints.push(checkpoint);
    newCheckpoints += 1;
  }
  return {
    checkpoints,
    reusedCheckpoints: existingCheckpoints.size,
    newCheckpoints,
    reusedAcousticOutcome,
  };
}

async function inspectUniqueAudio(
  buffer: Buffer,
  policy: Fsd50kInspectionPolicy,
  inspectedAt: Date,
  inspectAudio: (buffer: Buffer) => Promise<EncodedSfxInspection>,
): Promise<Fsd50kCheckpointAcousticOutcome> {
  let inspection: EncodedSfxInspection;
  try {
    inspection = await inspectAudio(buffer);
  } catch (error) {
    if (
      error instanceof AudioConditioningError
      && SOURCE_REJECTION_ERROR_CODES.has(error.code)
    ) {
      return rejectedAcousticOutcome(error.code, boundedMessage(error.message));
    }
    throw new Fsd50kInspectionError(
      'ACOUSTIC_INSPECTION_INFRASTRUCTURE_FAILED',
      `FSD50K acoustic inspection infrastructure failed: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  const measurement = buildSfxAcousticMeasurement(buffer, inspection, inspectedAt);
  const rejection = evaluateAcousticPolicy(measurement, policy);
  return rejection ?? { outcome: 'accepted', measurement };
}

function evaluateAcousticPolicy(
  measurement: SfxAcousticMeasurement,
  policy: Fsd50kInspectionPolicy,
): Fsd50kCheckpointAcousticOutcome | null {
  if (measurement.loudnessDb <= policy.acoustic.silenceFloorLufs) {
    return rejectedAcousticOutcome(
      'BELOW_CATALOG_LOUDNESS_FLOOR',
      `Measured ${measurement.loudnessDb} dB at or below ${policy.acoustic.silenceFloorLufs} dB`,
    );
  }
  if (measurement.truePeakDbtp > policy.acoustic.maxTruePeakDbtp) {
    return rejectedAcousticOutcome(
      'CATALOG_TRUE_PEAK_EXCEEDED',
      `Measured ${measurement.truePeakDbtp} dBTP above ${policy.acoustic.maxTruePeakDbtp} dBTP`,
    );
  }
  if (measurement.sampleRateHz < policy.acoustic.minSampleRateHz) {
    return rejectedAcousticOutcome(
      'CATALOG_SAMPLE_RATE_TOO_LOW',
      `Measured ${measurement.sampleRateHz}Hz below ${policy.acoustic.minSampleRateHz}Hz`,
    );
  }
  if (!policy.acoustic.allowedChannelCounts.includes(measurement.channelCount)) {
    return rejectedAcousticOutcome(
      'CATALOG_CHANNEL_COUNT_UNSUPPORTED',
      `Measured ${measurement.channelCount} channels outside the catalog allowlist`,
    );
  }
  if (measurement.durationMs > policy.acoustic.maxDurationMs) {
    return rejectedAcousticOutcome(
      'CATALOG_DURATION_EXCEEDED',
      `Measured ${measurement.durationMs}ms above ${policy.acoustic.maxDurationMs}ms`,
    );
  }
  return null;
}

function buildCheckpoint(input: {
  completedAt: Date;
  candidate: Fsd50kCorpusPlanEntry;
  extraction: Fsd50kCandidateExtractionEntry;
  group: SourceGroup;
  candidatePoolSha256: string;
  extractionDigestSha256: string;
  policy: Fsd50kInspectionPolicy;
  policySha256: string;
  acoustic: Fsd50kCheckpointAcousticOutcome;
}): Fsd50kInspectionCheckpoint {
  const definitiveRejectFlags = input.candidate.metadataRiskFlags.filter(flag => (
    input.policy.metadata.definitiveRejectFlags.includes(flag)
  ));
  const quarantineFlags = input.candidate.metadataRiskFlags.filter(flag => (
    input.policy.metadata.quarantineFlags.includes(flag)
  ));
  const decision = decideInspectionStatus(
    input.acoustic,
    definitiveRejectFlags,
    quarantineFlags,
  );
  const checkpointWithoutDigest = {
    version: 'editron-fsd50k-acoustic-checkpoint-v1' as const,
    completedAt: input.completedAt.toISOString(),
    source: {
      candidatePoolSha256: input.candidatePoolSha256,
      extractionDigestSha256: input.extractionDigestSha256,
      policySha256: input.policySha256,
      sourceId: input.candidate.sourceId,
      sourceAudioPath: input.candidate.sourceAudioPath,
      sourceHashSha256: input.extraction.sha256,
      sizeBytes: input.extraction.sizeBytes,
    },
    exactDuplicate: {
      canonicalSourceId: input.group.canonicalSourceId,
      memberSourceIds: input.group.members.map(member => member.plan.sourceId),
      isCanonical: input.candidate.sourceId === input.group.canonicalSourceId,
    },
    metadata: {
      labels: [...input.candidate.labels],
      riskFlags: [...input.candidate.metadataRiskFlags],
      definitiveRejectFlags,
      quarantineFlags,
    },
    acoustic: input.acoustic,
    decision,
  };
  return {
    ...checkpointWithoutDigest,
    checkpointDigestSha256: hashCanonical(checkpointWithoutDigest),
  };
}

function decideInspectionStatus(
  acoustic: Fsd50kCheckpointAcousticOutcome,
  definitiveRejectFlags: readonly string[],
  quarantineFlags: readonly string[],
): Fsd50kInspectionCheckpoint['decision'] {
  if (acoustic.outcome === 'rejected') {
    return {
      status: 'rejected-acoustic',
      embeddingDisposition: 'skip',
      reasons: [`acoustic:${acoustic.code}`],
    };
  }
  if (definitiveRejectFlags.length > 0) {
    return {
      status: 'rejected-metadata',
      embeddingDisposition: 'skip',
      reasons: definitiveRejectFlags.map(flag => `metadata-definitive:${flag}`),
    };
  }
  if (quarantineFlags.length > 0) {
    return {
      status: 'quarantined-metadata',
      embeddingDisposition: 'classify',
      reasons: quarantineFlags.map(flag => `metadata-review:${flag}`),
    };
  }
  return {
    status: 'accepted-for-embedding',
    embeddingDisposition: 'classify',
    reasons: ['acoustic-policy-accepted', 'metadata-policy-accepted'],
  };
}

function buildInspectionIndex(input: {
  completedAt: Date;
  validated: ValidatedInspectionInput;
  policy: Fsd50kInspectionPolicy;
  policySha256: string;
  groups: SourceGroup[];
  checkpoints: Fsd50kInspectionCheckpoint[];
  outputDirectory: string;
}): Fsd50kInspectionIndex {
  if (input.checkpoints.length !== input.validated.selectedPlanEntries.length) {
    throw new Fsd50kInspectionError(
      'INCOMPLETE_INSPECTION',
      `Expected ${input.validated.selectedPlanEntries.length} checkpoints, received ${input.checkpoints.length}`,
    );
  }
  const checkpointBySourceId = new Map(
    input.checkpoints.map(checkpoint => [checkpoint.source.sourceId, checkpoint]),
  );
  const planBySourceId = new Map(
    input.validated.selectedPlanEntries.map(entry => [entry.sourceId, entry]),
  );
  const exactDuplicateGroups = input.groups
    .filter(group => group.members.length > 1)
    .map<Fsd50kExactDuplicateGroup>(group => ({
      sourceHashSha256: group.sourceHashSha256,
      canonicalSourceId: group.canonicalSourceId,
      memberSourceIds: group.members.map(member => member.plan.sourceId),
    }));
  const entries = input.validated.selectedPlanEntries.map<Fsd50kInspectionIndexEntry>(
    candidate => {
      const checkpoint = checkpointBySourceId.get(candidate.sourceId)
        ?? failMissingCheckpoint(candidate.sourceId);
      return {
        sourceId: candidate.sourceId,
        sourceAudioPath: candidate.sourceAudioPath,
        sourceHashSha256: checkpoint.source.sourceHashSha256,
        canonicalSourceId: checkpoint.exactDuplicate.canonicalSourceId,
        exactDuplicate: checkpoint.exactDuplicate.memberSourceIds.length > 1,
        status: checkpoint.decision.status,
        embeddingDisposition: checkpoint.decision.embeddingDisposition,
        checkpointPath: path
          .relative(
            input.outputDirectory,
            checkpointPath(
              input.outputDirectory,
              input.validated.selectedExtractionEntries.find(
                entry => entry.sourceId === candidate.sourceId,
              ) ?? failMissingExtraction(candidate.sourceId),
            ),
          )
          .replaceAll('\\', '/'),
        labels: [...candidate.labels],
        provisionalEditorialRoles: [...candidate.provisionalEditorialRoles],
        provisionalRoleEvidence: [...candidate.provisionalRoleEvidence],
        metadataRiskFlags: [...candidate.metadataRiskFlags],
      };
    },
  );
  const embeddingQueue = input.groups.flatMap<Fsd50kEmbeddingQueueEntry>(group => {
    const memberCheckpoints = group.members.map(member => (
      checkpointBySourceId.get(member.plan.sourceId)
      ?? failMissingCheckpoint(member.plan.sourceId)
    ));
    if (!memberCheckpoints.some(checkpoint => checkpoint.decision.embeddingDisposition === 'classify')) {
      return [];
    }
    const acceptedAcoustic = memberCheckpoints.find(
      checkpoint => checkpoint.acoustic.outcome === 'accepted',
    )?.acoustic;
    if (!acceptedAcoustic || acceptedAcoustic.outcome !== 'accepted') return [];
    const canonicalPlan = planBySourceId.get(group.canonicalSourceId)
      ?? failMissingPlanEntry(group.canonicalSourceId);
    return [{
      canonicalSourceId: group.canonicalSourceId,
      sourceAudioPath: canonicalPlan.sourceAudioPath,
      sourceHashSha256: group.sourceHashSha256,
      memberSourceIds: group.members.map(member => member.plan.sourceId),
      measurement: acceptedAcoustic.measurement,
    }];
  });
  const counts = {
    plannedCandidates: input.validated.plan.entries.length,
    selectedCandidates: entries.length,
    completedCheckpoints: entries.length,
    uniqueContentHashes: input.groups.length,
    exactDuplicateGroups: exactDuplicateGroups.length,
    exactDuplicateEntries: exactDuplicateGroups.reduce(
      (total, group) => total + group.memberSourceIds.length,
      0,
    ),
    exactDuplicatesBeyondCanonical: exactDuplicateGroups.reduce(
      (total, group) => total + group.memberSourceIds.length - 1,
      0,
    ),
    acceptedForEmbedding: countStatus(entries, 'accepted-for-embedding'),
    quarantinedMetadata: countStatus(entries, 'quarantined-metadata'),
    rejectedMetadata: countStatus(entries, 'rejected-metadata'),
    rejectedAcoustic: countStatus(entries, 'rejected-acoustic'),
    embeddingQueueUniqueAudio: embeddingQueue.length,
  };
  const indexWithoutDigest = {
    version: 'editron-fsd50k-inspection-index-v1' as const,
    completedAt: input.completedAt.toISOString(),
    source: {
      candidatePoolSha256: input.validated.plan.candidatePoolSha256,
      archiveSetSha256: input.validated.plan.archiveSetSha256,
      extractionDigestSha256: input.validated.extractionReceipt.extractionDigestSha256,
    },
    selection: {
      mode: input.validated.selectedPlanEntries.length === input.validated.plan.entries.length
        ? 'full-corpus' as const
        : 'deterministic-prefix-canary' as const,
      requestedLimit: input.validated.selectedPlanEntries.length === input.validated.plan.entries.length
        ? null
        : input.validated.selectedPlanEntries.length,
      selectionSha256: input.validated.selectionSha256,
    },
    policy: {
      ...input.policy,
      policySha256: input.policySha256,
    },
    counts,
    entries,
    exactDuplicateGroups,
    embeddingQueue,
  };
  return {
    ...indexWithoutDigest,
    analysisDigestSha256: hashCanonical(indexDigestPayload(indexWithoutDigest)),
  };
}

function validateInspectionInput(
  planValue: unknown,
  extractionValue: unknown,
  expectedCandidateCount: number,
  limit: number | undefined,
): ValidatedInspectionInput {
  const plan = validateCorpusPlan(planValue, expectedCandidateCount);
  const extractionReceipt = validateExtractionReceipt(extractionValue, plan);
  const selectedCount = limit === undefined
    ? plan.entries.length
    : boundedInteger(limit, 1, plan.entries.length, 'limit');
  const selectedPlanEntries = plan.entries.slice(0, selectedCount);
  const selectedExtractionEntries = extractionReceipt.entries.slice(0, selectedCount);
  const selectionSha256 = hashCanonical(
    selectedExtractionEntries.map(entry => ({
      sourceId: entry.sourceId,
      sourceAudioPath: entry.sourceAudioPath,
      sourceHashSha256: entry.sha256,
    })),
  );
  return {
    plan,
    extractionReceipt,
    selectedPlanEntries,
    selectedExtractionEntries,
    selectionSha256,
  };
}

function validateCorpusPlan(
  value: unknown,
  expectedCandidateCount: number,
): Fsd50kCorpusPlan {
  if (
    !isRecord(value)
    || value.version !== 'editron-fsd50k-corpus-plan-v1'
    || typeof value.candidatePoolSha256 !== 'string'
    || !SHA256_PATTERN.test(value.candidatePoolSha256)
    || typeof value.archiveSetSha256 !== 'string'
    || !SHA256_PATTERN.test(value.archiveSetSha256)
    || !Array.isArray(value.entries)
    || value.entries.length !== expectedCandidateCount
  ) {
    throw new Fsd50kInspectionError(
      'INVALID_CORPUS_PLAN',
      `FSD50K inspection requires a ${expectedCandidateCount}-entry corpus plan`,
    );
  }
  const seen = new Set<string>();
  let previous: Fsd50kCorpusPlanEntry | undefined;
  for (const rawEntry of value.entries) {
    if (
      !isRecord(rawEntry)
      || typeof rawEntry.sourceId !== 'string'
      || !/^\d+$/.test(rawEntry.sourceId)
      || typeof rawEntry.sourceAudioPath !== 'string'
      || !Array.isArray(rawEntry.labels)
      || !rawEntry.labels.every(label => typeof label === 'string')
      || !Array.isArray(rawEntry.metadataRiskFlags)
      || !rawEntry.metadataRiskFlags.every(flag => typeof flag === 'string')
      || !Array.isArray(rawEntry.provisionalEditorialRoles)
      || !Array.isArray(rawEntry.provisionalRoleEvidence)
      || seen.has(rawEntry.sourceId)
    ) {
      throw new Fsd50kInspectionError(
        'INVALID_CORPUS_ENTRY',
        'FSD50K corpus plan contains an invalid or duplicate entry',
      );
    }
    const entry = rawEntry as unknown as Fsd50kCorpusPlanEntry;
    assertSafeSourceAudioPath(entry.sourceAudioPath, entry.sourceId);
    if (previous && compareSourceIds(previous.sourceId, entry.sourceId) >= 0) {
      throw new Fsd50kInspectionError(
        'UNSORTED_CORPUS_PLAN',
        'FSD50K corpus entries must be in canonical source-ID order',
      );
    }
    seen.add(entry.sourceId);
    previous = entry;
  }
  if (hashCanonical(value.entries) !== value.candidatePoolSha256) {
    throw new Fsd50kInspectionError(
      'CORPUS_PLAN_HASH_MISMATCH',
      'FSD50K corpus entries do not match candidatePoolSha256',
    );
  }
  return value as unknown as Fsd50kCorpusPlan;
}

function validateExtractionReceipt(
  value: unknown,
  plan: Fsd50kCorpusPlan,
): Fsd50kCandidateExtractionReceipt {
  if (
    !isRecord(value)
    || value.version !== 'editron-fsd50k-candidate-extraction-v1'
    || !isRecord(value.source)
    || !isRecord(value.selection)
    || !isRecord(value.counts)
    || !Array.isArray(value.entries)
    || value.source.candidatePoolSha256 !== plan.candidatePoolSha256
    || value.source.archiveSetSha256 !== plan.archiveSetSha256
    || value.selection.mode !== 'full-corpus'
    || value.selection.requestedLimit !== null
    || value.entries.length !== plan.entries.length
    || value.counts.plannedCandidates !== plan.entries.length
    || value.counts.selectedCandidates !== plan.entries.length
    || value.counts.extractedCandidates !== plan.entries.length
    || value.counts.missingCandidates !== 0
    || value.counts.unexpectedFiles !== 0
    || value.counts.unsafePaths !== 0
    || typeof value.extractionDigestSha256 !== 'string'
    || !SHA256_PATTERN.test(value.extractionDigestSha256)
  ) {
    throw new Fsd50kInspectionError(
      'INVALID_EXTRACTION_RECEIPT',
      'FSD50K inspection requires a complete, reconciled full-corpus extraction receipt',
    );
  }
  const extractionEntries: Fsd50kCandidateExtractionEntry[] = [];
  for (let index = 0; index < plan.entries.length; index += 1) {
    const rawEntry = value.entries[index];
    const planEntry = plan.entries[index];
    if (
      !isRecord(rawEntry)
      || rawEntry.sourceId !== planEntry.sourceId
      || rawEntry.sourceAudioPath !== planEntry.sourceAudioPath
      || rawEntry.sourceSplit !== planEntry.sourceSplit
      || rawEntry.sourceTrainingSplit !== planEntry.sourceTrainingSplit
      || typeof rawEntry.sizeBytes !== 'number'
      || !Number.isSafeInteger(rawEntry.sizeBytes)
      || rawEntry.sizeBytes <= 12
      || typeof rawEntry.sha256 !== 'string'
      || !SHA256_PATTERN.test(rawEntry.sha256)
    ) {
      throw new Fsd50kInspectionError(
        'EXTRACTION_ENTRY_MISMATCH',
        `FSD50K extraction entry ${index} does not match the corpus plan`,
      );
    }
    extractionEntries.push(rawEntry as unknown as Fsd50kCandidateExtractionEntry);
  }
  const digestPayload = {
    candidatePoolSha256: plan.candidatePoolSha256,
    archiveSetSha256: plan.archiveSetSha256,
    selectionSha256: value.selection.selectionSha256,
    entries: extractionEntries,
  };
  if (hashCanonical(digestPayload) !== value.extractionDigestSha256) {
    throw new Fsd50kInspectionError(
      'EXTRACTION_DIGEST_MISMATCH',
      'FSD50K extraction receipt digest does not match its entries',
    );
  }
  return value as unknown as Fsd50kCandidateExtractionReceipt;
}

function groupExactDuplicates(
  planEntries: readonly Fsd50kCorpusPlanEntry[],
  extractionEntries: readonly Fsd50kCandidateExtractionEntry[],
): SourceGroup[] {
  const groups = new Map<string, SourceGroup['members']>();
  for (let index = 0; index < planEntries.length; index += 1) {
    const extraction = extractionEntries[index];
    const members = groups.get(extraction.sha256) ?? [];
    members.push({ plan: planEntries[index], extraction });
    groups.set(extraction.sha256, members);
  }
  return [...groups.entries()]
    .map<SourceGroup>(([sourceHashSha256, members]) => {
      members.sort((left, right) => compareSourceIds(left.plan.sourceId, right.plan.sourceId));
      return {
        sourceHashSha256,
        canonicalSourceId: members[0].plan.sourceId,
        members,
      };
    })
    .sort((left, right) => compareSourceIds(left.canonicalSourceId, right.canonicalSourceId));
}

async function readAndVerifySource(
  extractionDirectory: string,
  extraction: Fsd50kCandidateExtractionEntry,
): Promise<VerifiedSource> {
  const filePath = resolveSafeSourcePath(extractionDirectory, extraction.sourceAudioPath);
  const details = await lstat(filePath);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Fsd50kInspectionError(
      'SOURCE_NOT_REGULAR_FILE',
      `FSD50K source ${extraction.sourceId} is not a regular file`,
    );
  }
  if (details.size !== extraction.sizeBytes) {
    throw new Fsd50kInspectionError(
      'SOURCE_SIZE_MISMATCH',
      `FSD50K source ${extraction.sourceId} size changed after extraction`,
    );
  }
  if (details.size > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
    const sha256 = await hashFileSha256(filePath);
    if (sha256 !== extraction.sha256) {
      throw sourceHashMismatch(extraction.sourceId);
    }
    return { oversized: true };
  }
  const buffer = await readFile(filePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (sha256 !== extraction.sha256) {
    throw sourceHashMismatch(extraction.sourceId);
  }
  return { buffer, oversized: false };
}

async function readCheckpoint(
  filePath: string,
  member: SourceGroup['members'][number],
  group: SourceGroup,
  validated: ValidatedInspectionInput,
  policy: Fsd50kInspectionPolicy,
  policySha256: string,
): Promise<Fsd50kInspectionCheckpoint | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    throw new Fsd50kInspectionError(
      'CHECKPOINT_READ_FAILED',
      `Unable to read FSD50K checkpoint for ${member.plan.sourceId}`,
      { cause: error },
    );
  }
  if (
    !isRecord(value)
    || value.version !== 'editron-fsd50k-acoustic-checkpoint-v1'
    || typeof value.completedAt !== 'string'
    || Number.isNaN(Date.parse(value.completedAt))
    || !isRecord(value.source)
    || value.source.candidatePoolSha256 !== validated.plan.candidatePoolSha256
    || value.source.extractionDigestSha256
      !== validated.extractionReceipt.extractionDigestSha256
    || value.source.policySha256 !== policySha256
    || value.source.sourceId !== member.plan.sourceId
    || value.source.sourceAudioPath !== member.plan.sourceAudioPath
    || value.source.sourceHashSha256 !== member.extraction.sha256
    || value.source.sizeBytes !== member.extraction.sizeBytes
    || !isRecord(value.exactDuplicate)
    || value.exactDuplicate.canonicalSourceId !== group.canonicalSourceId
    || JSON.stringify(value.exactDuplicate.memberSourceIds)
      !== JSON.stringify(group.members.map(item => item.plan.sourceId))
    || value.exactDuplicate.isCanonical !== (member.plan.sourceId === group.canonicalSourceId)
    || !isRecord(value.metadata)
    || JSON.stringify(value.metadata.labels) !== JSON.stringify(member.plan.labels)
    || JSON.stringify(value.metadata.riskFlags)
      !== JSON.stringify(member.plan.metadataRiskFlags)
    || !isRecord(value.acoustic)
    || !isRecord(value.decision)
    || typeof value.checkpointDigestSha256 !== 'string'
  ) {
    throw new Fsd50kInspectionError(
      'CHECKPOINT_MISMATCH',
      `FSD50K checkpoint for ${member.plan.sourceId} does not match current source/policy`,
    );
  }
  const checkpoint = value as unknown as Fsd50kInspectionCheckpoint;
  validateAcousticOutcome(checkpoint.acoustic, member.extraction.sha256);
  const expectedDefinitive = member.plan.metadataRiskFlags.filter(flag => (
    policy.metadata.definitiveRejectFlags.includes(flag)
  ));
  const expectedQuarantine = member.plan.metadataRiskFlags.filter(flag => (
    policy.metadata.quarantineFlags.includes(flag)
  ));
  const expectedDecision = decideInspectionStatus(
    checkpoint.acoustic,
    expectedDefinitive,
    expectedQuarantine,
  );
  if (
    JSON.stringify(checkpoint.metadata.definitiveRejectFlags)
      !== JSON.stringify(expectedDefinitive)
    || JSON.stringify(checkpoint.metadata.quarantineFlags)
      !== JSON.stringify(expectedQuarantine)
    || JSON.stringify(checkpoint.decision) !== JSON.stringify(expectedDecision)
    || hashCanonical(checkpointWithoutDigest(checkpoint))
      !== checkpoint.checkpointDigestSha256
  ) {
    throw new Fsd50kInspectionError(
      'CHECKPOINT_DIGEST_MISMATCH',
      `FSD50K checkpoint for ${member.plan.sourceId} is invalid or stale`,
    );
  }
  return checkpoint;
}

function validateAcousticOutcome(
  acoustic: Fsd50kCheckpointAcousticOutcome,
  sourceHashSha256: string,
): void {
  if (acoustic.outcome === 'accepted') {
    const measurement = sfxAcousticMeasurementSchema.parse(acoustic.measurement);
    if (measurement.sourceHashSha256 !== sourceHashSha256) {
      throw new Fsd50kInspectionError(
        'CHECKPOINT_MEASUREMENT_HASH_MISMATCH',
        'FSD50K checkpoint measurement belongs to different source bytes',
      );
    }
    return;
  }
  if (
    acoustic.outcome !== 'rejected'
    || typeof acoustic.code !== 'string'
    || !acoustic.code
    || typeof acoustic.message !== 'string'
    || !acoustic.message
  ) {
    throw new Fsd50kInspectionError(
      'INVALID_CHECKPOINT_ACOUSTIC_OUTCOME',
      'FSD50K checkpoint has an invalid acoustic outcome',
    );
  }
}

async function readExistingIndex(
  indexPath: string,
): Promise<Fsd50kInspectionIndex | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    throw new Fsd50kInspectionError(
      'INSPECTION_INDEX_READ_FAILED',
      'Unable to read the existing FSD50K inspection index',
      { cause: error },
    );
  }
  if (
    !isRecord(value)
    || value.version !== 'editron-fsd50k-inspection-index-v1'
    || typeof value.analysisDigestSha256 !== 'string'
    || !SHA256_PATTERN.test(value.analysisDigestSha256)
  ) {
    throw new Fsd50kInspectionError(
      'INVALID_INSPECTION_INDEX',
      'Existing FSD50K inspection index is invalid',
    );
  }
  const index = value as unknown as Fsd50kInspectionIndex;
  if (
    hashCanonical(indexDigestPayload(indexWithoutDigest(index)))
      !== index.analysisDigestSha256
  ) {
    throw new Fsd50kInspectionError(
      'INSPECTION_INDEX_DIGEST_MISMATCH',
      'Existing FSD50K inspection index digest is invalid',
    );
  }
  return index;
}

async function acquireInspectionLock(
  outputDirectory: string,
  processIsAlive: (pid: number) => boolean,
): Promise<InspectionLock> {
  await mkdir(outputDirectory, { recursive: true });
  const lockDirectory = path.join(outputDirectory, LOCK_DIRECTORY_NAME);
  let recoveredStaleLock = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID();
    try {
      await mkdir(lockDirectory);
      const owner = {
        version: 'editron-fsd50k-inspection-lock-v1',
        pid: process.pid,
        token,
        startedAt: new Date().toISOString(),
      };
      await writeFile(
        path.join(lockDirectory, LOCK_OWNER_FILENAME),
        `${JSON.stringify(owner, null, 2)}\n`,
        'utf8',
      );
      return {
        recoveredStaleLock,
        release: async () => {
          let current: unknown;
          try {
            current = JSON.parse(
              await readFile(path.join(lockDirectory, LOCK_OWNER_FILENAME), 'utf8'),
            );
          } catch (error) {
            if (hasErrorCode(error, 'ENOENT')) return;
            throw error;
          }
          if (isRecord(current) && current.token === token) {
            await rm(lockDirectory, { recursive: true, force: true });
          }
        },
      };
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      const stale = await recoverStaleLock(lockDirectory, processIsAlive);
      if (!stale) {
        throw new Fsd50kInspectionError(
          'INSPECTION_ALREADY_RUNNING',
          `Another FSD50K inspection owns ${lockDirectory}`,
        );
      }
      recoveredStaleLock = true;
    }
  }
  throw new Fsd50kInspectionError(
    'INSPECTION_LOCK_FAILED',
    `Unable to acquire FSD50K inspection lock at ${lockDirectory}`,
  );
}

async function recoverStaleLock(
  lockDirectory: string,
  processIsAlive: (pid: number) => boolean,
): Promise<boolean> {
  let owner: unknown;
  try {
    owner = JSON.parse(
      await readFile(path.join(lockDirectory, LOCK_OWNER_FILENAME), 'utf8'),
    );
  } catch {
    const details = await lstat(lockDirectory);
    if (Date.now() - details.mtimeMs < INVALID_LOCK_GRACE_MS) return false;
  }
  if (
    isRecord(owner)
    && typeof owner.pid === 'number'
    && Number.isSafeInteger(owner.pid)
    && owner.pid > 0
    && processIsAlive(owner.pid)
  ) {
    return false;
  }
  const staleDirectory = `${lockDirectory}.stale-${randomUUID()}`;
  try {
    await rename(lockDirectory, staleDirectory);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return true;
    throw error;
  }
  await rm(staleDirectory, { recursive: true, force: true });
  return true;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH');
  }
}

function checkpointPath(
  outputDirectory: string,
  extraction: Fsd50kCandidateExtractionEntry,
): string {
  return path.join(
    outputDirectory,
    'receipts',
    extraction.sha256.slice(0, 2),
    `${extraction.sourceId}.json`,
  );
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function checkpointWithoutDigest(
  checkpoint: Fsd50kInspectionCheckpoint,
): Omit<Fsd50kInspectionCheckpoint, 'checkpointDigestSha256'> {
  const { checkpointDigestSha256: _digest, ...withoutDigest } = checkpoint;
  return withoutDigest;
}

function indexWithoutDigest(
  index: Fsd50kInspectionIndex,
): Omit<Fsd50kInspectionIndex, 'analysisDigestSha256'> {
  const { analysisDigestSha256: _digest, ...withoutDigest } = index;
  return withoutDigest;
}

function indexDigestPayload(
  index: Omit<Fsd50kInspectionIndex, 'analysisDigestSha256'>,
): Omit<Fsd50kInspectionIndex, 'analysisDigestSha256' | 'completedAt'> {
  const { completedAt: _completedAt, ...payload } = index;
  return payload;
}

function rejectedAcousticOutcome(
  code: string,
  message: string,
): Fsd50kCheckpointAcousticOutcome {
  return { outcome: 'rejected', code, message: boundedMessage(message) };
}

function boundedMessage(message: string): string {
  return message.trim().slice(0, 1_000) || 'Acoustic source rejected';
}

function countStatus(
  entries: readonly Fsd50kInspectionIndexEntry[],
  status: Fsd50kInspectionStatus,
): number {
  return entries.filter(entry => entry.status === status).length;
}

function resolveSafeSourcePath(root: string, sourceAudioPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...sourceAudioPath.split('/'));
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Fsd50kInspectionError(
      'UNSAFE_SOURCE_PATH',
      `FSD50K source path escapes the extraction root: ${sourceAudioPath}`,
    );
  }
  return resolved;
}

function assertSafeSourceAudioPath(sourceAudioPath: string, sourceId: string): void {
  if (
    sourceAudioPath !== `FSD50K.dev_audio/${sourceId}.wav`
    && sourceAudioPath !== `FSD50K.eval_audio/${sourceId}.wav`
  ) {
    throw new Fsd50kInspectionError(
      'UNSAFE_SOURCE_PATH',
      `FSD50K source ${sourceId} has an unsafe or non-canonical path`,
    );
  }
}

function assertSafeDirectory(directory: string, label: string): void {
  const parsed = path.parse(directory);
  if (
    directory === parsed.root
    || !path.basename(directory)
    || directory.includes('\0')
  ) {
    throw new Fsd50kInspectionError(
      'UNSAFE_DIRECTORY',
      `Unsafe FSD50K ${label} directory: ${directory}`,
    );
  }
}

function sourceHashMismatch(sourceId: string): Fsd50kInspectionError {
  return new Fsd50kInspectionError(
    'SOURCE_HASH_MISMATCH',
    `FSD50K source ${sourceId} bytes changed after controlled extraction`,
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Fsd50kInspectionError(
      'INSPECTION_ABORTED',
      'FSD50K inspection was interrupted after its last durable checkpoint',
    );
  }
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Fsd50kInspectionError(
      'INVALID_INSPECTION_OPTION',
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function compareSourceIds(left: string, right: string): number {
  return Number(left) - Number(right) || left.localeCompare(right);
}

async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function failMissingBuffer(sourceId: string): never {
  throw new Fsd50kInspectionError(
    'MISSING_SOURCE_BUFFER',
    `Verified FSD50K source ${sourceId} has no readable buffer`,
  );
}

function failMissingCheckpoint(sourceId: string): never {
  throw new Fsd50kInspectionError(
    'MISSING_CHECKPOINT',
    `FSD50K source ${sourceId} has no completed checkpoint`,
  );
}

function failMissingExtraction(sourceId: string): never {
  throw new Fsd50kInspectionError(
    'MISSING_EXTRACTION_ENTRY',
    `FSD50K source ${sourceId} has no extraction receipt entry`,
  );
}

function failMissingPlanEntry(sourceId: string): never {
  throw new Fsd50kInspectionError(
    'MISSING_PLAN_ENTRY',
    `FSD50K source ${sourceId} has no corpus plan entry`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === code,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
