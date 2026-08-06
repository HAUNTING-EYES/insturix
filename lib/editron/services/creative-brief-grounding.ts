import type { SegmentAnalysis, SegmentRecord } from '@/lib/editron/types/segment-analysis';
import { sceneFromSegment } from '@/lib/editron/storyline/scene-adapter';

export const CREATIVE_BRIEF_GROUNDING_VERSION = 'creative-brief-grounding-v1' as const;

const MAX_GROUNDED_FACTS = 24;
const MAX_GOAL_CHARS = 1_200;
const MAX_TRANSCRIPT_CHARS = 360;
const MAX_VISUAL_CHARS = 640;
const MAX_OCR_ITEMS = 12;

type CanonicalSegmentRecord = SegmentRecord & {
  assetId?: string;
};

export interface CreativeBriefGroundedFact {
  assetId: string;
  startMs: number;
  endMs: number;
  transcript?: string;
  visualDescription?: string;
  detectedText?: string[];
  visualMode?: string;
  actionType?: string;
  visuallyExplains?: boolean;
  importance?: number;
  salience?: number;
  sourcePath: string;
}

export interface CreativeBriefGroundedContext {
  version: typeof CREATIVE_BRIEF_GROUNDING_VERSION;
  coordinateSpace: 'canonical-edited-timeline';
  source: 'segment-analysis';
  userGoal?: string;
  facts: CreativeBriefGroundedFact[];
  coverage: {
    availableFactCount: number;
    includedFactCount: number;
    selection: 'all' | 'timeline-bucket-native-salience';
  };
}

export function buildCreativeBriefGroundedContext(input: {
  userGoal?: string | null;
  segmentAnalysis?: SegmentAnalysis | null;
}): CreativeBriefGroundedContext | null {
  const userGoal = boundedText(input.userGoal, MAX_GOAL_CHARS);
  const segments = input.segmentAnalysis?.version === 1 && Array.isArray(input.segmentAnalysis.segments)
    ? input.segmentAnalysis.segments as CanonicalSegmentRecord[]
    : [];
  const availableFacts = segments.flatMap((segment, index) => {
    const fact = factFromSegment(segment, index);
    return fact ? [fact] : [];
  });
  const facts = selectDistributedFacts(availableFacts, MAX_GROUNDED_FACTS);
  if (!userGoal && facts.length === 0) return null;

  return {
    version: CREATIVE_BRIEF_GROUNDING_VERSION,
    coordinateSpace: 'canonical-edited-timeline',
    source: 'segment-analysis',
    ...(userGoal ? { userGoal } : {}),
    facts,
    coverage: {
      availableFactCount: availableFacts.length,
      includedFactCount: facts.length,
      selection: availableFacts.length <= MAX_GROUNDED_FACTS
        ? 'all'
        : 'timeline-bucket-native-salience',
    },
  };
}

export function renderCreativeBriefGroundedContext(
  context: CreativeBriefGroundedContext | null | undefined,
): string {
  if (!context) return '';
  const escapedJson = JSON.stringify(context)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  return `<grounded_editorial_context>
The userGoal is editorial intent, not factual evidence.
The facts are bounded observations projected onto the canonical edited timeline.
Use facts only to identify supported story structure and semanticAtoms. Do not invent missing steps, claims, names, numbers, or relationships.
Do not choose render form, placement, animation, or assets here; the native planner owns those decisions.
${escapedJson}
</grounded_editorial_context>`;
}

function factFromSegment(
  segment: CanonicalSegmentRecord,
  index: number,
): CreativeBriefGroundedFact | null {
  if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.endMs <= segment.startMs) {
    return null;
  }
  const assetId = boundedText(segment.assetId, 200) ?? 'canonical-timeline';
  const scene = sceneFromSegment(segment, { assetId, source: assetId });
  const transcript = boundedText(scene.transcription, MAX_TRANSCRIPT_CHARS);
  const visualDescription = boundedText(scene.description, MAX_VISUAL_CHARS);
  const detectedText = scene.detectedText
    .map((value) => boundedText(value, 160))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_OCR_ITEMS);
  if (!transcript && !visualDescription && detectedText.length === 0) return null;

  return {
    assetId,
    startMs: Math.max(0, Math.round(segment.startMs)),
    endMs: Math.max(1, Math.round(segment.endMs)),
    ...(transcript ? { transcript } : {}),
    ...(visualDescription ? { visualDescription } : {}),
    ...(detectedText.length > 0 ? { detectedText } : {}),
    ...(scene.visualMode ? { visualMode: boundedText(scene.visualMode, 100) } : {}),
    ...(scene.actionType ? { actionType: boundedText(scene.actionType, 100) } : {}),
    ...(typeof scene.visuallyExplains === 'boolean' ? { visuallyExplains: scene.visuallyExplains } : {}),
    ...(typeof scene.importance === 'number' ? { importance: round4(scene.importance) } : {}),
    ...(typeof scene.salience === 'number' ? { salience: round4(scene.salience) } : {}),
    sourcePath: `project.segmentAnalysis.segments.${index}`,
  };
}

function selectDistributedFacts(
  facts: readonly CreativeBriefGroundedFact[],
  limit: number,
): CreativeBriefGroundedFact[] {
  if (facts.length <= limit) return [...facts];
  const selected: CreativeBriefGroundedFact[] = [];
  for (let bucket = 0; bucket < limit; bucket += 1) {
    const start = Math.floor(bucket * facts.length / limit);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * facts.length / limit));
    const winner = facts.slice(start, end).sort(compareNativeRelevance)[0];
    if (winner) selected.push(winner);
  }
  return selected.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
}

function compareNativeRelevance(
  left: CreativeBriefGroundedFact,
  right: CreativeBriefGroundedFact,
): number {
  if (left.visuallyExplains !== right.visuallyExplains) return left.visuallyExplains ? -1 : 1;
  const leftSignal = Math.max(left.importance ?? -1, left.salience ?? -1);
  const rightSignal = Math.max(right.importance ?? -1, right.salience ?? -1);
  return rightSignal - leftSignal || left.startMs - right.startMs;
}

function boundedText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.slice(0, maxChars);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
