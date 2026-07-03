import type { SaasExplainerReferenceStyleBrief } from "@/lib/editron/saas-explainer/reference-analysis";

export const SAAS_STRUCTURE_DOCTRINE_VERSION = "saas-structure-doctrine/v1";
export const DEFAULT_SAAS_STYLE_REFERENCE_LABEL = "Lovable 2.0 public SaaS launch video style reference";
export const DEFAULT_SAAS_STYLE_REFERENCE_URL = "https://www.youtube.com/watch?v=xDwR1_vrIg8";
export const DEFAULT_SAAS_STYLE_REFERENCE_FILE =
  "YTDown_YouTube_Lovable-2-0-is-here-Multiplayer-vibe-cod_Media_xDwR1_vrIg8_002_720p.mp4";

export const DEFAULT_SAAS_STRUCTURE_STYLE_BRIEF: SaasExplainerReferenceStyleBrief = {
  summary: "Default SaaS explainer style reference informed by Lovable 2.0 and the SaaS structure doctrine.",
  category: "saas_product_demo",
  pacing: "confident launch tempo; hook-value-CTA; quick UI-led beats with readable holds on product proof",
  uiTreatment: "polished SaaS workspace surfaces; multiplayer/product-state emphasis; product workflow evidence before abstract claims",
  visualLanguage: [
    "public launch-video energy",
    "product-led opening",
    "workspace collaboration cues",
    "workflow demo",
    "focused feature proof",
    "sourced proof or metric only",
    "clear CTA and logo close",
  ],
  typography: "large value claim, smaller UI labels, captions kept readable and separated from graphics",
  colorPalette: [],
  motion: "clean pushes, crisp UI state changes, multiplayer presence beats, proof-screen holds, simple logo fade or scale close",
  transferBoundaries: [
    `Default style reference: ${DEFAULT_SAAS_STYLE_REFERENCE_LABEL} (${DEFAULT_SAAS_STYLE_REFERENCE_URL}).`,
    `Uploaded local reference file observed: ${DEFAULT_SAAS_STYLE_REFERENCE_FILE}.`,
    "Use the default reference for pacing, UI treatment, typography density, and motion language only.",
    "Do not copy Lovable's exact layouts, wording, claims, logos, product screens, or proprietary assets.",
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
  source: "reference_video" | "default_style_reference_video";
  referenceProvided: boolean;
  defaultUsed: boolean;
  defaultReference?: {
    label: string;
    url: string;
    uploadedFileName: string;
    usage: "style_only";
  };
  requiredSceneFamilies: string[];
  sourceDocuments: string[];
} {
  return {
    version: SAAS_STRUCTURE_DOCTRINE_VERSION,
    source: referenceProvided ? "reference_video" : "default_style_reference_video",
    referenceProvided,
    defaultUsed: !referenceProvided,
    ...(!referenceProvided
      ? {
          defaultReference: {
            label: DEFAULT_SAAS_STYLE_REFERENCE_LABEL,
            url: DEFAULT_SAAS_STYLE_REFERENCE_URL,
            uploadedFileName: DEFAULT_SAAS_STYLE_REFERENCE_FILE,
            usage: "style_only" as const,
          },
        }
      : {}),
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
      "docs/SAAS_EXPLAINER_CONTENT_BIBLE.md",
      "lib/editron/data/saas-explainer-knowledge-graph.json",
      "docs/agents/reference/general/phase_f_g_saas_motion.md",
      "lib/editron/data/creative-knowledge-graph.json",
      DEFAULT_SAAS_STYLE_REFERENCE_URL,
    ],
  };
}