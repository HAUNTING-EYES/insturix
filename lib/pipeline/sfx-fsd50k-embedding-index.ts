import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import samplerate from '@alexanderolsen/libsamplerate-js';
import decode from 'audio-decode';
import { Index, MetricKind, ScalarKind } from 'usearch';

import { MAX_AUDIO_CONDITIONING_INPUT_BYTES } from '@/lib/pipeline/audio-conditioning';
import {
  analyzeFsd50kSfxEmbeddings,
  cosineSimilarity,
  decodeFloat32Embedding,
  DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
  SFX_CLAP_EMBEDDING_DIMENSION,
  SFX_CLAP_MODEL_ID,
  SFX_CLAP_MODEL_REVISION,
  SFX_CLAP_SAMPLE_RATE_HZ,
  SFX_CLAP_TRANSFORMERS_VERSION,
  SFX_SEMANTIC_ROLE_PROMPTS,
  type SfxClapEmbeddingRuntime,
  type SfxClapModelDescriptor,
  type SfxSemanticRoleScore,
} from '@/lib/pipeline/sfx-audio-embedding';
import type {
  Fsd50kEmbeddingQueueEntry,
  Fsd50kInspectionIndex,
  Fsd50kInspectionIndexEntry,
  Fsd50kInspectionStatus,
} from '@/lib/pipeline/sfx-fsd50k-inspection';
import type { SfxCatalogEventRole } from '@/lib/pipeline/sfx-catalog';

const CHECKPOINT_DIRECTORY = 'checkpoints';
const REPORT_FILENAME = 'embedding-index-report.json';
const ANN_FILENAME = 'fsd50k-clap-cosine.usearch';
const LOCK_DIRECTORY = '.embedding-index.lock';
const LOCK_OWNER_FILENAME = 'owner.json';
const INVALID_LOCK_GRACE_MS = 30_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_ID_PATTERN = /^[1-9]\d{0,14}$/;
const MAX_ANN_NEIGHBOURS = 128;
const MIN_ANN_NEIGHBOURS = 2;

export const FSD50K_EMBEDDING_INDEX_VERSION = 'editron-fsd50k-clap-ann-v1' as const;
export const FSD50K_EMBEDDING_CHECKPOINT_VERSION =
  'editron-fsd50k-clap-checkpoint-v1' as const;
export const FSD50K_RESAMPLER_VERSION = '2.1.2' as const;
export const FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES = 256;
export const FSD50K_ANN_LIBRARY_VERSION = '2.25.0' as const;
export const DEFAULT_FSD50K_ANN_NEIGHBOURS = 32;
export const DEFAULT_FSD50K_RECORDED_NEIGHBOURS = 8;

export const FSD50K_SEMANTIC_RISK_PROMPTS = [
  {
    risk: 'speech',
    prompt: 'human speech, dialogue, narration, laughter, singing voice, or clearly intelligible vocal audio',
  },
  {
    risk: 'music',
    prompt: 'a song, melody, musical performance, instrumental music, or a sustained music recording',
  },
  {
    risk: 'noise',
    prompt: 'low-quality noisy audio, heavy hiss, distortion, clipping, interference, or unusable recording noise',
  },
] as const;

export const FSD50K_ANN_CONFIG = {
  library: 'usearch',
  libraryVersion: FSD50K_ANN_LIBRARY_VERSION,
  algorithm: 'hnsw',
  metric: 'cos',
  quantization: 'f32',
  connectivity: 16,
  expansionAdd: 128,
  expansionSearch: 64,
  approximateCandidateRetrieval: true,
  exactCandidateVerification: 'float32-cosine',
} as const;

type Fsd50kSemanticRisk = (typeof FSD50K_SEMANTIC_RISK_PROMPTS)[number]['risk'];

interface DecodedAudio {
  sampleRate: number;
  channelData: readonly Float32Array[];
}

interface PcmPreprocessReceipt {
  inputSampleRateHz: number;
  inputChannelCount: number;
  inputSamplesPerChannel: number;
  outputSampleRateHz: typeof SFX_CLAP_SAMPLE_RATE_HZ;
  outputChannelCount: 1;
  outputSamples: number;
  resampled: boolean;
  flushOutputSamples: typeof FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES;
  lengthPolicy: 'zero-pad-flush-then-crop-exact';
}

interface SourceEvidence {
  sourceId: string;
  status: Fsd50kInspectionStatus;
  labels: string[];
  provisionalEditorialRoles: SfxCatalogEventRole[];
  provisionalRoleEvidence: string[];
  metadataRiskFlags: string[];
}

export interface Fsd50kSemanticRiskScore {
  risk: Fsd50kSemanticRisk;
  prompt: string;
  cosineSimilarity: number;
}

export interface Fsd50kEmbeddingCheckpoint {
  version: typeof FSD50K_EMBEDDING_CHECKPOINT_VERSION;
  completedAt: string;
  source: {
    inspectionAnalysisDigestSha256: string;
    canonicalSourceId: string;
    sourceAudioPath: string;
    sourceHashSha256: string;
    memberSourceIds: string[];
  };
  model: SfxClapModelDescriptor;
  prompts: {
    semanticRolePromptsSha256: string;
    semanticRiskPromptsSha256: string;
  };
  preprocessing: PcmPreprocessReceipt & {
    provider: 'libsamplerate-js';
    packageVersion: typeof FSD50K_RESAMPLER_VERSION;
    converter: 'SRC_SINC_FASTEST';
  };
  segmentCount: number;
  embedding: {
    encoding: 'base64-f32le';
    dimension: number;
    value: string;
  };
  semanticRoles: SfxSemanticRoleScore[];
  topRole: SfxCatalogEventRole;
  topRoleScore: number;
  semanticRisks: Fsd50kSemanticRiskScore[];
  sourceEvidence: SourceEvidence[];
  checkpointDigestSha256: string;
}

export interface Fsd50kEmbeddingIndexEntry {
  canonicalSourceId: string;
  sourceAudioPath: string;
  sourceHashSha256: string;
  memberSourceIds: string[];
  checkpointPath: string;
  segmentCount: number;
  topRole: SfxCatalogEventRole;
  topRoleScore: number;
  semanticRoles: SfxSemanticRoleScore[];
  semanticRisks: Fsd50kSemanticRiskScore[];
  sourceEvidence: SourceEvidence[];
  annNeighbours: Array<{
    canonicalSourceId: string;
    cosineSimilarity: number;
  }>;
  clusterId: string;
  representative: boolean;
}

export interface Fsd50kEmbeddingCluster {
  clusterId: string;
  duplicateCandidate: boolean;
  canonicalSourceIds: string[];
  allSourceIds: string[];
  representativeCanonicalSourceId: string;
  representativeRule: 'accepted-metadata-then-highest-role-score-then-source-id';
  verifiedEdgeCount: number;
  minimumVerifiedEdgeSimilarity: number;
  maximumVerifiedEdgeSimilarity: number;
}

