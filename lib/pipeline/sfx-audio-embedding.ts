import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import decode from 'audio-decode';

import { MAX_AUDIO_CONDITIONING_INPUT_BYTES } from '@/lib/pipeline/audio-conditioning';
import type { SfxCatalogEventRole } from '@/lib/pipeline/sfx-catalog';

export const SFX_CLAP_MODEL_ID = 'Xenova/clap-htsat-unfused';
export const SFX_CLAP_MODEL_REVISION = 'c28f2883575e590e04d3146ff0713c2448d691ba';
export const SFX_CLAP_TRANSFORMERS_VERSION = '3.8.1';
export const SFX_CLAP_SAMPLE_RATE_HZ = 48_000;
export const SFX_CLAP_EMBEDDING_DIMENSION = 512;
export const SFX_CLAP_WINDOW_SAMPLES = SFX_CLAP_SAMPLE_RATE_HZ * 10;
export const DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD = 0.985;

export const SFX_SEMANTIC_ROLE_PROMPTS = [
  { role: 'whoosh', prompt: 'a clean designed whoosh, sweep, swish, or rapid air movement sound effect' },
  { role: 'impact', prompt: 'a clean impact, hit, punch, slam, thump, or cinematic boom sound effect' },
  { role: 'tick', prompt: 'a short precise tick, click, tap, clock, or interface timing sound effect' },
  { role: 'pop', prompt: 'a short light rounded pop, snap, pluck, or bubble sound effect' },
  { role: 'riser', prompt: 'a rising build-up, swell, tension, or transition riser sound effect' },
  { role: 'logo-sting', prompt: 'a short polished musical logo sting, sonic ident, or brand mnemonic' },
  { role: 'ambience', prompt: 'a continuous environmental ambience, room tone, atmosphere, or background bed' },
  { role: 'foley', prompt: 'a realistic physical foley action, handling, footstep, object, or material sound' },
  { role: 'shimmer', prompt: 'a bright delicate shimmer, sparkle, chime, glint, or magical tone sound effect' },
] as const satisfies ReadonlyArray<{ role: SfxCatalogEventRole; prompt: string }>;

export type SfxEmbeddingErrorCode =
  | 'INVALID_SAMPLE_REPORT'
  | 'UNSAFE_AUDIO_PATH'
  | 'AUDIO_FILE_TOO_LARGE'
  | 'SOURCE_HASH_MISMATCH'
  | 'AUDIO_DECODE_FAILED'
  | 'INVALID_AUDIO_PCM'
  | 'INVALID_MODEL_OUTPUT'
  | 'MODEL_LOAD_FAILED';

export class SfxEmbeddingError extends Error {
  constructor(
    public readonly code: SfxEmbeddingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SfxEmbeddingError';
  }
}

export interface SfxClapModelDescriptor {
  provider: 'huggingface-transformers-js';
  packageVersion: typeof SFX_CLAP_TRANSFORMERS_VERSION;
  modelId: typeof SFX_CLAP_MODEL_ID;
  revision: typeof SFX_CLAP_MODEL_REVISION;
  dtype: 'q8';
  sampleRateHz: number;
  embeddingDimension: number;
  windowing: 'non-overlapping-10s-duration-weighted-mean';
}

export interface SfxClapEmbeddingRuntime {
  descriptor: SfxClapModelDescriptor;
  embedTexts(prompts: readonly string[]): Promise<readonly Float32Array[]>;
  embedAudio(samples: Float32Array, sampleRateHz: number): Promise<Float32Array>;
  dispose?(): Promise<void>;
}

export interface SfxClapRuntimeOptions {
  cacheDirectory?: string;
  localFilesOnly?: boolean;
}

export interface SfxEmbeddingAnalysisDependencies {
  runtime: SfxClapEmbeddingRuntime;
  readAudioFile?: (filePath: string) => Promise<Buffer>;
  decodeAudio?: (buffer: Buffer) => Promise<DecodedAudio>;
}

export interface EmbedVerifiedConditionedSfxAudioInput {
  sourceId: string;
  encoded: Buffer;
  expectedContentHashSha256: string;
}

export interface EmbedVerifiedConditionedSfxAudioDependencies {
  runtime: SfxClapEmbeddingRuntime;
  decodeAudio?: (buffer: Buffer) => Promise<DecodedAudio>;
}

export interface VerifiedConditionedSfxEmbedding {
  embedding: Float32Array;
  segmentCount: number;
}

