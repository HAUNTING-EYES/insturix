/**
 * DESIGN domain manifest — Clickatron surface. Tool metadata mirrors the
 * real modules; the model roster summary rides on create-image-job so quote
 * cards can name real models and multipliers.
 */

import { CLICKATRON_MODELS } from "@/lib/config/clickatron-models";
import type { StudioDomainManifest, StudioToolManifest } from "@/lib/studio/contracts/manifest";

const DESIGN_TOOLS: StudioToolManifest[] = [
  {
    name: "create-image-job",
    label: "Generating images",
    shortLabel: "Images",
    iconCategory: "sparkles",
    riskLevel: "medium",
    executionType: "generative",
    receiptLabel: "Created image job",
    loadingMessages: ["composing frames…", "painting variations…"],
    whenToUse: "thumbnails, canvases, carousels — model routed by capability, text-on-image gated by model",
    costRef: { service: "clickatron", action: "variation" },
    produces: ["thumbnail", "image_canvas", "carousel"],
    exposure: "live",
  },
  {
    name: "generation-prompt-compiler",
    label: "Compiling the prompt",
    shortLabel: "Prompt",
    iconCategory: "script",
    riskLevel: "read",
    executionType: "quick",
    receiptLabel: "Compiled prompt",
    loadingMessages: [],
    whenToUse: "before generation — brand context and clickatron intent baked into the prompt",
    costRef: null,
    produces: [],
    exposure: "live",
  },
  {
    name: "generative-fill",
    label: "Filling the selection",
    shortLabel: "Fill",
    iconCategory: "visual",
    riskLevel: "medium",
    executionType: "generative",
    receiptLabel: "Filled selection",
    loadingMessages: ["inpainting…"],
    whenToUse: "masked edits on an existing canvas (selection → fill)",
    costRef: { service: "clickatron", action: "variation" },
    produces: ["image_canvas"],
    exposure: "live",
  },
  {
    name: "sketch-to-edit",
    label: "Sketching to edit",
    shortLabel: "Sketch",
    iconCategory: "visual",
    riskLevel: "medium",
    executionType: "generative",
    receiptLabel: "Applied sketch edit",
    loadingMessages: ["reading the sketch…"],
    whenToUse: "annotated canvas (pencil/notes) → edited image",
    costRef: { service: "clickatron", action: "variation" },
    produces: ["image_canvas"],
    exposure: "live",
  },
];

export const DESIGN_DOMAIN_MANIFEST: StudioDomainManifest = {
  capability: "design",
  stageView: "canvas",
  artifactKinds: ["thumbnail", "image_canvas", "carousel"],
  tools: DESIGN_TOOLS,
};

/** Real roster summary for quote cards (from lib/config/clickatron-models). */
export const CLICKATRON_MODEL_ROSTER = Object.values(CLICKATRON_MODELS).map((m) => ({
  id: m.id,
  name: m.name,
  types: m.types,
}));
