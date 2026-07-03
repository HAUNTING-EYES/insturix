import { z } from "zod";
import rawSaasExplainerKnowledgeGraph from "@/lib/editron/data/saas-explainer-knowledge-graph.json";

const namedItemSchema = z.object({
  id: z.string().min(1),
}).passthrough();

const saasExplainerKnowledgeGraphSchema = z.object({
  meta: z.object({
    name: z.literal("saas-explainer-knowledge-graph"),
    version: z.string().min(1),
    sourceDoctrine: z.string().min(1),
  }).passthrough(),
  narrationModes: z.object({
    modes: z.array(z.string().min(1)).min(1),
    default: z.string().min(1),
  }).passthrough(),
  visualArchetypes: z.object({
    library: z.array(namedItemSchema).min(1),
  }).passthrough(),
  sceneFamilies: z.array(namedItemSchema).min(1),
  storyStructures: z.array(namedItemSchema).min(1),
  structureSelection: z.unknown(),
  evidenceRules: z.unknown(),
  brandRules: z.unknown(),
  referenceRules: z.unknown(),
  motionRules: z.unknown(),
  audioRules: z.unknown(),
  qualityGates: z.object({
    stage1HardGates: z.array(namedItemSchema).min(1),
    stage2Weights: z.record(z.string(), z.number()),
  }).passthrough(),
  antiPatterns: z.array(namedItemSchema).min(1),
}).passthrough();

export type SaasExplainerKnowledgeGraph = z.infer<typeof saasExplainerKnowledgeGraphSchema>;
export type SaasExplainerSceneFamilyId = SaasExplainerKnowledgeGraph["sceneFamilies"][number]["id"];
export type SaasExplainerStoryStructureId = SaasExplainerKnowledgeGraph["storyStructures"][number]["id"];
export type SaasExplainerQualityGateId = SaasExplainerKnowledgeGraph["qualityGates"]["stage1HardGates"][number]["id"];

function parseSaasExplainerKnowledgeGraph(): SaasExplainerKnowledgeGraph {
  const parsed = saasExplainerKnowledgeGraphSchema.safeParse(rawSaasExplainerKnowledgeGraph);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid SaaS explainer knowledge graph: ${diagnostics}`);
  }
  return parsed.data;
}

export const SAAS_EXPLAINER_KNOWLEDGE_GRAPH = parseSaasExplainerKnowledgeGraph();

export function getSaasExplainerKnowledgeGraph(): SaasExplainerKnowledgeGraph {
  return SAAS_EXPLAINER_KNOWLEDGE_GRAPH;
}

export function listSaasExplainerSceneFamilyIds(): SaasExplainerSceneFamilyId[] {
  return SAAS_EXPLAINER_KNOWLEDGE_GRAPH.sceneFamilies.map((family) => family.id);
}

export function listSaasExplainerStoryStructureIds(): SaasExplainerStoryStructureId[] {
  return SAAS_EXPLAINER_KNOWLEDGE_GRAPH.storyStructures.map((structure) => structure.id);
}

export function listSaasExplainerHardQualityGateIds(): SaasExplainerQualityGateId[] {
  return SAAS_EXPLAINER_KNOWLEDGE_GRAPH.qualityGates.stage1HardGates.map((gate) => gate.id);
}