export interface SfxEmbeddingAnalysisInput {
  sampleRoot: string;
  sampleReport: unknown;
  generatedAt?: Date;
  duplicateSimilarityThreshold?: number;
}

export interface SfxSemanticRoleScore {
  role: SfxCatalogEventRole;
  prompt: string;
  cosineSimilarity: number;
}

export interface SfxEmbeddingScreeningEntry {
  sourceId: string;
  assignedRole: SfxCatalogEventRole;
  title: string;
  audioPath: string;
  sourceHashSha256: string;
  providerTags: string[];
  segmentCount: number;
  embedding: {
    encoding: 'base64-f32le';
    dimension: number;
    value: string;
  };
  semanticRoles: SfxSemanticRoleScore[];
  topRole: SfxCatalogEventRole;
  topRoleScore: number;
  assignedRoleScore: number;
  assignedRoleRank: number;
  roleAgreement: boolean;
  nearestNeighbor?: {
    sourceId: string;
    cosineSimilarity: number;
  };
  clusterId: string;
  representative: boolean;
}

export interface SfxEmbeddingCluster {
  clusterId: string;
  duplicateCandidate: boolean;
  memberSourceIds: string[];
  assignedRoles: SfxCatalogEventRole[];
  representativeSourceId: string;
  representativeRule: 'highest-assigned-role-similarity-then-source-id';
  minimumPairwiseSimilarity: number;
  maximumPairwiseSimilarity: number;
}

export interface SfxEmbeddingScreeningReport {
  version: 'editron-sfx-clap-screening-v1';
  generatedAt: string;
  sourceCandidatePoolSha256: string;
  sourceReceiptSha256: string;
  policy: {
    purpose: 'internal-semantic-and-near-duplicate-screening';
    publicationAllowed: false;
    productionCatalogMutationAllowed: false;
    humanReviewRequired: true;
  };
  model: SfxClapModelDescriptor;
  rolePrompts: typeof SFX_SEMANTIC_ROLE_PROMPTS;
  duplicateSimilarityThreshold: number;
  counts: {
    acceptedInput: number;
    embedded: number;
    roleAgreement: number;
    clusters: number;
    duplicateCandidateClusters: number;
    duplicateCandidateEntries: number;
    representatives: number;
  };
  entries: SfxEmbeddingScreeningEntry[];
  clusters: SfxEmbeddingCluster[];
  analysisDigestSha256: string;
}

export interface DecodedAudio {
  sampleRate: number;
  channelData: readonly Float32Array[];
}

interface AcceptedSampleEntry {
  sourceId: string;
  assignedRole: SfxCatalogEventRole;
  title: string;
  audioPath: string;
  sourceHashSha256: string;
  providerTags: string[];
}

interface ParsedSampleReport {
  candidatePoolSha256: string;
  acceptedEntries: AcceptedSampleEntry[];
}

interface WorkingEmbeddingEntry extends AcceptedSampleEntry {
  segmentCount: number;
  embedding: Float32Array;
  semanticRoles: SfxSemanticRoleScore[];
  topRole: SfxCatalogEventRole;
  topRoleScore: number;
  assignedRoleScore: number;
  assignedRoleRank: number;
  roleAgreement: boolean;
  nearestNeighbor?: {
    sourceId: string;
    cosineSimilarity: number;
  };
}

