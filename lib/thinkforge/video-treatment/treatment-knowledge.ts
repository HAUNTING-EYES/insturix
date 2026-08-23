import {
  loadGraph,
  type ConstraintNode,
  type GraphIndex,
} from '@/lib/editron/services/graph-query';
import type { ProductionBrief } from '@/lib/editron/production-brief/production-brief';
import type { ThinkForgeScriptEditorialPlanArtifact } from '@/lib/thinkforge/agents/editorial-plan';
import {
  getConstraints,
  getWritingKnowledgeIdentity,
} from '@/lib/thinkforge/data/writing-graph-query';
import type { ThinkForgeAuthoringRequest } from '@/lib/thinkforge/schemas/authoring-request';
import type { ThinkForgeContentSignalProfile } from '@/lib/thinkforge/signals';
import {
  buildRelevantInlineWritingContext,
  getCreativeContentKnowledgeText,
} from '@/lib/thinkforge/services/gemini-writing-context-cache';
import type { ResolvedCreativeReferenceContext } from '@/lib/thinkforge/context/creative-reference-context';

export const VIDEO_TREATMENT_KNOWLEDGE_ADAPTER_VERSION = 1 as const;

const MAX_COMPACT_GRAPH_EVIDENCE = 10;
const SEMANTIC_GRAPH_CATEGORIES = new Set([
  'temporal',
  'audio',
  'visual',
  'overlay',
  'continuity',
  'rhythm',
  'accessibility',
]);
const WRITING_CONSTRAINT_DECLARATION = /^\s*Constraint:\s*([a-zA-Z0-9_-]+)\s*$/gmi;

export type VideoTreatmentGraphEvidence = {
  id: string;
  category: string;
  guidance: string;
  sourceLines: [number, number];
};

export type VideoTreatmentKnowledge = {
  adapterVersion: typeof VIDEO_TREATMENT_KNOWLEDGE_ADAPTER_VERSION;
  writingKnowledge: {
    version: string;
    source: string;
    relevantSections: string;
    /**
     * Server-derived IDs that were actually rendered in the selected writing
     * context and also exist in the canonical writing graph. These are the
     * only writing-side IDs a treatment trace may cite.
     */
    traceConstraintIds: string[];
  };
  editronGraph: {
    version: string | null;
    evidence: VideoTreatmentGraphEvidence[];
    unresolvedAssumptions: string[];
  };
};

export interface ResolveVideoTreatmentKnowledgeInput {
  userPrompt: string;
  authoringRequest: ThinkForgeAuthoringRequest;
  editorialPlan: ThinkForgeScriptEditorialPlanArtifact;
  productionBrief: ProductionBrief;
  contentSignalProfile: ThinkForgeContentSignalProfile | null | undefined;
  creativeReferenceContext: ResolvedCreativeReferenceContext;
}

export interface VideoTreatmentKnowledgeDependencies {
  loadEditronGraph?: () => GraphIndex | null;
}

/**
 * Selects only semantic guardrails from Editron's graph. Form-level technique
 * parameters remain with Editron and are never forwarded to ThinkForge.
 */
export function resolveVideoTreatmentKnowledge(
  input: ResolveVideoTreatmentKnowledgeInput,
  dependencies: VideoTreatmentKnowledgeDependencies = {},
): VideoTreatmentKnowledge {
  const writingKnowledge = getWritingKnowledgeIdentity();
  const query = buildKnowledgeQuery(input);
  const graph = (dependencies.loadEditronGraph ?? loadGraph)();
  const relevantSections = buildRelevantInlineWritingContext(
    getCreativeContentKnowledgeText(),
    query,
    10_000,
  );

  return {
    adapterVersion: VIDEO_TREATMENT_KNOWLEDGE_ADAPTER_VERSION,
    writingKnowledge: {
      ...writingKnowledge,
      relevantSections,
      traceConstraintIds: selectTraceableWritingConstraintIds(relevantSections),
    },
    editronGraph: graph
      ? {
          version: graph.version,
          evidence: selectSemanticGraphEvidence(graph, query),
          unresolvedAssumptions: [],
        }
      : {
          version: null,
          evidence: [],
          unresolvedAssumptions: [
            'Editron creative-graph evidence was unavailable, so no graph-derived treatment guardrails were applied.',
          ],
        },
  };
}

