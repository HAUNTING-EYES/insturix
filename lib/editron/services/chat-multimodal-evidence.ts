import { createHash, randomUUID } from 'node:crypto';

import {
  EDITRON_EMBEDDING_DIMENSIONS,
  EDITRON_EMBEDDING_MODEL,
  generateEditronEmbedding,
} from './gemini-embedding';
import { cosineSimilarity } from '../storyline/scene-embedding';

export const CHAT_EVIDENCE_INDEX_COLLECTION = 'editron_chat_evidence';
export const CHAT_EVIDENCE_AUDIT_COLLECTION = 'editron_chat_retrieval_audits';
export const CHAT_EVIDENCE_VERSION = 'editron-chat-evidence-v1' as const;

const MAX_DOCUMENTS = 160;
const MAX_DESCRIPTOR_CHARS = 1_200;
const MAX_AUDIT_CANDIDATES = 24;
const DEFAULT_LIMIT = 8;
const CACHE_CONCURRENCY = 4;

export const CHAT_EVIDENCE_RANKING_POLICY = {
  version: 'editron-chat-evidence-ranking-v1',
  calibrationStatus: 'invented-needs-calibration',
  strongTextSemantic: 0.72,
  strongImageSemantic: 0.78,
  corroboratedTextSemantic: 0.56,
  corroboratedImageSemantic: 0.6,
  minimumLexicalCoverage: 0.34,
  ambiguityMargin: 0.06,
} as const;

export type ChatEvidenceIntent = 'transcript' | 'visual' | 'any';

export interface EvidenceEmbedding {
  model: string;
  dimensions: number;
  values: number[];
}

export interface CanonicalChatEvidenceDocument {
  evidenceId: string;
  projectId: string;
  assetId: string;
  overlayId: string | number | null;
  overlayType: string | null;
  sourceStartMs: number;
  sourceEndMs: number;
  editedStartFrame: number | null;
  editedEndFrame: number | null;
  transcriptText: string;
  visualText: string;
  audioText: string;
  descriptor: string;
  importance: number | null;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    units: 'normalized' | 'pixel';
  };
  modalities: {
    transcript: boolean;
    visualFacts: boolean;
    ocr: boolean;
    spatial: boolean;
    motion: boolean;
    vocal: boolean;
    music: boolean;
    sourceToCutMapping: boolean;
    textEmbedding: boolean;
    imageEmbedding: boolean;
  };
  missingModalities: string[];
  sourcePaths: string[];
  fingerprint: string;
  textEmbedding?: EvidenceEmbedding;
  imageEmbedding?: EvidenceEmbedding;
  imageEmbeddingIssue?: string;
}

export interface CanonicalChatEvidenceCandidate {
  evidenceId: string;
  assetId: string;
  overlayId: string | number | null;
  overlayType: string | null;
  sourceStartMs: number;
  sourceEndMs: number;
  startFrame: number | null;
  endFrame: number | null;
  text: string;
  transcriptText: string;
  visualText: string;
  boundingBox?: CanonicalChatEvidenceDocument['boundingBox'];
  score: number;
  accepted: boolean;
  safeForAutomaticMutation: boolean;
  matchType: 'exact-phrase' | 'semantic-text' | 'semantic-image' | 'semantic-corroborated' | 'lexical';
  scores: {
    exactPhrase: number;
    lexical: number;
    textSemantic: number | null;
    imageSemantic: number | null;
    importance: number | null;
    combined: number;
  };
  modalityPresence: CanonicalChatEvidenceDocument['modalities'];
  missingModalities: string[];
  rejectionReasons: string[];
  sourcePaths: string[];
}

export interface ChatEvidenceRetrievalAudit {
  version: typeof CHAT_EVIDENCE_VERSION;
  auditId: string;
  projectId: string;
  userId: string;
  query: string;
  intent: ChatEvidenceIntent;
  createdAt: Date;
  expiresAt: Date;
  rankingPolicy: typeof CHAT_EVIDENCE_RANKING_POLICY;
  analyzedDocumentCount: number;
  embeddedDocumentCount: number;
  missingModalities: Record<string, number>;
  candidates: Array<{
    evidenceId: string;
    assetId: string;
    overlayId: string | number | null;
    startFrame: number | null;
    endFrame: number | null;
    score: number;
    accepted: boolean;
    safeForAutomaticMutation: boolean;
    matchType: CanonicalChatEvidenceCandidate['matchType'];
    scores: CanonicalChatEvidenceCandidate['scores'];
    modalityPresence: CanonicalChatEvidenceDocument['modalities'];
    missingModalities: string[];
    rejectionReasons: string[];
    sourcePaths: string[];
  }>;
}

export interface SearchCanonicalChatEvidenceInput {
  projectId: string;
  userId: string;
  project: unknown;
  query: string;
  intent: ChatEvidenceIntent;
  overlayId?: string | number;
  limit?: number;
  queryImageEmbedding?: EvidenceEmbedding;
}