export async function createPinnedSfxClapRuntime(
  options: SfxClapRuntimeOptions = {},
): Promise<SfxClapEmbeddingRuntime> {
  try {
    const {
      AutoProcessor,
      AutoTokenizer,
      ClapAudioModelWithProjection,
      ClapTextModelWithProjection,
    } = await import('@huggingface/transformers');
    const cacheDirectory = path.resolve(
      options.cacheDirectory ?? 'tmp/model-cache/clap-htsat-unfused-c28f288',
    );
    const artifactOptions = {
      revision: SFX_CLAP_MODEL_REVISION,
      cache_dir: cacheDirectory,
      local_files_only: options.localFilesOnly ?? false,
    };
    const modelOptions = {
      ...artifactOptions,
      dtype: 'q8' as const,
    };
    const [processor, tokenizer, audioModel, textModel] = await Promise.all([
      AutoProcessor.from_pretrained(SFX_CLAP_MODEL_ID, artifactOptions),
      AutoTokenizer.from_pretrained(SFX_CLAP_MODEL_ID, artifactOptions),
      ClapAudioModelWithProjection.from_pretrained(SFX_CLAP_MODEL_ID, modelOptions),
      ClapTextModelWithProjection.from_pretrained(SFX_CLAP_MODEL_ID, modelOptions),
    ]);

    return {
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
      async embedTexts(prompts) {
        const tokenized = tokenizer([...prompts], { padding: true, truncation: true });
        const output = await textModel(tokenized);
        return extractTensorRows(output, 'text_embeds', prompts.length, SFX_CLAP_EMBEDDING_DIMENSION);
      },
      async embedAudio(samples, sampleRateHz) {
        if (sampleRateHz !== SFX_CLAP_SAMPLE_RATE_HZ) {
          throw new SfxEmbeddingError(
            'INVALID_AUDIO_PCM',
            `CLAP requires ${SFX_CLAP_SAMPLE_RATE_HZ} Hz PCM, received ${sampleRateHz} Hz`,
          );
        }
        if (samples.length > SFX_CLAP_WINDOW_SAMPLES) {
          throw new SfxEmbeddingError(
            'INVALID_AUDIO_PCM',
            `CLAP segment exceeds the deterministic ${SFX_CLAP_WINDOW_SAMPLES}-sample window`,
          );
        }
        const processed = await processor(samples);
        const output = await audioModel(processed);
        return extractTensorRows(output, 'audio_embeds', 1, SFX_CLAP_EMBEDDING_DIMENSION)[0];
      },
      async dispose() {
        await Promise.all([
          Promise.resolve(audioModel.dispose()),
          Promise.resolve(textModel.dispose()),
        ]);
      },
    };
  } catch (error) {
    if (error instanceof SfxEmbeddingError) throw error;
    throw new SfxEmbeddingError(
      'MODEL_LOAD_FAILED',
      `Unable to initialize pinned CLAP runtime ${SFX_CLAP_MODEL_ID}@${SFX_CLAP_MODEL_REVISION}`,
      { cause: error },
    );
  }
}

export async function embedVerifiedConditionedSfxAudio(
  input: EmbedVerifiedConditionedSfxAudioInput,
  dependencies: EmbedVerifiedConditionedSfxAudioDependencies,
): Promise<VerifiedConditionedSfxEmbedding> {
  if (!input.sourceId.trim()) {
    throw new SfxEmbeddingError('INVALID_AUDIO_PCM', 'Conditioned SFX source ID is required');
  }
  if (input.encoded.byteLength > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
    throw new SfxEmbeddingError(
      'AUDIO_FILE_TOO_LARGE',
      `SFX source ${input.sourceId} exceeds ${MAX_AUDIO_CONDITIONING_INPUT_BYTES} bytes`,
    );
  }
  const actualHash = createHash('sha256').update(input.encoded).digest('hex');
  if (
    !/^[a-f0-9]{64}$/.test(input.expectedContentHashSha256)
    || actualHash !== input.expectedContentHashSha256
  ) {
    throw new SfxEmbeddingError(
      'SOURCE_HASH_MISMATCH',
      `Conditioned SFX source ${input.sourceId} does not match its catalog receipt`,
    );
  }
  const decodeAudio = dependencies.decodeAudio ?? (async buffer => decode(buffer));
  const monoPcm = await decodeVerifiedMonoPcm(input.encoded, input.sourceId, decodeAudio);
  const segments = segmentAudioForClap(monoPcm, SFX_CLAP_WINDOW_SAMPLES);
  const segmentEmbeddings: Array<{ embedding: Float32Array; weight: number }> = [];
  for (const segment of segments) {
    const embedding = await dependencies.runtime.embedAudio(
      segment.samples,
      SFX_CLAP_SAMPLE_RATE_HZ,
    );
    segmentEmbeddings.push({
      embedding: validateEmbedding(
        embedding,
        dependencies.runtime.descriptor.embeddingDimension,
        `conditioned audio source ${input.sourceId}`,
      ),
      weight: segment.weight,
    });
  }
  return {
    embedding: weightedMeanEmbedding(
      segmentEmbeddings,
      dependencies.runtime.descriptor.embeddingDimension,
    ),
    segmentCount: segments.length,
  };
}