export interface Fsd50kEmbeddingIndexReport {
  version: typeof FSD50K_EMBEDDING_INDEX_VERSION;
  completedAt: string;
  source: {
    inspectionAnalysisDigestSha256: string;
    candidatePoolSha256: string;
    extractionDigestSha256: string;
  };
  selection: {
    mode: 'full-embedding-queue' | 'deterministic-prefix-canary';
    requestedLimit: number | null;
    selectedUniqueAudio: number;
    selectionSha256: string;
  };
  policy: {
    purpose: 'offline-semantic-screening-and-near-duplicate-candidate-discovery';
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    humanReviewRequired: true;
    representativeApprovalPropagatesToClusterMembers: false;
  };
  model: SfxClapModelDescriptor;
  preprocessing: {
    provider: 'libsamplerate-js';
    packageVersion: typeof FSD50K_RESAMPLER_VERSION;
    converter: 'SRC_SINC_FASTEST';
    targetSampleRateHz: typeof SFX_CLAP_SAMPLE_RATE_HZ;
    downmix: 'finite-arithmetic-mean';
    flushOutputSamples: typeof FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES;
    lengthPolicy: 'zero-pad-flush-then-crop-exact';
  };
  prompts: {
    semanticRoles: typeof SFX_SEMANTIC_ROLE_PROMPTS;
    semanticRisks: typeof FSD50K_SEMANTIC_RISK_PROMPTS;
  };
  ann: typeof FSD50K_ANN_CONFIG & {
    candidateNeighbours: number;
    recordedNeighbours: number;
    artifactPath: string;
    artifactSizeBytes: number;
    artifactSha256: string;
  };
  duplicateSimilarityThreshold: number;
  counts: {
    queuedUniqueAudio: number;
    embeddedUniqueAudio: number;
    sourceIdsRepresented: number;
    clusters: number;
    duplicateCandidateClusters: number;
    duplicateCandidateCanonicalEntries: number;
    representatives: number;
    acceptedMetadataEntries: number;
    quarantinedMetadataEntries: number;
  };
  entries: Fsd50kEmbeddingIndexEntry[];
  clusters: Fsd50kEmbeddingCluster[];
  analysisDigestSha256: string;
}

export interface EmbedFsd50kCorpusOptions {
  inspectionIndex: unknown;
  extractionDirectory: string;
  outputDirectory: string;
  limit?: number;
  candidateNeighbours?: number;
  recordedNeighbours?: number;
  duplicateSimilarityThreshold?: number;
  completedAt?: Date;
  signal?: AbortSignal;
  onProgress?: (event: {
    completedUniqueAudio: number;
    totalUniqueAudio: number;
    canonicalSourceId: string;
    reusedCheckpoints: number;
    newCheckpoints: number;
  }) => void | Promise<void>;
}

export interface EmbedFsd50kCorpusDependencies {
  runtime: SfxClapEmbeddingRuntime;
  decodeAudio?: (buffer: Buffer) => Promise<DecodedAudio>;
  resampleMono?: (
    samples: Float32Array,
    inputSampleRateHz: number,
    outputSampleRateHz: number,
  ) => Promise<Float32Array>;
  createAnnIndex?: (dimension: number) => Fsd50kAnnIndex;
  processIsAlive?: (pid: number) => boolean;
}

export interface EmbedFsd50kCorpusResult {
  report: Fsd50kEmbeddingIndexReport;
  reportPath: string;
  annPath: string;
  recoveredStaleLock: boolean;
  runCounts: {
    reusedCheckpoints: number;
    newCheckpoints: number;
  };
}

export interface Fsd50kAnnIndex {
  add(keys: BigUint64Array, vectors: Float32Array): void;
  search(vector: Float32Array, count: number): {
    keys: BigUint64Array;
    distances: Float32Array;
  };
  save(filePath: string): void;
  size(): number;
}

interface ValidatedEmbeddingInput {
  inspection: Fsd50kInspectionIndex;
  selectedQueue: Fsd50kEmbeddingQueueEntry[];
  evidenceBySourceId: Map<string, Fsd50kInspectionIndexEntry>;
  selectionSha256: string;
}

interface WorkingEmbedding {
  checkpoint: Fsd50kEmbeddingCheckpoint;
  checkpointPath: string;
  embedding: Float32Array;
  annNeighbours: Array<{
    canonicalSourceId: string;
    cosineSimilarity: number;
  }>;
}

interface VerifiedEdge {
  leftSourceId: string;
  rightSourceId: string;
  cosineSimilarity: number;
}

interface EmbeddingLock {
  recoveredStaleLock: boolean;
  release(): Promise<void>;
}

export class Fsd50kEmbeddingIndexError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'Fsd50kEmbeddingIndexError';
  }
}

