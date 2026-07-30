import { randomUUID } from 'node:crypto';

import {
  CHAT_EVIDENCE_AUDIT_COLLECTION,
  buildCanonicalChatEvidenceDocuments,
} from './chat-multimodal-evidence';
import { loadCanonicalProjectAssetAnalyses } from './project-analysis-storage';

export const CHAT_SIGNAL_EVIDENCE_VERSION = 'editron-chat-signal-evidence-v1' as const;

export interface ChatSpeechEmphasisCandidate {
  evidenceId: string;
  assetId: string;
  overlayId: string | number | null;
  sourceStartMs: number;
  sourceEndMs: number;
  startFrame: number | null;
  endFrame: number | null;
  frame: number | null;
  transcriptText: string;
  score: number;
  accepted: boolean;
  safeForAutomaticMutation: boolean;
  channels: {
    vocalEnergy: number | null;
    emotionIntensity: number | null;
    pitchVariability: number | null;
    stressDetected: boolean | null;
    momentImportance: number | null;
  };
  percentileRanks: {
    vocalEnergy: number | null;
    emotionIntensity: number | null;
    pitchVariability: number | null;
  };
  rejectionReasons: string[];
  sourcePaths: string[];
}

export interface ChatSpeechEmphasisAudit {
  version: typeof CHAT_SIGNAL_EVIDENCE_VERSION;
  auditId: string;
  projectId: string;
  userId: string;
  selection: { mode: 'strongest-signal'; signal: 'speech-emphasis' };
  createdAt: Date;
  expiresAt: Date;
  analyzedDocumentCount: number;
  candidates: ChatSpeechEmphasisCandidate[];
}

interface ChatSpeechEmphasisDependencies {
  loadAnalyses(projectId: string, assetIds: string[], userId: string): Promise<unknown[]>;
  saveAudit(audit: ChatSpeechEmphasisAudit): Promise<void>;
  now(): Date;
}

interface SelectStrongestSpeechEmphasisInput {
  projectId: string;
  userId: string;
  project: unknown;
  overlayId?: string | number;
  limit?: number;
}

export async function selectStrongestSpeechEmphasis(
  input: SelectStrongestSpeechEmphasisInput,
  overrides?: Partial<ChatSpeechEmphasisDependencies>,
): Promise<{ auditId: string; candidates: ChatSpeechEmphasisCandidate[] }> {
  const projectId = input.projectId.trim();
  const userId = input.userId.trim();
  if (!projectId || !userId) {
    throw new Error('projectId and userId are required for speech-emphasis evidence');
  }
  const project = unwrapProject(input.project);
  const assetIds = timelineAssetIds(project, input.overlayId);
  const dependencies = await resolveDependencies(overrides);
  const analyses = await dependencies.loadAnalyses(projectId, assetIds, userId);
  const documents = buildCanonicalChatEvidenceDocuments({
    projectId,
    project,
    analyses,
    overlayId: input.overlayId,
  });
  const signalsBySegment = indexSegmentSignals(analyses);
  const candidates = rankSpeechEmphasisCandidates(
    documents.map((document) => ({
      document,
      channels: signalsBySegment.get(segmentKey(
        document.assetId,
        document.sourceStartMs,
        document.sourceEndMs,
      )) ?? emptyChannels(document.importance),
    })),
  ).slice(0, clampInt(input.limit ?? 5, 1, 12));
  const auditId = `chat-signal-evidence-${randomUUID()}`;
  const now = dependencies.now();
  await dependencies.saveAudit({
    version: CHAT_SIGNAL_EVIDENCE_VERSION,
    auditId,
    projectId,
    userId,
    selection: { mode: 'strongest-signal', signal: 'speech-emphasis' },
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
    analyzedDocumentCount: documents.length,
    candidates,
  });
  return { auditId, candidates };
}

function rankSpeechEmphasisCandidates(
  inputs: Array<{
    document: ReturnType<typeof buildCanonicalChatEvidenceDocuments>[number];
    channels: ChatSpeechEmphasisCandidate['channels'];
  }>,
): ChatSpeechEmphasisCandidate[] {
  const distributions = {
    vocalEnergy: numericValues(inputs, 'vocalEnergy'),
    emotionIntensity: numericValues(inputs, 'emotionIntensity'),
    pitchVariability: numericValues(inputs, 'pitchVariability'),
  };
  const candidates = inputs.map(({ document, channels }): ChatSpeechEmphasisCandidate => {
    const percentileRanks = {
      vocalEnergy: percentileRank(channels.vocalEnergy, distributions.vocalEnergy),
      emotionIntensity: percentileRank(channels.emotionIntensity, distributions.emotionIntensity),
      pitchVariability: percentileRank(channels.pitchVariability, distributions.pitchVariability),
    };
    const availableRanks = Object.values(percentileRanks).filter((value): value is number => value != null);
    const score = availableRanks.length >= 2
      ? availableRanks.reduce((sum, value) => sum + value, 0) / availableRanks.length
      : 0;
    const mapped = document.editedStartFrame != null && document.editedEndFrame != null;
    const accepted = mapped && availableRanks.length >= 2;
    return {
      evidenceId: document.evidenceId,
      assetId: document.assetId,
      overlayId: document.overlayId,
      sourceStartMs: document.sourceStartMs,
      sourceEndMs: document.sourceEndMs,
      startFrame: document.editedStartFrame,
      endFrame: document.editedEndFrame,
      frame: mapped
        ? Math.round((document.editedStartFrame! + document.editedEndFrame!) / 2)
        : null,
      transcriptText: document.transcriptText,
      score: round4(score),
      accepted,
      safeForAutomaticMutation: false,
      channels,
      percentileRanks,
      rejectionReasons: [
        ...(!mapped ? ['missing-source-to-cut-mapping'] : []),
        ...(availableRanks.length < 2 ? ['insufficient-prosody-channels'] : []),
      ],
      sourcePaths: document.sourcePaths,
    };
  }).sort(compareCandidates);

  const accepted = candidates.filter((candidate) => candidate.accepted);
  if (accepted[0]) {
    const tied = accepted[1] != null && compareStrength(accepted[0], accepted[1]) === 0;
    if (tied) accepted[0].rejectionReasons.push('ambiguous-top-signal');
    else accepted[0].safeForAutomaticMutation = true;
  }
  return candidates;
}