export async function analyzeFsd50kSfxEmbeddings(
  input: SfxEmbeddingAnalysisInput,
  dependencies: SfxEmbeddingAnalysisDependencies,
): Promise<SfxEmbeddingScreeningReport> {
  const parsed = parseSampleReport(input.sampleReport);
  const threshold = validateDuplicateThreshold(
    input.duplicateSimilarityThreshold ?? DEFAULT_SFX_NEAR_DUPLICATE_THRESHOLD,
  );
  const sampleRoot = path.resolve(input.sampleRoot);
  const readAudioFile = dependencies.readAudioFile ?? (async filePath => readFile(filePath));
  const decodeAudio = dependencies.decodeAudio ?? (async buffer => decode(buffer));
  const prompts = SFX_SEMANTIC_ROLE_PROMPTS.map(item => item.prompt);
  const textEmbeddings = await dependencies.runtime.embedTexts(prompts);
  const normalizedTextEmbeddings = validateEmbeddingBatch(
    textEmbeddings,
    prompts.length,
    dependencies.runtime.descriptor.embeddingDimension,
    'text',
  );
  const roleEmbeddings = new Map(
    SFX_SEMANTIC_ROLE_PROMPTS.map((item, index) => [item.role, normalizedTextEmbeddings[index]]),
  );
  const workingEntries: WorkingEmbeddingEntry[] = [];

  for (const entry of parsed.acceptedEntries) {
    const audioPath = resolveSafeAudioPath(sampleRoot, entry.audioPath);
    const encoded = await readAudioFile(audioPath);
    if (encoded.byteLength > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
      throw new SfxEmbeddingError(
        'AUDIO_FILE_TOO_LARGE',
        `SFX source ${entry.sourceId} exceeds ${MAX_AUDIO_CONDITIONING_INPUT_BYTES} bytes`,
      );
    }
    const actualHash = createHash('sha256').update(encoded).digest('hex');
    if (actualHash !== entry.sourceHashSha256) {
      throw new SfxEmbeddingError(
        'SOURCE_HASH_MISMATCH',
        `SFX source ${entry.sourceId} does not match its acoustic receipt`,
      );
    }
    const monoPcm = await decodeVerifiedMonoPcm(encoded, entry.sourceId, decodeAudio);
    const segments = segmentAudioForClap(monoPcm, SFX_CLAP_WINDOW_SAMPLES);
    const segmentEmbeddings: Array<{ embedding: Float32Array; weight: number }> = [];
    for (const segment of segments) {
      const embedding = await dependencies.runtime.embedAudio(
        segment.samples,
        SFX_CLAP_SAMPLE_RATE_HZ,
      );
      segmentEmbeddings.push({
        embedding: validateEmbedding(
          embedding,
          dependencies.runtime.descriptor.embeddingDimension,
          `audio source ${entry.sourceId}`,
        ),
        weight: segment.weight,
      });
    }
    const embedding = weightedMeanEmbedding(
      segmentEmbeddings,
      dependencies.runtime.descriptor.embeddingDimension,
    );
    const semanticRoles = rankSemanticRoles(embedding, roleEmbeddings);
    const assignedRoleRank = semanticRoles.findIndex(score => score.role === entry.assignedRole) + 1;
    const assignedRoleScore = semanticRoles[assignedRoleRank - 1]?.cosineSimilarity;
    if (!assignedRoleRank || assignedRoleScore === undefined) {
      throw new SfxEmbeddingError(
        'INVALID_MODEL_OUTPUT',
        `No semantic score exists for assigned role ${entry.assignedRole}`,
      );
    }
    workingEntries.push({
      ...entry,
      segmentCount: segments.length,
      embedding,
      semanticRoles,
      topRole: semanticRoles[0].role,
      topRoleScore: semanticRoles[0].cosineSimilarity,
      assignedRoleScore,
      assignedRoleRank,
      roleAgreement: semanticRoles[0].role === entry.assignedRole,
    });
  }

  const { clusters, clusterBySourceId, representativeSourceIds } = clusterEmbeddingEntries(
    workingEntries,
    threshold,
  );
  const entries = workingEntries
    .sort((left, right) => compareSourceIds(left.sourceId, right.sourceId))
    .map<SfxEmbeddingScreeningEntry>(entry => ({
      sourceId: entry.sourceId,
      assignedRole: entry.assignedRole,
      title: entry.title,
      audioPath: entry.audioPath,
      sourceHashSha256: entry.sourceHashSha256,
      providerTags: entry.providerTags,
      segmentCount: entry.segmentCount,
      embedding: {
        encoding: 'base64-f32le',
        dimension: entry.embedding.length,
        value: encodeFloat32Embedding(entry.embedding),
      },
      semanticRoles: entry.semanticRoles,
      topRole: entry.topRole,
      topRoleScore: entry.topRoleScore,
      assignedRoleScore: entry.assignedRoleScore,
      assignedRoleRank: entry.assignedRoleRank,
      roleAgreement: entry.roleAgreement,
      nearestNeighbor: entry.nearestNeighbor,
      clusterId: clusterBySourceId.get(entry.sourceId) ?? failMissingCluster(entry.sourceId),
      representative: representativeSourceIds.has(entry.sourceId),
    }));
  const duplicateClusters = clusters.filter(cluster => cluster.duplicateCandidate);
  const digestPayload = {
    model: dependencies.runtime.descriptor,
    threshold,
    entries: entries.map(entry => ({
      sourceId: entry.sourceId,
      sourceHashSha256: entry.sourceHashSha256,
      embedding: entry.embedding.value,
      semanticRoles: entry.semanticRoles,
      clusterId: entry.clusterId,
      representative: entry.representative,
    })),
    clusters,
  };

  return {
    version: 'editron-sfx-clap-screening-v1',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    sourceCandidatePoolSha256: parsed.candidatePoolSha256,
    sourceReceiptSha256: hashSampleReceipts(parsed.acceptedEntries),
    policy: {
      purpose: 'internal-semantic-and-near-duplicate-screening',
      publicationAllowed: false,
      productionCatalogMutationAllowed: false,
      humanReviewRequired: true,
    },
    model: dependencies.runtime.descriptor,
    rolePrompts: SFX_SEMANTIC_ROLE_PROMPTS,
    duplicateSimilarityThreshold: threshold,
    counts: {
      acceptedInput: parsed.acceptedEntries.length,
      embedded: entries.length,
      roleAgreement: entries.filter(entry => entry.roleAgreement).length,
      clusters: clusters.length,
      duplicateCandidateClusters: duplicateClusters.length,
      duplicateCandidateEntries: duplicateClusters.reduce(
        (total, cluster) => total + cluster.memberSourceIds.length,
        0,
      ),
      representatives: representativeSourceIds.size,
    },
    entries,
    clusters,
    analysisDigestSha256: createHash('sha256')
      .update(JSON.stringify(digestPayload))
      .digest('hex'),
  };
}