export async function embedFsd50kCorpus(
  options: EmbedFsd50kCorpusOptions,
  dependencies: EmbedFsd50kCorpusDependencies,
): Promise<EmbedFsd50kCorpusResult> {
  const extractionDirectory = path.resolve(options.extractionDirectory);
  const outputDirectory = path.resolve(options.outputDirectory);
  assertSafeDirectory(extractionDirectory, 'extraction');
  assertSafeDirectory(outputDirectory, 'embedding output');
  const completedAt = options.completedAt ?? new Date();
  if (Number.isNaN(completedAt.getTime())) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_EMBEDDING_CLOCK',
      'FSD50K embedding completion timestamp is invalid',
    );
  }
  validatePinnedRuntime(dependencies.runtime);
  const validated = validateEmbeddingInput(options.inspectionIndex, options.limit);
  const candidateNeighbours = boundedInteger(
    options.candidateNeighbours ?? DEFAULT_FSD50K_ANN_NEIGHBOURS,
    MIN_ANN_NEIGHBOURS,
    MAX_ANN_NEIGHBOURS,
    'candidateNeighbours',
  );
  const recordedNeighbours = boundedInteger(
    options.recordedNeighbours ?? DEFAULT_FSD50K_RECORDED_NEIGHBOURS,
    1,
    candidateNeighbours,
    'recordedNeighbours',
  );
  const duplicateThreshold = validateDuplicateThreshold(
    options.duplicateSimilarityThreshold ?? DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
  );
  const lock = await acquireEmbeddingLock(
    outputDirectory,
    dependencies.processIsAlive ?? defaultProcessIsAlive,
  );
  try {
    const rolePrompts = SFX_SEMANTIC_ROLE_PROMPTS.map(item => item.prompt);
    const riskPrompts = FSD50K_SEMANTIC_RISK_PROMPTS.map(item => item.prompt);
    const [roleTextEmbeddings, riskTextEmbeddings] = await Promise.all([
      dependencies.runtime.embedTexts(rolePrompts),
      dependencies.runtime.embedTexts(riskPrompts),
    ]);
    validateTextEmbeddingBatch(
      roleTextEmbeddings,
      rolePrompts.length,
      dependencies.runtime.descriptor.embeddingDimension,
      'semantic role',
    );
    validateTextEmbeddingBatch(
      riskTextEmbeddings,
      riskPrompts.length,
      dependencies.runtime.descriptor.embeddingDimension,
      'semantic risk',
    );
    const cachedRuntime = withCachedRoleTextEmbeddings(
      dependencies.runtime,
      rolePrompts,
      roleTextEmbeddings,
    );
    const decodeAudio = dependencies.decodeAudio ?? (async buffer => decode(buffer));
    const resampleMono = dependencies.resampleMono ?? resampleMonoWithLibsamplerate;
    const working: WorkingEmbedding[] = [];
    let reusedCheckpoints = 0;
    let newCheckpoints = 0;

    for (const queueEntry of validated.selectedQueue) {
      throwIfAborted(options.signal);
      const evidence = queueEntry.memberSourceIds.map(sourceId => (
        sourceEvidence(validated.evidenceBySourceId.get(sourceId) ?? failMissingEvidence(sourceId))
      ));
      const checkpointPath = embeddingCheckpointPath(outputDirectory, queueEntry);
      const existing = await readEmbeddingCheckpoint(checkpointPath);
      let checkpoint: Fsd50kEmbeddingCheckpoint;
      if (existing) {
        await verifyQueueSourceHash(extractionDirectory, queueEntry);
        validateCheckpointAgainstInput(
          existing,
          queueEntry,
          evidence,
          validated.inspection.analysisDigestSha256,
          dependencies.runtime.descriptor,
        );
        checkpoint = existing;
        reusedCheckpoints += 1;
      } else {
        checkpoint = await embedQueueEntry({
          queueEntry,
          evidence,
          extractionDirectory,
          inspectionAnalysisDigestSha256: validated.inspection.analysisDigestSha256,
          completedAt,
          runtime: cachedRuntime,
          riskTextEmbeddings,
          decodeAudio,
          resampleMono,
        });
        await atomicWriteJson(checkpointPath, checkpoint);
        newCheckpoints += 1;
      }
      const embedding = decodeAndValidateCheckpointEmbedding(
        checkpoint,
        dependencies.runtime.descriptor.embeddingDimension,
      );
      working.push({
        checkpoint,
        checkpointPath,
        embedding,
        annNeighbours: [],
      });
      await options.onProgress?.({
        completedUniqueAudio: working.length,
        totalUniqueAudio: validated.selectedQueue.length,
        canonicalSourceId: queueEntry.canonicalSourceId,
        reusedCheckpoints,
        newCheckpoints,
      });
    }
    throwIfAborted(options.signal);
    if (working.length !== validated.selectedQueue.length) {
      throw new Fsd50kEmbeddingIndexError(
        'INCOMPLETE_EMBEDDING_RUN',
        `Expected ${validated.selectedQueue.length} embeddings, received ${working.length}`,
      );
    }

    const annPath = path.join(outputDirectory, ANN_FILENAME);
    const ann = dependencies.createAnnIndex?.(dependencies.runtime.descriptor.embeddingDimension)
      ?? createUsearchAnnIndex(dependencies.runtime.descriptor.embeddingDimension);
    const { verifiedEdges } = populateAnnCandidates(
      ann,
      working,
      candidateNeighbours,
      recordedNeighbours,
      duplicateThreshold,
    );
    if (ann.size() !== working.length) {
      throw new Fsd50kEmbeddingIndexError(
        'ANN_INDEX_SIZE_MISMATCH',
        `ANN index contains ${ann.size()} vectors; expected ${working.length}`,
      );
    }
    const temporaryAnnPath = `${annPath}.${process.pid}-${randomUUID()}.tmp`;
    await mkdir(outputDirectory, { recursive: true });
    let temporaryAnnDetails;
    let annSha256: string;
    try {
      ann.save(temporaryAnnPath);
      temporaryAnnDetails = await stat(temporaryAnnPath);
      if (!temporaryAnnDetails.isFile() || temporaryAnnDetails.size <= 0) {
        throw new Fsd50kEmbeddingIndexError(
          'ANN_INDEX_WRITE_FAILED',
          'USearch produced an empty ANN artifact',
        );
      }
      annSha256 = await hashFileSha256(temporaryAnnPath);
      await rm(annPath, { force: true });
      await rename(temporaryAnnPath, annPath);
    } finally {
      await rm(temporaryAnnPath, { force: true });
    }

    const {
      clusters,
      clusterByCanonicalSourceId,
      representativeCanonicalSourceIds,
    } = clusterVerifiedCandidates(working, verifiedEdges);
    const entries = working
      .sort((left, right) => compareSourceIds(
        left.checkpoint.source.canonicalSourceId,
        right.checkpoint.source.canonicalSourceId,
      ))
      .map<Fsd50kEmbeddingIndexEntry>(item => {
        const canonicalSourceId = item.checkpoint.source.canonicalSourceId;
        return {
          canonicalSourceId,
          sourceAudioPath: item.checkpoint.source.sourceAudioPath,
          sourceHashSha256: item.checkpoint.source.sourceHashSha256,
          memberSourceIds: [...item.checkpoint.source.memberSourceIds],
          checkpointPath: path.relative(outputDirectory, item.checkpointPath).replaceAll('\\', '/'),
          segmentCount: item.checkpoint.segmentCount,
          topRole: item.checkpoint.topRole,
          topRoleScore: item.checkpoint.topRoleScore,
          semanticRoles: item.checkpoint.semanticRoles,
          semanticRisks: item.checkpoint.semanticRisks,
          sourceEvidence: item.checkpoint.sourceEvidence,
          annNeighbours: item.annNeighbours,
          clusterId: clusterByCanonicalSourceId.get(canonicalSourceId)
            ?? failMissingCluster(canonicalSourceId),
          representative: representativeCanonicalSourceIds.has(canonicalSourceId),
        };
      });
    const duplicateClusters = clusters.filter(cluster => cluster.duplicateCandidate);
    const reportWithoutDigest: Omit<
      Fsd50kEmbeddingIndexReport,
      'analysisDigestSha256'
    > = {
      version: FSD50K_EMBEDDING_INDEX_VERSION,
      completedAt: completedAt.toISOString(),
      source: {
        inspectionAnalysisDigestSha256: validated.inspection.analysisDigestSha256,
        candidatePoolSha256: validated.inspection.source.candidatePoolSha256,
        extractionDigestSha256: validated.inspection.source.extractionDigestSha256,
      },
      selection: {
        mode: validated.selectedQueue.length === validated.inspection.embeddingQueue.length
          ? 'full-embedding-queue' as const
          : 'deterministic-prefix-canary' as const,
        requestedLimit: validated.selectedQueue.length === validated.inspection.embeddingQueue.length
          ? null
          : validated.selectedQueue.length,
        selectedUniqueAudio: validated.selectedQueue.length,
        selectionSha256: validated.selectionSha256,
      },
      policy: {
        purpose: 'offline-semantic-screening-and-near-duplicate-candidate-discovery' as const,
        publicationAllowed: false as const,
        productionCatalogMutationAllowed: false as const,
        humanReviewRequired: true as const,
        representativeApprovalPropagatesToClusterMembers: false as const,
      },
      model: dependencies.runtime.descriptor,
      preprocessing: {
        provider: 'libsamplerate-js' as const,
        packageVersion: FSD50K_RESAMPLER_VERSION,
        converter: 'SRC_SINC_FASTEST' as const,
        targetSampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
        downmix: 'finite-arithmetic-mean' as const,
        flushOutputSamples: FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES,
        lengthPolicy: 'zero-pad-flush-then-crop-exact' as const,
      },
      prompts: {
        semanticRoles: SFX_SEMANTIC_ROLE_PROMPTS,
        semanticRisks: FSD50K_SEMANTIC_RISK_PROMPTS,
      },
      ann: {
        ...FSD50K_ANN_CONFIG,
        candidateNeighbours,
        recordedNeighbours,
        artifactPath: path.relative(outputDirectory, annPath).replaceAll('\\', '/'),
        artifactSizeBytes: temporaryAnnDetails.size,
        artifactSha256: annSha256,
      },
      duplicateSimilarityThreshold: duplicateThreshold,
      counts: {
        queuedUniqueAudio: validated.inspection.embeddingQueue.length,
        embeddedUniqueAudio: entries.length,
        sourceIdsRepresented: entries.reduce(
          (total, entry) => total + entry.memberSourceIds.length,
          0,
        ),
        clusters: clusters.length,
        duplicateCandidateClusters: duplicateClusters.length,
        duplicateCandidateCanonicalEntries: duplicateClusters.reduce(
          (total, cluster) => total + cluster.canonicalSourceIds.length,
          0,
        ),
        representatives: representativeCanonicalSourceIds.size,
        acceptedMetadataEntries: entries.filter(entry => (
          entry.sourceEvidence.some(source => source.status === 'accepted-for-embedding')
        )).length,
        quarantinedMetadataEntries: entries.filter(entry => (
          entry.sourceEvidence.some(source => source.status === 'quarantined-metadata')
        )).length,
      },
      entries,
      clusters,
    };
    const report: Fsd50kEmbeddingIndexReport = {
      ...reportWithoutDigest,
      analysisDigestSha256: hashCanonical(reportDigestPayload(reportWithoutDigest)),
    };
    const reportPath = path.join(outputDirectory, REPORT_FILENAME);
    await atomicWriteJson(reportPath, report);
    return {
      report,
      reportPath,
      annPath,
      recoveredStaleLock: lock.recoveredStaleLock,
      runCounts: { reusedCheckpoints, newCheckpoints },
    };
  } finally {
    await lock.release();
  }
}

