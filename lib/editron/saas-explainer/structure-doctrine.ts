import type { SaasExplainerReferenceStyleBrief } from "@/lib/editron/saas-explainer/reference-analysis";

export const SAAS_STRUCTURE_DOCTRINE_VERSION = "saas-structure-doctrine/v1";

export const DEFAULT_SAAS_STRUCTURE_STYLE_BRIEF: SaasExplainerReferenceStyleBrief = {
  summary: "Default SaaS explainer structure doctrine for no-reference generation.",
  category: "saas_product_demo",
  pacing: "medium; hook-value-CTA; readable holds on product proof; final CTA resolution",
  uiTreatment: "balanced UI density; centered app surfaces; product workflow evidence before abstract claims",
  visualLanguage: [
    "product-led opening",
    "problem before-state",
    "workflow demo",
    "focused feature proof",
    "sourced proof or metric only",
    "clear CTA and logo close",
  ],
  typography: "large value claim, smaller UI labels, captions kept readable and separated from graphics",
  colorPalette: [],
  motion: "clean pushes, restrained UI state changes, proof-screen holds, simple logo fade or scale close",
  transferBoundaries: [
    "No user reference video was provided; use this as structure doctrine only.",
    "Do not copy Lovable, Beehiiv, or any third-party layout, wording, claims, logos, or assets.",
    "Do not invent customer names, metrics, integrations, or product capabilities.",
    "If product visual evidence is missing, keep scenes in clearly synthetic demo mode.",
  ],
};

export function resolveSaasStructureStyleBrief(
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief,
): SaasExplainerReferenceStyleBrief {
  return referenceStyleBrief ?? DEFAULT_SAAS_STRUCTURE_STYLE_BRIEF;
}

export function buildSaasStructureDoctrineMetadata(referenceProvided: boolean): {
  version: string;
  source: "reference_video" | "default_saas_structure";
  referenceProvided: boolean;
  defaultUsed: boolean;
  requiredSceneFamilies: string[];
  sourceDocuments: string[];
} {
  return {
    version: SAAS_STRUCTURE_DOCTRINE_VERSION,
    source: referenceProvided ? "reference_video" : "default_saas_structure",
    referenceProvided,
    defaultUsed: !referenceProvided,
    requiredSceneFamilies: [
      "hook",
      "problem",
      "workflow_demo",
      "feature_demo",
      "proof_metric",
      "comparison",
      "social_proof",
      "cta",
      "logo_outro",
    ],
    sourceDocuments: [
      "docs/agents/reference/general/phase_f_g_saas_motion.md",
      "lib/editron/data/creative-knowledge-graph.json",
    ],
  };
}