export function segmentAudioForClap(
  samples: Float32Array,
  maxWindowSamples = SFX_CLAP_WINDOW_SAMPLES,
): Array<{ startSample: number; samples: Float32Array; weight: number }> {
  if (!Number.isSafeInteger(maxWindowSamples) || maxWindowSamples <= 0 || samples.length === 0) {
    throw new SfxEmbeddingError('INVALID_AUDIO_PCM', 'CLAP windowing requires non-empty finite PCM');
  }
  const segments: Array<{ startSample: number; samples: Float32Array; weight: number }> = [];
  for (let startSample = 0; startSample < samples.length; startSample += maxWindowSamples) {
    const segment = samples.slice(startSample, Math.min(samples.length, startSample + maxWindowSamples));
    segments.push({
      startSample,
      samples: segment,
      weight: segment.length / samples.length,
    });
  }
  return segments;
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', 'Cosine similarity requires equal non-empty vectors');
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', 'Embedding contains a non-finite value');
    }
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm <= Number.EPSILON || rightNorm <= Number.EPSILON) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', 'Embedding has zero magnitude');
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function encodeFloat32Embedding(embedding: Float32Array): string {
  const buffer = Buffer.allocUnsafe(embedding.length * Float32Array.BYTES_PER_ELEMENT);
  embedding.forEach((value, index) => buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT));
  return buffer.toString('base64');
}

export function decodeFloat32Embedding(value: string, dimension: number): Float32Array {
  const buffer = Buffer.from(value, 'base64');
  if (!Number.isSafeInteger(dimension) || dimension <= 0 || buffer.length !== dimension * 4) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', 'Encoded embedding dimension does not match its payload');
  }
  const embedding = new Float32Array(dimension);
  for (let index = 0; index < dimension; index += 1) {
    embedding[index] = buffer.readFloatLE(index * 4);
  }
  return embedding;
}