async function embedQueueEntry(input: {
  queueEntry: Fsd50kEmbeddingQueueEntry;
  evidence: SourceEvidence[];
  extractionDirectory: string;
  inspectionAnalysisDigestSha256: string;
  completedAt: Date;
  runtime: SfxClapEmbeddingRuntime;
  riskTextEmbeddings: readonly Float32Array[];
  decodeAudio: (buffer: Buffer) => Promise<DecodedAudio>;
  resampleMono: (
    samples: Float32Array,
    inputSampleRateHz: number,
    outputSampleRateHz: number,
  ) => Promise<Float32Array>;
}): Promise<Fsd50kEmbeddingCheckpoint> {
  let preprocessing: PcmPreprocessReceipt | undefined;
  const assignedRole = selectProvisionalRole(input.evidence);
  const singleSourceReport = {
    version: 'editron-fsd50k-audio-sample-v1',
    candidatePoolSha256: input.inspectionAnalysisDigestSha256,
    policy: {
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
    },
    counts: { accepted: 1 },
    entries: [{
      sourceId: input.queueEntry.canonicalSourceId,
      assignedRole,
      status: 'accepted',
      title: `FSD50K ${input.queueEntry.canonicalSourceId}`,
      audioPath: input.queueEntry.sourceAudioPath,
      providerTags: input.evidence.flatMap(item => item.labels),
      measurement: {
        sourceHashSha256: input.queueEntry.sourceHashSha256,
      },
    }],
  };
  const screening = await analyzeFsd50kSfxEmbeddings({
    sampleRoot: input.extractionDirectory,
    sampleReport: singleSourceReport,
    generatedAt: input.completedAt,
  }, {
    runtime: input.runtime,
    decodeAudio: async buffer => {
      const decoded = await input.decodeAudio(buffer);
      const prepared = await prepareMonoPcm(decoded, input.resampleMono);
      preprocessing = prepared.receipt;
      return {
        sampleRate: SFX_CLAP_SAMPLE_RATE_HZ,
        channelData: [prepared.samples],
      };
    },
  });
  const screened = screening.entries[0];
  if (!screened || !preprocessing) {
    throw new Fsd50kEmbeddingIndexError(
      'MISSING_EMBEDDING_OUTPUT',
      `Pinned CLAP returned no result for ${input.queueEntry.canonicalSourceId}`,
    );
  }
  const embedding = decodeFloat32Embedding(
    screened.embedding.value,
    screened.embedding.dimension,
  );
  const semanticRisks = FSD50K_SEMANTIC_RISK_PROMPTS
    .map((item, index) => ({
      risk: item.risk,
      prompt: item.prompt,
      cosineSimilarity: round6(cosineSimilarity(
        embedding,
        input.riskTextEmbeddings[index] ?? failMissingRiskEmbedding(item.risk),
      )),
    }))
    .sort((left, right) => (
      right.cosineSimilarity - left.cosineSimilarity
      || left.risk.localeCompare(right.risk)
    ));
  const checkpointWithoutDigest = {
    version: FSD50K_EMBEDDING_CHECKPOINT_VERSION,
    completedAt: input.completedAt.toISOString(),
    source: {
      inspectionAnalysisDigestSha256: input.inspectionAnalysisDigestSha256,
      canonicalSourceId: input.queueEntry.canonicalSourceId,
      sourceAudioPath: input.queueEntry.sourceAudioPath,
      sourceHashSha256: input.queueEntry.sourceHashSha256,
      memberSourceIds: [...input.queueEntry.memberSourceIds],
    },
    model: input.runtime.descriptor,
    prompts: {
      semanticRolePromptsSha256: hashCanonical(SFX_SEMANTIC_ROLE_PROMPTS),
      semanticRiskPromptsSha256: hashCanonical(FSD50K_SEMANTIC_RISK_PROMPTS),
    },
    preprocessing: {
      provider: 'libsamplerate-js' as const,
      packageVersion: FSD50K_RESAMPLER_VERSION,
      converter: 'SRC_SINC_FASTEST' as const,
      ...preprocessing,
    },
    segmentCount: screened.segmentCount,
    embedding: screened.embedding,
    semanticRoles: screened.semanticRoles,
    topRole: screened.topRole,
    topRoleScore: screened.topRoleScore,
    semanticRisks,
    sourceEvidence: input.evidence,
  };
  return {
    ...checkpointWithoutDigest,
    checkpointDigestSha256: hashCanonical(checkpointWithoutDigest),
  };
}

async function prepareMonoPcm(
  decoded: DecodedAudio,
  resampleMono: (
    samples: Float32Array,
    inputSampleRateHz: number,
    outputSampleRateHz: number,
  ) => Promise<Float32Array>,
): Promise<{ samples: Float32Array; receipt: PcmPreprocessReceipt }> {
  if (
    !Number.isSafeInteger(decoded.sampleRate)
    || decoded.sampleRate <= 0
    || decoded.channelData.length < 1
    || decoded.channelData.length > 2
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_SOURCE_PCM',
      'FSD50K embedding input must decode to mono or stereo PCM with a positive integer sample rate',
    );
  }
  const inputSamplesPerChannel = Math.min(...decoded.channelData.map(channel => channel.length));
  if (!Number.isSafeInteger(inputSamplesPerChannel) || inputSamplesPerChannel <= 0) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_SOURCE_PCM',
      'FSD50K embedding input contains no PCM samples',
    );
  }
  const mono = new Float32Array(inputSamplesPerChannel);
  for (let sampleIndex = 0; sampleIndex < inputSamplesPerChannel; sampleIndex += 1) {
    let sum = 0;
    for (const channel of decoded.channelData) {
      const sample = channel[sampleIndex];
      if (!Number.isFinite(sample)) {
        throw new Fsd50kEmbeddingIndexError(
          'INVALID_SOURCE_PCM',
          `FSD50K embedding input contains non-finite PCM at sample ${sampleIndex}`,
        );
      }
      sum += sample;
    }
    mono[sampleIndex] = sum / decoded.channelData.length;
  }
  const expectedSamples = Math.round(
    inputSamplesPerChannel * SFX_CLAP_SAMPLE_RATE_HZ / decoded.sampleRate,
  );
  const resampled = decoded.sampleRate === SFX_CLAP_SAMPLE_RATE_HZ
    ? mono
    : await resampleMono(mono, decoded.sampleRate, SFX_CLAP_SAMPLE_RATE_HZ);
  if (
    !(resampled instanceof Float32Array)
    || resampled.length !== expectedSamples
    || resampled.length <= 0
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_RESAMPLER_OUTPUT',
      `Resampler returned ${resampled.length} samples; expected exactly ${expectedSamples}`,
    );
  }
  for (const sample of resampled) {
    if (!Number.isFinite(sample)) {
      throw new Fsd50kEmbeddingIndexError(
        'INVALID_RESAMPLER_OUTPUT',
        'Resampler returned non-finite PCM',
      );
    }
  }
  return {
    samples: resampled,
    receipt: {
      inputSampleRateHz: decoded.sampleRate,
      inputChannelCount: decoded.channelData.length,
      inputSamplesPerChannel,
      outputSampleRateHz: SFX_CLAP_SAMPLE_RATE_HZ,
      outputChannelCount: 1,
      outputSamples: resampled.length,
      resampled: decoded.sampleRate !== SFX_CLAP_SAMPLE_RATE_HZ,
      flushOutputSamples: FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES,
      lengthPolicy: 'zero-pad-flush-then-crop-exact',
    },
  };
}