function selectTraceableWritingConstraintIds(relevantSections: string): string[] {
  const canonicalIds = new Set(getConstraints().map((constraint) => constraint.id));
  const renderedIds = [...relevantSections.matchAll(WRITING_CONSTRAINT_DECLARATION)]
    .map((match) => match[1]?.trim())
    .filter((id): id is string => Boolean(id) && canonicalIds.has(id));

  return [...new Set(renderedIds)].sort();
}

function buildKnowledgeQuery(input: ResolveVideoTreatmentKnowledgeInput): string {
  const selectedAngle = input.editorialPlan.creativeIntent.source === 'selected_angle'
    ? input.editorialPlan.creativeIntent.selectedAngle
    : null;
  const referenceSignals = input.creativeReferenceContext.referenceSet.references.flatMap((reference) => [
    reference.title,
    reference.analysis?.visualRhythm,
    reference.analysis?.informationHierarchy,
    reference.analysis?.visualVerbalRelationship,
    reference.analysis?.graphicFootageRelationship,
    reference.analysis?.audioEnergy,
  ]).filter((value): value is string => Boolean(value));

  return [
    input.userPrompt,
    input.authoringRequest.platformSurface.id,
    input.authoringRequest.publishingSurface,
    input.productionBrief.output.platform,
    input.productionBrief.output.intent,
    selectedAngle?.title,
    selectedAngle?.strategicPurpose,
    selectedAngle?.creativeTreatment,
    input.editorialPlan.execution.plan.narration.mode,
    input.contentSignalProfile?.intent.goal,
    input.contentSignalProfile?.intent.audience,
    input.contentSignalProfile?.intent.visualNeeds.join(' '),
    ...referenceSignals,
  ].filter((value): value is string => Boolean(value?.trim())).join('\n');
}

function selectSemanticGraphEvidence(graph: GraphIndex, query: string): VideoTreatmentGraphEvidence[] {
  const tokens = new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const candidates = [...graph.constraints.values()]
    .filter((constraint) => SEMANTIC_GRAPH_CATEGORIES.has(constraint.category))
    .map((constraint) => ({
      constraint,
      score: graphEvidenceScore(constraint, tokens),
    }))
    .sort((left, right) => (
      right.score - left.score
      || left.constraint.category.localeCompare(right.constraint.category)
      || left.constraint.id.localeCompare(right.constraint.id)
    ));

  const selected: ConstraintNode[] = [];
  const coveredCategories = new Set<string>();
  for (const { constraint } of candidates) {
    if (coveredCategories.has(constraint.category)) continue;
    selected.push(constraint);
    coveredCategories.add(constraint.category);
    if (selected.length === MAX_COMPACT_GRAPH_EVIDENCE) break;
  }
  for (const { constraint } of candidates) {
    if (selected.length === MAX_COMPACT_GRAPH_EVIDENCE) break;
    if (selected.includes(constraint)) continue;
    selected.push(constraint);
  }

  return selected.map((constraint) => ({
    id: constraint.id,
    category: constraint.category,
    guidance: constraint.summary,
    sourceLines: [...constraint.sourceLines] as [number, number],
  }));
}

function graphEvidenceScore(constraint: ConstraintNode, tokens: Set<string>): number {
  const searchable = [
    constraint.id,
    constraint.category,
    constraint.name,
    constraint.summary,
    ...constraint.tags,
  ].join(' ').toLocaleLowerCase();
  const matches = [...tokens].filter((token) => searchable.includes(token)).length;
  return matches * 10 + (constraint.category === 'accessibility' ? 1 : 0);
}