function parseSampleReport(value: unknown): ParsedSampleReport {
  if (!isRecord(value) || value.version !== 'editron-fsd50k-audio-sample-v1') {
    throw invalidSampleReport('Expected editron-fsd50k-audio-sample-v1');
  }
  const policy = value.policy;
  const counts = value.counts;
  if (
    !isRecord(policy)
    || policy.publicationAllowed !== false
    || policy.productionCatalogMutationAllowed !== false
    || !isRecord(counts)
    || !Number.isSafeInteger(counts.accepted)
    || typeof value.candidatePoolSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.candidatePoolSha256)
    || !Array.isArray(value.entries)
  ) {
    throw invalidSampleReport('Sample report policy, counts, or candidate-pool hash is invalid');
  }
  const acceptedEntries = value.entries
    .filter(entry => isRecord(entry) && entry.status === 'accepted')
    .map(parseAcceptedSampleEntry);
  if (acceptedEntries.length !== counts.accepted) {
    throw invalidSampleReport('Accepted entry count does not match the sample receipt');
  }
  const uniqueSourceIds = new Set(acceptedEntries.map(entry => entry.sourceId));
  if (uniqueSourceIds.size !== acceptedEntries.length) {
    throw invalidSampleReport('Sample report contains duplicate accepted source IDs');
  }
  return {
    candidatePoolSha256: value.candidatePoolSha256,
    acceptedEntries,
  };
}

function parseAcceptedSampleEntry(value: Record<string, unknown>): AcceptedSampleEntry {
  const measurement = value.measurement;
  const providerTags = value.providerTags;
  if (
    typeof value.sourceId !== 'string'
    || !/^[1-9]\d{0,14}$/.test(value.sourceId)
    || !isSfxRole(value.assignedRole)
    || typeof value.title !== 'string'
    || !value.title.trim()
    || typeof value.audioPath !== 'string'
    || !isRecord(measurement)
    || typeof measurement.sourceHashSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(measurement.sourceHashSha256)
    || (providerTags !== undefined && (
      !Array.isArray(providerTags) || !providerTags.every(tag => typeof tag === 'string')
    ))
  ) {
    throw invalidSampleReport(`Accepted source ${String(value.sourceId)} has an invalid receipt`);
  }
  return {
    sourceId: value.sourceId,
    assignedRole: value.assignedRole,
    title: value.title.trim(),
    audioPath: value.audioPath,
    sourceHashSha256: measurement.sourceHashSha256,
    providerTags: providerTags ?? [],
  };
}

async function decodeVerifiedMonoPcm(
  encoded: Buffer,
  sourceId: string,
  decodeAudio: (buffer: Buffer) => Promise<DecodedAudio>,
): Promise<Float32Array> {
  let decoded: DecodedAudio;
  try {
    decoded = await decodeAudio(encoded);
  } catch (error) {
    throw new SfxEmbeddingError(
      'AUDIO_DECODE_FAILED',
      `Unable to decode conditioned SFX source ${sourceId}`,
      { cause: error },
    );
  }
  if (
    decoded.sampleRate !== SFX_CLAP_SAMPLE_RATE_HZ
    || decoded.channelData.length < 1
    || decoded.channelData.length > 2
  ) {
    throw new SfxEmbeddingError(
      'INVALID_AUDIO_PCM',
      `SFX source ${sourceId} must be 48 kHz mono or stereo PCM`,
    );
  }
  const sampleCount = Math.min(...decoded.channelData.map(channel => channel.length));
  if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0) {
    throw new SfxEmbeddingError('INVALID_AUDIO_PCM', `SFX source ${sourceId} contains no PCM samples`);
  }
  const mono = new Float32Array(sampleCount);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let sum = 0;
    for (const channel of decoded.channelData) {
      const sample = channel[sampleIndex];
      if (!Number.isFinite(sample)) {
        throw new SfxEmbeddingError(
          'INVALID_AUDIO_PCM',
          `SFX source ${sourceId} contains non-finite PCM`,
        );
      }
      sum += sample;
    }
    mono[sampleIndex] = sum / decoded.channelData.length;
  }
  return mono;
}

function rankSemanticRoles(
  embedding: Float32Array,
  roleEmbeddings: ReadonlyMap<SfxCatalogEventRole, Float32Array>,
): SfxSemanticRoleScore[] {
  return SFX_SEMANTIC_ROLE_PROMPTS
    .map(item => ({
      role: item.role,
      prompt: item.prompt,
      cosineSimilarity: round6(cosineSimilarity(embedding, requireRoleEmbedding(roleEmbeddings, item.role))),
    }))
    .sort((left, right) => (
      right.cosineSimilarity - left.cosineSimilarity
      || left.role.localeCompare(right.role)
    ));
}