export interface SearchCanonicalChatEvidenceResult {
  auditId: string;
  candidates: CanonicalChatEvidenceCandidate[];
  analyzedDocumentCount: number;
  embeddedDocumentCount: number;
  rankingPolicy: typeof CHAT_EVIDENCE_RANKING_POLICY;
}

export interface ChatEvidenceEmbeddingCacheEntry {
  evidenceId: string;
  fingerprint: string;
  textEmbedding?: EvidenceEmbedding;
}

export interface ChatEvidenceDependencies {
  loadAnalyses(projectId: string, assetIds: string[]): Promise<unknown[]>;
  loadEmbeddingCache(projectId: string, evidenceIds: string[]): Promise<ChatEvidenceEmbeddingCacheEntry[]>;
  saveEmbeddingCache(projectId: string, userId: string, entries: CanonicalChatEvidenceDocument[]): Promise<void>;
  saveAudit(audit: ChatEvidenceRetrievalAudit): Promise<void>;
  embedText(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[] | null>;
  now(): Date;
}

export async function searchCanonicalChatEvidence(
  input: SearchCanonicalChatEvidenceInput,
  dependencies?: Partial<ChatEvidenceDependencies>,
): Promise<SearchCanonicalChatEvidenceResult> {
  const projectId = input.projectId.trim();
  const userId = input.userId.trim();
  const query = input.query.trim();
  if (!projectId || !userId || !query) {
    throw new Error('projectId, userId, and query are required for canonical chat evidence retrieval');
  }
  const deps = await resolveDependencies(dependencies);
  const project = asRecord(unwrapProject(input.project));
  const assetIds = timelineAssetIds(project, input.overlayId);
  const analyses = await deps.loadAnalyses(projectId, assetIds);
  const documents = buildCanonicalChatEvidenceDocuments({
    projectId,
    project,
    analyses,
    overlayId: input.overlayId,
  }).slice(0, MAX_DOCUMENTS);

  const cacheEntries = await deps.loadEmbeddingCache(projectId, documents.map((document) => document.evidenceId));
  const cacheById = new Map(cacheEntries.map((entry) => [entry.evidenceId, entry]));
  const needsEmbedding: CanonicalChatEvidenceDocument[] = [];
  for (const document of documents) {
    const cached = cacheById.get(document.evidenceId);
    if (
      cached?.fingerprint === document.fingerprint
      && validateEmbedding(cached.textEmbedding, {
        model: EDITRON_EMBEDDING_MODEL,
        dimensions: EDITRON_EMBEDDING_DIMENSIONS,
      }).valid
    ) {
      document.textEmbedding = cached.textEmbedding;
      document.modalities.textEmbedding = true;
      removeMissing(document, 'text-embedding');
    } else if (document.descriptor) {
      needsEmbedding.push(document);
    }
  }

  await mapWithConcurrency(needsEmbedding, CACHE_CONCURRENCY, async (document) => {
    const values = await deps.embedText(document.descriptor, 'RETRIEVAL_DOCUMENT');
    const candidate: EvidenceEmbedding | undefined = values
      ? { model: EDITRON_EMBEDDING_MODEL, dimensions: EDITRON_EMBEDDING_DIMENSIONS, values }
      : undefined;
    if (validateEmbedding(candidate, {
      model: EDITRON_EMBEDDING_MODEL,
      dimensions: EDITRON_EMBEDDING_DIMENSIONS,
    }).valid) {
      document.textEmbedding = candidate;
      document.modalities.textEmbedding = true;
      removeMissing(document, 'text-embedding');
    }
  });
  const embeddedDocuments = needsEmbedding.filter((document) => document.textEmbedding);
  if (embeddedDocuments.length > 0) {
    await deps.saveEmbeddingCache(projectId, userId, embeddedDocuments);
  }

  const queryValues = await deps.embedText(query, 'RETRIEVAL_QUERY');
  const queryTextEmbedding: EvidenceEmbedding | undefined = queryValues
    ? { model: EDITRON_EMBEDDING_MODEL, dimensions: EDITRON_EMBEDDING_DIMENSIONS, values: queryValues }
    : undefined;
  const candidates = rankCanonicalChatEvidence({
    documents,
    query,
    intent: input.intent,
    queryTextEmbedding,
    queryImageEmbedding: input.queryImageEmbedding,
    limit: clampInt(input.limit ?? DEFAULT_LIMIT, 1, 12),
  });
  const auditId = `chat-evidence-${randomUUID()}`;
  const now = deps.now();
  const audit: ChatEvidenceRetrievalAudit = {
    version: CHAT_EVIDENCE_VERSION,
    auditId,
    projectId,
    userId,
    query: truncate(query, 500),
    intent: input.intent,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
    rankingPolicy: CHAT_EVIDENCE_RANKING_POLICY,
    analyzedDocumentCount: documents.length,
    embeddedDocumentCount: documents.filter((document) => document.modalities.textEmbedding).length,
    missingModalities: countMissingModalities(documents),
    candidates: candidates.slice(0, MAX_AUDIT_CANDIDATES).map((candidate) => ({
      evidenceId: candidate.evidenceId,
      assetId: candidate.assetId,
      overlayId: candidate.overlayId,
      startFrame: candidate.startFrame,
      endFrame: candidate.endFrame,
      score: candidate.score,
      accepted: candidate.accepted,
      safeForAutomaticMutation: candidate.safeForAutomaticMutation,
      matchType: candidate.matchType,
      scores: candidate.scores,
      modalityPresence: candidate.modalityPresence,
      missingModalities: candidate.missingModalities,
      rejectionReasons: candidate.rejectionReasons,
      sourcePaths: candidate.sourcePaths,
    })),
  };
  await deps.saveAudit(audit);
  return {
    auditId,
    candidates,
    analyzedDocumentCount: documents.length,
    embeddedDocumentCount: audit.embeddedDocumentCount,
    rankingPolicy: CHAT_EVIDENCE_RANKING_POLICY,
  };
}

export function buildCanonicalChatEvidenceDocuments(input: {
  projectId: string;
  project: unknown;
  analyses: unknown[];
  overlayId?: string | number;
}): CanonicalChatEvidenceDocument[] {
  const project = asRecord(unwrapProject(input.project));
  const fps = positiveNumber(project.fps) ?? 30;
  const overlays = asRecords(project.overlays).filter((overlay) => (
    input.overlayId == null || String(overlay.id) === String(input.overlayId)
  ));
  const documents: CanonicalChatEvidenceDocument[] = [];

  for (const rawAnalysis of input.analyses) {
    const analysis = asRecord(rawAnalysis);
    const assetId = stringValue(analysis.assetId);
    if (!assetId) continue;
    const assetOverlays = overlays.filter((overlay) => overlayAssetId(overlay) === assetId);
    const segments = analysisSegments(analysis, assetOverlays, fps);
    const words = transcriptionWords(analysis);
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const timing = segmentTiming(segment);
      if (!timing) continue;
      const occurrences = mapSegmentToTimeline(assetOverlays, timing, fps);
      const mappedOccurrences = occurrences.length > 0 ? occurrences : [{
        overlayId: null,
        overlayType: null,
        editedStartFrame: null,
        editedEndFrame: null,
      }];
      const transcriptText = segmentTranscript(segment) || wordsInRange(words, timing.startMs, timing.endMs);
      const visualFacts = collectVisualFacts(segment);
      const audioFacts = collectAudioFacts(segment, analysis, timing);
      const imageEmbeddingRead = readImageEmbedding(segment);
      for (const occurrence of mappedOccurrences) {
        const descriptor = buildEvidenceDescriptor({ transcriptText, visualFacts, audioFacts });
        if (!descriptor) continue;
        const evidenceId = stableId([
          input.projectId,
          assetId,
          String(occurrence.overlayId ?? 'unmapped'),
          timing.startMs,
          timing.endMs,
          index,
        ]);
        const modalities = {
          transcript: Boolean(transcriptText),
          visualFacts: Boolean(visualFacts.text),
          ocr: visualFacts.ocr.length > 0,
          spatial: Boolean(visualFacts.boundingBox || visualFacts.hasSpatial),
          motion: visualFacts.hasMotion,
          vocal: audioFacts.hasVocal,
          music: audioFacts.hasMusic,
          sourceToCutMapping: occurrence.editedStartFrame != null && occurrence.editedEndFrame != null,
          textEmbedding: false,
          imageEmbedding: imageEmbeddingRead.embedding != null,
        };
        const missingModalities = Object.entries(modalities)
          .filter(([, present]) => !present)
          .map(([modality]) => kebab(modality));
        if (imageEmbeddingRead.issue) missingModalities.push(`image-embedding:${imageEmbeddingRead.issue}`);
        const fingerprint = stableId([
          CHAT_EVIDENCE_VERSION,
          descriptor,
          imageEmbeddingRead.embedding?.model ?? '',
          imageEmbeddingRead.embedding?.dimensions ?? 0,
          imageEmbeddingRead.embedding?.values.length ?? 0,
        ]);
        documents.push({
          evidenceId,
          projectId: input.projectId,
          assetId,
          overlayId: occurrence.overlayId,
          overlayType: occurrence.overlayType,
          sourceStartMs: timing.startMs,
          sourceEndMs: timing.endMs,
          editedStartFrame: occurrence.editedStartFrame,
          editedEndFrame: occurrence.editedEndFrame,
          transcriptText,
          visualText: visualFacts.text,
          audioText: audioFacts.text,
          descriptor,
          importance: segmentImportance(segment),
          ...(visualFacts.boundingBox ? { boundingBox: visualFacts.boundingBox } : {}),
          modalities,
          missingModalities: uniqueStrings(missingModalities),
          sourcePaths: [
            `editron_asset_analyses.${assetId}.segmentAnalysis.segments.${index}`,
            ...(occurrence.overlayId != null ? [`project.overlays.${String(occurrence.overlayId)}`] : []),
          ],
          fingerprint,
          ...(imageEmbeddingRead.embedding ? { imageEmbedding: imageEmbeddingRead.embedding } : {}),
          ...(imageEmbeddingRead.issue ? { imageEmbeddingIssue: imageEmbeddingRead.issue } : {}),
        });
      }
    }
  }
  return dedupeDocuments(documents)
    .sort((left, right) => (left.editedStartFrame ?? Number.MAX_SAFE_INTEGER) - (right.editedStartFrame ?? Number.MAX_SAFE_INTEGER));
}