async function resampleMonoWithLibsamplerate(
  samples: Float32Array,
  inputSampleRateHz: number,
  outputSampleRateHz: number,
): Promise<Float32Array> {
  const expectedSamples = Math.round(
    samples.length * outputSampleRateHz / inputSampleRateHz,
  );
  const flushInputSamples = Math.ceil(
    FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES * inputSampleRateHz / outputSampleRateHz,
  );
  const paddedSamples = new Float32Array(samples.length + flushInputSamples);
  paddedSamples.set(samples);
  const converter = await samplerate.create(1, inputSampleRateHz, outputSampleRateHz, {
    converterType: samplerate.ConverterType.SRC_SINC_FASTEST,
  });
  try {
    const converted = converter.simple(paddedSamples);
    if (converted.length < expectedSamples) {
      throw new Fsd50kEmbeddingIndexError(
        'INVALID_RESAMPLER_OUTPUT',
        `Resampler returned ${converted.length} flushed samples; expected at least ${expectedSamples}`,
      );
    }
    return converted.slice(0, expectedSamples);
  } finally {
    converter.destroy();
  }
}

function populateAnnCandidates(
  ann: Fsd50kAnnIndex,
  entries: WorkingEmbedding[],
  candidateNeighbours: number,
  recordedNeighbours: number,
  duplicateThreshold: number,
): { verifiedEdges: VerifiedEdge[] } {
  if (entries.length === 0) {
    throw new Fsd50kEmbeddingIndexError(
      'EMPTY_EMBEDDING_SELECTION',
      'Cannot build an ANN index without embeddings',
    );
  }
  const dimension = entries[0].embedding.length;
  const keys = new BigUint64Array(entries.length);
  const matrix = new Float32Array(entries.length * dimension);
  const entryBySourceId = new Map<string, WorkingEmbedding>();
  entries.forEach((entry, index) => {
    const sourceId = entry.checkpoint.source.canonicalSourceId;
    keys[index] = BigInt(sourceId);
    matrix.set(entry.embedding, index * dimension);
    entryBySourceId.set(sourceId, entry);
  });
  ann.add(keys, matrix);
  const edgeByPair = new Map<string, VerifiedEdge>();
  const searchCount = Math.min(entries.length, candidateNeighbours + 1);
  for (const entry of entries) {
    const sourceId = entry.checkpoint.source.canonicalSourceId;
    const results = ann.search(entry.embedding, searchCount);
    if (results.keys.length !== results.distances.length) {
      throw new Fsd50kEmbeddingIndexError(
        'INVALID_ANN_OUTPUT',
        `ANN key and distance counts differ for ${sourceId}`,
      );
    }
    const candidates = [...results.keys]
      .map(key => key.toString())
      .filter(candidateId => candidateId !== sourceId)
      .map(candidateId => {
        const candidate = entryBySourceId.get(candidateId)
          ?? failUnknownAnnKey(candidateId);
        return {
          canonicalSourceId: candidateId,
          cosineSimilarity: round6(cosineSimilarity(entry.embedding, candidate.embedding)),
        };
      })
      .sort((left, right) => (
        right.cosineSimilarity - left.cosineSimilarity
        || compareSourceIds(left.canonicalSourceId, right.canonicalSourceId)
      ))
      .slice(0, candidateNeighbours);
    entry.annNeighbours = candidates.slice(0, recordedNeighbours);
    for (const candidate of candidates) {
      if (candidate.cosineSimilarity < duplicateThreshold) continue;
      const [leftSourceId, rightSourceId] = [sourceId, candidate.canonicalSourceId]
        .sort(compareSourceIds);
      const pairKey = `${leftSourceId}:${rightSourceId}`;
      const previous = edgeByPair.get(pairKey);
      if (!previous || candidate.cosineSimilarity > previous.cosineSimilarity) {
        edgeByPair.set(pairKey, {
          leftSourceId,
          rightSourceId,
          cosineSimilarity: candidate.cosineSimilarity,
        });
      }
    }
  }
  return {
    verifiedEdges: [...edgeByPair.values()].sort((left, right) => (
      compareSourceIds(left.leftSourceId, right.leftSourceId)
      || compareSourceIds(left.rightSourceId, right.rightSourceId)
    )),
  };
}

function createUsearchAnnIndex(dimension: number): Fsd50kAnnIndex {
  const index = new Index({
    dimensions: dimension,
    metric: MetricKind.Cos,
    quantization: ScalarKind.F32,
    connectivity: FSD50K_ANN_CONFIG.connectivity,
    expansion_add: FSD50K_ANN_CONFIG.expansionAdd,
    expansion_search: FSD50K_ANN_CONFIG.expansionSearch,
    multi: false,
  });
  return {
    add(keys, vectors) {
      index.add(keys, vectors, 0);
    },
    search(vector, count) {
      return index.search(vector, count, 1);
    },
    save(filePath) {
      index.save(filePath);
    },
    size() {
      return index.size();
    },
  };
}