function clusterEmbeddingEntries(
  entries: WorkingEmbeddingEntry[],
  threshold: number,
): {
  clusters: SfxEmbeddingCluster[];
  clusterBySourceId: Map<string, string>;
  representativeSourceIds: Set<string>;
} {
  const parent = entries.map((_, index) => index);
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
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const similarity = cosineSimilarity(entries[leftIndex].embedding, entries[rightIndex].embedding);
      updateNearestNeighbor(entries[leftIndex], entries[rightIndex].sourceId, similarity);
      updateNearestNeighbor(entries[rightIndex], entries[leftIndex].sourceId, similarity);
      if (
        entries[leftIndex].sourceHashSha256 === entries[rightIndex].sourceHashSha256
        || similarity >= threshold
      ) {
        union(leftIndex, rightIndex);
      }
    }
  }
  const membersByRoot = new Map<number, WorkingEmbeddingEntry[]>();
  entries.forEach((entry, index) => {
    const root = find(index);
    membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), entry]);
  });
  const clusterBySourceId = new Map<string, string>();
  const representativeSourceIds = new Set<string>();
  const clusters = [...membersByRoot.values()]
    .map(members => {
      members.sort((left, right) => compareSourceIds(left.sourceId, right.sourceId));
      const representative = [...members].sort((left, right) => (
        right.assignedRoleScore - left.assignedRoleScore
        || compareSourceIds(left.sourceId, right.sourceId)
      ))[0];
      const clusterId = `sfx_cluster_${createHash('sha256')
        .update(members.map(member => member.sourceId).join(':'))
        .digest('hex')
        .slice(0, 16)}`;
      const pairwiseSimilarities: number[] = [];
      for (let leftIndex = 0; leftIndex < members.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
          pairwiseSimilarities.push(cosineSimilarity(
            members[leftIndex].embedding,
            members[rightIndex].embedding,
          ));
        }
      }
      members.forEach(member => clusterBySourceId.set(member.sourceId, clusterId));
      representativeSourceIds.add(representative.sourceId);
      return {
        clusterId,
        duplicateCandidate: members.length > 1,
        memberSourceIds: members.map(member => member.sourceId),
        assignedRoles: [...new Set(members.map(member => member.assignedRole))].sort(),
        representativeSourceId: representative.sourceId,
        representativeRule: 'highest-assigned-role-similarity-then-source-id' as const,
        minimumPairwiseSimilarity: round6(
          pairwiseSimilarities.length ? Math.min(...pairwiseSimilarities) : 1,
        ),
        maximumPairwiseSimilarity: round6(
          pairwiseSimilarities.length ? Math.max(...pairwiseSimilarities) : 1,
        ),
      };
    })
    .sort((left, right) => compareSourceIds(left.memberSourceIds[0], right.memberSourceIds[0]));
  return { clusters, clusterBySourceId, representativeSourceIds };
}

function weightedMeanEmbedding(
  segments: ReadonlyArray<{ embedding: Float32Array; weight: number }>,
  dimension: number,
): Float32Array {
  if (segments.length === 0) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', 'No audio segments were embedded');
  }
  const mean = new Float32Array(dimension);
  for (const segment of segments) {
    const normalized = validateEmbedding(segment.embedding, dimension, 'audio segment');
    for (let index = 0; index < dimension; index += 1) {
      mean[index] += normalized[index] * segment.weight;
    }
  }
  return normalizeEmbedding(mean, 'weighted audio embedding');
}

function validateEmbeddingBatch(
  embeddings: readonly Float32Array[],
  expectedRows: number,
  expectedDimension: number,
  label: string,
): Float32Array[] {
  if (embeddings.length !== expectedRows) {
    throw new SfxEmbeddingError(
      'INVALID_MODEL_OUTPUT',
      `CLAP ${label} output returned ${embeddings.length} rows; expected ${expectedRows}`,
    );
  }
  return embeddings.map((embedding, index) => (
    validateEmbedding(embedding, expectedDimension, `${label} row ${index}`)
  ));
}

function validateEmbedding(
  embedding: Float32Array,
  expectedDimension: number,
  label: string,
): Float32Array {
  if (!(embedding instanceof Float32Array) || embedding.length !== expectedDimension) {
    throw new SfxEmbeddingError(
      'INVALID_MODEL_OUTPUT',
      `${label} embedding dimension is ${embedding.length}; expected ${expectedDimension}`,
    );
  }
  return normalizeEmbedding(embedding, label);
}