export function rankCanonicalChatEvidence(input: {
  documents: readonly CanonicalChatEvidenceDocument[];
  query: string;
  intent: ChatEvidenceIntent;
  queryTextEmbedding?: EvidenceEmbedding;
  queryImageEmbedding?: EvidenceEmbedding;
  limit?: number;
}): CanonicalChatEvidenceCandidate[] {
  const query = normalizeText(input.query);
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const queryTextValid = validateEmbedding(input.queryTextEmbedding, {
    model: EDITRON_EMBEDDING_MODEL,
    dimensions: EDITRON_EMBEDDING_DIMENSIONS,
  }).valid;
  const ranked = input.documents.map((document): CanonicalChatEvidenceCandidate => {
    const targetText = input.intent === 'transcript'
      ? document.transcriptText
      : input.intent === 'visual'
        ? document.visualText
        : [document.transcriptText, document.visualText, document.audioText].filter(Boolean).join(' ');
    const normalizedTarget = normalizeText(targetText);
    const exactPhrase = normalizedTarget.includes(query) ? 1 : 0;
    const lexical = lexicalCoverage(queryTokens, tokenize(normalizedTarget));
    const textValidation = validateEmbedding(document.textEmbedding, {
      model: EDITRON_EMBEDDING_MODEL,
      dimensions: EDITRON_EMBEDDING_DIMENSIONS,
    });
    const textSemantic = queryTextValid && textValidation.valid
      ? cosineSimilarity(input.queryTextEmbedding!.values, document.textEmbedding!.values)
      : null;
    const imagePair = validateCompatibleImagePair(input.queryImageEmbedding, document.imageEmbedding);
    const imageSemantic = imagePair.valid
      ? cosineSimilarity(input.queryImageEmbedding!.values, document.imageEmbedding!.values)
      : null;
    const importance = document.importance;
    const textScore = textSemantic == null ? 0 : textSemantic;
    const imageScore = imageSemantic == null ? 0 : imageSemantic;
    const combined = exactPhrase
      ? 0.99
      : clamp01(Math.max(
          (textScore * 0.82) + (lexical * 0.13) + ((importance ?? 0) * 0.05),
          (imageScore * 0.9) + (lexical * 0.05) + ((importance ?? 0) * 0.05),
          (textScore * 0.49) + (imageScore * 0.41) + (lexical * 0.05) + ((importance ?? 0) * 0.05),
        ));
    const requiredModalityPresent = input.intent === 'transcript'
      ? document.modalities.transcript
      : input.intent === 'visual'
        ? document.modalities.visualFacts || document.modalities.imageEmbedding
        : document.modalities.transcript || document.modalities.visualFacts || document.modalities.imageEmbedding;
    const strongText = textScore >= CHAT_EVIDENCE_RANKING_POLICY.strongTextSemantic;
    const strongImage = imageScore >= CHAT_EVIDENCE_RANKING_POLICY.strongImageSemantic;
    const corroborated = textScore >= CHAT_EVIDENCE_RANKING_POLICY.corroboratedTextSemantic
      && imageScore >= CHAT_EVIDENCE_RANKING_POLICY.corroboratedImageSemantic;
    const lexicalAccepted = lexical >= CHAT_EVIDENCE_RANKING_POLICY.minimumLexicalCoverage;
    const accepted = document.modalities.sourceToCutMapping
      && requiredModalityPresent
      && (exactPhrase === 1 || strongText || strongImage || corroborated || lexicalAccepted);
    const rejectionReasons = [
      ...(!document.modalities.sourceToCutMapping ? ['missing-source-to-cut-mapping'] : []),
      ...(!requiredModalityPresent ? [`missing-${input.intent}-evidence`] : []),
      ...(!accepted && requiredModalityPresent && document.modalities.sourceToCutMapping ? ['below-evidence-threshold'] : []),
      ...(!queryTextValid ? ['query-text-embedding-missing-or-invalid'] : []),
      ...(input.queryImageEmbedding && !imagePair.valid ? [`image-embedding-${imagePair.reason}`] : []),
    ];
    const matchType: CanonicalChatEvidenceCandidate['matchType'] = exactPhrase
      ? 'exact-phrase'
      : corroborated
        ? 'semantic-corroborated'
        : strongImage
          ? 'semantic-image'
          : strongText
            ? 'semantic-text'
            : 'lexical';
    return {
      evidenceId: document.evidenceId,
      assetId: document.assetId,
      overlayId: document.overlayId,
      overlayType: document.overlayType,
      sourceStartMs: document.sourceStartMs,
      sourceEndMs: document.sourceEndMs,
      startFrame: document.editedStartFrame,
      endFrame: document.editedEndFrame,
      text: truncate(targetText || document.descriptor, 240),
      transcriptText: document.transcriptText,
      visualText: document.visualText,
      ...(document.boundingBox ? { boundingBox: document.boundingBox } : {}),
      score: round4(combined),
      accepted,
      safeForAutomaticMutation: false,
      matchType,
      scores: {
        exactPhrase,
        lexical: round4(lexical),
        textSemantic: textSemantic == null ? null : round4(textSemantic),
        imageSemantic: imageSemantic == null ? null : round4(imageSemantic),
        importance: importance == null ? null : round4(importance),
        combined: round4(combined),
      },
      modalityPresence: document.modalities,
      missingModalities: document.missingModalities,
      rejectionReasons: uniqueStrings(rejectionReasons),
      sourcePaths: document.sourcePaths,
    };
  }).sort((left, right) => right.score - left.score || (left.startFrame ?? Number.MAX_SAFE_INTEGER) - (right.startFrame ?? Number.MAX_SAFE_INTEGER));

  const accepted = ranked.filter((candidate) => candidate.accepted);
  const ambiguous = accepted.length > 1
    && Math.abs(accepted[0].score - accepted[1].score) < CHAT_EVIDENCE_RANKING_POLICY.ambiguityMargin
    && !rangesOverlap(accepted[0], accepted[1]);
  if (accepted[0] && !ambiguous) {
    const exact = accepted[0].matchType === 'exact-phrase';
    const corroborated = accepted[0].matchType === 'semantic-corroborated';
    accepted[0].safeForAutomaticMutation = exact || corroborated;
  }
  if (ambiguous) {
    accepted[0].rejectionReasons = uniqueStrings([...accepted[0].rejectionReasons, 'ambiguous-top-candidates']);
  }
  return ranked.slice(0, clampInt(input.limit ?? DEFAULT_LIMIT, 1, 12));
}