function indexSegmentSignals(
  analyses: unknown[],
): Map<string, ChatSpeechEmphasisCandidate['channels']> {
  const result = new Map<string, ChatSpeechEmphasisCandidate['channels']>();
  for (const rawAnalysis of analyses) {
    const analysis = asRecord(rawAnalysis);
    const assetId = stringValue(analysis.assetId);
    if (!assetId) continue;
    const segments = asRecords(asRecord(analysis.segmentAnalysis).segments);
    for (const segment of segments) {
      const startMs = nonNegativeNumber(segment.startMs);
      const endMs = nonNegativeNumber(segment.endMs);
      if (startMs == null || endMs == null || endMs <= startMs) continue;
      const vocal = asRecord(segment.vocal);
      const weight = asRecord(segment.weight);
      result.set(segmentKey(assetId, startMs, endMs), {
        vocalEnergy: signalNumber(vocal.energy),
        emotionIntensity: signalNumber(vocal.emotionIntensity),
        pitchVariability: signalNumber(vocal.pitchVariability),
        stressDetected: typeof vocal.stressDetected === 'boolean' ? vocal.stressDetected : null,
        momentImportance: signalNumber(weight.finalWeight ?? weight.final_weight ?? segment.finalWeight),
      });
    }
  }
  return result;
}

function numericValues(
  inputs: Array<{ channels: ChatSpeechEmphasisCandidate['channels'] }>,
  key: 'vocalEnergy' | 'emotionIntensity' | 'pitchVariability',
): number[] {
  return inputs
    .map(({ channels }) => channels[key])
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);
}

function percentileRank(value: number | null, sortedValues: number[]): number | null {
  if (value == null) return null;
  if (sortedValues.length <= 1) return 1;
  const below = sortedValues.filter((candidate) => candidate < value).length;
  const equal = sortedValues.filter((candidate) => candidate === value).length;
  return round4((below + Math.max(0, equal - 1) / 2) / (sortedValues.length - 1));
}

function compareCandidates(
  left: ChatSpeechEmphasisCandidate,
  right: ChatSpeechEmphasisCandidate,
): number {
  return compareStrength(left, right)
    || (left.frame ?? Number.MAX_SAFE_INTEGER) - (right.frame ?? Number.MAX_SAFE_INTEGER)
    || left.evidenceId.localeCompare(right.evidenceId);
}

function compareStrength(
  left: ChatSpeechEmphasisCandidate,
  right: ChatSpeechEmphasisCandidate,
): number {
  return right.score - left.score
    || Number(right.channels.stressDetected === true) - Number(left.channels.stressDetected === true)
    || (right.channels.momentImportance ?? -1) - (left.channels.momentImportance ?? -1);
}

function emptyChannels(momentImportance: number | null): ChatSpeechEmphasisCandidate['channels'] {
  return { vocalEnergy: null, emotionIntensity: null, pitchVariability: null, stressDetected: null, momentImportance };
}

async function resolveDependencies(
  overrides?: Partial<ChatSpeechEmphasisDependencies>,
): Promise<ChatSpeechEmphasisDependencies> {
  if (overrides?.loadAnalyses && overrides.saveAudit && overrides.now) {
    return overrides as ChatSpeechEmphasisDependencies;
  }
  const { getDatabase } = await import('../db/mongodb');
  const db = await getDatabase();
  const defaults: ChatSpeechEmphasisDependencies = {
    loadAnalyses: (projectId, assetIds, userId) =>
      loadCanonicalProjectAssetAnalyses(db, { projectId, assetIds, userId }),
    saveAudit: async (audit) => {
      await db.collection(CHAT_EVIDENCE_AUDIT_COLLECTION).insertOne(audit);
    },
    now: () => new Date(),
  };
  return { ...defaults, ...overrides };
}

function timelineAssetIds(project: Record<string, unknown>, overlayId?: string | number): string[] {
  const ids = asRecords(project.overlays)
    .filter((overlay) => overlayId == null || String(overlay.id) === String(overlayId))
    .map((overlay) => stringValue(
      overlay.assetId
      ?? overlay.sourceAssetId
      ?? overlay.mediaId
      ?? asRecord(overlay.metadata).assetId,
    ))
    .filter((assetId): assetId is string => assetId != null);
  return [...new Set(ids)];
}

function segmentKey(assetId: string, startMs: number, endMs: number): string {
  return `${assetId}:${Math.round(startMs)}:${Math.round(endMs)}`;
}

function unwrapProject(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return asRecord(record.project ?? value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asRecords(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(asRecord) : []; }

function stringValue(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function signalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

function clampInt(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.round(value))); }

function round4(value: number): number { return Math.round(value * 10_000) / 10_000; }