function normalizeEmbedding(embedding: Float32Array, label: string): Float32Array {
  let squaredNorm = 0;
  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', `${label} contains non-finite values`);
    }
    squaredNorm += value * value;
  }
  if (squaredNorm <= Number.EPSILON) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', `${label} has zero magnitude`);
  }
  const norm = Math.sqrt(squaredNorm);
  return Float32Array.from(embedding, value => value / norm);
}

function extractTensorRows(
  output: unknown,
  key: 'audio_embeds' | 'text_embeds',
  expectedRows: number,
  expectedDimension: number,
): Float32Array[] {
  if (!isRecord(output) || !isRecord(output[key])) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', `CLAP output is missing ${key}`);
  }
  const tensor = output[key];
  const tensorData = tensor.data;
  if (
    !Array.isArray(tensor.dims)
    || tensor.dims.length !== 2
    || tensor.dims[0] !== expectedRows
    || tensor.dims[1] !== expectedDimension
    || !isArrayLike(tensorData)
    || tensorData.length !== expectedRows * expectedDimension
  ) {
    throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', `CLAP ${key} tensor shape is invalid`);
  }
  return Array.from({ length: expectedRows }, (_, rowIndex) => {
    const row = new Float32Array(expectedDimension);
    for (let columnIndex = 0; columnIndex < expectedDimension; columnIndex += 1) {
      row[columnIndex] = Number(tensorData[rowIndex * expectedDimension + columnIndex]);
    }
    return row;
  });
}

function resolveSafeAudioPath(sampleRoot: string, relativeAudioPath: string): string {
  const resolved = path.resolve(sampleRoot, relativeAudioPath);
  const relative = path.relative(sampleRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new SfxEmbeddingError(
      'UNSAFE_AUDIO_PATH',
      `Sample audio path escapes or resolves to the sample root: ${relativeAudioPath}`,
    );
  }
  return resolved;
}

function hashSampleReceipts(entries: readonly AcceptedSampleEntry[]): string {
  return createHash('sha256')
    .update([...entries]
      .sort((left, right) => compareSourceIds(left.sourceId, right.sourceId))
      .map(entry => `${entry.sourceId}:${entry.sourceHashSha256}:${entry.assignedRole}`)
      .join('\n'))
    .digest('hex');
}

function updateNearestNeighbor(
  entry: WorkingEmbeddingEntry,
  sourceId: string,
  similarity: number,
): void {
  if (
    !entry.nearestNeighbor
    || similarity > entry.nearestNeighbor.cosineSimilarity
    || (
      similarity === entry.nearestNeighbor.cosineSimilarity
      && compareSourceIds(sourceId, entry.nearestNeighbor.sourceId) < 0
    )
  ) {
    entry.nearestNeighbor = {
      sourceId,
      cosineSimilarity: round6(similarity),
    };
  }
}

function requireRoleEmbedding(
  embeddings: ReadonlyMap<SfxCatalogEventRole, Float32Array>,
  role: SfxCatalogEventRole,
): Float32Array {
  const embedding = embeddings.get(role);
  if (embedding) return embedding;
  throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', `Missing text embedding for role ${role}`);
}

function validateDuplicateThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new SfxEmbeddingError(
      'INVALID_SAMPLE_REPORT',
      'Near-duplicate similarity threshold must be greater than 0 and at most 1',
    );
  }
  return value;
}

function isSfxRole(value: unknown): value is SfxCatalogEventRole {
  return typeof value === 'string'
    && SFX_SEMANTIC_ROLE_PROMPTS.some(item => item.role === value);
}

function compareSourceIds(left: string, right: string): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

function invalidSampleReport(message: string): SfxEmbeddingError {
  return new SfxEmbeddingError('INVALID_SAMPLE_REPORT', message);
}

function failMissingCluster(sourceId: string): never {
  throw new SfxEmbeddingError('INVALID_MODEL_OUTPUT', `Missing cluster assignment for ${sourceId}`);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isArrayLike(value: unknown): value is ArrayLike<number | bigint> {
  return Array.isArray(value) || (
    ArrayBuffer.isView(value)
    && !(value instanceof DataView)
    && typeof (value as { length?: unknown }).length === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