export function validateEmbedding(
  embedding: EvidenceEmbedding | undefined,
  expected?: { model?: string; dimensions?: number },
): { valid: boolean; reason?: string } {
  if (!embedding) return { valid: false, reason: 'missing' };
  if (!embedding.model.trim()) return { valid: false, reason: 'model-missing' };
  if (!Number.isInteger(embedding.dimensions) || embedding.dimensions <= 0) return { valid: false, reason: 'dimensions-invalid' };
  if (expected?.model && embedding.model !== expected.model) return { valid: false, reason: 'model-mismatch' };
  if (expected?.dimensions && embedding.dimensions !== expected.dimensions) return { valid: false, reason: 'dimension-mismatch' };
  if (embedding.values.length !== embedding.dimensions) return { valid: false, reason: 'vector-length-mismatch' };
  if (embedding.values.some((value) => !Number.isFinite(value))) return { valid: false, reason: 'non-finite-vector' };
  if (!embedding.values.some((value) => value !== 0)) return { valid: false, reason: 'zero-vector' };
  return { valid: true };
}

async function resolveDependencies(overrides?: Partial<ChatEvidenceDependencies>): Promise<ChatEvidenceDependencies> {
  if (
    overrides?.loadAnalyses
    && overrides.loadEmbeddingCache
    && overrides.saveEmbeddingCache
    && overrides.saveAudit
    && overrides.embedText
    && overrides.now
  ) {
    return overrides as ChatEvidenceDependencies;
  }
  const defaults = await defaultDependencies();
  return { ...defaults, ...overrides };
}