function clusterVerifiedCandidates(
  entries: WorkingEmbedding[],
  edges: readonly VerifiedEdge[],
): {
  clusters: Fsd50kEmbeddingCluster[];
  clusterByCanonicalSourceId: Map<string, string>;
  representativeCanonicalSourceIds: Set<string>;
} {
  const sourceIds = entries
    .map(entry => entry.checkpoint.source.canonicalSourceId)
    .sort(compareSourceIds);
  const indexBySourceId = new Map(sourceIds.map((sourceId, index) => [sourceId, index]));
  const entryBySourceId = new Map(entries.map(entry => [
    entry.checkpoint.source.canonicalSourceId,
    entry,
  ]));
  const parent = sourceIds.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
    }
  };
  for (const edge of edges) {
    union(
      indexBySourceId.get(edge.leftSourceId) ?? failUnknownAnnKey(edge.leftSourceId),
      indexBySourceId.get(edge.rightSourceId) ?? failUnknownAnnKey(edge.rightSourceId),
    );
  }
  const membersByRoot = new Map<number, string[]>();
  sourceIds.forEach((sourceId, index) => {
    const root = find(index);
    membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), sourceId]);
  });
  const clusterByCanonicalSourceId = new Map<string, string>();
  const representativeCanonicalSourceIds = new Set<string>();
  const clusters = [...membersByRoot.values()]
    .map<Fsd50kEmbeddingCluster>(canonicalSourceIds => {
      canonicalSourceIds.sort(compareSourceIds);
      const members = canonicalSourceIds.map(sourceId => (
        entryBySourceId.get(sourceId) ?? failUnknownAnnKey(sourceId)
      ));
      const representative = [...members].sort((left, right) => (
        acceptedMetadataScore(right.checkpoint) - acceptedMetadataScore(left.checkpoint)
        || right.checkpoint.topRoleScore - left.checkpoint.topRoleScore
        || compareSourceIds(
          left.checkpoint.source.canonicalSourceId,
          right.checkpoint.source.canonicalSourceId,
        )
      ))[0];
      const memberSet = new Set(canonicalSourceIds);
      const clusterEdges = edges.filter(edge => (
        memberSet.has(edge.leftSourceId) && memberSet.has(edge.rightSourceId)
      ));
      const clusterId = `sfx_cluster_${createHash('sha256')
        .update(canonicalSourceIds.join(':'))
        .digest('hex')
        .slice(0, 16)}`;
      const representativeCanonicalSourceId = representative.checkpoint.source.canonicalSourceId;
      canonicalSourceIds.forEach(sourceId => clusterByCanonicalSourceId.set(sourceId, clusterId));
      representativeCanonicalSourceIds.add(representativeCanonicalSourceId);
      const similarities = clusterEdges.map(edge => edge.cosineSimilarity);
      return {
        clusterId,
        duplicateCandidate: canonicalSourceIds.length > 1,
        canonicalSourceIds,
        allSourceIds: members
          .flatMap(member => member.checkpoint.source.memberSourceIds)
          .sort(compareSourceIds),
        representativeCanonicalSourceId,
        representativeRule: 'accepted-metadata-then-highest-role-score-then-source-id',
        verifiedEdgeCount: clusterEdges.length,
        minimumVerifiedEdgeSimilarity: similarities.length ? Math.min(...similarities) : 1,
        maximumVerifiedEdgeSimilarity: similarities.length ? Math.max(...similarities) : 1,
      };
    })
    .sort((left, right) => compareSourceIds(
      left.canonicalSourceIds[0],
      right.canonicalSourceIds[0],
    ));
  return {
    clusters,
    clusterByCanonicalSourceId,
    representativeCanonicalSourceIds,
  };
}

function validateEmbeddingInput(
  value: unknown,
  limit: number | undefined,
): ValidatedEmbeddingInput {
  if (
    !isRecord(value)
    || value.version !== 'editron-fsd50k-inspection-index-v1'
    || typeof value.completedAt !== 'string'
    || !isRecord(value.source)
    || typeof value.source.candidatePoolSha256 !== 'string'
    || !SHA256_PATTERN.test(value.source.candidatePoolSha256)
    || typeof value.source.extractionDigestSha256 !== 'string'
    || !SHA256_PATTERN.test(value.source.extractionDigestSha256)
    || !isRecord(value.counts)
    || !Number.isSafeInteger(value.counts.embeddingQueueUniqueAudio)
    || !Array.isArray(value.entries)
    || !Array.isArray(value.embeddingQueue)
    || typeof value.analysisDigestSha256 !== 'string'
    || !SHA256_PATTERN.test(value.analysisDigestSha256)
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_INSPECTION_INDEX',
      'Expected a complete editron-fsd50k-inspection-index-v1 receipt',
    );
  }
  const { analysisDigestSha256, completedAt: _completedAt, ...payload } = value;
  if (hashCanonical(payload) !== analysisDigestSha256) {
    throw new Fsd50kEmbeddingIndexError(
      'INSPECTION_INDEX_DIGEST_MISMATCH',
      'FSD50K inspection index digest is invalid',
    );
  }
  if (value.embeddingQueue.length !== value.counts.embeddingQueueUniqueAudio) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_INSPECTION_INDEX',
      'FSD50K embedding queue count does not match its inspection receipt',
    );
  }
  const evidenceBySourceId = new Map<string, Fsd50kInspectionIndexEntry>();
  for (const entry of value.entries) {
    validateInspectionEntry(entry);
    if (evidenceBySourceId.has(entry.sourceId)) {
      throw new Fsd50kEmbeddingIndexError(
        'INVALID_INSPECTION_INDEX',
        `Duplicate FSD50K inspection source ${entry.sourceId}`,
      );
    }
    evidenceBySourceId.set(entry.sourceId, entry as Fsd50kInspectionIndexEntry);
  }
  const queue = value.embeddingQueue.map((entry) => {
    validateQueueEntry(entry, evidenceBySourceId);
    return entry as Fsd50kEmbeddingQueueEntry;
  }).sort((left, right) => compareSourceIds(left.canonicalSourceId, right.canonicalSourceId));
  if (new Set(queue.map(entry => entry.canonicalSourceId)).size !== queue.length) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_INSPECTION_INDEX',
      'FSD50K embedding queue contains duplicate canonical source IDs',
    );
  }
  const selectedCount = limit === undefined
    ? queue.length
    : boundedInteger(limit, 1, queue.length, 'limit');
  const selectedQueue = queue.slice(0, selectedCount);
  return {
    inspection: value as unknown as Fsd50kInspectionIndex,
    selectedQueue,
    evidenceBySourceId,
    selectionSha256: hashCanonical(selectedQueue.map(entry => ({
      canonicalSourceId: entry.canonicalSourceId,
      sourceHashSha256: entry.sourceHashSha256,
      memberSourceIds: entry.memberSourceIds,
    }))),
  };
}

function validateInspectionEntry(value: unknown): asserts value is Fsd50kInspectionIndexEntry {
  if (
    !isRecord(value)
    || typeof value.sourceId !== 'string'
    || !SOURCE_ID_PATTERN.test(value.sourceId)
    || !isInspectionStatus(value.status)
    || !Array.isArray(value.labels)
    || !value.labels.every(label => typeof label === 'string')
    || !Array.isArray(value.provisionalEditorialRoles)
    || !value.provisionalEditorialRoles.every(isSfxRole)
    || !Array.isArray(value.provisionalRoleEvidence)
    || !value.provisionalRoleEvidence.every(item => typeof item === 'string')
    || !Array.isArray(value.metadataRiskFlags)
    || !value.metadataRiskFlags.every(item => typeof item === 'string')
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_INSPECTION_INDEX',
      'FSD50K inspection source evidence is invalid',
    );
  }
}

function validateQueueEntry(
  value: unknown,
  evidenceBySourceId: ReadonlyMap<string, Fsd50kInspectionIndexEntry>,
): asserts value is Fsd50kEmbeddingQueueEntry {
  if (
    !isRecord(value)
    || typeof value.canonicalSourceId !== 'string'
    || !SOURCE_ID_PATTERN.test(value.canonicalSourceId)
    || typeof value.sourceAudioPath !== 'string'
    || typeof value.sourceHashSha256 !== 'string'
    || !SHA256_PATTERN.test(value.sourceHashSha256)
    || !Array.isArray(value.memberSourceIds)
    || value.memberSourceIds.length === 0
    || !value.memberSourceIds.every(sourceId => (
      typeof sourceId === 'string' && SOURCE_ID_PATTERN.test(sourceId)
    ))
    || new Set(value.memberSourceIds).size !== value.memberSourceIds.length
    || !value.memberSourceIds.includes(value.canonicalSourceId)
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_INSPECTION_INDEX',
      'FSD50K embedding queue entry is invalid',
    );
  }
  assertCanonicalSourceAudioPath(value.sourceAudioPath, value.canonicalSourceId);
  for (const sourceId of value.memberSourceIds) {
    if (!evidenceBySourceId.has(sourceId)) {
      throw new Fsd50kEmbeddingIndexError(
        'INVALID_INSPECTION_INDEX',
        `FSD50K queue member ${sourceId} has no inspection evidence`,
      );
    }
  }
}

