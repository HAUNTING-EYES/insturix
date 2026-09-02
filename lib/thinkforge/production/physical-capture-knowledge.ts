import {
  loadGraph,
  type ConstraintNode,
  type GraphIndex,
} from '@/lib/editron/services/graph-query';
import type { VideoTreatment } from '@/lib/thinkforge/schemas/video-treatment';

export const PHYSICAL_CAPTURE_KNOWLEDGE_ADAPTER_VERSION = 1 as const;

const MAX_CAPTURE_GUARDRAILS = 12;
const CAPTURE_GUARDRAIL_CATEGORIES = new Set([
  'accessibility',
  'audio',
  'continuity',
  'sound',
  'temporal',
  'visual',
]);

export type PhysicalCaptureKnowledgeEvidence = {
  id: string;
  category: string;
  guidance: string;
  rationale: string;
  severity: ConstraintNode['details']['severity'];
  sourceLines: [number, number];
};

export type PhysicalCaptureKnowledge = {
  adapterVersion: typeof PHYSICAL_CAPTURE_KNOWLEDGE_ADAPTER_VERSION;
  graphVersion: string;
  evidence: PhysicalCaptureKnowledgeEvidence[];
};

export class PhysicalCaptureKnowledgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhysicalCaptureKnowledgeError';
  }
}

export interface PhysicalCaptureKnowledgeDependencies {
  loadCreativeGraph?: () => GraphIndex | null;
}

export interface ResolvePhysicalCaptureKnowledgeInput {
  treatment: VideoTreatment;
  physicalRequirements: VideoTreatment['captureRequirements'];
}

/**
 * Selects only graph-authored guardrails. Concrete capture form remains the
 * technical resolver's responsibility after capabilities are confirmed.
 */
export function resolvePhysicalCaptureKnowledge(
  input: ResolvePhysicalCaptureKnowledgeInput,
  dependencies: PhysicalCaptureKnowledgeDependencies = {},
): PhysicalCaptureKnowledge {
  const { treatment, physicalRequirements } = input;
  if (physicalRequirements.some((requirement) => requirement.captureKind !== 'physical-camera')) {
    throw new PhysicalCaptureKnowledgeError(
      'Physical capture knowledge may only be queried with acquisition-resolved physical requirements.',
    );
  }
  const graph = (dependencies.loadCreativeGraph ?? loadGraph)();
  if (!graph) {
    throw new PhysicalCaptureKnowledgeError(
      'The canonical creative knowledge graph is unavailable for physical capture planning.',
    );
  }

  const physicalRequirementIds = new Set(physicalRequirements.map((requirement) => requirement.id));
  const physicalEvents = treatment.visualEvents.filter((event) => (
    event.captureRequirementIds.some((requirementId) => physicalRequirementIds.has(requirementId))
  ));
  const query = [
    treatment.audienceOutcome,
    treatment.viewerPromise,
    treatment.narrativeArc,
    treatment.visualRhythm,
    treatment.continuityStrategy,
    treatment.audioVoiceStrategy,
    ...treatment.brandBoundaries,
    ...physicalRequirements.flatMap((requirement) => [
      requirement.objective,
      requirement.whyRequired,
      requirement.subjectOrEvidence,
      ...requirement.constraints,
      ...requirement.unresolvedCapabilityQuestions,
    ]),
    ...physicalEvents.flatMap((event) => [
      event.audienceJob,
      event.visualThesis,
      event.audioRelationship,
      event.timingNote,
      ...event.continuityNotes,
      ...event.brandConstraints,
      ...event.accessibilityRequirements,
    ]),
  ].filter((value): value is string => Boolean(value?.trim())).join('\n');
  const tokens = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const candidates = [...graph.constraints.values()]
    .filter((constraint) => CAPTURE_GUARDRAIL_CATEGORIES.has(constraint.category))
    .filter(isPhysicalCaptureConstraint)
    .map((constraint) => ({ constraint, score: scoreConstraint(constraint, tokens) }))
    .filter(({ constraint, score }) => score > 0 || constraint.details.severity === 'blocker')
    .sort((left, right) => (
      right.score - left.score
      || severityRank(right.constraint.details.severity) - severityRank(left.constraint.details.severity)
      || left.constraint.id.localeCompare(right.constraint.id)
    ));

  const selected: ConstraintNode[] = [];
  const coveredCategories = new Set<string>();
  for (const { constraint } of candidates) {
    if (coveredCategories.has(constraint.category)) continue;
    selected.push(constraint);
    coveredCategories.add(constraint.category);
    if (selected.length === MAX_CAPTURE_GUARDRAILS) break;
  }
  for (const { constraint } of candidates) {
    if (selected.length === MAX_CAPTURE_GUARDRAILS) break;
    if (!selected.includes(constraint)) selected.push(constraint);
  }

  return {
    adapterVersion: PHYSICAL_CAPTURE_KNOWLEDGE_ADAPTER_VERSION,
    graphVersion: graph.version,
    evidence: selected.map((constraint) => ({
      id: constraint.id,
      category: constraint.category,
      guidance: constraint.summary,
      rationale: constraint.details.rationale,
      severity: constraint.details.severity,
      sourceLines: [...constraint.sourceLines] as [number, number],
    })),
  };
}

function isPhysicalCaptureConstraint(constraint: ConstraintNode): boolean {
  return constraint.details.appliesTo.some((target) => (
    target.trim().toLocaleLowerCase().replace(/[\s_]+/gu, '-') === 'physical-capture'
  ));
}

function scoreConstraint(constraint: ConstraintNode, tokens: Set<string>): number {
  const searchableTokens = new Set([
    constraint.name,
    constraint.summary,
    constraint.details.rule,
    constraint.details.rationale,
    ...constraint.tags,
  ].join(' ').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const overlap = [...tokens].filter((token) => searchableTokens.has(token)).length;
  return overlap * 10;
}

function severityRank(severity: ConstraintNode['details']['severity']): number {
  if (severity === 'blocker') return 3;
  if (severity === 'warning') return 2;
  return 1;
}