let indexesReady: Promise<void> | null = null;

async function defaultDependencies(): Promise<ChatEvidenceDependencies> {
  const { getDatabase } = await import('../db/mongodb');
  const db = await getDatabase();
  if (!indexesReady) {
    indexesReady = Promise.all([
      db.collection(CHAT_EVIDENCE_INDEX_COLLECTION).createIndexes([
        { key: { projectId: 1, evidenceId: 1 }, name: 'projectId_evidenceId', unique: true },
        { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
      ]),
      db.collection(CHAT_EVIDENCE_AUDIT_COLLECTION).createIndexes([
        { key: { projectId: 1, createdAt: -1 }, name: 'projectId_createdAt' },
        { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
      ]),
    ]).then(() => undefined).catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  await indexesReady;
  return {
    loadAnalyses: async (projectId, assetIds) => {
      if (assetIds.length === 0) return [];
      return db.collection('editron_asset_analyses').find({
        projectId,
        assetId: { $in: assetIds },
      }).toArray();
    },
    loadEmbeddingCache: async (projectId, evidenceIds) => {
      if (evidenceIds.length === 0) return [];
      return db.collection(CHAT_EVIDENCE_INDEX_COLLECTION).find({
        projectId,
        evidenceId: { $in: evidenceIds },
      }).project({ evidenceId: 1, fingerprint: 1, textEmbedding: 1, _id: 0 }).toArray() as unknown as ChatEvidenceEmbeddingCacheEntry[];
    },
    saveEmbeddingCache: async (projectId, userId, entries) => {
      if (entries.length === 0) return;
      const updatedAt = new Date();
      await db.collection(CHAT_EVIDENCE_INDEX_COLLECTION).bulkWrite(entries.map((entry) => ({
        updateOne: {
          filter: { projectId, evidenceId: entry.evidenceId },
          update: {
            $set: {
              projectId,
              userId,
              evidenceId: entry.evidenceId,
              assetId: entry.assetId,
              fingerprint: entry.fingerprint,
              textEmbedding: entry.textEmbedding,
              updatedAt,
            },
            $setOnInsert: { createdAt: updatedAt },
          },
          upsert: true,
        },
      })), { ordered: false });
    },
    saveAudit: async (audit) => {
      await db.collection(CHAT_EVIDENCE_AUDIT_COLLECTION).insertOne(audit);
    },
    embedText: (text, taskType) => generateEditronEmbedding(text, { taskType }),
    now: () => new Date(),
  };
}

function timelineAssetIds(project: Record<string, unknown>, overlayId?: string | number): string[] {
  const overlays = asRecords(project.overlays).filter((overlay) => overlayId == null || String(overlay.id) === String(overlayId));
  return uniqueStrings(overlays.map(overlayAssetId).filter((assetId): assetId is string => Boolean(assetId)));
}

function analysisSegments(analysis: Record<string, unknown>, overlays: Record<string, unknown>[], fps: number): Record<string, unknown>[] {
  const segmentAnalysis = asRecord(analysis.segmentAnalysis);
  const rawFootage = asRecord(analysis.rawFootageAnalysis);
  const vjepa = asRecord(analysis.vjepaAnalysis);
  const direct = asRecords(segmentAnalysis.segments);
  if (direct.length > 0) return direct;
  const rawSegments = asRecords(rawFootage.segments);
  if (rawSegments.length > 0) return rawSegments;
  const visualSegments = asRecords(vjepa.segments);
  if (visualSegments.length > 0) return visualSegments;
  const imageOverlay = overlays.find((overlay) => overlay.type === 'image');
  if (imageOverlay) {
    return [{
      startMs: 0,
      endMs: Math.max(1, Math.round((positiveNumber(imageOverlay.durationInFrames) ?? 1) / fps * 1_000)),
      semanticVisual: asRecord(analysis.semanticVisual ?? analysis.syntheticStoryboard ?? analysis.imageAnalysis),
    }];
  }
  return [];
}

function segmentTiming(segment: Record<string, unknown>): { startMs: number; endMs: number } | null {
  const startMs = nonNegativeNumber(segment.startMs ?? segment.segmentStartMs ?? segment.segment_start_ms)
    ?? secondsToMs(segment.start ?? segment.startSec);
  const endMs = nonNegativeNumber(segment.endMs ?? segment.segmentEndMs ?? segment.segment_end_ms)
    ?? secondsToMs(segment.end ?? segment.endSec);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  return { startMs: Math.round(startMs), endMs: Math.round(endMs) };
}

function mapSegmentToTimeline(
  overlays: Record<string, unknown>[],
  timing: { startMs: number; endMs: number },
  fps: number,
): Array<{ overlayId: string | number | null; overlayType: string | null; editedStartFrame: number; editedEndFrame: number }> {
  const segmentStart = Math.round(timing.startMs / 1_000 * fps);
  const segmentEnd = Math.max(segmentStart + 1, Math.round(timing.endMs / 1_000 * fps));
  const mapped = [];
  for (const overlay of overlays) {
    const overlayFrom = nonNegativeNumber(overlay.from) ?? 0;
    const duration = positiveNumber(overlay.durationInFrames) ?? 1;
    const sourceStart = nonNegativeNumber(overlay.sourceStartFrame ?? overlay.videoStartTime ?? overlay.audioStartFrame) ?? 0;
    const sourceEnd = sourceStart + duration;
    const intersectionStart = Math.max(segmentStart, sourceStart);
    const intersectionEnd = Math.min(segmentEnd, sourceEnd);
    if (intersectionEnd <= intersectionStart) continue;
    mapped.push({
      overlayId: typeof overlay.id === 'string' || typeof overlay.id === 'number' ? overlay.id : null,
      overlayType: stringValue(overlay.type),
      editedStartFrame: Math.round(overlayFrom + intersectionStart - sourceStart),
      editedEndFrame: Math.round(overlayFrom + intersectionEnd - sourceStart),
    });
  }
  return mapped;
}

function segmentTranscript(segment: Record<string, unknown>): string {
  const transcript = asRecord(segment.transcript);
  return cleanText(transcript.text ?? transcript.transcript ?? segment.text);
}

function transcriptionWords(analysis: Record<string, unknown>): Array<{ word: string; startMs: number; endMs: number }> {
  const transcription = asRecord(asRecord(analysis.rawFootageAnalysis).transcription);
  return asRecords(transcription.words).flatMap((word) => {
    const text = cleanText(word.word ?? word.text);
    const startMs = nonNegativeNumber(word.startMs) ?? secondsToMs(word.start);
    const endMs = nonNegativeNumber(word.endMs) ?? secondsToMs(word.end);
    return text && startMs != null && endMs != null && endMs > startMs
      ? [{ word: text, startMs, endMs }]
      : [];
  });
}

function wordsInRange(words: Array<{ word: string; startMs: number; endMs: number }>, startMs: number, endMs: number): string {
  return words.filter((word) => word.endMs > startMs && word.startMs < endMs).map((word) => word.word).join(' ');
}

function collectVisualFacts(segment: Record<string, unknown>): {
  text: string;
  ocr: string[];
  boundingBox?: CanonicalChatEvidenceDocument['boundingBox'];
  hasSpatial: boolean;
  hasMotion: boolean;
} {
  const semantic = asRecord(segment.semanticVisual);
  const visual = asRecord(segment.visual);
  const windows = asRecords(semantic.windows);
  const subjects = cleanStringArray(windows.flatMap((window) => asArray(window.subjects)));
  const actions = cleanStringArray(windows.flatMap((window) => asArray(window.actions)));
  const stateChanges = cleanStringArray(windows.flatMap((window) => asArray(window.visibleStateChanges)));
  const ocr = cleanStringArray(asArray(semantic.ocrText).concat(
    asRecords(visual.textBoxes).flatMap((box) => [box.text, box.label]),
  ));
  const visualLabels = cleanStringArray([
    semantic.primaryVisualMode,
    semantic.visualExplainability,
    visual.actionType,
    visual.motionType,
    visual.faceEmotion,
  ]);
  const boundingBox = readBoundingBox(visual.mainSubject ?? visual);
  const hasSpatial = Boolean(
    boundingBox
    || positiveNumber(visual.textBoxCount)
    || positiveNumber(visual.objectCount)
    || positiveNumber(visual.faceCount)
    || positiveNumber(visual.negativeSpaceTop)
    || positiveNumber(visual.negativeSpaceRight)
    || positiveNumber(visual.negativeSpaceBottom)
    || positiveNumber(visual.negativeSpaceLeft),
  );
  const hasMotion = nonNegativeNumber(visual.motionIntensity) != null
    || finiteNumber(visual.motionVectorX) != null
    || finiteNumber(visual.motionVectorY) != null;
  const parts = [
    subjects.length ? `subjects: ${subjects.join(', ')}` : '',
    actions.length ? `actions: ${actions.join(', ')}` : '',
    stateChanges.length ? `visible changes: ${stateChanges.join(', ')}` : '',
    ocr.length ? `on-screen text: ${ocr.join(', ')}` : '',
    visualLabels.length ? `visual state: ${visualLabels.join(', ')}` : '',
  ].filter(Boolean);
  return { text: truncate(parts.join('; '), 700), ocr, ...(boundingBox ? { boundingBox } : {}), hasSpatial, hasMotion };
}

function collectAudioFacts(
  segment: Record<string, unknown>,
  analysis: Record<string, unknown>,
  timing: { startMs: number; endMs: number },
): { text: string; hasVocal: boolean; hasMusic: boolean } {
  const vocal = asRecord(segment.vocal);
  const music = asRecord(analysis.musicAnalysis);
  const valence = cleanText(vocal.emotionalValence);
  const hasVocal = Object.keys(vocal).length > 0;
  const beatCount = countTimedValuesInRange(music, timing.startMs, timing.endMs, ['beats', 'downbeats', 'beatTimes', 'onsets']);
  const hasMusic = Object.keys(music).length > 0;
  const parts = [
    valence ? `vocal valence: ${valence}` : '',
    positiveNumber(vocal.energy) != null ? `vocal energy: ${round4(positiveNumber(vocal.energy)!)} ` : '',
    positiveNumber(vocal.emotionIntensity) != null ? `vocal intensity: ${round4(positiveNumber(vocal.emotionIntensity)!)} ` : '',
    beatCount > 0 ? `music events in window: ${beatCount}` : '',
  ].filter(Boolean);
  return { text: truncate(parts.join('; '), 300), hasVocal, hasMusic };
}

function buildEvidenceDescriptor(input: { transcriptText: string; visualFacts: ReturnType<typeof collectVisualFacts>; audioFacts: ReturnType<typeof collectAudioFacts> }): string {
  return truncate([
    input.transcriptText ? `spoken: ${input.transcriptText}` : '',
    input.visualFacts.text ? `shown: ${input.visualFacts.text}` : '',
    input.audioFacts.text ? `heard: ${input.audioFacts.text}` : '',
  ].filter(Boolean).join(' | '), MAX_DESCRIPTOR_CHARS);
}

function segmentImportance(segment: Record<string, unknown>): number | null {
  const weight = asRecord(segment.weight);
  return clampNullable(weight.finalWeight ?? weight.final_weight ?? segment.finalWeight);
}

function readImageEmbedding(segment: Record<string, unknown>): { embedding?: EvidenceEmbedding; issue?: string } {
  const semantic = asRecord(segment.semanticVisual);
  const raw = asRecord(semantic.imageEmbedding ?? segment.imageEmbedding ?? asRecord(segment.visual).imageEmbedding);
  const values = Array.isArray(raw.values) ? raw.values.filter((value): value is number => typeof value === 'number') : [];
  if (Object.keys(raw).length === 0) return {};
  const embedding: EvidenceEmbedding = {
    model: stringValue(raw.model) ?? '',
    dimensions: nonNegativeNumber(raw.dimensions) ?? values.length,
    values,
  };
  const validation = validateEmbedding(embedding);
  return validation.valid ? { embedding } : { issue: validation.reason ?? 'invalid' };
}

function validateCompatibleImagePair(
  query: EvidenceEmbedding | undefined,
  document: EvidenceEmbedding | undefined,
): { valid: boolean; reason?: string } {
  const queryValidation = validateEmbedding(query);
  if (!queryValidation.valid) return { valid: false, reason: `query-${queryValidation.reason}` };
  const documentValidation = validateEmbedding(document);
  if (!documentValidation.valid) return { valid: false, reason: `document-${documentValidation.reason}` };
  if (query!.model !== document!.model) return { valid: false, reason: 'model-mismatch' };
  if (query!.dimensions !== document!.dimensions) return { valid: false, reason: 'dimension-mismatch' };
  return { valid: true };
}

function readBoundingBox(value: unknown): CanonicalChatEvidenceDocument['boundingBox'] | undefined {
  const candidate = asRecord(value);
  const x = nonNegativeNumber(candidate.x ?? candidate.left);
  const y = nonNegativeNumber(candidate.y ?? candidate.top);
  const width = positiveNumber(candidate.width ?? candidate.w);
  const height = positiveNumber(candidate.height ?? candidate.h);
  if (x == null || y == null || width == null || height == null) return undefined;
  return {
    x: round4(x),
    y: round4(y),
    width: round4(width),
    height: round4(height),
    units: Math.max(x, y, width, height) <= 1 ? 'normalized' : 'pixel',
  };
}

function countTimedValuesInRange(value: unknown, startMs: number, endMs: number, keys: string[]): number {
  const record = asRecord(value);
  let count = 0;
  for (const key of keys) {
    for (const item of asArray(record[key])) {
      const timestampMs = typeof item === 'number'
        ? (item <= 1_000 ? item * 1_000 : item)
        : nonNegativeNumber(asRecord(item).timestampMs ?? asRecord(item).timeMs)
          ?? secondsToMs(asRecord(item).time ?? asRecord(item).timestamp);
      if (timestampMs != null && timestampMs >= startMs && timestampMs < endMs) count += 1;
    }
  }
  return count;
}

function lexicalCoverage(queryTokens: string[], targetTokens: string[]): number {
  if (!queryTokens.length || !targetTokens.length) return 0;
  const target = new Set(targetTokens);
  return clamp01(new Set(queryTokens.filter((token) => target.has(token))).size / new Set(queryTokens).size);
}

function normalizeText(value: unknown): string {
  return cleanText(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(value: unknown): string[] {
  return normalizeText(value).split(' ').filter((token) => token.length > 1);
}

function rangesOverlap(left: CanonicalChatEvidenceCandidate, right: CanonicalChatEvidenceCandidate): boolean {
  if (left.startFrame == null || left.endFrame == null || right.startFrame == null || right.endFrame == null) return false;
  return left.startFrame < right.endFrame && right.startFrame < left.endFrame;
}

function dedupeDocuments(documents: CanonicalChatEvidenceDocument[]): CanonicalChatEvidenceDocument[] {
  const byId = new Map<string, CanonicalChatEvidenceDocument>();
  for (const document of documents) if (!byId.has(document.evidenceId)) byId.set(document.evidenceId, document);
  return [...byId.values()];
}

function countMissingModalities(documents: CanonicalChatEvidenceDocument[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const document of documents) {
    for (const missing of document.missingModalities) counts[missing] = (counts[missing] ?? 0) + 1;
  }
  return counts;
}

function removeMissing(document: CanonicalChatEvidenceDocument, value: string): void {
  document.missingModalities = document.missingModalities.filter((item) => item !== value);
}

async function mapWithConcurrency<T>(values: T[], concurrency: number, mapper: (value: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const value = values[cursor++];
      await mapper(value);
    }
  });
  await Promise.all(workers);
}

function stableId(parts: Array<string | number>): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function overlayAssetId(overlay: Record<string, unknown>): string | null {
  return stringValue(overlay.assetId ?? overlay.sourceAssetId ?? overlay.mediaId ?? asRecord(overlay.metadata).assetId);
}

function unwrapProject(value: unknown): unknown {
  const record = asRecord(value);
  return record.project && typeof record.project === 'object' ? record.project : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function cleanStringArray(values: unknown[]): string[] {
  return uniqueStrings(values.map(cleanText).filter(Boolean)).slice(0, 24);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function secondsToMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value * 1_000 : null;
}

function clampNullable(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function kebab(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