function validatePinnedRuntime(runtime: SfxClapEmbeddingRuntime): void {
  const descriptor = runtime.descriptor;
  if (
    descriptor.provider !== 'huggingface-transformers-js'
    || descriptor.packageVersion !== SFX_CLAP_TRANSFORMERS_VERSION
    || descriptor.modelId !== SFX_CLAP_MODEL_ID
    || descriptor.revision !== SFX_CLAP_MODEL_REVISION
    || descriptor.dtype !== 'q8'
    || descriptor.sampleRateHz !== SFX_CLAP_SAMPLE_RATE_HZ
    || descriptor.embeddingDimension !== SFX_CLAP_EMBEDDING_DIMENSION
    || descriptor.windowing !== 'non-overlapping-10s-duration-weighted-mean'
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'UNPINNED_CLAP_RUNTIME',
      'Full-corpus embedding requires the pinned 512-dimensional CLAP runtime',
    );
  }
}

function withCachedRoleTextEmbeddings(
  runtime: SfxClapEmbeddingRuntime,
  rolePrompts: readonly string[],
  roleTextEmbeddings: readonly Float32Array[],
): SfxClapEmbeddingRuntime {
  return {
    descriptor: runtime.descriptor,
    embedTexts: async prompts => {
      if (
        prompts.length === rolePrompts.length
        && prompts.every((prompt, index) => prompt === rolePrompts[index])
      ) {
        return roleTextEmbeddings;
      }
      return runtime.embedTexts(prompts);
    },
    embedAudio: (samples, sampleRateHz) => runtime.embedAudio(samples, sampleRateHz),
  };
}

function validateTextEmbeddingBatch(
  embeddings: readonly Float32Array[],
  expectedRows: number,
  expectedDimension: number,
  label: string,
): void {
  if (
    embeddings.length !== expectedRows
    || embeddings.some(embedding => (
      !(embedding instanceof Float32Array)
      || embedding.length !== expectedDimension
      || !embedding.every(Number.isFinite)
    ))
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_MODEL_OUTPUT',
      `CLAP ${label} text embeddings have an invalid shape or value`,
    );
  }
}

async function readEmbeddingCheckpoint(
  checkpointPath: string,
): Promise<Fsd50kEmbeddingCheckpoint | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(checkpointPath, 'utf8'));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null;
    throw new Fsd50kEmbeddingIndexError(
      'CHECKPOINT_READ_FAILED',
      `Unable to read FSD50K embedding checkpoint ${checkpointPath}`,
      { cause: error },
    );
  }
  if (
    !isRecord(value)
    || value.version !== FSD50K_EMBEDDING_CHECKPOINT_VERSION
    || typeof value.checkpointDigestSha256 !== 'string'
    || !SHA256_PATTERN.test(value.checkpointDigestSha256)
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_EMBEDDING_CHECKPOINT',
      `FSD50K embedding checkpoint is invalid: ${checkpointPath}`,
    );
  }
  const checkpoint = value as unknown as Fsd50kEmbeddingCheckpoint;
  if (
    hashCanonical(checkpointWithoutDigest(checkpoint))
      !== checkpoint.checkpointDigestSha256
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'CHECKPOINT_DIGEST_MISMATCH',
      `FSD50K embedding checkpoint digest is invalid: ${checkpointPath}`,
    );
  }
  return checkpoint;
}

function validateCheckpointAgainstInput(
  checkpoint: Fsd50kEmbeddingCheckpoint,
  queueEntry: Fsd50kEmbeddingQueueEntry,
  evidence: SourceEvidence[],
  inspectionAnalysisDigestSha256: string,
  model: SfxClapModelDescriptor,
): void {
  if (
    checkpoint.source.inspectionAnalysisDigestSha256 !== inspectionAnalysisDigestSha256
    || checkpoint.source.canonicalSourceId !== queueEntry.canonicalSourceId
    || checkpoint.source.sourceAudioPath !== queueEntry.sourceAudioPath
    || checkpoint.source.sourceHashSha256 !== queueEntry.sourceHashSha256
    || hashCanonical(checkpoint.source.memberSourceIds) !== hashCanonical(queueEntry.memberSourceIds)
    || hashCanonical(checkpoint.sourceEvidence) !== hashCanonical(evidence)
    || hashCanonical(checkpoint.model) !== hashCanonical(model)
    || checkpoint.prompts.semanticRolePromptsSha256 !== hashCanonical(SFX_SEMANTIC_ROLE_PROMPTS)
    || checkpoint.prompts.semanticRiskPromptsSha256 !== hashCanonical(FSD50K_SEMANTIC_RISK_PROMPTS)
    || checkpoint.preprocessing.provider !== 'libsamplerate-js'
    || checkpoint.preprocessing.packageVersion !== FSD50K_RESAMPLER_VERSION
    || checkpoint.preprocessing.converter !== 'SRC_SINC_FASTEST'
    || checkpoint.preprocessing.outputSampleRateHz !== SFX_CLAP_SAMPLE_RATE_HZ
    || checkpoint.preprocessing.outputChannelCount !== 1
    || checkpoint.preprocessing.flushOutputSamples
      !== FSD50K_RESAMPLER_FLUSH_OUTPUT_SAMPLES
    || checkpoint.preprocessing.lengthPolicy !== 'zero-pad-flush-then-crop-exact'
    || !Number.isSafeInteger(checkpoint.preprocessing.outputSamples)
    || checkpoint.preprocessing.outputSamples <= 0
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'STALE_EMBEDDING_CHECKPOINT',
      `FSD50K embedding checkpoint does not match current input: ${queueEntry.canonicalSourceId}`,
    );
  }
}

function decodeAndValidateCheckpointEmbedding(
  checkpoint: Fsd50kEmbeddingCheckpoint,
  expectedDimension: number,
): Float32Array {
  if (
    checkpoint.embedding.encoding !== 'base64-f32le'
    || checkpoint.embedding.dimension !== expectedDimension
    || !Number.isSafeInteger(checkpoint.segmentCount)
    || checkpoint.segmentCount <= 0
    || !isSfxRole(checkpoint.topRole)
    || !Number.isFinite(checkpoint.topRoleScore)
    || !Array.isArray(checkpoint.semanticRoles)
    || !Array.isArray(checkpoint.semanticRisks)
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_EMBEDDING_CHECKPOINT',
      `FSD50K embedding checkpoint payload is invalid: ${checkpoint.source.canonicalSourceId}`,
    );
  }
  const embedding = decodeFloat32Embedding(
    checkpoint.embedding.value,
    checkpoint.embedding.dimension,
  );
  const selfSimilarity = cosineSimilarity(embedding, embedding);
  if (!Number.isFinite(selfSimilarity) || Math.abs(selfSimilarity - 1) > 0.000_01) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_EMBEDDING_CHECKPOINT',
      `FSD50K checkpoint embedding is not finite: ${checkpoint.source.canonicalSourceId}`,
    );
  }
  return embedding;
}

async function acquireEmbeddingLock(
  outputDirectory: string,
  processIsAlive: (pid: number) => boolean,
): Promise<EmbeddingLock> {
  await mkdir(outputDirectory, { recursive: true });
  const lockDirectory = path.join(outputDirectory, LOCK_DIRECTORY);
  let recoveredStaleLock = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID();
    try {
      await mkdir(lockDirectory);
      await writeFile(
        path.join(lockDirectory, LOCK_OWNER_FILENAME),
        `${JSON.stringify({
          version: 'editron-fsd50k-embedding-lock-v1',
          pid: process.pid,
          token,
          startedAt: new Date().toISOString(),
        }, null, 2)}\n`,
        'utf8',
      );
      return {
        recoveredStaleLock,
        release: async () => {
          let owner: unknown;
          try {
            owner = JSON.parse(
              await readFile(path.join(lockDirectory, LOCK_OWNER_FILENAME), 'utf8'),
            );
          } catch (error) {
            if (hasErrorCode(error, 'ENOENT')) return;
            throw error;
          }
          if (isRecord(owner) && owner.token === token) {
            await rm(lockDirectory, { recursive: true, force: true });
          }
        },
      };
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      if (!await recoverStaleLock(lockDirectory, processIsAlive)) {
        throw new Fsd50kEmbeddingIndexError(
          'EMBEDDING_ALREADY_RUNNING',
          `Another FSD50K embedding run owns ${lockDirectory}`,
        );
      }
      recoveredStaleLock = true;
    }
  }
  throw new Fsd50kEmbeddingIndexError(
    'EMBEDDING_LOCK_FAILED',
    `Unable to acquire FSD50K embedding lock at ${lockDirectory}`,
  );
}

async function recoverStaleLock(
  lockDirectory: string,
  processIsAlive: (pid: number) => boolean,
): Promise<boolean> {
  let owner: unknown;
  try {
    owner = JSON.parse(await readFile(path.join(lockDirectory, LOCK_OWNER_FILENAME), 'utf8'));
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
    return false;
  }
  await rm(staleDirectory, { recursive: true, force: true });
  return true;
}

function defaultProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH');
  }
}

function embeddingCheckpointPath(
  outputDirectory: string,
  queueEntry: Fsd50kEmbeddingQueueEntry,
): string {
  return path.join(
    outputDirectory,
    CHECKPOINT_DIRECTORY,
    queueEntry.sourceHashSha256.slice(0, 2),
    `${queueEntry.canonicalSourceId}.json`,
  );
}

function sourceEvidence(entry: Fsd50kInspectionIndexEntry): SourceEvidence {
  return {
    sourceId: entry.sourceId,
    status: entry.status,
    labels: [...entry.labels],
    provisionalEditorialRoles: [...entry.provisionalEditorialRoles],
    provisionalRoleEvidence: [...entry.provisionalRoleEvidence],
    metadataRiskFlags: [...entry.metadataRiskFlags],
  };
}

function selectProvisionalRole(evidence: readonly SourceEvidence[]): SfxCatalogEventRole {
  const role = evidence.flatMap(item => item.provisionalEditorialRoles)[0];
  return role ?? 'foley';
}

function acceptedMetadataScore(checkpoint: Fsd50kEmbeddingCheckpoint): number {
  return checkpoint.sourceEvidence.some(source => source.status === 'accepted-for-embedding')
    ? 1
    : 0;
}

function checkpointWithoutDigest(
  checkpoint: Fsd50kEmbeddingCheckpoint,
): Omit<Fsd50kEmbeddingCheckpoint, 'checkpointDigestSha256'> {
  const { checkpointDigestSha256: _digest, ...withoutDigest } = checkpoint;
  return withoutDigest;
}

function reportDigestPayload<T extends { completedAt: string }>(
  report: T,
): Omit<T, 'completedAt'> {
  const { completedAt: _completedAt, ...payload } = report;
  return payload;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}-${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

async function hashFileSha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function verifyQueueSourceHash(
  extractionDirectory: string,
  queueEntry: Fsd50kEmbeddingQueueEntry,
): Promise<void> {
  const sourcePath = path.resolve(
    extractionDirectory,
    ...queueEntry.sourceAudioPath.split('/'),
  );
  const relative = path.relative(extractionDirectory, sourcePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Fsd50kEmbeddingIndexError(
      'UNSAFE_SOURCE_PATH',
      `FSD50K source path escapes the extraction root: ${queueEntry.sourceAudioPath}`,
    );
  }
  const details = await stat(sourcePath);
  if (!details.isFile() || details.size <= 0) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_SOURCE_FILE',
      `FSD50K source ${queueEntry.canonicalSourceId} is not a non-empty file`,
    );
  }
  if (details.size > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
    throw new Fsd50kEmbeddingIndexError(
      'AUDIO_FILE_TOO_LARGE',
      `FSD50K source ${queueEntry.canonicalSourceId} exceeds ${MAX_AUDIO_CONDITIONING_INPUT_BYTES} bytes`,
    );
  }
  if (await hashFileSha256(sourcePath) !== queueEntry.sourceHashSha256) {
    throw new Fsd50kEmbeddingIndexError(
      'SOURCE_HASH_MISMATCH',
      `FSD50K source ${queueEntry.canonicalSourceId} changed after acoustic inspection`,
    );
  }
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateDuplicateThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_EMBEDDING_OPTION',
      'duplicateSimilarityThreshold must be greater than 0 and at most 1',
    );
  }
  return value;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Fsd50kEmbeddingIndexError(
      'INVALID_EMBEDDING_OPTION',
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function assertCanonicalSourceAudioPath(sourceAudioPath: string, sourceId: string): void {
  if (
    sourceAudioPath !== `FSD50K.dev_audio/${sourceId}.wav`
    && sourceAudioPath !== `FSD50K.eval_audio/${sourceId}.wav`
  ) {
    throw new Fsd50kEmbeddingIndexError(
      'UNSAFE_SOURCE_PATH',
      `FSD50K source ${sourceId} has an unsafe or non-canonical audio path`,
    );
  }
}

function assertSafeDirectory(directory: string, label: string): void {
  const parsed = path.parse(directory);
  if (directory === parsed.root || !path.basename(directory) || directory.includes('\0')) {
    throw new Fsd50kEmbeddingIndexError(
      'UNSAFE_DIRECTORY',
      `Unsafe FSD50K ${label} directory: ${directory}`,
    );
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Fsd50kEmbeddingIndexError(
      'EMBEDDING_ABORTED',
      'FSD50K embedding was interrupted after its last durable checkpoint',
    );
  }
}

function isInspectionStatus(value: unknown): value is Fsd50kInspectionStatus {
  return value === 'accepted-for-embedding'
    || value === 'quarantined-metadata'
    || value === 'rejected-metadata'
    || value === 'rejected-acoustic';
}

function isSfxRole(value: unknown): value is SfxCatalogEventRole {
  return typeof value === 'string'
    && SFX_SEMANTIC_ROLE_PROMPTS.some(item => item.role === value);
}

function compareSourceIds(left: string, right: string): number {
  return Number(left) - Number(right) || left.localeCompare(right);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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

function failMissingEvidence(sourceId: string): never {
  throw new Fsd50kEmbeddingIndexError(
    'MISSING_SOURCE_EVIDENCE',
    `FSD50K source ${sourceId} has no inspection evidence`,
  );
}

function failMissingRiskEmbedding(risk: Fsd50kSemanticRisk): never {
  throw new Fsd50kEmbeddingIndexError(
    'INVALID_MODEL_OUTPUT',
    `Pinned CLAP returned no text embedding for semantic risk ${risk}`,
  );
}

function failUnknownAnnKey(sourceId: string): never {
  throw new Fsd50kEmbeddingIndexError(
    'INVALID_ANN_OUTPUT',
    `ANN returned unknown FSD50K source ${sourceId}`,
  );
}

function failMissingCluster(sourceId: string): never {
  throw new Fsd50kEmbeddingIndexError(
    'MISSING_CLUSTER',
    `FSD50K source ${sourceId} has no cluster assignment`,
  );
}
